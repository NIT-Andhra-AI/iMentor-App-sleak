import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { fetch as expoFetch } from 'expo/fetch';
import { LLMModule } from 'react-native-executorch';
import { useAuthStore } from '../store/authStore';
import { useRagStore, RagMessage, RagDocumentItem } from '../store/rag.store';
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

// Reverted/unused but kept for compilation in settings tab if settings tab ever uses it.
const loadVlmModel = async (): Promise<LLMModule> => {
  if (!vlmModuleInstance) {
    const isDownloaded = await isVlmModelDownloaded();
    if (!isDownloaded) {
      throw new Error('Offline VLM image captioner is not downloaded yet. Please download it in settings.');
    }
    const config = getVlmModelConfig();
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
   * Uploads PDF file to backend API and receives the saved document details
   */
  async uploadPdf(uri: string, name: string): Promise<RagDocumentItem & { markdownDoc: string }> {
    const authStore = useAuthStore.getState();
    const token = authStore.token;
    if (!token) throw new Error('Authentication required.');

    const serverUrl = getApiBaseUrl();
    const uploadUrl = `${serverUrl}/api/rag/upload`;

    const formData = new FormData();
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
      _id: data.document.id,
      fileName: data.document.fileName,
      fileId: data.document.fileId,
      createdAt: data.document.createdAt,
      markdownDoc: data.document.markdownDoc
    };
  },

  /**
   * Process PDF without image captioning (text only)
   */
  async processPdf(uri: string, name: string): Promise<string> {
    const store = useRagStore.getState();
    store.resetRagSession();
    store.setPdfProcessing(true);
    
    try {
      store.setPdfProcessStep('uploading');
      const document = await this.uploadPdf(uri, name);

      store.setPdfProcessStep('compiling');
      
      // Update state store with new document
      store.setMarkdownDoc(document.markdownDoc, document.fileName);
      store.setActiveDocumentId(document._id);
      store.addDocument(document);

      store.setPdfProcessStep('idle');
      store.setPdfProcessing(false);

      return document.markdownDoc;
    } catch (err) {
      store.setPdfProcessing(false);
      store.setPdfProcessStep('idle');
      throw err;
    }
  },

  /**
   * Fetches RAG documents history from the backend database
   */
  async fetchHistory(): Promise<void> {
    const store = useRagStore.getState();
    const authStore = useAuthStore.getState();
    const token = authStore.token;
    if (!token) return;

    store.setHistoryLoading(true);
    try {
      const serverUrl = getApiBaseUrl();
      const response = await fetch(`${serverUrl}/api/rag/documents`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch history');
      }

      const data = await response.json();
      store.setDocuments(data);
    } catch (err) {
      console.error('Error fetching RAG history:', err);
    } finally {
      store.setHistoryLoading(false);
    }
  },

  /**
   * Deletes RAG document and its history
   */
  async deleteDocument(documentId: string): Promise<void> {
    const store = useRagStore.getState();
    const authStore = useAuthStore.getState();
    const token = authStore.token;
    if (!token) return;

    try {
      const serverUrl = getApiBaseUrl();
      const response = await fetch(`${serverUrl}/api/rag/documents/${documentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete document');
      }

      // Remove from store
      store.removeDocument(documentId);
      
      // If the deleted document was active, reset active session
      if (store.activeDocumentId === documentId) {
        store.resetRagSession();
      }
    } catch (err) {
      console.error('Error deleting document:', err);
      throw err;
    }
  },

  /**
   * Loads previous messages and markdown text for a document
   */
  async fetchMessages(documentId: string): Promise<void> {
    const store = useRagStore.getState();
    const authStore = useAuthStore.getState();
    const token = authStore.token;
    if (!token) return;

    store.setThinking(true);
    try {
      const serverUrl = getApiBaseUrl();
      const response = await fetch(`${serverUrl}/api/rag/documents/${documentId}/messages`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch messages');
      }

      const data = await response.json();
      
      // Map MongoDB messages to store format
      const mappedMessages: RagMessage[] = data.messages.map((m: any) => ({
        id: m._id,
        role: m.role,
        content: m.content,
        timestamp: m.createdAt
      }));

      store.setMarkdownDoc(data.markdownDoc, data.fileName);
      store.setActiveDocumentId(documentId);
      store.setRagMessages(mappedMessages);
    } catch (err) {
      console.error('Error fetching messages:', err);
      throw err;
    } finally {
      store.setThinking(false);
    }
  },

  /**
   * Saves a message (user or assistant) in the database
   */
  async saveMessage(documentId: string, role: 'user' | 'assistant', content: string): Promise<any> {
    const authStore = useAuthStore.getState();
    const token = authStore.token;
    if (!token) return null;

    const serverUrl = getApiBaseUrl();
    const response = await fetch(`${serverUrl}/api/rag/documents/${documentId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ role, content }),
    });

    if (!response.ok) {
      throw new Error('Failed to save message to database');
    }

    return response.json();
  },

  /**
   * Queries Groq about the document content (RAG) and stores messages in DB
   */
  async askQuestion(question: string): Promise<void> {
    const store = useRagStore.getState();
    const authStore = useAuthStore.getState();
    
    const apiKey = authStore.user?.groqApiKey;
    if (!apiKey) {
      throw new Error('Groq API Key is missing. Please add it in the Settings Tab.');
    }

    if (!store.markdownDoc || !store.activeDocumentId) {
      throw new Error('No active document. Please upload a PDF first.');
    }

    const documentId = store.activeDocumentId;

    // 1. Save user message to database
    let savedUserMsg: any;
    try {
      savedUserMsg = await this.saveMessage(documentId, 'user', question);
    } catch (dbErr) {
      console.error('Failed to save user message to DB, proceeding in-memory:', dbErr);
    }

    // 2. Add user message to Zustand store
    const userMessage: RagMessage = {
      id: savedUserMsg?.id || Math.random().toString(36).substring(7),
      role: 'user',
      content: question,
      timestamp: savedUserMsg?.createdAt || new Date().toISOString(),
    };
    store.addRagMessage(userMessage);

    store.setThinking(true);
    store.setStreaming(true);
    store.setStreamingText('');

    // Prepare context system message + conversation history
    const systemPrompt = `You are iMentor's RAG Assistant. Below is the parsed content of a document.
    
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

      // 3. Save assistant message to database
      let savedAssistantMsg: any;
      try {
        savedAssistantMsg = await this.saveMessage(documentId, 'assistant', assistantText);
      } catch (dbErr) {
        console.error('Failed to save assistant message to DB, proceeding in-memory:', dbErr);
      }

      store.addRagMessage({
        id: savedAssistantMsg?.id || Math.random().toString(36).substring(7),
        role: 'assistant',
        content: assistantText,
        timestamp: savedAssistantMsg?.createdAt || new Date().toISOString(),
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
