-- ============================================================================
-- Sales Backfill — Smart map đơn cũ → current_stage thực tế + set owner
-- Date: 2026-05-04
-- Status: TO APPLY
-- ============================================================================
--
-- VẤN ĐỀ phát hiện 2026-05-04:
--   Backfill ban đầu (D1) map đơn giản status → current_stage. Nhưng có:
--   - 14 đơn `confirmed` quá ETD (đã qua ngày giao) vẫn ở stage 'sales'
--   - 37/37 đơn KHÔNG có current_owner_id (vì created_by cũ NULL)
--
-- SMART BACKFILL RULES:
--   paid/invoiced/delivered/shipped → 'delivered'
--   ready → 'qc' (đã có)
--   confirmed + ETD đã qua > 30d   → 'delivered' (giả định khách nhận, NV quên)
--   confirmed + ETD đã qua ≤ 30d   → 'production' (giả định đang chạy)
--   confirmed + không có ETD       → giữ 'sales' (BGĐ review)
--   draft                          → 'sales' (giữ nguyên)
--
--   current_owner_id = admin minhld@huyanhrubber.com cho TẤT CẢ đơn null owner
--
-- AN TOÀN:
--   - DRY RUN trước (uncomment SELECT ở đầu) để xem ai sẽ thay đổi
--   - Trigger log_sales_stage_change sẽ TỰ ĐỘNG ghi handoff log với
--     dwell_time tính từ created_at → giả lập lịch sử có sẵn
--   - Reversible: chạy lại với rule khác hoặc DELETE handoffs do migration sinh
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: DRY RUN — xem trước mỗi đơn sẽ chuyển sang stage gì
-- (Uncomment block dưới để chạy preview, comment lại trước khi apply thật)
-- ════════════════════════════════════════════════════════════════════════════

-- SELECT
--   code, status, current_stage AS old_stage,
--   etd, contract_date,
--   CASE
--     WHEN status IN ('paid', 'invoiced', 'delivered', 'shipped') THEN 'delivered'
--     WHEN status = 'ready' THEN 'qc'
--     WHEN status = 'confirmed' AND etd IS NOT NULL AND etd < (NOW() - INTERVAL '30 days')::DATE THEN 'delivered'
--     WHEN status = 'confirmed' AND etd IS NOT NULL AND etd < NOW()::DATE THEN 'production'
--     WHEN status = 'confirmed' THEN 'sales'
--     WHEN status = 'draft' THEN 'sales'
--     ELSE current_stage
--   END AS new_stage,
--   CASE
--     WHEN current_stage <> CASE
--       WHEN status IN ('paid', 'invoiced', 'delivered', 'shipped') THEN 'delivered'
--       WHEN status = 'ready' THEN 'qc'
--       WHEN status = 'confirmed' AND etd IS NOT NULL AND etd < (NOW() - INTERVAL '30 days')::DATE THEN 'delivered'
--       WHEN status = 'confirmed' AND etd IS NOT NULL AND etd < NOW()::DATE THEN 'production'
--       WHEN status = 'confirmed' THEN 'sales'
--       WHEN status = 'draft' THEN 'sales'
--       ELSE current_stage
--     END THEN '✱ CHANGE'
--     ELSE 'keep'
--   END AS action
-- FROM sales_orders
-- WHERE status <> 'cancelled'
-- ORDER BY action DESC, code DESC;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: BULK UPDATE current_stage theo rules
-- ════════════════════════════════════════════════════════════════════════════

-- 2a. delivered group: paid + invoiced + shipped + (đã có 'delivered')
UPDATE sales_orders
SET current_stage = 'delivered'
WHERE status IN ('paid', 'invoiced', 'delivered', 'shipped')
  AND current_stage <> 'delivered';

-- 2b. confirmed quá ETD > 30 ngày → giả định đã xong, quên update
UPDATE sales_orders
SET current_stage = 'delivered'
WHERE status = 'confirmed'
  AND etd IS NOT NULL
  AND etd < (NOW() - INTERVAL '30 days')::DATE
  AND current_stage <> 'delivered';

-- 2c. confirmed quá ETD ≤ 30 ngày → giả định đang sản xuất
UPDATE sales_orders
SET current_stage = 'production'
WHERE status = 'confirmed'
  AND etd IS NOT NULL
  AND etd < NOW()::DATE
  AND etd >= (NOW() - INTERVAL '30 days')::DATE
  AND current_stage NOT IN ('delivered', 'production');

-- (2d. ready → qc đã đúng từ D1, không cần update)
-- (2e. draft + confirmed chưa có ETD → giữ 'sales' không update)

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: Set default owner = admin Minh cho tất cả đơn null owner
-- ════════════════════════════════════════════════════════════════════════════

UPDATE sales_orders
SET current_owner_id = (
  SELECT id FROM employees
  WHERE LOWER(email) = 'minhld@huyanhrubber.com'
  LIMIT 1
)
WHERE current_owner_id IS NULL
  AND status <> 'cancelled';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 4: Set stage_started_at + sla_hours sau khi đổi stage
-- (Trigger log_sales_stage_change đã tự reset stage_started_at + sla
--  cho các đơn được UPDATE. Nhưng cần đảm bảo capacity table đầy đủ)
-- ════════════════════════════════════════════════════════════════════════════

-- Re-set sla_hours cho các đơn vừa đổi stage (trigger có set rồi, đây là safety)
UPDATE sales_orders so
SET stage_sla_hours = c.default_sla_hours
FROM sales_dept_capacity c
WHERE so.current_stage = c.dept_code
  AND (so.stage_sla_hours IS NULL OR so.stage_sla_hours = 0);

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 5: NOTIFY
-- ════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 6: VERIFY
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE '=== AFTER backfill — phân bố current_stage ===';
  FOR r IN
    SELECT current_stage, COUNT(*) AS num
    FROM sales_orders
    WHERE status <> 'cancelled'
    GROUP BY current_stage
    ORDER BY num DESC
  LOOP
    RAISE NOTICE '  %  %  -> % đơn', LPAD(r.current_stage, 15, ' '), '|', r.num;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '=== Owner status ===';
  SELECT
    COUNT(*) FILTER (WHERE current_owner_id IS NULL) AS no_owner,
    COUNT(*) FILTER (WHERE current_owner_id IS NOT NULL) AS has_owner,
    COUNT(*) AS total
  INTO r FROM sales_orders WHERE status <> 'cancelled';
  RAISE NOTICE '  no_owner=%  has_owner=%  total=%', r.no_owner, r.has_owner, r.total;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK NOTE
-- ════════════════════════════════════════════════════════════════════════════
-- Migration này chỉ UPDATE — không CREATE/DROP. Reverse:
--   1. Nếu muốn revert tất cả về 'sales': UPDATE sales_orders SET current_stage='sales';
--      Nhưng khuyến cáo KHÔNG nên — vì handoff logs đã ghi.
--   2. Nếu chỉ muốn xóa owner: UPDATE sales_orders SET current_owner_id=NULL
--      WHERE current_owner_id = (SELECT id FROM employees WHERE email='minhld@huyanhrubber.com');
--   3. Để xóa handoff records sinh bởi migration (nếu cần):
--      DELETE FROM sales_order_handoffs WHERE created_at >= '2026-05-04 12:00:00';
