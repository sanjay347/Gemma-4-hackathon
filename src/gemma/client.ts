import { MODEL_PATH } from './downloadManager';
import * as FileSystem from 'expo-file-system/legacy';

let llamaContext: any = null;
let nativeUnavailable = false; // true when running in Expo Go / no native build

// ── Completion mutex ─────────────────────────────────────────────────────────
// llama.rn allows only one concurrent completion per context.
// All callers (batch categorizer, behavior agent, predictor, chat) share this
// single promise chain so completions are queued, never concurrent.
let completionQueue: Promise<any> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = completionQueue.then(fn, fn); // run even if previous failed
  completionQueue = next.then(() => {}, () => {}); // keep queue alive
  return next;
}

// Lazy-import so the app doesn't crash on load if the native module is absent
const STOP_TOKENS = ['<end_of_turn>', '<eos>', '<|im_end|>', '<start_of_turn>'];

async function tryInitLlama(rawPath: string): Promise<any> {
  const { initLlama } = require('llama.rn');
  if (!initLlama) throw new Error('initLlama not exported');

  // Try GPU first; if it OOMs or fails, fall back to CPU-only
  try {
    const ctx = await initLlama({ model: rawPath, n_ctx: 4096, n_gpu_layers: 99, n_batch: 512 });
    console.log('[Llama] GPU mode active (n_gpu_layers=99)');
    return ctx;
  } catch (gpuErr: any) {
    // Expo Go / no native module
    if (gpuErr?.message?.includes('install') || gpuErr?.message?.includes('null')) {
      console.warn('[Llama] Native module not available (Expo Go). AI features disabled.');
      nativeUnavailable = true;
      return null;
    }
    // GPU OOM or Metal unsupported — fall back to CPU
    console.warn('[Llama] GPU init failed, falling back to CPU:', gpuErr?.message);
    return await initLlama({ model: rawPath, n_ctx: 4096, n_gpu_layers: 0, n_batch: 512 });
  }
}

export const isAIAvailable = () => !nativeUnavailable;
export const isModelLoaded = () => !!llamaContext;

