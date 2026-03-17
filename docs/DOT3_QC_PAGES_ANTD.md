# ĐỢT 3: QC PAGES → ANT DESIGN + FULL SVR QC

> **Thuộc:** WMS Rubber Redesign
> **Mục tiêu:** Rewrite 4 QC pages sang Ant Design, bổ sung full tiêu chuẩn SVR
> **Phụ thuộc:** Đợt 1 (services) ✅, Đợt 2 (shared components, QCInputForm) ✅
> **Chia thành:** 5 sub-phases

---

## TỔNG QUAN

```
Sub 3.1 → QCDashboardPage → Ant Design + Grade Distribution + DRC Trend
Sub 3.2 → QCRecheckPage → Ant Design Modal + Full SVR Fields
Sub 3.3 → QCStandardsConfigPage → Ant Design Table + Full SVR Standards
Sub 3.4 → BatchQCHistoryPage → Ant Design Timeline + DRC Trend Chart
Sub 3.5 → Build + Test toàn bộ QC flow
```

**Files hiện tại:**

| File | Lines | Mô tả |
|------|-------|-------|
| `QCDashboardPage.tsx` | 755 | Dashboard QC: stats, batch list, filter |
| `QCRecheckPage.tsx` | 870 | Recheck: batch list + bottom-sheet modal |
| `QCStandardsConfigPage.tsx` | 1034 | Standards CRUD: form + validation |
| `BatchQCHistoryPage.tsx` | 564 | Batch QC timeline + DRC chart |

**Tổng: ~3,223 dòng cần rewrite**

---

## SUB 3.1: QCDashboardPage → ANT DESIGN + RUBBER

**File rewrite:** `src/pages/wms/qc/QCDashboardPage.tsx` (755 dòng)

### Hiện tại (Tailwind)
- Header xanh đậm sticky
- 5 stat cards (scroll ngang): Total, Passed, Warning, Needs Blend, Avg DRC
- Alert banner (overdue recheck)
- Quick action buttons (Tái kiểm, Ngưỡng QC)
- Filter chips (5 status)
- Batch DRC card list (mỗi card: batch_no, DRC, QC status, recheck countdown)

### Mới (Ant Design + Rubber)

```
┌────────────────────────────────────────────────────────────────┐
│  Title: QC & DRC Dashboard               [Refresh] [Settings] │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  KPI Cards (Row 5 cols)                                        │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐      │
│  │Total   │ │Passed  │ │Warning │ │Blend   │ │DRC TB  │      │
│  │  45    │ │  30    │ │   8    │ │   3    │ │ 56.2%  │      │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘      │
│                                                                │
│  Row gutter={24}                                               │
│  ┌──────────────────────────┐ ┌──────────────────────────┐    │
│  │ PHÂN BỐ GRADE (Pie/Bar) │ │ DRC TREND 30 NGÀY (Line) │    │
│  │ MỚI — từ rubber_grade   │ │ MỚI — từ getDRCTrend()   │    │
│  │ SVR 3L: 30% ████████    │ │    ──────────             │    │
│  │ SVR 5:  25% ██████      │ │   /          \            │    │
│  │ SVR 10: 35% █████████   │ │  /            \──         │    │
│  │ SVR 20: 10% ███         │ │                           │    │
│  └──────────────────────────┘ └──────────────────────────┘    │
│                                                                │
│  Alert: ⚠ 5 lô quá hạn tái kiểm         [Tái kiểm ngay →]  │
│                                                                │
│  Quick Actions:                                                │
│  [🔄 Tái kiểm DRC] [⚙ Ngưỡng QC] [📊 Xem theo vật liệu]     │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ DANH SÁCH LÔ (Ant Design Table)                       │    │
│  │ [Search...] [Filter: Status ▾] [Filter: Grade ▾]      │    │
│  │                                                        │    │
│  │ Lô      │VL    │Grade│DRC ban đầu→Hiện tại│QC │Recheck│    │
│  │TP-SVR..│SVR10 │SVR10│  52→53.5%          │✅ │ 7d   │    │
│  │TP-SVR..│SVR5  │SVR5 │  56→55.2%          │⚠ │ 2d   │    │
│  └────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────┘
```

