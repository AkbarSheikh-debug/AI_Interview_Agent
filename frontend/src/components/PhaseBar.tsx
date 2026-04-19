const PHASES = ['Background', 'Deep Dive #1', 'Deep Dive #2', 'ML Factual', 'Behavioral']

export default function PhaseBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1 px-4 py-3 overflow-x-auto"
      style={{ borderBottom: '1px solid #2a2d3e' }}>
      {PHASES.map((label, i) => {
        const phase = i + 1
        const done = phase < current
        const active = phase === current
        return (
          <div key={i} className="flex items-center gap-1 flex-shrink-0">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all"
              style={{
                background: active ? 'rgba(99,102,241,0.15)' : done ? 'rgba(16,185,129,0.1)' : 'transparent',
                border: `1px solid ${active ? '#6366f1' : done ? '#10b981' : '#2a2d3e'}`,
              }}>
              <span className="w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold"
                style={{
                  background: active ? '#6366f1' : done ? '#10b981' : '#2a2d3e',
                  color: 'white',
                }}>
                {done ? '✓' : phase}
              </span>
              <span className="text-xs font-medium"
                style={{ color: active ? '#c7d2fe' : done ? '#6ee7b7' : '#94a3b8' }}>
                {label}
              </span>
            </div>
            {i < PHASES.length - 1 && (
              <div className="w-4 h-px" style={{ background: '#2a2d3e' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}
