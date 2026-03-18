# ROADMAP — Lộ Trình Triển Khai B2B Module

**Dự án:** Huy Anh Rubber ERP v8
**Cập nhật:** 18/03/2026
**Tổng quan:** Quy trình 6 giai đoạn từ Booking → Sản phẩm

---

## TIẾN ĐỘ TỔNG QUAN

### B2B Module

```
████████████████████████████████████████████░░░░░░  75%
Phase 1-4 ██████████████ DONE    Phase 5 ⚠️ PARTIAL    Phase 6 ░░░░ PLAN
```

| Phase | Tên | Status | Tiến độ |
|-------|-----|--------|---------|
| 1 | Tạo & Gửi Booking | ✅ DONE | 100% |
| 2 | Thương lượng & Xác nhận | ✅ DONE | 100% |
| 3 | Tạo Deal chính thức | ✅ DONE | 100% |
| 4 | Nhận mủ tại kho (Deal ↔ WMS) | ✅ DONE | 100% |
| 5 | Thanh toán & Quyết toán | ⚠️ PARTIAL | 60% |
| 6 | Sản xuất & Thành phẩm | 🔲 PLAN | 0% |

### WMS Module

```
████████████████████████████████████████████████████  100%
P1-P7 ████████ DONE    P8-P10 ████████ DONE    Redesign ████ DONE
```

| Phase | Tên | Status | Tiến độ |
|-------|-----|--------|---------|
| P1-P5 | Database, Danh mục, Nhập/Xuất kho, Tồn kho | ✅ DONE | 100% |
| P6 | QC Tracking & DRC | ✅ DONE | 100% |
| P7 | Trạm cân (Weighbridge) | ✅ DONE | 100% |
| P8 | Lệnh sản xuất & BOM | ✅ DONE | 100% |
| P9 | Phối trộn (Blending) | ✅ DONE | 100% |
| P10 | Báo cáo & Dashboard WMS | ✅ DONE | 100% |
| Redesign | UI → Ant Design + Rubber fields | ✅ DONE | 100% |

### App Cân Xe (Standalone)

```
████████████████████████████████████████████████████  100%
```

| Tính năng | Status |
|-----------|--------|
| Đăng nhập PIN (scale_operators) | ✅ |
| Tạo phiếu cân + liên kết Deal B2B | ✅ |
| Web Serial API (đầu cân Keli) | ✅ |
| Camera Dahua (3 cam qua proxy) | ✅ |
| Auto capture ảnh khi ghi cân | ✅ |
| In phiếu (A4/80mm/58mm) + QR Code | ✅ |
| Deploy: can.huyanhrubber.vn | ✅ |

### Vấn đề cần fix

| Issue | Mức độ | Mô tả |
|-------|--------|-------|
| Partner routes thiếu | ⚠️ CAO | Pages tồn tại nhưng chưa có route trong App.tsx |
| Partner menu thiếu | ⚠️ CAO | Sidebar không có menu "Đại lý" |
| Deal → Ledger auto | 🔶 TB | Chưa tự tạo bút toán khi Deal settled |
| Settlement approval | 🔶 TB | Chưa có luồng duyệt Draft→Pending→Approved→Paid |

**Trạng thái:** WMS + App Cân Xe HOÀN THÀNH — Quay lại B2B Phase 5

---

## PHASE 1 — TẠO & GỬI BOOKING ✅

**Hệ thống:** Portal + ERP Chat
**Status:** HOÀN THÀNH

| Task | File | Status |
|------|------|--------|
| BookingFormModal (2 chiều) | `src/components/b2b/BookingFormModal.tsx` | ✅ |
| BookingCard hiển thị trong chat | `src/components/chat/BookingCard.tsx` | ✅ |
| Gửi booking qua chat message | `src/services/b2b/chatMessageService.ts` | ✅ |
| Realtime push notification | Supabase Realtime subscription | ✅ |
| PRODUCT_TYPE_LABELS (5 loại mủ) | `chatMessageService.ts` | ✅ |

