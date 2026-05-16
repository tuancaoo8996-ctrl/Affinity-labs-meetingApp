import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Meeting Notes',
  slug: 'meeting-notes-app',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'meetingnotes',
  userInterfaceStyle: 'dark',
  newArchEnabled: true,
  splash: {
    image: './assets/images/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#0F0F14',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.ancebu.tod',
    googleServicesFile: './GoogleService-Info.plist',
  },
  android: {
    package: 'com.ancebu.tod',
    googleServicesFile: './google-services.json',
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: '#0F0F14',
    },
    edgeToEdgeEnabled: true,
    permissions: ['POST_NOTIFICATIONS'],
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    './plugins/withBackgroundAudio',
    [
      'expo-build-properties',
      {
        ios: {
          useFrameworks: 'static',
          forceStaticLinking: ['RNFBApp', 'RNFBMessaging'],
        },
      },
    ],
    '@react-native-firebase/app',
    '@react-native-firebase/messaging',
    [
      'expo-notifications',
      {
        icon: './assets/images/icon.png',
        color: '#6366F1',
        sounds: [],
        enableBackgroundRemoteNotifications: true,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? '',
    },
  },
});
