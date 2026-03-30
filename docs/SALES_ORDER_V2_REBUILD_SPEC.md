# SALE ORDER MODULE V2 — THIẾT KẾ HOÀN CHỈNH

> **Ngày:** 30/03/2026
> **Quyết định:** GIỮ NGUYÊN code cũ (9,860 LOC, 15 files) + BỔ SUNG tính năng mới
> **Lý do không xóa:** Kiến trúc tốt, Ant Design 100%, DB alignment đúng, chỉ thiếu fields + phân quyền

---

## 1. KIỂM TOÁN MODULE HIỆN TẠI

### 1.1 Thống kê code

```
PAGES:     8 files  | 6,280 dòng
SERVICES:  7 files  | 3,244 dòng
TỔNG:      15 files | 9,860 dòng — Ant Design 100%
```

### 1.2 Đánh giá từng file

| File | Dòng | Chất lượng | Giữ/Sửa |
|------|------|-----------|---------|
| salesTypes.ts | 449 | ⭐⭐⭐⭐⭐ | Giữ + bổ sung types |
| salesOrderService.ts | 747 | ⭐⭐⭐⭐⭐ | Giữ + thêm methods |
| salesCustomerService.ts | 353 | ⭐⭐⭐⭐⭐ | Giữ nguyên |
| containerService.ts | 582 | ⭐⭐⭐⭐⭐ | Giữ nguyên |
| salesProductionService.ts | 383 | ⭐⭐⭐⭐⭐ | Giữ nguyên |
| salesDashboardService.ts | 307 | ⭐⭐⭐⭐ | Giữ + thêm cảnh báo |
| documentService.ts | 410 | ⭐⭐⭐ | Sửa lại logic |
| SalesOrderListPage.tsx | 608 | ⭐⭐⭐⭐ | Giữ + thêm cột |
| SalesOrderCreatePage.tsx | 759 | ⭐⭐⭐⭐ | Giữ + thêm fields |
| CustomerListPage.tsx | 830 | ⭐⭐⭐⭐ | Giữ nguyên |
| CustomerDetailPage.tsx | 715 | ⭐⭐⭐⭐ | Giữ nguyên |
| SalesDashboardPage.tsx | 561 | ⭐⭐⭐⭐ | Giữ + thêm cảnh báo |
| ContainerPackingPage.tsx | 821 | ⭐⭐⭐⭐ | Giữ nguyên |
| ExportDocumentsPage.tsx | 766 | ⭐⭐⭐ | Sửa diacritics |
| **SalesOrderDetailPage.tsx** | **1,569** | ⭐⭐⭐ | **Tách nhỏ + thêm tab** |

### 1.3 Điểm mạnh (giữ lại)

- ✅ Kiến trúc tốt: pages → services → types
- ✅ Ant Design 100% — nhất quán
- ✅ Database schema khớp
- ✅ Status workflow đầy đủ (10 trạng thái)
- ✅ Multi-step wizard tạo đơn
- ✅ Container + seal + bale management
- ✅ COA + Packing List + Invoice
- ✅ Dashboard + Pipeline + Charts

### 1.4 Điểm yếu (cần sửa)

- ❌ Thiếu 16 cột DB (contract_no, B/L, chiết khấu, hoa hồng...)
- ❌ Thiếu phân quyền 4 bộ phận
- ❌ Thiếu tab Tài chính (L/C, chiết khấu, thanh toán)
- ❌ Thiếu trang Shipment Following
- ❌ Thiếu cảnh báo tự động
- ❌ 4 chỗ tiếng Việt thiếu dấu
- ❌ SalesOrderDetailPage quá dài (1,569 dòng)
- ❌ Dùng KH test (Michelin, Toyota) — cần KH thật

---

## 2. THIẾT KẾ V2 — BỔ SUNG

### 2.1 Files TẠO MỚI (5 files)

