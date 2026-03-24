# MODULE QUẢN LÝ ĐƠN HÀNG BÁN — SALES ORDER MANAGEMENT

**Dự án:** Huy Anh Rubber ERP v8
**Ngày:** 24/03/2026
**Quyền truy cập:** Chỉ `minhld@huyanhrubber.com` (admin)
**Tham khảo:** Hệ thống quản lý đơn hàng quốc tế ngành cao su (SICOM, TOCOM, rubber trader ERP)

---

## 1. BỐI CẢNH KINH DOANH

### 1.1 Mô hình kinh doanh Huy Anh

```
KHÁCH HÀNG QUỐC TẾ                    HUY ANH                    ĐẠI LÝ NVL
(Toyota, Michelin,                   (Nhà máy)                  (Đại lý mủ)
 Continental, Bridgestone...)
        │                               │                           │
        │  Đặt hàng (PO)                │  Mua NVL                  │
        │  Specs: SVR 3L, 200T           │  Deal B2B                 │
        │  DRC ≥ 60%, Dirt ≤ 0.02%      │  ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
        │  Giao FOB HCM 15/04           │                           │
        │──────────────────────────────→│                           │
        │                               │                           │
        │                               │  Sản xuất theo đơn        │
        │                               │  NVL → 5 công đoạn → TP  │
        │                               │                           │
        │  Giao hàng + COA              │                           │
        │  Container + Packing List     │                           │
        │←──────────────────────────────│                           │
        │                               │                           │
        │  Thanh toán (LC/TT)           │                           │
        │──────────────────────────────→│                           │
```

### 1.2 Đặc thù đơn hàng cao su quốc tế

| Đặc điểm | Chi tiết |
|-----------|----------|
| **Đơn vị giá** | USD/tấn hoặc USD/kg (FOB/CIF/CNF) |
| **Tiêu chuẩn chất lượng** | TCVN 3769:2016, ISO 2000, ISO 249 |
| **Đóng gói** | Bành 33.33 kg, shrink wrap PE, pallet optional |
| **Container** | 20ft (~20T, 600 bành) hoặc 40ft (~25T, 750 bành) |
| **Chứng từ xuất** | COA, Packing List, Weight Note, B/L, Commercial Invoice, Phytosanitary |
| **Thanh toán** | L/C (Letter of Credit), T/T (Wire Transfer), CAD |
| **Incoterms** | FOB, CIF, CNF, DDP |
| **Truy xuất** | Bắt buộc: Container → Bành → Lô SX → NVL → Vùng thu mua |

---

## 2. THIẾT KẾ DATABASE

### 2.1 Bảng `sales_customers` (Khách hàng)

