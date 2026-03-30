# CẬP NHẬT MODULE ĐƠN HÀNG BÁN (SALES ORDER)

> **Ngày:** 30/03/2026
> **Dựa trên:** Dữ liệu thực tế từ file Excel Shipment Following + Hợp đồng 2025-2026
> **Mục tiêu:** Đưa module Sales Order khớp 100% với quy trình thực tế của Huy Anh

---

## 1. PHÂN TÍCH DỮ LIỆU THỰC TẾ

### 1.1 Khách hàng thực tế (20+ đối tác)

| Tên ngắn | Tên đầy đủ | Quốc gia | Cảng đích | Sản phẩm |
|----------|-----------|---------|----------|---------|
| JK | JK Tyre & Industries Ltd | Ấn Độ | CHENNAI, NHAVA | SVR10 |
| ATC | ATC Tires Private Ltd | Ấn Độ | CHENNAI | SVR10 |
| PIX | Pix Transmissions Ltd | Ấn Độ | NHAVA (NSA) | RSS3, SVR10 |
| KOHINOOR | Kohinoor India Pvt Ltd | Ấn Độ | NHAVA (NSA) | SVR10 |
| RALSON | Ralson India Ltd | Ấn Độ | NHAVA | SVR10 |
| GOUTAM | Goutam Enterprises | Ấn Độ | — | SVR3L, SVR10 |
| KIMEX | Kimex | Ấn Độ | NHAVA | SVR3L |
| BRAZA | Braza Tyres | Ấn Độ | NHAVA | RSS3 |
| CAVENDISH | Cavendish Industries Ltd | Ấn Độ | — | SVR10 |
| TOWER GLOBAL | Tower Global Investment Pte Ltd | Singapore/TQ | QINGDAO | SVR10, SBR1502 |
| IE SYNERGY | IE Synergy Pte Ltd | Singapore/TQ | SHANGHAI | SVR10 CV60, SBR1502 |
| ZHEJIANG | Zhejiang Jinhong Petrochemical | Trung Quốc | SHANGHAI | SVR3L, SBR1502 |
| JIANGSU | Jiangsu Provincial Foreign Trade | Trung Quốc | SHANGHAI | SVR3L |
| SHANGHAI WINYONG | Shanghai Winyong Co | Trung Quốc | SHANGHAI | — |
| R1 | R1 International Pte Ltd | Singapore | CHENNAI | SVR10 |
| PT ALPHEN | PT Alphen Internasional Corporindo | Indonesia | JAKARTA | SVR3L |
| PT AYUMAS | PT Ayumas Alam Lestari | Indonesia | BELAWAN, JAKARTA | SVR3L |
| PT OKAMOTO | PT Okamoto | Indonesia | SURABAYA | SVR3L |
| MALAYA | Malaya International Co Pte Ltd | Singapore/SL | COLOMBO, VIZAG | RSS3, Compound |
| GRI | Global Rubber Industries Pvt Ltd | Sri Lanka | COLOMBO | RSS3, SVR10 |
| VITRY | Vitry Middle East General Trading | UAE/Pháp | — | RSS1, SVR3L |
| UKKO | UKKO Corporation | Đài Loan | KEELUNG | SVR3L, RSS3 |
| PROCHEM | Prochem | Thổ Nhĩ Kỳ | — | RSS3, SVR3L |
| COELSIN | Coelsin Elastomeros S.L | Tây Ban Nha | VALENCIA | SVR3L |
| KARNAPHULI | Karnaphuli Shoes Industries | Bangladesh | — | — |

### 1.2 Sản phẩm thực tế

| Mã | Tên | Có trong ERP? |
|----|-----|-------------|
| SVR3L | Standard Vietnamese Rubber 3L | ✅ |
| SVR5 | Standard Vietnamese Rubber 5 | ✅ |
| SVR10 | Standard Vietnamese Rubber 10 | ✅ |
| SVR20 | Standard Vietnamese Rubber 20 | ✅ |
| SVR_CV60 | Constant Viscosity 60 | ✅ |
| RSS1 | Ribbed Smoked Sheet 1 | ❌ **CẦN THÊM** |
| RSS3 | Ribbed Smoked Sheet 3 | ❌ **CẦN THÊM** |
| SBR1502 | Styrene Butadiene Rubber | ❌ **CẦN THÊM** |
| Compound | Compound Rubber | ❌ **CẦN THÊM** |

