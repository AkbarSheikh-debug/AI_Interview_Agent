import json
import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.embeddings import search_questions
from services.supabase_client import get_supabase
from services.llm_router import chat as llm_chat
from services.model_catalog import DEFAULT_LLM_MODEL, DEFAULT_STT_MODEL
from prompts.interviewer import build_system_prompt

router = APIRouter()


def _is_demo_mode() -> bool:
    return os.getenv("DEMO_MODE", "false").lower() == "true"

_sessions: dict[str, dict] = {}

PHASE_TURN_LIMITS = {1: 4, 2: 12, 3: 12, 4: 10, 5: 8}
TOTAL_PHASES = 5


class StartRequest(BaseModel):
    session_id: str
    resume: dict
    llm_model: str | None = None
    stt_model: str | None = None


class MessageRequest(BaseModel):
    session_id: str
    message: str


class PhaseSkipRequest(BaseModel):
    session_id: str


def _get_session(session_id: str) -> dict:
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    return _sessions[session_id]


def _save_message(session_id: str, role: str, content: str):
    _sessions[session_id]["messages"].append({"role": role, "content": content})
    try:
        sb = get_supabase()
        sb.table("interview_messages").insert({
            "session_id": session_id,
            "role": role,
            "content": content,
            "phase": _sessions[session_id]["phase"],
        }).execute()
    except Exception:
        pass


def _get_phase4_questions(resume: dict) -> list[dict]:
    field = resume.get("primary_field", "general_ml")
    projects_text = " ".join(
        p.get("description", "") for p in resume.get("projects", [])
    )
    query = f"{field} {projects_text}"
    questions = search_questions(query, top_k=5, field_filter=field)
    if not questions:
        questions = search_questions(query, top_k=5)
    return questions


def _build_messages(session: dict) -> list[dict]:
    resume = session["resume"]
    msgs = [
        {"role": "system", "content": build_system_prompt(session["phase"])},
        {"role": "system", "content": f"Candidate resume:\n{json.dumps(resume, indent=2)}"},
    ]
    msgs.extend(session["messages"][-20:])
    return msgs


def _call_llm(session: dict, user_message: str) -> str:
    msgs = _build_messages(session)
    msgs.append({"role": "user", "content": user_message})
    model_id = session.get("llm_model") or DEFAULT_LLM_MODEL
    return llm_chat(model_id, msgs, temperature=0.7, max_tokens=512)


