// ============================================================================
// MachineReportPage — /m/tb/:code (CÔNG KHAI, không cần đăng nhập) — 1.3 + 1.5
// Công nhân vận hành quét QR trên máy → xem thông tin máy + báo hỏng.
// Không dùng layout desktop. Anon đọc equipment + gọi RPC report_machine_issue.
// Màu lấy từ biến .ops-root (opsTheme.css) → tự tối theo máy như App Ops. Đừng chép lại bảng hex.
// ============================================================================
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { compressImage } from '../../lib/imageCompress'
import { dichLoiHeThong } from '../../utils/dichLoiHeThong'
import { fmtNum } from '../../utils/format'
import OpsLoadError from './OpsLoadError'
import './opsTheme.css'

type Machine = { id: string; code: string; name: string; khu_vuc: string | null; cong_suat_kw: number | null }

const SYMPTOMS_DO = ['Không chạy', 'Kêu lạ', 'Nóng bất thường', 'Rò rỉ', 'Rung mạnh', 'Khác']
const SYMPTOMS_VANG = ['Kêu lạ', 'Nóng bất thường', 'Rò rỉ', 'Rung mạnh', 'Chậm/yếu', 'Khác']

export default function MachineReportPage() {
  const { code } = useParams<{ code: string }>()
  const [machine, setMachine] = useState<Machine | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [loadErr, setLoadErr] = useState<unknown>(null)
  const [dropped, setDropped] = useState(0)   // số ảnh/ghi âm tải lên hỏng lúc gửi (báo hỏng vẫn đi)

  const [mode, setMode] = useState<'view' | 'report' | 'sent'>('view')
  const [severity, setSeverity] = useState<'do' | 'vang' | null>(null)
  const [symptom, setSymptom] = useState<string>('')
  const [note, setNote] = useState('')
  const [reporter, setReporter] = useState('')
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [issueId, setIssueId] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('moi')
  const [err, setErr] = useState('')

  // Lỗi mạng/quyền ≠ "không có máy": WiFi xưởng chập chờn mà báo "Mã chưa có trong hệ thống" là sai
  const loadMachine = useCallback(async () => {
    if (!code) return
    setLoading(true); setLoadErr(null); setNotFound(false)
    try {
      const { data, error } = await supabase.from('equipment').select('id, code, name, khu_vuc, cong_suat_kw')
        .eq('code', code).maybeSingle()
      if (error) throw error
      if (data) setMachine(data as Machine)
      else setNotFound(true)
    } catch (e) {
      setLoadErr(e)
    } finally {
      setLoading(false)
    }
  }, [code])
  useEffect(() => { loadMachine() }, [loadMachine])

  // poll trạng thái sau khi gửi
  useEffect(() => {
    if (!issueId || mode !== 'sent') return
    const t = setInterval(async () => {
      const { data } = await supabase.rpc('get_issue_status', { p_id: issueId })
      const row = Array.isArray(data) ? data[0] : data
      if (row?.status) setStatus(row.status)
    }, 8000)
    return () => clearInterval(t)
  }, [issueId, mode])

  // ── GHI ÂM: thợ tay dính mủ/đeo găng → nói nhanh hơn bấm ──
  const MAX_SEC = 60
  const [recording, setRecording] = useState(false)
  const [voice, setVoice] = useState<{ blob: Blob; url: string; ext: string } | null>(null)
  const [recSec, setRecSec] = useState(0)
  const [voiceErr, setVoiceErr] = useState('')
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)

  function pickMime(): { mime: string; ext: string } {
    const cands = [
      { mime: 'audio/webm;codecs=opus', ext: 'webm' },
      { mime: 'audio/webm', ext: 'webm' },
      { mime: 'audio/mp4', ext: 'm4a' },
      { mime: 'audio/ogg;codecs=opus', ext: 'ogg' },
    ]
    for (const c of cands) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(c.mime)) return c
    }
    return { mime: '', ext: 'webm' }
  }

  async function startRec() {
    setVoiceErr('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const { mime, ext } = pickMime()
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data) }
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        setVoice(prev => { if (prev?.url) URL.revokeObjectURL(prev.url); return { blob, url: URL.createObjectURL(blob), ext } })
        setRecording(false)
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      }
      recRef.current = rec
      rec.start()
      setRecording(true); setRecSec(0)
      timerRef.current = window.setInterval(() => {
        setRecSec(s => {
          if (s + 1 >= MAX_SEC) { try { rec.stop() } catch { /* rồi */ } return MAX_SEC }
          return s + 1
        })
      }, 1000)
    } catch {
      setVoiceErr('Không dùng được micro. Bấm "Cho phép" khi máy hỏi quyền ghi âm, rồi thử lại.')
      setRecording(false)
    }
  }
  function stopRec() { try { recRef.current?.stop() } catch { /* rồi */ } }
  function clearVoice() {
    setVoice(prev => { if (prev?.url) URL.revokeObjectURL(prev.url); return null })
    setRecSec(0)
  }
  const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const addPhoto = useCallback(async (files: File[]) => {
    if (!files.length) return
    const arr = files.slice(0, 3 - photos.length)
    const next: { file: File; url: string }[] = []
    for (const f of arr) {
      const c = await compressImage(f)
      next.push({ file: c, url: URL.createObjectURL(c) })
    }
    setPhotos(p => [...p, ...next])
  }, [photos.length])
  // Gỡ ảnh chụp nhầm (cùng khuôn nút Xoá của ghi âm) — trước đây phải tải lại trang, mất cả ghi âm + hiện tượng
  function removePhoto(i: number) {
    const p = photos[i]
    if (p) URL.revokeObjectURL(p.url)
    setPhotos(prev => prev.filter((_, idx) => idx !== i))
  }

  async function submit() {
    if (!severity) { setErr('Chọn máy đang dừng hay vẫn chạy'); return }
    setSubmitting(true); setErr('')
    try {
      let failed = 0
      // upload ảnh (nếu có) lên bucket công khai machine-issues
      const urls: string[] = []
      for (const p of photos) {
        const path = `${code}/${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`
        const { error } = await supabase.storage.from('machine-issues').upload(path, p.file)
        if (!error) urls.push(supabase.storage.from('machine-issues').getPublicUrl(path).data.publicUrl)
        else failed++
      }
      // upload ghi âm (nếu có)
      let voiceUrl: string | null = null
      if (voice) {
        const vpath = `${code}/voice_${Date.now()}.${voice.ext}`
        const { error: ve } = await supabase.storage.from('machine-issues')
          .upload(vpath, voice.blob, { contentType: voice.blob.type || 'audio/webm' })
        if (!ve) voiceUrl = supabase.storage.from('machine-issues').getPublicUrl(vpath).data.publicUrl
        else failed++
      }
      const { data, error } = await supabase.rpc('report_machine_issue', {
        p_equipment_code: code, p_severity: severity, p_symptom: symptom || null,
        p_note: note.trim() || null, p_photo_urls: urls, p_reporter_name: reporter.trim() || null,
        p_voice_url: voiceUrl,
      })
      if (error) throw error
      setDropped(failed)
      setIssueId(data as string); setStatus('moi'); setMode('sent')
    } catch (e) {
      setErr(dichLoiHeThong(e, 'Gửi thất bại, thử lại'))
    } finally { setSubmitting(false) }
  }

  // ── styles ── (.ops-root là khung fixed toàn màn, overflow ẩn → cho chính nó cuộn, giữ bố cục khối như cũ)
  const page: React.CSSProperties = { display: 'block', overflowY: 'auto' }
  const bar: React.CSSProperties = { background: 'var(--g)', color: '#fff', padding: '14px 16px' }
  const wrap: React.CSSProperties = { maxWidth: 480, margin: '0 auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 11 }
  const card: React.CSSProperties = { background: 'var(--surf)', borderRadius: 14, padding: '13px 14px', boxShadow: 'var(--el1)' }
  const bigBtn: React.CSSProperties = { border: 0, borderRadius: 26, padding: 16, fontSize: 16, fontWeight: 750, width: '100%', cursor: 'pointer' }
  const kw = machine?.cong_suat_kw ? `${fmtNum(machine.cong_suat_kw, 2)} kW` : null

  if (loading) return <div className="ops-root" style={{ display: 'grid', placeItems: 'center' }}><div style={{ color: 'var(--ink-3)' }}>Đang tải…</div></div>

  if (loadErr) return (
    <div className="ops-root" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
      <OpsLoadError error={loadErr} onRetry={loadMachine} title="Không tải được thông tin máy" />
    </div>
  )

  if (notFound) return (
    <div className="ops-root" style={{ display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}>
      <div>
        <div style={{ fontSize: 40 }}>❓</div>
        <div style={{ fontSize: 17, fontWeight: 700, marginTop: 8 }}>Không tìm thấy máy</div>
        <div style={{ color: 'var(--ink-3)', fontSize: 14, marginTop: 4 }}>Mã <b>{code}</b> chưa có trong hệ thống.</div>
      </div>
    </div>
  )

  // ── ĐÃ GỬI ──
  if (mode === 'sent') {
    const acked = status === 'da_nhan' || status === 'dang_xu_ly' || status === 'xong'
    return (
      <div className="ops-root" style={page}>
        <div style={bar}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{machine?.code} · {machine?.name}</div>
        </div>
        <div style={wrap}>
          <div style={{ ...card, textAlign: 'center', padding: '26px 16px' }}>
            <div style={{ fontSize: 44 }}>{acked ? '✅' : '📨'}</div>
            <div style={{ fontSize: 18, fontWeight: 780, marginTop: 10, color: acked ? 'var(--g)' : 'var(--ink)' }}>
              {acked ? 'Đã có người nhận việc' : 'Đã gửi báo hỏng'}
            </div>
            <div style={{ color: 'var(--ink-2)', fontSize: 14, marginTop: 6 }}>
              {acked ? 'Thợ bảo trì đang xử lý. Cảm ơn bạn.' : 'Đang chờ thợ bảo trì nhận. Bạn có thể đóng trang này.'}
            </div>
            <div style={{ marginTop: 14, display: 'inline-block', padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
              background: severity === 'do' ? 'var(--red-bg)' : 'var(--amber-bg)', color: severity === 'do' ? 'var(--red)' : 'var(--amber)' }}>
              {severity === 'do' ? '🔴 Máy đang dừng' : '🟡 Máy vẫn chạy'}
            </div>
          </div>
          {dropped > 0 && (
            <div role="status" style={{ ...card, background: 'var(--amber-bg)', color: 'var(--amber)', fontSize: 13, fontWeight: 650, textAlign: 'center' }}>
              ⚠ {dropped} ảnh/ghi âm không gửi được (mạng yếu). Báo hỏng vẫn đã tới thợ bảo trì — cần thì nói trực tiếp khi thợ tới.
            </div>
          )}
          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-3)' }}>Tự cập nhật khi có người nhận việc</div>
        </div>
      </div>
    )
  }

  const symptoms = severity === 'vang' ? SYMPTOMS_VANG : SYMPTOMS_DO

  return (
    <div className="ops-root" style={page}>
      <div style={{ ...bar, background: mode === 'report' ? 'var(--red)' : 'var(--g)', color: mode === 'report' ? 'var(--surf)' : '#fff' }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{mode === 'report' ? '⚠ Báo hỏng máy' : `📍 ${machine?.name}`}</div>
        <div style={{ fontSize: 11.5, opacity: .85, marginTop: 1 }}>
          {machine?.code}{machine?.khu_vuc ? ` · ${machine.khu_vuc}` : ''}{kw ? ` · ${kw}` : ''}
        </div>
      </div>

      <div style={wrap}>
        {mode === 'view' ? (
          <>
            <div style={card}>
              <div style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-3)', fontWeight: 750, marginBottom: 6 }}>Thông số</div>
              <Row k="Mã máy" v={machine!.code} />
              <Row k="Khu vực" v={machine!.khu_vuc || '—'} />
              <Row k="Công suất" v={kw || '—'} />
            </div>
            <div style={{ ...card, background: 'var(--surf-2)', border: '1px dashed var(--line)', fontSize: 13, color: 'var(--ink-3)', textAlign: 'center' }}>
              Máy có vấn đề? Bấm nút dưới để báo cho thợ bảo trì — không cần đăng nhập.
            </div>
            {/* chữ trên nền --red = var(--surf): trắng khi sáng, gần đen khi tối (--red tối là đỏ hồng sáng — chữ trắng chỉ 2,8:1) */}
            <button style={{ ...bigBtn, background: 'var(--red)', color: 'var(--surf)' }} onClick={() => setMode('report')}>⚠ BÁO HỎNG MÁY NÀY</button>
          </>
        ) : (
          <>
            <div style={card}>
              <div style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-3)', fontWeight: 750, marginBottom: 8 }}>Máy có đang dừng không?</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button onClick={() => setSeverity('do')} style={{ padding: 15, borderRadius: 12, border: severity === 'do' ? 'none' : '1.5px solid var(--line)', background: severity === 'do' ? 'var(--red)' : 'var(--surf)', color: severity === 'do' ? 'var(--surf)' : 'var(--ink-2)', fontSize: 14, fontWeight: 780, cursor: 'pointer' }}>Đang dừng</button>
                {/* chữ = var(--surf): trắng khi sáng, gần đen khi tối (nền --amber tối là vàng sáng, chữ trắng không đọc được) */}
                <button onClick={() => setSeverity('vang')} style={{ padding: 15, borderRadius: 12, border: severity === 'vang' ? 'none' : '1.5px solid var(--line)', background: severity === 'vang' ? 'var(--amber)' : 'var(--surf)', color: severity === 'vang' ? 'var(--surf)' : 'var(--ink-2)', fontSize: 14, fontWeight: 780, cursor: 'pointer' }}>Vẫn chạy</button>
              </div>
            </div>

            {severity && (
              <div style={card}>
                <div style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-3)', fontWeight: 750, marginBottom: 8 }}>Hiện tượng</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {symptoms.map(s => (
                    <button key={s} onClick={() => setSymptom(s)} style={{ padding: '8px 13px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                      background: symptom === s ? 'var(--g)' : 'var(--line)', color: symptom === s ? '#fff' : 'var(--ink-2)' }}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {/* GHI ÂM — nhanh hơn bấm, tay dính mủ vẫn nói được */}
            <div style={card}>
              <div style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-3)', fontWeight: 750, marginBottom: 8 }}>
                🎙 Ghi âm — nói cho nhanh
              </div>

              {!recording && !voice && (
                <>
                  <button onClick={startRec} style={{ ...bigBtn, background: 'var(--g)', color: '#fff', padding: 15, fontSize: 15.5 }}>
                    🎙 Bấm để nói
                  </button>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 7, textAlign: 'center' }}>
                    Nói: máy bị gì · nghe/thấy thế nào · cần gì gấp không
                  </div>
                </>
              )}

              {recording && (
                <>
                  <button onClick={stopRec} style={{ ...bigBtn, background: 'var(--red)', color: 'var(--surf)', padding: 15, fontSize: 15.5, animation: 'none' }}>
                    ⏹ Đang ghi {mmss(recSec)} — bấm để dừng
                  </button>
                  <div style={{ height: 5, borderRadius: 5, background: 'var(--line)', marginTop: 9, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(recSec / MAX_SEC) * 100}%`, background: 'var(--red)', borderRadius: 5, transition: 'width .3s' }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 5, textAlign: 'center' }}>Tối đa {MAX_SEC} giây, tự dừng</div>
                </>
              )}

              {voice && !recording && (
                <>
                  <audio controls src={voice.url} style={{ width: '100%' }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
                    <button onClick={startRec} style={{ flex: 1, padding: 11, borderRadius: 12, border: '1.5px solid var(--line)', background: 'var(--surf)', color: 'var(--ink-2)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>🎙 Ghi lại</button>
                    <button onClick={clearVoice} style={{ flex: 1, padding: 11, borderRadius: 12, border: '1.5px solid var(--line)', background: 'var(--surf)', color: 'var(--red)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>🗑 Xoá</button>
                  </div>
                </>
              )}

              {voiceErr && <div style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 8, lineHeight: 1.4 }}>{voiceErr}</div>}
            </div>

            <div style={card}>
              <div style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-3)', fontWeight: 750, marginBottom: 6 }}>Ảnh (nếu có)</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7 }}>
                {photos.map((p, i) => (
                  <div key={p.url} style={{ position: 'relative' }}>
                    <img src={p.url} alt={`Ảnh ${i + 1}`} style={{ aspectRatio: '1', width: '100%', objectFit: 'cover', borderRadius: 10, display: 'block' }} />
                    {/* ✕ 28px nhìn thấy, vùng chạm 44px ở góc (găng tay vẫn bấm trúng) */}
                    <button type="button" onClick={() => removePhoto(i)} aria-label={`Xoá ảnh ${i + 1}`}
                      style={{ position: 'absolute', top: 0, right: 0, width: 44, height: 44, padding: 4, border: 0, background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'start end' }}>
                      <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,.62)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 800, lineHeight: 1 }}>✕</span>
                    </button>
                  </div>
                ))}
                {photos.length < 3 && (
                  <label style={{ aspectRatio: '1', borderRadius: 10, border: '2px dashed var(--line)', display: 'grid', placeItems: 'center', color: 'var(--g)', fontSize: 22, cursor: 'pointer' }}>
                    📷<input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                      onChange={e => { const fs = e.target.files ? Array.from(e.target.files) : []; e.target.value = ''; addPhoto(fs) }} />
                  </label>
                )}
              </div>
            </div>

            <input value={reporter} onChange={e => setReporter(e.target.value)} placeholder="Tên người báo (nếu muốn)"
              style={{ ...card, border: '1px solid var(--line)', color: 'var(--ink)', fontSize: 15, outline: 'none' }} />

            {err && <div role="alert" style={{ color: 'var(--red)', fontSize: 13, textAlign: 'center' }}>{err}</div>}
            <button disabled={submitting} onClick={submit} style={{ ...bigBtn, background: submitting ? 'var(--line)' : 'var(--red)', color: submitting ? 'var(--ink-2)' : 'var(--surf)', opacity: submitting ? .7 : 1 }}>
              {submitting ? 'Đang gửi…' : 'Gửi ngay'}
            </button>
            <button onClick={() => setMode('view')} style={{ ...bigBtn, background: 'transparent', border: '1.5px solid var(--line)', color: 'var(--ink-3)', padding: 12, fontSize: 14 }}>Quay lại</button>
          </>
        )}
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13.5 }}>
      <span style={{ color: 'var(--ink-3)' }}>{k}</span><span style={{ fontWeight: 650 }}>{v}</span>
    </div>
  )
}
