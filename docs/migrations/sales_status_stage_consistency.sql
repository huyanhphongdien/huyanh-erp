-- ============================================================================
-- Sales — Đồng nhất status (10 giá trị) ↔ current_stage (7 giá trị)
-- Date: 2026-05-05
-- Status: TO APPLY (REPLACES sales_auto_assign_owner_on_stage.sql trigger)
-- ============================================================================
--
-- VẤN ĐỀ phát hiện 2026-05-05:
--   Đơn cùng lúc có 2 trường mô tả "trạng thái":
--     - status      (DB hợp đồng): draft, confirmed, producing, ready, packing,
--                    shipped, delivered, invoiced, paid, cancelled
--     - current_stage (workflow nội bộ): sales, raw_material, production, qc,
--                    packing, logistics, delivered
--
--   Hai trường KHÔNG được sync khi user pass stage HOẶC bấm status-button
--   (Sẵn sàng / Đóng gói / Xuất hàng / Đã giao) → các tab hiển thị khác nhau:
--     - Stat card top "ĐANG SX: 0" (đếm theo status='producing')
--     - Kanban "Sản xuất: 9 đơn"   (đếm theo current_stage='production')
--     → BGĐ confused
--
-- GIẢI PHÁP (2 phần):
--   1. Backfill 1 lần: sync status từ current_stage cho tất cả đơn active
--   2. Replace trigger thành sync 2 chiều:
--      a. Khi current_stage đổi → auto-bump status forward + auto-assign owner
--      b. Khi status đổi → auto-bump current_stage forward (nếu status implies
--         stage mới)
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: BACKFILL — sync status từ current_stage (forward only)
-- ════════════════════════════════════════════════════════════════════════════

-- 1a. raw_material: bump draft → confirmed (nếu chưa)
UPDATE sales_orders
SET status = 'confirmed'
WHERE current_stage = 'raw_material'
  AND status = 'draft';

-- 1b. production stage → status='producing'
UPDATE sales_orders
SET status = 'producing'
WHERE current_stage = 'production'
  AND status IN ('draft', 'confirmed');

-- 1c. qc stage → status='ready'
UPDATE sales_orders
SET status = 'ready'
WHERE current_stage = 'qc'
  AND status IN ('draft', 'confirmed', 'producing');

-- 1d. packing stage → status='packing'
UPDATE sales_orders
SET status = 'packing'
WHERE current_stage = 'packing'
  AND status IN ('draft', 'confirmed', 'producing', 'ready');

-- 1e. logistics stage → status='shipped'
UPDATE sales_orders
SET status = 'shipped'
WHERE current_stage = 'logistics'
  AND status IN ('draft', 'confirmed', 'producing', 'ready', 'packing');

-- 1f. delivered stage → status='delivered'
UPDATE sales_orders
SET status = 'delivered'
WHERE current_stage = 'delivered'
  AND status IN ('draft', 'confirmed', 'producing', 'ready', 'packing', 'shipped');

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: REPLACE TRIGGER — sync 2 chiều
-- ════════════════════════════════════════════════════════════════════════════

-- Drop trigger cũ (filter OF current_stage chỉ fire khi stage trong SET clause)
DROP TRIGGER IF EXISTS trg_log_sales_stage_change ON sales_orders;

-- Function unified: handle cả stage change lẫn status change
CREATE OR REPLACE FUNCTION sync_sales_workflow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $FUNC$
DECLARE
  v_dwell NUMERIC(10, 2);
  v_passed_by UUID;
  v_target_email TEXT;
  v_target_owner_id UUID;
  v_explicit_override BOOLEAN := FALSE;
  v_target_status TEXT;
  v_target_stage TEXT;
  v_old_stage_rank INT;
  v_new_stage_rank INT;