| # | File | Mục đích | Dòng ước |
|---|------|---------|---------|
| 1 | `salesPermissionService.ts` | Phân quyền 4 BP | ~100 |
| 2 | `FinanceTab.tsx` | Tab Tài chính trong chi tiết đơn | ~400 |
| 3 | `ShipmentFollowingPage.tsx` | Thay thế Excel | ~500 |
| 4 | `ExecutiveDashboardPage.tsx` | Dashboard BGĐ | ~600 |
| 5 | `salesAlertService.ts` | 7 cảnh báo tự động | ~150 |

### 2.2 Files SỬA (8 files)

| # | File | Thay đổi | Effort |
|---|------|---------|--------|
| 1 | `salesTypes.ts` | Thêm types: payment terms, banks, permissions | 30 phút |
| 2 | `salesOrderService.ts` | Thêm methods cho fields mới | 30 phút |
| 3 | `SalesOrderCreatePage.tsx` | Thêm fields + fix diacritics | 1 giờ |
| 4 | `SalesOrderDetailPage.tsx` | Tách tab + thêm tab Tài chính + phân quyền | 2 giờ |
| 5 | `SalesOrderListPage.tsx` | Thêm cột theo role | 30 phút |
| 6 | `SalesDashboardPage.tsx` | Thêm cảnh báo | 30 phút |
| 7 | `ExportDocumentsPage.tsx` | Fix diacritics | 15 phút |
| 8 | `App.tsx` + `Sidebar.tsx` | Thêm routes mới | 15 phút |

### 2.3 Files GIỮ NGUYÊN (7 files)

```
salesCustomerService.ts     — Không thay đổi
containerService.ts         — Không thay đổi
salesProductionService.ts   — Không thay đổi
CustomerListPage.tsx        — Không thay đổi
CustomerDetailPage.tsx      — Không thay đổi
ContainerPackingPage.tsx    — Không thay đổi
salesDashboardService.ts    — Chỉ thêm method cảnh báo
```

---

## 3. THIẾT KẾ CHI TIẾT

### 3.1 salesPermissionService.ts — PHÂN QUYỀN

```typescript
export type SalesRole = 'sale' | 'production' | 'logistics' | 'accounting' | 'admin'

// Xác định role từ phòng ban nhân viên
export function getSalesRole(user: AuthUser): SalesRole

// 20+ permission checks
export const salesPermissions = {
  // Khách hàng
  canCreateCustomer: (role) => boolean,
  canEditCustomer: (role) => boolean,

  // Đơn hàng
  canCreateOrder: (role) => boolean,
  canEditOrder: (role) => boolean,
  canCancelOrder: (role) => boolean,

  // Sản xuất
  canEditProduction: (role) => boolean,
  canCheckNVL: (role) => boolean,

  // Logistics
  canEditBooking: (role) => boolean,
  canEditContainer: (role) => boolean,
  canEditBL: (role) => boolean,
  canEditDHL: (role) => boolean,
  canCreateCOA: (role) => boolean,
  canCreatePL: (role) => boolean,

  // Tài chính
  canViewFinance: (role) => boolean,
  canEditLC: (role) => boolean,
  canEditPayment: (role) => boolean,
  canEditDiscount: (role) => boolean,
  canEditCommission: (role) => boolean,
  canCreateInvoice: (role) => boolean,
}
```

### 3.2 FinanceTab.tsx — TAB TÀI CHÍNH

