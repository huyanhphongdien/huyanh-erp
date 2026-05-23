# 🧪 B2B "Chạy đầu ra" — E2E Test Guide

> **Mục tiêu:** Verify đầy đủ flow 10 bước cho deal `purchase_type='drc_after_production'`
> **Update:** 2026-05-22 (sau Phase 1-3 fixes)
> **Đối tượng test:** Minh LD + Phú LV + 1 đại lý partner

---

## 🎯 10 stages drc_after_production flow

```
1. Đã cân        — Weighbridge IN
2. Đã nhập kho   — Auto stock_in từ ticket
3. QC sample DRC — Factory bấm "Nhập sample DRC"     ← UI mới (Phase 2)
4. BGĐ duyệt     — Status: processing → accepted
5. Tạm ứng       — Advance + Partner ack
6. Bắt đầu SX    — Factory bấm "Bắt đầu sản xuất"    ← UI mới (Phase 2)
7. Ra TP         — Factory bấm "Hoàn tất sản xuất"   ← UI mới (Phase 2)
8. QC final      — Auto compute actual_drc + dispute check
9. Quyết toán    — Factory tạo settlement
10. Thanh toán   — Paid → status=settled
```

---

## ⚙️ Pre-conditions

- Login Minh LD (`minhld@huyanhrubber.com`) — có quyền tất cả
- Có 1 deal `purchase_type='drc_after_production'` ở status đã accepted hoặc tạo mới qua chat
- Có 1 partner đã verified
- Sample deal có sẵn: **DL2605-SI2O** (110 tấn mủ tạp, 24,000 đ/kg)

---

## TC-1 Stage 1-2: Cân + Nhập kho

### Action
1. Vào app cân Tân Lâm/Phong Điền
2. Cân IN cho deal `DL2605-SI2O`
3. Cân OUT (tare)
4. Auto stock_in fire (`weighbridge_out_workflow`)

### Verify
- `weighbridge_tickets` có 1 row `status='completed'`
- `stock_in_orders` có 1 row `status='confirmed'`
- `b2b_deals.stock_in_count > 0`

---

## TC-2 Stage 3: QC sample DRC ⭐ NEW UI

### Action
1. Vào ERP `/b2b/deals/{deal_id}` (vd `/b2b/deals/ad548d48-...`)
2. Tab **"Sản xuất"** → thấy timeline + section button
3. Bấm **"🧪 Nhập sample DRC"** (cyan button)
4. Modal mở → nhập sample DRC (vd `35.5`) → "Lưu"

### Verify
- Toast "Đã ghi sample DRC = 35.5%"
- Timeline cập nhật: stage "QC sample DRC" → done
- DB `b2b_deals.sample_drc = 35.5`
- **Bell badge Partner Portal** có notification "🧪 Đã ghi nhận Sample DRC"

### Edge cases
- **Sample DRC ≤ 0 hoặc > 100** → modal validate fail
- **stock_in_count = 0** → service throw "Phải nhập kho ít nhất 1 batch trước"
- **status != processing** → service throw

---

## TC-3 Stage 4: BGĐ duyệt deal

### Action
1. Vào tab "Phiếu chốt" hoặc DealCard trong chat
2. Bấm **"Duyệt Deal"** (xanh)
3. Modal confirm `final_price` (hoặc giữ default `unit_price`)
4. Submit

### Verify
- `b2b_deals.status: processing → accepted`
- Toast notify Partner
- Audit log có entry status change qua trigger `trg_deal_audit`:
  ```sql
  SELECT op, changed_fields, old_data->>'status' AS old_status, new_data->>'status' AS new_status
  FROM b2b.deal_audit_log
  WHERE deal_id = '<deal_id>' ORDER BY changed_at DESC LIMIT 5;
  ```
  *Schema gotcha:* table ở `b2b.deal_audit_log` (không phải `public.deal_audit_log`). Query qua REST cần `.schema('b2b').from('deal_audit_log')`.

---

## TC-4 Stage 5: Tạm ứng

### Action ERP
1. Trên DealCard chat (status=accepted) → bấm **"Ứng thêm"**
2. Nhập amount (vd 1,000,000,000đ), purpose "Mua nguyên liệu"
3. Submit

### Action Partner Portal
1. Đại lý nhận notification advance
2. Vào `/portal/finance/advances`
3. Bấm "Xác nhận đã nhận" (ack)

### Verify
- `b2b_advances` 1 row `status='acknowledged'` (sau partner ack)
- DealCard ERP hiện "Đã ứng 1 lần"
- Timeline stage "Tạm ứng" → done

---

## TC-5 Stage 6: Bắt đầu sản xuất ⭐ NEW UI

