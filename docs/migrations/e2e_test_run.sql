-- ============================================================================
-- E2E TEST RUN v2 — Quy trình Nhập mủ → ERP (9 phase pure SQL)
-- Date: 2026-05-27 (intake_date 2026-06-01 để test bonus mủ nước T6+ active)
-- Plan: docs/E2E_TEST_PLAN_NHAP_MU.md
-- ============================================================================
--
-- Sau khi v1 fail vì schema mismatch, đã rà lại với schema THẬT:
--   - b2b_bonus_rules: threshold_min_tons, threshold_max_tons, bonus_per_ton_vnd,
--                      tier_label, bonus_unit (wet/dry)
--   - b2b_monthly_bonuses (PLURAL): total_volume_kg, volume_tons, total_bonus_vnd
--   - b2b_settlements: code (không phải settlement_no), intake_ids UUID[], type
--                      'purchase', weighed_kg + finished_kg + drc_percent +
--                      approved_price + gross_amount
--   - b2b_partner_ledger: entry_type 'purchase'/'payment'/..., running_balance
--
-- Test marker (cleanup-friendly):
--   - vehicle_plate = 'TEST-E2E-99999'
--   - code: 'WB-TEST-E2E-...', 'QT-TEST-E2E-...'
--   - notes chứa 'E2E TEST 2026-05-27'
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 0: PICK PARTNER + BASELINE SNAPSHOT
-- ════════════════════════════════════════════════════════════════════════════

-- 0.1 — Pick 1 partner test (auto, ưu tiên tier cao + ít giao dịch gần đây)
SELECT
  p.id, p.code, p.name, p.tier, p.is_payment_proxy,
  p.payment_proxy_partner_id,
  proxy.name AS proxy_name,
  (SELECT COUNT(*) FROM public.rubber_intake_batches
   WHERE b2b_partner_id = p.id AND intake_date >= CURRENT_DATE - 7) AS recent_intakes_7d
FROM public.b2b_partners p
LEFT JOIN public.b2b_partners proxy ON proxy.id = p.payment_proxy_partner_id
WHERE p.status = 'verified'
  AND p.partner_type IN ('dealer','both')
  AND p.tier IN ('silver', 'gold', 'diamond')
ORDER BY recent_intakes_7d ASC, p.tier DESC
LIMIT 5;

-- → Ghi lại `id` của row đầu tiên: <<<PARTNER_ID>>>


-- 0.2 — Verify bonus rule active cho mủ nước tại 2026-06-01
SELECT
  rubber_type, tier_label, threshold_min_tons, threshold_max_tons,
  bonus_per_ton_vnd, bonus_unit, effective_from, sort_order, notes
FROM public.b2b_bonus_rules
WHERE rubber_type = 'nuoc'
  AND effective_from <= '2026-06-01'
  AND (effective_to IS NULL OR effective_to >= '2026-06-01')
ORDER BY effective_from DESC, sort_order ASC;

-- Expected: 4 row (Đồng/Bạc/Vàng/Kim Cương) với:
--   bonus_unit='dry', effective_from='2026-06-01',
--   threshold_min_tons: 20/40/50/60, bonus_per_ton_vnd: 100k/200k/300k/400k
-- Nếu rỗng → migration b2b_bonus_system.sql chưa seed → báo lại


