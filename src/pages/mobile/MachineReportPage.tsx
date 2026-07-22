// ============================================================================
// MachineReportPage — /m/tb/:code (CÔNG KHAI, không cần đăng nhập) — 1.3 + 1.5
// Công nhân vận hành quét QR trên máy → xem thông tin máy + báo hỏng.
// Không dùng layout desktop. Anon đọc equipment + gọi RPC report_machine_issue.
// ============================================================================
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { compressImage } from '../../lib/imageCompress'

type Machine = { id: string; code: string; name: string; khu_vuc: string | null; cong_suat_kw: number | null }

const SYMPTOMS_DO = ['Không chạy', 'Kêu lạ', 'Nóng bất thường', 'Rò rỉ', 'Rung mạnh', 'Khác']
const SYMPTOMS_VANG = ['Kêu lạ', 'Nóng bất thường', 'Rò rỉ', 'Rung mạnh', 'Chậm/yếu', 'Khác']

const C = {
  g: '#0F5132', gd: '#0A3A24', lime: '#52C41A', ink: '#0B1A13', ink2: '#3D4F46',
  ink3: '#728478', paper: '#EEF1EC', card: '#FFFFFF', line: '#DEE3DA',
  red: '#C1291F', redBg: '#FCE8E6',
}

export default function MachineReportPage() {
  const { code } = useParams<{ code: string }>()
  const [machine, setMachine] = useState<Machine | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

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

  useEffect(() => {
    if (!code) return
    supabase.from('equipment').select('id, code, name, khu_vuc, cong_suat_kw')
      .eq('code', code).maybeSingle()
      .then(({ data }) => {
        if (data) setMachine(data as Machine)
        else setNotFound(true)
        setLoading(false)
      })
  }, [code])

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

  const addPhoto = useCallback(async (files: FileList | null) => {
    if (!files) return
    const arr = Array.from(files).slice(0, 3 - photos.length)
    const next: { file: File; url: string }[] = []
    for (const f of arr) {
      const c = await compressImage(f)
      next.push({ file: c, url: URL.createObjectURL(c) })
    }
    setPhotos(p => [...p, ...next])
  }, [photos.length])

  async function submit() {
    if (!severity) { setErr('Chọn máy đang dừng hay vẫn chạy'); return }
    setSubmitting(true); setErr('')
    try {
      // upload ảnh (nếu có) lên bucket công khai machine-issues
      const urls: string[] = []
      for (const p of photos) {
        const path = `${code}/${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`
        const { error } = await supabase.storage.from('machine-issues').upload(path, p.file)
        if (!error) urls.push(supabase.storage.from('machine-issues').getPublicUrl(path).data.publicUrl)
      }
      // upload ghi âm (nếu có)
      let voiceUrl: string | null = null
      if (voice) {
        const vpath = `${code}/voice_${Date.now()}.${voice.ext}`
        const { error: ve } = await supabase.storage.from('machine-issues')
          .upload(vpath, voice.blob, { contentType: voice.blob.type || 'audio/webm' })
        if (!ve) voiceUrl = supabase.storage.from('machine-issues').getPublicUrl(vpath).data.publicUrl
      }
      const { data, error } = await supabase.rpc('report_machine_issue', {
        p_equipment_code: code, p_severity: severity, p_symptom: symptom || null,
        p_note: note.trim() || null, p_photo_urls: urls, p_reporter_name: reporter.trim() || null,
        p_voice_url: voiceUrl,
      })
      if (error) throw error
      setIssueId(data as string); setStatus('moi'); setMode('sent')
    } catch (e: any) {
      setErr(e.message || 'Gửi thất bại, thử lại')
    } finally { setSubmitting(false) }
  }

  // ── styles ──
  const page: React.CSSProperties = { minHeight: '100vh', background: C.paper, fontFamily: 'Roboto,system-ui,-apple-system,sans-serif', color: C.ink, WebkitFontSmoothing: 'antialiased' }
  const bar: React.CSSProperties = { background: severity === 'do' || mode === 'report' ? C.g : C.g, color: '#fff', padding: '14px 16px' }
  const wrap: React.CSSProperties = { maxWidth: 480, margin: '0 auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 11 }
  const card: React.CSSProperties = { background: C.card, borderRadius: 14, padding: '13px 14px', boxShadow: '0 1px 3px rgba(11,26,19,.09)' }
  const bigBtn: React.CSSProperties = { border: 0, borderRadius: 26, padding: 16, fontSize: 16, fontWeight: 750, width: '100%', cursor: 'pointer' }

  if (loading) return <div style={{ ...page, display: 'grid', placeItems: 'center' }}><div style={{ color: C.ink3 }}>Đang tải…</div></div>

  if (notFound) return (
    <div style={{ ...page, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}>
      <div>
        <div style={{ fontSize: 40 }}>❓</div>
        <div style={{ fontSize: 17, fontWeight: 700, marginTop: 8 }}>Không tìm thấy máy</div>
        <div style={{ color: C.ink3, fontSize: 14, marginTop: 4 }}>Mã <b>{code}</b> chưa có trong hệ thống.</div>
      </div>
    </div>
  )

  // ── ĐÃ GỬI ──
  if (mode === 'sent') {
    const acked = status === 'da_nhan' || status === 'dang_xu_ly' || status === 'xong'
    return (
      <div style={page}>
        <div style={{ ...bar, background: C.g }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{machine?.code} · {machine?.name}</div>
        </div>
        <div style={wrap}>
          <div style={{ ...card, textAlign: 'center', padding: '26px 16px' }}>
            <div style={{ fontSize: 44 }}>{acked ? '✅' : '📨'}</div>
            <div style={{ fontSize: 18, fontWeight: 780, marginTop: 10, color: acked ? C.g : C.ink }}>
              {acked ? 'Đã có người nhận việc' : 'Đã gửi báo hỏng'}
            </div>
            <div style={{ color: C.ink2, fontSize: 14, marginTop: 6 }}>
              {acked ? 'Thợ bảo trì đang xử lý. Cảm ơn bạn.' : 'Đang chờ thợ bảo trì nhận. Bạn có thể đóng trang này.'}
            </div>
            <div style={{ marginTop: 14, display: 'inline-block', padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
              background: severity === 'do' ? C.redBg : '#FDF1D6', color: severity === 'do' ? C.red : '#B7791F' }}>
              {severity === 'do' ? '🔴 Máy đang dừng' : '🟡 Máy vẫn chạy'}
            </div>
          </div>
          <div style={{ textAlign: 'center', fontSize: 12, color: C.ink3 }}>Tự cập nhật khi có người nhận việc</div>
        </div>
      </div>
    )
  }

  const symptoms = severity === 'vang' ? SYMPTOMS_VANG : SYMPTOMS_DO

  return (
    <div style={page}>
      <div style={{ ...bar, background: mode === 'report' ? C.red : C.g }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{mode === 'report' ? '⚠ Báo hỏng máy' : `📍 ${machine?.name}`}</div>
        <div style={{ fontSize: 11.5, opacity: .85, marginTop: 1 }}>
          {machine?.code}{machine?.khu_vuc ? ` · ${machine.khu_vuc}` : ''}{machine?.cong_suat_kw ? ` · ${machine.cong_suat_kw} kW` : ''}
        </div>
      </div>

      <div style={wrap}>
        {mode === 'view' ? (
          <>
            <div style={card}>
              <div style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3, fontWeight: 750, marginBottom: 6 }}>Thông số</div>
              <Row k="Mã máy" v={machine!.code} />
              <Row k="Khu vực" v={machine!.khu_vuc || '—'} />
              <Row k="Công suất" v={machine!.cong_suat_kw ? `${machine!.cong_suat_kw} kW` : '—'} />
            </div>
            <div style={{ ...card, background: '#F5F7F3', border: `1px dashed ${C.line}`, fontSize: 13, color: C.ink3, textAlign: 'center' }}>
              Máy có vấn đề? Bấm nút dưới để báo cho thợ bảo trì — không cần đăng nhập.
            </div>
            <button style={{ ...bigBtn, background: C.red, color: '#fff' }} onClick={() => setMode('report')}>⚠ BÁO HỎNG MÁY NÀY</button>
          </>
        ) : (
          <>
            <div style={card}>
              <div style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3, fontWeight: 750, marginBottom: 8 }}>Máy có đang dừng không?</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button onClick={() => setSeverity('do')} style={{ padding: 15, borderRadius: 12, border: severity === 'do' ? 'none' : `1.5px solid ${C.line}`, background: severity === 'do' ? C.red : C.card, color: severity === 'do' ? '#fff' : C.ink2, fontSize: 14, fontWeight: 780, cursor: 'pointer' }}>Đang dừng</button>
                <button onClick={() => setSeverity('vang')} style={{ padding: 15, borderRadius: 12, border: severity === 'vang' ? 'none' : `1.5px solid ${C.line}`, background: severity === 'vang' ? '#B7791F' : C.card, color: severity === 'vang' ? '#fff' : C.ink2, fontSize: 14, fontWeight: 780, cursor: 'pointer' }}>Vẫn chạy</button>
              </div>
            </div>

            {severity && (
              <div style={card}>
                <div style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3, fontWeight: 750, marginBottom: 8 }}>Hiện tượng</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {symptoms.map(s => (
                    <button key={s} onClick={() => setSymptom(s)} style={{ padding: '8px 13px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                      background: symptom === s ? C.g : C.line, color: symptom === s ? '#fff' : C.ink2 }}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {/* GHI ÂM — nhanh hơn bấm, tay dính mủ vẫn nói được */}
            <div style={card}>
              <div style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3, fontWeight: 750, marginBottom: 8 }}>
                🎙 Ghi âm — nói cho nhanh
              </div>

              {!recording && !voice && (
                <>
                  <button onClick={startRec} style={{ ...bigBtn, background: C.g, color: '#fff', padding: 15, fontSize: 15.5 }}>
                    🎙 Bấm để nói
                  </button>
                  <div style={{ fontSize: 11.5, color: C.ink3, marginTop: 7, textAlign: 'center' }}>
                    Nói: máy bị gì · nghe/thấy thế nào · cần gì gấp không
                  </div>
                </>
              )}

              {recording && (
                <>
                  <button onClick={stopRec} style={{ ...bigBtn, background: C.red, color: '#fff', padding: 15, fontSize: 15.5, animation: 'none' }}>
                    ⏹ Đang ghi {mmss(recSec)} — bấm để dừng
                  </button>
                  <div style={{ height: 5, borderRadius: 5, background: C.line, marginTop: 9, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(recSec / MAX_SEC) * 100}%`, background: C.red, borderRadius: 5, transition: 'width .3s' }} />
                  </div>
                  <div style={{ fontSize: 11, color: C.ink3, marginTop: 5, textAlign: 'center' }}>Tối đa {MAX_SEC} giây, tự dừng</div>
                </>
              )}

              {voice && !recording && (
                <>
                  <audio controls src={voice.url} style={{ width: '100%' }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
                    <button onClick={startRec} style={{ flex: 1, padding: 11, borderRadius: 12, border: `1.5px solid ${C.line}`, background: C.card, color: C.ink2, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>🎙 Ghi lại</button>
                    <button onClick={clearVoice} style={{ flex: 1, padding: 11, borderRadius: 12, border: `1.5px solid ${C.line}`, background: C.card, color: C.red, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>🗑 Xoá</button>
                  </div>
                </>
              )}

              {voiceErr && <div style={{ color: C.red, fontSize: 12.5, marginTop: 8, lineHeight: 1.4 }}>{voiceErr}</div>}
            </div>

            <div style={card}>
              <div style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: C.ink3, fontWeight: 750, marginBottom: 6 }}>Ảnh (nếu có)</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7 }}>
                {photos.map((p, i) => <img key={i} src={p.url} style={{ aspectRatio: '1', width: '100%', objectFit: 'cover', borderRadius: 10 }} />)}
                {photos.length < 3 && (
                  <label style={{ aspectRatio: '1', borderRadius: 10, border: `2px dashed ${C.line}`, display: 'grid', placeItems: 'center', color: C.g, fontSize: 22, cursor: 'pointer' }}>
                    📷<input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => addPhoto(e.target.files)} />
                  </label>
                )}
              </div>
            </div>

            <input value={reporter} onChange={e => setReporter(e.target.value)} placeholder="Tên người báo (nếu muốn)"
              style={{ ...card, border: `1px solid ${C.line}`, fontSize: 15, outline: 'none' }} />

            {err && <div style={{ color: C.red, fontSize: 13, textAlign: 'center' }}>{err}</div>}
            <button disabled={submitting} onClick={submit} style={{ ...bigBtn, background: submitting ? C.line : C.red, color: '#fff', opacity: submitting ? .7 : 1 }}>
              {submitting ? 'Đang gửi…' : 'Gửi ngay'}
            </button>
            <button onClick={() => setMode('view')} style={{ ...bigBtn, background: 'transparent', border: `1.5px solid ${C.line}`, color: C.ink3, padding: 12, fontSize: 14 }}>Quay lại</button>
          </>
        )}
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13.5 }}>
      <span style={{ color: '#728478' }}>{k}</span><span style={{ fontWeight: 650 }}>{v}</span>
    </div>
  )
}
