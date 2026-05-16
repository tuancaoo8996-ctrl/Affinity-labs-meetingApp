import React, { useState } from 'react';
import { View, Text, Switch, StyleSheet, SafeAreaView, Pressable, Alert } from 'react-native';
import { Colors } from '@/src/constants/colors';
import { storage } from '@/src/lib/storage/storage';

const NOTIFICATIONS_KEY = 'settings.notifications_enabled';

export default function SettingsScreen() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => storage.getBoolean(NOTIFICATIONS_KEY) ?? true
  );

  const handleNotificationsToggle = (value: boolean) => {
    setNotificationsEnabled(value);
    storage.set(NOTIFICATIONS_KEY, value);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Settings</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <View style={styles.row}>
            <View style={styles.rowLabel}>
              <Text style={styles.rowTitle}>Meeting processed</Text>
              <Text style={styles.rowSubtitle}>
                Get notified when your AI summary is ready
              </Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleNotificationsToggle}
              trackColor={{ false: Colors.border, true: Colors.indigo }}
              thumbColor={Colors.textPrimary}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Pressable
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            onPress={() =>
              Alert.alert(
                'Meeting Notes',
                'Record meetings with AI-powered transcription and summaries.\n\nBuilt with Expo + Supabase + OpenAI Whisper.'
              )
            }
          >
            <Text style={styles.rowTitle}>About Meeting Notes</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  container: { flex: 1, paddingHorizontal: 16 },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 16,
    marginBottom: 24,
  },
  section: { marginBottom: 28 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rowLabel: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, color: Colors.textPrimary, fontWeight: '500' },
  rowSubtitle: { fontSize: 12, color: Colors.textSecondary },
});
