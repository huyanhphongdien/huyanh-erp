# SALES ORDER — THIẾT KẾ TỔNG QUAN ĐA BỘ PHẬN

> **Ngày:** 30/03/2026
> **Tham chiếu:** Dữ liệu thực tế từ Shipment Following + HĐ 2025-2026 + KHACH HANG 2025
> **4 Bộ phận:** Sale | Sản xuất | Logistics | Kế toán

---

## 1. LUỒNG ĐƠN HÀNG — 4 BỘ PHẬN PHỐI HỢP

```
BP SALE tạo đơn hàng
     │
     ▼
┌──────────────────────────────────────────────────────┐
│                    ĐƠN HÀNG BÁN                      │
│                                                      │
│  NHÁP ──► XÁC NHẬN ──► ĐANG SX ──► SẴN SÀNG        │
│  (Sale)    (Sale)       (SX)        (SX)             │
│                                       │              │
│                            ĐÓNG GÓI ◄─┘              │
│                            (Logistics)               │
│                               │                      │
│                          ĐÃ XUẤT                     │
│                          (Logistics)                 │
│                               │                      │
│                        CHỜ THANH TOÁN                │
│                          (Kế toán)                   │
│                               │                      │
│                       ĐÃ THANH TOÁN                  │
│                          (Kế toán)                   │
│                               │                      │
│                          HOÀN TẤT                    │
└──────────────────────────────────────────────────────┘
```

### Ai làm gì ở mỗi trạng thái

| Trạng thái | BP chịu trách nhiệm | Việc cần làm | Chuyển tiếp bởi |
|-----------|---------------------|-------------|----------------|
| **Nháp** | Sale | Tạo đơn: KH, sản phẩm, giá, specs, packing | Sale xác nhận |
| **Đã xác nhận** | Sale + SX | SX kiểm tra NVL, lên kế hoạch SX | SX tạo lệnh SX |
| **Đang SX** | SX | 5 công đoạn, cập nhật tiến độ, yield | SX xác nhận sẵn sàng |
| **Sẵn sàng** | SX → Logistics | TP đã QC, chờ đóng gói | Logistics bắt đầu đóng gói |
| **Đóng gói** | Logistics | Container, seal, booking tàu | Logistics xuất hàng |
| **Đã xuất** | Logistics | B/L, DHL, ETD, trình chứng từ | Logistics hoàn tất xuất |
| **Chờ thanh toán** | Kế toán | Invoice, L/C, ghi nhận thanh toán | Kế toán xác nhận TT |
| **Đã thanh toán** | Kế toán | Chiết khấu, hoa hồng, sổ cái | Tự động hoàn tất |

---

## 2. MỖI BỘ PHẬN NHẬP LIỆU GÌ

### 2.1 BP SALE — Tab "Thông tin" + "Chất lượng"

**Khi tạo đơn hàng (4 bước wizard):**

```
BƯỚC 1: KHÁCH HÀNG & SẢN PHẨM
├─ Khách hàng          [Chọn từ danh sách ▼]
├─ PO# khách hàng      [PO-2026-TOYOTA-001]
├─ Số hợp đồng         [01/PD-JK/2026]
├─ Lot (lô xuất)       [3]
├─ Sản phẩm / Grade    [SVR10 ▼]
├─ Số lượng (tấn)      [100.8]
├─ Giá chốt (USD/T)    [1,604.86]
├─ Giá hợp đồng        [1,620.00]  ← có thể khác giá chốt (do hoa hồng)
├─ Tiền tệ              [USD ▼]
├─ Tỷ giá               [25,500]
└─ Mô tả hàng hóa      [NATURAL RUBBER SVR10]

BƯỚC 2: CHẤT LƯỢNG & ĐÓNG GÓI
├─ DRC min / max        [50% — 55%]
├─ Moisture max         [0.80%]
├─ Dirt max             [0.08%]
├─ Ash max              [0.60%]
├─ Nitrogen max         [0.60%]
├─ Volatile max         [0.20%]
├─ PRI min              [30]
├─ Mooney max           [—]
├─ Loại đóng gói        [Bành (Bale) ▼]
├─ KL bành              [33.33 kg / 35 kg]
├─ Shrink wrap           [☑]
├─ Pallet               [☐ / Wooden pallet / Plastic pallet]
├─ Mô tả đóng gói      [35 Kgs/Bale; 576 bales / 16 SW plastic pallets]
└─ Marking instructions  [HUY ANH PHONG DIEN / SVR10 / LOT 3...]

BƯỚC 3: VẬN CHUYỂN & THANH TOÁN
├─ Incoterms            [FOB ▼ / CIF / CFR]
├─ Cảng xếp hàng        [Đà Nẵng (DAD) ▼ / HCM]
├─ Cảng đích             [CHENNAI]
├─ Loại container        [20ft ▼ / 40ft]
├─ Số container          [5]  ← tự tính từ SL
├─ Thời gian giao        [ETD: 02/08/2025]
├─ Điều khoản TT         [DP ▼ / LC AT SIGHT / LC 30 / TT 100%...]
├─ Ngân hàng              [AGRI ▼ / VTB / TP / EXIM]
├─ Hoa hồng broker       [20 USD/MT]  ← nếu có middleman
└─ Ghi chú               [...]

BƯỚC 4: XÁC NHẬN
├─ Tóm tắt đơn hàng
├─ Giá trị: $161,769.89
├─ Tổng bành: 2,880
└─ [Lưu nháp] [Xác nhận đơn hàng]
```

