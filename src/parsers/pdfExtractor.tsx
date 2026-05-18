import React, { useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';

// ─── Local pdf.js cache ────────────────────────────────────────────────────────
// On first PDF extraction the two scripts are downloaded from CDN and stored
// permanently in documentDirectory. Every subsequent extraction is fully offline.

const PDFJS_VERSION = '2.16.105';
const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;
const CACHE_DIR = `${FileSystem.documentDirectory}pdfjs_cache/`;
const MAIN_PATH = `${CACHE_DIR}pdf.min.js`;
const WORKER_PATH = `${CACHE_DIR}pdf.worker.min.js`;

// In-memory cache so we read from disk at most once per app session
let cachedMain: string | null = null;
let cachedWorker: string | null = null;

export const ensurePdfJsReady = async (): Promise<void> => {
  if (cachedMain && cachedWorker) return;

  await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true }).catch(() => {});

  const [mainInfo, workerInfo] = await Promise.all([
    FileSystem.getInfoAsync(MAIN_PATH),
    FileSystem.getInfoAsync(WORKER_PATH),
  ]);

  // Download if missing or suspiciously small (failed partial download)
  const MIN_SIZE = 500_000;
  if (!mainInfo.exists || (mainInfo.size ?? 0) < MIN_SIZE) {
    await FileSystem.downloadAsync(`${PDFJS_CDN}/pdf.min.js`, MAIN_PATH);
  }
  if (!workerInfo.exists || (workerInfo.size ?? 0) < MIN_SIZE) {
    await FileSystem.downloadAsync(`${PDFJS_CDN}/pdf.worker.min.js`, WORKER_PATH);
  }

  [cachedMain, cachedWorker] = await Promise.all([
    FileSystem.readAsStringAsync(MAIN_PATH),
    FileSystem.readAsStringAsync(WORKER_PATH),
  ]);
};

// ─── Component ─────────────────────────────────────────────────────────────────

interface PdfExtractorProps {
  uri: string;
  onExtracted: (text: string) => void;
  onError: (error: string) => void;
}

export const HiddenPdfExtractor: React.FC<PdfExtractorProps> = ({ uri, onExtracted, onError }) => {
  const [html, setHtml] = useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    const prepare = async () => {
      try {
        const [base64Pdf] = await Promise.all([
          FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 }),
          ensurePdfJsReady(), // no-op after first call
        ]);

        if (cancelled) return;

        // Inject the worker script as a blob URL so pdf.js can spawn it
        // without any network access. JSON.stringify safely escapes the string.
        const workerSrc = `
          (function() {
            var blob = new Blob([${JSON.stringify(cachedWorker)}], { type: 'application/javascript' });
            pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
          })();
        `;

        const builtHtml = `<!DOCTYPE html>
<html>
<head>
<script>${cachedMain}</script>
</head>
<body>
<script>
${workerSrc}

const base64ToUint8Array = (base64) => {
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
};

const extractText = async () => {
  try {
    const pdfData = base64ToUint8Array(${JSON.stringify(base64Pdf)});
    const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();

      // Reconstruct lines by grouping items with the same Y coordinate.
      // Items are returned bottom-to-top in PDF coordinates, so we sort descending.
      const byY = {};
      for (const item of content.items) {
        if (!item.str || !item.transform) continue;
        const y = Math.round(item.transform[5]);
        if (!byY[y]) byY[y] = [];
        byY[y].push({ x: item.transform[4], str: item.str });
      }

      const sortedYs = Object.keys(byY).map(Number).sort((a, b) => b - a);
      const pageLines = sortedYs.map(y =>
        byY[y].sort((a, b) => a.x - b.x).map(i => i.str).join('  ')
      );
      pages.push(pageLines.join('\\n'));
    }

    window.ReactNativeWebView.postMessage(pages.join('\\n\\n'));
  } catch (e) {
    window.ReactNativeWebView.postMessage('ERROR:' + e.message);
  }
};

extractText();
</script>
</body>
</html>`;

        setHtml(builtHtml);
      } catch (e: any) {
        onError(e.message ?? 'Failed to prepare PDF extractor');
      }
    };

    prepare();
    return () => { cancelled = true; };
  }, [uri]);

  if (!html) return null;

  return (
    <View style={{ width: 0, height: 0, opacity: 0 }}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        onMessage={event => {
          const msg = event.nativeEvent.data;
          if (msg.startsWith('ERROR:')) {
            onError(msg);
          } else {
            onExtracted(msg);
          }
        }}
      />
    </View>
  );
};
