import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { fetch as expoFetch } from 'expo/fetch';
import { LLMModule } from 'react-native-executorch';
import { useAuthStore } from '../store/authStore';
import { useRagStore, RagMessage } from '../store/rag.store';
import { getVlmModelConfig, isVlmModelDownloaded } from './vlmDownload.service';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

export const getApiBaseUrl = (): string => {
  if (Constants.expoConfig?.hostUri) {
    const hostIp = Constants.expoConfig.hostUri.split(':')[0];
    return `http://${hostIp}:3000`;
  }
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3000';
  }
  return 'http://localhost:3000';
};

let vlmModuleInstance: LLMModule | null = null;

const loadVlmModel = async (): Promise<LLMModule> => {
  if (!vlmModuleInstance) {
    const isDownloaded = await isVlmModelDownloaded();
    if (!isDownloaded) {
      throw new Error('Offline VLM image captioner is not downloaded yet. Please download it in settings.');
    }
    const config = getVlmModelConfig();
    // Load model. VLM has capabilities: ['vision']
    vlmModuleInstance = await LLMModule.fromModelName(config);
  }
  return vlmModuleInstance;
};

const unloadVlmModel = () => {
  if (vlmModuleInstance) {
    vlmModuleInstance.delete();
    vlmModuleInstance = null;
  }
};

