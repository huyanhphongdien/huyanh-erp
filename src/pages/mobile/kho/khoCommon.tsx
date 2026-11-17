// ============================================================================
// Kho NVL mobile — phần dùng chung: nhà máy đang chọn (nhớ máy), tổ (theo tổ trưởng), định dạng số,
// thông báo (tại chỗ / ghim đáy), xác nhận 2 bước, đọc mã quét (tem lô / mã lô chèn / mã phiếu chèn).
// Mọi màn /m/kho dựng bằng hệ kmx-* (khoMix.css) — Đợt 3 audit UI 17/11/2026 bỏ app bar / ô nhập kiểu ops-*.
// File: src/pages/mobile/kho/khoCommon.tsx
// ============================================================================
import { useEffect, useState, type ReactNode } from 'react'
import { useActiveFacilities } from '../../../hooks/useActiveFacilities'
import { fmtDateTime, fmtDateShort } from '../../../utils/format'

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

// Định dạng dùng chung toàn ERP (src/utils/format.ts — Đợt 3 audit UI): fmtKg/fmtSigned giữ nguyên luật
// "không làm tròn kg" (chủ DN 31/10); fmtDt/fmtD theo chuẩn ngày-trước 'DD/MM HH:mm' / 'DD/MM'.
export { fmtKg, fmtSigned, todayLocal } from '../../../utils/format'
export const fmtDt = (v: string | null | undefined) => fmtDateTime(v)
export const fmtD = (v: string | null | undefined) => fmtDateShort(v)

// Tổ sản xuất gọi theo tên TỔ TRƯỞNG — MỘT danh sách cho mọi màn kho (trước gõ tay ở 5 file). Đổi tổ trưởng = sửa đúng
// hằng này. Hiển thị "Tổ Vang" (không "Ca Vang": chữ "Ca" đã là ca làm việc). Lựa chọn nhớ theo máy ở key 'kmx_team'
// — CHUNG với màn Lấy / Trả hàng chèn (KhoMixOut / KhoMixIssue) để chọn một lần cho cả ca.
export const KHO_TEAMS: readonly string[] = ['Vang', 'Hiền']
export const KHO_TEAM_KEY = 'kmx_team'
export const teamLabel = (t: string | null | undefined) => (t ? `Tổ ${t}` : '')
export function useKhoTeam(): [string, (t: string) => void] {
  const [team, setState] = useState<string>(() => { try { const v = localStorage.getItem(KHO_TEAM_KEY) || ''; return KHO_TEAMS.includes(v) ? v : '' } catch { return '' } })
  const setTeam = (t: string) => { setState(t); try { localStorage.setItem(KHO_TEAM_KEY, t) } catch { /* bỏ qua */ } }
  return [team, setTeam]
}

/** Màu trạng thái kiểu antd của map `XXX_STATUS_COLORS` ở service → lớp `kmx-chip` (một nguồn màu cho máy tính + điện thoại) */
export function kmxChip(antdColor: string | null | undefined): string {
  switch (antdColor) {
    case 'green': case 'success': return 'ok'
    case 'gold': case 'orange': case 'warning': return 'amb'
    case 'blue': case 'processing': case 'cyan': return 'blue'
    case 'red': case 'error': case 'volcano': return 'red'
    default: return 'mut'
  }
}

export function FacilitySelect({ value, onChange, facilities }: { value: string | null; onChange: (id: string) => void; facilities: { id: string; code: string; name?: string }[] }) {
  if (facilities.length <= 1) return null
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} aria-label="Nhà máy" style={{ background: 'rgba(255,255,255,.16)', color: '#fff', border: 0, borderRadius: 10, padding: '0 8px', minHeight: 40, fontSize: 13, fontWeight: 700 }}>
      {facilities.map((f) => <option key={f.id} value={f.id} style={{ color: '#000' }}>{f.code}</option>)}
    </select>
  )
}

/** Thông báo TẠI CHỖ (lỗi tải danh sách ở đầu trang, kèm "Thử lại"). Kết quả thao tác dùng KhoToast. */
export function Msg({ m, onRetry }: { m: { ok: boolean; text: string } | null; onRetry?: () => void }) {
  if (!m) return null
  return (
    <div className={`kmx-msg ${m.ok ? 'ok' : 'err'}`} role={m.ok ? 'status' : 'alert'} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ flex: 1, minWidth: 0 }}>{m.text}</span>
      {!m.ok && onRetry && <button type="button" className="kmx-pill sm" onClick={onRetry}>Thử lại</button>}
    </div>
  )
}

