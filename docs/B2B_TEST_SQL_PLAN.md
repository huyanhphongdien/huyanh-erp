# B2B Test Plan — SQL (DB-side automated)

> Đối ứng với `docs/B2B_TEST_CHECKLIST.md` (UI side). Mỗi scenario có 3 phần:
> **PREP** → **ACTION** → **VERIFY**. Copy-paste vào Supabase SQL Editor lần lượt.
>
> **Quy ước:** thay `<ID>` bằng UUID thực tế. Test ID prefix `TEST-SQL-` để dễ cleanup.
> Run với role `service_role` (bypass RLS) qua Supabase Dashboard SQL Editor.

---

## 0. PRE-FLIGHT — verify schema + Sprint E + Intake v4 đã apply

```sql
-- 0.1 Sprint E + Intake v4 columns existence
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'b2b' AND table_name = 'deals'
  AND column_name IN (
    'purchase_type','buyer_user_id','qc_user_id','sample_drc',
    'finished_product_kg','production_mode','production_pool_id',
    'production_sla_days','production_started_at','production_reject_reason',
    'reject_loss_amount','final_value','actual_drc','actual_weight_kg'
  );
-- Expect: 14 rows

-- 0.2 Settlement columns Sprint E
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'b2b' AND table_name = 'settlements'
  AND column_name IN ('paid_at','paid_by','gross_amount','remaining_amount');
-- Expect: 4 rows (paid_at + paid_by phải có sau Sprint E)

-- 0.3 Daily price + multi-lot tables (Intake v4)
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'b2b' AND table_name = 'daily_price_list'
UNION ALL
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'weighbridge_ticket_items';
-- Expect: 2 rows

-- 0.4 Triggers v4 installed
SELECT tgname FROM pg_trigger
WHERE tgname IN (
  'trg_items_allocate_on_insert',
  'trg_ticket_allocate_on_weigh',
  'trg_drc_variance_dispute',
  'trg_on_advance_paid',
  'trg_on_settlement_paid'
);
-- Expect: 5 rows

-- 0.5 RLS publication có realtime cho 5 b2b tables (B8)
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'b2b'
  AND tablename IN ('advances','chat_messages','deals','drc_disputes','settlements');
-- Expect: 5 rows

-- 0.6 partner_ledger entry_type CHECK accept new values
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'b2b.partner_ledger'::regclass
  AND contype = 'c'
  AND conname LIKE '%entry_type%';
-- Expect: CHECK chứa 'settlement_receivable','advance_paid','payment_paid',
-- 'processing_fee','adjustment_debit','adjustment_credit'

-- 0.7 Available test data
SELECT
  (SELECT COUNT(*) FROM b2b.partners WHERE status='verified') AS partners_verified,
  (SELECT COUNT(*) FROM facilities WHERE is_active=true) AS facilities_active,
  (SELECT COUNT(*) FROM warehouses WHERE warehouse_type='raw_material') AS warehouse_nvl,
  (SELECT COUNT(*) FROM b2b.daily_price_list
     WHERE effective_to IS NULL OR effective_to > NOW()) AS active_prices;
-- Expect partners_verified ≥ 2, facilities ≥ 1, warehouse_nvl ≥ 1
```

---

## Scenario 1 — 📦 Standard flow (Chat→Deal→Settlement)

UI-heavy (chat + button click), SQL chỉ verify post-state.

