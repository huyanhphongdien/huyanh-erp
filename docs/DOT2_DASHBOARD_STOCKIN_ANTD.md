# ĐỢT 2: DASHBOARD + STOCK-IN → ANT DESIGN + RUBBER DATA

> **Thuộc:** WMS Rubber Redesign
> **Mục tiêu:** Rewrite 4 pages + 2 shared components sang Ant Design, bổ sung rubber data
> **Phụ thuộc:** Đợt 1 (types, services) ✅
> **Chia thành:** 7 sub-phases

---

## TỔNG QUAN

```
Sub 2.1 → Shared: GradeBadge + ContaminationBadge + DryWeightDisplay (components nhỏ)
Sub 2.2 → Shared: QCInputForm → Ant Design + full SVR fields
Sub 2.3 → Shared: LocationPicker → Ant Design
Sub 2.4 → InventoryDashboard → Ant Design + rubber KPIs
Sub 2.5 → StockInListPage → Ant Design + rubber columns
Sub 2.6 → StockInCreatePage → Ant Design + rubber intake fields
Sub 2.7 → StockInDetailPage → Ant Design + rubber info
```

**Nguyên tắc:**
- Giữ nguyên logic nghiệp vụ — chỉ đổi UI framework
- Bổ sung rubber fields từ Đợt 1 (rubber_grade, dry_weight, supplier_name...)
- Build phải pass sau mỗi sub-phase
- Không thay đổi services (đã hoàn thành ở Đợt 1)

---

## SUB 2.1: SHARED COMPONENTS NHỎ (TẠO MỚI)

**Tạo 4 components Ant Design nhỏ, tái sử dụng ở nhiều pages.**

### 2.1.1 `GradeBadge.tsx`

```
File: src/components/wms/GradeBadge.tsx
Props: { grade: RubberGrade; size?: 'small' | 'default' }
Render: Ant Design <Tag> với color từ RUBBER_GRADE_COLORS
Ví dụ: [SVR 3L] xanh, [SVR 10] vàng, [SVR 20] đỏ
```

### 2.1.2 `ContaminationBadge.tsx`

```
File: src/components/wms/ContaminationBadge.tsx
Props: { status: ContaminationStatus }
Render: Ant Design <Tag> với icon + color
  clean → xanh check
  suspected → vàng warning
  confirmed → đỏ close
  cleared → xanh dương info
```

### 2.1.3 `DryWeightDisplay.tsx`

```
File: src/components/wms/DryWeightDisplay.tsx
Props: { grossWeight: number; drc: number; unit?: string }
Render: "12.5 T gross → 7.5 T dry (60%)"
  Hiện cả gross weight và dry weight (= gross × DRC/100)
  Dùng Ant Design Typography + Statistic
```

### 2.1.4 `WeightLossIndicator.tsx`

```
File: src/components/wms/WeightLossIndicator.tsx
Props: { initialWeight: number; currentWeight: number }
Render: Hiện % hao hụt với màu:
  < 3% → xanh (bình thường)
  3-5% → vàng (cảnh báo)
  > 5% → đỏ (nghiêm trọng)
  Dùng Ant Design Tag hoặc Typography
```

### Checklist Sub 2.1

```
□ Tạo GradeBadge.tsx
□ Tạo ContaminationBadge.tsx
□ Tạo DryWeightDisplay.tsx
□ Tạo WeightLossIndicator.tsx
□ Build pass
```

---

## SUB 2.2: QCInputForm → ANT DESIGN + FULL SVR

**File rewrite:** `src/components/wms/QCInputForm.tsx` (630 dòng hiện tại)

### Hiện tại (Tailwind)

- Input DRC lớn (22px monospace)
- DRC Gauge visual (SVG bars)
- Advanced toggle: PRI, Mooney (optional)
- Live evaluation (border color changes)
- QCBadge export component

### Mới (Ant Design)

**Giữ nguyên:**
- Logic: `evaluateDRC()`, auto-fetch standard, onChange callback
- QCBadge component (chuyển sang Ant Design Tag)

**Đổi sang Ant Design:**

| Cũ (Tailwind) | Mới (Ant Design) |
|----------------|------------------|
| Custom input 22px | `InputNumber` size="large" |
| Custom gauge SVG | `Progress` steps hoặc custom SVG giữ nguyên |
| Toggle PRI/Mooney | `Collapse` panel |
| Border color live | `Form.Item` validateStatus |
| Custom badges | `Tag` component |