@router.post("/start")
def start_interview(req: StartRequest):
    session = {
        "session_id": req.session_id,
        "resume": req.resume,
        "phase": 1,
        "phase_turns": 0,
        "messages": [],
        "depth_scores": {},
        "phase4_questions": [],
        "phase4_index": 0,
        "phase4_answers": [],
        "complete": False,
        "llm_model": req.llm_model or DEFAULT_LLM_MODEL,
        "stt_model": req.stt_model or DEFAULT_STT_MODEL,
    }
    _sessions[req.session_id] = session

    if _is_demo_mode():
        from services.demo_mode import PHASE_RESPONSES
        greeting = PHASE_RESPONSES[1][0]
        _save_message(req.session_id, "assistant", greeting)
        return {"message": greeting, "phase": 1, "complete": False}

    try:
        greeting = _call_llm(session, "Please begin the interview.")
    except Exception as e:
        import traceback
        print(f"[interview/start] LLM call failed: {type(e).__name__}: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"LLM error: {type(e).__name__}: {str(e)[:300]}")
    _save_message(req.session_id, "assistant", greeting)
    return {"message": greeting, "phase": 1, "complete": False}


@router.post("/message")
def send_message(req: MessageRequest):
    session = _get_session(req.session_id)
    if session["complete"]:
        return {"message": "Interview complete.", "phase": session["phase"], "complete": True}

    _save_message(req.session_id, "user", req.message)
    session["phase_turns"] += 1

    if _is_demo_mode():
        from services.demo_mode import PHASE_RESPONSES, FACTUAL_QUESTIONS
        phase = session["phase"]
        turn = session["phase_turns"]

        if phase == 4:
            if not session["phase4_questions"]:
                session["phase4_questions"] = FACTUAL_QUESTIONS
                first_q = FACTUAL_QUESTIONS[0]["question"]
                _save_message(req.session_id, "assistant", first_q)
                session["phase4_index"] = 1
                return {"message": first_q, "phase": 4, "complete": False}
            idx = session["phase4_index"]
            questions = session["phase4_questions"]
            session["phase4_answers"].append({
                "question": questions[idx - 1]["question"] if idx > 0 else "",
                "expected": questions[idx - 1].get("answer", "") if idx > 0 else "",
                "given": req.message,
            })
            if idx >= len(questions):
                return _advance_phase_demo(req.session_id, session)
            next_q = questions[idx]["question"]
            session["phase4_index"] += 1
            _save_message(req.session_id, "assistant", next_q)
            return {"message": next_q, "phase": 4, "complete": False}

        limit = PHASE_TURN_LIMITS.get(phase, 6)
        if turn >= limit:
            return _advance_phase_demo(req.session_id, session)
        responses = PHASE_RESPONSES.get(phase, ["Please continue."])
        idx = min(turn, len(responses) - 1)
        reply = responses[idx]
        _save_message(req.session_id, "assistant", reply)
        return {"message": reply, "phase": phase, "complete": False}

    # Phase 4: structured Q&A
    if session["phase"] == 4:
        if not session["phase4_questions"]:
            session["phase4_questions"] = _get_phase4_questions(session["resume"])
            if session["phase4_questions"]:
                first_q = session["phase4_questions"][0]["question"]
                _save_message(req.session_id, "assistant", first_q)
                session["phase4_index"] = 1
                return {"message": first_q, "phase": 4, "complete": False}
        idx = session["phase4_index"]
        questions = session["phase4_questions"]
        session["phase4_answers"].append({
            "question": questions[idx - 1]["question"] if idx > 0 else "",
            "expected": questions[idx - 1].get("answer", "") if idx > 0 else "",
            "given": req.message,
        })
        if idx >= len(questions):
            return _advance_phase(req.session_id, session)
        next_q = questions[idx]["question"]
        session["phase4_index"] += 1
        _save_message(req.session_id, "assistant", next_q)
        return {"message": next_q, "phase": 4, "complete": False}

    limit = PHASE_TURN_LIMITS.get(session["phase"], 10)
    if session["phase_turns"] >= limit:
        return _advance_phase(req.session_id, session)

    reply = _call_llm(session, req.message)
    _save_message(req.session_id, "assistant", reply)
    return {"message": reply, "phase": session["phase"], "complete": False}


def _advance_phase_demo(session_id: str, session: dict) -> dict:
    from services.demo_mode import PHASE_RESPONSES
    next_phase = session["phase"] + 1
    if next_phase > TOTAL_PHASES:
        session["complete"] = True
        closing = "That concludes the interview. Your report will be generated shortly."
        _save_message(session_id, "assistant", closing)
        return {"message": closing, "phase": session["phase"], "complete": True}
    session["phase"] = next_phase
    session["phase_turns"] = 0
    transition_msg = PHASE_RESPONSES.get(next_phase, ["Continuing."])[0]
    _save_message(session_id, "assistant", transition_msg)
    return {"message": transition_msg, "phase": next_phase, "complete": False}


def _advance_phase(session_id: str, session: dict) -> dict:
    next_phase = session["phase"] + 1
    if next_phase > TOTAL_PHASES:
        session["complete"] = True
        closing = "That concludes the interview. Your report will be generated shortly."
        _save_message(session_id, "assistant", closing)
        return {"message": closing, "phase": session["phase"], "complete": True}
    session["phase"] = next_phase
    session["phase_turns"] = 0
    transition_msg = _call_llm(session, "[Phase transition — begin next phase]")
    _save_message(session_id, "assistant", transition_msg)
    return {"message": transition_msg, "phase": next_phase, "complete": False}


@router.post("/skip-phase")
def skip_phase(req: PhaseSkipRequest):
    session = _get_session(req.session_id)
    if _is_demo_mode():
        return _advance_phase_demo(req.session_id, session)
    return _advance_phase(req.session_id, session)


@router.get("/session/{session_id}")
def get_session(session_id: str):
    session = _get_session(session_id)
    return {
        "phase": session["phase"],
        "complete": session["complete"],
        "message_count": len(session["messages"]),
    }
