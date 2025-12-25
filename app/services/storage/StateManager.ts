import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  content: string;
  senderId: string;
  timestamp: Date;
  isMe: boolean;
}

interface AppState {
  activeChat: string | null;
  messages: ChatMessage[];
  setActiveChat: (chatId: string | null) => void;
  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
}

export const useStore = create<AppState>((set) => ({
  activeChat: null,
  messages: [],
  setActiveChat: (chatId) => set({ activeChat: chatId }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setMessages: (messages) => set({ messages }),
}));
