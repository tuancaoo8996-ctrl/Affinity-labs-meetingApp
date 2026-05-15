import httpx
from openai import AsyncOpenAI

client = AsyncOpenAI()

async def transcribe_audio(audio_url: str) -> str:
    """Download audio from signed URL and transcribe with Whisper-1."""
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as http:
        response = await http.get(audio_url)
        response.raise_for_status()
        audio_bytes = response.content
        print(f"[transcribe] content-type={response.headers.get('content-type')} size={len(audio_bytes)} bytes")

    if len(audio_bytes) == 0:
        raise ValueError("Downloaded audio file is empty")

    transcription = await client.audio.transcriptions.create(
        model="whisper-1",
        file=("recording.m4a", audio_bytes, "audio/m4a"),
        response_format="text",
    )
    return transcription
