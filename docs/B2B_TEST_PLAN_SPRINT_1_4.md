# B2B — Test Plan Sprint 1→4 (A→Z)

**Ngày:** 2026-04-21
**Scope:** Verify 13 gap đã fix qua Sprint 1-2-3-4 (migration + service layer)
**Môi trường:** Staging/Production Supabase (hiện chạy trên production DB)

---

## 0. Prerequisites

### 0.1. Setup test data (chạy 1 lần trước các test)

```sql
-- Partner verified (dùng cho happy path)
INSERT INTO b2b.partners (id, code, name, tier, status, region)
VALUES
  ('11111111-1111-1111-1111-111111111111',
   'TEST-VFD-001', 'Test Partner Verified', 'silver', 'verified', 'Vĩnh Long')
ON CONFLICT (id) DO UPDATE SET status = 'verified';

-- Partner suspended (dùng cho negative test)
INSERT INTO b2b.partners (id, code, name, tier, status, region)
VALUES
  ('22222222-2222-2222-2222-222222222222',
   'TEST-SUS-001', 'Test Partner Suspended', 'bronze', 'suspended', 'Bến Tre')
ON CONFLICT (id) DO UPDATE SET status = 'suspended';

-- Deal pending (dùng để test update workflow)
INSERT INTO b2b.deals (id, deal_number, partner_id, deal_type, status,
                       product_name, product_code, quantity_kg, unit_price,
                       total_value_vnd, expected_drc, created_by)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'DL2604-TEST', '11111111-1111-1111-1111-111111111111', 'purchase', 'pending',
   'Mủ nước', 'mu_nuoc', 1000, 20000, 20000000, 35, NULL)
ON CONFLICT (id) DO NOTHING;
```

### 0.2. Cleanup sau test

```sql
DELETE FROM b2b.deals WHERE deal_number LIKE 'DL2604-TEST%';
DELETE FROM b2b.partner_ledger WHERE reference_code LIKE 'TEST-%';
DELETE FROM b2b.notifications WHERE title LIKE 'TEST %';
DELETE FROM b2b.partners WHERE code LIKE 'TEST-%';
```

---

## Sprint 1 — CRITICAL gaps

### TC-1.1: Gap #1 — Race duplicate deals từ 1 booking

**Prep:** Có 1 chat booking message với id cụ thể.

**Action 1 (DB level):**
```sql
INSERT INTO b2b.deals (deal_number, partner_id, deal_type, status, booking_id)
VALUES ('DL2604-TEST-R1', '11111111-1111-1111-1111-111111111111',
        'purchase', 'pending', 'booking-test-001');

-- Insert lần 2 cùng booking_id → phải lỗi
INSERT INTO b2b.deals (deal_number, partner_id, deal_type, status, booking_id)
VALUES ('DL2604-TEST-R2', '11111111-1111-1111-1111-111111111111',
        'purchase', 'pending', 'booking-test-001');
```
**Expected:** Insert 2 → `ERROR: duplicate key value violates unique constraint "idx_deals_booking_id_unique"`

**Action 2 (UI):** Mở 2 tab `B2BChatRoomPage`, cùng click "Xác nhận Deal" trên cùng booking.
**Expected:** Chỉ 1 tab tạo deal thành công; tab kia hiện toast "Booking đã được xác nhận bởi người khác" (không phải raw PG error).

**Verify:**
```sql
SELECT deal_number, booking_id FROM b2b.deals WHERE booking_id = 'booking-test-001';
-- Phải có đúng 1 row
```

---

### TC-1.2: Gap #2 — Suspended partner tạo deal

**Action:** Gọi API `dealService.createDeal` với `partner_id = '2222...'` (suspended).

**UI path:** Vào trang tạo Deal manual, chọn partner có status "Tạm ngưng" → Submit.

**Expected:** Throw error Vietnamese: "Đại lý **Test Partner Suspended** đang ở trạng thái "suspended" — chỉ đại lý đã duyệt mới được tạo deal."

**Verify:**
```sql
SELECT count(*) FROM b2b.deals WHERE partner_id = '22222222-2222-2222-2222-222222222222';
-- Phải = 0 (hoặc số cũ, không tăng)
```

---

### TC-1.3: Gap #3 — Settle khi dispute đang mở

**Prep:**
```sql
-- Tạo deal accepted + dispute open
UPDATE b2b.deals SET status = 'accepted', actual_drc = 33, actual_weight_kg = 1000
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

INSERT INTO b2b.drc_disputes (id, dispute_number, deal_id, partner_id,
                              expected_drc, actual_drc, drc_variance, reason,
                              status, raised_by)
VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'DIS-TEST-001',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '11111111-1111-1111-1111-111111111111',
        35, 33, -2, 'Test dispute', 'open',
        '11111111-1111-1111-1111-111111111111');
```

