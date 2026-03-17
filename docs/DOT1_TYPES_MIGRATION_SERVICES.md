# ĐỢT 1: TYPES + DATABASE MIGRATION + SERVICES NỀN

> **Thuộc:** WMS Rubber Redesign
> **Mục tiêu:** Bổ sung nền tảng dữ liệu & services cho ngành cao su
> **Ngày:** 17/03/2026
> **Chia thành:** 6 sub-phases

---

## TỔNG QUAN

```
Sub 1.1 → Database Migration (SQL)
Sub 1.2 → wms.types.ts (thêm rubber types)
Sub 1.3 → rubberGradeService.ts (TẠO MỚI)
Sub 1.4 → weightTrackingService.ts (TẠO MỚI)
Sub 1.5 → Sửa batchService.ts + qcService.ts (thêm rubber fields)
Sub 1.6 → Sửa alertService.ts (thêm rubber alerts)
```

**Nguyên tắc:**
- Không đụng đến UI/pages
- Chỉ thêm fields, KHÔNG xóa/sửa fields cũ
- Tất cả fields mới đều optional → backward-compatible
- Build phải pass sau mỗi sub-phase

---

## SUB 1.1: DATABASE MIGRATION

**File tạo:** `docs/migrations/wms_rubber_fields.sql`
**Chạy trên:** Supabase SQL Editor

### 1.1.1 Bảng mới: `rubber_grade_standards`

```sql
-- ============================================================================
-- WMS RUBBER FIELDS — Database Migration
-- Ngày: 17/03/2026
-- Chạy trên Supabase SQL Editor
-- ============================================================================

-- =============================================
-- 1. BẢNG MỚI: rubber_grade_standards
-- Tiêu chuẩn SVR theo TCVN 3769:2016
-- =============================================

CREATE TABLE IF NOT EXISTS rubber_grade_standards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade VARCHAR(20) NOT NULL UNIQUE,
  grade_label VARCHAR(50) NOT NULL,
  drc_min NUMERIC(5,2) NOT NULL,
  drc_max NUMERIC(5,2),
  dirt_max NUMERIC(5,3) NOT NULL,
  ash_max NUMERIC(5,2) NOT NULL,
  nitrogen_max NUMERIC(5,2) NOT NULL,
  volatile_matter_max NUMERIC(5,2) NOT NULL,
  pri_min NUMERIC(5,1),
  mooney_max NUMERIC(5,1),
  moisture_max NUMERIC(5,2) NOT NULL DEFAULT 0.80,
  color_lovibond_max NUMERIC(5,1),
  price_factor NUMERIC(5,3) DEFAULT 1.000,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO rubber_grade_standards
  (grade, grade_label, drc_min, drc_max, dirt_max, ash_max, nitrogen_max, volatile_matter_max, pri_min, mooney_max, moisture_max, color_lovibond_max, sort_order)
VALUES
  ('SVR_3L',   'SVR 3L',   60, NULL, 0.020, 0.50, 0.60, 0.20, 40, NULL, 0.80, 6,    1),
  ('SVR_5',    'SVR 5',    55, 60,   0.040, 0.50, 0.60, 0.20, 40, NULL, 0.80, NULL, 2),
  ('SVR_10',   'SVR 10',   50, 55,   0.080, 0.60, 0.60, 0.20, 30, NULL, 0.80, NULL, 3),
  ('SVR_20',   'SVR 20',   40, 50,   0.160, 0.80, 0.60, 0.20, 30, NULL, 0.80, NULL, 4),
  ('SVR_CV60', 'SVR CV60', 60, NULL, 0.020, 0.50, 0.60, 0.20, NULL, 65, 0.80, NULL, 5)
ON CONFLICT (grade) DO NOTHING;
```

### 1.1.2 Bổ sung cột `stock_batches`

