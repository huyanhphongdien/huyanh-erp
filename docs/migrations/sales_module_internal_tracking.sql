-- ============================================================================
-- Sales Module Internal Tracking — Sprint 1 D1
-- Date: 2026-05-04
-- Status: TO APPLY
-- ============================================================================
--
-- MỤC ĐÍCH:
--   Bổ sung khả năng tracking nội bộ cho module Sales — mỗi đơn có
--   1 owner duy nhất tại 1 thời điểm, di chuyển qua 7 stages.
--   BGĐ vào trang Kanban là biết "đơn đang ở đâu, ai cầm, bao lâu".
--
-- 7 STAGES:
--   sales → raw_material → production → qc → packing → logistics → delivered
--
-- THAY ĐỔI:
--   1. ALTER sales_orders: thêm 4 cột tracking
--   2. CREATE sales_order_handoffs (audit log mỗi lần chuyển stage)
--   3. CREATE sales_dept_capacity (config capacity từng bộ phận)
--   4. CREATE sales_digest_subscribers (ai nhận email digest)
--   5. CREATE TRIGGER log_stage_change (auto ghi handoff)
--   6. BACKFILL current_stage cho 35 đơn hiện có (map từ status)
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: ALTER sales_orders — thêm cột tracking
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS current_stage VARCHAR(20) DEFAULT 'sales',
  ADD COLUMN IF NOT EXISTS current_owner_id UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS stage_started_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS stage_sla_hours INT;

-- CHECK constraint cho 7 stages
ALTER TABLE sales_orders DROP CONSTRAINT IF EXISTS chk_current_stage;
ALTER TABLE sales_orders
  ADD CONSTRAINT chk_current_stage CHECK (current_stage IN (
    'sales', 'raw_material', 'production', 'qc',
    'packing', 'logistics', 'delivered'
  ));

-- Index hỗ trợ Kanban + owner queries
CREATE INDEX IF NOT EXISTS idx_sales_orders_current_stage
  ON sales_orders(current_stage);
