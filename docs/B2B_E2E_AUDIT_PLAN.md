# B2B Portal E2E Audit — 2 Entry Flows + Full Lifecycle

**Date:** 2026-04-21
**Scope:** Test đầy đủ 3 menu trống (Cơ hội / Đơn hàng / Tài chính) bằng cách inject test data theo 2 luồng nhập cảnh:
1. **Flow 1 — Chat Booking:** Partner gửi phiếu chốt mủ → Deal → Stock-in → QC → Settlement
2. **Flow 2 — Demand-Offer:** Factory tạo nhu cầu mua → Partner bid → Accept → Deal → lifecycle như Flow 1

**Test subject:** Partner `truonghv@gmail.com` (TETG02, Silver) — `partner_id = 11111111-aaaa-1111-1111-000000000002`

**Test environment:** Production Supabase (dygveetaatqllhjusyzz) — insert test data có prefix `TEST-` để dễ cleanup

---

## 📌 PHASE 0 — Prerequisites

### 0.1. Reference IDs

```
truonghv partner_id:    11111111-aaaa-1111-1111-000000000002
truonghv auth_user_id:  bfa21f28-4813-4696-a407-0c3b034744c7
truonghv chat_room_id:  b0cab545-244d-4226-b5d8-e3c87b401286
Deal DL2604-7B5P id:    bfb5c463-6222-402f-b461-f412453f70e0
Facility PD id:         755ae776-3be6-47b8-b1d0-d15b61789f24
```

### 0.2. Find 1 employee UUID (để link created_by fields)

```sql
SELECT id, full_name, code FROM public.employees WHERE code LIKE 'HA-%' LIMIT 1;
-- Lưu UUID dùng cho các INSERT sau
```

### 0.3. Cleanup snippet (chạy cuối mỗi test session)

```sql
-- Disable audit triggers tạm để xóa sạch
ALTER TABLE b2b.settlements DISABLE TRIGGER trg_settlement_audit;
ALTER TABLE b2b.deals DISABLE TRIGGER trg_deal_audit;
ALTER TABLE b2b.drc_disputes DISABLE TRIGGER trg_dispute_audit;

DELETE FROM b2b.partner_ledger WHERE reference_code LIKE 'TEST-%';
DELETE FROM b2b.settlements WHERE code LIKE 'TEST-%';
DELETE FROM b2b.advances WHERE advance_number LIKE 'TEST-%';
DELETE FROM b2b.drc_disputes WHERE dispute_number LIKE 'TEST-%';
DELETE FROM public.b2b_demand_offers WHERE notes LIKE '%TEST-%';
DELETE FROM public.b2b_demands WHERE code LIKE 'TEST-%';
UPDATE public.stock_in_orders SET deal_id = NULL WHERE code LIKE 'TEST-%';
DELETE FROM public.stock_in_orders WHERE code LIKE 'TEST-%';

ALTER TABLE b2b.settlements ENABLE TRIGGER trg_settlement_audit;
ALTER TABLE b2b.deals ENABLE TRIGGER trg_deal_audit;
ALTER TABLE b2b.drc_disputes ENABLE TRIGGER trg_dispute_audit;
```

---

## 🔵 FLOW 1 — Chat Booking → Deal → Settlement

### Stage 1A: Partner gửi phiếu chốt mủ trong chat

**UI verification:**
1. Login `truonghv` → Chat với nhà máy PD
2. Click "Tạo phiếu chốt mủ" → fill form (loại mủ=Mủ tạp, qty=1T, giá=20k, DRC=50%)
3. Submit

**DB check sau submit:**
```sql
-- Booking message tạo trong chat
SELECT id, room_id, message_type, content, metadata->'booking' AS booking
FROM b2b.chat_messages
WHERE room_id = 'b0cab545-244d-4226-b5d8-e3c87b401286'
  AND message_type = 'booking'
ORDER BY sent_at DESC LIMIT 1;
```
**Kỳ vọng:** 1 row, metadata chứa `{agreed_quantity_tons, agreed_price, expected_drc, status: 'pending'}`

