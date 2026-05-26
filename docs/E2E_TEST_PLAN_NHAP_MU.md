# E2E Test Plan — Quy trình Nhập mủ → ERP đầy đủ

**Date**: 2026-05-27
**Mục đích**: Test xuyên suốt pipeline B2B Thu Mua bằng SQL — từ cân mủ đến quyết toán
**Cách test**: Chỉ dùng Supabase SQL Editor (KHÔNG click UI) — đảm bảo trigger + RPC chạy đúng
**Trạng thái**: 🔵 Đang lên plan, chưa execute

---

## 0. Mục tiêu test (Definition of Done)

Sau khi chạy hết test, xác nhận được:

1. ✅ Phiếu cân (mủ nước, có ĐỐT/DRC/LLM) tự tạo `rubber_intake_batches` qua `bridge_weighbridge_to_intake()`
2. ✅ `pnk_number` auto-assign theo (facility, year) qua trigger `trg_rib_auto_pnk_number`
3. ✅ `raw_rubber_type` derive sang `rubber_type` qua trigger `trg_intake_batch_derive_rubber_type`
4. ✅ `dry_weight_kg` computed = net × drc/100
5. ✅ Bonus tháng auto-recompute qua trigger `trg_intake_batch_recompute_bonus` → `b2b_monthly_bonus` có data
6. ✅ Tạo `b2b_settlements` link với intake_batch → approve → paid → status đúng
7. ✅ Proxy partner: nếu test partner có `payment_proxy_partner_id` thì quyết toán ghi đúng người nhận tiền

Bất kỳ phase nào FAIL → ghi nhận lỗi, không tiếp tục phase sau.

---

## 1. Chọn đại lý test

### 1.1 Tiêu chí
- `status = 'verified'` (đã duyệt)
- `partner_type = 'dealer'`
- `tier IN ('silver', 'gold', 'diamond')` — có bonus rate cao để dễ verify
- **Không có giao dịch trong 7 ngày gần đây** — tránh trùng dữ liệu live
- Có `is_payment_proxy = false` HOẶC test cả case có proxy (riêng)

### 1.2 SQL chọn ứng viên
```sql
SELECT
  p.id, p.code, p.name, p.tier, p.is_payment_proxy,
  p.payment_proxy_partner_id,
  proxy.name AS proxy_name,
  (SELECT COUNT(*) FROM rubber_intake_batches WHERE b2b_partner_id = p.id
     AND intake_date >= CURRENT_DATE - 7) AS recent_intakes
FROM b2b_partners p
LEFT JOIN b2b_partners proxy ON proxy.id = p.payment_proxy_partner_id
WHERE p.status = 'verified'
  AND p.partner_type = 'dealer'
  AND p.tier IN ('silver', 'gold', 'diamond')
ORDER BY recent_intakes ASC, p.tier DESC
LIMIT 10;
```

→ Pick **1 partner** (vd: `code = 'HAC-13-...'`). Note lại `id` UUID.

### 1.3 Snapshot baseline
```sql
-- Snapshot trước test
SELECT
  (SELECT COUNT(*) FROM rubber_intake_batches WHERE b2b_partner_id = '<PARTNER_ID>') AS intakes_before,
  (SELECT COUNT(*) FROM weighbridge_tickets WHERE partner_id = '<PARTNER_ID>') AS tickets_before,
  (SELECT COUNT(*) FROM b2b_monthly_bonus WHERE partner_id = '<PARTNER_ID>'
     AND year = EXTRACT(YEAR FROM CURRENT_DATE) AND month = EXTRACT(MONTH FROM CURRENT_DATE)) AS bonus_rows_before,
  (SELECT COALESCE(SUM(volume_kg), 0) FROM b2b_monthly_bonus WHERE partner_id = '<PARTNER_ID>'
     AND year = EXTRACT(YEAR FROM CURRENT_DATE) AND month = EXTRACT(MONTH FROM CURRENT_DATE)) AS bonus_volume_before;
```

