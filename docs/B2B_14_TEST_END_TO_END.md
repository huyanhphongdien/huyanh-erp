# B2B — Hướng dẫn test end-to-end (Phiếu chốt mủ → Quyết toán)

> **Ngày cập nhật:** 2026-04-19 (sau khi debug bug DealCard silent insert)
> **Phạm vi:** Test từ lúc đại lý tạo Phiếu chốt mủ đến lúc Deal được quyết toán xong, gồm cả nhánh Khiếu nại DRC.

---

## 🗺️ Luồng tổng quan

```
┌────────────────── ĐẠI LÝ (Portal) ──────────────────┐     ┌──────────────── NHÀ MÁY (ERP) ────────────────┐
│                                                      │     │                                                 │
│  1. Tạo Phiếu chốt mủ (Booking)  ──── gửi qua chat ───────▶│  2. Xác nhận & Chốt Deal                        │
│     (loại mủ, KL, DRC, đơn giá)                      │     │     (tạo Deal + Advance nếu có)                 │
│                                                      │     │                                                 │
│  3. Bấm "Đã nhận" (ack advance)  ◀──── realtime ─────┼─────│     DealCard xuất hiện 2 phía                   │
│     flag clear 2 phía                                │     │                                                 │
│                                                      │     │  4. Cân nhập kho (IN, nhiều batch)              │
│                                DealCard self-update ◀┼─────│     actual_weight_kg tăng, mốc 2 sáng           │
│                                                      │     │                                                 │
│                                DealCard self-update ◀┼─────│  5. QC từng batch                                │
│                                                      │     │     actual_drc = weighted avg, mốc 3 sáng       │
│                                                      │     │                                                 │
│                                                      │     │  6. Duyệt Deal (admin/manager)                  │
│  Toast "Đã được duyệt" ◀────── b2b.deals UPDATE ─────┼─────│     status = accepted, mốc 4 sáng               │
│                                                      │     │                                                 │
│                                                      │     │  7. Tạo phiếu Quyết toán                        │
│  Toast "Đã quyết toán" ◀────── b2b.deals UPDATE ─────┼─────│     status = settled, mốc 5 sáng                │
│                                                      │     │                                                 │
│  8. Xem phiếu quyết toán                             │     │                                                 │
│     /partner/settlements/:id                         │     │                                                 │
│                                                      │     │                                                 │
│─────────────────────── NHÁNH KHIẾU NẠI DRC (khi |actual - expected| > 3%) ────────────────────────────────────│
│                                                      │     │                                                 │
│  N1. Bấm "Khiếu nại DRC"                             │     │                                                 │
│      → RaiseDisputeModal (lý do + ảnh)               │     │                                                 │
│      → RPC partner_raise_drc_dispute ────────────────┼─────▶│  Toast "Khiếu nại mới từ {partner}"            │
│                                                      │     │                                                 │
│                                                      │     │  N2. Mở /b2b/disputes → Resolve                 │
│                                                      │     │      (accept/reject + adjustment)               │
│  Toast kết quả + ledger adjustment ◀─── UPDATE ──────┼─────│                                                 │
│                                                      │     │                                                 │
└──────────────────────────────────────────────────────┘     └─────────────────────────────────────────────────┘
```

---

## ⚙️ PRE-REQUISITE — các migration phải chạy TRƯỚC khi test (rất quan trọng)

Thiếu 1 trong các migration này → Deal sẽ tạo **nhưng không có DealCard trong chat** (silent fail). Chạy lần lượt trên Supabase SQL editor:

| # | File | Tác dụng |
|---|---|---|
| 1 | `b2b_chat_realtime_publication.sql` | REPLICA IDENTITY FULL + ADD PUBLICATION cho chat_messages |
| 2 | `b2b_deals_realtime.sql` | Realtime broadcast cho `b2b.deals` UPDATE |
| 3 | `b2b_partner_ack_and_disputes.sql` | Cột partner_ack_at + table drc_disputes + RPC partner_* |
| 4 | `b2b_ledger_running_balance_trigger.sql` | Trigger auto compute running_balance |
| 5 | `b2b_rls_partner_scope.sql` | RLS partner chỉ thấy deal/advance/dispute của mình |
| 6 | `b2b_drop_permissive_legacy_policies.sql` | Cleanup policy cũ |
| 7 | `b2b_fix_partner_users_recursion.sql` | Fix infinite recursion trên partner_users |
| 8 | `b2b_views_security_invoker.sql` | SECURITY INVOKER cho views |
| 9 | **`b2b_fix_message_type_check.sql`** ⚠️ | **Thêm `'deal'` vào CHECK constraint message_type** — nếu thiếu thì DealCard không insert được (bug đã debug 2026-04-19) |

