from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache

_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    openai_api_key: str = ""
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = "245byKg3uV4vDjJ8fSV8"
    supabase_url: str = ""
    supabase_key: str = ""

    # New provider keys (all optional — system picks whichever are configured)
    groq_api_key: str = ""
    openrouter_api_key: str = ""
    gemini_api_key: str = ""

    model_config = {"env_file": str(_ENV_FILE), "extra": "ignore"}


@lru_cache()
def get_settings() -> Settings:
    return Settings()