```sql
-- PREP: lấy 1 deal standard mới nhất để verify
SELECT id, deal_number, status, purchase_type, partner_id, qc_status,
       actual_drc, actual_weight_kg, final_value, final_price
FROM b2b.deals
WHERE purchase_type = 'standard' OR purchase_type IS NULL
ORDER BY created_at DESC LIMIT 5;
-- ACTION: thực hiện Scenario 1 trên UI (xem checklist), record deal_number = ?
-- VERIFY (sau khi UI test xong): chạy block dưới, replace <DEAL_NUMBER>

WITH d AS (
  SELECT id, status, qc_status, actual_drc, actual_weight_kg,
         final_value, final_price, partner_id
  FROM b2b.deals WHERE deal_number = '<DEAL_NUMBER>'
)
SELECT
  d.status = 'settled' AS status_settled,
  d.qc_status = 'passed' AS qc_passed,
  d.actual_drc IS NOT NULL AS drc_filled,
  d.actual_weight_kg > 0 AS weight_filled,
  d.final_value > 0 AS final_value_computed,                -- Sprint E BUG-5
  (SELECT COUNT(*) FROM b2b.advances
     WHERE deal_id = d.id AND status = 'paid') > 0 AS has_advance,
  (SELECT COUNT(*) FROM b2b.settlements
     WHERE deal_id = d.id AND status = 'paid') > 0 AS settlement_paid,
  (SELECT paid_at FROM b2b.settlements
     WHERE deal_id = d.id ORDER BY created_at DESC LIMIT 1)
     IS NOT NULL AS paid_at_set,                            -- Sprint E BUG-4
  (SELECT running_balance FROM b2b.partner_ledger
     WHERE partner_id = d.partner_id ORDER BY entry_date DESC LIMIT 1)
     IS NOT NULL AS running_balance_set                     -- Sprint E BUG-3
FROM d;
-- Expect: tất cả TRUE
```

---

## Scenario 2 — 📋 Demand→Offer→Deal (Pull flow) — SIMULATE entirely via SQL

```sql
-- PREP: pick partner + warehouse
SELECT id AS partner_id FROM b2b.partners
WHERE status='verified' AND tier IN ('gold','silver') LIMIT 1;
-- → save as $partner_id

SELECT id AS warehouse_id FROM warehouses
WHERE warehouse_type='raw_material' LIMIT 1;
-- → save as $warehouse_id

-- ACTION 2.1 — Tạo demand
INSERT INTO b2b_demands (
  demand_number, product_type, quantity_kg, deadline,
  price_min, price_max, source_regions, status, created_at
) VALUES (
  'NCM-TEST-SQL-001', 'mu_tap', 4200000, NOW() + INTERVAL '30 days',
  14000, 27000, ARRAY['Bình Phước','Đồng Nai'], 'open', NOW()
) RETURNING id AS demand_id;
-- → save $demand_id

-- ACTION 2.2 — Partner gửi offer
INSERT INTO b2b_demand_offers (
  demand_id, partner_id, offered_price, offered_quantity_kg,
  offered_drc, source_region, status, created_at
) VALUES (
  $demand_id, $partner_id, 25000, 2000000, 32, 'Bình Phước', 'pending', NOW()
) RETURNING id AS offer_id;
-- → save $offer_id

-- ACTION 2.3 — Factory accept offer + auto-create deal
UPDATE b2b_demand_offers SET status='accepted', accepted_at=NOW()
WHERE id = $offer_id;

INSERT INTO b2b.deals (
  deal_number, partner_id, demand_id, offer_id,
  product_code, quantity_kg, unit_price, expected_drc, status,
  purchase_type, created_at
) VALUES (
  'DL-TEST-SQL-002', $partner_id, $demand_id, $offer_id,
  'mu_tap', 2000000, 25000, 32, 'pending',
  'standard', NOW()
) RETURNING id AS deal_id;

-- VERIFY
SELECT
  (SELECT status FROM b2b_demand_offers WHERE id = $offer_id) = 'accepted'
    AS offer_accepted,
  (SELECT filled_quantity_kg FROM b2b_demands WHERE id = $demand_id) >= 2000000
    AS demand_filled_synced,                  -- trigger sync_demand_filled
  (SELECT COUNT(*) FROM b2b.deals
     WHERE demand_id = $demand_id AND status = 'pending') = 1
    AS deal_created;

-- CLEANUP (optional)
-- DELETE FROM b2b.deals WHERE deal_number = 'DL-TEST-SQL-002';
-- DELETE FROM b2b_demand_offers WHERE id = $offer_id;
-- DELETE FROM b2b_demands WHERE demand_number = 'NCM-TEST-SQL-001';
```

---

## Scenario 3 — 🅰️ Outright Wizard — SIMULATE qua RPC

