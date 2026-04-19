import axios from 'axios'
import type { FacialStats } from '../components/FaceAnalyzer'
import type { AntiCheatStats } from './antiCheat'

const api = axios.create({ baseURL: '/api' })

export const uploadResume = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/resume/upload', form)
}

export interface ModelEntry {
  id: string
  label: string
  provider: string
  free: boolean
  reasoning?: boolean
  description: string
  signup_url: string
  available: boolean
}

export interface ModelCatalog {
  llm: ModelEntry[]
  stt: ModelEntry[]
  defaults: { llm: string; stt: string }
}

export const getAvailableModels = () =>
  api.get<ModelCatalog>('/config/models').then((r) => r.data)

export const startInterview = (
  sessionId: string,
  resume: object,
  llmModel?: string,
  sttModel?: string,
) =>
  api.post('/interview/start', {
    session_id: sessionId,
    resume,
    llm_model: llmModel,
    stt_model: sttModel,
  })

export const sendMessage = (sessionId: string, message: string) =>
  api.post('/interview/message', { session_id: sessionId, message })

export const skipPhase = (sessionId: string) =>
  api.post('/interview/skip-phase', { session_id: sessionId })

export const transcribeAudio = (blob: Blob, duration: number, ext: string = 'webm') => {
  const form = new FormData()
  form.append('file', blob, `audio.${ext}`)
  form.append('duration', String(duration))
  return api.post('/voice/transcribe', form)
}

export const generateReport = (
  sessionId: string,
  facialScore?: number,
  integrityScore?: number,
  integrityFlag?: boolean,
) => {
  const params: Record<string, unknown> = {}
  if (facialScore !== undefined) params.facial_score = facialScore
  if (integrityScore !== undefined) params.integrity_score = integrityScore
  if (integrityFlag !== undefined) params.integrity_flag = integrityFlag
  return api.get(`/report/generate/${sessionId}`, { params })
}

export const speakText = async (text: string): Promise<string> => {
  const resp = await api.post('/voice/speak', { text }, { responseType: 'blob' })
  return URL.createObjectURL(resp.data)
}

export const submitVisionSummary = (
  stats: FacialStats,
  antiCheat?: AntiCheatStats | null,
) =>
  api.post('/vision/summary', {
    smileAvg: stats.smileAvg,
    browFurrowAvg: stats.browFurrowAvg,
    eyeWideAvg: stats.eyeWideAvg,
    jawOpenLow: stats.jawOpenLow,
    headStability: stats.headStability,
    expressionVariance: stats.expressionVariance,
    sampleCount: stats.sampleCount,
    // Anti-cheat block — optional, backend returns integrity_score 5.0 if missing
    gazeOffScreenPct: antiCheat?.gaze_off_screen_pct ?? null,
    headAwayPct: antiCheat?.head_away_pct ?? null,
    faceMissingPct: antiCheat?.face_missing_pct ?? null,
    eyeClosedPct: antiCheat?.eye_closed_pct ?? null,
    phoneSeconds: antiCheat?.phone_seconds ?? null,
    laptopSeconds: antiCheat?.laptop_seconds ?? null,
    bookSeconds: antiCheat?.book_seconds ?? null,
    multiFaceSeconds: antiCheat?.multi_face_seconds ?? null,
    faceTransitions: antiCheat?.face_transitions ?? null,
    suspicionScore: antiCheat?.suspicion_score ?? null,
    flags: antiCheat?.flags.map((f) => ({ kind: f.kind, severity: f.severity, message: f.message })) ?? null,
  })
