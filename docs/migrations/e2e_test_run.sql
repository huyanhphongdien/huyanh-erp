-- ============================================================================
-- E2E TEST RUN — Quy trình Nhập mủ → ERP (9 phase pure SQL)
-- Date: 2026-05-27 (intake_date set 2026-06-01 để test bonus active)
-- Plan: docs/E2E_TEST_PLAN_NHAP_MU.md
-- ============================================================================
--
-- CÁCH CHẠY:
--   1. Mở Supabase SQL Editor
--   2. Chạy TỪNG phase một (block giữa ─── ... ───)
--   3. Đọc kết quả + verify expected
--   4. Nếu phase nào FAIL → STOP, debug, không chạy phase sau
--
-- Test marker (để self-reference + cleanup dễ):
--   - vehicle_plate = 'TEST-E2E-99999'
--   - code phiếu cân: 'WB-TEST-E2E-...'
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
-- → Note `proxy_name` (nếu null → skip phase 9)


-- 0.2 — Verify bonus rule active cho mủ nước tại 2026-06-01
SELECT
  rubber_type, threshold_kg, bonus_per_kg, bonus_unit, effective_from, notes
FROM public.b2b_bonus_rules
WHERE rubber_type = 'nuoc'
  AND effective_from <= '2026-06-01'
ORDER BY effective_from DESC, threshold_kg ASC;

-- Expected: ít nhất 1 row có effective_from <= 2026-06-01 (T6/2026+)
-- Nếu rỗng → bonus sẽ = 0, plan A không hoạt động → báo lại tôi


-- 0.3 — Baseline snapshot
-- ⚠️ THAY <<<PARTNER_ID>>> bằng UUID partner đã pick ở 0.1
SELECT
  (SELECT COUNT(*) FROM public.rubber_intake_batches WHERE b2b_partner_id = '<<<PARTNER_ID>>>') AS intakes_before,
  (SELECT COUNT(*) FROM public.weighbridge_tickets WHERE partner_id = '<<<PARTNER_ID>>>') AS tickets_before,
  (SELECT COUNT(*) FROM public.b2b_monthly_bonus WHERE partner_id = '<<<PARTNER_ID>>>'
   AND year = 2026 AND month = 6) AS bonus_rows_jun_before,
  (SELECT COALESCE(SUM(volume_kg), 0) FROM public.b2b_monthly_bonus
   WHERE partner_id = '<<<PARTNER_ID>>>' AND year = 2026 AND month = 6
   AND rubber_type = 'nuoc') AS bonus_volume_jun_before,
  (SELECT COALESCE(SUM(dry_weight_kg), 0) FROM public.b2b_monthly_bonus
   WHERE partner_id = '<<<PARTNER_ID>>>' AND year = 2026 AND month = 6
   AND rubber_type = 'nuoc') AS bonus_dry_jun_before;

-- Ghi 5 con số này ra notepad để compare sau Phase 5.


-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 1: CREATE WEIGHBRIDGE TICKET (GROSS — cân lần 1)
-- ════════════════════════════════════════════════════════════════════════════

-- ⚠️ THAY <<<PARTNER_ID>>> bằng UUID partner pick ở Phase 0
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
  6500,             -- 6.5 tấn gross (xe + mủ)
  '2026-06-01 08:00:00+07', -- INTAKE DATE = 2026-06-01 (test bonus mủ nước T6+)
  'weighing_tare',
  'E2E TEST 2026-05-27 — Phase 1 gross',
  '2026-06-01 08:00:00+07'
)
RETURNING id, code, status, gross_weight, partner_id, facility_id, rubber_type;

-- → Ghi lại `id` ticket: <<<TICKET_ID>>>


-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 2: COMPLETE TICKET (Tare + ĐỐT + DRC từ lookup + LLM)
-- ════════════════════════════════════════════════════════════════════════════

-- 2.1 — Verify lookup_drc(230) = 42.4 (bảng tra mới)
SELECT public.lookup_drc(230) AS drc_from_lookup_at_230;
-- Expected: 42.40


-- 2.2 — Complete ticket
-- ⚠️ THAY <<<TICKET_ID>>>
UPDATE public.weighbridge_tickets SET
  tare_weight = 2300,
  tare_weighed_at = '2026-06-01 08:35:00+07',  -- sau 35 phút (lấy mẫu + đốt)
  net_weight = 6500 - 2300,                     -- 4200 kg
  field_dot_reading = 230,
  qc_actual_drc = public.lookup_drc(230),       -- 42.4
  consolidation_code = 'TMMN-TEST-E2E-0106',
  status = 'completed',
  completed_at = '2026-06-01 08:35:00+07',
  notes = COALESCE(notes, '') || ' | Phase 2 completed',
  updated_at = now()
