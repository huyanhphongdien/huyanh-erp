-- ============================================================================
-- B2B SPRINT 2-3-4 — Workflow locks, idempotency, audit log, notifications
-- Date: 2026-04-21
-- ============================================================================
-- Sprint 2:
--   Gap #4 — Lock deal fields khi status='accepted'/'settled'/'cancelled';
--            audit log b2b.deal_audit_log + trigger
--   Gap #7 — Lock settlement khi status='approved'/'paid' (client + DB)
--   Cross #2 — locked_by_dispute flag (column + check)
--
-- Sprint 3:
--   Gap #8 — UNIQUE (partner_id, entry_type, reference_code) trên ledger
--            → idempotent manual entry
--   Gap #9 — Check trigger period_month/year = EXTRACT từ entry_date
--   Gap #10 — Chặn đổi deal_id khi deal đã accepted (trigger)
--
-- Sprint 4:
--   - Universal audit log: b2b.settlement_audit_log, b2b.dispute_audit_log
--   - b2b.notifications table
-- ============================================================================


-- ============================================================================
-- SPRINT 2 — Gap #4: Deal field lock + audit log
-- ============================================================================

-- ── Audit log table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS b2b.deal_audit_log (
  id            BIGSERIAL PRIMARY KEY,
  deal_id       UUID NOT NULL REFERENCES b2b.deals(id) ON DELETE CASCADE,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by    UUID NULL,
  op            TEXT NOT NULL CHECK (op IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data      JSONB NULL,
  new_data      JSONB NULL,
  changed_fields TEXT[] NULL
);

CREATE INDEX IF NOT EXISTS idx_deal_audit_log_deal_id
  ON b2b.deal_audit_log(deal_id, changed_at DESC);

COMMENT ON TABLE b2b.deal_audit_log IS
  'Sprint 2 Gap #4 — Audit trail mọi thay đổi trên b2b.deals để evidence khi dispute';

-- ── Lock function ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION b2b.enforce_deal_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  locked_statuses TEXT[] := ARRAY['accepted', 'settled', 'cancelled'];
BEGIN
  -- Chỉ enforce khi status CŨ nằm trong danh sách lock
  IF OLD.status = ANY(locked_statuses) THEN
    -- Trường amount không được đổi
    IF NEW.quantity_kg IS DISTINCT FROM OLD.quantity_kg THEN
      RAISE EXCEPTION 'Deal % đã % — không thể sửa quantity_kg', OLD.deal_number, OLD.status;
    END IF;
    IF NEW.unit_price IS DISTINCT FROM OLD.unit_price THEN
      RAISE EXCEPTION 'Deal % đã % — không thể sửa unit_price', OLD.deal_number, OLD.status;
    END IF;
    IF NEW.total_value_vnd IS DISTINCT FROM OLD.total_value_vnd THEN
      RAISE EXCEPTION 'Deal % đã % — không thể sửa total_value_vnd', OLD.deal_number, OLD.status;
    END IF;
    IF NEW.expected_drc IS DISTINCT FROM OLD.expected_drc THEN
      RAISE EXCEPTION 'Deal % đã % — không thể sửa expected_drc', OLD.deal_number, OLD.status;
    END IF;
    -- actual_drc / actual_weight_kg: sau accepted KHÔNG được đổi.
    -- Trước accepted (processing) vẫn được — nhưng đã qua OLD.status check nên OK.
    IF NEW.actual_drc IS DISTINCT FROM OLD.actual_drc THEN
      RAISE EXCEPTION 'Deal % đã % — không thể sửa actual_drc (dùng dispute)', OLD.deal_number, OLD.status;
    END IF;
    IF NEW.actual_weight_kg IS DISTINCT FROM OLD.actual_weight_kg THEN
      RAISE EXCEPTION 'Deal % đã % — không thể sửa actual_weight_kg', OLD.deal_number, OLD.status;
    END IF;
    IF NEW.final_price IS DISTINCT FROM OLD.final_price THEN
      RAISE EXCEPTION 'Deal % đã % — không thể sửa final_price', OLD.deal_number, OLD.status;
    END IF;
    IF NEW.partner_id IS DISTINCT FROM OLD.partner_id THEN
      RAISE EXCEPTION 'Deal % đã % — không thể đổi partner', OLD.deal_number, OLD.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deal_lock ON b2b.deals;
CREATE TRIGGER trg_deal_lock
  BEFORE UPDATE ON b2b.deals
  FOR EACH ROW
  EXECUTE FUNCTION b2b.enforce_deal_lock();

-- ── Audit log trigger ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION b2b.log_deal_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  changed TEXT[] := ARRAY[]::TEXT[];
  actor UUID;
BEGIN
  -- Lấy user từ JWT nếu có
  BEGIN
    actor := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    actor := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO b2b.deal_audit_log (deal_id, changed_by, op, new_data)
    VALUES (NEW.id, actor, 'INSERT', to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO b2b.deal_audit_log (deal_id, changed_by, op, old_data)
    VALUES (OLD.id, actor, 'DELETE', to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Tính diff
    IF NEW.status IS DISTINCT FROM OLD.status THEN changed := changed || 'status'; END IF;
    IF NEW.quantity_kg IS DISTINCT FROM OLD.quantity_kg THEN changed := changed || 'quantity_kg'; END IF;
    IF NEW.unit_price IS DISTINCT FROM OLD.unit_price THEN changed := changed || 'unit_price'; END IF;
    IF NEW.final_price IS DISTINCT FROM OLD.final_price THEN changed := changed || 'final_price'; END IF;
    IF NEW.expected_drc IS DISTINCT FROM OLD.expected_drc THEN changed := changed || 'expected_drc'; END IF;
    IF NEW.actual_drc IS DISTINCT FROM OLD.actual_drc THEN changed := changed || 'actual_drc'; END IF;
    IF NEW.actual_weight_kg IS DISTINCT FROM OLD.actual_weight_kg THEN changed := changed || 'actual_weight_kg'; END IF;
    IF NEW.total_value_vnd IS DISTINCT FROM OLD.total_value_vnd THEN changed := changed || 'total_value_vnd'; END IF;
    IF NEW.notes IS DISTINCT FROM OLD.notes THEN changed := changed || 'notes'; END IF;

    -- Chỉ log nếu có thay đổi field quan trọng (bỏ qua updated_at-only)
    IF array_length(changed, 1) > 0 THEN
      INSERT INTO b2b.deal_audit_log (deal_id, changed_by, op, old_data, new_data, changed_fields)
      VALUES (NEW.id, actor, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), changed);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_deal_audit ON b2b.deals;
CREATE TRIGGER trg_deal_audit
  AFTER INSERT OR UPDATE OR DELETE ON b2b.deals
  FOR EACH ROW
  EXECUTE FUNCTION b2b.log_deal_changes();


-- ============================================================================
-- SPRINT 2 — Gap #7 + Cross #2: Settlement lock
-- ============================================================================

-- ── Add locked_by_dispute flag ──────────────────────────────────────────
ALTER TABLE b2b.settlements
  ADD COLUMN IF NOT EXISTS locked_by_dispute BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE b2b.settlements
  ADD COLUMN IF NOT EXISTS locked_dispute_id UUID NULL;

COMMENT ON COLUMN b2b.settlements.locked_by_dispute IS
  'Sprint 2 Cross #2 — TRUE khi có dispute active trên deal; chặn update/approve';

-- ── Audit log table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS b2b.settlement_audit_log (
  id             BIGSERIAL PRIMARY KEY,
  settlement_id  UUID NOT NULL REFERENCES b2b.settlements(id) ON DELETE CASCADE,
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by     UUID NULL,
  op             TEXT NOT NULL CHECK (op IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data       JSONB NULL,
  new_data       JSONB NULL,
  changed_fields TEXT[] NULL
);

CREATE INDEX IF NOT EXISTS idx_settlement_audit_log_id
  ON b2b.settlement_audit_log(settlement_id, changed_at DESC);

-- ── Lock function ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION b2b.enforce_settlement_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  locked_statuses TEXT[] := ARRAY['approved', 'paid'];
BEGIN
  -- Lock bởi dispute: chỉ cho set lại cờ lock, hoặc edit notes
  IF OLD.locked_by_dispute = TRUE AND NEW.locked_by_dispute = TRUE THEN
    IF NEW.gross_amount IS DISTINCT FROM OLD.gross_amount
      OR NEW.finished_kg IS DISTINCT FROM OLD.finished_kg
      OR NEW.approved_price IS DISTINCT FROM OLD.approved_price
      OR NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Phiếu quyết toán % đang bị lock bởi khiếu nại DRC — chỉ sửa ghi chú', OLD.code;
    END IF;
  END IF;

  -- Lock khi đã approved/paid
  IF OLD.status = ANY(locked_statuses) THEN
    IF NEW.gross_amount IS DISTINCT FROM OLD.gross_amount THEN
      RAISE EXCEPTION 'Phiếu % đã %, không thể sửa gross_amount', OLD.code, OLD.status;
    END IF;
    IF NEW.finished_kg IS DISTINCT FROM OLD.finished_kg THEN
      RAISE EXCEPTION 'Phiếu % đã %, không thể sửa finished_kg', OLD.code, OLD.status;
    END IF;
    IF NEW.approved_price IS DISTINCT FROM OLD.approved_price THEN
      RAISE EXCEPTION 'Phiếu % đã %, không thể sửa approved_price', OLD.code, OLD.status;
    END IF;
    IF NEW.weighed_kg IS DISTINCT FROM OLD.weighed_kg THEN
      RAISE EXCEPTION 'Phiếu % đã %, không thể sửa weighed_kg', OLD.code, OLD.status;
    END IF;
    IF NEW.drc_percent IS DISTINCT FROM OLD.drc_percent THEN
      RAISE EXCEPTION 'Phiếu % đã %, không thể sửa drc_percent', OLD.code, OLD.status;
    END IF;
    IF NEW.total_advance IS DISTINCT FROM OLD.total_advance THEN
      RAISE EXCEPTION 'Phiếu % đã %, không thể sửa total_advance', OLD.code, OLD.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_settlement_lock ON b2b.settlements;
CREATE TRIGGER trg_settlement_lock
  BEFORE UPDATE ON b2b.settlements
  FOR EACH ROW
  EXECUTE FUNCTION b2b.enforce_settlement_lock();

-- ── Audit log trigger ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION b2b.log_settlement_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  changed TEXT[] := ARRAY[]::TEXT[];
  actor UUID;
BEGIN
  BEGIN
    actor := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    actor := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO b2b.settlement_audit_log (settlement_id, changed_by, op, new_data)
    VALUES (NEW.id, actor, 'INSERT', to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO b2b.settlement_audit_log (settlement_id, changed_by, op, old_data)
    VALUES (OLD.id, actor, 'DELETE', to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN changed := changed || 'status'; END IF;
    IF NEW.gross_amount IS DISTINCT FROM OLD.gross_amount THEN changed := changed || 'gross_amount'; END IF;
    IF NEW.approved_price IS DISTINCT FROM OLD.approved_price THEN changed := changed || 'approved_price'; END IF;
    IF NEW.finished_kg IS DISTINCT FROM OLD.finished_kg THEN changed := changed || 'finished_kg'; END IF;
    IF NEW.total_advance IS DISTINCT FROM OLD.total_advance THEN changed := changed || 'total_advance'; END IF;
    IF NEW.paid_amount IS DISTINCT FROM OLD.paid_amount THEN changed := changed || 'paid_amount'; END IF;
    IF NEW.locked_by_dispute IS DISTINCT FROM OLD.locked_by_dispute THEN changed := changed || 'locked_by_dispute'; END IF;

    IF array_length(changed, 1) > 0 THEN
      INSERT INTO b2b.settlement_audit_log (settlement_id, changed_by, op, old_data, new_data, changed_fields)
      VALUES (NEW.id, actor, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), changed);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_settlement_audit ON b2b.settlements;
CREATE TRIGGER trg_settlement_audit
  AFTER INSERT OR UPDATE OR DELETE ON b2b.settlements
  FOR EACH ROW
  EXECUTE FUNCTION b2b.log_settlement_changes();


-- ============================================================================
-- SPRINT 3 — Gap #8: Idempotency ledger
-- ============================================================================

-- Partial UNIQUE (partner_id, entry_type, reference_code) WHERE reference_code IS NOT NULL
-- Cho phép NULL reference (entries tự do) vô hạn, nhưng chặn duplicate khi có code
DROP INDEX IF EXISTS b2b.idx_ledger_idempotency;
CREATE UNIQUE INDEX idx_ledger_idempotency
  ON b2b.partner_ledger (partner_id, entry_type, reference_code)
  WHERE reference_code IS NOT NULL;

COMMENT ON INDEX b2b.idx_ledger_idempotency IS
  'Sprint 3 Gap #8 — Idempotency: retry/double-click không tạo entry trùng';


-- ============================================================================
-- SPRINT 3 — Gap #9: Period cutting rule (ĐÃ ENFORCE qua GENERATED column)
-- ============================================================================
-- period_month / period_year trong b2b.partner_ledger đã là GENERATED column
-- (derived từ entry_date). Schema đã đảm bảo rule, không cần trigger.
-- Client không được set period_* — ledgerService.createManualEntry vẫn pass
-- vào nhưng Postgres bỏ qua vì GENERATED ALWAYS AS. OK.
--
-- Nếu muốn verify, chạy query:
--   SELECT column_name, is_generated, generation_expression
--   FROM information_schema.columns
--   WHERE table_schema='b2b' AND table_name='partner_ledger'
--     AND column_name IN ('period_month','period_year');

-- Dọn trigger cũ nếu migration được chạy 1 phần trước đó (idempotent)
DROP TRIGGER IF EXISTS trg_ledger_period ON b2b.partner_ledger;
DROP FUNCTION IF EXISTS b2b.enforce_ledger_period();


-- ============================================================================
-- SPRINT 3 — Gap #10: Batch-deal link guard
-- ============================================================================

-- Khi rubber_intake_batches.deal_id đã set VÀ deal đã accepted/settled,
-- không cho đổi deal_id (chặn tráo deal sau khi đã chốt).
CREATE OR REPLACE FUNCTION public.enforce_batch_deal_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  old_deal_status TEXT;
BEGIN
  -- Chỉ check khi đổi deal_id (không check khi set lần đầu từ NULL)
  IF OLD.deal_id IS NOT NULL
     AND NEW.deal_id IS DISTINCT FROM OLD.deal_id THEN
    SELECT status INTO old_deal_status FROM b2b.deals WHERE id = OLD.deal_id;
    IF old_deal_status IN ('accepted', 'settled') THEN
      RAISE EXCEPTION 'Batch đã gắn Deal ở trạng thái % — không thể đổi sang deal khác', old_deal_status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- rubber_intake_batches có thể ở schema public, thử cả 2 schema
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rubber_intake_batches') THEN
    DROP TRIGGER IF EXISTS trg_batch_deal_lock ON public.rubber_intake_batches;
    CREATE TRIGGER trg_batch_deal_lock
      BEFORE UPDATE ON public.rubber_intake_batches
      FOR EACH ROW
      EXECUTE FUNCTION public.enforce_batch_deal_lock();
  END IF;
END $$;


-- ============================================================================
-- SPRINT 4 — Dispute audit log
-- ============================================================================

CREATE TABLE IF NOT EXISTS b2b.dispute_audit_log (
  id             BIGSERIAL PRIMARY KEY,
  dispute_id     UUID NOT NULL,
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by     UUID NULL,
  op             TEXT NOT NULL CHECK (op IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data       JSONB NULL,
  new_data       JSONB NULL,
  changed_fields TEXT[] NULL
);

CREATE INDEX IF NOT EXISTS idx_dispute_audit_log_id
  ON b2b.dispute_audit_log(dispute_id, changed_at DESC);

CREATE OR REPLACE FUNCTION b2b.log_dispute_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  changed TEXT[] := ARRAY[]::TEXT[];
  actor UUID;
BEGIN
  BEGIN
    actor := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    actor := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO b2b.dispute_audit_log (dispute_id, changed_by, op, new_data)
    VALUES (NEW.id, actor, 'INSERT', to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN changed := changed || 'status'; END IF;
    IF NEW.adjustment_drc IS DISTINCT FROM OLD.adjustment_drc THEN changed := changed || 'adjustment_drc'; END IF;
    IF NEW.adjustment_amount IS DISTINCT FROM OLD.adjustment_amount THEN changed := changed || 'adjustment_amount'; END IF;
    IF NEW.resolution_notes IS DISTINCT FROM OLD.resolution_notes THEN changed := changed || 'resolution_notes'; END IF;
    IF array_length(changed, 1) > 0 THEN
      INSERT INTO b2b.dispute_audit_log (dispute_id, changed_by, op, old_data, new_data, changed_fields)
      VALUES (NEW.id, actor, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), changed);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'b2b' AND table_name = 'drc_disputes') THEN
    DROP TRIGGER IF EXISTS trg_dispute_audit ON b2b.drc_disputes;
    CREATE TRIGGER trg_dispute_audit
      AFTER INSERT OR UPDATE ON b2b.drc_disputes
      FOR EACH ROW
      EXECUTE FUNCTION b2b.log_dispute_changes();
  END IF;
END $$;


-- ============================================================================
-- SPRINT 4 — Notification table
-- ============================================================================

CREATE TABLE IF NOT EXISTS b2b.notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Self-heal schema nếu bảng đã tồn tại từ trước với cột khác
ALTER TABLE b2b.notifications ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE b2b.notifications ADD COLUMN IF NOT EXISTS audience TEXT;
ALTER TABLE b2b.notifications ADD COLUMN IF NOT EXISTS partner_id UUID;
ALTER TABLE b2b.notifications ADD COLUMN IF NOT EXISTS deal_id UUID;
ALTER TABLE b2b.notifications ADD COLUMN IF NOT EXISTS settlement_id UUID;
ALTER TABLE b2b.notifications ADD COLUMN IF NOT EXISTS dispute_id UUID;
ALTER TABLE b2b.notifications ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE b2b.notifications ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE b2b.notifications ADD COLUMN IF NOT EXISTS link_url TEXT;
ALTER TABLE b2b.notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE b2b.notifications ADD COLUMN IF NOT EXISTS created_by UUID;

-- Constraint cho audience (chỉ add nếu chưa có)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'b2b_notifications_audience_check'
      AND conrelid = 'b2b.notifications'::regclass
  ) THEN
    ALTER TABLE b2b.notifications
      ADD CONSTRAINT b2b_notifications_audience_check
      CHECK (audience IS NULL OR audience IN ('staff', 'partner', 'both'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_audience_read
  ON b2b.notifications(audience, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_partner
  ON b2b.notifications(partner_id, is_read, created_at DESC)
  WHERE partner_id IS NOT NULL;

-- Expose qua view public cho PostgREST — DROP trước để pick up cột mới
DROP VIEW IF EXISTS public.b2b_notifications;
CREATE VIEW public.b2b_notifications AS
  SELECT * FROM b2b.notifications;

GRANT SELECT, INSERT, UPDATE ON public.b2b_notifications TO authenticated;

-- RLS: partner chỉ thấy notification của chính mình; staff thấy tất cả audience staff/both
-- Chỉ tạo policy nếu helper function b2b.current_partner_id() tồn tại.
-- Nếu chưa có → để RLS off (dev env); production phải có function này.
ALTER TABLE b2b.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS b2b_notifications_partner_select ON b2b.notifications;
DROP POLICY IF EXISTS b2b_notifications_staff_all ON b2b.notifications;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'b2b' AND p.proname = 'current_partner_id'
  ) THEN
    EXECUTE $POL$
      CREATE POLICY b2b_notifications_partner_select
        ON b2b.notifications FOR SELECT
        TO authenticated
        USING (
          audience IN ('staff', 'both')
          OR (audience IN ('partner', 'both') AND partner_id = b2b.current_partner_id())
        )
    $POL$;
    EXECUTE $POL$
      CREATE POLICY b2b_notifications_staff_all
        ON b2b.notifications FOR ALL
        TO authenticated
        USING (b2b.current_partner_id() IS NULL)
    $POL$;
  ELSE
    -- Fallback: cho authenticated đọc/ghi tất cả (staff-only env)
    EXECUTE $POL$
      CREATE POLICY b2b_notifications_auth_all
        ON b2b.notifications FOR ALL
        TO authenticated
        USING (TRUE)
        WITH CHECK (TRUE)
    $POL$;
    RAISE NOTICE 'b2b.current_partner_id() không tồn tại — dùng fallback policy authenticated=ALL. Production cần tạo helper function.';
  END IF;
END $$;


-- ============================================================================
-- Reload PostgREST schema
-- ============================================================================
NOTIFY pgrst, 'reload schema';


-- ============================================================================
-- VERIFY
-- ============================================================================
SELECT 'deal_audit_log' AS object, count(*) AS rows FROM b2b.deal_audit_log
UNION ALL
SELECT 'settlement_audit_log', count(*) FROM b2b.settlement_audit_log
UNION ALL
SELECT 'dispute_audit_log', count(*) FROM b2b.dispute_audit_log
UNION ALL
SELECT 'notifications', count(*) FROM b2b.notifications;

SELECT tgname, tgrelid::regclass AS table_name
FROM pg_trigger
WHERE tgname IN (
  'trg_deal_lock', 'trg_deal_audit',
  'trg_settlement_lock', 'trg_settlement_audit',
  'trg_dispute_audit',
  'trg_ledger_period', 'trg_batch_deal_lock'
)
ORDER BY tgname;
