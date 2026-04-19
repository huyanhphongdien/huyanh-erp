# B2B — Hướng dẫn test end-to-end (Phiếu chốt mủ → Quyết toán)

> **Ngày:** 2026-04-19
> **Phạm vi:** Test từ lúc đại lý tạo Phiếu chốt mủ đến lúc Deal được quyết toán xong, gồm cả nhánh Khiếu nại DRC.
> **Yêu cầu trước khi test:**
> - Đã chạy các migration của commit `c6376926` trở về sau (xem mục 0 của [B2B_13_HUONG_DAN_TINH_NANG_MOI.md](B2B_13_HUONG_DAN_TINH_NANG_MOI.md)).
> - Portal `b2b.huyanhrubber.vn` đã deploy commit `3bd342c` trở về sau.
> - Nếu muốn test sạch → chạy `docs/migrations/b2b_reset_chat_history.sql` (reset toàn bộ chat/deal/advance/dispute).

---

## 0. Chuẩn bị 2 tab trình duyệt

| Vai trò | URL | Account |
|---|---|---|
| **ERP (nhà máy)** | `https://huyanhrubber.vn` | admin hoặc manager của Huy Anh |
| **Portal (đại lý)** | `https://b2b.huyanhrubber.vn` | account partner (đại lý đang test) |

Mở 2 tab song song, pin chúng lại để xem realtime cross-side.

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

## Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| DealCard không update realtime | `b2b.chat_messages` thiếu REPLICA IDENTITY FULL hoặc chưa ADD PUBLICATION → chạy lại `b2b_chat_realtime_publication.sql` |
| Portal không nhận toast | `partnerAuthStore.partner?.id` undefined → check login; hoặc `b2b.deals` chưa trong publication realtime → chạy `b2b_deals_realtime.sql` |
| QC xong DRC deal không update | Chain `batch → stock_in → deal_id` đứt — check `stock_ins.deal_id` có set lúc nhập kho không |
| Khiếu nại "RPC does not exist" | Migration `b2b_partner_ack_and_disputes.sql` chưa chạy hoặc chạy thiếu function |
| Nút "Duyệt Deal" luôn disabled dù đã cân + QC | Check `qc_status` của deal: phải khác `pending` và `failed` |
| Đại lý ack tạm ứng → nút không biến mất | `patchDealCardMetadata` fail (log console); hoặc portal DealCard bản cũ → check commit `7deb8e6` đã deploy |

---

## Rollback nếu hỏng

- Data: chạy khối KHÔI PHỤC ở cuối file `b2b_reset_chat_history.sql`.
- Code: `git revert 3bd342c 7deb8e6` (portal) và `git revert c6376926 a5e20a40 a530fee9` (ERP).
