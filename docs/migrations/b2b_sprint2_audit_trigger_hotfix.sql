-- ============================================================================
-- HOTFIX: Trigger audit log — fix bug "malformed array literal"
-- Date: 2026-04-21
-- ============================================================================
-- Bug: `changed := changed || 'status'` — PG interpret 'status' là text,
-- cast fail sang text[] → error 22P02.
-- Fix: dùng array_append(changed, 'status')
-- ============================================================================

-- ─── 1. log_deal_changes ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION b2b.log_deal_changes()
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
    INSERT INTO b2b.deal_audit_log (deal_id, changed_by, op, new_data)
    VALUES (NEW.id, actor, 'INSERT', to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO b2b.deal_audit_log (deal_id, changed_by, op, old_data)
    VALUES (OLD.id, actor, 'DELETE', to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN changed := array_append(changed, 'status'); END IF;
    IF NEW.quantity_kg IS DISTINCT FROM OLD.quantity_kg THEN changed := array_append(changed, 'quantity_kg'); END IF;
    IF NEW.unit_price IS DISTINCT FROM OLD.unit_price THEN changed := array_append(changed, 'unit_price'); END IF;
    IF NEW.final_price IS DISTINCT FROM OLD.final_price THEN changed := array_append(changed, 'final_price'); END IF;
    IF NEW.expected_drc IS DISTINCT FROM OLD.expected_drc THEN changed := array_append(changed, 'expected_drc'); END IF;
    IF NEW.actual_drc IS DISTINCT FROM OLD.actual_drc THEN changed := array_append(changed, 'actual_drc'); END IF;
    IF NEW.actual_weight_kg IS DISTINCT FROM OLD.actual_weight_kg THEN changed := array_append(changed, 'actual_weight_kg'); END IF;
    IF NEW.total_value_vnd IS DISTINCT FROM OLD.total_value_vnd THEN changed := array_append(changed, 'total_value_vnd'); END IF;
    IF NEW.notes IS DISTINCT FROM OLD.notes THEN changed := array_append(changed, 'notes'); END IF;

    IF array_length(changed, 1) > 0 THEN
      INSERT INTO b2b.deal_audit_log (deal_id, changed_by, op, old_data, new_data, changed_fields)
      VALUES (NEW.id, actor, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), changed);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

-- ─── 2. log_settlement_changes ──────────────────────────────────────
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
    IF NEW.status IS DISTINCT FROM OLD.status THEN changed := array_append(changed, 'status'); END IF;
    IF NEW.weighed_kg IS DISTINCT FROM OLD.weighed_kg THEN changed := array_append(changed, 'weighed_kg'); END IF;
    IF NEW.finished_kg IS DISTINCT FROM OLD.finished_kg THEN changed := array_append(changed, 'finished_kg'); END IF;
    IF NEW.drc_percent IS DISTINCT FROM OLD.drc_percent THEN changed := array_append(changed, 'drc_percent'); END IF;
    IF NEW.approved_price IS DISTINCT FROM OLD.approved_price THEN changed := array_append(changed, 'approved_price'); END IF;
    IF NEW.gross_amount IS DISTINCT FROM OLD.gross_amount THEN changed := array_append(changed, 'gross_amount'); END IF;
    IF NEW.total_advance IS DISTINCT FROM OLD.total_advance THEN changed := array_append(changed, 'total_advance'); END IF;
    IF NEW.paid_amount IS DISTINCT FROM OLD.paid_amount THEN changed := array_append(changed, 'paid_amount'); END IF;
    IF NEW.notes IS DISTINCT FROM OLD.notes THEN changed := array_append(changed, 'notes'); END IF;
    IF NEW.locked_by_dispute IS DISTINCT FROM OLD.locked_by_dispute THEN changed := array_append(changed, 'locked_by_dispute'); END IF;

    IF array_length(changed, 1) > 0 THEN
      INSERT INTO b2b.settlement_audit_log (settlement_id, changed_by, op, old_data, new_data, changed_fields)
      VALUES (NEW.id, actor, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), changed);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