**Bổ sung rubber:**
- KPI: giữ 5 cards hiện tại
- MỚI: Pie/Bar chart phân bố grade (query rubber_grade từ active batches)
- MỚI: DRC trend chart 30 ngày (aggregate từ batch_qc_results)
- Table: thêm cột Grade (GradeBadge), filter theo Grade
- Alert: hiện thêm rubber alerts (contamination, weight loss)

**Ant Design components:**
- `Card`, `Statistic`, `Row`, `Col` — KPI cards
- `Table` — batch list (thay card list)
- `Tag` — status, grade badges
- `Alert` — overdue recheck warning
- `Button`, `Space` — quick actions
- `Input.Search`, `Select` — filters
- `Progress` — grade distribution bars

**Services cần dùng:**
- `qcService.getDRCStats()` — có sẵn
- `qcService.getDRCOverview()` — có sẵn
- `qcService.getDRCTrend()` — MỚI từ Đợt 1
- Query `stock_batches` cho grade distribution (tương tự Dashboard đợt 2)

### Checklist Sub 3.1

```
□ Rewrite QCDashboardPage.tsx → Ant Design
□ KPI cards: giữ 5 cards hiện tại (Statistic)
□ MỚI: Grade distribution bar chart
□ MỚI: DRC trend area (nếu có dữ liệu)
□ Table: thay card list, thêm cột Grade + filter Grade
□ Alert: overdue recheck + rubber alerts
□ Quick actions: buttons
□ Build pass
```

---

## SUB 3.2: QCRecheckPage → ANT DESIGN + FULL SVR

**File rewrite:** `src/pages/wms/qc/QCRecheckPage.tsx` (870 dòng)

### Hiện tại (Tailwind)
- Batch cards list (overdue + upcoming)
- Bottom-sheet modal khi tap card
- Modal: DRC input (lớn, monospace), DRC gauge inline, PRI/Mooney (optional), notes
- Live evaluation (badge + gauge update)
- Result display sau submit
- Phase 4: Deal DRC update + chat notify

### Mới (Ant Design + Full SVR)

**Page layout:**

```
┌────────────────────────────────────────────────────────────────┐
│  Title: Tái kiểm DRC                     [Refresh]            │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Summary: 12 lô cần kiểm │ 5 quá hạn │ 7 sắp tới            │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ DANH SÁCH LÔ CẦN TÁI KIỂM (Ant Design Table)         │    │
│  │                                                        │    │
│  │ Lô      │VL    │Grade│DRC hiện│Quá hạn │Kho │   │    │
│  │TP-SVR..│SVR10 │SVR10│ 52.5% │ 3 ngày │KhoA│[QC]│    │
│  │TP-SVR..│SVR5  │SVR5 │ 56.0% │ Hôm nay│KhoB│[QC]│    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                │
│  Ant Design Modal (thay bottom-sheet):                         │
│  ┌─────────────────────────────────────────────────────┐      │
│  │ Tái kiểm QC — TP-SVR10-260317-001            [X]   │      │
│  │                                                     │      │
│  │ Batch: TP-SVR10-260317-001 │ SVR 10 │ Kho A       │      │
│  │ DRC lần cuối: 52.5% │ Ban đầu: 53.0% │ Quá hạn 3d│      │
│  │                                                     │      │
│  │ ┌─────────────────────────────────────────────────┐ │      │
│  │ │ [QCInputForm — Ant Design — Full SVR fields]    │ │      │
│  │ │ DRC: [  52.5  ] %                               │ │      │
│  │ │ [DRC Gauge]  ═══════█══════ 52.5% → SVR 10     │ │      │
│  │ │ Kết quả: ✅ Đạt                                 │ │      │
│  │ │ ▸ Chỉ tiêu nâng cao (9 fields)                 │ │      │
│  │ └─────────────────────────────────────────────────┘ │      │
│  │                                                     │      │
│  │ Ghi chú: [____________________________]            │      │
│  │                                                     │      │
│  │              [Hủy]  [✓ Xác nhận tái kiểm]         │      │
│  └─────────────────────────────────────────────────────┘      │
│                                                                │
│  ── SAU KHI SUBMIT → Result Display ──                        │
│  ┌─────────────────────────────────────────────────────┐      │
│  │  ✅ Đạt chuẩn                                      │      │
│  │  DRC: 53.5% → SVR 10                               │      │
│  │  Tái kiểm tiếp: 14 ngày                            │      │
│  │                                                     │      │
│  │  MỚI: Grade: SVR 10 (không đổi)                    │      │
│  │  MỚI: Full SVR evaluation (nếu có advanced data)   │      │
│  │                                                     │      │
│  │              [Hoàn tất]                             │      │
│  └─────────────────────────────────────────────────────┘      │
└────────────────────────────────────────────────────────────────┘
```

