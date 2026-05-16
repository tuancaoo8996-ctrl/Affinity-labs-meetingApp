# Meeting Notes

> A record-once-and-go meeting capture app. Record audio in the background, upload it, transcribe + diarize + summarize with OpenAI, deliver a push notification with a deep link to the result.

Built for the Affinity Labs Senior React Native assessment.

- **Mobile**: Expo SDK 54 (React Native 0.81, New Architecture), Expo Router, TypeScript strict
- **Backend**: FastAPI (Python), OpenAI Whisper-1 + GPT-4o
- **Data**: Supabase Postgres + Storage + Realtime + Anonymous Auth
- **Push**: Firebase Cloud Messaging (APNs on iOS)

---

## Demo

- **Repo**: https://github.com/tuancaoo8996-ctrl/Affinity-labs-meetingApp
- **Loom walkthrough**: _(link added on submission)_

---

## How to run

### 1. Supabase

Create a new project, then in the SQL editor run the two files in [`supabase/migrations/`](./supabase/migrations) in order:

1. `001_init_schema.sql` — table, indexes, private storage bucket.
2. `002_rls_policies.sql` — **destructive** (wipes existing rows), converts `user_id` to `uuid`, enables RLS, installs policies.

Then in the Supabase dashboard: **Authentication → Providers → Anonymous** → toggle on. See [`supabase/README.md`](./supabase/README.md) for details on the auth + RLS model.

### 2. Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# .env (see backend/.env.example if present)
cp .env.example .env   # or create manually with:
#   SUPABASE_URL=...
#   SUPABASE_SERVICE_ROLE_KEY=...
#   OPENAI_API_KEY=...

python3 -m uvicorn main:app --reload --port 8000
```

For the mobile app to reach the backend over the public internet, expose port 8000 with ngrok (or any tunnel) and use that URL as `EXPO_PUBLIC_BACKEND_URL` in the mobile `.env`:

```bash
ngrok http 8000
```

FCM push requires `backend/firebase-service-account.json` (download from Firebase Console → Project Settings → Service Accounts). It is gitignored — never commit it.

### 3. Mobile

```bash
cd mobile
npm install --legacy-peer-deps    # peer-dep pins around lightningcss / react-native-css

# .env
#   EXPO_PUBLIC_SUPABASE_URL=...
#   EXPO_PUBLIC_SUPABASE_ANON_KEY=...
#   EXPO_PUBLIC_BACKEND_URL=https://<your-ngrok-id>.ngrok-free.dev

# Firebase config files (gitignored — drop yours in or reuse from a working project)
#   mobile/GoogleService-Info.plist
#   mobile/google-services.json

# Native build (required — uses FCM, MMKV, gesture-handler, etc.)
npx expo prebuild --clean
npx expo run:ios --device
```

For a JS-only iteration on top of an existing build: `npx expo start --clear`.

> Background-audio recording, FCM push, and the storage bucket all need a real device build — Expo Go cannot run this app.

---

## Architecture decisions

### 1. Background audio via a custom config plugin

[`plugins/withBackgroundAudio.js`](./mobile/plugins/withBackgroundAudio.js) injects `UIBackgroundModes=['audio']` on iOS and `FOREGROUND_SERVICE_MICROPHONE` (plus the service declaration) on Android. Recording keeps running with the screen locked or the app backgrounded — `useAudioRecorder` configures the iOS `AVAudioSession` with `staysActiveInBackground: true` and handles interruptions (e.g. an incoming phone call pauses the recording, and resumes it on call end).

### 2. Crash recovery with MMKV

`recordingStore` (Zustand + MMKV v4) persists the state machine. If the app is killed mid-`UPLOADING` or mid-`PROCESSING`, the next launch enters a transient `RECOVERING` state, queries the meeting on the server, and either resumes the subscription (if still processing) or shows a toast linking to the finished/failed meeting. No silent stuck state.

### 3. Realtime via Supabase Broadcast (not `postgres_changes`)

The anon role does not reliably receive `postgres_changes` `UPDATE` events even with `REPLICA IDENTITY FULL` enabled, so the backend pushes a `meeting_update` event on a `meeting-updates` Broadcast topic after every status change. The client uses a **singleton channel + dispatcher** pattern — Supabase forbids adding callbacks after `channel.subscribe()`, and the backend always broadcasts on the same topic, so one shared channel multiplexes to many in-process listeners.

### 4. Anonymous Sign-In + true RLS

Every install gets a persistent `auth.uid()` from Supabase Anonymous Sign-In, stored in `expo-secure-store`. RLS policies on `meetings` and the `audio-recordings` bucket pin every row and every object to `auth.uid()` — leaking the anon key would not expose anyone else's data. The FastAPI pipeline uses the service-role key to bypass RLS for status updates. See [`supabase/README.md`](./supabase/README.md).

### 5. Feature-based file structure

```
mobile/src/
  features/
    auth/          (anonymous session, useCurrentUserId)
    recording/     (record screen, audio hook, state machine, lifecycle recovery)
    meetings/      (list, detail, services, realtime singleton)
    notifications/ (FCM token, deep-link handler, toast)
    actions/       (aggregated action items across meetings)
    settings/
  lib/             (supabase, upload, storage — infra, domain-free)
  ui/components/   (design primitives)
  constants/
