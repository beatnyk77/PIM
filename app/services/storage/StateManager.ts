import { create } from 'zustand';

interface AppState {
  activeChat: string | null;
  setActiveChat: (chatId: string | null) => void;
}

export const useStore = create<AppState>((set) => ({
  activeChat: null,
  setActiveChat: (chatId) => set({ activeChat: chatId }),
}));