**Action:** UI → trang deal → click "Tạo phiếu quyết toán" (gọi `autoSettlementService.createAutoSettlement`).

**Expected:** Error "Deal đang có khiếu nại DIS-TEST-001 chưa giải quyết (open). Phải xử lý khiếu nại trước khi quyết toán."

**Verify:**
```sql
SELECT count(*) FROM b2b.settlements WHERE deal_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
-- = 0
```

---

### TC-1.4: Gap #5 — Advance > final_value

**Prep:**
```sql
-- Tạo advance vượt giá trị deal (deal 20tr, advance 25tr)
INSERT INTO b2b.advances (deal_id, partner_id, advance_number, amount, amount_vnd,
                          currency, status, paid_at)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '11111111-1111-1111-1111-111111111111',
        'ADV-TEST-001', 25000000, 25000000, 'VND', 'paid', NOW());
```

**Action:** Clear dispute trước (set `resolved_rejected`) → Tạo auto settlement.

**Expected:** Error "Tổng tạm ứng (25,000,000 đ) lớn hơn giá trị deal thực tế (20,000,000 đ)..."

---

### TC-1.5: Gap #6 — Validation quantity/price ≤ 0

```sql
-- Phải fail từ CHECK constraint chk_deals_quantity_positive
INSERT INTO b2b.deals (deal_number, partner_id, deal_type, status,
                      quantity_kg, unit_price)
VALUES ('DL-NEG', '11111111-1111-1111-1111-111111111111',
        'purchase', 'pending', -100, 20000);
-- ERROR: new row for relation "deals" violates check constraint "chk_deals_quantity_positive"

INSERT INTO b2b.deals (deal_number, partner_id, deal_type, status,
                      quantity_kg, unit_price, expected_drc)
VALUES ('DL-BADRC', '11111111-1111-1111-1111-111111111111',
        'purchase', 'pending', 1000, 20000, 150);
-- ERROR: chk_deals_expected_drc_range
```

---

## Sprint 2 — HIGH gaps

### TC-2.1: Gap #4 — Lock deal fields khi accepted + audit log

**Prep:** Deal status = 'accepted'.
```sql
UPDATE b2b.deals SET status = 'accepted', final_price = 20000, actual_drc = 33,
                     actual_weight_kg = 1000
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
```

**Action A (DB trigger):**
```sql
-- Thử sửa unit_price → phải fail
UPDATE b2b.deals SET unit_price = 25000
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
-- ERROR: Deal DL2604-TEST đã accepted — không thể sửa unit_price

-- Sửa actual_drc → fail
UPDATE b2b.deals SET actual_drc = 40
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
-- ERROR: không thể sửa actual_drc (dùng dispute)

-- Đổi partner → fail
UPDATE b2b.deals SET partner_id = '22222222-2222-2222-2222-222222222222'
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
-- ERROR: không thể đổi partner

-- Sửa notes → OK (cho phép)
UPDATE b2b.deals SET notes = 'Ghi chú bổ sung sau accepted'
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
-- SUCCESS
```

**Action B (service layer):** UI `DealDetailPage` → thử submit form với `final_price` thay đổi → phải toast error "Deal ... đã ở trạng thái accepted..."

**Verify audit log:**
```sql
SELECT op, changed_fields, changed_at
FROM b2b.deal_audit_log
WHERE deal_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
ORDER BY changed_at DESC
LIMIT 10;
-- Phải có record UPDATE với changed_fields = {notes} (từ action cuối cùng)
-- Record trước là changed_fields = {status, final_price, actual_drc, actual_weight_kg} từ UPDATE setup
```

---

### TC-2.2: Gap #7 — Lock settlement khi approved

**Prep:**
```sql
-- Tạo settlement approved (giả lập)
INSERT INTO b2b.settlements (id, code, partner_id, deal_id, settlement_type,
                             weighed_kg, finished_kg, approved_price, gross_amount,
                             total_advance, status, approved_by, approved_at,
                             created_by)
VALUES ('55555555-5555-5555-5555-555555555555', 'QT-TEST-001',
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'purchase', 1000, 1000, 20000, 20000000, 0, 'approved',
        '11111111-1111-1111-1111-111111111111', NOW(),
        '11111111-1111-1111-1111-111111111111');
```

