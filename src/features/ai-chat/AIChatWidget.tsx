// ============================================================================
// AI CHAT WIDGET — Floating chatbot widget on all pages
// File: src/features/ai-chat/AIChatWidget.tsx
// Hỏi bất cứ gì về ERP → AI trả lời từ data thật
// ============================================================================

import { useState, useRef, useEffect } from 'react'
import { MessageSquare, X, Send, Loader2, Bot, User, Trash2 } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'

// ============================================================================
// TYPES
// ============================================================================

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function AIChatWidget() {
  const { user } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200)
  }, [open])

  const sendMessage = async () => {
    const q = input.trim()
    if (!q || loading) return

    setInput('')
    setError('')
    const userMsg: ChatMsg = { role: 'user', content: q, timestamp: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      // Build history for context (last 6 messages)
      const history = messages.slice(-6).map(m => ({
        role: m.role,
        content: m.content,
      }))

      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, history }),
      })

      const data = await resp.json()

      if (!resp.ok) {
        throw new Error(data.error || `Lỗi ${resp.status}`)
      }

      const assistantMsg: ChatMsg = { role: 'assistant', content: data.answer, timestamp: Date.now() }
      setMessages(prev => [...prev, assistantMsg])
    } catch (err: any) {
      setError(err.message || 'Không thể kết nối AI')
    } finally {
      setLoading(false)
    }
  }

  const clearHistory = () => {
    setMessages([])
    setError('')
  }

  if (!user) return null

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full shadow-xl flex items-center justify-center text-white transition-all hover:scale-105 active:scale-95"
          style={{ background: 'linear-gradient(135deg, #1B4D3E, #2D8B6E)' }}
        >
          <MessageSquare className="w-6 h-6" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-[380px] max-w-[calc(100vw-40px)] h-[520px] max-h-[calc(100vh-100px)] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 flex items-center justify-between flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #1B4D3E, #2D8B6E)' }}>
            <div className="flex items-center gap-2 text-white">
              <Bot className="w-5 h-5" />
              <div>
                <p className="text-[14px] font-bold leading-tight">Huy Anh AI</p>
                <p className="text-[10px] text-white/70">Hỏi bất cứ gì về công ty</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button onClick={clearHistory} className="p-1.5 rounded-lg hover:bg-white/10 text-white/70" title="Xóa lịch sử">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-gray-50/50">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <Bot className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-[14px] font-semibold text-gray-500 mb-1">Xin chào, {user.full_name?.split(' ').pop()}</p>
                <p className="text-[12px] text-gray-400 mb-4">Hỏi tôi bất cứ gì về hệ thống ERP</p>
                <div className="flex flex-col gap-1.5">
                  {[
                    'Tháng này ai đi trễ nhiều nhất?',
                    'Tôi còn bao nhiêu ngày phép?',
                    'Có task nào quá hạn không?',
                    'Tồn kho SVR10 còn bao nhiêu?',
                  ].map(q => (
                    <button key={q} onClick={() => { setInput(q); setTimeout(sendMessage, 50) }}
                      className="text-left px-3 py-2 rounded-xl bg-white border border-gray-200 text-[12px] text-gray-600 hover:border-emerald-300 hover:bg-emerald-50/50 transition-colors">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-emerald-600 text-white rounded-br-md'
                    : 'bg-white border border-gray-100 text-gray-800 rounded-bl-md shadow-sm'
                }`}>
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-1 mb-1">
                      <Bot className="w-3 h-3 text-emerald-600" />
                      <span className="text-[10px] font-semibold text-emerald-600">AI</span>
                    </div>
                  )}
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                    <span className="text-[12px] text-gray-400">Đang tra cứu...</span>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-[12px] text-red-600">
                {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-2.5 border-t bg-white flex-shrink-0">
            <form onSubmit={e => { e.preventDefault(); sendMessage() }} className="flex gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Hỏi về chấm công, task, kho, doanh thu..."
                disabled={loading}
                className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 disabled:opacity-50 bg-gray-50"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="px-3.5 py-2.5 rounded-xl text-white font-semibold disabled:opacity-40 transition-all active:scale-95 flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #1B4D3E, #2D8B6E)' }}
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