**Bổ sung rubber fields (từ Đợt 1 AddQCData):**

```
Trong panel "Chỉ tiêu nâng cao" (Collapse):
├─ PRI (đã có)
├─ Mooney (đã có)
├─ Ash content (đã có)
├─ Nitrogen content (đã có)
├─ Moisture content (MỚI) — InputNumber, suffix "%"
├─ Volatile matter (MỚI) — InputNumber, suffix "%"
├─ Dirt content (MỚI) — InputNumber, suffix "%"
├─ Metal content (MỚI) — InputNumber, suffix "mg/kg"
├─ Color Lovibond (MỚI) — InputNumber
```

**UI Layout:**

```
┌─────────────────────────────────────────────┐
│  DRC (%)                                     │
│  ┌───────────────────────────────────────┐   │
│  │         [  52.5  ]                    │   │
│  └───────────────────────────────────────┘   │
│                                              │
│  [═══════════════█═══════] 52.5% → SVR 10   │
│   40    50   55  ↑  60                       │
│                                              │
│  Kết quả: ✅ Đạt — SVR 10                    │
│  Tái kiểm: 14 ngày                          │
│                                              │
│  ▸ Chỉ tiêu nâng cao (Collapse)             │
│    ┌─────────────────────────────────────┐   │
│    │ PRI    [   ] │ Mooney [   ]         │   │
│    │ Ash    [   ] │ Nitro  [   ]         │   │
│    │ Moist  [   ] │ Volat  [   ]  ← MỚI │   │
│    │ Dirt   [   ] │ Metal  [   ]  ← MỚI │   │
│    │ Color  [   ]                  ← MỚI │   │
│    └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### Checklist Sub 2.2

```
□ Rewrite QCInputForm.tsx → Ant Design (InputNumber, Collapse, Form.Item, Tag)
□ Thêm 5 rubber fields mới (moisture, volatile, dirt, metal, color)
□ QCBadge → Ant Design Tag
□ DRC Gauge → giữ SVG hoặc dùng Ant Design Progress
□ onChange callback giữ nguyên interface
□ Build pass
□ Test: QCInputForm render đúng trong StockInCreatePage
```

---

## SUB 2.3: LocationPicker → ANT DESIGN

**File rewrite:** `src/components/wms/LocationPicker.tsx` (916 dòng hiện tại)

### Hiện tại (Tailwind)

- Grid view (5 cols) + List view toggle
- Shelf filter chips
- Search by code
- Status colors (empty/partial/full/unavailable)
- Capacity bar
- Touch-friendly 48px targets

### Mới (Ant Design)

| Cũ (Tailwind) | Mới (Ant Design) |
|----------------|------------------|
| Custom grid buttons | `Button` group hoặc custom grid giữ nguyên |
| Toggle Grid/List | `Segmented` control |
| Search input | `Input.Search` |
| Shelf filter chips | `Tag.CheckableTag` hoặc `Radio.Group` |
| Capacity bar | `Progress` size="small" |
| Loading | `Spin` |
| Empty state | `Empty` |

**Giữ nguyên:**
- Logic: fetch locations, filter, select callback
- Grid layout (visual warehouse map)
- Status colors + capacity calculation

### Checklist Sub 2.3

```
□ Rewrite LocationPicker.tsx → Ant Design
□ Giữ nguyên props interface (onChange, warehouseId, mode, selectedId)
□ Grid view vẫn hoạt động (touch-friendly)
□ Build pass
```

---

## SUB 2.4: InventoryDashboard → ANT DESIGN + RUBBER

**File rewrite:** `src/pages/wms/InventoryDashboard.tsx` (487 dòng)

### Hiện tại (Tailwind)

- Header xanh đậm
- 4 overview cards (materials, qty, weight, alerts)
- Quick action buttons (stock-in, out, check)
- Top 5 alerts
- Stock summary list with search + filter

### Mới (Ant Design + Rubber)

**Layout:**

```
┌────────────────────────────────────────────────────────────────┐
│  Breadcrumb: WMS > Tổng quan                                   │
│  Title: Kho Thành Phẩm          [Refresh] [Export]             │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  KPI Cards (Row, 5 cols)                                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────┐ │
│  │ Tổng lô  │ │ Trọng    │ │ Trọng    │ │ DRC TB   │ │Cảnh │ │
│  │   45     │ │ lượng    │ │ lượng khô│ │  56.2%   │ │ báo │ │
│  │          │ │ 250.5 T  │ │ 140.3 T  │ │          │ │ 12  │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └─────┘ │
│               ↑ gross       ↑ MỚI (dry)  ↑ MỚI                │
│                                                                │
│  Row gutter={24}                                               │
│  ┌──────────────────────────┐ ┌──────────────────────────┐    │
│  │ PHÂN BỐ GRADE (Pie)     │ │ CẢNH BÁO (Alert list)    │    │
│  │ ┌─────────────────────┐ │ │                           │    │
│  │ │   SVR 3L: 30%       │ │ │ 🔴 3 lô hao hụt > 5%    │    │
│  │ │   SVR 5:  25%       │ │ │ 🟡 5 lô cần recheck      │    │
│  │ │   SVR 10: 35%       │ │ │ 🟠 2 lô lưu kho > 60d    │    │
│  │ │   SVR 20: 10%       │ │ │ 🔴 1 lô tạp chất         │    │
│  │ └─────────────────────┘ │ │                           │    │
│  └──────────────────────────┘ └──────────────────────────┘    │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ TỒN KHO THEO VẬT LIỆU (Ant Design Table)             │    │
│  │ [Search...] [Filter: Grade ▾] [Filter: Status ▾]      │    │
│  │                                                        │    │
│  │ Vật liệu│Grade│Tồn(T)│DRC TB│Khô(T)│Kho│Hao hụt│Cảnh│    │
│  │ SVR 10  │SVR10│ 25.0 │52.5% │ 13.1 │ 2 │ 1.2%  │ 2  │    │
│  │ SVR 3L  │SVR3L│ 15.0 │62.0% │  9.3 │ 1 │ 0.5%  │ 0  │    │
│  └────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────┘
```

**Bổ sung rubber:**
- KPI mới: Trọng lượng khô (dry weight), DRC trung bình
- Pie chart phân bố grade (cần tính từ batches có rubber_grade)
- Table: thêm cột Grade, DRC TB, Dry Weight, Hao hụt
- Alerts: hiện rubber alerts (weight_loss, storage, contamination)

**Ant Design components sử dụng:**
- `Card`, `Statistic`, `Row`, `Col` — KPI cards
- `Table` — stock summary (thay card list)
- `Tag` — grade badges, status badges
- `Alert` — cảnh báo
- `Input.Search` — tìm kiếm
- `Select` — filter grade, status
- `Spin`, `Empty` — loading/empty states
- `Breadcrumb`, `Typography` — header

**Services cần gọi thêm:**
- `inventoryService.getStockSummary()` — đã có
- `alertService.checkAllAlerts()` — đã có (bao gồm rubber alerts)
- Query trực tiếp `stock_batches` để tính grade distribution + avg DRC

### Checklist Sub 2.4

```
□ Rewrite InventoryDashboard.tsx → Ant Design
□ KPI cards: thêm Dry Weight + DRC TB
□ Pie chart: phân bố grade (query rubber_grade từ active batches)
□ Table: thêm cột Grade, DRC, Dry Weight, Hao hụt
□ Alerts: hiện đủ rubber alert types mới
□ Filter: thêm filter theo Grade
□ Build pass
□ Test: navigate /wms → dashboard hiện đúng
```

---

## SUB 2.5: StockInListPage → ANT DESIGN

**File rewrite:** `src/pages/wms/stock-in/StockInListPage.tsx` (630 dòng)

### Mới (Ant Design)

**Layout:**

```
┌────────────────────────────────────────────────────────────────┐
│  Breadcrumb: WMS > Nhập kho                                   │
│  Title: Danh sách phiếu nhập          [+ Tạo phiếu nhập]      │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Filter Bar (Card)                                             │
│  [Search...] [Status ▾] [Source ▾] [Grade ▾] [Date range]     │
│                                                                │
│  Summary: 45 phiếu │ 12 nháp │ 30 xác nhận │ 125.5 T          │
│                                                                │
│  Table (Ant Design)                                            │
│  ┌────────────────────────────────────────────────────────┐    │
│  │Mã phiếu │Kho    │Nguồn│Grade│Deal   │KL(T)│Khô(T)│TT │    │
│  │NK-..001 │Kho A  │Mua  │SVR10│DL2603 │5.0  │2.6   │✅ │    │
│  │NK-..002 │Kho B  │SX   │SVR3L│  —    │8.0  │4.8   │📝 │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                │
│  Pagination: [< 1 2 3 ... 10 >]                               │
└────────────────────────────────────────────────────────────────┘
```

**Bổ sung rubber:**
- Cột Grade (GradeBadge)
- Cột Dry Weight (tính từ total_weight × DRC nếu có)
- Filter theo Grade
- Supplier name hiện khi có

**Ant Design components:**
- `Table` — thay card list
- `Input.Search`, `Select`, `DatePicker.RangePicker` — filters
- `Tag` — status, grade, deal, source type
- `Button` — create new
- `Breadcrumb` — navigation

### Checklist Sub 2.5

```
□ Rewrite StockInListPage.tsx → Ant Design Table
□ Thêm cột: Grade, Dry Weight
□ Thêm filter: Grade dropdown
□ Summary bar: thêm dry weight tổng
□ GradeBadge component cho mỗi row
□ Build pass
□ Test: navigate /wms/stock-in → list hiện đúng
```

---

## SUB 2.6: StockInCreatePage → ANT DESIGN + RUBBER INTAKE

**File rewrite:** `src/pages/wms/stock-in/StockInCreatePage.tsx` (955 dòng)

### Mới (Ant Design)

**Vẫn 3-step wizard** nhưng dùng Ant Design `Steps` + `Form`:

**Step 1 — Thông tin (Ant Design Form):**

```
┌─────────────────────────────────────────────┐
│ Steps: [1. Thông tin] ─ [2. Chi tiết] ─ [3]│
├─────────────────────────────────────────────┤
│                                              │
│  Kho nhập *        [Select: Kho A ▾]        │
│  Nguồn nhập *      [Radio: SX|Mua|Blend|...] │
│                                              │
│  ── Nếu nguồn = Mua ──                      │
│  Deal B2B          [Select: DL2603-... ▾]    │
│  (Deal summary card nếu đã chọn)            │
│                                              │
│  ── MỚI: Rubber Intake ──                   │
│  Đại lý/Nguồn      [Input: Tên đại lý]     │
│  Vùng nguồn gốc    [Input: Bình Phước]      │
│  Loại mủ *         [Select: Cup lump ▾]     │
│                                              │
│  Ghi chú           [TextArea]               │
│                                              │
│               [Hủy]  [Tiếp theo →]          │
└─────────────────────────────────────────────┘
```

**Step 2 — Chi tiết (danh sách items):**

```
┌─────────────────────────────────────────────┐
│  Danh sách mặt hàng (0)      [+ Thêm SP]   │
│                                              │
│  (Empty: Chưa có mặt hàng nào)              │
│                                              │
│  ── Sau khi thêm ──                         │
│  ┌─────────────────────────────────────────┐ │
│  │ SVR 10 (TP-SVR10)         [Xóa]        │ │
│  │ SL: 500 kg │ TL: 500 kg │ DRC: 52.5%   │ │
│  │ Grade: [SVR 10] │ Khô: 262.5 kg  ← MỚI│ │
│  │ Vị trí: Kho A - K1-A3                  │ │
│  │ QC: ✅ Đạt                               │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  Ant Design Modal (thay bottom sheet):      │
│  ┌─────────────────────────────────────────┐ │
│  │ Thêm mặt hàng                   [X]    │ │
│  │                                         │ │
│  │ Sản phẩm *   [Select ▾]                │ │
│  │ Số lượng *   [InputNumber] kg           │ │
│  │ Trọng lượng  [InputNumber] kg           │ │
│  │ Vị trí kho   [LocationPicker]           │ │
│  │                                         │ │
│  │ ── QC Đầu vào ──                       │ │
│  │ [QCInputForm với full SVR fields]       │ │
│  │                                         │ │
│  │ ── MỚI: Rubber info ──                 │ │
│  │ DRC đại lý báo  [InputNumber] %  ← MỚI │ │
│  │ (so sánh: QC = 52.5%, Đại lý = 55%)    │ │
│  │                                         │ │
│  │ Ghi chú    [TextArea]                   │ │
│  │                                         │ │
│  │          [Hủy]   [Thêm vào phiếu]      │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│         [← Quay lại]  [Lưu nháp] [Tiếp →]  │
└─────────────────────────────────────────────┘
```

**Step 3 — Xác nhận (review):**

```
┌─────────────────────────────────────────────┐
│  Tóm tắt phiếu nhập kho                     │
│                                              │
│  Statistic cards (Row 4 cols):               │
│  [SL: 2 SP] [TL: 1000kg] [Khô: 525kg] [DRC]│
│                                              │
│  ── MỚI: Rubber Summary ──                  │
│  Đại lý: Nguyễn Văn A │ Vùng: Bình Phước    │
│  Loại mủ: Cup lump │ Grade: SVR 10          │
│                                              │
│  ── Nếu DRC đại lý ≠ QC ──                  │
│  ⚠ DRC đại lý: 55% vs QC: 52.5% (-2.5%)    │
│                                              │
│  [← Quay lại] [Lưu nháp] [✓ Xác nhận]      │
└─────────────────────────────────────────────┘
```

**Bổ sung rubber:**
- Step 1: supplier_name, supplier_region, rubber_type (loại mủ)
- Step 2: supplier_reported_drc, auto-tính dry_weight, auto-classify grade
- Step 3: rubber summary, DRC discrepancy warning

**Ant Design components:**
- `Steps` — wizard steps
- `Form`, `Form.Item` — form layout
- `Select`, `Input`, `InputNumber`, `Input.TextArea` — form controls
- `Radio.Group` — source type
- `Modal` — thay bottom sheet cho add detail
- `Card` — detail cards, summary cards
- `Statistic` — summary numbers
- `Alert` — DRC discrepancy warning
- `Button`, `Space` — actions
- `Tag` — grade, QC status
- `Result` — success screen

### Checklist Sub 2.6

```
□ Rewrite StockInCreatePage.tsx → Ant Design
□ Step 1: thêm supplier_name, supplier_region, rubber_type
□ Step 2: bottom sheet → Modal, thêm supplier_reported_drc
□ Step 2: auto-tính dry_weight khi nhập DRC + weight
□ Step 2: auto-classify grade khi nhập DRC
□ Step 3: rubber summary + DRC discrepancy alert
□ Dùng QCInputForm (sub 2.2) và LocationPicker (sub 2.3) đã rewrite
□ stockInService.create() nhận rubber fields (đã có từ Đợt 1)
□ Build pass
□ Test: tạo phiếu nhập → chọn deal → thêm SP → QC → xác nhận
```

---

## SUB 2.7: StockInDetailPage → ANT DESIGN + RUBBER

**File rewrite:** `src/pages/wms/stock-in/StockInDetailPage.tsx` (650 dòng)

### Mới (Ant Design)

**Layout:**

```
┌────────────────────────────────────────────────────────────────┐
│  ← Quay lại    NK-TP-20260317-001   [Đã xác nhận]            │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Card: Thông tin phiếu                                         │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Descriptions (Ant Design):                             │    │
│  │ Kho: Kho A    │ Nguồn: Mua ngoài │ Ngày: 17/03/2026  │    │
│  │ Tạo bởi: NVA │ Xác nhận: NVB    │ Ghi chú: ...      │    │
│  │                                                        │    │
│  │ MỚI — Rubber Info:                                     │    │
│  │ Đại lý: Nguyễn Văn A │ Vùng: Bình Phước              │    │
│  │ Loại mủ: Cup lump    │ Grade chung: SVR 10            │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                │
│  Card: Deal B2B (nếu có deal_id — giữ nguyên Phase 4)        │
│                                                                │
│  Summary Cards (Row 4 cols)                                    │
│  [SL: 500 kg] [TL: 500 kg] [Khô: 262.5 kg] [Số lô: 2]      │
│                     ↑ gross   ↑ MỚI (dry)                     │
│                                                                │
│  MỚI — DRC Discrepancy Alert (nếu supplier_drc ≠ QC drc)     │
│  ⚠ DRC đại lý báo: 55% — QC thực tế: 52.5% (chênh -2.5%)   │
│                                                                │
│  Card: Chi tiết lô hàng (Table)                               │
│  ┌────────────────────────────────────────────────────────┐    │
│  │Lô        │Vật liệu│Grade│SL(kg)│DRC │Khô(kg)│QC    │    │
│  │TP-SVR.001│SVR 10  │SVR10│ 300  │52.5│ 157.5 │✅ Đạt│    │
│  │TP-SVR.002│SVR 10  │SVR10│ 200  │51.0│ 102.0 │⚠ CB  │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                │
│  Card: Timeline                                                │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ 🟢 Tạo phiếu nháp — 17/03 08:30 — NVA                │    │
│  │ ✅ Xác nhận — 17/03 09:15 — NVB                       │    │
│  └────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────┘
```

**Bổ sung rubber:**
- Descriptions: supplier_name, supplier_region, rubber_type
- Summary: thêm dry_weight
- Table: cột Grade (GradeBadge), Dry Weight
- DRC discrepancy alert nếu supplier_reported_drc khác QC drc
- ContaminationBadge nếu có

**Ant Design components:**
- `Descriptions` — thông tin phiếu (thay custom grid)
- `Table` — chi tiết lô (thay expandable cards)
- `Statistic`, `Card`, `Row`, `Col` — summary
- `Timeline` — lịch sử
- `Tag` — status, grade, QC
- `Alert` — DRC discrepancy
- `Button`, `Space` — actions
- `Breadcrumb` — navigation

### Checklist Sub 2.7

```
□ Rewrite StockInDetailPage.tsx → Ant Design
□ Descriptions: thêm supplier_name, supplier_region, rubber_type
□ Summary: thêm dry_weight Statistic
□ Table: thêm cột Grade, Dry Weight
□ DRC discrepancy Alert (supplier vs QC)
□ Timeline: giữ nguyên logic
□ Deal card: giữ nguyên Phase 4
□ Build pass
□ Test: navigate /wms/stock-in/:id → detail hiện đúng
```

---

## THỨ TỰ THỰC HIỆN

```
Sub 2.1 (Shared components nhỏ)
    ↓
