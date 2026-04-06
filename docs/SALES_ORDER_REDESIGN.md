# Thiết kế Đơn Hàng Bán — v4 Final

> **Ngày:** 06/04/2026
> **Prototype:** `docs/sales-order-prototype-v4.html`
> **Tham chiếu:** Sales Contract LTC2024/PD-ATC-EOU/DEC

---

## 1. KIẾN TRÚC

### 2 view chính
```
┌─────────────────────────────────────────────────────────────────┐
│  LIST VIEW (bảng cột)                                           │
│  ─────────────────────                                          │
│  Tất cả đơn hàng trong 1 bảng, scroll ngang                    │
│  Cột nhóm theo BP: Sale (xanh) | SX (xanh dương) | LOG (vàng) │
│  | KT (hồng)                                                   │
│  Click vào dòng → mở Detail Panel                               │
│                                                                 │
│  ┌───────────────────────────────────────────┐                  │
│  │  DETAIL PANEL (slide từ phải, 720px)      │                  │
│  │  ─────────────────────────────────────    │                  │
│  │  4 Tabs: HĐ | SX | LOG | KT              │                  │
│  │  Mỗi tab = 1 form cho 1 BP               │                  │
│  │  BP khác → readonly (xám)                 │                  │
│  │  Khóa sau khi chuyển status               │                  │
│  └───────────────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────┘
```

### Font: Inter
- UI: `'Inter', -apple-system, sans-serif`
- Số/mã: `'JetBrains Mono', monospace`

---

## 2. PHÂN QUYỀN (v4 — cập nhật)

### 2.1 Ai nhập gì

| Email | Role | Tab sửa | Fields |
|-------|------|---------|--------|
| `sales@huyanhrubber.com` | sale | **Hợp đồng** | Số HĐ, ngày, buyer, grade, SL, giá, incoterm, payment, giao hàng, bành, đóng gói, hoa hồng, NH |
| `trunglxh@huyanhrubber.com` | production | **Sản xuất** | Ngày SX sẵn sàng, lệnh SX, container, seal, gán bành |
| `logistics@huyanhrubber.com` | logistics | **Vận chuyển** | BK, BL, tàu, POD, ETD, ETA, L/C NO, L/C hạn, chiết khấu (số tiền + ngày), DHL |
| `anhlp@huyanhrubber.com` | logistics | **Vận chuyển** | (giống trên) |
| `yendt@huyanhrubber.com` | accounting | **Tài chính** | Tỷ giá, tỷ giá CK, ngày tiền về, trạng thái TT, phí NH |
| `minhld@huyanhrubber.com` | admin | **Tất cả** | + Mở khóa |
| `thuyht@huyanhrubber.com` | admin | **Tất cả** | + Mở khóa |
| `huylv@huyanhrubber.com` | admin | **Tất cả** | + Mở khóa |

### 2.2 Ai xem gì trên Sidebar

| Menu | sale | production | logistics | accounting | admin |
|------|:----:|:----------:|:---------:|:----------:|:-----:|
| Dashboard | ✅ | | ✅ | ✅ | ✅ |
| Đơn hàng | ✅ | ✅ | ✅ | ✅ | ✅ |
| Khách hàng | ✅ | | | ✅ | ✅ |
| Shipment | ✅ | | ✅ | ✅ | ✅ |
| A/R Aging | | | | ✅ | ✅ |
| Cash Flow & LC | | | | ✅ | ✅ |
| Điều hành BGĐ | | | | | ✅ |

### 2.3 Khóa theo status

