-- ============================================================================
-- B2B Portal Sprint I — 4 bug fixes phát hiện qua Phase A deep audit
-- Date: 2026-04-22
-- ============================================================================
-- Bugs resolved:
--   NEW-BUG-I: trigger on_advance_paid sinh ledger entry tự động (idempotent)
--   NEW-BUG-J: 3 b2b.* SECURITY DEFINER thiếu SET search_path
--              (get_current_partner_id, get_partner_balance, get_partner_ledger_by_period)
--   NEW-BUG-K: 3 public.b2b_* views thiếu security_invoker=true
--              (b2b_acceptances, b2b_auction_bids, b2b_auctions)
--   NEW-BUG-L: log_settlement_changes + log_dispute_changes cần SECURITY DEFINER
--              + search_path (pattern giống Sprint H cho log_deal_changes)
--
-- Scope system-wide (NEW-BUG-M: 74 public.* functions thiếu search_path) KHÔNG
-- trong file này — sẽ tách sprint riêng vì đụng Tasks/Leave/Attendance.
-- ============================================================================


-- ═══════════════════════════════════════════════════════════════
-- I-1: NEW-BUG-I — Trigger on_advance_paid sinh ledger entry
-- ═══════════════════════════════════════════════════════════════
-- Hiện tại b2b.advances KHÔNG có trigger nào sinh ledger entry khi
-- status='paid'. Service layer (dealChatActionsService) chèn manual →
-- SQL direct INSERT / import CSV không sinh ledger → running_balance sai.
--
-- Fix: trigger AFTER INSERT OR UPDATE OF status khi status transition
-- sang 'paid' → INSERT vào b2b.partner_ledger. Idempotent qua EXCEPTION
-- handler giống Sprint G.

CREATE OR REPLACE FUNCTION b2b.on_advance_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = b2b, public, pg_temp
AS $$
BEGIN
  -- Chỉ fire khi chuyển sang 'paid' lần đầu
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
        'Tạm ứng ' || NEW.advance_number ||
          COALESCE(' - ' || NEW.purpose, ''),
        COALESCE(NEW.paid_at::DATE, NEW.payment_date, NOW()::DATE),
        COALESCE(NEW.paid_by, NEW.approved_by, NEW.requested_by)
      );
    EXCEPTION WHEN unique_violation THEN
      -- Idempotent: rollback/re-fire không sinh duplicate ledger
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_advance_paid ON b2b.advances;
CREATE TRIGGER trg_on_advance_paid
  AFTER INSERT OR UPDATE OF status
  ON b2b.advances
  FOR EACH ROW
  EXECUTE FUNCTION b2b.on_advance_paid();


-- ═══════════════════════════════════════════════════════════════
-- I-2: NEW-BUG-J — Add SET search_path cho 3 b2b.* SECURITY DEFINER
-- ═══════════════════════════════════════════════════════════════
-- SECURITY DEFINER function không có SET search_path có thể bị hijack
-- qua manipulation (user tạo object trong schema writable → inject code).
-- Fix: ALTER add fixed search_path tin cậy.

ALTER FUNCTION b2b.get_current_partner_id()
  SET search_path = b2b, public, pg_temp;

ALTER FUNCTION b2b.get_partner_balance(uuid)
  SET search_path = b2b, public, pg_temp;

-- get_partner_ledger_by_period: signature có thể (uuid, smallint, smallint).
-- Dùng query để find exact signature rồi ALTER.
DO $$
DECLARE
  v_sig text;
BEGIN
  SELECT oid::regprocedure::text INTO v_sig
  FROM pg_proc
  WHERE proname = 'get_partner_ledger_by_period'
    AND pronamespace = 'b2b'::regnamespace
  LIMIT 1;

  IF v_sig IS NOT NULL THEN
    EXECUTE format('ALTER FUNCTION %s SET search_path = b2b, public, pg_temp', v_sig);
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════
-- I-3: NEW-BUG-K — public.b2b_* views thiếu security_invoker=true
-- ═══════════════════════════════════════════════════════════════
-- Default PostgreSQL view runs as owner (DEFINER) → reader bypass RLS
-- của base table → leak data cho role không có quyền. Fix: explicit
-- security_invoker=true để RLS enforce theo role của reader.

ALTER VIEW public.b2b_acceptances SET (security_invoker = true);
ALTER VIEW public.b2b_auction_bids SET (security_invoker = true);
ALTER VIEW public.b2b_auctions SET (security_invoker = true);