### Stage 1B: Factory xác nhận booking (ERP side)

**UI (ERP):** nhân viên ERP vào chat room → click booking card → **Xác nhận Deal** → điền form, submit.

**DB check:**
```sql
-- Deal mới tạo với booking_id link
SELECT id, deal_number, booking_id, status, partner_id, quantity_kg, unit_price, expected_drc
FROM b2b.deals
WHERE partner_id = '11111111-aaaa-1111-1111-000000000002'
ORDER BY created_at DESC LIMIT 1;
```
**Kỳ vọng:** Deal mới, status=`processing`, booking_id = message ID ở Stage 1A.

**Portal verification:**
- Login truonghv → **Đơn hàng** → thấy deal mới với stage `Chốt done / Nhập kho current`
- Chat → booking card đã chuyển "Đã xác nhận" + show DealCard embedded

---

### Stage 2: Factory cân nhập kho → link deal

**Test data inject (simulate ERP weighbridge → stock-in):**

```sql
-- Inject: tạo stock_in_order link với deal DL2604-7B5P + batch
DO $$
DECLARE
  v_deal_id UUID := 'bfb5c463-6222-402f-b461-f412453f70e0';
  v_employee_id UUID := (SELECT id FROM public.employees WHERE code LIKE 'HA-%' LIMIT 1);
  v_stock_in_id UUID;
BEGIN
  INSERT INTO public.stock_in_orders (
    code, status, deal_id, total_weight, total_quantity,
    facility_id, created_by, confirmed_at
  ) VALUES (
    'NK-TEST-E2E-001', 'confirmed', v_deal_id,
    1600000, 40,  -- 1600T, 40 bành (khớp quantity_kg deal)
    '755ae776-3be6-47b8-b1d0-d15b61789f24',  -- PD
    v_employee_id, NOW()
  )
  RETURNING id INTO v_stock_in_id;

  -- Update deal stock_in_count
  UPDATE b2b.deals
  SET stock_in_count = COALESCE(stock_in_count, 0) + 1
  WHERE id = v_deal_id;

  RAISE NOTICE 'Created stock_in %', v_stock_in_id;
END $$;
```

**Portal verify:**
- Partner refresh Orders → deal DL2604-7B5P stage: `Chốt done / Nhập kho done / QC current`
- Click deal → tab **Nhập kho** → thấy `NK-TEST-E2E-001` với 1600T, 40 bành, status confirmed

---

### Stage 3: QC pass → deal có actual_drc + weight

```sql
-- Inject: partner reports QC pass với DRC thực tế
UPDATE b2b.deals
SET actual_drc = 52,
    actual_weight_kg = 1600000,
    qc_status = 'passed'
WHERE id = 'bfb5c463-6222-402f-b461-f412453f70e0';
```

**Portal verify:**
- Deal detail → tab **QC** → pill "Passed" (xanh), DRC 52% vs expected 50% (+2%)
- Nút "Khiếu nại DRC" **không hiện** (vì variance < 2% threshold)
- Stage: `Chốt done / Nhập kho done / QC done / Duyệt current`

**Audit check:**
```sql
SELECT op, changed_fields, changed_at
FROM b2b.deal_audit_log
WHERE deal_id = 'bfb5c463-6222-402f-b461-f412453f70e0'
ORDER BY changed_at DESC LIMIT 3;
```
**Kỳ vọng:** 1 UPDATE row với changed_fields chứa `{actual_drc, actual_weight_kg, qc_status}`.

---

### Stage 4: Deal accepted → tạo advance + settlement

