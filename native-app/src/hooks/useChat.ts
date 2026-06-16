import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useChatStore } from '../store/chat.store';
import { useAuthStore } from '../store/authStore';
import { streamService } from '../services/stream.service';
import { apiService } from '../services/api.service';
import { Conversation, Message } from '../types/chat.types';
import { OfflineChatRuntime } from './useOfflineChat';

export const useChat = (offlineChat?: OfflineChatRuntime) => {
  const router = useRouter();
  const store = useChatStore();
  const authStore = useAuthStore();
  const isGenerating = offlineChat?.isGenerating ?? false;
  const partialResponse = offlineChat?.partialResponse ?? '';

  useEffect(() => {
    if (!store.isConnected && store.offlineModelReady && isGenerating) {
      store.setStreamingText(partialResponse);
    }
  }, [isGenerating, partialResponse, store.isConnected, store.offlineModelReady]);

  const buildOfflineTitle = (content: string) => {
    const words = content.trim().split(/\s+/).filter(Boolean);
    return words.length <= 5 ? content.trim() : `${words.slice(0, 5).join(' ')}...`;
  };

  const loadConversations = async () => {
    try {
      const convs = await apiService.fetchConversations();
      store.setConversations(convs);
    } catch (err) {
      console.error('Failed to fetch MongoDB conversations:', err);
    }
  };

  const selectConversation = async (conversation: Conversation) => {
    store.setActiveConversation(conversation);
    try {
      const msgs = await apiService.fetchMessages(conversation._id);
      store.setMessages(msgs);
    } catch (err) {
      console.error('Failed to fetch MongoDB messages:', err);
    }
  };

  const createNewChat = async (): Promise<Conversation | null> => {
    try {
      const conv = await apiService.createConversation('New Conversation');
      store.setConversations([conv, ...store.conversations]);
      store.setActiveConversation(conv);
      store.setMessages([]);
      return conv;
    } catch (err) {
      console.error('Failed to create MongoDB conversation:', err);
      return null;
    }
  };

  const deleteConversation = async (id: string) => {
    try {
      await apiService.deleteConversation(id);
      store.setConversations(store.conversations.filter((c) => c._id !== id));
      if (store.activeConversation?._id === id) {
        store.resetChat();
      }
    } catch (err) {
      console.error('Failed to delete MongoDB conversation:', err);
    }
  };

  const sendMessage = async (content: string) => {
    if (!content.trim()) return;
    
    let conversation = store.activeConversation;
    if (!conversation) {
      conversation = await createNewChat();
      if (!conversation) return;
    }

    const conversationId = conversation._id;
    const userMessage: Message = {
      conversationId,
      role: 'user',
      content,
      createdAt: new Date(),
    };

    // Prevent duplicate user messages if already added
    const wasAdded = store.messages.some(
      (m) => m.conversationId === conversationId && m.role === 'user' && m.content === content
    );
    if (!wasAdded) {
      store.addMessage(userMessage);
    }

    let sendSuccess = false;

    // 1. Try Groq API if connected
    if (store.isConnected) {
      if (!authStore.user?.groqApiKey) {
        Alert.alert(
          'API Key Required',
          'Please enter your Groq API Key in the Settings tab to chat online.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Go to Settings', onPress: () => router.push('/(main)/(tabs)/settings') }
          ]
        );
        return;
      }

      try {
        await streamService.sendMessageStream(conversationId, content);
        sendSuccess = true;
      } catch (err) {
        console.log('Online Groq stream failed, falling back to offline model:', err);
        Alert.alert(
          'Network Error',
          'Could not reach the online AI. Instantly falling back to the offline model.',
          [{ text: 'OK' }]
        );
      }
    } else {
      // User explicitly disconnected
      Alert.alert(
        'Offline Mode',
        'No internet connection detected. Using offline model.',
        [{ text: 'OK' }]
      );
    }

    // 2. Fallback to Offline Llama Model
    if (!sendSuccess) {
      store.setThinking(true);
      store.setStreaming(false);
      store.setStreamingText('');

      let replyContent = '';
      let hasOfflineError = false;

      if (store.offlineModelReady) {
        try {
          if (!offlineChat) {
            throw new Error('Offline chat runtime is not mounted.');
          }
          store.setStreaming(true);
          replyContent = await offlineChat.sendOfflineMessage(content);
        } catch (error: any) {
          console.error('Offline inference failed:', error);
          replyContent = `Offline model error: ${error.message || 'Unable to generate a response.'}`;
          hasOfflineError = true;
        } finally {
          store.setStreaming(false);
          store.setStreamingText('');
        }
      } else {
        hasOfflineError = true;
      }

      if (hasOfflineError) {
        store.setThinking(false);
        Alert.alert(
          'Model Required',
          'You are offline and the local AI model is not downloaded. Please connect to Wi-Fi and download the model to chat offline.',
          [{ text: 'OK' }]
        );
        // Remove the unanswered user message
        store.setMessages(store.messages.filter((m) => !(m.conversationId === conversationId && m.role === 'user' && m.content === content)));
        return;
      }

      const assistantMessage: Message = {
        conversationId,
        role: 'assistant',
        content: replyContent,
        createdAt: new Date(),
      };

      store.addMessage(assistantMessage);
      store.setThinking(false);

      // Save assistant message to MongoDB
      try {
        await apiService.createMessage(conversationId, 'assistant', replyContent);
      } catch (err) {
        console.error('Failed to sync offline assistant reply to MongoDB', err);
      }
    }

    // Sync user message to MongoDB
    try {
      await apiService.createMessage(conversationId, 'user', content);
    } catch (err) {
      console.error('Failed to sync user message to MongoDB', err);
    }

    // Update conversation title and updatedAt locally
    const currentConv = store.conversations.find((c) => c._id === conversationId);
    if (currentConv) {
      const conversationTitle = currentConv.title === 'New Conversation' ? buildOfflineTitle(content) : currentConv.title;
      const updatedConversation: Conversation = {
        ...currentConv,
        title: conversationTitle,
        updatedAt: new Date(),
      };
      store.setActiveConversation(updatedConversation);
      store.setConversations([
        updatedConversation,
        ...store.conversations.filter((item) => item._id !== conversationId),
      ]);
    }
  };

  const currentMessages = store.messages.filter(
    (m) => m.conversationId === store.activeConversation?._id
  );

  return {
    conversations: store.conversations,
    activeConversation: store.activeConversation,
    messages: currentMessages,
    isConnected: store.isConnected,
    offlineModelReady: store.offlineModelReady,
    onboardingCompleted: store.onboardingCompleted,
    isStreaming: store.isStreaming,
    isThinking: store.isThinking,
    streamingText: store.streamingText,
    syncing: store.syncing,
    modelPath: store.modelPath,
    modelVersion: store.modelVersion,
    modelSize: store.modelSize,
    downloadedAt: store.downloadedAt,
    setOfflineModelReady: store.setOfflineModelReady,
    setModelMetadata: store.setModelMetadata,
    resetModelMetadata: store.resetModelMetadata,
    setOnboardingCompleted: store.setOnboardingCompleted,
    resetChat: store.resetChat,
    loadConversations,
    selectConversation,
    createNewChat,
    deleteConversation,
    sendMessage,
  };
};
export default useChat;
