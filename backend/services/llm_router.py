"""
LLM router — dispatches chat calls to the right provider based on the model ID.
Model IDs follow the pattern: <provider>/<model-name>

Example calls:
    chat("groq/deepseek-r1-distill-llama-70b", messages)
    chat("google/gemma-4-31b-it-thinking", messages)
    chat("openrouter/qwen/qwen3.6-plus-preview:free", messages)
    chat("openai/gpt-4o", messages)
"""
from services.model_catalog import parse_provider, DEFAULT_LLM_MODEL


def _strip_and_log_reasoning(content: str) -> str:
    """
    Search for reasoning tags like <think>...</think>.
    If found, log the thinking process to the backend console and return only the final response.
    """
    if "<think>" in content and "</think>" in content:
        # Extract reasoning and final answer
        try:
            reasoning, final_answer = content.split("</think>", 1)
            reasoning = reasoning.replace("<think>", "").strip()
            
            # Log to backend console
            print("\n" + "="*50)
            print("[AI REASONING PROCESS]")
            print(reasoning)
            print("="*50 + "\n")
            
            return final_answer.strip()
        except Exception:
            return content.strip()
    
    # Handle cases where <think> is present but not closed (might happen if max_tokens hit)
    if "<think>" in content:
        reasoning = content.split("<think>", 1)[1].strip()
        print("\n" + "="*50)
        print("[AI REASONING PROCESS (UNFINISHED)]")
        print(reasoning)
        print("="*50 + "\n")
        return "" # Or return partial? Usually unclosed think means no actual answer yet.

    return content.strip()


def chat(
    model_id: str | None,
    messages: list[dict],
    *,
    temperature: float = 0.7,
    max_tokens: int = 512,
) -> str:
    """Route a chat completion to the right provider."""
    model_id = model_id or DEFAULT_LLM_MODEL
    provider, model_name = parse_provider(model_id)

    raw_response = ""

    if provider == "groq":
        from services import groq_client
        raw_response = groq_client.chat_completion(model_name, messages, temperature=temperature, max_tokens=max_tokens)

    elif provider == "openrouter":
        from services import openrouter_client
        raw_response = openrouter_client.chat_completion(model_name, messages, temperature=temperature, max_tokens=max_tokens)

    elif provider == "google":
        from services import gemini_client
        raw_response = gemini_client.chat_from_messages(messages, model=model_name)

    elif provider == "openai":
        from services.openai_client import get_openai
        client = get_openai()
        resp = client.chat.completions.create(
            model=model_name,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        raw_response = (resp.choices[0].message.content or "").strip()
    
    else:
        raise ValueError(f"Unknown LLM provider: {provider}")

    return _strip_and_log_reasoning(raw_response)

