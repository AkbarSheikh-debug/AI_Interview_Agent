import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchReport, generateReport } from '../lib/api'
import { BrainCircuit, TrendingUp, CheckCircle, XCircle, AlertCircle, ArrowLeft, Shield, ShieldAlert } from 'lucide-react'

interface ReportData {
  candidate_name: string
  phase2_score: number; phase2_feedback: string
  phase3_score: number; phase3_feedback: string
  phase4_score: number; phase4_feedback: string
  phase5_score: number; phase5_feedback: string
  composite_score: number
  facial_score?: number
  facial_available?: boolean
  integrity_score?: number
  integrity_available?: boolean
  integrity_flag?: boolean
  overall_summary: string
  hire_recommendation: string
  strengths: string[]
  areas_for_improvement: string[]
}

const HIRE_COLORS: Record<string, string> = {
  strong_hire: '#10b981', hire: '#56c2ff', borderline: '#f59e0b', no_hire: '#ef4444',
}
const HIRE_LABELS: Record<string, string> = {
  strong_hire: 'Strong Hire', hire: 'Hire', borderline: 'Borderline', no_hire: 'No Hire',
}

const CARD = { background: 'linear-gradient(137deg, rgba(17,18,20,.9) 0%, rgba(12,13,15,.95) 100%)', border: '1px solid rgba(255,255,255,0.07)' }
const TRACK = { background: 'rgba(255,255,255,0.06)' }

function scoreColor(s: number) {
  return s >= 7 ? '#10b981' : s >= 5 ? '#f59e0b' : '#ef4444'
}

function ScoreBar({ label, score, feedback }: { label: string; score: number; feedback: string }) {
  const color = scoreColor(score)
  return (
    <div className="p-4 rounded-xl" style={CARD}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>{label}</span>
        <span className="text-lg font-bold" style={{ color }}>
          {score.toFixed(1)}<span className="text-xs ml-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>/10</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full mb-3" style={TRACK}>
        <div className="h-1.5 rounded-full transition-all duration-700"
          style={{ width: `${score * 10}%`, background: color }} />
      </div>
      <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>{feedback}</p>
    </div>
  )
}

