// ============================================================================
// tableDefaults — chuẩn bảng antd dùng chung (Đợt 3 audit UI 17/11/2026).
// Trước đó pageSize trải từ 8 đến 1000, nhiều sổ tải một cục `.limit(500)` rồi im lặng mất dòng 501.
// Quy ước: 20 dòng/trang cho sổ THAO TÁC hằng ngày, 50 cho sổ TRA CỨU; luôn cho đổi cỡ trang.
// Sổ dùng AdvancedDataTable thì truyền `error` / `loadLimit` thẳng vào nó (đã có sẵn).
// ============================================================================
import type { TablePaginationConfig } from 'antd'

export const TABLE_PAGE = { thaoTac: 20, traCuu: 50 } as const

/** Phân trang chuẩn — dùng defaultPageSize (không khoá cứng) để nút đổi cỡ trang hoạt động. */
export function stdPagination(pageSize: number = TABLE_PAGE.thaoTac, extra?: TablePaginationConfig): TablePaginationConfig {
  return {
    defaultPageSize: pageSize,
    showSizeChanger: true,
    pageSizeOptions: [20, 50, 100],
    showTotal: (total, [a, b]) => `${a}–${b} / ${total.toLocaleString('vi-VN')} dòng`,
    ...extra,
  }
}

/** Báo khi danh sách chạm trần tải (`.limit(N)`) — thay cho việc im lặng mất dòng cũ. */
export function LimitNotice({ shown, limit, what = 'dòng' }: { shown: number; limit: number; what?: string }) {
  if (shown < limit) return null
  return (
    <div style={{ margin: '8px 0', padding: '6px 12px', borderRadius: 8, background: '#FEF3C7', color: '#92400E', fontSize: 13, fontWeight: 600 }}>
      Đang hiện {limit.toLocaleString('vi-VN')} {what} gần nhất — lọc theo ngày/điều kiện để xem các {what} cũ hơn.
    </div>
  )
}
