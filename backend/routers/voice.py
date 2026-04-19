import io
import os
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
from services.stt_router import transcribe as stt_transcribe
from services.model_catalog import DEFAULT_STT_MODEL
from config import get_settings

router = APIRouter()


def _is_demo_mode() -> bool:
    return os.getenv("DEMO_MODE", "false").lower() == "true"

ANXIETY_WPM_THRESHOLD = 195
ANXIETY_DISFLUENCY_KEYWORDS = {"um", "uh", "like", "er", "hmm", "erm"}
ANXIETY_DISFLUENCY_THRESHOLD = 3

DEMO_TRANSCRIPTS = [
    "My most significant project was building a production RAG system for legal document search using LangChain and ChromaDB.",
    "RAG works by embedding both the query and documents into a shared vector space, then retrieving the top-k most similar chunks and passing them as context to the language model.",
    "For chunking I used recursive character text splitter with 512 token chunks and 50 token overlap to preserve sentence boundaries.",
    "I used HNSW indexing because it offers O log n search with higher recall than IVFFlat, which was important for our sub-100ms latency SLA.",
    "The bias variance tradeoff means high bias causes underfitting and high variance causes overfitting. The goal is to minimize total generalization error.",
]
_demo_turn = 0


def detect_anxiety(transcript: str, duration_seconds: float) -> bool:
    words = transcript.split()
    if not words:
        return False
    wpm = (len(words) / max(duration_seconds, 1)) * 60
    disfluencies = sum(1 for w in words if w.lower().strip(",.?!") in ANXIETY_DISFLUENCY_KEYWORDS)
    return wpm > ANXIETY_WPM_THRESHOLD or disfluencies >= ANXIETY_DISFLUENCY_THRESHOLD


@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    duration: float = Form(default=0.0),
):
    global _demo_turn

    if _is_demo_mode():
        transcript = DEMO_TRANSCRIPTS[_demo_turn % len(DEMO_TRANSCRIPTS)]
        _demo_turn += 1
        return {"transcript": transcript, "anxious": False, "anxiety_message": None}

    audio_bytes = await file.read()
    if len(audio_bytes) < 500:
        raise HTTPException(status_code=400, detail="Audio too short or empty.")

    filename = file.filename or "audio.webm"
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "webm"
    allowed_exts = {"webm", "ogg", "mp3", "mp4", "wav", "m4a", "flac"}
    if ext not in allowed_exts:
        ext = "webm"

    try:
        transcript = stt_transcribe(DEFAULT_STT_MODEL, audio_bytes, f"audio.{ext}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

    anxious = detect_anxiety(transcript, duration)
    return {
        "transcript": transcript,
        "anxious": anxious,
        "anxiety_message": (
            "Take a moment. There is no rush. When you are ready, continue."
            if anxious else None
        ),
    }


@router.post("/speak")
async def text_to_speech(payload: dict):
    text = payload.get("text", "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="No text provided")

    settings = get_settings()
    import httpx

    tts_body = {
        "text": text,
        "model_id": "eleven_turbo_v2_5",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
            "style": 0.0,
            "use_speaker_boost": True,
        },
    }
    headers = {
        "xi-api-key": settings.elevenlabs_api_key,
        "Content-Type": "application/json",
    }

    voice_ids_to_try = [settings.elevenlabs_voice_id, "pNInz6obpgDQGcFmaJgB"]

    async with httpx.AsyncClient(timeout=30) as http_client:
        for voice_id in voice_ids_to_try:
            resp = await http_client.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream",
                headers=headers,
                json=tts_body,
            )
            if resp.status_code == 200:
                return StreamingResponse(
                    io.BytesIO(resp.content),
                    media_type="audio/mpeg",
                    headers={"Content-Disposition": "inline; filename=speech.mp3"},
                )
            if "payment_required" not in resp.text and "paid_plan" not in resp.text:
                raise HTTPException(status_code=502, detail=resp.text[:200])

    raise HTTPException(status_code=503, detail="elevenlabs_unavailable")
