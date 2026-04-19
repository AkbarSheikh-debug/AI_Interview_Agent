import json
import os
from fastapi import APIRouter, HTTPException
from services.supabase_client import get_supabase
from services.llm_router import chat as llm_chat
from services.model_catalog import DEFAULT_LLM_MODEL

router = APIRouter()


def _is_demo_mode() -> bool:
    return os.getenv("DEMO_MODE", "false").lower() == "true"

REPORT_PROMPT = """You are evaluating a machine learning engineer candidate based on their interview transcript.

Resume:
{resume}

Interview messages (all phases):
{messages}

Phase 4 factual Q&A results:
{phase4}

Evaluate the candidate and return ONLY valid JSON (no markdown fences) with these keys:
  phase2_score (0-10), phase2_feedback (2-3 sentences),
  phase3_score (0-10), phase3_feedback (2-3 sentences),
  phase4_score (0-10), phase4_feedback (2-3 sentences),
  phase5_score (0-10), phase5_feedback (2-3 sentences),
  raw_composite (weighted average — DO NOT include facial score here: p2*0.27 + p3*0.23 + p4*0.23 + p5*0.17),
  overall_summary (3-4 sentences),
  hire_recommendation (one of: strong_hire, hire, borderline, no_hire),
  strengths (list of 3 strings),
  areas_for_improvement (list of 3 strings).
Be rigorous. Do not inflate scores."""

_FENCE = chr(96) * 3

from routers.interview import _sessions


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


@router.get("/generate/{session_id}")
def generate_report(
    session_id: str,
    facial_score: float = 5.0,
    integrity_score: float = 5.0,
    integrity_flag: bool = False,
):
    """
    Generate interview report. Composite weighting:
        composite = raw_composite * 0.82 + facial * 0.10 + integrity * 0.08

    `facial_score` (composure) and `integrity_score` (anti-cheat) both default
    to 5.0 (neutral) when the candidate skipped the camera.
    """
    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if _is_demo_mode():
        from services.demo_mode import REPORT_TEMPLATE
        import copy
        report = copy.deepcopy(REPORT_TEMPLATE)
        report["session_id"] = session_id
        report["candidate_name"] = session.get("resume", {}).get("name", "Candidate")
        raw_comp = report.get("composite_score", 7.0)
        report["composite_score"] = round(
            raw_comp * 0.82 + facial_score * 0.10 + integrity_score * 0.08, 2
        )
        report["facial_score"] = round(facial_score, 2)
        report["facial_available"] = (facial_score != 5.0)
        report["integrity_score"] = round(integrity_score, 2)
        report["integrity_available"] = (integrity_score != 5.0)
        report["integrity_flag"] = integrity_flag
        return report

    resume_data = session.get("resume", {})
    messages = session.get("messages", [])
    phase4_answers = session.get("phase4_answers", [])

    prompt = REPORT_PROMPT.format(
        resume=json.dumps(resume_data, indent=2),
        messages=json.dumps(messages, indent=2)[-6000:],
        phase4=json.dumps(phase4_answers, indent=2),
    )

    model_id = session.get("llm_model") or DEFAULT_LLM_MODEL
    raw = _strip_fences(llm_chat(
        model_id,
        [{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=1500,
    ))

    try:
        report_data = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Failed to parse report from OpenAI")

    # Compute final composite: 82% interview substance, 10% composure, 8% integrity
    raw_comp = report_data.get("raw_composite", (
        report_data.get("phase2_score", 5) * 0.27
        + report_data.get("phase3_score", 5) * 0.23
        + report_data.get("phase4_score", 5) * 0.23
        + report_data.get("phase5_score", 5) * 0.17
    ))
    composite_score = round(
        raw_comp * 0.82 + facial_score * 0.10 + integrity_score * 0.08, 2
    )
    report_data["composite_score"] = composite_score
    report_data["facial_score"] = round(facial_score, 2)
    report_data["facial_available"] = (facial_score != 5.0)
    report_data["integrity_score"] = round(integrity_score, 2)
    report_data["integrity_available"] = (integrity_score != 5.0)
    report_data["integrity_flag"] = integrity_flag
    report_data.pop("raw_composite", None)

    report_data["session_id"] = session_id
    report_data["candidate_name"] = resume_data.get("name", "Candidate")

    try:
        sb = get_supabase()
        sb.table("reports").insert({"session_id": session_id, "data": report_data}).execute()
    except Exception:
        pass

    return report_data
