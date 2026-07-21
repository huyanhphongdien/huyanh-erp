// ============================================================================
// MachineQueuePage — /m/yeu-cau (thợ bảo trì đăng nhập) — khép vòng báo hỏng
// Thấy phiếu báo hỏng đang mở → Nhận việc → Xử lý xong. Máy đang dừng nổi đầu.
// ============================================================================
import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'

type Issue = {
  id: string; equipment_code: string; severity: 'do' | 'vang'; symptom: string | null
  note: string | null; photo_urls: string[]; reporter_name: string | null
  status: string; acked_at: string | null; created_at: string
  equipment?: { name: string; khu_vuc: string | null }
}

const C = {
  g: '#0F5132', gd: '#0A3A24', lime: '#3B9612', ink: '#0B1A13', ink2: '#3D4F46',
  ink3: '#728478', paper: '#EEF1EC', card: '#FFFFFF', line: '#DEE3DA',
  red: '#C1291F', redBg: '#FCE8E6', amber: '#B7791F', amberBg: '#FDF1D6', ok: '#1E7D3A', okBg: '#DEF3E3',
}
const STATUS_VI: Record<string, string> = { moi: 'Mới', da_nhan: 'Đã nhận', dang_xu_ly: 'Đang xử lý' }

function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'vừa xong'
  if (m < 60) return `${m} phút trước`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} giờ trước`
  return `${Math.floor(h / 24)} ngày trước`
}

export default function MachineQueuePage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('machine_issues')
      .select('id, equipment_code, severity, symptom, note, photo_urls, reporter_name, status, acked_at, created_at, equipment:equipment_id(name, khu_vuc)')
      .in('status', ['moi', 'da_nhan', 'dang_xu_ly'])
      .order('severity', { ascending: true })   // 'do' < 'vang' → đang dừng lên đầu
      .order('created_at', { ascending: true })
    setIssues((data as any) || [])
    setLoading(false)
  }, [])

  // Xin quyền thông báo trình duyệt (1 lần)
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }, [])

  // Khi có phiếu mới → chuông + rung + thông báo (dù đang mở màn khác trong app)
  const alertNew = useCallback((row: any) => {
    try {
      // chuông ngắn bằng WebAudio (không cần file)
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext
      if (AC) {
        const ac = new AC(); const o = ac.createOscillator(); const g = ac.createGain()
        o.connect(g); g.connect(ac.destination); o.frequency.value = row?.severity === 'do' ? 880 : 660
        g.gain.setValueAtTime(0.001, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.3, ac.currentTime + 0.02)
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.5); o.start(); o.stop(ac.currentTime + 0.5)
      }
      if (navigator.vibrate) navigator.vibrate(row?.severity === 'do' ? [200, 100, 200] : [150])
      // App native: FCM push đã lo thông báo hệ thống → KHÔNG bắn thêm (tránh đúp).
      // Chỉ web (trình duyệt trạm) mới cần Notification này.
      if (!Capacitor.isNativePlatform() && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(row?.severity === 'do' ? '🔴 Máy đang DỪNG' : '🟡 Máy báo bất thường', {
          body: `${row?.equipment_code || 'Máy'} — ${row?.symptom || 'có sự cố'}`, tag: 'machine-issue',
        })
      }
    } catch { /* im lặng */ }
  }, [])

  useEffect(() => {
    load()
    const poll = setInterval(load, 20000)
    // Realtime: phiếu mới → cảnh báo + nạp lại ngay
    const ch = supabase
      .channel('machine-issues-queue')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'machine_issues' },
        (payload) => { alertNew(payload.new); load() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'machine_issues' },
        () => load())
      .subscribe()
    return () => { clearInterval(poll); supabase.removeChannel(ch) }
  }, [load, alertNew])

  async function ack(id: string) {
    setBusy(id)
    try { await supabase.rpc('ack_machine_issue', { p_id: id }); await load() }
    finally { setBusy(null) }
  }
  async function resolve(id: string) {
    setBusy(id)
    try { await supabase.rpc('resolve_machine_issue', { p_id: id, p_note: null }); await load() }
    finally { setBusy(null) }
  }

  const page: React.CSSProperties = { minHeight: '100vh', background: C.paper, fontFamily: 'Roboto,system-ui,-apple-system,sans-serif', color: C.ink }
  const wrap: React.CSSProperties = { maxWidth: 480, margin: '0 auto', padding: 13, display: 'flex', flexDirection: 'column', gap: 11 }
  const nDung = issues.filter(i => i.severity === 'do').length

  return (
    <div style={page}>
      <div style={{ background: C.g, color: '#fff', padding: 'calc(13px + env(safe-area-inset-top)) 16px 13px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate('/m/app')} aria-label="Quay lại"
            style={{ background: 'rgba(255,255,255,.16)', border: 0, color: '#fff', width: 34, height: 34, borderRadius: 10, fontSize: 20, cursor: 'pointer', flex: '0 0 34px', lineHeight: 1 }}>‹</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Yêu cầu chờ tiếp nhận</div>
            <div style={{ fontSize: 11, opacity: .85 }}>{user?.full_name || 'Thợ bảo trì'}</div>
          </div>
          {nDung > 0 && <span style={{ background: '#fff', color: C.red, fontSize: 12, fontWeight: 800, padding: '3px 11px', borderRadius: 20 }}>{nDung} khẩn</span>}
        </div>
      </div>

      <div style={wrap}>
        {loading ? <div style={{ textAlign: 'center', color: C.ink3, padding: 30 }}>Đang tải…</div>
          : issues.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: 40 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8 }}>Không có yêu cầu nào</div>
              <div style={{ color: C.ink3, fontSize: 13, marginTop: 4 }}>Mọi máy đang chạy bình thường.</div>
            </div>
          ) : issues.map(it => {
            const dung = it.severity === 'do'
            return (
              <div key={it.id} style={{ background: C.card, borderRadius: 14, padding: '13px 14px', boxShadow: '0 1px 3px rgba(11,26,19,.09)', borderLeft: `4px solid ${dung ? C.red : C.amber}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 9px', borderRadius: 20, background: dung ? C.redBg : C.amberBg, color: dung ? C.red : C.amber }}>
                    {dung ? '🔴 ĐANG DỪNG' : '🟡 VẪN CHẠY'}
                  </span>
                  <span style={{ fontSize: 11, color: C.ink3 }}>{ago(it.created_at)}</span>
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 720, marginTop: 6, letterSpacing: '-.01em' }}>
                  {it.equipment_code} · {it.equipment?.name || ''}{it.symptom ? ` — ${it.symptom}` : ''}
                </div>
                <div style={{ fontSize: 11.5, color: C.ink3, marginTop: 2 }}>
                  {it.equipment?.khu_vuc || ''}{it.reporter_name ? ` · báo bởi ${it.reporter_name}` : ' · người báo ẩn danh'}
                  {it.status !== 'moi' ? ` · ${STATUS_VI[it.status]}` : ''}
                </div>
                {it.note && <div style={{ fontSize: 12.5, color: C.ink2, marginTop: 5, fontStyle: 'italic' }}>"{it.note}"</div>}
                {Array.isArray(it.photo_urls) && it.photo_urls.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    {it.photo_urls.slice(0, 3).map((u, i) => <img key={i} src={u} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 9 }} />)}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
                  {it.status === 'moi' ? (
                    <button disabled={busy === it.id} onClick={() => ack(it.id)} style={{ flex: 1, border: 0, borderRadius: 11, padding: 12, background: C.g, color: '#fff', fontSize: 14, fontWeight: 750, cursor: 'pointer', opacity: busy === it.id ? .6 : 1 }}>
                      {busy === it.id ? '…' : 'Tôi nhận việc'}
                    </button>
                  ) : (
                    <button disabled={busy === it.id} onClick={() => resolve(it.id)} style={{ flex: 1, border: 0, borderRadius: 11, padding: 12, background: C.ok, color: '#fff', fontSize: 14, fontWeight: 750, cursor: 'pointer', opacity: busy === it.id ? .6 : 1 }}>
                      {busy === it.id ? '…' : '✓ Đã xử lý xong'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        {!loading && issues.length > 0 && <div style={{ textAlign: 'center', fontSize: 11, color: C.ink3, marginTop: 4 }}>Phiếu mới hiện + kêu ngay · máy đang dừng luôn ở trên</div>}
      </div>
    </div>
  )
}