/** Kết quả thao tác — GHIM ĐÁY màn hình, ngay trên thanh tab (trước nằm đầu danh sách: tay đang ở lô thứ 30, chữ báo ở
 *  2 màn phía trên → tưởng máy không phản ứng). Thành công tự ẩn sau 6 s; lỗi giữ tới khi đóng / thao tác mới.
 *  `inline`: vẽ tại chỗ (vd trong kmx-foot ngay trên nút chính) thay vì ghim đáy. */
export function KhoToast({ m, onClose, inline }: { m: { ok: boolean; text: string } | null; onClose: () => void; inline?: boolean }) {
  useEffect(() => {
    if (!m?.ok) return
    const t = window.setTimeout(onClose, 6000)
    return () => window.clearTimeout(t)
  }, [m]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!m) return null
  return (
    <div className={`kmx-toast ${m.ok ? 'ok' : 'err'}${inline ? ' inline' : ''}`} role={m.ok ? 'status' : 'alert'}>
      <span style={{ flex: 1, minWidth: 0 }}>{m.text}</span>
      <button type="button" className="kmx-toast-x" aria-label="Đóng thông báo" onClick={onClose}>✕</button>
    </div>
  )
}

/** Danh sách tải một lần có trần (`.limit(N)`): chạm trần thì NÓI RA, không cắt im lặng. Câu hướng dẫn do nơi gọi truyền
 *  (thứ tự cũ-trước / mới-trước và chỗ xem đủ mỗi màn một khác — câu chung "gần nhất, lọc theo ngày" sẽ sai). */
export function KhoLimitNote({ shown, limit, children }: { shown: number; limit: number; children: ReactNode }) {
  if (shown < limit) return null
  return <div className="kmx-note amb" role="note" style={{ padding: '8px 12px' }}><span>{children}</span></div>
}

/** Hành động phá huỷ trên điện thoại (hủy phiếu / lệnh / lô): xác nhận 2 bước TẠI CHỖ thay window.confirm (hộp hệ điều
 *  hành nút OK/Cancel tiếng Anh, chữ nhỏ, không nói hệ quả). Chạm nút → hiện câu HỆ QUẢ + nút đỏ `xacNhan` / "Không". */
export function XacNhanTaiCho({ nut, hoi, xacNhan, onOk, busy = false, disabled = false }: { nut: ReactNode; hoi: ReactNode; xacNhan: string; onOk: () => void; busy?: boolean; disabled?: boolean }) {
  const [arm, setArm] = useState(false)
  if (!arm) return <button type="button" className="kmx-btn danger" disabled={disabled || busy} onClick={() => setArm(true)}>{nut}</button>
  return (
    <div className="kmx-note red" role="group" aria-label={xacNhan} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
      <span style={{ fontWeight: 600 }}>{hoi}</span>
      <div className="kmx-grid2">
        <button type="button" className="kmx-btn red" disabled={busy} onClick={() => { setArm(false); onOk() }}>{xacNhan}</button>
        <button type="button" className="kmx-btn sec" onClick={() => setArm(false)}>Không</button>
      </div>
    </div>
  )
}

/** Đọc giá trị QR: tem lô (URL …/wms/batch/<uuid>), uuid trần, mã lô NVL, mã lô chèn CH-…, mã phiếu chèn PC-… */
export function parseKhoScan(raw: string): { kind: 'batch_id' | 'mix_lot' | 'mix_issue' | 'mix_pallet' | 'batch_no'; value: string } | null {
  if (!raw) return null
  let v = raw.trim()
  try { if (/^https?:\/\//i.test(v)) { const u = new URL(v); const seg = u.pathname.split('/').filter(Boolean); v = seg[seg.length - 1] || '' } } catch { /* nguyên chuỗi */ }
  v = decodeURIComponent(v).trim()
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return { kind: 'batch_id', value: v.toLowerCase() }
  const up = v.toUpperCase()
  if (/^CH-[A-Z0-9]+-\d{6}-\d+$/.test(up)) return { kind: 'mix_lot', value: up }
  if (/^PC-[A-Z0-9]+-\d{6}-\d+$/.test(up)) return { kind: 'mix_issue', value: up }
  // tem pallet hàng chèn (Sổ pallet p19): "HC7" / "HC07" / "HC-PD-7" → chữ viết tắt HC7 của nhà máy
  // đang chọn. Bỏ số 0 đệm (HC07 → HC7) vì sổ ghi không đệm; tem in cũng nên in không đệm.
  const hc1 = /^HC0*(\d{1,3})$/.exec(up)
  if (hc1) return { kind: 'mix_pallet', value: `HC${Number(hc1[1])}` }
  const hc = /^HC-[A-Z0-9]+-0*(\d{1,3})$/.exec(up)
  if (hc) return { kind: 'mix_pallet', value: `HC${Number(hc[1])}` }
  return up ? { kind: 'batch_no', value: up } : null
}