---

## PHASE 2 — THƯƠNG LƯỢNG & XÁC NHẬN ✅

**Hệ thống:** Portal + ERP Chat
**Status:** HOÀN THÀNH

| Task | File | Status |
|------|------|--------|
| Counter-offer (thương lượng giá) | NegotiateModal trong `B2BChatRoomPage.tsx` | ✅ |
| BookingCard actions (Xác nhận/Từ chối/Thương lượng) | `BookingCard.tsx` | ✅ |
| ConfirmDealModal (xác nhận + tạm ứng) | `src/components/b2b/ConfirmDealModal.tsx` | ✅ |
| DealCard hiển thị trong chat | `src/components/b2b/DealCard.tsx` | ✅ |
| dealConfirmService (6 bước) | `src/services/b2b/dealConfirmService.ts` | ✅ |
| Sync Portal spec | `docs/PHASE_3_SYNC_PORTAL.md` | ✅ |

---

## PHASE 3 — TẠO DEAL CHÍNH THỨC ✅

**Hệ thống:** B2B Deals
**Status:** HOÀN THÀNH

| Task | File | Status |
|------|------|--------|
| DealCard actions: "Ứng thêm" | `src/components/b2b/AddAdvanceModal.tsx` | ✅ |
| DealCard actions: "Giao hàng" | `src/components/b2b/RecordDeliveryModal.tsx` | ✅ |
| DealCard actions: "Chi tiết" | Navigate → `/b2b/deals/:id` | ✅ |
| dealChatActionsService | `src/services/b2b/dealChatActionsService.ts` | ✅ |
| Deal CRUD + status flow | `src/services/b2b/dealService.ts` | ✅ |
| DealListPage + DealCreatePage | `src/pages/b2b/deals/` | ✅ |
| DealDetailPage + StatusActions | `src/pages/b2b/deals/DealDetailPage.tsx` | ✅ |
| Shared types (ERP ↔ Portal) | `src/types/b2b.types.ts` | ✅ |

---

## PHASE 4 — NHẬN MỦ TẠI KHO (Deal ↔ WMS) ✅

**Hệ thống:** WMS Stock-In + Cân Xe + QC
**Status:** HOÀN THÀNH (17/03/2026)
**Spec:** `docs/PHASE_4_DEAL_WMS_SPEC.md`
**Migration:** `docs/migrations/phase4_deal_wms.sql`

### Database changes

```sql
-- stock_in_orders thêm deal_id
ALTER TABLE stock_in_orders ADD deal_id UUID REFERENCES b2b.deals(id);

-- b2b.deals thêm WMS fields
ALTER TABLE b2b.deals ADD actual_drc NUMERIC(5,2);
ALTER TABLE b2b.deals ADD actual_weight_kg NUMERIC(12,2);
ALTER TABLE b2b.deals ADD final_value NUMERIC(15,2);
ALTER TABLE b2b.deals ADD stock_in_count INTEGER DEFAULT 0;
ALTER TABLE b2b.deals ADD qc_status VARCHAR(20) DEFAULT 'pending';

-- VIEW b2b_deals cập nhật expose WMS fields
CREATE OR REPLACE VIEW public.b2b_deals AS SELECT ..., actual_drc, actual_weight_kg, final_value, stock_in_count, qc_status FROM b2b.deals;
```

### Sub-phases (tất cả ✅)