**Thay đổi chính:**
- Bottom-sheet → Ant Design `Modal` (width=600)
- Custom DRC input → Dùng `QCInputForm` đã rewrite ở Đợt 2.2 (đã có full SVR fields)
- Custom DRC gauge inline → Dùng `DRCGauge` từ QCInputForm
- Batch list cards → Ant Design `Table` với actions
- Result display → Ant Design `Result` component
- Thêm GradeBadge cho mỗi batch + result

**Logic giữ nguyên:**
- `qcService.getBatchesDueRecheck()` → batch list
- `qcService.addRecheckResult()` → submit (đã có rubber fields từ Đợt 1)
- Phase 4 deal integration (dealWmsService calls)
- Live DRC evaluation

**Bổ sung rubber:**
- QCInputForm đã có full SVR fields (moisture, volatile, dirt, metal, color)
- Sau submit: hiện GradeBadge + grade change notification nếu grade đổi
- Gọi `qcService.evaluateFullSVR()` nếu có đủ advanced data

### Checklist Sub 3.2

```
□ Rewrite QCRecheckPage.tsx → Ant Design
□ Batch list → Table với cột Grade, action button "QC"
□ Bottom-sheet → Modal (Ant Design)
□ Dùng QCInputForm (Đợt 2.2) thay custom DRC input
□ Result display → Ant Design Result + GradeBadge
□ Giữ nguyên Deal integration (Phase 4)
□ Thêm evaluateFullSVR() call khi có advanced data
□ Build pass
□ Test: chọn batch → nhập DRC + advanced → submit → result hiện đúng
```

---

## SUB 3.3: QCStandardsConfigPage → ANT DESIGN + FULL SVR

**File rewrite:** `src/pages/wms/qc/QCStandardsConfigPage.tsx` (1034 dòng)

### Hiện tại (Tailwind)
- Card list standards (mỗi card: material name, DRC gauge preview, stats grid)
- Bottom-sheet modal cho Add/Edit
- Form: Material select, DRC standard, min/max, warning low/high, recheck intervals
- Validation: range checks, warning within bounds
- MiniDRCRange preview
- FAB button tạo mới

### Mới (Ant Design + Full SVR Standards)

**Page layout:**

```
┌────────────────────────────────────────────────────────────────┐
│  Title: Tiêu chuẩn QC                    [+ Thêm tiêu chuẩn] │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ BẢNG TIÊU CHUẨN (Ant Design Table)                    │    │
│  │ [Search...]                                            │    │
│  │                                                        │    │
│  │ Vật liệu │Grade│DRC chuẩn│Min-Max│PRI min│Moisture│Chu │    │
│  │          │     │        │       │       │  max  │kỳ TK│    │
│  │ SVR 10   │SVR10│  52%   │50-55% │  30   │ 0.80% │ 14d│    │
│  │ SVR 3L   │SVR3L│  62%   │60-65% │  40   │ 0.80% │ 14d│    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                │
│  MỚI: Card "Tiêu chuẩn SVR (TCVN 3769)" — reference table    │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Grade │DRC min│Dirt max│Ash max│N₂ max│PRI min│Moist  │    │
│  │ SVR3L │  60%  │ 0.02% │ 0.50% │ 0.60%│  40   │ 0.80% │    │
│  │ SVR5  │  55%  │ 0.04% │ 0.50% │ 0.60%│  40   │ 0.80% │    │
│  │ SVR10 │  50%  │ 0.08% │ 0.60% │ 0.60%│  30   │ 0.80% │    │
│  │ SVR20 │  40%  │ 0.16% │ 0.80% │ 0.60%│  30   │ 0.80% │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                │
│  Ant Design Modal — Sửa tiêu chuẩn:                          │
│  ┌─────────────────────────────────────────────────────┐      │
│  │ Form (Ant Design Form):                             │      │
│  │                                                     │      │
│  │ Vật liệu *    [Select ▾]                           │      │
│  │ Grade SVR     [Select: SVR_3L/5/10/20 ▾]  ← MỚI   │      │
│  │                                                     │      │
│  │ ── DRC ──                                           │      │
│  │ DRC chuẩn [  60  ]% │ Min [  58  ]% │ Max [  62  ]%│      │
│  │ Cảnh báo thấp [ 59 ]% │ Cảnh báo cao [ 61 ]%      │      │
│  │                                                     │      │
│  │ ── Chu kỳ tái kiểm ──                              │      │
│  │ Bình thường [ 14 ] ngày │ Rút ngắn [ 7 ] ngày     │      │
│  │                                                     │      │
│  │ ── MỚI: Tiêu chuẩn SVR bổ sung ──                  │      │
│  │ Moisture max [ 0.80 ]% │ Volatile max [ 0.20 ]%    │      │
│  │ Dirt max [ 0.02 ]%     │ Ash max [ 0.50 ]%         │      │
│  │ Nitrogen max [ 0.60 ]% │ PRI min [ 40 ]            │      │
│  │ Mooney max [    ]       │ Color max [    ]          │      │
│  │ Mùa vụ [All ▾]                          ← MỚI      │      │
│  │                                                     │      │
│  │ [DRC Gauge Preview]                                 │      │
│  │                                                     │      │
│  │            [Hủy]   [Lưu tiêu chuẩn]               │      │
│  └─────────────────────────────────────────────────────┘      │
└────────────────────────────────────────────────────────────────┘
```

