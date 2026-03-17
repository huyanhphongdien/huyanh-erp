# KẾ HOẠCH REDESIGN WMS MODULE — CHUYÊN NGÀNH CAO SU

> **Dự án:** Huy Anh Rubber ERP v8
> **Module:** WMS — Kho Nguyên liệu & Thành phẩm
> **Ngày lập:** 17/03/2026
> **Mục tiêu:** Redesign UI sang Ant Design + Bổ sung nghiệp vụ đặc thù cao su
> **Phạm vi:** 30 pages WMS, 15 services, 14 database tables

---

## 1. HIỆN TRẠNG & VẤN ĐỀ

### 1.1 Đã hoàn thành

| Phase | Nội dung | Status |
|-------|----------|--------|
| P1 | Database schema + Types | ✅ |
| P2 | Danh mục: Materials, Warehouses, Locations | ✅ |
| P3 | Nhập kho + QC Initial | ✅ |
| P4 | Xuất kho + FIFO Picking | ✅ |
| P5 | Tồn kho Dashboard + Alerts | ✅ |
| P6 | QC Tracking & DRC Recheck | ✅ |
| P7 | Weighbridge (Cân xe) | ✅ |
| P4-B2B | Deal ↔ WMS Integration | ✅ |

### 1.2 Vấn đề hiện tại

```
❌ UI: Toàn bộ 30 pages WMS dùng Tailwind thuần
       → B2B đã dùng Ant Design → không đồng nhất

❌ Nghiệp vụ: WMS xử lý cao su như hàng hóa generic
       → Thiếu DRC-adjusted weight, rubber grade, moisture
       → Thiếu truy xuất nguồn gốc, contamination tracking
       → Thiếu xu hướng DRC, seasonal standards
       → Thiếu COA xuất khẩu, container optimization
```

### 1.3 Mục tiêu

1. **Thống nhất UI** → Ant Design v6 cho toàn bộ WMS
2. **Bổ sung nghiệp vụ cao su** → Fields, logic, reports đặc thù
3. **Chuẩn bị nền tảng** → Cho P8 (Production), P9 (Blending), P10 (Reports)

---

## 2. ĐẶC THÙ NGÀNH CAO SU CẦN BỔ SUNG

### 2.1 Thuật ngữ chuyên ngành

| Thuật ngữ | Giải thích | Ảnh hưởng đến WMS |
|-----------|------------|-------------------|
| **DRC** (Dry Rubber Content) | Hàm lượng cao su khô (%) — chỉ số quan trọng nhất | Quyết định giá trị, phân loại grade |
| **SVR** (Standard Vietnamese Rubber) | Tiêu chuẩn cao su VN: SVR 3L, 5, 10, 20 | Phân loại theo DRC |
| **Trọng lượng khô** | `weight × (DRC/100)` | Giá trị thực = trọng lượng khô × đơn giá |
| **Hao hụt** | Cao su khô dần → mất trọng lượng ~2-5%/tháng | Cần tracking weight loss |
| **Độ ẩm** (Moisture) | % nước trong mủ | Ảnh hưởng DRC, chất lượng |
| **Mùa vụ** | Mùa mưa: DRC thấp hơn, mùa khô: DRC cao hơn | Tiêu chuẩn QC cần adjust theo mùa |
| **Cup lump / Latex / Tờ** | Dạng vật lý của mủ | Mỗi dạng có DRC kỳ vọng khác |
| **PRI** (Plasticity Retention Index) | Chỉ số độ dẻo | Quyết định chất lượng SVR |
| **Mooney** | Độ nhớt Mooney | Tiêu chuẩn xuất khẩu |
| **Phối trộn** (Blending) | Trộn nhiều lô để đạt DRC mong muốn | Cần P9 |
| **COA** (Certificate of Analysis) | Chứng chỉ phân tích — bắt buộc xuất khẩu | Cần cho Stock-Out |
| **Bành** | Đơn vị đóng gói: 33.33 kg/bành | Xuất khẩu tính theo bành |

### 2.2 Phân loại Grade theo DRC

```
DRC ≥ 60%  → SVR 3L  (Cao cấp — giá cao nhất)
DRC 55-60% → SVR 5
DRC 50-55% → SVR 10
DRC < 50%  → SVR 20  (hoặc cần blend)
```

### 2.3 Công thức tính giá trị

```
Trọng lượng khô (dry_weight) = total_weight × (actual_drc / 100)
Giá trị thực (final_value)   = dry_weight × unit_price
Hao hụt (shrinkage)          = initial_weight - current_weight
Tỷ lệ hao hụt               = shrinkage / initial_weight × 100%
```

---

## 3. DATABASE MIGRATION

### 3.1 Bổ sung cột vào `stock_batches`

