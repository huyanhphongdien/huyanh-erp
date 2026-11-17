// ============================================================================
// ErrorBoundary — chặn lỗi RENDER để không trắng cả màn hình (audit UI 17/11/2026, Đợt 3).
// Trước đó toàn src không có boundary nào: 1 trang lazy lỗi (data bất ngờ null…) là React gỡ cả cây,
// người dùng nhà máy chỉ thấy trang trắng. Giờ hiện màn lỗi tiếng Việt + nút Tải lại.
// Dùng:
//   <ErrorBoundary resetKey={location.pathname}>…</ErrorBoundary>   — đổi trang là tự gỡ màn lỗi
// Lỗi chunk sau deploy vẫn do main.tsx (vite:preloadError) tự reload; boundary chỉ là lưới đỡ cuối.
// File: src/components/common/ErrorBoundary.tsx
// ============================================================================
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button, Result } from 'antd'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Giá trị đổi (vd pathname) thì gỡ màn lỗi và vẽ lại con */
  resetKey?: unknown
  /** Khung nhỏ (trong tab / trong layout) thay vì cả màn */
  compact?: boolean
}

interface ErrorBoundaryState {
  error: Error | null
}

const LOI_CHUNK = /dynamically imported module|loading chunk|importing a module script failed|failed to fetch dynamically/i

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Giữ nguyên log để IT lần ra lỗi
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  componentDidUpdate(prev: ErrorBoundaryProps) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const laChunk = LOI_CHUNK.test(error.message || '')
    return (
      <div style={{ padding: this.props.compact ? 16 : 24, minHeight: this.props.compact ? 240 : '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Result
          status="error"
          title="Có lỗi khi hiển thị màn này"
          subTitle={laChunk
            ? 'Hệ thống vừa được cập nhật phiên bản mới — bấm Tải lại trang để nạp bản mới.'
            : 'Bấm Tải lại trang. Nếu vẫn lỗi, chụp màn hình này gửi IT (nội bộ 100).'}
          extra={[
            <Button type="primary" key="reload" onClick={() => window.location.reload()}>
              Tải lại trang
            </Button>,
            <Button key="home" onClick={() => { window.location.href = '/' }}>
              Về Tổng quan
            </Button>,
          ]}
        />
      </div>
    )
  }
}

export default ErrorBoundary
