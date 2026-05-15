import { createMMKV } from 'react-native-mmkv';

export const storage = createMMKV({ id: 'meeting-notes' });

// Zustand persist storage adapter
export const mmkvStorage = {
  getItem: (key: string) => storage.getString(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => { storage.remove(key); },
};
