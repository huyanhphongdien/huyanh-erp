# HƯỚNG DẪN TEST LUỒNG B2B HOÀN CHỈNH

**Dự án:** Huy Anh Rubber ERP v8
**Ngày:** 18/03/2026
**Mục tiêu:** Test end-to-end từ Chat → Deal → Cân xe → Nhập kho → QC → Quyết toán → Công nợ

---

## CHUẨN BỊ

### Tài khoản test

| Hệ thống | URL | Đăng nhập |
|-----------|-----|-----------|
| ERP Nhà máy | `http://localhost:5173` | `khuyennt@huyanhrubber.com` hoặc `duyhh@huyanhrubber.com` |
| Portal Đại lý | `http://b2b.huyanhrubber.vn` | Tài khoản đại lý test |
| App Cân xe | `http://localhost:5174` hoặc `can.huyanhrubber.vn` | PIN: `1234` |

### Kiểm tra database

Đảm bảo đã chạy các SQL migration:
- ✅ `phase4_deal_wms.sql` — Deal ↔ WMS columns
- ✅ `wms_rubber_fields.sql` — Rubber-specific fields
- ✅ `p8_production_orders.sql` — Production tables
- ✅ `p9_blending.sql` — Blending tables
- ✅ `b2b_demands.sql` — Demands + Offers tables
- ✅ Scale operators SQL — Tài khoản cân xe

---

## LUỒNG 1: MUA ĐỨT (Purchase) — Đầy đủ

### Bước 1: Tạo Nhu cầu mua (ERP)

```
ERP → Menu "Nhu cầu mua" → "Tạo nhu cầu"
```

| Field | Giá trị test |
|-------|-------------|
| Loại | Mua đứt |
| Sản phẩm | Mủ đông |
| Số lượng | 10,000 kg (10 tấn) |
| DRC tối thiểu | 30% |
| DRC tối đa | 60% |
| Giá sàn | 40,000 đ/kg |
| Giá trần | 50,000 đ/kg |
| Hạn chót | (1 tuần sau) |
| Vùng | Bình Phước |
| Ưu tiên | Cao |

→ Nhấn **"Đăng ngay"**
→ Kiểm tra: Status = "Đã đăng", code = NCM-YYYYMMDD-XXX

**Kết quả mong đợi:**
- [ ] Nhu cầu hiện trong danh sách
- [ ] Status = "Đã đăng" (tag xanh)
- [ ] Đại lý thấy trên Portal (nếu Portal đã cập nhật)

---

### Bước 2: Đại lý gửi Booking (Chat)

```
ERP → Menu "Chat Đại lý" → Chọn phòng chat với đại lý test
```

**Cách 1: Đại lý gửi từ Portal**
- Portal → Tin nhắn → Gửi phiếu chốt mủ

**Cách 2: Test nhanh trên ERP (gửi booking từ phía nhà máy)**
- ERP → Chat → Nhấn icon 📎 → "Tạo phiếu chốt mủ"

| Field | Giá trị test |
|-------|-------------|
| Loại mủ | Mủ đông |
| Số lượng | 5,000 kg |
| DRC dự kiến | 32% |
| Đơn giá | 45,000 đ/kg |
| Địa điểm | Bình Phước |

→ Gửi booking message

**Kết quả mong đợi:**
- [ ] BookingCard hiện trong chat
- [ ] Status = "Chờ xác nhận"

---

### Bước 3: Xác nhận Deal + Tạm ứng (ERP Chat)

```
ERP → Chat → Nhấn "Xác nhận" trên BookingCard
```

ConfirmDealModal hiện ra:

| Field | Giá trị test |
|-------|-------------|
| Giá chốt | 45,000 đ/kg |
| Tạm ứng | 50,000,000 VNĐ |
| Hình thức | Chuyển khoản |

→ Nhấn **"Xác nhận Deal"**

**Kết quả mong đợi:**
- [ ] DealCard hiện trong chat (xanh lá)
- [ ] Deal tạo thành công (code: DL2603-XXXX)
- [ ] Advance tạo: 50,000,000 VNĐ
- [ ] Ledger ghi: CREDIT 50,000,000 (tạm ứng)
- [ ] Deal status = "processing"

**Kiểm tra:**
```
ERP → Menu "Deals" → Tìm deal mới tạo → Click vào
→ Tab "Thông tin": Đầy đủ thông tin
→ Tab "Tạm ứng": 1 phiếu, 50M VNĐ
→ Tab "Nhập kho": Trống (chưa nhập)
→ Tab "QC": Trống (chưa QC)
```

```
ERP → Menu "Công nợ" → Tìm đại lý test
→ Số dư: -50,000,000 (nhà máy đã ứng cho đại lý)
```

---

### Bước 4: Cân xe (App Cân Xe)

```
Mở App Cân Xe → Tạo phiếu cân mới
```

