from __future__ import annotations
import json
from typing import List
from openai import AsyncOpenAI

client = AsyncOpenAI()

DIARIZE_PROMPT = """You are a meeting transcript formatter.
Given this raw transcript, identify distinct speakers and return a JSON object with key "segments" containing an array.
Each segment must have: {{ "speaker": "Speaker 1", "text": "...", "start_time": null }}
Group consecutive sentences by the same speaker into one segment.
If there's only one speaker, use "Speaker 1" for all segments.
Return ONLY valid JSON in this shape: {{ "segments": [ ... ] }}

Transcript:
{transcript}"""

async def diarize_transcript(raw_transcript: str) -> List[dict]:
    """Use GPT-4o to detect speaker turns from raw Whisper transcript."""
    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "user",
                "content": DIARIZE_PROMPT.format(transcript=raw_transcript),
            }
        ],
        temperature=0.1,
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content or "[]"

    parsed = json.loads(content)
    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict):
        for key in ("segments", "transcript", "turns", "speakers"):
            if key in parsed and isinstance(parsed[key], list):
                return parsed[key]
        # GPT may return a single segment as a flat object when there's one speaker
        if "speaker" in parsed and "text" in parsed:
            return [parsed]
    return []
