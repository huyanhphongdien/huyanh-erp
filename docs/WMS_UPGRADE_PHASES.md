# WMS UPGRADE — PHASES CHI TIẾT

**Dự án:** Huy Anh Rubber ERP v8
**Ngày:** 24/03/2026
**Tổng:** 12 phases, ~30 ngày

---

## TỔNG QUAN

```
Phase 1:  QR nhãn lô           ████  1 ngày     ← BẮT ĐẦU TỪ ĐÂY
Phase 2:  Bản đồ bãi           ████  2 ngày
Phase 3:  Dashboard bãi NVL    ████  1 ngày
Phase 4:  Quick Stock-In       ████  1 ngày
Phase 5:  QC mobile + scan     ████  1.5 ngày
Phase 6:  Batch split/merge    ████  1 ngày
Phase 7:  Fix bugs & issues    ████  2 ngày
Phase 8:  Cost tracking        ████  2 ngày
Phase 9:  COA Generation       ████  2 ngày
Phase 10: Supplier scoring     ████  2 ngày
Phase 11: Forecast + Alert UI  ████  2 ngày
Phase 12: Xuất khẩu + Manifest ████  2 ngày
```

---

## PHASE 1: IN NHÃN QR LÔ HÀNG (1 ngày)

**Mục tiêu:** In nhãn A5 dán tại bãi mủ — có QR code + thông tin lô

### Sub-tasks

| # | Task | Chi tiết | Thời gian |
|---|------|----------|-----------|
| 1.1 | Component `BatchLabel` | Layout nhãn A5 ngang: QR code + mã lô, đại lý, loại mủ, KL, DRC (từ QC), Grade, vị trí, ngày | 3h |
| 1.2 | Trang in nhãn `/wms/batch/:id/label` | Load batch data + QR → print view | 2h |
| 1.3 | Nút "In nhãn" trong BatchDetail | Chỉ hiện SAU KHI QC xong (qc_status = passed) | 1h |
| 1.4 | Nút "In nhãn tạm" (tùy chọn) | Nhãn không có DRC — in ngay khi nhập kho | 1h |

**Quy tắc:**
- DRC trên nhãn = DRC từ QC (KHÔNG phải DRC đại lý báo)
- Nhãn chính thức chỉ in sau QC
- Nhãn tạm là tùy chọn, có watermark "TẠM — CHỜ QC"

**Output:** Component `BatchLabel.tsx`, page `BatchLabelPage.tsx`

---

## PHASE 2: BẢN ĐỒ BÃI MỦ — YARD MAP (2 ngày)

**Mục tiêu:** Sơ đồ grid bãi nguyên liệu — biết lô nào ở ô nào

### Sub-tasks

| # | Task | Chi tiết | Thời gian |
|---|------|----------|-----------|
| 2.1 | SQL: thêm `yard_position` vào stock_batches | `yard_zone` (A/B/C), `yard_row` (1-10), `yard_col` (1-5) | 1h |
| 2.2 | Component `YardMap` | Grid visualization — mỗi ô hiện: mã lô, loại mủ, DRC, màu theo Grade | 4h |
| 2.3 | Trang `/wms/yard-map` | Full page yard map + filter (grade, DRC range, trạng thái QC) | 4h |
| 2.4 | Drag & drop chuyển vị trí | Kéo lô từ ô này sang ô khác → update DB | 3h |
| 2.5 | Click ô → popup chi tiết | Hiện batch info + nút: QC, Xuất kho, In nhãn | 2h |
| 2.6 | Sidebar menu + route | Thêm "Bản đồ bãi" vào menu KHO | 1h |

**Output:** `YardMap.tsx`, `YardMapPage.tsx`

---

## PHASE 3: DASHBOARD BÃI NVL (1 ngày)

**Mục tiêu:** Tổng quan bãi nguyên liệu — 1 trang nhìn là biết hết

### Sub-tasks

| # | Task | Chi tiết | Thời gian |
|---|------|----------|-----------|
| 3.1 | KPI cards | Tổng tồn (tấn), Số lô, DRC TB, Lô chờ QC, Lô sẵn SX, Lô lưu > 30 ngày | 2h |
| 3.2 | Chart: Phân bố Grade | Pie chart SVR 3L/5/10/20 theo trọng lượng | 1h |
| 3.3 | Chart: Nhập kho 7 ngày | Bar chart nhập mỗi ngày (tấn) | 1h |
| 3.4 | Bảng: Lô cần xử lý | Chờ QC + QC không đạt + Lưu kho lâu | 2h |
| 3.5 | Quick actions | "Nhập kho mới", "Xem bản đồ bãi", "QC nhanh" | 1h |

**Output:** Nâng cấp `InventoryDashboard.tsx` hoặc tạo `NVLDashboardPage.tsx`

---

## PHASE 4: QUICK STOCK-IN TỪ CÂN (1 ngày)

**Mục tiêu:** Sau khi cân xong → 1 click tạo phiếu nhập kho (không cần nhập lại)

### Sub-tasks