Lưu kết quả vào notepad để compare sau test.

---

## 2. Các phase test (8 bước)

### Phase 1 — Tạo phiếu cân Gross (mô phỏng cân lần 1)

**Action**:
```sql
INSERT INTO weighbridge_tickets (
  code, vehicle_plate, driver_name, ticket_type, rubber_type,
  partner_id, supplier_name, facility_id,
  gross_weight, gross_weighed_at,
  status, created_by, created_at
) VALUES (
  'WB-TEST-' || to_char(now(), 'YYYYMMDD-HH24MISS'),
  '76A-99999',
  'Lái xe Test',
  'in',
  'mu_nuoc',
  '<PARTNER_ID>',
  NULL, -- legacy field, để NULL
  (SELECT id FROM facilities WHERE code = 'TL'),
  6500, -- gross 6.5 tấn (xe + mủ)
  now(),
  'weighing_tare', -- chờ tare
  NULL, -- service role
  now()
)
RETURNING id, code, status;
```

**Verify**:
```sql
SELECT id, code, status, gross_weight, partner_id, facility_id
FROM weighbridge_tickets
WHERE code LIKE 'WB-TEST-%'
ORDER BY created_at DESC LIMIT 1;
```

Expected:
- `status = 'weighing_tare'`
- `gross_weight = 6500`
- `partner_id` = `<PARTNER_ID>`
- `field_dot_reading IS NULL` (chưa đo)
- `qc_actual_drc IS NULL` (chưa đo)

**Note `id` ticket vừa tạo** → gọi là `<TICKET_ID>` cho các phase sau.

---

### Phase 2 — Hoàn tất cân (Tare + ĐỐT + DRC + LLM)

**Action** (simulate user nhập ĐỐT=230, DRC tự fill từ drc_lookup):
```sql
-- Test lookup_drc trước
SELECT public.lookup_drc(230) AS drc_from_lookup; -- expected 42.4

-- Update ticket với tare + DOT + DRC
UPDATE weighbridge_tickets SET
  tare_weight = 2300, -- xe rỗng 2.3 tấn
  tare_weighed_at = now() + interval '30 minutes', -- sau 30p (gap đợi đốt)
  net_weight = 6500 - 2300, -- 4200 kg = 4.2 tấn
  field_dot_reading = 230,
  qc_actual_drc = public.lookup_drc(230), -- 42.4
  consolidation_code = 'TMMN-TEST-' || to_char(now(), 'DDMM'),
  status = 'completed',
  completed_at = now(),
  updated_at = now()
WHERE id = '<TICKET_ID>'
RETURNING id, net_weight, field_dot_reading, qc_actual_drc, consolidation_code, status;
```

**Verify**:
- `net_weight = 4200`
- `field_dot_reading = 230`
- `qc_actual_drc = 42.4` (từ drc_lookup, không phải công thức cũ × 0.2 − 3.4)
- `status = 'completed'`

---

### Phase 3 — Verify Bridge tự tạo rubber_intake_batch

**Expected**: trigger `trg_weighbridge_ticket_bridge` đã chạy khi `status='completed'`, gọi `bridge_weighbridge_to_intake()`.

**Verify**:
```sql
SELECT
  rib.id, rib.lot_code, rib.pnk_number,
  rib.raw_rubber_type, rib.rubber_type, -- raw=mu_nuoc → rubber_type=nuoc (do trigger derive)
  rib.net_weight_kg, rib.drc_percent, rib.dry_weight_kg,
  rib.field_dot_reading, rib.consolidation_code,
  rib.b2b_partner_id, rib.weighbridge_ticket_id,
  rib.status, rib.facility_id,
  f.code AS facility_code
FROM rubber_intake_batches rib
LEFT JOIN facilities f ON f.id = rib.facility_id
WHERE rib.weighbridge_ticket_id = '<TICKET_ID>';
```

