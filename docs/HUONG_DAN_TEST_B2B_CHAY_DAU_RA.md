# 🧪 HƯỚNG DẪN TEST LUỒNG "CHẠY ĐẦU RA" — ERP

> **B2B Deal lifecycle 10 bước — DRC after production**
> Đối tượng: Minh LD + Phú LV + Đại lý partner
> Phase 1-3 fixes đã ship + SQL audit verified 2026-05-23

---

## 🎯 Tổng quan luồng "Chạy đầu ra"

"Chạy đầu ra" (DRC after production) là loại deal mua mủ tươi từ đại lý — KHÁC với "Mua đứt":

| So sánh | Mua đứt | Chạy đầu ra |
|---|---|---|
| **Giá chốt** | Giá VNĐ/kg ngay lúc chốt | Giá tạm tính, chốt sau SX |
| **DRC dùng để tính giá** | Sample DRC lúc nhận hàng | Actual DRC sau khi SX TP |
| **Số bước lifecycle** | 4 bước (Chốt→Duyệt→Nhập kho→Thanh toán) | **10 bước** (đầy đủ SX) |
| **Khi nào dispute** | Khi sample sai > 3% với KH yêu cầu | Khi actual_drc lệch sample_drc > 3% |
| **Use case** | Mủ chuẩn, KH biết DRC | Mủ tạp, DRC không chắc |

### 10 bước lifecycle Chạy đầu ra

```
1.  Đã cân          — Weighbridge IN (app cân tại TL/PD)
2.  Đã nhập kho     — Auto stock_in từ ticket (trigger)
3.  QC sample DRC   — Factory bấm "Nhập sample DRC"      ← UI mới Phase 2
4.  BGĐ duyệt       — Status: processing → accepted
5.  Tạm ứng         — Advance + Partner ack
6.  Bắt đầu SX      — Factory bấm "Bắt đầu sản xuất"     ← UI mới Phase 2
7.  Ra TP           — Factory bấm "Hoàn tất sản xuất"    ← UI mới Phase 2
8.  QC final        — Auto compute actual_drc + dispute check
9.  Quyết toán      — Factory tạo settlement
10. Thanh toán      — Paid → status=settled
```

---

## ⚙️ Pre-conditions

Trước khi bắt đầu test, đảm bảo:

1. ✅ Anh login với tài khoản **Minh LD** (`minhld@huyanhrubber.com`) — có toàn quyền
2. ✅ Có 1 đại lý đã verified (vd Goutam Enterprises, Apollo, hoặc partner test)
3. ✅ TEST MODE email đang ON (chỉ Minh nhận mail) — em đã verify
4. ✅ Sample deal sẵn để test: **DL2605-SI2O** (110 tấn mủ tạp, 24,000 đ/kg) — đã ở ERP

> 💡 **SQL verify (2026-05-23):** Schema có đủ 8/8 cột lifecycle, trigger `trg_drc_variance_dispute` active, `b2b_notifications` accept 3 type mới. Production-ready.

---

## 🗺️ Truy cập màn hình Deal

**Sidebar bên trái** → group "**B2B THU MUA**" → click các menu:

| Menu | URL | Mục đích |
|---|---|---|
| Chat Đại lý | `/b2b/chat` | Tạo Deal mới từ booking đại lý |
| Nhu cầu mua | `/b2b/demands` | Đăng nhu cầu mua chiêu mộ đại lý |
| Đại lý | `/b2b/partners` | Quản lý đại lý |
| **Deals** | `/b2b/deals` | ★ Danh sách deal — click row → detail |
| Đấu giá | `/b2b/auctions` | Tạo đấu giá |
| Nhập kho | `/b2b/rubber-intake` | Wizard intake (outright/walkin/production) |
| Công nợ | `/b2b/ledger` | Sổ cái đại lý |
| Quyết toán | `/b2b/settlements` | Phiếu quyết toán |

> Bước test này tập trung vào **`/b2b/deals/{id}`** — Drawer/Page Detail của Deal.

### Tabs trong DealDetailPage

```
[ Thông tin ] [ Nhập kho (N) ] [ QC ] [ Giao hàng ] [ Tạm ứng ] [ Hợp đồng ] [ 🚀 Sản xuất ]
                                                                              ↑
                                                                  Chỉ hiện khi purchase_type=drc_after_production
```

---

## TC-1 (Bước 1-2): Cân + Nhập kho

**Mục đích:** tạo phiếu cân IN + auto stock-in vào kho NVL

### Action

1. Mở **app cân** (Tân Lâm hoặc Phong Điền)
2. Chọn deal `DL2605-SI2O` từ dropdown
3. Cân lần 1 (gross) → save
4. Cân lần 2 (tare) → tính NET
5. Bấm Submit ticket → auto-trigger stock_in

