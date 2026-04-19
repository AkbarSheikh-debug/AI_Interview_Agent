"""
STT router — dispatches audio transcription to Groq Whisper or OpenAI Whisper.
"""
from services.model_catalog import parse_provider, DEFAULT_STT_MODEL


def transcribe(model_id: str | None, audio_bytes: bytes, filename: str = "audio.webm") -> str:
    model_id = model_id or DEFAULT_STT_MODEL
    provider, model_name = parse_provider(model_id)

    if provider == "groq":
        from services import groq_client
        return groq_client.transcribe_audio(model_name, audio_bytes, filename)

    if provider == "openai":
        from services.openai_client import get_openai
        client = get_openai()
        resp = client.audio.transcriptions.create(
            model=model_name,
            file=(filename, audio_bytes),
            response_format="text",
        )
        return resp.strip() if isinstance(resp, str) else resp.text.strip()

    raise ValueError(f"Unknown STT provider: {provider}")