export const ragService = {
  /**
   * Uploads PDF file to backend API
   */
  async uploadPdf(uri: string, name: string): Promise<{ fileId: string; text: string; images: string[] }> {
    const authStore = useAuthStore.getState();
    const token = authStore.token;
    if (!token) throw new Error('Authentication required.');

    const serverUrl = getApiBaseUrl();
    const uploadUrl = `${serverUrl}/api/rag/upload`;

    const formData = new FormData();
    // Resolve file URI for Android vs iOS
    const fileUri = Platform.OS === 'android' ? uri : uri.replace('file://', '');
    
    formData.append('pdf', {
      uri: fileUri,
      name: name || 'document.pdf',
      type: 'application/pdf',
    } as any);

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to process PDF.');
    }

    return {
      fileId: data.fileId,
      text: data.text || '',
      images: data.images || []
    };
  },

  /**
   * Main pipeline: downloads images, captions them on-device, and compiles markdown
   */
  async processPdf(uri: string, name: string): Promise<string> {
    const store = useRagStore.getState();
    store.resetRagSession();
    store.setPdfProcessing(true);
    
    try {
      // Step 1: Uploading
      store.setPdfProcessStep('uploading');
      const { fileId, text, images } = await this.uploadPdf(uri, name);

      // Step 2: Image extraction completed by backend. Start downloading & captioning locally
      store.setPdfProcessStep('captioning');
      
      const serverUrl = getApiBaseUrl();
      const tempImageDir = `${FileSystem.cacheDirectory}vlm_images/`;
      
      // Ensure local cache directory exists
      const dirInfo = await FileSystem.getInfoAsync(tempImageDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(tempImageDir, { intermediates: true });
      }

      const captions: string[] = [];
      const imageCount = images.length;
      store.setCaptionProgress(0, imageCount);

      if (imageCount > 0) {
        // Load the local VLM module
        const vlm = await loadVlmModel();

        for (let i = 0; i < imageCount; i++) {
          // Check if user requested to skip remaining images
          if (useRagStore.getState().cancelCaptioningRequested) {
            for (let j = i; j < imageCount; j++) {
              captions.push('Image description skipped by user.');
            }
            break;
          }

          const relativeUrl = images[i];
          const absoluteUrl = `${serverUrl}${relativeUrl}`;
          const filename = relativeUrl.substring(relativeUrl.lastIndexOf('/') + 1);
          const localDestPath = `${tempImageDir}${fileId}_${filename}`;

          // Update progress
          store.setCaptionProgress(i, imageCount);

          // Download image to local storage
          const download = FileSystem.createDownloadResumable(absoluteUrl, localDestPath, {
            headers: {
              'Authorization': `Bearer ${useAuthStore.getState().token}`
            }
          });
          const downloadResult = await download.downloadAsync();
          
          if (!downloadResult || !downloadResult.uri) {
            captions.push('Failed to download image.');
            continue;
          }

          // Run image captioning on local image
          try {
            const prompt = '<image>Describe this image in detail.';
            const captionResponse = await vlm.forward(prompt, [downloadResult.uri]);
            captions.push(captionResponse.trim() || 'No caption generated.');
          } catch (captionErr) {
            console.error(`Captioning error for image ${i}:`, captionErr);
            captions.push('Image description failed.');
          }
        }

        // Unload VLM module to free RAM/VRAM
        unloadVlmModel();
      }

      // Step 3: Compile Markdown
      store.setPdfProcessStep('compiling');
      let finalMarkdown = `# Document Analysis: ${name}\n\n`;
      finalMarkdown += `## Extracted Text Content\n\n${text}\n\n`;

      if (imageCount > 0) {
        finalMarkdown += `## Extracted Images & On-Device Captions\n\n`;
        images.forEach((relativeUrl, i) => {
          const absoluteUrl = `${serverUrl}${relativeUrl}`;
          const caption = captions[i];
          finalMarkdown += `### Image ${i + 1}\n\n`;
          finalMarkdown += `![Image ${i + 1}](${absoluteUrl})\n\n`;
          finalMarkdown += `**On-Device Caption:** ${caption}\n\n`;
        });
      }

      store.setMarkdownDoc(finalMarkdown, name);
      store.setPdfProcessStep('idle');
      store.setPdfProcessing(false);

      return finalMarkdown;
    } catch (err) {
      store.setPdfProcessing(false);
      store.setPdfProcessStep('idle');
      unloadVlmModel();
      throw err;
    }
  },

  /**
   * Queries Groq about the document content (RAG)
   */
  async askQuestion(question: string): Promise<void> {
    const store = useRagStore.getState();
    const authStore = useAuthStore.getState();
    
    const apiKey = authStore.user?.groqApiKey;
    if (!apiKey) {
      throw new Error('Groq API Key is missing. Please add it in the Settings Tab.');
    }

    if (!store.markdownDoc) {
      throw new Error('No active document. Please upload a PDF first.');
    }

    // Add user message
    const userMsgId = Math.random().toString(36).substring(7);
    const userMessage: RagMessage = {
      id: userMsgId,
      role: 'user',
      content: question,
      timestamp: new Date().toISOString(),
    };
    store.addRagMessage(userMessage);

    store.setThinking(true);
    store.setStreaming(true);
    store.setStreamingText('');

    // Prepare context system message + conversation history
    const systemPrompt = `You are iMentor's RAG Assistant. Below is the parsed content of a document (including on-device descriptions of any extracted images).
    
Use ONLY the provided document context to answer the user's questions. If the answer cannot be found in the document, reply with: "I'm sorry, but that information is not available in the uploaded document." Do not use external knowledge.

---
DOCUMENT CONTENT:
${store.markdownDoc}
---`;

    const groqMessages = [
      { role: 'system', content: systemPrompt },
      ...store.ragMessages.map(m => ({ role: m.role, content: m.content }))
    ];

    try {
      const sanitizedKey = apiKey.replace(/\s+/g, '');

      const response = await expoFetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sanitizedKey}`,
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: groqMessages,
          stream: true,
          temperature: 0.2, // Low temperature for high accuracy to context
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Groq API error ${response.status}: ${errBody}`);
      }

      if (!response.body) {
        throw new Error('Response body is not readable');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let assistantText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (store.isThinking) {
          store.setThinking(false);
        }

        const chunkText = decoder.decode(value, { stream: true });
        buffer += chunkText;

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const cleaned = line.trim();
          if (!cleaned) continue;

          if (cleaned.startsWith('data: ')) {
            const dataStr = cleaned.slice(6);
            if (dataStr === '[DONE]') break;

            try {
              const parsed = JSON.parse(dataStr);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                assistantText += delta;
                store.setStreamingText(assistantText);
              }
            } catch {
              // Ignore incomplete JSON chunks
            }
          }
        }
      }

      // Stream complete
      store.setStreaming(false);
      store.setThinking(false);

      const assistantMsgId = Math.random().toString(36).substring(7);
      store.addRagMessage({
        id: assistantMsgId,
        role: 'assistant',
        content: assistantText,
        timestamp: new Date().toISOString(),
      });
      store.setStreamingText('');

    } catch (error) {
      console.error('RAG Groq streaming error:', error);
      store.setThinking(false);
      store.setStreaming(false);
      store.setStreamingText('');
      throw error;
    }
  }
};