```sql
CREATE TABLE IF NOT EXISTS sales_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) UNIQUE NOT NULL,           -- KH-TOYOTA-01
  name VARCHAR(200) NOT NULL,                  -- Toyota Tsusho Corporation
  short_name VARCHAR(50),                      -- Toyota
  country VARCHAR(100),                        -- Japan
  region VARCHAR(100),                         -- Asia Pacific

  -- Liên hệ
  contact_person VARCHAR(200),
  email VARCHAR(200),
  phone VARCHAR(50),
  address TEXT,

  -- Thương mại
  payment_terms VARCHAR(50),                   -- LC_60, TT_30, CAD
  default_incoterm VARCHAR(10),                -- FOB, CIF, CNF
  default_currency VARCHAR(3) DEFAULT 'USD',
  credit_limit NUMERIC(15,2),

  -- Chất lượng
  quality_standard VARCHAR(50),                -- TCVN_3769, ISO_2000, CUSTOM
  custom_specs JSONB DEFAULT '{}',             -- Specs riêng của KH
  preferred_grades TEXT[],                      -- ['SVR_3L', 'SVR_CV60']
  requires_pre_shipment_sample BOOLEAN DEFAULT false,

  -- Trạng thái
  status VARCHAR(20) DEFAULT 'active',         -- active, inactive, blacklisted
  tier VARCHAR(20) DEFAULT 'standard',         -- standard, premium, strategic

  -- Tracking
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.2 Bảng `sales_orders` (Đơn hàng)

```sql
CREATE TABLE IF NOT EXISTS sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,            -- SO-2026-0045

  -- Khách hàng
  customer_id UUID NOT NULL REFERENCES sales_customers(id),
  customer_po VARCHAR(100),                    -- PO# từ khách hàng

  -- Sản phẩm
  grade VARCHAR(20) NOT NULL,                  -- SVR_3L, SVR_5, SVR_10...
  quantity_tons NUMERIC(10,2) NOT NULL,         -- 200 tấn
  quantity_kg NUMERIC(12,2),                    -- 200,000 kg

  -- Giá
  unit_price NUMERIC(15,2) NOT NULL,           -- 1,850 USD/tấn
  currency VARCHAR(3) DEFAULT 'USD',
  exchange_rate NUMERIC(15,4),                  -- VND/USD tại thời điểm
  total_value_usd NUMERIC(15,2),
  total_value_vnd NUMERIC(15,2),
  incoterm VARCHAR(10) DEFAULT 'FOB',          -- FOB, CIF, CNF, DDP
  port_of_loading VARCHAR(100),                -- HCM, Hai Phong
  port_of_destination VARCHAR(100),            -- Yokohama, Rotterdam

  -- Chất lượng yêu cầu
  drc_min NUMERIC(5,2),
  drc_max NUMERIC(5,2),
  moisture_max NUMERIC(5,2) DEFAULT 0.80,
  dirt_max NUMERIC(5,3),
  ash_max NUMERIC(5,2),
  nitrogen_max NUMERIC(5,2),
  volatile_max NUMERIC(5,2),
  pri_min NUMERIC(5,1),
  mooney_max NUMERIC(5,1),
  color_lovibond_max NUMERIC(5,1),

  -- Đóng gói
  packing_type VARCHAR(20) DEFAULT 'bale',     -- bale, pallet, bulk
  bale_weight_kg NUMERIC(5,2) DEFAULT 33.33,
  total_bales INTEGER,
  shrink_wrap BOOLEAN DEFAULT true,
  pallet_required BOOLEAN DEFAULT false,
  marking_instructions TEXT,                    -- In gì trên bành

  -- Vận chuyển
  container_type VARCHAR(10),                  -- 20ft, 40ft
  container_count INTEGER,
  shipping_line VARCHAR(100),                  -- Maersk, MSC, Evergreen
  vessel_name VARCHAR(100),
  booking_reference VARCHAR(100),              -- Booking # hãng tàu

  -- Thời gian
  order_date DATE NOT NULL,
  delivery_date DATE,                          -- Ngày giao hàng cam kết
  etd DATE,                                    -- Estimated Time of Departure
  eta DATE,                                    -- Estimated Time of Arrival

  -- Thanh toán
  payment_terms VARCHAR(50),                   -- LC_60, TT_30
  lc_number VARCHAR(100),                      -- Số L/C
  lc_bank VARCHAR(200),                        -- Ngân hàng phát hành L/C
  lc_expiry_date DATE,

  -- Trạng thái
  status VARCHAR(20) DEFAULT 'draft',
  -- draft        : Nháp
  -- confirmed    : Đã xác nhận với KH
  -- producing    : Đang sản xuất
  -- ready        : Hàng sẵn sàng
  -- packing      : Đang đóng gói/container
  -- shipped      : Đã xuất hàng
  -- delivered    : Đã giao
  -- invoiced     : Đã xuất hóa đơn
  -- paid         : Đã thanh toán
  -- cancelled    : Đã hủy

  -- Liên kết
  production_order_id UUID,                    -- Lệnh SX cho đơn này
  stock_out_id UUID,                           -- Phiếu xuất kho

  -- Chứng từ
  coa_generated BOOLEAN DEFAULT false,
  packing_list_generated BOOLEAN DEFAULT false,
  invoice_generated BOOLEAN DEFAULT false,
  bl_received BOOLEAN DEFAULT false,

  -- Tracking
  notes TEXT,
  internal_notes TEXT,
  created_by UUID,
  confirmed_by UUID,
  confirmed_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.3 Bảng `sales_order_containers` (Container)