Sau khi chạy xong, verify bằng query:
```sql
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conname = 'chat_messages_message_type_check';
-- Phải thấy 'deal' trong CHECK (message_type IN (...))
```

## 🔁 Reset data nếu muốn test lại từ đầu

Chạy `docs/migrations/b2b_reset_chat_history.sql` — xóa sạch chat/deal/advance/dispute/booking, có backup schema + rollback query.

---

## 0. Chuẩn bị 2 tab trình duyệt

| Vai trò | URL | Account |
|---|---|---|
| **ERP (nhà máy)** | `https://huyanhrubber.vn` | admin hoặc manager của Huy Anh |
| **Portal (đại lý)** | `https://b2b.huyanhrubber.vn` | account partner (đại lý đang test) |

Mở 2 tab song song, pin chúng lại để xem realtime cross-side.

### ✅ Smoke test nhanh (2 phút) — verify env đã ready

Trước khi bắt đầu luồng đầy đủ:
1. Login portal → chat room với nhà máy → gõ `test` → enter
2. ERP phải thấy tin nhắn `test` **realtime** (< 2s, không F5) → ✅ realtime OK
3. ERP reply `ok` → portal nhận ngay → ✅ 2 chiều OK
4. Nếu sai → check migration #1 (chat realtime publication) chưa chạy

---

## BƯỚC 1 — Đại lý tạo Phiếu chốt mủ (Booking)

### 📱 Phía Đại lý
1. Login portal → vào menu **"Phiếu chốt mủ"** (hoặc `/partner/bookings`).
2. Bấm **"Tạo phiếu chốt"**.
3. Nhập:
   - **Loại mủ**: chọn 1 trong 5 loại (ví dụ: `Mủ nước`).
   - **Số lượng**: vd `10000` kg (= 10 tấn).
   - **DRC dự kiến**: vd `30%`.
   - **Đơn giá**: vd `12000` đ/kg.
   - **Đơn vị giá**: `Ướt` (tính trên mủ ướt) hoặc `Khô` (tính trên quy khô).
   - **Địa điểm lấy hàng**, **Lô**, **Vùng mủ**, **Ngày giao dự kiến**.
4. Bấm **"Gửi phiếu chốt"**.

### ✅ Kỳ vọng
- Ở portal: xuất hiện tin nhắn BookingCard trong chat room với nhà máy, status `Chờ xác nhận`.
- Ở ERP: tab chat **ngay lập tức** nhảy badge đỏ, mở room → thấy BookingCard mới từ đại lý (không cần F5).

---

## BƯỚC 2 — Nhà máy chốt Deal từ Booking

### 🏭 Phía ERP
1. Vào **Chat B2B** → mở room với đại lý.
2. Tìm BookingCard vừa nhận → bấm **"Xác nhận & Chốt Deal"**.
3. Modal ConfirmDeal mở:
   - Xem lại giá/lượng/DRC.
   - Nhập **Số tiền ứng** (vd `50,000,000` VNĐ) — optional.
   - **Phương thức thanh toán ứng**: `Tiền mặt` / `Chuyển khoản`.
   - **Người nhận tiền ứng** + **SĐT** nếu ứng mặt.
4. Bấm **"Xác nhận Deal"**.

### ✅ Kỳ vọng
- BookingCard co lại (giảm trùng lặp UI).
- DealCard mới xuất hiện dưới BookingCard với:
  - Status badge **"Đang xử lý"** (gradient xanh dương).
  - Progress bar 5 mốc — mốc 1 (Chốt) đã fill trắng.
  - Tài chính: `Đã tạm ứng: 50,000,000 VNĐ`, `Còn lại: 70,000,000 VNĐ` (120M ước tính - 50M ứng).
- Portal đại lý: DealCard hiện tương tự (không cần F5) với nút **"Đã nhận"** nhấp nháy (pending_ack_advance).
- Nếu Portal có toast notification permission → popup "Deal HA-XXX đã chốt".

---

