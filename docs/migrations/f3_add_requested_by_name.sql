-- ============================================================================
-- F3 Polish: thêm column "Người chuyển" (text) vào inter_facility_transfers
-- File: docs/migrations/f3_add_requested_by_name.sql
--
-- Vấn đề: Phiếu chuyển không show ai là người yêu cầu/khởi tạo phiếu.
-- created_by là UUID (employees.id hoặc null), không trace được tên dễ.
--
-- Fix: thêm column text plain `requested_by_name` (default lấy user
-- đang đăng nhập, có thể edit nếu tạo hộ).
--
-- Idempotent. Cách chạy: paste vào Supabase SQL Editor → Run.
-- ============================================================================

ALTER TABLE inter_facility_transfers
  ADD COLUMN IF NOT EXISTS requested_by_name VARCHAR(200);

COMMENT ON COLUMN inter_facility_transfers.requested_by_name IS
  'Tên người yêu cầu/khởi tạo phiếu chuyển (text plain, không FK). Auto-fill từ user.full_name khi tạo, có thể edit.';