```sql
-- Rubber-specific fields
ALTER TABLE stock_batches
  ADD COLUMN IF NOT EXISTS rubber_grade VARCHAR(20),        -- SVR_3L, SVR_5, SVR_10, SVR_20
  ADD COLUMN IF NOT EXISTS rubber_type VARCHAR(20),         -- cup_lump, latex, sheet, crepe
  ADD COLUMN IF NOT EXISTS moisture_content NUMERIC(5,2),   -- % moisture at intake
  ADD COLUMN IF NOT EXISTS dry_weight NUMERIC(12,2),        -- weight × (DRC/100)
  ADD COLUMN IF NOT EXISTS initial_weight NUMERIC(12,2),    -- weight at intake (for shrinkage calc)
  ADD COLUMN IF NOT EXISTS current_weight NUMERIC(12,2),    -- current actual weight
  ADD COLUMN IF NOT EXISTS weight_loss NUMERIC(12,2) DEFAULT 0,  -- shrinkage kg
  ADD COLUMN IF NOT EXISTS last_weight_check DATE,          -- last physical weight check
  ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(200),      -- dealer/supplier name
  ADD COLUMN IF NOT EXISTS supplier_region VARCHAR(100),    -- origin region
  ADD COLUMN IF NOT EXISTS supplier_reported_drc NUMERIC(5,2),  -- DRC claimed by supplier
  ADD COLUMN IF NOT EXISTS storage_days INTEGER DEFAULT 0,  -- days in warehouse
  ADD COLUMN IF NOT EXISTS contamination_status VARCHAR(20) DEFAULT 'clean',
    -- 'clean' | 'suspected' | 'confirmed' | 'cleared'
  ADD COLUMN IF NOT EXISTS contamination_notes TEXT,
  ADD COLUMN IF NOT EXISTS supplier_lab_report_url TEXT;
```

### 3.2 Bổ sung cột vào `batch_qc_results`

```sql
ALTER TABLE batch_qc_results
  ADD COLUMN IF NOT EXISTS moisture_content NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS volatile_matter NUMERIC(5,2),     -- % chất bay hơi
  ADD COLUMN IF NOT EXISTS metal_content NUMERIC(8,4),       -- mg/kg kim loại
  ADD COLUMN IF NOT EXISTS dirt_content NUMERIC(5,3),        -- % tạp chất
  ADD COLUMN IF NOT EXISTS color_lovibond NUMERIC(5,1),      -- màu Lovibond
  ADD COLUMN IF NOT EXISTS grade_tested VARCHAR(20),         -- SVR grade determined by QC
  ADD COLUMN IF NOT EXISTS grade_matches_expected BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS contamination_detected BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS contamination_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS supplier_drc_discrepancy NUMERIC(5,2);  -- our DRC - supplier DRC
```

### 3.3 Bổ sung cột vào `material_qc_standards`

```sql
ALTER TABLE material_qc_standards
  ADD COLUMN IF NOT EXISTS rubber_grade VARCHAR(20),
  ADD COLUMN IF NOT EXISTS moisture_max NUMERIC(5,2) DEFAULT 0.80,     -- ISO max 0.80%
  ADD COLUMN IF NOT EXISTS volatile_matter_max NUMERIC(5,2) DEFAULT 0.20,
  ADD COLUMN IF NOT EXISTS dirt_max NUMERIC(5,3) DEFAULT 0.020,        -- SVR 3L: max 0.02%
  ADD COLUMN IF NOT EXISTS ash_max NUMERIC(5,2) DEFAULT 0.50,          -- SVR 3L: max 0.50%
  ADD COLUMN IF NOT EXISTS nitrogen_max NUMERIC(5,2) DEFAULT 0.60,     -- max 0.60%
  ADD COLUMN IF NOT EXISTS pri_min NUMERIC(5,1) DEFAULT 40,            -- PRI min for SVR
  ADD COLUMN IF NOT EXISTS mooney_max NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS color_lovibond_max NUMERIC(5,1) DEFAULT 6,  -- SVR 3L: max 6
  ADD COLUMN IF NOT EXISTS season VARCHAR(10) DEFAULT 'all';           -- 'all', 'dry', 'rainy'
```

### 3.4 Bổ sung cột vào `stock_out_orders`

