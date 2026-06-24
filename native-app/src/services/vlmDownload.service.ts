import * as FileSystem from 'expo-file-system/legacy';
import { LFM2_5_VL_450M_QUANTIZED } from 'react-native-executorch';
import { useRagStore } from '../store/rag.store';

export const VLM_VERSION = 'lfm2.5-vl-450m-quantized';
export const VLM_MODEL_FILE_NAME = 'lfm_2_5_vl_450m_xnnpack_8da4w.pte';
export const VLM_MODEL_DIR = `${FileSystem.documentDirectory ?? ''}vlm_models/`;
export const VLM_MODEL_URI = `${VLM_MODEL_DIR}${VLM_MODEL_FILE_NAME}`;

export const VLM_TOKENIZER_FILE_NAME = 'tokenizer.json';
export const VLM_TOKENIZER_CONFIG_FILE_NAME = 'tokenizer_config.json';
export const VLM_TOKENIZER_URI = `${VLM_MODEL_DIR}${VLM_TOKENIZER_FILE_NAME}`;
export const VLM_TOKENIZER_CONFIG_URI = `${VLM_MODEL_DIR}${VLM_TOKENIZER_CONFIG_FILE_NAME}`;

type FileInfoWithSize = FileSystem.FileInfo & { size?: number };

const getRemoteModelUrl = (): string => {
  const source = LFM2_5_VL_450M_QUANTIZED.modelSource;
  if (typeof source !== 'string') {
    throw new Error('LFM 2.5 VL 450M model source is not a URL.');
  }
  return source;
};

const getRemoteTokenizerUrl = (): string => {
  const source = LFM2_5_VL_450M_QUANTIZED.tokenizerSource;
  if (typeof source !== 'string') {
    throw new Error('LFM 2.5 VL 450M tokenizer source is not a URL.');
  }
  return source;
};

const getRemoteTokenizerConfigUrl = (): string => {
  const source = LFM2_5_VL_450M_QUANTIZED.tokenizerConfigSource;
  if (typeof source !== 'string') {
    throw new Error('LFM 2.5 VL 450M tokenizer config source is not a URL.');
  }
  return source;
};

const ensureVlmModelDirectory = async () => {
  const dirInfo = await FileSystem.getInfoAsync(VLM_MODEL_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(VLM_MODEL_DIR, { intermediates: true });
  }
};

export const getVlmModelPath = (): string => VLM_MODEL_URI;
export const getVlmTokenizerPath = (): string => VLM_TOKENIZER_URI;
export const getVlmTokenizerConfigPath = (): string => VLM_TOKENIZER_CONFIG_URI;

export const getVlmModelInfo = async (): Promise<FileInfoWithSize> =>
  FileSystem.getInfoAsync(VLM_MODEL_URI) as Promise<FileInfoWithSize>;

export const isVlmModelDownloaded = async (): Promise<boolean> => {
  const modelInfo = await FileSystem.getInfoAsync(VLM_MODEL_URI);
  // The VLM model file is ~350MB. We require it to be at least 300MB to verify it is complete.
  return modelInfo.exists && (modelInfo.size ?? 0) > 300 * 1024 * 1024;
};

export const deleteVlmModel = async (): Promise<void> => {
  const modelInfo = await FileSystem.getInfoAsync(VLM_MODEL_URI);
  if (modelInfo.exists) {
    await FileSystem.deleteAsync(VLM_MODEL_URI, { idempotent: true });
  }
  const tokenizerInfo = await FileSystem.getInfoAsync(VLM_TOKENIZER_URI);
  if (tokenizerInfo.exists) {
    await FileSystem.deleteAsync(VLM_TOKENIZER_URI, { idempotent: true });
  }
  const configInfo = await FileSystem.getInfoAsync(VLM_TOKENIZER_CONFIG_URI);
  if (configInfo.exists) {
    await FileSystem.deleteAsync(VLM_TOKENIZER_CONFIG_URI, { idempotent: true });
  }
  useRagStore.getState().resetVlmMetadata();
};

