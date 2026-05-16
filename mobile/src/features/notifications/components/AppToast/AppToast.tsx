import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import type { ToastConfig, ToastConfigParams } from 'react-native-toast-message';
import { Colors } from '@/src/constants/colors';

interface AppToastProps {
  text1?: string;
  text2?: string;
  onPress?: () => void;
  accent?: string;
  icon?: string;
}

function AppToast({ text1, text2, onPress, accent = Colors.indigo, icon = '🎙' }: AppToastProps) {
  return (
    <Animated.View entering={FadeInUp.duration(220)} exiting={FadeOutUp.duration(180)} style={styles.wrapper}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
        <View style={[styles.iconBubble, { backgroundColor: accent + '22', borderColor: accent + '55' }]}>
          <Text style={styles.iconText}>{icon}</Text>
        </View>
        <View style={styles.content}>
          {!!text1 && (
            <Text style={styles.title} numberOfLines={1}>
              {text1}
            </Text>
          )}
          {!!text2 && (
            <Text style={styles.body} numberOfLines={2}>
              {text2}
            </Text>
          )}
        </View>
        <View style={[styles.accentBar, { backgroundColor: accent }]} />
      </Pressable>
    </Animated.View>
  );
}

export const toastConfig: ToastConfig = {
  success: ({ text1, text2, onPress }: ToastConfigParams<unknown>) => (
    <AppToast text1={text1} text2={text2} onPress={onPress} accent={Colors.green} icon="✓" />
  ),
  info: ({ text1, text2, onPress }: ToastConfigParams<unknown>) => (
    <AppToast text1={text1} text2={text2} onPress={onPress} accent={Colors.indigo} icon="🎙" />
  ),
  error: ({ text1, text2, onPress }: ToastConfigParams<unknown>) => (
    <AppToast text1={text1} text2={text2} onPress={onPress} accent={Colors.red} icon="!" />
  ),
};

const styles = StyleSheet.create({
  wrapper: {
    width: '92%',
    alignSelf: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 12,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginRight: 12,
  },
  iconText: {
    fontSize: 16,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  body: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 17,
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
});
