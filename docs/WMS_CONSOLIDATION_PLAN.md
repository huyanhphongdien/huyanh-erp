# WMS (Kho) — Consolidation & Improvement Plan

**Ngày:** 2026-04-15
**Context:** Sau khi tabbed workspace đã live ở WMS, có cơ hội gộp lại 40+ trang về ~8 nhóm menu, xóa duplicate, wire các component đã code sẵn nhưng chưa dùng.

## Hiện trạng (sau audit)

| Metric | Số liệu |
|---|---|
| Route trong WMS | 40+ |
| Trang có trên sidebar | 15 |
| Trang **orphaned** (routable nhưng không có menu) | 23+ |
| Services | 25 file, ~10.5K LOC |
| Component đã code nhưng **chưa wire** | 3 (Batch Split/Merge, Traceability) |
| Duplicate UI rõ | 4 nhóm (QC, Reports, Dashboards, Create wizards) |

## Sidebar mới đề xuất (8 group)

Hiện tại KHO (WMS) có 15 mục phẳng. Gộp về 8 group rõ nghĩa, mỗi group trỏ tới 1 trang chính (list/dashboard) — các trang phụ trong group mở bằng inline tab bên trong trang chính HOẶC mở thành tab workspace khi click row.

```
KHO (WMS)
├─ Tồn kho              → /wms                [inline tabs: Tổng quan | NVL | TP | Cảnh báo | Kiểm kê]
├─ Nhập / Xuất / Cân    → /wms/stock-in       [inline tabs: Nhập | Xuất | Picking | Phiếu cân]
├─ QC & DRC             → /wms/qc             [inline tabs: Dashboard | Recheck | Quick Scan | Tiêu chuẩn]
├─ Sản xuất             → /wms/production     [inline tabs: Lệnh SX | Dashboard | Dây chuyền | BOM]
├─ Phối trộn            → /wms/blending       [inline tabs: Lệnh trộn | Gợi ý AI | Lịch sử]
├─ Vật liệu & Kho       → /wms/materials      [inline tabs: Vật liệu | Kho | Vị trí | Bản đồ bãi]
├─ Báo cáo              → /wms/reports        [inline tabs: Dashboard | XNT | Chất lượng NCC | Giá trị tồn | Scoring]
└─ Cài đặt kho          → /wms/settings       [inline tabs: Chung | Ngưỡng cảnh báo | Thông số QC]
```

→ Sidebar giảm từ 15 → **8 mục**. Trang detail vẫn mở thành tab workspace (đã có từ rollout).

## 4 phase thực hiện

### Phase A — Cleanup gấp (4-6h, low risk)

**A1. Xóa duplicate hiển thị**
- [ ] Gộp QC 5 trang thành 1 trang `/wms/qc` với inline tabs. Các URL cũ (`/wms/qc/recheck`, `/wms/qc/standards`, `/wms/qc/quick-scan`) redirect về `/wms/qc?tab=<name>`.
- [ ] Gộp Reports 5 trang thành 1 trang `/wms/reports` tương tự.
- [ ] Gộp Inventory dashboard + NVL dashboard vào 1 trang `/wms` với inline tabs "Tổng quan | NVL | TP".

**A2. Mirror UX stock-in sang stock-out**
- [ ] Stock-out thêm NVL/TP toggle (stock-in đã có)
- [ ] Xóa hardcoded `XK-TP-*` prefix — dùng `XK-NVL-*` hoặc `XK-TP-*` theo type
- [ ] Warehouse type validation đã có ở service layer, UI filter cần đồng bộ

**A3. Wire component sẵn có**
- [ ] **Batch Split / Merge modal** — component `/components/wms/BatchSplitModal.tsx` + `BatchMergeModal.tsx` đã xong, thêm entry point ở Batch row context menu trong InventoryDashboard + StockOutDetail
- [ ] **Traceability tree** — component `/components/wms/TraceabilityTree.tsx` đã xong, thêm 1 tab "Truy xuất nguồn gốc" trong BatchQCHistoryPage

