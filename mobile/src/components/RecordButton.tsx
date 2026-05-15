import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors } from '../constants/colors';
import { RecordingStatus } from '../types';

interface Props {
  status: RecordingStatus;
  onPress: () => void;
}

const BUTTON_SIZE = 88;
const RING_SIZE = 120;
const GLOW_SIZE = 160;

export function RecordButton({ status, onPress }: Props) {
  const ringOpacity = useSharedValue(0);
  const ringScale = useSharedValue(1);
  const spinnerRotation = useSharedValue(0);
  const buttonScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.4);

  useEffect(() => {
    if (status === 'RECORDING') {
      ringOpacity.value = withRepeat(
        withSequence(withTiming(0.4, { duration: 800 }), withTiming(0, { duration: 800 })),
        -1,
        false
      );
      ringScale.value = withRepeat(
        withSequence(withTiming(1.2, { duration: 800 }), withTiming(1, { duration: 800 })),
        -1,
        false
      );
    } else {
      cancelAnimation(ringOpacity);
      cancelAnimation(ringScale);
      ringOpacity.value = withTiming(0, { duration: 300 });
      ringScale.value = withTiming(1, { duration: 300 });
    }

    if (status === 'UPLOADING' || status === 'PROCESSING' || status === 'RECOVERING') {
      spinnerRotation.value = withRepeat(
        withTiming(360, { duration: 1200, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      cancelAnimation(spinnerRotation);
      spinnerRotation.value = 0;
    }

    // Subtle breathing glow when idle
    if (status === 'IDLE' || status === 'STOPPED') {
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.3, { duration: 1800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    } else {
      cancelAnimation(glowOpacity);
      glowOpacity.value = withTiming(status === 'RECORDING' ? 0.7 : 0.2, { duration: 300 });
    }
  }, [status]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const spinnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spinnerRotation.value}deg` }],
  }));

  const handlePress = async () => {
    if (status === 'UPLOADING' || status === 'PROCESSING' || status === 'RECOVERING') return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    buttonScale.value = withSequence(
      withTiming(0.93, { duration: 80 }),
      withTiming(1, { duration: 120 })
    );
    onPress();
  };

  const gradientColors = getGradientColors(status);

  return (
    <Pressable onPress={handlePress} style={styles.wrapper}>
      {/* Outer ambient glow */}
      <Animated.View style={[styles.glow, glowStyle]}>
        <LinearGradient
          colors={[gradientColors[0] + '55', 'transparent']}
          style={styles.glowGradient}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 0, y: 0 }}
        />
      </Animated.View>

      {/* Pulse ring */}
      <Animated.View
        style={[
          styles.ring,
          { backgroundColor: status === 'RECORDING' ? Colors.red + '40' : 'transparent' },
          ringStyle,
        ]}
      />

      {/* Main button with gradient */}
      <Animated.View style={[styles.button, buttonStyle]}>
        <LinearGradient
          colors={gradientColors}
          style={styles.buttonGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <ButtonIcon status={status} spinnerStyle={spinnerStyle} />
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

function getGradientColors(status: RecordingStatus): readonly [string, string] {
  switch (status) {
    case 'RECORDING':
      return ['#F87171', '#DC2626'] as const;
    case 'PAUSED':
      return ['#FCD34D', '#D97706'] as const;
    case 'UPLOADING':
    case 'PROCESSING':
    case 'RECOVERING':
      return ['#475569', '#1E293B'] as const;
    case 'ERROR':
      return ['#F87171', '#991B1B'] as const;
    default:
      return ['#818CF8', '#4F46E5'] as const;
  }
}

function ButtonIcon({
  status,
  spinnerStyle,
}: {
  status: RecordingStatus;
  spinnerStyle: { transform: { rotate: string }[] };
}) {
  if (status === 'UPLOADING' || status === 'PROCESSING' || status === 'RECOVERING') {
    return (
      <Animated.View style={spinnerStyle}>
        <Ionicons name="sync" size={32} color="#FFFFFF" />
      </Animated.View>
    );
  }
  if (status === 'RECORDING') {
    return <View style={styles.stopSquare} />;
  }
  if (status === 'PAUSED') {
    return <Ionicons name="play" size={32} color="#FFFFFF" />;
  }
  return <Ionicons name="mic" size={32} color="#FFFFFF" />;
}

const styles = StyleSheet.create({
  wrapper: {
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    borderRadius: GLOW_SIZE / 2,
    overflow: 'hidden',
  },
  glowGradient: {
    flex: 1,
    borderRadius: GLOW_SIZE / 2,
  },
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    shadowColor: Colors.indigo,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  buttonGradient: {
    flex: 1,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopSquare: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
});
