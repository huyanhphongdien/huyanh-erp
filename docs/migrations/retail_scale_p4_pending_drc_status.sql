-- ============================================================================
-- retail_scale_p4_pending_drc_status.sql
-- Cân mủ lẻ: thêm trạng thái phiếu 'pending_drc' (CHỜ DRC).
--
-- Quy trình thật: cân xong → CHỜ cán bộ đo DRC → có kết quả → nhập DRC+giá → in.
-- Phiếu ở giữa (đã cân, chưa có DRC) phải KHÁC 'completed' để KHÔNG lọt vào Đề nghị
-- thanh toán (paymentRequestService.listAvailableTickets lọc status='completed').
--
-- CHECK cũ chỉ cho 4 giá trị (weighing_gross/weighing_tare/completed/cancelled).
-- Migration chỉ NỚI thêm 'pending_drc' — không đụng dữ liệu cũ, không ảnh hưởng cân xe.
-- Idempotent: DROP IF EXISTS + ADD. KHÔNG có BEGIN/COMMIT (chạy qua RPC agent_sql).
-- ============================================================================

ALTER TABLE public.weighbridge_tickets
  DROP CONSTRAINT IF EXISTS weighbridge_tickets_status_check;

ALTER TABLE public.weighbridge_tickets
  ADD CONSTRAINT weighbridge_tickets_status_check
  CHECK (status IN ('weighing_gross','weighing_tare','completed','cancelled','pending_drc'));
