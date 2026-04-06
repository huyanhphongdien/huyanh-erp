# Thiết kế lại Đơn Hàng Bán — 4 Section, 1 trang, khóa sau xác nhận

> **Ngày:** 05/04/2026
> **Tham chiếu:** Sales Contract LTC2024/PD-ATC-EOU/DEC (ATC Tires)
> **Nguyên tắc:** Mỗi BP sửa phần mình, phần khác readonly. Sale xác nhận → khóa luôn.

---

## 1. NGUYÊN TẮC CHÍNH

### 1.1 Một trang — 4 section scroll dọc
```
Không dùng tabs — 1 trang hiện hết, scroll xuống xem toàn bộ.
Mỗi section có header ghi rõ BP nào sửa.
BP không có quyền → section hiện readonly (xám nhạt, không click được).
```

### 1.2 Khóa sau xác nhận
```
Sale tạo đơn (Draft) → Sale bấm "Xác nhận"
  → KHÓA TOÀN BỘ section Hợp đồng (Sale không sửa được nữa)
  → Các BP khác bắt đầu nhập phần mình

Muốn sửa lại? → Phải "Mở khóa" (chỉ Admin được)
```

### 1.3 Bốn nhóm người dùng
| Nhóm | Email | Section sửa |
|------|-------|------------|
| **Sale** | sales@huyanhrubber.com | Hợp đồng |
| **Sản xuất** | trunglxh@huyanhrubber.com | Sản xuất & Đóng gói |
| **Logistics** | logistics@, anhlp@ | Vận chuyển + Chứng từ |
| **Kế toán** | yendt@huyanhrubber.com | Tài chính |
| **Admin** | minhld@, thuyht@, huylv@ | Tất cả + Mở khóa |

---

## 2. LAYOUT 1 TRANG

