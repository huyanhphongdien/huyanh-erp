-- ============================================================================
-- Sprint Q — Sales Module audit fixes (local migration, CHƯA apply production)
-- Date: 2026-04-22
-- Status: ⏳ chờ user review + chạy thủ công qua Supabase Dashboard
-- ============================================================================
-- Bugs phát hiện qua audit DB side:
--
-- Q-1 CRITICAL BUG-SALES-1: sales_orders.actual_payment_amount lệch với SUM
--     (sales_order_payments.amount). Nguyên nhân: app-layer sync fragile,
--     không có DB trigger. Ví dụ SO-2026-0003: actual=300 USD nhưng SUM=4.416 USD.
--
-- Q-2 HIGH BUG-SALES-2: 5 "Allow all" RLS policies expose public role →
--     dữ liệu khách hàng/hợp đồng/giá/LC leak cho anonymous user.
--
-- Q-3 HIGH BUG-SALES-3: ZERO CHECK constraints trên 5 bảng Sales
--     (sales_customers, sales_orders, sales_order_containers, items,
--     sales_invoices). Status có thể là bất kỳ string nào.
--
-- Q-4 MED BUG-SALES-4: Container bale_count không sync với items (soft trigger).
--
-- Q-5 NEW SCAFFOLDING: Helper table `sales_user_roles` + function
--     `current_user_sales_role()` để chuẩn bị phân quyền 4 bộ phận
--     (sale / production / logistics / accounting / admin).
--     RLS chưa enforce role-per-department ở Sprint này; app-layer
--     salesPermissionService.ts tiếp tục là nguồn chính. Sprint sau sẽ
--     tighten RLS dựa vào helper này.
-- ============================================================================

BEGIN;


-- ═══════════════════════════════════════════════════════════════
-- Q-1: Trigger sync sales_orders.actual_payment_amount + payment_status
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_sync_sales_order_payment_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_id uuid;
  v_total    numeric(15,2);
  v_value    numeric(15,2);
  v_status   varchar(20);
BEGIN
  v_order_id := COALESCE(NEW.sales_order_id, OLD.sales_order_id);

  -- Tổng tiền đã thu (loại fee_offset không tính vào tiền thu)
  SELECT COALESCE(SUM(amount), 0) INTO v_total
  FROM public.sales_order_payments
  WHERE sales_order_id = v_order_id
    AND payment_type != 'fee_offset';

  SELECT COALESCE(total_value_usd, quantity_tons * unit_price, 0)
    INTO v_value
  FROM public.sales_orders WHERE id = v_order_id;

  -- Tính payment_status
  v_status := CASE
    WHEN v_total <= 0.01 THEN 'unpaid'
    WHEN v_total >= v_value - 0.01 AND v_value > 0 THEN 'paid'
    ELSE 'partial'
  END;

  UPDATE public.sales_orders
  SET actual_payment_amount = v_total,
      payment_status = v_status,
      updated_at = NOW()
  WHERE id = v_order_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sop_sync_order ON public.sales_order_payments;
CREATE TRIGGER trg_sop_sync_order
  AFTER INSERT OR UPDATE OR DELETE ON public.sales_order_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_sales_order_payment_total();

-- Backfill: recompute tất cả sales_orders
UPDATE public.sales_orders o
SET actual_payment_amount = sub.total,
    payment_status = CASE
      WHEN sub.total <= 0.01 THEN 'unpaid'
      WHEN sub.total >= COALESCE(o.total_value_usd, o.quantity_tons * o.unit_price, 0) - 0.01
           AND COALESCE(o.total_value_usd, o.quantity_tons * o.unit_price, 0) > 0 THEN 'paid'
      ELSE 'partial'
    END,
    updated_at = NOW()
FROM (
  SELECT sales_order_id,
         COALESCE(SUM(amount), 0) AS total
  FROM public.sales_order_payments
  WHERE payment_type != 'fee_offset'
  GROUP BY sales_order_id
) sub
WHERE o.id = sub.sales_order_id
  AND ABS(COALESCE(o.actual_payment_amount, 0) - sub.total) > 0.01;


-- ═══════════════════════════════════════════════════════════════
-- Q-2: RLS cleanup — drop "Allow all" PUBLIC policies, giữ auth-scoped
-- ═══════════════════════════════════════════════════════════════