**Action:**
```sql
-- Sửa gross_amount → fail
UPDATE b2b.settlements SET gross_amount = 30000000
WHERE code = 'QT-TEST-001';
-- ERROR: Phiếu QT-TEST-001 đã approved, không thể sửa gross_amount

-- Sửa approved_price → fail
UPDATE b2b.settlements SET approved_price = 25000
WHERE code = 'QT-TEST-001';
-- ERROR

-- Sửa notes → OK
UPDATE b2b.settlements SET notes = 'Ghi chú sau duyệt' WHERE code = 'QT-TEST-001';
-- SUCCESS
```

**Verify:**
```sql
SELECT op, changed_fields FROM b2b.settlement_audit_log
WHERE settlement_id = '55555555-5555-5555-5555-555555555555' ORDER BY changed_at DESC;
-- Phải thấy UPDATE notes
```

---

### TC-2.3: Cross #2 — locked_by_dispute auto-pause

**Prep:** Settlement draft + dispute open.
```sql
INSERT INTO b2b.settlements (id, code, partner_id, deal_id, settlement_type,
                             weighed_kg, finished_kg, approved_price, gross_amount,
                             status, created_by)
VALUES ('66666666-6666-6666-6666-666666666666', 'QT-TEST-002',
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'purchase', 1000, 1000, 20000, 20000000, 'draft',
        '11111111-1111-1111-1111-111111111111');
```

**Action 1:** Partner portal raise dispute (call `drcDisputeService.raiseDispute` hoặc RPC).
**Expected:** Service hook auto-set `locked_by_dispute = true` + `locked_dispute_id` trên QT-TEST-002.

```sql
SELECT code, locked_by_dispute, locked_dispute_id FROM b2b.settlements
WHERE code = 'QT-TEST-002';
-- locked_by_dispute = true, locked_dispute_id = id dispute
```

**Action 2:** Thử submit/approve khi đang lock.
```sql
-- Service submitForApproval → fail
-- (UI: click Submit approve → toast "Phiếu ... đang tạm khoá do có khiếu nại DRC...")
```

**Action 3:** Resolve dispute → auto-unlock.
```sql
UPDATE b2b.drc_disputes SET status = 'resolved_rejected', resolved_at = NOW()
WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
-- Service layer resolveDispute() tự unlock (test qua UI path)
```

Nếu test thuần DB, manual unlock:
```sql
UPDATE b2b.settlements SET locked_by_dispute = false, locked_dispute_id = null
WHERE locked_dispute_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
```

---

## Sprint 3 — MEDIUM gaps

### TC-3.1: Gap #8 — Idempotency ledger

**Action:**
```sql
-- Insert entry 1
INSERT INTO b2b.partner_ledger (partner_id, entry_type, debit, credit,
                                reference_code, description, entry_date)
VALUES ('11111111-1111-1111-1111-111111111111', 'adjustment',
        100000, 0, 'TEST-IDEMP-001', 'Test idempotent', CURRENT_DATE);

-- Insert entry 2 cùng reference_code → phải fail UNIQUE
INSERT INTO b2b.partner_ledger (partner_id, entry_type, debit, credit,
                                reference_code, description, entry_date)
VALUES ('11111111-1111-1111-1111-111111111111', 'adjustment',
        100000, 0, 'TEST-IDEMP-001', 'Test idempotent retry', CURRENT_DATE);
-- ERROR: duplicate key value violates unique constraint "idx_ledger_idempotency"
```

**Action service layer:** Double-click "Tạo bút toán điều chỉnh" trên UI → chỉ có 1 row.
```sql
SELECT count(*) FROM b2b.partner_ledger
WHERE reference_code = 'TEST-IDEMP-001';
-- = 1 (không phải 2)
```

**Verify idempotent return:** Gọi `ledgerService.createManualEntry` lần 2 cùng reference → return entry cũ, không throw.

---

### TC-3.2: Gap #9 — Period cutting rule (GENERATED column)

**Action:**
```sql
-- Insert với entry_date=2026-04-15 nhưng client cố set period=12/2025 → DB bỏ qua
INSERT INTO b2b.partner_ledger (partner_id, entry_type, debit, credit,
                                reference_code, description, entry_date)
VALUES ('11111111-1111-1111-1111-111111111111', 'adjustment', 50000, 0,
        'TEST-PERIOD-001', 'Test period', '2026-04-15');

SELECT period_month, period_year FROM b2b.partner_ledger
WHERE reference_code = 'TEST-PERIOD-001';
-- Expected: period_month = 4, period_year = 2026 (derived từ entry_date)
```

