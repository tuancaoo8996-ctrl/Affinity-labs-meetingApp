// ─── Recording State Machine ───────────────────────────────────────────────

export type RecordingStatus =
  | 'IDLE'
  | 'RECORDING'
  | 'PAUSED'
  | 'STOPPED'
  | 'UPLOADING'
  | 'PROCESSING'
  | 'DONE'
  | 'ERROR'
  | 'RECOVERING';

// ─── Meeting ───────────────────────────────────────────────────────────────

export type MeetingStatus = 'pending' | 'processing' | 'done' | 'error';

export interface Speaker {
  id: string;
  label: string;        // "Speaker 1", "Speaker 2"
  display_name: string; // user-editable
}

export interface TranscriptSegment {
  speaker: string;      // matches Speaker.label
  text: string;
  start_time: number | null;
}

export interface ActionItem {
  assignee: string;     // "@Name" or "unassigned"
  task: string;
  due: string;
}

export interface MeetingSummary {
  key_decisions: string[];
  action_items: ActionItem[];
  next_steps: string[];
}

export interface Meeting {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  duration_seconds: number;
  audio_url: string | null;
  status: MeetingStatus;
  transcript: TranscriptSegment[] | null;
  summary: MeetingSummary | null;
  speakers: Speaker[] | null;
  push_token: string | null;
  attendees: Attendee[] | null;
}

// ─── Attendee (pre-recording input) ────────────────────────────────────────

export interface Attendee {
  id: string;
  name: string;
}

// ─── API ───────────────────────────────────────────────────────────────────

export interface ProcessMeetingRequest {
  meeting_id: string;
  audio_url: string;
  push_token: string | null;
}