```sql
ALTER TABLE stock_out_orders
  ADD COLUMN IF NOT EXISTS svr_grade VARCHAR(20),           -- required SVR grade
  ADD COLUMN IF NOT EXISTS required_drc_min NUMERIC(5,2),   -- min DRC for this order
  ADD COLUMN IF NOT EXISTS required_drc_max NUMERIC(5,2),   -- max DRC for this order
  ADD COLUMN IF NOT EXISTS container_type VARCHAR(10),       -- '20ft' | '40ft'
  ADD COLUMN IF NOT EXISTS container_id VARCHAR(50),         -- container number
  ADD COLUMN IF NOT EXISTS packing_type VARCHAR(20),         -- 'bale' | 'pallet' | 'bulk'
  ADD COLUMN IF NOT EXISTS bale_count INTEGER,               -- number of bales (33.33kg each)
  ADD COLUMN IF NOT EXISTS packing_requirements TEXT,        -- customer-specific instructions
  ADD COLUMN IF NOT EXISTS export_date DATE,
  ADD COLUMN IF NOT EXISTS coa_generated BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS packing_list_generated BOOLEAN DEFAULT false;
```

### 3.5 Bảng mới: `rubber_grade_standards`

```sql
CREATE TABLE IF NOT EXISTS rubber_grade_standards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade VARCHAR(20) NOT NULL UNIQUE,     -- SVR_3L, SVR_5, SVR_10, SVR_20, SVR_CV60
  grade_label VARCHAR(50) NOT NULL,      -- display name
  drc_min NUMERIC(5,2) NOT NULL,         -- min DRC for this grade
  drc_max NUMERIC(5,2),                  -- max DRC (null = no upper limit)
  dirt_max NUMERIC(5,3) NOT NULL,        -- max dirt content %
  ash_max NUMERIC(5,2) NOT NULL,         -- max ash content %
  nitrogen_max NUMERIC(5,2) NOT NULL,    -- max nitrogen %
  volatile_matter_max NUMERIC(5,2) NOT NULL,
  pri_min NUMERIC(5,1),                  -- min PRI (null = not required)
  mooney_max NUMERIC(5,1),              -- max Mooney (null = not required)
  moisture_max NUMERIC(5,2) NOT NULL DEFAULT 0.80,
  color_lovibond_max NUMERIC(5,1),      -- max color (null = not required)
  price_factor NUMERIC(5,3) DEFAULT 1.000,  -- price multiplier vs base
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert standard SVR grades
INSERT INTO rubber_grade_standards (grade, grade_label, drc_min, drc_max, dirt_max, ash_max, nitrogen_max, volatile_matter_max, pri_min, color_lovibond_max, sort_order) VALUES
  ('SVR_3L', 'SVR 3L', 60, NULL, 0.020, 0.50, 0.60, 0.20, 40, 6, 1),
  ('SVR_5',  'SVR 5',  55, 60,  0.040, 0.50, 0.60, 0.20, 40, NULL, 2),
  ('SVR_10', 'SVR 10', 50, 55,  0.080, 0.60, 0.60, 0.20, 30, NULL, 3),
  ('SVR_20', 'SVR 20', 40, 50,  0.160, 0.80, 0.60, 0.20, 30, NULL, 4),
  ('SVR_CV60', 'SVR CV60', 60, NULL, 0.020, 0.50, 0.60, 0.20, NULL, NULL, 5)
ON CONFLICT (grade) DO NOTHING;
```

### 3.6 Bảng mới: `weight_check_logs`

```sql
CREATE TABLE IF NOT EXISTS weight_check_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES stock_batches(id),
  previous_weight NUMERIC(12,2),
  new_weight NUMERIC(12,2) NOT NULL,
  weight_change NUMERIC(12,2),            -- negative = loss
  change_reason VARCHAR(50) DEFAULT 'drying',  -- drying | reweigh | adjust
  checked_by UUID,
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

CREATE INDEX idx_weight_check_logs_batch ON weight_check_logs(batch_id);
```

---

## 4. KẾ HOẠCH TRIỂN KHAI — 6 ĐỢT

### Tổng quan

```
Đợt 1: Types + Database + Services nền     (1-2 ngày)
Đợt 2: Dashboard + Stock-In                (2-3 ngày)
Đợt 3: QC + Recheck                        (2-3 ngày)
Đợt 4: Weighbridge                         (1-2 ngày)
Đợt 5: Stock-Out + Picking                 (2-3 ngày)
Đợt 6: Tồn kho + Alerts + Danh mục        (2-3 ngày)
                                      ──────────────
                                Total: ~10-16 ngày
```

---

### ĐỢT 1: TYPES + DATABASE + SERVICES NỀN

**Mục tiêu:** Bổ sung types, chạy migration, tạo services mới

#### 1.1 Sửa `wms.types.ts`