```sql
-- PREP: verify partner Lào exist + facility/warehouse
SELECT id, name, nationality FROM b2b.partners
WHERE nationality = 'LA' OR name ILIKE '%lào%' LIMIT 3;
-- → $partner_id

-- ACTION: gọi RPC executeOutrightIntake (cùng logic wizard)
-- HOẶC simulate trực tiếp INSERT (bypass guard nhờ purchase_type='outright')

INSERT INTO weighbridge_tickets (
  code, vehicle_plate, driver_name, gross_kg, tare_kg, net_kg,
  status, weighing_time, created_at, has_items, allocation_mode
) VALUES (
  'CAN-OUT-SQL-001', 'UN-123', 'Khampheng', 800, 0, 800,
  'completed', NOW(), NOW(), false, NULL
) RETURNING id AS ticket_id;

INSERT INTO b2b.deals (
  deal_number, partner_id, product_code, quantity_kg, unit_price,
  status, purchase_type, sample_drc, expected_drc,
  actual_weight_kg, actual_drc, final_value, final_price,
  created_at
) VALUES (
  'DL-OUT-SQL-001', $partner_id, 'mu_tap', 800, 12500,
  'settled', 'outright', 48, 48,
  800, 48, 800 * 0.48 * 12500, 12500,
  NOW()
) RETURNING id AS deal_id;

-- VERIFY
SELECT
  status = 'settled' AS settled_immediately,
  purchase_type = 'outright' AS flow_outright,
  qc_status IS DISTINCT FROM 'pending' OR qc_user_id IS NULL AS qc_bypassed,
  final_value = 800 * 0.48 * 12500 AS value_correct  -- = 4,800,000 VNĐ
FROM b2b.deals WHERE deal_number = 'DL-OUT-SQL-001';

-- VERIFY weighbridge guard bypass — không raise exception
SELECT EXISTS (
  SELECT 1 FROM weighbridge_tickets WHERE code = 'CAN-OUT-SQL-001'
) AS ticket_persisted;

-- CLEANUP
-- DELETE FROM b2b.deals WHERE deal_number = 'DL-OUT-SQL-001';
-- DELETE FROM weighbridge_tickets WHERE code = 'CAN-OUT-SQL-001';
```

---

## Scenario 4 — 🅲 Walk-in hộ nông dân (CCCD)

```sql
-- PREP 4.1 — Daily price hôm nay
INSERT INTO b2b.daily_price_list (
  product_code, base_price_per_kg, effective_from, effective_to, notes
) VALUES (
  'mu_nuoc', 15000, NOW(), NULL, 'Test SQL 2026-05-03'
) RETURNING id AS price_id;

-- ACTION 4.2 — Insert hộ nông dân mới
INSERT INTO b2b.partners (
  code, name, partner_type, nationality, national_id, phone, status, tier
) VALUES (
  'P-WALKIN-SQL-001', 'Nguyễn Văn Test', 'household_walkin', 'VN',
  '079123456789', '0912345678', 'verified', 'new'
) RETURNING id AS partner_id;

-- ACTION 4.3 — Test CCCD validation (CHECK constraint nationality='VN' + 12 số)
-- Expect FAIL với CCCD 9 số:
INSERT INTO b2b.partners (
  code, name, partner_type, nationality, national_id, phone, status, tier
) VALUES (
  'P-WALKIN-FAIL', 'Test Invalid', 'household_walkin', 'VN',
  '079123456', '0912345678', 'verified', 'new'
);
-- ↑ Phải LỖI (CHECK length = 12)

-- ACTION 4.4 — Insert deal walkin
INSERT INTO b2b.deals (
  deal_number, partner_id, product_code, quantity_kg, unit_price,
  status, purchase_type, actual_drc, actual_weight_kg, final_value,
  created_at
) VALUES (
  'DL-WLK-SQL-001', $partner_id, 'mu_nuoc', 500, 15000,
  'settled', 'farmer_walkin', 32, 500, 500 * 0.32 * 15000,
  NOW()
);

-- VERIFY
SELECT
  (SELECT base_price_per_kg FROM b2b.daily_price_list
     WHERE product_code = 'mu_nuoc' AND effective_to IS NULL) = 15000
    AS daily_price_active,
  (SELECT national_id FROM b2b.partners WHERE code = 'P-WALKIN-SQL-001')
    = '079123456789' AS cccd_stored,
  (SELECT final_value FROM b2b.deals WHERE deal_number = 'DL-WLK-SQL-001')
    = 2400000 AS final_value_2400000,
  (SELECT purchase_type FROM b2b.deals WHERE deal_number = 'DL-WLK-SQL-001')
    = 'farmer_walkin' AS flow_walkin;

-- VERIFY reuse — same CCCD next time should NOT create new partner
-- (UI logic; SQL verify by checking duplicate)
SELECT COUNT(*) FROM b2b.partners WHERE national_id = '079123456789';
-- Expect 1

-- CLEANUP
-- DELETE FROM b2b.deals WHERE deal_number = 'DL-WLK-SQL-001';
-- DELETE FROM b2b.partners WHERE code = 'P-WALKIN-SQL-001';
-- DELETE FROM b2b.daily_price_list WHERE notes LIKE '%Test SQL%';
```

