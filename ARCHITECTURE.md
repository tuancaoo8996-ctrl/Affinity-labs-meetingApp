# Meeting Notes — Architecture Reference

> Technical deep-dive: module map, state machine, end-to-end flow, and design decisions.
> Read alongside README.md and BUILD_NOTES.md.

---

## 1. High-level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        MOBILE (Expo)                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Record tab   │  │ Meetings tab │  │ Meeting detail [id]  │  │
│  │ - mic        │  │ - list       │  │ - audio playback     │  │
│  │ - attendees  │  │ - realtime   │  │ - transcript         │  │
│  │ - upload     │  │   updates    │  │ - summary            │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         └─────────────────┼──────────────────────┘              │
│                           │                                     │
│           ┌───────────────┴────────────────┐                    │
│           │         features / lib         │                    │
│           │  - useAudioRecorder            │                    │
│           │  - uploadService (retry)       │                    │
│           │  - meetingService (CRUD + RT)  │                    │
│           │  - recordingStore (Zustand)    │                    │
│           │  - storage (MMKV v4)           │                    │
│           └────────┬───────────────────────┘                    │
└────────────────────┼────────────────────────────────────────────┘
                     │
       ┌─────────────┼──────────────┐
       ▼             ▼              ▼
┌───────────┐  ┌────────────┐  ┌──────────────────────┐
│ Supabase  │  │ Supabase   │  │ FastAPI backend       │
│ Storage   │  │ Postgres   │  │ (Python, port 8000)   │
│ (audio    │  │ (meetings  │  │  + ngrok tunnel       │
│  .m4a)    │  │  table)    │  │                       │
└───────────┘  └─────┬──────┘  │  POST /process-meeting│
                     │         │  run_pipeline():      │
                     │         │    1. Whisper-1       │
                     │         │    2. GPT-4o diarize  │
                     │         │    3. GPT-4o summarize│
                     │         │    4. UPDATE DB       │
                     │         │    5. broadcast       │
                     │         │    6. FCM push        │
                     ▼         └────────┬──────────────┘
              ┌──────────────────┐      │
              │ Supabase Realtime│◄─────┘
              │ Broadcast        │
              │ topic:           │
              │ meeting-updates  │
              └────────┬─────────┘
                       │  (broadcast events)
                       ▼
                  back to MOBILE
```

---

## 2. End-to-End Recording Flow

```
USER taps Record tab
  │
  ▼
AttendeesBottomSheet slides up → user types names (optional) → tap Start
  │
  ▼
useAudioRecorder.startRecording()
  - configure AVAudioSession (staysActiveInBackground: true)
  - expo-av Recording.prepareAsync + startAsync
  - setInterval 100ms → recordingStore.setDurationMs
  - state: IDLE → RECORDING
  │
  ▼ (user can lock screen, background app, receive phone call — recording continues)
  │
USER taps Stop & Process
  │
  ▼
