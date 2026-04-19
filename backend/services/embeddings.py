import json
import numpy as np
from pathlib import Path
from services.openai_client import get_openai

QUESTIONS_FILE = Path(__file__).parent.parent.parent / "questions" / "ml_questions.json"
EMBED_DIM = 384


def get_embedding(text: str) -> list[float]:
    client = get_openai()
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=text,
        dimensions=EMBED_DIM,
    )
    return response.data[0].embedding


def cosine_similarity(a: list[float], b: list[float]) -> float:
    a_arr = np.array(a)
    b_arr = np.array(b)
    return float(np.dot(a_arr, b_arr) / (np.linalg.norm(a_arr) * np.linalg.norm(b_arr) + 1e-10))


def search_questions(query: str, top_k: int = 5, field_filter: str | None = None) -> list[dict]:
    if not QUESTIONS_FILE.exists():
        return []

    with open(QUESTIONS_FILE) as f:
        questions = json.load(f)

    if field_filter:
        filtered = [q for q in questions if field_filter.lower() in q.get("tags", [])]
        if not filtered:
            filtered = questions
    else:
        filtered = questions

    has_embeddings = any(q.get("embedding") for q in filtered)
    if has_embeddings:
        try:
            query_emb = get_embedding(query)
            scored = []
            for q in filtered:
                if q.get("embedding"):
                    score = cosine_similarity(query_emb, q["embedding"])
                    scored.append((score, q))
            scored.sort(key=lambda x: x[0], reverse=True)
            return [q for _, q in scored[:top_k]]
        except Exception:
            pass

    import random
    sample = list(filtered)
    random.shuffle(sample)
    return sample[:top_k]
