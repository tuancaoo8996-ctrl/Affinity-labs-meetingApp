import type { TActionItem } from './TActionItem';

export interface TMeetingSummary {
  key_decisions: string[];
  action_items: TActionItem[];
  next_steps: string[];
}