## BƯỚC 3 — Đại lý xác nhận đã nhận ứng

### 📱 Phía Đại lý
1. Trong chat room, DealCard có ô xanh "Nhà máy đã chi 50,000,000 VNĐ (TU26...)" với nút **"Đã nhận"**.
2. Bấm **"Đã nhận"**.

### ✅ Kỳ vọng
- Toast success "Đã xác nhận đã nhận tạm ứng".
- Ô "Đã nhận" biến mất ở cả 2 phía (ERP + Portal) trong < 1s.
- DB: `b2b.advances.partner_ack_at` được set, `b2b.deals` không đổi.

---

## BƯỚC 4 — Đại lý giao hàng + Nhà máy cân

### 📱 Phía Đại lý (optional — báo đã giao)
1. DealCard → bấm **"Báo đã giao"**.
2. Điền KL thực giao, DRC tại điểm giao, biển số xe, tài xế.
3. Gửi.

**Kỳ vọng:** chat xuất hiện message system "📦 Ghi nhận giao hàng" ở cả 2 phía.

### 🏭 Phía ERP — Cân nhập kho
1. Vào **Cân điện tử** (Weighbridge) hoặc **Nhập kho** → tạo phiếu cân IN.
2. Chọn **Đối tác** = đại lý đang test, **Deal** = Deal vừa chốt.
3. Hoàn tất cân → phiếu IN tạo batch trong `stock_batches`.

**Có thể cân nhiều lần** (chia nhiều batch) cho cùng Deal. Vd: batch 1 = 6000kg, batch 2 = 4000kg.

### ✅ Kỳ vọng sau mỗi lần cân
- DealCard tự update (realtime):
  - Ô "Đã nhập": `6.00 / 10 T` (sau batch 1), `10.00 / 10 T` (sau batch 2).
  - `stock_in_count` tăng → mốc 2 (Nhập kho) progress bar fill trắng.
- Chat room có message system "Nhập kho batch X".

---

## BƯỚC 5 — Nhà máy QC từng batch

### 🏭 Phía ERP
1. Vào **WMS → QC** (hoặc `Kiểm tra chất lượng`).
2. Chọn batch → nhập **DRC thực tế** + kết quả QC (`passed`).
3. Lặp lại cho từng batch.

### ✅ Kỳ vọng
- `qcService.addInitialQC` tự tìm Deal qua chain `batch → stock_in → deal_id` rồi:
  - Tính **weighted average DRC** cho Deal:
    - Batch 1: 6000kg × 28% + Batch 2: 4000kg × 32% = weighted avg ≈ **29.6%**.
  - Update `b2b.deals.actual_drc` = 29.6.
  - Gửi chat notification "QC hoàn tất — batch X, DRC Y%".
- DealCard update:
  - Ô "DRC thực": `29.6% (dk 30%)` — variance chỉ `-0.4%`, **không** trigger warning.
  - Mốc 3 (QC) progress bar fill trắng.
- Portal đại lý nhận toast info nếu có.

---

## BƯỚC 6 — Nhà máy duyệt Deal

### 🏭 Phía ERP
1. Mở **DealDetailPage** của deal này (hoặc bấm "Chi tiết" trên DealCard trong chat).
2. Nút **"Duyệt Deal"** đã active (không còn disabled).
3. Hover nút để xem tooltip confirm đủ điều kiện.
4. Bấm **"Duyệt Deal"** → confirm.

### ✅ Kỳ vọng
- Backend chạy `dealService.acceptDeal()` validate đủ:
  - status = `processing` ✅
  - stock_in_count > 0 ✅
  - actual_weight_kg > 0 ✅
  - actual_drc > 0 ✅
  - qc_status ≠ `pending/failed` ✅
- Status chuyển `processing → accepted`.
- DealCard badge đổi thành **"Đã duyệt"** (gradient xanh lá), mốc 4 fill trắng.
- Portal đại lý:
  - DealCard realtime update màu + badge.
  - **Toast notification success**: "Deal HA-XXX đã được duyệt" (từ `useB2BDealToasts`).

---

## BƯỚC 7 — Nhà máy tạo Phiếu Quyết toán

### 🏭 Phía ERP
1. DealCard có nút **"Tạo quyết toán"** (gradient tím) → bấm.
2. Navigate tới `/b2b/settlements/create?deal_id=...` — page auto prefill thông tin deal.
3. Check/điều chỉnh:
   - Đơn giá, DRC áp dụng, adjustment (nếu có).
   - Tổng giá trị thực tế (final_value).
   - Các advance được link.
