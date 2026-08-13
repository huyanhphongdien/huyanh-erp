-- ============================================================================
-- Thu tiền THEO LÔ: thêm lot_no vào sales_order_payments.
-- Đơn xuất nhiều lô (D/P mỗi lô 1 bộ chứng từ) → mỗi lô thu tiền riêng.
-- lot_no NULL = khoản thu cho CẢ ĐƠN (chưa gán lô) → tương thích data cũ.
-- payment_status cấp ĐƠN (tổng đã thu vs total_value_usd) GIỮ NGUYÊN;
-- trạng thái thu theo lô tính thêm ở service (SUM theo lô vs trị giá lô).
-- Idempotent. Áp qua agent_sql 2026-08-11.
-- ============================================================================
alter table sales_order_payments add column if not exists lot_no int;

comment on column sales_order_payments.lot_no is
  'Lô (lot_no) mà khoản thu thuộc về; NULL = cả đơn / chưa gán lô.';

create index if not exists idx_sop_order_lot on sales_order_payments(sales_order_id, lot_no);
