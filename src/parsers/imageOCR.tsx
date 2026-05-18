/**
 * HiddenImageOCR — Tesseract.js OCR inside a hidden WebView.
 *
 * Fix for "Load failed": the old approach embedded 2.5 MB of Tesseract.js
 * directly into an inline HTML string passed via source={{ html }}.
 * iOS WKWebView has a ~1 MB bridge string limit and rejects larger payloads
 * with a silent "Load failed".
 *
 * New approach:
 *  1. Download tesseract.min.js + worker.min.js to CACHE_DIR (done once).
 *  2. Copy the camera image into CACHE_DIR (same-origin for the WebView).
 *  3. Write a slim HTML runner (no inline scripts) to CACHE_DIR.
 *  4. Load WebView via source={{ uri: 'file://...' }} — no bridge size limit.
 *  5. The HTML fetches ./tesseract.min.js + ./worker.min.js via relative paths.
 */

import React, { useRef, useState, useEffect } from 'react';
import { View } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';

const CACHE_DIR          = FileSystem.documentDirectory + 'tesseract_cache/';
const TESSERACT_JS_URL   = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const TESSERACT_WORKER_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js';

let ocrReady = false;

// ─── Ensure JS assets are downloaded to disk ─────────────────────────────────

export async function ensureOCRReady(): Promise<void> {
  if (ocrReady) return;

  await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true }).catch(() => {});

  const tesseractPath = CACHE_DIR + 'tesseract.min.js';
  const workerPath    = CACHE_DIR + 'worker.min.js';

  const [tsInfo, wkInfo] = await Promise.all([
    FileSystem.getInfoAsync(tesseractPath),
    FileSystem.getInfoAsync(workerPath),
  ]);

  await Promise.all([
    tsInfo.exists ? Promise.resolve() : FileSystem.downloadAsync(TESSERACT_JS_URL,    tesseractPath),
    wkInfo.exists ? Promise.resolve() : FileSystem.downloadAsync(TESSERACT_WORKER_URL, workerPath),
  ]);

  ocrReady = true;
}

// ─── Build HTML runner file (no inline scripts — uses relative <script src>) ─

function buildRunnerHtml(imageRelPath: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>body{margin:0;background:#000;}</style>
</head>
<body>
<!-- load Tesseract from same directory — no bridge string limit -->
<script src="./tesseract.min.js"></script>
<script>
(async function runOCR() {
  try {
    window.ReactNativeWebView.postMessage(
      JSON.stringify({ type: 'progress', message: 'Initializing OCR engine...' })
    );

    // Fetch the worker JS and create a blob URL so it can be spawned as a Worker
    const wkResp = await fetch('./worker.min.js');
    const wkText = await wkResp.text();
    const wkBlob = new Blob([wkText], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(wkBlob);

    const worker = await Tesseract.createWorker('eng', 1, {
      workerPath: workerUrl,
      logger: function (m) {
        if (m.status === 'recognizing text') {
          var pct = Math.round((m.progress || 0) * 100);
          window.ReactNativeWebView.postMessage(
            JSON.stringify({ type: 'progress', message: 'OCR: ' + pct + '%' })
          );
        }
      },
    });

    window.ReactNativeWebView.postMessage(
      JSON.stringify({ type: 'progress', message: 'Reading text from image...' })
    );

    var result = await worker.recognize('./${imageRelPath}');
    await worker.terminate();

    window.ReactNativeWebView.postMessage(
      JSON.stringify({ type: 'result', text: result.data.text })
    );
  } catch (e) {
    window.ReactNativeWebView.postMessage(
      JSON.stringify({ type: 'error', message: e.message || String(e) })
    );
  }
})();
</script>
</body>
</html>`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  uri: string;
  onExtracted: (text: string) => void;
  onError: (err: string) => void;
  onProgress?: (msg: string) => void;
}

export function HiddenImageOCR({ uri, onExtracted, onError, onProgress }: Props) {
  const done        = useRef(false);
  const [htmlUri, setHtmlUri] = useState<string | null>(null);

  useEffect(() => {
    done.current = false;
    setHtmlUri(null);

    const prepare = async () => {
      try {
        if (!ocrReady) {
          onError('OCR engine not ready. Please try again.');
          return;
        }

        // 1. Normalise image URI to file:// scheme
        const imgSrc = uri.startsWith('file://') ? uri : `file://${uri}`;

        // 2. Copy image into CACHE_DIR so the WebView (file:// origin) can read it
        const ext      = uri.split('.').pop()?.split('?')[0] ?? 'jpg';
        const imgDest  = CACHE_DIR + `ocr_input.${ext}`;
        await FileSystem.copyAsync({ from: imgSrc, to: imgDest }).catch(async () => {
          // If copy fails, try reading + writing (handles some URI schemes)
          const b64 = await FileSystem.readAsStringAsync(imgSrc, {
            encoding: FileSystem.EncodingType.Base64,
          });
          await FileSystem.writeAsStringAsync(imgDest, b64, {
            encoding: FileSystem.EncodingType.Base64,
          });
        });

        // 3. Write the HTML runner (references scripts + image via relative paths)
        const html      = buildRunnerHtml(`ocr_input.${ext}`);
        const htmlPath  = CACHE_DIR + 'ocr_runner.html';
        await FileSystem.writeAsStringAsync(htmlPath, html);

        setHtmlUri(htmlPath); // already has file:// prefix from documentDirectory
      } catch (e: any) {
        onError(`OCR setup failed: ${e?.message ?? String(e)}`);
      }
    };

    prepare();
  }, [uri]);

  const handleMessage = (e: WebViewMessageEvent) => {
    if (done.current) return;
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'progress') {
        onProgress?.(msg.message);
      } else if (msg.type === 'result') {
        done.current = true;
        onExtracted(msg.text ?? '');
      } else if (msg.type === 'error') {
        done.current = true;
        onError(msg.message ?? 'OCR failed');
      }
    } catch {
      done.current = true;
      onError('Invalid OCR response');
    }
  };

  if (!htmlUri) return null;

  return (
    <View style={{ width: 0, height: 0, opacity: 0 }}>
      <WebView
        style={{ width: 1, height: 1 }}
        originWhitelist={['*']}
        source={{ uri: htmlUri }}
        onMessage={handleMessage}
        javaScriptEnabled
        allowFileAccess
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
        onError={e => onError(e.nativeEvent.description)}
      />
    </View>
  );
}
