// ============================================================================
// MachineQueuePage — /m/yeu-cau (thợ bảo trì đăng nhập) — khép vòng báo hỏng
// Thấy phiếu báo hỏng đang mở → Nhận việc → Xử lý xong. Máy đang dừng nổi đầu.
// Màu lấy từ biến .ops-root (opsTheme.css) → tự tối theo máy như App Ops: thợ trực đêm
// bấm 🔔 từ Hôm nay (máy để tối) không bị màn trắng chói. Đừng chép lại bảng hex.
// ============================================================================
import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { MACHINE_ISSUE_OPEN_STATUSES, MACHINE_ISSUE_STATUS_LABELS } from '../../services/opsService'
import { dichLoiHeThong } from '../../utils/dichLoiHeThong'
import OpsLoadError from './OpsLoadError'
import './opsTheme.css'

type Issue = {
  id: string; equipment_code: string; severity: 'do' | 'vang'; symptom: string | null
  note: string | null; photo_urls: string[]; voice_url: string | null; reporter_name: string | null
  status: string; acked_at: string | null; created_at: string
  equipment?: { name: string; khu_vuc: string | null }
}

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
  const [loadErr, setLoadErr] = useState<unknown>(null)
  const [actErr, setActErr] = useState<{ id: string; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('machine_issues')
        .select('id, equipment_code, severity, symptom, note, photo_urls, voice_url, reporter_name, status, acked_at, created_at, equipment:equipment_id(name, khu_vuc)')
        .in('status', MACHINE_ISSUE_OPEN_STATUSES)
        .order('severity', { ascending: true })   // 'do' < 'vang' → đang dừng lên đầu
        .order('created_at', { ascending: true })
      if (error) throw error
      setIssues((data as any) || [])
      setLoadErr(null)
    } catch (e) {
      // GIỮ danh sách lần trước (poll 20s tự thử lại) — tuyệt đối không hiện "Không có yêu cầu nào"
      // khi thật ra không đọc được: máy đang dừng mà thợ tưởng mọi máy bình thường.
      setLoadErr(e)
    } finally {
      setLoading(false)
    }
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

  // RPC lỗi (mất mạng, hết phiên, không có quyền…) phải NÓI ra — trước đây nút nhả ra như chưa bấm
  async function ack(id: string) {
    setBusy(id); setActErr(null)
    try {
      const { error } = await supabase.rpc('ack_machine_issue', { p_id: id })
      if (error) throw error
      await load()
    } catch (e) {
      setActErr({ id, text: dichLoiHeThong(e, 'Chưa nhận được việc') })
    } finally { setBusy(null) }
  }
  async function resolve(id: string) {
    setBusy(id); setActErr(null)
    try {
      const { error } = await supabase.rpc('resolve_machine_issue', { p_id: id, p_note: null })
      if (error) throw error
      await load()
    } catch (e) {
      setActErr({ id, text: dichLoiHeThong(e, 'Chưa ghi được "đã xử lý xong"') })
    } finally { setBusy(null) }
  }

  // .ops-root là khung fixed toàn màn (overflow ẩn) → cho chính nó cuộn, giữ bố cục khối như cũ
  const page: React.CSSProperties = { display: 'block', overflowY: 'auto' }
  const wrap: React.CSSProperties = { maxWidth: 480, margin: '0 auto', padding: 13, display: 'flex', flexDirection: 'column', gap: 11 }
  const nDung = issues.filter(i => i.severity === 'do').length

  return (
    <div className="ops-root" style={page}>
      <div style={{ background: 'var(--g)', color: '#fff', padding: 'calc(13px + env(safe-area-inset-top)) 16px 13px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate('/m/app')} aria-label="Quay lại"
            style={{ background: 'rgba(255,255,255,.16)', border: 0, color: '#fff', width: 44, height: 44, borderRadius: 12, fontSize: 22, cursor: 'pointer', flex: '0 0 44px', lineHeight: 1 }}>‹</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Yêu cầu chờ tiếp nhận</div>
            <div style={{ fontSize: 11, opacity: .85 }}>{user?.full_name || 'Thợ bảo trì'}</div>
          </div>
          {nDung > 0 && <span style={{ background: 'var(--surf)', color: 'var(--red)', fontSize: 12, fontWeight: 800, padding: '3px 11px', borderRadius: 20 }}>{nDung} khẩn</span>}
        </div>
      </div>

      <div style={wrap}>
        {!!loadErr && issues.length > 0 && (
          <div role="status" style={{ background: 'var(--amber-bg)', color: 'var(--amber)', borderRadius: 12, padding: '9px 12px', fontSize: 12.5, fontWeight: 700 }}>
            ⚠ Chưa cập nhật được danh sách ({dichLoiHeThong(loadErr, 'lỗi tải')}) — đang tự thử lại, phiếu dưới có thể đã cũ.
          </div>
        )}
        {loading ? <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 30 }}>Đang tải…</div>
          : !!loadErr && issues.length === 0 ? (
            <OpsLoadError error={loadErr} onRetry={load} title="Không tải được danh sách yêu cầu" />
          ) : issues.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: 40 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8 }}>Không có yêu cầu nào</div>
              <div style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 4 }}>Mọi máy đang chạy bình thường.</div>
            </div>
          ) : issues.map(it => {
            const dung = it.severity === 'do'
            return (
              <div key={it.id} style={{ background: 'var(--surf)', borderRadius: 14, padding: '13px 14px', boxShadow: 'var(--el1)', borderLeft: `4px solid ${dung ? 'var(--red)' : 'var(--amber)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 9px', borderRadius: 20, background: dung ? 'var(--red-bg)' : 'var(--amber-bg)', color: dung ? 'var(--red)' : 'var(--amber)' }}>
                    {dung ? '🔴 ĐANG DỪNG' : '🟡 VẪN CHẠY'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{ago(it.created_at)}</span>
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 720, marginTop: 6, letterSpacing: '-.01em' }}>
                  {it.equipment_code} · {it.equipment?.name || ''}{it.symptom ? ` — ${it.symptom}` : ''}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>
                  {it.equipment?.khu_vuc || ''}{it.reporter_name ? ` · báo bởi ${it.reporter_name}` : ' · người báo ẩn danh'}
                  {it.status !== 'moi' ? ` · ${MACHINE_ISSUE_STATUS_LABELS[it.status] ?? it.status}` : ''}
                </div>
                {it.note && <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 5, fontStyle: 'italic' }}>"{it.note}"</div>}
                {it.voice_url && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 750, color: 'var(--g)', marginBottom: 4 }}>🎙 Người báo có ghi âm — nghe:</div>
                    <audio controls preload="none" src={it.voice_url} style={{ width: '100%', height: 36 }} />
                  </div>
                )}
                {Array.isArray(it.photo_urls) && it.photo_urls.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    {it.photo_urls.slice(0, 3).map((u, i) => <img key={i} src={u} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 9 }} />)}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
                  {it.status === 'moi' ? (
                    <button disabled={busy === it.id} onClick={() => ack(it.id)} style={{ flex: 1, border: 0, borderRadius: 11, padding: 12, background: 'var(--g)', color: '#fff', fontSize: 14, fontWeight: 750, cursor: 'pointer', opacity: busy === it.id ? .6 : 1 }}>
                      {busy === it.id ? '…' : 'Tôi nhận việc'}
                    </button>
                  ) : (
                    // chữ = var(--surf): trắng khi sáng, gần đen khi tối (nền --ok tối là xanh nhạt, chữ trắng không đọc được)
                    <button disabled={busy === it.id} onClick={() => resolve(it.id)} style={{ flex: 1, border: 0, borderRadius: 11, padding: 12, background: 'var(--ok)', color: 'var(--surf)', fontSize: 14, fontWeight: 750, cursor: 'pointer', opacity: busy === it.id ? .6 : 1 }}>
                      {busy === it.id ? '…' : '✓ Đã xử lý xong'}
                    </button>
                  )}
                </div>
                {actErr?.id === it.id && <div role="alert" style={{ color: 'var(--red)', fontSize: 12.5, fontWeight: 650, marginTop: 8, lineHeight: 1.4 }}>{actErr.text}</div>}
              </div>
            )
          })}
        {!loading && issues.length > 0 && <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>Phiếu mới hiện + kêu ngay · máy đang dừng luôn ở trên</div>}
      </div>
    </div>
  )
}
