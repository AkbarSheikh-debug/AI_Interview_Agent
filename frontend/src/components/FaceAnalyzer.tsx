/**
 * FaceAnalyzer — composure + anti-cheat signal source
 *
 * Opens the webcam (single getUserMedia), loads MediaPipe FaceLandmarker,
 * samples blendshapes + face-transformation matrix every 2 s, and emits:
 *
 *   - FacialStats        : composure signals (existing)
 *   - AntiCheatFrame     : per-sample gaze / head-pose / face-count (new)
 *   - MediaStream        : the raw stream, shared with <CandidateCameraPanel>
 *
 * The <video> element is still used internally for MediaPipe, but we expose
 * the MediaStream upward so the PiP panel can render the same feed without
 * opening the camera twice.
 */

import { useEffect, useRef, useState, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────
export interface FacialStats {
  smileAvg: number
  browFurrowAvg: number
  eyeWideAvg: number
  jawOpenLow: number
  headStability: number
  expressionVariance: number
  sampleCount: number
}

export interface AntiCheatFrame {
  // All angles in degrees. Yaw > 0 = looking right; pitch > 0 = looking up.
  headYaw: number
  headPitch: number
  // Gaze is a 2D offset of the iris within the eye socket, in units of eye width.
  // ±0.5 is roughly at the corner of the eye.
  gazeX: number
  gazeY: number
  faceCount: number
  eyesClosed: boolean
  timestamp: number
}

type CameraStatus = 'idle' | 'requesting' | 'denied' | 'loading' | 'active' | 'error'

interface Props {
  active: boolean
  onStatsUpdate: (stats: FacialStats) => void
  onAntiCheatFrame?: (frame: AntiCheatFrame) => void
  onStreamReady?: (stream: MediaStream) => void
  onStatusChange?: (status: CameraStatus) => void
}

// Rolling average helper
function rollingAvg(prev: number, next: number, n: number): number {
  return (prev * (n - 1) + next) / n
}

// Extract Euler yaw/pitch/roll (degrees) from a MediaPipe 4×4 facialTransformationMatrix.
// The matrix is column-major; rotation is the top-left 3×3.
function matrixToEuler(m: number[]): { yaw: number; pitch: number; roll: number } {
  // Column-major: m[col * 4 + row]
  const r00 = m[0],  r10 = m[1],  r20 = m[2]
  const r01 = m[4],  /* r11 */    r21 = m[6]
  const r02 = m[8],  r12 = m[9],  r22 = m[10]

  const sy = Math.sqrt(r00 * r00 + r10 * r10)
  let pitch: number, yaw: number, roll: number
  if (sy > 1e-6) {
    pitch = Math.atan2(-r21, r22)
    yaw = Math.atan2(r20, sy)
    roll = Math.atan2(r10, r00)
  } else {
    pitch = Math.atan2(r12, -r02)
    yaw = Math.atan2(-r20, sy)
    roll = 0
  }
  const deg = (x: number) => (x * 180) / Math.PI
  return { yaw: deg(yaw), pitch: deg(pitch), roll: deg(roll) }
}

// ── Component ──────────────────────────────────────────────────────────────
export default function FaceAnalyzer({
  active,
  onStatsUpdate,
  onAntiCheatFrame,
  onStreamReady,
  onStatusChange,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const landmarkerRef = useRef<any>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const statsRef = useRef<FacialStats>({
    smileAvg: 0,
    browFurrowAvg: 0,
    eyeWideAvg: 0,
    jawOpenLow: 0,
    headStability: 1,
    expressionVariance: 0,
    sampleCount: 0,
  })
  const prevBlendshapes = useRef<Record<string, number>>({})

  const [status, setStatus] = useState<CameraStatus>('idle')
  const [dismissed, setDismissed] = useState(false)

  // Keep onStatusChange in sync
  useEffect(() => { onStatusChange?.(status) }, [status, onStatusChange])

  // ── Request camera + load MediaPipe ──────────────────────────────────────
  const initialize = useCallback(async () => {
    setStatus('requesting')

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 480, height: 360, facingMode: 'user' },
      })
      streamRef.current = stream
      onStreamReady?.(stream)
    } catch {
      setStatus('denied')
      onStatsUpdate({ ...statsRef.current, sampleCount: 0 })
      return
    }

    if (videoRef.current) {
      videoRef.current.srcObject = stream
      await videoRef.current.play().catch(() => null)
    }

    setStatus('loading')
    try {
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')

      const filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm'
      )
      const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'CPU',
        },
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        runningMode: 'VIDEO',
        numFaces: 2, // up to 2 so we can detect multi-person cheating
      })
      landmarkerRef.current = landmarker
      setStatus('active')
      startSampling()
    } catch {
      setStatus('error')
      onStatsUpdate({ ...statsRef.current, sampleCount: 0 })
      stopCamera()
    }
  }, [onStatsUpdate, onStreamReady])

  // ── Sampling loop (every 2 s) ────────────────────────────────────────────
  const startSampling = useCallback(() => {
    intervalRef.current = setInterval(() => {
      const video = videoRef.current
      const landmarker = landmarkerRef.current
      if (!video || !landmarker || video.readyState < 2) return

      try {
        const result = landmarker.detectForVideo(video, performance.now())
        const faceCount: number = result?.faceBlendshapes?.length ?? 0

        // Emit anti-cheat frame even when face is absent — needed for "face missing" signal
        if (faceCount === 0) {
          onAntiCheatFrame?.({
            headYaw: 0,
            headPitch: 0,
            gazeX: 0,
            gazeY: 0,
            faceCount: 0,
            eyesClosed: false,
            timestamp: Date.now(),
          })
          return
        }

        const blendshapes = result.faceBlendshapes[0].categories
        const bs: Record<string, number> = {}
        for (const cat of blendshapes) bs[cat.categoryName] = cat.score

        const n = statsRef.current.sampleCount + 1

        // ── Composure signals (existing) ─────────────────────────────────
        const smile = ((bs['mouthSmileLeft'] ?? 0) + (bs['mouthSmileRight'] ?? 0)) / 2
        const browFurrow = ((bs['browDownLeft'] ?? 0) + (bs['browDownRight'] ?? 0)) / 2
        const eyeWide = ((bs['eyeWideLeft'] ?? 0) + (bs['eyeWideRight'] ?? 0)) / 2
        const jawOpen = bs['jawOpen'] ?? 0.3

        const mouthLeft = bs['mouthLeft'] ?? 0
        const prevMouthLeft = prevBlendshapes.current['mouthLeft'] ?? mouthLeft
        const headMovement = Math.abs(mouthLeft - prevMouthLeft)
        const stability = Math.max(0, 1 - headMovement * 10)

        const vals = [smile, browFurrow, eyeWide, jawOpen]
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length
        const variance = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length)

        const s = statsRef.current
        statsRef.current = {
          smileAvg: rollingAvg(s.smileAvg, smile, n),
          browFurrowAvg: rollingAvg(s.browFurrowAvg, browFurrow, n),
          eyeWideAvg: rollingAvg(s.eyeWideAvg, eyeWide, n),
          jawOpenLow: rollingAvg(s.jawOpenLow, jawOpen < 0.15 ? 1 : 0, n),
          headStability: rollingAvg(s.headStability, stability, n),
          expressionVariance: rollingAvg(s.expressionVariance, variance, n),
          sampleCount: n,
        }
        prevBlendshapes.current = bs
        onStatsUpdate({ ...statsRef.current })

        // ── Anti-cheat signals ───────────────────────────────────────────
        // Head pose from facialTransformationMatrix (if available)
        let yaw = 0, pitch = 0
        const tm = result?.facialTransformationMatrixes?.[0]?.data
        if (tm && tm.length >= 16) {
          const euler = matrixToEuler(Array.from(tm))
          yaw = euler.yaw
          pitch = euler.pitch
        }

        // Gaze proxy from blendshapes. eyeLookOut/In/Up/Down are 0–1.
        const lookLeft = (bs['eyeLookOutLeft'] ?? 0) - (bs['eyeLookInLeft'] ?? 0)
        const lookRight = (bs['eyeLookOutRight'] ?? 0) - (bs['eyeLookInRight'] ?? 0)
        const lookUp = ((bs['eyeLookUpLeft'] ?? 0) + (bs['eyeLookUpRight'] ?? 0)) / 2
        const lookDown = ((bs['eyeLookDownLeft'] ?? 0) + (bs['eyeLookDownRight'] ?? 0)) / 2
        // Left-eye looks "out" to the right (camera POV), right-eye looks "out" to the left.
        // Average -> signed horizontal gaze direction (positive = looking candidate's right).
        const gazeX = (lookLeft - lookRight) / 2
        const gazeY = lookUp - lookDown

        const blinkL = bs['eyeBlinkLeft'] ?? 0
        const blinkR = bs['eyeBlinkRight'] ?? 0
        const eyesClosed = blinkL > 0.6 && blinkR > 0.6

        onAntiCheatFrame?.({
          headYaw: yaw,
          headPitch: pitch,
          gazeX,
          gazeY,
          faceCount,
          eyesClosed,
          timestamp: Date.now(),
        })
      } catch {
        // transient frame errors are expected
      }
    }, 2000)
  }, [onStatsUpdate, onAntiCheatFrame])

  const stopCamera = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  useEffect(() => {
    if (active && status === 'idle' && !dismissed) {
      const t = setTimeout(initialize, 1500)
      return () => clearTimeout(t)
    }
  }, [active, status, dismissed, initialize])

  useEffect(() => {
    return () => stopCamera()
  }, [stopCamera])

  // ── Permission prompt ────────────────────────────────────────────────────
  if (status === 'idle' && !dismissed) {
    return (
      <div className="absolute bottom-20 left-2 right-2 z-10">
        <div
          className="p-3 rounded-xl text-xs"
          style={{ background: 'rgba(15,17,23,0.95)', border: '1px solid #2a2d3e' }}
        >
          <p className="text-white font-medium mb-2">Enable behavioural + integrity assessment?</p>
          <p style={{ color: '#94a3b8' }} className="mb-3 leading-relaxed">
            Your camera lets us score confidence/composure and detect off-screen gaze or phone use.
            Video is shown only to you and is never uploaded — only aggregated numeric signals.
          </p>
          <div className="flex gap-2">
            <button
              onClick={initialize}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ background: '#6366f1', color: 'white' }}
            >
              Allow camera
            </button>
            <button
              onClick={() => {
                setDismissed(true)
                onStatsUpdate({ ...statsRef.current, sampleCount: 0 })
              }}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ background: '#2a2d3e', color: '#94a3b8' }}
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Hidden video — the visible PiP uses its own <video> bound to the same MediaStream */}
      <video ref={videoRef} muted playsInline style={{ display: 'none', width: 480, height: 360 }} />

      {/* Status indicator */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
        {status === 'active' && (
          <>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#10b981' }} />
            <span className="text-xs" style={{ color: '#6ee7b7' }}>
              Assessment active
            </span>
          </>
        )}
        {status === 'loading' && (
          <span className="text-xs" style={{ color: '#94a3b8' }}>
            Loading analysis…
          </span>
        )}
        {status === 'denied' && (
          <span className="text-xs" style={{ color: '#94a3b8' }}>
            Assessment skipped
          </span>
        )}
        {status === 'error' && (
          <span className="text-xs" style={{ color: '#94a3b8' }}>
            Assessment unavailable
          </span>
        )}
      </div>
    </>
  )
}
