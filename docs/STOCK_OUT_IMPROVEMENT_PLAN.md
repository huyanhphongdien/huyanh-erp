# Stock-Out (Xuất kho) — Improvement Plan

**Ngày:** 2026-04-15
**Context:** Sau WMS Consolidation Plan A-D (commits `de5fd18f`..`3bfd88e3`), audit module xuất kho phát hiện 4 gap lớn. Plan này gom lại thành 4 task độc lập, mỗi task deploy + revert riêng được.

## Hiện trạng (audit 2026-04-15)

Stock-out hiện đã có **25 auto-behaviors** (code gen, FIFO picking display, status transitions, inventory side effects, validation guards). Tuy nhiên còn 4 vấn đề đáng sửa:

| # | Vấn đề | Risk | Severity |
|---|---|---|---|
| S1 | **Code duplication** — `StockOutCreatePage.handleConfirm` tự chạy inventory updates trực tiếp, không dùng `stockOutService.confirmStockOut`. 2 path cùng làm 1 việc. | Data inconsistency nếu sửa 1 chỗ quên chỗ kia | 🔴 High |
| S2 | **Không có deal delivery sync** — stock-out sale không update `b2b_deals.delivered_kg`/`remaining_kg`. Stock-in đã có `dealWmsService.updateDealStockInTotals`, chiều xuất thì chưa. | Deal tracking sai số liệu nếu đang dùng cho sale | 🟡 Medium |
| S3 | **Không có weighbridge outbound auto-sync** — C1 chỉ làm chiều nhập (phiếu cân → stock-in). Chiều xuất (cân xe ra → stock-out) chưa tự động. | Phải nhập tay lại sau khi cân | 🟡 Medium |
| S4 | **Không có auto-pick FIFO** — FIFO chỉ sort display, user vẫn phải click từng batch. | Tốn thời gian cho lệnh xuất lớn | 🟢 Low (UX) |

## 4 task

### S1 — Refactor `handleConfirm` dùng service layer (3-4h, **làm trước**)

**Goal:** 1 path duy nhất cho confirm stock-out, loại bỏ duplication.

**Files liên quan:**
- [src/pages/wms/stock-out/StockOutCreatePage.tsx](../src/pages/wms/stock-out/StockOutCreatePage.tsx) — handleConfirm (~line 587-663) hiện chạy trực tiếp `supabase.from('stock_batches').update()`, `stock_levels`, `warehouse_locations`, `inventory_transactions`.
- [src/services/wms/stockOutService.ts](../src/services/wms/stockOutService.ts) — `create()` + `addMaterialRequest()` + `confirmStockOut()` đã có đầy đủ inventory logic.
- [src/services/wms/pickingService.ts](../src/services/wms/pickingService.ts) — picking flow thay thế cho flow hiện tại.

**Steps:**
1. Đọc kỹ `stockOutService.confirmStockOut` để verify nó đã handle đủ: batch depletion, stock_levels, warehouse_locations, inventory_transactions.
2. Refactor `StockOutCreatePage.handleSaveDraft`: thay direct insert bằng `stockOutService.create()` + `addMaterialRequest()` cho từng item.
3. Refactor `StockOutCreatePage.handleConfirm`: tương tự + cuối cùng gọi `stockOutService.confirmStockOut(id, userId)`.
4. Xóa inline `generateCode()` (dùng `stockOutService.generateCode` hoặc để service tự gọi).
5. Test: tạo draft, confirm direct, draft→confirm 2 step — so với trước khi sửa phải ra cùng inventory state.

**Risk:** Medium — service logic và page logic có thể khác nhau ở detail (VD: picking_status default). Phải verify trước khi refactor.

**Deliverable:** Duplication biến mất, tất cả stock-out creation đi qua 1 service entry point.

---

### S2 — Deal delivery sync cho stock-out sale (2-3h)

**Goal:** Khi xuất kho cho deal sale, auto-update `b2b_deals.delivered_kg` + `remaining_kg`.