WHERE id = '<<<TICKET_ID>>>'
RETURNING id, status, net_weight, field_dot_reading, qc_actual_drc, consolidation_code, completed_at;

-- Expected:
--   status = 'completed'
--   net_weight = 4200
--   field_dot_reading = 230
--   qc_actual_drc = 42.40  ← từ bảng drc_lookup (KHÔNG dùng × 0.2 − 3.4)


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
--   raw_rubber_type = 'mu_nuoc'
--   rubber_type = 'nuoc'        ← auto derived by trigger
--   net_weight_kg = 4200
--   drc_percent = 42.40
--   dry_weight_kg = 1780.80     ← computed = 4200 × 42.4 / 100
--   field_dot_reading = 230
--   consolidation_code = 'TMMN-TEST-E2E-0106'
--   status = 'confirmed'
--   intake_date = '2026-06-01'
--   facility_code = 'TL'
--   pnk_number IS NOT NULL

-- → Ghi lại `id` intake_batch: <<<INTAKE_ID>>>


-- 3.2 — Mark intake_batch with E2E test note (Option B cleanup-friendly)
-- ⚠️ THAY <<<INTAKE_ID>>>
UPDATE public.rubber_intake_batches SET
  notes = COALESCE(notes, '') || ' | E2E TEST 2026-05-27 Phase 3',
  unit_price = 15000,                                   -- 15.000đ/kg khô (test)
  updated_at = now()
WHERE id = '<<<INTAKE_ID>>>'
RETURNING id, notes, unit_price;


-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 4: VERIFY PNK NUMBER SEQUENTIAL
-- ════════════════════════════════════════════════════════════════════════════

-- 4.1 — Max pnk_number trước test (loại bỏ intake test)
-- ⚠️ THAY <<<INTAKE_ID>>>
SELECT
  MAX(pnk_number) AS max_pnk_other,
  (SELECT pnk_number FROM public.rubber_intake_batches WHERE id = '<<<INTAKE_ID>>>') AS test_pnk,
  CASE
    WHEN (SELECT pnk_number FROM public.rubber_intake_batches WHERE id = '<<<INTAKE_ID>>>')
         = COALESCE(MAX(pnk_number) FILTER (WHERE id != '<<<INTAKE_ID>>>'), 0) + 1
    THEN '✓ PNK sequential OK'
    ELSE '✗ PNK NOT sequential — kiểm tra trigger trg_rib_auto_pnk_number'
  END AS check_result
FROM public.rubber_intake_batches
WHERE facility_id = (SELECT id FROM public.facilities WHERE code='TL')
  AND EXTRACT(YEAR FROM intake_date) = 2026;


-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 5: VERIFY BONUS AUTO-RECOMPUTE
-- ════════════════════════════════════════════════════════════════════════════

-- ⚠️ THAY <<<PARTNER_ID>>>
SELECT
  partner_id, year, month, rubber_type, bonus_unit,
  volume_kg, dry_weight_kg, bonus_per_kg, total_bonus_vnd,
  status, computed_at
FROM public.b2b_monthly_bonus
WHERE partner_id = '<<<PARTNER_ID>>>'
  AND year = 2026 AND month = 6
  AND rubber_type = 'nuoc';

-- Expected (1 row hoặc nhiều row nếu có tier):
--   bonus_unit = 'dry' (per Decision D2)
--   dry_weight_kg >= 1780.80 (baseline + 1780.80 mới thêm)
--   volume_kg ≈ 4200 (hoặc baseline + 4200)
--   total_bonus_vnd > 0 (nếu vượt threshold tier)
--   computed_at sau 2026-06-01 08:35

-- So sánh với baseline_jun_before ở Phase 0.3:
--   bonus_volume_jun_after - bonus_volume_jun_before = 4200
--   bonus_dry_jun_after - bonus_dry_jun_before = 1780.80


-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 6: TẠO SETTLEMENT (QUYẾT TOÁN THÁNG 6/2026)
-- ════════════════════════════════════════════════════════════════════════════