### Verify trong ERP

- Mở `/b2b/deals/{id}` → tab "**Nhập kho (1)**" — badge số stock_in
- Thấy 1 row `stock_in_order` status=`confirmed`
- Tab "**Sản xuất**" — timeline bước 1 "Đã cân" + bước 2 "Đã nhập kho" → done (xanh)

### SQL verify

```sql
SELECT deal_number, stock_in_count, status
FROM b2b.deals WHERE deal_number = 'DL2605-SI2O';
-- Expected: stock_in_count > 0

SELECT code, ticket_type, status, completed_at
FROM weighbridge_tickets
WHERE deal_id = '<deal_id>';
-- Expected: 1 row ticket_type='in' status='completed'
```

---

## TC-2 (Bước 3): Nhập Sample DRC ⭐ UI MỚI

**Mục đích:** QC đo mẫu mủ vừa nhập kho, ghi sample DRC để BGĐ có cơ sở duyệt

### Action

1. Vào `/b2b/deals/{deal_id}` (vd `/b2b/deals/ad548d48-...`)
2. Click tab "**🚀 Sản xuất**" — chỉ hiện khi `purchase_type=drc_after_production`
3. Thấy **Timeline 10 stages** + section button bên dưới
4. Click button **XANH NHẠT** `🧪 Nhập sample DRC`
5. Modal mở:
   - Alert info: "QC lấy mẫu mủ ngay sau khi nhập kho..."
   - Input "Sample DRC (%)" autofocus
   - Nhập `35.5` → click **"Lưu sample DRC"**

### Verify

- ✅ Toast xanh "Đã ghi sample DRC = 35.5%"
- ✅ Timeline cập nhật: stage "QC sample DRC" → done
- ✅ Button "Nhập sample DRC" biến mất (đã xong)
- ✅ Email Minh LD nhận notification "🧪 Đã ghi nhận Sample DRC"

### Edge cases (em đã code)

| Input | Behavior |
|---|---|
| DRC = 0 hoặc 101 | Modal validate fail "DRC ∈ (0, 100]" |
| `stock_in_count = 0` | Service throw "Phải nhập kho ít nhất 1 batch trước" |
| `status != processing` | Service throw "Phải ở status=processing" |
| `purchase_type != drc_after_production` | Service throw "Chỉ áp dụng cho Chạy đầu ra" |

---

## TC-3 (Bước 4): BGĐ duyệt Deal

**Mục đích:** Trung/Huy/Minh LD duyệt → status: processing → accepted

### Action

1. Trên DealDetailPage, header section thấy nút **"Duyệt Deal"** (chỉ khi status=processing + đủ điều kiện)
2. HOẶC vào `/b2b/chat` → tìm DealCard trong room → click "Duyệt Deal" (xanh)
3. Modal "Duyệt Deal" mở:
   - Hiển thị info deal
   - Optional: `final_price` + notes
   - Click "Duyệt"

### Verify

- ✅ Status badge đổi: Processing (cam) → Đã duyệt (xanh)
- ✅ Timeline stage "BGĐ duyệt" → done
- ✅ Tab "Sản xuất" — bước "Tạm ứng" → current

### SQL verify audit log

```sql
SELECT op, changed_fields,
       old_data->>'status' AS old_status,
       new_data->>'status' AS new_status,
       changed_at
FROM b2b.deal_audit_log
WHERE deal_id = '<deal_id>'
ORDER BY changed_at DESC LIMIT 3;
-- Expected: 1 row op='UPDATE' old=processing new=accepted
```

> ⚠ **Schema gotcha:** Table audit log ở `b2b.deal_audit_log` (KHÔNG phải `public.deal_audit_log`). Trigger `trg_deal_audit` tự fire khi UPDATE deal.

---

## TC-4 (Bước 5): Tạm ứng

**Mục đích:** Factory tạm ứng tiền cho đại lý đi mua nguyên liệu

### Action ERP

1. DealDetailPage tab "**💰 Tạm ứng**"
2. HOẶC DealCard chat → click "Ứng thêm" (deal status=accepted)
3. Modal mở:
   - Amount: `1,000,000,000 đ`
   - Purpose: "Mua nguyên liệu mủ tươi"
   - Payment method: cash / bank_transfer
   - Submit

### Action Partner Portal

1. Đại lý vào **`b2b.huyanhrubber.vn`** (Portal)
2. Tab **Tài chính → Tạm ứng**
3. Click "**Xác nhận đã nhận**" → status: pending → acknowledged

### Verify