```typescript
// Thêm rubber-specific fields vào StockBatch
export interface StockBatch {
  // ... existing fields ...

  // Rubber-specific
  rubber_grade?: RubberGrade
  rubber_type?: RubberType
  moisture_content?: number
  dry_weight?: number              // weight × (DRC/100)
  initial_weight?: number          // weight at intake
  current_weight?: number          // current actual weight
  weight_loss?: number             // shrinkage
  last_weight_check?: string
  supplier_name?: string
  supplier_region?: string
  supplier_reported_drc?: number
  storage_days?: number
  contamination_status?: ContaminationStatus
  contamination_notes?: string
  supplier_lab_report_url?: string
}

export type RubberGrade = 'SVR_3L' | 'SVR_5' | 'SVR_10' | 'SVR_20' | 'SVR_CV60'
export type RubberType = 'cup_lump' | 'latex' | 'sheet' | 'crepe' | 'mixed'
export type ContaminationStatus = 'clean' | 'suspected' | 'confirmed' | 'cleared'

export interface RubberGradeStandard {
  id: string
  grade: RubberGrade
  grade_label: string
  drc_min: number
  drc_max: number | null
  dirt_max: number
  ash_max: number
  nitrogen_max: number
  volatile_matter_max: number
  pri_min: number | null
  mooney_max: number | null
  moisture_max: number
  color_lovibond_max: number | null
  price_factor: number
  is_active: boolean
  sort_order: number
}

export interface WeightCheckLog {
  id: string
  batch_id: string
  previous_weight: number | null
  new_weight: number
  weight_change: number | null
  change_reason: 'drying' | 'reweigh' | 'adjust'
  checked_by: string | null
  checked_at: string
  notes: string | null
}
```

#### 1.2 Sửa `BatchQCResult` trong types

```typescript
export interface BatchQCResult {
  // ... existing fields ...

  // Rubber QC additions
  moisture_content?: number
  volatile_matter?: number
  metal_content?: number
  dirt_content?: number
  color_lovibond?: number
  grade_tested?: RubberGrade
  grade_matches_expected?: boolean
  contamination_detected?: boolean
  contamination_type?: string
  supplier_drc_discrepancy?: number
}
```

#### 1.3 Tạo `rubberGradeService.ts`

```typescript
// src/services/wms/rubberGradeService.ts
export const rubberGradeService = {
  getAll(): Promise<RubberGradeStandard[]>,
  getByGrade(grade: RubberGrade): Promise<RubberGradeStandard | null>,
  classifyByDRC(drc: number): RubberGrade,      // DRC → SVR grade
  calculateDryWeight(weight: number, drc: number): number,
  calculateShrinkage(initialWeight: number, currentWeight: number): {
    loss_kg: number
    loss_percent: number
  },
  getGradeLabel(grade: RubberGrade): string,
  getGradeColor(grade: RubberGrade): string,
}
```

#### 1.4 Tạo `weightTrackingService.ts`

```typescript
// src/services/wms/weightTrackingService.ts
export const weightTrackingService = {
  recordWeightCheck(batchId: string, newWeight: number, reason?: string): Promise<WeightCheckLog>,
  getWeightHistory(batchId: string): Promise<WeightCheckLog[]>,
  calculateWeightLoss(batchId: string): Promise<{
    initial_weight: number
    current_weight: number
    total_loss_kg: number
    loss_percent: number
    days_in_storage: number
    avg_loss_per_day: number
  }>,
  getBatchesWithExcessiveLoss(thresholdPercent?: number): Promise<StockBatch[]>,
  updateStorageDays(): Promise<number>,  // scheduled: update storage_days cho tất cả batches
}
```

#### 1.5 Files tạo/sửa

| File | Action | Nội dung |
|------|--------|---------|
| `docs/migrations/wms_rubber_fields.sql` | TẠO | SQL migration (section 3 ở trên) |
| `src/services/wms/wms.types.ts` | SỬA | Thêm rubber fields, types |
| `src/services/wms/rubberGradeService.ts` | TẠO | Grade classification + helpers |
| `src/services/wms/weightTrackingService.ts` | TẠO | Weight loss tracking |
| `src/services/wms/batchService.ts` | SỬA | Thêm rubber fields vào create/update |
| `src/services/wms/qcService.ts` | SỬA | Thêm rubber QC fields, grade verification |
| `src/services/wms/alertService.ts` | SỬA | Thêm rubber alerts |

---

### ĐỢT 2: DASHBOARD + STOCK-IN → ANT DESIGN

**Mục tiêu:** 4 pages → Ant Design + rubber data

#### 2.1 InventoryDashboard (redesign)

**Hiện tại:** Tailwind cards, stock summary table
**Mới:**