export const downloadVlmModel = async (
  onProgress: (progress: number, speedMBps: string) => void
): Promise<boolean> => {
  try {
    await ensureVlmModelDirectory();
    onProgress(0, "0.0");
    useRagStore.getState().setVlmDownloading(true);

    // Download tokenizer config if not exists
    const tokenizerConfigInfo = await FileSystem.getInfoAsync(VLM_TOKENIZER_CONFIG_URI);
    if (!tokenizerConfigInfo.exists || (tokenizerConfigInfo.size ?? 0) === 0) {
      const tokenizerConfigDownload = FileSystem.createDownloadResumable(
        getRemoteTokenizerConfigUrl(),
        VLM_TOKENIZER_CONFIG_URI,
        {}
      );
      await tokenizerConfigDownload.downloadAsync();
    }

    // Download tokenizer if not exists
    const tokenizerInfo = await FileSystem.getInfoAsync(VLM_TOKENIZER_URI);
    if (!tokenizerInfo.exists || (tokenizerInfo.size ?? 0) === 0) {
      const tokenizerDownload = FileSystem.createDownloadResumable(
        getRemoteTokenizerUrl(),
        VLM_TOKENIZER_URI,
        {}
      );
      await tokenizerDownload.downloadAsync();
    }

    const RESUME_DATA_URI = `${VLM_MODEL_DIR}resume_data.txt`;

    // Download VLM model binary if not exists or incomplete (< 300 MB)
    const modelInfo = await FileSystem.getInfoAsync(VLM_MODEL_URI);
    if (!modelInfo.exists || (modelInfo.size ?? 0) < 300 * 1024 * 1024) {
      let lastBytesWritten = 0;
      let lastTime = Date.now();
      let lastSaveTime = Date.now();
      let currentSpeed = "0.0";

      let resumeDataString;
      const resumeInfo = await FileSystem.getInfoAsync(RESUME_DATA_URI);
      if (resumeInfo.exists) {
        try {
          resumeDataString = await FileSystem.readAsStringAsync(RESUME_DATA_URI);
        } catch (e) {}
      }

      const download = FileSystem.createDownloadResumable(
        getRemoteModelUrl(),
        VLM_MODEL_URI,
        {},
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          if (totalBytesExpectedToWrite > 0) {
            const now = Date.now();
            const timeDiff = now - lastTime;
            
            if (timeDiff >= 1000) {
              const bytesDiff = totalBytesWritten - lastBytesWritten;
              if (bytesDiff > 0) {
                currentSpeed = ((bytesDiff / (1024 * 1024)) / (timeDiff / 1000)).toFixed(1);
              }
              lastTime = now;
              lastBytesWritten = totalBytesWritten;
            }

            // Save resume state every 5 seconds
            if (now - lastSaveTime >= 5000) {
              lastSaveTime = now;
              try {
                const pauseState = download.savable();
                if (pauseState.resumeData) {
                  FileSystem.writeAsStringAsync(RESUME_DATA_URI, pauseState.resumeData).catch(() => {});
                }
              } catch (e) {}
            }

            const progress = Math.min(1, totalBytesWritten / totalBytesExpectedToWrite);
            onProgress(progress, currentSpeed);
            useRagStore.getState().setVlmDownloadProgress(progress);
            useRagStore.getState().setVlmSpeedMBps(currentSpeed);
          }
        },
        resumeDataString
      );
      
      try {
        await download.downloadAsync();
        await FileSystem.deleteAsync(RESUME_DATA_URI, { idempotent: true }).catch(() => {});
      } catch (err) {
        console.warn('VLM Model download interrupted. Resume state saved.');
        useRagStore.getState().setVlmDownloading(false);
        return false;
      }
    } else {
      onProgress(1, "0.0");
      useRagStore.getState().setVlmDownloadProgress(1);
      useRagStore.getState().setVlmSpeedMBps("0.0");
    }
    
    const success = await isVlmModelDownloaded();
    useRagStore.getState().setVlmDownloading(false);

    if (!success) {
      return false;
    }

    const info = await getVlmModelInfo();
    useRagStore.getState().setVlmMetadata({
      size: info.size ?? 0,
      downloadedAt: new Date().toISOString(),
    });
    return true;
  } catch (error) {
    console.error('VLM Model download failed:', error);
    useRagStore.getState().setVlmDownloading(false);
    return false;
  }
};

export const getVlmModelConfig = () => ({
  ...LFM2_5_VL_450M_QUANTIZED,
  modelSource: getVlmModelPath(),
  tokenizerSource: getVlmTokenizerPath(),
  tokenizerConfigSource: getVlmTokenizerConfigPath(),
});