-- 0.3 — Baseline snapshot
-- ⚠️ THAY <<<PARTNER_ID>>> bằng UUID partner đã pick ở 0.1
SELECT
  (SELECT COUNT(*) FROM public.rubber_intake_batches WHERE b2b_partner_id = '<<<PARTNER_ID>>>') AS intakes_before,
  (SELECT COUNT(*) FROM public.weighbridge_tickets WHERE partner_id = '<<<PARTNER_ID>>>') AS tickets_before,
  (SELECT COUNT(*) FROM public.b2b_monthly_bonuses WHERE partner_id = '<<<PARTNER_ID>>>'
   AND year = 2026 AND month = 6) AS bonus_rows_jun_before,
  (SELECT COALESCE(SUM(total_volume_kg), 0) FROM public.b2b_monthly_bonuses
   WHERE partner_id = '<<<PARTNER_ID>>>' AND year = 2026 AND month = 6
   AND rubber_type = 'nuoc') AS bonus_volume_kg_jun_before,
  (SELECT COALESCE(SUM(total_bonus_vnd), 0) FROM public.b2b_monthly_bonuses
   WHERE partner_id = '<<<PARTNER_ID>>>' AND year = 2026 AND month = 6
   AND rubber_type = 'nuoc') AS bonus_amount_jun_before;

-- Ghi 5 con số vào checklist để compare sau Phase 5.


-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 1: CREATE WEIGHBRIDGE TICKET (GROSS — cân lần 1)
-- ════════════════════════════════════════════════════════════════════════════

-- ⚠️ THAY <<<PARTNER_ID>>>
INSERT INTO public.weighbridge_tickets (
  code, vehicle_plate, driver_name, ticket_type, rubber_type,
  partner_id, facility_id,
  gross_weight, gross_weighed_at,
  status, notes, created_at
) VALUES (
  'WB-TEST-E2E-' || to_char(now(), 'YYYYMMDD-HH24MISS'),
  'TEST-E2E-99999',
  'Lái xe E2E Test',
  'in',
  'mu_nuoc',
  '<<<PARTNER_ID>>>',
  (SELECT id FROM public.facilities WHERE code = 'TL'),
  6500,                                       -- 6.5 tấn gross
  '2026-06-01 08:00:00+07'::timestamptz,
  'weighing_tare',
  'E2E TEST 2026-05-27 — Phase 1 gross',
  '2026-06-01 08:00:00+07'::timestamptz
)
RETURNING id, code, status, gross_weight, partner_id, facility_id, rubber_type;

-- → Ghi lại `id` ticket: <<<TICKET_ID>>>


-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 2: COMPLETE TICKET (Tare + ĐỐT + DRC từ lookup + LLM)
-- ════════════════════════════════════════════════════════════════════════════

-- 2.1 — Verify lookup_drc(230) = 42.4
SELECT public.lookup_drc(230) AS drc_at_230;


-- 2.2 — Complete ticket
-- ⚠️ THAY <<<TICKET_ID>>>
UPDATE public.weighbridge_tickets SET
  tare_weight = 2300,
  tare_weighed_at = '2026-06-01 08:35:00+07'::timestamptz,
  net_weight = 4200,                          -- 6500 - 2300
  field_dot_reading = 230,
  qc_actual_drc = public.lookup_drc(230),     -- 42.40
  consolidation_code = 'TMMN-TEST-E2E-0106',
  status = 'completed',
  completed_at = '2026-06-01 08:35:00+07'::timestamptz,
  notes = COALESCE(notes, '') || ' | Phase 2 completed',
  updated_at = now()
WHERE id = '<<<TICKET_ID>>>'
RETURNING id, status, net_weight, field_dot_reading, qc_actual_drc, consolidation_code, completed_at;


-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 3: VERIFY BRIDGE → rubber_intake_batch
-- ════════════════════════════════════════════════════════════════════════════
-- Expected: trigger trg_weighbridge_ticket_bridge tự chạy khi status='completed'.

-- 3.1 — Check intake_batch đã tự tạo
-- ⚠️ THAY <<<TICKET_ID>>>
SELECT
  rib.id, rib.lot_code, rib.pnk_number,
  rib.raw_rubber_type, rib.rubber_type,
  rib.net_weight_kg, rib.drc_percent, rib.dry_weight_kg,
  rib.field_dot_reading, rib.consolidation_code,
  rib.b2b_partner_id, rib.weighbridge_ticket_id,
  rib.status, rib.intake_date,
  f.code AS facility_code,
  rib.product_code, rib.vehicle_plate
