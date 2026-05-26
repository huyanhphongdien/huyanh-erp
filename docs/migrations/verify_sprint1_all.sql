-- ============================================================================
-- VERIFY SPRINT 1 — Kiểm tra 7 migration đã chạy chưa
-- Date: 2026-05-27
-- ============================================================================
--
-- Chạy file này trong Supabase SQL Editor.
-- Kết quả là 1 bảng tổng hợp: migration nào ✓ OK, migration nào ✗ FAIL.
-- Nếu có bất kỳ ✗ → chạy lại migration tương ứng từ docs/migrations/.
--
-- KHÔNG SỬA DỮ LIỆU — chỉ SELECT để verify.
-- ============================================================================

WITH checks AS (
  -- ─── Sprint 1.1: b2b_partners proxy ───
  SELECT 'sprint1_01_proxy' AS migration, 'b2b_partners.payment_proxy_partner_id' AS what,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='b2b_partners' AND column_name='payment_proxy_partner_id') AS ok
  UNION ALL
  SELECT 'sprint1_01_proxy', 'b2b_partners.contact_alias_name',
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='b2b_partners' AND column_name='contact_alias_name')
  UNION ALL
  SELECT 'sprint1_01_proxy', 'b2b_partners.is_payment_proxy',
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='b2b_partners' AND column_name='is_payment_proxy')
  UNION ALL

  -- ─── Sprint 1.2: pnk_number ───
  SELECT 'sprint1_02_pnk', 'rubber_intake_batches.pnk_number',
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='rubber_intake_batches' AND column_name='pnk_number')
  UNION ALL
  SELECT 'sprint1_02_pnk', 'fn_assign_pnk_number()',
    EXISTS(SELECT 1 FROM pg_proc WHERE proname='fn_assign_pnk_number')
  UNION ALL

  -- ─── Sprint 1.3: bonus dry weight ───
  SELECT 'sprint1_03_bonus_dry', 'b2b_bonus_rules.bonus_unit',
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='b2b_bonus_rules' AND column_name='bonus_unit')
  UNION ALL
  SELECT 'sprint1_03_bonus_dry', 'rubber_intake_batches.dry_weight_kg',
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='rubber_intake_batches' AND column_name='dry_weight_kg')
  UNION ALL

  -- ─── Sprint 1.4: weighbridge DRC + DOT + LLM ───
  SELECT 'sprint1_04_dot', 'weighbridge_tickets.field_dot_reading',
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='weighbridge_tickets' AND column_name='field_dot_reading')
  UNION ALL
  SELECT 'sprint1_04_dot', 'weighbridge_tickets.consolidation_code',
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='weighbridge_tickets' AND column_name='consolidation_code')
  UNION ALL
  SELECT 'sprint1_04_dot', 'rubber_intake_batches.field_dot_reading',
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='rubber_intake_batches' AND column_name='field_dot_reading')
  UNION ALL
  SELECT 'sprint1_04_dot', 'rubber_intake_batches.consolidation_code',
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='rubber_intake_batches' AND column_name='consolidation_code')
  UNION ALL
  SELECT 'sprint1_04_dot', 'bridge_weighbridge_to_intake() v2',
    EXISTS(SELECT 1 FROM pg_proc WHERE proname='bridge_weighbridge_to_intake')
  UNION ALL

  -- ─── Sprint 1.5: b2b_partners view sync ───
  SELECT 'sprint1_05_view', 'view public.b2b_partners exists',
    EXISTS(SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='b2b_partners')
  UNION ALL

  -- ─── Sprint 1.6: weighbridge RLS anon ───
  SELECT 'sprint1_06_rls_anon', 'weighbridge_tickets has anon SELECT policy',
    EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='weighbridge_tickets' AND 'anon' = ANY(roles))
  UNION ALL

  -- ─── Sprint 1.7: drc_lookup ───
  SELECT 'sprint1_07_drc', 'drc_lookup table',
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='drc_lookup')
  UNION ALL
  SELECT 'sprint1_07_drc', 'drc_lookup has >=55 rows',
    (SELECT COUNT(*) >= 55 FROM public.drc_lookup)
  UNION ALL
  SELECT 'sprint1_07_drc', 'lookup_drc(NUMERIC) RPC',
    EXISTS(SELECT 1 FROM pg_proc WHERE proname='lookup_drc')
)
SELECT
  migration,
  what,
  CASE WHEN ok THEN '✓ OK' ELSE '✗ FAIL — cần chạy migration' END AS status
FROM checks
ORDER BY migration, what;

-- ============================================================================
-- BONUS: quick functional test — lookup_drc + bridge
-- ============================================================================
-- Test lookup_drc nếu sprint1_07 OK
DO $$
DECLARE v NUMERIC;
BEGIN
  IF EXISTS(SELECT 1 FROM pg_proc WHERE proname='lookup_drc') THEN
    SELECT public.lookup_drc(230) INTO v;
    RAISE NOTICE 'lookup_drc(230) = %  (expected 42.4)', v;
    SELECT public.lookup_drc(225.5) INTO v;
    RAISE NOTICE 'lookup_drc(225.5) = %  (expected ~41.5)', v;
  ELSE
    RAISE NOTICE 'SKIP lookup_drc test — function chưa tồn tại';
  END IF;
END $$;

-- ============================================================================
-- CHECK 2 ô lệch trong drc_lookup (260, 261)
-- ============================================================================
SELECT metrolac_reading, drc_pct, notes
FROM public.drc_lookup
WHERE metrolac_reading IN (259, 260, 261, 262)
ORDER BY metrolac_reading;
-- Expected: 259→47.7, 260→48.9 (LỆCH), 261→52.2 (LỆCH), 262→48.3
-- Nếu vẫn lệch → user xác nhận với QC Tân Lâm rồi UPDATE qua UI hoặc SQL.