### 1.3 Phương thức thanh toán thực tế

| Mã | Mô tả | Có trong ERP? |
|----|-------|-------------|
| TT100 | Chuyển khoản 100% | ✅ tt_advance |
| TT_SCAN | TT 100% via scan docs | ❌ **CẦN THÊM** |
| DP | Documents against Payment | ❌ **CẦN THÊM** |
| DP_AT_SIGHT | DP at sight | ❌ **CẦN THÊM** |
| LC_AT_SIGHT | L/C trả ngay | ✅ |
| LC_30 | L/C 30 ngày | ✅ |
| LC_90 | L/C 90 ngày | ❌ **CẦN THÊM** |
| 10_DEPOSIT_90_DP | 10% đặt cọc + 90% DP | ❌ **CẦN THÊM** |
| 20_DP_80_CAD | 20% DP + 80% CAD | ❌ **CẦN THÊM** |
| 90_DP | 90% DP | ❌ **CẦN THÊM** |
| TT_30_70 | TT 30% + 70% | ❌ **CẦN THÊM** |
| TT_BEFORE_ETD | TT 100% trước ETD | ❌ **CẦN THÊM** |

### 1.4 Ngân hàng thanh toán

| Viết tắt | Ngân hàng |
|----------|----------|
| AGRI / AGR | Agribank |
| VTB / VIETTIN | Vietinbank |
| TP | TPBank |
| EXIM | Eximbank |

---

## 2. CỘT THIẾU TRONG DATABASE

### 2.1 Bảng `sales_orders` — Cần thêm 16 cột

```sql
-- Thông tin hợp đồng
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS contract_no VARCHAR(100);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS lot_number INTEGER;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS commodity_description TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS packing_description TEXT;

-- Vận đơn & Logistics
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS bl_number VARCHAR(100);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS dhl_number VARCHAR(100);

-- Tài chính
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS contract_price NUMERIC(15,2);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS actual_price NUMERIC(15,2);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(15,2) DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS discount_date DATE;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS commission_per_mt NUMERIC(10,2) DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS commission_total NUMERIC(15,2) DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS bank_name VARCHAR(50);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS doc_submission_date DATE;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS payment_date DATE;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
```

### 2.2 Bảng `sales_customers` — Thêm thông tin

```sql
ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS tax_id VARCHAR(50);
ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS default_bank VARCHAR(50);
ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS broker_name VARCHAR(200);
ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS broker_commission NUMERIC(10,2);
```

---

## 3. PHÂN QUYỀN 4 BỘ PHẬN

### 3.1 Ma trận phân quyền