FROM public.rubber_intake_batches rib
LEFT JOIN public.facilities f ON f.id = rib.facility_id
WHERE rib.weighbridge_ticket_id = '<<<TICKET_ID>>>';

-- Expected (1 row):
--   raw_rubber_type='mu_nuoc', rubber_type='nuoc' (derived)
--   net_weight_kg=4200, drc_percent=42.40, dry_weight_kg=1780.80
--   intake_date='2026-06-01', facility_code='TL', pnk_number IS NOT NULL
--   status='confirmed'

-- → Ghi lại `id` intake_batch: <<<INTAKE_ID>>>


-- 3.2 — Set unit_price 15.000đ/kg khô cho intake (cần cho Phase 6 settlement)
-- ⚠️ THAY <<<INTAKE_ID>>>
UPDATE public.rubber_intake_batches SET
  unit_price = 15000,
  notes = COALESCE(notes, '') || ' | E2E TEST 2026-05-27 Phase 3',
  updated_at = now()
WHERE id = '<<<INTAKE_ID>>>'
RETURNING id, unit_price, dry_weight_kg, dry_weight_kg * 15000 AS expected_gross;


-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 4: VERIFY PNK NUMBER SEQUENTIAL
-- ════════════════════════════════════════════════════════════════════════════

-- ⚠️ THAY <<<INTAKE_ID>>>
WITH stats AS (
  SELECT
    (SELECT pnk_number FROM public.rubber_intake_batches WHERE id = '<<<INTAKE_ID>>>') AS test_pnk,
    COALESCE(MAX(pnk_number), 0) AS max_pnk_other
  FROM public.rubber_intake_batches
  WHERE facility_id = (SELECT id FROM public.facilities WHERE code='TL')
    AND EXTRACT(YEAR FROM intake_date) = 2026
    AND id != '<<<INTAKE_ID>>>'
)
SELECT
  test_pnk, max_pnk_other,
  CASE
    WHEN test_pnk = max_pnk_other + 1 THEN '✓ PNK sequential OK'
    WHEN test_pnk IS NULL THEN '✗ PNK NULL — trigger trg_rib_auto_pnk_number không chạy'
    ELSE '⚠ PNK non-sequential — kiểm tra (có thể có gap do delete)'
  END AS check_result
FROM stats;


-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 5: VERIFY BONUS AUTO-RECOMPUTE
-- ════════════════════════════════════════════════════════════════════════════
-- Expected: trigger trg_intake_batch_recompute_bonus đã chạy sau INSERT intake_batch.

-- ⚠️ THAY <<<PARTNER_ID>>>
SELECT
  partner_id, year, month, rubber_type,
  total_volume_kg, volume_tons,
  matched_rule_id, tier_applied, bonus_per_ton,
  total_bonus_vnd,
  status, computed_at,
  array_length(batch_ids, 1) AS batch_count
FROM public.b2b_monthly_bonuses
WHERE partner_id = '<<<PARTNER_ID>>>'
  AND year = 2026 AND month = 6
  AND rubber_type = 'nuoc';

-- Expected (1 row nếu trigger chạy đúng):
--   total_volume_kg = baseline_dry_jun_before + 1780.80
--   volume_tons = total_volume_kg / 1000
--
-- BONUS TIER MATCHING (mủ nước T6/2026):
--   volume_tons > 60 → Kim Cương (bonus 400.000đ/T)
--   50 < volume_tons <= 60 → Vàng (300.000đ/T)
--   40 < volume_tons <= 50 → Bạc (200.000đ/T)
--   20 < volume_tons <= 40 → Đồng (100.000đ/T)
--   volume_tons <= 20 → NULL rule, total_bonus_vnd = 0
--
-- Nếu test chỉ có 1 phiếu (1.78 T), volume_tons < 20 → bonus = 0
--   → Đó là behavior ĐÚNG: vì threshold > 20T mới được bonus.
--   → Để verify công thức, cần test với volume vượt threshold (xem Phase 5.2).