```sql
-- =============================================
-- 2. BỔ SUNG CỘT: stock_batches
-- Rubber-specific tracking fields
-- =============================================

-- Grade & loại mủ
ALTER TABLE stock_batches
  ADD COLUMN IF NOT EXISTS rubber_grade VARCHAR(20),
  ADD COLUMN IF NOT EXISTS rubber_type VARCHAR(20);
  -- rubber_grade: SVR_3L, SVR_5, SVR_10, SVR_20, SVR_CV60
  -- rubber_type: cup_lump, latex, sheet, crepe, mixed

-- Trọng lượng & hao hụt
ALTER TABLE stock_batches
  ADD COLUMN IF NOT EXISTS moisture_content NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS dry_weight NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS initial_weight NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS current_weight NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS weight_loss NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_weight_check DATE;

-- Nguồn gốc đại lý
ALTER TABLE stock_batches
  ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS supplier_region VARCHAR(100),
  ADD COLUMN IF NOT EXISTS supplier_reported_drc NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS supplier_lab_report_url TEXT;

-- Lưu kho & tạp chất
ALTER TABLE stock_batches
  ADD COLUMN IF NOT EXISTS storage_days INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contamination_status VARCHAR(20) DEFAULT 'clean',
  ADD COLUMN IF NOT EXISTS contamination_notes TEXT;
  -- contamination_status: clean, suspected, confirmed, cleared
```

### 1.1.3 Bổ sung cột `batch_qc_results`

```sql
-- =============================================
-- 3. BỔ SUNG CỘT: batch_qc_results
-- Full SVR QC parameters
-- =============================================

ALTER TABLE batch_qc_results
  ADD COLUMN IF NOT EXISTS moisture_content NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS volatile_matter NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS metal_content NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS dirt_content NUMERIC(5,3),
  ADD COLUMN IF NOT EXISTS color_lovibond NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS grade_tested VARCHAR(20),
  ADD COLUMN IF NOT EXISTS grade_matches_expected BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS contamination_detected BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS contamination_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS supplier_drc_discrepancy NUMERIC(5,2);
```

### 1.1.4 Bổ sung cột `material_qc_standards`

```sql
-- =============================================
-- 4. BỔ SUNG CỘT: material_qc_standards
-- Full SVR standard parameters
-- =============================================

ALTER TABLE material_qc_standards
  ADD COLUMN IF NOT EXISTS rubber_grade VARCHAR(20),
  ADD COLUMN IF NOT EXISTS moisture_max NUMERIC(5,2) DEFAULT 0.80,
  ADD COLUMN IF NOT EXISTS volatile_matter_max NUMERIC(5,2) DEFAULT 0.20,
  ADD COLUMN IF NOT EXISTS dirt_max NUMERIC(5,3) DEFAULT 0.020,
  ADD COLUMN IF NOT EXISTS ash_max NUMERIC(5,2) DEFAULT 0.50,
  ADD COLUMN IF NOT EXISTS nitrogen_max NUMERIC(5,2) DEFAULT 0.60,
  ADD COLUMN IF NOT EXISTS pri_min NUMERIC(5,1) DEFAULT 40,
  ADD COLUMN IF NOT EXISTS mooney_max NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS color_lovibond_max NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS season VARCHAR(10) DEFAULT 'all';
  -- season: 'all', 'dry', 'rainy'
```

### 1.1.5 Bổ sung cột `stock_out_orders`

```sql
-- =============================================
-- 5. BỔ SUNG CỘT: stock_out_orders
-- Export/rubber-specific fields
-- =============================================

ALTER TABLE stock_out_orders
  ADD COLUMN IF NOT EXISTS svr_grade VARCHAR(20),
  ADD COLUMN IF NOT EXISTS required_drc_min NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS required_drc_max NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS container_type VARCHAR(10),
  ADD COLUMN IF NOT EXISTS container_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS packing_type VARCHAR(20),
  ADD COLUMN IF NOT EXISTS bale_count INTEGER,
  ADD COLUMN IF NOT EXISTS packing_requirements TEXT,
  ADD COLUMN IF NOT EXISTS export_date DATE,
  ADD COLUMN IF NOT EXISTS coa_generated BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS packing_list_generated BOOLEAN DEFAULT false;
```

### 1.1.6 Bảng mới: `weight_check_logs`

```sql
-- =============================================
-- 6. BẢNG MỚI: weight_check_logs
-- Theo dõi hao hụt trọng lượng
-- =============================================

CREATE TABLE IF NOT EXISTS weight_check_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES stock_batches(id) ON DELETE CASCADE,
  previous_weight NUMERIC(12,2),
  new_weight NUMERIC(12,2) NOT NULL,
  weight_change NUMERIC(12,2),
  change_reason VARCHAR(50) DEFAULT 'drying',
  checked_by UUID,
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_weight_check_logs_batch
  ON weight_check_logs(batch_id);
CREATE INDEX IF NOT EXISTS idx_weight_check_logs_date
  ON weight_check_logs(checked_at);
```

