"""
POST /api/vision/summary
Receives aggregated facial blendshape stats + anti-cheat signals from the
browser (no raw images). Computes a composure score, an integrity score,
and a combined behavioural score.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


class AntiCheatFlag(BaseModel):
    kind: str
    severity: str
    message: str


class BlendshapeStats(BaseModel):
    # Composure (existing)
    smileAvg: float = 0.0
    browFurrowAvg: float = 0.0
    eyeWideAvg: float = 0.0
    jawOpenLow: float = 0.0
    headStability: float = 1.0
    expressionVariance: float = 0.0
    sampleCount: int = 0

    # Anti-cheat (new, all optional)
    gazeOffScreenPct: Optional[float] = None
    headAwayPct: Optional[float] = None
    faceMissingPct: Optional[float] = None
    eyeClosedPct: Optional[float] = None
    phoneSeconds: Optional[float] = None
    laptopSeconds: Optional[float] = None
    bookSeconds: Optional[float] = None
    multiFaceSeconds: Optional[float] = None
    faceTransitions: Optional[int] = None
    suspicionScore: Optional[float] = None
    flags: Optional[list[AntiCheatFlag]] = None


class VisionResult(BaseModel):
    score: float
    confidence_score: float
    composure_score: float
    integrity_score: float
    integrity_available: bool
    integrity_flag: bool
    flags: list[AntiCheatFlag]
    label: str
    available: bool


@router.post("/summary", response_model=VisionResult)
def vision_summary(stats: BlendshapeStats) -> VisionResult:
    # ── Integrity score (independent of composure availability) ─────────
    # Suspicion may come precomputed from the client; recompute defensively.
    integrity_available = stats.suspicionScore is not None
    if integrity_available:
        suspicion = max(0.0, min(1.0, stats.suspicionScore or 0.0))
    else:
        suspicion = 0.0
    integrity_score = round(10.0 * (1.0 - suspicion), 2)
    integrity_flag = suspicion > 0.6

    # ── Composure score (may be unavailable if camera skipped) ──────────
    if stats.sampleCount == 0:
        return VisionResult(
            score=integrity_score if integrity_available else 5.0,
            confidence_score=5.0,
            composure_score=5.0,
            integrity_score=integrity_score if integrity_available else 5.0,
            integrity_available=integrity_available,
            integrity_flag=integrity_flag,
            flags=stats.flags or [],
            label=("Composure skipped — camera unavailable"
                   if not integrity_available
                   else f"Integrity {integrity_score:.1f}/10, composure unavailable"),
            available=False,
        )

    brow_calm = max(0.0, 1.0 - stats.browFurrowAvg)
    eye_calm = max(0.0, 1.0 - stats.eyeWideAvg)

    confidence_raw = (
        0.30 * stats.smileAvg
        + 0.25 * brow_calm
        + 0.25 * stats.headStability
        + 0.20 * eye_calm
    )
    confidence_score = round(min(10.0, max(0.0, confidence_raw * 10)), 2)

    variance_penalty = min(1.0, stats.expressionVariance * 3)
    composure_raw = (
        0.50 * (1.0 - variance_penalty)
        + 0.50 * stats.jawOpenLow
    )
    composure_score = round(min(10.0, max(0.0, composure_raw * 10)), 2)

    # `score` stays composure-only for back-compat. Report applies integrity separately.
    score = round((confidence_score + composure_score) / 2, 2)

    if score >= 7.5:
        label = "High confidence & composure"
    elif score >= 5.5:
        label = "Moderate confidence"
    elif score >= 3.5:
        label = "Some nervousness detected"
    else:
        label = "Significant stress indicators"

    return VisionResult(
        score=score,
        confidence_score=confidence_score,
        composure_score=composure_score,
        integrity_score=integrity_score if integrity_available else 5.0,
        integrity_available=integrity_available,
        integrity_flag=integrity_flag,
        flags=stats.flags or [],
        label=label,
        available=True,
    )