-- 5.2 — (Tùy chọn) Force test bonus với volume > threshold để verify công thức
-- ⚠️ Chỉ chạy NẾU bác muốn xem bonus > 0
-- ⚠️ THAY <<<PARTNER_ID>>>
-- Insert thêm intake giả lập 20T khô để volume_tons vượt 20T threshold:
/*
INSERT INTO public.rubber_intake_batches (
  source_type, intake_date, b2b_partner_id, facility_id,
  raw_rubber_type, rubber_type, product_code,
  net_weight_kg, drc_percent,
  vehicle_plate, status, notes
)
SELECT
  'vietnam', '2026-06-01', '<<<PARTNER_ID>>>', (SELECT id FROM facilities WHERE code='TL'),
  'mu_nuoc', 'nuoc', 'MU_NUOC',
  50000, 40.0,  -- 50.000 kg net × 40% DRC = 20.000 kg khô = 20T
  'TEST-E2E-FORCE-' || g, 'confirmed',
  'E2E TEST 2026-05-27 — force bonus tier'
FROM generate_series(1, 1) g
RETURNING id, dry_weight_kg;

-- Sau đó query lại b2b_monthly_bonuses:
SELECT volume_tons, tier_applied, bonus_per_ton, total_bonus_vnd
FROM public.b2b_monthly_bonuses
WHERE partner_id = '<<<PARTNER_ID>>>' AND year=2026 AND month=6 AND rubber_type='nuoc';
*/


-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 6: TẠO SETTLEMENT (QUYẾT TOÁN)
-- ════════════════════════════════════════════════════════════════════════════

-- ⚠️ THAY <<<PARTNER_ID>>>, <<<INTAKE_ID>>>
INSERT INTO public.b2b_settlements (
  code,
  partner_id,
  settlement_type,
  intake_ids,
  weighed_kg, finished_kg, drc_percent,
  approved_price, gross_amount,
  vehicle_plates,
  weigh_date_start, weigh_date_end,
  status, notes,
  created_by, created_at
) VALUES (
  'QT-TEST-E2E-' || to_char(now(), 'YYYYMMDD-HH24MISS'),
  '<<<PARTNER_ID>>>',
  'purchase',
  ARRAY['<<<INTAKE_ID>>>']::uuid[],
  4200,                                       -- weighed (net tươi)
  1780.80,                                    -- finished (KL khô)
  42.40,
  15000,                                      -- đ/kg khô
  1780.80 * 15000,                            -- 26.712.000
  ARRAY['TEST-E2E-99999'],
  '2026-06-01', '2026-06-01',
  'draft',
  'E2E TEST 2026-05-27 — Quyết toán test',
  (SELECT id FROM public.employees WHERE email LIKE '%huyanhrubber.com' LIMIT 1),
  now()
)
RETURNING id, code, status, gross_amount;

-- → Ghi lại `id` settlement: <<<SETTLEMENT_ID>>>


-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 7: APPROVE + PAID
-- ════════════════════════════════════════════════════════════════════════════

-- 7.1 — Approve
-- ⚠️ THAY <<<SETTLEMENT_ID>>>
UPDATE public.b2b_settlements SET
  status = 'approved',
  approved_at = now(),
  approved_by = (SELECT id FROM public.employees WHERE email LIKE '%huyanhrubber.com' LIMIT 1),
  approval_notes = 'E2E test — approved',
  updated_at = now()
WHERE id = '<<<SETTLEMENT_ID>>>'
RETURNING id, status, approved_at;


