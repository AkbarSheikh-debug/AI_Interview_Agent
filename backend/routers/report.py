import json
import os
from fastapi import APIRouter, HTTPException
from services.supabase_client import get_supabase
from services.llm_router import chat as llm_chat
from services.model_catalog import DEFAULT_LLM_MODEL

router = APIRouter()

# In-memory report cache — keyed by session_id.
# Once a report is generated it is stored here so subsequent calls to
# /generate never re-run the LLM and scores never change.
_report_cache: dict[str, dict] = {}

# Minimum word count for a candidate message to count as a "real" answer.
_MIN_RESPONSE_WORDS = 8


def _is_demo_mode() -> bool:
    return os.getenv("DEMO_MODE", "false").lower() == "true"


def _analyze_engagement(messages: list[dict]) -> dict:
    """Count how actively the candidate engaged.  Returns engagement metadata."""
    user_msgs = [m for m in messages if m.get("role") == "user"]
    meaningful = [
        m for m in user_msgs
        if len(m.get("content", "").split()) >= _MIN_RESPONSE_WORDS
    ]
    total_words = sum(len(m.get("content", "").split()) for m in user_msgs)
    n = len(meaningful)
    if n == 0:
        level = "none"
    elif n < 4:
        level = "minimal"
    elif n < 10:
        level = "partial"
    else:
        level = "full"
    return {
        "total_user_turns": len(user_msgs),
        "meaningful_turns": n,
        "total_words": total_words,
        "level": level,
    }


# Engagement-aware constraints injected into the LLM prompt.
_ENGAGEMENT_CONSTRAINTS = {
    "minimal": (
        "MANDATORY SCORING RULE: This candidate gave MINIMAL engagement "
        "(fewer than 4 responses of substance). "
        "ALL phase scores, articulation, technical_depth, and leadership_radar "
        "MUST be between 0.0 and 3.0. "
        'hire_recommendation MUST be "no_hire". '
        "Do not award points for content not explicitly stated in the transcript."
    ),
    "partial": (
        "SCORING NOTE: This candidate gave PARTIAL engagement (4–9 substantive responses). "
        "Scores above 6.0 require explicit, detailed evidence in the transcript. "
        '"strong_hire" is not permitted; maximum recommendation is "borderline".'
    ),
    "full": (
        "Score based strictly on answer quality and depth shown in the transcript. "
        'Award "strong_hire" only for exceptional, detailed, technically accurate responses.'
    ),
}


REPORT_PROMPT = """You are evaluating a machine learning/data science/computer vision candidate.

Resume:
{resume}

Interview transcript (all phases):
{messages}

Phase 4 factual Q&A results:
{phase4}

Coding question results (trials used, passed/failed, difficulty):
{coding}

Candidate engagement statistics (computed from transcript):
  Total candidate messages : {total_turns}
  Meaningful responses (≥8 words): {meaningful_turns}
  Total words across all responses: {total_words}
  Engagement level: {engagement_level}

{engagement_constraint}

Return ONLY valid JSON (no markdown fences) with these exact keys:

  phase2_score (0-10), phase2_feedback (2-3 sentences),
  phase3_score (0-10), phase3_feedback (2-3 sentences),
  phase4_score (0-10), phase4_feedback (2-3 sentences),
  phase5_score (0-10), phase5_feedback (2-3 sentences),

  articulation (0-10): clarity of speech, answer structure, vocabulary, conciseness,
  technical_depth (0-10): ML/DS/CV knowledge depth and accuracy across all phases,
  leadership_radar (0-10): vision, teamwork answers, maturity from phase 5,

  overall_summary (3-4 sentences),
  hire_recommendation (one of: strong_hire, hire, borderline, no_hire),
  strengths (list of 3 strings),
  areas_for_improvement (list of 3 strings).

Be rigorous. Score ONLY what is evidenced in the transcript. Do not inflate scores."""