```sql
CREATE TABLE IF NOT EXISTS sales_order_containers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,

  container_no VARCHAR(50),                    -- MSKU1234567
  seal_no VARCHAR(50),                         -- Seal # hải quan
  container_type VARCHAR(10),                  -- 20ft, 40ft

  -- Trọng lượng
  gross_weight_kg NUMERIC(12,2),               -- Tổng KL (hàng + container)
  tare_weight_kg NUMERIC(12,2),                -- KL container rỗng
  net_weight_kg NUMERIC(12,2),                 -- KL hàng
  bale_count INTEGER,                          -- Số bành

  -- Trạng thái
  status VARCHAR(20) DEFAULT 'planning',       -- planning, packing, sealed, shipped
  packed_at TIMESTAMPTZ,
  sealed_at TIMESTAMPTZ,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.4 Bảng `sales_order_container_items` (Bành trong container)

```sql
CREATE TABLE IF NOT EXISTS sales_order_container_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  container_id UUID NOT NULL REFERENCES sales_order_containers(id) ON DELETE CASCADE,

  batch_id UUID REFERENCES stock_batches(id),  -- Lô hàng
  batch_no VARCHAR(50),                        -- Mã lô (snapshot)

  bale_from INTEGER,                           -- Bành từ #
  bale_to INTEGER,                             -- Bành đến #
  bale_count INTEGER,                          -- Số bành
  weight_kg NUMERIC(12,2),                     -- Trọng lượng

  grade VARCHAR(20),                           -- Grade (snapshot)
  drc NUMERIC(5,2),                            -- DRC (snapshot)

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.5 Bảng `sales_invoices` (Hóa đơn)

