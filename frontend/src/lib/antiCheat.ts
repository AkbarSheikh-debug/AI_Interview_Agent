/**
 * Client-side anti-cheat aggregator.
 *
 * Receives per-sample AntiCheatFrame from FaceAnalyzer and per-detection
 * ObjectHit from yoloRunner, maintains rolling stats, and exposes a single
 * suspicion_score (0..1) + human-readable flag list for the UI.
 *
 * Pure state machine — no React. The Interview page wraps it in a ref.
 */

import type { AntiCheatFrame } from '../components/FaceAnalyzer'

// ── Thresholds (all tunable in this block) ─────────────────────────────────
export const AC = {
  // Head pose flagged (degrees)
  headYawDeg: 35,
  headPitchDeg: 25,
  // Gaze off-screen flagged (blendshape units, roughly 0..1)
  gazeX: 0.45,
  gazeY: 0.4,
  // Eyes closed fraction
  closedEyeFrac: 0.4,
  // Multi-face requires this many consecutive hits to count
  multiFaceConsec: 3,
  // Face-lost → face-returned transitions are cheap; count them
  // Phone/laptop requires this many consecutive 1-second YOLO frames
  objectConsecSec: 2,
} as const

export interface ObjectHit {
  label: 'cell phone' | 'laptop' | 'book'
  confidence: number
  timestamp: number
}

export interface AntiCheatStats {
  // Fractions (0..1)
  gaze_off_screen_pct: number
  head_away_pct: number
  face_missing_pct: number
  eye_closed_pct: number
  // Durations (seconds)
  phone_seconds: number
  laptop_seconds: number
  book_seconds: number
  multi_face_seconds: number
  // Counts
  face_transitions: number
  total_samples: number
  // Composite
  suspicion_score: number
  flags: AntiCheatFlag[]
}

export interface AntiCheatFlag {
  kind: 'gaze_away' | 'head_away' | 'face_missing' | 'multi_face' | 'phone' | 'laptop' | 'book' | 'eyes_closed' | 'rapid_transitions'
  severity: 'info' | 'warn' | 'fail'
  message: string
}

const EMPTY_STATS: AntiCheatStats = {
  gaze_off_screen_pct: 0,
  head_away_pct: 0,
  face_missing_pct: 0,
  eye_closed_pct: 0,
  phone_seconds: 0,
  laptop_seconds: 0,
  book_seconds: 0,
  multi_face_seconds: 0,
  face_transitions: 0,
  total_samples: 0,
  suspicion_score: 0,
  flags: [],
}

export class AntiCheatTracker {
  // Rolling counters
  private samples = 0
  private gazeAway = 0
  private headAway = 0
  private faceMissing = 0
  private eyesClosed = 0
  private multiFaceConsec = 0
  private multiFaceCount = 0
  private lastFaceState: 'present' | 'absent' = 'present'
  private transitions = 0

  // Object detection counters — seconds of sustained presence.
  // yoloRunner samples at 1 fps; every confirmed hit adds 1.
  private phoneConsec = 0
  private laptopConsec = 0
  private bookConsec = 0
  private phoneSeconds = 0
  private laptopSeconds = 0
  private bookSeconds = 0

  pushFrame(f: AntiCheatFrame) {
    this.samples += 1

    const faceAbsent = f.faceCount === 0
    if (faceAbsent) this.faceMissing += 1

    // Face transitions (lost ↔ returned)
    const next = faceAbsent ? 'absent' : 'present'
    if (next !== this.lastFaceState) this.transitions += 1
    this.lastFaceState = next

    if (!faceAbsent) {
      const gazeBig = Math.abs(f.gazeX) > AC.gazeX || Math.abs(f.gazeY) > AC.gazeY
      if (gazeBig) this.gazeAway += 1

      const headBig =
        Math.abs(f.headYaw) > AC.headYawDeg || Math.abs(f.headPitch) > AC.headPitchDeg
      if (headBig) this.headAway += 1

      if (f.eyesClosed) this.eyesClosed += 1

      if (f.faceCount > 1) {
        this.multiFaceConsec += 1
        if (this.multiFaceConsec >= AC.multiFaceConsec) this.multiFaceCount += 1
      } else {
        this.multiFaceConsec = 0
      }
    }
  }