CREATE INDEX IF NOT EXISTS idx_sales_orders_current_owner
  ON sales_orders(current_owner_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_stage_sla
  ON sales_orders(current_stage, stage_started_at);

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: CREATE sales_order_handoffs — audit log
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sales_order_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  from_dept VARCHAR(20),                                    -- NULL nếu là log đầu tiên
  to_dept VARCHAR(20) NOT NULL,
  passed_by UUID REFERENCES employees(id),
  received_by UUID REFERENCES employees(id),
  passed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at TIMESTAMPTZ,
  dwell_time_hours NUMERIC(10, 2),                          -- Thời gian dừng ở from_dept
  passed_notes TEXT,
  received_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_handoffs_order
  ON sales_order_handoffs(sales_order_id, passed_at DESC);
CREATE INDEX IF NOT EXISTS idx_handoffs_dept
  ON sales_order_handoffs(to_dept, passed_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: CREATE sales_dept_capacity — cấu hình capacity
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sales_dept_capacity (
  dept_code VARCHAR(20) PRIMARY KEY,
  dept_name VARCHAR(100) NOT NULL,
  max_concurrent_orders INT NOT NULL,
  warning_threshold_pct INT DEFAULT 80,
  critical_threshold_pct INT DEFAULT 95,
  default_sla_hours INT DEFAULT 24,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default capacity (idempotent với ON CONFLICT)
INSERT INTO sales_dept_capacity (dept_code, dept_name, max_concurrent_orders, default_sla_hours) VALUES
  ('sales',         'Phòng Kinh doanh',     15, 24),     -- 1d ký HĐ
  ('raw_material',  'Mua mủ NVL',           10, 96),     -- 4d chuẩn bị
  ('production',    'Sản xuất',             10, 168),    -- 7d sản xuất
  ('qc',            'QC Final',              8, 48),     -- 2d kiểm tra
  ('packing',       'Đóng gói',             12, 36),     -- 1.5d đóng gói
  ('logistics',     'Logistics + xuất kho',  5, 36),     -- 1.5d xếp xe + chứng từ
  ('delivered',     'Đã giao khách',       999, 0)       -- terminal
ON CONFLICT (dept_code) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 4: CREATE sales_digest_subscribers
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sales_digest_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  receive_overdue BOOLEAN DEFAULT TRUE,           -- Đơn quá SLA
  receive_arriving BOOLEAN DEFAULT TRUE,          -- Đơn đến bộ phận hôm nay
  receive_capacity BOOLEAN DEFAULT TRUE,          -- Capacity status
  schedule_time TIME DEFAULT '08:00:00',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_digest_employee
  ON sales_digest_subscribers(employee_id);

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 5: TRIGGER log_stage_change — auto ghi handoff khi current_stage thay đổi
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION log_sales_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $FUNC$
DECLARE
  v_dwell NUMERIC(10, 2);
  v_passed_by UUID;
BEGIN
  -- Chỉ fire khi stage thay đổi
  IF NEW.current_stage IS DISTINCT FROM OLD.current_stage THEN
    -- Tính dwell time ở stage cũ (giờ)
    v_dwell := EXTRACT(EPOCH FROM (NOW() - COALESCE(OLD.stage_started_at, OLD.created_at))) / 3600;

    -- Lấy passed_by từ session variable (set bởi app), fallback về current_owner_id cũ
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

    -- Reset stage_started_at cho stage mới
    NEW.stage_started_at := NOW();

    -- Auto-set SLA từ config
    SELECT default_sla_hours INTO NEW.stage_sla_hours
    FROM sales_dept_capacity
    WHERE dept_code = NEW.current_stage;
  END IF;
  RETURN NEW;
END;
$FUNC$;

DROP TRIGGER IF EXISTS trg_log_sales_stage_change ON sales_orders;
CREATE TRIGGER trg_log_sales_stage_change
BEFORE UPDATE OF current_stage ON sales_orders
FOR EACH ROW EXECUTE FUNCTION log_sales_stage_change();

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 6: BACKFILL — map current status → current_stage cho 35 đơn hiện có
-- ════════════════════════════════════════════════════════════════════════════

-- Map status (10 values) → current_stage (7 values):
--   draft / confirmed              → 'sales' (đang ký)
--   producing                      → 'production'
--   ready                          → 'qc' (sẵn sàng = đã sản xuất xong, chờ QC)
--   packing                        → 'packing'
--   shipped                        → 'logistics' (đã xuất kho, đang vận chuyển)
--   delivered / invoiced / paid    → 'delivered' (terminal)
--   cancelled                      → giữ stage hiện tại (nếu NULL set 'sales')

-- Backfill — chỉ cập nhật rows có current_stage IS NULL (idempotent)
UPDATE sales_orders
SET current_stage = CASE
  WHEN status IN ('draft', 'confirmed')               THEN 'sales'
  WHEN status = 'producing'                            THEN 'production'
  WHEN status = 'ready'                                THEN 'qc'
  WHEN status = 'packing'                              THEN 'packing'
  WHEN status = 'shipped'                              THEN 'logistics'
  WHEN status IN ('delivered', 'invoiced', 'paid')    THEN 'delivered'
  ELSE 'sales'
END,
stage_started_at = COALESCE(updated_at, created_at)  -- best guess
WHERE current_stage IS NULL OR current_stage = 'sales';

-- Set SLA cho các đơn vừa backfill từ config
UPDATE sales_orders so
SET stage_sla_hours = c.default_sla_hours
FROM sales_dept_capacity c
WHERE so.current_stage = c.dept_code
  AND so.stage_sla_hours IS NULL;

-- Set current_owner_id default = created_by (nếu có)
UPDATE sales_orders
SET current_owner_id = created_by
WHERE current_owner_id IS NULL
  AND created_by IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 7: NOTIFY PostgREST reload schema cache
-- ════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY (sau khi apply, chạy thủ công trên SQL Editor)
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Phân bố stage sau backfill
DO $$
DECLARE
  r RECORD;
  total INT;
BEGIN
  SELECT COUNT(*) INTO total FROM sales_orders;
  RAISE NOTICE '=== Phân bố % đơn theo current_stage ===', total;
  FOR r IN
    SELECT current_stage, COUNT(*) AS num
    FROM sales_orders
    GROUP BY current_stage
    ORDER BY num DESC
  LOOP
    RAISE NOTICE '  %  %  -> % đơn', LPAD(r.current_stage, 15, ' '), '|', r.num;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '=== Capacity config ===';
  FOR r IN SELECT dept_code, max_concurrent_orders, default_sla_hours FROM sales_dept_capacity ORDER BY dept_code LOOP
    RAISE NOTICE '  %  cap=% sla=%h', LPAD(r.dept_code, 15, ' '), r.max_concurrent_orders, r.default_sla_hours;
  END LOOP;
END $$;

-- 2. Đơn có current_owner_id chưa? (nếu null nhiều cần set thủ công sau)
-- SELECT COUNT(*) FILTER (WHERE current_owner_id IS NULL) AS no_owner,
--        COUNT(*) FILTER (WHERE current_owner_id IS NOT NULL) AS has_owner
-- FROM sales_orders;

-- 3. Trigger có hoạt động chưa? Test:
-- UPDATE sales_orders SET current_stage = 'qc' WHERE code = 'SO-2026-0050';
-- SELECT * FROM sales_order_handoffs ORDER BY created_at DESC LIMIT 1;
-- (Phải thấy 1 handoff row mới với from_dept=stage cũ, to_dept='qc')

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
-- DROP TRIGGER IF EXISTS trg_log_sales_stage_change ON sales_orders;
-- DROP FUNCTION IF EXISTS log_sales_stage_change();
-- DROP TABLE IF EXISTS sales_digest_subscribers;
-- DROP TABLE IF EXISTS sales_dept_capacity;
-- DROP TABLE IF EXISTS sales_order_handoffs;
-- ALTER TABLE sales_orders
--   DROP CONSTRAINT IF EXISTS chk_current_stage,
--   DROP COLUMN IF EXISTS current_stage,
--   DROP COLUMN IF EXISTS current_owner_id,
--   DROP COLUMN IF EXISTS stage_started_at,
--   DROP COLUMN IF EXISTS stage_sla_hours;
