-- ============================================================================
-- B2B PARTNERS — Cho phép SĐT để TRỐNG (phone nullable)
-- File: docs/migrations/b2b_partners_phone_optional.sql
-- Ngày: 2026-06-05
--
-- Lý do: đại lý nhỏ / hộ nông dân nhiều khi chưa có SĐT lúc tạo. Bỏ ràng buộc
-- bắt buộc SĐT ở app (b2bPartnerCreateService + PartnerCreateModal) → cần cột
-- phone cho phép NULL ở DB.
--
-- An toàn: idempotent. DROP NOT NULL chạy khi cột đã nullable = no-op (không lỗi).
-- KHÔNG đụng dữ liệu hiện có. CCCD vẫn UNIQUE-partial (xem b2b_partners_unique_identity.sql).
-- ============================================================================

ALTER TABLE b2b.partners ALTER COLUMN phone DROP NOT NULL;

-- VERIFY: is_nullable phải = 'YES'
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema = 'b2b' AND table_name = 'partners' AND column_name = 'phone';