---

## Scenario 5 — 🅱️ DRC-after-production (Đại lý)

```sql
-- PREP: partner gold tier
SELECT id FROM b2b.partners WHERE tier = 'gold' AND status = 'verified' LIMIT 1;
-- → $partner_id

-- ACTION 5.1 — Tạo deal drc-after-prod, sample DRC = 35%, expected_price = 12000
INSERT INTO b2b.deals (
  deal_number, partner_id, product_code, quantity_kg, unit_price,
  status, purchase_type, sample_drc, expected_drc,
  production_mode, production_sla_days, production_started_at,
  created_at
) VALUES (
  'DL-PRD-SQL-001', $partner_id, 'mu_nuoc', 10000, 12000,
  'pending', 'drc_after_production', 35, 35,
  'pooled', 7, NOW(),
  NOW()
) RETURNING id AS deal_id;

-- ACTION 5.2 — Sau X ngày SX, ghi actual_drc đo SAU sản xuất
UPDATE b2b.deals SET
  actual_drc = 36.5,                 -- variance 1.5% < 3% → KHÔNG raise dispute
  actual_weight_kg = 10000,
  finished_product_kg = 3650,        -- = qty × actual_drc/100
  final_value = 10000 * 0.365 * 12000,
  status = 'accepted'
WHERE deal_number = 'DL-PRD-SQL-001';

-- ACTION 5.3 — Test variance > 3% → trigger auto-raise dispute
INSERT INTO b2b.deals (
  deal_number, partner_id, product_code, quantity_kg, unit_price,
  status, purchase_type, sample_drc, expected_drc,
  created_at
) VALUES (
  'DL-PRD-SQL-002', $partner_id, 'mu_nuoc', 5000, 12000,
  'pending', 'drc_after_production', 40, 40,
  NOW()
) RETURNING id AS deal_id_2;

UPDATE b2b.deals SET
  actual_drc = 30,                   -- variance 25% > 3% → trigger fire
  actual_weight_kg = 5000
WHERE deal_number = 'DL-PRD-SQL-002';

-- VERIFY 5.4 — drc_after lock 1 lần
UPDATE b2b.deals SET actual_drc = 25 WHERE deal_number = 'DL-PRD-SQL-002';
-- ↑ Phải LỖI (enforce_deal_lock cho drc_after — set 1 lần xong là khoá)

-- VERIFY
SELECT
  d.deal_number, d.purchase_type, d.sample_drc, d.actual_drc,
  d.production_mode, d.production_sla_days, d.production_started_at,
  EXISTS (
    SELECT 1 FROM b2b.drc_disputes
    WHERE deal_id = d.id AND reason ILIKE 'Auto-raised%'
  ) AS auto_dispute_fired
FROM b2b.deals d
WHERE deal_number IN ('DL-PRD-SQL-001','DL-PRD-SQL-002');
-- Expect:
--   DL-PRD-SQL-001: variance 1.5% → auto_dispute_fired = false
--   DL-PRD-SQL-002: variance 25% → auto_dispute_fired = true

-- CLEANUP
-- DELETE FROM b2b.drc_disputes WHERE deal_id IN (
--   SELECT id FROM b2b.deals WHERE deal_number LIKE 'DL-PRD-SQL-%');
-- DELETE FROM b2b.deals WHERE deal_number LIKE 'DL-PRD-SQL-%';
```