-- Drop các policy expose public/anon
DROP POLICY IF EXISTS "Allow all sales_customers" ON public.sales_customers;
DROP POLICY IF EXISTS "Allow all sales_orders" ON public.sales_orders;
DROP POLICY IF EXISTS "Allow all sales_invoices" ON public.sales_invoices;
DROP POLICY IF EXISTS "Allow all sales_order_containers" ON public.sales_order_containers;
DROP POLICY IF EXISTS "Allow all sales_order_container_items" ON public.sales_order_container_items;

-- Drop các auth_all_* cũ để re-create với naming chuẩn (sales_*_rls)
DROP POLICY IF EXISTS auth_all_sales_orders ON public.sales_orders;
DROP POLICY IF EXISTS auth_all_sales_order_containers ON public.sales_order_containers;
DROP POLICY IF EXISTS sop_select_auth ON public.sales_order_payments;
DROP POLICY IF EXISTS sop_modify_auth ON public.sales_order_payments;

-- Re-create granular policies: SELECT + write riêng
-- (App-layer salesPermissionService kiểm department-level; DB chỉ ensure authenticated)

-- sales_customers
CREATE POLICY sales_customers_rls_read
  ON public.sales_customers FOR SELECT TO authenticated USING (true);
CREATE POLICY sales_customers_rls_write
  ON public.sales_customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY sales_customers_rls_update
  ON public.sales_customers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sales_customers_rls_delete
  ON public.sales_customers FOR DELETE TO authenticated USING (true);

-- sales_orders
CREATE POLICY sales_orders_rls_read
  ON public.sales_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY sales_orders_rls_write
  ON public.sales_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY sales_orders_rls_update
  ON public.sales_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sales_orders_rls_delete
  ON public.sales_orders FOR DELETE TO authenticated USING (true);

-- sales_order_containers
CREATE POLICY so_containers_rls_read
  ON public.sales_order_containers FOR SELECT TO authenticated USING (true);
CREATE POLICY so_containers_rls_write
  ON public.sales_order_containers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY so_containers_rls_update
  ON public.sales_order_containers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY so_containers_rls_delete
  ON public.sales_order_containers FOR DELETE TO authenticated USING (true);

-- sales_order_container_items
CREATE POLICY so_container_items_rls_read
  ON public.sales_order_container_items FOR SELECT TO authenticated USING (true);
CREATE POLICY so_container_items_rls_write
  ON public.sales_order_container_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY so_container_items_rls_update
  ON public.sales_order_container_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY so_container_items_rls_delete
  ON public.sales_order_container_items FOR DELETE TO authenticated USING (true);

-- sales_invoices
CREATE POLICY sales_invoices_rls_read
  ON public.sales_invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY sales_invoices_rls_write
  ON public.sales_invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY sales_invoices_rls_update
  ON public.sales_invoices FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sales_invoices_rls_delete
  ON public.sales_invoices FOR DELETE TO authenticated USING (true);

-- sales_order_payments
CREATE POLICY sales_payments_rls_read
  ON public.sales_order_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY sales_payments_rls_write
  ON public.sales_order_payments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY sales_payments_rls_update
  ON public.sales_order_payments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sales_payments_rls_delete
  ON public.sales_order_payments FOR DELETE TO authenticated USING (true);


-- ═══════════════════════════════════════════════════════════════
-- Q-3: CHECK constraints (dựa vào observed values + canonical enum)
-- ═══════════════════════════════════════════════════════════════
-- Observed từ DB:
--   sales_customers.status: active
--   sales_customers.tier: premium, standard, strategic
--   sales_customers.default_currency: USD
--   sales_orders.status: draft, confirmed, paid, cancelled
--   sales_orders.payment_status: unpaid, partial, paid
--   sales_orders.currency: USD
--   sales_orders.incoterm: CIF, FOB
--   sales_orders.packing_type: loose_bale, sw_pallet, wooden_pallet
--   sales_order_containers.status: shipped, planning
-- CHECK list mở rộng hơn observed để cover toàn workflow sau.

-- sales_customers
ALTER TABLE public.sales_customers
  ADD CONSTRAINT chk_sales_customers_status
  CHECK (status IN ('active','inactive','suspended','blacklisted'));

ALTER TABLE public.sales_customers
  ADD CONSTRAINT chk_sales_customers_tier
  CHECK (tier IN ('new','standard','premium','strategic','vip'));

