// ============================================================================
// Kho NVL mobile — phần dùng chung: nhà máy đang chọn (nhớ máy), app bar,
// ô nhập kiểu Ops, định dạng số, đọc mã quét (tem lô / mã lô chèn / mã phiếu chèn)
// File: src/pages/mobile/kho/khoCommon.tsx
// ============================================================================
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useActiveFacilities } from '../../../hooks/useActiveFacilities'

const KEY = 'kho_mobile_facility'

export function useKhoFacility() {
  const { data: facilities } = useActiveFacilities()
  const [facilityId, setState] = useState<string | null>(() => { try { return localStorage.getItem(KEY) } catch { return null } })
  useEffect(() => {
    if (!facilities?.length) return
    if (facilityId && facilities.some((f) => f.id === facilityId)) return
    const pd = facilities.find((f) => f.code.toUpperCase() === 'PD') ?? facilities[0]
    setState(pd.id)
  }, [facilities, facilityId])
  const setFacilityId = (id: string) => { setState(id); try { localStorage.setItem(KEY, id) } catch { /* bỏ qua */ } }
  const facility = facilities?.find((f) => f.id === facilityId) ?? null
  return { facilities: facilities ?? [], facilityId, facility, setFacilityId }
}

export const fmtKg = (n: number | null | undefined, d = 1) => (n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: Math.max(d, 1), minimumFractionDigits: 0 }))   // không làm tròn kg (chủ DN 31/10): giữ số lẻ khi có
export const fmtSigned = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? '—' : (n > 0 ? '+' : '') + fmtKg(n, d))
export const fmtDt = (v: string | null | undefined) => (v ? new Date(v).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—')
export const fmtD = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : '—')
export const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export const inp: CSSProperties = { width: '100%', padding: '12px', borderRadius: 12, border: '1.5px solid var(--line)', background: 'var(--surf)', color: 'var(--ink)', fontSize: 16, fontFamily: 'inherit', outline: 'none' }
export const inpBig: CSSProperties = { ...inp, fontSize: 28, fontWeight: 800, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
export const lbl: CSSProperties = { display: 'block', fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.06em' }

export function KhoAppBar({ title, sub, back, right, red }: { title: string; sub?: ReactNode; back?: string | true; right?: ReactNode; red?: boolean }) {
  const nav = useNavigate()
  return (
    <div className={`ops-appbar${red ? ' red' : ''}`}>
      {back && <button onClick={() => (back === true ? nav(-1) : nav(back))} aria-label="Quay lại" style={{ background: 'rgba(255,255,255,.16)', border: 0, color: '#fff', width: 40, height: 40, borderRadius: 12, fontSize: 20, cursor: 'pointer' }}>‹</button>}
      {!back && <div className="ops-av" aria-hidden="true">🏭</div>}
      <div style={{ minWidth: 0 }}>
        <div className="ops-tt" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        {sub && <div className="ops-su">{sub}</div>}
      </div>
      {right && <div className="ops-r">{right}</div>}
    </div>
  )
}

export function FacilitySelect({ value, onChange, facilities }: { value: string | null; onChange: (id: string) => void; facilities: { id: string; code: string; name?: string }[] }) {
  if (facilities.length <= 1) return null
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} aria-label="Nhà máy" style={{ background: 'rgba(255,255,255,.16)', color: '#fff', border: 0, borderRadius: 10, padding: '6px 8px', fontSize: 13, fontWeight: 700 }}>
      {facilities.map((f) => <option key={f.id} value={f.id} style={{ color: '#000' }}>{f.code}</option>)}
    </select>
  )
}

export function Msg({ m }: { m: { ok: boolean; text: string } | null }) {
  if (!m) return null
  return <div className="ops-card" role="status" style={{ background: m.ok ? 'var(--ok-bg)' : 'var(--red-bg)', color: m.ok ? 'var(--ok)' : 'var(--red)', fontWeight: 700, fontSize: 13.5 }}>{m.text}</div>
}

/** Đọc giá trị QR: tem lô (URL …/wms/batch/<uuid>), uuid trần, mã lô NVL, mã lô chèn CH-…, mã phiếu chèn PC-… */
export function parseKhoScan(raw: string): { kind: 'batch_id' | 'mix_lot' | 'mix_issue' | 'batch_no'; value: string } | null {
  if (!raw) return null
  let v = raw.trim()
  try { if (/^https?:\/\//i.test(v)) { const u = new URL(v); const seg = u.pathname.split('/').filter(Boolean); v = seg[seg.length - 1] || '' } } catch { /* nguyên chuỗi */ }
  v = decodeURIComponent(v).trim()
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return { kind: 'batch_id', value: v.toLowerCase() }
  const up = v.toUpperCase()
  if (/^CH-[A-Z0-9]+-\d{6}-\d+$/.test(up)) return { kind: 'mix_lot', value: up }
  if (/^PC-[A-Z0-9]+-\d{6}-\d+$/.test(up)) return { kind: 'mix_issue', value: up }
  return up ? { kind: 'batch_no', value: up } : null
}