### 2.2 BP SẢN XUẤT — Tab "Sản xuất"

**Khi đơn hàng "Đã xác nhận":**

```
TAB SẢN XUẤT
├─ Kiểm tra NVL khả dụng
│   ├─ Cần: ~126T NVL (yield 80%)
│   ├─ Tồn kho: 85T (SVR10 grade)
│   ├─ Thiếu: 41T
│   └─ [Tạo nhu cầu mua NVL] ← link đến B2B Demands
│
├─ Kế hoạch sản xuất
│   ├─ Dây chuyền        [Line 01 ▼]
│   ├─ Ngày bắt đầu SX   [15/03/2026]
│   ├─ Ngày dự kiến xong  [25/03/2026]
│   ├─ Yield dự kiến      [80%]
│   └─ [Tạo lệnh sản xuất]
│
├─ Tiến độ sản xuất (khi đang SX)
│   ├─ ▓▓▓▓▓▓▓▓░░ 80% — Công đoạn 4: Ép
│   ├─ Stage 1: Rửa        ✅ 20T → 19.5T (loss 2.5%)
│   ├─ Stage 2: Tán/Kéo    ✅ 19.5T → 19T
│   ├─ Stage 3: Sấy        ✅ 19T → 17T (loss 10.5%)
│   ├─ Stage 4: Ép         🔄 Đang chạy...
│   └─ Stage 5: Đóng gói   ⏳ Chờ
│
└─ Kết quả SX
    ├─ Sản lượng thực tế   [81T]
    ├─ Yield thực tế        [80.4%]
    ├─ QC thành phẩm        [PASS — SVR10]
    └─ [Xác nhận sẵn sàng giao]
```

### 2.3 BP LOGISTICS — Tab "Đóng gói" + "Chứng từ"

**Khi đơn hàng "Sẵn sàng":**

```
TAB ĐÓNG GÓI
├─ [Tạo container tự động]  ← tính từ SL
├─ [Phân bổ bành tự động]   ← FIFO
│
├─ Container 1: MSKU2001234
│   ├─ Seal: HA-2026-001
│   ├─ Loại: 20ft
│   ├─ Bành: 576 bành (20.16T)
│   ├─ Gross: 22,200 kg
│   ├─ Tare: 2,200 kg
│   ├─ Net: 20,000 kg
│   └─ Trạng thái: ĐÃ SEAL ✅
│
├─ Container 2: MSKU2005678
│   └─ ... (tương tự)
│
├─ Booking tàu
│   ├─ Booking No       [DADF07281500]
│   ├─ Hãng tàu          [ONE / EVERGREEN / MAERSK]
│   ├─ Tên tàu           [VSE251187]
│   ├─ ETD               [02/08/2025]
│   ├─ ETA               [15/08/2025]
│   └─ B/L No            [AP-25EX0584]
│
└─ DHL / Chuyển phát
    ├─ DHL No            [64 2774 3836]
    └─ Ngày gửi          [02/08/2025]

TAB CHỨNG TỪ
├─ COA (Certificate of Analysis)
│   ├─ Trạng thái: ĐÃ TẠO ✅
│   ├─ Nội dung: QC results vs SVR10 standard
│   └─ [Xem] [In] [Tải PDF]
│
├─ Packing List
│   ├─ Trạng thái: ĐÃ TẠO ✅
│   ├─ Nội dung: 5 containers × bales × weights
│   └─ [Xem] [In] [Tải PDF]
│
├─ Ngày trình BTC       [05/09/2025]
│
└─ [Đánh dấu đã xuất hàng]
```

