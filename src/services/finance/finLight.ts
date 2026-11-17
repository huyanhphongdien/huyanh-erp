// ============================================================================
// FINANCE — Thang đèn DÙNG CHUNG cả module Tài chính (Đợt 3 audit UI 17/11/2026)
// File: src/services/finance/finLight.ts
// Trước đó trang Phải nộp tô ĐỎ khoản "còn ≤3 ngày" trong khi mọi trang khác đỏ = QUÁ HẠN.
// Luật: đỏ CHỈ = quá hạn · cam = tới hạn · vàng = sắp tới · xanh = còn hạn / xong · xám = đã đóng.
// Các map *_COLOR của từng service (ALERT_COLOR, IALERT_COLOR, AR_ALERT_COLOR, PAY_ALERT_COLOR)
// lấy màu từ đây — đừng gõ lại hex. (Đèn CIC trong loanService có thang riêng 5 mức.)
// ============================================================================
export const FIN_LIGHT = {
  ok: '#16a34a',
  soon: '#ca8a04',
  due: '#ea580c',
  overdue: '#dc2626',
  closed: '#9ca3af',
} as const
