import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';
import type { TMeeting } from '@/src/features/meetings/types';
import {
  getMeetings,
  subscribeMeetingsList,
  softDeleteMeeting,
  restoreMeeting,
} from '@/src/features/meetings/services';
import { SwipeableMeetingCard } from '@/src/features/meetings/components/SwipeableMeetingCard';
import { Colors } from '@/src/constants/colors';
import { useCurrentUserId } from '@/src/features/auth';

export default function MeetingsScreen() {
  const userId = useCurrentUserId();
  const [meetings, setMeetings] = useState<TMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const recentlyDeletedRef = useRef<Map<string, TMeeting>>(new Map());

  const loadMeetings = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await getMeetings(userId);
      setMeetings(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    loadMeetings();

    const channel = subscribeMeetingsList(
      userId,
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
  }, [userId, loadMeetings]);

  const handleDelete = useCallback(
    (meeting: TMeeting) => {
      setMeetings((prev) => prev.filter((m) => m.id !== meeting.id));
      recentlyDeletedRef.current.set(meeting.id, meeting);

      softDeleteMeeting(meeting.id).catch((err) => {
        console.error('[softDelete] failed:', err);
        setMeetings((prev) =>
          [...prev, meeting].sort((a, b) =>
            b.created_at.localeCompare(a.created_at)
          )
        );
        recentlyDeletedRef.current.delete(meeting.id);
        Alert.alert('Delete failed', 'Could not delete meeting. Please try again.');
      });

      Toast.show({
        type: 'info',
        text1: 'Meeting moved to trash',
        text2: 'Tap to undo',
        visibilityTime: 5000,
        onPress: async () => {
          Toast.hide();
          const stored = recentlyDeletedRef.current.get(meeting.id);
          if (!stored) return;
          recentlyDeletedRef.current.delete(meeting.id);
          setMeetings((prev) =>
            [...prev, stored].sort((a, b) =>
              b.created_at.localeCompare(a.created_at)
            )
          );
          try {
            await restoreMeeting(stored.id);
          } catch (err) {
            console.error('[restore] failed:', err);
            setMeetings((prev) => prev.filter((m) => m.id !== stored.id));
            Alert.alert('Restore failed', 'Could not restore meeting.');
          }
        },
      });

      setTimeout(() => {
        recentlyDeletedRef.current.delete(meeting.id);
      }, 6000);
    },
    []
  );

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
            <SwipeableMeetingCard
              meeting={item}
              onPress={() => router.push(`/meeting/${item.id}` as never)}
              onDelete={() => handleDelete(item)}
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