```
┌─────────────────────────────────────────────────────────┐
│ 💰 Tài chính                    (Chỉ Kế toán + Admin)  │
│                                                         │
│ ┌─ Thanh toán ─────────────────────────────────────────┐│
│ │ Phương thức:  [DP AT SIGHT ▼]                        ││
│ │ Số L/C:       [0273NMLC0003926        ]              ││
│ │ Ngân hàng PH: [_________________________]            ││
│ │ Hạn L/C:      [30/04/2026  📅]  ⚠️ Còn 5 ngày      ││
│ │ Ngân hàng NH:  [AGRI ▼]                              ││
│ │ Ngày TT:      [26/08/2025  📅]                       ││
│ │ Số tiền nhận:  [$161,769.89    ]                     ││
│ │ Trạng thái:   [Đã thanh toán ✅]                     ││
│ └──────────────────────────────────────────────────────┘│
│                                                         │
│ ┌─ Chiết khấu ────────────────────────────────────────┐│
│ │ Số tiền CK:   [$145,592.90    ]                     ││
│ │ Ngày CK:      [04/09/2025  📅]                       ││
│ │ Ngày trình BTC: [05/09/2025  📅]                     ││
│ └──────────────────────────────────────────────────────┘│
│                                                         │
│ ┌─ Hoa hồng (Commission) ─────────────────────────────┐│
│ │ Mức:          [20      ] USD/MT                      ││
│ │ Tổng:         $2,016.00  (tự tính)                   ││
│ │ Broker:       [Bimla Trading          ]              ││
│ │ Đã chi:       [☑] Ngày: 10/09/2025                  ││
│ └──────────────────────────────────────────────────────┘│
│                                                         │
│ ┌─ Giá ───────────────────────────────────────────────┐│
│ │ Giá chốt:      $1,604.86 /MT                        ││
│ │ Giá hợp đồng:  $1,620.00 /MT                        ││
│ │ Chênh lệch:    $15.14 (hoa hồng + chi phí)          ││
│ └──────────────────────────────────────────────────────┘│
│                                                         │
│ [💾 Lưu thay đổi]                                      │
└─────────────────────────────────────────────────────────┘
```

### 3.3 ShipmentFollowingPage.tsx — THEO DÕI LÔ HÀNG

```
Route: /sales/shipments

┌─────────────────────────────────────────────────────────────┐
│ Theo dõi lô hàng xuất                 [Tháng ▼] [📥 Excel] │
│                                                             │
│ Lọc: [Khách hàng ▼] [Grade ▼] [Trạng thái ▼] [🔍 Tìm...] │
│                                                             │
│ ┌───┬──────┬────────┬───┬───────┬───────┬──────┬─────────┐ │
│ │ # │Buyer │Contract│Lot│Hàng   │QTY(T) │Inco  │ETD      │ │
│ ├───┼──────┼────────┼───┼───────┼───────┼──────┼─────────┤ │
│ │ 1 │JK    │LTC/JK  │ 3 │SVR10  │100.8  │FOB   │02/08/25 │ │
│ │ 2 │PIX   │02A/PIX │ 1 │RSS3+10│100.8  │FOB   │02/08/25 │ │
│ │ 3 │TOWER │01/TG   │ - │SVR10  │201.6  │CIF   │19/08/25 │ │
│ └───┴──────┴────────┴───┴───────┴───────┴──────┴─────────┘ │
│ (tiếp: Booking│B/L│Bank│CK│DHL│TT Date│Status — scroll →)  │
│                                                             │
│ Phân quyền sửa:                                            │
│   Sale: chỉ xem                                            │
│   Logistics: sửa Booking, B/L, ETD, DHL                    │
│   Kế toán: sửa CK, Bank, TT Date                           │
│   Admin: sửa tất cả                                        │
│                                                             │
│ Tổng: 42 lô | $4.2M | 198 container                        │
└─────────────────────────────────────────────────────────────┘
```

### 3.4 ExecutiveDashboardPage.tsx — BGĐ

