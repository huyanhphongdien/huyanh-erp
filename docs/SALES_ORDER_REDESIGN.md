# Thiết kế lại Đơn Hàng Bán — Mỗi BP 1 phần, readonly cho BP khác

> **Ngày:** 05/04/2026
> **Tham chiếu:** Sales Contract No.: LTC2024/PD-ATC-EOU/DEC (03 Feb 2025)
> **Buyer mẫu:** ATC Tires Private Limited (India)
> **Yêu cầu:** Mỗi bộ phận chỉ nhập phần của mình, các BP khác chỉ xem (readonly)

---

## 0. PHÂN TÍCH HỢP ĐỒNG MẪU

Từ Sales Contract "LTC2024/PD-ATC-EOU/DEC":

### Thông tin hợp đồng (Sale nhập)
```
Số HĐ:          LTC2024/PD-ATC-EOU/DEC
Ngày:            03 February 2025
Seller:          Huy Anh Rubber Company Limited
Buyer:           ATC Tires Private Limited (India)
```

### Sản phẩm (Sale nhập)
```
Commodity:       NATURAL RUBBER SVR10 (Item code 11-01280)
Quantity:        725.76 MTS
Unit Price:      USD 1,924.10/MT FOB DA NANG PORT
Amount:          USD 1,396,434.82
```

### Đóng gói (Sale nhập — thông tin cố định theo HĐ)
```
Packing:         35 Kgs/Bale; 576 bales/16 shrink wrapped plastic pallets/01 x 20'
Total:           20,736 bales/576 shrink wrapped plastic pallets/36 x 20'
```

**Phân tích:**
- Quy cách: **35 kg/bành**
- Mỗi container 20ft: **576 bành** (không phải 600)
- Mỗi pallet: **576/16 = 36 bành/pallet**
- Tổng: **20,736 bành / 36 container 20ft**
- Verify: 725.76 × 1000 / 35 = 20,736 bành ✅
- Container: 20,736 / 576 = 36 container ✅

### Vận chuyển (Sale + Logistics)
```
Port of Loading:     Da Nang Port, Viet Nam
Time of Shipment:    August 2025
Partial Shipment:    Allowed
Transhipment:        Allowed
Load port charges:   THC on seller's account
```

### Thanh toán (Sale nhập)
```
Term of Payment:     100% D/P at sight
```

### Chứng từ yêu cầu
```
Documents:
  - 3/3 Original Bill of Lading marked freight collect
  - Commercial Invoice
  - Packing List
  - Certificate of Origin
```

### Quy tắc phát hiện

| Từ HĐ | Field trong ERP | Ai nhập |
|--------|----------------|---------|
| No. | `contract_no` | Sale |
| Date | `contract_date` | Sale |
| Buyer | `customer_id` | Sale |
| Commodity | `grade` | Sale |
| Quantity (MTS) | `quantity_tons` | Sale |
| Unit Price (USD/MT) | `unit_price` | Sale |
| Amount (USD) | `total_value_usd` (auto) | Auto |
| FOB DA NANG | `incoterm` + `port_of_loading` | Sale |
| 35 Kgs/Bale | `bale_weight_kg` | Sale |
| 576 bales/01 x 20' | `bales_per_container` | Sale |
| D/P at sight | `payment_terms` | Sale |
| Port of Loading | `port_of_loading` | Sale |
| Time of Shipment | `delivery_date` | Sale |

### ⚠️ Phát hiện: Container capacity khác với default

```
Hợp đồng: 576 bành/container (35kg, shrink wrap + pallet)
ERP hiện tại: 600 bành/container (35kg)

Lý do chênh lệch: 
  576 = 16 pallet × 36 bành/pallet
  600 = không tính pallet, xếp tự do

→ CẦN: Cho phép Sale nhập số bành/container thay vì hardcode
```

---

