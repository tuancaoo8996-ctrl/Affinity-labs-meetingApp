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
      // Only persist recovery-relevant fields, not ephemeral timer
      partialize: (state) => ({
        status: state.status,
        audioUri: state.audioUri,
        activeMeetingId: state.activeMeetingId,
        attendees: state.attendees,
      }),
      // On rehydrate: any non-terminal state means app was killed mid-flow.
      // - RECORDING/PAUSED: audio data lost → ERROR
      // - UPLOADING/PROCESSING: meeting đã tạo trên server → RECOVERING (reconcile sau)
      // useRecordingLifecycle sẽ chạy ở root layout để query server và set state đúng
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (
          state.status === ERecordingStatus.RECORDING ||
          state.status === ERecordingStatus.PAUSED
        ) {
          state.setStatus(ERecordingStatus.ERROR);
          state.setError('Recording interrupted — app was closed.');
          return;
        }
        if (
          state.status === ERecordingStatus.UPLOADING ||
          state.status === ERecordingStatus.PROCESSING
        ) {
          state.setStatus(ERecordingStatus.RECOVERING);
        }
      },
    }
  )
);