### 2.4 BP KẾ TOÁN — Tab "Tài chính"

**Khi đơn hàng "Đã xuất" trở đi:**

```
TAB TÀI CHÍNH
├─ Hóa đơn (Invoice)
│   ├─ Số hóa đơn        [INV-2026-0001]
│   ├─ Ngày hóa đơn      [05/08/2025]
│   ├─ Subtotal           $161,769.89
│   ├─ Freight            $0 (FOB)
│   ├─ Insurance          $0 (FOB)
│   ├─ Total              $161,769.89
│   ├─ Trạng thái         [Đã phát hành ▼]
│   └─ [Xem] [In] [Tải PDF]
│
├─ Thanh toán
│   ├─ Phương thức         [DP AT SIGHT]
│   ├─ Số L/C              [0273NMLC0003926]
│   ├─ Ngân hàng phát hành [—]
│   ├─ Ngân hàng nhận      [AGRI ▼]
│   ├─ Hạn L/C             [—]
│   ├─ Ngày thanh toán     [26/08/2025]
│   ├─ Số tiền đã nhận     [$161,769.89]
│   └─ Trạng thái TT       [ĐÃ THANH TOÁN ✅]
│
├─ Chiết khấu
│   ├─ Số tiền CK          [$145,592.90]
│   ├─ Ngày chiết khấu     [04/09/2025]
│   ├─ Ngày trình BTC      [05/09/2025]
│   └─ Ghi chú             [Chiết khấu theo HĐ]
│
├─ Hoa hồng (Commission)
│   ├─ Mức                 [20 USD/MT]
│   ├─ Tổng                [$2,016.00]
│   ├─ Broker              [Bimla Trading]
│   └─ Trạng thái          [Đã chi]
│
├─ Giá
│   ├─ Giá chốt            $1,604.86
│   ├─ Giá hợp đồng        $1,620.00
│   └─ Chênh lệch          $15.14 (hoa hồng + chi phí)
│
└─ Tổng kết
    ├─ Doanh thu            $161,769.89
    ├─ Chiết khấu           -$145,592.90  ← ???
    ├─ Hoa hồng             -$2,016.00
    └─ Lợi nhuận ròng       $14,160.99
```

---

## 3. MA TRẬN PHÂN QUYỀN CHI TIẾT

### 3.1 Quyền theo tab trong Chi tiết đơn hàng

```
                    Sale    SX    Logistics  Kế toán  Admin
─────────────────────────────────────────────────────────
Tab Thông tin
  Xem                ✅     👁      👁        👁       ✅
  Sửa KH, sản phẩm   ✅     ❌      ❌        ❌       ✅
  Sửa giá             ✅     ❌      ❌        ❌       ✅
  Sửa specs           ✅     ❌      ❌        ❌       ✅
  Sửa packing         ✅     ❌      ❌        ❌       ✅

Tab Chất lượng
  Xem                ✅     ✅      👁        👁       ✅
  Sửa specs          ✅     ❌      ❌        ❌       ✅

Tab Sản xuất
  Xem                👁     ✅      👁        ❌       ✅
  Kiểm tra NVL       ❌     ✅      ❌        ❌       ✅
  Tạo lệnh SX       ❌     ✅      ❌        ❌       ✅
  Cập nhật tiến độ   ❌     ✅      ❌        ❌       ✅
  Xác nhận sẵn sàng ❌     ✅      ❌        ❌       ✅

Tab Đóng gói
  Xem                👁     👁      ✅        ❌       ✅
  Tạo container      ❌     ❌      ✅        ❌       ✅
  Seal container     ❌     ❌      ✅        ❌       ✅
  Nhập booking/B/L   ❌     ❌      ✅        ❌       ✅
  Nhập DHL           ❌     ❌      ✅        ❌       ✅
  Nhập ETD/ETA       ❌     ❌      ✅        ❌       ✅

Tab Chứng từ
  Xem                👁     ❌      ✅        ✅       ✅
  Tạo COA            ❌     ❌      ✅        ❌       ✅
  Tạo Packing List   ❌     ❌      ✅        ❌       ✅
  Tạo Invoice        ❌     ❌      ❌        ✅       ✅
  In chứng từ        ✅     ❌      ✅        ✅       ✅

Tab Tài chính (MỚI)
  Xem                ❌     ❌      ❌        ✅       ✅
  Nhập L/C           ❌     ❌      ❌        ✅       ✅
  Nhập thanh toán    ❌     ❌      ❌        ✅       ✅
  Nhập chiết khấu    ❌     ❌      ❌        ✅       ✅
  Nhập hoa hồng      ❌     ❌      ❌        ✅       ✅
  Tạo hóa đơn       ❌     ❌      ❌        ✅       ✅

👁 = Chỉ xem (read-only)
```

