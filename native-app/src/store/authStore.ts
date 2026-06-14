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
    // Simulate API request
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    // Simple mock authentication success
    const mockUser: User = {
      id: 'usr-123',
      name: email.split('@')[0].toUpperCase(),
      email: email,
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
    };
    
    set({ isAuthenticated: true, user: mockUser, isLoading: false });
    return true;
  },

  signUp: async (name, email, password) => {
    set({ isLoading: true });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    const mockUser: User = {
      id: 'usr-123',
      name: name,
      email: email,
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
    };
    
    set({ isAuthenticated: true, user: mockUser, isLoading: false });
    return true;
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
