import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  SafeAreaView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { getMeetings } from '@/src/features/meetings/services';
import { Colors } from '@/src/constants/colors';
import { EMeetingStatus } from '@/src/features/meetings/enums';
import type { TActionItem } from '@/src/features/meetings/types';
import { useCurrentUserId } from '@/src/features/auth';

interface EnrichedAction extends TActionItem {
  meetingId: string;
  meetingTitle: string;
}

export default function ActionsScreen() {
  const userId = useCurrentUserId();
  const [actions, setActions] = useState<EnrichedAction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    getMeetings(userId)
      .then((meetings) => {
        const all: EnrichedAction[] = meetings
          .filter((m) => m.status === EMeetingStatus.DONE && m.summary?.action_items?.length)
          .flatMap((m) =>
            (m.summary!.action_items ?? []).map((a) => ({
              ...a,
              meetingId: m.id,
              meetingTitle: m.title,
            }))
          );
        setActions(all);
      })
      .finally(() => setLoading(false));
  }, [userId]);

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
        <Text style={styles.title}>Actions</Text>
        <FlatList
          data={actions}
          keyExtractor={(_, i) => i.toString()}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/meeting/${item.meetingId}` as never)}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.assignee}>{item.assignee || 'Unassigned'}</Text>
                {item.due ? <Text style={styles.due}>{item.due}</Text> : null}
              </View>
              <Text style={styles.task}>{item.task}</Text>
              <Text style={styles.source} numberOfLines={1}>
                From: {item.meetingTitle}
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No action items</Text>
              <Text style={styles.emptySubtitle}>
                Action items extracted from your meetings will appear here.
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
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  assignee: { fontSize: 12, fontWeight: '600', color: Colors.indigoLight },
  due: { fontSize: 11, color: Colors.textMuted },
  task: { fontSize: 14, color: Colors.textPrimary, lineHeight: 20 },
  source: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  empty: { marginTop: 80, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: Colors.textPrimary },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