BEGIN
  -- ══════════════════════════════════════════════════════════════
  -- DIRECTION 1: status changed → bump current_stage forward
  -- ══════════════════════════════════════════════════════════════
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_target_stage := CASE NEW.status
      WHEN 'producing' THEN 'production'
      WHEN 'ready'     THEN 'qc'
      WHEN 'packing'   THEN 'packing'
      WHEN 'shipped'   THEN 'logistics'
      WHEN 'delivered' THEN 'delivered'
      WHEN 'invoiced'  THEN 'delivered'
      WHEN 'paid'      THEN 'delivered'
      ELSE NULL
    END;

    IF v_target_stage IS NOT NULL THEN
      -- Stage rank for forward-only logic (cao hơn = về sau)
      v_old_stage_rank := CASE NEW.current_stage
        WHEN 'sales' THEN 1
        WHEN 'raw_material' THEN 2
        WHEN 'production' THEN 3
        WHEN 'qc' THEN 4
        WHEN 'packing' THEN 5
        WHEN 'logistics' THEN 6
        WHEN 'delivered' THEN 7
        ELSE 0
      END;
      v_new_stage_rank := CASE v_target_stage
        WHEN 'sales' THEN 1
        WHEN 'raw_material' THEN 2
        WHEN 'production' THEN 3
        WHEN 'qc' THEN 4
        WHEN 'packing' THEN 5
        WHEN 'logistics' THEN 6
        WHEN 'delivered' THEN 7
        ELSE 0
      END;

      IF v_new_stage_rank > v_old_stage_rank THEN
        NEW.current_stage := v_target_stage;
      END IF;
    END IF;
  END IF;

  -- ══════════════════════════════════════════════════════════════
  -- DIRECTION 2: current_stage changed (do user pass stage, hoặc do
  -- DIRECTION 1 vừa update) → auto-assign owner + auto-bump status
  -- + log handoff + reset stage_started_at
  -- ══════════════════════════════════════════════════════════════
  IF NEW.current_stage IS DISTINCT FROM OLD.current_stage THEN

    -- AUTO-ASSIGN OWNER (như cũ)
    IF NEW.current_owner_id IS DISTINCT FROM OLD.current_owner_id
       AND NEW.current_owner_id IS NOT NULL THEN
      v_explicit_override := TRUE;
    END IF;

    IF NOT v_explicit_override THEN
      v_target_email := CASE NEW.current_stage
        WHEN 'sales'        THEN 'sales@huyanhrubber.com'
        WHEN 'raw_material' THEN 'tannv@huyanhrubber.com'
        WHEN 'production'   THEN 'trunglxh@huyanhrubber.com'
        WHEN 'qc'           THEN 'nhanlt@huyanhrubber.com'
        WHEN 'packing'      THEN 'nhanlt@huyanhrubber.com'
        WHEN 'logistics'    THEN 'anhlp@huyanhrubber.com'
        WHEN 'delivered'    THEN 'phulv@huyanhrubber.com'
        ELSE NULL
      END;

      IF v_target_email IS NOT NULL THEN
        SELECT id INTO v_target_owner_id
        FROM employees
        WHERE LOWER(email) = v_target_email
          AND status = 'active'
        LIMIT 1;

        IF v_target_owner_id IS NOT NULL THEN
          NEW.current_owner_id := v_target_owner_id;
        END IF;
      END IF;
    END IF;

    -- AUTO-BUMP STATUS theo stage mới (forward only)
    v_target_status := CASE NEW.current_stage
      WHEN 'raw_material' THEN 'confirmed'
      WHEN 'production'   THEN 'producing'
      WHEN 'qc'           THEN 'ready'
      WHEN 'packing'      THEN 'packing'
      WHEN 'logistics'    THEN 'shipped'
      WHEN 'delivered'    THEN 'delivered'
      ELSE NULL
    END;

    IF v_target_status IS NOT NULL THEN
      IF (v_target_status = 'confirmed' AND NEW.status = 'draft')
         OR (v_target_status = 'producing' AND NEW.status IN ('draft','confirmed'))
         OR (v_target_status = 'ready' AND NEW.status IN ('draft','confirmed','producing'))
         OR (v_target_status = 'packing' AND NEW.status IN ('draft','confirmed','producing','ready'))
         OR (v_target_status = 'shipped' AND NEW.status IN ('draft','confirmed','producing','ready','packing'))
         OR (v_target_status = 'delivered' AND NEW.status IN ('draft','confirmed','producing','ready','packing','shipped'))
      THEN
        NEW.status := v_target_status;
      END IF;
    END IF;

    -- LOG HANDOFF (như cũ)
    v_dwell := EXTRACT(EPOCH FROM (NOW() - COALESCE(OLD.stage_started_at, OLD.created_at))) / 3600;

    BEGIN
      v_passed_by := current_setting('app.current_user_id', true)::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_passed_by := OLD.current_owner_id;
    END;

    INSERT INTO sales_order_handoffs (
      sales_order_id, from_dept, to_dept,
      passed_by, passed_at, dwell_time_hours
    ) VALUES (
      NEW.id, OLD.current_stage, NEW.current_stage,
      v_passed_by, NOW(), v_dwell
    );

    NEW.stage_started_at := NOW();

    SELECT default_sla_hours INTO NEW.stage_sla_hours
    FROM sales_dept_capacity
    WHERE dept_code = NEW.current_stage;
  END IF;

  RETURN NEW;
END;
$FUNC$;

-- Trigger fire trên MỌI UPDATE (không filter OF column nữa)
-- vì cần catch cả status change lẫn stage change
DROP TRIGGER IF EXISTS trg_sync_sales_workflow ON sales_orders;
CREATE TRIGGER trg_sync_sales_workflow
BEFORE UPDATE ON sales_orders
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status
   OR OLD.current_stage IS DISTINCT FROM NEW.current_stage)
EXECUTE FUNCTION sync_sales_workflow();

-- Function cũ log_sales_stage_change() vẫn tồn tại (backward compat) nhưng
-- không có trigger nào fire nó nữa. Có thể DROP sau.

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: NOTIFY + VERIFY
-- ════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

-- Bảng đối chiếu sau backfill: status × current_stage
-- Mong đợi: chỉ có những cell mapping đúng có số > 0
DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE '=== Đối chiếu status x current_stage SAU backfill ===';
  FOR r IN
    SELECT current_stage, status, COUNT(*) AS num
    FROM sales_orders
    WHERE status <> 'cancelled'
    GROUP BY current_stage, status
    ORDER BY current_stage, status
  LOOP
    RAISE NOTICE '  stage=%  x  status=%  ->  % don',
      LPAD(r.current_stage, 13, ' '),
      LPAD(r.status, 11, ' '),
      r.num;
  END LOOP;
END $$;

-- Diagonal valid mapping (cell nào hợp lệ):
--   sales        × draft / confirmed                    ✓
--   raw_material × confirmed                             ✓
--   production   × producing                             ✓
--   qc           × ready                                 ✓
--   packing      × packing                               ✓
--   logistics    × shipped                               ✓
--   delivered    × delivered / invoiced / paid          ✓
-- Anything else → vẫn còn lệch, cần investigate

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (revert trigger về log_sales_stage_change)
-- ════════════════════════════════════════════════════════════════════════════
-- DROP TRIGGER trg_sync_sales_workflow ON sales_orders;
-- CREATE TRIGGER trg_log_sales_stage_change
-- BEFORE UPDATE OF current_stage ON sales_orders
-- FOR EACH ROW EXECUTE FUNCTION log_sales_stage_change();
