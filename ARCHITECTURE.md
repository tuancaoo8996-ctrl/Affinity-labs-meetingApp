# Meeting Notes — Architecture & Code Review

> Tài liệu tổng hợp kiến trúc + module reference + code review cho Affinity Labs assessment.
> Đọc file này khi quay lại project sau một thời gian không nhìn code.

---

## 1. High-level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          MOBILE (Expo)                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Record tab   │  │ Meetings tab │  │ Meeting detail [id]  │  │
│  │ - mic        │  │ - list       │  │ - audio playback     │  │
│  │ - attendees  │  │ - realtime   │  │ - transcript         │  │
│  │ - upload     │  │   updates    │  │ - summary            │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                 │                      │              │
│         └─────────────────┼──────────────────────┘              │
│                           │                                     │
│           ┌───────────────┴────────────────┐                    │
│           │      services / hooks          │                    │
│           │  - useAudioRecorder            │                    │
│           │  - uploadService (retry)       │                    │
│           │  - meetingService (CRUD + RT)  │                    │
│           │  - recordingStore (Zustand)    │                    │
│           │  - storage (MMKV v4)           │                    │
│           └────────┬───────────────────────┘                    │
└────────────────────┼────────────────────────────────────────────┘
                     │
       ┌─────────────┼──────────────┐
       │             │              │
       ▼             ▼              ▼
┌───────────┐  ┌────────────┐  ┌──────────────────────┐
│ Supabase  │  │ Supabase   │  │ FastAPI backend       │
│ Storage   │  │ Postgres   │  │ (Python, port 8000)   │
│ (audio    │  │ (meetings  │  │  + ngrok tunnel       │
│  m4a)     │  │  table)    │  │                       │
└───────────┘  └─────┬──────┘  │  POST /process-meeting│
                     │         │  - run_pipeline():    │
                     │         │    1. Whisper-1       │
                     │         │    2. GPT-4o diarize  │
                     │         │    3. GPT-4o summarize│
                     │         │    4. update DB       │
                     │         │    5. broadcast       │
                     │         │    6. push notify     │
                     ▼         └────────┬──────────────┘
              ┌──────────────────┐      │
              │ Supabase Realtime│◄─────┘
              │ Broadcast        │
              │ topic:           │
              │ meeting-updates  │
              └────────┬─────────┘
                       │
                       ▼ (broadcast events)
                  back to MOBILE
```

---

## 2. End-to-End Recording Flow

```
USER taps record on Record tab
  │
  ▼
AttendeesBottomSheet expand → user types names → tap Start
  │
  ▼
useAudioRecorder.startRecording()
  - configure AVAudioSession (staysActiveInBackground)
  - expo-av Recording.prepareAsync + startAsync
  - timer setInterval 100ms → recordingStore.setDurationMs
  - state: IDLE → RECORDING
  │
  ▼ (user can pause/resume; app can background; phone call interrupts handled)
  │
  ▼
USER taps Stop & Process
  │
  ▼