Expected:
- 1 row trả về
- `raw_rubber_type = 'mu_nuoc'`
- `rubber_type = 'nuoc'` (auto derived)
- `net_weight_kg = 4200`
- `drc_percent = 42.4`
- `dry_weight_kg = 1780.80` (4200 × 42.4 / 100 = 1780.8) — computed column
- `field_dot_reading = 230`
- `consolidation_code` khớp ticket
- `status = 'confirmed'` (do bridge set)
- `pnk_number IS NOT NULL` (auto từ trigger)

**Note `id` intake_batch** → `<INTAKE_ID>`

**Nếu FAIL** (intake_batches không có row):
- Check `pg_proc WHERE proname = 'bridge_weighbridge_to_intake'`
- Check `pg_trigger WHERE tgname = 'trg_weighbridge_ticket_bridge'`
- Check ticket có thỏa điều kiện: `ticket_type='in'`, `partner_id IS NOT NULL`, `rubber_type IN (...)`, `net_weight > 0`

---

### Phase 4 — Verify PNK number sequential

**Action**:
```sql
-- Lấy max pnk_number của facility TL năm nay TRƯỚC test
SELECT MAX(pnk_number) AS max_pnk_before
FROM rubber_intake_batches
WHERE facility_id = (SELECT id FROM facilities WHERE code='TL')
  AND EXTRACT(YEAR FROM intake_date) = EXTRACT(YEAR FROM CURRENT_DATE)
  AND id != '<INTAKE_ID>';
```

**Verify**:
```sql
SELECT pnk_number FROM rubber_intake_batches WHERE id = '<INTAKE_ID>';
```

Expected: `pnk_number = max_pnk_before + 1` (sequential).

**Edge case**: nếu là phiếu đầu tiên của năm thì `pnk_number = 1`.

---

### Phase 5 — Verify bonus auto-recompute

**Expected**: trigger `trg_intake_batch_recompute_bonus` đã chạy sau INSERT vào `rubber_intake_batches`.

**Verify**:
```sql
SELECT
  partner_id, year, month, rubber_type, bonus_unit,
  volume_kg, dry_weight_kg, bonus_per_kg, total_bonus_vnd,
  status, computed_at
FROM b2b_monthly_bonus
WHERE partner_id = '<PARTNER_ID>'
  AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int
  AND month = EXTRACT(MONTH FROM CURRENT_DATE)::int
  AND rubber_type = 'nuoc';
```

Expected:
- Có 1 row cho (partner, năm, tháng, 'nuoc')
- `bonus_unit = 'dry'` (default cho mủ nước per D2)
- `dry_weight_kg >= 1780.8` (tăng thêm so với baseline)
- `total_bonus_vnd` tính được (>0 nếu volume vượt ngưỡng tier)
- `computed_at` mới (sau Phase 3)

**Tính tay**: so sánh `volume_kg/dry_weight_kg` baseline + 4200/1780.8 = số mới.

---

### Phase 6 — Tạo Settlement quyết toán

**Action** — Tạo phiếu quyết toán tháng cho partner:
```sql
-- Insert settlement header
INSERT INTO b2b_settlements (
  settlement_no, settlement_type, partner_id, period_year, period_month,
  total_amount, status, notes, created_at
) VALUES (
  'QT-TEST-' || to_char(now(), 'YYYYMMDD-HH24MISS'),
  'monthly',
  '<PARTNER_ID>',
  EXTRACT(YEAR FROM CURRENT_DATE)::int,
  EXTRACT(MONTH FROM CURRENT_DATE)::int,
  0, -- sẽ tính dưới
  'draft',
  'E2E test settlement',
  now()
)
RETURNING id, settlement_no;
```

→ Note `<SETTLEMENT_ID>`.

