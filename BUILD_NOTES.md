# Build Notes — Meeting Notes App

Ghi lại các vấn đề gặp phải trong quá trình build, và cách fix.

---

## Issue 1: MMKV `_crc32` linker error

**Thời điểm:** Session 4 — rebuild sau khi thêm MMKV 3.2.0

**Lỗi:**
```
❌ Undefined symbols for architecture arm64
   Symbol: _crc32
   Referenced from: MMKV::checkFileCRCValid(...) in libreact-native-mmkv.a
❌ ld: symbol(s) not found for architecture arm64
⚠️ ld: Could not find or use auto-linked framework 'CoreAudioTypes'
⚠️ ld: Could not find or use auto-linked framework 'UIUtilities'
```

**Root cause:** MMKV 3.x dùng C++ static library cần link `libz` thủ công (chứa `crc32`). Xcode không tự link.

**Fix sai (đã thử):** Thêm `-lz` vào Podfile `post_install` và xcconfig thủ công — bị overwrite sau mỗi `pod install`.

**Fix đúng:** Upgrade MMKV từ `3.2.0` → `4.0.0` (dùng NitroModules, không có vấn đề này).
```bash
npm install react-native-mmkv@4.0.0 --save
cd ios && pod install
npx expo run:ios --device "iPhone"
```

---

## Issue 2: MMKV runtime crash — `Cannot read property 'prototype' of undefined`

**Thời điểm:** Sau khi build thành công với MMKV 4.0.0, app crash khi mở

**Lỗi:**
```
Uncaught Error: Cannot read property 'prototype' of undefined
Source: storage.ts (3:32)
  export const storage = new MMKV({ id: 'meeting-notes' });
```

**Root cause:** MMKV v4 thay đổi API hoàn toàn — không còn `new MMKV()` nữa, thay bằng `createMMKV()`.

**Fix:**
```ts
// ❌ MMKV v3 (cũ)
import { MMKV } from 'react-native-mmkv';
export const storage = new MMKV({ id: 'meeting-notes' });

// ✅ MMKV v4 (mới)
import { createMMKV } from 'react-native-mmkv';
export const storage = createMMKV({ id: 'meeting-notes' });
```

File: `src/services/storage.ts`

**Lưu ý thêm:** MMKV v4 cần `react-native-nitro-modules` là peer dep. Nếu bị phantom dep (có trong node_modules nhưng không có trong package.json), install explicit:
```bash
npm install react-native-nitro-modules@0.35.6 --save
```

---

## Checklist khi thêm native package mới

1. `npm install <package> --save`
2. `cd ios && pod install`
3. `npx expo run:ios --device "iPhone"` (bắt buộc rebuild native)
4. Không cần rebuild nếu chỉ thay đổi JS/TS

---

## Issue 3: Audio upload trả empty blob trên iOS

**Thời điểm:** Session 4 — pipeline test end-to-end

**Triệu chứng:** `fetch(uri)` trả `Blob` size=0 → upload Supabase storage thành công nhưng file rỗng → Whisper fail vì empty audio.

**Root cause:** `fetch(file://...)` trên iOS không đọc được local file path đúng cách qua React Native — trả empty blob.

**Fix:** Dùng `expo-file-system/legacy` đọc file thành base64 → convert sang `ArrayBuffer` qua `base64-arraybuffer`:
```ts
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';

const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
const arrayBuffer = decode(base64);
await supabase.storage.from('audio-recordings').upload(path, arrayBuffer, {
  contentType: 'audio/m4a',
});
```

File: `src/services/uploadService.ts`

---

## Issue 4: Supabase Realtime UPDATE không fire (postgres_changes)

**Thời điểm:** Session 4-5 — sau khi pipeline xong

**Triệu chứng:** Backend update `meetings.status='done'` thành công, frontend subscribe `postgres_changes` UPDATE nhưng KHÔNG nhận event. Phải polling 4s mới thấy.

**Root cause:** Supabase RLS với anon role không nhận được postgres_changes UPDATE events (limitation đã biết). Cần `REPLICA IDENTITY FULL` + enable publication, vẫn không work với anon.

**Fix:** Đổi pattern sang **Backend Broadcast** (không dùng postgres_changes):
- Backend: gọi `POST /realtime/v1/api/broadcast` sau mỗi `update_status()` (service role)
- Mobile: subscribe `broadcast` event `meeting_update` trên channel `meeting-updates`
- Trade-off: ít "pure" hơn (cần backend chủ động push), nhưng work reliable

Files: `backend/routers/meetings.py` (`broadcast_meeting_update()`), `mobile/src/services/meetingService.ts`
Memory: [realtime_broadcast_vs_trigger.md](../../.claude/projects/-Users-mac-Coding/memory/realtime_broadcast_vs_trigger.md)

---

## Issue 5: GPT-4o diarize trả single-segment object thay vì array

