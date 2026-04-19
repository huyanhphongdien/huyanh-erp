# B2B — Hướng dẫn các chức năng mới (commit a530fee9 → 932a4dcb)

Tài liệu này gộp toàn bộ thay đổi B2B Deal flow từ 5 commit gần nhất vào một bản hướng dẫn text thuần, không diagram. Dùng cho: (a) tester kiểm thử tay, (b) nhân viên nhà máy thao tác hằng ngày, (c) developer hiểu bối cảnh trước khi sửa.

---

## 0. Trước khi bắt đầu — các migration phải chạy thủ công

Chạy tuần tự trên Supabase SQL editor (project `dygveetaatqllhjusyzz`):

1. `docs/migrations/b2b_partner_ack_and_disputes.sql`
   → Thêm cột `partner_ack_at` vào `b2b.deals`, tạo bảng `b2b.drc_disputes`, RPC `partner_acknowledge_advance`, `partner_raise_drc_dispute`, `factory_resolve_drc_dispute`, RLS + view.
2. `docs/migrations/b2b_deals_realtime.sql`
   → `REPLICA IDENTITY FULL` + `ALTER PUBLICATION supabase_realtime ADD TABLE` cho `b2b.deals` và `b2b.drc_disputes`.
3. `docs/migrations/b2b_ledger_running_balance_trigger.sql`
   → Trigger `BEFORE INSERT` auto-compute `running_balance`, kèm backfill entries cũ.
4. `docs/migrations/b2b_rls_partner_scope.sql`
5. `docs/migrations/b2b_drop_permissive_legacy_policies.sql`
6. `docs/migrations/b2b_fix_partner_users_recursion.sql`
7. `docs/migrations/b2b_views_security_invoker.sql`

> **Lưu ý parser Supabase Studio:** các function `partner_*` đã rewrite bỏ `SELECT INTO` và `RECORD` (dùng scalar subquery `var := (SELECT ...)`). Nếu sau này thêm function mới, tránh `SELECT col INTO var` và tránh `DECLARE v RECORD` — Studio parser sẽ báo 42P01.

---

## 1. Deal — điều kiện duyệt (acceptDeal validate)

**Vấn đề cũ:** Bất kỳ user nào cũng bấm được "Duyệt" dù Deal chưa nhập kho hoặc chưa QC → ledger sai, quyết toán sai.

**Giờ:** [DealDetailPage](../src/pages/b2b/deals/DealDetailPage.tsx) disable nút "Duyệt Deal" + tooltip liệt kê đúng những gì còn thiếu. Backend [dealService.acceptDeal](../src/services/b2b/dealService.ts) throw error nếu thiếu bất kỳ điều kiện nào:

- `status = 'processing'`
- `stock_in_count > 0` (đã có ít nhất 1 phiếu nhập kho)
- `actual_weight_kg > 0`
- `actual_drc > 0`
- `qc_status` khác `'failed'` và khác `'pending'`

**Cách test:**
1. Vào 1 Deal status `pending` → bấm "Bắt đầu xử lý" → status thành `processing`.
2. Chưa cân hàng → hover nút "Duyệt" → tooltip ghi "Chưa có phiếu nhập kho / actual_weight_kg = 0".
3. Cân 1 phiếu → tooltip cập nhật còn thiếu QC.
4. QC xong → tooltip biến mất, nút "Duyệt" active.

Helper cho UI: `dealService.checkAcceptConditions(dealId)` trả về `{ canAccept, missing: string[] }`.

---

## 2. QC → Deal tự sync DRC (không còn manual)

**Vấn đề cũ:** QC nhập DRC thực tế xong, phải vào Deal gõ lại `actual_drc` bằng tay.

**Giờ:** [qcService.addInitialQC](../src/services/wms/qcService.ts) và `addRecheckResult` tự động:
- Tìm Deal qua chuỗi `batch → stock_in → deal_id`.
- Gọi [dealWmsService.updateDealActualDrc](../src/services/b2b/dealWmsService.ts) → tính weighted-average DRC dựa trên trọng lượng từng batch.
- Gửi chat notification "QC hoàn tất" vào room của Deal.

**Cách test:**
1. Nhập kho 2 phiếu (2 batch) cho cùng Deal, KL: 10000kg và 5000kg.
2. QC batch 1: DRC = 30%. QC batch 2: DRC = 36%.
3. Quay lại DealDetailPage → `actual_drc` = (10000×30 + 5000×36) / 15000 = **32%**.
4. Tab Chat có 2 tin nhắn "QC hoàn tất — batch X, DRC Y%".

