// ============================================================================
// productionLabels — nhãn + màu TRẠNG THÁI LÔ THÀNH PHẨM SẢN XUẤT
// (production_output_batches.status), MỘT bản cho Chi tiết lệnh SX (tab Thành phẩm) và
// trang Thành phẩm. Trước Đợt 3 audit UI (17/11/2026) hai trang tự chép hai map lệch chữ
// ('Đạt' / 'Đạt QC', 'Mới' / 'Mới tạo').
// Trạng thái QC của LÔ NGUYÊN LIỆU (stock_batches.qc_status: passed/failed/pending…) KHÔNG ở
// đây — dùng BATCH_QC_STATUS_LABELS/COLORS của src/pages/wms/qc/qcLabels.ts.
// ⚠ Chỗ đúng là wms.types (cạnh PRODUCTION_STATUS_LABELS) — file đó thuộc vùng khác, dùng
//   chung app cân; dời về đó khi chủ vùng cho phép, giữ tên export này làm alias.
// Màu theo quy ước EnumTag: xám mới · vàng chờ · xanh lá đạt · đỏ không đạt · xanh dương đã nhập kho.
// ============================================================================

export const OUTPUT_BATCH_STATUS_LABELS: Record<string, string> = {
  created: 'Mới tạo',
  qc_pending: 'Chờ QC',
  qc_passed: 'Đạt QC',
  qc_failed: 'Không đạt QC',
  stored: 'Đã nhập kho',
}

export const OUTPUT_BATCH_STATUS_COLORS: Record<string, string> = {
  created: 'default',
  qc_pending: 'gold',
  qc_passed: 'green',
  qc_failed: 'red',
  stored: 'blue',
}
