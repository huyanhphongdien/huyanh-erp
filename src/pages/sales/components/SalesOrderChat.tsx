// ============================================================================
// SALES ORDER CHAT — Tab "Trao đổi" trong detail panel
// File: src/pages/sales/components/SalesOrderChat.tsx
//
// Bao gồm:
//   - List messages với avatar role-color, time, content, mentions, attachments
//   - System messages (auto từ trigger) — style khác user message
//   - Reply threading (parent_message_id)
//   - Input + @mention dropdown + 📎 attach file
//   - Sidebar phải: 📌 Pinned, 👥 Participants, 📎 Files trong chat
//   - Realtime subscribe → tin mới hiện ngay không refresh
// ============================================================================

import { useEffect, useState, useRef, useMemo } from 'react'
import { Input, Button, Spin, message as antMessage, Tooltip, Empty } from 'antd'
import { PaperClipOutlined, SendOutlined, PushpinOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useAuthStore } from '../../../stores/authStore'
import {
  salesOrderMessageService,
  type SalesOrderMessage,
  type MessageAuthorRole,
  type MentionableUser,
  roleFromEmail,
} from '../../../services/sales/salesOrderMessageService'

const PRIMARY = '#1B4D3E'

// Role → màu avatar gradient + label
const ROLE_META: Record<string, { bg: string; label: string; color: string }> = {
  sale:       { bg: 'linear-gradient(135deg,#1677ff,#4096ff)', label: 'Sale',       color: '#1677ff' },
  review:     { bg: 'linear-gradient(135deg,#d46b08,#fa8c16)', label: 'Kiểm tra',   color: '#d46b08' },
  sign:       { bg: 'linear-gradient(135deg,#389e0d,#52c41a)', label: 'Trình ký',   color: '#389e0d' },
  logistics:  { bg: 'linear-gradient(135deg,#531dab,#722ed1)', label: 'Logistics',  color: '#531dab' },
  production: { bg: 'linear-gradient(135deg,#d4380d,#fa541c)', label: 'Sản xuất',   color: '#d4380d' },
  admin:      { bg: 'linear-gradient(135deg,#1B4D3E,#2E7D5B)', label: 'Admin',      color: '#1B4D3E' },
  system:     { bg: 'linear-gradient(135deg,#8c8c8c,#595959)', label: 'System',     color: '#595959' },
}

const fmtTime = (s: string) => new Date(s).toLocaleString('vi-VN', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
})
const fmtRelTime = (s: string) => {
  const diff = (Date.now() - new Date(s).getTime()) / 60000
  if (diff < 1) return 'vừa xong'
  if (diff < 60) return `${Math.round(diff)} phút trước`
  if (diff < 1440) return `${Math.round(diff / 60)} giờ trước`
  return new Date(s).toLocaleDateString('vi-VN')
}

interface Props {
  salesOrderId: string
}

