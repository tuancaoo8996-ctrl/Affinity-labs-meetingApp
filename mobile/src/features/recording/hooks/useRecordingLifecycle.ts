import { useEffect } from 'react';
import Toast from 'react-native-toast-message';
import { router } from 'expo-router';
import { useRecordingStore } from '../stores/recordingStore';
import { ERecordingStatus } from '@/src/features/recording/enums';
import { subscribeMeetingStatus, ensureRealtimeChannel } from '@/src/features/meetings/services';
import { EMeetingStatus } from '@/src/features/meetings/enums';
import { useCurrentUserId } from '@/src/features/auth';

// Runs at root layout. Subscribes to the active meeting's broadcast while
// UPLOADING/PROCESSING, then auto-resets the store when the pipeline finishes.
export function useRecordingLifecycle() {
  const status = useRecordingStore((s) => s.status);
  const activeMeetingId = useRecordingStore((s) => s.activeMeetingId);
  const reset = useRecordingStore((s) => s.reset);
  const userId = useCurrentUserId();

  useEffect(() => {
    const isLive =
      status === ERecordingStatus.PROCESSING || status === ERecordingStatus.UPLOADING;
    if (!isLive || !activeMeetingId || !userId) return;

    ensureRealtimeChannel(userId);

    const sub = subscribeMeetingStatus(activeMeetingId, (newStatus, _meeting) => {
      if (newStatus === EMeetingStatus.DONE || newStatus === EMeetingStatus.ERROR) {
        reset();
      }
    });

    return () => sub.unsubscribe();
  }, [status, activeMeetingId, reset, userId]);
}