**A4. Restructure sidebar theo 8 group**
- [ ] Edit `Sidebar.tsx` theo cấu trúc ở trên
- [ ] Test route back-compat (URL cũ phải vẫn work)

**Deliverable Phase A:** sidebar clean, QC/Reports gộp gọn, 3 component được wire. Không đụng service/DB.

---

### Phase B — Shared components + DX (4-6h)

**B1. Extract shared components**
- [ ] `<WMSStepWizard>` — abstract pattern 3 trang create (StockIn, StockOut, BlendCreate, tương lai ProductionCreate). Mỗi trang tiết kiệm ~500 LOC duplicate.
- [ ] `<WarehousePicker>` — filter theo `warehouse.type`, hiện cảnh báo khi type không khớp. Thay thế 4 bản copy hiện có.
- [ ] `<GradeBadge>` đã có, verify tất cả trang WMS dùng nhất quán.
- [ ] `<BatchPicker>` — shared UI chọn batch với filter theo grade/DRC/QC status.

**B2. Barrel export cho services**
- [ ] Chuẩn hoá `src/services/wms/index.ts` — hiện chỉ export 3/25 service. Export đủ để import dễ.
- [ ] Chú thích deprecation cho các service overlap/legacy.

**B3. Inline tab state persistence**
- [ ] QC/Reports/Sản xuất page inline tab state lưu trong URL (`?tab=recheck`) để link share được.

**Deliverable Phase B:** codebase nhẹ hơn, DX tốt hơn, inline tabs shareable qua URL.

---

### Phase C — Functional upgrades (6-10h, impact cao)

**C1. Weighbridge → Stock-in auto-sync**
- [ ] Khi phiếu cân complete (status='completed'), tự động tạo StockIn draft với `source_type='weighbridge_ticket'`, link `weighbridge_ticket_id`.
- [ ] Trang Stock-In list thêm filter "Từ phiếu cân" + badge hiển thị ticket number.
- [ ] User chỉ cần confirm → không phải nhập lại data.
- **Gain:** giảm ~80% click khi nhập NVL từ phiếu cân.

**C2. Cycle count mode**
- [ ] StockCheckPage hiện tại chỉ có full count. Thêm mode "Đếm theo zone" — chọn 1 warehouse + 1 shelf → chỉ đếm phần đó.
- [ ] Lưu cycle history để báo cáo chu kỳ đếm.
- **Gain:** nhà kho không phải dừng hoạt động full ngày để kiểm kê toàn bộ.

**C3. Alert threshold config UI**
- [ ] WMSSettingsPage hiện có nhưng chưa expose menu config alert thresholds (min_stock, max_stock, shelf_life_warning_days, DRC warning range).
- [ ] Thêm section "Ngưỡng cảnh báo" — CRUD cho alert rules, lưu vào bảng `alert_rules` (tạo mới nếu chưa có) hoặc extend `warehouse_configs`.
- **Gain:** admin tự chỉnh cảnh báo, không phải nhờ dev sửa hardcode.

**C4. Auto-assign location strategy**
- [ ] Khi nhập kho, gợi ý vị trí theo rule: cùng grade → cùng shelf, zone gần cửa → turnover cao, zone xa → long-term storage.
- [ ] LocationPicker hiện tại chỉ cho user chọn tay. Thêm nút "Gợi ý" hiện top 3 vị trí tối ưu.
- **Gain:** giảm thời gian quyết định + giảm lỗi sai zone.

**C5. Blend suggest → auto-create order**
- [ ] BlendSuggestPage hiện chỉ simulate. Thêm button "Tạo lệnh trộn từ gợi ý này" → tự fill BlendCreatePage với items đã tính sẵn.
- **Gain:** 1 click thay vì copy-paste 5 lô.