### 3.2 Quyền theo trang

```
                        Sale  SX  Log  KT   Admin
────────────────────────────────────────────────
/sales/dashboard         ✅   ❌   ✅   ✅    ✅
/sales/customers         ✅   ❌   ❌   👁    ✅
/sales/orders            ✅   👁   👁   ✅    ✅
/sales/orders/new        ✅   ❌   ❌   ❌    ✅
/sales/orders/:id        ✅   👁   👁   ✅    ✅
/sales/orders/:id/packing ❌  ❌   ✅   ❌    ✅
/sales/orders/:id/docs   👁   ❌   ✅   ✅    ✅
/sales/shipments (MỚI)   👁   ❌   ✅   ✅    ✅
/executive (MỚI)         ❌   ❌   ❌   ❌    ✅ + BGĐ
```

### 3.3 Xác định role từ phòng ban

```typescript
// Mapping phòng ban → role Sales
const DEPT_ROLE_MAP: Record<string, SalesRole> = {
  'Phòng Kinh doanh': 'sale',
  'Phòng Xuất nhập khẩu': 'logistics',
  'Phòng Kế toán': 'accounting',
  'Phòng Sản xuất': 'production',
  'Phòng QC': 'production',        // QC thuộc nhóm SX
  'Phòng Cơ Điện': 'production',   // Cơ Điện thuộc nhóm SX
  'Ban Giám đốc': 'admin',
}

// Hoặc minhld@huyanhrubber.com → luôn là admin
```

---

## 4. KHÁCH HÀNG THỰC TẾ (25 đối tác)

### 4.1 Theo quốc gia

| Quốc gia | Số KH | KH chính | Cảng đích |
|---------|-------|---------|----------|
| **Ấn Độ** | 9 | JK, ATC, PIX, KOHINOOR, RALSON | CHENNAI, NHAVA |
| **Singapore** | 3 | TOWER GLOBAL, IE SYNERGY, R1 | — (trung gian) |
| **Trung Quốc** | 3 | ZHEJIANG, JIANGSU, WINYONG | SHANGHAI, QINGDAO |
| **Indonesia** | 3 | PT ALPHEN, PT AYUMAS, PT OKAMOTO | JAKARTA, BELAWAN, SURABAYA |
| **Sri Lanka** | 2 | MALAYA, GRI | COLOMBO |
| **Đài Loan** | 1 | UKKO | KEELUNG |
| **UAE** | 1 | VITRY | — |
| **Thổ Nhĩ Kỳ** | 1 | PROCHEM | — |
| **Tây Ban Nha** | 1 | COELSIN | VALENCIA |
| **Bangladesh** | 1 | KARNAPHULI | — |

### 4.2 Theo sản phẩm

| Sản phẩm | KH mua | Tỷ trọng |
|---------|--------|---------|
| **SVR10** | JK, ATC, PIX, KOHINOOR, TOWER, IE SYNERGY, GRI, R1 | ~60% |
| **SVR3L** | PT ALPHEN, PT AYUMAS, GOUTAM, KIMEX, UKKO, VITRY, COELSIN | ~25% |
| **RSS3** | PIX, MALAYA, GRI, PROCHEM, UKKO, BRAZA | ~10% |
| **SBR1502** | TOWER GLOBAL, IE SYNERGY, ZHEJIANG | ~3% |
| **RSS1** | VITRY | ~1% |
| **Compound** | MALAYA | ~1% |

### 4.3 Theo phương thức thanh toán

