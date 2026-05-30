-- ============================================================================
-- G-4 FIX — UNIQUE INDEX trên b2b.partner_ledger để chặn double-count
-- File: docs/migrations/b2b_partner_ledger_unique_reference.sql
-- Date: 2026-05-30
-- ============================================================================
-- Vấn đề: ledgerService.createManualEntry có check idempotency theo
-- (partner_id, entry_type, reference_code) nhưng chỉ trong APP (SELECT trước
-- INSERT) → race window khi 2 request đồng thời (vd: double-click markPaid,
-- 2 tab cùng mở). Có thể tạo 2 dòng ledger giống nhau → công nợ sai.
--
-- Fix: thêm UNIQUE INDEX (partial — chỉ áp dụng khi reference_code IS NOT NULL,
-- để không phá vỡ các entry adjustment cũ chưa có reference_code).
--
-- An toàn re-run: dùng IF NOT EXISTS.
-- Nếu đang có row trùng → phải dọn trước khi tạo index (xem RECOVERY ở dưới).
-- ============================================================================

BEGIN;

-- Phát hiện duplicate trước khi tạo (chỉ NOTICE, không lỗi)
DO $$
DECLARE
  v_dup_count int;
BEGIN
  SELECT count(*) INTO v_dup_count FROM (
    SELECT partner_id, entry_type, reference_code, count(*) c
    FROM b2b.partner_ledger
    WHERE reference_code IS NOT NULL
    GROUP BY 1,2,3
    HAVING count(*) > 1
  ) x;
  IF v_dup_count > 0 THEN
    RAISE NOTICE 'CẢNH BÁO: có % cặp (partner_id, entry_type, reference_code) trùng. Xem RECOVERY query trong file này.', v_dup_count;
  END IF;
END $$;

-- UNIQUE INDEX partial (NULL-safe)
CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_ledger_ref
ON b2b.partner_ledger (partner_id, entry_type, reference_code)
WHERE reference_code IS NOT NULL;

COMMENT ON INDEX b2b.uq_partner_ledger_ref IS
  'G-4: chặn double-count khi markPaid/createPayment chạy đồng thời. Idempotency dựa vào reference_code.';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT indexname, indexdef FROM pg_indexes
-- WHERE schemaname='b2b' AND tablename='partner_ledger' AND indexname='uq_partner_ledger_ref';

-- ════════════════════════════════════════════════════════════════════════════
-- RECOVERY (nếu CREATE INDEX báo duplicate)
-- ────────────────────────────────────────────────────────────────────────────
-- 1. Xem các cặp trùng:
--    SELECT partner_id, entry_type, reference_code, count(*),
--           array_agg(id ORDER BY created_at) AS ids
--    FROM b2b.partner_ledger
--    WHERE reference_code IS NOT NULL
--    GROUP BY 1,2,3 HAVING count(*) > 1;
--
-- 2. Giữ row sớm nhất, xóa các row sau (nếu chắc chắn là duplicate, không phải
--    legitimate retry với amount khác):
--    DELETE FROM b2b.partner_ledger l
--    WHERE l.id IN (
--      SELECT (array_agg(id ORDER BY created_at))[2:array_length(array_agg(id), 1)]
--      FROM b2b.partner_ledger
--      WHERE reference_code IS NOT NULL
--      GROUP BY partner_id, entry_type, reference_code
--      HAVING count(*) > 1
--    );
--
-- 3. Chạy lại migration này.
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ────────────────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS b2b.uq_partner_ledger_ref;
-- ════════════════════════════════════════════════════════════════════════════