export const getLlamaContext = async () => {
  if (nativeUnavailable) return null;
  if (llamaContext) return llamaContext;

  try {
    const rawPath = MODEL_PATH.replace(/^file:\/\//, '');
    const info = await FileSystem.getInfoAsync(MODEL_PATH);
    console.log(`[Llama Engine] Loading from: ${rawPath}`);
    console.log(`[Llama Engine] Size: ${info.exists ? (info.size / 1024 / 1024).toFixed(2) + ' MB' : 'MISSING'}`);

    llamaContext = await tryInitLlama(rawPath);
    return llamaContext;
  } catch (error) {
    console.error('Failed to initialize llama.rn:', error);
    return null;
  }
};

export const releaseContext = async (): Promise<void> => {
  if (llamaContext) {
    try {
      await llamaContext.release();
    } catch (e) {
      console.error('Failed to release llama context:', e);
    }
    llamaContext = null;
  }
};

export const callLocalModel = async (
  prompt: string,
  systemPrompt?: string,
  options?: { temperature?: number; n_predict?: number; prefill?: string }
): Promise<string> => {
  const context = await getLlamaContext();
  if (!context) return '';

  try {
    // Do NOT include <bos> — the tokenizer adds it automatically (add_bos=true for Gemma).
    // Including it manually causes a double-BOS which confuses the model.
    // prefill: text appended right after <start_of_turn>model\n to force JSON output mode.
    const prefill = options?.prefill ?? '';
    let formattedPrompt: string;
    if (systemPrompt) {
      formattedPrompt = `<start_of_turn>user\n${systemPrompt}\n\n${prompt}<end_of_turn>\n<start_of_turn>model\n${prefill}`;
    } else {
      formattedPrompt = `<start_of_turn>user\n${prompt}<end_of_turn>\n<start_of_turn>model\n${prefill}`;
    }

    const response = await enqueue(() => context.completion({
      prompt: formattedPrompt,
      n_predict: options?.n_predict ?? 512,
      temperature: options?.temperature ?? 0.7,
      top_p: 0.9,
      stop: STOP_TOKENS,
    }));

    let text = response.text ?? response.content ?? '';
    for (const tok of STOP_TOKENS) text = text.split(tok)[0];
    // Re-attach the prefill — but guard against the model repeating it
    // (some llama.rn builds include the last prompt token in response.text)
    const result = prefill
      ? (text.trimStart().startsWith(prefill) ? text : prefill + text)
      : text;
    return result.trimEnd();
  } catch (error) {
    console.error('Error executing local model:', error);
    return '';
  }
};

export const callGemmaBase = callLocalModel;

export const callLocalModelStreaming = async (
  prompt: string,
  systemPrompt: string | undefined,
  onToken: (partial: string) => void,
  options?: { temperature?: number; n_predict?: number }
): Promise<string> => {
  const context = await getLlamaContext();
  if (!context) throw new Error('Model not loaded');

  // Do NOT include <bos> — tokenizer adds it (double-BOS breaks Gemma output).
  let formattedPrompt: string;
  if (systemPrompt) {
    formattedPrompt = `<start_of_turn>user\n${systemPrompt}\n\n${prompt}<end_of_turn>\n<start_of_turn>model\n`;
  } else {
    formattedPrompt = `<start_of_turn>user\n${prompt}<end_of_turn>\n<start_of_turn>model\n`;
  }

  const cleanText = (s: string) => {
    let out = s;
    // Only strip actual end/eos tokens, not start_of_turn (which is a stop, not a strip target)
    for (const tok of ['<end_of_turn>', '<eos>', '<|im_end|>']) out = out.split(tok)[0];
    return out.trimEnd();
  };

  let accumulated = '';
  const result = await enqueue(() => context.completion(
    {
      prompt: formattedPrompt,
      n_predict: options?.n_predict ?? 512,
      temperature: options?.temperature ?? 0.7,
      top_p: 0.9,
      stop: STOP_TOKENS,
    },
    (data: { token: string }) => {
      accumulated += data.token;
      const cleaned = cleanText(accumulated);
      if (cleaned) onToken(cleaned);
    }
  ));

  const finalText = cleanText(result?.text ?? result?.content ?? accumulated);
  return finalText;
};

// ─── Gemma 4 chat via messages API ──────────────────────────────────────────
// Uses the model's embedded chat template (supports system role in Gemma 4).
// This is separate from callLocalModel so the categorizer is not affected.

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const cleanOutput = (s: string) => {
  let out = s;
  for (const tok of STOP_TOKENS) out = out.split(tok)[0];
  return out.trimEnd();
};

// Build a Gemma 4 prompt from a messages array.
// Gemma 4 adds a dedicated <start_of_turn>system turn (unlike Gemma 2/3).
// We do NOT include <bos> — the tokenizer prepends it automatically.
function buildGemma4Prompt(messages: ChatMessage[]): string {
  return messages
    .map(m => `<start_of_turn>${m.role}\n${m.content}<end_of_turn>`)
    .join('\n') + '\n<start_of_turn>model\n';
}

export const callChatModel = async (
  messages: ChatMessage[],
  options?: { temperature?: number; n_predict?: number }
): Promise<string> => {
  const context = await getLlamaContext();
  if (!context) return '';
  try {
    const response = await enqueue(() => context.completion({
      prompt: buildGemma4Prompt(messages),
      n_predict: options?.n_predict ?? 512,
      temperature: options?.temperature ?? 0.7,
      top_p: 0.9,
      stop: STOP_TOKENS,
    }));
    return cleanOutput(response.text ?? response.content ?? '');
  } catch (error) {
    console.error('[ChatModel] error:', error);
    return '';
  }
};

export const callChatModelStreaming = async (
  messages: ChatMessage[],
  onToken: (partial: string) => void,
  options?: { temperature?: number; n_predict?: number }
): Promise<string> => {
  const context = await getLlamaContext();
  if (!context) throw new Error('Model not loaded');

  let accumulated = '';
  const result = await enqueue(() => context.completion(
    {
      prompt: buildGemma4Prompt(messages),
      n_predict: options?.n_predict ?? 512,
      temperature: options?.temperature ?? 0.7,
      top_p: 0.9,
      stop: STOP_TOKENS,
    },
    (data: { token: string }) => {
      accumulated += data.token;
      const cleaned = cleanOutput(accumulated);
      if (cleaned) onToken(cleaned);
    }
  ));
  return cleanOutput(result?.text ?? result?.content ?? accumulated);
};

export const callHFCategorizer = async (text: string): Promise<any> => {
  const prompt = `Analyze this bank transaction: "${text}".
Return ONLY a valid JSON object with exactly these keys:
{"category": "one of: Food & Dining, Shopping, Subscriptions, Transportation, Bills & Utilities, Entertainment, Health & Fitness, Travel, Income, Transfer, Other", "merchant_clean": "Cleaned merchant name", "is_subscription": boolean, "is_recurring": boolean}
Do not include markdown or other text.`;

  const rawText = await callLocalModel(prompt, undefined, { temperature: 0.0, n_predict: 256 });
  try {
    const jsonStart = rawText.indexOf('{');
    const jsonEnd = rawText.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      return JSON.parse(rawText.substring(jsonStart, jsonEnd + 1));
    }
  } catch (e) {
    console.error('Failed to parse JSON from local model output:', e);
  }
  return rawText;
};
