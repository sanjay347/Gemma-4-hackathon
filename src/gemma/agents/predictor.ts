import { callGemmaBase } from '../client';
import { CashFlowPredictionOutput } from '../../types';
import { CASH_FLOW_PREDICTION_PROMPT } from '../prompts';

function extractJSONObject(raw: string): string | null {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/s);
  if (fence) return fence[1].trim();
  const start = raw.indexOf('{');
  const end   = raw.lastIndexOf('}');
  if (start !== -1 && end > start) return raw.substring(start, end + 1);
  return null;
}

export const predictCashFlow = async (currentMonthData: any, historicalData: any): Promise<CashFlowPredictionOutput | null> => {
  // Send only the category totals — individual transactions bloat the context
  const trimmedCurrent = {
    categoryTotals: currentMonthData.categoryTotals,
    totalSpent: Object.values((currentMonthData.categoryTotals ?? {}) as Record<string, number>)
      .reduce((s, v) => s + v, 0),
  };
  const trimmedHistorical = {
    allTimeTotals: historicalData.allTime,
  };

  const prompt = `Current Month: ${JSON.stringify(trimmedCurrent)}\nHistorical: ${JSON.stringify(trimmedHistorical)}`;

  try {
    const rawResponse = await callGemmaBase(prompt, CASH_FLOW_PREDICTION_PROMPT, {
      temperature: 0.0,
      n_predict: 512,
      prefill: '{',
    });

    const jsonStr = extractJSONObject(rawResponse);
    if (jsonStr) {
      const parsed = JSON.parse(jsonStr) as CashFlowPredictionOutput;
      if (parsed && typeof parsed.will_run_short === 'boolean') return parsed;
    }
  } catch (error) {
    console.error('Predictor Agent Error:', error);
  }

  // Return null gracefully — upload pipeline handles missing prediction fine
  return null;
};
