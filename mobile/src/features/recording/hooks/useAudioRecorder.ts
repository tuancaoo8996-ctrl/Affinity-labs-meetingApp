import { useCallback, useRef } from 'react';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { useRecordingStore } from '../stores/recordingStore';
import { ERecordingStatus } from '@/src/features/recording/enums';

const RECORDING_OPTIONS: Audio.RecordingOptions = {
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 128000,
  },
};

export function useAudioRecorder() {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const {
    status,
    setStatus,
    setDurationMs,
    setAudioUri,
    setError,
    reset,
  } = useRecordingStore();

  const configureAudioSession = useCallback(async () => {
    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) throw new Error('Microphone permission denied');
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      shouldDuckAndroid: true,
    });
  }, []);

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setDurationMs(Date.now() - startTimeRef.current);
    }, 100);
  }, [setDurationMs]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      await configureAudioSession();

      const { recording } = await Audio.Recording.createAsync(
        RECORDING_OPTIONS,
        (recordingStatus) => {
          // Auto-pause on phone call / interruption
          if (
            !recordingStatus.isRecording &&
            !recordingStatus.isDoneRecording &&
            useRecordingStore.getState().status === ERecordingStatus.RECORDING
          ) {
            useRecordingStore.getState().setStatus(ERecordingStatus.PAUSED);
            stopTimer();
          }
        },
        100
      );

      recordingRef.current = recording;
      setStatus(ERecordingStatus.RECORDING);
      startTimer();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start recording';
      setError(msg);
      setStatus(ERecordingStatus.ERROR);
    }
  }, [configureAudioSession, startTimer, stopTimer, setStatus, setError]);

  const pauseRecording = useCallback(async () => {
    if (!recordingRef.current || status !== ERecordingStatus.RECORDING) return;
    try {
      await recordingRef.current.pauseAsync();
      setStatus(ERecordingStatus.PAUSED);
      stopTimer();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to pause recording';
      setError(msg);
    }
  }, [status, setStatus, setError, stopTimer]);

  const resumeRecording = useCallback(async () => {
    if (!recordingRef.current || status !== ERecordingStatus.PAUSED) return;
    try {
      await recordingRef.current.startAsync();
      setStatus(ERecordingStatus.RECORDING);
      const currentMs = useRecordingStore.getState().durationMs;
      startTimeRef.current = Date.now() - currentMs;
      timerRef.current = setInterval(() => {
        setDurationMs(Date.now() - startTimeRef.current);
      }, 100);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to resume recording';
      setError(msg);
    }
  }, [status, setStatus, setError, setDurationMs]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (!recordingRef.current) return null;
    try {
      stopTimer();
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      setAudioUri(uri);
      setStatus(ERecordingStatus.STOPPED);

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      return uri ?? null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to stop recording';
      setError(msg);
      setStatus(ERecordingStatus.ERROR);
      return null;
    }
  }, [stopTimer, setAudioUri, setStatus, setError]);

  const cancelRecording = useCallback(async () => {
    stopTimer();
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch {
        // ignore errors on cancel
      }
      recordingRef.current = null;
    }
    reset();
  }, [stopTimer, reset]);

  return {
    status,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    cancelRecording,
  };
}
