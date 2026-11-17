// ============================================================================
// weighbridgeLabels — nhãn + màu TRẠNG THÁI PHIẾU CÂN cho Lịch sử cân và Chi tiết phiếu.
// Đợt 3 audit UI (17/11/2026): 2 bản chép tay đã trôi chữ ('Chờ cân L1' ở sổ vs 'Chờ cân lần 1'
// ở chi tiết). Nguồn duy nhất nay ở weighbridgeService — file này CHỈ re-export, giữ tên.
// ============================================================================
export { WEIGHBRIDGE_STATUS_LABELS, WEIGHBRIDGE_STATUS_COLORS } from '../../../services/wms/weighbridgeService'
