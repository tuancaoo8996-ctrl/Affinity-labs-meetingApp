from __future__ import annotations
import os
from typing import Any, Optional
import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from supabase import create_client, Client

from services.transcribe import transcribe_audio
from services.diarize import diarize_transcript
from services.summarize import summarize_transcript
from services.notify import send_push_notification

router = APIRouter()

def get_supabase() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


async def broadcast_meeting_update(meeting_id: str, payload: dict[str, Any]) -> None:
    """Push meeting update lên Supabase Realtime Broadcast channel.

    Tránh postgres_changes UPDATE (anon role không nhận được dù RLS đã set).
    Channel name: meeting-updates — mobile subscribe global, filter theo user_id.
    """
    url = f"{os.environ['SUPABASE_URL']}/realtime/v1/api/broadcast"
    service_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                url,
                headers={
                    "apikey": service_key,
                    "Authorization": f"Bearer {service_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "messages": [
                        {
                            "topic": "meeting-updates",
                            "event": "meeting_update",
                            "payload": {"meeting_id": meeting_id, **payload},
                        }
                    ]
                },
            )
    except Exception as e:
        print(f"[broadcast] failed meeting={meeting_id} error={e}")


class Attendee(BaseModel):
    id: str
    name: str


class ProcessMeetingRequest(BaseModel):
    meeting_id: str
    audio_url: str
    push_token: Optional[str] = None
    attendees: Optional[list[Attendee]] = None


async def run_pipeline(payload: ProcessMeetingRequest) -> None:
    supabase = get_supabase()

    async def update_status(status: str, extra: Optional[dict] = None):
        data = {"status": status, **(extra or {})}
        supabase.table("meetings").update(data).eq("id", payload.meeting_id).execute()
        await broadcast_meeting_update(payload.meeting_id, data)

    try:
        await update_status("processing")

        # 1. Transcribe
        raw_transcript = await transcribe_audio(payload.audio_url)

        # 2. Diarize (speaker turns)
        transcript_segments = await diarize_transcript(raw_transcript)

        # 3. Extract unique speakers
        seen = {}
        speakers = []
        for seg in transcript_segments:
            label = seg.get("speaker", "Speaker 1")
            if label not in seen:
                speaker_id = f"spk_{len(speakers)}"
                seen[label] = speaker_id
                speakers.append({
                    "id": speaker_id,
                    "label": label,
                    "display_name": label,
                })

        # 4. Summarize
        summary = await summarize_transcript(raw_transcript)

        # 5. Update DB → done
        await update_status("done", {
            "transcript": transcript_segments,
            "summary": summary,
            "speakers": speakers,
        })

        # 6. Push notification
        if payload.push_token:
            print(f"[pipeline] sending FCM meeting={payload.meeting_id}", flush=True)
            result = supabase.table("meetings").select("title").eq("id", payload.meeting_id).single().execute()
            title = result.data.get("title", "Your meeting") if result.data else "Your meeting"
            await send_push_notification(payload.push_token, payload.meeting_id, title)
        else:
            print(f"[pipeline] no push_token, skip FCM meeting={payload.meeting_id}", flush=True)

    except Exception as e:
        await update_status("error")
        print(f"[pipeline error] meeting={payload.meeting_id} error={e}", flush=True)


@router.post("/process-meeting", status_code=202)
async def process_meeting(
    payload: ProcessMeetingRequest,
    background_tasks: BackgroundTasks,
):
    # Verify meeting exists
    supabase = get_supabase()
    result = supabase.table("meetings").select("id").eq("id", payload.meeting_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Meeting not found")

    print(f"[process-meeting] meeting={payload.meeting_id} push_token={'set' if payload.push_token else 'NULL'} attendees={len(payload.attendees or [])}", flush=True)
    background_tasks.add_task(run_pipeline, payload)
    return {"status": "processing", "meeting_id": payload.meeting_id}


@router.get("/health")
async def health():
    return {"status": "ok"}
