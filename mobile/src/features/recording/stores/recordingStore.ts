import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/src/lib/storage';
import { ERecordingStatus } from '@/src/features/recording/enums';
import type { TAttendee } from '@/src/features/recording/types';

interface RecordingState {
  status: ERecordingStatus;
  durationMs: number;
  audioUri: string | null;
  attendees: TAttendee[];
  activeMeetingId: string | null;
  errorMessage: string | null;

  setStatus: (status: ERecordingStatus) => void;
  setDurationMs: (ms: number) => void;
  setAudioUri: (uri: string | null) => void;
  setAttendees: (attendees: TAttendee[]) => void;
  setActiveMeetingId: (id: string | null) => void;
  setError: (msg: string | null) => void;
  reset: () => void;
}

const initialState = {
  status: ERecordingStatus.IDLE,
  durationMs: 0,
  audioUri: null,
  attendees: [],
  activeMeetingId: null,
  errorMessage: null,
};

export const useRecordingStore = create<RecordingState>()(
  persist(
    (set) => ({
      ...initialState,

      setStatus: (status) => set({ status }),
      setDurationMs: (durationMs) => set({ durationMs }),
      setAudioUri: (audioUri) => set({ audioUri }),
      setAttendees: (attendees) => set({ attendees }),
      setActiveMeetingId: (activeMeetingId) => set({ activeMeetingId }),
      setError: (errorMessage) => set({ errorMessage }),
      reset: () => set(initialState),
    }),
    {
      name: 'recording-state',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        status: state.status,
        audioUri: state.audioUri,
        activeMeetingId: state.activeMeetingId,
        attendees: state.attendees,
      }),
      // Only IDLE is valid on boot — any other persisted state is a stale artifact
      onRehydrateStorage: () => (state) => {
        if (state && state.status !== ERecordingStatus.IDLE) state.reset();
      },
    }
  )
);
