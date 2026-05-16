import type { EMeetingStatus } from '../enums';
import type { TSpeaker } from './TSpeaker';
import type { TTranscriptSegment } from './TTranscriptSegment';
import type { TMeetingSummary } from './TMeetingSummary';
import type { TAttendee } from '@/src/features/recording/types';

export interface TMeeting {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  duration_seconds: number;
  audio_url: string | null;
  status: EMeetingStatus;
  transcript: TTranscriptSegment[] | null;
  summary: TMeetingSummary | null;
  speakers: TSpeaker[] | null;
  push_token: string | null;
  attendees: TAttendee[] | null;
  deleted_at: string | null;
}