## 1. TỔNG QUAN LUỒNG MỚI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TẠO ĐƠN HÀNG                                      │
│                                                                            │
│  BP Sale tạo đơn (2 bước) → Draft → Confirmed                             │
│  Sau đó các BP khác vào tab của mình để nhập tiếp                          │
│                                                                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ Hợp đồng │ │ Sản xuất │ │ Đóng gói │ │ Vận chuyển│ │ Tài chính│         │
│  │ (Sale)   │ │ (SX)     │ │ (LOG)    │ │ (LOG)    │ │ (KT)    │         │
│  │ ✏️ Sửa   │ │ ✏️ Sửa   │ │ ✏️ Sửa   │ │ ✏️ Sửa   │ │ ✏️ Sửa   │         │
│  │ 🔒 khác  │ │ 🔒 khác  │ │ 🔒 khác  │ │ 🔒 khác  │ │ 🔒 khác  │         │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. TAB HỢP ĐỒNG — BP SALE nhập

**Ai sửa:** `sales@huyanhrubber.com` + Admin
**Ai xem:** Tất cả BP

### Form tạo đơn (Wizard 2 bước)

```
┌─────────────────────────────────────────────────────────────────┐
│ Bước 1: Thông tin Hợp đồng                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌── Thông tin chung ─────────────────────────────────────────┐ │
│  │ Số hợp đồng:    [HA2026001        ]  (auto hoặc nhập tay) │ │
│  │ Ngày hợp đồng:  [05/04/2026       ]                       │ │
│  │ Người mua:       [KH-ATC — ATC Tires Private Limited  ▼]  │ │
│  │ PO# khách hàng: [123456789        ]  (tùy chọn)           │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌── Sản phẩm ────────────────────────────────────────────────┐ │
│  │ Hàng hóa (Grade):  [SVR 10                            ▼]  │ │
│  │ Số lượng (tấn):    [20          ]                          │ │
│  │ Đơn giá (USD/tấn): [1,650       ]                          │ │
│  │ Tổng tiền:          $33,000.00  (auto = SL × Đơn giá)     │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌── Quy cách đóng gói ───────────────────────────────────────┐ │
│  │ Quy cách bành:     [35 kg — 576 bành/cont             ▼]  │ │
│  │                     [33.33 kg — 630 bành/cont          ▼]  │ │
│  │                     [Tùy chỉnh...                      ▼]  │ │
│  │ Bành/container:    [576         ]  (nhập tay nếu tùy chỉnh)│ │
│  │ Bành/pallet:       [36          ]  (tùy chọn)              │ │
│  │ Pallet/container:  [16          ]  (auto = bành/cont ÷ bành/pallet) │ │
│  │ Shrink wrap:        [✓]  Pallet: [✓]                      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌── Điều khoản ──────────────────────────────────────────────┐ │
│  │ Điều kiện thương mại: [FOB — Giao lên tàu            ▼]   │ │
│  │ Điều kiện thanh toán: [T/T trả trước 30%             ▼]   │ │
│  │ Thời gian giao hàng:  [15/05/2026    ]                    │ │
│  │ Cảng xếp hàng:        [Đà Nẵng                       ▼]   │ │
│  │ Hoa hồng (%):          [2            ] %                   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌── Ngân hàng ───────────────────────────────────────────────┐ │
│  │ Ngân hàng:  [Vietcombank - CN Huế                      ]   │ │
│  │ Số TK:      [0071001046372                             ]   │ │
│  │ SWIFT:      [BFTVVNVX                                  ]   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│                                             [Tiếp theo →]      │
├─────────────────────────────────────────────────────────────────┤
│ Bước 2: Xác nhận                                                │
│  Review tất cả → [Lưu nháp] hoặc [Xác nhận đơn hàng]          │
└─────────────────────────────────────────────────────────────────┘
```

### Tab Info (readonly cho BP khác)