**Bổ sung rubber:**
- Form: thêm rubber_grade Select, 8 fields SVR mới (moisture_max, volatile_max, dirt_max, ash_max, nitrogen_max, pri_min, mooney_max, color_max, season)
- Table: thêm cột Grade, PRI min, Moisture max
- MỚI: Reference table hiện tiêu chuẩn TCVN từ `rubber_grade_standards`
- Auto-fill: khi chọn Grade → auto-fill giá trị tiêu chuẩn từ `rubber_grade_standards`

**Ant Design components:**
- `Table` — standards list (thay card list)
- `Modal` — thay bottom-sheet
- `Form`, `Form.Item` — form layout + validation
- `InputNumber` — numeric fields
- `Select` — material, grade, season
- `Button` — actions
- `Card` — reference table
- `message` — thay custom toast

**Services cần dùng:**
- `qcService.getAllStandards()` — có sẵn
- `qcService.upsertStandard()` — có sẵn (đã hỗ trợ rubber fields từ Đợt 1)
- `rubberGradeService.getAll()` — lấy TCVN reference table

### Checklist Sub 3.3

```
□ Rewrite QCStandardsConfigPage.tsx → Ant Design
□ Card list → Table với cột Grade, PRI, Moisture
□ Bottom-sheet → Modal (Ant Design)
□ Form: thêm rubber_grade Select + 8 SVR fields
□ Auto-fill khi chọn Grade từ rubber_grade_standards
□ MỚI: Reference table TCVN 3769
□ Validation: giữ nguyên + thêm SVR range validation
□ Build pass
□ Test: thêm/sửa standard → SVR fields lưu đúng
```

---

## SUB 3.4: BatchQCHistoryPage → ANT DESIGN + DRC TREND

**File rewrite:** `src/pages/wms/qc/BatchQCHistoryPage.tsx` (564 dòng)

### Hiện tại (Tailwind)
- Header: batch info + material + DRC current/initial
- QC Standard info (4 cols)
- DRC Chart component (custom)
- Timeline: QC results list (newest first)
- Each timeline item: check type, date, DRC, result badge, optional metrics

### Mới (Ant Design + Rubber)

**Page layout:**

