import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { createStore } from './store';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  isModelDownloaded: boolean;
  modelBypassed: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  signUp: (name: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;
  setDownloaded: (downloaded: boolean) => void;
  setBypassed: (bypassed: boolean) => void;
}

export const useAuthStore = createStore<AuthState>((set) => ({
  isAuthenticated: false,
  user: null,
  isModelDownloaded: false,
  modelBypassed: false,
  isLoading: false,

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
      };
      
      set({ isAuthenticated: true, user, isLoading: false });
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
      };
      
      set({ isAuthenticated: true, user: newUser, isLoading: false });
      return true;
    } catch (error) {
      console.error('Signup error:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  logout: () => {
    set({ isAuthenticated: false, user: null, isModelDownloaded: false, modelBypassed: false });
  },

  setDownloaded: (downloaded) => {
    set({ isModelDownloaded: downloaded });
  },

  setBypassed: (bypassed) => {
    set({ modelBypassed: bypassed });
  },
}));
