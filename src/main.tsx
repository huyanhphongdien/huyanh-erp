import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider, App as AntdApp } from 'antd'
import viVN from 'antd/locale/vi_VN'
import 'antd/dist/reset.css'
import { antdTheme } from './config/antdTheme'
import './index.css'
import './styles/airtable-theme.css'
import App from './App.tsx'

// Sau khi deploy mới, các chunk import động (hash cũ) hết hạn → "Failed to fetch
// dynamically imported module" / MIME text/html. Tự reload để nạp bản mới.
// Guard theo thời gian (>10s) tránh reload lặp vô hạn nếu lỗi do nguyên nhân khác.
window.addEventListener('vite:preloadError', () => {
  const last = Number(sessionStorage.getItem('vite_preload_reload_ts') || '0')
  const now = Date.now()
  if (now - last > 10000) {
    sessionStorage.setItem('vite_preload_reload_ts', String(now))
    window.location.reload()
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider theme={antdTheme} locale={viVN}>
      <AntdApp>
        <App />
      </AntdApp>
    </ConfigProvider>
  </StrictMode>,
)