### Checklist Sub 1.1

```
□ Chạy SQL section 1 (rubber_grade_standards)
□ Verify: SELECT * FROM rubber_grade_standards → 5 rows
□ Chạy SQL section 2 (stock_batches)
□ Chạy SQL section 3 (batch_qc_results)
□ Chạy SQL section 4 (material_qc_standards)
□ Chạy SQL section 5 (stock_out_orders)
□ Chạy SQL section 6 (weight_check_logs)
□ Verify: Tất cả cột mới có trong tables
```

---

## SUB 1.2: CẬP NHẬT `wms.types.ts`

**File sửa:** `src/services/wms/wms.types.ts`

### 1.2.1 Thêm rubber enums & types (đầu file, sau MaterialCategory)

```typescript
// ===== CAO SU — RUBBER TYPES =====

export type RubberGrade = 'SVR_3L' | 'SVR_5' | 'SVR_10' | 'SVR_20' | 'SVR_CV60'
export type RubberType = 'cup_lump' | 'latex' | 'sheet' | 'crepe' | 'mixed'
export type ContaminationStatus = 'clean' | 'suspected' | 'confirmed' | 'cleared'

export const RUBBER_GRADE_LABELS: Record<RubberGrade, string> = {
  SVR_3L: 'SVR 3L',
  SVR_5: 'SVR 5',
  SVR_10: 'SVR 10',
  SVR_20: 'SVR 20',
  SVR_CV60: 'SVR CV60',
}

export const RUBBER_GRADE_COLORS: Record<RubberGrade, string> = {
  SVR_3L: '#16A34A',   // xanh đậm — cao cấp
  SVR_5: '#22C55E',    // xanh nhạt
  SVR_10: '#F59E0B',   // vàng cam
  SVR_20: '#DC2626',   // đỏ
  SVR_CV60: '#7C3AED', // tím — đặc biệt
}

export const RUBBER_TYPE_LABELS: Record<RubberType, string> = {
  cup_lump: 'Mủ chén (Cup lump)',
  latex: 'Mủ nước (Latex)',
  sheet: 'Mủ tờ (Sheet)',
  crepe: 'Mủ crepe',
  mixed: 'Hỗn hợp',
}

export const CONTAMINATION_LABELS: Record<ContaminationStatus, string> = {
  clean: 'Sạch',
  suspected: 'Nghi ngờ',
  confirmed: 'Xác nhận tạp chất',
  cleared: 'Đã xử lý',
}

export const CONTAMINATION_COLORS: Record<ContaminationStatus, string> = {
  clean: '#16A34A',
  suspected: '#F59E0B',
  confirmed: '#DC2626',
  cleared: '#2563EB',
}
```

### 1.2.2 Thêm fields vào `StockBatch` (sau `sub_lot_code`)

```typescript
  // Phase Rubber: Đặc thù cao su
  rubber_grade?: RubberGrade
  rubber_type?: RubberType
  moisture_content?: number         // % ẩm khi nhập
  dry_weight?: number               // weight × (DRC/100)
  initial_weight?: number           // trọng lượng ban đầu
  current_weight?: number           // trọng lượng hiện tại
  weight_loss?: number              // hao hụt (kg)
  last_weight_check?: string        // ngày kiểm trọng lượng gần nhất
  supplier_name?: string            // tên đại lý
  supplier_region?: string          // vùng nguồn gốc
  supplier_reported_drc?: number    // DRC đại lý báo
  supplier_lab_report_url?: string  // URL báo cáo lab đại lý
  storage_days?: number             // số ngày lưu kho
  contamination_status?: ContaminationStatus
  contamination_notes?: string
```

### 1.2.3 Thêm fields vào `BatchQCResult` (sau `nitrogen_content`)

```typescript
  // Rubber QC additions
  moisture_content?: number         // % ẩm
  volatile_matter?: number          // % chất bay hơi
  metal_content?: number            // mg/kg kim loại
  dirt_content?: number             // % tạp chất
  color_lovibond?: number           // màu Lovibond
  grade_tested?: RubberGrade        // grade QC xác định
  grade_matches_expected?: boolean  // grade có khớp expected?
  contamination_detected?: boolean  // phát hiện tạp chất?
  contamination_type?: string       // loại tạp chất
  supplier_drc_discrepancy?: number // our DRC - supplier DRC
```

### 1.2.4 Thêm fields vào `MaterialQCStandard` (sau `recheck_shortened_days`)