| # | Task | Chi tiết | Thời gian |
|---|------|----------|-----------|
| 4.1 | API: `createStockInFromTicket(ticketId)` | Lấy data từ weighbridge_ticket → auto create stock_in + batch | 3h |
| 4.2 | Nút "Nhập kho ngay" trên phiếu cân hoàn tất | Trên app cân + ERP weighbridge list | 2h |
| 4.3 | Auto fill vị trí bãi | Gợi ý ô trống gần nhất dựa trên loại mủ | 2h |

**Output:** Method mới trong `stockInService`, nút mới trên WeighingPage + WeighbridgeDetailPage

---

## PHASE 5: QC MOBILE + QUÉT QR (1.5 ngày)

**Mục tiêu:** Nhân viên QC dùng tablet/phone tại bãi mủ

### Sub-tasks

| # | Task | Chi tiết | Thời gian |
|---|------|----------|-----------|
| 5.1 | QC page responsive | Tối ưu QCRecheckPage cho mobile (font lớn, nút lớn) | 3h |
| 5.2 | Camera scan QR | Dùng camera phone quét QR lô → mở form DRC | 3h |
| 5.3 | Quick DRC input | Form tối giản: chỉ DRC + passed/failed → submit | 2h |
| 5.4 | Auto trigger in nhãn | Sau QC xong → hỏi "In nhãn QR chính thức?" | 1h |
| 5.5 | Chụp ảnh mẫu | Camera phone chụp ảnh mẫu QC → lưu Supabase Storage | 2h |

**Output:** Nâng cấp QC pages, thêm QR scanner component

---

## PHASE 6: BATCH SPLIT/MERGE (1 ngày)

**Mục tiêu:** Tách lô (chia bãi) hoặc gộp lô (cùng DRC)

### Sub-tasks

| # | Task | Chi tiết | Thời gian |
|---|------|----------|-----------|
| 6.1 | Service: `batchService.splitBatch(id, quantities[])` | LOT-001 (10T) → LOT-001-A (6T) + LOT-001-B (4T) | 3h |
| 6.2 | Service: `batchService.mergeBatches(ids[])` | LOT-001 + LOT-002 → LOT-003 (weighted avg DRC) | 2h |
| 6.3 | UI: Modal split/merge | Trong BatchDetail → nút "Tách lô" / "Gộp lô" | 2h |
| 6.4 | Audit trail | Ghi log: ai tách/gộp, lúc nào, parent → children | 1h |

**Output:** Methods mới trong `batchService`, modal component

---

## PHASE 7: FIX BUGS & ISSUES (2 ngày)

**Mục tiêu:** Fix các bugs phát hiện từ phân tích code

### Sub-tasks

| # | Task | Bug ref | Thời gian |
|---|------|---------|-----------|
| 7.1 | SQL: Thêm missing indexes | B2 | 1h |
| 7.2 | Fix N+1 queries inventoryService | B4 | 2h |
| 7.3 | Fix alert dismissed → lưu DB | B11 | 1h |
| 7.4 | Fix LocationPicker capacity check | B13 | 1h |
| 7.5 | Fix stockIn notes dùng code thay UUID | B16 | 0.5h |
| 7.6 | Refactor: extractCodeGenerator | B9 | 2h |
| 7.7 | Fix CV60 classification (thêm PRI) | B8 | 2h |
| 7.8 | Add auto-refresh cho AlertList (30s polling) | B17 | 1h |
| 7.9 | Fix Supabase errors hiện cho user | B18 | 2h |
| 7.10 | Xóa DRCChart orphaned file | B12 | 0.5h |

**Output:** Code cleaner, performance tốt hơn, ít bug hơn

---

## PHASE 8: COST TRACKING & GIÁ VỐN (2 ngày)

**Mục tiêu:** Tính giá vốn NVL, COGS sản xuất, lãi/lỗ theo grade

### Sub-tasks

| # | Task | Chi tiết | Thời gian |
|---|------|----------|-----------|
| 8.1 | SQL: Thêm `cost_per_kg` vào stock_batches | Lấy từ deal.unit_price khi nhập kho | 1h |
| 8.2 | Service: `costTrackingService` | Tính COGS = NVL cost + processing + overhead | 3h |
| 8.3 | Cập nhật InventoryValueReport | Hiện giá trị tồn kho = qty × cost_per_kg | 2h |
| 8.4 | Profit margin card | Trên Dashboard: giá bán - COGS = margin % theo grade | 2h |
| 8.5 | Auto fill cost từ Deal | Khi nhập kho có deal_id → cost = deal.unit_price | 1h |

**Output:** `costTrackingService.ts`, nâng cấp reports

---

## PHASE 9: COA GENERATION (2 ngày)

**Mục tiêu:** Auto tạo Certificate of Analysis (PDF) cho xuất khẩu

### Sub-tasks

| # | Task | Chi tiết | Thời gian |
|---|------|----------|-----------|
| 9.1 | COA template component | Layout PDF: header công ty, batch info, QC results (full SVR params), grade standard comparison | 4h |
| 9.2 | COA data service | Lấy batch → QC results → rubber_grade_standards → format | 2h |
| 9.3 | Nút "Tạo COA" trong StockOutDetail | Chỉ hiện cho stock-out loại 'sale' | 1h |
| 9.4 | COA list/history | Danh sách COA đã tạo, link download | 2h |
| 9.5 | Multi-language | English version cho buyer nước ngoài | 3h |