| Status | Tab HĐ (Sale) | Tab SX (SX) | Tab LOG (LOG) | Tab KT (KT) |
|--------|:--------------:|:-----------:|:-------------:|:------------:|
| Draft | ✏️ | 🔒 | 🔒 | 🔒 |
| Confirmed | **🔒 KHÓA** | ✏️ | 🔒 | 🔒 |
| Producing | 🔒 | ✏️ | ✏️ | 🔒 |
| Ready | 🔒 | **🔒 KHÓA** | ✏️ | 🔒 |
| Packing | 🔒 | ✏️ đóng gói | ✏️ | 🔒 |
| Shipped | 🔒 | 🔒 | ✏️ | ✏️ |
| Delivered | 🔒 | 🔒 | **🔒 KHÓA** | ✏️ |
| Invoiced | 🔒 | 🔒 | 🔒 | ✏️ |
| Paid | 🔒 | 🔒 | 🔒 | **🔒 TẤT CẢ** |

**Mở khóa:** Chỉ Admin (minhld@, thuyht@, huylv@)

---

## 3. TAB HỢP ĐỒNG — Sale nhập

### Wizard tạo đơn (2 bước)
```
Bước 1: Nhập thông tin
  ├── Số HĐ, Ngày HĐ
  ├── Buyer (chọn KH)
  ├── Grade, SL (tấn), Đơn giá (USD/MT)
  ├── Quy cách bành (33.33/35/tùy chỉnh)
  ├── Bành/container (576, 600, 630...)
  ├── Incoterm, Payment terms
  ├── Thời gian giao hàng, Cảng xếp
  ├── Hoa hồng (%)
  └── Ngân hàng, Số TK, SWIFT

Bước 2: Xác nhận → Lưu nháp / Xác nhận (→ khóa)
```

### Auto tính
- Tổng tiền = SL × Đơn giá
- Tổng bành = ceil(SL × 1000 / KL_bành)
- Số container = ceil(Tổng_bành / bành_per_container)
- Hoa hồng (tiền) = Tổng × %

### Sau xác nhận → 🔒 KHÓA
- Tất cả fields tab HĐ readonly
- Nền xám, không click được
- Muốn sửa → Admin bấm "Mở khóa"

---

## 4. TAB SẢN XUẤT — SX nhập

### Fields SX nhập
| Field | Type | Ghi chú |
|-------|------|---------|
| Ngày hàng sẵn sàng | Date | ★ Bắt buộc |
| NVL check | Auto | Kiểm tra batch có sẵn |
| Lệnh sản xuất | Link | Tạo/xem PO |
| Tiến độ | Progress | 5 công đoạn |
| Container | Table | CRUD: container no, seal, bành, cân |

### Container (SX quản lý)
```
# | Container No    | Seal     | Bành    | Gross  | Tare  | Net    | Status
1 | [MSKU-1234567] | [ABC123] | 576/576 | 21,200 | 2,200 | 19,000 | ✅ Sealed
2 | [MSKU-2345678] | [DEF456] | 576/576 | 21,150 | 2,180 | 18,970 | ✅ Sealed
3 | [MSKU-3456789] | [      ] | 320/576 |        |       |        | 🔄 Packing
[+ Thêm container]
```

---

## 5. TAB VẬN CHUYỂN — Logistics nhập

### Fields LOG nhập
| Field | Type | Ghi chú |
|-------|------|---------|
| Số BK (Booking) | Text | |
| Số BL (B/L) | Text | |
| Hãng tàu | Text | |
| Tàu / Chuyến | Text | |
| POL | Auto | Từ HĐ (Sale) |
| POD | Text | Cảng đích |
| ETD | Date | |
| ETA | Date | |
| DHL | Text | Tracking |
| L/C NO | Text | LOG nhập |
| Ngày hết hạn L/C | Date | 🔴 ≤ 20 ngày |
| Chiết khấu (USD) | Number | LOG nhập |
| Ngày chiết khấu | Date | LOG nhập |
| Tỷ giá CK | Number | 🔒 **KT nhập** (disabled cho LOG) |

### Cảnh báo L/C
```
> 20 ngày:  🟢 "Còn X ngày"
≤ 20 ngày:  🔴 "⚠️ SẮP HẾT HẠN — còn X ngày"
≤ 0 ngày:   ⚫ "❌ ĐÃ HẾT HẠN"
```