**Thời điểm:** Session 8 — pipeline chạy nhưng meeting detail trống

**Triệu chứng:** Whisper transcribe OK, status=done nhưng `transcript: []`, `speakers: []`, summary rỗng. UI không render section nào.

**Root cause:** Prompt yêu cầu "JSON array" nhưng `response_format={"type": "json_object"}` ép GPT-4o phải trả về object. Với input 1 speaker, GPT trả flat object: `{"speaker": "Speaker 1", "text": "...", "start_time": null}` — KHÔNG wrap thành array. Code check `isinstance(parsed, list)` → false → return `[]`.

**Fix:**
1. Đổi prompt yêu cầu format `{"segments": [...]}` rõ ràng
2. Parser fallback wrap single-object: nếu có keys `speaker` + `text` → `[parsed]`

File: `backend/services/diarize.py`

---

## Issue 6: Backend BackgroundTasks "chết im lặng"

**Thời điểm:** Session 8 — debug pipeline

**Triệu chứng:** Backend log chỉ có `POST /process-meeting 202 Accepted`, KHÔNG có log Whisper/GPT/FCM nào → tưởng background task crash.

**Root cause thật:** `print()` trong Python bị buffer khi chạy qua uvicorn `--reload`. Background task CHẠY ĐÚNG nhưng output không flush ra log file kịp.

**Fix:** Thêm `flush=True` vào tất cả `print()` quan trọng:
```python
print(f"[fcm] sent meeting={meeting_id} message_id={response}", flush=True)
```

**Debug technique:** Khi nghi background task chết, gọi `run_pipeline()` trực tiếp qua `asyncio.run()` trong Python script — nếu OK thì biết bug ở chỗ khác (buffer/race), nếu fail thì có traceback rõ ràng.

---

## Issue 7: FCM push token NULL trong DB cho meeting cũ

**Thời điểm:** Session 8

**Triệu chứng:** Meeting mới có `push_token` set, meeting cũ `push_token: null`.

**Root cause:** FCM token resolve **async** sau khi app start (Firebase init → APNs register → FCM token). Nếu user record ngay sau khi mở app → token chưa rehydrate vào Zustand store → record screen đọc `null`.

**Fix:** Dùng Zustand store `pushTokenStore.ts` để share FCM token giữa `useNotifications` hook và record screen. Token được set khi `messaging().getToken()` resolve, các consumer subscribe sẽ re-render. Race condition đã tự fix sau lần đầu — token persist qua sessions.

Files: `src/stores/pushTokenStore.ts`, `src/hooks/useNotifications.ts`

---

## Issue 8: iOS foreground không hiện banner notification ⚠️ CRITICAL

**Thời điểm:** Session 8 — sau khi FCM end-to-end work

**Triệu chứng:** App foreground, FCM message đến, `messaging().onMessage` fire, `Notifications.scheduleNotificationAsync` trả id thành công, **nhưng KHÔNG có banner hiện**. Background/killed thì work bình thường.

**Đã thử (đều FAIL):**
- Set `setNotificationHandler({ shouldShowBanner: true, shouldShowList: true, shouldShowAlert: true, ... })` — handler được gọi đúng (xác nhận qua log) nhưng iOS không show banner
- Bỏ `shouldShowAlert` deprecated
- Thêm `interruptionLevel: 'active'`
- Thêm `allowAlert: true` vào `requestPermissionsAsync`
- Permission iPhone OK đầy đủ (Cho phép thông báo, Banners, Sounds, Badges đều ON)
- APNs entitlement + UIBackgroundModes có `remote-notification` đầy đủ
- FCM token VALID (dry-run OK), Firebase trả `message_id` thành công

**Root cause:** **Regression bug trong expo-notifications ~0.32.x** (Expo SDK 54). `scheduleNotificationAsync` với `trigger: null` không show system banner foreground trên iOS New Architecture. Lift-fe-mobile dùng `expo-notifications ~0.55` (SDK 55) thì work bình thường với cùng code pattern.

**Fix:** Dùng **custom in-app toast** thay system banner cho foreground. Background/killed vẫn dùng FCM system banner native (work OK).

```ts
// useNotifications.ts
import Toast from 'react-native-toast-message';

messaging().onMessage(async (remoteMessage) => {
  const meetingId = remoteMessage?.data?.meetingId as string | undefined;
  Toast.show({
    type: 'success',
    text1: remoteMessage.notification?.title ?? 'Meeting ready',
    text2: remoteMessage.notification?.body ?? '',
    visibilityTime: 4000,
    onPress: () => {
      Toast.hide();
      if (meetingId) router.push(`/meeting/${meetingId}` as never);
    },
  });
});
```

Files: `src/hooks/useNotifications.ts`, `src/components/AppToast.tsx` (custom UI dark theme)