```
                        Sale  SX  Logistics  Kế toán  Admin
────────────────────────────────────────────────────────────
KHÁCH HÀNG
  Xem danh sách          ✅   ❌    ❌        ✅      ✅
  Tạo/Sửa khách hàng     ✅   ❌    ❌        ❌      ✅
  Xóa khách hàng         ❌   ❌    ❌        ❌      ✅

ĐƠN HÀNG
  Xem tất cả đơn         ✅   👁    👁        ✅      ✅
  Tạo đơn hàng           ✅   ❌    ❌        ❌      ✅
  Sửa thông tin đơn      ✅   ❌    ❌        ❌      ✅
  Xác nhận đơn           ✅   ❌    ❌        ❌      ✅
  Hủy đơn               ✅   ❌    ❌        ❌      ✅

SẢN XUẤT (tab trong đơn)
  Kiểm tra NVL           ❌   ✅    ❌        ❌      ✅
  Tạo lệnh SX           ❌   ✅    ❌        ❌      ✅
  Cập nhật tiến độ SX     ❌   ✅    ❌        ❌      ✅
  Xác nhận sẵn sàng      ❌   ✅    ❌        ❌      ✅

ĐÓNG GÓI & VẬN CHUYỂN
  Quản lý container       ❌   ❌    ✅        ❌      ✅
  Seal container          ❌   ❌    ✅        ❌      ✅
  Nhập booking/B/L        ❌   ❌    ✅        ❌      ✅
  Cập nhật ETD/vessel     ❌   ❌    ✅        ❌      ✅
  Nhập DHL number         ❌   ❌    ✅        ❌      ✅

CHỨNG TỪ
  Tạo COA                ❌   ❌    ✅        ❌      ✅
  Tạo Packing List       ❌   ❌    ✅        ❌      ✅
  Tạo Invoice            ❌   ❌    ❌        ✅      ✅
  In chứng từ            ✅   ❌    ✅        ✅      ✅

TÀI CHÍNH
  Nhập L/C number        ❌   ❌    ❌        ✅      ✅
  Quản lý hóa đơn        ❌   ❌    ❌        ✅      ✅
  Nhập thanh toán         ❌   ❌    ❌        ✅      ✅
  Nhập chiết khấu        ❌   ❌    ❌        ✅      ✅
  Nhập hoa hồng          ❌   ❌    ❌        ✅      ✅
  Xem doanh thu/công nợ  ❌   ❌    ❌        ✅      ✅

DASHBOARD
  Dashboard bán hàng      ✅   ❌    ✅        ✅      ✅
  Báo cáo xuất Excel      ✅   ❌    ✅        ✅      ✅

👁 = Chỉ xem (read-only)
```

### 3.2 Cách triển khai phân quyền

```typescript
// Xác định role từ department
type SalesRole = 'sale' | 'production' | 'logistics' | 'accounting' | 'admin'

function getSalesRole(user: User): SalesRole {
  if (user.role === 'admin') return 'admin'

  const dept = user.department_name?.toLowerCase() || ''
  if (dept.includes('kinh doanh') || dept.includes('sale')) return 'sale'
  if (dept.includes('sản xuất') || dept.includes('sx')) return 'production'
  if (dept.includes('xuất nhập khẩu') || dept.includes('logistics')) return 'logistics'
  if (dept.includes('kế toán') || dept.includes('tài chính')) return 'accounting'

  return 'sale' // mặc định
}

// Kiểm tra quyền
function canEditOrder(role: SalesRole): boolean {
  return ['sale', 'admin'].includes(role)
}

function canManageContainers(role: SalesRole): boolean {
  return ['logistics', 'admin'].includes(role)
}

function canManageInvoice(role: SalesRole): boolean {
  return ['accounting', 'admin'].includes(role)
}

function canManageProduction(role: SalesRole): boolean {
  return ['production', 'admin'].includes(role)
}
```

### 3.3 UI theo role

**BP Sale thấy:**
```
ĐƠN HÀNG BÁN
├─ Tổng quan (Dashboard)
├─ Khách hàng
├─ Đơn hàng
└─ (các tab trong đơn: Thông tin + Chất lượng chỉnh được, còn lại chỉ xem)
```

**BP Sản xuất thấy:**
```
ĐƠN HÀNG BÁN
├─ Đơn hàng (chỉ xem)
└─ (tab Sản xuất: kiểm tra NVL, tạo LSX, cập nhật tiến độ)
```

**BP Logistics thấy:**
```
ĐƠN HÀNG BÁN
├─ Tổng quan
├─ Đơn hàng (chỉ xem info)
└─ (tab Đóng gói + Chứng từ COA/PL: chỉnh được)
```

**BP Kế toán thấy:**
```
ĐƠN HÀNG BÁN
├─ Tổng quan
├─ Khách hàng (chỉ xem)
├─ Đơn hàng (chỉ xem)
└─ (tab Chứng từ Invoice: chỉnh được, tab Tài chính: chỉnh được)
```

---

## 4. CẬP NHẬT GIAO DIỆN

### 4.1 Trang chi tiết đơn hàng — Thêm tabs theo role