- ✅ `b2b_advances` 1 row `status=acknowledged` (sau ack)
- ✅ DealCard ERP hiện "Đã ứng 1 lần"
- ✅ Timeline stage "Tạm ứng" → done

---

## TC-5 (Bước 6): Bắt đầu sản xuất ⭐ UI MỚI

**Mục đích:** nhà máy chính thức start SX lô hàng đại lý

### Action

1. Vào `/b2b/deals/{id}` → tab "**Sản xuất**"
2. Sau khi `sample_drc + accepted + advance ack` → thấy button **CAM** `🏭 Bắt đầu sản xuất`
3. Click → Modal confirm hiện:
   - Deal number
   - NL đầu vào (kg)
   - Sample DRC đã chốt
   - Cảnh báo "Sau khi bấm: `production_started_at = NOW()`"
4. Click **"Bắt đầu SX"**

### Verify

- ✅ Toast "Đã bắt đầu sản xuất Deal DL2605-SI2O"
- ✅ DB `b2b_deals.production_started_at = NOW()`
- ✅ Timeline stage "Bắt đầu sản xuất" → done, "Ra thành phẩm" → current
- ✅ Email Minh nhận notification "🏭 Nhà máy đã bắt đầu sản xuất"

### Edge cases

| Trạng thái sai | Service phản hồi |
|---|---|
| `status != accepted` | "Phải ở status=accepted" |
| `production_started_at != null` (đã start) | "Đã start từ trước" |
| No advance acknowledged | "Cần ack advance trước" |
| `sample_drc` null | (button không hiện) |

---

## TC-6 (Bước 7-8): Hoàn tất SX + QC final ⭐ UI MỚI 🔴 CRITICAL

**Mục đích:** nhập KL thành phẩm sau SX → ERP tự compute `actual_drc` + giá cuối + raise dispute nếu lệch sample > 3%

> ⚠ **ĐÂY LÀ BƯỚC QUAN TRỌNG NHẤT** — quyết định giá cuối thanh toán cho đại lý.

### Scenario A — Variance OK (≤ 3%)

1. Tab "Sản xuất" — sau khi `production_started_at` có → thấy button **XANH LÁ** `✅ Hoàn tất sản xuất + QC final`
2. Click → Modal mở:
   - Info: NL=110,000 kg, đơn giá 24,000 đ/kg, sample DRC=35.5%
   - Input "Khối lượng thành phẩm (kg)" autofocus
   - Nhập `39,050`
3. **Preview LIVE** hiện:
   - Actual DRC = 39,050 / 110,000 × 100 = **35.50%**
   - Variance vs Sample = **0.00%** (OK)
   - Giá cuối = 110,000 × 35.5% × 24,000 = **937,200,000 đ**
   - Alert xanh "Preview giá cuối"
4. Click **"Chốt KL thành phẩm + Auto-compute giá cuối"**

#### Verify Scenario A

- ✅ Toast "SX xong: actual DRC=35.50%, giá cuối=937,200,000đ"
- ✅ DB updated: `actual_drc=35.50`, `finished_product_kg=39050`, `final_value=937200000`
- ✅ Timeline stage "Ra thành phẩm" + "QC final" → done
- ✅ **KHÔNG có dispute** mới (variance < 3%)
- ✅ Email Minh "✅ Sản xuất xong — giá cuối chốt"

### Scenario B — Variance > 3% (auto-dispute)

Repeat TC-6 với `finished_product_kg = 30,800` kg:

- Actual DRC = 30,800 / 110,000 = **28.00%**
- Variance vs sample 35.5% = **7.50%** (> 3% → DISPUTE!)
- Giá cuối giảm = 110,000 × 28% × 24,000 = **739,200,000 đ**
- Preview Alert **VÀNG** (warning) "Variance > 3% → auto-raise dispute"

#### Verify Scenario B

- ✅ Toast WARNING "Variance > 3% → auto-raise dispute!"
- ✅ `b2b_drc_disputes` có 1 row mới `status=open` (trigger `trg_drc_variance_dispute` fire)
- ✅ Email Minh "⚠️ Sản xuất xong — variance DRC > 3% — vui lòng review"

#### SQL verify dispute

```sql
SELECT dispute_number, expected_drc, actual_drc,
       drc_variance, reason, status, raised_at
FROM b2b.drc_disputes
WHERE deal_id = '<deal_id>'
ORDER BY raised_at DESC LIMIT 1;
-- Expected (Scenario B): 1 row status=open, drc_variance = 7.5%
```

> 🔬 **Trigger name thực:** `trg_drc_variance_dispute` (KHÔNG phải tên "P16" trong code comments). Trigger check `abs(actual_drc - sample_drc) > 3%` thì auto INSERT vào `b2b.drc_disputes`.

