-- ============================================================================
-- B2B LEDGER TRIGGERS — Snapshot từ Supabase prod (version-control)
-- File: docs/migrations/b2b_ledger_triggers_snapshot.sql
-- Date: 2026-05-28
-- ============================================================================
--
-- MỤC ĐÍCH: Lưu vết 4 trigger + function điều khiển CÔNG NỢ B2B (b2b.partner_ledger).
-- Trước đây chúng CHỈ tồn tại trên DB prod (tạo tay), không có trong repo →
-- nếu restore/tạo lại Supabase mà thiếu, công nợ sẽ NGỪNG tự sinh mà không báo lỗi.
--
-- Nguồn: pg_get_functiondef / pg_get_triggerdef chạy trên prod 2026-05-28
-- (function = nguyên văn từ DB; trigger = dựng lại idempotent, khớp introspection).
--
-- Cơ chế công nợ (entry vào b2b.partner_ledger):
--   - Duyệt quyết toán (settlements.status → approved) → DEBIT 'settlement_receivable'
--   - Thanh toán quyết toán (settlements.status → paid)  → CREDIT 'payment_paid'
--   - Chi tạm ứng (advances.status → paid)               → CREDIT 'advance_paid'
--   - Mọi INSERT vào partner_ledger → tự tính running_balance (số dư lũy kế)
--   Idempotency: dựa unique_violation EXCEPTION (reference_code unique) → chạy lại an toàn.
--
-- An toàn: toàn bộ dùng CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS → re-run OK.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- FUNCTIONS
-- ────────────────────────────────────────────────────────────────────────────

-- 1) Tự tính số dư lũy kế mỗi khi INSERT 1 dòng công nợ
CREATE OR REPLACE FUNCTION b2b.compute_ledger_running_balance()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN IF TG_OP != $$INSERT$$ THEN RETURN NEW; END IF; SELECT COALESCE(SUM(COALESCE(debit, 0) - COALESCE(credit, 0)), 0) INTO NEW.running_balance FROM b2b.partner_ledger WHERE partner_id = NEW.partner_id AND id != NEW.id AND (created_at < NEW.created_at OR (created_at = NEW.created_at AND id < NEW.id)); NEW.running_balance := NEW.running_balance + COALESCE(NEW.debit, 0) - COALESCE(NEW.credit, 0); RETURN NEW; END; $function$;

-- 2) Chi tạm ứng (advances.status → paid) → CREDIT 'advance_paid'
CREATE OR REPLACE FUNCTION b2b.on_advance_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'b2b', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.status = 'paid'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid')
  THEN
    BEGIN
      INSERT INTO b2b.partner_ledger (
        partner_id, entry_type, debit, credit,
        advance_id, reference_code, description,
        entry_date, created_by
      ) VALUES (
        NEW.partner_id,
        'advance_paid',
        0,
        COALESCE(NEW.amount_vnd, NEW.amount),
        NEW.id,
        NEW.advance_number,
        'Tạm ứng ' || NEW.advance_number || COALESCE(' - ' || NEW.purpose, ''),
        COALESCE(NEW.paid_at::DATE, NEW.payment_date, NOW()::DATE),
        COALESCE(NEW.paid_by, NEW.approved_by, NEW.requested_by)
      );
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$function$;

-- 3) Thanh toán quyết toán (settlements.status → paid) → CREDIT 'payment_paid'
CREATE OR REPLACE FUNCTION b2b.on_settlement_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'b2b', 'public', 'pg_temp'
AS $function$ DECLARE v_amount NUMERIC; BEGIN IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN v_amount := COALESCE(NEW.paid_amount, NEW.remaining_amount, 0); IF v_amount > 0 THEN BEGIN INSERT INTO b2b.partner_ledger (partner_id, entry_type, debit, credit, settlement_id, reference_code, description, entry_date, created_by) VALUES (NEW.partner_id, 'payment_paid', 0, v_amount, NEW.id, NEW.code || '-PAY', 'Thanh toan quyet toan ' || NEW.code || COALESCE(' (' || NEW.payment_method || ')', ''), COALESCE(NEW.paid_at::DATE, NOW()::DATE), COALESCE(NEW.paid_by, NEW.approved_by)); EXCEPTION WHEN unique_violation THEN NULL; END; END IF; END IF; RETURN NEW; END; $function$;

-- 4) Duyệt quyết toán (settlements.status → approved) → DEBIT 'settlement_receivable'
CREATE OR REPLACE FUNCTION b2b.on_settlement_approved()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    BEGIN
      INSERT INTO b2b.partner_ledger (
        partner_id, entry_type, debit, credit,
        settlement_id, reference_code, description,
        entry_date, created_by
      ) VALUES (
        NEW.partner_id,
        'settlement_receivable',
        NEW.gross_amount,
        0,
        NEW.id,
        NEW.code,
        'Quyết toán ' || NEW.code || ' - ' || COALESCE(NEW.product_type, '') ||
          ' - KL: ' || NEW.finished_kg || 'kg × ' || NEW.approved_price || 'đ/kg',
        NOW()::DATE,
        NEW.approved_by
      );
    EXCEPTION WHEN unique_violation THEN
      -- Idempotent: ledger entry đã tồn tại (rollback paid→approved) → skip
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$function$;

-- ────────────────────────────────────────────────────────────────────────────
-- TRIGGERS (dựng lại idempotent — khớp introspection prod 2026-05-28)
-- ⚠️ Nếu pg_get_triggerdef trên prod khác (vd có WHEN clause), thay 4 dòng dưới
--    bằng output thật của query (2).
-- ────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_compute_ledger_running_balance ON b2b.partner_ledger;
CREATE TRIGGER trg_compute_ledger_running_balance
  BEFORE INSERT ON b2b.partner_ledger
  FOR EACH ROW EXECUTE FUNCTION b2b.compute_ledger_running_balance();

DROP TRIGGER IF EXISTS trg_on_advance_paid ON b2b.advances;
CREATE TRIGGER trg_on_advance_paid
  AFTER INSERT OR UPDATE OF status ON b2b.advances
  FOR EACH ROW EXECUTE FUNCTION b2b.on_advance_paid();

DROP TRIGGER IF EXISTS trg_settlement_approved ON b2b.settlements;
CREATE TRIGGER trg_settlement_approved
  AFTER UPDATE ON b2b.settlements
  FOR EACH ROW EXECUTE FUNCTION b2b.on_settlement_approved();

DROP TRIGGER IF EXISTS trg_settlement_paid ON b2b.settlements;
CREATE TRIGGER trg_settlement_paid
  AFTER UPDATE OF status ON b2b.settlements
  FOR EACH ROW EXECUTE FUNCTION b2b.on_settlement_paid();

COMMIT;