```sql
CREATE TABLE IF NOT EXISTS sales_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,            -- INV-2026-0045
  sales_order_id UUID REFERENCES sales_orders(id),
  customer_id UUID NOT NULL REFERENCES sales_customers(id),

  -- Giá trị
  subtotal NUMERIC(15,2),
  freight_charge NUMERIC(15,2) DEFAULT 0,
  insurance_charge NUMERIC(15,2) DEFAULT 0,
  total_amount NUMERIC(15,2),
  currency VARCHAR(3) DEFAULT 'USD',
  exchange_rate NUMERIC(15,4),
  total_vnd NUMERIC(15,2),

  -- Thanh toán
  payment_terms VARCHAR(50),
  due_date DATE,
  paid_amount NUMERIC(15,2) DEFAULT 0,
  payment_status VARCHAR(20) DEFAULT 'unpaid', -- unpaid, partial, paid

  -- Chứng từ
  invoice_date DATE,
  bl_number VARCHAR(100),
  bl_date DATE,

  status VARCHAR(20) DEFAULT 'draft',          -- draft, issued, sent, paid, cancelled

  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 3. PHASES CHI TIẾT

### Phase S1: Database + Customer Management (2 ngày)

| # | Task | Chi tiết | Thời gian |
|---|------|----------|-----------|
| S1.1 | SQL Migration | Tạo 5 bảng + indexes + RLS | 2h |
| S1.2 | Types (`salesTypes.ts`) | Interface cho tất cả entities | 2h |
| S1.3 | `salesCustomerService.ts` | CRUD customers + quality specs | 3h |
| S1.4 | `CustomerListPage.tsx` | Danh sách KH với filter (country, tier, grade) | 3h |
| S1.5 | `CustomerDetailPage.tsx` | Chi tiết KH + quality specs + order history | 3h |
| S1.6 | Routes + Sidebar | Menu "ĐƠN HÀNG BÁN" (chỉ minhld@) | 1h |

### Phase S2: Sales Order CRUD (3 ngày)

| # | Task | Chi tiết | Thời gian |
|---|------|----------|-----------|
| S2.1 | `salesOrderService.ts` | CRUD + code gen (SO-YYYY-XXXX) + status transitions | 4h |
| S2.2 | `SalesOrderListPage.tsx` | Danh sách đơn hàng + tabs theo status + filter KH/grade | 4h |
| S2.3 | `SalesOrderCreatePage.tsx` | Form tạo đơn: KH → grade → specs → giá → shipping → payment | 6h |
| S2.4 | `SalesOrderDetailPage.tsx` | Chi tiết đơn + tabs: Thông tin, Sản xuất, Đóng gói, Chứng từ, Thanh toán | 6h |
| S2.5 | Auto fill specs từ grade | Chọn SVR 3L → auto fill DRC ≥ 60, Dirt ≤ 0.02... từ rubber_grade_standards | 2h |
| S2.6 | Auto calculate | Tổng bành, số container, giá trị USD/VND | 2h |

### Phase S3: Order → Production Link (2 ngày)

| # | Task | Chi tiết | Thời gian |
|---|------|----------|-----------|
| S3.1 | "Tạo lệnh SX" từ đơn hàng | Nút → tính NVL cần (quantity / yield) → tạo Production Order | 3h |
| S3.2 | Check NVL availability | Trước SX → kiểm tra kho NVL đủ không (theo DRC phù hợp) | 2h |
| S3.3 | Track production progress | Tab "Sản xuất" trong SalesOrderDetail → hiện stage progress | 2h |
| S3.4 | NVL reservation | Giữ lô NVL cho đơn hàng → không cho đơn khác dùng | 3h |
| S3.5 | Update status auto | SX xong → đơn hàng tự chuyển "ready" | 2h |

### Phase S4: Container & Packing (2 ngày)

| # | Task | Chi tiết | Thời gian |
|---|------|----------|-----------|
| S4.1 | `containerService.ts` | CRUD containers + assign bales | 3h |
| S4.2 | `ContainerPackingPage.tsx` | UI assign bành vào container: drag-drop hoặc auto-fill | 5h |
| S4.3 | Auto container planning | Tính: 200T ÷ 20T/cont = 10 containers → tạo 10 records | 2h |
| S4.4 | Seal + weight recording | Ghi seal #, cân container (gross/tare/net) | 2h |
| S4.5 | Container status tracking | planning → packing → sealed → shipped | 1h |

### Phase S5: Chứng từ xuất khẩu (3 ngày)

| # | Task | Chi tiết | Thời gian |
|---|------|----------|-----------|
| S5.1 | **COA Template** | PDF: batch QC results vs rubber_grade_standards | 4h |
| S5.2 | **Packing List** | PDF: container → bành list, weight, grade | 3h |
| S5.3 | **Weight Note** | PDF: container gross/tare/net weights | 2h |
| S5.4 | **Commercial Invoice** | PDF: qty × price, freight, total, payment terms | 4h |
| S5.5 | **Shipping Docs Bundle** | 1 nút → tạo tất cả: COA + PL + WN + Invoice | 3h |
| S5.6 | Multi-language | English versions cho tất cả docs | 3h |

### Phase S6: Dashboard & Reports (2 ngày)

| # | Task | Chi tiết | Thời gian |
|---|------|----------|-----------|
| S6.1 | Sales Dashboard | KPIs: đơn tháng này, doanh thu, top KH, top grade | 4h |
| S6.2 | Revenue report | Doanh thu theo KH / grade / tháng | 3h |
| S6.3 | Order fulfillment | Tỷ lệ giao đúng hạn, quality compliance | 2h |
| S6.4 | Pipeline chart | Đơn hàng theo status (funnel chart) | 2h |
| S6.5 | Export calendar | Lịch giao hàng tháng này/tháng sau | 2h |

---

## 4. LUỒNG NGHIỆP VỤ

### 4.1 Tạo đơn hàng

```
KH gửi PO (email/fax)
    ↓