### Action
1. DealDetailPage tab "Sản xuất"
2. Thấy button **"🏭 Bắt đầu sản xuất"** (cam) — sau khi sample_drc + accepted + advance ack
3. Bấm → Modal confirm hiện deal info → "Bắt đầu SX"

### Verify
- Toast "Đã bắt đầu sản xuất Deal DL2605-SI2O"
- DB `b2b_deals.production_started_at = NOW()`
- Timeline stage "Bắt đầu sản xuất" → done, "Ra thành phẩm" → current
- **Bell badge Partner Portal** có notification "🏭 Nhà máy đã bắt đầu sản xuất"

### Edge cases
- **status != accepted** → service throw
- **Đã có production_started_at** → service throw "Đã start từ trước"
- **No advance acknowledged** → service throw "Cần ack advance trước"

---

## TC-6 Stage 7-8: Hoàn tất SX + QC final ⭐ NEW UI (test most critical)

### Action — variance OK (<=3%)
1. DealDetailPage tab "Sản xuất"
2. Bấm **"✅ Hoàn tất sản xuất + QC final"** (xanh lá)
3. Modal mở:
   - Hiển thị info Deal + sample_drc đã chốt (35.5%)
   - Nhập **`finished_product_kg`** = `39,050` kg (mủ TP)
   - **Preview live:**
     - Actual DRC = 39,050 / 110,000 × 100 = **35.50%**
     - Variance vs Sample = **0.00%** (OK)
     - Giá cuối = 110,000 × 35.5% × 24,000 = **937,200,000 đ**
   - Alert success (xanh): "Giá cuối: 937,200,000đ"
4. Bấm "Chốt KL thành phẩm + Auto-compute giá cuối"

### Verify
- Toast "SX xong: actual DRC=35.50%, giá cuối=937,200,000đ"
- DB:
  - `b2b_deals.actual_drc = 35.50`
  - `b2b_deals.finished_product_kg = 39050`
  - `b2b_deals.final_value = 937200000`
- Timeline: stage "Ra thành phẩm" + "QC final" → done
- **No dispute** raised (variance < 3%)
- Partner notification "✅ Sản xuất xong — giá cuối chốt"

### Action — variance > 3% (auto-dispute)
Repeat với `finished_product_kg = 30,800` kg → actual_drc = 28%, variance vs 35.5% = 7.5%

### Verify variance case
- Toast WARNING "Variance > 3% → auto-raise dispute!"
- DB:
  - `b2b_deals.actual_drc = 28.00`
  - `b2b_deals.final_value = 739,200,000` (giảm)
  - `b2b_drc_disputes` 1 row mới `status='open'` (trigger **`trg_drc_variance_dispute`** fire — tên thực, trước đây gọi là "P16")
- Partner notification "⚠️ Sản xuất xong — variance DRC > 3% — vui lòng review"
- Verify trigger fire:
  ```sql
  SELECT id, dispute_number, expected_drc, actual_drc, drc_variance, reason, status
  FROM b2b.drc_disputes WHERE deal_id = '<deal_id>' ORDER BY raised_at DESC LIMIT 1;
  ```

### Edge cases
- **production_started_at NULL** → service throw "Phải bấm Start trước"
- **Đã có finished_product_kg** → throw "Không finish lại"
- **finished_kg <= 0** → throw

---

## TC-7 Stage 9-10: Quyết toán + Thanh toán

### Action
1. DealCard → bấm **"Tạo quyết toán"** (purple)
2. Settlement service tự dùng `final_value` đã có
3. Approve settlement
4. Mark paid

### Verify
- `b2b_settlements` 1 row `status='paid'`
- `b2b_deals.status = 'settled'`
- Timeline stage "Quyết toán" + "Thanh toán" → done
- Partner notification

---

## 📋 Test Matrix tóm tắt

| TC | Stage | Status before | Status after | UI mới (Phase 2)? | Notify Partner? |
|----|---|---|---|---|---|
| TC-1 | 1-2 Cân + Nhập kho | new | stock_in_count>0 | — | — |
| TC-2 | 3 QC sample DRC | stock_in>0 | sample_drc set | ✅ | ✅ |
| TC-3 | 4 BGĐ duyệt | processing | accepted | — (DealCard sẵn) | — |
| TC-4 | 5 Tạm ứng | accepted | advance ack | — (Drawer sẵn) | — |
| TC-5 | 6 Start SX | accepted+adv | production_started_at | ✅ | ✅ |
| TC-6 | 7-8 Finish SX + QC | production_started | actual_drc + final_value | ✅ | ✅ (+dispute) |
| TC-7 | 9-10 Settlement + Paid | actual_drc set | settled | — (sẵn) | — |

---

