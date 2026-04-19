import uuid
import json
import os
from fastapi import APIRouter, UploadFile, File, HTTPException
from services.supabase_client import get_supabase

router = APIRouter()


def _is_demo_mode() -> bool:
    return os.getenv("DEMO_MODE", "false").lower() == "true"

PARSE_PROMPT = """You are a resume parser. Parse the attached resume PDF and return a JSON object with these exact keys:
{
  "name": "full name",
  "email": "email address",
  "phone": "phone number",
  "summary": "professional summary or objective (empty string if none)",
  "education": [{"degree": "", "institution": "", "year": ""}],
  "experience": [{"title": "", "company": "", "duration": "", "description": ""}],
  "projects": [{"name": "", "description": "", "technologies": []}],
  "skills": ["skill1", "skill2"],
  "research": [{"title": "", "institution": "", "description": ""}],
  "primary_field": "one of: nlp, computer_vision, reinforcement_learning, general_ml, data_science"
}
Rules:
- primary_field: infer from skills, projects and experience
- Return ONLY valid JSON — no markdown fences, no explanation
- All arrays can be empty if no data found"""

_FENCE = chr(96) * 3


def _strip_fences(text: str) -> str:
    if _FENCE in text:
        parts = text.split(_FENCE)
        for part in parts:
            part = part.strip()
            if part.startswith("json"):
                part = part[4:].strip()
            if part.startswith("{"):
                return part
    return text.strip()


@router.post("/upload")
async def upload_resume(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files accepted")

    pdf_bytes = await file.read()

    if _is_demo_mode():
        from services.demo_mode import PARSED_RESUME
        import copy
        session_id = str(uuid.uuid4())
        parsed = copy.deepcopy(PARSED_RESUME)
        parsed["session_id"] = session_id
        return {"session_id": session_id, "resume": parsed}

    # Parse PDF with Gemini (multimodal, PDF-native). Falls back across models
    # inside gemini_client._generate_with_fallback on rate limits.
    try:
        from services.gemini_client import generate_with_parts
        from google.genai import types as _gtypes
        parts = [
            _gtypes.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"),
            _gtypes.Part(text=PARSE_PROMPT),
        ]
        raw = _strip_fences(generate_with_parts(parts))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Resume parsing failed: {str(e)}")

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail=f"Failed to parse resume JSON: {raw[:200]}")

    session_id = str(uuid.uuid4())
    parsed["session_id"] = session_id

    try:
        sb = get_supabase()
        sb.table("resumes").insert({
            "session_id": session_id,
            "data": parsed,
            "filename": file.filename,
        }).execute()
    except Exception:
        pass

    return {"session_id": session_id, "resume": parsed}