```sql
-- Accept deal
UPDATE b2b.deals SET status = 'accepted' WHERE id = 'bfb5c463-6222-402f-b461-f412453f70e0';

-- Inject advance paid (giả lập factory đã chi 10M tạm ứng)
INSERT INTO b2b.advances (
  id, deal_id, partner_id, advance_number,
  amount, amount_vnd, currency, payment_date, payment_method,
  status, paid_at, approved_at, requested_by, approved_by,
  purpose
) VALUES (
  gen_random_uuid(),
  'bfb5c463-6222-402f-b461-f412453f70e0',
  '11111111-aaaa-1111-1111-000000000002',
  'TEST-ADV-E2E-001',
  10000000, 10000000, 'VND', CURRENT_DATE, 'cash',
  'paid', NOW(), NOW(),
  (SELECT id FROM public.employees WHERE code LIKE 'HA-%' LIMIT 1),
  (SELECT id FROM public.employees WHERE code LIKE 'HA-%' LIMIT 1),
  'Test E2E advance payment'
);
```

**Portal verify:**
- **Tài chính > Tạm ứng**: hiện 1 row TEST-ADV-E2E-001 với 10.000.000 đ, status `paid`
- **Tài chính > Tổng quan**: "Tạm ứng đã nhận" = 10.000.000 đ (trước 0)

---

### Stage 5: Auto settlement

Gọi RPC hoặc inject thủ công:

```sql
-- Simulate autoSettlementService.createAutoSettlement()
DO $$
DECLARE
  v_deal RECORD;
  v_gross NUMERIC;
  v_advance NUMERIC;
  v_employee_id UUID := (SELECT id FROM public.employees WHERE code LIKE 'HA-%' LIMIT 1);
BEGIN
  SELECT * INTO v_deal FROM b2b.deals
  WHERE id = 'bfb5c463-6222-402f-b461-f412453f70e0';

  -- Tính gross = weight × (DRC/100) × price (dry price)
  -- HOẶC weight × price (wet price) — giả sử wet
  v_gross := v_deal.actual_weight_kg * v_deal.unit_price;  -- 1600k × 20k = 32B
  -- Nếu dry: v_gross := v_deal.actual_weight_kg * (v_deal.actual_drc/100) * v_deal.unit_price;

  SELECT COALESCE(SUM(amount_vnd), 0) INTO v_advance
  FROM b2b.advances
  WHERE deal_id = v_deal.id AND status = 'paid';

  INSERT INTO b2b.settlements (
    code, partner_id, deal_id, settlement_type,
    weighed_kg, finished_kg, approved_price, drc_percent,
    total_advance, total_paid_post,
    status, created_by
  ) VALUES (
    'TEST-QT-E2E-001',
    v_deal.partner_id, v_deal.id, 'purchase',
    v_deal.actual_weight_kg, v_deal.actual_weight_kg,
    v_deal.unit_price, v_deal.actual_drc,
    v_advance, 0,
    'draft',
    v_employee_id
  );

  UPDATE b2b.deals SET status = 'settled' WHERE id = v_deal.id;
END $$;
```

**Portal verify:**
- **Tài chính > Quyết toán**: hiện TEST-QT-E2E-001 với gross_amount, remaining_amount (auto-compute)
- Deal detail tab **Quyết toán**: hiện settlement view-only
- Stage: `... / Duyệt done / Quyết toán current`

---

### Stage 6: Factory approve settlement → ledger entry

```sql
-- Factory approve + tạo ledger entry
UPDATE b2b.settlements SET status = 'approved', approved_at = NOW(),
  approved_by = (SELECT id FROM public.employees WHERE code LIKE 'HA-%' LIMIT 1)
WHERE code = 'TEST-QT-E2E-001';

INSERT INTO b2b.partner_ledger (
  partner_id, entry_type, debit, credit,
  reference_type, reference_id, reference_code,
  description, entry_date
) VALUES (
  '11111111-aaaa-1111-1111-000000000002',
  'settlement_receivable',
  (SELECT gross_amount FROM b2b.settlements WHERE code = 'TEST-QT-E2E-001'),
  0,
  'settlement', (SELECT id FROM b2b.settlements WHERE code = 'TEST-QT-E2E-001'),
  'TEST-QT-E2E-001',
  'Quyết toán Test E2E — giá trị deal',
  CURRENT_DATE
);

-- Ledger entry cho advance đã paid
INSERT INTO b2b.partner_ledger (
  partner_id, entry_type, debit, credit,
  reference_code, description, entry_date
) VALUES (
  '11111111-aaaa-1111-1111-000000000002',
  'advance_paid',
  0, 10000000,
  'TEST-ADV-E2E-001',
  'Tạm ứng Test E2E đã chi',
  CURRENT_DATE
);
```