```
┌─────────────────────────────────────────────────────────────────┐
│ SO-2026-0015 — ATC Tires Private Ltd        Status: [Confirmed] │
│ LTC2024/PD-ATC-EOU/DEC                     SVR 10 | 725.76 MT  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ╔═══════════════════════════════════════════════════════════════╗
│ ║ 📋 HỢP ĐỒNG                        Sale nhập    🔒 ĐÃ KHÓA  ║
│ ╠═══════════════════════════════════════════════════════════════╣
│ ║                                                               ║
│ ║  Số HĐ:        LTC2024/PD-ATC-EOU/DEC                       ║
│ ║  Ngày HĐ:      03/02/2025                                    ║
│ ║  Người mua:     ATC Tires Private Limited (India)             ║
│ ║  PO# KH:       HA2026001                                     ║
│ ║  ─────────────────────────────────────────────────────────── ║
│ ║  Grade:         SVR 10 (Item code 11-01280)                  ║
│ ║  Số lượng:      725.76 tấn                                   ║
│ ║  Đơn giá:       $1,924.10/MT FOB                             ║
│ ║  Tổng tiền:     $1,396,434.82                                ║
│ ║  ─────────────────────────────────────────────────────────── ║
│ ║  Quy cách:      35 kg/bành | 576 bành/cont | 16 pallet/cont ║
│ ║  Tổng bành:     20,736 | Container: 36 × 20ft               ║
│ ║  Đóng gói:      Shrink wrap + Pallet                         ║
│ ║  ─────────────────────────────────────────────────────────── ║
│ ║  Incoterm:      FOB Da Nang Port                             ║
│ ║  Thanh toán:    100% D/P at sight                            ║
│ ║  Thời gian giao: August 2025                                 ║
│ ║  Cảng xếp:      Da Nang Port, Vietnam                       ║
│ ║  Hoa hồng:      2% ($27,928.70)                             ║
│ ║  Ngân hàng:     Vietcombank CN Huế | 0071001046372 | BFTVVNVX║
│ ║                                                               ║
│ ╚═══════════════════════════════════════════════════════════════╝
│                                                                 │
│ ╔═══════════════════════════════════════════════════════════════╗
│ ║ 🏭 SẢN XUẤT & ĐÓNG GÓI                      SX nhập  ✏️    ║
│ ╠═══════════════════════════════════════════════════════════════╣
│ ║                                                               ║
│ ║  Ngày hàng sẵn sàng:  [15/07/2025    ] ← SX nhập            ║
│ ║                                                               ║
│ ║  NVL check: 854 tấn có sẵn ✅ Đủ                             ║
│ ║  Lệnh SX:  PO-SVR10-250401-001                              ║
│ ║  Tiến độ:  ████████████████░░░░░░ 70%                        ║
│ ║                                                               ║
│ ║  Container 1: MSKU-1234567 | Seal: ABC123 | 576 bành | ✅   ║
│ ║  Container 2: MSKU-2345678 | Seal: DEF456 | 576 bành | ✅   ║
│ ║  ... (36 container)                                          ║
│ ║  [+ Thêm container]                                          ║
│ ║                                                               ║
│ ╚═══════════════════════════════════════════════════════════════╝
│                                                                 │
│ ╔═══════════════════════════════════════════════════════════════╗
│ ║ 🚢 VẬN CHUYỂN                            Logistics nhập ✏️  ║
│ ╠═══════════════════════════════════════════════════════════════╣
│ ║                                                               ║
│ ║  Số BK:         [BK-250701-ATC       ]                       ║
│ ║  Số BL:         [OOLU-1234567        ]                       ║
│ ║  Hãng tàu:      [OOCL               ]                       ║
│ ║  Tàu / Chuyến:  [OOCL Tokyo ] / [V.025]                     ║
│ ║  POL:            Da Nang Port (từ HĐ)                        ║
│ ║  POD:           [Chennai, India      ]                       ║
│ ║  ETD:           [01/08/2025          ]                       ║
│ ║  ETA:           [15/08/2025          ]                       ║
│ ║  DHL:           [1234567890          ]                       ║
│ ║  ─────────────────────────────────────────────────────────── ║
│ ║  L/C NO:        [LC-ATC-2025-015     ]                       ║
│ ║  Hết hạn L/C:   [30/09/2025          ]                       ║
│ ║                  🟢 Còn 87 ngày                               ║
│ ║                  (🔴 ĐỎ khi ≤ 20 ngày | ⚫ ĐÃ HẾT HẠN)      ║
│ ║  ─────────────────────────────────────────────────────────── ║
│ ║  Chiết khấu:    [$5,000              ] ← LOG nhập            ║
│ ║  Ngày CK:       [20/08/2025          ] ← LOG nhập            ║
│ ║  Tỷ giá CK:     [25,200              ] ← KT nhập            ║
│ ║  Tiền còn lại:   $1,391,434.82  (auto = Tổng − CK)          ║
│ ║  ─────────────────────────────────────────────────────────── ║
│ ║  Tờ khai HQ:    [30156/NKD-ĐN        ]                      ║
│ ║  Thông quan:    [✅ Đã thông quan     ▼]                     ║
│ ║                                                               ║
│ ╚═══════════════════════════════════════════════════════════════╝
│                                                                 │
│ ╔═══════════════════════════════════════════════════════════════╗
│ ║ 📄 CHỨNG TỪ                              Logistics upload ✏️║
│ ╠═══════════════════════════════════════════════════════════════╣
│ ║  ✅ Bill of Lading (3/3 Original)    [📎 2 file]  [Xem]      ║
│ ║  ✅ Commercial Invoice               [📎 1 file]  [Xem]      ║
│ ║  ✅ Packing List                      [📎 1 file]  [Xem]      ║
│ ║  ✅ Certificate of Origin            [📎 1 file]  [Xem]      ║
│ ║  ⭕ Fumigation Certificate                       [Upload]     ║
│ ║  ⭕ Insurance Certificate                        [Upload]     ║
│ ║  Progress: 4/6 (67%)                                         ║
│ ╚═══════════════════════════════════════════════════════════════╝
│                                                                 │
│ ╔═══════════════════════════════════════════════════════════════╗
│ ║ 💰 TÀI CHÍNH                              Kế toán nhập ✏️   ║
│ ╠═══════════════════════════════════════════════════════════════╣
│ ║                                                               ║
│ ║  Tỷ giá:          [25,000        ] VND/USD  ← KT nhập       ║
│ ║  Giá trị VND:      34,911 triệu đ  (auto)                   ║
│ ║  ─────────────────────────────────────────────────────────── ║
│ ║  Ngày tiền về:    [15/09/2025    ] ← KT nhập                ║
│ ║  Trạng thái TT:   [Chưa thanh toán ▼]                       ║
│ ║  ─────────────────────────────────────────────────────────── ║
│ ║  TỔNG HỢP:                                                  ║
│ ║  Tổng HĐ:         $1,396,434.82                             ║
│ ║  Chiết khấu:       −$5,000.00 (LOG nhập)                    ║
│ ║  Phí NH:           −$150.00 (KT nhập)                       ║
│ ║  Thực nhận:        $1,391,284.82                             ║
│ ║  Hoa hồng (2%):    −$27,928.70 (Sale nhập)                  ║
│ ║  Doanh thu ròng:   $1,363,356.12                             ║
│ ║                                                               ║
│ ╚═══════════════════════════════════════════════════════════════╝
│                                                                 │
│ ── 📊 TIẾN TRÌNH ──────────────────────────────────────────── │
│ Draft ✅ → Confirmed ✅ → Producing 🔄 → Ready → Shipped →    │
│ → Delivered → Invoiced → Paid                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. QUY TẮC KHÓA

### 3.1 Sale xác nhận → Khóa section Hợp đồng

```
Trạng thái: Draft
  → Sale sửa thoải mái
  → Bấm "Xác nhận đơn hàng"
  → Status: Confirmed
  → Section "Hợp đồng" → 🔒 KHÓA (readonly, nền xám)
  → Không sửa được: SL, giá, grade, KH, payment terms...
  → Muốn sửa? → Admin bấm "Mở khóa" → quay về Draft