app/               (Expo Router files — thin 1-line re-exports of feature screens)
```

Types are file-per-type with a `T` prefix (`TMeeting`, `TSpeaker`, …); enums use an `E` prefix (`EMeetingStatus`, `ERecordingStatus`). Every feature folder exports its public API through `index.ts`, so cross-feature imports go through `@/src/features/<x>` and never reach into private paths.

### 6. AI pipeline split into three GPT calls

[`backend/services/`](./backend/services) keeps transcription, diarization, and summarization as separate calls:

1. **Whisper-1** for raw transcription (best-in-class for noisy audio).
2. **GPT-4o (JSON mode)** to diarize the transcript into speaker turns.
3. **GPT-4o (JSON mode)** to extract `key_decisions`, `action_items`, and `next_steps` — not a paragraph summary. Action items roll up across all meetings in the Actions tab.

Steps 2 and 3 could be merged to save a round-trip, but keeping them split keeps each prompt focused and recoverable (a failure in summarization still leaves you with a usable transcript).

### 7. Upload via base64 → `ArrayBuffer`

`fetch(file://…)` on iOS returns an empty blob, and Hermes does not support `Blob` from `Uint8Array`. The upload service reads the file as base64 via `expo-file-system/legacy`, decodes to `ArrayBuffer` with `base64-arraybuffer`, and uploads with exponential backoff (1s / 2s / 3s, 3 attempts).

### 8. Soft delete with optimistic UI

`meetings.deleted_at` is set instead of hard-deleting. The list removes the row optimistically and shows a 5-second "Tap to undo" toast (Gmail pattern). Restore is one API call; the row was never destroyed.

---

## What I'd build next

- **Auth upgrade path** — anonymous sessions can be linked to a real provider (Apple/Google/email) without losing data via `supabase.auth.linkIdentity()`. Adding sign-in would only need a Settings screen, no schema changes.
- **Word-level diarization** — current diarization is GPT-4o reading the full transcript, which loses timestamps. Whisper word-level timestamps + an embedding-based speaker clustering pass would give scrubbable, per-word speaker attribution.
- **Resumable uploads** — `tus-js-client` for chunked, resumable uploads. The current retry policy redoes the whole upload from byte 0.
- **Backend reliability** — move the pipeline off `BackgroundTasks` to a real queue (Celery + Redis, or Supabase Edge Functions + cron) so an instance restart doesn't drop in-flight meetings. Add structured logging + retry-on-failure.
- **Multi-user broadcast filter** — the broadcast topic is global; mobile filters by `meeting_id`. With many concurrent users this leaks updates over the wire. Topic-per-user or RLS-aware Broadcast would scale.
- **Per-meeting access control** — RLS today is per-owner only. Sharing a meeting with another user would need a `meeting_members` join table + a policy that admits `auth.uid() IN (SELECT user_id FROM meeting_members WHERE meeting_id = meetings.id)`.
- **Tests** — the assessment had no test requirement, so I left them out, but `useAudioRecorder`, `uploadService`, and the lifecycle hook are the highest-value targets.
- **Accessibility** — `accessibilityLabel`/`accessibilityRole` on the record button, waveform, and list items; VoiceOver-friendly status announcements during processing.

---

## Project layout

```
meeting-notes/
├── ARCHITECTURE.md       deep technical reference (diagrams, module table)
├── BUILD_NOTES.md        chronological log of build issues and fixes
├── README.md             this file
├── supabase/
│   ├── README.md         auth + RLS notes
│   └── migrations/       SQL: schema + RLS policies
├── backend/              FastAPI service (Whisper + GPT-4o + FCM)
└── mobile/               Expo app (feature-based src/)
```

[`ARCHITECTURE.md`](./ARCHITECTURE.md) goes deeper into module reference, the state machine, and the end-to-end recording flow.