---

## Scenario 6 — 🔀 Multi-lot (1 xe gom 3 partners)

```sql
-- PREP: 3 deals từ 3 partners khác nhau, sản phẩm khác nhau
-- (giả sử có sẵn DEAL_A, DEAL_B, DEAL_C)
SELECT id, deal_number, partner_id FROM b2b.deals
WHERE status = 'accepted' LIMIT 3;
-- → $deal_a, $deal_b, $deal_c

-- ACTION 6.1 — Tạo phiếu cân multi-lot
INSERT INTO weighbridge_tickets (
  code, vehicle_plate, driver_name, gross_kg, tare_kg, net_kg,
  status, weighing_time, has_items, allocation_mode, created_at
) VALUES (
  'CAN-ML-SQL-001', '60F-12345', 'Test driver', 3000, 2015, 985,
  'pending', NOW(), true, 'by_share', NOW()
) RETURNING id AS ticket_id;

-- ACTION 6.2 — Insert 3 line items declared (trước khi cân chính thức)
INSERT INTO weighbridge_ticket_items (
  ticket_id, deal_id, declared_qty_kg, line_amount_vnd, sort_order
) VALUES
  ($ticket_id, $deal_a, 500, 0, 0),
  ($ticket_id, $deal_b, 300, 0, 1),
  ($ticket_id, $deal_c, 200, 0, 2);
-- Trigger trg_items_allocate_on_insert sẽ verify sum = ticket.net_kg

-- ACTION 6.3 — Mark ticket completed → trigger allocate by_share
UPDATE weighbridge_tickets SET status = 'completed'
WHERE code = 'CAN-ML-SQL-001';

-- VERIFY allocation by_share: 985 chia theo tỉ lệ 500:300:200 = 5:3:2
-- → 985 × 5/10 = 492.5
-- → 985 × 3/10 = 295.5
-- → 985 × 2/10 = 197.0
SELECT i.sort_order, i.declared_qty_kg, i.actual_qty_kg,
       ROUND(i.actual_qty_kg::NUMERIC, 1) AS allocated_rounded
FROM weighbridge_ticket_items i
JOIN weighbridge_tickets t ON i.ticket_id = t.id
WHERE t.code = 'CAN-ML-SQL-001'
ORDER BY i.sort_order;
-- Expect: 492.5, 295.5, 197.0

-- VERIFY tổng = NET
SELECT SUM(actual_qty_kg) FROM weighbridge_ticket_items i
JOIN weighbridge_tickets t ON i.ticket_id = t.id
WHERE t.code = 'CAN-ML-SQL-001';
-- Expect: 985.0

-- CLEANUP
-- DELETE FROM weighbridge_ticket_items WHERE ticket_id IN (
--   SELECT id FROM weighbridge_tickets WHERE code = 'CAN-ML-SQL-001');
-- DELETE FROM weighbridge_tickets WHERE code = 'CAN-ML-SQL-001';
```

---

## Scenario 7 — 🛠️ Daily price admin