Sub 2.2 (QCInputForm)  ←── song song với 2.3
    ↓
Sub 2.3 (LocationPicker)
    ↓
Sub 2.4 (InventoryDashboard)  ←── độc lập
    ↓
Sub 2.5 (StockInListPage)  ←── độc lập
    ↓
Sub 2.6 (StockInCreatePage)  ←── phụ thuộc 2.2, 2.3
    ↓
Sub 2.7 (StockInDetailPage)  ←── phụ thuộc 2.1
    ↓
✅ BUILD + TEST
```

### Dependency diagram

```
           ┌──────────────────┐
           │  Sub 2.1: Shared │
           │  (Grade, Contam, │
           │   DryWeight, WL) │
           └────────┬─────────┘
                    │
         ┌──────────┴──────────┐
         │                     │
┌────────▼────────┐   ┌───────▼─────────┐
│  Sub 2.2: QC    │   │  Sub 2.3: Loc   │
│  InputForm      │   │  ationPicker    │
└────────┬────────┘   └───────┬─────────┘
         │                     │
         └──────────┬──────────┘
                    │
    ┌───────────────┼───────────────┐
    │               │               │
┌───▼───┐   ┌──────▼──────┐  ┌────▼─────┐
│Sub 2.4│   │  Sub 2.5    │  │ Sub 2.6  │
│Dashbrd│   │  List Page  │  │ Create   │
└───────┘   └─────────────┘  └────┬─────┘
                                   │
                            ┌──────▼──────┐
                            │  Sub 2.7    │
                            │  Detail     │
                            └─────────────┘
