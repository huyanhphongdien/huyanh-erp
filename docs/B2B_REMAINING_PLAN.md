# KẾ HOẠCH HOÀN THIỆN B2B MODULE

**Dự án:** Huy Anh Rubber ERP v8
**Ngày lập:** 18/03/2026
**Mục tiêu:** Hoàn thiện 100% B2B Module (Phase 5 + Phase 6 + Fix issues)
**Thời gian ước tính:** 5-7 ngày làm việc

---

## TỔNG QUAN TIẾN ĐỘ

```
B2B Module:  ████████████████████████████████████░░░░░░░░░░  75% → 100%
             Phase 1-4 ✅ DONE    Phase 5 ⚠️ 60%    Phase 6 🔲 0%

WMS Module:  ████████████████████████████████████████████████  100% ✅
App Cân Xe:  ████████████████████████████████████████████████  100% ✅
```

---

## ĐỢT A: FIX VẤN ĐỀ HIỆN TẠI (0.5 ngày)

### A.1 — Thêm Partner routes + menu
**Thời gian:** 30 phút
**Files sửa:** `src/App.tsx`, `src/components/common/Sidebar.tsx`

| Task | Chi tiết |
|------|----------|
| Thêm route `/b2b/partners` | → `PartnerListPage.tsx` (đã có) |
| Thêm route `/b2b/partners/:id` | → `PartnerDetailPage.tsx` (đã có) |
| Thêm menu "Đại lý" vào Sidebar | Sau menu "Deals", icon UserOutlined |
| Verify navigation | DealDetail → "Xem hồ sơ đại lý" hoạt động |

### A.2 — Fix Tiếng Việt còn sót
**Thời gian:** 30 phút

| Task | Chi tiết |
|------|----------|
| Quét lại toàn bộ B2B pages | Kiểm tra text không dấu còn sót |
| Fix label trong forms | Placeholder, validation messages |
| Fix error messages | Toast/alert messages |

### A.3 — Fix lỗi nhỏ trên App Cân Xe
**Thời gian:** 1 giờ

| Task | Chi tiết |
|------|----------|
| Camera 176 intermittent | Thêm retry logic trong proxy |
| Phân biệt ảnh L1/L2 rõ hơn | Label + border color trên ảnh |
| Deal dropdown không hiện | Fix Select options rendering |

---

## ĐỢT B: PHASE 5 — QUYẾT TOÁN HOÀN CHỈNH (2-3 ngày)

### B.1 — Auto-Settlement từ Deal (1 ngày)
**Mục tiêu:** Khi Deal chuyển sang "settled" → tự động tạo Settlement draft

**Logic:**
```
Deal status → "settled"
  ↓
Gom tất cả stock-in confirmations thuộc Deal
  ↓
Tính: actual_weight × (actual_drc/100) × unit_price = final_value
  ↓
Trừ đi: tổng advances đã chi
  ↓
Tạo Settlement draft với:
  - deal_id
  - partner_id
  - total_value = final_value
  - total_advanced = sum(advances.amount)
  - balance_due = final_value - total_advanced
  - items: danh sách stock-in + QC results
```

**Files tạo/sửa:**

| File | Thay đổi |
|------|----------|
| `src/services/b2b/autoSettlementService.ts` | TẠO — logic tự động tạo Settlement |
| `src/services/b2b/dealService.ts` | SỬA — gọi autoSettlement khi status → settled |
| `src/pages/b2b/deals/DealDetailPage.tsx` | SỬA — nút "Quyết toán" trigger auto-settlement |

### B.2 — DRC Variance Calculation (0.5 ngày)
**Mục tiêu:** So sánh DRC dự kiến vs thực tế → tính chênh lệch giá trị

**Logic:**
```
expected_value = quantity_kg × (expected_drc/100) × unit_price
actual_value   = actual_weight_kg × (actual_drc/100) × unit_price
variance       = actual_value - expected_value
variance_pct   = (actual_drc - expected_drc) / expected_drc × 100
```

**Files tạo/sửa:**

| File | Thay đổi |
|------|----------|
| `src/services/b2b/drcVarianceService.ts` | TẠO — tính toán chênh lệch |
| `src/components/b2b/DrcVarianceCard.tsx` | TẠO — UI hiển thị so sánh |
| `src/pages/b2b/settlements/SettlementCreatePage.tsx` | SỬA — hiện DRC variance |
| `src/components/b2b/DealQcTab.tsx` | SỬA — thêm variance info |

### B.3 — Settlement Approval Workflow (1 ngày)
**Mục tiêu:** Luồng duyệt quyết toán 4 bước