### Auto tính
- Tiền còn lại = Tổng tiền (Sale) − Chiết khấu (LOG)

---

## 6. TAB TÀI CHÍNH — Kế toán nhập

### Fields KT nhập
| Field | Type | Ghi chú |
|-------|------|---------|
| Tỷ giá (VND/USD) | Number | ★ KT nhập |
| Tỷ giá CK | Number | ★ KT nhập (hiện ở tab LOG, disabled cho LOG) |
| Ngày tiền về | Date | ★ KT nhập |
| Trạng thái TT | Select | Chưa TT / Một phần / Đã TT |
| Phí ngân hàng (USD) | Number | KT nhập |

### Auto tính
- Giá trị VND = Tổng USD × Tỷ giá
- Thực nhận = Tổng − CK − Phí NH
- Doanh thu ròng = Thực nhận − Hoa hồng

### Bảng tổng hợp
```
Tổng HĐ:          $1,396,434.82
Chiết khấu:        −$5,000.00 (LOG nhập)
Phí NH:            −$150.00 (KT nhập)
────────────────────────────
Thực nhận:         $1,391,284.82
Hoa hồng (2%):     −$27,928.70 (Sale nhập)
────────────────────────────
DOANH THU RÒNG:    $1,363,356.12
```

---

## 7. LIST VIEW — Cột nhóm theo BP

### Cột cố định (frozen)
```
# | Mã HĐ | Buyer
```

### Nhóm Sale (nền xanh)
```
Grade | SL | Đơn giá | Tổng USD | Incoterm | Thanh toán | Bành/C | Giao hàng
```

### Nhóm SX (nền xanh dương)
```
SX sẵn sàng | Tiến độ | Cont sealed
```

### Nhóm LOG (nền vàng)
```
BK | BL | Tàu | ETD | L/C NO | L/C hạn | CK (USD) | DHL
```

### Nhóm KT (nền hồng)
```
Tỷ giá | VND | Tiền về | DT ròng
```

### Cột status
```
Status | BP (4 dots: ●●○○)
```

### Dòng tổng
```
TỔNG | 4 đơn | 1,159.76T | $2,195,085 | 58 cont | $2,000 CK
```

---

## 8. DB MIGRATION

```sql
ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS contract_date DATE,
  ADD COLUMN IF NOT EXISTS commission_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS bank_account VARCHAR(50),
  ADD COLUMN IF NOT EXISTS bank_swift VARCHAR(20),
  ADD COLUMN IF NOT EXISTS ready_date DATE,
  ADD COLUMN IF NOT EXISTS bales_per_container INTEGER,
  ADD COLUMN IF NOT EXISTS pallets_per_container INTEGER,
  ADD COLUMN IF NOT EXISTS bales_per_pallet INTEGER,
  ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS net_revenue NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS payment_received_date DATE,
  ADD COLUMN IF NOT EXISTS discount_exchange_rate NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by UUID;
```

---

## 9. TRIỂN KHAI

### Phase 1: DB + Wizard (1 ngày)
- [ ] Migration 16 cột
- [ ] Wizard 2 bước (Sale)
- [ ] Logic khóa: Confirmed → lock tab Sale

### Phase 2: Detail Panel (1.5 ngày)
- [ ] Slide-in panel 720px
- [ ] 4 tabs: HĐ (readonly), SX, LOG, KT
- [ ] Inline edit + auto-calc
- [ ] LC cảnh báo 20 ngày

### Phase 3: List View (1 ngày)
- [ ] Table với frozen columns
- [ ] Column groups màu theo BP
- [ ] 4 dots tiến độ BP
- [ ] Summary row
- [ ] Filter + Export

**Tổng: 3.5 ngày**

---

> **Thiết kế Đơn hàng bán v4 — List + Detail + Tabs + Khóa**
> Huy Anh ERP — 06/04/2026
