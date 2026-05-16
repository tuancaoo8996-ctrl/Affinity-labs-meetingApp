-- ─────────────────────────────────────────────────────────────────────────────
-- Initial schema: meetings table + storage bucket
-- Idempotent. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.meetings (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null,
  title             text not null,
  created_at        timestamptz not null default now(),
  duration_seconds  integer not null default 0,
  audio_url         text,
  status            text not null default 'pending'
                    check (status in ('pending','processing','done','error')),
  transcript        jsonb,
  summary           jsonb,
  speakers          jsonb,
  attendees         jsonb default '[]'::jsonb,
  push_token        text,
  deleted_at        timestamptz
);

create index if not exists meetings_user_id_idx       on public.meetings (user_id);
create index if not exists meetings_created_at_idx    on public.meetings (created_at desc);
create index if not exists meetings_active_idx        on public.meetings (user_id, created_at desc)
  where deleted_at is null;

-- Realtime: backend uses Broadcast (REST), but keep replica identity full for
-- postgres_changes INSERT events on the meetings-list subscription.
alter table public.meetings replica identity full;

-- Storage bucket (private)
insert into storage.buckets (id, name, public)
values ('audio-recordings', 'audio-recordings', false)
on conflict (id) do nothing;
