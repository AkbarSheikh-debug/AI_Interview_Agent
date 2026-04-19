from supabase import create_client, Client
from config import get_settings

_client: Client | None = None


def get_supabase() -> Client:
    global _client
    settings = get_settings()
    if not settings.supabase_url:
        raise RuntimeError("SUPABASE_URL not configured")
    if _client is None:
        _client = create_client(settings.supabase_url, settings.supabase_key)
    return _client
