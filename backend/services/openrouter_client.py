"""
OpenRouter client — OpenAI-compatible gateway to 100+ models.
Sign up: https://openrouter.ai/settings/keys
"""
import os
from openai import OpenAI

_client: OpenAI | None = None


def get_openrouter() -> OpenAI:
    global _client
    if _client is None:
        api_key = os.getenv("OPENROUTER_API_KEY", "")
        if not api_key:
            raise RuntimeError("OPENROUTER_API_KEY is not set in .env")
        _client = OpenAI(api_key=api_key, base_url="https://openrouter.ai/api/v1")
    return _client


def chat_completion(model: str, messages: list[dict], *, temperature: float = 0.7, max_tokens: int = 512) -> str:
    client = get_openrouter()
    resp = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        extra_headers={
            "HTTP-Referer": "http://localhost:5173",
            "X-Title": "AI Interview Agent",
        },
    )
    return resp.choices[0].message.content or ""