def _zero_engagement_report(
    session: dict,
    facial_score: float,
    integrity_score: float,
    integrity_flag: bool,
    engagement: dict,
) -> dict:
    """Return a hardcoded no_hire report when the candidate gave zero meaningful answers."""
    coding_questions = session.get("coding_questions", [])
    # Apply a penalty when camera was off (5.0 is the untouched default).
    effective_facial = facial_score if facial_score != 5.0 else 2.5
    effective_integrity = integrity_score if integrity_score != 5.0 else 2.5

    six = _compute_six_scores(
        {"articulation": 0.0, "technical_depth": 0.0, "leadership_radar": 0.0},
        effective_facial,
        effective_integrity,
        coding_questions,
    )
    return {
        "phase2_score": 0.0,
        "phase2_feedback": "The candidate did not provide meaningful responses during the project deep-dive phase.",
        "phase3_score": 0.0,
        "phase3_feedback": "No substantive discussion of a second project was recorded.",
        "phase4_score": 0.0,
        "phase4_feedback": "The candidate did not engage with factual technical questions.",
        "phase5_score": 0.0,
        "phase5_feedback": "No behavioral responses were provided.",
        "overall_summary": (
            f"The candidate completed {engagement['total_user_turns']} turn(s) with "
            f"{engagement['meaningful_turns']} meaningful response(s). "
            "No evaluable technical or behavioral data was collected. "
            "This session does not meet the minimum engagement threshold for a valid interview."
        ),
        "hire_recommendation": "no_hire",
        "strengths": [
            "Unable to assess — insufficient engagement",
            "Candidate submitted a resume for initial review",
            "—",
        ],
        "areas_for_improvement": [
            "Provide substantive responses to interview questions",
            "Enable camera for behavioral and integrity assessment",
            "Engage with technical, project, and behavioral questions",
        ],
        **six,
        "composite_score": six["overall_rank"],
        "facial_score": round(facial_score, 2),
        "facial_available": (facial_score != 5.0),
        "integrity_score": round(integrity_score, 2),
        "integrity_available": (integrity_score != 5.0),
        "integrity_flag": integrity_flag,
    }

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


def _compute_six_scores(report_data: dict, facial_score: float, integrity_score: float,
                         coding_questions: list) -> dict:
    """Derive all 6 dimension scores and the overall rank."""

    # Code IQ — from coding questions performance
    if coding_questions:
        scores = [q.get("score", 0) or 0 for q in coding_questions]
        code_iq = round(sum(scores) / len(scores), 2)
    else:
        code_iq = 0.0

    articulation     = round(float(report_data.get("articulation", 5.0)), 2)
    technical_depth  = round(float(report_data.get("technical_depth", 5.0)), 2)
    leadership_radar = round(float(report_data.get("leadership_radar", 5.0)), 2)
    composure_index  = round(float(facial_score), 2)
    integrity_sc     = round(float(integrity_score), 2)

    overall = round(
        code_iq          * 0.25 +
        articulation     * 0.20 +
        technical_depth  * 0.25 +
        leadership_radar * 0.10 +
        composure_index  * 0.12 +
        integrity_sc     * 0.08,
        2,
    )
    return {
        "code_iq":          code_iq,
        "articulation":     articulation,
        "technical_depth":  technical_depth,
        "leadership_radar": leadership_radar,
        "composure_index":  composure_index,
        "integrity_score":  integrity_sc,
        "overall_rank":     overall,
    }


@router.get("/fetch/{session_id}")
def fetch_report(session_id: str):
    """Return an already-generated report without triggering a new LLM call.
    Used by the frontend on page reloads — guaranteed to be idempotent."""
    # 1. In-memory cache (fastest)
    if session_id in _report_cache:
        return _report_cache[session_id]
    # 2. Supabase persistence (survives backend restarts)
    try:
        sb = get_supabase()
        res = sb.table("reports").select("data").eq("session_id", session_id).limit(1).execute()
        if res.data:
            cached = res.data[0]["data"]
            _report_cache[session_id] = cached   # warm the memory cache
            return cached
    except Exception:
        pass
    raise HTTPException(status_code=404, detail="Report not generated yet")


