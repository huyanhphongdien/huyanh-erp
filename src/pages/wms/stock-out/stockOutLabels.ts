// ============================================================================
// stockOutLabels — nhãn + màu PHIẾU XUẤT KHO, MỘT bản cho Sổ / Chi tiết / Tạo phiếu / Lấy hàng.
// Đợt 3 audit UI (17/11/2026): Sổ ghi 'Đang lấy' / 'Đã xuất', Chi tiết ghi 'Đang lấy hàng' /
// 'Đã xuất kho' cho CÙNG một phiếu — bấm từ sổ sang chi tiết chữ trạng thái đổi.
// ⚠ Chỗ đúng là stockOutService — service thuộc vùng khác (dùng chung app cân);
//   dời về đó khi chủ vùng cho phép, giữ tên export này làm alias.
// Màu theo quy ước EnumTag: xám nháp · xanh dương đang làm · vàng chờ · xanh lá xong · đỏ huỷ.
// ============================================================================

export const STOCK_OUT_STATUS_LABELS: Record<string, string> = {
  draft: 'Nháp',
  picking: 'Đang lấy hàng',
  picked: 'Đã lấy hàng',
  confirmed: 'Đã xuất kho',
  cancelled: 'Đã hủy',
}

export const STOCK_OUT_STATUS_COLORS: Record<string, string> = {
  draft: 'default',
  picking: 'blue',
  picked: 'gold',
  confirmed: 'green',
  cancelled: 'red',
}

/** Lý do xuất (stock_out_orders.reason) */
export const STOCK_OUT_REASON_LABELS: Record<string, string> = {
  sale: 'Bán hàng',
  production: 'Sản xuất',
  transfer: 'Chuyển kho',
  blend: 'Phối trộn',
  adjust: 'Điều chỉnh',
  return: 'Trả hàng',
}

export const STOCK_OUT_REASON_COLORS: Record<string, string> = {
  sale: 'green',
  production: 'blue',
  transfer: 'purple',
  blend: 'cyan',
  adjust: 'default',
  return: 'orange',
}

/** Trạng thái lấy hàng của TỪNG DÒNG (stock_out_details.picking_status) */
export const PICKING_STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ lấy',
  picking: 'Đang lấy',
  picked: 'Đã lấy',
  skipped: 'Bỏ qua',
}

export const PICKING_STATUS_COLORS: Record<string, string> = {
  pending: 'default',
  picking: 'blue',
  picked: 'green',
  skipped: 'orange',
}