4. Bấm **"Tạo & Phát hành"**.

### ✅ Kỳ vọng
- Settlement record được tạo, `deal.status` = `settled`, `deal.settlement_id` set.
- Ledger ghi 1 dòng điều chỉnh (nếu có chênh giữa ước tính vs thực tế).
- DealCard:
  - Badge **"Đã quyết toán"** (gradient tím), mốc 5 fill trắng → progress 100%.
  - Hiện `Giá trị thực tế` thay vì `Giá trị ước tính`.
  - Nút **"Phiếu quyết toán"** hiện thay cho các nút cũ.
- Portal đại lý: **Toast success** "Deal HA-XXX đã quyết toán" + DealCard update realtime.

---

## BƯỚC 8 — Đại lý xem phiếu quyết toán

### 📱 Phía Đại lý
1. Chat room → DealCard → bấm **"Phiếu quyết toán"**.
2. Navigate tới `/partner/settlements/<id>`.
3. Kiểm tra:
   - Total amount khớp với ERP.
   - Các advance được link + hiển thị.
   - PDF/print layout đúng.

### ✅ Kỳ vọng
- Trang render đầy đủ không cần login lại.
- Số liệu khớp 100% với ERP.

---

## NHÁNH PHỤ — Khiếu nại DRC (test khi có variance >3%)

Để trigger nhánh này, ở **Bước 5** nhập QC với DRC thực lệch nhiều so với dự kiến:
- Dự kiến 30%, thực tế 25% → variance = -5% (> 3% threshold).

### 🏭 ERP sau Bước 5 với variance cao
- DealCard cả 2 phía hiện **DRC Variance Warning**:
  - Box màu cam + icon ⚠️ "DRC thực 25% thấp hơn dự kiến 30% (-5.0%)".

### 📱 Đại lý gửi khiếu nại
1. DealCard hiện nút **"Khiếu nại DRC"** (đỏ) → bấm.
2. Modal `RaiseDisputeModal` mở, hiển thị variance alert.
3. Nhập **lý do** (tối thiểu 10 ký tự) — vd:
   > "Lô hàng gốc được đo DRC 29% tại nhà vườn có người làm chứng, chênh 4% so với QC nhà máy là quá lớn."
4. (Optional) upload ảnh/PDF bằng chứng.
5. Bấm **"Gửi khiếu nại"**.

### ✅ Kỳ vọng
- Tạo record trong `b2b.drc_disputes` status = `open`.
- DealCard cả 2 phía: box warning chuyển **đỏ** + thêm dòng "⚠ Có khiếu nại đang mở".
- Nút "Khiếu nại DRC" đổi thành **"Xem khiếu nại"** ở cả 2 phía.
- Portal: PartnerDealDetailPage có tab mới **"Khiếu nại DRC"** xuất hiện.
- ERP: sidebar "Khiếu nại DRC" badge +1, trang `/b2b/disputes` có record mới.
- ERP user nhận **toast notification** "Khiếu nại mới từ {partner}" ở bất kỳ trang nào.

### 🏭 ERP resolve khiếu nại
1. Vào `/b2b/disputes` → tìm dispute → bấm "Chi tiết".
2. `DisputeDetailDrawer` mở — xem batch gốc, QC history.
3. Chọn 1 trong 3:
   - **Xác nhận partner đúng**: nhập `adjustment_drc` (vd `27%`) + `adjustment_amount` (chênh lệch bù cho đại lý). Submit.
   - **Giữ DRC cũ (từ chối)**: nhập lý do giải thích.
   - **Thương lượng**: nhập DRC trung gian.
4. Submit resolution.

### ✅ Kỳ vọng
- `drc_disputes.status` = `resolved_accepted` hoặc `resolved_rejected`.
- Nếu accepted + có `adjustment_amount`: `partner_ledger` tự insert 1 dòng adjustment (trigger `compute_b2b_ledger_running_balance` cộng dồn).
- DealCard cả 2 phía: warning box biến mất, active_dispute_id clear.
- Portal đại lý:
  - **Toast notification** "{dispute_number} — Được chấp nhận" hoặc "Bị từ chối".
  - Tab "Khiếu nại DRC" trong DealDetail hiện card mới với phản hồi + adjustment.
  - Nếu có adjustment → vào `/partner/ledger` thấy dòng điều chỉnh.