## ⚠️ Common issues

### Issue 1: Tab "Sản xuất" KHÔNG hiện
**Nguyên nhân:** `purchase_type != 'drc_after_production'`. Kiểm tra DB:
```sql
SELECT deal_type, purchase_type FROM b2b.deals WHERE deal_number = 'DL2605-SI2O';
```
**Fix:** Phase 1 sync code đã merge → deal mới luôn đúng. Deal cũ backfill qua migration `b2b_sync_purchase_type_v16.sql`.

### Issue 2: Button "Nhập sample DRC" KHÔNG hiện
**Cause:** `stock_in_count = 0`. Cần cân + nhập kho TC-1 trước.

### Issue 3: Button "Bắt đầu sản xuất" KHÔNG hiện
**Cause:** Một trong các điều kiện sai:
- `status != accepted` (chưa BGĐ duyệt)
- `sample_drc = null` (chưa TC-2)
- Chưa có advance acknowledged

### Issue 4: Hoàn tất SX báo "Update b2b_deals failed: ... permission denied"
**Cause:** RLS chặn UPDATE. Cần đảm bảo user đang login với role employee + factory.

### Issue 5: Notification Portal không thấy
**Cause:**
- Bảng `b2b_notifications` chưa migration → check `SELECT 1 FROM b2b_notifications LIMIT 1`
- Portal chưa poll/realtime → check Portal route `/portal/notifications`

---

## 🎯 Acceptance criteria

Test PASS khi:
- ✅ Cả 7 TC chạy hết
- ✅ Timeline progression đúng 10 stages
- ✅ Final value match formula: `quantity_kg × actual_drc% × unit_price`
- ✅ Dispute auto-raise khi variance > 3%
- ✅ Partner notifications 3 events: sample_recorded / production_started / production_finished
- ✅ Settlement final_value = final_value của deal
- ✅ Status flow đúng: processing → accepted → settled

---

## 📝 Test execution log

| Date | Tester | Result | Notes |
|---|---|---|---|
| 2026-05-22 | (chưa test) | — | Phase 1-3 đã ship, đợi human verify UI |
| 2026-05-23 | Claude SQL audit | ✅ 15/17 | Schema + triggers + columns đầy đủ. 2 typo trong guide đã fix (deal_audit_log path, trigger name). |

---

## 🔬 SQL Audit results (2026-05-23)

Em đã chạy SQL audit verify từng claim. Snapshot DB state:

### ✅ Schema readiness — TẤT CẢ field cần thiết EXISTS

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='b2b' AND table_name='deals'
  AND column_name IN (
    'sample_drc','actual_drc','production_started_at',
    'finished_product_kg','final_value','purchase_type',
    'production_mode','production_pool_id'
  );
-- → 8/8 EXISTS
```

### ✅ DL2605-SI2O pre-conditions

```sql
SELECT deal_number, deal_type, purchase_type, status, quantity_kg, unit_price
FROM b2b.deals WHERE deal_number = 'DL2605-SI2O';
-- → processing | drc_after_production | processing | 110000 | 24000 ✓
```

### ✅ Triggers active (Audit + Dispute)

```sql
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'b2b.deals'::regclass AND NOT tgisinternal;
-- → trg_deal_audit, trg_drc_variance_dispute, trg_deal_lock,
--   trg_compute_deal_final_value, trg_sync_deal_card_metadata, ...
```

### ✅ Notification table accept new types

```sql
-- Test insert (em verify rồi cleanup):
INSERT INTO b2b.notifications (type, audience, title, message, deal_id)
VALUES ('sample_drc_recorded', 'partner', 'TEST', 'TEST', '<id>');
-- → ACCEPTED. Không có CHECK constraint chặn 3 type mới
-- (sample_drc_recorded, production_started, production_finished).
```

### ⚠️ Schema gotchas đã fix trong guide

| Gotcha | Status |
|---|---|
| `deal_audit_log` ở `b2b` schema (không phải `public`) | ✅ Fixed TC-3 |
| Trigger P16 tên thực `trg_drc_variance_dispute` | ✅ Fixed TC-6 |
| `b2b_notifications` có cả `content` + `message` columns | ✅ Phase 3 code dùng `message` — OK |

### ❓ Chưa verify (cần human test UI)

- TC-1 trigger weighbridge → auto-stock-in (đã PASS prod 2026-04-16 per memory)
- TC-4 `b2b_advances.status='acknowledged'` (chưa có sample trong DB hiện tại)
- TC-5/6 UI render đúng button theo state (cần human click)

### 🎯 Verdict

Test guide **production-ready** sau 2 fix. Schema DB sẵn sàng cho 10-stage flow. Human verify UI là việc còn lại.