**Edge case:** Settlement approved cross-month.
```sql
-- Deal tháng 3, settlement approve 2026-04-05 → ledger entry phải thuộc kỳ 4/2026
-- (test qua UI: duyệt 1 settlement + check bảng ledger)
```

---

### TC-3.3: Gap #10 — Batch-deal link guard

**Prep:**
```sql
-- Tạo batch link với deal accepted
UPDATE rubber_intake_batches
SET deal_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
WHERE id = (SELECT id FROM rubber_intake_batches LIMIT 1);
```

**Action:**
```sql
-- Thử đổi batch sang deal khác → fail vì deal_id cũ đã accepted
UPDATE rubber_intake_batches
SET deal_id = gen_random_uuid()  -- deal id khác
WHERE deal_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
-- ERROR: Batch đã gắn Deal ở trạng thái accepted — không thể đổi sang deal khác

-- Set NULL → fail
UPDATE rubber_intake_batches
SET deal_id = NULL
WHERE deal_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
-- ERROR

-- Set lần đầu từ NULL thì OK
UPDATE rubber_intake_batches
SET deal_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
WHERE deal_id IS NULL LIMIT 1;
-- SUCCESS (không fail vì OLD.deal_id IS NULL → trigger skip)
```

---

## Sprint 4 — Nice-to-have

### TC-4.1: Aging report + Export Excel

**Prep:** Có ít nhất 3 ledger entries spread across buckets (current, 31-60, 61-90, >90 ngày).
```sql
-- Entry mới (current)
INSERT INTO b2b.partner_ledger (partner_id, entry_type, debit, credit, description, entry_date)
VALUES ('11111111-1111-1111-1111-111111111111', 'settlement', 1000000, 0, 'TEST aging 10d', CURRENT_DATE - 10);

-- Entry 45 ngày (days_30)
INSERT INTO b2b.partner_ledger (partner_id, entry_type, debit, credit, description, entry_date)
VALUES ('11111111-1111-1111-1111-111111111111', 'settlement', 2000000, 0, 'TEST aging 45d', CURRENT_DATE - 45);

-- Entry 100 ngày (days_90+)
INSERT INTO b2b.partner_ledger (partner_id, entry_type, debit, credit, description, entry_date)
VALUES ('11111111-1111-1111-1111-111111111111', 'settlement', 3000000, 0, 'TEST aging 100d', CURRENT_DATE - 100);
```

**Action UI:** `/b2b/reports/ledger` → table aging hiện ra.
- Partner Test Verified phải có: current=1M, days_30=2M, days_90=3M, total=6M
- Click "Xuất Excel" → file `bao-cao-cong-no-b2b_YYYY-MM-DD.xlsx` tải về
- Mở file → 2 sheet: "Tổng hợp" (4 chỉ số) + "Tuổi nợ" (row + totals)

**Verify:**
```sql
-- Recompute manually
SELECT
  SUM(CASE WHEN CURRENT_DATE - entry_date <= 30 THEN debit - credit ELSE 0 END) AS current_bucket,
  SUM(CASE WHEN CURRENT_DATE - entry_date BETWEEN 31 AND 60 THEN debit - credit ELSE 0 END) AS d30,
  SUM(CASE WHEN CURRENT_DATE - entry_date BETWEEN 61 AND 90 THEN debit - credit ELSE 0 END) AS d60,
  SUM(CASE WHEN CURRENT_DATE - entry_date > 90 THEN debit - credit ELSE 0 END) AS d90
FROM b2b.partner_ledger
WHERE partner_id = '11111111-1111-1111-1111-111111111111';
-- So sánh với số trên UI + Excel phải khớp
```

---

### TC-4.2: Universal audit log

**Action:** Chạy TC-2.1 và TC-2.2 xong check bảng log.
```sql
-- Deal audit
SELECT op, changed_fields, to_char(changed_at,'HH24:MI:SS') AS t
FROM b2b.deal_audit_log ORDER BY changed_at DESC LIMIT 10;

-- Settlement audit
SELECT op, changed_fields, to_char(changed_at,'HH24:MI:SS')
FROM b2b.settlement_audit_log ORDER BY changed_at DESC LIMIT 10;

-- Dispute audit
SELECT op, changed_fields FROM b2b.dispute_audit_log ORDER BY changed_at DESC LIMIT 10;
```
**Expected:** Mỗi UPDATE có `changed_fields` = array các field đã đổi. INSERT có `new_data` JSONB.

---

### TC-4.3: Notification engine

**Action:** Chạy TC-1.3 (sau khi resolve dispute) + TC-2.2 (approve settlement).

