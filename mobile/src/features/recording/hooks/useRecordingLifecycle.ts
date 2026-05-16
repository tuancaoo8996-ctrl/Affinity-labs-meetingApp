import { useEffect } from 'react';
import Toast from 'react-native-toast-message';
import { router } from 'expo-router';
import { useRecordingStore } from '../stores/recordingStore';
import { ERecordingStatus } from '@/src/features/recording/enums';
import { getMeeting, subscribeMeetingStatus, ensureRealtimeChannel } from '@/src/features/meetings/services';
import { EMeetingStatus } from '@/src/features/meetings/enums';
import { useCurrentUserId } from '@/src/features/auth';

/**
 * Recording lifecycle hook — chạy ở root layout.
 *
 * Trigger trong 2 case:
 * 1. RECOVERING: app vừa mở lại sau khi bị kill mid-flow → query server reconcile
 * 2. PROCESSING: pipeline đang chạy (cùng session) → subscribe để auto-reset khi done
 *
 * Đảm bảo store không bao giờ stuck ở UPLOADING/PROCESSING/RECOVERING.
 */
export function useRecordingLifecycle() {
  const status = useRecordingStore((s) => s.status);
  const activeMeetingId = useRecordingStore((s) => s.activeMeetingId);
  const reset = useRecordingStore((s) => s.reset);
  const setStatus = useRecordingStore((s) => s.setStatus);
  const userId = useCurrentUserId();

  useEffect(() => {
    const isRecovering = status === ERecordingStatus.RECOVERING;
    const isLive =
      status === ERecordingStatus.PROCESSING || status === ERecordingStatus.UPLOADING;
    if (!isRecovering && !isLive) return;
    if (!activeMeetingId) {
      if (isRecovering) reset();
      return;
    }
    if (!userId) return;
    // Ensure shared realtime channel is up so subscribeMeetingStatus listener fires
    ensureRealtimeChannel(userId);

    let unsub: (() => void) | null = null;
    let cancelled = false;

    const showDoneToast = (meetingStatus: EMeetingStatus, meetingId: string) => {
      const isDone = meetingStatus === EMeetingStatus.DONE;
      Toast.show({
        type: isDone ? 'success' : 'error',
        text1: isDone ? 'Meeting ready' : 'Processing failed',
        text2: 'Tap to view the meeting.',
        visibilityTime: 5000,
        onPress: () => {
          Toast.hide();
          router.push(`/meeting/${meetingId}` as never);
        },
      });
    };

    const subscribe = (meetingId: string) => {
      const sub = subscribeMeetingStatus(meetingId, (newStatus, _meeting) => {
        if (newStatus === EMeetingStatus.DONE || newStatus === EMeetingStatus.ERROR) {
          reset();
          // Chỉ show toast cho recovery — live flow đã có FCM push notification
          if (isRecovering) showDoneToast(newStatus, meetingId);
        }
      });
      unsub = () => sub.unsubscribe();
    };

    if (isLive) {
      // Cùng session: subscribe ngay, không cần fetch (server đang xử lý)
      subscribe(activeMeetingId);
      return () => {
        cancelled = true;
        unsub?.();
      };
    }

    // Recovery: fetch trạng thái server trước, rồi quyết định
    (async () => {
      const meeting = await getMeeting(activeMeetingId);
      if (cancelled) return;

      if (!meeting) {
        reset();
        return;
      }

      if (meeting.status === EMeetingStatus.DONE || meeting.status === EMeetingStatus.ERROR) {
        reset();
        showDoneToast(meeting.status, meeting.id);
        return;
      }

      // Server vẫn đang chạy → resume PROCESSING + subscribe
      setStatus(ERecordingStatus.PROCESSING);
      subscribe(meeting.id);
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [status, activeMeetingId, reset, setStatus, userId]);
}