```
┌─────────────────────────────────────────────────────────────┐
│  KPI Cards (Ant Design Statistic)                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │ Tổng tồn │ │ Trọng    │ │ DRC TB   │ │ Cảnh báo │      │
│  │ 45 lô    │ │ lượng khô│ │  56.2%   │ │   12     │      │
│  │          │ │ 125.5 T  │ │          │ │          │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
│                                                             │
│  ┌─────────────────────────┐ ┌─────────────────────────┐   │
│  │ PHÂN BỐ GRADE (Pie)    │ │ DRC TREND 30 NGÀY (Line)│   │
│  │                         │ │                         │   │
│  │   SVR 3L: 30%          │ │  ──────────────         │   │
│  │   SVR 5:  25%          │ │ /              \        │   │
│  │   SVR 10: 35%          │ │/                \───    │   │
│  │   SVR 20: 10%          │ │                         │   │
│  └─────────────────────────┘ └─────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ BẢNG TỒN KHO (Ant Design Table)                    │   │
│  │ Vật liệu | Grade | Tồn (T) | DRC TB | Khô (T) | ⚠ │   │
│  │ SVR 10   | SVR10 | 25.0    | 52.5%  | 13.1    | 2  │   │
│  │ SVR 3L   | SVR3L | 15.0    | 62.0%  | 9.3     | 0  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ CẢNH BÁO (Alert cards)                              │   │
│  │ 🔴 3 lô DRC < min  🟡 5 lô cần recheck            │   │
│  │ 🟠 2 lô hao hụt >5%  🔵 2 lô lưu kho >60 ngày    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Bổ sung cao su:**
- KPI: Trọng lượng khô (dry weight) thay vì chỉ gross weight
- Biểu đồ phân bố grade (SVR 3L/5/10/20)
- Trend DRC 30 ngày (line chart)
- Cảnh báo hao hụt trọng lượng
- Cảnh báo lưu kho quá lâu

#### 2.2 StockInCreatePage (redesign)

**Bổ sung cao su:**
- Chọn loại mủ (cup lump/latex/tờ)
- Nhập DRC đại lý báo (supplier_reported_drc)
- Nhập tên đại lý, vùng nguồn gốc
- Tự tính dry_weight khi nhập DRC + weight
- Tự phân loại grade theo DRC
- Checklist nhập kho: kiểm tra ngoại quan, tạp chất, độ ẩm

#### 2.3 StockInListPage (redesign)

**Bổ sung cao su:**
- Cột: Grade, DRC, Dry Weight
- Filter: theo grade, theo dealer
- Badge grade với màu sắc

#### 2.4 StockInDetailPage (redesign)

**Bổ sung cao su:**
- Thông tin đại lý/nguồn gốc
- So sánh DRC đại lý báo vs QC đo
- Trọng lượng khô vs trọng lượng thực
- Timeline hao hụt (nếu có weight checks)

#### 2.5 Files tạo/sửa

| File | Action |
|------|--------|
| `src/pages/wms/InventoryDashboard.tsx` | REWRITE → Ant Design |
| `src/pages/wms/stock-in/StockInListPage.tsx` | REWRITE → Ant Design |
| `src/pages/wms/stock-in/StockInCreatePage.tsx` | REWRITE → Ant Design |
| `src/pages/wms/stock-in/StockInDetailPage.tsx` | REWRITE → Ant Design |
| `src/services/wms/stockInService.ts` | SỬA: thêm rubber fields |
| `src/services/wms/inventoryService.ts` | SỬA: thêm DRC-weighted, grade distribution |

---

### ĐỢT 3: QC + RECHECK → ANT DESIGN

**Mục tiêu:** 4 pages QC → Ant Design + rubber QC nâng cao

#### 3.1 QCDashboardPage (redesign)

**Bổ sung cao su:**
- Phân bố grade hiện tại (pie chart)
- DRC trend theo thời gian (line chart per grade)
- Bảng degradation rate: lô nào DRC giảm nhanh nhất
- Supplier quality scorecard
- QC summary theo tiêu chuẩn ISO (moisture, volatile, dirt, ash, nitrogen, PRI)

#### 3.2 QCRecheckPage (redesign)

**Bổ sung cao su:**
- Form nhập đầy đủ tiêu chuẩn SVR: DRC, PRI, Mooney, ash, nitrogen, volatile, dirt, moisture, color
- Grade verification: DRC → auto classify grade → so sánh expected
- DRC trend chart cho batch (history)
- Gợi ý blend khi DRC không đạt
- Degradation rate calculation

#### 3.3 QCStandardsConfigPage (redesign)

**Bổ sung cao su:**
- Bảng tiêu chuẩn SVR theo grade (từ rubber_grade_standards)
- Tiêu chuẩn theo mùa (dry/rainy season)
- Tất cả chỉ tiêu: DRC, PRI, Mooney, ash, nitrogen, volatile, dirt, moisture, color

#### 3.4 BatchQCHistoryPage (redesign)

**Bổ sung cao su:**
- Timeline DRC với trend line
- Hiện tất cả chỉ tiêu QC (không chỉ DRC)
- Grade changes over time
- Degradation rate visual

#### 3.5 Files tạo/sửa

| File | Action |
|------|--------|
| `src/pages/wms/qc/QCDashboardPage.tsx` | REWRITE → Ant Design |
| `src/pages/wms/qc/QCRecheckPage.tsx` | REWRITE → Ant Design |
| `src/pages/wms/qc/QCStandardsConfigPage.tsx` | REWRITE → Ant Design |
| `src/pages/wms/qc/BatchQCHistoryPage.tsx` | REWRITE → Ant Design |
| `src/services/wms/qcService.ts` | SỬA: thêm full SVR QC, grade verify, trend |
| `src/components/wms/QCInputForm.tsx` | REWRITE → Ant Design + full SVR fields |

---

### ĐỢT 4: WEIGHBRIDGE → ANT DESIGN

**Mục tiêu:** 3 pages cân xe → Ant Design + rubber integration

#### 4.1 WeighbridgePage (redesign)

**Bổ sung cao su:**
- Hiện DRC-adjusted weight khi biết DRC
- So sánh net weight vs khai báo (discrepancy alert >2%)
- Link tới Deal info khi có
- Tare weight history cho biển số (detect gian lận)

#### 4.2 WeighbridgeListPage (redesign)

**Bổ sung cao su:**
- Cột: DRC-adjusted weight
- Filter: theo dealer, theo Deal
- Summary: tổng net weight ngày

#### 4.3 WeighbridgeDetailPage (redesign)

**Bổ sung cao su:**
- Weight reconciliation (kho vs cân)
- Ảnh xe + hàng

#### 4.4 Files tạo/sửa

| File | Action |
|------|--------|
| `src/pages/wms/weighbridge/WeighbridgePage.tsx` | REWRITE → Ant Design |
| `src/pages/wms/weighbridge/WeighbridgeListPage.tsx` | REWRITE → Ant Design |
| `src/pages/wms/weighbridge/WeighbridgeDetailPage.tsx` | REWRITE → Ant Design |

---

### ĐỢT 5: STOCK-OUT + PICKING → ANT DESIGN

**Mục tiêu:** 4 pages xuất kho → Ant Design + rubber export

#### 5.1 StockOutCreatePage (redesign)

**Bổ sung cao su:**
- Chọn SVR grade yêu cầu → auto set DRC range
- Picking theo DRC range (không chỉ FIFO)
- Chọn container type (20ft/40ft) → tính tối đa bao nhiêu tấn
- Tính số bành (weight / 33.33)
- Packing requirements text

#### 5.2 StockOutDetailPage (redesign)

**Bổ sung cao su:**
- COA generation button
- Packing list generation button
- Weight reconciliation (kho vs shipping)
- Grade verification summary

#### 5.3 PickingListPage (redesign)

**Bổ sung cao su:**
- Hiện DRC mỗi batch được pick
- Grade badge
- Packing checklist
- Bành count per batch

#### 5.4 StockOutListPage (redesign)

**Bổ sung cao su:**
- Cột: Grade, Container, COA status
- Filter: theo grade, có/chưa COA

#### 5.5 Files tạo/sửa

| File | Action |
|------|--------|
| `src/pages/wms/stock-out/StockOutCreatePage.tsx` | REWRITE → Ant Design |
| `src/pages/wms/stock-out/StockOutDetailPage.tsx` | REWRITE → Ant Design |
| `src/pages/wms/stock-out/StockOutListPage.tsx` | REWRITE → Ant Design |
| `src/pages/wms/stock-out/PickingListPage.tsx` | REWRITE → Ant Design |
| `src/services/wms/stockOutService.ts` | SỬA: thêm grade-based picking |
| `src/services/wms/pickingService.ts` | SỬA: filter by DRC range |
| `src/services/wms/exportDocumentService.ts` | TẠO: COA + Packing list |

---

### ĐỢT 6: TỒN KHO + ALERTS + DANH MỤC → ANT DESIGN

**Mục tiêu:** Các pages còn lại → Ant Design + rubber enhancements

#### 6.1 InventoryDetailPage (redesign)

**Bổ sung cao su:**
- Tab: Batches (với DRC, grade), DRC Trend (chart), Weight Loss (chart), History
- Batch card: hiện grade, DRC, dry weight, storage days, contamination status
- Weight loss trend chart (initial → current)

#### 6.2 AlertListPage (redesign)

**Bổ sung cao su:**
- Alert types mới: weight_loss_excessive, storage_too_long, contamination, grade_mismatch
- Filter theo alert type

#### 6.3 StockCheckPage (redesign)

**Bổ sung cao su:**
- So sánh weight hiện tại vs hệ thống (detect hao hụt)
- Record weight check → weight_check_logs
- DRC recheck gợi ý khi weight loss >5%

#### 6.4 MaterialListPage (redesign)

**Bổ sung cao su:**
- Cột: Rubber Grade, DRC Target
- Filter: theo grade

#### 6.5 WarehouseListPage + WarehouseLocationPage (redesign)

**Bổ sung cao su:**
- Location grid: hiện grade + DRC của batch tại mỗi vị trí
- Gợi ý vị trí theo grade (tách kho theo SVR grade)

#### 6.6 Files tạo/sửa

| File | Action |
|------|--------|
| `src/pages/wms/InventoryDetailPage.tsx` | REWRITE → Ant Design |
| `src/pages/wms/AlertListPage.tsx` | REWRITE → Ant Design |
| `src/pages/wms/StockCheckPage.tsx` | REWRITE → Ant Design |
| `src/pages/wms/materials/MaterialListPage.tsx` | REWRITE → Ant Design |
| `src/pages/wms/warehouses/WarehouseListPage.tsx` | REWRITE → Ant Design |
| `src/pages/wms/warehouses/WarehouseLocationPage.tsx` | REWRITE → Ant Design |
| `src/services/wms/alertService.ts` | SỬA: thêm rubber alerts |
| `src/services/wms/inventoryService.ts` | SỬA: DRC-weighted, grade distribution |

---

## 5. COMPONENTS CHUNG (TẠO MỚI)

### 5.1 Ant Design Components cho WMS

| Component | Mô tả | Dùng ở |
|-----------|--------|--------|
| `DRCGauge.tsx` | Gauge hiển thị DRC + grade zones | QC, Detail pages |
| `GradeBadge.tsx` | Badge SVR grade với màu | Tất cả list/detail |
| `DryWeightDisplay.tsx` | Hiện weight + DRC → dry weight | Dashboard, Detail |
| `QCSVRForm.tsx` | Form nhập đầy đủ chỉ tiêu SVR | QC Recheck |
| `WeightLossChart.tsx` | Chart hao hụt theo thời gian | Inventory Detail |
| `DRCTrendChart.tsx` | Chart DRC trend | QC Dashboard, Batch History |
| `GradeDistributionChart.tsx` | Pie chart phân bố grade | Dashboard |
| `ContaminationBadge.tsx` | Badge trạng thái tạp chất | Batch cards |
| `RubberIntakeChecklist.tsx` | Checklist nhập kho mủ | Stock-In Create |
| `COADocument.tsx` | Template Certificate of Analysis | Stock-Out Detail |

### 5.2 Ant Design Theme cho WMS

```typescript
// Màu sắc theo grade
const GRADE_COLORS = {
  SVR_3L:  '#16A34A',  // Xanh lá — cao cấp
  SVR_5:   '#22C55E',  // Xanh lá nhạt
  SVR_10:  '#F59E0B',  // Vàng cam
  SVR_20:  '#DC2626',  // Đỏ — cần blend
  SVR_CV60: '#7C3AED', // Tím — đặc biệt
}

