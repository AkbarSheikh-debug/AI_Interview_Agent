import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { generateReport } from '../lib/api'
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
  strong_hire: '#10b981', hire: '#6366f1', borderline: '#f59e0b', no_hire: '#ef4444',
}
const HIRE_LABELS: Record<string, string> = {
  strong_hire: 'Strong Hire', hire: 'Hire', borderline: 'Borderline', no_hire: 'No Hire',
}

function ScoreBar({ label, score, feedback }: { label: string; score: number; feedback: string }) {
  const color = score >= 7 ? '#10b981' : score >= 5 ? '#f59e0b' : '#ef4444'
  return (
    <div className="p-4 rounded-xl" style={{ background: '#0f1117', border: '1px solid #2a2d3e' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-white">{label}</span>
        <span className="text-lg font-bold" style={{ color }}>{score.toFixed(1)}<span className="text-xs text-gray-500">/10</span></span>
      </div>
      <div className="h-2 rounded-full mb-3" style={{ background: '#2a2d3e' }}>
        <div className="h-2 rounded-full transition-all duration-700"
          style={{ width: `${score * 10}%`, background: color }} />
      </div>
      <p className="text-xs leading-relaxed" style={{ color: '#94a3b8' }}>{feedback}</p>
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
    generateReport(sessionId!)
      .then(({ data }) => { setReport(data); setLoading(false) })
      .catch(() => { setError('Failed to load report.'); setLoading(false) })
  }, [sessionId])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f1117' }}>
      <div className="text-center">
        <div className="w-12 h-12 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p style={{ color: '#94a3b8' }}>Generating your interview report...</p>
      </div>
    </div>
  )

  if (error || !report) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f1117' }}>
      <p style={{ color: '#ef4444' }}>{error || 'No report found.'}</p>
    </div>
  )

  const recColor = HIRE_COLORS[report.hire_recommendation] || '#94a3b8'
  const recLabel = HIRE_LABELS[report.hire_recommendation] || report.hire_recommendation

  return (
    <div className="min-h-screen py-10 px-4" style={{ background: '#0f1117' }}>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => navigate('/')}
            className="p-2 rounded-lg hover:bg-gray-800 transition-colors">
            <ArrowLeft className="w-5 h-5" style={{ color: '#94a3b8' }} />
          </button>
          <BrainCircuit className="w-7 h-7" style={{ color: '#6366f1' }} />
          <div>
            <h1 className="text-2xl font-bold text-white">Interview Report</h1>
            <p style={{ color: '#94a3b8' }} className="text-sm">{report.candidate_name}</p>
          </div>
        </div>

        {/* Composite + Recommendation */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-6 rounded-2xl text-center"
            style={{ background: '#1a1d27', border: '1px solid #2a2d3e' }}>
            <TrendingUp className="w-8 h-8 mx-auto mb-2" style={{ color: '#6366f1' }} />
            <div className="text-4xl font-bold text-white mb-1">{report.composite_score.toFixed(1)}</div>
            <div style={{ color: '#94a3b8' }} className="text-sm">Composite Score / 10</div>
          </div>
          <div className="p-6 rounded-2xl text-center"
            style={{ background: '#1a1d27', border: `1px solid ${recColor}` }}>
            {report.hire_recommendation === 'strong_hire' || report.hire_recommendation === 'hire'
              ? <CheckCircle className="w-8 h-8 mx-auto mb-2" style={{ color: recColor }} />
              : report.hire_recommendation === 'borderline'
              ? <AlertCircle className="w-8 h-8 mx-auto mb-2" style={{ color: recColor }} />
              : <XCircle className="w-8 h-8 mx-auto mb-2" style={{ color: recColor }} />}
            <div className="text-2xl font-bold mb-1" style={{ color: recColor }}>{recLabel}</div>
            <div style={{ color: '#94a3b8' }} className="text-sm">Recommendation</div>
          </div>
        </div>

        {/* Overall Summary */}
        <div className="p-5 rounded-2xl mb-6"
          style={{ background: '#1a1d27', border: '1px solid #2a2d3e' }}>
          <h2 className="text-sm font-semibold text-white mb-2 uppercase tracking-wider">Overall Assessment</h2>
          <p className="text-sm leading-relaxed" style={{ color: '#94a3b8' }}>{report.overall_summary}</p>
        </div>

        {/* Phase Scores */}
        <h2 className="text-sm font-semibold text-white mb-3 uppercase tracking-wider">Phase Breakdown</h2>
        <div className="space-y-3 mb-6">
          <ScoreBar label="Phase 2 — Deep Dive Project #1" score={report.phase2_score} feedback={report.phase2_feedback} />
          <ScoreBar label="Phase 3 — Deep Dive Project #2" score={report.phase3_score} feedback={report.phase3_feedback} />
          <ScoreBar label="Phase 4 — Factual ML Knowledge" score={report.phase4_score} feedback={report.phase4_feedback} />
          <ScoreBar label="Phase 5 — Behavioral" score={report.phase5_score} feedback={report.phase5_feedback} />
        </div>

        {/* Behavioural Assessment (facial analysis) */}
        {report.facial_score !== undefined && (
          <div className="p-5 rounded-2xl mb-6"
            style={{ background: '#1a1d27', border: '1px solid #2a2d3e' }}>
            <h2 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full inline-block"
                style={{ background: report.facial_available ? '#10b981' : '#94a3b8' }} />
              Behavioural Assessment
            </h2>

            {!report.facial_available ? (
              <p className="text-xs" style={{ color: '#94a3b8' }}>
                Camera access unavailable — facial assessment skipped. Neutral score (5.0) applied.
              </p>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-white">Confidence &amp; Composure</span>
                  <span className="text-lg font-bold"
                    style={{ color: report.facial_score >= 7 ? '#10b981' : report.facial_score >= 5 ? '#f59e0b' : '#ef4444' }}>
                    {report.facial_score.toFixed(1)}
                    <span className="text-xs text-gray-500">/10</span>
                  </span>
                </div>
                <div className="h-2 rounded-full mb-3" style={{ background: '#2a2d3e' }}>
                  <div className="h-2 rounded-full transition-all duration-700"
                    style={{
                      width: `${report.facial_score * 10}%`,
                      background: report.facial_score >= 7 ? '#10b981' : report.facial_score >= 5 ? '#f59e0b' : '#ef4444',
                    }} />
                </div>
                <p className="text-xs leading-relaxed" style={{ color: '#94a3b8' }}>
                  Scored from facial expression signals (smile, brow calmness, eye openness, head stability)
                  sampled throughout the interview. This contributes 10% to the composite score.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Interview Integrity (anti-cheat) */}
        {report.integrity_score !== undefined && (
          <div className="p-5 rounded-2xl mb-6"
            style={{
              background: '#1a1d27',
              border: `1px solid ${report.integrity_flag ? '#ef4444' : '#2a2d3e'}`,
            }}>
            <h2 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider flex items-center gap-2">
              {report.integrity_flag
                ? <ShieldAlert className="w-4 h-4" style={{ color: '#ef4444' }} />
                : <Shield className="w-4 h-4" style={{ color: '#10b981' }} />}
              Interview Integrity
            </h2>

            {!report.integrity_available ? (
              <p className="text-xs" style={{ color: '#94a3b8' }}>
                Integrity monitoring unavailable — camera access denied or skipped. Neutral score (5.0) applied.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-white">
                    Integrity Score
                    {report.integrity_flag && (
                      <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-semibold"
                        style={{ background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid #ef4444' }}>
                        REVIEW FLAGGED
                      </span>
                    )}
                  </span>
                  <span className="text-lg font-bold"
                    style={{ color: report.integrity_score >= 7 ? '#10b981' : report.integrity_score >= 5 ? '#f59e0b' : '#ef4444' }}>
                    {report.integrity_score.toFixed(1)}
                    <span className="text-xs text-gray-500">/10</span>
                  </span>
                </div>
                <div className="h-2 rounded-full mb-3" style={{ background: '#2a2d3e' }}>
                  <div className="h-2 rounded-full transition-all duration-700"
                    style={{
                      width: `${report.integrity_score * 10}%`,
                      background: report.integrity_score >= 7 ? '#10b981' : report.integrity_score >= 5 ? '#f59e0b' : '#ef4444',
                    }} />
                </div>
                <p className="text-xs leading-relaxed" style={{ color: '#94a3b8' }}>
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
          <div className="p-4 rounded-2xl" style={{ background: '#1a1d27', border: '1px solid #2a2d3e' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: '#10b981' }}>Strengths</h3>
            <ul className="space-y-2">
              {report.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-xs" style={{ color: '#94a3b8' }}>
                  <CheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: '#10b981' }} />
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="p-4 rounded-2xl" style={{ background: '#1a1d27', border: '1px solid #2a2d3e' }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: '#f59e0b' }}>Areas to Improve</h3>
            <ul className="space-y-2">
              {report.areas_for_improvement.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-xs" style={{ color: '#94a3b8' }}>
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: '#f59e0b' }} />
                  {a}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Print button */}
        <div className="flex justify-center">
          <button onClick={() => window.print()}
            className="px-6 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{ background: '#6366f1', color: 'white' }}>
            Export / Print Report
          </button>
        </div>
      </div>
    </div>
  )
}
