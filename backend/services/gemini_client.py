import os
from google import genai
from google.genai import types

# Primary model — fallback list tried in order if the primary is rate-limited or unavailable
GEMINI_MODEL = "gemini-2.5-flash-lite"
_FALLBACK_MODELS = [
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-3.1-flash-lite-preview",
    "gemini-3-flash-preview",
]

_client = None


def get_client():
    global _client
    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY", "")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not set in .env")
        _client = genai.Client(api_key=api_key)
    return _client


def _generate_with_fallback(contents, config=None, models=None):
    """Try each model in fallback list until one succeeds."""
    client = get_client()
    last_err = None
    for model in (models or _FALLBACK_MODELS):
        try:
            kwargs = {"model": model, "contents": contents}
            if config:
                kwargs["config"] = config
            return client.models.generate_content(**kwargs)
        except Exception as e:
            msg = str(e)
            # Keep trying on rate-limit or unavailable; raise immediately on auth errors
            if "401" in msg or "403" in msg or "400" in msg:
                raise
            last_err = e
            continue
    raise last_err


def chat(system_instruction, history, user_message, model: str | None = None):
    contents = []
    for msg in history:
        role = "model" if msg["role"] == "assistant" else "user"
        contents.append(types.Content(role=role, parts=[types.Part(text=msg["content"])]))
    while contents and contents[0].role == "model":
        contents.pop(0)
    contents.append(types.Content(role="user", parts=[types.Part(text=user_message)]))
    config = types.GenerateContentConfig(system_instruction=system_instruction)
    models = [model] if model else None
    response = _generate_with_fallback(contents, config, models)
    return response.text.strip()


def chat_from_messages(messages: list[dict], model: str) -> str:
    """
    Convert OpenAI-format messages into Gemini format and call the given model.
    Used by llm_router for both Gemini and Gemma model IDs.
    """
    system = "\n".join(m["content"] for m in messages if m["role"] == "system")
    non_system = [m for m in messages if m["role"] != "system"]
    if not non_system:
        raise ValueError("No user/assistant messages to send")
    history = non_system[:-1]
    user_msg = non_system[-1]["content"]
    return chat(system, history, user_msg, model=model)


def generate(prompt):
    response = _generate_with_fallback(prompt)
    return response.text.strip()


def generate_with_parts(parts: list):
    """For multimodal inputs (PDF, audio inline data + text)."""
    response = _generate_with_fallback(parts)
    return response.text.strip()
