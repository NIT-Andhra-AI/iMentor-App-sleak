import { createStore } from './store';

interface ToastState {
  visible: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
  show: (message: string, type?: 'success' | 'error' | 'info') => void;
  hide: () => void;
}

export const useToastStore = createStore<ToastState>((set) => ({
  visible: false,
  message: '',
  type: 'info',
  show: (message, type = 'info') => {
    set({ visible: true, message, type });
  },
  hide: () => set({ visible: false }),
}));

export const toast = {
  success: (msg: string) => {
    useToastStore.getState().show(msg, 'success');
    setTimeout(() => useToastStore.getState().hide(), 3000);
  },
  error: (msg: string) => {
    useToastStore.getState().show(msg, 'error');
    setTimeout(() => useToastStore.getState().hide(), 3000);
  },
  info: (msg: string) => {
    useToastStore.getState().show(msg, 'info');
    setTimeout(() => useToastStore.getState().hide(), 3000);
  },
};