@router.get("/generate/{session_id}")
def generate_report(
    session_id: str,
    facial_score:    float = 5.0,
    integrity_score: float = 5.0,
    integrity_flag:  bool  = False,
    company_id:      str   = "",
    company_name:    str   = "",
    candidate_email: str   = "",
):
    # ── Guard: return cached report if it already exists ──────────────────────
    if session_id in _report_cache:
        return _report_cache[session_id]
    try:
        sb = get_supabase()
        res = sb.table("reports").select("data").eq("session_id", session_id).limit(1).execute()
        if res.data:
            cached = res.data[0]["data"]
            _report_cache[session_id] = cached
            return cached
    except Exception:
        pass

    session = _sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if _is_demo_mode():
        from services.demo_mode import REPORT_TEMPLATE
        import copy
        report = copy.deepcopy(REPORT_TEMPLATE)
        report["session_id"]   = session_id
        report["candidate_name"] = session.get("resume", {}).get("name", "Candidate")
        six = _compute_six_scores(report, facial_score, integrity_score, [])
        report.update(six)
        report["composite_score"]     = six["overall_rank"]
        report["facial_available"]    = (facial_score != 5.0)
        report["integrity_available"] = (integrity_score != 5.0)
        report["integrity_flag"]      = integrity_flag
        _report_cache[session_id] = report
        _store_candidate_session(session_id, session, six, report, company_id, company_name, candidate_email)
        return report

    resume_data      = session.get("resume", {})
    messages         = session.get("messages", [])
    phase4_answers   = session.get("phase4_answers", [])
    coding_questions = session.get("coding_questions", [])

    # ── Engagement gate ───────────────────────────────────────────────────────
    engagement = _analyze_engagement(messages)

    if engagement["level"] == "none":
        report_data = _zero_engagement_report(
            session, facial_score, integrity_score, integrity_flag, engagement
        )
        report_data["session_id"]     = session_id
        report_data["candidate_name"] = resume_data.get("name", "Candidate")
        _report_cache[session_id] = report_data
        try:
            sb = get_supabase()
            sb.table("reports").insert({"session_id": session_id, "data": report_data}).execute()
        except Exception:
            pass
        six = {k: report_data[k] for k in (
            "code_iq", "articulation", "technical_depth", "leadership_radar",
            "composure_index", "integrity_score", "overall_rank",
        )}
        _store_candidate_session(session_id, session, six, report_data,
                                 company_id, company_name, candidate_email)
        return report_data

    # Camera-off penalty: replace the untouched 5.0 default with 2.5
    effective_facial    = facial_score    if facial_score    != 5.0 else 2.5
    effective_integrity = integrity_score if integrity_score != 5.0 else 2.5

    engagement_constraint = _ENGAGEMENT_CONSTRAINTS.get(engagement["level"], "")

    prompt = REPORT_PROMPT.format(
        resume              = json.dumps(resume_data,      indent=2),
        messages            = json.dumps(messages,         indent=2)[-6000:],
        phase4              = json.dumps(phase4_answers,   indent=2),
        coding              = json.dumps(coding_questions, indent=2),
        total_turns         = engagement["total_user_turns"],
        meaningful_turns    = engagement["meaningful_turns"],
        total_words         = engagement["total_words"],
        engagement_level    = engagement["level"],
        engagement_constraint = engagement_constraint,
    )

    model_id = session.get("llm_model") or DEFAULT_LLM_MODEL
    raw = _strip_fences(llm_chat(
        model_id,
        [{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=1800,
    ))

    try:
        report_data = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Failed to parse report from LLM")

    # ── Post-LLM score capping based on engagement level ─────────────────────
    _score_keys = [
        "phase2_score", "phase3_score", "phase4_score", "phase5_score",
        "articulation", "technical_depth", "leadership_radar",
    ]
    if engagement["level"] == "minimal":
        for k in _score_keys:
            if k in report_data:
                report_data[k] = min(float(report_data[k]), 3.0)
        report_data["hire_recommendation"] = "no_hire"
    elif engagement["level"] == "partial":
        for k in _score_keys:
            if k in report_data:
                report_data[k] = min(float(report_data[k]), 6.0)
        if report_data.get("hire_recommendation") == "strong_hire":
            report_data["hire_recommendation"] = "borderline"

    six = _compute_six_scores(report_data, effective_facial, effective_integrity, coding_questions)
    report_data.update(six)
    report_data["composite_score"]     = six["overall_rank"]
    report_data["facial_score"]        = round(facial_score, 2)
    report_data["facial_available"]    = (facial_score != 5.0)
    report_data["integrity_score"]     = round(integrity_score, 2)
    report_data["integrity_available"] = (integrity_score != 5.0)
    report_data["integrity_flag"]      = integrity_flag
    report_data.pop("raw_composite", None)
    report_data["session_id"]      = session_id
    report_data["candidate_name"]  = resume_data.get("name", "Candidate")

    # Cache in memory — all future calls return this exact dict
    _report_cache[session_id] = report_data

    try:
        sb = get_supabase()
        sb.table("reports").insert({"session_id": session_id, "data": report_data}).execute()
    except Exception:
        pass

    _store_candidate_session(session_id, session, six, report_data, company_id, company_name, candidate_email)
    return report_data


def _store_candidate_session(session_id, session, six, report_data,
                              company_id, company_name, candidate_email):
    if not company_id:
        return
    try:
        sb = get_supabase()
        sb.table("candidate_sessions").upsert({
            "session_id":       session_id,
            "company_id":       company_id,
            "company_name":     company_name,
            "candidate_name":   session.get("resume", {}).get("name", "Candidate"),
            "candidate_email":  candidate_email,
            "code_iq":          six["code_iq"],
            "articulation":     six["articulation"],
            "technical_depth":  six["technical_depth"],
            "leadership_radar": six["leadership_radar"],
            "composure_index":  six["composure_index"],
            "integrity_score":  six["integrity_score"],
            "overall_rank":     six["overall_rank"],
            "report_data":      report_data,
        }, on_conflict="session_id").execute()
    except Exception as e:
        print(f"[report] Failed to store candidate_session: {e}")
