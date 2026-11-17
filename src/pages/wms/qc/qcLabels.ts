// ============================================================================
// qcLabels — nhãn + màu TRẠNG THÁI QC CỦA LÔ (stock_batches.qc_status) cho các màn kho thành phẩm:
// Xuất kho (sổ/chi tiết/tạo/lấy hàng), Nhập kho, Sơ đồ bãi, Chi tiết tồn.
// Trước Đợt 3 audit UI (17/11/2026) có 5 bản chép tay đã trôi chữ ('Chờ QC' / 'Chờ kiểm',
// 'Cần trộn' / 'Cần phối trộn', 'Dat' không dấu). Nguồn duy nhất nay ở wms.types — file này
// CHỈ re-export, giữ tên.
// ============================================================================
export { BATCH_QC_STATUS_LABELS, BATCH_QC_STATUS_COLORS } from '../../../services/wms/wms.types'
