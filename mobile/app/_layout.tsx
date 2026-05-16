import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Toast from 'react-native-toast-message';
import { toastConfig } from '@/src/features/notifications/components/AppToast';
import { useNotifications } from '@/src/features/notifications/hooks';
import { useRecordingLifecycle } from '@/src/features/recording/hooks';
import { useAnonAuth } from '@/src/features/auth';

export default function RootLayout() {
  useAnonAuth();
  useNotifications();
  useRecordingLifecycle();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0F0F14' },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="meeting/[id]"
          options={{
            headerShown: true,
            headerStyle: { backgroundColor: '#0F0F14' },
            headerTintColor: '#F1F1F5',
            headerTitle: 'Meeting Detail',
            headerBackTitle: 'Back',
          }}
        />
      </Stack>
      <Toast topOffset={60} config={toastConfig} />
    </GestureHandlerRootView>
  );
}