**Files liên quan:**
- [src/services/b2b/dealWmsService.ts](../src/services/b2b/dealWmsService.ts) — đã có `updateDealStockInTotals` pattern, thêm `updateDealStockOutTotals`.
- [src/services/wms/stockOutService.ts](../src/services/wms/stockOutService.ts) — `confirmStockOut` sau khi commit inventory → call deal sync.
- [src/pages/wms/stock-out/StockOutCreatePage.tsx](../src/pages/wms/stock-out/StockOutCreatePage.tsx) — thêm field `deal_id` optional ở Step 1 (chỉ hiện khi `reason='sale'`).
- DB: kiểm tra `b2b_deals` có `delivered_kg` column chưa. Nếu chưa → migration (hoặc compute dynamic từ stock_out_orders.total_weight WHERE deal_id).

**Steps:**
1. Check schema `b2b_deals` xem có `delivered_kg` hay không. Nếu không, hoặc add column (migration) hoặc compute dynamic.
2. Thêm optional `deal_id` vào `StockOutFormData` + `stock_out_orders` (check column đã có chưa).
3. Add Deal selector ở StockOutCreatePage Step 1 khi `reason === 'sale'` (tương tự pattern StockInCreatePage khi `source='purchase'`).
4. `dealWmsService.updateDealStockOutTotals(dealId)` — sum stock_out_orders.total_weight WHERE deal_id + status='confirmed'.
5. Hook vào cuối `stockOutService.confirmStockOut` (non-blocking try/catch).
6. B2B deal detail page hiển thị `delivered_kg / quantity_kg` progress bar.

**Risk:** Medium — cần schema check. Deal type 'purchase' vs 'sale' có thể khác logic.

**Deliverable:** Deal sale tracking chính xác sau mỗi phiếu xuất.

---

### S3 — Weighbridge outbound auto-sync (2-3h)

**Goal:** Ngược với C1 (weighbridge IN → stock-in). Khi phiếu cân xe ra (outbound: cân lần 1 nặng → cân lần 2 rỗng → net = khối lượng đã xuất), auto-tạo stock-out confirmed link weighbridge_ticket.

**Files liên quan:**
- [apps/weighbridge/src/pages/WeighingPage.tsx](../apps/weighbridge/src/pages/WeighingPage.tsx) — hiện đã có auto-sync IN ở `handleComplete`, thêm branch cho outbound.
- [src/services/wms/stockOutService.ts](../src/services/wms/stockOutService.ts) — thêm `createFromWeighbridgeTicketOut(ticketId, warehouseId)` tương tự `createFromWeighbridgeTicket` bên stock-in.
- [src/pages/wms/stock-out/StockOutListPage.tsx](../src/pages/wms/stock-out/StockOutListPage.tsx) — badge ⚖ tương tự đã làm ở StockInListPage (parse notes pattern).

**Prerequisite:** Kiểm tra `weighbridge_tickets` có `ticket_type` phân biệt in/out không. Nếu có → filter. Nếu không → dùng `reference_type='stock_out'` hay field nào đó.

**Steps:**
1. Check schema `weighbridge_tickets.ticket_type` enum hoặc tương tự.
2. Service method mới: `stockOutService.createFromWeighbridgeTicketOut` — tương tự `createFromWeighbridgeTicket` IN:
   - Idempotency (check notes matching ticket code)
   - Pick default warehouse TP (raw? finished? tùy use case — với outbound thường là TP)
   - Tạo stock_out_order confirmed + stock_out_detail link batch đã pick
   - Inventory sync (giảm stock_levels, insert tx, depletion)
3. `WeighingPage.handleComplete`: detect outbound ticket type + flag `VITE_AUTO_WEIGHBRIDGE_OUT_SYNC='true'` (flag riêng, không dùng chung C1 flag để bật/tắt độc lập) → call service method.
4. StockOutListPage: dùng lại `extractWeighbridgeCode` helper + render badge ⚖ cyan cạnh source tag.