```sql
-- ACTION 7.1 — Set giá hôm nay
INSERT INTO b2b.daily_price_list (
  product_code, base_price_per_kg, effective_from, notes
) VALUES (
  'mu_tap', 13500, NOW(), 'Test SQL daily price'
) RETURNING id AS price_id_a;

-- ACTION 7.2 — Set giá khác cho cùng sản phẩm → expect cancel cái cũ
INSERT INTO b2b.daily_price_list (
  product_code, base_price_per_kg, effective_from, notes
) VALUES (
  'mu_tap', 14000, NOW() + INTERVAL '1 hour', 'Test SQL daily price v2'
);

-- VERIFY chỉ 1 active tại 1 thời điểm
SELECT product_code, base_price_per_kg, effective_from, effective_to
FROM b2b.daily_price_list
WHERE product_code = 'mu_tap' AND notes ILIKE '%Test SQL%'
ORDER BY effective_from;
-- Expect: 2 rows, row đầu effective_to = effective_from của row sau (nếu trigger
-- close_previous_price hoạt động) HOẶC 2 rows overlap (nếu logic chỉ ở app)

-- VERIFY tstzrange EXCLUDE constraint không cho overlap
INSERT INTO b2b.daily_price_list (
  product_code, base_price_per_kg, effective_from, effective_to, notes
) VALUES (
  'mu_tap', 99999, NOW(), NOW() + INTERVAL '2 hours', 'overlap test'
);
-- Expect: LỖI nếu EXCLUDE constraint đã bật cho cùng product_code

-- CLEANUP
-- DELETE FROM b2b.daily_price_list WHERE notes ILIKE '%Test SQL%' OR notes ILIKE '%overlap%';
```

---

## Scenario 8 — 🔔 DRC Dispute bi-directional (B7)

```sql
-- PREP: deal đã settled với variance > 3%
SELECT id, deal_number, partner_id, expected_drc, actual_drc,
       ABS(actual_drc - expected_drc) / NULLIF(expected_drc, 0) * 100 AS variance_pct
FROM b2b.deals
WHERE status = 'settled' AND actual_drc IS NOT NULL AND expected_drc IS NOT NULL
ORDER BY ABS(actual_drc - expected_drc) DESC LIMIT 5;
-- → $deal_id, $partner_id

-- ACTION 8.1 — Partner raise dispute (mô phỏng RPC partner_raise_drc_dispute)
INSERT INTO b2b.drc_disputes (
  dispute_number, deal_id, partner_id, raised_by,
  expected_drc, actual_drc, status, reason, created_at
) VALUES (
  'DIS-SQL-001', $deal_id, $partner_id, $partner_id,
  (SELECT expected_drc FROM b2b.deals WHERE id = $deal_id),
  (SELECT actual_drc FROM b2b.deals WHERE id = $deal_id),
  'open', 'Partner raise dispute test SQL', NOW()
) RETURNING id AS dispute_id;

-- VERIFY 8.2 — Audit log fired
SELECT COUNT(*) FROM b2b.dispute_audit_log
WHERE dispute_id = $dispute_id;
-- Expect ≥ 1 entry

-- ACTION 8.3 — Factory investigate
UPDATE b2b.drc_disputes SET status = 'investigating', updated_at = NOW()
WHERE id = $dispute_id;

-- ACTION 8.4 — Factory resolve với adjustment +500,000 (factory thu thêm)
UPDATE b2b.drc_disputes SET
  status = 'resolved_rejected',
  resolution_notes = 'Test resolve — factory keeps original DRC',
  resolved_at = NOW(),
  updated_at = NOW()
WHERE id = $dispute_id;

-- VERIFY 8.5 — Audit log có 3 entries (insert + 2 update)
SELECT action, created_at FROM b2b.dispute_audit_log
WHERE dispute_id = $dispute_id ORDER BY created_at;
-- Expect ≥ 3 rows

-- CLEANUP
-- DELETE FROM b2b.dispute_audit_log WHERE dispute_id = $dispute_id;
-- DELETE FROM b2b.drc_disputes WHERE dispute_number = 'DIS-SQL-001';
```

---

## B7+B8 cross-portal (sau khi đã chạy 8 scenarios trên)

```sql
-- B7 — verify dispute audit trigger
SELECT trigger_name FROM information_schema.triggers
WHERE event_object_table = 'drc_disputes' AND trigger_schema = 'b2b';
-- Expect 'trg_dispute_audit'

-- B8 — REPLICA IDENTITY check
SELECT
  c.relname,
  CASE c.relreplident
    WHEN 'd' THEN 'default (PK)'
    WHEN 'f' THEN 'FULL'
    WHEN 'i' THEN 'INDEX'
    WHEN 'n' THEN 'NOTHING'
  END AS replica_identity
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'b2b'
  AND c.relname IN ('chat_messages','deals','drc_disputes','advances',
                    'partner_ledger','settlements');
-- Expect: chat_messages, deals, drc_disputes có FULL
-- advances, partner_ledger, settlements: nếu cần realtime UPDATE old data thì
-- cần ALTER TABLE ... REPLICA IDENTITY FULL
```

