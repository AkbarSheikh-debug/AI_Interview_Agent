import { BrainCircuit, User } from 'lucide-react'

interface Message {
  role: 'assistant' | 'user'
  content: string
}

export default function ChatBubble({ msg }: { msg: Message }) {
  const isAI = msg.role === 'assistant'
  return (
    <div className={`flex gap-3 ${isAI ? 'justify-start' : 'justify-end'}`}>
      {isAI && (
        <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center mt-1"
          style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid #6366f1' }}>
          <BrainCircuit className="w-4 h-4" style={{ color: '#6366f1' }} />
        </div>
      )}
      <div className="max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed"
        style={{
          background: isAI ? '#1a1d27' : 'rgba(99,102,241,0.15)',
          border: `1px solid ${isAI ? '#2a2d3e' : 'rgba(99,102,241,0.3)'}`,
          color: isAI ? '#e2e8f0' : '#c7d2fe',
          borderTopLeftRadius: isAI ? '4px' : undefined,
          borderTopRightRadius: !isAI ? '4px' : undefined,
        }}>
        {msg.content}
      </div>
      {!isAI && (
        <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center mt-1"
          style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid #6366f1' }}>
          <User className="w-4 h-4" style={{ color: '#a5b4fc' }} />
        </div>
      )}
    </div>
  )
}
