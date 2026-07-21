// ============================================================================
// OpsQrScanner — lớp phủ quét QR tem máy bằng camera (BarcodeDetector).
// Máy nào không có BarcodeDetector → cho nhập mã tay. Bắt được mã → onDetect(code).
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

export default function OpsQrScanner({ onDetect, onClose }: { onDetect: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [err, setErr] = useState<string | null>(null)
  const [manual, setManual] = useState('')
  const [supported] = useState(() => 'BarcodeDetector' in window)

  useEffect(() => {
    if (!supported) return
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false
    const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] })

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
        const codes = await detector.detect(v)
        if (codes && codes.length) {
          const code = parseEquipCode(codes[0].rawValue)
          if (code) { stopped = true; onDetect(code); return }
        }
      } catch { /* bỏ qua khung lỗi */ }
      raf = requestAnimationFrame(loop)
    }
    start()
    return () => { stopped = true; cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach(t => t.stop()) }
  }, [supported, onDetect])

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
        <button onClick={onClose} style={{ background: 'none', border: 0, color: '#fff', fontSize: 24, cursor: 'pointer' }}>✕</button>
        <span>Quẹt tem QR trên máy</span>
      </div>
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        {supported && !err ? <>
          <video ref={videoRef} style={S.video} muted playsInline />
          <div style={S.frame} />
          <div style={{ position: 'absolute', bottom: 18, left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 13, opacity: .9 }}>Đưa ô xanh trùm lên tem QR</div>
        </> : (
          <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: '#fff', textAlign: 'center', padding: 24 }}>
            <div>
              <div style={{ fontSize: 40 }}>📷</div>
              <div style={{ marginTop: 10, fontSize: 14, opacity: .9, maxWidth: 260 }}>{err || 'Máy này không quét QR trong app được. Nhập mã tem tay.'}</div>
            </div>
          </div>
        )}
      </div>
      <div style={S.foot}>
        <div style={{ fontSize: 12, opacity: .7, marginBottom: 6 }}>Hoặc gõ mã trên tem (vd HA-LL-01)</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={S.input} value={manual} onChange={e => setManual(e.target.value)} placeholder="HA-…" autoCapitalize="characters" />
          <button onClick={() => { const c = parseEquipCode(manual); if (c) onDetect(c) }} disabled={!manual.trim()}
            style={{ border: 0, borderRadius: 12, padding: '0 18px', background: '#52C41A', color: '#06210A', fontWeight: 800, fontSize: 14, cursor: 'pointer', opacity: manual.trim() ? 1 : .5 }}>Đi</button>
        </div>
      </div>
    </div>
  )
}