| Sub | Tên | Files sửa/tạo | Status |
|-----|-----|---------------|--------|
| 4.1 | Database + Bridge Service | `dealWmsService.ts` (TẠO), `dealService.ts` (SỬA), `wms.types.ts` (SỬA) | ✅ |
| 4.2 | Stock-In ↔ Deal | `stockInService.ts`, `StockInCreatePage.tsx`, `StockInListPage.tsx`, `StockInDetailPage.tsx` | ✅ |
| 4.3 | Weighbridge ↔ Deal | `WeighbridgeListPage.tsx` (filter Deal) | ✅ |
| 4.4 | QC → Deal DRC | `QCRecheckPage.tsx` (trigger updateDealActualDrc) | ✅ |
| 4.5 | DealDetailPage Tabs | `DealWmsTab.tsx`, `DealQcTab.tsx`, `DealAdvancesTab.tsx` (TẠO), `DealDetailPage.tsx` (SỬA) | ✅ |
| 4.6 | Chat notification | `notifyDealChatStockIn()`, `notifyDealChatQcUpdate()` trong dealWmsService | ✅ |

### Luồng dữ liệu sau Phase 4

```
Deal (expected_drc, quantity_kg, unit_price)
  ↓ deal_id
Stock-In Order (deal_id, warehouse_id)
  ↓ confirm → updateDealStockInTotals + notifyDealChatStockIn
Stock-In Details → Stock Batches (initial_drc, latest_drc, qc_status)
  ↓ QC Recheck
batch_qc_results (drc_value)
  ↓ updateDealActualDrc + notifyDealChatQcUpdate
Deal (actual_drc, actual_weight_kg, final_value, qc_status)
```

---

## PHASE 5 — THANH TOÁN & QUYẾT TOÁN ⚠️ 60%

**Hệ thống:** B2B Ledger + Settlements
**Status:** CÓ SẴN CRUD, CHƯA LIÊN KẾT DEAL AUTO

### Đã có ✅

| Task | File | Status |
|------|------|--------|
| Advance service (CRUD) | `src/services/b2b/advanceService.ts` | ✅ |
| Ledger service (sổ công nợ) | `src/services/b2b/ledgerService.ts` | ✅ |
| Settlement service (quyết toán) | `src/services/b2b/settlementService.ts` | ✅ |
| Settlement pages (list/create/detail) | `src/pages/b2b/settlements/` | ✅ |
| Ledger pages (overview/partner) | `src/pages/b2b/ledger/` | ✅ |
| Ledger report page | `src/pages/b2b/reports/LedgerReportPage.tsx` | ✅ |
| Ứng thêm từ chat | `AddAdvanceModal.tsx` + service | ✅ |
| Pickup locations settings | `PickupLocationSettingsPage.tsx` | ✅ |

### Chưa có 🔲 (cần khi quay lại B2B)

| Task | Mô tả | Phụ thuộc |
|------|-------|-----------|
| Auto-settlement từ Deal | Gom stock-in confirmations → tạo Settlement tự động | Phase 4 ✅ |
| So sánh expected vs actual DRC | Tính chênh lệch giá trị do DRC thực ≠ DRC dự kiến | Phase 4 ✅ |
| Tính giá trị thực (final_value) | `actual_weight × (actual_drc/100) × unit_price` | Phase 4 ✅ |
| Settlement approval workflow | Luồng duyệt: Draft → Pending → Approved → Paid | - |
| Thông báo Portal | Đại lý thấy quyết toán trên Partner Portal | Phase 3 Portal ✅ |

---

## PHASE 6 — SẢN XUẤT & THÀNH PHẨM 🔶 SẴN SÀNG

**Hệ thống:** Production + WMS (đã có P8-P10)
**Status:** WMS SẴN SÀNG — cần liên kết Deal → Production

### WMS đã có ✅ (chỉ cần liên kết B2B)

| Task | Mô tả | Phụ thuộc | Status |
|------|-------|-----------|--------|
| Production Order model | Lệnh sản xuất từ NVL | WMS P8 ✅ | ✅ SẴN SÀNG |
| Production tracking (5 công đoạn) | Rửa→Cán→Sấy→Ép→QC | WMS P8 ✅ | ✅ SẴN SÀNG |
| QC thành phẩm | Kiểm tra SVR grade (3L/5/10/20) | WMS P6 ✅ | ✅ SẴN SÀNG |
| Blending | Phối trộn lô, DRC adjustment | WMS P9 ✅ | ✅ SẴN SÀNG |