---

## Checklist toàn luồng (in ra để tick)

### Happy path (không khiếu nại)
- [ ] B1: Đại lý tạo booking → ERP thấy realtime
- [ ] B2: ERP chốt Deal + ứng 50M → Portal thấy DealCard + nút "Đã nhận"
- [ ] B3: Đại lý bấm "Đã nhận" → flag clear ở cả 2 phía
- [ ] B4: ERP cân 2 batch → DealCard update "Đã nhập" weight tăng dần
- [ ] B5: ERP QC 2 batch → DealCard `actual_drc` = weighted avg, mốc 3 sáng
- [ ] B6: ERP duyệt Deal → Portal nhận toast "Đã được duyệt"
- [ ] B7: ERP tạo settlement → Portal nhận toast "Đã quyết toán"
- [ ] B8: Đại lý xem phiếu QT ở `/partner/settlements/<id>`

### Dispute path
- [ ] N1: Trigger variance >3% ở bước QC
- [ ] N2: DealCard 2 phía hiện warning cam
- [ ] N3: Đại lý bấm "Khiếu nại DRC" → gửi với lý do
- [ ] N4: Warning đổi đỏ, ERP nhận toast, dispute record tạo
- [ ] N5: Tab "Khiếu nại DRC" xuất hiện trong PartnerDealDetailPage
- [ ] N6: ERP resolve (accept có adjustment) → ledger tự điều chỉnh
- [ ] N7: Portal nhận toast kết quả + tab hiện phản hồi

### Role-based (optional)
- [ ] Login ERP bằng account role `employee` (không phải admin/manager) → nút "Duyệt"/"Quyết toán" disabled + tooltip "Chỉ quản lý mới được duyệt/quyết toán"

### Realtime (critical)
- [ ] Mọi UPDATE trên DealCard self-broadcast **không cần F5** (weight, DRC, status)
- [ ] Toast nhận được **khi đang ở trang khác** (ví dụ đang trên Kho → nhận toast Deal accepted)

---

## 🗺️ State diagram của DealCard

```
                     ┌───────────────────────────────────────────────────────────────────┐
                     │                  DEAL STATUS LIFECYCLE                             │
                     │                                                                    │
   [Tạo Deal]───────▶│  processing (🟦 xanh dương)                                       │
                     │    │   Mốc: ●─○─○─○─○    Chốt | Nhập kho | QC | Duyệt | Quyết toán │
                     │    │                                                               │
   [Cân nhập kho]────┼────┤  processing, stock_in_count++                                 │
                     │    │   Mốc: ●─●─○─○─○    (mốc 2 sáng)                              │
                     │    │                                                               │
   [QC từng batch]───┼────┤  processing, actual_drc = weighted avg                        │
                     │    │   Mốc: ●─●─●─○─○    (mốc 3 sáng)                              │
                     │    │                                                               │
   [Duyệt] ─────────┬┼────▶  accepted (🟩 xanh lá)                                        │
                     │     │   Mốc: ●─●─●─●─○    (mốc 4 sáng)                             │
                     │     │                                                              │
   [Tạo settlement]─┬┼─────▶  settled (🟪 tím)                                            │
                     │     │   Mốc: ●─●─●─●─●    (mốc 5 sáng — full)                      │
                     │     │                                                              │
   [Hủy ở bất kỳ]───┴┴─────▶  cancelled (⬛ xám, gạch ngang)                              │
                     │         (không cho hủy khi đã settled)                             │
                     └───────────────────────────────────────────────────────────────────┘

   VARIANCE OVERLAY (song song lifecycle, chỉ khi |actual_drc - expected_drc| > 3%):
   ┌─────────────┐   raise     ┌──────────────┐   resolve_accepted   ┌────────────────┐
   │ variance 🟧 │────────────▶│ dispute: open │─────────────────────▶│ resolved 🟩    │
   │  (cam nhạt) │  partner    │ 🟥 (đỏ đậm)  │   factory            │ + ledger adjust│
   └─────────────┘             └──────────────┘                      └────────────────┘
```

---

