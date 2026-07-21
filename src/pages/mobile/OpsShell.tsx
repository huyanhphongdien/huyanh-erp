// ============================================================================
// OpsShell — khung App "Huy Anh Ops": .ops-root + thanh điều hướng dưới (4 tab)
// + FAB quẹt QR dùng chung. Mỗi màn con tự dựng .ops-appbar + .ops-body.
// ============================================================================
import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import OpsQrScanner from './OpsQrScanner'
import './opsTheme.css'

const TABS = [
  { to: '/m/app', ico: '🏠', label: 'Hôm nay', exact: true },
  { to: '/m/app/tuan-tra', ico: '📋', label: 'Tuần tra', exact: false },
  { to: '/m/app/ca', ico: '📅', label: 'Ca', exact: false },
  { to: '/m/app/cong', ico: '🕐', label: 'Công', exact: false },
]

export default function OpsShell() {
  const loc = useLocation()
  const nav = useNavigate()
  const [scan, setScan] = useState(false)
  // FAB quẹt QR ở màn Hôm nay (Tuần tra có nút quẹt riêng)
  const showFab = loc.pathname === '/m/app'

  return (
    <div className="ops-root">
      <Outlet />

      {showFab && (
        <button className="ops-fab" onClick={() => setScan(true)} aria-label="Quẹt QR">📲</button>
      )}

      <nav className="ops-botnav">
        {TABS.map(t => {
          const on = t.exact ? loc.pathname === t.to || loc.pathname === t.to + '/' : loc.pathname.startsWith(t.to)
          return (
            <button key={t.to} className={`it${on ? ' on' : ''}`} onClick={() => nav(t.to)}>
              <span className="ico">{t.ico}</span>{t.label}
            </button>
          )
        })}
      </nav>

      {scan && (
        <OpsQrScanner
          onClose={() => setScan(false)}
          onDetect={(code) => { setScan(false); nav(`/m/tb/${encodeURIComponent(code)}`) }}
        />
      )}
    </div>
  )
}