```typescript
  // Rubber QC standards
  rubber_grade?: RubberGrade
  moisture_max?: number             // max 0.80%
  volatile_matter_max?: number      // max 0.20%
  dirt_max?: number                 // SVR 3L: max 0.02%
  ash_max?: number                  // max 0.50%
  nitrogen_max?: number             // max 0.60%
  pri_min?: number                  // PRI min cho SVR
  mooney_max?: number               // Mooney max
  color_lovibond_max?: number       // Lovibond max
  season?: 'all' | 'dry' | 'rainy' // tiêu chuẩn theo mùa
```

### 1.2.5 Thêm fields vào `StockOutOrder` (sau `notes`)

```typescript
  // Rubber export fields
  svr_grade?: RubberGrade           // grade yêu cầu
  required_drc_min?: number         // DRC min cho order này
  required_drc_max?: number         // DRC max cho order này
  container_type?: '20ft' | '40ft'
  container_id?: string             // mã container
  packing_type?: 'bale' | 'pallet' | 'bulk'
  bale_count?: number               // số bành (33.33kg/bành)
  packing_requirements?: string     // yêu cầu đóng gói
  export_date?: string
  coa_generated?: boolean
  packing_list_generated?: boolean
```

### 1.2.6 Thêm interfaces mới (cuối file, trước PAGINATION)

```typescript
// ===== RUBBER GRADE STANDARD =====

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

// ===== WEIGHT CHECK LOG =====

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

### 1.2.7 Thêm rubber fields vào form data interfaces

Trong `StockInDetailFormData` thêm:

```typescript
  // Rubber intake
  rubber_grade?: RubberGrade
  rubber_type?: RubberType
  moisture_content?: number
  supplier_name?: string
  supplier_region?: string
  supplier_reported_drc?: number
```

Trong `CreateBatchData` (batchService.ts) thêm:

```typescript
  // Rubber
  rubber_grade?: RubberGrade
  rubber_type?: RubberType
  moisture_content?: number
  initial_weight?: number
  supplier_name?: string
  supplier_region?: string
  supplier_reported_drc?: number
```

### Checklist Sub 1.2

```
□ Thêm rubber enums + labels + colors
□ Thêm fields vào StockBatch interface
□ Thêm fields vào BatchQCResult interface
□ Thêm fields vào MaterialQCStandard interface
□ Thêm fields vào StockOutOrder interface
□ Thêm RubberGradeStandard + WeightCheckLog interfaces
□ Thêm fields vào StockInDetailFormData + CreateBatchData
□ Build pass: npx tsc --noEmit
```

---

## SUB 1.3: TẠO `rubberGradeService.ts`

**File tạo:** `src/services/wms/rubberGradeService.ts`

### Methods

```typescript
import { supabase } from '../../lib/supabase'
import type { RubberGrade, RubberGradeStandard } from './wms.types'

export const rubberGradeService = {

  /** Lấy tất cả grade standards (cached) */
  async getAll(): Promise<RubberGradeStandard[]>,

  /** Lấy standard theo grade */
  async getByGrade(grade: RubberGrade): Promise<RubberGradeStandard | null>,

  /** Phân loại DRC → SVR grade */
  classifyByDRC(drc: number): RubberGrade,
  // Logic:
  //   drc >= 60 → SVR_3L
  //   drc >= 55 → SVR_5
  //   drc >= 50 → SVR_10
  //   else      → SVR_20

  /** Tính trọng lượng khô */
  calculateDryWeight(grossWeight: number, drc: number): number,
  // = grossWeight × (drc / 100)

  /** Tính hao hụt */
  calculateShrinkage(initialWeight: number, currentWeight: number): {
    loss_kg: number
    loss_percent: number
  },

  /** Tính số bành (33.33 kg/bành) */
  calculateBaleCount(weightKg: number): number,
  // = Math.floor(weightKg / 33.33)

  /** Label + color helpers */
  getGradeLabel(grade: RubberGrade): string,
  getGradeColor(grade: RubberGrade): string,

  /** Kiểm tra batch QC result có đạt grade standard không */
  evaluateAgainstGradeStandard(
    grade: RubberGrade,
    qcResult: {
      drc?: number
      dirt?: number
      ash?: number
      nitrogen?: number
      volatile?: number
      pri?: number
      mooney?: number
      moisture?: number
      color?: number
    }
  ): {
    passed: boolean
    failures: string[]  // danh sách chỉ tiêu không đạt
  },
}
```

### Checklist Sub 1.3

```
□ Tạo file rubberGradeService.ts
□ Implement getAll() — query rubber_grade_standards
□ Implement classifyByDRC() — pure function
□ Implement calculateDryWeight() — pure function
□ Implement calculateShrinkage() — pure function
□ Implement calculateBaleCount() — pure function
□ Implement evaluateAgainstGradeStandard()
□ Export từ index.ts
□ Build pass: npx tsc --noEmit
```

---

## SUB 1.4: TẠO `weightTrackingService.ts`

**File tạo:** `src/services/wms/weightTrackingService.ts`

### Methods

```typescript
import { supabase } from '../../lib/supabase'
import type { WeightCheckLog, StockBatch } from './wms.types'