**Add intake batch vào settlement**:
```sql
INSERT INTO b2b_settlement_items (
  settlement_id, intake_batch_id,
  net_weight_kg, dry_weight_kg, drc_percent,
  unit_price, total_amount,
  created_at
)
SELECT
  '<SETTLEMENT_ID>',
  rib.id,
  rib.net_weight_kg, rib.dry_weight_kg, rib.drc_percent,
  COALESCE(rib.unit_price, 15000), -- vd 15.000đ/kg khô
  COALESCE(rib.dry_weight_kg * 15000, 0),
  now()
FROM rubber_intake_batches rib
WHERE rib.id = '<INTAKE_ID>'
RETURNING *;

-- Update tổng tiền
UPDATE b2b_settlements SET
  total_amount = (SELECT COALESCE(SUM(total_amount), 0) FROM b2b_settlement_items WHERE settlement_id = '<SETTLEMENT_ID>'),
  updated_at = now()
WHERE id = '<SETTLEMENT_ID>'
RETURNING total_amount;
```

Expected: `total_amount = 1780.8 × 15000 = 26,712,000 đ`.

---

### Phase 7 — Approve + mark paid Settlement

**Action**:
```sql
-- Approve
UPDATE b2b_settlements SET
  status = 'approved',
  approved_at = now(),
  approved_by = (SELECT id FROM employees WHERE email LIKE '%huyanhrubber.com' LIMIT 1),
  updated_at = now()
WHERE id = '<SETTLEMENT_ID>'
RETURNING status, approved_at;

-- Tạo payment
INSERT INTO b2b_settlement_payments (
  settlement_id, payment_method, payment_amount, payment_date,
  bank_account, notes, created_at
) VALUES (
  '<SETTLEMENT_ID>',
  'bank_transfer',
  26712000,
  CURRENT_DATE,
  'TEST-9999',
  'E2E test payment',
  now()
);

-- Mark paid
UPDATE b2b_settlements SET
  status = 'paid',
  paid_at = now(),
  updated_at = now()
WHERE id = '<SETTLEMENT_ID>'
RETURNING status, paid_at;
```

**Verify**:
```sql
SELECT s.status, s.total_amount, s.paid_at,
  (SELECT SUM(payment_amount) FROM b2b_settlement_payments WHERE settlement_id = s.id) AS total_paid
FROM b2b_settlements s
WHERE id = '<SETTLEMENT_ID>';
```

Expected: `status = 'paid'`, `total_paid = total_amount`.

---

### Phase 8 — Verify Ledger entries (Nợ/Có)

**Expected**: Settlement workflow tự tạo entry Nợ + Có trong `b2b_ledger_entries` qua trigger hoặc service.

**Verify**:
```sql
SELECT
  entry_date, entry_type, reference_type, reference_id,
  debit, credit, balance, description
FROM b2b_ledger_entries
WHERE partner_id = '<PARTNER_ID>'
  AND reference_id IN ('<INTAKE_ID>', '<SETTLEMENT_ID>')
ORDER BY entry_date, created_at;
```

Expected (tùy thực tế trigger có hay không):
- 1 entry Nợ khi `intake_batch` được tạo (debit = giá trị mủ)
- 1 entry Có khi `settlement` paid (credit = số tiền thanh toán)
- Balance về 0 (hoặc gần 0)

**Nếu KHÔNG có entry**: ledger có thể auto-create qua service (TypeScript), không qua DB trigger → cần test qua UI/service. Note để biết.

---

### Phase 9 (Bonus) — Test proxy partner workflow

**Chỉ test nếu partner test có `payment_proxy_partner_id`**:

```sql
SELECT
  s.id, s.partner_id AS settlement_for,
  p.payment_proxy_partner_id AS pay_to,
  proxy.name AS pay_to_name
FROM b2b_settlements s
JOIN b2b_partners p ON p.id = s.partner_id
LEFT JOIN b2b_partners proxy ON proxy.id = p.payment_proxy_partner_id
WHERE s.id = '<SETTLEMENT_ID>';
```

Verify: nếu partner có proxy, tiền chuyển khoản phải về tài khoản của `proxy_partner` (logic ở UI/service).

