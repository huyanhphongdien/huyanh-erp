# WMS (Kho) — Consolidation & Improvement Plan

**Ngày:** 2026-04-15
**Cập nhật:** 2026-04-16 — Phase A-D hoàn tất (trừ D1 deferred), sidebar 15→9, UX audit xong.

## Hiện trạng (sau hoàn tất Phase A-D + UX audit)

| Metric | Trước | Sau |
|---|---|---|
| Sidebar KHO | 15 mục phẳng | **9 mục** (Phối trộn chuyển sang SX, Bản đồ bãi ẩn) |
| Route WMS | 40+ (23 orphaned) | 40+ (0 orphaned — redirect hoặc detail tab) |
| Services barrel | 7/25 exported | **25/25 exported** |
| Shared components | 0 | **3** (WarehousePicker, MaterialPicker, LocationPicker auto-suggest) |
| Dead code | 3 component orphaned | **Xóa**: CameraFeed, DRCChart, DryWeightDisplay + 13 lazy imports |
| Stock-out bugs | 3 silent (kg vs count) | **Fixed** (S1 refactor qua service layer) |
| Forward traceability | Chỉ backward | **Backward + Forward** (batch → SX/xuất/khách) |
| QC → Supplier feedback | Không có | **Có** (supplierImpact toast khi fail) |
| Realtime NVL consume | Không có | **Có** (live subscribe inventory_transactions) |
| Weighbridge auto-sync | Không có | **IN ✅ active, OUT ⏳ pending flag** |

## Sidebar hiện tại

```
KHO (WMS)  — 9 mục
├─ Tồn kho              → /wms           [tabs: Tổng quan | NVL | Cảnh báo | Kiểm kê]
├─ Nhập kho             → /wms/stock-in
├─ Xuất kho             → /wms/stock-out
├─ Phiếu cân            → /wms/weighbridge/list
├─ QC / DRC             → /wms/qc        [tabs: Dashboard | Recheck | Quick Scan | Tiêu chuẩn]
├─ Vật liệu             → /wms/materials
├─ Kho hàng             → /wms/warehouses
├─ Báo cáo WMS          → /wms/reports   [tabs: Dashboard | XNT | NCC | Giá trị tồn | Scoring]
└─ Cài đặt kho          → /wms/settings

Phối trộn + Gợi ý trộn → chuyển sang nhóm QUẢN LÝ SẢN XUẤT
Bản đồ bãi → ẩn sidebar (route vẫn sống)
```

## 4 phase thực hiện

### Phase A — Cleanup gấp (4-6h, low risk) ✅ DONE

**A1. Xóa duplicate hiển thị** — commit `de5fd18f`
- [x] Gộp QC 5 trang thành 1 trang `/wms/qc` với inline tabs (WMSQCTabbedPage). URL cũ redirect qua `<Navigate>`.
- [x] Gộp Reports 5 trang thành 1 trang `/wms/reports` (WMSReportsTabbedPage).
- [x] Gộp Inventory dashboard + NVL + Alerts + StockCheck vào 1 trang `/wms` (WMSInventoryTabbedPage).

**A2. Mirror UX stock-in sang stock-out** — commit `de5fd18f`
- [x] Stock-out thêm NVL/TP toggle (Radio.Group, mirror stock-in)
- [x] Xóa hardcoded `XK-TP-*` prefix — `generateCode(orderType)` sinh `XK-NVL-*` hoặc `XK-TP-*`
- [x] Warehouse type validation ở UI filter đồng bộ (`filteredWarehouses` → `WarehousePicker`)

**A3. Wire component sẵn có** — commit `de5fd18f`
- [x] **Traceability tree** — thêm tab "Truy xuất nguồn gốc" trong BatchQCHistoryPage. Fix TS bug rubber_intake trong NODE_CONFIG.
- [x] **Batch Split / Merge** — đã wire sẵn trong InventoryDetailPage (plan hiểu nhầm).

**A4. Restructure sidebar** — commits `de5fd18f` + `c014374d`
- [x] Sidebar giảm từ 15 → 9 mục (3 orphaned tab + Phối trộn sang SX + Bản đồ bãi ẩn)
- [x] Route back-compat: URL cũ redirect qua `<Navigate replace>`, zero broken deep links

---

### Phase B — Shared components + DX (4-6h) ✅ DONE

**B1. Extract shared components** — commit `4f06b519`
- [x] `<WarehousePicker>` — React Query cache, filter theo stockType. Apply cho StockIn/StockOut Create.
- [x] `<GradeBadge>` — verify nhất quán, fix 2 chỗ YardMapPage dùng `<Tag>` thay vì GradeBadge.
- [ ] ~~`<WMSStepWizard>`~~ — SKIP (Step 2 domain-specific, over-abstraction risk).
- [ ] ~~`<BatchPicker>`~~ — SKIP (3 page có modal khác nhau, unify = over-engineering).

**B2. Barrel export cho services** — commit `4f06b519`
- [x] `src/services/wms/index.ts` — 7/25 → **25/25** services exported. Back-compat alias `wmsWarehouseService`.
- [ ] ~~Chú thích deprecation~~ — không cần, barrel cover đủ.

**B3. Inline tab state persistence** — commit `de5fd18f` (Phase A đã làm)
- [x] QC/Reports/Inventory page inline tab state lưu trong URL (`?tab=recheck`) qua `useSearchParams`.

---

### Phase C — Functional upgrades (6-10h, impact cao) ✅ DONE