```
┌────────────────────────────────────────────────────────────────┐
│  ← Quay lại    TP-SVR10-260317-001                            │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Card: Thông tin lô                                           │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Descriptions:                                          │    │
│  │ Lô: TP-SVR10-260317-001  │ VL: SVR 10                │    │
│  │ Grade: [SVR 10]           │ QC: ✅ Đạt                │    │
│  │ DRC hiện tại: 53.5%      │ DRC ban đầu: 52.0%        │    │
│  │ Kho: Kho A · K1-A3       │ SL còn: 500 kg            │    │
│  │ Dry weight: 267.5 kg     │ Ngày nhập: 17/03/2026     │    │
│  │ MỚI: Supplier: NVA      │ Vùng: Bình Phước          │    │
│  │ MỚI: Contamination: Clean│ Storage: 15 ngày          │    │
│  │ Tái kiểm tiếp: 24/03/2026 (7 ngày nữa)              │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                │
│  Card: Tiêu chuẩn QC                                         │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ DRC: 52% (50–55%)  │ PRI min: 30  │ Moisture: ≤0.80% │    │
│  │ Chu kỳ TK: 14 ngày │ Rút ngắn: 7d │                   │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                │
│  Card: DRC Trend Chart (MỚI — dùng getDRCTrend())            │
│  ┌────────────────────────────────────────────────────────┐    │
│  │       63 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ max                   │    │
│  │  DRC  58 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ min                   │    │
│  │  (%)  ●─────●───────●───●                              │    │
│  │       52   53.5    53.0  53.5                          │    │
│  │       Day1  Day7   Day14 Day21                         │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                │
│  Card: Lịch sử QC (Ant Design Timeline)                      │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ ● 21/03 14:30 — Tái kiểm                              │    │
│  │   DRC: 53.5% → ✅ Đạt │ Grade: SVR 10                │    │
│  │   MỚI: Moisture: 0.65% │ Volatile: 0.18%             │    │
│  │   Tái kiểm tiếp: 14 ngày                              │    │
│  │                                                        │    │
│  │ ● 14/03 09:15 — Tái kiểm                              │    │
│  │   DRC: 53.0% → ✅ Đạt │ Grade: SVR 10                │    │
│  │                                                        │    │
│  │ ● 07/03 10:00 — Kiểm tra ban đầu                      │    │
│  │   DRC: 52.0% → ✅ Đạt │ Grade: SVR 10                │    │
│  │   PRI: 42 │ Mooney: — │ Ash: 0.45%                   │    │
│  └────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────┘
```

**Bổ sung rubber:**
- Batch info: thêm Grade (GradeBadge), dry_weight, supplier, contamination, storage_days
- Timeline items: hiện tất cả SVR metrics (moisture, volatile, dirt, metal, color) nếu có
- Timeline items: hiện grade_tested + grade change notification
- DRC Trend: dùng `qcService.getDRCTrend()` (tạo ở Đợt 1)
- DRC Chart: inline line chart (simple — có thể dùng Ant Design compatible chart hoặc inline SVG)

**Ant Design components:**
- `Descriptions` — batch info (thay custom grid)
- `Timeline` — QC history (thay custom timeline)
- `Card`, `Statistic` — standard info
- `Tag` — check type, QC result, grade
- `Button` — back, actions

### Checklist Sub 3.4

```
□ Rewrite BatchQCHistoryPage.tsx → Ant Design
□ Batch info → Descriptions + GradeBadge, dry_weight, supplier, contamination
□ Standard info → Card + Statistic (thêm SVR fields)
□ DRC Trend chart → getDRCTrend() + inline chart
□ Timeline → Ant Design Timeline
□ Timeline items: hiện full SVR metrics (moisture, volatile, dirt, metal, color)
□ Timeline items: hiện grade_tested + grade change notification
□ Build pass
□ Test: navigate /wms/qc/batch/:id → history hiện đúng
```

---

## SUB 3.5: BUILD + TEST TOÀN BỘ QC FLOW

**Mục tiêu:** Verify toàn bộ QC flow hoạt động sau rewrite

### Test cases

```
□ QC Dashboard
  □ Load: stats cards hiện đúng số liệu
  □ Grade distribution chart hiện
  □ Filter: chọn status → table filter đúng
  □ Filter: chọn grade → table filter đúng
  □ Click batch → navigate tới batch history
  □ Click "Tái kiểm" → navigate tới recheck page
  □ Click "Ngưỡng QC" → navigate tới standards page

□ QC Recheck
  □ Load: danh sách lô cần recheck hiện đúng
  □ Click "QC" button → Modal mở
  □ Nhập DRC → live evaluation (passed/warning/failed)
  □ Mở Advanced → nhập moisture, volatile, dirt, metal, color
  □ Submit → result hiện + GradeBadge
  □ Phase 4: nếu batch thuộc Deal → Deal DRC cập nhật
  □ Close modal → list reload

□ QC Standards
  □ Load: table hiện tất cả standards
  □ Click "Thêm" → Modal mở
  □ Chọn Grade → auto-fill SVR values
  □ Nhập đầy đủ → lưu → table cập nhật
  □ Click "Sửa" → Modal mở với data hiện tại
  □ Reference table TCVN hiện đúng

□ Batch QC History
  □ Load: batch info hiện đúng (grade, dry weight, supplier)
  □ DRC trend chart hiện
  □ Timeline hiện tất cả QC results
  □ SVR metrics hiện trong timeline items
  □ Grade changes hiện notification
```

