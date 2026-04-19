"""
Single source of truth for all LLM + STT models the user can choose from.
Exposed to the frontend via GET /api/config/models.
"""

# ── LLM Model Catalog ─────────────────────────────────────────────────────
#
# Model IDs follow the pattern: <provider>/<model-name>
# The first segment is parsed by llm_router to pick the right client.
#
LLM_MODELS = [
    # ── Google (Gemini + Gemma) — free via AI Studio ──────────────────────
    {
        "id": "google/gemma-4-31b-it-thinking",
        "label": "Gemma 4 31B Thinking",
        "provider": "google",
        "free": True,
        "reasoning": True,
        "description": "Google's flagship open-weight reasoning model. Chain-of-thought, 140 languages. GPQA 84.3%.",
        "signup_url": "https://aistudio.google.com/apikey",
    },
    {
        "id": "google/gemini-2.5-pro",
        "label": "Gemini 2.5 Pro",
        "provider": "google",
        "free": True,
        "reasoning": True,
        "description": "Google's premier reasoning model. 1M context. Free tier: 5 RPM, 100 RPD.",
        "signup_url": "https://aistudio.google.com/apikey",
    },
    {
        "id": "google/gemini-2.5-flash",
        "label": "Gemini 2.5 Flash",
        "provider": "google",
        "free": True,
        "reasoning": False,
        "description": "Fast Gemini variant. Free tier: 10 RPM, 1500 RPD.",
        "signup_url": "https://aistudio.google.com/apikey",
    },

    # ── Groq — free, fastest inference on the planet ──────────────────────
    {
        "id": "groq/llama-3.3-70b-versatile",
        "label": "Llama 3.3 70B (Groq)",
        "provider": "groq",
        "free": True,
        "reasoning": False,
        "description": "Meta's flagship open chat model. Matches GPT-4o quality. Sub-50ms latency on Groq.",
        "signup_url": "https://console.groq.com/keys",
    },
    {
        "id": "groq/meta-llama/llama-4-scout-17b-16e-instruct",
        "label": "Llama 4 Scout 17B (Groq)",
        "provider": "groq",
        "free": True,
        "reasoning": False,
        "description": "Meta's latest Llama 4 Scout model. 16 experts MoE. Fast inference on Groq.",
        "signup_url": "https://console.groq.com/keys",
    },
    {
        "id": "groq/qwen/qwen3-32b",
        "label": "Qwen 3 32B (Groq)",
        "provider": "groq",
        "free": True,
        "reasoning": True,
        "description": "Alibaba's latest reasoning model. Strong on math, logic and coding. Free on Groq.",
        "signup_url": "https://console.groq.com/keys",
    },
    {
        "id": "groq/openai/gpt-oss-120b",
        "label": "GPT-OSS 120B (Groq)",
        "provider": "groq",
        "free": True,
        "reasoning": False,
        "description": "OpenAI's open-source 120B model on Groq. High quality, fast inference.",
        "signup_url": "https://console.groq.com/keys",
    },

    # ── OpenRouter — community-funded free pool ───────────────────────────
    {
        "id": "openrouter/qwen/qwen3.6-plus-preview:free",
        "label": "Qwen 3.6 Plus Preview",
        "provider": "openrouter",
        "free": True,
        "reasoning": True,
        "description": "1M context, mandatory CoT reasoning, tool use. Near-GPT-5.4 quality.",
        "signup_url": "https://openrouter.ai/settings/keys",
    },
    {
        "id": "openrouter/zhipuai/glm-5.1:free",
        "label": "GLM-5.1 (Z.ai)",
        "provider": "openrouter",
        "free": True,
        "reasoning": True,
        "description": "Tops SWE-Bench Pro. Strong coding and reasoning. Free via OpenRouter pool.",
        "signup_url": "https://openrouter.ai/settings/keys",
    },
    {
        "id": "openrouter/minimax/minimax-m2.5:free",
        "label": "MiniMax M2.5",
        "provider": "openrouter",
        "free": True,
        "reasoning": True,
        "description": "80.2% SWE-bench Verified. Matches Claude Opus 4.6. MIT-licensed.",
        "signup_url": "https://openrouter.ai/settings/keys",
    },
    {
        "id": "openrouter/deepseek/deepseek-r1:free",
        "label": "DeepSeek R1 (full)",
        "provider": "openrouter",
        "free": True,
        "reasoning": True,
        "description": "Full DeepSeek R1 reasoning (not just distilled). Via OpenRouter community pool.",
        "signup_url": "https://openrouter.ai/settings/keys",
    },
    {
        "id": "openrouter/moonshotai/kimi-k2.5:free",
        "label": "Kimi K2.5 (Moonshot)",
        "provider": "openrouter",
        "free": True,
        "reasoning": True,
        "description": "Moonshot AI's reasoning model. 100 parallel agents, strong on LiveCodeBench.",
        "signup_url": "https://openrouter.ai/settings/keys",
    },

    # ── OpenAI (paid — the original) ──────────────────────────────────────
    {
        "id": "openai/gpt-4o",
        "label": "OpenAI GPT-4o (paid)",
        "provider": "openai",
        "free": False,
        "reasoning": False,
        "description": "Original stack. Requires paid OpenAI API key.",
        "signup_url": "https://platform.openai.com/api-keys",
    },
    {
        "id": "openai/gpt-5.4",
        "label": "OpenAI GPT-5.4 (paid)",
        "provider": "openai",
        "free": False,
        "reasoning": True,
        "description": "OpenAI's flagship. Requires paid OpenAI API key.",
        "signup_url": "https://platform.openai.com/api-keys",
    },
]