-- ─── 3. log_dispute_changes (nếu có) ────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'log_dispute_changes' AND pronamespace = 'b2b'::regnamespace) THEN
    EXECUTE '
      CREATE OR REPLACE FUNCTION b2b.log_dispute_changes()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $func$
      DECLARE
        changed TEXT[] := ARRAY[]::TEXT[];
        actor UUID;
      BEGIN
        BEGIN
          actor := auth.uid();
        EXCEPTION WHEN OTHERS THEN
          actor := NULL;
        END;

        IF TG_OP = ''INSERT'' THEN
          INSERT INTO b2b.dispute_audit_log (dispute_id, changed_by, op, new_data)
          VALUES (NEW.id, actor, ''INSERT'', to_jsonb(NEW));
          RETURN NEW;
        ELSIF TG_OP = ''DELETE'' THEN
          INSERT INTO b2b.dispute_audit_log (dispute_id, changed_by, op, old_data)
          VALUES (OLD.id, actor, ''DELETE'', to_jsonb(OLD));
          RETURN OLD;
        ELSIF TG_OP = ''UPDATE'' THEN
          IF NEW.status IS DISTINCT FROM OLD.status THEN changed := array_append(changed, ''status''); END IF;
          IF NEW.resolution IS DISTINCT FROM OLD.resolution THEN changed := array_append(changed, ''resolution''); END IF;
          IF NEW.adjustment_amount IS DISTINCT FROM OLD.adjustment_amount THEN changed := array_append(changed, ''adjustment_amount''); END IF;
          IF NEW.adjustment_drc IS DISTINCT FROM OLD.adjustment_drc THEN changed := array_append(changed, ''adjustment_drc''); END IF;
          IF NEW.resolved_at IS DISTINCT FROM OLD.resolved_at THEN changed := array_append(changed, ''resolved_at''); END IF;

          IF array_length(changed, 1) > 0 THEN
            INSERT INTO b2b.dispute_audit_log (dispute_id, changed_by, op, old_data, new_data, changed_fields)
            VALUES (NEW.id, actor, ''UPDATE'', to_jsonb(OLD), to_jsonb(NEW), changed);
          END IF;
          RETURN NEW;
        END IF;

        RETURN NULL;
      END;
      $func$;
    ';
  END IF;
END $$;

-- ─── Verify ─────────────────────────────────────────────────────────
SELECT proname, pronamespace::regnamespace AS schema
FROM pg_proc
WHERE proname IN ('log_deal_changes', 'log_settlement_changes', 'log_dispute_changes')
ORDER BY proname;

-- ─── 4. log_dispute_changes (append sau audit) ──────────────────────
-- Fix bổ sung 2026-04-21: function này cũng dùng || 'text' buggy
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
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO b2b.dispute_audit_log (dispute_id, changed_by, op, old_data)
    VALUES (OLD.id, actor, 'DELETE', to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN changed := array_append(changed, 'status'); END IF;
    IF NEW.resolution IS DISTINCT FROM OLD.resolution THEN changed := array_append(changed, 'resolution'); END IF;
    IF NEW.adjustment_amount IS DISTINCT FROM OLD.adjustment_amount THEN changed := array_append(changed, 'adjustment_amount'); END IF;
    IF NEW.adjustment_drc IS DISTINCT FROM OLD.adjustment_drc THEN changed := array_append(changed, 'adjustment_drc'); END IF;
    IF NEW.resolved_at IS DISTINCT FROM OLD.resolved_at THEN changed := array_append(changed, 'resolved_at'); END IF;

    IF array_length(changed, 1) > 0 THEN
      INSERT INTO b2b.dispute_audit_log (dispute_id, changed_by, op, old_data, new_data, changed_fields)
      VALUES (NEW.id, actor, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), changed);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;
