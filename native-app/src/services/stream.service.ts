import { fetch as expoFetch } from 'expo/fetch';
import { useChatStore } from '../store/chat.store';
import { useAuthStore } from '../store/authStore';
import { apiService } from './api.service';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

export const streamService = {
  async sendMessageStream(conversationId: string, content: string): Promise<void> {
    const store = useChatStore.getState();

    // Check if API key is provided in Database
    const authStore = useAuthStore.getState();
    const apiKey = authStore.user?.groqApiKey;
    
    if (!apiKey) {
      throw new Error('Groq API Key is missing. Please add it in the Settings Tab.');
    }

    store.setThinking(true);
    store.setStreaming(true);
    store.setStreamingText('');

    // Gather message history for this conversation to send to Groq
    const conversationMessages = store.messages
      .filter((m) => m.conversationId === conversationId)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      // Use expo/fetch to stream from Groq
      // Strictly sanitize the API key to remove any hidden newlines inside the string
      const sanitizedKey = apiKey.replace(/\s+/g, '');

      const response = await expoFetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sanitizedKey}`,
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant', // Extremely fast Llama 3.1 model on Groq
          messages: conversationMessages,
          stream: true,
          temperature: 0.7,
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

        // Turn off thinking indicator once first data arrives
        if (useChatStore.getState().isThinking) {
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

      store.addMessage({
        conversationId,
        role: 'assistant',
        content: assistantText,
        createdAt: new Date(),
      });
      store.setStreamingText('');

      // Background sync to MongoDB
      try {
        await apiService.createMessage(conversationId, 'assistant', assistantText);
      } catch (err) {
        console.error('Failed to sync assistant message to MongoDB:', err);
      }

    } catch (error: any) {
      console.error('Groq streaming error:', error);
      store.setThinking(false);
      store.setStreaming(false);
      store.setStreamingText('');
      throw error;
    }
  },
};
export default streamService;