**Note:** Dùng in-app toast là **best practice** cho foreground (UX matching Slack/Discord/Notion) — system banner foreground vốn xấu và dễ bị bỏ qua. Nên giữ pattern này kể cả khi expo-notifications fix bug.

---

## Issue 9: lightningcss bị bump khi `npm install`

**Thời điểm:** Mỗi lần install package mới với `--legacy-peer-deps`

**Triệu chứng:** App build fail / metro fail vì `react-native-css@3.0.3` không tương thích `lightningcss@1.30.2+`.

**Fix:** Sau MỖI lần `npm install ... --legacy-peer-deps`, pin lại:
```bash
npm install lightningcss@1.30.1 lightningcss-darwin-arm64@1.30.1 --legacy-peer-deps
```

Pinned versions phải giữ:
- `react-native-css@3.0.3`
- `lightningcss@1.30.1`
- `lightningcss-darwin-arm64@1.30.1`

---

## Issue 10: Stuck "Processing with AI..." sau khi pipeline xong (cùng session)

**Thời điểm:** Session 9 — sau khi notification flow OK

**Triệu chứng:** Record → Stop & Process → đi sang tab Meetings → backend xử lý xong → quay lại tab **Record** thì vẫn hiện "Processing with AI..." đến khi user nhấn nút "Reset Recording State" trong Settings.

**Root cause:** Recording store set `status: 'PROCESSING'` lúc gọi backend, không có cơ chế tự reset khi server xong. Broadcast `meeting_update` chỉ được Meetings tab handle (cập nhật list), record store không biết.

**Fix triệt để:** Tạo `useRecordingLifecycle()` hook chạy ở root layout. Hook này subscribe broadcast cho `activeMeetingId` khi state là `UPLOADING/PROCESSING/RECOVERING`, khi server `done`/`error` → tự `reset()` store.

Cộng thêm logic recovery khi app bị kill:
- `RECORDING/PAUSED` → `ERROR` (audio data lost)
- `UPLOADING/PROCESSING` → `RECOVERING` → query server reconcile (`done` → reset+toast, `processing` → resume + subscribe)

Files: `src/hooks/useRecordingRecovery.ts` (export `useRecordingLifecycle`), `src/stores/recordingStore.ts` (`onRehydrateStorage` mới)

**Note:** Settings có nút "Reset Recording State" giữ làm escape hatch nhưng thực chất user không cần dùng nữa.

---

## Issue 11: Supabase Realtime "cannot add postgres_changes callbacks after subscribe()"

**Thời điểm:** Session 9 — sau khi thêm `useRecordingLifecycle`

**Triệu chứng:** Record xong app crash với error:
```
[Error: cannot add `postgres_changes` callbacks for realtime:meeting-updates after `subscribe()`.]
```

**Root cause:** Cả `subscribeMeetingsList` (Meetings tab) và `subscribeMeetingStatus` (lifecycle hook) đều tạo channel cùng tên `meeting-updates`. Supabase Realtime không cho add callback sau khi channel.subscribe() đã gọi → 1 trong 2 sẽ fail.

**Tried (FAIL):** Đặt channel name khác cho mỗi subscriber. Backend broadcast cố định vào topic `meeting-updates` → client subscribe channel khác topic không nhận được message.

**Fix đúng — Singleton channel + dispatcher pattern:**
- 1 channel duy nhất `meeting-updates` cho cả app
- Module-level state (`Set` listeners + `Map` insertListenersByUser)
- `ensureChannel(userId)` lazy-init channel, idempotent
- Channel callbacks dispatch event ra cho tất cả listeners
- Mỗi `subscribe*` trả `{ unsubscribe }` để remove listener (không tear down channel)
- Export thêm `ensureRealtimeChannel(userId)` để lifecycle hook ensure channel ready trước khi subscribe

File: `src/services/meetingService.ts`

**Lesson:** Supabase Realtime channel name PHẢI khớp với backend broadcast topic. Không thể tách bằng channel name, phải tách bằng app-level dispatcher.

---

## Versions hiện tại (stable)

| Package | Version | Ghi chú |
|---------|---------|---------|
| Expo SDK | 54 | |
| React Native | 0.76.x | New Architecture ON |
| react-native-mmkv | 4.0.0 | Dùng `createMMKV()`, không phải `new MMKV()` |
| react-native-nitro-modules | 0.35.6 | Peer dep của MMKV v4, install explicit |
| @gorhom/bottom-sheet | latest | Cần react-native-gesture-handler |
| expo-av | latest | Recording + playback |
| @react-native-firebase/app | 24.x | FCM |
| @react-native-firebase/messaging | 24.x | FCM, dùng `forceStaticLinking` qua expo-build-properties |
| expo-notifications | 0.32.17 | ⚠️ Foreground banner bug iOS — dùng Toast thay |
| react-native-toast-message | 2.3.3 | In-app toast cho foreground notification |
| firebase-admin (backend) | 7.4.0 | Pin httpx<0.28 |
