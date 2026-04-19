"""
Groq client — OpenAI-compatible SDK wrapper.
Handles both LLM (chat + reasoning) and STT (Whisper).
Sign up: https://console.groq.com/keys  (no credit card required)
"""
import os
from openai import OpenAI

_client: OpenAI | None = None


def get_groq() -> OpenAI:
    global _client
    if _client is None:
        api_key = os.getenv("GROQ_API_KEY", "")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY is not set in .env")
        _client = OpenAI(api_key=api_key, base_url="https://api.groq.com/openai/v1")
    return _client


def chat_completion(model: str, messages: list[dict], *, temperature: float = 0.7, max_tokens: int = 512) -> str:
    client = get_groq()
    resp = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return resp.choices[0].message.content or ""



def transcribe_audio(model: str, audio_bytes: bytes, filename: str = "audio.webm") -> str:
    client = get_groq()
    resp = client.audio.transcriptions.create(
        model=model,
        file=(filename, audio_bytes),
        response_format="text",
    )
    return resp.strip() if isinstance(resp, str) else resp.text.strip()
