"""
GET  /api/config/models     — returns LLM + STT catalogs for the dashboard dropdowns.
POST /api/config/selection  — candidate sends their chosen model IDs (persisted per-session on start).
"""
import os
from fastapi import APIRouter
from pydantic import BaseModel
from services.model_catalog import (
    LLM_MODELS, STT_MODELS, DEFAULT_LLM_MODEL, DEFAULT_STT_MODEL
)

router = APIRouter()


def _key_is_set(env_var: str) -> bool:
    return bool(os.getenv(env_var, "").strip())


def _provider_available(provider: str) -> bool:
    """Check whether the API key for a given provider is present."""
    return {
        "groq": _key_is_set("GROQ_API_KEY"),
        "openrouter": _key_is_set("OPENROUTER_API_KEY"),
        "google": _key_is_set("GEMINI_API_KEY"),
        "openai": _key_is_set("OPENAI_API_KEY"),
    }.get(provider, False)


def _enrich(models: list[dict]) -> list[dict]:
    """Attach `available` flag based on which API keys are configured."""
    return [{**m, "available": _provider_available(m["provider"])} for m in models]


@router.get("/models")
def get_models():
    return {
        "llm": _enrich(LLM_MODELS),
        "stt": _enrich(STT_MODELS),
        "defaults": {
            "llm": DEFAULT_LLM_MODEL,
            "stt": DEFAULT_STT_MODEL,
        },
    }


class SelectionRequest(BaseModel):
    llm_model: str | None = None
    stt_model: str | None = None


@router.post("/selection")
def validate_selection(req: SelectionRequest):
    """Validate (used by frontend for optional pre-flight check)."""
    from services.model_catalog import get_llm_model, get_stt_model
    llm = get_llm_model(req.llm_model) if req.llm_model else None
    stt = get_stt_model(req.stt_model) if req.stt_model else None
    return {
        "llm_ok": llm is not None and _provider_available(llm["provider"]) if llm else False,
        "stt_ok": stt is not None and _provider_available(stt["provider"]) if stt else False,
    }
