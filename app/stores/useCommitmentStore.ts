import { create } from 'zustand';
import { EventBus } from '../services/EventBus';
import { appendCommitment, CommitmentRecord } from '../services/commitments/commitmentComposer';

export interface Commitment {
  id: string;
  title: string;
  deadline?: string;
  status: 'pending' | 'completed';
  createdAt: number;
  source: 'manual' | 'chat';
  sourceText?: string;
  sourceChatId?: string;
  sourceMessageId?: string;
}

interface CommitmentState {
  commitments: Commitment[];
  addCommitment: (
    title: string,
    deadline?: string,
    metadata?: {
      source?: 'manual' | 'chat';
      sourceText?: string;
      sourceChatId?: string;
      sourceMessageId?: string;
    },
  ) => void;
  toggleCommitment: (id: string) => void;
  removeCommitment: (id: string) => void;
}

export const useCommitmentStore = create<CommitmentState>((set) => ({
  commitments: [],
  addCommitment: (title, deadline, metadata) => set((state) => {
    const result = appendCommitment(state.commitments as CommitmentRecord[], {
      title,
      deadline,
      source: metadata?.source ?? 'manual',
      sourceText: metadata?.sourceText,
      sourceChatId: metadata?.sourceChatId,
      sourceMessageId: metadata?.sourceMessageId,
    });

    return result.added ? { commitments: result.commitments } : state;
  }),
  toggleCommitment: (id) => set((state) => ({
    commitments: state.commitments.map((c) =>
      c.id === id ? { ...c, status: c.status === 'pending' ? 'completed' : 'pending' } : c
    ),
  })),
  removeCommitment: (id) => set((state) => ({
    commitments: state.commitments.filter((c) => c.id !== id),
  })),
}));

// Global listener to capture AI detected tasks/commitments
EventBus.on('ai.task-detected', (data: any) => {
  console.log('useCommitmentStore: Auto-adding task:', data.task);
  useCommitmentStore.getState().addCommitment(data.task, 'Today', {
    source: 'chat',
    sourceText: data.originalContent,
    sourceChatId: data.chatId,
  });
});