```

### 3.2 Ma trận khóa theo status

| Status | Hợp đồng (Sale) | SX & Đóng gói (SX) | Vận chuyển (LOG) | Tài chính (KT) |
|--------|:---------------:|:------------------:|:----------------:|:--------------:|
| **Draft** | ✏️ Sửa | 🔒 | 🔒 | 🔒 |
| **Confirmed** | 🔒 KHÓA | ✏️ Sửa | 🔒 | 🔒 |
| **Producing** | 🔒 | ✏️ Sửa | ✏️ Sửa | 🔒 |
| **Ready** | 🔒 | 🔒 KHÓA | ✏️ Sửa | 🔒 |
| **Packing** | 🔒 | ✏️ Đóng gói | ✏️ Sửa | 🔒 |
| **Shipped** | 🔒 | 🔒 | ✏️ Sửa | ✏️ Sửa |
| **Delivered** | 🔒 | 🔒 | 🔒 KHÓA | ✏️ Sửa |
| **Invoiced** | 🔒 | 🔒 | 🔒 | ✏️ Sửa |
| **Paid** | 🔒 | 🔒 | 🔒 | 🔒 TẤT CẢ KHÓA |

**Logic:**
- Mỗi BP chỉ sửa được khi đến lượt mình
- Khi BP chuyển status → section của BP đó bị khóa
- Paid = tất cả khóa (đơn hàng hoàn tất)

### 3.3 Nút "Mở khóa" (chỉ Admin)

```
Admin thấy nút 🔓 Mở khóa trên section đã khóa
  → Bấm → confirm "Bạn chắc chắn muốn mở khóa?"
  → Section mở lại cho BP sửa
  → Ghi log: ai mở, lúc nào, lý do