```
Tabs hiện tại:   Thông tin | Chất lượng | Sản xuất | Đóng gói | Chứng từ
                    ↓
Tabs mới:        Thông tin | Chất lượng | Sản xuất | Đóng gói | Chứng từ | Tài chính
                   (Sale)     (Sale)       (SX)      (Logistics) (Log+KT)   (KT mới)
```

**Tab "Tài chính" (MỚI — chỉ Kế toán + Admin):**
```
┌─────────────────────────────────────────────────────────┐
│ Tài chính                                               │
│                                                         │
│ Thanh toán                                              │
│ ├─ Phương thức: DP AT SIGHT                             │
│ ├─ Số L/C: 0273NMLC0003926                             │
│ ├─ Ngân hàng: Agribank                                  │
│ ├─ Ngày trình BTC: 05/09/2025                          │
│ └─ Ngày thanh toán: 26/08/2025                         │
│                                                         │
│ Chiết khấu                                              │
│ ├─ Số tiền: $145,592.90                                │
│ └─ Ngày chiết khấu: 04/09/2025                         │
│                                                         │
│ Hoa hồng                                                │
│ ├─ Mức: 20 USD/MT                                       │
│ ├─ Tổng: $4,032.00                                     │
│ └─ Broker: —                                            │
│                                                         │
│ Giá                                                     │
│ ├─ Giá chốt: $1,980.00                                 │
│ ├─ Giá hợp đồng: $2,000.00                             │
│ └─ Chênh lệch: $20.00 (hoa hồng)                      │
│                                                         │
│ Trạng thái: ĐÃ THANH TOÁN ✅                           │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Trang danh sách — Thêm cột theo role

**BP Sale thấy:**
```
Mã đơn | Khách hàng | Grade | Số lượng | Giá trị | Giao hàng | Trạng thái
```

**BP Logistics thấy thêm:**
```
... | Booking | B/L | ETD | DHL | Container |
```

**BP Kế toán thấy thêm:**
```
... | Giá trị | Chiết khấu | Hoa hồng | Thanh toán | Ngày TT |
```

### 4.3 Trang tạo đơn — Bước mới

```
Bước 1: Khách hàng & Sản phẩm          (Sale)
Bước 2: Chất lượng & Đóng gói           (Sale)
Bước 3: Vận chuyển & Thanh toán         (Sale + Logistics)
  + Thêm: Số hợp đồng, Ngân hàng, Hoa hồng, Giá HĐ vs Giá chốt
Bước 4: Xác nhận                         (Sale)
```

---

## 5. IMPORT DỮ LIỆU THỰC

### 5.1 Import 25 khách hàng thật

```sql
INSERT INTO sales_customers (code, name, short_name, country, region,
  default_incoterm, default_currency, quality_standard, status, tier)