ALTER TABLE public.sales_customers
  ADD CONSTRAINT chk_sales_customers_currency
  CHECK (default_currency IN ('USD','VND','EUR','CNY','JPY','GBP'));

-- sales_orders
ALTER TABLE public.sales_orders
  ADD CONSTRAINT chk_sales_orders_status
  CHECK (status IN (
    'draft','confirmed','producing','ready','packing',
    'shipped','delivered','invoiced','paid','cancelled'
  ));

ALTER TABLE public.sales_orders
  ADD CONSTRAINT chk_sales_orders_payment_status
  CHECK (payment_status IN ('unpaid','partial','paid','overdue','cancelled'));

ALTER TABLE public.sales_orders
  ADD CONSTRAINT chk_sales_orders_currency
  CHECK (currency IN ('USD','VND','EUR','CNY','JPY','GBP'));

ALTER TABLE public.sales_orders
  ADD CONSTRAINT chk_sales_orders_incoterm
  CHECK (incoterm IN (
    'FOB','CFR','CIF','EXW','FCA','CIP','CPT','DAP','DDP','FAS','DPU'
  ));

ALTER TABLE public.sales_orders
  ADD CONSTRAINT chk_sales_orders_packing_type
  CHECK (packing_type IN (
    'loose_bale','sw_pallet','wooden_pallet','bale','bag','drum','bulk','pallet'
  ));

-- sales_order_containers
ALTER TABLE public.sales_order_containers
  ADD CONSTRAINT chk_so_containers_status
  CHECK (status IN (
    'planning','packing','packed','sealed','loaded','shipped','delivered'
  ));

-- sales_invoices (chưa có data → không cần backfill check)
ALTER TABLE public.sales_invoices
  ADD CONSTRAINT chk_sales_invoices_status
  CHECK (status IS NULL OR status IN ('draft','sent','paid','overdue','cancelled'));

ALTER TABLE public.sales_invoices
  ADD CONSTRAINT chk_sales_invoices_payment_status
  CHECK (payment_status IS NULL OR payment_status IN ('unpaid','partial','paid','overdue'));

ALTER TABLE public.sales_invoices
  ADD CONSTRAINT chk_sales_invoices_currency
  CHECK (currency IS NULL OR currency IN ('USD','VND','EUR','CNY','JPY','GBP'));


-- ═══════════════════════════════════════════════════════════════
-- Q-4: Soft-sync container.bale_count ↔ SUM(items.bale_count)
-- ═══════════════════════════════════════════════════════════════
-- Chỉ sync khi container có items — không wipe khi bale_count nhập thủ công.

CREATE OR REPLACE FUNCTION public.fn_sync_container_bale_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_container_id uuid;
  v_sum_bales    integer;
  v_item_rows    integer;
  v_sum_weight   numeric(12,2);
BEGIN
  v_container_id := COALESCE(NEW.container_id, OLD.container_id);

  SELECT COALESCE(SUM(bale_count), 0),
         COUNT(*),
         COALESCE(SUM(weight_kg), 0)
  INTO v_sum_bales, v_item_rows, v_sum_weight
  FROM public.sales_order_container_items
  WHERE container_id = v_container_id;

  -- Chỉ sync khi container có ít nhất 1 item (tránh wipe manual count)
  IF v_item_rows > 0 THEN
    UPDATE public.sales_order_containers
    SET bale_count = v_sum_bales,
        net_weight_kg = COALESCE(NULLIF(v_sum_weight, 0), net_weight_kg)
    WHERE id = v_container_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_container_bale_count
  ON public.sales_order_container_items;
CREATE TRIGGER trg_sync_container_bale_count
  AFTER INSERT OR UPDATE OR DELETE ON public.sales_order_container_items
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_container_bale_count();


-- ═══════════════════════════════════════════════════════════════
-- Q-5: Scaffolding phân quyền 4 bộ phận Sales
-- ═══════════════════════════════════════════════════════════════
-- Hiện app-layer (src/services/sales/salesPermissionService.ts) map email →
-- sale|production|logistics|accounting|admin. Chuyển mapping sang DB để
-- Sprint sau có thể tighten RLS theo role.