```

---

## TỔNG HỢP FILES

### Files tạo mới (4)

| # | File | Sub |
|---|------|-----|
| 1 | `src/components/wms/GradeBadge.tsx` | 2.1 |
| 2 | `src/components/wms/ContaminationBadge.tsx` | 2.1 |
| 3 | `src/components/wms/DryWeightDisplay.tsx` | 2.1 |
| 4 | `src/components/wms/WeightLossIndicator.tsx` | 2.1 |

### Files rewrite (6)

| # | File | Sub | Lines hiện tại |
|---|------|-----|---------------|
| 5 | `src/components/wms/QCInputForm.tsx` | 2.2 | 630 |
| 6 | `src/components/wms/LocationPicker.tsx` | 2.3 | 916 |
| 7 | `src/pages/wms/InventoryDashboard.tsx` | 2.4 | 487 |
| 8 | `src/pages/wms/stock-in/StockInListPage.tsx` | 2.5 | 630 |
| 9 | `src/pages/wms/stock-in/StockInCreatePage.tsx` | 2.6 | 955 |
| 10 | `src/pages/wms/stock-in/StockInDetailPage.tsx` | 2.7 | 650 |

**Tổng lines cần rewrite: ~4,268 dòng**

---

*Huy Anh Rubber ERP v8 — Đợt 2: Dashboard + Stock-In → Ant Design*
*17/03/2026*