| Field | Giá trị test |
|-------|-------------|
| Nguồn mủ | Theo Deal |
| Chọn Deal | DL2603-XXXX (deal vừa tạo) |
| Biển số xe | 75C-12345 |
| Tài xế | Nguyễn Văn A |
| Loại mủ | Mủ đông |
| DRC kỳ vọng | 32% |
| Đơn giá | 45,000 đ/kg |

→ Nhấn **"Tạo phiếu & Bắt đầu cân"**

**Cân lần 1 (Gross):**
- Nhập: `12,500` kg (hoặc đọc từ đầu cân)
- → Nhấn **"GHI CÂN LẦN 1"** (F5)
- → Camera tự chụp 3 ảnh (nếu có proxy)

**Cân lần 2 (Tare):**
- Nhập: `3,200` kg
- → Nhấn **"GHI CÂN LẦN 2"** (F5)
- → NET = 12,500 - 3,200 = **9,300 kg**

→ Nhấn **"HOÀN TẤT"** (F8)

**Kết quả mong đợi:**
- [ ] Phiếu cân hoàn thành: CX-YYYYMMDD-XXX
- [ ] NET = 9,300 kg
- [ ] Deal_id liên kết đúng
- [ ] Ảnh camera lưu (nếu có)

**Kiểm tra trên ERP:**
```
ERP → Menu "Phiếu cân" → Tìm phiếu vừa tạo
→ Phiếu cân hiện: Gross=12,500 | Tare=3,200 | NET=9,300
→ Deal tag hiện đúng
```

---

### Bước 5: Nhập kho (ERP)

```
ERP → Menu "Nhập kho" → "Tạo phiếu nhập"
```

**Step 1: Chọn kho**

| Field | Giá trị test |
|-------|-------------|
| Loại kho | Nguyên liệu |
| Kho | Kho A (hoặc kho có sẵn) |
| Nguồn nhập | Mua hàng |
| Deal B2B | DL2603-XXXX (chọn deal) |

→ Hiện Deal summary card (Đại lý, SL, Còn lại)

**Step 2: Thêm chi tiết**

| Field | Giá trị test |
|-------|-------------|
| Vật liệu | Mủ đông |
| Số lượng | 1 |
| Trọng lượng | 9,300 kg |
| DRC sơ bộ | 32% |

**Step 3: Xác nhận**
→ Nhấn **"Xác nhận nhập kho"**

**Kết quả mong đợi:**
- [ ] Phiếu nhập: NK-XX-YYYYMMDD-XXX, status = "Đã xác nhận"
- [ ] Stock batch tạo: LOT-NL-YYYYMMDD-XXX
- [ ] Deal cập nhật: stock_in_count = 1, actual_weight_kg = 9,300
- [ ] Chat nhận thông báo: "Đã nhập kho 9.3T cho Deal DL2603-XXXX"

**Kiểm tra:**
```
ERP → Deals → DL2603-XXXX → Tab "Nhập kho"
→ Phiếu nhập: NK-XX-..., 9,300 kg, Đã xác nhận
→ Phiếu cân: CX-..., NET 9,300 kg

ERP → Chat → Kiểm tra thông báo system: "Đã nhập kho..."
```

---

### Bước 6: QC kiểm DRC (ERP)

```
ERP → Menu "QC Recheck" → Tìm lô LOT-NL-YYYYMMDD-XXX
```

| Field | Giá trị test |
|-------|-------------|
| DRC đo được | 33.5% |
| Moisture | 0.5% |
| Kết quả | Đạt |

→ Nhấn **"Ghi nhận"**

**Kết quả mong đợi:**
- [ ] Batch cập nhật: latest_drc = 33.5%, qc_status = "passed"
- [ ] Deal cập nhật:
  - actual_drc = 33.5%
  - actual_weight_kg = 9,300
  - final_value = 9,300 × (33.5/100) × 45,000 = **140,152,500 VNĐ**
  - qc_status = "passed"
- [ ] Chat nhận thông báo: "QC hoàn thành — DRC = 33.5%, Đạt"

**Kiểm tra:**
```
ERP → Deals → DL2603-XXXX → Tab "QC"
→ DrcVarianceCard hiện:
  - DRC dự kiến: 32%
  - DRC thực tế: 33.5%
  - Chênh lệch: +1.5% (xanh, arrow up)
  - Giá trị dự kiến: xxx VNĐ
  - Giá trị thực tế: 140,152,500 VNĐ
→ Bảng batches: LOT-NL-..., DRC=33.5%, QC=Đạt
```

---

### Bước 7: Quyết toán (ERP)

```
ERP → Deals → DL2603-XXXX → Nút "Quyết toán"
```

Modal xác nhận hiện:
- Trọng lượng thực: 9,300 kg
- DRC thực tế: 33.5%
- Đơn giá: 45,000 đ/kg
- Giá trị ước tính: 140,152,500 VNĐ

