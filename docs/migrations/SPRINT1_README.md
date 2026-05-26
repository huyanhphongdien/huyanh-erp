# Sprint 1 — Schema cleanup cho nghiệp vụ Tân Lâm

**Date**: 2026-05-26
**Goal**: chuẩn bị schema cho UI Sprint 2 (form cân ĐỐT+DRC) và Sprint 3 (ERP lý lịch mủ).

## Thứ tự chạy migration

Phải chạy đúng thứ tự, từng file 1, kiểm tra NOTICE/VERIFY pass trước khi sang file kế tiếp.

```
1. b2b_demo_flag_and_facility_backfill.sql          (đã commit từ trước — chưa chạy)
2. b2b_intake_field_data_tanlam.sql                 (đã commit từ trước — chưa chạy)
3. sprint1_01_b2b_partners_proxy.sql                (mới)
4. sprint1_02_b2b_intake_pnk_number.sql             (mới)
5. sprint1_03_b2b_bonus_dry_weight_support.sql      (mới)
6. sprint1_04_b2b_weighbridge_drc_v2.sql            (mới — phải sau 1.2 vì cần dry_weight_kg)
7. sprint1_05_b2b_partners_view_sync.sql            (mới — chạy LAST sau khi mọi ADD COLUMN xong)
```

## Tóm tắt mỗi migration

### 1. `b2b_demo_flag_and_facility_backfill.sql` — Demo flag + facility PD
- ADD `b2b.partners.is_demo`
- Mark 12 DEMO partners (DEMO-XXXX)
- Backfill `rubber_intake_batches.facility_id = PD` cho 75 row seed Excel

### 2. `b2b_intake_field_data_tanlam.sql` — Schema mở rộng intake
- ADD `rubber_intake_batches`: field_dot_reading, planned_drc_percent, dry_weight_kg (GENERATED), consolidation_code
- ADD `b2b.partners`: payment_proxy_partner_id, contact_alias_name (KHÔNG dùng - sẽ dùng sprint1_01 version)
- VIEW `v_intake_consolidation`

⚠️ **Note**: migration này có overlap với sprint1_01. sprint1_01 sẽ ADD COLUMN IF NOT EXISTS nên idempotent.

### 3. `sprint1_01_b2b_partners_proxy.sql` — Proxy + alias + flag
- ADD `b2b.partners.payment_proxy_partner_id` (FK self-ref, CHECK no-self)
- ADD `b2b.partners.contact_alias_name`
- ADD `b2b.partners.is_payment_proxy boolean DEFAULT false`
- Trigger auto-mark `is_payment_proxy=true` khi có partner khác link tới

### 4. `sprint1_02_b2b_intake_pnk_number.sql` — Số phiếu sequential
- ADD `rubber_intake_batches.pnk_number int`
- UNIQUE (facility_id, năm intake_date, pnk_number)
- Function `next_pnk_number(facility_id, year)` với advisory_xact_lock
- Trigger BEFORE INSERT auto-assign pnk_number khi status='confirmed'

### 5. `sprint1_03_b2b_bonus_dry_weight_support.sql` — Bonus tính KL khô
- ADD `b2b_bonus_rules.bonus_unit text DEFAULT 'wet' CHECK IN ('wet','dry')`
- SET bonus_unit='dry' cho rules mủ nước, 'wet' cho mủ tạp
- Update `compute_monthly_bonus()` function: check `bonus_unit` của rule → SUM `dry_weight_kg` hoặc `net_weight_kg` tương ứng

### 6. `sprint1_04_b2b_weighbridge_drc_v2.sql` — Cân nhập ĐỐT + DRC
- ADD `weighbridge_tickets.field_dot_reading` (CHECK 100-350)
- ADD `weighbridge_tickets.consolidation_code`
- Update comment `qc_actual_drc` = "DRC đo tại cân"
- Bridge function v2: copy field_dot_reading + qc_actual_drc → intake.drc_percent + consolidation_code

### 7. `sprint1_05_b2b_partners_view_sync.sql` — Refresh view
- Pre-check: liệt kê dependencies của public.b2b_partners
- DROP VIEW b2b_partners CASCADE
- CREATE VIEW b2b_partners AS SELECT * FROM b2b.partners (auto sync columns)
- Re-create dependent views (b2b_partner_users)
- GRANT permissions

