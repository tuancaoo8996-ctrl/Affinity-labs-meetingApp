import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Pressable,
  Alert,
  Share,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { TMeeting, TSpeaker } from '@/src/features/meetings/types';
import { EMeetingStatus } from '@/src/features/meetings/enums';
import { getMeeting, subscribeMeetingStatus, updateSpeakers } from '@/src/features/meetings/services';
import { Colors } from '@/src/constants/colors';
import PlaybackCard from '@/src/features/meetings/components/PlaybackCard';

export default function MeetingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [meeting, setMeeting] = useState<TMeeting | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    getMeeting(id).then((m) => {
      setMeeting(m);
      setLoading(false);
    });

    const channel = subscribeMeetingStatus(id, (_status, updated) => {
      setMeeting((prev) => (prev ? { ...prev, ...updated } : prev));
    });

    return () => {
      channel.unsubscribe();
    };
  }, [id]);

  const handleRenameSpeaker = (speaker: TSpeaker) => {
    Alert.prompt(
      'Rename Speaker',
      `Current name: ${speaker.display_name}`,
      async (newName) => {
        if (!newName?.trim() || !meeting) return;
        const updated = (meeting.speakers ?? []).map((s) =>
          s.id === speaker.id ? { ...s, display_name: newName.trim() } : s
        );
        await updateSpeakers(meeting.id, updated);
        setMeeting((prev) => (prev ? { ...prev, speakers: updated } : prev));
      },
      'plain-text',
      speaker.display_name
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.indigo} />
        </View>
      </SafeAreaView>
    );
  }

  if (!meeting) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Meeting not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const speakerMap = Object.fromEntries(
    (meeting.speakers ?? []).map((s) => [s.label, s.display_name])
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{meeting.title}</Text>
        <Text style={styles.meta}>
          {formatDuration(meeting.duration_seconds)} · {formatDate(meeting.created_at)}
        </Text>

        {meeting.audio_url && meeting.status === EMeetingStatus.DONE && (
          <PlaybackCard audioUrl={meeting.audio_url} />
        )}

        {(meeting.status === EMeetingStatus.PENDING ||
          meeting.status === EMeetingStatus.PROCESSING) && (
          <View style={styles.processingBanner}>
            <ActivityIndicator color={Colors.amber} size="small" />
            <Text style={styles.processingText}>
              {meeting.status === EMeetingStatus.PENDING
                ? 'Uploading…'
                : 'AI is processing your meeting…'}
            </Text>
          </View>
        )}

        {meeting.speakers && meeting.speakers.length > 0 && (
          <Section title="Speakers">
            <View style={styles.speakerRow}>
              {meeting.speakers.map((s) => (
                <Pressable
                  key={s.id}
                  style={styles.speakerChip}
                  onPress={() => handleRenameSpeaker(s)}
                >
                  <Text style={styles.speakerChipText}>{s.display_name}</Text>
                  <Text style={styles.speakerEditIcon}> ✎</Text>
                </Pressable>
              ))}
            </View>
          </Section>
        )}

        {meeting.summary && (
          <>
            {meeting.summary.key_decisions?.length > 0 && (
              <Section title="Key Decisions">
                {meeting.summary.key_decisions.map((d, i) => (
                  <BulletItem key={i} text={d} />
                ))}
              </Section>
            )}

            {meeting.summary.action_items?.length > 0 && (
              <Section title="Action Items">
                {meeting.summary.action_items.map((a, i) => (
                  <View key={i} style={styles.actionItem}>
                    <Text style={styles.assignee}>{a.assignee || 'Unassigned'}</Text>
                    <Text style={styles.actionTask}>{a.task}</Text>
                    {a.due ? <Text style={styles.actionDue}>{a.due}</Text> : null}
                  </View>
                ))}
              </Section>
            )}

            {meeting.summary.next_steps?.length > 0 && (
              <Section title="Next Steps">
                {meeting.summary.next_steps.map((s, i) => (
                  <BulletItem key={i} text={s} />
                ))}
              </Section>
            )}
          </>
        )}

        {meeting.transcript && meeting.transcript.length > 0 && (
          <Section
            title="Transcript"
            action={
              <Pressable
                onPress={async () => {
                  const text = meeting.transcript!
                    .map((t) => `${speakerMap[t.speaker] ?? t.speaker}: ${t.text}`)
                    .join('\n\n');
                  await Share.share({ message: text });
                }}
              >
                <Text style={styles.copyBtn}>Share</Text>
              </Pressable>
            }
          >
            {meeting.transcript.map((seg, i) => (
              <View key={i} style={styles.transcriptSegment}>
                <Text style={styles.transcriptSpeaker}>
                  {speakerMap[seg.speaker] ?? seg.speaker}
                </Text>
                <Text style={styles.transcriptText}>{seg.text}</Text>
              </View>
            ))}
          </Section>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {action}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function BulletItem({ text }: { text: string }) {
  return (
    <View style={styles.bullet}>
      <Text style={styles.bulletDot}>·</Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 48, gap: 4 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, lineHeight: 28 },
  meta: { fontSize: 13, color: Colors.textSecondary, marginTop: 4, marginBottom: 16 },
  errorText: { color: Colors.textSecondary, fontSize: 15 },

  processingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#2A1F00',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  processingText: { color: Colors.amber, fontSize: 13 },

  speakerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  speakerChip: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  speakerChipText: { fontSize: 13, color: Colors.textPrimary },
  speakerEditIcon: { fontSize: 11, color: Colors.textMuted },

  section: { marginTop: 20 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionBody: { gap: 8 },
  copyBtn: { fontSize: 13, color: Colors.indigo, fontWeight: '500' },

  bullet: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  bulletDot: { color: Colors.indigo, fontSize: 16, lineHeight: 22 },
  bulletText: { flex: 1, fontSize: 14, color: Colors.textPrimary, lineHeight: 22 },

  actionItem: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 2,
  },
  assignee: { fontSize: 11, fontWeight: '600', color: Colors.indigoLight },
  actionTask: { fontSize: 14, color: Colors.textPrimary, lineHeight: 20 },
  actionDue: { fontSize: 11, color: Colors.textMuted },

  transcriptSegment: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  transcriptSpeaker: { fontSize: 11, fontWeight: '600', color: Colors.indigoLight },
  transcriptText: { fontSize: 13, color: Colors.textPrimary, lineHeight: 20 },
});