Nhân viên tạo Sales Order trên ERP
    ├─ Chọn KH (Toyota)
    ├─ Chọn Grade (SVR 3L)
    ├─ Nhập SL (200 tấn)
    ├─ Auto fill specs (DRC ≥ 60%, Dirt ≤ 0.02%...)
    ├─ Nhập giá (1,850 USD/T)
    ├─ Chọn Incoterm (FOB HCM)
    ├─ Nhập shipping info (container, ETD)
    └─ Nhập payment terms (L/C 60 days)
    ↓
Status: draft → confirmed
```

### 4.2 Sản xuất theo đơn

```
Đơn hàng confirmed
    ↓
Nút "Tạo lệnh SX"
    ├─ Tính NVL cần: 200T ÷ 80% yield = 250T NVL
    ├─ Check kho NVL: có 180T SVR10 phù hợp → thiếu 70T
    ├─ Gợi ý: mua thêm 70T hoặc dùng lô DRC thấp hơn + blend
    └─ Tạo Production Order gắn sales_order_id
    ↓
Sản xuất 5 công đoạn → QC thành phẩm
    ↓
TP đạt → Status: producing → ready
```

### 4.3 Đóng gói & Container

```
Hàng sẵn sàng (ready)
    ↓
Container planning
    ├─ 200T ÷ 20T/cont = 10 containers 20ft
    ├─ Mỗi container: ~600 bành × 33.33 kg
    └─ Assign lô TP → container
    ↓
Đóng container
    ├─ Cân container (gross/tare/net)
    ├─ Ghi seal #
    └─ Chụp ảnh (optional)
    ↓
Status: ready → packing → shipped
```

### 4.4 Chứng từ xuất

```
Container sealed
    ↓
Nút "Tạo chứng từ"
    ├─ COA (Certificate of Analysis) — per batch/container
    ├─ Packing List — per container
    ├─ Weight Note — per container
    ├─ Commercial Invoice — per order
    └─ Phytosanitary Certificate (manual upload)
    ↓
Gửi KH qua email / courier
    ↓
Status: shipped → delivered → invoiced → paid
```

---

## 5. PHÂN QUYỀN

| Menu | Quyền truy cập |
|------|----------------|
| ĐƠN HÀNG BÁN | Chỉ `minhld@huyanhrubber.com` |
| └─ Khách hàng | minhld@ |
| └─ Đơn hàng | minhld@ |
| └─ Đóng gói/Container | minhld@ |
| └─ Chứng từ xuất | minhld@ |
| └─ Hóa đơn | minhld@ |
| └─ Dashboard bán hàng | minhld@ |

---

## 6. LỘ TRÌNH

```
Tuần 1:  Phase S1 + S2     (DB + Customer + Order CRUD)     5 ngày
Tuần 2:  Phase S3 + S4     (Production link + Container)    4 ngày
Tuần 3:  Phase S5 + S6     (Chứng từ + Dashboard)           5 ngày
```

**Tổng: ~14 ngày làm việc (3 tuần)**

---

## 7. KẾ HOẠCH WMS TỔNG THỂ (CẬP NHẬT)

```
GIAI ĐOẠN 1: Sales Order Module           14 ngày  ← LÀM TRƯỚC
GIAI ĐOẠN 2: Kho NVL (Phase 1-6)          10 ngày
GIAI ĐOẠN 3: Fix bugs + Cost (Phase 7-8)   4 ngày
GIAI ĐOẠN 4: COA + Supplier (Phase 9-10)   4 ngày  ← Tích hợp vào Sales
GIAI ĐOẠN 5: Forecast + Export (Phase 11-12) 4 ngày ← Tích hợp vào Sales
                                           ─────────
                                     Tổng: 36 ngày (~7 tuần)
```

**Lưu ý:** Phase 9 (COA) và Phase 12 (Container Manifest) từ WMS Upgrade Plan sẽ được **tích hợp vào Sales Order Module** thay vì làm riêng.

---

*Sales Order Module Spec v1.0*
*Huy Anh Rubber ERP v8*
*24/03/2026*