## Cách verify sau khi chạy hết

```sql
-- Check tất cả cột mới đã có trên view b2b_partners
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='b2b_partners'
  AND column_name IN ('is_demo', 'bp_id', 'payment_proxy_partner_id', 'contact_alias_name', 'is_payment_proxy');
-- Mong đợi 5 dòng

-- Check rubber_intake_batches có đủ cột TL
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='rubber_intake_batches'
  AND column_name IN ('field_dot_reading', 'planned_drc_percent', 'dry_weight_kg', 'consolidation_code', 'pnk_number');
-- Mong đợi 5 dòng

-- Check weighbridge_tickets có cột mới
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='weighbridge_tickets'
  AND column_name IN ('field_dot_reading', 'consolidation_code');
-- Mong đợi 2 dòng

-- Check bonus_rules có bonus_unit + đã set per type
SELECT rubber_type, bonus_unit, count(*) FROM public.b2b_bonus_rules GROUP BY 1, 2;
-- Mong đợi: nuoc/dry, tap/wet

-- Test bridge function v2 idempotent
SELECT public.bridge_weighbridge_to_intake('<uuid-ticket-existing>');
-- Mong đợi: trả về uuid intake đã tồn tại (không insert duplicate)
```

## Smoke test bonus với KL khô (sau khi chạy hết)

```sql
-- Tạo 1 phiếu test mủ nước cho 1 DEMO partner với DRC + dry_weight tự tính
INSERT INTO public.rubber_intake_batches (
  source_type, intake_date, b2b_partner_id, rubber_type, raw_rubber_type,
  net_weight_kg, drc_percent, status, product_code, notes
) VALUES (
  'vietnam', '2026-07-15',
  (SELECT id FROM b2b.partners WHERE is_demo=true AND name LIKE '%LAK1%' LIMIT 1),
  'nuoc', 'mu_nuoc',
  75000, 40.0, 'confirmed', 'MU_NUOC_TEST',
  'Smoke test KL khô bonus'
);
-- dry_weight_kg tự tính = 75000 × 40 / 100 = 30000 (30T khô)

-- Compute bonus
SELECT public.compute_monthly_bonus(
  (SELECT id FROM b2b.partners WHERE is_demo=true AND name LIKE '%LAK1%' LIMIT 1),
  2026, 7, 'nuoc'
);
-- Mong đợi (theo quy chế nuoc + bonus_unit=dry):
--   volume_tons = 30 → tier 'Đồng' (>20T, ≤40T) → 100,000đ/T × 30 = 3,000,000đ
```

## Risks + Rollback

Mỗi migration có section ROLLBACK ở cuối (comment out). Chạy nếu cần revert.

⚠️ **High risk migration**: `sprint1_05_b2b_partners_view_sync.sql` (CASCADE DROP).
- User confirm decision D7: dev mode, OK CASCADE
- Pre-check log dependencies trước
- Recreate `b2b_partner_users` view tự động trong migration

## Files generated this sprint

```
docs/migrations/
  sprint1_01_b2b_partners_proxy.sql                (mới)
  sprint1_02_b2b_intake_pnk_number.sql             (mới)
  sprint1_03_b2b_bonus_dry_weight_support.sql      (mới)
  sprint1_04_b2b_weighbridge_drc_v2.sql            (mới)
  sprint1_05_b2b_partners_view_sync.sql            (mới)
  SPRINT1_README.md                                 (file này)
```

## Next: Sprint 2

Sau khi user chạy 7 migrations + verify pass → bắt đầu Sprint 2:
- Update [apps/weighbridge/src/pages/WeighingPage.tsx](../../apps/weighbridge/src/pages/WeighingPage.tsx): thêm card "Đo DRC" với input ĐỐT + DRC%
- Update [src/services/wms/weighbridgeService.ts](../../src/services/wms/weighbridgeService.ts): accept field_dot_reading + qc_actual_drc khi complete
- Smoke test: tạo 1 ticket TL → cân gross → input ĐỐT/DRC → tare → completed → verify intake created