→ Nhấn **"Tạo quyết toán"**

**Kết quả mong đợi:**
- [ ] Settlement tạo: QT-YYYYMMDD-XXX, status = "draft"
- [ ] Tự động chuyển đến trang settlement detail
- [ ] Tính toán:
  - Giá trị deal: 140,152,500 VNĐ
  - Đã tạm ứng: 50,000,000 VNĐ
  - Còn lại: 90,152,500 VNĐ
- [ ] Deal status → "settled"
- [ ] Chat: "Đã tạo phiếu quyết toán QT-... cho Deal DL2603-XXXX"

---

### Bước 8: Duyệt quyết toán (ERP)

```
ERP → Quyết toán → QT-YYYYMMDD-XXX
```

**8a. Gửi duyệt:**
→ Nhấn **"Gửi duyệt"**
→ Status: Draft → Pending

**8b. Duyệt:**
→ Nhấn **"Duyệt"** (nút xanh)
→ Status: Pending → Approved

**Kết quả mong đợi:**
- [ ] Status = "Đã duyệt"
- [ ] ApprovalTimeline hiện đúng
- [ ] Ledger ghi: DEBIT 140,152,500 (nhà máy nợ đại lý)
- [ ] Chat: "Phiếu quyết toán QT-... đã được duyệt"

---

### Bước 9: Thanh toán (ERP)

```
ERP → Quyết toán → QT-YYYYMMDD-XXX → Nhấn "Đã thanh toán"
```

| Field | Giá trị test |
|-------|-------------|
| Hình thức | Chuyển khoản |
| Số tham chiếu | CK-20260318-001 |

→ Nhấn **"Xác nhận thanh toán"**

**Kết quả mong đợi:**
- [ ] Status = "Đã thanh toán"
- [ ] Ledger ghi: CREDIT 90,152,500 (thanh toán phần còn lại)
- [ ] Chat: "Đã thanh toán quyết toán QT-..., số tiền: 90,152,500 VNĐ"

---

### Bước 10: Kiểm tra Công nợ (ERP)

```
ERP → Menu "Công nợ" → Tìm đại lý test
```

**Kết quả mong đợi — Sổ công nợ đại lý:**

| # | Loại | Mô tả | Nợ (Debit) | Có (Credit) | Số dư |
|---|------|-------|-----------|------------|-------|
| 1 | Tạm ứng | Tạm ứng Deal DL2603-XXXX | 0 | 50,000,000 | -50,000,000 |
| 2 | Quyết toán | QT-... Giá trị deal | 140,152,500 | 0 | 90,152,500 |
| 3 | Thanh toán | Thanh toán QT-... (CK) | 0 | 90,152,500 | 0 |

**Giải thích:**
1. Nhà máy ứng 50M → nhà máy "cho nợ" đại lý → Credit
2. QC xong, giá trị deal = 140M → nhà máy "nợ" đại lý → Debit
3. Thanh toán phần còn lại 90M → Credit → **Số dư = 0** (hết nợ)

- [ ] Công nợ đại lý = 0 (đã thanh toán hết)
- [ ] Báo cáo công nợ hiện đúng

---

## LUỒNG 2: GIA CÔNG (Processing) — Tóm tắt

```
1. Đại lý đặt slot sản xuất (Portal)
2. Nhà máy duyệt → Tạo Deal (deal_type = 'processing')
3. Đại lý gửi mủ → Cân xe → Nhập kho (giống Luồng 1)
4. QC kiểm DRC nguyên liệu
5. Tạo lệnh sản xuất (ERP → Sản xuất → chọn NVL từ Deal)
6. Sản xuất 5 công đoạn (Rửa → Cán → Sấy → Ép → QC)
7. QC thành phẩm → Grade + DRC
8. Đại lý nghiệm thu (Portal → Accept/Reject)
9. Xuất kho thành phẩm cho đại lý
10. Tính phí gia công → Settlement → Thanh toán
```

**Khác biệt với Mua đứt:**
- Deal.deal_type = 'processing'
- Đại lý trả phí gia công (processing_fee_per_ton)
- Đại lý thấy tab Sản xuất + Thành phẩm trên Portal
- Không có tạm ứng (nhà máy không mua)

---

## LUỒNG 3: NHU CẦU MUA → CHÀO GIÁ → DEAL

```
1. ERP → Nhu cầu mua → Tạo NCM (Mủ đông, 10T, DRC 30-60%)
2. Đăng nhu cầu → Portal đại lý thấy
3. Đại lý gửi chào giá (SL, Giá, DRC, Vùng)
4. ERP → NCM detail → Tab "Chào giá" → Xem các chào giá
5. Chấp nhận chào giá → Auto tạo Deal
6. Tiếp tục Luồng 1 (Cân xe → Nhập kho → QC → ...)
```