  pushObjects(hits: ObjectHit[]) {
    const has = (label: ObjectHit['label']) => hits.some((h) => h.label === label && h.confidence > 0.5)
    const phone = has('cell phone')
    const laptop = has('laptop')
    const book = has('book')

    if (phone) {
      this.phoneConsec += 1
      if (this.phoneConsec >= AC.objectConsecSec) this.phoneSeconds += 1
    } else {
      this.phoneConsec = 0
    }
    if (laptop) {
      this.laptopConsec += 1
      if (this.laptopConsec >= AC.objectConsecSec) this.laptopSeconds += 1
    } else {
      this.laptopConsec = 0
    }
    if (book) {
      this.bookConsec += 1
      if (this.bookConsec >= AC.objectConsecSec) this.bookSeconds += 1
    } else {
      this.bookConsec = 0
    }
  }

  snapshot(): AntiCheatStats {
    if (this.samples === 0) return { ...EMPTY_STATS }

    const gaze_off_screen_pct = this.gazeAway / this.samples
    const head_away_pct = this.headAway / this.samples
    const face_missing_pct = this.faceMissing / this.samples
    const eye_closed_pct = this.eyesClosed / this.samples

    const suspicion = clamp01(
      0.30 * gaze_off_screen_pct +
        0.20 * head_away_pct +
        0.20 * Math.min(this.phoneSeconds / 10, 1) +
        0.15 * Math.min(this.multiFaceCount / 5, 1) +
        0.10 * face_missing_pct +
        0.05 * Math.min(this.transitions / 10, 1)
    )

    const flags: AntiCheatFlag[] = []
    if (gaze_off_screen_pct > 0.30)
      flags.push({ kind: 'gaze_away', severity: 'warn', message: `Gaze off-screen ${(gaze_off_screen_pct * 100).toFixed(0)}% of the time` })
    if (head_away_pct > 0.25)
      flags.push({ kind: 'head_away', severity: 'warn', message: `Head turned away ${(head_away_pct * 100).toFixed(0)}% of the time` })
    if (face_missing_pct > 0.15)
      flags.push({ kind: 'face_missing', severity: 'fail', message: `Face not visible ${(face_missing_pct * 100).toFixed(0)}% of the time` })
    if (this.multiFaceCount > 0)
      flags.push({ kind: 'multi_face', severity: 'fail', message: `Second person detected ${this.multiFaceCount}×` })
    if (this.phoneSeconds >= AC.objectConsecSec)
      flags.push({ kind: 'phone', severity: 'fail', message: `Phone visible for ~${this.phoneSeconds}s` })
    if (this.laptopSeconds >= AC.objectConsecSec)
      flags.push({ kind: 'laptop', severity: 'warn', message: `Second laptop visible for ~${this.laptopSeconds}s` })
    if (this.bookSeconds >= AC.objectConsecSec)
      flags.push({ kind: 'book', severity: 'warn', message: `Book/notes visible for ~${this.bookSeconds}s` })
    if (eye_closed_pct > AC.closedEyeFrac)
      flags.push({ kind: 'eyes_closed', severity: 'info', message: `Eyes closed ${(eye_closed_pct * 100).toFixed(0)}% of samples` })
    if (this.transitions > 4)
      flags.push({ kind: 'rapid_transitions', severity: 'warn', message: `Rapid on/off-camera ${this.transitions}×` })

    return {
      gaze_off_screen_pct,
      head_away_pct,
      face_missing_pct,
      eye_closed_pct,
      phone_seconds: this.phoneSeconds,
      laptop_seconds: this.laptopSeconds,
      book_seconds: this.bookSeconds,
      multi_face_seconds: this.multiFaceCount, // each entry ≈ 1 confirmed 2 s window
      face_transitions: this.transitions,
      total_samples: this.samples,
      suspicion_score: suspicion,
      flags,
    }
  }
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x))
}
