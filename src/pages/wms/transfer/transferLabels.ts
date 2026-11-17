// ============================================================================
// transferLabels — nhãn + màu PHIẾU CHUYỂN KHO LIÊN NHÀ MÁY, MỘT bản cho Sổ và Chi tiết.
// Đợt 3 audit UI (17/11/2026): 2 bản chép nguyên khối 8 trạng thái đã lệch chữ
// ('Từ chối (hao hụt cao)' vs 'Từ chối'; 'Đã đến — chờ cân' vs 'Đã đến').
// 'arrived' giữ chữ 'Đã đến' trung tính: trạng thái này gồm cả "chưa cân nhận" lẫn
// "đã cân, hao hụt vượt ngưỡng chờ BGĐ duyệt" (thẻ "Cần BGĐ duyệt" hiện riêng).
// ⚠ Chỗ đúng là transferService — service thuộc vùng khác (dùng chung app cân);
//   dời về đó khi chủ vùng cho phép, giữ tên export này làm alias.
// ============================================================================
import type { TransferStatus } from '../../../services/wms/transferService'

export const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = {
  draft: 'Nháp',
  picking: 'Đang lấy hàng',
  picked: 'Đã lấy hàng',
  in_transit: 'Đang vận chuyển',
  arrived: 'Đã đến',
  received: 'Hoàn tất',
  cancelled: 'Đã hủy',
  rejected: 'Từ chối (hao hụt cao)',
}

export const TRANSFER_STATUS_COLORS: Record<TransferStatus, string> = {
  draft: 'default',
  picking: 'blue',
  picked: 'cyan',
  in_transit: 'gold',
  arrived: 'orange',
  received: 'green',
  cancelled: 'red',
  rejected: 'red',
}
