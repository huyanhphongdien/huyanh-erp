-- ============================================================================
-- DISPATCH MODULE v2 — MỞ RLS CHO ANON (app Trạm cân)
-- Date: 2026-06-13
-- ============================================================================
-- Vì sao: app cân (apps/weighbridge) đăng nhập bằng `scale_operators` + anon key
-- (KHÔNG dùng Supabase auth) → chạy role `anon`. dispatch_module_v1.sql chỉ tạo
-- policy `TO authenticated` nên app cân KHÔNG đọc được lệnh điều động (dropdown
-- "Chọn lệnh điều động" rỗng) và KHÔNG ghi được KL cân về lệnh.
--
-- Fix: thêm policy `TO anon` (FOR ALL) cho dispatch_orders + dispatch_order_lines
-- — đúng pattern các bảng weighbridge (xem sprint1_06_weighbridge_rls_anon_access.sql,
-- weighbridge_tickets_anon_all FOR ALL TO anon).
--
-- Idempotent: DROP POLICY IF EXISTS trước khi CREATE.
-- ============================================================================

DO $$
BEGIN
  -- dispatch_orders: anon đọc (listForWeighing/getById) + update (syncWeighing ghi weighbridge_ticket_id)
  EXECUTE 'DROP POLICY IF EXISTS dispatch_orders_anon_all ON public.dispatch_orders';
  EXECUTE 'CREATE POLICY dispatch_orders_anon_all ON public.dispatch_orders FOR ALL TO anon USING (true) WITH CHECK (true)';

  -- dispatch_order_lines: anon đọc (getById) + update (syncWeighing ghi actual_weight_kg/actual_seal_no)
  EXECUTE 'DROP POLICY IF EXISTS dispatch_order_lines_anon_all ON public.dispatch_order_lines';
  EXECUTE 'CREATE POLICY dispatch_order_lines_anon_all ON public.dispatch_order_lines FOR ALL TO anon USING (true) WITH CHECK (true)';

  RAISE NOTICE 'dispatch_module_v2: anon RLS policies added (dispatch_orders + dispatch_order_lines)';
END $$;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY: liệt kê policy của 2 bảng (phải thấy cả _anon_all lẫn _auth_all)
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_cnt int;
BEGIN
  SELECT count(*) INTO v_cnt FROM pg_policies
  WHERE schemaname='public'
    AND tablename IN ('dispatch_orders','dispatch_order_lines')
    AND policyname LIKE '%anon%';
  IF v_cnt < 2 THEN RAISE EXCEPTION 'FAIL: thiếu policy anon (chỉ có %)', v_cnt; END IF;
  RAISE NOTICE '═══ dispatch_module_v2 VERIFY PASS — % policy anon ═══', v_cnt;
END $$;
