import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  cancelAnimation,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../constants/colors';

const BAR_COUNT = 28;
const BAR_WIDTH = 3;
const BAR_GAP = 3;
const MAX_HEIGHT = 44;
const MIN_HEIGHT = 4;

interface Props {
  isActive: boolean;
}

export function WaveformVisualizer({ isActive }: Props) {
  const heights = Array.from({ length: BAR_COUNT }, () => useSharedValue(MIN_HEIGHT));

  useEffect(() => {
    if (isActive) {
      heights.forEach((h, i) => {
        // Sine-wave envelope around the row + random jitter per bar
        const envelope = 0.45 + 0.55 * Math.sin((i / BAR_COUNT) * Math.PI);
        const peak = MIN_HEIGHT + envelope * (MAX_HEIGHT - MIN_HEIGHT) * (0.7 + Math.random() * 0.3);
        h.value = withDelay(
          i * 35,
          withRepeat(
            withSequence(
              withTiming(peak, {
                duration: 280 + Math.random() * 220,
                easing: Easing.inOut(Easing.quad),
              }),
              withTiming(MIN_HEIGHT + Math.random() * 6, {
                duration: 280 + Math.random() * 220,
                easing: Easing.inOut(Easing.quad),
              })
            ),
            -1,
            true
          )
        );
      });
    } else {
      heights.forEach((h) => {
        cancelAnimation(h);
        h.value = withTiming(MIN_HEIGHT, { duration: 200 });
      });
    }
  }, [isActive]);

  return (
    <View style={styles.container}>
      {heights.map((h, i) => (
        <WaveBar key={i} height={h} isActive={isActive} />
      ))}
    </View>
  );
}

function WaveBar({
  height,
  isActive,
}: {
  height: SharedValue<number>;
  isActive: boolean;
}) {
  const animStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  return (
    <Animated.View style={[styles.bar, animStyle]}>
      <LinearGradient
        colors={
          isActive
            ? ['#818CF8', '#6366F1', '#4F46E5']
            : [Colors.textMuted + '60', Colors.textMuted + '40']
        }
        style={styles.barGradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: BAR_GAP,
    height: MAX_HEIGHT + 4,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH / 2,
    overflow: 'hidden',
  },
  barGradient: {
    flex: 1,
    borderRadius: BAR_WIDTH / 2,
  },
});