-- 7.2 — Insert payment record
-- ⚠️ THAY <<<SETTLEMENT_ID>>>
INSERT INTO public.b2b_settlement_payments (
  settlement_id,
  payment_date, amount, payment_method,
  bank_account, bank_name, recipient_name,
  notes, created_by, created_at
) VALUES (
  '<<<SETTLEMENT_ID>>>',
  '2026-06-15', 26712000, 'bank_transfer',
  'TEST-9999', 'TEST Bank', 'E2E Test Recipient',
  'E2E test payment',
  (SELECT id FROM public.employees WHERE email LIKE '%huyanhrubber.com' LIMIT 1),
  now()
)
RETURNING id, amount, payment_date;


-- 7.3 — Mark settlement paid (set paid_amount + status)
-- ⚠️ THAY <<<SETTLEMENT_ID>>>
UPDATE public.b2b_settlements SET
  paid_amount = 26712000,
  paid_at = now(),
  paid_by = (SELECT id FROM public.employees WHERE email LIKE '%huyanhrubber.com' LIMIT 1),
  payment_method = 'bank_transfer',
  bank_reference = 'TXN-E2E-TEST',
  status = 'paid',
  updated_at = now()
WHERE id = '<<<SETTLEMENT_ID>>>'
RETURNING id, status, paid_amount, paid_at;


-- 7.4 — Verify total
-- ⚠️ THAY <<<SETTLEMENT_ID>>>
SELECT
  s.id, s.code, s.status,
  s.gross_amount, s.paid_amount, s.remaining_amount,
  (SELECT COALESCE(SUM(amount), 0) FROM public.b2b_settlement_payments WHERE settlement_id = s.id) AS total_paid_records,
  CASE
    WHEN s.status = 'paid' AND s.paid_amount = s.gross_amount
    THEN '✓ Settlement paid full'
    ELSE '✗ Mismatch — kiểm tra'
  END AS check_result
FROM public.b2b_settlements s
WHERE id = '<<<SETTLEMENT_ID>>>';


-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 8: VERIFY LEDGER (b2b_partner_ledger)
-- ════════════════════════════════════════════════════════════════════════════

-- 8.1 — Check schema
SELECT EXISTS(
  SELECT 1 FROM information_schema.tables
  WHERE table_schema='public' AND table_name='b2b_partner_ledger'
) AS ledger_table_exists;


-- 8.2 — Query entries cho partner test (mủ nước T6)
-- ⚠️ THAY <<<PARTNER_ID>>>, <<<SETTLEMENT_ID>>>
SELECT
  entry_date, entry_type, debit, credit, running_balance,
  settlement_id, payment_id, reference_code, description,
  period_year, period_month
FROM public.b2b_partner_ledger
WHERE partner_id = '<<<PARTNER_ID>>>'
  AND (
    settlement_id = '<<<SETTLEMENT_ID>>>'
    OR description LIKE '%E2E TEST%'
    OR (period_year = 2026 AND period_month = 6 AND entry_date >= '2026-06-01')
  )
ORDER BY entry_date, created_at;

-- Expected (nếu có trigger ledger auto-create):
--   1 entry entry_type='purchase' debit=26712000 (nợ — đại lý còn nợ tiền hàng)
--   1 entry entry_type='payment' credit=26712000 (có — đã trả)
--   running_balance về cân bằng
-- Nếu KHÔNG có entry → ledger logic ở TypeScript service, không qua DB trigger.
--   → Ghi note để biết, không phải bug nghiệp vụ test này.


-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 9 (OPTIONAL): PROXY PARTNER CHECK
-- ════════════════════════════════════════════════════════════════════════════
-- Chỉ chạy nếu partner test ở Phase 0 có `payment_proxy_partner_id IS NOT NULL`.