export const weightTrackingService = {

  /** Ghi nhận kiểm tra trọng lượng */
  async recordWeightCheck(
    batchId: string,
    newWeight: number,
    reason?: 'drying' | 'reweigh' | 'adjust',
    checkedBy?: string,
    notes?: string
  ): Promise<WeightCheckLog>,
  // 1. Lấy current_weight của batch
  // 2. Insert weight_check_logs
  // 3. Update batch: current_weight, weight_loss, last_weight_check

  /** Lấy lịch sử cân của batch */
  async getWeightHistory(batchId: string): Promise<WeightCheckLog[]>,
  // ORDER BY checked_at DESC

  /** Tính hao hụt chi tiết */
  async calculateWeightLoss(batchId: string): Promise<{
    initial_weight: number
    current_weight: number
    total_loss_kg: number
    loss_percent: number
    days_in_storage: number
    avg_loss_per_day: number
  } | null>,

  /** Lấy batches có hao hụt vượt ngưỡng */
  async getBatchesWithExcessiveLoss(
    thresholdPercent?: number  // default 5%
  ): Promise<StockBatch[]>,
  // WHERE weight_loss / initial_weight * 100 > threshold

  /** Cập nhật storage_days cho tất cả batches active */
  async updateStorageDays(): Promise<number>,
  // UPDATE stock_batches
  // SET storage_days = EXTRACT(DAY FROM NOW() - received_date)
  // WHERE status = 'active'
  // RETURN count updated

  /** Lấy batches lưu kho quá lâu */
  async getBatchesExceedingStorageDuration(
    maxDays?: number  // default 60
  ): Promise<StockBatch[]>,
}
```

### Checklist Sub 1.4

```
□ Tạo file weightTrackingService.ts
□ Implement recordWeightCheck() — insert log + update batch
□ Implement getWeightHistory() — query logs
□ Implement calculateWeightLoss() — computation
□ Implement getBatchesWithExcessiveLoss() — query + filter
□ Implement updateStorageDays() — bulk update
□ Implement getBatchesExceedingStorageDuration()
□ Export từ index.ts
□ Build pass: npx tsc --noEmit
```

---

## SUB 1.5: SỬA `batchService.ts` + `qcService.ts`

### 1.5.1 Sửa `batchService.ts`

**Thay đổi:**

1. **`CreateBatchData` interface** — thêm rubber fields:
   ```typescript
   rubber_grade?: RubberGrade
   rubber_type?: RubberType
   moisture_content?: number
   initial_weight?: number
   supplier_name?: string
   supplier_region?: string
   supplier_reported_drc?: number
   ```

2. **`createBatch()` method** — thêm rubber fields vào insert:
   ```typescript
   const insertData = {
     // ... existing fields ...
     rubber_grade: data.rubber_grade || null,
     rubber_type: data.rubber_type || null,
     moisture_content: data.moisture_content || null,
     initial_weight: data.initial_weight || null,
     current_weight: data.initial_weight || null,  // ban đầu = initial
     dry_weight: data.initial_drc && data.initial_weight
       ? data.initial_weight * (data.initial_drc / 100)
       : null,
     supplier_name: data.supplier_name || null,
     supplier_region: data.supplier_region || null,
     supplier_reported_drc: data.supplier_reported_drc || null,
     contamination_status: 'clean',
     storage_days: 0,
   }
   ```

3. **`BATCH_SELECT`** — thêm rubber fields vào select string

4. **`BATCH_LIST_SELECT`** — thêm rubber_grade, dry_weight, storage_days, contamination_status

5. **Method mới:** `updateRubberGrade(id, grade)`
   ```typescript
   async updateRubberGrade(id: string, grade: RubberGrade): Promise<StockBatch>
   ```

6. **Method mới:** `updateContaminationStatus(id, status, notes?)`
   ```typescript
   async updateContaminationStatus(
     id: string,
     status: ContaminationStatus,
     notes?: string
   ): Promise<StockBatch>
   ```

### 1.5.2 Sửa `qcService.ts`

**Thay đổi:**

1. **`AddQCData` interface** — thêm rubber QC fields:
   ```typescript
   moisture_content?: number
   volatile_matter?: number
   metal_content?: number
   dirt_content?: number
   color_lovibond?: number
   ```

2. **`addInitialQC()` method** — thêm rubber fields vào insert:
   ```typescript
   const insertData = {
     // ... existing ...
     moisture_content: data.moisture_content || null,
     volatile_matter: data.volatile_matter || null,
     metal_content: data.metal_content || null,
     dirt_content: data.dirt_content || null,
     color_lovibond: data.color_lovibond || null,
     grade_tested: drc ? rubberGradeService.classifyByDRC(drc) : null,
     grade_matches_expected: true,  // sẽ validate sau
   }
   ```

3. **`addRecheckResult()` method** — tương tự thêm rubber fields

4. **`evaluateDRC()` method** — giữ nguyên logic cũ (không break existing)

5. **Method mới:** `evaluateFullSVR(grade, qcResult)`
   ```typescript
   // So sánh full QC result với tiêu chuẩn SVR grade
   async evaluateFullSVR(
     grade: RubberGrade,
     qcResult: AddQCData
   ): Promise<{
     passed: boolean
     grade_confirmed: RubberGrade
     failures: { parameter: string; value: number; max: number }[]
     message: string
   }>
   ```

6. **Method mới:** `getDRCTrend(batchId)`
   ```typescript
   // Lấy xu hướng DRC theo thời gian cho 1 batch
   async getDRCTrend(batchId: string): Promise<{
     date: string
     drc: number
     check_type: string
   }[]>
   ```

### Checklist Sub 1.5

```
□ batchService: Thêm rubber fields vào CreateBatchData
□ batchService: Sửa createBatch() — insert rubber fields + auto dry_weight
□ batchService: Sửa BATCH_SELECT, BATCH_LIST_SELECT
□ batchService: Thêm updateRubberGrade()
□ batchService: Thêm updateContaminationStatus()
□ qcService: Thêm rubber fields vào AddQCData
□ qcService: Sửa addInitialQC() — insert rubber QC fields + auto grade_tested
□ qcService: Sửa addRecheckResult() — insert rubber QC fields
□ qcService: Thêm evaluateFullSVR()
□ qcService: Thêm getDRCTrend()
□ Build pass: npx tsc --noEmit
```

---

## SUB 1.6: SỬA `alertService.ts`

**File sửa:** `src/services/wms/alertService.ts`

### Thay đổi

1. **Mở rộng `AlertType`:**
   ```typescript
   export type AlertType =
     | 'low_stock'
     | 'over_stock'
     | 'expiring'
     | 'expired'
     | 'needs_recheck'
     | 'needs_blend'
     // Rubber-specific:
     | 'weight_loss_excessive'    // hao hụt > 5%
     | 'storage_too_long'         // lưu kho > 60 ngày
     | 'contamination_detected'   // tạp chất
     | 'grade_mismatch'           // grade QC ≠ expected
     | 'drc_degradation'          // DRC giảm nhanh
   ```

2. **Method mới:** `checkWeightLossAlerts()`
   ```typescript
   // Tìm batches có weight_loss / initial_weight > 5%
   // Severity: >10% = HIGH, >5% = MEDIUM
   async checkWeightLossAlerts(): Promise<StockAlert[]>
   ```

3. **Method mới:** `checkStorageDurationAlerts()`
   ```typescript
   // Tìm batches có storage_days > 60
   // Severity: >90 ngày = HIGH, >60 = MEDIUM, >45 = LOW
   async checkStorageDurationAlerts(): Promise<StockAlert[]>
   ```

4. **Method mới:** `checkContaminationAlerts()`
   ```typescript
   // Tìm batches có contamination_status = 'suspected' hoặc 'confirmed'
   // confirmed = HIGH, suspected = MEDIUM
   async checkContaminationAlerts(): Promise<StockAlert[]>
   ```

5. **Method mới:** `checkGradeMismatchAlerts()`
   ```typescript
   // Tìm batch_qc_results có grade_matches_expected = false
   // Severity: HIGH
   async checkGradeMismatchAlerts(): Promise<StockAlert[]>
   ```

6. **Sửa `checkAllAlerts()`** — thêm gọi 4 methods mới:
   ```typescript
   async checkAllAlerts(): Promise<StockAlert[]> {
     const [
       stockAlerts, expiryAlerts, recheckAlerts, blendAlerts,
       // Rubber-specific:
       weightLossAlerts, storageAlerts, contaminationAlerts, gradeMismatchAlerts,
     ] = await Promise.all([
       this.checkStockAlerts(),
       this.checkExpiryAlerts(),
       this.checkRecheckAlerts(),
       this.checkBlendAlerts(),
       // Rubber-specific:
       this.checkWeightLossAlerts(),
       this.checkStorageDurationAlerts(),
       this.checkContaminationAlerts(),
       this.checkGradeMismatchAlerts(),
     ])
     // ... merge + sort by severity ...
   }
   ```

### Checklist Sub 1.6

```
□ Mở rộng AlertType enum
□ Implement checkWeightLossAlerts()
□ Implement checkStorageDurationAlerts()
□ Implement checkContaminationAlerts()
□ Implement checkGradeMismatchAlerts()
□ Sửa checkAllAlerts() — gọi thêm 4 methods mới
□ Build pass: npx tsc --noEmit
□ Test: alertService.checkAllAlerts() không bị break
```

---

## TỔNG HỢP ĐỢT 1

### Files tạo mới (3)

| # | File | Sub |
|---|------|-----|
| 1 | `docs/migrations/wms_rubber_fields.sql` | 1.1 |
| 2 | `src/services/wms/rubberGradeService.ts` | 1.3 |
| 3 | `src/services/wms/weightTrackingService.ts` | 1.4 |

### Files sửa (3)

| # | File | Sub |
|---|------|-----|
| 4 | `src/services/wms/wms.types.ts` | 1.2 |
| 5 | `src/services/wms/batchService.ts` | 1.5 |
| 6 | `src/services/wms/qcService.ts` | 1.5 |
| 7 | `src/services/wms/alertService.ts` | 1.6 |

### Thứ tự thực hiện

```
Sub 1.1 (SQL Migration)
    ↓
