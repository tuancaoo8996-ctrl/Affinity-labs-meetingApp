import React, { useCallback, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { router } from 'expo-router';
import BottomSheet from '@gorhom/bottom-sheet';
import { useAudioRecorder } from '../../src/hooks/useAudioRecorder';
import { useRecordingStore } from '../../src/stores/recordingStore';
import { RecordButton } from '../../src/components/RecordButton';
import { RecordingTimer } from '../../src/components/RecordingTimer';
import { WaveformVisualizer } from '../../src/components/WaveformVisualizer';
import AttendeesBottomSheet from '../../src/components/AttendeesBottomSheet';
import { Colors } from '../../src/constants/colors';
import { uploadAudioWithRetry } from '../../src/services/uploadService';
import { createMeeting } from '../../src/services/meetingService';
import { usePushTokenStore } from '../../src/stores/pushTokenStore';
import { Attendee } from '../../src/types';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? '';
const ANON_USER_ID = 'demo-user';

function generateMeetingTitle(): string {
  const now = new Date();
  return `Meeting · ${now.toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })}, ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

export default function RecordScreen() {
  const { status, startRecording, pauseRecording, resumeRecording, stopRecording } =
    useAudioRecorder();
  const { durationMs, setStatus, setActiveMeetingId, setError } = useRecordingStore();
  const fcmToken = usePushTokenStore((s) => s.fcmToken);
  const bottomSheetRef = useRef<BottomSheet>(null);

  // Open attendees sheet on first tap (IDLE/STOPPED/ERROR)
  const handleButtonPress = useCallback(async () => {
    switch (status) {
      case 'IDLE':
      case 'STOPPED':
      case 'ERROR':
        bottomSheetRef.current?.expand();
        break;
      case 'RECORDING':
        await pauseRecording();
        break;
      case 'PAUSED':
        await resumeRecording();
        break;
    }
  }, [status, pauseRecording, resumeRecording]);

  // Called when user confirms attendees (or skips)
  const handleAttendeesConfirmed = useCallback(async (attendees: Attendee[]) => {
    await startRecording();
    // Store attendees in ref so handleStop can access them
    attendeesRef.current = attendees;
  }, [startRecording]);

  const attendeesRef = useRef<Attendee[]>([]);

  const handleStop = useCallback(async () => {
    if (status !== 'RECORDING' && status !== 'PAUSED') return;

    const uri = await stopRecording();
    if (!uri) return;

    const durationSeconds = Math.floor(durationMs / 1000);
    const title = generateMeetingTitle();

    if (!BACKEND_URL) {
      const msg = 'Backend URL not configured (EXPO_PUBLIC_BACKEND_URL missing)';
      setError(msg);
      setStatus('ERROR');
      Alert.alert('Config Error', msg);
      return;
    }

    setStatus('UPLOADING');

    try {
      console.log('[handleStop] uri:', uri, 'BACKEND_URL:', BACKEND_URL);
      const audioUrl = await uploadAudioWithRetry(uri, ANON_USER_ID, Date.now().toString());
      console.log('[handleStop] upload OK, audioUrl:', audioUrl);

      const meeting = await createMeeting({
        userId: ANON_USER_ID,
        title,
        durationSeconds,
        audioUrl,
        pushToken: fcmToken,
        attendees: attendeesRef.current,
      });

      setActiveMeetingId(meeting.id);
      attendeesRef.current = [];

      const res = await fetch(`${BACKEND_URL}/process-meeting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meeting_id: meeting.id,
          audio_url: audioUrl,
          push_token: fcmToken,
          attendees: meeting.attendees ?? [],
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Backend returned ${res.status}: ${body.slice(0, 200)}`);
      }

      setStatus('PROCESSING');
      router.push('/meetings');
    } catch (err) {
      console.error('[handleStop] ERROR:', err);
      const msg = err instanceof Error ? err.message : String(err);
      attendeesRef.current = [];
      setError(msg);
      setStatus('ERROR');
      Alert.alert('Processing Failed', msg);
    }
  }, [status, durationMs, stopRecording, setStatus, setActiveMeetingId, setError, fcmToken]);

  const isRecordingActive = status === 'RECORDING';
  const canStop = status === 'RECORDING' || status === 'PAUSED';
  const isProcessing = status === 'UPLOADING' || status === 'PROCESSING' || status === 'RECOVERING';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.appName}>Meeting Notes</Text>
        </View>

        {/* Center — Timer + Waveform + Button */}
        <View style={styles.center}>
          <RecordingTimer durationMs={durationMs} isRecording={isRecordingActive} />

          <View style={styles.waveformContainer}>
            <WaveformVisualizer isActive={isRecordingActive} />
          </View>

          <RecordButton status={status} onPress={handleButtonPress} />

          <Text style={styles.statusLabel}>{getStatusLabel(status)}</Text>
        </View>

        {/* Stop button */}
        <View style={styles.footer}>
          {canStop && (
            <View style={styles.stopButton}>
              <Text style={styles.stopButtonText} onPress={handleStop}>
                Stop & Process
              </Text>
            </View>
          )}
          {isProcessing && (
            <Text style={styles.processingText}>
              {status === 'UPLOADING'
                ? 'Uploading…'
                : status === 'RECOVERING'
                  ? 'Checking previous meeting…'
                  : 'AI is processing your meeting…'}
            </Text>
          )}
        </View>
      </View>

      {/* Attendees Bottom Sheet — rendered outside container to overlay correctly */}
      <AttendeesBottomSheet
        sheetRef={bottomSheetRef}
        onStart={handleAttendeesConfirmed}
        onDismiss={() => {}}
      />
    </SafeAreaView>
  );
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'IDLE': return 'Tap to record';
    case 'RECORDING': return 'Recording…';
    case 'PAUSED': return 'Paused — tap to resume';
    case 'STOPPED': return 'Tap to start a new recording';
    case 'UPLOADING': return 'Uploading…';
    case 'PROCESSING': return 'Processing with AI…';
    case 'DONE': return 'Done!';
    case 'ERROR': return 'Error — tap to retry';
    case 'RECOVERING': return 'Recovering…';
    default: return '';
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  container: { flex: 1, paddingHorizontal: 24 },
  header: {
    paddingTop: 16,
    paddingBottom: 8,
    alignItems: 'center',
  },
  appName: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.textPrimary,
    letterSpacing: 0.3,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },
  waveformContainer: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    letterSpacing: 0.2,
  },
  footer: {
    paddingBottom: 32,
    alignItems: 'center',
    minHeight: 60,
  },
  stopButton: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 24,
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  stopButtonText: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '500',
  },
  processingText: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
});
