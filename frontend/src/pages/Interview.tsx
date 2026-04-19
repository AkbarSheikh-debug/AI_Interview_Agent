import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Send, Volume2, VolumeX, SkipForward } from 'lucide-react'
import PhaseBar from '../components/PhaseBar'
import ChatBubble from '../components/ChatBubble'
import VoiceRecorder from '../components/VoiceRecorder'
import FaceAnalyzer, { type FacialStats, type AntiCheatFrame } from '../components/FaceAnalyzer'
import AvatarViewer, { type AvatarState, type AvatarViewerHandle } from '../components/AvatarViewer'
import CandidateCameraPanel from '../components/CandidateCameraPanel'
import { sendMessage, skipPhase, speakText, generateReport, submitVisionSummary } from '../lib/api'
import { AntiCheatTracker, type AntiCheatStats } from '../lib/antiCheat'
import { YoloRunner } from '../lib/yoloRunner'

interface Message { role: 'assistant' | 'user'; content: string }

function getInitialState(sessionId: string) {
  const raw = sessionStorage.getItem(`interview_${sessionId}`)
  if (raw) return JSON.parse(raw)
  return null
}

export default function Interview() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()

  const [messages, setMessages] = useState<Message[]>([])
  const [phase, setPhase] = useState(1)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [complete, setComplete] = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(true)
  const [anxietyMsg, setAnxietyMsg] = useState<string | null>(null)

  // ── Avatar state ──────────────────────────────────────────────────────────
  const [avatarState, setAvatarState] = useState<AvatarState>('idle')
  const avatarRef = useRef<AvatarViewerHandle>(null)

  // ── Facial + anti-cheat analysis ──────────────────────────────────────────
  const [facialStats, setFacialStats] = useState<FacialStats | null>(null)
  const [antiCheatStats, setAntiCheatStats] = useState<AntiCheatStats | null>(null)
  const [candidateStream, setCandidateStream] = useState<MediaStream | null>(null)
  const [cameraStatus, setCameraStatus] = useState<
    'idle' | 'requesting' | 'denied' | 'loading' | 'active' | 'error'
  >('idle')

  const trackerRef = useRef<AntiCheatTracker>(new AntiCheatTracker())
  const yoloRef = useRef<YoloRunner | null>(null)
  const yoloVideoRef = useRef<HTMLVideoElement>(null)

  const bottomRef = useRef<HTMLDivElement>(null)

  // Feed anti-cheat frames into the tracker; snapshot → state every call
  const handleAntiCheatFrame = useCallback((f: AntiCheatFrame) => {
    trackerRef.current.pushFrame(f)
    setAntiCheatStats(trackerRef.current.snapshot())
  }, [])

  // When FaceAnalyzer produces a stream, start YOLO on it (if supported)
  const handleStreamReady = useCallback((stream: MediaStream) => {
    setCandidateStream(stream)

    if (!YoloRunner.isSupported()) return
    if (!yoloVideoRef.current) return

    yoloVideoRef.current.srcObject = stream
    yoloVideoRef.current.play().catch(() => null)

    if (!yoloRef.current) {
      yoloRef.current = new YoloRunner((hits) => {
        trackerRef.current.pushObjects(hits)
        setAntiCheatStats(trackerRef.current.snapshot())
      })
      yoloRef.current.start(yoloVideoRef.current)
    }
  }, [])

  useEffect(() => {
    const state = getInitialState(sessionId!)
    if (state) {
      setMessages([{ role: 'assistant', content: state.message }])
      setPhase(state.phase)
      if (ttsEnabled) playTTS(state.message)
    }
  }, [sessionId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, anxietyMsg])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (avatarRef.current) avatarRef.current.stopAudio()
      window.speechSynthesis?.cancel()
      if (yoloRef.current) yoloRef.current.stop()
    }
  }, [])

  // ── TTS ───────────────────────────────────────────────────────────────────
  const playBrowserTTS = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    if (avatarRef.current) avatarRef.current.stopAudio()

    setAvatarState('speaking')
    const utt = new SpeechSynthesisUtterance(text)
    utt.rate = 0.92
    utt.pitch = 1.0
    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find(v =>
      v.name.toLowerCase().includes('david') || v.name.toLowerCase().includes('mark')
    )
    if (preferred) utt.voice = preferred
    utt.onend = () => setAvatarState('idle')
    window.speechSynthesis.speak(utt)
  }, [])

  const playTTS = useCallback(async (text: string) => {
    if (!ttsEnabled) return
    try {
      window.speechSynthesis?.cancel()
      if (avatarRef.current) avatarRef.current.stopAudio()

      setAvatarState('speaking')

      const url = await speakText(text)
      const response = await fetch(url)
      const arrayBuffer = await response.arrayBuffer()

      const audioCtx = new AudioContext()
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)

      if (avatarRef.current) {
        avatarRef.current.speakAudio(audioBuffer, text)
        setTimeout(() => setAvatarState('idle'), audioBuffer.duration * 1000)
      } else {
        setAvatarState('idle')
      }
    } catch {
      playBrowserTTS(text)
    }
  }, [ttsEnabled, playBrowserTTS])

  // ── Finish: submit vision summary + generate report ──────────────────────
  const finishAndReport = useCallback(async () => {
    let facialScore: number | undefined
    let integrityScore: number | undefined
    let integrityFlag: boolean | undefined

    const haveFacial = facialStats && facialStats.sampleCount > 0
    const haveIntegrity = antiCheatStats && antiCheatStats.total_samples > 0

    if (haveFacial || haveIntegrity) {
      try {
        const payload = haveFacial ? facialStats! : {
          smileAvg: 0, browFurrowAvg: 0, eyeWideAvg: 0,
          jawOpenLow: 0, headStability: 1, expressionVariance: 0,
          sampleCount: 0,
        }
        const { data: vs } = await submitVisionSummary(payload, antiCheatStats)
        facialScore = vs.score
        integrityScore = vs.integrity_score
        integrityFlag = vs.integrity_flag
      } catch { /* backend will default */ }
    }
    await generateReport(sessionId!, facialScore, integrityScore, integrityFlag)
    navigate(`/report/${sessionId}`)
  }, [facialStats, antiCheatStats, sessionId, navigate])

  // ── Send / skip ───────────────────────────────────────────────────────────
  const handleSend = async (text?: string) => {
    const msg = text || input.trim()
    if (!msg || sending || complete) return
    setInput('')
    setSending(true)
    setAnxietyMsg(null)
    setAvatarState('listening')
    setMessages(prev => [...prev, { role: 'user', content: msg }])

    try {
      const { data } = await sendMessage(sessionId!, msg)
      setAvatarState('thinking')
      setMessages(prev => [...prev, { role: 'assistant', content: data.message }])
      setPhase(data.phase)
      if (ttsEnabled) await playTTS(data.message)
      else setAvatarState('idle')

      if (data.complete) {
        setComplete(true)
        setTimeout(finishAndReport, 2000)
      }
    } catch {
      setAvatarState('idle')
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'There was a connection issue. Please try again.',
      }])
    } finally {
      setSending(false)
    }
  }

  const handleSkip = async () => {
    if (sending || complete) return
    setSending(true)
    setAvatarState('thinking')
    try {
      const { data } = await skipPhase(sessionId!)
      setMessages(prev => [...prev, { role: 'assistant', content: data.message }])
      setPhase(data.phase)
      if (ttsEnabled) await playTTS(data.message)
      else setAvatarState('idle')

      if (data.complete) {
        setComplete(true)
        setTimeout(finishAndReport, 2000)
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-screen" style={{ background: '#0f1117' }}>
      {/* Hidden video fed to YOLO — same stream as the visible PiP */}
      <video ref={yoloVideoRef} muted playsInline style={{ display: 'none' }} />

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid #2a2d3e', background: '#1a1d27' }}>
        <span className="font-semibold text-white text-sm">AI Interview Agent</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setTtsEnabled(!ttsEnabled)}
            className="p-2 rounded-lg transition-colors"
            style={{ color: ttsEnabled ? '#6366f1' : '#94a3b8' }}
            title={ttsEnabled ? 'Mute interviewer voice' : 'Unmute interviewer voice'}>
            {ttsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button onClick={handleSkip} disabled={sending || complete}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ border: '1px solid #2a2d3e', color: '#94a3b8' }}
            title="Skip to next phase">
            <SkipForward className="w-3.5 h-3.5" /> Skip Phase
          </button>
        </div>
      </div>

      {/* ── Phase bar ── */}
      <PhaseBar current={phase} />

      {/* ── Content: Avatar (25%) · Chat (55%) · Camera/Integrity (20%) ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Avatar panel */}
        <div className="relative flex-shrink-0 flex flex-col"
          style={{ width: '25%', borderRight: '1px solid #2a2d3e', background: '#0b0d1e' }}>
          <AvatarViewer ref={avatarRef} state={avatarState} mouthOpen={0} />

          {/* FaceAnalyzer (invisible — drives camera + MediaPipe) */}
          <FaceAnalyzer
            active={!complete}
            onStatsUpdate={setFacialStats}
            onAntiCheatFrame={handleAntiCheatFrame}
            onStreamReady={handleStreamReady}
            onStatusChange={setCameraStatus}
          />
        </div>

        {/* Chat panel */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ borderRight: '1px solid #2a2d3e' }}>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((m, i) => <ChatBubble key={i} msg={m} />)}

            {anxietyMsg && (
              <div className="flex justify-center">
                <div className="px-4 py-2 rounded-xl text-sm italic"
                  style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#fcd34d' }}>
                  {anxietyMsg}
                </div>
              </div>
            )}

            {complete && (
              <div className="flex justify-center">
                <div className="px-5 py-3 rounded-xl text-sm font-medium"
                  style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid #10b981', color: '#6ee7b7' }}>
                  Interview complete — generating your report...
                </div>
              </div>
            )}

            {sending && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid #6366f1' }}>
                  <span className="text-xs text-indigo-400">AI</span>
                </div>
                <div className="px-4 py-3 rounded-2xl flex gap-1 items-center"
                  style={{ background: '#1a1d27', border: '1px solid #2a2d3e' }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} className="w-2 h-2 rounded-full animate-bounce"
                      style={{ background: '#6366f1', animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Right-side candidate camera + integrity panel */}
        <div className="flex-shrink-0" style={{ width: '20%' }}>
          <CandidateCameraPanel
            stream={candidateStream}
            stats={antiCheatStats}
            cameraStatus={cameraStatus}
          />
        </div>
      </div>

      {/* ── Input bar ── */}
      {!complete && (
        <div className="p-4 flex-shrink-0" style={{ borderTop: '1px solid #2a2d3e', background: '#1a1d27' }}>
          <div className="flex items-end gap-2 max-w-4xl mx-auto">
            <VoiceRecorder
              onTranscript={(t) => {
                setInput(t)
                setTimeout(() => document.getElementById('answer-input')?.focus(), 100)
              }}
              onAnxious={(m) => setAnxietyMsg(m)}
              disabled={sending}
              onRecordingChange={(isRecording) => {
                if (isRecording) setAvatarState('listening')
                else if (avatarState === 'listening') setAvatarState('idle')
              }}
            />
            <textarea
              id="answer-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
              }}
              placeholder="Speak or type your answer… (Enter to send)"
              rows={2}
              disabled={sending}
              className="flex-1 resize-none px-4 py-3 rounded-xl text-sm outline-none transition-all"
              style={{
                background: '#0f1117',
                border: '1px solid #2a2d3e',
                color: '#e2e8f0',
                fontSize: '14px',
                lineHeight: '1.5',
              }}
            />
            <button onClick={() => handleSend()} disabled={!input.trim() || sending}
              className="p-3 rounded-xl transition-all duration-200"
              style={{
                background: input.trim() && !sending ? '#6366f1' : '#2a2d3e',
                color: 'white',
                cursor: input.trim() && !sending ? 'pointer' : 'not-allowed',
              }}>
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
