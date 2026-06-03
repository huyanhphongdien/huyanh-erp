-- ============================================================================
-- B2B PARTNERS — UNIQUE định danh, chống trùng TUYỆT ĐỐI ở tầng DB
-- File: docs/migrations/b2b_partners_unique_identity.sql
-- Ngày: 2026-06-02
--
-- Trước đó chống trùng chỉ ở app (b2bPartnerCreateService.findExisting theo
-- CCCD/MST) → race condition / INSERT SQL tay vẫn lọt. Thêm UNIQUE ở DB để
-- DB tự từ chối CCCD trùng. (Partial: chỉ áp khi national_id NOT NULL.)
-- ============================================================================

-- A. KIỂM TRA TRƯỚC: có CCCD trùng đang tồn tại không? (phải = 0 dòng mới tạo được index)
SELECT national_id, COUNT(*) AS so_ban_ghi, string_agg(code, ', ') AS cac_ma
FROM b2b.partners
WHERE national_id IS NOT NULL AND national_id <> ''
GROUP BY national_id
HAVING COUNT(*) > 1;
-- Nếu ra dòng nào → phải gộp/xóa bản trùng TRƯỚC khi chạy phần B (gửi tôi xử lý).


-- B. TẠO UNIQUE INDEX (partial) trên national_id
CREATE UNIQUE INDEX IF NOT EXISTS uq_b2b_partners_national_id
  ON b2b.partners (national_id)
  WHERE national_id IS NOT NULL AND national_id <> '';

-- (Tuỳ chọn) Index thường trên phone để search/dedup SĐT nhanh — KHÔNG unique
-- (SĐT có thể dùng chung hộ gia đình; dedup SĐT để app cảnh báo/chặn mềm).
CREATE INDEX IF NOT EXISTS idx_b2b_partners_phone
  ON b2b.partners (phone)
  WHERE phone IS NOT NULL;

-- C. VERIFY
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'b2b' AND tablename = 'partners'
  AND indexname IN ('uq_b2b_partners_national_id', 'idx_b2b_partners_phone');
