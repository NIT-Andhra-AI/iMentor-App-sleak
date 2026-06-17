import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { Conversation, Message } from '../types/chat.types';
import { useAuthStore } from '../store/authStore';

const getApiUrl = (): string => {
  if (Constants.expoConfig?.hostUri) {
    const hostIp = Constants.expoConfig.hostUri.split(':')[0];
    return `http://${hostIp}:3000/api/chat`;
  }
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3000/api/chat';
  }
  return 'http://localhost:3000/api/chat';
};

export const API_BASE_URL = getApiUrl();

const getAuthHeaders = () => {
  const token = useAuthStore.getState().token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
};

export const apiService = {
  async fetchConversations(): Promise<Conversation[]> {
    const response = await fetch(`${API_BASE_URL}/conversations`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error(`Failed to fetch conversations: ${response.statusText}`);
    return response.json();
  },

  async createConversation(title?: string): Promise<Conversation> {
    const response = await fetch(`${API_BASE_URL}/conversations`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: title ? JSON.stringify({ title }) : undefined,
    });
    if (!response.ok) throw new Error(`Failed to create conversation: ${response.statusText}`);
    return response.json();
  },

  async createMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string
  ): Promise<Message> {
    const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ role, content }),
    });
    if (!response.ok) throw new Error(`Failed to create message: ${response.statusText}`);
    return response.json();
  },

  async fetchMessages(conversationId: string): Promise<Message[]> {
    const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}/messages`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error(`Failed to fetch messages: ${response.statusText}`);
    return response.json();
  },

  async deleteConversation(conversationId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/conversations/${conversationId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error(`Failed to delete conversation: ${response.statusText}`);
  },
};