// Màu QC
const QC_COLORS = {
  passed: '#16A34A',
  warning: '#F59E0B',
  failed: '#DC2626',
  pending: '#6B7280',
  needs_blend: '#7C3AED',
}

// Màu contamination
const CONTAMINATION_COLORS = {
  clean: '#16A34A',
  suspected: '#F59E0B',
  confirmed: '#DC2626',
  cleared: '#2563EB',
}
```

---

## 6. TỔNG HỢP FILES

### 6.1 Files tạo mới (14 files)

| File | Đợt | Mô tả |
|------|-----|-------|
| `docs/migrations/wms_rubber_fields.sql` | 1 | SQL migration |
| `src/services/wms/rubberGradeService.ts` | 1 | Grade classification |
| `src/services/wms/weightTrackingService.ts` | 1 | Weight loss tracking |
| `src/services/wms/exportDocumentService.ts` | 5 | COA + Packing list |
| `src/components/wms/DRCGauge.tsx` | 2 | Ant Design DRC gauge |
| `src/components/wms/GradeBadge.tsx` | 2 | SVR grade badge |
| `src/components/wms/DryWeightDisplay.tsx` | 2 | Weight + DRC display |
| `src/components/wms/QCSVRForm.tsx` | 3 | Full SVR QC form |
| `src/components/wms/WeightLossChart.tsx` | 2 | Weight loss chart |
| `src/components/wms/DRCTrendChart.tsx` | 3 | DRC trend line chart |
| `src/components/wms/GradeDistributionChart.tsx` | 2 | Grade pie chart |
| `src/components/wms/ContaminationBadge.tsx` | 2 | Contamination status |
| `src/components/wms/RubberIntakeChecklist.tsx` | 2 | Intake checklist |
| `src/components/wms/COADocument.tsx` | 5 | Certificate template |

### 6.2 Files sửa đổi (8 files)

| File | Đợt | Thay đổi |
|------|-----|----------|
| `src/services/wms/wms.types.ts` | 1 | Thêm rubber types |
| `src/services/wms/batchService.ts` | 1 | Rubber fields create/update |
| `src/services/wms/qcService.ts` | 1,3 | Full SVR QC, grade verify |
| `src/services/wms/alertService.ts` | 1,6 | Rubber-specific alerts |
| `src/services/wms/stockInService.ts` | 2 | Rubber intake fields |
| `src/services/wms/inventoryService.ts` | 2,6 | DRC-weighted, grade dist |
| `src/services/wms/stockOutService.ts` | 5 | Grade-based picking |
| `src/services/wms/pickingService.ts` | 5 | DRC range filter |

### 6.3 Files rewrite → Ant Design (22 files)

| File | Đợt | Trang |
|------|-----|-------|
| `InventoryDashboard.tsx` | 2 | `/wms` |
| `StockInListPage.tsx` | 2 | `/wms/stock-in` |
| `StockInCreatePage.tsx` | 2 | `/wms/stock-in/new` |
| `StockInDetailPage.tsx` | 2 | `/wms/stock-in/:id` |
| `QCDashboardPage.tsx` | 3 | `/wms/qc` |
| `QCRecheckPage.tsx` | 3 | `/wms/qc/recheck` |
| `QCStandardsConfigPage.tsx` | 3 | `/wms/qc/standards` |
| `BatchQCHistoryPage.tsx` | 3 | `/wms/qc/batch/:batchId` |
| `WeighbridgePage.tsx` | 4 | `/wms/weighbridge` |
| `WeighbridgeListPage.tsx` | 4 | `/wms/weighbridge/list` |
| `WeighbridgeDetailPage.tsx` | 4 | `/wms/weighbridge/:id` |
| `StockOutCreatePage.tsx` | 5 | `/wms/stock-out/new` |
| `StockOutDetailPage.tsx` | 5 | `/wms/stock-out/:id` |
| `StockOutListPage.tsx` | 5 | `/wms/stock-out` |
| `PickingListPage.tsx` | 5 | `/wms/stock-out/:id/pick` |
| `InventoryDetailPage.tsx` | 6 | `/wms/inventory/:materialId` |
| `AlertListPage.tsx` | 6 | `/wms/alerts` |
| `StockCheckPage.tsx` | 6 | `/wms/stock-check` |
| `MaterialListPage.tsx` | 6 | `/wms/materials` |
| `WarehouseListPage.tsx` | 6 | `/wms/warehouses` |
| `WarehouseLocationPage.tsx` | 6 | `/wms/warehouses/:id/locations` |
| `QCInputForm.tsx` (component) | 3 | Shared component |

---

## 7. THỨ TỰ ƯU TIÊN

### Nếu thời gian hạn chế, ưu tiên:

```
🔴 CRITICAL (phải có cho ngành cao su):
    Đợt 1 → Types + Migration + Services nền
    Đợt 2 → Dashboard + Stock-In (dùng hàng ngày)
    Đợt 3 → QC + Recheck (core nghiệp vụ)

