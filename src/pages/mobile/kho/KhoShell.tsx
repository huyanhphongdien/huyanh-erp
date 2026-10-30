// ============================================================================
// KhoShell — vỏ mobile "Kho NVL" cho thủ kho: .ops-root + 3 tab (Lô NVL / Nhập / Chèn)
// + FAB quẹt QR (tem lô, mã lô chèn, mã phiếu chèn). Route: /m/kho/*
// File: src/pages/mobile/kho/KhoShell.tsx
// ============================================================================
import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import OpsQrScanner from '../OpsQrScanner'
import { rawStockService } from '../../../services/wms/rawStockService'
import { mixService } from '../../../services/wms/mixService'
import { parseKhoScan } from './khoCommon'
import '../opsTheme.css'
import './khoMix.css'

const I = {
  lots: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><path d="M3 9l9-5 9 5v10l-9 5-9-5z" /><path d="M3 9l9 5 9-5M12 14v10" /></svg>,
  count: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4h6v3H9zM8.5 12l2 2 4-4M8.5 17h7" /></svg>,
  intake: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><path d="M4 7h16v13H4z" /><path d="M12 3v9M8 8l4 4 4-4" /></svg>,
  fg: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M7 8V5h10v3M3 14h18" /></svg>,
  mix: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><path d="M4 17l6-6 4 4 6-6" /><path d="M14 9h6v6" /></svg>,
}
const TABS = [
  { to: '/m/kho', ico: I.lots, label: 'Lô NVL', exact: true, also: ['/m/kho/lo'] },
  { to: '/m/kho/nhap', ico: I.intake, label: 'Nhập', exact: false, also: [] },
  { to: '/m/kho/kiem-ke', ico: I.count, label: 'Kiểm kê', exact: false, also: [] },
  { to: '/m/kho/chen', ico: I.mix, label: 'Chèn', exact: false, also: [] },
  { to: '/m/kho/tp', ico: I.fg, label: 'Thành phẩm', exact: false, also: [] },
]

export default function KhoShell() {
  const loc = useLocation()
  const nav = useNavigate()
  const [scan, setScan] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const showFab = loc.pathname === '/m/kho'   // tab Chèn: đã có 'Quét tem CH' trong màn Lấy, nút nổi che nội dung
  // Màn sâu của hàng chèn (lấy / phiếu / ký) chạy toàn màn hình, không có thanh tab dưới (theo mockup 30/10)
  const deep = /^\/m\/kho\/(chen\/.+|xuat|tp\/.+)/.test(loc.pathname)

  async function onDetect(raw: string) {
    setScan(false)
    const p = parseKhoScan(raw)
    if (!p) return
    try {
      if (p.kind === 'batch_id') { nav(`/m/kho/lo/${p.value}`); return }
      if (p.kind === 'mix_lot') { const l = await mixService.findLotByCode(p.value); if (l) { nav(`/m/kho/chen?lot=${l.id}`); return } }
      if (p.kind === 'mix_issue') { const i = await mixService.findIssueByCode(p.value); if (i) { nav(`/m/kho/chen/phieu/${i.id}`); return } }
      const hits = await rawStockService.getBatches({ search: p.value, includeEmpty: true, limit: 5 })
      const exact = hits.find((h) => h.batch_no.toUpperCase() === p.value) ?? (hits.length === 1 ? hits[0] : null)
      if (exact) { nav(`/m/kho/lo/${exact.batch_id}`); return }
      setNote(`Không tìm thấy "${p.value}"`)
    } catch (e: any) { setNote(e?.message || 'Không đọc được mã') }
    setTimeout(() => setNote(null), 3500)
  }

  return (
    <div className={`ops-root kho-root${deep ? ' kho-deep' : ''}`}>
      <Outlet />
      {note && <div className="ops-card" role="status" style={{ position: 'absolute', left: 12, right: 12, bottom: 'calc(90px + env(safe-area-inset-bottom))', background: 'var(--red-bg)', color: 'var(--red)', fontWeight: 700, zIndex: 22 }}>{note}</div>}
      {showFab && !deep && <button className="ops-fab" onClick={() => setScan(true)} aria-label="Quẹt QR lô">📷</button>}
      {!deep && <nav className="ops-botnav">
        {TABS.map((t) => {
          const on = t.exact ? loc.pathname === t.to || loc.pathname === t.to + '/' || t.also.some((a) => loc.pathname.startsWith(a)) : loc.pathname.startsWith(t.to)
          return <button key={t.to} className={`it${on ? ' on' : ''}`} onClick={() => nav(t.to)}><span className="ico">{t.ico}</span>{t.label}</button>
        })}
      </nav>}
      {scan && <OpsQrScanner onClose={() => setScan(false)} onDetect={onDetect} />}
    </div>
  )
}