Skip phase này nếu partner test không có proxy.

---

## 3. Cleanup / Rollback

Sau test xong → xóa data test để không ảnh hưởng prod (tùy bác quyết định giữ làm reference hoặc xóa).

### Option A: Xóa hết (rollback)
```sql
-- Theo thứ tự FK (child trước, parent sau)
DELETE FROM b2b_settlement_payments WHERE settlement_id = '<SETTLEMENT_ID>';
DELETE FROM b2b_settlement_items WHERE settlement_id = '<SETTLEMENT_ID>';
DELETE FROM b2b_settlements WHERE id = '<SETTLEMENT_ID>';

-- Bonus rows sẽ tự recompute lại khi xóa intake → trigger
DELETE FROM rubber_intake_batches WHERE id = '<INTAKE_ID>';
DELETE FROM weighbridge_tickets WHERE id = '<TICKET_ID>';

-- Verify cleanup
SELECT
  (SELECT COUNT(*) FROM rubber_intake_batches WHERE b2b_partner_id = '<PARTNER_ID>') AS intakes_after,
  (SELECT COUNT(*) FROM weighbridge_tickets WHERE partner_id = '<PARTNER_ID>') AS tickets_after,
  (SELECT COALESCE(SUM(volume_kg), 0) FROM b2b_monthly_bonus WHERE partner_id = '<PARTNER_ID>'
     AND year = EXTRACT(YEAR FROM CURRENT_DATE) AND month = EXTRACT(MONTH FROM CURRENT_DATE)) AS bonus_volume_after;
-- Phải bằng baseline ban đầu.
```

### Option B: Mark test data + giữ lại
Đổi `vehicle_plate` thành `'TEST-DO-NOT-USE'` và `notes` ghi rõ `'E2E TEST 2026-05-27'` để dễ filter ra sau.

---

## 4. Success criteria checklist

Sau khi chạy hết, đánh dấu từng phase:

- [ ] **Phase 1** — Weighbridge ticket created với status='weighing_tare'
- [ ] **Phase 2** — Ticket completed + DRC = lookup_drc(ĐỐT) = 42.4 (verify bảng tra mới hoạt động)
- [ ] **Phase 3** — Bridge tự tạo intake_batch với đầy đủ field (raw_rubber_type, rubber_type derived, dry_weight_kg computed)
- [ ] **Phase 4** — PNK number assigned sequential
- [ ] **Phase 5** — Bonus row tăng đúng theo `dry_weight_kg` (bonus_unit='dry' cho mủ nước)
- [ ] **Phase 6** — Settlement + Items created với tổng tiền đúng = dry × price
- [ ] **Phase 7** — Settlement workflow draft → approved → paid OK
- [ ] **Phase 8** — Ledger entries có (nếu có trigger) HOẶC ghi nhận missing (nếu logic ở UI)
- [ ] **Phase 9** (optional) — Proxy partner workflow đúng người nhận tiền

**FAIL bất kỳ phase nào** → stop, debug, fix migration / trigger / function tương ứng, rồi rerun từ phase đó.

---

## 5. Câu hỏi mở cho bác trước khi execute

1. **Pick partner cụ thể**: bác chốt 1 partner cụ thể, hay để tôi pick auto từ query 1.2?
2. **Facility test**: TL hay PD? (Plan này default TL, đúng với Tân Lâm flow mủ nước)
3. **Giữ data hay xóa sau test**: Option A (xóa) hay Option B (giữ + mark)?
4. **Có cần test proxy partner riêng?** Hay bỏ qua phase 9 luôn?
5. **Bonus unit**: bác xác nhận "mủ nước = bonus theo KL khô (dry)" — đúng quyết định D2?
6. **Đơn giá test**: dùng 15.000đ/kg khô như plan, hay lấy từ daily_prices?

Sau khi bác trả lời, tôi finalize SQL script + chuẩn bị execute.
