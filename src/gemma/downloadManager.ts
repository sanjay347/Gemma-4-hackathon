import * as FileSystem from 'expo-file-system/legacy';
import { getUserProfile, saveUserProfile } from '../db/transactions';

// Using the user's fine-tuned model
const MODEL_URL = 'https://huggingface.co/sanjay3478/clearmoney-categorizer/resolve/main/clearmoney-q4km.gguf';
const MODEL_FILENAME = 'clearmoney-q4km.gguf';
export const MODEL_PATH = `${FileSystem.documentDirectory}${MODEL_FILENAME}`;

// Small JSON file in the same HuggingFace repo — e.g. {"version":"2.0"}
// You must create/update this file in the repo whenever you upload a new model.
const MODEL_VERSION_URL = 'https://huggingface.co/sanjay3478/clearmoney-categorizer/resolve/main/version.json';

export const checkModelExists = async (): Promise<boolean> => {
  try {
    const info = await FileSystem.getInfoAsync(MODEL_PATH);
    // Ensure the file exists and is at least 1GB to avoid corrupted/empty downloads
    if (info.exists && info.size && info.size > 1000000000) {
      return true;
    }
    // If it exists but is too small, delete it to trigger a fresh download
    if (info.exists) {
      await FileSystem.deleteAsync(MODEL_PATH);
    }
    return false;
  } catch (error) {
    console.error('Error checking if model exists:', error);
    return false;
  }
};

/**
 * Fetches the latest model version from HuggingFace and compares it to the
 * version stored on-device. Returns { needsUpdate, latestVersion } so the
 * caller can decide whether to delete the old model and re-download.
 *
 * If the network is unavailable or the fetch fails we return { needsUpdate: false }
 * so the app still works offline.
 */
export const checkForModelUpdate = async (): Promise<{
  needsUpdate: boolean;
  latestVersion: string;
}> => {
  try {
    const response = await fetch(MODEL_VERSION_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const json = await response.json();
    const latestVersion: string = json.version ?? '1.0';

    const profile = await getUserProfile();
    const storedVersion: string = profile.model_version ?? '1.0';

    console.log(`[ModelVersion] stored=${storedVersion}  latest=${latestVersion}`);

    if (storedVersion !== latestVersion) {
      return { needsUpdate: true, latestVersion };
    }
    return { needsUpdate: false, latestVersion };
  } catch (error: any) {
    // 404 means version.json doesn't exist yet in the repo — not an error.
    // Any other failure (network down, timeout) is also non-fatal.
    if (!error?.message?.includes('404')) {
      console.log('[ModelVersion] Update check skipped:', error?.message ?? error);
    }
    return { needsUpdate: false, latestVersion: '' };
  }
};

/** Call this after a successful model download to persist the version. */
export const saveModelVersion = async (version: string): Promise<void> => {
  await saveUserProfile({ model_version: version });
};

/** Delete the on-device model file so a fresh download can begin. */
export const deleteModelFile = async (): Promise<void> => {
  try {
    const info = await FileSystem.getInfoAsync(MODEL_PATH);
    if (info.exists) {
      await FileSystem.deleteAsync(MODEL_PATH);
      console.log('[ModelVersion] Old model file deleted.');
    }
  } catch (error) {
    console.error('[ModelVersion] Failed to delete model file:', error);
  }
};

export const createModelDownload = (
  onProgress: (progress: number) => void
): FileSystem.DownloadResumable => {
  return FileSystem.createDownloadResumable(
    MODEL_URL,
    MODEL_PATH,
    {},
    (downloadProgress) => {
      const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
      onProgress(progress);
    }
  );
};