```
Draft → Pending Review → Approved → Paid
  ↓         ↓              ↓          ↓
Tạo tự    Gửi duyệt     Duyệt     Chi tiền
động      (Manager)    (Director)  (Kế toán)
```

**Files tạo/sửa:**

| File | Thay đổi |
|------|----------|
| `src/services/b2b/settlementService.ts` | SỬA — thêm approve/reject methods |
| `src/pages/b2b/settlements/SettlementDetailPage.tsx` | SỬA — nút Duyệt/Từ chối + timeline |
| `src/pages/b2b/settlements/SettlementListPage.tsx` | SỬA — filter theo approval status |
| `src/components/b2b/ApprovalTimeline.tsx` | TẠO — timeline duyệt |

### B.4 — Portal Notification (0.5 ngày)
**Mục tiêu:** Đại lý nhận thông báo khi Settlement tạo/duyệt/trả tiền

**Files tạo/sửa:**

| File | Thay đổi |
|------|----------|
| `src/services/b2b/settlementService.ts` | SỬA — gọi notifyPartner |
| `src/services/b2b/dealWmsService.ts` | SỬA — thêm notifyDealChatSettlement |

---

## ĐỢT C: PHASE 6 — LIÊN KẾT SẢN XUẤT (2 ngày)

### C.1 — Deal → Production Order (1 ngày)
**Mục tiêu:** Từ Deal đã nhập kho → tạo lệnh sản xuất chọn NVL

**Logic:**
```
Deal (accepted/processing)
  ↓
Stock-In Orders thuộc Deal → Stock Batches (NVL đã nhập)
  ↓
Chọn batches → Tạo Production Order
  - target_grade: từ Deal product_name
  - target_quantity: từ Deal quantity_kg
  - input_items: từ batches đã chọn
  ↓
Production (5 công đoạn: Rửa → Cán → Sấy → Ép → QC)
  ↓
Output batches → Stock-In thành phẩm
```

**Files tạo/sửa:**

| File | Thay đổi |
|------|----------|
| `src/components/b2b/DealProductionTab.tsx` | TẠO — tab Sản xuất trong DealDetail |
| `src/services/b2b/dealProductionService.ts` | TẠO — bridge Deal → Production |
| `src/pages/b2b/deals/DealDetailPage.tsx` | SỬA — thêm tab "Sản xuất" |
| `src/pages/wms/production/ProductionCreatePage.tsx` | SỬA — pre-fill từ Deal |

### C.2 — Truy xuất nguồn gốc End-to-End (0.5 ngày)
**Mục tiêu:** Từ lô thành phẩm → trace ngược về Deal + Đại lý

```
Thành phẩm (SVR 10, Batch TP-001)
  ↑ production_output_batches
Production Order (PO-001)
  ↑ production_order_items
NVL Batches (LOT-NL-001, LOT-NL-002)
  ↑ stock_in_details
Stock-In Order (NK-001)
  ↑ deal_id
Deal (DL2603-001)
  ↑ partner_id
Đại lý (Nguyễn Thị Lệ)
```

**Files tạo/sửa:**

| File | Thay đổi |
|------|----------|
| `src/services/wms/traceabilityService.ts` | TẠO — truy xuất chuỗi |
| `src/components/wms/TraceabilityTree.tsx` | TẠO — UI cây nguồn gốc |
| `src/pages/wms/production/ProductionDetailPage.tsx` | SỬA — thêm truy xuất |

### C.3 — Dashboard tích hợp (0.5 ngày)
**Mục tiêu:** B2B Dashboard hiển thị thêm thông tin sản xuất

**Files sửa:**

| File | Thay đổi |
|------|----------|
| `src/pages/b2b/B2BDashboardPage.tsx` | SỬA — thêm cards sản xuất |
| `src/services/b2b/b2bDashboardService.ts` | SỬA — thêm production stats |

---

## TIMELINE DỰ KIẾN

