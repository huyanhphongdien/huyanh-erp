// ============================================================================
// stockInLabels — nhãn + màu PHIẾU NHẬP KHO, MỘT bản cho Sổ và Chi tiết.
// Đợt 3 audit UI (17/11/2026): Sổ ghi 'Xác nhận', Chi tiết ghi 'Đã nhập kho' cho cùng trạng thái;
// Chi tiết thiếu nguồn 'Khách trả' / 'Đóng gói lại' nên hiện mã tiếng Anh thô.
// ⚠ Chỗ đúng là stockInService — service thuộc vùng khác (dùng chung app cân);
//   dời về đó khi chủ vùng cho phép, giữ tên export này làm alias.
// ============================================================================

export const STOCK_IN_STATUS_LABELS: Record<string, string> = {
  draft: 'Nháp',
  confirmed: 'Đã nhập kho',
  cancelled: 'Đã hủy',
}

export const STOCK_IN_STATUS_COLORS: Record<string, string> = {
  draft: 'default',
  confirmed: 'green',
  cancelled: 'red',
}

/** Nguồn nhập (stock_in_orders.source_type) */
export const STOCK_IN_SOURCE_LABELS: Record<string, string> = {
  production: 'Sản xuất',
  purchase: 'Mua hàng',
  blend: 'Phối trộn',
  transfer: 'Chuyển kho',
  adjust: 'Điều chỉnh',
  return: 'Khách trả',
  repack: 'Đóng gói lại',
}

export const STOCK_IN_SOURCE_COLORS: Record<string, string> = {
  production: 'blue',
  purchase: 'purple',
  blend: 'cyan',
  transfer: 'orange',
  adjust: 'default',
  return: 'magenta',
  repack: 'geekblue',
}