export default function Report() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchReport(sessionId!)
      .then(({ data }) => { setReport(data); setLoading(false) })
      .catch(() => {
        const storedModels = sessionId
          ? sessionStorage.getItem(`interview_models_${sessionId}`) : null
        const models = storedModels ? JSON.parse(storedModels) : {}
        generateReport(sessionId!, undefined, undefined, undefined, models.companyId || '', models.companyName || '')
          .then(({ data }) => { setReport(data); setLoading(false) })
          .catch(() => { setError('Failed to load report.'); setLoading(false) })
      })
  }, [sessionId])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#07080a' }}>
      <div className="text-center">
        <div className="w-10 h-10 rounded-full mx-auto mb-4 animate-spin"
          style={{ border: '2px solid rgba(255,255,255,0.06)', borderTopColor: '#ff6363' }} />
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Generating interview report…</p>
      </div>
    </div>
  )

  if (error || !report) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#07080a' }}>
      <p style={{ color: '#ef4444', fontSize: 13 }}>{error || 'No report found.'}</p>
    </div>
  )

  const recColor = HIRE_COLORS[report.hire_recommendation] || 'rgba(255,255,255,0.4)'
  const recLabel = HIRE_LABELS[report.hire_recommendation] || report.hire_recommendation

  return (
    <div className="min-h-screen py-10 px-4" style={{ background: '#07080a', color: 'rgba(255,255,255,0.85)' }}>
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => navigate('/')}
            className="p-2 rounded-lg transition-colors"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <ArrowLeft className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.5)' }} />
          </button>
          <BrainCircuit className="w-6 h-6" style={{ color: '#ff6363' }} />
          <div>
            <h1 className="text-xl font-bold text-white">Interview Report</h1>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{report.candidate_name}</p>
          </div>
        </div>

        {/* Composite + Recommendation */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="p-6 rounded-2xl text-center" style={CARD}>
            <TrendingUp className="w-7 h-7 mx-auto mb-2" style={{ color: '#ff6363' }} />
            <div className="text-4xl font-bold text-white mb-1">{report.composite_score.toFixed(1)}</div>
            <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>Composite Score / 10</div>
          </div>
          <div className="p-6 rounded-2xl text-center" style={{ ...CARD, border: `1px solid ${recColor}30` }}>
            {report.hire_recommendation === 'strong_hire' || report.hire_recommendation === 'hire'
              ? <CheckCircle className="w-7 h-7 mx-auto mb-2" style={{ color: recColor }} />
              : report.hire_recommendation === 'borderline'
              ? <AlertCircle className="w-7 h-7 mx-auto mb-2" style={{ color: recColor }} />
              : <XCircle className="w-7 h-7 mx-auto mb-2" style={{ color: recColor }} />}
            <div className="text-2xl font-bold mb-1" style={{ color: recColor }}>{recLabel}</div>
            <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>Recommendation</div>
          </div>
        </div>

        {/* Overall Summary */}
        <div className="p-5 rounded-2xl mb-5" style={CARD}>
          <h2 className="text-xs font-semibold uppercase tracking-widest mb-2"
            style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em' }}>Overall Assessment</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>{report.overall_summary}</p>
        </div>

        {/* Phase Scores */}
        <h2 className="text-xs font-semibold uppercase tracking-widest mb-3"
          style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em' }}>Phase Breakdown</h2>
        <div className="space-y-3 mb-5">
          <ScoreBar label="Phase 2 — Deep Dive Project #1" score={report.phase2_score} feedback={report.phase2_feedback} />
          <ScoreBar label="Phase 3 — Deep Dive Project #2" score={report.phase3_score} feedback={report.phase3_feedback} />
          <ScoreBar label="Phase 4 — Factual ML Knowledge" score={report.phase4_score} feedback={report.phase4_feedback} />
          <ScoreBar label="Phase 5 — Behavioral" score={report.phase5_score} feedback={report.phase5_feedback} />
        </div>

        {/* Behavioural Assessment */}
        {report.facial_score !== undefined && (
          <div className="p-5 rounded-2xl mb-5" style={CARD}>
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-4 flex items-center gap-2"
              style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em' }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block"
                style={{ background: report.facial_available ? '#10b981' : 'rgba(255,255,255,0.25)' }} />
              Behavioural Assessment
            </h2>
            {!report.facial_available ? (
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Camera was not active during this session. A penalty was applied to the composite score — enable camera in future interviews to improve this dimension.
              </p>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>Confidence &amp; Composure</span>
                  <span className="text-lg font-bold" style={{ color: scoreColor(report.facial_score!) }}>
                    {report.facial_score!.toFixed(1)}<span className="text-xs ml-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>/10</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full mb-3" style={TRACK}>
                  <div className="h-1.5 rounded-full transition-all duration-700"
                    style={{ width: `${report.facial_score! * 10}%`, background: scoreColor(report.facial_score!) }} />
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Scored from facial expression signals (smile, brow calmness, eye openness, head stability)
                  sampled throughout the interview. Contributes 10% to the composite score.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Interview Integrity */}
        {report.integrity_score !== undefined && (
          <div className="p-5 rounded-2xl mb-5" style={{
            ...CARD,
            border: `1px solid ${report.integrity_flag ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.07)'}`,
          }}>
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-4 flex items-center gap-2"
              style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em' }}>
              {report.integrity_flag
                ? <ShieldAlert className="w-3.5 h-3.5" style={{ color: '#ef4444' }} />
                : <Shield className="w-3.5 h-3.5" style={{ color: '#10b981' }} />}
              Interview Integrity
            </h2>
            {!report.integrity_available ? (
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Integrity monitoring was unavailable — camera access was not granted. A penalty was applied to the composite; enable camera in future sessions for a full integrity assessment.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
                    Integrity Score
                    {report.integrity_flag && (
                      <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-semibold"
                        style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' }}>
                        REVIEW FLAGGED
                      </span>
                    )}
                  </span>
                  <span className="text-lg font-bold" style={{ color: scoreColor(report.integrity_score!) }}>
                    {report.integrity_score!.toFixed(1)}<span className="text-xs ml-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>/10</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full mb-3" style={TRACK}>
                  <div className="h-1.5 rounded-full transition-all duration-700"
                    style={{ width: `${report.integrity_score! * 10}%`, background: scoreColor(report.integrity_score!) }} />
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Derived from gaze direction, head pose, face count, and in-frame object detection
                  (phone / laptop / book) sampled throughout the interview. Contributes 8% to the composite.
                  Raw signals never leave your browser — only aggregate counters are uploaded.
                </p>
              </>
            )}
          </div>
        )}

        {/* Strengths & Areas */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-4 rounded-2xl" style={CARD}>
            <h3 className="text-xs font-semibold uppercase tracking-widest mb-3"
              style={{ color: '#10b981', letterSpacing: '0.06em' }}>Strengths</h3>
            <ul className="space-y-2">
              {report.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <CheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: '#10b981' }} />
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="p-4 rounded-2xl" style={CARD}>
            <h3 className="text-xs font-semibold uppercase tracking-widest mb-3"
              style={{ color: '#f59e0b', letterSpacing: '0.06em' }}>Areas to Improve</h3>
            <ul className="space-y-2">
              {report.areas_for_improvement.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: '#f59e0b' }} />
                  {a}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Export */}
        <div className="flex justify-center">
          <button onClick={() => window.print()}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: '#ff6363', color: 'white' }}>
            Export / Print Report
          </button>
        </div>
      </div>
    </div>
  )
}
