import { create } from 'zustand';

interface PushTokenState {
  fcmToken: string | null;
  setFcmToken: (token: string | null) => void;
}

export const usePushTokenStore = create<PushTokenState>((set) => ({
  fcmToken: null,
  setFcmToken: (fcmToken) => set({ fcmToken }),
}));
