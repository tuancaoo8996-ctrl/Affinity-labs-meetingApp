import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Meeting } from '../../src/types';
import { getMeetings, subscribeMeetingsList } from '../../src/services/meetingService';
import { MeetingCard } from '../../src/components/MeetingCard';
import { Colors } from '../../src/constants/colors';

const USER_ID = 'demo-user';

export default function MeetingsScreen() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadMeetings = useCallback(async () => {
    try {
      const data = await getMeetings(USER_ID);
      setMeetings(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadMeetings();

    const channel = subscribeMeetingsList(
      USER_ID,
      (newMeeting) => {
        setMeetings((prev) => [newMeeting, ...prev]);
      },
      (updated) => {
        setMeetings((prev) =>
          prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m))
        );
      }
    );

    return () => {
      channel.unsubscribe();
    };
  }, [loadMeetings]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.indigo} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Meetings</Text>
        <FlatList
          data={meetings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadMeetings();
              }}
              tintColor={Colors.indigo}
            />
          }
          renderItem={({ item }) => (
            <MeetingCard
              meeting={item}
              onPress={() => router.push(`/meeting/${item.id}` as never)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No meetings yet</Text>
              <Text style={styles.emptySubtitle}>
                Tap the mic on the Record tab to get started.
              </Text>
            </View>
          }
        />
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
    marginBottom: 16,
  },
  list: { paddingBottom: 24 },
  separator: { height: 10 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { marginTop: 80, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: Colors.textPrimary },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
