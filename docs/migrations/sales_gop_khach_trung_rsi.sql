-- ============================================================
-- GỘP + XOÁ KHÁCH HÀNG TRÙNG: RSI Middle East FZ-LLC (31/10/2026, chủ DN: "Xóa thằng trên, giữ thằng dưới lại")
--   XOÁ : 8999100000053  "RSI Middle East FZ-LLC (OTHER)"   ← bản trùng
--   GIỮ : 8999100001821  "RSI Middle East FZ-LLC"
--   Đơn hàng / hoá đơn / hồ sơ xuất khẩu đang trỏ bản trùng → chuyển sang bản giữ, rồi xoá khách trùng
--   và Business Partner (HAC-13) của nó. bp_roles / bp_search_keys / bp_name_history / bp_address_history
--   xoá theo CASCADE. suppliers / b2b.partners / rubber_suppliers / b2b_monthly_bonuses nếu đang trỏ BP trùng
--   → chuyển sang BP giữ trước (FK của các bảng này là SET NULL, không chuyển sẽ mất liên kết).
--   Dùng lại cho cặp khác: đổi 2 mã ở khối B (MA_XOA / MA_GIU).
-- ⚠ Không có BEGIN/COMMIT. Chạy khối A xem trước → khối B → khối C kiểm chứng.
-- ============================================================

-- ─── A. XEM TRƯỚC: 2 khách + số đơn / hoá đơn / hồ sơ đang trỏ ─────────────
SELECT c.code, c.name, c.status, c.id AS customer_id, c.bp_id, b.hac13_code, b.legal_name AS bp_legal_name, b.status AS bp_status,
       (SELECT count(*) FROM public.sales_orders o WHERE o.customer_id = c.id)                     AS don_hang,
       (SELECT string_agg(o.code, ', ') FROM public.sales_orders o WHERE o.customer_id = c.id)      AS ma_don,
       (SELECT count(*) FROM public.sales_invoices i WHERE i.customer_id = c.id)                   AS hoa_don,
       (SELECT count(*) FROM public.sales_customer_export_profiles p WHERE p.customer_id = c.id)   AS ho_so_xk,
       (SELECT count(*) FROM public.suppliers s WHERE s.bp_id = c.bp_id)                           AS ncc_cung_bp
  FROM public.sales_customers c LEFT JOIN public.business_partners b ON b.id = c.bp_id
 WHERE c.code IN ('8999100000053', '8999100001821')
 ORDER BY c.code;

-- ─── B. GỘP + XOÁ (chạy nguyên khối) ────────────────────────────────────────
CREATE TEMP TABLE _k AS
  SELECT x.id AS xoa_id, x.bp_id AS xoa_bp, g.id AS giu_id, g.bp_id AS giu_bp
    FROM (SELECT id, bp_id FROM public.sales_customers WHERE code = '8999100000053') x,   -- MA_XOA
         (SELECT id, bp_id FROM public.sales_customers WHERE code = '8999100001821') g;   -- MA_GIU

DO $$ BEGIN
  IF (SELECT count(*) FROM _k) <> 1 THEN RAISE EXCEPTION 'Không tìm thấy đủ 2 khách theo mã (xoá / giữ)'; END IF;
  IF (SELECT xoa_id = giu_id FROM _k) THEN RAISE EXCEPTION 'Mã xoá và mã giữ trùng nhau'; END IF;
END $$;

-- 1. chuyển đơn hàng, hoá đơn sang bản giữ
UPDATE public.sales_orders   o SET customer_id = k.giu_id, updated_at = now() FROM _k k WHERE o.customer_id = k.xoa_id;
UPDATE public.sales_invoices i SET customer_id = k.giu_id FROM _k k WHERE i.customer_id = k.xoa_id;

-- 2. hồ sơ xuất khẩu: bản giữ chưa có thì chuyển sang; có rồi thì hồ sơ bản trùng xoá theo CASCADE ở bước 4
UPDATE public.sales_customer_export_profiles p SET customer_id = k.giu_id, updated_at = now()
  FROM _k k
 WHERE p.customer_id = k.xoa_id
   AND NOT EXISTS (SELECT 1 FROM public.sales_customer_export_profiles q WHERE q.customer_id = k.giu_id);

-- 3. các bảng khác đang trỏ BP trùng → trỏ BP giữ (chỉ khi cả 2 có BP)
UPDATE public.suppliers s SET bp_id = k.giu_bp FROM _k k WHERE k.xoa_bp IS NOT NULL AND k.giu_bp IS NOT NULL AND s.bp_id = k.xoa_bp;
DO $$ DECLARE k record; BEGIN
  SELECT * INTO k FROM _k;
  IF k.xoa_bp IS NULL OR k.giu_bp IS NULL THEN RETURN; END IF;
  IF to_regclass('public.b2b_monthly_bonuses') IS NOT NULL THEN
    EXECUTE 'UPDATE public.b2b_monthly_bonuses SET bp_id = $1 WHERE bp_id = $2' USING k.giu_bp, k.xoa_bp; END IF;
  IF to_regclass('public.rubber_suppliers') IS NOT NULL THEN
    EXECUTE 'UPDATE public.rubber_suppliers SET bp_id = $1 WHERE bp_id = $2' USING k.giu_bp, k.xoa_bp; END IF;
  IF to_regclass('b2b.partners') IS NOT NULL THEN
    EXECUTE 'UPDATE b2b.partners SET bp_id = $1 WHERE bp_id = $2' USING k.giu_bp, k.xoa_bp; END IF;
END $$;

-- 4. xoá khách trùng (hồ sơ XK còn lại của nó xoá theo CASCADE), rồi xoá BP trùng (bp_roles / search_keys / history CASCADE)
DELETE FROM public.sales_customers WHERE id = (SELECT xoa_id FROM _k);
DELETE FROM public.business_partners b
 WHERE b.id = (SELECT xoa_bp FROM _k)
   AND NOT EXISTS (SELECT 1 FROM public.sales_customers c WHERE c.bp_id = b.id)
   AND NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.bp_id = b.id);

-- ─── C. KIỂM CHỨNG: còn đúng 1 khách, không còn đơn/hoá đơn trỏ id đã xoá ────
SELECT c.code, c.name, c.status, b.hac13_code, b.status AS bp_status,
       (SELECT count(*) FROM public.sales_orders o WHERE o.customer_id = c.id)   AS don_hang,
       (SELECT count(*) FROM public.sales_invoices i WHERE i.customer_id = c.id) AS hoa_don
  FROM public.sales_customers c LEFT JOIN public.business_partners b ON b.id = c.bp_id
 WHERE c.code IN ('8999100000053', '8999100001821');
SELECT (SELECT count(*) FROM public.sales_customers WHERE code = '8999100000053') AS khach_trung_con,
       (SELECT count(*) FROM public.business_partners WHERE hac13_code = '8999100000053') AS bp_trung_con,
       (SELECT count(*) FROM public.sales_orders o WHERE o.customer_id = (SELECT xoa_id FROM _k)) AS don_mo_coi;
