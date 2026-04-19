/**
 * Right-side PiP that mirrors the candidate's webcam and shows live integrity status.
 * Uses the MediaStream provided by FaceAnalyzer so the camera is never opened twice.
 */

import { useEffect, useRef } from 'react'
import { AlertTriangle, CheckCircle2, CircleSlash, Shield } from 'lucide-react'
import type { AntiCheatStats } from '../lib/antiCheat'

interface Props {
  stream: MediaStream | null
  stats: AntiCheatStats | null
  cameraStatus: 'idle' | 'requesting' | 'denied' | 'loading' | 'active' | 'error'
}

export default function CandidateCameraPanel({ stream, stats, cameraStatus }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
      videoRef.current.play().catch(() => null)
    }
  }, [stream])

  const integrity = stats ? Math.round((1 - stats.suspicion_score) * 100) / 10 : null
  const integrityColor =
    integrity === null ? '#94a3b8' : integrity >= 8 ? '#10b981' : integrity >= 5 ? '#f59e0b' : '#ef4444'

  return (
    <div
      className="flex flex-col gap-3 p-3 h-full overflow-y-auto"
      style={{ background: '#0b0d1e', borderLeft: '1px solid #2a2d3e' }}
    >
      {/* ── Video tile ─────────────────────────────────────────────── */}
      <div
        className="relative rounded-xl overflow-hidden flex-shrink-0"
        style={{ aspectRatio: '4 / 3', background: '#0f1117', border: '1px solid #2a2d3e' }}
      >
        {stream ? (
          <video
            ref={videoRef}
            muted
            playsInline
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' /* mirror like Zoom */ }}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-xs" style={{ color: '#64748b' }}>
            <CircleSlash className="w-6 h-6 mb-1" />
            {cameraStatus === 'loading' && 'Loading…'}
            {cameraStatus === 'requesting' && 'Requesting camera…'}
            {cameraStatus === 'denied' && 'Camera denied'}
            {cameraStatus === 'error' && 'Camera error'}
            {cameraStatus === 'idle' && 'Awaiting permission'}
          </div>
        )}
        {stream && (
          <div className="absolute top-1.5 left-1.5 flex items-center gap-1.5 px-1.5 py-0.5 rounded-md"
            style={{ background: 'rgba(0,0,0,0.5)' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#ef4444' }} />
            <span className="text-[10px] font-semibold text-white tracking-widest">LIVE</span>
          </div>
        )}
      </div>

      {/* ── Integrity header ─────────────────────────────────────── */}
      <div
        className="rounded-xl p-3 flex-shrink-0"
        style={{ background: '#0f1117', border: '1px solid #2a2d3e' }}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <Shield className="w-4 h-4" style={{ color: integrityColor }} />
          <span className="text-xs font-semibold text-white">Interview Integrity</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold" style={{ color: integrityColor }}>
            {integrity !== null ? integrity.toFixed(1) : '—'}
          </span>
          <span className="text-xs" style={{ color: '#64748b' }}>/ 10</span>
        </div>
        <div className="h-1.5 rounded-full mt-2" style={{ background: '#2a2d3e' }}>
          <div
            className="h-1.5 rounded-full transition-all duration-500"
            style={{
              width: `${((integrity ?? 0) / 10) * 100}%`,
              background: integrityColor,
            }}
          />
        </div>
      </div>

      {/* ── Signal list ───────────────────────────────────────────── */}
      <div
        className="rounded-xl p-3 flex-1 min-h-0"
        style={{ background: '#0f1117', border: '1px solid #2a2d3e' }}
      >
        <div className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: '#64748b' }}>
          Signals
        </div>

        {!stats || stats.total_samples === 0 ? (
          <p className="text-[11px]" style={{ color: '#64748b' }}>
            Waiting for first sample…
          </p>
        ) : (
          <ul className="space-y-1.5">
            {stats.flags.length === 0 && (
              <li className="flex items-center gap-2 text-[11px]" style={{ color: '#6ee7b7' }}>
                <CheckCircle2 className="w-3.5 h-3.5" /> All clear
              </li>
            )}
            {stats.flags.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px]"
                style={{ color: f.severity === 'fail' ? '#fca5a5' : f.severity === 'warn' ? '#fcd34d' : '#94a3b8' }}>
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span className="leading-snug">{f.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Footer: raw counters (compact) ─────────────────────────── */}
      {stats && stats.total_samples > 0 && (
        <div className="text-[10px] leading-relaxed px-1 flex-shrink-0" style={{ color: '#475569' }}>
          samples: {stats.total_samples} · phone: {stats.phone_seconds}s · multi-face: {stats.multi_face_seconds}
        </div>
      )}
    </div>
  )
}
