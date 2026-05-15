import { supabase } from './supabase';
import { Meeting, MeetingStatus, Speaker, Attendee } from '../types';

export async function createMeeting(params: {
  userId: string;
  title: string;
  durationSeconds: number;
  audioUrl: string;
  pushToken: string | null;
  attendees?: Attendee[];
}): Promise<Meeting> {
  const { data, error } = await supabase
    .from('meetings')
    .insert({
      user_id: params.userId,
      title: params.title,
      duration_seconds: params.durationSeconds,
      audio_url: params.audioUrl,
      status: 'pending' as MeetingStatus,
      push_token: params.pushToken,
      attendees: params.attendees ?? [],
    })
    .select()
    .single();

  if (error) throw error;
  return data as Meeting;
}

export async function getMeetings(userId: string): Promise<Meeting[]> {
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Meeting[];
}

export async function getMeeting(id: string): Promise<Meeting | null> {
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return data as Meeting;
}

export async function updateSpeakers(meetingId: string, speakers: Speaker[]) {
  const { error } = await supabase
    .from('meetings')
    .update({ speakers })
    .eq('id', meetingId);
  if (error) throw error;
}

const BROADCAST_TOPIC = 'meeting-updates';

// ─── Singleton channel pattern ─────────────────────────────────────────
// Supabase không cho add callback sau khi channel.subscribe() — và backend
// broadcast cố định vào topic 'meeting-updates' nên client KHÔNG được tạo
// nhiều channel với cùng topic. Giải pháp: 1 channel global, nhiều listener
// đăng ký qua dispatcher.
type UpdateListener = (payload: { meeting_id: string } & Partial<Meeting>) => void;
type InsertListener = (meeting: Meeting) => void;

const updateListeners = new Set<UpdateListener>();
const insertListenersByUser = new Map<string, Set<InsertListener>>();

let sharedChannel: ReturnType<typeof supabase.channel> | null = null;
let currentUserId: string | null = null;

function ensureChannel(userId: string) {
  // Re-create channel khi đổi user (để filter postgres_changes đúng)
  if (sharedChannel && currentUserId === userId) return sharedChannel;
  if (sharedChannel) {
    sharedChannel.unsubscribe();
    sharedChannel = null;
  }
  currentUserId = userId;
  sharedChannel = supabase
    .channel(BROADCAST_TOPIC)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'meetings', filter: `user_id=eq.${userId}` },
      (payload) => {
        const meeting = payload.new as Meeting;
        insertListenersByUser.get(userId)?.forEach((cb) => cb(meeting));
      }
    )
    .on('broadcast', { event: 'meeting_update' }, ({ payload }) => {
      const data = payload as { meeting_id: string } & Partial<Meeting>;
      updateListeners.forEach((cb) => cb(data));
    })
    .subscribe((status) => console.log('[Realtime meeting-updates] status:', status));
  return sharedChannel;
}

export function ensureRealtimeChannel(userId: string) {
  ensureChannel(userId);
}

export function subscribeMeetingStatus(
  meetingId: string,
  onUpdate: (status: MeetingStatus, meeting: Partial<Meeting>) => void
) {
  const listener: UpdateListener = (data) => {
    if (data.meeting_id !== meetingId) return;
    onUpdate(data.status as MeetingStatus, data);
  };
  updateListeners.add(listener);
  // Match shape của old API (return object có .unsubscribe())
  return {
    unsubscribe: () => {
      updateListeners.delete(listener);
    },
  };
}

export function subscribeMeetingsList(
  userId: string,
  onInsert: (meeting: Meeting) => void,
  onUpdate: (meeting: Partial<Meeting> & { id: string }) => void
) {
  ensureChannel(userId);
  let bucket = insertListenersByUser.get(userId);
  if (!bucket) {
    bucket = new Set();
    insertListenersByUser.set(userId, bucket);
  }
  bucket.add(onInsert);

  const updateListener: UpdateListener = (data) => {
    const { meeting_id, ...rest } = data;
    onUpdate({ id: meeting_id, ...rest });
  };
  updateListeners.add(updateListener);

  return {
    unsubscribe: () => {
      bucket?.delete(onInsert);
      updateListeners.delete(updateListener);
    },
  };
}
