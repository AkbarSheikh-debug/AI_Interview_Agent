import { useState, useEffect, useRef } from 'react'
import { Mic, Square, Loader2, AlertCircle, CheckCircle } from 'lucide-react'
import { useAudioRecorder } from '../lib/useAudioRecorder'
import { transcribeAudio } from '../lib/api'

interface Props {
  onTranscript: (text: string) => void
  onAnxious: (msg: string) => void
  disabled?: boolean
  onRecordingChange?: (isRecording: boolean) => void
}

export default function VoiceRecorder({ onTranscript, onAnxious, disabled, onRecordingChange }: Props) {
  const { recording, start, stop } = useAudioRecorder()
  const [processing, setProcessing] = useState(false)
  const [sttError, setSttError] = useState<string | null>(null)
  const [sttSuccess, setSttSuccess] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Recording timer
  useEffect(() => {
    if (recording) {
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [recording])

  const handleToggle = async () => {
    if (disabled || processing) return
    setSttError(null)
    setSttSuccess(null)

    if (recording) {
      // Stop and transcribe
      onRecordingChange?.(false)
      setProcessing(true)
      const { blob, duration, ext } = await stop()

      if (blob.size < 500) {
        setProcessing(false)
        setSttError('Too short — speak for at least 1 second, then click Stop.')
        return
      }

      try {
        const { data } = await transcribeAudio(blob, duration, ext)

        if (data.anxious && data.anxiety_message) {
          onAnxious(data.anxiety_message)
        }

        if (data.transcript?.trim()) {
          setSttSuccess(`"${data.transcript.trim().slice(0, 60)}${data.transcript.length > 60 ? '…' : ''}"`)
          onTranscript(data.transcript.trim())
          // Clear success badge after 3s
          setTimeout(() => setSttSuccess(null), 3000)
        } else {
          setSttError('No speech detected — try again or type your answer.')
        }
      } catch (e: any) {
        const detail = e?.response?.data?.detail ?? ''
        if (detail === 'elevenlabs_unavailable') {
          setSttError('TTS unavailable, using browser voice.')
        } else {
          setSttError(detail || 'Transcription failed — check your connection.')
        }
      } finally {
        setProcessing(false)
      }

    } else {
      // Start recording
      try {
        await start()
        onRecordingChange?.(true)
      } catch (err: any) {
        if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
          setSttError('Microphone blocked — allow access in browser settings, then refresh.')
        } else if (err?.name === 'NotFoundError') {
          setSttError('No microphone found. Please connect a microphone.')
        } else {
          setSttError('Could not start recording. Check microphone connection.')
        }
      }
    }
  }

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="flex flex-col gap-1.5">
      <button
        id="voice-btn"
        onClick={handleToggle}
        disabled={disabled || processing}
        title={recording ? 'Click to stop and transcribe' : 'Click to start speaking'}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 select-none"
        style={{
          background: recording
            ? 'rgba(239,68,68,0.18)'
            : processing
            ? 'rgba(99,102,241,0.08)'
            : 'rgba(99,102,241,0.12)',
          border: `1.5px solid ${recording ? '#ef4444' : '#6366f1'}`,
          color: recording ? '#ef4444' : processing ? '#94a3b8' : '#a5b4fc',
          cursor: disabled || processing ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.45 : 1,
          minWidth: '110px',
          boxShadow: recording ? '0 0 12px rgba(239,68,68,0.25)' : 'none',
        }}>

        {processing ? (
          <><Loader2 className="w-4 h-4 animate-spin" /><span>Transcribing…</span></>
        ) : recording ? (
          <>
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>Stop</span>
            {/* Pulsing dot + timer */}
            <span className="flex items-center gap-1 ml-1">
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#ef4444' }} />
              <span className="text-xs font-mono" style={{ color: '#fca5a5' }}>{fmtTime(elapsed)}</span>
            </span>
          </>
        ) : (
          <><Mic className="w-4 h-4" /><span>Speak</span></>
        )}
      </button>

      {/* Recording hint */}
      {recording && (
        <p className="text-xs px-1 animate-pulse" style={{ color: '#fca5a5' }}>
          Listening… click Stop when done.
        </p>
      )}

      {/* Error */}
      {sttError && !recording && (
        <div className="flex items-start gap-1.5 text-xs px-1 max-w-xs">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#f87171' }} />
          <span style={{ color: '#f87171' }}>{sttError}</span>
        </div>
      )}

      {/* Success transcript preview */}
      {sttSuccess && !recording && (
        <div className="flex items-start gap-1.5 text-xs px-1 max-w-xs">
          <CheckCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#34d399' }} />
          <span style={{ color: '#34d399' }}>{sttSuccess}</span>
        </div>
      )}
    </div>
  )
}
