// ============================================================================
// Hàng chèn mobile — tiện ích dùng chung: uuid phiếu sinh trước (để chụp ảnh trước khi ghi),
// tự nhận ca theo chấm công / giờ, ô ảnh kiểu mockup, hộp xem ảnh to, icon.
// File: src/pages/mobile/kho/khoMixUtil.tsx
// ============================================================================
import { useRef, useState, type ReactNode } from 'react'
import { rawPhotoService, type RawPhoto, type RawPhotoKind, type RawPhotoRefType } from '../../../services/wms/rawPhotoService'
import { getActiveShifts, getTodayAttendanceRows, type OpsShiftOption } from '../../../services/opsService'

export function newUuid(): string {
  const c: any = typeof crypto !== 'undefined' ? crypto : null
  if (c?.randomUUID) return c.randomUUID()
  const b = new Uint8Array(16); (c?.getRandomValues ? c.getRandomValues(b) : b.forEach((_, i) => { b[i] = Math.floor(Math.random() * 256) }))
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export interface ShiftPick { id: string; name: string; code: string | null; start_time: string | null; end_time: string | null; nguon: 'cham_cong' | 'gio' | 'tay' }

const toMin = (t: string | null) => { if (!t) return null; const [h, m] = t.split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null }

/** Ca gợi ý: ca đang chấm công của người này; không có thì ca sản xuất khớp giờ hiện tại (ngắn nhất). */
export async function detectShift(employeeId: string | null): Promise<{ pick: ShiftPick | null; shifts: OpsShiftOption[] }> {
  const shifts = (await getActiveShifts().catch(() => [])).filter((s) => !(s.code || '').toUpperCase().startsWith('ADMIN'))
  if (employeeId) {
    const rows = await getTodayAttendanceRows(employeeId).catch(() => [])
    const open = rows.find((r) => r.check_in_time && !r.check_out_time && r.shift_id)
    if (open?.shift_id) {
      const s = shifts.find((x) => x.id === open.shift_id)
      return { pick: { id: open.shift_id, name: s?.name || open.shift?.name || 'Ca đang làm', code: s?.code ?? null, start_time: s?.start_time ?? null, end_time: s?.end_time ?? null, nguon: 'cham_cong' }, shifts }
    }
  }
  const now = new Date(); const cur = now.getHours() * 60 + now.getMinutes()
  const hits = shifts.filter((s) => {
    const a = toMin(s.start_time), b = toMin(s.end_time)
    if (a === null || b === null) return false
    return s.crosses_midnight || b < a ? cur >= a || cur < b : cur >= a && cur < b
  }).sort((x, y) => {
    const d = (s: OpsShiftOption) => { const a = toMin(s.start_time)!, b = toMin(s.end_time)!; return b >= a ? b - a : b + 1440 - a }
    return d(x) - d(y)
  })
  const s = hits[0]
  return { pick: s ? { id: s.id, name: s.name, code: s.code, start_time: s.start_time, end_time: s.end_time, nguon: 'gio' } : null, shifts }
}

export const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '')

export const I = {
  back: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>,
  next: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>,
  check: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>,
  checkSm: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>,
  plus: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>,
  qr: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M7 7h4v4H7zM13 7h4v4h-4zM7 13h4v4H7zM13 13h2M17 13v4h-4" /></svg>,
  camera: <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>,
  pen: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>,
  clock: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5l3 2" /></svg>,
  info: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>,
  lines: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12h18M3 6h18M3 18h18" /></svg>,
  doc: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg>,
  intake: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16v13H4z" /><path d="M12 3v9M8 8l4 4 4-4" /></svg>,
  chev: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>,
}

export function Lightbox({ src, caption, onClose }: { src: string; caption?: string; onClose: () => void }) {
  return <button type="button" className="kmx-lightbox" onClick={onClose} aria-label="Đóng ảnh"><img src={src} alt={caption || 'Ảnh'} />{caption && <span>{caption}</span>}</button>
}