VALUES
  ('KH-JK', 'JK Tyre & Industries Ltd', 'JK', 'IN', 'South Asia', 'FOB', 'USD', 'ISO_2000', 'active', 'strategic'),
  ('KH-ATC', 'ATC Tires Private Limited', 'ATC', 'IN', 'South Asia', 'FOB', 'USD', 'ISO_2000', 'active', 'strategic'),
  ('KH-PIX', 'Pix Transmissions Limited', 'PIX', 'IN', 'South Asia', 'FOB', 'USD', 'ISO_2000', 'active', 'premium'),
  ('KH-KOHINOOR', 'Kohinoor India Private Ltd', 'KOHINOOR', 'IN', 'South Asia', 'FOB', 'USD', 'ISO_2000', 'active', 'standard'),
  ('KH-RALSON', 'Ralson India Ltd', 'RALSON', 'IN', 'South Asia', 'CIF', 'USD', 'ISO_2000', 'active', 'premium'),
  ('KH-GOUTAM', 'Goutam Enterprises', 'GOUTAM', 'IN', 'South Asia', 'FOB', 'USD', 'ISO_2000', 'active', 'standard'),
  ('KH-TOWER', 'Tower Global Investment Pte Ltd', 'TOWER GLOBAL', 'SG', 'Southeast Asia', 'CIF', 'USD', 'ISO_2000', 'active', 'strategic'),
  ('KH-IES', 'IE Synergy Pte Ltd', 'IE SYNERGY', 'SG', 'Southeast Asia', 'CIF', 'USD', 'ISO_2000', 'active', 'premium'),
  ('KH-ZHEJIANG', 'Zhejiang Jinhong Petrochemical Co Ltd', 'ZHEJIANG', 'CN', 'East Asia', 'CIF', 'USD', 'ISO_2000', 'active', 'premium'),
  ('KH-ALPHEN', 'PT Alphen Internasional Corporindo', 'PT ALPHEN', 'ID', 'Southeast Asia', 'CIF', 'USD', 'ISO_2000', 'active', 'premium'),
  ('KH-AYUMAS', 'PT Ayumas Alam Lestari', 'PT AYUMAS', 'ID', 'Southeast Asia', 'CIF', 'USD', 'ISO_2000', 'active', 'standard'),
  ('KH-OKAMOTO', 'PT Okamoto', 'PT OKAMOTO', 'ID', 'Southeast Asia', 'CIF', 'USD', 'ISO_2000', 'active', 'standard'),
  ('KH-MALAYA', 'Malaya International Co Pte Ltd', 'MALAYA', 'SG', 'Southeast Asia', 'FOB', 'USD', 'ISO_2000', 'active', 'premium'),
  ('KH-GRI', 'Global Rubber Industries Pvt Ltd', 'GRI', 'LK', 'South Asia', 'CIF', 'USD', 'ISO_2000', 'active', 'premium'),
  ('KH-VITRY', 'Vitry Middle East General Trading LLC', 'VITRY', 'AE', 'Middle East', 'FOB', 'USD', 'ISO_2000', 'active', 'premium'),
  ('KH-UKKO', 'UKKO Corporation', 'UKKO', 'TW', 'East Asia', 'FOB', 'USD', 'ISO_2000', 'active', 'standard'),
  ('KH-PROCHEM', 'Prochem', 'PROCHEM', 'TR', 'Europe', 'FOB', 'USD', 'ISO_2000', 'active', 'standard'),
  ('KH-COELSIN', 'Coelsin Elastomeros S.L', 'COELSIN', 'ES', 'Europe', 'CFR', 'USD', 'ISO_2000', 'active', 'standard'),
  ('KH-R1', 'R1 International Pte Ltd', 'R1', 'SG', 'Southeast Asia', 'FOB', 'USD', 'ISO_2000', 'active', 'premium'),
  ('KH-KIMEX', 'Kimex', 'KIMEX', 'IN', 'South Asia', 'CIF', 'USD', 'ISO_2000', 'active', 'standard'),
  ('KH-BRAZA', 'Braza Tyres', 'BRAZA', 'IN', 'South Asia', 'CIF', 'USD', 'ISO_2000', 'active', 'standard'),
  ('KH-CAVENDISH', 'Cavendish Industries Ltd', 'CAVENDISH', 'IN', 'South Asia', 'FOB', 'USD', 'ISO_2000', 'active', 'standard'),
  ('KH-JIANGSU', 'Jiangsu Provincial Foreign Trade Corp', 'JIANGSU', 'CN', 'East Asia', 'CIF', 'USD', 'ISO_2000', 'active', 'standard'),
  ('KH-KARNAPHULI', 'Karnaphuli Shoes Industries Ltd', 'KARNAPHULI', 'BD', 'South Asia', 'FOB', 'USD', 'ISO_2000', 'active', 'standard'),
  ('KH-WINYONG', 'Shanghai Winyong Co Ltd', 'WINYONG', 'CN', 'East Asia', 'CIF', 'USD', 'ISO_2000', 'active', 'standard')
ON CONFLICT (code) DO NOTHING;
```

### 5.2 Thêm sản phẩm mới

```sql
-- Thêm vào rubber_grade_standards
INSERT INTO rubber_grade_standards (grade, grade_label, drc_min, dirt_max, ash_max, nitrogen_max, volatile_matter_max, moisture_max, sort_order)
VALUES
  ('RSS1', 'RSS 1', 60, 0.010, 0.50, 0.60, 0.20, 0.80, 6),
  ('RSS3', 'RSS 3', 60, 0.020, 0.50, 0.60, 0.20, 0.80, 7),
  ('SBR1502', 'SBR 1502', 0, 0, 0, 0, 0, 0, 8),
  ('COMPOUND', 'Compound Rubber', 0, 0, 0, 0, 0, 0, 9)
