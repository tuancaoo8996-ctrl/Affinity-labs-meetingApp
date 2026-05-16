import { create } from 'zustand';

type AuthState = {
  userId: string | null;
  ready: boolean;
  setSession: (userId: string | null) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  userId: null,
  ready: false,
  setSession: (userId) => set({ userId, ready: true }),
}));