---

## Sprint E verify (running_balance + paid_at + final_value)

```sql
-- BUG-3 running_balance auto-compute
SELECT entry_type, debit, credit, running_balance, entry_date,
       LAG(running_balance) OVER (PARTITION BY partner_id ORDER BY entry_date) AS prev_rb,
       running_balance - COALESCE(LAG(running_balance) OVER (PARTITION BY partner_id ORDER BY entry_date), 0)
         AS delta,
       (debit - credit) AS expected_delta
FROM b2b.partner_ledger
ORDER BY partner_id, entry_date DESC LIMIT 20;
-- Expect: delta = expected_delta cho mỗi row → trigger compute running_balance đúng

-- BUG-4 paid_at column tồn tại + có giá trị cho settlement đã paid
SELECT COUNT(*) FILTER (WHERE status = 'paid' AND paid_at IS NULL) AS paid_no_timestamp,
       COUNT(*) FILTER (WHERE status = 'paid' AND paid_at IS NOT NULL) AS paid_with_timestamp
FROM b2b.settlements;
-- Expect: paid_no_timestamp = 0 (sau khi backfill Sprint E)

-- BUG-5 final_value auto-compute từ deal data
SELECT id, deal_number, actual_drc, actual_weight_kg, final_price, unit_price,
       final_value,
       CASE
         WHEN price_unit = 'wet' THEN actual_weight_kg * COALESCE(final_price, unit_price)
         ELSE actual_weight_kg * actual_drc/100 * COALESCE(final_price, unit_price)
       END AS expected_final_value
FROM b2b.deals
WHERE status = 'settled' AND actual_drc IS NOT NULL AND actual_weight_kg IS NOT NULL
LIMIT 10;
-- Expect: final_value ≈ expected_final_value (sai số làm tròn OK)
```

---

## Cleanup tổng

```sql
-- DISABLE triggers tạm thời nếu cần xoá bulk
ALTER TABLE b2b.settlements DISABLE TRIGGER trg_settlement_audit;
ALTER TABLE b2b.drc_disputes DISABLE TRIGGER trg_dispute_audit;
ALTER TABLE b2b.deals DISABLE TRIGGER trg_deal_audit;

-- Xoá theo dependency
DELETE FROM b2b.drc_disputes WHERE dispute_number ILIKE 'DIS-SQL-%';
DELETE FROM b2b.dispute_audit_log WHERE dispute_id NOT IN (
  SELECT id FROM b2b.drc_disputes
);

DELETE FROM weighbridge_ticket_items WHERE ticket_id IN (
  SELECT id FROM weighbridge_tickets WHERE code ILIKE 'CAN-%-SQL-%'
);
DELETE FROM weighbridge_tickets WHERE code ILIKE 'CAN-%-SQL-%';

DELETE FROM b2b.deals WHERE deal_number ILIKE 'DL-%-SQL-%';
DELETE FROM b2b_demand_offers WHERE demand_id IN (
  SELECT id FROM b2b_demands WHERE demand_number ILIKE 'NCM-TEST-SQL-%'
);
DELETE FROM b2b_demands WHERE demand_number ILIKE 'NCM-TEST-SQL-%';
DELETE FROM b2b.partners WHERE code ILIKE 'P-%-SQL-%';
DELETE FROM b2b.daily_price_list WHERE notes ILIKE '%Test SQL%' OR notes ILIKE '%overlap%';

-- ENABLE triggers lại
ALTER TABLE b2b.settlements ENABLE TRIGGER trg_settlement_audit;
ALTER TABLE b2b.drc_disputes ENABLE TRIGGER trg_dispute_audit;
ALTER TABLE b2b.deals ENABLE TRIGGER trg_deal_audit;
```
