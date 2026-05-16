-- ─────────────────────────────────────────────────────────────────────────────
-- Row-Level Security for meetings + audio-recordings bucket.
--
-- Auth model: Supabase Anonymous Sign-In.
--   • Each device gets a persistent auth.uid() on first launch.
--   • meetings.user_id is set to auth.uid() at insert time (client-side).
--   • Backend uses SERVICE_ROLE key → bypasses RLS to update pipeline status.
--
-- Storage path convention: {auth.uid()}/{meeting_id}.m4a
-- ─────────────────────────────────────────────────────────────────────────────

-- ── DESTRUCTIVE: wipe legacy 'demo-user' rows before changing column type ──
-- Pre-RLS rows used user_id='demo-user' (text). They cannot belong to any
-- authenticated user under the new model, so drop them.
delete from public.meetings;

-- Switch user_id from text → uuid so it matches auth.uid() type.
alter table public.meetings
  alter column user_id type uuid using user_id::uuid;

-- Enable RLS
alter table public.meetings enable row level security;
alter table public.meetings force row level security;

-- Drop policies if they exist (idempotent re-run)
drop policy if exists "meetings_select_own"  on public.meetings;
drop policy if exists "meetings_insert_own"  on public.meetings;
drop policy if exists "meetings_update_own"  on public.meetings;
drop policy if exists "meetings_delete_own"  on public.meetings;

-- Owner can read their own rows (including soft-deleted)
create policy "meetings_select_own"
  on public.meetings
  for select
  to authenticated
  using (user_id = auth.uid());

-- Owner can insert rows for themselves only
create policy "meetings_insert_own"
  on public.meetings
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- Owner can update their own rows; user_id is immutable (enforced by WITH CHECK)
create policy "meetings_update_own"
  on public.meetings
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Owner can hard-delete (we use soft-delete in app, but allow for completeness)
create policy "meetings_delete_own"
  on public.meetings
  for delete
  to authenticated
  using (user_id = auth.uid());


-- ─────────────────────────────────────────────────────────────────────────────
-- Storage policies for bucket 'audio-recordings'
-- Path convention: {user_id}/{meeting_id}.m4a
-- storage.foldername(name) returns text[] where [1] is the top-level folder.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "audio_upload_own_folder" on storage.objects;
drop policy if exists "audio_read_own_folder"   on storage.objects;
drop policy if exists "audio_update_own_folder" on storage.objects;
drop policy if exists "audio_delete_own_folder" on storage.objects;

create policy "audio_upload_own_folder"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'audio-recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "audio_read_own_folder"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'audio-recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "audio_update_own_folder"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'audio-recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'audio-recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "audio_delete_own_folder"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'audio-recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
