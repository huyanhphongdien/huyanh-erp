-- ============================================================================
-- G-6 FIX — Track DRC source (lookup vs manual override) trên phiếu cân
-- File: docs/migrations/weighbridge_qc_drc_source.sql
-- Date: 2026-05-30
-- ============================================================================
-- Vấn đề: DRC trên phiếu cân có 2 nguồn:
--   - 'lookup': auto từ bảng drc_lookup (operator nhập ĐỐT → tra ra DRC%)
--   - 'manual': operator chỉnh tay (override sau auto, hoặc nhập trực tiếp)
-- Cả 2 cùng lưu vào qc_actual_drc → audit không phân biệt được.
-- Hệ quả: nếu DRC bị sai, QC không biết do bảng lookup sai hay operator nhập sai.
--
-- Fix: thêm cột qc_drc_source CHECK IN ('lookup','manual'). UI set theo nguồn
-- cuối cùng cập nhật DRC.
--
-- An toàn re-run: dùng IF NOT EXISTS.
-- ============================================================================

BEGIN;

ALTER TABLE public.weighbridge_tickets
  ADD COLUMN IF NOT EXISTS qc_drc_source text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'weighbridge_tickets_qc_drc_source_chk'
  ) THEN
    ALTER TABLE public.weighbridge_tickets
      ADD CONSTRAINT weighbridge_tickets_qc_drc_source_chk
      CHECK (qc_drc_source IS NULL OR qc_drc_source IN ('lookup','manual'));
  END IF;
END $$;

COMMENT ON COLUMN public.weighbridge_tickets.qc_drc_source IS
  'G-6: nguồn của qc_actual_drc. NULL = legacy/chưa set. lookup = từ bảng drc_lookup. manual = operator nhập tay.';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='weighbridge_tickets'
--   AND column_name='qc_drc_source';

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ────────────────────────────────────────────────────────────────────────────
-- ALTER TABLE public.weighbridge_tickets DROP CONSTRAINT IF EXISTS weighbridge_tickets_qc_drc_source_chk;
-- ALTER TABLE public.weighbridge_tickets DROP COLUMN IF EXISTS qc_drc_source;
-- ════════════════════════════════════════════════════════════════════════════