**Output:** `COATemplate.tsx`, `coaService.ts`, `COAPage.tsx`

---

## PHASE 10: SUPPLIER SCORING (2 ngày)

**Mục tiêu:** Chấm điểm đại lý: DRC consistency, pass rate, on-time

### Sub-tasks

| # | Task | Chi tiết | Thời gian |
|---|------|----------|-----------|
| 10.1 | Service: `supplierScoringService` | Tính score: DRC consistency (std dev), pass rate, avg quantity, on-time % | 3h |
| 10.2 | Supplier Dashboard page | Ranking board, trend chart, comparison | 4h |
| 10.3 | Supplier scorecard component | Card hiện score + breakdown cho 1 đại lý | 2h |
| 10.4 | Tích hợp vào PartnerDetail (B2B) | Tab "Chất lượng" trong PartnerDetailPage | 2h |
| 10.5 | Auto suggest | "Nên tăng mua từ đại lý A (score 92)" | 1h |

**Output:** `supplierScoringService.ts`, `SupplierDashboardPage.tsx`

---

## PHASE 11: FORECAST + ALERT CONFIG UI (2 ngày)

**Mục tiêu:** Dự đoán tồn kho + cấu hình ngưỡng cảnh báo

### Sub-tasks

| # | Task | Chi tiết | Thời gian |
|---|------|----------|-----------|
| 11.1 | Service: `forecastService` | Tính tốc độ xuất → dự đoán ngày hết hàng | 3h |
| 11.2 | Forecast chart | Actual line + forecast dotted line cho mỗi grade | 2h |
| 11.3 | SQL: bảng `wms_settings` | Lưu alert thresholds vào DB | 1h |
| 11.4 | Settings page | UI cấu hình: % hao hụt, ngày lưu kho, ngày expiry warning | 3h |
| 11.5 | alertService đọc từ DB | Thay hardcode → đọc `wms_settings` | 2h |

**Output:** `forecastService.ts`, `WMSSettingsPage.tsx`

---

## PHASE 12: XUẤT KHẨU + CONTAINER MANIFEST (2 ngày)

**Mục tiêu:** Quản lý xuất khẩu: packing list, container manifest, shipping docs

### Sub-tasks

| # | Task | Chi tiết | Thời gian |
|---|------|----------|-----------|
| 12.1 | SQL: bảng `export_containers` | container_no, seal_no, type (20ft/40ft), stock_out_id | 1h |
| 12.2 | SQL: bảng `export_container_items` | container_id, batch_id, bale_from, bale_to, weight | 1h |
| 12.3 | Packing list component | In danh sách bành theo container | 3h |
| 12.4 | Container manifest page | Assign bales to containers, total weight per container | 4h |
| 12.5 | Shipping docs bundle | 1 click tạo: Packing List + COA + Weight Note | 3h |
| 12.6 | Thêm `processing_return` vào stock_out reason | Cho luồng gia công trả hàng | 1h |

**Output:** `ExportContainerPage.tsx`, `PackingList.tsx`, `ShippingDocsPage.tsx`

---

## LỘ TRÌNH THỰC HIỆN

```
Tuần 1:  Phase 1 + 2 + 3     (QR + Bản đồ bãi + Dashboard)     4 ngày
Tuần 2:  Phase 4 + 5 + 6     (Quick SI + QC mobile + Split)     3.5 ngày
Tuần 3:  Phase 7 + 8         (Fix bugs + Cost tracking)          4 ngày
Tuần 4:  Phase 9 + 10        (COA + Supplier scoring)            4 ngày
Tuần 5:  Phase 11 + 12       (Forecast + Xuất khẩu)              4 ngày
```

| Tuần | Phases | Ngày | Tổng |
|------|--------|------|------|
| 1 | 1, 2, 3 | 4 | 4 |
| 2 | 4, 5, 6 | 3.5 | 7.5 |
| 3 | 7, 8 | 4 | 11.5 |
| 4 | 9, 10 | 4 | 15.5 |
| 5 | 11, 12 | 4 | 19.5 |

**Tổng: ~20 ngày làm việc (4 tuần)**

---

## ƯU TIÊN NẾU GIỚI HẠN THỜI GIAN

### Chỉ có 1 tuần → làm Phase 1 + 2 + 3
→ In nhãn QR + Bản đồ bãi + Dashboard = **giải quyết 80% vấn đề bãi NVL**

### Chỉ có 2 tuần → thêm Phase 4 + 5 + 7
→ Quick nhập kho + QC mobile + Fix bugs = **vận hành mượt hơn**

### Có 1 tháng → làm hết 12 phases
→ WMS hoàn chỉnh chuyên nghiệp cho nhà máy cao su

---

*WMS Upgrade Phases v1.0*
*Huy Anh Rubber ERP v8*
*24/03/2026*
