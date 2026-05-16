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
import { Colors } from '@/src/constants/colors';
import { ERecordingStatus } from '@/src/features/recording/enums';

interface Props {
  status: ERecordingStatus;
  onPress: () => void;
}

const BUTTON_SIZE = 96;
const RING_SIZE = 132;
const GLOW_SIZE = 200;

export function RecordButton({ status, onPress }: Props) {
  const ringOpacity = useSharedValue(0);
  const ringScale = useSharedValue(1);
  const spinnerRotation = useSharedValue(0);
  const buttonScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.55);
  const glowScale = useSharedValue(1);

  useEffect(() => {
    if (status === ERecordingStatus.RECORDING) {
      ringOpacity.value = withRepeat(
        withSequence(withTiming(0.45, { duration: 800 }), withTiming(0, { duration: 800 })),
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

    if (status === ERecordingStatus.UPLOADING ||
      status === ERecordingStatus.PROCESSING ||
      status === ERecordingStatus.RECOVERING) {
      spinnerRotation.value = withRepeat(
        withTiming(360, { duration: 1200, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      cancelAnimation(spinnerRotation);
      spinnerRotation.value = 0;
    }

    // Breathing glow — slower & bigger swing for "alive ball" feel
    if (status === ERecordingStatus.IDLE ||
      status === ERecordingStatus.STOPPED ||
      status === ERecordingStatus.PAUSED) {
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.75, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.4, { duration: 2000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
      glowScale.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    } else {
      cancelAnimation(glowOpacity);
      cancelAnimation(glowScale);
      glowOpacity.value = withTiming(status === ERecordingStatus.RECORDING ? 0.8 : 0.3, { duration: 300 });
      glowScale.value = withTiming(1, { duration: 300 });
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
    transform: [{ scale: glowScale.value }],
  }));

  const spinnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spinnerRotation.value}deg` }],
  }));

  const handlePress = async () => {
    if (status === ERecordingStatus.UPLOADING ||
      status === ERecordingStatus.PROCESSING ||
      status === ERecordingStatus.RECOVERING) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    buttonScale.value = withSequence(
      withTiming(0.92, { duration: 90 }),
      withTiming(1, { duration: 140 })
    );
    onPress();
  };

  const palette = getPalette(status);

  return (
    <Pressable onPress={handlePress} style={styles.wrapper}>
      {/* Outer purple ambient glow */}
      <Animated.View style={[styles.glow, glowStyle]}>
        <LinearGradient
          colors={[palette.glow + 'AA', palette.glow + '33', 'transparent']}
          style={styles.glowGradient}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>

      {/* Pulse ring (recording only) */}
      <Animated.View
        style={[
          styles.ring,
          { backgroundColor: status === ERecordingStatus.RECORDING ? Colors.red + '33' : 'transparent' },
          ringStyle,
        ]}
      />

      {/* Sphere — multi-layer to fake radial gradient + specular */}
      <Animated.View
        style={[
          styles.sphereWrapper,
          buttonStyle,
          { shadowColor: palette.shadow },
        ]}
      >
        {/* Base gradient (diagonal as fallback for radial) */}
        <LinearGradient
          colors={palette.base}
          style={styles.sphere}
          start={{ x: 0.15, y: 0.15 }}
          end={{ x: 0.85, y: 0.95 }}
        >
          {/* Inner shadow ring (creates depth at rim) */}
          <View style={styles.innerShadow} />

          {/* Specular highlight — top-left bright spot */}
          <LinearGradient
            colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
            style={styles.specular}
            start={{ x: 0.2, y: 0.15 }}
            end={{ x: 0.7, y: 0.7 }}
          />

          {/* Icon */}
          <View style={styles.iconWrapper}>
            <ButtonIcon status={status} spinnerStyle={spinnerStyle} />
          </View>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

interface Palette {
  base: readonly [string, string, ...string[]];
  glow: string;
  shadow: string;
}

function getPalette(status: ERecordingStatus): Palette {
  switch (status) {
    case ERecordingStatus.RECORDING:
      return {
        base: ['#FB7185', '#E11D48', '#9F1239'] as const,
        glow: '#F43F5E',
        shadow: '#E11D48',
      };
    case ERecordingStatus.PAUSED:
      return {
        base: ['#FDE68A', '#F59E0B', '#B45309'] as const,
        glow: '#F59E0B',
        shadow: '#D97706',
      };
    case ERecordingStatus.UPLOADING:
    case ERecordingStatus.PROCESSING:
    case ERecordingStatus.RECOVERING:
      return {
        base: ['#94A3B8', '#475569', '#1E293B'] as const,
        glow: '#64748B',
        shadow: '#1E293B',
      };
    case ERecordingStatus.ERROR:
      return {
        base: ['#FCA5A5', '#DC2626', '#7F1D1D'] as const,
        glow: '#EF4444',
        shadow: '#991B1B',
      };
    default:
      // IDLE / STOPPED — match design (purple + cyan accents)
      return {
        base: ['#A78BFA', '#6366F1', '#3730A3'] as const,
        glow: '#7C3AED',
        shadow: '#4338CA',
      };
  }
}

function ButtonIcon({
  status,
  spinnerStyle,
}: {
  status: ERecordingStatus;
  spinnerStyle: { transform: { rotate: string }[] };
}) {
  if (status === ERecordingStatus.UPLOADING ||
      status === ERecordingStatus.PROCESSING ||
      status === ERecordingStatus.RECOVERING) {
    return (
      <Animated.View style={spinnerStyle}>
        <Ionicons name="sync" size={34} color="#FFFFFF" />
      </Animated.View>
    );
  }
  if (status === ERecordingStatus.RECORDING) {
    return <View style={styles.stopSquare} />;
  }
  if (status === ERecordingStatus.PAUSED) {
    return <Ionicons name="play" size={34} color="#FFFFFF" style={{ marginLeft: 4 }} />;
  }
  return <Ionicons name="mic" size={34} color="#FFFFFF" />;
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
  sphereWrapper: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 20,
    elevation: 14,
  },
  sphere: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  innerShadow: {
    position: 'absolute',
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.25)',
  },
  specular: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: BUTTON_SIZE * 0.7,
    height: BUTTON_SIZE * 0.55,
    borderTopLeftRadius: BUTTON_SIZE / 2,
    borderTopRightRadius: BUTTON_SIZE / 3,
    borderBottomLeftRadius: BUTTON_SIZE / 3,
  },
  iconWrapper: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopSquare: {
    width: 30,
    height: 30,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
  },
});