**C1. Weighbridge → Stock-in auto-sync** — commit `02e35a56`
- [x] `handleComplete` trong WeighingPage auto-call `createFromWeighbridgeTicket` khi `VITE_AUTO_WEIGHBRIDGE_SYNC=true` + `ticket_type='in'`.
- [x] StockInListPage badge ⚖ CX-... cho phiếu nhập từ phiếu cân.
- [x] Idempotency check trong `createFromWeighbridgeTicket` (notes pattern matching).

**C2. Cycle count mode** — commit `02e35a56`
- [x] StockCheckPage Radio toggle "Toàn bộ kho / Theo vị trí (cycle)" + multi-select location.
- [x] `stockCheckService.createStockCheck` hỗ trợ `location_ids[]` filter.
- [ ] ~~Lưu cycle history~~ — chưa có table, defer.

**C3. Alert threshold config UI** — commit `02e35a56`
- [x] WMSSettingsPage thêm section "Ngưỡng DRC (%)" — 4 InputNumber (warning/critical min/max).
- [x] `forecastService.AlertConfig` extend 4 fields DRC.
- [ ] ~~CRUD alert_rules DB table~~ — defer (cần migration).

**C4. Auto-assign location strategy** — commit `02e35a56`
- [x] LocationPicker thêm nút "Gợi ý" (BulbOutlined) — heuristic shelf ít batch + ô trống nhất.
- [x] Chỉ hiện cho mode stock-in, single select.

**C5. Blend suggest → auto-create order** — commit `02e35a56`
- [x] BlendSuggestPage pass batch + partner + ratio + grade qua URL.
- [x] BlendCreatePage auto-fill cả 2 lô + auto-advance step khi URL có params.

---

### Phase D — Kiến trúc / Scale (8-12h, dài hạn) ✅ DONE (trừ D1)

**D1. Pallet master + tracking — ⏸ DEFERRED**
- [ ] Tạo table `pallets`, assign batch vào pallet, pick theo pallet, label printing.
- **Defer reason:** Rewrite feature level, cần dedicated sprint 4-6h + DB migration.

**D2. Production real-time NVL consume tracking** — commit `3bfd88e3`
- [x] ProductionStagePage: subscribe `inventory_transactions` realtime. Card "LIVE" hiển thị kế hoạch vs đã tiêu thụ + Progress bar + cảnh báo vượt.

**D3. Forward traceability UI** — commit `3bfd88e3`
- [x] `traceabilityService.traceFromBatchForward` — batch → production → stock-out → customer.
- [x] TraceabilityTree: thêm direction='forward' + 2 node types (stock_out, customer).
- [x] BatchQCHistoryPage: 2 tab riêng "Truy xuất ngược" + "Truy xuất xuôi".

**D4. WMS → Supplier quality feedback loop** — commit `3bfd88e3`
- [x] `supplierScoringService.getSupplierImpactFromBatch` — điểm NCC cho batch.
- [x] `qcService.addInitialQC` + `addRecheckResult` trả `supplierImpact` khi fail.
- [x] QCQuickScanPage: toast warning 6s show NCC score + grade + pass_rate.

---

## Post-plan: Stock-out Improvements (S1-S4) ✅ DONE

Xem [STOCK_OUT_IMPROVEMENT_PLAN.md](./STOCK_OUT_IMPROVEMENT_PLAN.md) chi tiết.

- [x] **S1** — Refactor `handleConfirm` → service layer. Fix 3 bug silent (kg vs count).
- [x] **S2** — Deal delivery sync (`delivered_weight_kg` + `stock_out_count`). Migration SQL chạy OK.
- [x] **S3** — Weighbridge outbound auto-sync (flag `VITE_AUTO_WEIGHBRIDGE_OUT_SYNC`, draft only).
- [x] **S4** — Auto-pick FIFO button (Step 2, target kg, respect filter, allow partial).

## Post-plan: UX Audit ✅ DONE

- [x] Xóa 13 lazy imports dead + 3 component orphaned (CameraFeed, DRCChart, DryWeightDisplay).
- [x] StockCheckPage desktop redesign (bỏ fixed bottom, 2-col layout, pagination).
- [x] Modal widths QC/Blend/Production 520→700-800px.
- [x] QCQuickScanPage maxWidth 480→720.
- [x] InventoryDashboard table scroll x=1200.
- [x] MaterialPicker shared component (tạo mới, chưa migrate consumers).

---

## Risks & mitigations (cập nhật)

| Risk | Status |
|---|---|
| Phase A URL cũ break | ✅ Mitigated — `<Navigate replace>` cho tất cả URL cũ |
| Phase B regression | ✅ Mitigated — WarehousePicker apply OK, WMSStepWizard/BatchPicker skip |
| Phase C weighbridge race condition | ✅ Mitigated — feature flag + idempotency check + ticket_type gate |
| Phase D pallet migration | ⏸ Deferred — không migrate |
| S1 refactor break stock-out | ⚠️ **PENDING TEST** — push prod 2026-04-16, chưa verify thực tế |

## Remaining work

| Item | Effort | Priority |
|---|---|---|
| D1 Pallet master | 4-6h | ⏸ Defer (cần business priority) |
| Barrel import migration (0/55 pages) | 30min | 🟢 Nice-to-have DX |
| MaterialPicker consumer migration | 1h | 🟢 Nice-to-have DX |
| Cycle count history table (DB) | 2h | 🟡 Khi cần audit trail |
| Alert rules CRUD (DB) | 2h | 🟡 Khi cần per-material thresholds |
| S1 stock-out test verification | 5min | 🔴 **DO NOW** |
| S3 weighbridge OUT flag set | 5min | 🟡 Khi sẵn sàng test |
