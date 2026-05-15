import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { Colors } from '../constants/colors';
import { Meeting, MeetingStatus } from '../types';

interface Props {
  meeting: Meeting;
  onPress: () => void;
}

export function MeetingCard({ meeting, onPress }: Props) {
  const dotOpacity = useSharedValue(1);
  const cardScale = useSharedValue(1);

  React.useEffect(() => {
    if (meeting.status === 'processing') {
      dotOpacity.value = withRepeat(
        withSequence(withTiming(0.2, { duration: 600 }), withTiming(1, { duration: 600 })),
        -1,
        false
      );
    } else {
      dotOpacity.value = 1;
    }
  }, [meeting.status]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: dotOpacity.value }));
  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
  }));

  const handlePressIn = () => {
    cardScale.value = withSpring(0.98, { damping: 18, stiffness: 280 });
  };
  const handlePressOut = () => {
    cardScale.value = withSpring(1, { damping: 18, stiffness: 280 });
  };

  const duration = formatDuration(meeting.duration_seconds);
  const date = formatDate(meeting.created_at);
  const accent = STATUS_CONFIG[meeting.status].color;

  return (
    <Animated.View style={cardAnimStyle}>
      <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
        <View style={styles.card}>
          <View style={[styles.accentStripe, { backgroundColor: accent }]} />
          <View style={styles.body}>
            <View style={styles.header}>
              <Text style={styles.title} numberOfLines={1}>
                {meeting.title}
              </Text>
              <StatusBadge status={meeting.status} dotStyle={dotStyle} />
            </View>
            <View style={styles.meta}>
              <Text style={styles.metaText}>{date}</Text>
              <Text style={styles.separator}>·</Text>
              <Text style={styles.metaText}>{duration}</Text>
              {meeting.summary?.action_items?.length ? (
                <>
                  <Text style={styles.separator}>·</Text>
                  <Text style={styles.actionCount}>
                    {meeting.summary.action_items.length} actions
                  </Text>
                </>
              ) : null}
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function StatusBadge({
  status,
  dotStyle,
}: {
  status: MeetingStatus;
  dotStyle: object;
}) {
  const config = STATUS_CONFIG[status];
  return (
    <View style={[styles.badge, { backgroundColor: config.bg, borderColor: config.color + '33' }]}>
      {status === 'processing' && (
        <Animated.View style={[styles.dot, { backgroundColor: config.color }, dotStyle]} />
      )}
      <Text style={[styles.badgeText, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

const STATUS_CONFIG: Record<MeetingStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: Colors.textSecondary, bg: Colors.surfaceAlt },
  processing: { label: 'Processing', color: Colors.amber, bg: '#2A2010' },
  done: { label: 'Done', color: Colors.green, bg: '#102210' },
  error: { label: 'Error', color: Colors.red, bg: '#221010' },
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  accentStripe: {
    width: 3,
  },
  body: {
    flex: 1,
    padding: 16,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    letterSpacing: 0.1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12, color: Colors.textSecondary },
  separator: { fontSize: 12, color: Colors.textMuted },
  actionCount: { fontSize: 12, color: Colors.indigoLight, fontWeight: '500' },
});