handleStop():
  1. stopRecording() → returns local file URI (file://...m4a)
  2. setStatus(UPLOADING)
  3. uploadAudioWithRetry(uri, userId, ts) — 3 retries (1s, 2s, 3s backoff)
     - FileSystem.readAsStringAsync(uri, { encoding: 'base64' })
     - decode(base64) → ArrayBuffer
     - supabase.storage.upload(ArrayBuffer)
     - createSignedUrl(24h TTL) → audioUrl
  4. createMeeting() → INSERT into meetings (status='pending')
  5. fetch(BACKEND_URL/process-meeting, { meeting_id, audio_url, attendees })
  6. setStatus(PROCESSING) → router.push('/meetings')
  │
  ▼
Backend (FastAPI, BackgroundTasks):
  - run_pipeline():
    a. UPDATE status='processing' → broadcast meeting_update
    b. transcribe_audio → Whisper-1
    c. diarize_transcript → GPT-4o (JSON mode)
    d. summarize_transcript → GPT-4o (JSON mode)
    e. UPDATE status='done' + transcript + summary + speakers
       → broadcast meeting_update
    f. send_push_notification (if push_token)
  │
  ▼
MOBILE Supabase Realtime listener:
  - meetingService.subscribeMeetingsList → on('broadcast', 'meeting_update')
  - setMeetings(prev → merged) — UI auto-updates without polling
```

---

## 3. State Machine — Recording

```
            ┌─────────────────────────────────┐
            │                                  │
            ▼                                  │
         ┌─────┐                               │
         │IDLE │◄──────────────────────────────┤
         └──┬──┘                               │
            │ startRecording()                 │
            ▼                                  │
       ┌─────────┐    pause     ┌────────┐    │
       │RECORDING│─────────────►│PAUSED  │    │
       └────┬────┘◄─────────────└────┬───┘    │
            │  resume                 │       │
            │ stopRecording()         │       │
            └──────────┬──────────────┘       │
                       ▼                      │
                   ┌─────────┐                │
                   │UPLOADING│                │
                   └────┬────┘                │
                        │ upload OK           │
                        ▼                     │
                   ┌──────────┐               │
                   │PROCESSING│ (backend)     │
                   └────┬─────┘               │
                        │ realtime broadcast  │
                        ▼                     │
                     ┌────┐                   │
                     │DONE│───── new recording┤
                     └────┘                   │
                                              │
   error at any step → ERROR ─── tap retry ───┘
```

**Crash recovery:** Zustand `persist` middleware lưu state vào MMKV. Khi app crash giữa RECORDING/UPLOADING → mở lại → `onRehydrateStorage` set status thành `ERROR` cho user retry.

---

## 4. Module Reference

### Mobile (`mobile/`)

#### `app/` (Expo Router screens)
| File | Purpose |
|------|---------|
| `app/_layout.tsx` | Root Stack navigator, init notifications, GestureHandlerRootView, dark theme |
| `app/(tabs)/_layout.tsx` | Tab navigator (Record / Meetings / Actions / Settings) |
| `app/(tabs)/index.tsx` | **Record screen** — main flow: attendees sheet → record → upload → POST backend |
| `app/(tabs)/meetings.tsx` | **Meetings list** — FlatList, pull-to-refresh, subscribe realtime broadcast |
| `app/(tabs)/actions.tsx` | (placeholder) — aggregated action items across meetings |
| `app/(tabs)/settings.tsx` | (placeholder) |
| `app/meeting/[id].tsx` | **Meeting detail** — audio playback, transcript với speaker rename, summary, share button |

#### `src/stores/`
| File | Purpose |
|------|---------|
| `recordingStore.ts` | Zustand store + MMKV persist; state machine fields (status, durationMs, audioUri, activeMeetingId, attendees, error); crash recovery via `onRehydrateStorage` |

#### `src/hooks/`
| File | Purpose |
|------|---------|
| `useAudioRecorder.ts` | expo-av wrapper — start/pause/resume/stop, AVAudioSession config, interruption handling (phone call), timer |
| `useNotifications.ts` | Expo push token registration + deep link handler khi tap notification → mở `/meeting/{id}` |

#### `src/services/`
| File | Purpose |
|------|---------|
| `supabase.ts` | Khởi tạo Supabase client, ExpoSecureStore adapter cho session persistence |
| `storage.ts` | MMKV v4 init (`createMMKV`), adapter cho Zustand persist (getItem/setItem/removeItem) |
| `uploadService.ts` | Upload local file → Supabase Storage với exponential backoff (3 retries); tạo signed URL 24h |
| `meetingService.ts` | CRUD meetings + 2 subscribe functions dùng Supabase Broadcast channel `meeting-updates` |

#### `src/components/`
| File | Purpose |
|------|---------|
| `RecordButton.tsx` | Circular animated button, pulse ring (Reanimated), đổi màu/icon theo status |
| `RecordingTimer.tsx` | Hiển thị H:MM:SS, update 100ms từ store |
| `WaveformVisualizer.tsx` | 24 thanh animated, opacity tied to isActive |
| `AttendeesBottomSheet.tsx` | Bottom sheet chip input cho attendees pre-recording |
| `BackdropBottomSheet.tsx` | Reusable backdrop overlay component |
| `MeetingCard.tsx` | List item — title, date, duration, status badge, processing dot animation |
| `PlaybackCard.tsx` | Audio player — expo-av Sound, slider, play/pause; lazy load signed URL |

#### `src/types/index.ts`
Shared types: `Meeting`, `Speaker`, `TranscriptSegment`, `ActionItem`, `Summary`, `Attendee`, `RecordingStatus`, `MeetingStatus`.

---

### Backend (`backend/`)

| File | Purpose |
|------|---------|
| `main.py` | FastAPI app init, CORS middleware, env loading |
| `routers/meetings.py` | `POST /process-meeting` + `GET /health`; orchestrates pipeline; `broadcast_meeting_update()` gọi Supabase Realtime REST API |
| `services/transcribe.py` | Download audio từ signed URL → OpenAI Whisper-1 transcribe |
| `services/diarize.py` | GPT-4o (JSON mode) detect speaker turns từ raw transcript |
| `services/summarize.py` | GPT-4o (JSON mode) extract key_decisions, action_items, next_steps |
| `services/notify.py` | Gửi Expo Push notification qua exp.host API |

---

## 5. Key Design Decisions

### Mobile

| Decision | Lý do |
|----------|-------|
| **MMKV v4 + `createMMKV` API** | Sync KV store backed bằng native mmap, nhanh hơn AsyncStorage; v4 dùng NitroModules, đổi API từ `new MMKV()` → `createMMKV({ id })` |
| **`expo-file-system/legacy` + `base64-arraybuffer` cho upload** | `fetch(uri)` trên iOS trả empty blob với `file://` URI; phải đọc base64 rồi convert ArrayBuffer; Hermes không support Blob from Uint8Array |
| **Supabase Broadcast thay `postgres_changes`** | Anon key không nhận được postgres_changes UPDATE dù đã set RLS + REPLICA IDENTITY FULL; Broadcast với service role từ backend reliable hơn (xem `memory/realtime_broadcast_vs_trigger.md` để biết trade-off vs DB trigger) |
| **Background audio recording** | Custom Expo config plugin `withBackgroundAudio.js` thêm `UIBackgroundModes=['audio']` (iOS) + `FOREGROUND_SERVICE_MICROPHONE` (Android) — meeting không bị cut khi user khóa máy |
| **`react-native` Share API thay `expo-clipboard`** | Share mở OS-level menu (Messages, Email, Notes), discoverable hơn; không cần thêm native module (expo-clipboard cần rebuild iOS) |
| **Zustand + MMKV persist** | State machine recording cần survive app kill (đang record mà crash → mở lại biết để set ERROR cho retry) |

### Backend

| Decision | Lý do |
|----------|-------|
| **FastAPI `BackgroundTasks` thay Celery** | Demo project, không cần infrastructure phức tạp; trade-off: in-flight tasks mất khi crash server, không retry — OK cho assessment |
| **Backend broadcast qua REST API** | Server biết chính xác khi nào pipeline xong → tự broadcast; đơn giản hơn DB trigger + pg_notify pattern (xem memory note) |
| **GPT-4o cho diarize thay built-in Whisper diarization** | Whisper diarization complex hơn; GPT-4o JSON mode cho output structured + speaker labels mặc dù không có timestamps thực |
| **Service role key cho broadcast** | Broadcast REST API yêu cầu auth, anon không có quyền; service key trong `.env` (đảm bảo `.gitignore` đúng) |

---

## 6. Known Issues / Tech Debt

### Blockers (cần fix trước khi submit)
- **`useNotifications.ts:20-21`** — TypeScript compile errors (`Notifications.EventSubscription` API đổi, gọi `.remove()` không argument)
- **Fire-and-forget backend POST** ([app/(tabs)/index.tsx:88-97](mobile/app/(tabs)/index.tsx)) — không catch error; nếu backend down user tưởng upload OK
- **Hardcoded `ANON_USER_ID = 'demo-user'`** — block multi-user testing

### High priority
- **`useAudioRecorder.ts:119-123`** — Timer interval không cleanup khi component unmount/re-run → memory leak
- **`PlaybackCard`** — Cleanup chỉ unload khi unmount; nếu audio URL đổi mid-playback, sound cũ vẫn chạy background
- **Backend `supabase-py` sync calls trong async context** ([backend/routers/meetings.py:70,108,125](backend/routers/meetings.py)) — block event loop; ảnh hưởng concurrent requests
- **Backend BackgroundTask exception swallowed** — pipeline fail không có structured log, hard to debug production
- **Broadcast channel không filter theo userId** — multi-user thật sẽ leak update giữa users

### Medium
- **CORS `allow_origins=["*"]`** — production cần whitelist
- **`uploadService.ts:21`** — `'base64' as any` bypass type
- **Accessibility** — toàn bộ app thiếu `accessibilityLabel`, `accessibilityRole`, `accessibilityHint`
- **`attendeesRef.current` không reset on error** — attendees rơi sang recording sau
- **HTTPx client tạo mới mỗi request** trong backend — nên reuse module-level client với connection pool

### Low
- **`Date.now().toString()` cho attendee id** — collision risk nếu 2 attendees add cùng millisecond
- **Hardcoded audio codec** ([useAudioRecorder.ts:10-20](mobile/src/hooks/useAudioRecorder.ts)) — 128kbps mono 44.1kHz; OK nhưng nên config
- **Hardcoded `BUCKET = 'audio-recordings'`** trong uploadService
- **Transcript size unbounded** — backend không limit input token, có thể hit GPT-4o token limit silently

---

## 7. Commands Quick Reference

```bash
# Backend
cd /Users/mac/Coding/Affinity-labs/meeting-notes/backend
source venv/bin/activate
python3 -m uvicorn main:app --reload --port 8000

# ngrok tunnel (URL hiện tại trong mobile/.env)
ngrok http 8000

# Mobile (JS-only changes)
cd /Users/mac/Coding/Affinity-labs/meeting-notes/mobile
npx expo start --clear

# Mobile (native package changes — cần rebuild)
npx expo run:ios --device "iPhone"

# Type check
cd mobile && npx tsc --noEmit

# Backend log
cat /tmp/backend.log | tail -20
```

---

## 8. Environment Variables

### Mobile (`mobile/.env`)
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_BACKEND_URL` — ngrok URL hiện tại: `https://quotation-olive-closure.ngrok-free.dev`

### Backend (`backend/.env`)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — dùng cho cả DB write + Realtime Broadcast
- `OPENAI_API_KEY` — personal key, $5 credit

---

_Last updated: 2026-05-15 session 5 (Realtime Backend Broadcast pattern + code review)_