```

---

## 4. CHI TIẾT FIELDS TỪNG SECTION

### 4.1 Section HỢP ĐỒNG (Sale nhập)

| Field | Type | Bắt buộc | Ghi chú |
|-------|------|---------|---------|
| Số hợp đồng | Text | ✅ | VD: LTC2024/PD-ATC-EOU/DEC |
| Ngày hợp đồng | Date | ✅ | |
| Người mua (KH) | Select | ✅ | Từ danh sách KH |
| PO# khách hàng | Text | | |
| Grade SVR | Select | ✅ | SVR 3L, 5, 10, 20, RSS... |
| Số lượng (tấn) | Number | ✅ | VD: 725.76 |
| Đơn giá (USD/MT) | Number | ✅ | VD: 1,924.10 |
| **Tổng tiền (USD)** | **Auto** | | **= SL × Đơn giá** |
| Quy cách bành (kg) | Select | ✅ | 33.33 / 35 / tùy chỉnh |
| Bành/container | Number | ✅ | VD: 576 (theo HĐ) |
| Pallet/container | Number | | VD: 16 |
| **Tổng bành** | **Auto** | | **= ceil(SL × 1000 / KL_bành)** |
| **Số container** | **Auto** | | **= ceil(Tổng_bành / bành_per_cont)** |
| Shrink wrap | Toggle | | |
| Pallet | Toggle | | |
| Incoterm | Select | ✅ | FOB / CIF / CNF / DDP / EXW |
| Điều kiện thanh toán | Select | ✅ | D/P at sight, LC 30/60/90, TT... |
| Thời gian giao hàng | Date/Text | ✅ | VD: "August 2025" hoặc ngày cụ thể |
| Cảng xếp hàng (POL) | Select | ✅ | Đà Nẵng, Hải Phòng... |
| Hoa hồng (%) | Number | | VD: 2 |
| **Hoa hồng (tiền)** | **Auto** | | **= Tổng × %** |
| Ngân hàng | Text | | VD: Vietcombank CN Huế |
| Số tài khoản | Text | | VD: 0071001046372 |
| SWIFT | Text | | VD: BFTVVNVX |

### 4.2 Section SẢN XUẤT & ĐÓNG GÓI (SX nhập)

| Field | Type | Ghi chú |
|-------|------|---------|
| Ngày hàng sẵn sàng | Date | ★ SX nhập |
| NVL check | Auto | Kiểm tra batch có sẵn |
| Lệnh sản xuất | Link | Tạo/xem PO |
| Tiến độ 5 công đoạn | Progress | Rửa→Tán→Sấy→Ép→Đóng gói |
| Container (CRUD) | Table | Tạo/gán bành/seal/cân |

### 4.3 Section VẬN CHUYỂN (Logistics nhập)

| Field | Type | Ai nhập | Ghi chú |
|-------|------|---------|---------|
| Số BK (Booking) | Text | LOG | |
| Số BL (B/L) | Text | LOG | |
| Hãng tàu | Text | LOG | |
| Tàu / Chuyến | Text | LOG | |
| POL | Auto | | Từ HĐ (Sale) |
| POD | Text | LOG | Cảng đích |
| ETD | Date | LOG | |
| ETA | Date | LOG | |
| DHL | Text | LOG | Tracking number |
| L/C NO | Text | LOG | |
| Ngày hết hạn L/C | Date | LOG | 🔴 ≤ 20 ngày = ĐỎ |
| Chiết khấu (USD) | Number | LOG | |
| Ngày chiết khấu | Date | LOG | |
| Tỷ giá chiết khấu | Number | **KT** | ★ Kế toán nhập |
| **Tiền còn lại** | **Auto** | | **= Tổng − Chiết khấu** |
| Tờ khai HQ | Text | LOG | |
| Thông quan | Select | LOG | Chờ / Đã TQ / Từ chối |

### 4.4 Section TÀI CHÍNH (Kế toán nhập)

| Field | Type | Ghi chú |
|-------|------|---------|
| Tỷ giá (VND/USD) | Number | ★ KT nhập |
| **Giá trị VND** | **Auto** | **= Tổng USD × Tỷ giá** |
| Ngày tiền về | Date | ★ KT nhập |
| Trạng thái TT | Select | Chưa TT / Một phần / Đã TT |
| Phí ngân hàng | Number | KT nhập |
| **Thực nhận** | **Auto** | **= Tổng − CK − Phí NH** |
| **Doanh thu ròng** | **Auto** | **= Thực nhận − Hoa hồng** |

---

## 5. CẢNH BÁO L/C

```
Ngày hết hạn L/C — Quy tắc hiện màu:

  > 20 ngày:    🟢 Xanh lá  "Còn X ngày"
  ≤ 20 ngày:    🔴 ĐỎ       "⚠️ Còn X ngày — SẮP HẾT HẠN"
  ≤ 0 ngày:     ⚫ Đen       "❌ ĐÃ HẾT HẠN"

