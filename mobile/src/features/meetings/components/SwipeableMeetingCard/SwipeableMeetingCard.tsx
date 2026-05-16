import React, { useRef } from 'react';
import { Animated, Text, StyleSheet, Pressable, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/src/constants/colors';
import type { TMeeting } from '../../types';
import { MeetingCard } from '../MeetingCard';

interface Props {
  meeting: TMeeting;
  onPress: () => void;
  onDelete: () => void;
}

export function SwipeableMeetingCard({ meeting, onPress, onDelete }: Props) {
  const swipeableRef = useRef<Swipeable>(null);

  const handleDelete = () => {
    swipeableRef.current?.close();
    onDelete();
  };

  const renderRightActions = (
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const scale = dragX.interpolate({
      inputRange: [-100, -40, 0],
      outputRange: [1, 0.85, 0.6],
      extrapolate: 'clamp',
    });
    const opacity = dragX.interpolate({
      inputRange: [-80, -30, 0],
      outputRange: [1, 0.6, 0],
      extrapolate: 'clamp',
    });

    return (
      <Pressable onPress={handleDelete} style={styles.deleteWrapper}>
        <Animated.View style={[styles.deleteContent, { transform: [{ scale }], opacity }]}>
          <Ionicons name="trash-outline" size={22} color="#FFFFFF" />
          <Text style={styles.deleteLabel}>Delete</Text>
        </Animated.View>
      </Pressable>
    );
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      friction={2}
      overshootRight={false}
      rightThreshold={48}
    >
      <View>
        <MeetingCard meeting={meeting} onPress={onPress} />
      </View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  deleteWrapper: {
    width: 88,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.red,
    borderRadius: 14,
    marginLeft: 8,
  },
  deleteContent: {
    alignItems: 'center',
    gap: 4,
  },
  deleteLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