```
┌─────────────────────────────────────────────────────────────────┐
│ 📋 Thông tin Hợp đồng                        [Sửa] (chỉ Sale) │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Số HĐ:      HA2026001              Ngày:     05/04/2026       │
│  Người mua:  ATC Tires Private Ltd  PO#:      123456789        │
│  ─────────────────────────────────────────────────────────────  │
│  Grade:      SVR 10                 SL:       20 tấn           │
│  Đơn giá:    $1,650/tấn            Tổng:     $33,000          │
│  ─────────────────────────────────────────────────────────────  │
│  Bành:       33.33 kg              Tổng bành: 601              │
│  Đóng gói:   Bale + Shrink + Pallet Container: 1 × 20ft       │
│  ─────────────────────────────────────────────────────────────  │
│  Incoterm:   FOB                   Thanh toán: TT 30%          │
│  Giao hàng:  15/05/2026            Cảng:      Đà Nẵng          │
│  Hoa hồng:   2%                    NH:        VCB Huế          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. TAB SẢN XUẤT — BP SẢN XUẤT nhập

**Ai sửa:** `trunglxh@huyanhrubber.com` + Admin
**Ai xem:** Sale, Logistics

### Nội dung

```
┌─────────────────────────────────────────────────────────────────┐
│ 🏭 Sản xuất                                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ★ Ngày hàng sẵn sàng:  [10/05/2026    ]  ← SX nhập           │
│                                                                 │
│  ── Kiểm tra NVL ──────────────────────────────────────────    │
│  NVL cần:     23.5 tấn (yield 85%)                             │
│  NVL có sẵn:  28.0 tấn ✅ Đủ                                   │
│  Batch phù hợp: 5 batch (DRC 50-55%)                           │
│  [Phân bổ NVL]                                                  │
│                                                                 │
│  ── Lệnh sản xuất ────────────────────────────────────────    │
│  PO-SVR10-260405-001                                           │
│  Tiến độ: ████████████████████████████░░░░ 75%                 │
│  Rửa ✅ → Tán/Kéo ✅ → Sấy ✅ → Ép 🔄 → Đóng gói ⏳          │
│                                                                 │
│  Khi hoàn tất → Auto status: Ready                             │
└─────────────────────────────────────────────────────────────────┘
```

**Fields SX nhập:**
| Field | Mô tả |
|-------|-------|
| `ready_date` | Ngày hàng sẵn sàng giao (★ field mới) |

---

## 4. TAB ĐÓNG GÓI — BP LOGISTICS nhập

**Ai sửa:** `logistics@huyanhrubber.com`, `anhlp@huyanhrubber.com` + Admin
**Ai xem:** Sale, SX

### Nội dung

```
┌─────────────────────────────────────────────────────────────────┐
│ 📦 Đóng gói                                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Container 1:  MSKU-1234567                                    │
│  ├── Seal: ABC123456                                           │
│  ├── Bành: 601 / 630                                           │
│  ├── Gross: 21,200 kg | Tare: 2,200 kg | Net: 19,000 kg       │
│  └── Status: ✅ Sealed                                          │
│                                                                 │
│  [+ Thêm container]  [Auto tạo container]                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. TAB VẬN CHUYỂN — BP LOGISTICS nhập

**Ai sửa:** `logistics@huyanhrubber.com`, `anhlp@huyanhrubber.com` + Admin
**Ai xem:** Sale, Kế toán

### Nội dung