```
Route: /executive (chỉ BGĐ + Admin)

┌─────────────────────────────────────────────────────────┐
│ TỔNG QUAN ĐIỀU HÀNH           [Tháng 3/2026 ▼] [📥 PDF]│
│                                                         │
│ 💰 $1.2M doanh thu | 📦 14 đơn | 🏭 450T SX | 👥 87.6đ│
│                                                         │
│ ⚠️ 5 cảnh báo (2 đỏ, 3 vàng)               [Xem tất cả]│
│                                                         │
│ Pipeline: ██ → ███ → ██ → █ → ███ → ██                 │
│                                                         │
│ 📈 Doanh thu 6 tháng    🏆 Top 5 KH                    │
│ ▁▃▅▇█▇                  1. JK $670K                    │
│                          2. Tower $358K                 │
│                                                         │
│ 📦 Shipment gần đây     💼 Công nợ quá hạn             │
│ (5 dòng gần nhất)       $85K (JK lot 5)                │
└─────────────────────────────────────────────────────────┘
```

### 3.5 SalesOrderDetailPage — TÁCH + BỔ SUNG

```
TRƯỚC: 1 file 1,569 dòng — 5 tabs
SAU:   1 file chính + 6 tab components

Tabs (phân quyền theo role):

  [Thông tin]  [Chất lượng]  [Sản xuất]  [Đóng gói]  [Chứng từ]  [Tài chính]
     Sale         Sale          SX         Logistics    Log+KT       KT only

Mỗi tab là 1 component riêng:
  - OrderInfoTab.tsx         (Sale sửa, còn lại xem)
  - OrderQualityTab.tsx      (Sale sửa specs)
  - OrderProductionTab.tsx   (SX sửa, giữ nguyên từ code cũ)
  - OrderPackingTab.tsx      (Logistics sửa, thêm B/L + DHL)
  - OrderDocumentsTab.tsx    (Logistics: COA/PL, KT: Invoice)
  - OrderFinanceTab.tsx      (KT only — MỚI)
```

---

## 4. SQL MIGRATION

```sql
-- ============================================================
-- SALE ORDER V2 — Migration
-- ============================================================

-- 1. Thêm 16 cột cho sales_orders
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS contract_no VARCHAR(100);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS lot_number INTEGER;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS commodity_description TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS packing_description TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS bl_number VARCHAR(100);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS dhl_number VARCHAR(100);
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

-- 2. Thêm cột cho sales_customers
ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS tax_id VARCHAR(50);
ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS default_bank VARCHAR(50);
ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS broker_name VARCHAR(200);
ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS broker_commission NUMERIC(10,2);

-- 3. Thêm 4 sản phẩm
INSERT INTO rubber_grade_standards (grade, grade_label, drc_min, dirt_max, ash_max, nitrogen_max, volatile_matter_max, moisture_max, sort_order)
VALUES
  ('RSS1', 'RSS 1', 60, 0.010, 0.50, 0.60, 0.20, 0.80, 6),
  ('RSS3', 'RSS 3', 60, 0.020, 0.50, 0.60, 0.20, 0.80, 7),
  ('SBR1502', 'SBR 1502', 0, 0, 0, 0, 0, 0, 8),
  ('COMPOUND', 'Compound Rubber', 0, 0, 0, 0, 0, 0, 9)
ON CONFLICT (grade) DO NOTHING;

-- 4. Import 25 khách hàng thật
-- (SQL chi tiết trong SALES_ORDER_UPDATE_PLAN.md mục 5.1)

-- 5. Xóa KH test cũ (nếu muốn)
-- DELETE FROM sales_customers WHERE code LIKE 'KH-TEST%';
```

---

## 5. KẾ HOẠCH 3 NGÀY

### Ngày 1: Nền tảng + Phân quyền

```
Sáng (4 giờ):
  ☐ Chạy SQL migration
  ☐ Import 25 KH thật + 4 sản phẩm
  ☐ Tạo salesPermissionService.ts
  ☐ Cập nhật salesTypes.ts (payment terms, banks)

Chiều (4 giờ):
  ☐ Tích hợp phân quyền vào SalesOrderDetailPage
  ☐ Tích hợp phân quyền vào SalesOrderListPage
  ☐ Fix 4 chỗ tiếng Việt thiếu dấu
  ☐ Test 4 role: Sale/SX/Logistics/KT
```

