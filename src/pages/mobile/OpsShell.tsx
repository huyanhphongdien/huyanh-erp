// ============================================================================
// OpsShell — khung App "Huy Anh Ops": .ops-root + thanh điều hướng dưới (4 tab)
// + FAB quẹt QR dùng chung. Mỗi màn con tự dựng .ops-appbar + .ops-body.
// ============================================================================
import { useState, useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import OpsQrScanner from './OpsQrScanner'
import { initWebPush } from '../../services/webPush'
import './opsTheme.css'

// Icon line SVG (kế thừa màu theo .it / .it.on) — sạch hơn emoji, khỏi lệch ngày
const I = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>,
  patrol: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9.5 4h5V6.5h-5z" /><path d="M9 11h6M9 15h4" /></svg>,
  shift: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 9.5h16M8 3v4M16 3v4" /></svg>,
  clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5l3 2" /></svg>,
}
const TABS = [
  { to: '/m/app', ico: I.home, label: 'Hôm nay', exact: true },
  { to: '/m/app/tuan-tra', ico: I.patrol, label: 'Tuần tra', exact: false },
  { to: '/m/app/ca', ico: I.shift, label: 'Ca', exact: false },
  { to: '/m/app/cong', ico: I.clock, label: 'Công', exact: false },
]

export default function OpsShell() {
  const loc = useLocation()
  const nav = useNavigate()
  const [scan, setScan] = useState(false)
  // FAB quẹt QR ở màn Hôm nay (Tuần tra có nút quẹt riêng)
  const showFab = loc.pathname === '/m/app'

  useEffect(() => {
    // PWA: trong màn thợ thì dùng manifest riêng → "Thêm vào màn hình chính"
    // sẽ tạo app "Huy Anh Ops" mở thẳng /m/app (không phải ERP desktop).
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    const prev = link?.getAttribute('href') || '/manifest.json'
    link?.setAttribute('href', '/manifest-ops.json')
    // Đăng ký nhận đẩy nếu user ĐÃ cho phép trước đó (không tự hiện hộp xin quyền)
    initWebPush(false).catch(() => { /* im lặng */ })
    return () => { link?.setAttribute('href', prev) }
  }, [])

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