```
┌─────────────────────────────────────────────────────────────────┐
│                    TIMELINE TRIỂN KHAI                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Ngày 1 (18/03):  Đợt A — Fix Partner routes + Vietnamese      │
│                    A.1 ████ A.2 ████ A.3 ████                   │
│                                                                 │
│  Ngày 2 (19/03):  Đợt B.1 — Auto-Settlement                    │
│                    ████████████████████████                      │
│                                                                 │
│  Ngày 3 (20/03):  Đợt B.2 + B.3 — DRC Variance + Approval      │
│                    B.2 ████████ B.3 ████████████████             │
│                                                                 │
│  Ngày 4 (21/03):  Đợt B.3 (tiếp) + B.4 — Approval + Notify     │
│                    B.3 ████████████ B.4 ████████████             │
│                                                                 │
│  Ngày 5 (22/03):  Đợt C.1 — Deal → Production Order            │
│                    ████████████████████████                      │
│                                                                 │
│  Ngày 6 (23/03):  Đợt C.2 + C.3 — Truy xuất + Dashboard        │
│                    C.2 ████████████ C.3 ████████████             │
│                                                                 │
│  Ngày 7 (24/03):  Test E2E + Deploy + Fix bugs                  │
│                    ████████████████████████████████              │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  MILESTONE: B2B Module 100% HOÀN THÀNH                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## CHECKLIST TRIỂN KHAI

### Đợt A: Fix hiện tại
```
□ A.1 — Thêm Partner routes vào App.tsx
□ A.1 — Thêm menu "Đại lý" vào Sidebar
□ A.2 — Quét fix Tiếng Việt B2B pages
□ A.3 — Fix camera retry + Deal dropdown
□ A.3 — Phân biệt ảnh L1/L2 rõ hơn
□ Build + Deploy + Test
```

### Đợt B: Phase 5 — Quyết toán
```
□ B.1 — Tạo autoSettlementService.ts
□ B.1 — Tích hợp vào dealService (status → settled)
□ B.1 — Nút "Quyết toán" trên DealDetail
□ B.2 — Tạo drcVarianceService.ts
□ B.2 — Tạo DrcVarianceCard.tsx
□ B.2 — Hiện variance trên SettlementCreate + DealQcTab
□ B.3 — Settlement approval methods (approve/reject)
□ B.3 — ApprovalTimeline component
□ B.3 — SettlementDetail nút Duyệt/Từ chối
□ B.3 — SettlementList filter approval status
□ B.4 — Chat notification khi Settlement tạo/duyệt/trả
□ Build + Deploy + Test E2E
```

### Đợt C: Phase 6 — Sản xuất
```
□ C.1 — Tạo DealProductionTab.tsx
□ C.1 — Tạo dealProductionService.ts
□ C.1 — Thêm tab "Sản xuất" vào DealDetail
□ C.1 — ProductionCreate pre-fill từ Deal
□ C.2 — Tạo traceabilityService.ts
□ C.2 — Tạo TraceabilityTree.tsx
□ C.2 — Thêm truy xuất vào ProductionDetail
□ C.3 — Dashboard thêm production stats
□ Build + Deploy + Test E2E
```

### Test End-to-End
```
□ Luồng 1: Booking → Deal → Stock-In → QC → Settlement → Paid
□ Luồng 2: Deal → Cân xe → Nhập kho → Production → TP
□ Luồng 3: Settlement auto → Approve → Pay → Ledger cập nhật
□ Luồng 4: Truy xuất TP → NVL → Deal → Đại lý
□ Luồng 5: Chat nhận thông báo ở mọi bước
```

---

## SƠ ĐỒ LUỒNG HOÀN CHỈNH (SAU KHI XONG)

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  ĐẠI LÝ  │    │   DEAL   │    │   KHO    │    │ SẢN XUẤT │
│ (Portal)  │    │  (B2B)   │    │  (WMS)   │    │  (P8-9)  │
└────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘
     │               │               │               │
  1. Booking ──────► │               │               │
     │               │               │               │
  2. Thương lượng ◄──►               │               │
     │               │               │               │
  3. Xác nhận Deal ──►               │               │
     │               │               │               │
  4. Tạm ứng ◄───────►               │               │
     │               │               │               │
     │            5. Xe mủ về ──────► │               │
     │               │            Cân xe (App)       │
     │               │            Nhập kho           │
     │               │            QC / DRC           │
     │               │               │               │
     │            6. actual_drc ◄─────               │
     │               │               │               │
     │               │         7. Lệnh SX ──────────►
     │               │               │          Rửa→Cán→Sấy
     │               │               │          →Ép→QC TP
     │               │               │               │
     │               │         8. TP nhập kho ◄──────
     │               │               │               │
     │            9. Quyết toán      │               │
     │               (auto)          │               │
     │               │               │               │
 10. Nhận tiền ◄─────                │               │
     │               │               │               │
     │         11. Truy xuất ◄───────►───────────────►
     │          (TP → NVL → Deal → Đại lý)           │
```

---

*Huy Anh Rubber ERP v8 — B2B Remaining Plan*
*Ngày lập: 18/03/2026*
*Ước tính: 5-7 ngày hoàn thành 100%*
