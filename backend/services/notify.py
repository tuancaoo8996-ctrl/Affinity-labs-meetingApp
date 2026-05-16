import os
from firebase_admin import credentials, initialize_app, messaging, get_app

_initialized = False

def _ensure_initialized() -> None:
    global _initialized
    if _initialized:
        return
    try:
        get_app()
        _initialized = True
        return
    except ValueError:
        pass

    cred_path = os.environ.get(
        "FIREBASE_SERVICE_ACCOUNT_PATH",
        os.path.join(os.path.dirname(__file__), "..", "firebase-service-account.json"),
    )
    cred = credentials.Certificate(cred_path)
    initialize_app(cred)
    _initialized = True


async def send_push_notification(fcm_token: str, meeting_id: str, title: str) -> None:
    """Send FCM push notification when meeting processing is done."""
    if not fcm_token:
        return

    _ensure_initialized()

    message = messaging.Message(
        token=fcm_token,
        notification=messaging.Notification(
            title="Meeting ready ✓",
            body=f'"{title}" has been transcribed and summarized.',
        ),
        data={"meetingId": meeting_id},
        apns=messaging.APNSConfig(
            headers={"apns-push-type": "alert", "apns-priority": "10"},
            payload=messaging.APNSPayload(
                aps=messaging.Aps(sound="default", badge=1),
            ),
        ),
    )

    try:
        response = messaging.send(message)
        print(f"[fcm] sent meeting={meeting_id} message_id={response}", flush=True)
    except Exception as e:
        print(f"[fcm] failed meeting={meeting_id} error={e}", flush=True)
