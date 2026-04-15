# Stock-Out Improvement — Open Questions

**Ngày:** 2026-04-16
**Liên quan:** [STOCK_OUT_IMPROVEMENT_PLAN.md](./STOCK_OUT_IMPROVEMENT_PLAN.md) (S1-S4)
**Status:** ✅ Tất cả câu hỏi đã có quyết định (2026-04-16). Implementation bắt đầu ngay.

## TL;DR các quyết định

| Câu | Quyết định |
|---|---|
| **Q1** — Cân xe ra có thật không | ✅ Có → **S3 làm** |
| **Q2** — Deal sale "đã giao" nghĩa là gì | ✅ Khi phiếu xuất confirmed → hook vào `confirmStockOut` |
| **Q3** — Migration DB được duyệt không | ✅ Được → **Option A**: add column `b2b_deals.delivered_kg` |
| **Q4** — S1 edge cases | Tự recon diff 2 path trước khi refactor |
| **Q5** — S4 FIFO logic | 5a=pick max + warn, 5b=respect filter hiện tại, 5c=allow partial, 5d=qty DESC |
| **Q6** — Feature flag | Riêng rẽ per task (`VITE_AUTO_WEIGHBRIDGE_OUT_SYNC` cho S3, S1/S2/S4 no flag) |
| **Q7** — Timing | Bắt đầu S1 ngay session này |
| **Q8** — Test data | Test prod với phiếu nhỏ, có idempotency + feature flag safety cho S3 |

**Scope cuối cùng:** S1 → S2 → S3 → S4, tổng ~8-12h, full scope (không defer task nào).

---

## 🔴 Blocker questions

Phải trả lời trước khi code. Ảnh hưởng scope trực tiếp.

### Q1 — Cân xe ra có thật không? (quyết định S3 có làm không)

Hiện tại workflow xuất hàng có cân xe khi ra cổng không, hay chỉ cân NVL khi vào?

- Nếu **có cân ra**: mục đích là gì?
  - [ ] Kiểm tra khớp tare weight (an ninh/kiểm toán)
  - [ ] Ghi nhận khối lượng lô hàng đã xuất (thay thế manual nhập)
  - [ ] Cả 2

- Nếu **không cân ra** → **S3 bỏ khỏi plan**, tiết kiệm 2-3h.

**Trả lời (2026-04-16):** ✅ Có cân xe ra, mục đích **ghi nhận lô hàng xuất**. → **S3 làm**.

---

### Q2 — Deal sale: semantics của "đã giao" là gì? (quyết định S2 design)

Deal sale hiện đang được dùng production không? Nếu có, "delivered_kg" tính lúc nào?

- [ ] Deal sale **chưa dùng** (chỉ dùng deal purchase) → **S2 defer**, không cần làm ngay.
- [ ] Deal sale **có dùng** — chọn 1 trong các thời điểm:
  - [ ] Khi phiếu xuất kho confirmed (`stock_out_orders.status='confirmed'`)
  - [ ] Khi container rời cảng (có 1 flag/status khác)
  - [ ] Khi nhận chứng từ giao hàng (BL, waybill)
  - [ ] Khác: _______________

**Trả lời (2026-04-16):** ✅ "Đã giao" = khi phiếu xuất confirmed (`stock_out_orders.status='confirmed'`). → Hook `updateDealStockOutTotals` vào cuối `stockOutService.confirmStockOut`.

---

### Q3 — Schema migration: có được migrate DB không?

S2 cần field để track delivered. 2 options:

- **Option A — Add column**: `b2b_deals.delivered_kg` (numeric) + backfill từ stock_out_orders hiện có.
  - Pros: query nhanh, dễ hiểu
  - Cons: cần migration SQL + chạy 1 lần trên Supabase
- **Option B — Compute dynamic**: không add column, sum query `stock_out_orders.total_weight WHERE deal_id = X AND status='confirmed'` mỗi lần cần biết.
  - Pros: 0 migration
  - Cons: query chậm hơn nếu deal có nhiều phiếu, recalc mỗi lần

Tương tự cho `stock_out_orders.deal_id` — column này đã có hay chưa? (tôi sẽ recon khi bắt đầu S2, nhưng nếu bạn biết trước thì nói luôn)

**Trả lời (2026-04-16):** ✅ Migration được duyệt → **Option A (add column)**. Sẽ add `b2b_deals.delivered_kg` + backfill từ stock_out_orders hiện có. Check `stock_out_orders.deal_id` lúc recon.