Hiện tại: 7 ngày → Đổi thành 20 ngày
Áp dụng: Tab vận chuyển + Shipment Following + Email báo cáo
```

---

## 6. AUTO TÍNH TOÁN

| Field | Công thức | Trigger |
|-------|----------|---------|
| Tổng tiền (USD) | SL × Đơn giá | Sale nhập |
| Tổng bành | ceil(SL × 1000 / KL_bành) | Sale nhập |
| Số container | ceil(Tổng_bành / bành_per_cont) | Sale nhập |
| Hoa hồng (tiền) | Tổng × Hoa hồng% | Sale nhập |
| Tiền còn lại | Tổng − Chiết khấu | LOG nhập CK |
| Giá trị VND | Tổng USD × Tỷ giá | KT nhập tỷ giá |
| Thực nhận | Tổng − CK − Phí NH | KT nhập phí |
| Doanh thu ròng | Thực nhận − Hoa hồng | Auto |

---

## 7. DB MIGRATION

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

## 8. THAY ĐỔI SO VỚI HIỆN TẠI

| # | Thay đổi | Lý do |
|---|---------|-------|
| 1 | Wizard 4 bước → 2 bước | Sale chỉ nhập HĐ |
| 2 | 5 tabs → 1 trang 4 sections | Nhìn toàn bộ, không chuyển tab |
| 3 | Sale nhập tỷ giá → KT nhập | KT mới biết tỷ giá |
| 4 | LC ở Tab Tài chính → Section Vận chuyển | LOG nhập LC |
| 5 | Tỷ giá CK ở LOG → KT nhập | KT nhập tỷ giá CK |
| 6 | Cảnh báo LC 7 ngày → 20 ngày | Theo yêu cầu chị Liễu |
| 7 | Confirmed → KHÓA section Sale | Không sửa sau xác nhận |
| 8 | Container 600/630 → nhập tay | HĐ mẫu dùng 576 |
| 9 | Thêm: hoa hồng, NH, SWIFT | Theo HĐ mẫu |
| 10 | Thêm: ngày tiền về, doanh thu ròng | KT cần |
| 11 | Thêm: tiền còn lại auto | = Tổng − CK |
| 12 | Đóng gói → SX quản lý | Không phải LOG |

---

## 9. FILES CẦN SỬA

| # | File | Thay đổi |
|---|------|---------|
| 1 | Database | ALTER TABLE 16 cột mới |
| 2 | `SalesOrderCreatePage.tsx` | Wizard 2 bước + fields mới |
| 3 | `SalesOrderDetailPage.tsx` | Đổi từ tabs → 4 sections scroll |
| 4 | `salesPermissionService.ts` | Khóa logic theo status |
| 5 | `salesOrderService.ts` | Lock/unlock + auto-calc |
| 6 | `salesAlertService.ts` | LC 7→20 ngày |
| 7 | `daily-task-report/index.ts` | LC 7→20 ngày |
| 8 | `salesTypes.ts` | Thêm interface fields |
| 9 | `ShipmentFollowingPage.tsx` | Cập nhật cột mới |

---

## 10. TRIỂN KHAI

### Phase 1: DB + Wizard + Khóa (1 ngày)
- [ ] Migration 16 cột
- [ ] Wizard: thêm fields (hoa hồng, NH, SWIFT, bành/container)
- [ ] Bỏ tỷ giá khỏi wizard Sale
- [ ] Logic khóa: Confirmed → lock section Sale

### Phase 2: Detail Page → 4 Sections (1.5 ngày)
- [ ] Đổi tabs → sections scroll
- [ ] Section Hợp đồng (readonly khi confirmed)
- [ ] Section SX & Đóng gói (SX sửa)
- [ ] Section Vận chuyển (LOG sửa, LC, CK, tỷ giá CK do KT)
- [ ] Section Tài chính (KT sửa: tỷ giá, ngày tiền về, phí NH)
- [ ] Auto-calc: tiền còn lại, giá trị VND, doanh thu ròng

### Phase 3: Cảnh báo + Polish (0.5 ngày)
- [ ] LC cảnh báo 20 ngày (đỏ)
- [ ] Email báo cáo: 20 ngày
- [ ] Nút "Mở khóa" cho Admin
- [ ] Test end-to-end

**Tổng: 3 ngày**

---

> **Thiết kế lại Đơn Hàng Bán — 1 trang, 4 section, khóa theo status**
> Công ty TNHH MTV Cao su Huy Anh Phong Điền
> Cập nhật: 05/04/2026