**Portal verify:**
- **Tài chính > Công nợ**: 2 rows mới (settlement receivable 32B DEBIT + advance paid 10M CREDIT)
- Running balance = 32B - 10M = ~22B
- **Tài chính > Tổng quan**: Số dư hiện tại = +22B (nhà máy nợ), Tạm ứng = 10M, Đã thanh toán = 0, Chờ thanh toán = 22B
- **Tài chính > Aging**: "Hiện tại" bucket = 22B (entry date = hôm nay)

---

### Stage 7: Factory trả nợ → settlement paid + ledger credit

```sql
UPDATE b2b.settlements
SET status = 'paid', paid_at = NOW(), paid_amount = gross_amount,
    paid_by = (SELECT id FROM public.employees WHERE code LIKE 'HA-%' LIMIT 1)
WHERE code = 'TEST-QT-E2E-001';

INSERT INTO b2b.partner_ledger (
  partner_id, entry_type, debit, credit,
  reference_code, description, entry_date
) VALUES (
  '11111111-aaaa-1111-1111-000000000002',
  'payment_paid',
  0, (SELECT gross_amount FROM b2b.settlements WHERE code = 'TEST-QT-E2E-001') - 10000000,
  'TEST-QT-E2E-001-PAY',
  'Thanh toán Test E2E — chuyển khoản',
  CURRENT_DATE
);
```

**Portal verify:**
- **Tài chính > Thanh toán**: hiện settlement paid với badge ✓
- **Tổng quan**: Số dư = 0 (cân bằng), Đã thanh toán = 32B
- Deal detail: stage `... / Quyết toán done / Thanh toán done` — **tất cả 6 stages green**

---

## 🟢 FLOW 2 — Demand → Offer → Accept → Deal

### Stage 1: Factory publish demand

```sql
INSERT INTO public.b2b_demands (
  code, product_type, product_name, quantity_kg,
  price_min, price_max, price_unit, drc_min, drc_max,
  deadline, delivery_from, delivery_to,
  status, published_at, demand_type
) VALUES (
  'TEST-NCM-E2E-001',
  'mu_nuoc', 'Mủ nước',
  50000,  -- 50T
  18000, 25000, 'wet',  -- 18-25k/kg (giá ướt)
  55, 70,
  (NOW() + INTERVAL '7 days')::date,  -- deadline 7 ngày
  (NOW() + INTERVAL '3 days')::date,  -- giao sau 3 ngày
  (NOW() + INTERVAL '10 days')::date,
  'published', NOW(), 'purchase'
);
```

**Portal verify:**
- truonghv → **Cơ hội** → tab "Đang mở" → thấy `TEST-NCM-E2E-001` với 50T, 18-25k/kg, còn 7 ngày

---

### Stage 2: Partner nộp offer

**UI:** Click card → detail → form nộp offer:
- Offered quantity: 30T
- Offered price: 22k/kg
- Offered DRC: 60%
- Delivery date: +5 days

```sql
-- Simulate nếu chưa có form
INSERT INTO public.b2b_demand_offers (
  demand_id, partner_id, status,
  offered_quantity_kg, offered_price, offered_drc, offered_delivery_date,
  notes
)
SELECT
  id, '11111111-aaaa-1111-1111-000000000002', 'submitted',
  30000, 22000, 60, (NOW() + INTERVAL '5 days')::date,
  'TEST-OFFER-E2E-001'
FROM public.b2b_demands WHERE code = 'TEST-NCM-E2E-001';
```