CREATE TABLE IF NOT EXISTS public.sales_user_roles (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       varchar(20) NOT NULL CHECK (role IN (
    'sale','production','logistics','accounting','admin'
  )),
  notes      text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_user_roles_role
  ON public.sales_user_roles(role);

ALTER TABLE public.sales_user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY sales_user_roles_read
  ON public.sales_user_roles FOR SELECT TO authenticated USING (true);

-- Backfill từ email mapping hiện tại (đồng bộ với salesPermissionService.ts)
-- Lần chạy đầu sẽ skip nếu user chưa tồn tại trong auth.users
INSERT INTO public.sales_user_roles (user_id, role, notes)
SELECT u.id, 'sale', 'Auto: sales@huyanhrubber.com'
FROM auth.users u WHERE u.email = 'sales@huyanhrubber.com'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.sales_user_roles (user_id, role, notes)
SELECT u.id, 'production', 'Auto: production team'
FROM auth.users u
WHERE u.email IN ('trunglxh@huyanhrubber.com','nhanlt@huyanhrubber.com')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.sales_user_roles (user_id, role, notes)
SELECT u.id, 'logistics', 'Auto: logistics team'
FROM auth.users u
WHERE u.email IN ('logistics@huyanhrubber.com','anhlp@huyanhrubber.com')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.sales_user_roles (user_id, role, notes)
SELECT u.id, 'accounting', 'Auto: accounting team'
FROM auth.users u
WHERE u.email IN ('yendt@huyanhrubber.com','phulv@huyanhrubber.com')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.sales_user_roles (user_id, role, notes)
SELECT u.id, 'admin', 'Auto: BGĐ + admin'
FROM auth.users u
WHERE u.email IN (
  'minhld@huyanhrubber.com','thuyht@huyanhrubber.com','huylv@huyanhrubber.com',
  'huyanhphongdien@gmail.com'
)
ON CONFLICT (user_id) DO NOTHING;

-- Helper function: trả role hiện tại của user (dùng trong RLS tương lai)
CREATE OR REPLACE FUNCTION public.current_user_sales_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.sales_user_roles WHERE user_id = auth.uid() LIMIT 1),
    'none'
  )
$$;

GRANT EXECUTE ON FUNCTION public.current_user_sales_role() TO authenticated;

-- Helper function: check role membership
CREATE OR REPLACE FUNCTION public.has_sales_role(required_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sales_user_roles
    WHERE user_id = auth.uid()
      AND role = ANY(required_roles)
  )
$$;

GRANT EXECUTE ON FUNCTION public.has_sales_role(text[]) TO authenticated;


-- ═══════════════════════════════════════════════════════════════
-- COMMIT + VERIFY
-- ═══════════════════════════════════════════════════════════════

COMMIT;

NOTIFY pgrst, 'reload schema';

-- VERIFY #1: Payment sync — inconsistent orders phải bằng 0
SELECT COUNT(*) AS inconsistent_orders
FROM sales_orders o
LEFT JOIN (
  SELECT sales_order_id, COALESCE(SUM(amount), 0) AS total
  FROM sales_order_payments WHERE payment_type != 'fee_offset'
  GROUP BY sales_order_id
) s ON s.sales_order_id = o.id
WHERE ABS(COALESCE(o.actual_payment_amount, 0) - COALESCE(s.total, 0)) > 0.01;
-- Expected: 0

-- VERIFY #2: "Allow all" policies = 0
SELECT COUNT(*) AS leftover_allow_all
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename LIKE 'sales_%'
  AND (policyname ILIKE '%allow all%' OR policyname ILIKE 'auth_all%' OR policyname ILIKE 'sop_%');
-- Expected: 0

-- VERIFY #3: CHECK constraints count
SELECT relname AS tbl, COUNT(*) AS check_count
FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
WHERE t.relname LIKE 'sales_%' AND c.contype = 'c'
GROUP BY relname ORDER BY relname;
-- Expected: sales_customers 3+, sales_orders 5+, sales_order_containers 1+, sales_invoices 3+, sales_order_payments 2+

-- VERIFY #4: Container bale_count sync (manual rows không bị wipe)
SELECT COUNT(*) AS mismatch
FROM sales_order_containers c
LEFT JOIN sales_order_container_items i ON i.container_id = c.id
GROUP BY c.id HAVING c.bale_count != COALESCE(SUM(i.bale_count), c.bale_count);
-- Expected: 3 containers giữ nguyên bale_count (600,630,576) vì không có items

-- VERIFY #5: Roles backfilled
SELECT role, COUNT(*) FROM public.sales_user_roles GROUP BY role ORDER BY role;
-- Expected: rows tương ứng với số user mỗi role