# ── STT Model Catalog ─────────────────────────────────────────────────────
STT_MODELS = [
    {
        "id": "groq/whisper-large-v3-turbo",
        "label": "Whisper Large v3 Turbo (Groq, free)",
        "provider": "groq",
        "free": True,
        "description": "Same OpenAI Whisper model, 10-20x faster on Groq's LPU. 2000 RPD free.",
        "signup_url": "https://console.groq.com/keys",
    },
    {
        "id": "groq/whisper-large-v3",
        "label": "Whisper Large v3 (Groq, free)",
        "provider": "groq",
        "free": True,
        "description": "Standard Whisper v3 on Groq. Slightly slower than turbo, same accuracy.",
        "signup_url": "https://console.groq.com/keys",
    },
    {
        "id": "openai/whisper-1",
        "label": "OpenAI Whisper (paid)",
        "provider": "openai",
        "free": False,
        "description": "Original Whisper API. Requires paid OpenAI account.",
        "signup_url": "https://platform.openai.com/api-keys",
    },
]

# ── Defaults ──────────────────────────────────────────────────────────────
DEFAULT_LLM_MODEL = "groq/openai/gpt-oss-120b"
DEFAULT_STT_MODEL = "groq/whisper-large-v3-turbo"


def get_llm_model(model_id: str) -> dict | None:
    """Look up a model entry by ID."""
    return next((m for m in LLM_MODELS if m["id"] == model_id), None)


def get_stt_model(model_id: str) -> dict | None:
    return next((m for m in STT_MODELS if m["id"] == model_id), None)


def parse_provider(model_id: str) -> tuple[str, str]:
    """
    Split a model ID into (provider, model_name).
    e.g. "groq/deepseek-r1-distill-llama-70b" -> ("groq", "deepseek-r1-distill-llama-70b")
         "openrouter/qwen/qwen3.6-plus-preview:free" -> ("openrouter", "qwen/qwen3.6-plus-preview:free")
    """
    parts = model_id.split("/", 1)
    if len(parts) != 2:
        raise ValueError(f"Invalid model id: {model_id} (expected 'provider/model')")
    return parts[0], parts[1]