ON CONFLICT (grade) DO NOTHING;
```

---

## 6. KẾ HOẠCH TRIỂN KHAI

| Phase | Nội dung | Files | Effort |
|-------|----------|-------|--------|
| **S-A** | SQL migration (16 cột + sản phẩm + KH thật) | SQL | 15 phút |
| **S-B** | salesTypes.ts — thêm payment terms, banks, grades | salesTypes.ts | 30 phút |
| **S-C** | Phân quyền service — getSalesRole, permission checks | salesPermissionService.ts | 1 giờ |
| **S-D** | UI phân quyền — ẩn/hiện tab, button theo role | Các trang Sales | 1.5 giờ |
| **S-E** | Tab Tài chính mới — L/C, chiết khấu, hoa hồng | SalesOrderDetailPage | 1 giờ |
| **S-F** | Cập nhật form tạo đơn — thêm trường mới | SalesOrderCreatePage | 1 giờ |
| **S-G** | Shipment Following view — bảng theo dõi lô hàng | ShipmentFollowingPage | 1 giờ |
| **S-H** | Import data thật + Test | SQL + Test | 30 phút |

**Tổng: ~7 giờ**

---

## 7. TRANG MỚI: THEO DÕI LÔ HÀNG (SHIPMENT FOLLOWING)

Dựa trên file Excel thực tế, tạo trang `/sales/shipments`:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Theo dõi lô hàng xuất                           [Xuất Excel]      │
│                                                                     │
│ Lọc: [Tháng ▼] [Khách hàng ▼] [Trạng thái ▼]                     │
│                                                                     │
│ NO│Buyer│Contract│Lot│PO/LC│Booking│B/L│Hàng│QTY│Vol│POL│POD│...   │
│ ──┼─────┼────────┼───┼─────┼───────┼───┼────┼───┼───┼───┼───┼──   │
│ 1 │JK   │LTC/JK/ │ 3 │4100 │DADF07 │AP-│SVR │101│ 5 │DAD│CHE│... │
│   │     │JULY    │   │0129 │2815   │25E│10  │   │   │   │NNA│    │
│ ──┼─────┼────────┼───┼─────┼───────┼───┼────┼───┼───┼───┼───┼──   │
│ 2 │PIX  │02A/PD- │ 1 │1010 │DADF07 │TM2│RSS3│101│ 5 │DAD│NSA│... │
│   │     │PIX     │   │0002 │6099   │250│+SVR│   │   │   │   │    │
│                                                                     │
│ ... │ETD│DHL│Payment Date│Discount│Bank│Status│                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Phân quyền:**
- **Sale**: Xem tất cả, không sửa
- **Logistics**: Xem + sửa Booking, B/L, ETD, DHL
- **Kế toán**: Xem + sửa Discount, Payment Date, Bank
- **Admin**: Full quyền

---

## 8. TÓM TẮT

### Thiếu hiện tại → Cần bổ sung

```
Database:
  + 16 cột mới cho sales_orders
  + 4 cột mới cho sales_customers
  + 4 sản phẩm mới (RSS1, RSS3, SBR1502, Compound)
  + 10+ payment terms mới
  + 25 khách hàng thật

Phân quyền:
  + salesPermissionService — xác định role từ phòng ban
  + UI ẩn/hiện theo role trên tất cả trang Sales
  + Tab Tài chính mới (chỉ Kế toán)

Trang mới:
  + Shipment Following — theo dõi lô hàng (giống Excel hiện tại)
  + Tab Tài chính trong chi tiết đơn hàng

Import:
  + 25 khách hàng thật từ dữ liệu 2025
  + Có thể import đơn hàng 2026 sau
```

---

> Cập nhật Module Đơn hàng bán
> Huy Anh Rubber ERP v8 — 30/03/2026