### Cần xây dựng (liên kết B2B → Production)

| Task | Mô tả | Ước tính |
|------|-------|----------|
| Deal → Production Order | Tạo lệnh SX từ Deal (chọn NVL đã nhập kho) | 1 ngày |
| Truy xuất nguồn gốc | Deal → Stock-In NL → Production → Stock-In TP | 1 ngày |
| Dashboard tích hợp | DealDetail → tab Sản xuất (tiến độ, yield) | 0.5 ngày |

---

## SƠ ĐỒ PHỤ THUỘC

```
Phase 1 (Booking)
    ↓
Phase 2 (Thương lượng)
    ↓
Phase 3 (Tạo Deal)
    ↓
Phase 4 (Nhận mủ ↔ WMS)  ✅ DONE
    ↓           ↓
Phase 5       Phase 6
(Quyết toán)  (Sản xuất)
  ⚠️ 60%       🔲 0%
    ↑               ↑
    └── WMS P8 ─────┘  (Production Orders)
    └── WMS P9 ─────┘  (Blending)
```

---

## FILES TOÀN BỘ B2B MODULE

### Components (`src/components/b2b/`) — 16 files

| File | Phase | Mô tả |
|------|-------|-------|
| `BookingFormModal.tsx` | 1 | Form tạo phiếu chốt mủ |
| `ConfirmDealModal.tsx` | 2 | Modal xác nhận Deal + tạm ứng |
| `DealCard.tsx` | 2 | Card Deal trong chat |
| `AddAdvanceModal.tsx` | 3 | Modal ứng thêm tiền |
| `RecordDeliveryModal.tsx` | 3 | Modal ghi nhận giao hàng |
| `DealWmsTab.tsx` | 4.5 | Tab nhập kho trong DealDetail |
| `DealQcTab.tsx` | 4.5 | Tab QC trong DealDetail |
| `DealAdvancesTab.tsx` | 4.5 | Tab tạm ứng trong DealDetail |
| `ChatMessageBubble.tsx` | 1 | Chat message styling |
| `ChatInput.tsx` | 1 | Chat input + attachment |
| `ChatRoomHeader.tsx` | 1 | Room header |
| `ChatRoomCard.tsx` | 1 | Room preview card |
| `ChatAttachmentUpload.tsx` | 1 | File upload UI |
| `ChatAttachmentMenu.tsx` | 1 | Attachment options |
| `EmojiPickerPopover.tsx` | 1 | Emoji selector |
| `VoiceRecorder.tsx` | 1 | Voice recording |

### Services (`src/services/b2b/`) — 9 files

| File | Phase | Mô tả |
|------|-------|-------|
| `chatMessageService.ts` | 1 | Chat + Booking + message types |
| `dealConfirmService.ts` | 2 | Confirm deal 6-step flow |
| `dealChatActionsService.ts` | 3 | Add advance + record delivery từ chat |
| `dealService.ts` | 3 | Deal CRUD + status transitions |
| `advanceService.ts` | 3/5 | Tạm ứng CRUD |
| `ledgerService.ts` | 5 | Sổ công nợ |
| `settlementService.ts` | 5 | Quyết toán |
| `paymentService.ts` | 5 | Payment recording |
| `dealWmsService.ts` | 4 | Bridge Deal ↔ WMS (9 methods) |

### Pages (`src/pages/b2b/`) — 13 files