---

## CHECKLIST TỔNG HỢP

### Dữ liệu tạo ra sau test

| Bảng | Record | Verify |
|------|--------|--------|
| `b2b_demands` | 1 NCM | [ ] |
| `b2b_deals` | 1 Deal | [ ] |
| `b2b_advances` | 1 phiếu tạm ứng 50M | [ ] |
| `weighbridge_tickets` | 1 phiếu cân | [ ] |
| `weighbridge_images` | 3-6 ảnh camera | [ ] |
| `stock_in_orders` | 1 phiếu nhập kho | [ ] |
| `stock_in_details` | 1 chi tiết | [ ] |
| `stock_batches` | 1 lô NVL | [ ] |
| `batch_qc_results` | 1 kết quả QC | [ ] |
| `b2b_settlements` | 1 phiếu quyết toán | [ ] |
| `b2b_partner_ledger` | 3 bút toán | [ ] |
| `b2b_chat_messages` | 4+ thông báo system | [ ] |

### Thông báo Chat nhận được

| # | Thời điểm | Nội dung | Check |
|---|-----------|----------|-------|
| 1 | Xác nhận Deal | DealCard trong chat | [ ] |
| 2 | Nhập kho | "Đã nhập kho 9.3T cho Deal DL2603-XXXX" | [ ] |
| 3 | QC | "QC hoàn thành — DRC = 33.5%, Đạt" | [ ] |
| 4 | Quyết toán tạo | "Đã tạo phiếu quyết toán QT-..." | [ ] |
| 5 | Quyết toán duyệt | "Phiếu quyết toán QT-... đã được duyệt" | [ ] |
| 6 | Thanh toán | "Đã thanh toán quyết toán QT-..., 90,152,500 VNĐ" | [ ] |

### Công nợ kiểm tra

| Check | Kết quả mong đợi |
|-------|-----------------|
| [ ] Sau tạm ứng | Số dư = -50,000,000 |
| [ ] Sau quyết toán duyệt | Số dư = 90,152,500 |
| [ ] Sau thanh toán | Số dư = 0 |

---

## XỬ LÝ LỖI THƯỜNG GẶP

| Lỗi | Nguyên nhân | Cách fix |
|-----|-------------|----------|
| "row violates RLS policy" | Thiếu RLS policy | Chạy: `CREATE POLICY "Allow all" ON table FOR ALL USING (true) WITH CHECK (true)` |
| "relation does not exist" | Chưa chạy SQL migration | Chạy SQL tương ứng trên Supabase |
| Deal dropdown trống | Không có deal status processing/accepted | Tạo deal trước |
| Camera không chụp | Proxy chưa chạy | `cd apps/weighbridge && node camera-proxy.cjs` |
| 404 khi refresh | Thiếu vercel.json | Đã có sẵn, deploy lại |
| Cân không kết nối | Chưa cắm USB hoặc browser không hỗ trợ | Dùng Chrome/Edge, nhập thủ công |

---

## SƠ ĐỒ LUỒNG DỮ LIỆU

```
┌─────────────┐
│ Nhu cầu mua │ b2b_demands
│ NCM-001     │
└──────┬──────┘
       │ Chào giá (b2b_demand_offers)
       ▼
┌─────────────┐
│    DEAL     │ b2b_deals
│ DL2603-001  │ status: processing → accepted → settled
└──────┬──────┘
       │
  ┌────┴────┐
  ▼         ▼
┌──────┐ ┌──────────┐
│Tạm ứng│ │ Cân xe   │ weighbridge_tickets
│50M   │ │CX-001    │ Gross=12,500 Tare=3,200 NET=9,300
└──┬───┘ └────┬─────┘
   │          │
   │          ▼
   │   ┌──────────┐
   │   │ Nhập kho │ stock_in_orders (deal_id)
   │   │NK-001    │ → stock_in_details → stock_batches
   │   └────┬─────┘
   │        │
   │        ▼
   │   ┌──────────┐
   │   │   QC     │ batch_qc_results
   │   │DRC=33.5% │ → update deal.actual_drc
   │   └────┬─────┘
   │        │
   ▼        ▼
┌─────────────────┐
│   Quyết toán    │ b2b_settlements
│   QT-001        │ final_value = 140,152,500
│                 │ - advance = 50,000,000
│                 │ = balance = 90,152,500
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│   Công nợ       │ b2b_partner_ledger
│                 │
│ 1. Credit 50M   │ (tạm ứng)
│ 2. Debit 140M   │ (giá trị deal)
│ 3. Credit 90M   │ (thanh toán)
│ → Số dư = 0     │
└─────────────────┘
```

---

*Huy Anh Rubber ERP v8 — Full Flow Test Guide*
*Ngày: 18/03/2026*
