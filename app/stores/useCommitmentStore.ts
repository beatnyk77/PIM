import { create } from 'zustand';

export interface Commitment {
  id: string;
  title: string;
  deadline?: string;
  status: 'pending' | 'completed';
  createdAt: number;
}

interface CommitmentState {
  commitments: Commitment[];
  addCommitment: (title: string, deadline?: string) => void;
  toggleCommitment: (id: string) => void;
  removeCommitment: (id: string) => void;
}

export const useCommitmentStore = create<CommitmentState>((set) => ({
  commitments: [],
  addCommitment: (title, deadline) => set((state) => ({
    commitments: [
      ...state.commitments,
      {
        id: Math.random().toString(36).substr(2, 9),
        title,
        deadline,
        status: 'pending',
        createdAt: Date.now(),
      },
    ],
  })),
  toggleCommitment: (id) => set((state) => ({
    commitments: state.commitments.map((c) =>
      c.id === id ? { ...c, status: c.status === 'pending' ? 'completed' : 'pending' } : c
    ),
  })),
  removeCommitment: (id) => set((state) => ({
    commitments: state.commitments.filter((c) => c.id !== id),
  })),
}));
