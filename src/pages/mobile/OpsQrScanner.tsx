// ============================================================================
// OpsQrScanner — lớp phủ quét QR tem máy bằng camera (BarcodeDetector).
// Máy không có BarcodeDetector (Safari/iOS) → vẫn quét bằng html5-qrcode: chụp khung
// hình video ra canvas rồi đọc. Camera không mở được → nhập mã tay. Bắt được mã → onDetect(code).
// Dùng chung cho tem MÁY (mặc định) và tem lô/pallet kho → nơi gọi truyền title/hint/placeholder
// đúng ngữ cảnh (vd Kho: "Quẹt tem lô / pallet" · "vd NVL-PD-…, CH-PD-…, HC7"), đừng để gợi ý HA-LL-01.
// ============================================================================
import { useEffect, useRef, useState } from 'react'

// Rút mã thiết bị từ giá trị QR (URL .../m/tb/HA-LL-01 hoặc mã trần)
export function parseEquipCode(raw: string): string | null {
  if (!raw) return null
  let v = raw.trim()
  try {
    if (/^https?:\/\//i.test(v)) {
      const u = new URL(v)
      const seg = u.pathname.split('/').filter(Boolean)
      v = seg[seg.length - 1] || ''
    }
  } catch { /* dùng nguyên chuỗi */ }
  v = decodeURIComponent(v).toUpperCase()
  const m = v.match(/HA-[A-Z0-9]+-?[A-Z0-9]*/)
  return m ? m[0] : (v || null)
}

// Container ẩn cho html5-qrcode — scanFile đòi một phần tử có id trong DOM
const HTML5_QRCODE_DIV_ID = 'ops-qr-html5qrcode'

export default function OpsQrScanner({
  onDetect, onClose,
  title = 'Quẹt tem QR trên máy',
  hint = 'Hoặc gõ mã trên tem (vd HA-LL-01)',
  placeholder = 'HA-…',
}: {
  onDetect: (code: string) => void
  onClose: () => void
  /** tiêu đề thanh trên (mặc định: tem máy) */
  title?: string
  /** dòng gợi ý trên ô gõ mã tay */
  hint?: string
  /** chữ mờ trong ô gõ mã tay */
  placeholder?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [err, setErr] = useState<string | null>(null)
  const [manual, setManual] = useState('')

  useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false
    // Safari/iOS không có BarcodeDetector → detector = null, quét bằng html5-qrcode bên dưới
    const detector = 'BarcodeDetector' in window
      ? new (window as any).BarcodeDetector({ formats: ['qr_code'] })
      : null
    let qr: import('html5-qrcode').Html5Qrcode | null = null
    const canvas = document.createElement('canvas')
    let lastScan = 0

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return }
        const v = videoRef.current
        if (v) { v.srcObject = stream; await v.play() }
        loop()
      } catch {
        setErr('Không mở được camera. Nhập mã tem tay bên dưới.')
      }
    }
    async function loop() {
      const v = videoRef.current
      if (!v || stopped) return
      try {
        if (detector) {
          const codes = await detector.detect(v)
          if (codes && codes.length) {
            const code = parseEquipCode(codes[0].rawValue)
            if (code) { stopped = true; onDetect(code); return }
          }
        } else if (v.readyState === 4 && Date.now() - lastScan > 250) {
          // Fallback html5-qrcode: chụp khung hình ra canvas rồi đọc (giãn ~4 lần/giây)
          lastScan = Date.now()
          if (!qr) {
            const { Html5Qrcode } = await import('html5-qrcode')
            qr = new Html5Qrcode(HTML5_QRCODE_DIV_ID, false)
          }
          canvas.width = v.videoWidth
          canvas.height = v.videoHeight
          canvas.getContext('2d')?.drawImage(v, 0, 0)
          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
          if (blob && !stopped) {
            const file = new File([blob], 'frame.png', { type: 'image/png' })
            const text = await qr.scanFile(file, false) // reject khi khung không có QR → xuống catch
            const code = parseEquipCode(text)
            if (code) { stopped = true; onDetect(code); return }
          }
        }
      } catch { /* bỏ qua khung lỗi */ }
      raf = requestAnimationFrame(loop)
    }
    start()
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      if (qr) { try { qr.clear() } catch { /* đã dọn */ } }
      if (stream) stream.getTracks().forEach(t => t.stop())
    }
  }, [onDetect])

  const S = {
    wrap: { position: 'fixed', inset: 0, zIndex: 60, background: '#000', display: 'flex', flexDirection: 'column' } as React.CSSProperties,
    video: { flex: 1, width: '100%', objectFit: 'cover', background: '#000' } as React.CSSProperties,
    frame: { position: 'absolute', top: '50%', left: '50%', width: 220, height: 220, transform: 'translate(-50%,-50%)', border: '3px solid #52C41A', borderRadius: 20, boxShadow: '0 0 0 100vmax rgba(0,0,0,.45)' } as React.CSSProperties,
    bar: { padding: 'calc(12px + env(safe-area-inset-top)) 16px 12px', color: '#fff', display: 'flex', alignItems: 'center', gap: 12, fontWeight: 700 } as React.CSSProperties,
    foot: { padding: '16px 16px calc(20px + env(safe-area-inset-bottom))', background: '#0B1A13', color: '#fff' } as React.CSSProperties,
    input: { width: '100%', padding: 12, borderRadius: 12, border: '1.5px solid #2b3a30', background: '#121A15', color: '#fff', fontSize: 15, fontFamily: 'monospace', letterSpacing: '.05em' } as React.CSSProperties,
  }
  return (
    <div style={S.wrap}>
      <div style={S.bar}>
        <button type="button" onClick={onClose} aria-label="Đóng" style={{ background: 'none', border: 0, color: '#fff', fontSize: 24, cursor: 'pointer', minWidth: 44, minHeight: 44 }}>✕</button>
        <span>{title}</span>
      </div>
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        {!err ? <>
          <video ref={videoRef} style={S.video} muted playsInline />
          <div style={S.frame} />
          <div style={{ position: 'absolute', bottom: 18, left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 13, opacity: .9 }}>Đưa ô xanh trùm lên tem QR</div>
        </> : (
          <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: '#fff', textAlign: 'center', padding: 24 }}>
            <div>
              <div style={{ fontSize: 40 }}>📷</div>
              <div style={{ marginTop: 10, fontSize: 14, opacity: .9, maxWidth: 260 }}>{err}</div>
            </div>
          </div>
        )}
        <div id={HTML5_QRCODE_DIV_ID} style={{ display: 'none' }} />
      </div>
      <div style={S.foot}>
        <div style={{ fontSize: 12, opacity: .7, marginBottom: 6 }}>{hint}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={S.input} value={manual} onChange={e => setManual(e.target.value)} placeholder={placeholder} autoCapitalize="characters" aria-label={hint} />
          <button onClick={() => { const c = parseEquipCode(manual); if (c) onDetect(c) }} disabled={!manual.trim()}
            style={{ border: 0, borderRadius: 12, padding: '0 18px', background: '#52C41A', color: '#06210A', fontWeight: 800, fontSize: 14, cursor: 'pointer', opacity: manual.trim() ? 1 : .5 }}>Đi</button>
        </div>
      </div>
    </div>
  )
}
