import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Audio, AVPlaybackStatus } from 'expo-av';
import Slider from '@react-native-community/slider';
import { supabase } from '../services/supabase';
import { Colors } from '../constants/colors';

interface Props {
  audioUrl: string | null;
}

type PlayState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function PlaybackCard({ audioUrl }: Props) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playState, setPlayState] = useState<PlayState>('idle');
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const isSeeking = useRef(false);

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync();
    };
  }, []);

  const getPlayableUrl = async (): Promise<string | null> => {
    if (!audioUrl) return null;
    if (audioUrl.startsWith('http')) return audioUrl;
    const { data, error } = await supabase.storage
      .from('audio-recordings')
      .createSignedUrl(audioUrl, 3600);
    if (error || !data) return null;
    return data.signedUrl;
  };

  const onPlaybackStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if (status.error) setPlayState('error');
      return;
    }
    if (!isSeeking.current) {
      setPosition(status.positionMillis ?? 0);
    }
    if (status.durationMillis) setDuration(status.durationMillis);
    if (status.didJustFinish) {
      setPlayState('paused');
      setPosition(0);
    }
  }, []);

  const handlePlayPause = async () => {
    if (playState === 'idle' || playState === 'error') {
      setPlayState('loading');
      const url = await getPlayableUrl();
      if (!url) { setPlayState('error'); return; }

      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true },
        onPlaybackStatus
      );
      soundRef.current = sound;
      setPlayState('playing');
      return;
    }
    if (playState === 'playing') {
      await soundRef.current?.pauseAsync();
      setPlayState('paused');
    } else if (playState === 'paused') {
      await soundRef.current?.playAsync();
      setPlayState('playing');
    }
  };

  if (!audioUrl) return null;

  const progress = duration > 0 ? position / duration : 0;

  return (
    <View style={styles.card}>
        <Pressable
          style={styles.playBtn}
          onPress={handlePlayPause}
          disabled={playState === 'loading'}
        >
          {playState === 'loading' ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.playIcon}>{playState === 'playing' ? '⏸' : '▶'}</Text>
          )}
        </Pressable>

        <View style={styles.right}>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={1}
            value={progress}
            minimumTrackTintColor={Colors.indigo}
            maximumTrackTintColor={Colors.border}
            thumbTintColor={Colors.indigoLight}
            onSlidingStart={() => { isSeeking.current = true; }}
            onSlidingComplete={async (value) => {
              isSeeking.current = false;
              if (soundRef.current && duration > 0) {
                await soundRef.current.setPositionAsync(Math.floor(value * duration));
              }
            }}
          />

          <View style={styles.timeRow}>
            <Text style={styles.time}>{formatTime(position)}</Text>
            {duration > 0 && <Text style={styles.time}>{formatTime(duration)}</Text>}
          </View>

          {playState === 'error' && (
            <Text style={styles.errorText}>Failed to load audio — tap to retry.</Text>
          )}
        </View>
      </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 14,
  },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.indigo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: { fontSize: 18, color: '#fff' },
  right: { flex: 1, gap: 2 },
  slider: { width: '100%', height: 32 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  time: { fontSize: 11, color: Colors.textMuted },
  errorText: { fontSize: 11, color: Colors.red, marginTop: 2 },
});