-- ═══════════════════════════════════════════════════════════════
-- I-4: NEW-BUG-L — log_settlement_changes + log_dispute_changes
--      cần SECURITY DEFINER + search_path
-- ═══════════════════════════════════════════════════════════════
-- Pattern giống Sprint H: audit_log tables RLS enabled + 0 policies
-- (chặn hoàn toàn direct access). Trigger function chạy ở context
-- caller → INSERT audit log bị reject bởi RLS → cascade fail trên
-- settlement / dispute UPDATE.
--
-- Fix: ALTER FUNCTION SECURITY DEFINER + search_path (giống log_deal_changes).
-- Các function này đã tồn tại, chỉ change attributes.

ALTER FUNCTION b2b.log_settlement_changes() SECURITY DEFINER
  SET search_path = b2b, public, pg_temp;

ALTER FUNCTION b2b.log_dispute_changes() SECURITY DEFINER
  SET search_path = b2b, public, pg_temp;


-- ═══════════════════════════════════════════════════════════════
-- Reload PostgREST schema
-- ═══════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';


-- ═══════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════

-- I-1: Trigger on_advance_paid installed
SELECT tgname, tgenabled::text AS enabled
FROM pg_trigger
WHERE tgrelid = 'b2b.advances'::regclass
  AND tgname = 'trg_on_advance_paid';

-- I-1: Function SECURITY DEFINER + search_path
SELECT proname, prosecdef AS is_definer, proconfig
FROM pg_proc
WHERE proname = 'on_advance_paid'
  AND pronamespace = 'b2b'::regnamespace;

-- I-2: 3 functions có search_path set
SELECT proname, proconfig
FROM pg_proc
WHERE proname IN ('get_current_partner_id', 'get_partner_balance', 'get_partner_ledger_by_period')
  AND pronamespace = 'b2b'::regnamespace;

-- I-3: 3 views security_invoker=true
SELECT c.relname AS view_name,
       (array_to_string(c.reloptions, ',') LIKE '%security_invoker=true%') AS invoker_mode
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'v'
  AND c.relname IN ('b2b_acceptances', 'b2b_auction_bids', 'b2b_auctions');
-- Expected: cả 3 invoker_mode = true

-- I-4: log_*_changes đều SECURITY DEFINER + search_path
SELECT proname, prosecdef AS is_definer, proconfig
FROM pg_proc
WHERE proname IN ('log_deal_changes', 'log_settlement_changes', 'log_dispute_changes')
ORDER BY proname;
-- Expected: 3 rows all prosecdef=true, proconfig has search_path


-- ═══════════════════════════════════════════════════════════════
-- BACKFILL (optional): ledger entries còn thiếu cho advance đã paid
-- ═══════════════════════════════════════════════════════════════
-- Nếu trước khi install I-1 có advance nào tạo trực tiếp qua SQL
-- mà không sinh ledger, sau khi apply sẽ thiếu. Backfill via no-op
-- UPDATE để fire trigger.
--
-- Bỏ comment để chạy backfill:
--
-- UPDATE b2b.advances SET status = status
-- WHERE status = 'paid'
--   AND id NOT IN (
--     SELECT advance_id FROM b2b.partner_ledger
--     WHERE advance_id IS NOT NULL AND entry_type = 'advance_paid'
--   );
--
-- Note: no-op UPDATE sẽ fire trigger. Nếu trigger check `OLD.status IS DISTINCT FROM 'paid'`
-- thì no-op không fire (vì OLD=paid, NEW=paid). Cần INSERT manual:
--
-- INSERT INTO b2b.partner_ledger (
--   partner_id, entry_type, debit, credit,
--   advance_id, reference_code, description, entry_date, created_by
-- )
-- SELECT
--   a.partner_id, 'advance_paid', 0,
--   COALESCE(a.amount_vnd, a.amount),
--   a.id, a.advance_number,
--   'Backfill ledger cho advance ' || a.advance_number,
--   COALESCE(a.paid_at::DATE, a.payment_date, a.created_at::DATE),
--   COALESCE(a.paid_by, a.approved_by, a.requested_by)
-- FROM b2b.advances a
-- WHERE a.status = 'paid'
--   AND a.id NOT IN (
--     SELECT advance_id FROM b2b.partner_ledger
--     WHERE advance_id IS NOT NULL AND entry_type = 'advance_paid'
--   );