```
┌─────────────────────────────────────────────────────────────────┐
│ 🚢 Vận chuyển                                  (LOG nhập)      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌── Booking & Tàu ──────────────────────────────────────────┐ │
│  │ Số BK (Booking):    [BK-260407-ATC     ]                  │ │
│  │ Số BL (B/L):        [OOLU-1234567      ]                  │ │
│  │ Hãng tàu:           [OOCL              ]                  │ │
│  │ Tàu / Chuyến:       [OOCL Tokyo  ] / [V.025   ]          │ │
│  │ POL:                 Đà Nẵng (auto từ HĐ)                │ │
│  │ POD:                [Chennai, India     ]                  │ │
│  │ ETD:                [10/04/2026         ]                  │ │
│  │ ETA:                [25/04/2026         ]                  │ │
│  │ Cutoff:             [08/04/2026         ]                  │ │
│  │ DHL:                [1234567890         ]                  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌── L/C ─────────────────────────────────────────────────────┐ │
│  │ L/C NO:             [LC-ATC-2026-015    ]                  │ │
│  │ Ngày hết hạn L/C:   [15/06/2026         ]                 │ │
│  │                     ⚠️ Còn 71 ngày (xanh)                  │ │
│  │                     🔴 Còn 5 ngày (đỏ khi ≤ 20 ngày)      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌── Chiết khấu ─────────────────────────────────────────────┐ │
│  │ Số tiền chiết khấu: [$500              ]                   │ │
│  │ Ngày chiết khấu:    [20/04/2026        ]                   │ │
│  │ Số tiền còn lại:     $32,500  (auto = Tổng - CK)          │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌── Hải quan ────────────────────────────────────────────────┐ │
│  │ Số tờ khai:         [30156/NKD-ĐN      ]                  │ │
│  │ Ngày đăng ký:       [09/04/2026        ]                   │ │
│  │ Thông quan:         [✅ Đã thông quan   ▼]                 │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Cảnh báo L/C hết hạn
```
Ngày hết hạn L/C — Quy tắc hiện màu:
  > 20 ngày:   🟢 Xanh (bình thường)
  ≤ 20 ngày:   🔴 Đỏ (cảnh báo)
  ≤ 0 ngày:    ⚫ Đen + chữ "ĐÃ HẾT HẠN"
```

### Auto tính
```
Số tiền còn lại = Tổng tiền (Sale nhập) − Số tiền chiết khấu (LOG nhập)
```

---

## 6. TAB CHỨNG TỪ — BP LOGISTICS nhập

**Ai sửa:** `logistics@`, `anhlp@` + Admin (upload file)
**Ai sửa Invoice:** `yendt@` (Kế toán sinh Invoice)
**Ai xem:** Tất cả

### Nội dung (đã có — giữ nguyên)
- Sinh COA, Packing List, Invoice
- Upload 12 loại chứng từ gốc
- Checklist đã nhận / chưa nhận

---

## 7. TAB TÀI CHÍNH — BP KẾ TOÁN nhập

**Ai sửa:** `yendt@huyanhrubber.com` + Admin
**Ai xem:** Admin

### Nội dung

```
┌─────────────────────────────────────────────────────────────────┐
│ 💰 Tài chính                                   (KT nhập)       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌── Tỷ giá & Giá trị ──────────────────────────────────────┐ │
│  │ Tỷ giá (VND):       [25,000           ]  ← KT nhập       │ │
│  │ Giá trị VND:         825,000,000 đ  (auto = USD × tỷ giá)│ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌── Thanh toán ──────────────────────────────────────────────┐ │
│  │ Trạng thái:         [Chưa thanh toán   ▼]                 │ │
│  │ Ngày thanh toán:    [               ]                      │ │
│  │ Số tiền thực nhận:  [$32,500        ]                      │ │
│  │ Phí ngân hàng:      [$150           ]                      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌── Tổng hợp ───────────────────────────────────────────────┐ │
│  │ Tổng HĐ:           $33,000                                │ │
│  │ Chiết khấu:         -$500 (LOG nhập)                      │ │
│  │ Phí NH:             -$150 (KT nhập)                       │ │
│  │ ─────────────────────────────────────────────────────────  │ │
│  │ Thực nhận:          $32,350                                │ │
│  │ Hoa hồng (2%):      -$660                                 │ │
│  │ ─────────────────────────────────────────────────────────  │ │
│  │ Doanh thu ròng:     $31,690                                │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. MA TRẬN PHÂN QUYỀN FIELD

### Ai nhập field nào

