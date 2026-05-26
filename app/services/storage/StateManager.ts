import { create } from 'zustand';
import { getMessages, saveMessageToDb } from './LocalDb';

export interface ChatMessage {
  id: string;
  content: string;
  senderId: string;
  timestamp: Date;
  isMe: boolean;
  status?: 'sent' | 'delivered' | 'read';
  type?: 'text' | 'image' | 'audio';
  mediaUri?: string;
  groupId?: string; // Add groupId support
  expiresAt?: Date; // For self-destruct messages
}

export interface AppSettings {
  aiEnabled: boolean;
  taskDetectionEnabled: boolean;
  readReceiptsEnabled: boolean;
  delayedSendEnabled: boolean;
  defaultSelfDestructTime: number; // in seconds, 0 = off
}

interface AppState {
  activeChat: string | null;
  activeGroup: string | null; // Track active group
  messages: ChatMessage[];
  settings: AppSettings;
  setActiveChat: (chatId: string | null) => void;
  setActiveGroup: (groupId: string | null) => void;
  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  updateMessageStatus: (messageId: string, status: 'sent' | 'delivered' | 'read') => void;
  updateSettings: (settings: Partial<AppSettings>) => void;
  deleteMessage: (messageId: string) => void;
  hydrate: () => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  activeChat: null,
  activeGroup: null,
  messages: [],
  settings: {
    aiEnabled: true,
    taskDetectionEnabled: true,
    readReceiptsEnabled: true,
    delayedSendEnabled: false,
    defaultSelfDestructTime: 0,
  },
  setActiveChat: (chatId) => set({ activeChat: chatId, activeGroup: null }),
  setActiveGroup: (groupId) => set({ activeGroup: groupId, activeChat: null }),
  addMessage: async (message) => {
      // Optimistically update UI
      set((state) => ({ messages: [...state.messages, message] }));
      // Persist to DB and verify SQLite transaction integrity
      const success = await saveMessageToDb(message);
      if (!success) {
          console.error(`StateManager: SQLite write transaction failed for message ${message.id}. Marking as failed.`);
          set((state) => ({
              messages: state.messages.map(m => m.id === message.id ? { ...m, status: 'failed' as any } : m)
          }));
      }
  },
  setMessages: (messages) => set({ messages }),
  updateMessageStatus: (messageId, status) => set((state) => ({
    messages: state.messages.map(m => m.id === messageId ? { ...m, status } : m)
  })),
  updateSettings: (newSettings) => set((state) => ({
    settings: { ...state.settings, ...newSettings }
  })),
  deleteMessage: (messageId) => set((state) => ({
    messages: state.messages.filter(m => m.id !== messageId)
  })),
  hydrate: async () => {
      const messages = await getMessages();
      set({ messages });
  }
}));