## 🧰 Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp | Fix |
|---|---|---|
| **Deal tạo OK nhưng DealCard KHÔNG xuất hiện trong chat** (Deal có trong DB, chat không có card) | `chat_messages_message_type_check` constraint cũ không accept `'deal'` → INSERT fail ERROR 23514, code cũ nuốt silent | Chạy `b2b_fix_message_type_check.sql`. Nếu đã có Deal orphan → chạy `b2b_recover_dealcard_2604.sql` (điều chỉnh deal_number + booking_code trong script cho trùng case của bạn) |
| DealCard không update realtime | `b2b.chat_messages` thiếu REPLICA IDENTITY FULL hoặc chưa ADD PUBLICATION | Chạy lại `b2b_chat_realtime_publication.sql` |
| Portal không nhận toast khi Deal đổi status | `partnerAuthStore.partner?.id` undefined; hoặc `b2b.deals` chưa trong publication realtime | Check login; chạy `b2b_deals_realtime.sql` |
| QC xong DRC deal không update | Chain `batch → stock_in → deal_id` đứt | Check `stock_ins.deal_id` có set lúc nhập kho |
| Khiếu nại báo "RPC does not exist" | Migration `b2b_partner_ack_and_disputes.sql` chưa chạy | Chạy migration + verify 3 RPC: `partner_raise_drc_dispute`, `partner_acknowledge_advance`, `partner_withdraw_drc_dispute` |
| Nút "Duyệt Deal" luôn disabled dù đã cân + QC | `qc_status` deal đang `pending`/`failed` | Mở DealDetailPage → hover nút → tooltip liệt kê điều kiện còn thiếu |
| Đại lý ack tạm ứng → nút "Đã nhận" không biến mất | Portal DealCard bản cũ; hoặc `patchDealCardMetadata` fail | Verify portal commit `7deb8e6` đã deploy trên Vercel |
| Đại lý không thấy nút "Khiếu nại DRC" dù variance cao | Threshold variance phải `> 3%` tuyệt đối (KHÔNG phải tương đối) | `|actual_drc - expected_drc| > 3` — vd 28.5 vs 25 = diff 3.5 → show; 28.5 vs 26 = diff 2.5 → không show |
| Partner portal render DealCard version cũ (badge không đúng) | Portal chưa deploy commit `7deb8e6` | Check `https://vercel.com/...` build logs |

### 🔎 Debug nhanh 1 Deal cụ thể

Chạy trên Supabase SQL editor, thay `<DEAL_NUM>`:
```sql
SELECT
  d.deal_number, d.status, d.stock_in_count, d.actual_weight_kg, d.actual_drc, d.qc_status,
  (SELECT COUNT(*) FROM b2b.chat_messages
   WHERE message_type='deal' AND metadata->'deal'->>'deal_id' = d.id::text) AS dealcards,
  (SELECT COUNT(*) FROM b2b.advances WHERE deal_id = d.id) AS advances,
  (SELECT COUNT(*) FROM b2b.drc_disputes WHERE deal_id = d.id) AS disputes
FROM b2b.deals d
WHERE d.deal_number = '<DEAL_NUM>';
```

`dealcards = 0` → DealCard chưa insert (kiểm tra constraint + chạy recovery).
`dealcards > 1` → có duplicate, cần xóa bớt row cũ.

---

## 📜 Bài học từ debug hôm nay (2026-04-19)

**Bug silent insert:** Code dùng `supabase.from(...).insert(...)` wrap trong `try/catch` thuần, nhưng **supabase-js KHÔNG throw khi RLS/constraint reject** — trả `{data, error}`. Try/catch không bắt được → INSERT fail mà app không biết → user stuck.

**Nguyên tắc:** Mọi supabase call PHẢI destructure `{ error }` + check `if (error) throw` — đừng dựa vào try/catch.

**Commit fix:** `2fb6775a` (surface error) — từ giờ nếu INSERT fail sẽ hiện alert thay vì silent stuck.

---

## Rollback nếu hỏng

- Data: chạy khối KHÔI PHỤC ở cuối file `b2b_reset_chat_history.sql`.
- Code ERP: `git revert 2fb6775a c6376926 a5e20a40 a530fee9`.
- Code Portal: `git revert 3bd342c 7deb8e6`.
- Constraint: nếu cần rollback constraint → `ALTER TABLE b2b.chat_messages DROP CONSTRAINT chat_messages_message_type_check;` (không khuyến nghị vì app sẽ ghi ẩu).
