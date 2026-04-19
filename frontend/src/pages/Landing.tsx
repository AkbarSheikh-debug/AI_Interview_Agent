import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, FileText, Loader2, BrainCircuit, Cpu, Mic } from 'lucide-react'
import { uploadResume, startInterview, getAvailableModels } from '../lib/api'
import type { ModelCatalog } from '../lib/api'

export default function Landing() {
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null)
  const [llmModel, setLlmModel] = useState<string>('')
  const [sttModel, setSttModel] = useState<string>('')

  useEffect(() => {
    getAvailableModels()
      .then((c) => {
        setCatalog(c)
        setLlmModel(c.defaults.llm)
        setSttModel(c.defaults.stt)
      })
      .catch(() => {})
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f?.name.endsWith('.pdf')) setFile(f)
    else setError('Please upload a PDF file.')
  }, [])

  const handleStart = async () => {
    if (!file) return
    setLoading(true)
    setError('')
    try {
      setStatus('Parsing resume with AI...')
      const { data } = await uploadResume(file)
      const { session_id, resume } = data

      setStatus('Initializing interview session...')
      const startResp = await startInterview(session_id, resume, llmModel, sttModel)
      sessionStorage.setItem(`interview_models_${session_id}`, JSON.stringify({ llmModel, sttModel }))
      // Store first interviewer message for the Interview page to pick up
      sessionStorage.setItem(`interview_${session_id}`, JSON.stringify(startResp.data))

      navigate(`/interview/${session_id}`)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Something went wrong. Check that the backend is running.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #0f1117 0%, #1a1d27 100%)' }}>

      {/* Header */}
      <div className="mb-12 text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
          <BrainCircuit className="w-10 h-10" style={{ color: '#6366f1' }} />
          <h1 className="text-4xl font-bold text-white tracking-tight">Interview Agent</h1>
        </div>
        <p style={{ color: '#94a3b8' }} className="text-lg max-w-md">
          AI-powered mock interview for ML engineers. Upload your resume to begin.
        </p>
      </div>

      {/* Upload Card */}
      <div className="w-full max-w-lg rounded-2xl p-8"
        style={{ background: '#1a1d27', border: '1px solid #2a2d3e' }}>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => document.getElementById('file-input')?.click()}
          className="rounded-xl p-10 text-center cursor-pointer transition-all duration-200"
          style={{
            border: `2px dashed ${dragging ? '#6366f1' : file ? '#10b981' : '#2a2d3e'}`,
            background: dragging ? 'rgba(99,102,241,0.05)' : 'transparent',
          }}>

          <input
            id="file-input"
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) { setFile(f); setError('') }
            }}
          />

          {file ? (
            <div className="flex flex-col items-center gap-3">
              <FileText className="w-12 h-12" style={{ color: '#10b981' }} />
              <p className="font-medium text-white">{file.name}</p>
              <p style={{ color: '#94a3b8' }} className="text-sm">
                {(file.size / 1024).toFixed(0)} KB — Click to change
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Upload className="w-12 h-12" style={{ color: '#6366f1' }} />
              <p className="font-medium text-white">Drop your resume here</p>
              <p style={{ color: '#94a3b8' }} className="text-sm">PDF format only</p>
            </div>
          )}
        </div>

        {catalog && (
          <div className="mt-6 grid grid-cols-1 gap-4">
            <div>
              <label className="flex items-center gap-2 text-xs font-medium mb-1.5"
                style={{ color: '#94a3b8' }}>
                <Cpu className="w-3.5 h-3.5" /> Interviewer LLM
              </label>
              <select
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
                style={{ background: '#0f1117', border: '1px solid #2a2d3e' }}>
                {catalog.llm.map((m) => (
                  <option key={m.id} value={m.id} disabled={!m.available}>
                    {m.label}
                    {m.reasoning ? ' — reasoning' : ''}
                    {m.free ? ' — free' : ' — paid'}
                    {m.available ? '' : ' (no API key)'}
                  </option>
                ))}
              </select>
              {llmModel && (
                <p className="text-xs mt-1" style={{ color: '#64748b' }}>
                  {catalog.llm.find((m) => m.id === llmModel)?.description}
                </p>
              )}
            </div>

            <div>
              <label className="flex items-center gap-2 text-xs font-medium mb-1.5"
                style={{ color: '#94a3b8' }}>
                <Mic className="w-3.5 h-3.5" /> Speech-to-Text
              </label>
              <select
                value={sttModel}
                onChange={(e) => setSttModel(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
                style={{ background: '#0f1117', border: '1px solid #2a2d3e' }}>
                {catalog.stt.map((m) => (
                  <option key={m.id} value={m.id} disabled={!m.available}>
                    {m.label}
                    {m.available ? '' : ' (no API key)'}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-4 text-sm text-center" style={{ color: '#ef4444' }}>{error}</p>
        )}

        {status && (
          <p className="mt-4 text-sm text-center" style={{ color: '#94a3b8' }}>{status}</p>
        )}

        <button
          onClick={handleStart}
          disabled={!file || loading}
          className="mt-6 w-full py-3 px-6 rounded-xl font-semibold text-white transition-all duration-200 flex items-center justify-center gap-2"
          style={{
            background: file && !loading ? '#6366f1' : '#2a2d3e',
            cursor: file && !loading ? 'pointer' : 'not-allowed',
            opacity: file && !loading ? 1 : 0.6,
          }}>
          {loading ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> {status || 'Processing...'}</>
          ) : (
            'Start Interview'
          )}
        </button>
      </div>

      {/* Interview phases legend */}
      <div className="mt-8 flex gap-3 flex-wrap justify-center">
        {['Background', 'Deep Dive #1', 'Deep Dive #2', 'ML Factual', 'Behavioral'].map((p, i) => (
          <span key={i} className="px-3 py-1 rounded-full text-xs font-medium"
            style={{ background: '#1a1d27', border: '1px solid #2a2d3e', color: '#94a3b8' }}>
            Phase {i + 1}: {p}
          </span>
        ))}
      </div>
    </div>
  )
}
