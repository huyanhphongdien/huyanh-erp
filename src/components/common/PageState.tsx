// ============================================================================
// PageState — khối 3 trạng thái dùng chung: ĐANG TẢI / LỖI (kèm nút Thử lại) / TRỐNG.
// Trả lời finding lớn nhất của audit 17/11/2026: ~41 màn nuốt lỗi tải rồi hiện
// "Không có dữ liệu" — người dùng ra quyết định trên màn trống GIẢ.
// Cách dùng (bọc quanh phần thân trang/bảng):
//   <PageState loading={isLoading} error={error} onRetry={refetch}
//              empty={rows.length === 0} emptyText="Chưa có phiếu nào"
//              emptyAction={<Button …>+ Tạo phiếu đầu tiên</Button>}>
//     <Table … />
//   </PageState>
// Luật: empty CHỈ được hiện khi query THÀNH CÔNG mà rỗng — component tự đảm bảo
// (error được xét trước empty). Trang dùng useQuery chỉ cần truyền isError/error + refetch.
// File: src/components/common/PageState.tsx (Đợt 2 audit UI)
// ============================================================================

import type { ReactNode } from 'react'
import { Button, Spin } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { dichLoiHeThong } from '../../utils/dichLoiHeThong'

export interface PageStateProps {
  loading?: boolean
  /** lỗi của lần tải (Error | string | object Supabase); truthy = hiện khối lỗi */
  error?: unknown
  onRetry?: () => void
  /** chỉ xét khi không loading, không error */
  empty?: boolean
  emptyText?: ReactNode
  /** nút hành động cho màn trống (vd "+ Tạo phiếu đầu tiên") */
  emptyAction?: ReactNode
  minHeight?: number
  children?: ReactNode
}

export default function PageState({ loading, error, onRetry, empty, emptyText = 'Chưa có dữ liệu', emptyAction, minHeight = 180, children }: PageStateProps) {
  const box = (inner: ReactNode, style?: React.CSSProperties) => (
    <div style={{ minHeight, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, borderRadius: 12, textAlign: 'center', ...style }}>
      {inner}
    </div>
  )
  if (loading) return box(<Spin />)
  if (error) {
    return box(
      <>
        <span style={{ fontWeight: 700, color: '#B91C1C' }}>Không tải được dữ liệu</span>
        <span style={{ fontSize: 13, color: '#7F1D1D', maxWidth: 420 }}>{dichLoiHeThong(error, 'Có lỗi khi tải')}</span>
        {onRetry && <Button icon={<ReloadOutlined />} onClick={onRetry}>Thử lại</Button>}
      </>,
      { background: '#FEF2F2', border: '1px solid #FECACA' }
    )
  }
  if (empty) {
    return box(
      <>
        <span style={{ color: '#6B7280' }}>{emptyText}</span>
        {emptyAction}
      </>
    )
  }
  return <>{children}</>
}