**Portal verify:**
- Opportunities tab "Đã nộp" — count = 1, hiện demand đó với badge "Đã nộp"
- Tab "Đang mở" — count giảm

---

### Stage 3: Factory accept offer → auto tạo deal

```sql
-- Factory chấp nhận offer (normal flow) + tạo deal tự động
DO $$
DECLARE
  v_offer RECORD;
  v_deal_id UUID;
  v_deal_number TEXT := 'DL' || to_char(NOW(), 'YYMM') || '-E2E1';
BEGIN
  SELECT * INTO v_offer FROM public.b2b_demand_offers
  WHERE notes LIKE '%TEST-OFFER-E2E-001%' LIMIT 1;

  -- Tạo deal từ offer
  INSERT INTO b2b.deals (
    deal_number, partner_id, deal_type,
    quantity_kg, unit_price, total_value_vnd, expected_drc,
    product_name, product_code, price_unit,
    status, demand_id, offer_id
  ) VALUES (
    v_deal_number,
    v_offer.partner_id, 'purchase',
    v_offer.offered_quantity_kg, v_offer.offered_price,
    v_offer.offered_quantity_kg * v_offer.offered_price,
    v_offer.offered_drc,
    'Mủ nước', 'mu_nuoc', 'wet',
    'processing',
    v_offer.demand_id, v_offer.id
  )
  RETURNING id INTO v_deal_id;

  -- Update offer status + link deal
  UPDATE public.b2b_demand_offers
  SET status = 'accepted', deal_id = v_deal_id
  WHERE id = v_offer.id;

  RAISE NOTICE 'Created deal % from offer', v_deal_number;
END $$;
```

**Portal verify:**
- **Cơ hội** tab "Trúng thầu" — count = 1, hiện demand TEST-NCM-E2E-001 với badge "Trúng thầu"
- **Đơn hàng** — hiện deal mới DL...-E2E1 status "Đang xử lý", stages `Chốt done / Nhập kho current`

---

### Stage 4-7: Same as Flow 1 (Stock-in → QC → Accept → Settle → Pay)

Copy các stage tương ứng, đổi `v_deal_id` sang deal mới vừa tạo.

---

## 🔴 Bonus Flow — DRC Dispute

### Stage: QC detect DRC variance quá lớn → partner khiếu nại

```sql
-- Set QC với DRC lệch nhiều
UPDATE b2b.deals
SET actual_drc = 45,  -- giảm 5% so expected 50
    actual_weight_kg = 1600000,
    qc_status = 'warning'
WHERE id = 'bfb5c463-6222-402f-b461-f412453f70e0';
```

**Portal verify:**
- Deal detail tab QC → amber box "DRC dự kiến 50% vs thực tế 45% (-5%)"
- **Button đỏ "Khiếu nại DRC"** hiện (variance = 5% > 2% threshold)

**UI action:** Click button → navigate Finance > Disputes, modal opens với deal pre-filled.
Fill lý do "DRC lệch nhiều, yêu cầu kiểm tra lại" (≥10 ký tự) → Submit.

**DB check:**
```sql
SELECT dispute_number, status, expected_drc, actual_drc, drc_variance, reason
FROM b2b.drc_disputes
WHERE deal_id = 'bfb5c463-6222-402f-b461-f412453f70e0'
ORDER BY created_at DESC LIMIT 1;
```

**Kỳ vọng:** dispute status=`open`, drc_variance auto = -5 (actual - expected).

**Side effect — Cross #2 lock settlement:**
- Settlement tương ứng tự set `locked_by_dispute = true`
- Partner Finance > Settlements → settlement hiện badge "Đang bị khóa"
- Factory không submit/approve được cho đến khi resolve dispute

---

## 🎯 PHASE TEST MATRIX