🟡 HIGH (nên có):
    Đợt 4 → Weighbridge
    Đợt 5 → Stock-Out + Picking (xuất khẩu)

🟢 MEDIUM (có thể defer):
    Đợt 6 → Tồn kho + Alerts + Danh mục
```

---

## 8. TIÊU CHUẨN KỸ THUẬT SVR (THAM KHẢO)

### TCVN 3769:2016 — Cao su thiên nhiên SVR

| Chỉ tiêu | SVR 3L | SVR 5 | SVR 10 | SVR 20 | SVR CV60 |
|-----------|--------|-------|--------|--------|----------|
| DRC min (%) | 60 | 55 | 50 | 40 | 60 |
| Dirt max (%) | 0.02 | 0.04 | 0.08 | 0.16 | 0.02 |
| Ash max (%) | 0.50 | 0.50 | 0.60 | 0.80 | 0.50 |
| Nitrogen max (%) | 0.60 | 0.60 | 0.60 | 0.60 | 0.60 |
| Volatile max (%) | 0.20 | 0.20 | 0.20 | 0.20 | 0.20 |
| PRI min | 40 | 40 | 30 | 30 | — |
| Mooney max | — | — | — | — | 60±5 |
| Color Lovibond max | 6 | — | — | — | — |
| Moisture max (%) | 0.80 | 0.80 | 0.80 | 0.80 | 0.80 |

---

*Huy Anh Rubber ERP v8 — WMS Rubber Redesign Spec*
*Ngày: 17/03/2026*
*Redesign UI: Tailwind → Ant Design v6*
*Bổ sung: Nghiệp vụ đặc thù ngành cao su thiên nhiên*