Sub 1.2 (wms.types.ts)
    ↓
Sub 1.3 (rubberGradeService.ts)  ←── có thể song song với 1.4
    ↓
Sub 1.4 (weightTrackingService.ts)
    ↓
Sub 1.5 (batchService + qcService)  ←── phụ thuộc 1.2, 1.3
    ↓
Sub 1.6 (alertService)  ←── phụ thuộc 1.2, 1.4
    ↓
✅ Build + Verify
```

### Dependency diagram

```
           ┌─────────────────┐
           │  Sub 1.1: SQL   │
           │  (migration)    │
           └────────┬────────┘
                    │
           ┌────────▼────────┐
           │  Sub 1.2: Types │
           │  (wms.types.ts) │
           └────────┬────────┘
                    │
         ┌──────────┴──────────┐
         │                     │
┌────────▼────────┐   ┌───────▼─────────┐
│  Sub 1.3: Grade │   │  Sub 1.4: Weight│
│  Service        │   │  Tracking       │
└────────┬────────┘   └───────┬─────────┘
         │                     │
         └──────────┬──────────┘
                    │
           ┌────────▼────────┐
           │  Sub 1.5: Batch │
           │  + QC Service   │
           └────────┬────────┘
                    │
           ┌────────▼────────┐
           │  Sub 1.6: Alert │
           │  Service        │
           └────────┬────────┘
                    │
              ✅ BUILD OK
```

---

## NGUYÊN TẮC QUAN TRỌNG

1. **Backward-compatible:** Tất cả fields mới đều `optional` — code cũ không bị break
2. **Không đụng UI:** Đợt 1 chỉ làm backend (types, services, database)
3. **Build verify:** Sau mỗi sub-phase phải `npx tsc --noEmit` pass
4. **SQL an toàn:** Dùng `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` — chạy lại không lỗi
5. **Test queries:** Sau migration, verify SELECT/INSERT vẫn hoạt động bình thường

---

*Huy Anh Rubber ERP v8 — Đợt 1: Types + Migration + Services*
*17/03/2026*
