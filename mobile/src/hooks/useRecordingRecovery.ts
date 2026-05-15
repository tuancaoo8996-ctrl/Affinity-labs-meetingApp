import { useEffect } from 'react';
import Toast from 'react-native-toast-message';
import { router } from 'expo-router';
import { useRecordingStore } from '../stores/recordingStore';
import { getMeeting, subscribeMeetingStatus, ensureRealtimeChannel } from '../services/meetingService';

const ANON_USER_ID = 'demo-user';

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

  useEffect(() => {
    const isRecovering = status === 'RECOVERING';
    const isLive = status === 'PROCESSING' || status === 'UPLOADING';
    if (!isRecovering && !isLive) return;
    if (!activeMeetingId) {
      if (isRecovering) reset();
      return;
    }
    // Ensure shared realtime channel is up so subscribeMeetingStatus listener fires
    ensureRealtimeChannel(ANON_USER_ID);

    let unsub: (() => void) | null = null;
    let cancelled = false;

    const showDoneToast = (meetingStatus: 'done' | 'error', meetingId: string) => {
      Toast.show({
        type: meetingStatus === 'done' ? 'success' : 'error',
        text1: meetingStatus === 'done' ? 'Meeting ready' : 'Processing failed',
        text2: 'Tap to view the meeting.',
        visibilityTime: 5000,
        onPress: () => {
          Toast.hide();
          router.push(`/meeting/${meetingId}` as never);
        },
      });
    };

    const subscribe = (meetingId: string) => {
      const sub = subscribeMeetingStatus(meetingId, (newStatus) => {
        if (newStatus === 'done' || newStatus === 'error') {
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

      if (meeting.status === 'done' || meeting.status === 'error') {
        reset();
        showDoneToast(meeting.status, meeting.id);
        return;
      }

      // Server vẫn đang chạy → resume PROCESSING + subscribe
      setStatus('PROCESSING');
      subscribe(meeting.id);
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [status, activeMeetingId, reset, setStatus]);
}