---

## 🟡 Design questions

Không block code nhưng nên rõ trước khi implement để khỏi thiết kế sai.

### Q4 — S1: có edge case nào ở `handleConfirm` mà `stockOutService.confirmStockOut` KHÔNG handle?

Tôi sẽ recon bằng cách diff 2 path trước khi refactor. Nhưng nếu bạn từng sửa chỗ này và biết "đặc biệt ở đoạn này, service thiếu cái kia", nói luôn để tiết kiệm thời gian đào.

Các điểm tôi sẽ check:
- [ ] `picking_status` default value cho stock_out_details
- [ ] `inventory_transactions.notes` format
- [ ] `warehouse_locations.current_quantity` clamp logic
- [ ] Batch `status='depleted'` threshold (= 0 hay < epsilon)
- [ ] Thứ tự update (batch trước hay tx trước) — ảnh hưởng rollback khi lỗi giữa chừng

**Trả lời / ghi chú:**
> _(điền vào đây nếu có insight, không thì để trống, tôi tự recon)_

---

### Q5 — S4: auto-pick FIFO logic

Khi user click "Auto-fill FIFO" với target qty:

**5a. Target qty > tổng tồn kho available:**
- [ ] Pick max có thể + hiển thị warning "Chỉ đủ X/Y"
- [ ] Block không cho tiếp, bắt user chỉnh target

**5b. QC filter:**
- [ ] Chỉ pick batch `qc_status='passed'`
- [ ] Cho phép include `warning` (user toggle opt-in)
- [ ] Tôn trọng filter hiện tại của modal (whatever user chose)

**5c. Partial batch:**
- [ ] Cho phép partial (lô 500kg, target 200kg → pick 200kg của lô đó)
- [ ] Bắt buộc full batch (lô 500kg, target 200kg → pick nguyên 500kg, over target)

**5d. Sort tie-breaker khi cùng `received_date`:**
- [ ] `quantity_remaining` ASC (hết lô nhỏ trước, giảm fragmentation)
- [ ] `quantity_remaining` DESC (xuất lô lớn trước, ít click hơn)
- [ ] `batch_no` alphabetical

**Trả lời:**
> - 5a: _(điền)_
> - 5b: _(điền)_
> - 5c: _(điền)_
> - 5d: _(điền)_

**Default nếu không trả lời:** 5a=pick max + warn, 5b=respect current filter, 5c=allow partial, 5d=quantity DESC.

---

### Q6 — Feature flag strategy

S3 cần feature flag an toàn. S1 là pure refactor nên không cần. S2/S4 là additive nên không bắt buộc.

- [ ] **Riêng rẽ:** `VITE_AUTO_WEIGHBRIDGE_OUT_SYNC` cho S3 (giống pattern C1). S2/S4 không flag.
- [ ] **Umbrella:** `VITE_NEW_STOCKOUT_V2` cho toàn bộ S1-S4. Tắt = rollback hết.
- [ ] **Không flag gì cả:** tin vào git revert nếu có vấn đề.

**Trả lời:**
> _(điền vào đây)_

**Default:** Riêng rẽ (pattern nhất quán với C1).

---

## 🟢 Non-blocker

Không cần trả lời để bắt đầu, nhưng biết thì tốt.

### Q7 — Timing

- [ ] Làm ngay session này (bắt đầu S1 luôn)
- [ ] Đợi test kỹ phase A-D đã deploy trước (vài ngày)
- [ ] Dời sang tuần sau

**Trả lời:**
> _(điền)_

---

### Q8 — Test data

- [ ] Sẵn có phiếu xuất test trong prod, tôi query data thật khi recon
- [ ] Phải tạo data giả trước khi test refactor S1
- [ ] Test trực tiếp trên prod với phiếu nhỏ (risk chấp nhận được)

**Trả lời:**
> _(điền)_

---

## 📋 Checklist điền xong

Khi trả lời xong các câu 🔴 blocker, tick vào đây để bắt đầu implement:

- [ ] Q1 (cân xe ra)
- [ ] Q2 (deal sale semantics)
- [ ] Q3 (schema migration)
- [ ] Q4 (S1 edge cases) — optional
- [ ] Q5 (S4 FIFO logic) — optional, có default
- [ ] Q6 (feature flag) — optional, có default
- [ ] Q7 (timing) — optional
- [ ] Q8 (test data) — optional

**Minimum để start:** Q1, Q2, Q3 đã có answer.