| Field | Sale | SX | LOG | KT | Ghi chú |
|-------|:----:|:--:|:---:|:--:|---------|
| **Số hợp đồng** | ✏️ | 🔒 | 🔒 | 🔒 | Auto hoặc nhập tay |
| **Ngày hợp đồng** | ✏️ | 🔒 | 🔒 | 🔒 | |
| **Người mua (KH)** | ✏️ | 🔒 | 🔒 | 🔒 | |
| **Grade SVR** | ✏️ | 🔒 | 🔒 | 🔒 | |
| **Số lượng** | ✏️ | 🔒 | 🔒 | 🔒 | |
| **Đơn giá** | ✏️ | 🔒 | 🔒 | 🔒 | |
| **Tổng tiền** | auto | 🔒 | 🔒 | 🔒 | = SL × Đơn giá |
| **Incoterm** | ✏️ | 🔒 | 🔒 | 🔒 | |
| **Payment terms** | ✏️ | 🔒 | 🔒 | 🔒 | |
| **Thời gian giao** | ✏️ | 🔒 | 🔒 | 🔒 | |
| **Cảng xếp hàng** | ✏️ | 🔒 | 🔒 | 🔒 | |
| **Quy cách bành** | ✏️ | 🔒 | 🔒 | 🔒 | |
| **Đóng gói** | ✏️ | 🔒 | 🔒 | 🔒 | |
| **Hoa hồng (%)** | ✏️ | 🔒 | 🔒 | 🔒 | |
| **Ngân hàng** | ✏️ | 🔒 | 🔒 | 🔒 | |
| **Ngày hàng sẵn sàng** | 🔒 | ✏️ | 🔒 | 🔒 | SX nhập |
| **Container / Seal** | 🔒 | 🔒 | ✏️ | 🔒 | LOG nhập |
| **Booking (BK)** | 🔒 | 🔒 | ✏️ | 🔒 | |
| **B/L number** | 🔒 | 🔒 | ✏️ | 🔒 | |
| **Hãng tàu / Tàu** | 🔒 | 🔒 | ✏️ | 🔒 | |
| **ETD / ETA** | 🔒 | 🔒 | ✏️ | 🔒 | |
| **L/C NO** | 🔒 | 🔒 | ✏️ | 🔒 | LOG nhập |
| **Ngày hết hạn L/C** | 🔒 | 🔒 | ✏️ | 🔒 | 🔴 ≤ 20 ngày |
| **POL / POD** | 🔒 | 🔒 | ✏️ | 🔒 | |
| **Chiết khấu** | 🔒 | 🔒 | ✏️ | 🔒 | LOG nhập |
| **Ngày chiết khấu** | 🔒 | 🔒 | ✏️ | 🔒 | |
| **Số tiền còn lại** | auto | auto | auto | auto | = Tổng − CK |
| **DHL** | 🔒 | 🔒 | ✏️ | 🔒 | |
| **Tờ khai HQ** | 🔒 | 🔒 | ✏️ | 🔒 | |
| **Tỷ giá (VND)** | 🔒 | 🔒 | 🔒 | ✏️ | KT nhập |
| **Giá trị VND** | auto | auto | auto | auto | = USD × tỷ giá |
| **Ngày thanh toán** | 🔒 | 🔒 | 🔒 | ✏️ | |
| **Số tiền thực nhận** | 🔒 | 🔒 | 🔒 | ✏️ | |
| **Phí ngân hàng** | 🔒 | 🔒 | 🔒 | ✏️ | |

---

## 9. THAY ĐỔI SO VỚI HIỆN TẠI

### Fields mới cần thêm vào DB

```sql
ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS contract_date DATE,           -- Ngày hợp đồng
  ADD COLUMN IF NOT EXISTS commission_pct NUMERIC(5,2),   -- Hoa hồng (%)
  ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(15,2),-- Hoa hồng (tiền)
  ADD COLUMN IF NOT EXISTS bank_account VARCHAR(50),      -- Số TK ngân hàng
  ADD COLUMN IF NOT EXISTS bank_swift VARCHAR(20),        -- SWIFT code
  ADD COLUMN IF NOT EXISTS ready_date DATE,               -- Ngày hàng sẵn sàng (SX nhập)
  ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC(15,2),-- Số tiền còn lại (auto)
  ADD COLUMN IF NOT EXISTS net_revenue NUMERIC(15,2);     -- Doanh thu ròng (auto)
```