| Phương thức | KH sử dụng | Tỷ trọng |
|------------|-----------|---------|
| **DP (Documents against Payment)** | JK, ATC, PIX, KOHINOOR | ~40% |
| **TT 100%** | PT ALPHEN, PT AYUMAS, UKKO, MALAYA | ~25% |
| **L/C at sight** | RALSON | ~10% |
| **L/C 30 ngày** | PIX (một số đơn) | ~5% |
| **L/C 90 ngày** | GRI | ~5% |
| **CIF + DP phức hợp** | TOWER GLOBAL (10%TT + 90%DP) | ~10% |
| **Khác** | Các KH mới | ~5% |

---

## 5. SẢN PHẨM & GIÁ THỰC TẾ

### 5.1 Bảng giá tham khảo (USD/MT — 2025-2026)

| Sản phẩm | Giá thấp | Giá cao | Giá TB | Incoterms |
|---------|---------|--------|-------|-----------|
| SVR10 | $1,600 | $1,890 | $1,700 | FOB |
| SVR3L | $1,875 | $2,240 | $2,050 | FOB/CIF |
| RSS3 | $1,860 | $2,170 | $2,000 | FOB/CIF |
| RSS1 | $1,940 | $1,940 | $1,940 | FOB |
| SBR1502 | $1,750 | $1,845 | $1,800 | CIF |
| Compound | $1,790 | $1,790 | $1,790 | FOB |
| SVR CV60 | $1,750 | $1,765 | $1,760 | CIF |

### 5.2 Đóng gói phổ biến

| Kiểu | Mô tả | KH sử dụng |
|------|-------|-----------|
| Loose Bales 35kg | Bành rời 35kg, không pallet | JK, ATC, phần lớn KH Ấn Độ |
| Loose Bales 33.33kg | Bành rời 33.33kg | GOUTAM, KIMEX, VITRY |
| SW Plastic Pallet | Shrink wrap + pallet nhựa | VITRY, UKKO (Adidas) |
| SW Wooden Pallet | Shrink wrap + pallet gỗ | UKKO |
| Loose + Thick Poly Bag | Bành rời + bao PE dày | UKKO |

### 5.3 Cảng xếp hàng

| Cảng | Viết tắt | Ghi chú |
|------|---------|---------|
| Đà Nẵng | DAD | Cảng chính (~90% đơn) |
| Hồ Chí Minh | HCM / SGN | Một số đơn Indonesia, đặc biệt |

---

## 6. DATABASE CẬP NHẬT

### 6.1 SQL Migration — Tất cả trong 1 file

```sql
-- ============================================================
-- SALES ORDER UPDATE — Cập nhật theo dữ liệu thực tế
-- Ngày: 30/03/2026
-- ============================================================

-- 1. Thêm 16 cột mới cho sales_orders
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

-- 3. Thêm sản phẩm mới
INSERT INTO rubber_grade_standards (grade, grade_label, drc_min, dirt_max, ash_max, nitrogen_max, volatile_matter_max, moisture_max, sort_order)
VALUES
  ('RSS1', 'RSS 1', 60, 0.010, 0.50, 0.60, 0.20, 0.80, 6),
  ('RSS3', 'RSS 3', 60, 0.020, 0.50, 0.60, 0.20, 0.80, 7),
  ('SBR1502', 'SBR 1502', 0, 0, 0, 0, 0, 0, 8),
  ('COMPOUND', 'Compound Rubber', 0, 0, 0, 0, 0, 0, 9)
ON CONFLICT (grade) DO NOTHING;

-- 4. Import 25 khách hàng thật
-- (SQL đã có trong SALES_ORDER_UPDATE_PLAN.md mục 5.1)
```

---

## 7. CẢNH BÁO CHO BAN GIÁM ĐỐC

### 7.1 Từ module Sales Order

| # | Cảnh báo | Mức | Điều kiện |
|---|---------|-----|----------|
| 1 | Đơn hàng sắp tới hạn giao | 🔴 | `delivery_date - today < 7 ngày` AND status chưa 'shipped' |
| 2 | Container chưa seal | 🔴 | `etd - today < 5 ngày` AND có container status 'planning' |
| 3 | Đơn mới chưa xác nhận | 🟡 | `status = 'draft'` AND `created_at - today > 3 ngày` |
| 4 | Công nợ KH quá hạn | 🔴 | `payment_date IS NULL` AND `delivery_date - today > 30 ngày` |
| 5 | L/C sắp hết hạn | 🔴 | `lc_expiry_date - today < 7 ngày` |
| 6 | Đơn hủy (cancel) | 🟡 | `status = 'cancelled'` trong tháng |

### 7.2 Từ các module khác