### Ngày 2: Tab Tài chính + Shipment Following

```
Sáng (4 giờ):
  ☐ Tạo FinanceTab.tsx (L/C, chiết khấu, hoa hồng, TT)
  ☐ Tích hợp vào SalesOrderDetailPage
  ☐ Cập nhật SalesOrderCreatePage (thêm fields mới)

Chiều (4 giờ):
  ☐ Tạo ShipmentFollowingPage.tsx
  ☐ Thêm route + sidebar
  ☐ Phân quyền trên trang Shipment
  ☐ Export Excel
```

### Ngày 3: Dashboard BGĐ + Cảnh báo + Test

```
Sáng (4 giờ):
  ☐ Tạo salesAlertService.ts (7 cảnh báo)
  ☐ Tạo ExecutiveDashboardPage.tsx
  ☐ Tích hợp cảnh báo vào Dashboard

Chiều (3 giờ):
  ☐ Test toàn bộ với data thật
  ☐ Fix bugs phát sinh
  ☐ Deploy production
  ☐ Viết hướng dẫn sử dụng cho 4 BP
```

---

## 6. KẾT QUẢ SAU 3 NGÀY

### Code thay đổi

```
FILES MỚI:     5 files  (~1,750 dòng)
FILES SỬA:     8 files  (~500 dòng thay đổi)
FILES GIỮ:     7 files  (không thay đổi)
TỔNG:          20 files | ~12,000 dòng
```

### Tính năng hoàn chỉnh

```
✅ 25 khách hàng thật (từ Excel 2025)
✅ 12 phương thức thanh toán (DP, LC, TT, phức hợp)
✅ 10 sản phẩm (SVR + RSS + SBR + Compound)
✅ 10 trạng thái đơn hàng (Nháp → Đã TT)
✅ 4 bước tạo đơn (KH → Specs → Vận chuyển → Xác nhận)
✅ 6 tab chi tiết (Info, Quality, SX, Packing, Docs, Finance)
✅ Container management (auto create, seal, assign bales)
✅ 3 chứng từ xuất (COA, Packing List, Invoice)
✅ Phân quyền 4 BP (field-level)
✅ Tab Tài chính (L/C, chiết khấu, hoa hồng, thanh toán)
✅ Shipment Following (thay thế Excel)
✅ Executive Dashboard (BGĐ)
✅ 7 cảnh báo tự động
✅ Export Excel + Print PDF
✅ Lịch sử thay đổi
✅ Tiếng Việt có dấu 100%
```

### Menu cuối cùng

```
ĐƠN HÀNG BÁN
├─ Tổng quan          ← Dashboard Sale
├─ Khách hàng         ← 25 KH thật
├─ Đơn hàng           ← CRUD + 10 status
├─ Theo dõi lô hàng   ← MỚI (thay Excel)
└─ (BGĐ: Tổng quan điều hành)
```

---

## 7. SO SÁNH V1 vs V2

| | V1 (hiện tại) | V2 (sau 3 ngày) |
|--|-------------|----------------|
| Khách hàng | 5 KH test | **25 KH thật** |
| Sản phẩm | 5 (SVR only) | **10 (SVR + RSS + SBR)** |
| Payment terms | 5 loại | **12 loại** |
| Phân quyền | Không (ai cũng sửa hết) | **4 BP field-level** |
| Tab Tài chính | Không | **Có (L/C, CK, HH, TT)** |
| Shipment Following | Excel | **Trên ERP** |
| Cảnh báo | Không | **7 cảnh báo tự động** |
| Dashboard BGĐ | Không | **Executive Dashboard** |
| Trả lời KH | 30 phút | **30 giây** |
| Tiếng Việt | 96% | **100%** |

---

> Sale Order Module V2 — Thiết kế hoàn chỉnh
> Huy Anh Rubber ERP v8 — 30/03/2026