| File | Phase | Route |
|------|-------|-------|
| `B2BDashboardPage.tsx` | 3 | `/b2b` |
| `B2BChatListPage.tsx` | 1 | `/b2b/chat` |
| `B2BChatRoomPage.tsx` | 1-3 | `/b2b/chat/:roomId` |
| `NotificationPage.tsx` | 3 | `/notifications` |
| `PickupLocationSettingsPage.tsx` | 3 | `/b2b/pickup-locations` |
| `deals/DealListPage.tsx` | 3 | `/b2b/deals` |
| `deals/DealCreatePage.tsx` | 3 | `/b2b/deals/new` |
| `deals/DealDetailPage.tsx` | 3+4.5 | `/b2b/deals/:id` |
| `ledger/LedgerOverviewPage.tsx` | 5 | `/b2b/ledger` |
| `ledger/PartnerLedgerPage.tsx` | 5 | `/b2b/ledger/:partnerId` |
| `settlements/SettlementListPage.tsx` | 5 | `/b2b/settlements` |
| `settlements/SettlementCreatePage.tsx` | 5 | `/b2b/settlements/new` |
| `settlements/SettlementDetailPage.tsx` | 5 | `/b2b/settlements/:id` |
| `reports/LedgerReportPage.tsx` | 5 | `/b2b/reports` |

### Types & Docs

| File | Mô tả |
|------|-------|
| `src/types/b2b.types.ts` | Tất cả interfaces B2B (Partner, ChatRoom, ChatMessage, Deal, Booking...) |
| `docs/ROADMAP.md` | File này |
| `docs/CONFIRM_DEAL_MODAL_SPEC.md` | Spec Phase 1-2 |
| `docs/PHASE_3_SYNC_PORTAL.md` | Spec đồng bộ Portal |
| `docs/PHASE_4_DEAL_WMS_SPEC.md` | Spec Phase 4 (chi tiết) |
| `docs/migrations/phase4_deal_wms.sql` | SQL migration Phase 4 |

### WMS files bị sửa bởi B2B Phase 4

| File | Thay đổi |
|------|----------|
| `src/services/wms/wms.types.ts` | Thêm `deal_id` vào StockInOrder, StockInFormData |
| `src/services/wms/stockInService.ts` | Thêm `deal_id` vào create + trigger dealWmsService sau confirm |
| `src/pages/wms/stock-in/StockInCreatePage.tsx` | Dropdown chọn Deal khi source_type='purchase' |
| `src/pages/wms/stock-in/StockInListPage.tsx` | Tag Deal trong danh sách |
| `src/pages/wms/stock-in/StockInDetailPage.tsx` | Card deal info |
| `src/pages/wms/weighbridge/WeighbridgeListPage.tsx` | Filter Deal |
| `src/pages/wms/qc/QCRecheckPage.tsx` | Trigger updateDealActualDrc sau QC |

---

## BƯỚC TIẾP THEO

### Ưu tiên 1: Fix vấn đề hiện tại (1-2 giờ)
1. Thêm Partner routes vào `App.tsx` (`/b2b/partners`, `/b2b/partners/:id`)
2. Thêm menu "Đại lý" vào Sidebar

### Ưu tiên 2: Phase 5 — Quyết toán (2-3 ngày)
1. Auto-settlement khi Deal settled (gom stock-in → tạo Settlement)
2. DRC variance: so sánh expected vs actual → tính chênh lệch giá trị
3. Settlement approval workflow (Draft → Pending → Approved → Paid)
4. Portal notification cho đại lý

### Ưu tiên 3: Phase 6 — Liên kết Sản xuất (2-3 ngày)
1. Deal → Production Order (chọn NVL từ stock-in của deal)
2. Truy xuất nguồn gốc end-to-end
3. DealDetail → tab Sản xuất

### Tùy chọn: Cải thiện UX
- PDF export cho Deals, Settlements
- Mobile responsive cho B2B pages
- Real-time notification cho Portal

---

*Huy Anh Rubber ERP v8 — B2B Module Roadmap*
*Cập nhật: 18/03/2026*
*WMS P1-P10 + App Cân Xe: HOÀN THÀNH*
*B2B Phase 1-4: HOÀN THÀNH | Phase 5: 60% | Phase 6: SẴN SÀNG*
