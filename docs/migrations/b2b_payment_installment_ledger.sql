-- ============================================================================
-- B2B PAYMENT INSTALLMENT LEDGER — Bỏ trigger on_settlement_paid
-- File: docs/migrations/b2b_payment_installment_ledger.sql
-- Date: 2026-05-28
-- ============================================================================
--
-- BỐI CẢNH: Chuyển sang mô hình thanh toán NHIỀU ĐỢT (installment).
-- App (paymentService.createPayment) giờ tự ghi 1 bút toán CREDIT 'payment_paid'
-- cho TỪNG đợt (reference_code = <settlement_code>-PAY-<payment_id>) + tự đổi
-- status approved → partial_paid → paid.
--
-- Trigger cũ `on_settlement_paid` ghi 1 CREDIT cho TOÀN BỘ remaining khi
-- status → 'paid' (reference_code = <code>-PAY). Nếu giữ → khi đợt cuối làm
-- settlement chuyển 'paid', trigger fire → GHI TRÙNG công nợ (double-count).
--
-- → DROP trigger + function `on_settlement_paid`. Việc ghi ledger thanh toán
--   hoàn toàn do app xử lý per-đợt.
--
-- GIỮ LẠI: trg_settlement_paid_sync_deal (đồng bộ status deal khi paid) —
--          KHÔNG liên quan ledger.
--
-- An toàn: chỉ DROP, idempotent (IF EXISTS). Re-run OK.
-- ============================================================================

BEGIN;

-- Bỏ trigger ghi công nợ khi settlement → paid (app đã thay thế per-đợt)
DROP TRIGGER IF EXISTS trg_settlement_paid ON b2b.settlements;

-- Bỏ luôn function (không còn trigger nào dùng; sync_deal dùng function khác)
DROP FUNCTION IF EXISTS b2b.on_settlement_paid();

-- ────────────────────────────────────────────────────────────────────────────
-- VERIFY
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_trig_exists BOOL;
  v_func_exists BOOL;
  v_sync_exists BOOL;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='b2b' AND c.relname='settlements' AND t.tgname='trg_settlement_paid'
  ) INTO v_trig_exists;
  SELECT EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='b2b' AND p.proname='on_settlement_paid'
  ) INTO v_func_exists;
  SELECT EXISTS(
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='b2b' AND c.relname='settlements' AND t.tgname='trg_settlement_paid_sync_deal'
  ) INTO v_sync_exists;

  RAISE NOTICE '═══ Verify payment installment ledger ═══';
  RAISE NOTICE '  trg_settlement_paid (ledger) còn? % (mong đợi: f)', v_trig_exists;
  RAISE NOTICE '  function on_settlement_paid còn? % (mong đợi: f)', v_func_exists;
  RAISE NOTICE '  trg_settlement_paid_sync_deal còn? % (mong đợi: t)', v_sync_exists;
END $$;

COMMIT;
