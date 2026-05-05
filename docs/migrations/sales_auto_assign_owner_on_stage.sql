-- ============================================================================
-- Sales — Auto-assign owner khi stage transition (Option B)
-- Date: 2026-05-05
-- Status: TO APPLY
-- ============================================================================
--
-- Yêu cầu user 2026-05-05:
--   Khi đơn được pass sang stage mới, current_owner_id tự động set về
--   nhân viên cố định của bộ phận đó:
--
--   sales         → Hồ Thị Liễu       (sales@huyanhrubber.com)
--   raw_material  → Nguyễn Nhật Tân   (tannv@huyanhrubber.com)
--   production    → Lê Xuân Hồng Trung (trunglxh@huyanhrubber.com)
--   qc            → Lê Thành Nhân     (nhanlt@huyanhrubber.com)
--   packing       → Lê Thành Nhân     (nhanlt@huyanhrubber.com)
--   logistics     → Lê Phương Anh     (anhlp@huyanhrubber.com)
--   delivered     → Phú LV (Kế toán)  (phulv@huyanhrubber.com)
--                   ↑ Mới — sau khi giao hàng, kế toán take over để lập HĐ + thu tiền
--
-- THIẾT KẾ:
--   - Modify hàm `log_sales_stage_change()` đang có sẵn (BEFORE UPDATE
--     trigger). Thêm bước SET NEW.current_owner_id trước khi log handoff.
--   - Logic: nếu app override owner_id qua session var, dùng cái đó.
--     Nếu không, auto-assign theo mapping trên.
--   - Handoff log vẫn ghi đúng từ_owner cũ → to_owner mới.
-- ============================================================================

CREATE OR REPLACE FUNCTION log_sales_stage_change()
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
BEGIN
  -- Chỉ fire khi stage thay đổi
  IF NEW.current_stage IS DISTINCT FROM OLD.current_stage THEN

    -- ── BƯỚC 1: AUTO-ASSIGN OWNER theo stage mới ──
    -- Nếu app đã set NEW.current_owner_id KHÁC OLD (vd qua reassignOwner manual),
    -- tôn trọng giá trị đó. Nếu không, auto-map theo email cố định.
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

    -- ── BƯỚC 2: Tính dwell time ở stage cũ (giờ) ──
    v_dwell := EXTRACT(EPOCH FROM (NOW() - COALESCE(OLD.stage_started_at, OLD.created_at))) / 3600;

    -- ── BƯỚC 3: Lấy passed_by ──
    BEGIN
      v_passed_by := current_setting('app.current_user_id', true)::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_passed_by := OLD.current_owner_id;
    END;

    -- ── BƯỚC 4: Ghi handoff log ──
    INSERT INTO sales_order_handoffs (
      sales_order_id, from_dept, to_dept,
      passed_by, passed_at, dwell_time_hours
    ) VALUES (
      NEW.id, OLD.current_stage, NEW.current_stage,
      v_passed_by, NOW(), v_dwell
    );

    -- ── BƯỚC 5: Reset stage_started_at + auto-set SLA ──
    NEW.stage_started_at := NOW();

    SELECT default_sla_hours INTO NEW.stage_sla_hours
    FROM sales_dept_capacity
    WHERE dept_code = NEW.current_stage;
  END IF;
  RETURN NEW;
END;
$FUNC$;

-- Trigger đã có sẵn (trg_log_sales_stage_change), chỉ replace function là đủ.
-- Không cần DROP+CREATE trigger.

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY: Test 1 đơn pass stage để xem auto-assign hoạt động
-- (CHỈ chạy nếu muốn test thủ công — bình thường skip)
-- ════════════════════════════════════════════════════════════════════════════

-- Lấy 1 đơn sales stage làm test:
-- UPDATE sales_orders SET current_stage = 'raw_material'
-- WHERE code = 'SO-2026-00XX';
--
-- Verify owner đã đổi:
-- SELECT so.code, so.current_stage, e.full_name AS owner
-- FROM sales_orders so
-- LEFT JOIN employees e ON e.id = so.current_owner_id
-- WHERE so.code = 'SO-2026-00XX';

-- ════════════════════════════════════════════════════════════════════════════
-- NOTIFY
-- ════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (revert về function cũ — không có auto-assign)
-- ════════════════════════════════════════════════════════════════════════════
-- Xem version cũ trong sales_module_internal_tracking.sql STEP 5,
-- chạy lại CREATE OR REPLACE FUNCTION log_sales_stage_change() phần đó.