**Risk:** Medium-High — outbound flow khác inbound ở chỗ phải **biết batch nào xuất** (không như NVL inbound là batch mới). Cần quyết định: outbound chọn batch theo FIFO hay để user pick sau rồi auto-fill qty?

**Deliverable:** Cân xe ra → phiếu xuất tự động draft/confirmed (tùy risk tolerance).

**Lưu ý:** Có thể deploy với flag default OFF (y như C1) để test trước.

---

### S4 — Auto-pick FIFO button (1-2h, **làm cuối**)

**Goal:** Nút "Auto-fill FIFO" ở Step 2 của StockOutCreatePage — user nhập target quantity → hệ thống tự pick batch oldest-first đến khi đủ.

**Files liên quan:**
- [src/pages/wms/stock-out/StockOutCreatePage.tsx](../src/pages/wms/stock-out/StockOutCreatePage.tsx) — Step 2 batch picker modal thêm section "Auto-fill FIFO".

**Steps:**
1. Ở Step 2, thêm input "Số lượng cần xuất (kg)" + nút "Auto-fill FIFO".
2. Click nút → lặp qua `batchStocks` (đã sort FIFO), pick từng lô:
   - Nếu còn target > batch.quantity_remaining → add full batch, trừ target
   - Nếu còn target ≤ batch.quantity_remaining → add partial, target = 0, break
3. Push tất cả vào `outItems` một lần (setOutItems([...prev, ...newItems])).
4. Handle edge cases: target > tổng tồn kho → warning, pick max có thể.
5. Respect QC filter (chỉ pick batch passed).

**Risk:** Low — pure UI helper, không đụng service/DB.

**Deliverable:** 1 click thay vì 5-10 click cho lệnh xuất lớn.

---

## Effort & thứ tự đề xuất

| Task | Effort | Risk | Impact | Priority |
|---|---|---|---|---|
| **S1** Refactor duplication | 3-4h | Medium | **Data integrity** (cao nhất — chống bug tiềm ẩn) | 1 (làm trước) |
| **S2** Deal delivery sync | 2-3h | Medium | Cross-module visibility | 2 |
| **S3** Weighbridge outbound | 2-3h | Med-High | Giảm click nếu có cân xe ra | 3 (có flag safety) |
| **S4** Auto-pick FIFO | 1-2h | Low | UX win | 4 (làm cuối, quick polish) |

**Tổng:** ~8-12h (1.5-2 ngày làm việc).

## Đề xuất rollout

- **Sprint 1 (S1 only):** Fix duplication trước — zero functional change, pure refactor. Dễ revert. Baseline cho các task sau.
- **Sprint 2 (S2 + S4):** Deal sync + UX polish. S4 là win nhanh lấy momentum, S2 là chiến lược cross-module.
- **Sprint 3 (S3):** Weighbridge outbound sau cùng vì cần test thủ công nhiều + feature flag.

## Risks

| Risk | Mitigation |
|---|---|
| S1 refactor làm vỡ flow hiện tại | Test từng phiếu: draft → confirm + direct confirm. So sánh inventory state trước/sau bằng Supabase query. |
| S2 cần schema migration nếu `b2b_deals.delivered_kg` chưa có | Check trước. Nếu thiếu, ưu tiên compute dynamic (không migration) để tránh dependency. |
| S3 outbound schema khác inbound | Recon kỹ `weighbridge_tickets.ticket_type` và code flow IN trước khi implement. |
| Deploy giữa sprint breaking flow manual | Phase-gated deploy: merge S1 → test 1 sprint → S2/S4 → test → S3. |

## Deferred (không làm trong plan này)

- **Sales order → stock-out linking** — nếu SalesOrder tạo phiếu xuất tự động theo order items. Cần thiết kế từ business flow sales.
- **Container packing automation** — pack batches vào container sẵn sàng xuất khẩu.
- **Multi-warehouse pick** — 1 phiếu xuất pick từ nhiều kho (hiện chỉ 1 kho/phiếu).

Các mục này thuộc next-phase planning, cần business priority trước.
