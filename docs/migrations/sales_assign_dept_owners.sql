-- ============================================================================
-- Sales — Assign owner theo stage (per yêu cầu BGĐ 2026-05-05)
-- Date: 2026-05-05
-- Status: TO APPLY
-- ============================================================================
--
-- Yêu cầu user 2026-05-05:
--   - Sales (Kinh doanh): lấy created_by nếu có, fallback Hồ Thị Liễu (sales@)
--   - Mua mủ NVL: Nguyễn Nhật Tân (tannv@huyanhrubber.com, HA-0048)
--   - Sản xuất: Lê Xuân Hồng Trung (trunglxh@, HA-0003)
--   - QC + Đóng gói: Lê Thành Nhân (nhanlt@, HA-0007)
--   - Logistics: Lê Phương Anh (anhlp@, HA-0073)
--
-- Đã grant quyền Sales module cho tannv@ qua salesPermissionService.ts
-- (role='production' — cho phép xem Sales + edit production tab).
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: Update current_owner_id theo current_stage
-- ════════════════════════════════════════════════════════════════════════════

-- Sales stage: ưu tiên created_by, fallback Hồ Thị Liễu (sales@)
UPDATE sales_orders so
SET current_owner_id = COALESCE(
  so.created_by,
  (SELECT id FROM employees WHERE LOWER(email) = 'sales@huyanhrubber.com' LIMIT 1)
)
WHERE so.current_stage = 'sales'
  AND so.status <> 'cancelled';

-- Mua mủ NVL → Nguyễn Nhật Tân
UPDATE sales_orders
SET current_owner_id = (
  SELECT id FROM employees WHERE LOWER(email) = 'tannv@huyanhrubber.com' LIMIT 1
)
WHERE current_stage = 'raw_material'
  AND status <> 'cancelled';

-- Sản xuất → Lê Xuân Hồng Trung
UPDATE sales_orders
SET current_owner_id = (
  SELECT id FROM employees WHERE LOWER(email) = 'trunglxh@huyanhrubber.com' LIMIT 1
)
WHERE current_stage = 'production'
  AND status <> 'cancelled';

-- QC Final → Lê Thành Nhân
UPDATE sales_orders
SET current_owner_id = (
  SELECT id FROM employees WHERE LOWER(email) = 'nhanlt@huyanhrubber.com' LIMIT 1
)
WHERE current_stage = 'qc'
  AND status <> 'cancelled';

-- Đóng gói → Lê Thành Nhân (cùng người với QC)
UPDATE sales_orders
SET current_owner_id = (
  SELECT id FROM employees WHERE LOWER(email) = 'nhanlt@huyanhrubber.com' LIMIT 1
)
WHERE current_stage = 'packing'
  AND status <> 'cancelled';

-- Logistics → Lê Phương Anh
UPDATE sales_orders
SET current_owner_id = (
  SELECT id FROM employees WHERE LOWER(email) = 'anhlp@huyanhrubber.com' LIMIT 1
)
WHERE current_stage = 'logistics'
  AND status <> 'cancelled';

-- Delivered: giữ nguyên owner cuối cùng (đã hoàn tất, không cần đổi)

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: NOTIFY
-- ════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: VERIFY
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE '=== Owner phân bố theo stage SAU update ===';
  FOR r IN
    SELECT
      so.current_stage,
      e.full_name AS owner_name,
      COUNT(*) AS num
    FROM sales_orders so
    LEFT JOIN employees e ON e.id = so.current_owner_id
    WHERE so.status <> 'cancelled'
    GROUP BY so.current_stage, e.full_name
    ORDER BY so.current_stage, num DESC
  LOOP
    RAISE NOTICE '  %  ->  %  (% đơn)',
      LPAD(r.current_stage, 15, ' '),
      COALESCE(r.owner_name, '(NULL)'),
      r.num;
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
-- UPDATE sales_orders SET current_owner_id = (
--   SELECT id FROM employees WHERE email = 'minhld@huyanhrubber.com' LIMIT 1
-- ) WHERE status <> 'cancelled';