### Checklist Sub 3.5

```
□ npx tsc --noEmit → 0 lỗi
□ npx vite build → thành công
□ Navigate /wms/qc → Dashboard load
□ Navigate /wms/qc/recheck → Recheck load
□ Navigate /wms/qc/standards → Standards load
□ Navigate /wms/qc/batch/:id → History load
□ Full flow: Dashboard → Recheck → Submit → Back → Verify
```

---

## THỨ TỰ THỰC HIỆN

```
Sub 3.1 (QCDashboardPage)     ←── độc lập
    ↓
Sub 3.2 (QCRecheckPage)       ←── dùng QCInputForm (Đợt 2.2)
    ↓
Sub 3.3 (QCStandardsConfigPage) ←── độc lập
    ↓
Sub 3.4 (BatchQCHistoryPage)  ←── dùng getDRCTrend() (Đợt 1)
    ↓
Sub 3.5 (Build + Test)
    ↓
✅ ĐỢT 3 HOÀN THÀNH
```

### Dependency diagram

```
   ┌────────────────┐        ┌────────────────┐
   │  Sub 3.1       │        │  Sub 3.3       │
   │  QC Dashboard  │        │  QC Standards  │
   └───────┬────────┘        └───────┬────────┘
           │                         │
           │    ┌────────────────┐   │
           └────│  Sub 3.2       │───┘
                │  QC Recheck    │
                │  (dùng QCInput │
                │   Form Đợt 2) │
                └───────┬────────┘
                        │
                ┌───────▼────────┐
                │  Sub 3.4       │
                │  Batch History │
                └───────┬────────┘
                        │
                ┌───────▼────────┐
                │  Sub 3.5       │
                │  Build + Test  │
                └────────────────┘
```

**Lưu ý:** 3.1 và 3.3 có thể làm song song vì độc lập.

---

## TỔNG HỢP FILES

### Files rewrite (4)

| # | File | Sub | Lines hiện tại |
|---|------|-----|---------------|
| 1 | `src/pages/wms/qc/QCDashboardPage.tsx` | 3.1 | 755 |
| 2 | `src/pages/wms/qc/QCRecheckPage.tsx` | 3.2 | 870 |
| 3 | `src/pages/wms/qc/QCStandardsConfigPage.tsx` | 3.3 | 1034 |
| 4 | `src/pages/wms/qc/BatchQCHistoryPage.tsx` | 3.4 | 564 |

**Tổng lines cần rewrite: ~3,223 dòng**

### Services sử dụng (không cần sửa — đã có từ Đợt 1)

| Service | Methods dùng |
|---------|-------------|
| `qcService` | getDRCStats, getDRCOverview, getBatchesDueRecheck, addRecheckResult, getStandard, getAllStandards, upsertStandard, getQCHistory, getDRCTrend, evaluateFullSVR |
| `rubberGradeService` | getAll, classifyByDRC, getGradeLabel, getGradeColor |
| `dealWmsService` | updateDealActualDrc, notifyDealChatQcUpdate |

### Components tái sử dụng (từ Đợt 2)

| Component | Dùng ở |
|-----------|--------|
| `QCInputForm` (Đợt 2.2) | Sub 3.2 (Recheck modal) |
| `QCBadge` (Đợt 2.2) | Sub 3.1, 3.2, 3.4 |
| `DRCGauge` (Đợt 2.2) | Sub 3.2, 3.3 (preview) |
| `GradeBadge` (Đợt 2.1) | Sub 3.1, 3.2, 3.3, 3.4 |

---

*Huy Anh Rubber ERP v8 — Đợt 3: QC Pages → Ant Design + Full SVR*
*17/03/2026*