---

## TC-7 (Bước 9-10): Quyết toán + Thanh toán

**Mục đích:** Factory tạo settlement + payment final

### Action

1. DealCard chat hoặc DealDetailPage → click **"Tạo quyết toán"** (purple)
2. Modal auto-fill `final_value` đã tính ở TC-6
3. Confirm → status: draft → pending_approval
4. Manager approve → status: approved
5. Mark paid khi thanh toán xong → status: paid

### Verify

- ✅ `b2b_settlements` 1 row `status=paid`
- ✅ `b2b_deals.status = settled`
- ✅ Timeline stage "Quyết toán" + "Thanh toán" → done (full xanh 10/10)

---

## 📋 Test Matrix tóm tắt

| TC | Stage | Trước | Sau | UI Phase 2? | Notify Partner? |
|---|---|---|---|---|---|
| 1 | Cân + Nhập kho | new | `stock_in_count>0` | — | — |
| 2 | QC sample DRC | `stock_in>0` | `sample_drc` set | ✅ | ✅ |
| 3 | BGĐ duyệt | processing | accepted | — (sẵn) | — |
| 4 | Tạm ứng | accepted | advance ack | — (sẵn) | — |
| 5 | Start SX | accepted+adv | `production_started_at` | ✅ | ✅ |
| 6 | Finish SX + QC | production_started | `actual_drc + final_value` | ✅ | ✅ (+dispute) |
| 7 | Settlement + Paid | actual_drc set | settled | — (sẵn) | — |

---

## ⚠️ Sự cố thường gặp

### Sự cố 1: Tab "Sản xuất" KHÔNG hiện

**Nguyên nhân:** `purchase_type` của deal != "drc_after_production"

**Verify:**
```sql
SELECT deal_type, purchase_type FROM b2b.deals
WHERE deal_number = 'DL2605-SI2O';
-- Expected: processing | drc_after_production
```

**Fix:** Phase 1 code đã sync `deal_type→purchase_type`. Nếu deal cũ chưa sync, run migration `b2b_sync_purchase_type_v16.sql`.

### Sự cố 2: Button "Nhập sample DRC" KHÔNG hiện

**Nguyên nhân:** `stock_in_count = 0` (chưa cân + nhập kho TC-1)

**Fix:** hoàn thành TC-1 trước → cân + auto stock_in.

### Sự cố 3: Button "Bắt đầu sản xuất" KHÔNG hiện

**Nguyên nhân:** Một trong các điều kiện chưa đủ:

- `status != accepted` (chưa BGĐ duyệt — TC-3)
- `sample_drc = null` (chưa TC-2)
- Chưa có advance acknowledged (chưa hoặc đại lý chưa ack TC-4)

### Sự cố 4: Hoàn tất SX báo lỗi RLS permission denied

**Nguyên nhân:** User login không có quyền UPDATE `b2b.deals`

**Fix:** Login với role employee + có dept thuộc factory.

### Sự cố 5: Email notification không nhận

Nguyên nhân khả dĩ:

- Email tại Minh — TEST MODE đang ON nên chỉ Minh nhận (không phải bug)
- Check Spam folder
- Edge function `b2b-deal-notify` chưa deploy: `npx supabase functions deploy b2b-deal-notify`

---

## 🎯 Acceptance criteria — Test PASS khi:

- ✅ Cả 7 TC chạy hết không có lỗi
- ✅ Timeline progression đúng 10 stages
- ✅ Final value match công thức: `quantity_kg × actual_drc% × unit_price`
- ✅ Dispute auto-raise khi variance > 3%
- ✅ Partner notifications 3 events (sample/start/finish)
- ✅ Settlement `final_value` = deal.final_value
- ✅ Status flow đúng: `processing → accepted → settled`

---

## 📝 Test execution log

| Ngày | Tester | TC | Kết quả | Ghi chú |
|---|---|---|---|---|
| 2026-05-23 | Claude SQL audit | Schema | ✅ 15/17 | Production-ready, 2 typo guide đã fix |
| | (chưa test) | TC-1 → TC-7 | — | Đợi anh test UI |

---

## 📞 Liên hệ khi có vấn đề

- UI lỗi / button không hiện / SQL fail → báo **Minh LD**
- Edge case nghiệp vụ chưa cover (vd multi-batch, multi-pool) → thảo luận BGĐ trước khi production

---

## 🛠 Để gen file .docx (nếu cần)

```bash
python docs/generate_b2b_chay_dau_ra_guide.py
# Output: docs/HUONG_DAN_TEST_B2B_CHAY_DAU_RA.docx
```