/** 4 ảnh thu nhỏ của một phiếu (lấy: toàn cảnh + cân; trả: toàn cảnh + cân), chạm xem to */
export function PhotoStrip({ out, ret, onOpen }: { out: RawPhoto[]; ret: RawPhoto[]; onOpen: (p: RawPhoto, cap: string) => void }) {
  const pick = (list: RawPhoto[], kind: RawPhotoKind) => list.filter((p) => p.kind === kind).slice(-1)[0]
  const cells: { p?: RawPhoto; cap: string }[] = [
    { p: pick(out, 'toan_canh'), cap: 'Lấy · toàn cảnh' }, { p: pick(out, 'man_hinh_can'), cap: 'Lấy · màn hình cân' },
    { p: pick(ret, 'toan_canh'), cap: 'Trả · toàn cảnh' }, { p: pick(ret, 'man_hinh_can'), cap: 'Trả · màn hình cân' },
  ]
  return (
    <div className="kmx-grid4">
      {cells.map((c, i) => c.p?.public_url
        ? <button key={i} type="button" className="kmx-thumb lg" aria-label={c.cap} onClick={() => onOpen(c.p!, c.cap)}><img src={c.p.public_url} alt="" /></button>
        : <span key={i} className="kmx-thumb lg empty">{c.cap.replace(' · ', '\n')}</span>)}
    </div>
  )
}

export interface KmxPhotoTilesProps {
  refType: RawPhotoRefType
  refId: string
  photos: RawPhoto[]
  facilityCode?: string
  disabled?: boolean
  required?: string[]
  labels?: { toan_canh: string; man_hinh_can: string }
  onChange: () => void
  onError?: (msg: string) => void
}

/** 2 ô ảnh to (toàn cảnh, màn hình cân) + nút ảnh bổ sung — theo mockup; chạm ô đã chụp = chụp lại */
export function KmxPhotoTiles({ refType, refId, photos, facilityCode, disabled, required = ['toan_canh', 'man_hinh_can'], labels, onChange, onError }: KmxPhotoTilesProps) {
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})
  const [busy, setBusy] = useState<RawPhotoKind | null>(null)
  const kinds: ('toan_canh' | 'man_hinh_can')[] = ['toan_canh', 'man_hinh_can']
  const lab = { toan_canh: labels?.toan_canh || 'Toàn cảnh đống hàng', man_hinh_can: labels?.man_hinh_can || 'Màn hình cân' }
  const extra = photos.filter((p) => p.kind === 'bo_sung')

  const pick = async (kind: RawPhotoKind, files: FileList | null) => {
    const f = files?.[0]; if (!f) return
    setBusy(kind)
    try { await rawPhotoService.upload(f, { refType, refId, kind, facilityCode }); onChange() }
    catch (e: any) { onError?.(e?.message || 'Tải ảnh thất bại') }
    finally { setBusy(null); const el = inputs.current[kind]; if (el) el.value = '' }
  }

  return (
    <>
      <div className="kmx-grid2">
        {kinds.map((kind, idx) => {
          const mine = photos.filter((p) => p.kind === kind); const last = mine[mine.length - 1]
          const miss = required.includes(kind) && !last
          return (
            <button key={kind} type="button" className={`kmx-ph${last ? ' done' : miss ? ' miss' : ''}`} disabled={disabled || busy !== null} onClick={() => inputs.current[kind]?.click()}
              aria-label={`Ảnh ${idx + 1} ${lab[kind]}${last ? ', đã chụp, bấm để chụp lại' : ', chưa chụp, bấm để chụp'}`}>
              <span className="img" style={{ color: miss ? '#B91C1C' : '#6B7280' }}>{last?.public_url ? <img src={last.public_url} alt="" /> : I.camera}</span>
              <span className="cap">{idx + 1} · {lab[kind]}<small>{last ? `${new Date(last.taken_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} · đã chụp` : miss ? 'Chạm để chụp' : 'tùy chọn'}</small></span>
              {busy === kind && <span className="busy">đang tải…</span>}
              <input ref={(el) => { inputs.current[kind] = el }} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => pick(kind, e.target.files)} />
            </button>
          )
        })}
      </div>
      {!disabled && (
        <button type="button" className="kmx-ph-add" disabled={busy !== null} onClick={() => inputs.current.bo_sung?.click()}>{I.plus}{busy === 'bo_sung' ? 'đang tải…' : `Thêm ảnh bổ sung (tùy chọn)${extra.length ? ` · đã có ${extra.length}` : ''}`}
          <input ref={(el) => { inputs.current.bo_sung = el }} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => pick('bo_sung', e.target.files)} />
        </button>
      )}
      {disabled && extra.length > 0 && <span className="kmx-sm">{extra.length} ảnh bổ sung</span>}
    </>
  )
}

export function Steps({ cur }: { cur: 1 | 2 | 3 }) {
  const items: [number, ReactNode][] = [[1, 'Chọn lô'], [2, <>Cân &amp; chụp</>], [3, 'Xác nhận']]
  return (
    <nav className="kmx-steps" aria-label="Các bước">
      {items.map(([n, t]) => <div key={n} className={`kmx-step${n < cur ? ' done' : n === cur ? ' now' : ''}`}><b /><span>{n} · {t}</span></div>)}
    </nav>
  )
}