| # | Cảnh báo | Nguồn | Mức |
|---|---------|-------|-----|
| 7 | NVL tồn thấp | WMS | 🟡 |
| 8 | LSX trễ tiến độ | Production | 🔴 |
| 9 | Yield < 75% | Production | 🟡 |
| 10 | Deal B2B chưa quyết toán | B2B | 🟡 |
| 11 | NV hiệu suất hạng F | HR | 🔴 |
| 12 | Task quá hạn | Task | 🟡 |

---

## 8. TRANG THEO DÕI LÔ HÀNG (SHIPMENT FOLLOWING)

### 8.1 Thiết kế — Giống Excel hiện tại

```
Route: /sales/shipments

┌──────────────────────────────────────────────────────────┐
│ Theo dõi lô hàng xuất                   [Tháng ▼] [Excel]│
├──────────────────────────────────────────────────────────┤
│ NO│Buyer │Contract│Lot│PO/LC    │Booking  │B/L     │     │
│ ──┼──────┼────────┼───┼─────────┼─────────┼────────┤     │
│ 1 │JK    │LTC/JK  │ 3 │41000129 │DADF0728 │AP-25EX │     │
│ 2 │JK    │LTC/JK  │ 4 │41000129 │DADF0728 │AP-25EX │     │
│ 3 │KOHIN │03/PD-KI│ - │LC:0273  │SUDUDAG  │KGNVS25 │     │
│ ──┼──────┼────────┼───┼─────────┼─────────┼────────┤     │
│   │Hàng │QTY│Vol│POL│POD    │Inco│Payment│Price  │Amount│
│   │SVR10│101│ 5 │DAD│CHENNAI│FOB │DP     │1604.86│161K  │
│   │SVR10│101│ 5 │DAD│CHENNAI│FOB │DP     │1604.86│161K  │
│   │SVR10│ 21│ 1 │DAD│NSA    │FOB │DP     │1675.00│ 35K  │
├──────────────────────────────────────────────────────────┤
│ Discount│Bank│Trình BTC│CK Date│ETD     │DHL      │TT   │
│ $145K   │AGRI│         │       │02/08/25│64 2774  │26/08│
│ $145K   │AGRI│         │       │02/08/25│84 1236  │12/09│
│ —       │AGRI│         │       │02/08/25│31 7683  │27/08│
└──────────────────────────────────────────────────────────┘

Phân quyền:
  Sale: xem tất cả
  Logistics: xem + sửa Booking, B/L, ETD, DHL
  Kế toán: xem + sửa Discount, Payment Date, Bank
  Admin: full quyền
```

---

## 9. KẾ HOẠCH TRIỂN KHAI

| Phase | Nội dung | Effort | Ảnh hưởng |
|-------|----------|--------|-----------|
| **S-A** | SQL migration + import KH + sản phẩm | 15 phút | Database only |
| **S-B** | salesPermissionService + phân quyền UI | 1.5 giờ | Tất cả trang Sales |
| **S-C** | Cập nhật SalesOrderCreatePage (trường mới) | 1 giờ | Form tạo đơn |
| **S-D** | Tab Tài chính mới + fields Logistics | 1.5 giờ | SalesOrderDetailPage |
| **S-E** | Trang Shipment Following | 1 giờ | Trang mới |
| **S-F** | Executive Dashboard | 1.5 giờ | Trang mới |
| **S-G** | Cảnh báo tự động | 1 giờ | Dashboard + Notification |
| **S-H** | Test + Deploy | 30 phút | — |

**Tổng: ~8 giờ**

**Thứ tự:** A → B → C → D → E → F → G → H
(Sửa từ nền tảng lên, không sửa ngược)

---

## 10. CHECKLIST TRƯỚC KHI CODE

- [ ] Đã đọc file SYSTEM_FLOW_ANALYSIS.md
- [ ] Đã xác định cascade effects cho mỗi thay đổi
- [ ] Đã backup database trước khi sửa SQL
- [ ] Toàn bộ UX bằng **tiếng Việt có dấu**
- [ ] Phân quyền test đủ 4 role (Sale/SX/Logistics/KT)
- [ ] Ghi nhật ký sau mỗi lần sửa
- [ ] `npx tsc --noEmit` pass trước khi push

---

> Thiết kế tổng quan Sales Order đa bộ phận
> Công ty TNHH MTV Cao su Huy Anh Phong Điền
> ERP v8 — 30/03/2026