export default function SalesOrderChat({ salesOrderId }: Props) {
  const { user } = useAuthStore()
  const myRole = useMemo(() => roleFromEmail(user?.email), [user])

  const [messages, setMessages] = useState<SalesOrderMessage[]>([])
  const [pinned, setPinned] = useState<SalesOrderMessage[]>([])
  const [mentionables, setMentionables] = useState<MentionableUser[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState('')
  const [showMentionMenu, setShowMentionMenu] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionActiveIdx, setMentionActiveIdx] = useState(0)
  // Track mentions picked: email_prefix → { id, full_name }
  // Khi gửi, lấy mentioned_ids từ map này (chính xác, không phải regex)
  const [pickedMentions, setPickedMentions] = useState<Record<string, { id: string; full_name: string }>>({})

  const messagesRef = useRef<HTMLDivElement>(null)

  // ── Load + subscribe realtime ──
  useEffect(() => {
    let mounted = true
    setLoading(true)
    Promise.all([
      salesOrderMessageService.listByOrder(salesOrderId),
      salesOrderMessageService.listPinned(salesOrderId),
      salesOrderMessageService.getMentionableUsers(),
    ]).then(([msgs, pins, users]) => {
      if (!mounted) return
      setMessages(msgs)
      setPinned(pins)
      setMentionables(users)
      setLoading(false)
      setTimeout(scrollToBottom, 100)
    }).catch(() => {
      if (mounted) setLoading(false)
    })

    // Realtime subscribe
    const channel = salesOrderMessageService.subscribe(salesOrderId, (msg, event) => {
      if (!mounted) return
      if (event === 'INSERT') {
        setMessages((prev) => {
          if (prev.find((m) => m.id === msg.id)) return prev
          return [...prev, msg]
        })
        setTimeout(scrollToBottom, 100)
      } else if (event === 'UPDATE') {
        setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, ...msg } : m))
        // Reload pinned nếu pin status đổi
        if (msg.is_pinned !== messages.find((m) => m.id === msg.id)?.is_pinned) {
          salesOrderMessageService.listPinned(salesOrderId).then(setPinned)
        }
      } else if (event === 'DELETE') {
        setMessages((prev) => prev.filter((m) => m.id !== msg.id))
      }
    })

    return () => {
      mounted = false
      channel.unsubscribe()
    }
  }, [salesOrderId])

  const scrollToBottom = () => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight
    }
  }

  // ── Detect @ trigger + extract query ──
  useEffect(() => {
    const match = input.match(/@(\w*)$/)
    if (match) {
      setMentionQuery(match[1].toLowerCase())
      setShowMentionMenu(true)
      setMentionActiveIdx(0)
    } else {
      setShowMentionMenu(false)
      setMentionQuery('')
    }
  }, [input])

  // Filter mentionables theo query (match email_prefix HOẶC full_name)
  const filteredMentions = useMemo(() => {
    if (!showMentionMenu) return []
    const q = mentionQuery.toLowerCase()
    if (!q) return mentionables.slice(0, 8)
    return mentionables
      .filter((u) => {
        const emailPrefix = u.email.split('@')[0].toLowerCase()
        return emailPrefix.includes(q) ||
               u.full_name.toLowerCase().includes(q) ||
               u.role_label.toLowerCase().includes(q)
      })
      .slice(0, 8)
  }, [mentionables, mentionQuery, showMentionMenu])

  const handleSend = async () => {
    const text = input.trim()
    if (!text) return
    setSending(true)
    try {
      // Resolve mentions: từ pickedMentions (chính xác) + fallback regex match
      const mentionMatches = text.match(/@([\w.]+)/g) || []
      const mentionedIdSet = new Set<string>()

      for (const m of mentionMatches) {
        const prefix = m.slice(1).toLowerCase()
        // 1. Ưu tiên pickedMentions (user đã pick từ dropdown)
        const picked = pickedMentions[prefix]
        if (picked) {
          mentionedIdSet.add(picked.id)
          continue
        }
        // 2. Fallback: match qua email prefix HOẶC full_name
        const found = mentionables.find((u) => {
          const p = u.email.split('@')[0].toLowerCase()
          return p === prefix ||
                 u.full_name.toLowerCase().replace(/\s+/g, '').includes(prefix.replace(/\s+/g, ''))
        })
        if (found) mentionedIdSet.add(found.id)
      }

      await salesOrderMessageService.sendMessage({
        salesOrderId,
        content: text,
        mentionedIds: Array.from(mentionedIdSet),
      })
      setInput('')
      setPickedMentions({})
      // Realtime sẽ tự thêm tin vào list
    } catch (e: unknown) {
      antMessage.error('Gửi tin thất bại: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSending(false)
    }
  }

  const handleTogglePin = async (msg: SalesOrderMessage) => {
    try {
      await salesOrderMessageService.togglePin(msg.id, !msg.is_pinned)
      const newPinned = await salesOrderMessageService.listPinned(salesOrderId)
      setPinned(newPinned)
    } catch (e: unknown) {
      antMessage.error('Pin thất bại: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const handleDelete = async (msg: SalesOrderMessage) => {
    if (!confirm('Xóa tin này?')) return
    try {
      await salesOrderMessageService.deleteMessage(msg.id)
    } catch (e: unknown) {
      antMessage.error('Xóa thất bại: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const insertMention = (u: MentionableUser) => {
    // Replace @xxx (incomplete) với @emailPrefix, track employee_id chính xác
    const emailPrefix = u.email.split('@')[0]
    const newText = input.replace(/@\w*$/, `@${emailPrefix} `)
    setInput(newText)
    setPickedMentions((prev) => ({
      ...prev,
      [emailPrefix.toLowerCase()]: { id: u.id, full_name: u.full_name },
    }))
    setShowMentionMenu(false)
    setMentionQuery('')
  }

  // Keyboard nav cho mention dropdown
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentionMenu && filteredMentions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionActiveIdx((i) => Math.min(i + 1, filteredMentions.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionActiveIdx((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(filteredMentions[mentionActiveIdx])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowMentionMenu(false)
        return
      }
    }
    // Enter (no shift, no mention menu) → send
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Participants (distinct authors)
  const participants = useMemo(() => {
    const map = new Map<string, { id: string; full_name: string; role: MessageAuthorRole }>()
    messages.forEach((m) => {
      if (m.author && m.author_id) {
        map.set(m.author_id, {
          id: m.author_id,
          full_name: m.author.full_name || '',
          role: m.author_role,
        })
      }
    })
    return Array.from(map.values())
  }, [messages])

  // Files chia sẻ trong chat
  const sharedFiles = useMemo(
    () => messages.filter((m) => m.attachment).slice(-5).reverse(),
    [messages],
  )

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin /> <span style={{ color: '#8c8c8c', marginLeft: 8 }}>Đang tải chat...</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, padding: 16, height: '70vh', minHeight: 500 }}>

      {/* ═══ MAIN CHAT ═══ */}
      <div style={chatMain}>
        <div style={chatHeader}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: PRIMARY }}>
            Trao đổi về đơn này
          </h3>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {participants.slice(0, 6).map((p, i) => {
              const meta = p.role ? ROLE_META[p.role] : ROLE_META.admin
              return (
                <Tooltip key={p.id} title={`${p.full_name} (${meta.label})`}>
                  <div style={{ ...avatar, ...avatarBorder, background: meta.bg, marginLeft: i > 0 ? -8 : 0 }}>
                    {(p.full_name || '?').charAt(0).toUpperCase()}
                  </div>
                </Tooltip>
              )
            })}
            <span style={{ fontSize: 11, color: '#8c8c8c', marginLeft: 8, alignSelf: 'center' }}>
              {participants.length} người
            </span>
          </div>
        </div>

        {/* MESSAGES */}
        <div ref={messagesRef} style={chatMessagesBox}>
          {messages.length === 0 ? (
            <div style={{ padding: 48 }}>
              <Empty description="Chưa có tin nào — gõ tin đầu tiên ở dưới" />
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = !!(msg.author_id && user?.email && msg.author?.email === user.email)
              const isSystem = msg.message_type === 'system'
              const meta = msg.author_role ? ROLE_META[msg.author_role] : ROLE_META.admin

              if (isSystem) {
                return (
                  <div key={msg.id} style={msgSystem}>
                    <div style={msgSystemContent}>{msg.content}</div>
                    <div style={msgSystemTime}>{fmtTime(msg.created_at)}</div>
                  </div>
                )
              }

              return (
                <div key={msg.id} style={{ ...msgRow, flexDirection: isMe ? 'row-reverse' : 'row' }}>
                  <div style={{ ...avatar, background: meta.bg, flexShrink: 0 }}>
                    {(msg.author?.full_name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, maxWidth: '70%' }}>
                    <div style={{ ...msgHead, flexDirection: isMe ? 'row-reverse' : 'row' }}>
                      <span style={{ fontWeight: 700, fontSize: 12 }}>
                        {isMe ? 'Bạn' : msg.author?.full_name || '—'}
                      </span>
                      <span style={{ ...msgRolePill, background: meta.bg, color: '#fff' }}>
                        {meta.label}
                      </span>
                      <span style={{ fontSize: 10, color: '#bfbfbf' }}>{fmtRelTime(msg.created_at)}</span>
                      {msg.is_pinned && <span style={{ color: '#d46b08' }}>📌</span>}
                    </div>
                    <div style={{
                      ...msgContent,
                      background: isMe ? PRIMARY : '#fafafa',
                      color: isMe ? '#fff' : 'rgba(0,0,0,0.88)',
                    }}>
                      {renderContentWithMentions(msg.content, isMe)}
                    </div>
                    {msg.attachment && (
                      <div style={{ ...attachCard, marginLeft: isMe ? 'auto' : 0 }}>
                        <div style={attachIcon}>PDF</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 600 }}>{msg.attachment.file_name}</div>
                          <div style={{ fontSize: 10, color: '#8c8c8c' }}>
                            {msg.attachment.file_size ? `${Math.round(msg.attachment.file_size / 1024)} KB` : ''}
                          </div>
                        </div>
                      </div>
                    )}
                    <div style={{ ...msgActionsRow, justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                      <Tooltip title={msg.is_pinned ? 'Bỏ ghim' : 'Ghim tin'}>
                        <button style={msgActionBtn} onClick={() => handleTogglePin(msg)}>
                          <PushpinOutlined style={{ color: msg.is_pinned ? '#d46b08' : '#bfbfbf' }} />
                        </button>
                      </Tooltip>
                      {isMe && (
                        <Tooltip title="Xóa tin">
                          <button style={msgActionBtn} onClick={() => handleDelete(msg)}>
                            <DeleteOutlined style={{ color: '#cf1322' }} />
                          </button>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* INPUT */}
        <div style={chatInputBox}>
          <div style={{ position: 'relative' }}>
            {showMentionMenu && filteredMentions.length > 0 && (
              <div style={mentionMenu}>
                <div style={{
                  padding: '8px 12px', fontSize: 11, color: '#8c8c8c', background: '#fafafa',
                  borderBottom: '1px solid #f0f0f0',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span>💡 Chọn người để mention {mentionQuery && <b>· lọc "{mentionQuery}"</b>}</span>
                  <span style={{ fontSize: 10 }}>↑↓ chuyển · Enter/Tab chọn</span>
                </div>
                {filteredMentions.map((u, idx) => {
                  const emailPrefix = u.email.split('@')[0]
                  const isActive = idx === mentionActiveIdx
                  const meta = (() => {
                    const r = roleFromEmail(u.email)
                    return r ? ROLE_META[r] : null
                  })()
                  return (
                    <div
                      key={u.id}
                      style={{
                        ...mentionItem,
                        background: isActive ? '#f0f9f4' : 'transparent',
                        boxShadow: isActive ? `inset 3px 0 0 ${PRIMARY}` : 'none',
                        display: 'flex', alignItems: 'center', gap: 10,
                      }}
                      onClick={() => insertMention(u)}
                      onMouseEnter={() => setMentionActiveIdx(idx)}
                    >
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: meta?.bg || 'linear-gradient(135deg,#8c8c8c,#595959)',
                        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700, flexShrink: 0,
                      }}>
                        {(u.full_name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>
                          {u.full_name}
                          {meta && (
                            <span style={{
                              marginLeft: 6, padding: '1px 6px', borderRadius: 8,
                              background: meta.bg, color: '#fff', fontSize: 10, fontWeight: 600,
                            }}>
                              {meta.label}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: '#8c8c8c', fontFamily: 'monospace' }}>
                          @{emailPrefix} · {u.email}
                        </div>
                      </div>
                      {isActive && <span style={{ color: PRIMARY, fontSize: 14 }}>↵</span>}
                    </div>
                  )
                })}
              </div>
            )}
            <div style={chatInputBar}>
              <Tooltip title="Đính kèm file (sắp ra mắt)">
                <Button type="text" size="small" icon={<PaperClipOutlined />} disabled />
              </Tooltip>
              <Input.TextArea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder={`Gõ tin... gõ @ để mention · vai trò bạn: ${myRole ? ROLE_META[myRole]?.label : '—'}`}
                autoSize={{ minRows: 1, maxRows: 4 }}
                style={{ border: 'none', boxShadow: 'none', resize: 'none' }}
              />
              <Button
                type="primary"
                size="small"
                shape="circle"
                icon={<SendOutlined />}
                onClick={handleSend}
                loading={sending}
                disabled={!input.trim()}
                style={{ background: PRIMARY }}
              />
            </div>
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: '#8c8c8c', display: 'flex', justifyContent: 'space-between' }}>
            <span>
              💡 Gõ <b>@</b> chọn từ dropdown · <b>Enter</b> gửi · <b>Shift+Enter</b> xuống dòng
              {Object.keys(pickedMentions).length > 0 && (
                <span style={{ marginLeft: 8, color: PRIMARY }}>
                  · Đã mention: {Object.values(pickedMentions).map((m) => m.full_name).join(', ')} (sẽ thông báo ERP)
                </span>
              )}
            </span>
            <span>{messages.length} tin trong đơn</span>
          </div>
        </div>
      </div>

      {/* ═══ SIDEBAR ═══ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>

        {/* Pinned */}
        <div style={sidePanel}>
          <h4 style={sideTitle}>📌 Đã ghim ({pinned.length})</h4>
          {pinned.length === 0 ? (
            <div style={{ fontSize: 11, color: '#bfbfbf' }}>Chưa ghim tin nào</div>
          ) : (
            pinned.map((p) => (
              <div key={p.id} style={pinnedMsg}>
                <div style={{ fontSize: 10, color: '#d46b08', fontWeight: 600, marginBottom: 2 }}>
                  📌 {p.author?.full_name || '—'} · {fmtRelTime(p.pinned_at || p.created_at)}
                </div>
                <div style={{ fontSize: 11 }}>{p.content.slice(0, 100)}{p.content.length > 100 ? '...' : ''}</div>
              </div>
            ))
          )}
        </div>

        {/* Participants */}
        <div style={sidePanel}>
          <h4 style={sideTitle}>👥 Người tham gia ({participants.length})</h4>
          {participants.length === 0 ? (
            <div style={{ fontSize: 11, color: '#bfbfbf' }}>Chưa có ai gửi tin</div>
          ) : (
            participants.map((p) => {
              const meta = p.role ? ROLE_META[p.role] : ROLE_META.admin
              return (
                <div key={p.id} style={actorRow}>
                  <div style={{ ...avatar, ...avatarBorderSmall, background: meta.bg }}>
                    {p.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{p.full_name}</div>
                    <div style={{ fontSize: 10, color: '#8c8c8c' }}>{meta.label}</div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Shared files */}
        <div style={sidePanel}>
          <h4 style={sideTitle}>📎 File chia sẻ ({sharedFiles.length})</h4>
          {sharedFiles.length === 0 ? (
            <div style={{ fontSize: 11, color: '#bfbfbf' }}>Chưa có file nào</div>
          ) : (
            sharedFiles.map((m) => (
              <div key={m.id} style={actorRow}>
                <div style={attachIcon}>PDF</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.attachment?.file_name || '—'}
                  </div>
                  <div style={{ fontSize: 10, color: '#8c8c8c' }}>
                    {m.author?.full_name || '—'} · {fmtRelTime(m.created_at)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Render content với @mentions highlight ─────────────────────────
function renderContentWithMentions(content: string, isMe: boolean): React.ReactNode {
  const parts = content.split(/(@\w+)/g)
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      return (
        <span
          key={i}
          style={{
            background: isMe ? 'rgba(255,255,255,0.2)' : '#e6f4ff',
            color: isMe ? '#fff' : '#1677ff',
            padding: '0 4px',
            borderRadius: 3,
            fontWeight: 600,
          }}
        >
          {part}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}

// ─── Styles ──────────────────────────────────────────────────────────

const chatMain: React.CSSProperties = {
  background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8',
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
}
const chatHeader: React.CSSProperties = {
  padding: '12px 16px', borderBottom: '1px solid #e8e8e8',
  display: 'flex', alignItems: 'center', gap: 10, background: '#fafafa',
}
const chatMessagesBox: React.CSSProperties = {
  flex: 1, overflowY: 'auto', padding: '16px',
  display: 'flex', flexDirection: 'column', gap: 14,
}
const avatar: React.CSSProperties = {
  width: 30, height: 30, borderRadius: '50%',
  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 12, fontWeight: 700,
}
const avatarBorder: React.CSSProperties = { border: '2px solid #fff' }
const avatarBorderSmall: React.CSSProperties = { width: 26, height: 26, fontSize: 10 }

const msgRow: React.CSSProperties = { display: 'flex', gap: 10 }
const msgHead: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 11,
}
const msgRolePill: React.CSSProperties = {
  padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 600,
}
const msgContent: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.55, wordBreak: 'break-word',
}
const msgActionsRow: React.CSSProperties = {
  marginTop: 4, display: 'flex', gap: 2, opacity: 0.6,
}
const msgActionBtn: React.CSSProperties = {
  border: 'none', background: 'transparent', cursor: 'pointer',
  padding: 2, borderRadius: 4, fontSize: 11,
}

const msgSystem: React.CSSProperties = {
  textAlign: 'center', padding: '4px 0',
}
const msgSystemContent: React.CSSProperties = {
  display: 'inline-block', padding: '4px 12px', background: '#fff7e6',
  border: '1px dashed #ffd591', borderRadius: 12, fontSize: 11.5,
  color: '#d46b08', fontStyle: 'italic',
}
const msgSystemTime: React.CSSProperties = {
  fontSize: 10, color: '#bfbfbf', marginTop: 2,
}

const attachCard: React.CSSProperties = {
  marginTop: 6, display: 'flex', alignItems: 'center', gap: 8,
  padding: '6px 10px', background: '#fff',
  border: '1px solid #e8e8e8', borderRadius: 8, maxWidth: 280,
}
const attachIcon: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 5,
  background: '#fff1f0', color: '#cf1322',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 9, fontWeight: 700, flexShrink: 0,
}

const chatInputBox: React.CSSProperties = {
  padding: '10px 14px', borderTop: '1px solid #e8e8e8', background: '#fff',
}
const chatInputBar: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  border: '1px solid #e8e8e8', borderRadius: 22, padding: '4px 6px 4px 10px',
}

const mentionMenu: React.CSSProperties = {
  position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4,
  background: '#fff', border: '1px solid #e8e8e8', borderRadius: 8,
  boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 240, overflowY: 'auto',
  zIndex: 10,
}
const mentionItem: React.CSSProperties = {
  padding: '6px 12px', cursor: 'pointer',
  borderBottom: '1px solid #f5f5f5',
}

const sidePanel: React.CSSProperties = {
  background: '#fff', borderRadius: 10, border: '1px solid #e8e8e8',
  padding: '12px 14px',
}
const sideTitle: React.CSSProperties = {
  fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
  color: '#8c8c8c', fontWeight: 700, marginBottom: 10,
}
const pinnedMsg: React.CSSProperties = {
  padding: '8px 10px', background: '#fffbe6', border: '1px solid #ffe58f',
  borderRadius: 6, marginBottom: 6, fontSize: 11.5, cursor: 'pointer',
}
const actorRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
  borderBottom: '1px solid #f5f5f5', fontSize: 12,
}