-- ⚠️ THAY <<<SETTLEMENT_ID>>>
SELECT
  s.id AS settlement_id, s.code,
  s.partner_id AS pay_for_partner,
  p.code AS partner_code, p.name AS partner_name,
  p.payment_proxy_partner_id AS pay_to_proxy_id,
  proxy.code AS proxy_code, proxy.name AS proxy_name,
  proxy.is_payment_proxy AS proxy_flag,
  CASE
    WHEN p.payment_proxy_partner_id IS NULL THEN '⚪ Partner không có proxy — skip phase 9'
    WHEN proxy.is_payment_proxy = true THEN '✓ Proxy partner đúng (is_payment_proxy=true)'
    ELSE '⚠ Proxy partner KHÔNG có flag is_payment_proxy — kiểm tra'
  END AS check_result
FROM public.b2b_settlements s
JOIN public.b2b_partners p ON p.id = s.partner_id
LEFT JOIN public.b2b_partners proxy ON proxy.id = p.payment_proxy_partner_id
WHERE s.id = '<<<SETTLEMENT_ID>>>';


-- ════════════════════════════════════════════════════════════════════════════
-- POST-TEST: SO SÁNH BASELINE
-- ════════════════════════════════════════════════════════════════════════════

-- ⚠️ THAY <<<PARTNER_ID>>>
SELECT
  (SELECT COUNT(*) FROM public.rubber_intake_batches WHERE b2b_partner_id = '<<<PARTNER_ID>>>') AS intakes_after,
  (SELECT COUNT(*) FROM public.weighbridge_tickets WHERE partner_id = '<<<PARTNER_ID>>>') AS tickets_after,
  (SELECT COUNT(*) FROM public.b2b_monthly_bonuses WHERE partner_id = '<<<PARTNER_ID>>>'
   AND year = 2026 AND month = 6) AS bonus_rows_jun_after,
  (SELECT COALESCE(SUM(total_volume_kg), 0) FROM public.b2b_monthly_bonuses
   WHERE partner_id = '<<<PARTNER_ID>>>' AND year = 2026 AND month = 6
   AND rubber_type = 'nuoc') AS bonus_volume_kg_jun_after,
  (SELECT COALESCE(SUM(total_bonus_vnd), 0) FROM public.b2b_monthly_bonuses
   WHERE partner_id = '<<<PARTNER_ID>>>' AND year = 2026 AND month = 6
   AND rubber_type = 'nuoc') AS bonus_amount_jun_after;

-- Compare với baseline_before ở Phase 0.3:
--   intakes_after = intakes_before + 1 (Phase 3 tạo intake)
--   tickets_after = tickets_before + 1 (Phase 1)
--   bonus_volume_kg_jun_after - bonus_volume_kg_jun_before = 1780.80
--   bonus_amount_jun_after có thể = before (nếu volume_tons vẫn < 20T threshold)
--     hoặc nếu trước đó đã > 20T thì tăng theo công thức


-- ════════════════════════════════════════════════════════════════════════════
-- CLEANUP — Option A (rollback) — chỉ chạy NẾU phase fail muốn rerun
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ KHÔNG chạy theo plan A (giữ data + mark E2E TEST).
--
-- ⚠️ THAY <<<SETTLEMENT_ID>>>, <<<INTAKE_ID>>>, <<<TICKET_ID>>>
--
-- DELETE FROM public.b2b_settlement_payments WHERE settlement_id = '<<<SETTLEMENT_ID>>>';
-- DELETE FROM public.b2b_settlements WHERE id = '<<<SETTLEMENT_ID>>>';
-- DELETE FROM public.rubber_intake_batches WHERE id = '<<<INTAKE_ID>>>';
-- DELETE FROM public.weighbridge_tickets WHERE id = '<<<TICKET_ID>>>';
-- (bonus rows tự recompute khi delete intake)


-- ════════════════════════════════════════════════════════════════════════════
-- CLEANUP forced bonus rows (Phase 5.2) nếu đã chạy
-- ════════════════════════════════════════════════════════════════════════════
-- DELETE FROM public.rubber_intake_batches
-- WHERE vehicle_plate LIKE 'TEST-E2E-FORCE-%'
--   AND notes LIKE '%E2E TEST 2026-05-27 — force bonus tier%';
