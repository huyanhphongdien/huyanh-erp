import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import viVN from 'antd/locale/vi_VN'
import App from './App'

const theme = {
  token: {
    colorPrimary: '#1B4D3E',
    borderRadius: 8,
    // Màn hình đặt tại bãi cân, thao tác viên đứng cách 50–80cm → chữ nền lớn hơn ERP.
    fontSize: 16,
    fontFamily: "'Be Vietnam Pro', -apple-system, sans-serif",
  },
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={viVN} theme={theme}>
      <App />
    </ConfigProvider>
  </React.StrictMode>,
)
