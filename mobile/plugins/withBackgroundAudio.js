const { withInfoPlist, withAndroidManifest } = require('@expo/config-plugins');

/**
 * Custom config plugin: enables background audio recording on iOS and Android.
 *
 * iOS:
 *   - Adds UIBackgroundModes = ['audio'] to Info.plist
 *   - Sets NSMicrophoneUsageDescription
 *
 * Android:
 *   - Adds RECORD_AUDIO, FOREGROUND_SERVICE, FOREGROUND_SERVICE_MICROPHONE permissions
 *   - Declares a foreground service with foregroundServiceType="microphone"
 */
const withBackgroundAudio = (config) => {
  // ─── iOS ───────────────────────────────────────────────────────────────────
  config = withInfoPlist(config, (mod) => {
    const plist = mod.modResults;

    // UIBackgroundModes
    const modes = plist.UIBackgroundModes ?? [];
    if (!modes.includes('audio')) modes.push('audio');
    plist.UIBackgroundModes = modes;

    // Microphone usage description (fallback if not set in app.config)
    if (!plist.NSMicrophoneUsageDescription) {
      plist.NSMicrophoneUsageDescription =
        'Meeting Notes uses your microphone to record meetings.';
    }

    return mod;
  });

  // ─── Android ───────────────────────────────────────────────────────────────
  config = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;

    // Permissions
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

    // Foreground service declaration
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

  return config;
};

module.exports = withBackgroundAudio;
