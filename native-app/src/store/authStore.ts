import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createStore } from './store';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  groqApiKey?: string | null;
}

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  isModelDownloaded: boolean;
  modelBypassed: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  initializeAuth: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  signUp: (name: string, email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  setDownloaded: (downloaded: boolean) => void;
  setBypassed: (bypassed: boolean) => void;
  saveGroqApiKey: (key: string) => Promise<boolean>;
}

export const useAuthStore = createStore<AuthState>((set) => ({
  isAuthenticated: false,
  user: null,
  token: null,
  isModelDownloaded: false,
  modelBypassed: false,
  isLoading: false,
  isInitialized: false,

  initializeAuth: async () => {
    try {
      const storedToken = await AsyncStorage.getItem('@auth_token');
      const storedUser = await AsyncStorage.getItem('@auth_user');
      
      if (storedToken && storedUser) {
        set({
          isAuthenticated: true,
          token: storedToken,
          user: JSON.parse(storedUser),
          isInitialized: true,
        });
      } else {
        set({ isInitialized: true });
      }
    } catch (error) {
      console.error('Failed to initialize auth:', error);
      set({ isInitialized: true });
    }
  },

  login: async (email, password) => {
    set({ isLoading: true });
    try {
      let apiUrl = 'http://localhost:3000/api/login';
      if (Constants.expoConfig?.hostUri) {
        const hostIp = Constants.expoConfig.hostUri.split(':')[0];
        apiUrl = `http://${hostIp}:3000/api/login`;
      } else if (Platform.OS === 'android') {
        apiUrl = 'http://10.0.2.2:3000/api/login';
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to log in');
      }

      const user: User = {
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
        groqApiKey: data.user.groqApiKey || null,
      };
      
      await AsyncStorage.setItem('@auth_token', data.token);
      await AsyncStorage.setItem('@auth_user', JSON.stringify(user));
      
      set({ isAuthenticated: true, user, token: data.token, isLoading: false });
      return true;
    } catch (error) {
      console.error('Login error:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  signUp: async (name, email, password) => {
    set({ isLoading: true });
    try {
      let apiUrl = 'http://localhost:3000/api/signup';
      if (Constants.expoConfig?.hostUri) {
        const hostIp = Constants.expoConfig.hostUri.split(':')[0];
        apiUrl = `http://${hostIp}:3000/api/signup`;
      } else if (Platform.OS === 'android') {
        apiUrl = 'http://10.0.2.2:3000/api/signup';
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to sign up');
      }

      const newUser: User = {
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
        groqApiKey: null,
      };
      
      await AsyncStorage.setItem('@auth_token', data.token);
      await AsyncStorage.setItem('@auth_user', JSON.stringify(newUser));
      
      set({ isAuthenticated: true, user: newUser, token: data.token, isLoading: false });
      return true;
    } catch (error) {
      console.error('Signup error:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    await AsyncStorage.removeItem('@auth_token');
    await AsyncStorage.removeItem('@auth_user');
    set({ isAuthenticated: false, user: null, token: null, isModelDownloaded: false, modelBypassed: false });
  },

  setDownloaded: (downloaded) => {
    set({ isModelDownloaded: downloaded });
  },

  setBypassed: (bypassed) => {
    set({ modelBypassed: bypassed });
  },

  saveGroqApiKey: async (key: string) => {
    const { token, user } = useAuthStore.getState();
    if (!token || !user) throw new Error('Not authenticated');

    try {
      let apiUrl = 'http://localhost:3000/api/settings/groq-key';
      if (Constants.expoConfig?.hostUri) {
        const hostIp = Constants.expoConfig.hostUri.split(':')[0];
        apiUrl = `http://${hostIp}:3000/api/settings/groq-key`;
      } else if (Platform.OS === 'android') {
        apiUrl = 'http://10.0.2.2:3000/api/settings/groq-key';
      }

      const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ groqApiKey: key }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to save API key');
      }

      const updatedUser = { ...user, groqApiKey: key };
      await AsyncStorage.setItem('@auth_user', JSON.stringify(updatedUser));
      set({ user: updatedUser });
      return true;
    } catch (error) {
      console.error('Save API key error:', error);
      throw error;
    }
  },
}));