---

## 3. Trạng thái Deal — bảo vệ transition

Các RPC service giờ không cho phép transition sai:

| Action | Yêu cầu status | Sau khi thực hiện |
|---|---|---|
| `startProcessing` | `pending` | `processing` |
| `acceptDeal` | `processing` + 5 điều kiện ở §1 | `accepted` |
| `settleDeal` | `accepted` | `settled` |
| `cancelDeal` | bất kỳ ≠ `settled` | `cancelled` |

Enum `DealStatus` đã thống nhất giữa [b2b.types.ts](../src/types/b2b.types.ts) và dealService: `'pending' | 'processing' | 'accepted' | 'settled' | 'cancelled'`. Enum cũ (`draft`/`active`/`completed`) đã xóa — nếu còn chỗ nào reference, TS sẽ báo lỗi compile.

---

## 4. Quyền theo vai trò (admin/manager vs employee)

DealDetailPage check `user.role`:

- **Duyệt Deal**: chỉ `admin` hoặc `manager`.
- **Quyết toán (Settlement)**: chỉ `admin` hoặc `manager`.
- Employee thường → nút disabled + tooltip "Chỉ quản lý mới được duyệt/quyết toán".

**Cách test:** login bằng account role `employee` (vd. HA-0007 Lê Thành Nhân) → mở Deal đủ điều kiện → nút vẫn disabled. Đổi sang role `manager` → nút active.

---

## 5. Ledger — running_balance tự động

**Vấn đề cũ:** Code tự tính `running_balance` ở nhiều chỗ → dễ double-count (ứng tiền ghi ledger 2 lần qua `dealConfirmService` + `advanceService.markPaid`).

**Giờ:**
- DB trigger `BEFORE INSERT` trên `b2b.partner_ledger` tự compute `running_balance = previous + amount_delta`.
- Code **chỉ có 1 nơi ghi ledger cho advance**: `advanceService.markPaid()`. `dealConfirmService` giờ tạo advance `status='approved'` rồi gọi `markPaid` — không còn INSERT trực tiếp.
- Migration có script backfill recompute toàn bộ entries cũ (chạy 1 lần).

**Cách test:** tạo 1 Deal có advance 10tr → chốt Deal → vào Ledger partner thấy **đúng 1 dòng** `-10,000,000`, `running_balance` đúng.

---

## 6. DealCard — progress bar 5 mốc + realtime

Component [DealCard](../src/components/b2b/DealCard.tsx) hiển thị trong chat room và list, self-updates không cần F5:

**5 mốc:** Chốt → Nhập kho → QC → Duyệt → Quyết toán. Progress bar fill theo mốc đã xong, background gradient đổi theo status (`pending`=xám, `processing`=xanh dương, `accepted`=xanh lá, `settled`=vàng, `cancelled`=đỏ).

**Live update:** khi nhà máy cân / QC / ra phiếu quyết toán, `patchDealCardMetadata` broadcast qua `b2b.chat_messages` → DealCard ở partner side tự refresh.

**Partner-side:** nút **"Đã nhận"** hiện khi có `advance_paid_at` nhưng `partner_ack_at IS NULL`. Partner bấm → gọi RPC `partner_acknowledge_advance` → flag clear, nút biến mất hai phía.

Tách `DealStatus` / `DEAL_STATUS_LABELS` / `COLORS` / `GRADIENT` sang [b2b.constants.ts](../src/types/b2b.constants.ts) để copy component sang repo `huyanh-b2b-portal` không cần kéo theo supabase layer — xem chi tiết trong [B2B_12_PARTNER_SIDE_INTEGRATION.md](B2B_12_PARTNER_SIDE_INTEGRATION.md).

---

## 7. Khiếu nại DRC (DRC Dispute)

**Khi nào dùng:** Partner thấy `|actual_drc - expected_drc| > 3%` → nghi ngờ nhà máy đo sai.

**Luồng:**
1. Partner mở DealCard → nút "Khiếu nại DRC" (chỉ hiện khi Deal đã `accepted` hoặc `settled` và chênh >3%).
2. [RaiseDisputeModal](../src/components/b2b/RaiseDisputeModal.tsx) — partner nhập `claimed_drc` + `reason` → gọi RPC `partner_raise_drc_dispute` → INSERT vào `b2b.drc_disputes`.
3. Factory thấy toast "Khiếu nại DRC mới" ở mọi trang ERP (xem §8). Menu sidebar có item **"Khiếu nại DRC"** dẫn tới [DisputeListPage](../src/pages/b2b/disputes/DisputeListPage.tsx).
4. Factory mở [DisputeDetailDrawer](../src/components/b2b/DisputeDetailDrawer.tsx) → xem batch gốc, QC history → chọn:
   - **Xác nhận partner đúng** → gọi `factory_resolve_drc_dispute` với `resolved_drc = claimed_drc` → ledger tự điều chỉnh delta.
   - **Giữ DRC cũ** → resolve với lý do, không điều chỉnh.
   - **Thương lượng** → resolve với DRC thứ 3.
