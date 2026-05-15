import json
from openai import AsyncOpenAI

client = AsyncOpenAI()

SUMMARY_PROMPT = """You are a meeting summarizer.
Analyze this meeting transcript and return a JSON object with exactly these keys:
{{
  "key_decisions": ["decision 1", "decision 2"],
  "action_items": [
    {{ "assignee": "@Name or unassigned", "task": "task description", "due": "timeframe or empty string" }}
  ],
  "next_steps": ["step 1", "step 2"]
}}
Be concise. Extract real decisions and actions only. Return ONLY valid JSON.

Transcript:
{transcript}"""

async def summarize_transcript(raw_transcript: str) -> dict:
    """Use GPT-4o to extract key decisions, action items, next steps."""
    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "user",
                "content": SUMMARY_PROMPT.format(transcript=raw_transcript),
            }
        ],
        temperature=0.2,
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content or "{}"
    parsed = json.loads(content)

    return {
        "key_decisions": parsed.get("key_decisions", []),
        "action_items": parsed.get("action_items", []),
        "next_steps": parsed.get("next_steps", []),
    }
