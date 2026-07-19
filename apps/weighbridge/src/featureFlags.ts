/**
 * Cờ bật/tắt tính năng của app cân — đổi 1 chỗ, áp cho cả màn hình cân lẫn phiếu in.
 */

/**
 * PALLET — TẠM KHÓA (19/07/2026, theo yêu cầu).
 *
 * Lý do: khai pallet sai slot (khai ở lần cân xe rỗng thay vì lần cân xe đầy, hoặc
 * ngược lại) làm KL mủ lệch đúng bằng KL pallet, và đã sai 2 lần trong 1 chuyến.
 * Trong khi chưa chốt lại quy trình pallet → khóa hẳn ô nhập, phiếu mới luôn pallet = 0.
 *
 * Khi khóa:
 *   • Màn hình cân: ẩn toàn bộ ô nhập pallet, luôn gửi pallet = 0 xuống service.
 *   • Phiếu in: không in dòng pallet (phiếu CŨ có pallet ≠ 0 VẪN in, xem PrintPage).
 *
 * Bật lại: đổi thành true (không cần sửa chỗ nào khác).
 */
export const PALLET_ENABLED = false