-- 6.1 — Tạo settlement header
-- ⚠️ THAY <<<PARTNER_ID>>>
INSERT INTO public.b2b_settlements (
  settlement_no, settlement_type, partner_id, period_year, period_month,
  total_amount, status, notes, created_at
) VALUES (
  'QT-TEST-E2E-' || to_char(now(), 'YYYYMMDD-HH24MISS'),
  'monthly',
  '<<<PARTNER_ID>>>',
  2026, 6,
  0,
  'draft',
  'E2E TEST 2026-05-27 — Quyết toán test',
  now()
)
RETURNING id, settlement_no, status;

-- → Ghi lại `id` settlement: <<<SETTLEMENT_ID>>>


-- 6.2 — Add intake_batch vào settlement
-- ⚠️ THAY <<<SETTLEMENT_ID>>>, <<<INTAKE_ID>>>
INSERT INTO public.b2b_settlement_items (
  settlement_id, intake_batch_id,
  net_weight_kg, dry_weight_kg, drc_percent,
  unit_price, total_amount,
  created_at
)
SELECT
  '<<<SETTLEMENT_ID>>>',
  rib.id,
  rib.net_weight_kg, rib.dry_weight_kg, rib.drc_percent,
  15000,                                          -- 15.000đ/kg khô
  rib.dry_weight_kg * 15000,                      -- 1780.80 × 15.000 = 26.712.000
  now()
FROM public.rubber_intake_batches rib
WHERE rib.id = '<<<INTAKE_ID>>>'
RETURNING settlement_id, intake_batch_id, net_weight_kg, dry_weight_kg, unit_price, total_amount;

-- Expected: total_amount = 26,712,000


-- 6.3 — Update tổng tiền settlement
-- ⚠️ THAY <<<SETTLEMENT_ID>>>
UPDATE public.b2b_settlements SET
  total_amount = (
    SELECT COALESCE(SUM(total_amount), 0)
    FROM public.b2b_settlement_items
    WHERE settlement_id = '<<<SETTLEMENT_ID>>>'
  ),
  updated_at = now()
WHERE id = '<<<SETTLEMENT_ID>>>'
RETURNING id, total_amount;
-- Expected: total_amount = 26712000


-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 7: APPROVE + MARK PAID
-- ════════════════════════════════════════════════════════════════════════════

-- 7.1 — Approve
-- ⚠️ THAY <<<SETTLEMENT_ID>>>
UPDATE public.b2b_settlements SET
  status = 'approved',
  approved_at = now(),
  approved_by = (SELECT id FROM public.employees WHERE email LIKE '%huyanhrubber.com' LIMIT 1),
  updated_at = now()
WHERE id = '<<<SETTLEMENT_ID>>>'
RETURNING id, status, approved_at;


-- 7.2 — Tạo payment record
-- ⚠️ THAY <<<SETTLEMENT_ID>>>
INSERT INTO public.b2b_settlement_payments (
  settlement_id, payment_method, payment_amount, payment_date,
  bank_account, notes, created_at
) VALUES (
  '<<<SETTLEMENT_ID>>>',
  'bank_transfer',
  26712000,
  '2026-06-15',  -- chi 15/6 (sau khi quyết toán T6)
  'TEST-9999',
  'E2E TEST payment',
  now()
)
RETURNING id, payment_amount, payment_date;


-- 7.3 — Mark paid
-- ⚠️ THAY <<<SETTLEMENT_ID>>>
UPDATE public.b2b_settlements SET
  status = 'paid',
  paid_at = now(),
  updated_at = now()
WHERE id = '<<<SETTLEMENT_ID>>>'
RETURNING id, status, paid_at;


-- 7.4 — Verify total
-- ⚠️ THAY <<<SETTLEMENT_ID>>>
SELECT
  s.id, s.status, s.total_amount,
  (SELECT COALESCE(SUM(payment_amount), 0)
   FROM public.b2b_settlement_payments WHERE settlement_id = s.id) AS total_paid,
  CASE
    WHEN s.status = 'paid'
     AND s.total_amount = (SELECT SUM(payment_amount) FROM public.b2b_settlement_payments WHERE settlement_id = s.id)
    THEN '✓ Settlement paid full'
    ELSE '✗ Mismatch — kiểm tra'
  END AS check_result
FROM public.b2b_settlements s
WHERE id = '<<<SETTLEMENT_ID>>>';


-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 8: VERIFY LEDGER ENTRIES (nếu có)
-- ════════════════════════════════════════════════════════════════════════════

-- 8.1 — Check ledger schema
SELECT EXISTS(
  SELECT 1 FROM information_schema.tables
  WHERE table_schema='public' AND table_name='b2b_ledger_entries'
) AS ledger_table_exists;