| Flow | Stage | DB inject | Portal UI check | Cross-module ERP |
|---|---|---|---|---|
| 1 | 1A Booking | chat_messages insert | Chat card appear | ERP chat realtime notify |
| 1 | 1B Confirm | deal insert + booking_id | Orders → deal xuất hiện | ERP Deal list update |
| 1 | 2 Stock-in | stock_in_orders + deal_id link | Orders tab "Nhập kho" | ERP WMS stock list |
| 1 | 3 QC | deal UPDATE drc/weight | Orders tab "QC" pill | Audit log entry |
| 1 | 4 Accept + Advance | deal status + advance insert | Finance > Tạm ứng | ERP Advance list |
| 1 | 5 Settlement | settlements insert | Finance > Quyết toán | ERP Settlement list |
| 1 | 6 Approve + Ledger | settlement approve + 2 ledger | Finance > Công nợ | ERP Ledger report |
| 1 | 7 Payment | settlement paid + credit ledger | Finance > Thanh toán | ERP Payment history |
| 2 | 1 Demand publish | demand insert | Cơ hội Đang mở | ERP Demand list |
| 2 | 2 Offer | offer insert | Cơ hội Đã nộp | ERP Offer list |
| 2 | 3 Accept → Deal | deal + offer.deal_id | Cơ hội Trúng thầu + Đơn hàng | ERP Deal list |
| Bonus | DRC Dispute | dispute insert via modal | Finance > Khiếu nại | ERP Dispute list + settlement lock |

---

## 📋 EXPECTED STATE sau full E2E

Sau khi chạy đủ Flow 1 stages 1→7:

**Deal DL2604-7B5P:**
```
status: settled
stock_in_count: 1
actual_drc: 52
actual_weight_kg: 1,600,000
final_value: 32,000,000,000
qc_status: passed
```

**Portal truonghv:**
```
Home KPIs: 1 deal settled, 1.6K T tháng, 32 tỷ tháng, DRC 52%
Home balance: 0 đ (đã cân bằng)
Orders: DL2604-7B5P status="Hoàn tất", all 6 stages done
Finance Overview:
  - Số dư: 0 đ
  - Tạm ứng: 10M
  - Đã thanh toán: 32B
  - Chờ thanh toán: 0
Finance Ledger: 3 entries (settlement 32B DEBIT, advance 10M CREDIT, payment 22B CREDIT)
```

---

## 🚨 Auto cleanup (sau mỗi test run)

Dùng SQL [0.3 Cleanup snippet] ở trên. Hoặc reset hoàn toàn:

```sql
-- Reset deal DL2604-7B5P về trạng thái ban đầu
UPDATE b2b.deals
SET status = 'processing',
    actual_drc = NULL, actual_weight_kg = NULL, final_value = NULL,
    qc_status = 'pending',
    stock_in_count = 0
WHERE id = 'bfb5c463-6222-402f-b461-f412453f70e0';
```

---

## Issues sẽ phát hiện

Khi chạy E2E, có thể hit:

1. **Stage 3 CHECK constraint** `chk_deals_drc_requires_stockin` — nếu UPDATE actual_drc trước khi stock_in_count > 0 sẽ reject. Fix: set stock_in_count trước.

2. **Stage 4 Audit trigger** — UPDATE deal fire log_deal_changes trigger. Nếu fail → disable trigger tạm.

3. **Stage 5 GENERATED column** — settlement.gross_amount, remaining_amount tự tính. Không INSERT.

4. **Stage 6 UNIQUE ledger** `idx_ledger_idempotency` — nếu reference_code trùng → insert fail. Dùng unique test code.

5. **Bonus Dispute RPC** — `partner_raise_drc_dispute` verify partner ownership qua auth.uid(). Login phải đúng truonghv.

---

## Next steps

1. Chuẩn bị test data (Prerequisites 0.1-0.3)
2. Chạy Flow 1 stage-by-stage, screenshot UI sau mỗi stage
3. Chạy Flow 2 (có thể song song nếu tạo deal khác)
4. Chạy Bonus Dispute
5. Verify Expected State
6. Cleanup → reset
7. Report bugs phát hiện + fix Sprint

Ước tính effort: **1-2h** chạy toàn bộ E2E + verify.