handleStop():
  1. stopRecording() → local file URI (file://…m4a)
  2. setStatus(UPLOADING)
  3. uploadAudioWithRetry(uri, userId, timestamp)
       - FileSystem.readAsStringAsync(uri, { encoding: 'base64' })
       - decode(base64) → ArrayBuffer           [Hermes/iOS blob workaround]
       - supabase.storage.upload(ArrayBuffer)
       - createSignedUrl(24h TTL) → audioUrl
       - exponential backoff: 1s / 2s / 3s, 3 attempts
  4. createMeeting() → INSERT meetings (status='pending', user_id=auth.uid())
  5. POST /process-meeting { meeting_id, audio_url, push_token, attendees }
  6. setStatus(PROCESSING) → navigate to Meetings tab
  │
  ▼
Backend (FastAPI BackgroundTasks — returns 202 immediately):
  run_pipeline():
    a. UPDATE status='processing' + broadcast meeting_update
    b. transcribe_audio()   → Whisper-1 (downloads from signed URL)
    c. diarize_transcript() → GPT-4o JSON mode (speaker turns)
    d. summarize_transcript() → GPT-4o JSON mode (decisions/actions/next steps)
    e. UPDATE status='done' + transcript + summary + speakers
       + broadcast meeting_update
    f. send_push_notification() via FCM (if push_token provided)
  │
  ▼
MOBILE Supabase Realtime listener:
  - singleton channel 'meeting-updates' (broadcast topic)
  - dispatcher pattern: Set of listeners, all receive every event, filter by meeting_id
  - UI updates live without polling
  │
  ▼ (push notification arrives)
FCM → APNs → device
  - background / killed: tap banner → deep link → /meeting/[id]
  - foreground: react-native-toast-message custom toast → tap → navigate
```

---

## 3. State Machine — Recording

```
            ┌────────────────────────────────┐
            ▼                                │
         ┌──────┐                            │
         │ IDLE │◄───────────────────────────┤
         └──┬───┘                            │
            │ startRecording()               │
            ▼                                │
       ┌───────────┐  pause   ┌────────┐    │
       │ RECORDING │─────────►│ PAUSED │    │
       └─────┬─────┘◄─────────└────────┘    │
             │ resume / stopRecording()      │
             ▼                               │
        ┌──────────┐                         │
        │ UPLOADING│                         │
        └─────┬────┘                         │
              │ upload OK                    │
              ▼                              │
        ┌───────────┐                        │
        │ PROCESSING│  ← backend pipeline    │
        └─────┬─────┘                        │
              │ realtime broadcast: done      │
              ▼                              │
           ┌──────┐                          │
           │ DONE │──── start new recording ─┤
           └──────┘                          │
                                             │
  error at any step → ERROR ── tap retry ───┘

  RECOVERING (transient on app relaunch):
    App killed mid-UPLOADING or mid-PROCESSING
    → onRehydrateStorage detects persisted state
    → sets RECOVERING → queries server for meeting status
    → done/error: reset store + toast with deep link
    → still processing: resume broadcast subscription
```

**Persistence:** `recordingStore` uses Zustand `persist` middleware backed by MMKV v4 (synchronous native KV, mmap). State survives app kill.

---

## 4. Module Reference

### Mobile (`mobile/`)

#### `app/` — Expo Router (thin re-exports, 1 line each)

| File | Routes to |
|------|-----------|
| `app/_layout.tsx` | Root Stack — boots `useAnonAuth`, `useNotifications`, `useRecordingLifecycle`; wraps GestureHandlerRootView + Toast |
| `app/(tabs)/_layout.tsx` | Tab navigator: Record / Meetings / Actions / Settings |
| `app/(tabs)/index.tsx` | → `features/recording/screens/Record` |
| `app/(tabs)/meetings.tsx` | → `features/meetings/screens/MeetingsList` |
| `app/(tabs)/actions.tsx` | → `features/actions/screens/Actions` |
| `app/(tabs)/settings.tsx` | → `features/settings/screens/Settings` |
| `app/meeting/[id].tsx` | → `features/meetings/screens/MeetingDetail` |

#### `src/features/auth/`

| File | Purpose |
|------|---------|
| `hooks/useAnonAuth.ts` | Boots anonymous Supabase session on first launch; restores from SecureStore on subsequent launches; listens `onAuthStateChange` |
| `hooks/useCurrentUserId.ts` | Returns `auth.uid()` from `authStore`; guards return `null` until session is ready |
| `stores/authStore.ts` | Zustand: `userId`, `ready` flag |

#### `src/features/recording/`

| File | Purpose |
|------|---------|
| `screens/Record/Record.tsx` | Main record screen: attendees sheet → record → upload → POST backend |
| `hooks/useAudioRecorder.ts` | expo-av wrapper: start/pause/resume/stop, AVAudioSession config, interruption handling (phone call pause/resume) |
| `hooks/useRecordingLifecycle.ts` | Root-level hook: subscribes broadcast for `activeMeetingId`; auto-resets store when pipeline finishes; drives RECOVERING flow on rehydrate |
| `stores/recordingStore.ts` | Zustand + MMKV persist: state machine (status, durationMs, audioUri, activeMeetingId, attendees, error) |
| `components/RecordButton/` | 5-layer purple sphere + glow breathing animation (Reanimated); adapts icon/color to recording status |
| `components/WaveformVisualizer/` | 28 bars, gradient sine wave animation tied to recording activity |
| `components/RecordingTimer/` | H:MM:SS display, font-weight 200 ultralight, 100ms update interval |
| `components/AttendeesBottomSheet/` | @gorhom/bottom-sheet chip input; passes attendee list to backend |
| `enums/ERecordingStatus.ts` | `IDLE \| RECORDING \| PAUSED \| UPLOADING \| PROCESSING \| DONE \| ERROR \| RECOVERING` |
| `types/TAttendee.ts` | `{ id: string; name: string }` |

#### `src/features/meetings/`

| File | Purpose |
|------|---------|
| `screens/MeetingsList/` | FlatList with `SwipeableMeetingCard`; swipe-left delete + undo toast; pull-to-refresh; realtime broadcast subscription |
| `screens/MeetingDetail/` | Audio playback (PlaybackCard), transcript with speaker rename, summary panel, Share button |
| `services/meetingService.ts` | CRUD meetings; `subscribeMeetingsList` + `subscribeMeetingDetail` via singleton Supabase Broadcast channel + dispatcher pattern |
| `components/MeetingCard/` | Title, date, duration, status badge, processing dot animation, shadow + accent stripe |
| `components/PlaybackCard/` | expo-av Sound lazy-loaded from signed URL; scrub slider; play/pause |
| `components/SwipeableMeetingCard/` | Swipe-left reveals Delete; optimistic remove + 5s undo toast (Gmail pattern); API-fail rollback |
| `enums/EMeetingStatus.ts` | `pending \| processing \| done \| error` |
| `types/` | `TMeeting`, `TSpeaker`, `TTranscriptSegment`, `TActionItem`, `TMeetingSummary`, `TProcessMeetingRequest` |

#### `src/features/notifications/`

| File | Purpose |
|------|---------|
| `hooks/useNotifications.ts` | FCM token registration; `onTokenRefresh`; deep-link handlers for background, killed, and foreground notification states |
| `stores/pushTokenStore.ts` | Zustand: `fcmToken`; shared between `useNotifications` and the Record screen |
| `components/AppToast/` | react-native-toast-message custom config; dark theme; tap navigates to meeting detail |

#### `src/features/actions/`, `src/features/settings/`

Placeholder screens — aggregated action items view and app settings are stubbed for future implementation.

#### `src/lib/`

| Path | Purpose |
|------|---------|
| `lib/supabase/supabase.ts` | Supabase client init; ExpoSecureStore session adapter |
| `lib/upload/uploadService.ts` | Upload local file → Supabase Storage; base64 → ArrayBuffer workaround; exponential backoff (1s/2s/3s, 3 attempts) |
| `lib/storage/storage.ts` | MMKV v4 instance via `createMMKV`; Zustand persist adapter (getItem/setItem/removeItem) |

#### `src/ui/components/`

| Path | Purpose |
|------|---------|
| `BackdropBottomSheet/` | Reusable backdrop overlay for bottom sheets |

---

### Backend (`backend/`)

| File | Purpose |
|------|---------|
| `main.py` | FastAPI app init, CORS middleware, env loading via `python-dotenv` |
| `routers/meetings.py` | `POST /process-meeting` (202) + `GET /health`; orchestrates pipeline via `BackgroundTasks`; `broadcast_meeting_update()` calls Supabase Realtime REST API after each status change |
| `services/transcribe.py` | Downloads audio from signed URL via httpx; transcribes with OpenAI Whisper-1 |
| `services/diarize.py` | GPT-4o JSON mode: detects speaker turns; handles flat-object and nested-key response variants from GPT |
| `services/summarize.py` | GPT-4o JSON mode: extracts `key_decisions`, `action_items` (assignee + task + due), `next_steps` |
| `services/notify.py` | Firebase Admin SDK: lazy-init on first use; sends FCM message with APNs config; graceful fail if token is missing |

---

## 5. Key Design Decisions

### Mobile

| Decision | Rationale |
|----------|-----------|
| **`expo-file-system` base64 → ArrayBuffer for upload** | `fetch(file://…)` returns an empty blob on iOS; Hermes does not support constructing a `Blob` from `Uint8Array`. Reading as base64 then decoding via `base64-arraybuffer` is the only reliable path on the current stack. |
| **Supabase Broadcast instead of `postgres_changes`** | The anon role does not reliably receive `UPDATE` events via `postgres_changes` even with `REPLICA IDENTITY FULL` set. Backend-initiated Broadcast with the service-role key is reliable and keeps the delivery path explicit. |
| **Singleton channel + dispatcher pattern** | Supabase forbids adding callbacks after `channel.subscribe()` is called. The backend always broadcasts on the same topic, so one shared channel with a `Set` of listeners multiplexes all in-process subscribers without re-subscribing. |
| **MMKV v4 + Zustand persist** | Synchronous native KV backed by mmap — faster than AsyncStorage. State survives app kill; `onRehydrateStorage` drives the RECOVERING flow. |
| **Anonymous Sign-In + RLS** | Every install gets a persistent `auth.uid()` stored in SecureStore. RLS policies on `meetings` and `audio-recordings` pin every row and object to `auth.uid()` — leaking the anon key does not expose other users' data. Anonymous sessions can be linked to a real provider later via `supabase.auth.linkIdentity()` with no schema changes. |
| **Custom config plugin for background audio** | `plugins/withBackgroundAudio.js` injects `UIBackgroundModes=['audio']` (iOS) and `FOREGROUND_SERVICE_MICROPHONE` + service declaration (Android) at prebuild time — no manual native edits. |
| **`react-native` Share API** | Opens the OS share sheet (Messages, Mail, Notes); no native rebuild required. `expo-clipboard` needs a native module that was not already in the build. |
| **react-native-toast-message for foreground push** | `expo-notifications` 0.32 (SDK 54) does not reliably show foreground banners on iOS. Toast provides equivalent UX and is already used in the project for other notifications. |

### Backend

| Decision | Rationale |
|----------|-----------|
| **FastAPI `BackgroundTasks`** | Returns 202 immediately; pipeline runs async behind the response. Trade-off: in-flight tasks are lost on server restart with no automatic retry — acceptable for an assessment, flagged as tech debt. |
| **Three separate GPT calls** | Transcription, diarization, and summarization are kept as distinct steps. A failure in summarization still leaves a usable transcript and speaker turns. Each prompt stays focused and is independently debuggable. |
| **Backend-initiated Broadcast** | The server knows exactly when each pipeline step completes and broadcasts at the right moment. Simpler and more reliable than a DB trigger + `pg_notify` approach, which would require a separate listener process. |
| **Service-role key for DB writes + Broadcast** | The pipeline needs to bypass RLS to update any meeting's status regardless of owner. The service-role key is kept server-side only; the mobile client never sees it. |
| **Firebase Admin SDK lazy init** | `notify.py` initialises Firebase on first use, not at import time. If `firebase-service-account.json` is missing, only the push step fails — transcription, DB update, and Broadcast still complete successfully. |

---

## 6. Known Issues / Tech Debt

### Should fix before production

- **Sync Supabase calls in async context** — `supabase-py` DB calls in `run_pipeline` are synchronous and block the event loop. Use `asyncio.to_thread()` or switch to the async Supabase client.
- **`BackgroundTasks` reliability** — tasks are lost on server restart with no retry. Replace with Celery + Redis or Supabase Edge Functions for production.
- **Global Broadcast topic** — `meeting-updates` is shared across all users; mobile filters by `meeting_id` in JS. Under real concurrent load this leaks update payloads over the wire. Use per-user topics or RLS-aware Broadcast.
- **CORS `allow_origins=["*"]`** — acceptable for local dev; production needs an explicit allowlist.
- **Unbounded transcript size** — no token-count guard before GPT-4o calls; a very long recording could silently hit the context limit.

### Minor / low priority

- **`httpx.AsyncClient` created per broadcast call** — should reuse a module-level client with a connection pool.
- **`Date.now()` for attendee IDs** — collision risk if two attendees are added within the same millisecond.
- **`'base64' as any`** cast in `uploadService.ts` — safe at runtime but bypasses type checking.
- **Accessibility** — `accessibilityLabel`, `accessibilityRole`, and `accessibilityHint` are missing throughout; VoiceOver is unsupported.
- **`attendeesRef` not reset on upload error** — attendees carry over into the next recording attempt.

---

## 7. Environment Variables

### Mobile (`mobile/.env`)

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_BACKEND_URL=         # ngrok or other public tunnel URL
```

### Backend (`backend/.env`)

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=       # used for DB writes + Realtime Broadcast
OPENAI_API_KEY=
FIREBASE_SERVICE_ACCOUNT_PATH=   # optional; defaults to ./firebase-service-account.json
```

---

## 8. Commands

```bash
# Backend
cd backend
source venv/bin/activate
python3 -m uvicorn main:app --reload --port 8000

# ngrok tunnel
ngrok http 8000
# → copy HTTPS URL into mobile/.env as EXPO_PUBLIC_BACKEND_URL

# Mobile — JS-only changes (existing native build)
cd mobile && npx expo start --clear

# Mobile — after adding a native package
cd mobile && npx expo run:ios --device

# Type check
cd mobile && npx tsc --noEmit
```

---

_Last updated: 2026-05-16 (feature-based refactor + RLS + Anonymous Auth complete)_
