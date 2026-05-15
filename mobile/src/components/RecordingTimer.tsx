import React from 'react';
import { Text, StyleSheet, View, Platform } from 'react-native';
import { Colors } from '../constants/colors';

interface Props {
  durationMs: number;
  isRecording: boolean;
}

export function RecordingTimer({ durationMs, isRecording }: Props) {
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const showHours = hours > 0;
  const parts = showHours
    ? [pad(hours), pad(minutes), pad(seconds)]
    : [pad(minutes), pad(seconds)];

  return (
    <View style={styles.row}>
      {parts.map((part, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && (
            <Text style={[styles.colon, isRecording && styles.colonActive]}>:</Text>
          )}
          <Text style={[styles.digits, isRecording && styles.digitsActive]}>{part}</Text>
        </React.Fragment>
      ))}
    </View>
  );
}

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  digits: {
    fontSize: 64,
    fontWeight: '200',
    letterSpacing: -2,
    color: Colors.textMuted,
    fontVariant: ['tabular-nums'],
    ...Platform.select({
      ios: { fontFamily: 'Helvetica Neue' },
      android: { fontFamily: 'sans-serif-light' },
    }),
  },
  digitsActive: {
    color: Colors.textPrimary,
  },
  colon: {
    fontSize: 56,
    fontWeight: '200',
    color: Colors.textMuted,
    marginHorizontal: 4,
    transform: [{ translateY: -4 }],
  },
  colonActive: {
    color: Colors.indigoLight,
  },
});