-- 8.2 — Nếu ledger exists, query entries cho partner
-- ⚠️ THAY <<<PARTNER_ID>>>, <<<INTAKE_ID>>>, <<<SETTLEMENT_ID>>>
SELECT
  entry_date, entry_type, reference_type, reference_id,
  debit, credit, description, created_at
FROM public.b2b_ledger_entries
WHERE partner_id = '<<<PARTNER_ID>>>'
  AND (reference_id IN ('<<<INTAKE_ID>>>', '<<<SETTLEMENT_ID>>>')
       OR description LIKE '%E2E TEST%')
ORDER BY entry_date, created_at;

-- Expected (nếu có trigger ledger auto):
--   1 entry Nợ (debit) khi intake_batch tạo → +26.712.000
--   1 entry Có (credit) khi settlement paid → −26.712.000
--   Balance về 0
-- Nếu KHÔNG có entry → ledger logic ở UI/TypeScript (không qua DB trigger).
-- Note để biết, không phải lỗi nghiệp vụ.


-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 9 (OPTIONAL): PROXY PARTNER WORKFLOW
-- ════════════════════════════════════════════════════════════════════════════
-- Chỉ chạy nếu partner test có `payment_proxy_partner_id IS NOT NULL`.

-- ⚠️ THAY <<<SETTLEMENT_ID>>>
SELECT
  s.id AS settlement_id,
  s.partner_id AS settlement_for,
  p.code AS partner_code,
  p.name AS partner_name,
  p.payment_proxy_partner_id AS pay_to_partner_id,
  proxy.code AS pay_to_code,
  proxy.name AS pay_to_name,
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
-- POST-TEST: SO SÁNH BASELINE (Option B mark + keep)
-- ════════════════════════════════════════════════════════════════════════════

-- ⚠️ THAY <<<PARTNER_ID>>>
SELECT
  (SELECT COUNT(*) FROM public.rubber_intake_batches WHERE b2b_partner_id = '<<<PARTNER_ID>>>') AS intakes_after,
  (SELECT COUNT(*) FROM public.weighbridge_tickets WHERE partner_id = '<<<PARTNER_ID>>>') AS tickets_after,
  (SELECT COUNT(*) FROM public.b2b_monthly_bonus WHERE partner_id = '<<<PARTNER_ID>>>'
   AND year = 2026 AND month = 6) AS bonus_rows_jun_after,
  (SELECT COALESCE(SUM(volume_kg), 0) FROM public.b2b_monthly_bonus
   WHERE partner_id = '<<<PARTNER_ID>>>' AND year = 2026 AND month = 6
   AND rubber_type = 'nuoc') AS bonus_volume_jun_after,
  (SELECT COALESCE(SUM(dry_weight_kg), 0) FROM public.b2b_monthly_bonus
   WHERE partner_id = '<<<PARTNER_ID>>>' AND year = 2026 AND month = 6
   AND rubber_type = 'nuoc') AS bonus_dry_jun_after;

-- So với baseline_before ở Phase 0.3:
--   intakes_after = intakes_before + 1
--   tickets_after = tickets_before + 1
--   bonus_rows_jun_after >= bonus_rows_jun_before (có thể bằng nếu đã có row, +1 nếu chưa)
--   bonus_volume_jun_after - bonus_volume_jun_before = 4200 ✓
--   bonus_dry_jun_after - bonus_dry_jun_before = 1780.80 ✓


-- ════════════════════════════════════════════════════════════════════════════
-- CLEANUP — Option A (chỉ chạy NẾU muốn xoá hết)
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ KHÔNG chạy theo plan A (giữ + mark). Chỉ chạy nếu phase fail muốn rerun.
--
-- ⚠️ THAY <<<SETTLEMENT_ID>>>, <<<INTAKE_ID>>>, <<<TICKET_ID>>>
--
-- DELETE FROM public.b2b_settlement_payments WHERE settlement_id = '<<<SETTLEMENT_ID>>>';
-- DELETE FROM public.b2b_settlement_items WHERE settlement_id = '<<<SETTLEMENT_ID>>>';
-- DELETE FROM public.b2b_settlements WHERE id = '<<<SETTLEMENT_ID>>>';
-- DELETE FROM public.rubber_intake_batches WHERE id = '<<<INTAKE_ID>>>';
-- DELETE FROM public.weighbridge_tickets WHERE id = '<<<TICKET_ID>>>';
-- -- (bonus rows sẽ tự recompute khi delete intake → trigger)
