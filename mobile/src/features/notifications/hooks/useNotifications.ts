import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import messaging from '@react-native-firebase/messaging';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import Toast from 'react-native-toast-message';
import { usePushTokenStore } from '../stores';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function useNotifications() {
  const setFcmToken = usePushTokenStore((s) => s.setFcmToken);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    registerForPushNotificationsAsync().then((token) => {
      setFcmToken(token ?? null);
      if (token) console.log('[FCM] token:', token);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const meetingId = response.notification.request.content.data?.meetingId as
          | string
          | undefined;
        if (meetingId) router.push(`/meeting/${meetingId}` as never);
      }
    );

    const unsubTokenRefresh = messaging().onTokenRefresh((newToken) => {
      console.log('[FCM] token refreshed');
      setFcmToken(newToken);
    });

    const unsubOpenedFromBackground = messaging().onNotificationOpenedApp(
      (remoteMessage) => {
        const meetingId = remoteMessage?.data?.meetingId as string | undefined;
        if (meetingId) router.push(`/meeting/${meetingId}` as never);
      }
    );

    const unsubForegroundMessage = messaging().onMessage(async (remoteMessage) => {
      const meetingId = remoteMessage?.data?.meetingId as string | undefined;
      Toast.show({
        type: 'success',
        text1: remoteMessage.notification?.title ?? 'Meeting ready',
        text2: remoteMessage.notification?.body ?? '',
        visibilityTime: 4000,
        onPress: () => {
          Toast.hide();
          if (meetingId) router.push(`/meeting/${meetingId}` as never);
        },
      });
    });

    messaging()
      .getInitialNotification()
      .then((remoteMessage) => {
        const meetingId = remoteMessage?.data?.meetingId as string | undefined;
        if (meetingId) setTimeout(() => router.push(`/meeting/${meetingId}` as never), 100);
      });

    return () => {
      responseListener.current?.remove();
      unsubTokenRefresh();
      unsubOpenedFromBackground();
      unsubForegroundMessage();
    };
  }, [setFcmToken]);
}

async function registerForPushNotificationsAsync(): Promise<string | null> {
  const existing = await Notifications.getPermissionsAsync();
  console.log('[FCM] existing permissions:', JSON.stringify(existing));
  let finalStatus = existing.status;
  if (existing.status !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
        allowDisplayInCarPlay: true,
      },
    });
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6366F1',
    });
  }

  try {
    const token = await messaging().getToken();
    return token || null;
  } catch (err) {
    console.error('[FCM] getToken failed:', err);
    return null;
  }
}
