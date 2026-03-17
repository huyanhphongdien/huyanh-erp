import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import viVN from 'antd/locale/vi_VN'
import App from './App'

const theme = {
  token: {
    colorPrimary: '#1B4D3E',
    borderRadius: 8,
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
