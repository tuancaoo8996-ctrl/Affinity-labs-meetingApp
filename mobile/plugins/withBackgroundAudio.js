const {
  withInfoPlist,
  withAndroidManifest,
  withMainApplication,
} = require('@expo/config-plugins');

/**
 * Custom config plugin: enables background audio recording on iOS and Android.
 *
 * iOS:
 *   - UIBackgroundModes → ['audio'] in Info.plist
 *     (required for AVAudioSession to stay active when app is backgrounded)
 *   - NSMicrophoneUsageDescription for runtime mic permission prompt
 *
 * Android:
 *   - RECORD_AUDIO: runtime permission to access microphone
 *   - FOREGROUND_SERVICE: allows starting a foreground service (required on Android 9+)
 *   - FOREGROUND_SERVICE_MICROPHONE: scoped permission for mic foreground service (Android 14+)
 *   - RecordingForegroundService with foregroundServiceType="microphone"
 *     so Android knows this service legitimately needs mic in background
 *   - Notification channel "recording_channel" (Android 8+ requirement):
 *     foreground services must post a visible notification — the channel must
 *     exist before the service starts or the app crashes with a bad notification
 *     exception
 */
const withBackgroundAudio = (config) => {
  // ─── iOS ───────────────────────────────────────────────────────────────────
  config = withInfoPlist(config, (mod) => {
    const plist = mod.modResults;

    const modes = plist.UIBackgroundModes ?? [];
    // 'audio' — keeps AVAudioSession alive when app is backgrounded
    if (!modes.includes('audio')) modes.push('audio');
    // 'remote-notification' — allows FCM data-only pushes to wake the app
    if (!modes.includes('remote-notification')) modes.push('remote-notification');
    plist.UIBackgroundModes = modes;

    if (!plist.NSMicrophoneUsageDescription) {
      plist.NSMicrophoneUsageDescription =
        'Meeting Notes uses your microphone to record meetings.';
    }

    return mod;
  });

  // ─── Android — permissions + service declaration ───────────────────────────
  config = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;

    const requiredPermissions = [
      'android.permission.RECORD_AUDIO',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
    ];

    manifest['uses-permission'] = manifest['uses-permission'] ?? [];
    for (const name of requiredPermissions) {
      const exists = manifest['uses-permission'].some(
        (p) => p.$['android:name'] === name
      );
      if (!exists) {
        manifest['uses-permission'].push({ $: { 'android:name': name } });
      }
    }

    const app = manifest.application[0];
    app.service = app.service ?? [];

    const serviceExists = app.service.some(
      (s) => s.$['android:name'] === '.RecordingForegroundService'
    );
    if (!serviceExists) {
      app.service.push({
        $: {
          'android:name': '.RecordingForegroundService',
          'android:foregroundServiceType': 'microphone',
          'android:exported': 'false',
        },
      });
    }

    return mod;
  });

  // ─── Android — notification channel (required on Android 8+ / API 26+) ────
  config = withMainApplication(config, (mod) => {
    const src = mod.modResults.contents;

    const channelCode = `
    // Background audio recording notification channel (required on Android 8+)
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
      android.app.NotificationChannel channel = new android.app.NotificationChannel(
        "recording_channel",
        "Recording",
        android.app.NotificationManager.IMPORTANCE_LOW
      );
      channel.setDescription("Shows while a meeting is being recorded in the background");
      android.app.NotificationManager nm =
        (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
      if (nm != null) nm.createNotificationChannel(channel);
    }`;

    // Inject once, right after super.onCreate()
    if (!src.includes('recording_channel')) {
      mod.modResults.contents = src.replace(
        'super.onCreate()',
        `super.onCreate()${channelCode}`
      );
    }

    return mod;
  });

  return config;
};

module.exports = withBackgroundAudio;