### Thay đổi cảnh báo L/C

```
Hiện tại: cảnh báo khi ≤ 7 ngày
Mới:      cảnh báo khi ≤ 20 ngày (theo yêu cầu chị Liễu)
```

### Thay đổi wizard

```
Hiện tại: 2 bước (KH+SP → Xác nhận)
Mới:      2 bước giữ nguyên nhưng thêm fields:
          + Hoa hồng (%)
          + Ngân hàng (tên + số TK + SWIFT)
          + Ngày hợp đồng
```

### Thay đổi L/C

```
Hiện tại: L/C nằm ở Tab Tài chính (KT nhập)
Mới:      L/C chuyển sang Tab Vận chuyển (LOG nhập)
          Vì chị Liễu (logistics) là người nhập L/C NO + ngày hết hạn
```

### Thay đổi Tỷ giá

```
Hiện tại: Sale nhập tỷ giá ở Step 1
Mới:      KT nhập tỷ giá ở Tab Tài chính
          Sale KHÔNG nhập tỷ giá (readonly)
```

---

## 10. AUTO-TÍNH TOÁN

| Field | Công thức | Ai trigger |
|-------|----------|-----------|
| Tổng tiền (USD) | SL (tấn) × Đơn giá (USD/tấn) | Sale nhập SL + giá |
| Tổng bành | ceil(SL × 1000 / KL_bành) | Sale chọn quy cách |
| Số container | ceil(Tổng_bành / bành_per_cont) | Auto từ tổng bành |
| Số tiền còn lại | Tổng tiền − Chiết khấu | LOG nhập CK |
| Giá trị VND | Tổng tiền × Tỷ giá | KT nhập tỷ giá |
| Hoa hồng (tiền) | Tổng tiền × Hoa hồng (%) | Sale nhập % |
| Doanh thu ròng | Thực nhận − Hoa hồng | KT nhập thực nhận |

---

## 11. DANH SÁCH FILE CẦN SỬA

| # | File | Thay đổi |
|---|------|---------|
| 1 | `SalesOrderCreatePage.tsx` | Thêm fields: hoa hồng, NH, ngày HĐ. Bỏ tỷ giá |
| 2 | `SalesOrderDetailPage.tsx` | Tab Vận chuyển: thêm L/C, đổi cảnh báo 20 ngày |
| 3 | `SalesOrderDetailPage.tsx` | Tab Tài chính: thêm tỷ giá, doanh thu ròng |
| 4 | `salesPermissionService.ts` | L/C fields → logistics (không còn KT) |
| 5 | `salesAlertService.ts` | LC cảnh báo: 7 ngày → 20 ngày |
| 6 | `daily-task-report/index.ts` | LC cảnh báo: 7 ngày → 20 ngày |
| 7 | `salesTypes.ts` | Thêm interface fields mới |
| 8 | Database | ALTER TABLE thêm 8 cột |

---

## 12. ƯU TIÊN TRIỂN KHAI

### Phase 1 (0.5 ngày)
- [ ] DB migration: 8 cột mới
- [ ] Wizard: thêm hoa hồng, NH, ngày HĐ, bỏ tỷ giá từ Sale
- [ ] Tab Info: hiện readonly cho BP khác

### Phase 2 (0.5 ngày)
- [ ] Tab Vận chuyển: chuyển L/C từ KT sang LOG
- [ ] Cảnh báo L/C: 7 → 20 ngày
- [ ] Auto tính: số tiền còn lại

### Phase 3 (0.5 ngày)
- [ ] Tab Tài chính: thêm tỷ giá (KT nhập), doanh thu ròng
- [ ] Tab Sản xuất: thêm field ngày hàng sẵn sàng

**Tổng: 1.5 ngày**

---

> **Tài liệu thiết kế lại Đơn Hàng Bán — Phân công theo BP**
> Công ty TNHH MTV Cao su Huy Anh Phong Điền
> Cập nhật: 05/04/2026