**Verify:**
```sql
SELECT type, audience, title, message, to_char(created_at,'HH24:MI:SS')
FROM b2b.notifications ORDER BY created_at DESC LIMIT 10;
-- Phải có:
-- - type='dispute_raised', audience='staff' (từ TC-2.3)
-- - type='settlement_approved', audience='both' (từ TC-2.2)
```

**UI:** Trang cần có bell icon + panel hiển thị notifications (chưa làm UI bell — Sprint 4+).
Test ở mức service: `b2bNotificationService.listForStaff()` trả data.

---

## Smoke Test Runbook (end-to-end happy path)

**Goal:** 1 deal đi từ booking → settlement → payment không lỗi, tất cả guard không trigger.

1. Partner verified gửi booking qua chat → nhân viên xác nhận → deal `pending`
2. `startProcessing` → `processing`
3. WMS tạo stock_in + QC pass → deal có `stock_in_count>0`, `actual_drc`, `actual_weight_kg`
4. `acceptDeal` → status `accepted`
5. Thử UPDATE `unit_price` → **phải block (Gap #4)** → OK
6. Audit log có record INSERT + UPDATE status → **OK (Sprint 4)**
7. `createAutoSettlement` → settlement `draft`
8. `submitForApproval` → `pending`
9. `approveSettlement` → `approved` + ledger entry `settlement` DEBIT + notification → **OK**
10. Thử UPDATE `gross_amount` → **phải block (Gap #7)** → OK
11. `markAsPaid` → `paid` + ledger entry `payment` CREDIT → running_balance = 0 → **OK**
12. Partner raise dispute sau đó → đã paid, settlement không lock được (chỉ lock status trước paid) → flow đúng

---

## Verification Queries (chạy cuối session)

```sql
-- 1. Check số lượng audit log rows tăng theo mong đợi
SELECT 'deals' AS tbl, count(*) FROM b2b.deal_audit_log
UNION ALL SELECT 'settlements', count(*) FROM b2b.settlement_audit_log
UNION ALL SELECT 'disputes', count(*) FROM b2b.dispute_audit_log
UNION ALL SELECT 'notifications', count(*) FROM b2b.notifications;

-- 2. Triggers active?
SELECT tgname, tgrelid::regclass, tgenabled FROM pg_trigger
WHERE tgname LIKE 'trg_%' AND tgrelid::regclass::text LIKE '%b2b%'
   OR tgname = 'trg_batch_deal_lock'
ORDER BY tgname;

-- 3. Ledger idempotency không có duplicate
SELECT partner_id, entry_type, reference_code, count(*)
FROM b2b.partner_ledger
WHERE reference_code IS NOT NULL
GROUP BY 1,2,3 HAVING count(*) > 1;
-- Phải rỗng

-- 4. locked_by_dispute chỉ true khi có active dispute
SELECT s.code, s.locked_by_dispute, d.dispute_number, d.status
FROM b2b.settlements s
LEFT JOIN b2b.drc_disputes d ON d.id = s.locked_dispute_id
WHERE s.locked_by_dispute = TRUE;
-- d.status phải IN ('open','investigating') — nếu không, có lock sót cần clear
```

---

## Test Matrix (tóm tắt)

| # | Gap | Loại test | Source |
|---|---|---|---|
| 1.1 | #1 Race duplicate | DB constraint + UI concurrency | SQL + chrome 2 tab |
| 1.2 | #2 Suspended partner | Service guard | UI DealCreatePage |
| 1.3 | #3 Settle với dispute | Service guard | UI click tạo QT |
| 1.4 | #5 Advance > final | Service guard | UI tạo QT |
| 1.5 | #6 Validation ≤0 | DB CHECK | SQL direct |
| 2.1 | #4 Lock deal | DB trigger + service | SQL + UI edit |
| 2.2 | #7 Lock settlement | DB trigger + service | SQL + UI edit |
| 2.3 | Cross #2 locked_by_dispute | Service hook | UI raise dispute |
| 3.1 | #8 Idempotency | DB UNIQUE + service | SQL + UI double-click |
| 3.2 | #9 Period GENERATED | DB column | SQL |
| 3.3 | #10 Batch-deal lock | DB trigger | SQL |
| 4.1 | Aging + Excel | UI + Excel | UI click Export |
| 4.2 | Audit log universal | DB trigger | SQL |
| 4.3 | Notification | Service hook | UI action + SQL |

**Pass criteria:** Tất cả 14 test case pass → đóng Sprint 1-4.
**Blocker:** Nếu TC-2.1 hoặc TC-2.2 fail → deal/settlement có thể bị sửa sau duyệt → rollback migration.