**Deliverable Phase C:** module lên level tự động hoá, không còn nhiều thao tác lặp lại.

---

### Phase D — Kiến trúc / Scale (8-12h, dài hạn)

**D1. Pallet master + tracking — ⏸ DEFERRED (2026-04-15)**
- [ ] Tạo table `pallets` (id, code, warehouse_id, location_id, current_batch_ids, max_capacity_kg)
- [ ] Stock-in assign batch vào pallet thay vì chỉ location
- [ ] Stock-out pick theo pallet thay vì batch rời
- [ ] Pallet label printing (tương tự BatchLabelPage)
- **Rationale:** cao su xuất khẩu đóng pallet, hiện tại chưa có model để track physical unit này.
- **Defer reason (2026-04-15):** Task này là rewrite level feature — tạo
  bảng DB mới + migrate tồn kho hiện có vào pallet + sửa stock-in/out
  flow để assign pallet_id + tạo label print layout. Không thể squeeze
  vào session refactor chung. Cần dedicated sprint 4-6h khi business
  ưu tiên (hiện tại container-level tracking đã đủ cho xuất khẩu theo
  đơn hàng, pallet chỉ cần khi scale lên hàng trăm container/tháng
  hoặc khi khách yêu cầu truy xuất granular hơn).

**D2. Production real-time NVL consume tracking**
- [ ] ProductionStagePage hiện chỉ start/complete. Thêm section "NVL consumed so far" live-update qua Supabase realtime.
- [ ] Operator thấy ngay consumption vs plan để điều chỉnh.

**D3. Forward traceability UI**
- [ ] Từ 1 batch → tìm tất cả container/shipment/customer đã nhận batch này.
- [ ] Dùng cho quality claim / recall scenarios.

**D4. WMS → Supplier quality feedback loop**
- [ ] QC failed batches → auto downgrade supplier score trong supplier_scoring table.
- [ ] Supplier thấy realtime score, incentive để cải thiện chất lượng NVL.

**Deliverable Phase D:** module trưởng thành, sẵn sàng scale lên hàng trăm container/tháng.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Phase A gộp QC/Reports → deep link URL cũ break | Redirect route `/wms/qc/recheck` → `/wms/qc?tab=recheck`, giữ 1 sprint |
| Extract shared components Phase B → regression khắp nơi | Làm từng component 1 lần, commit riêng, test từng page |
| Phase C weighbridge auto-sync → race condition với manual flow | Feature flag env var `VITE_AUTO_WEIGHBRIDGE_SYNC` để tắt nhanh |
| Phase D pallet model → migration lớn, dữ liệu cũ không có pallet | Pallet là optional field, backward compatible |

## Effort tổng kết

| Phase | Effort | Impact | Risk | Nên làm trước? |
|---|---|---|---|---|
| A — Cleanup gấp | 4-6h | High (UX rõ ràng ngay) | Low | ✅ Ngay |
| B — Shared components | 4-6h | Medium (DX) | Low | Sau A |
| C — Functional upgrades | 6-10h | Very High (tự động hoá) | Medium | Sau B |
| D — Kiến trúc / Scale | 8-12h | Strategic | High | Sau C, cần user priority |

**Tổng toàn bộ:** ~22-34h (3-5 ngày làm việc)

## Đề xuất

**Bắt đầu Phase A ngay** — 4-6h, rủi ro thấp, user nhìn thấy sự khác biệt rõ rệt sau deploy:
- Sidebar gọn 15 → 8 mục
- QC + Reports không còn phân mảnh
- Batch split/merge + Traceability hoạt động (component đã có từ lâu nhưng ẩn)
- Stock-out có NVL/TP toggle như stock-in

Phase B và C có thể làm trong tuần kế tiếp khi bạn đánh giá Phase A.
Phase D chờ ưu tiên từ business (pallet + forward trace là feature lớn).