5. Partner nhận toast kết quả resolve.

Route: `/b2b/disputes` (factory), đã thêm vào [App.tsx](../src/App.tsx) và sidebar.

---

## 8. Global toast cho Deal events

Hook [useB2BDealToasts](../src/hooks/useB2BDealToasts.ts) subscribe 2 realtime channel ở [MainLayout](../src/components/common/MainLayout.tsx):
- `b2b.deals UPDATE` → toast khi status đổi (accepted, settled, cancelled).
- `b2b.drc_disputes INSERT` → toast "Khiếu nại mới từ {partner}".

**Hệ quả:** factory user đang ở bất kỳ trang nào (Kho, Lương, Sản xuất…) cũng nhận được notification Deal mà không cần mở tab B2B Chat. Click toast → navigate tới Deal/Dispute tương ứng.

---

## 9. Checklist test end-to-end (15 phút)

1. [ ] Chạy đủ 7 migration ở §0 trên Supabase.
2. [ ] Tạo Booking → convert Deal (status `pending`).
3. [ ] Bấm "Bắt đầu xử lý" → `processing`.
4. [ ] Hover "Duyệt" → tooltip liệt kê đủ 5 điều kiện thiếu.
5. [ ] Cân 2 phiếu nhập kho (chia 2 batch) → stock_in count = 2.
6. [ ] QC 2 batch với DRC khác nhau → mở Deal thấy `actual_drc` = weighted avg.
7. [ ] Login admin → bấm "Duyệt" → status `accepted` + ledger có 1 dòng advance duy nhất.
8. [ ] Partner mở portal → DealCard có nút "Đã nhận" → bấm → flag clear realtime cả 2 phía.
9. [ ] Partner bấm "Khiếu nại DRC" với `claimed_drc` lệch >3% → factory nhận toast ở trang Kho (không cần mở B2B).
10. [ ] Factory resolve dispute "xác nhận partner đúng" → ledger tự điều chỉnh delta.
11. [ ] Login employee (không phải manager) → không duyệt/quyết toán được → tooltip đúng.
12. [ ] Quyết toán (settleDeal) → status `settled`, cancel bị chặn.

---

## 10. Files tham chiếu nhanh

**Services:**
- [dealService.ts](../src/services/b2b/dealService.ts) — validate + transition
- [dealConfirmService.ts](../src/services/b2b/dealConfirmService.ts) — chốt Deal, tạo advance
- [advanceService.ts](../src/services/b2b/advanceService.ts) — markPaid (nơi duy nhất ghi ledger advance)
- [dealWmsService.ts](../src/services/b2b/dealWmsService.ts) — sync DRC từ QC
- [dealChatActionsService.ts](../src/services/b2b/dealChatActionsService.ts) — patch DealCard metadata
- [drcDisputeService.ts](../src/services/b2b/drcDisputeService.ts) — CRUD disputes
- [qcService.ts](../src/services/wms/qcService.ts) — hook QC → Deal

**UI:**
- [DealCard.tsx](../src/components/b2b/DealCard.tsx)
- [RaiseDisputeModal.tsx](../src/components/b2b/RaiseDisputeModal.tsx)
- [DisputeDetailDrawer.tsx](../src/components/b2b/DisputeDetailDrawer.tsx)
- [DisputeListPage.tsx](../src/pages/b2b/disputes/DisputeListPage.tsx)
- [DealDetailPage.tsx](../src/pages/b2b/deals/DealDetailPage.tsx)

**Hooks / constants:**
- [useB2BDealToasts.ts](../src/hooks/useB2BDealToasts.ts)
- [b2b.constants.ts](../src/types/b2b.constants.ts) — portable sang partner portal

**Docs liên quan:**
- [B2B_11_LUONG_SAU_CHOT_DEAL.md](B2B_11_LUONG_SAU_CHOT_DEAL.md) — spec luồng hai phía
- [B2B_12_PARTNER_SIDE_INTEGRATION.md](B2B_12_PARTNER_SIDE_INTEGRATION.md) — copy component sang portal
