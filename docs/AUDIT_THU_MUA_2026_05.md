# AUDIT MODULE THU MUA — 2026-05-30

**Phạm vi**: Weighbridge app (`apps/weighbridge/`) + ERP Thu Mua (`src/pages/{b2b,wms}/`, `src/services/{b2b,wms}/`). Portal B2B (repo riêng) **không bao gồm**.

**Mục đích**: chuẩn bị E2E test cho luồng cân → chốt giá → ĐNTT → thanh toán + thống kê + thưởng + công nợ.

**Phương pháp**: 2 Explore agent đọc end-to-end các file trọng yếu, phân loại findings theo severity. File này là consolidated report cho Phase 3 fix.

---

## TÓM TẮT EXEC

**Tình trạng E2E readiness**: 🔴 **CHƯA SẴN SÀNG**.

3 nhóm vấn đề chính phải fix trước khi test E2E:
1. **Bank info đại lý B2B** — chưa có cột trên `b2b.partners` → ĐNTT/Liên 2 không in được STK → kế toán không chuyển khoản được.
2. **PCG chưa hoàn chỉnh** — fees không trừ vào ĐNTT, status không đánh dấu 'used', proxy partner bank không được dùng.
3. **Bridge weighbridge → intake bỏ sót `supplier_id`** + thiếu validation/atomicity.

**Top 12 ưu tiên Phase 3** (xem chi tiết bên dưới).

---

## 🔴 BUG (sẽ làm hỏng E2E)

### B-1. **Bank info B2B partner không in ra ĐNTT/Liên 2**
- **Vị trí**: [paymentRequestService.ts:180-198 `fetchSupplierBanks`](src/services/wms/paymentRequestService.ts#L180), [partnerService.ts Partner interface](src/services/b2b/partnerService.ts) — không có cột bank.
- **Vấn đề**: `fetchSupplierBanks()` chỉ query `rubber_suppliers` (cho Lào). Deal flow + bộc phát (B2B partner) → `payee_note` rỗng → ĐNTT in ra không có STK → kế toán không biết chuyển vào tài khoản nào.
- **Fix direction**: Thêm cột `bank_account` + `bank_name` vào `b2b.partners` (migration). Thêm `fetchPartnerBanks()` trong paymentRequestService. Resolve `payee_note` từ partner bank cho dòng có `partner_id`.

### B-2. **Bank của proxy partner không được dùng khi đại lý có proxy**
- **Vị trí**: [B2BRubberIntakePrintPage.tsx:25-37](src/pages/b2b/rubber-intake/B2BRubberIntakePrintPage.tsx#L25) — load proxy partner nhưng không lấy bank.
- **Vấn đề**: Khi seller có `payment_proxy_partner_id`, tiền phải chuyển vào TK proxy chứ không phải TK seller. Code load proxy name nhưng KHÔNG load bank → in sai TK.
- **Fix direction**: Trong resolver, nếu partner có `payment_proxy_partner_id` → dùng bank của proxy. Áp cho cả ĐNTT lẫn Liên 2.

### B-3. **PCG status không bao giờ chuyển sang 'used' sau khi match**
- **Vị trí**: [priceLockService.ts](src/services/b2b/priceLockService.ts) — không có hàm `markUsed`. [paymentRequestService.ts resolvePcgForTickets](src/services/wms/paymentRequestService.ts#L220) — match xong không update PCG.
- **Vấn đề**: PCG `locked` mãi → có thể match cho ĐNTT khác trong tương lai, không rõ đã dùng cho phiếu nào. Audit không truy vết được.
- **Fix direction**: Thêm `priceLockService.markUsed(pcg_id)`. Gọi sau khi `paymentRequestService.create()` thành công cho mỗi PCG đã match. Hoặc bảng `b2b_pcg_usage(pcg_id, payment_request_id, used_at)` để giữ history.

### B-4. **DRC = null + price_unit='dry' → silent fallback về giá theo tươi (sai)**
- **Vị trí**: [paymentRequestService.ts:173-177 `billableWeight`](src/services/wms/paymentRequestService.ts#L173).
- **Vấn đề**: `if (priceUnit === 'dry' && drc && drc > 0) return dry; else return net`. Khi drc null → return net (tươi) → tính tiền theo tươi với giá khô → overbilling ~50%.
- **Fix direction**: Throw error hoặc cảnh báo: `if (priceUnit === 'dry' && (!drc || drc <= 0)) throw 'DRC bắt buộc cho mủ chốt theo khô'`. Hoặc set `unit_price=0` để force kế toán nhập tay.

### B-5. **`paymentRequestService.create()` không atomic — orphan data khi lỗi giữa chừng**
- **Vị trí**: [paymentRequestService.ts ~395-449](src/services/wms/paymentRequestService.ts) — 3 step rời (insert header → lines → update tickets).
- **Vấn đề**: Step 2 hoặc 3 lỗi → header đã tạo, lines một phần, tickets không link → retry tạo dup.
- **Fix direction**: Wrap trong Supabase RPC (PL/pgSQL function) hoặc dùng `pg_xact_lock` + commit cuối. Tối thiểu: nếu step 3 fail → DELETE header để rollback.

### B-6. **Bridge weighbridge → intake bỏ sót source 'supplier'**
- **Vị trí**: [docs/migrations/b2b_weighbridge_to_intake_bridge.sql:~86-89](docs/migrations/b2b_weighbridge_to_intake_bridge.sql).
- **Vấn đề**: Trigger chỉ check `partner_id IS NOT NULL`. Phiếu cân có `supplier_id` (Lào, không có B2B partner) → silently không tạo intake batch → mủ Lào không hiển thị trong lý lịch.
- **Fix direction**: Mở rộng condition: `IF partner_id IS NOT NULL OR supplier_id IS NOT NULL THEN create intake`. Map source_type tương ứng.

### B-7. **Ô nhập "Tạp chất / giảm trừ" KHÔNG tồn tại trên form cân**
- **Vị trí**: [WeighingPage.tsx state `deductionKg` ~line 136](apps/weighbridge/src/pages/WeighingPage.tsx#L136) — state có nhưng không có UI để nhập.
- **Vấn đề**: PrintPage render `deduction` (dòng "Tạp chất - X kg") nhưng giá trị luôn = 0 vì không nhập được. Nghiệp vụ tạp chất hoàn toàn không hoạt động.
- **Fix direction**: Thêm InputNumber "Tạp chất (kg)" vào card "Thông tin mủ" hoặc card riêng "Giảm trừ". Recalculate net khi đổi.

---

## 🟡 GAP (thiếu chức năng, chặn E2E)

### G-1. **Phí trên PCG (bốc xếp, bến bãi…) KHÔNG trừ vào ĐNTT**
- **Vị trí**: [priceLockService.ts FEE_FLAG_LABELS](src/services/b2b/priceLockService.ts), [paymentRequestService.ts resolvePcgForTickets](src/services/wms/paymentRequestService.ts#L220).
- **Vấn đề**: PCG có `fees[]` (đ/tấn hoặc đ/lô) nhưng resolver chỉ trả `pricePerKg`, không trả fees. ĐNTT = KL×giá thuần, không trừ phí. Đại lý nhận đủ tiền không trừ phí → công ty thiệt.
- **Fix direction**: `resolvePcgForTickets` trả thêm `feesPerKg`. `suggested_amount = roundThousand(weight × (price - feesPerKg))`. Hoặc render thêm dòng "Trừ phí" trên ĐNTT.

### G-2. **Cột bank_account / bank_name không có trên `b2b.partners`**
- **Vị trí**: [partnerService.ts Partner interface ~17-45](src/services/b2b/partnerService.ts#L17).
- **Vấn đề**: Không có nơi chuẩn để lưu STK đại lý B2B. Kế toán nhập tay vào "Ghi chú" của ĐNTT — dễ sai, không validate.
- **Fix direction**: Migration `ALTER TABLE b2b.partners ADD bank_account text, bank_name text, bank_holder text`. UI: thêm 3 ô vào PartnerDetailPage. Auto-fill khi load.

### G-3. **PCG status transition không enforce state machine**
- **Vị trí**: [priceLockService.update](src/services/b2b/priceLockService.ts).
- **Vấn đề**: Có thể chuyển 'cancelled' → 'locked', 'used' → 'draft' tuỳ ý. Không có check + audit log.
- **Fix direction**: Trong `update()`, check `validTransitions[currentStatus]` chứa `newStatus`. Reject nếu không hợp lệ.

### G-4. **Settlement payment ledger không có UNIQUE → có thể double-count**
- **Vị trí**: [settlementService.ts:~693-702 markAsPaid](src/services/b2b/settlementService.ts).
- **Vấn đề**: `markPaid()` 2 lần → ghi 2 dòng ledger → công nợ sai. Không có UNIQUE(settlement_id, type, reference_code).
- **Fix direction**: Migration thêm UNIQUE index. Hoặc check exists trước khi insert.

### G-5. **Bonus thưởng cho intake tạo từ bridge có thể không kích hoạt**
- **Vị trí**: [rubberIntakeB2BService.applyPrice ~line 329](src/services/b2b/rubberIntakeB2BService.ts#L329).
- **Vấn đề**: `applyPrice` update unit_price + total_amount + status='confirmed'. Trigger PNK number gán đúng. Nhưng `b2b_monthly_bonuses` có được recalc không khi status đổi sang confirmed? Cần verify.
- **Fix direction**: Sau bulk applyPrice → gọi `recompute_quarter_bonuses(year, quarter)` cho period liên quan. Hoặc trigger trên rubber_intake_batches UPDATE status.

### G-6. **DRC source không track (lookup table vs nhập tay)**
- **Vị trí**: [WeighingPage.tsx:1297-1314](apps/weighbridge/src/pages/WeighingPage.tsx#L1297) — operator có thể override DRC sau khi auto-fill từ lookup.
- **Vấn đề**: Cả 2 case lưu vào cùng `qc_actual_drc`. QC không phân biệt được DRC nào auto-suy vs DRC nào nhập tay → audit khó.
- **Fix direction**: Thêm cột `qc_drc_source text CHECK IN ('lookup','manual')`. Set theo nguồn cuối cùng cập nhật.

### G-7. **Vehicle plate same day có thể cân 2 lần — không có constraint chống dup**
- **Vị trí**: [b2b_weighbridge_to_intake_bridge.sql](docs/migrations/b2b_weighbridge_to_intake_bridge.sql).
- **Vấn đề**: Cùng biển số xe cân 2 lần cùng ngày tạo 2 intake → có thể là sai (cân lại) hoặc đúng (2 chuyến) → cần UI warning.
- **Fix direction**: Trên WeighingPage, khi nhập biển số → warning nếu có phiếu khác cùng plate + cùng ngày + status≠cancelled. Operator confirm OK thì cho qua.

### G-8. **Source type không persist vào DB**
- **Vị trí**: [WeighingPage.tsx:113-116](apps/weighbridge/src/pages/WeighingPage.tsx#L113) — UI state only.
- **Vấn đề**: `sourceType` ('deal'/'supplier'/'partner_direct') chỉ ở UI, không lưu cột riêng. Reload đoán lại qua presence của deal_id/supplier_id/partner_id. Edge case: deal_id + supplier_id cùng có (lý thuyết shouldn't) → đoán sai.
- **Fix direction**: Thêm cột `source_type text CHECK IN ('deal','supplier','partner_direct')` vào weighbridge_tickets. Lưu khi save.

---

## 🟢 IMPROVEMENT (work but could be better)

### I-1. PCG resolver chọn arbitrary khi tie lock_date — [paymentRequestService.ts:251](src/services/wms/paymentRequestService.ts#L251). Thêm secondary sort by `created_at`.

### I-2. PCG resolver date match logic fragile khi created_at ở biên ngày — normalize tdate qua `created_at::date` (đã làm) nhưng test với timezone Việt Nam.

### I-3. DRC lookup cache TTL 5 phút không hiển thị — thêm "last refresh: X min" + nút reload trong DRC card.

### I-4. Deal auto-fill rubber type qua heuristic name (đông/nước/tạp) — ưu tiên `deal.rubber_type` nếu set.

### I-5. Camera capture không bắt buộc — không validate "must have L1+L2 images" trước khi complete. Cân nhắc tuỳ chính sách.

### I-6. Print font Times New Roman cho A4/A5 — verify E2E render không bị overflow trong các slip dài.

### I-7. QR trên phiếu cân có data nhưng chưa có scan-back endpoint — thêm route `/wb/lookup?code=...` để truy vết.

### I-8. autoSettlementService: `final_price || unit_price` không validate giá trị âm hoặc bất thường — sanity check.

### I-9. bonusSettlementService manual insert items thay vì view/trigger — refactor sang DB view aggregate để tránh orphan khi recalc bonus.

### I-10. HomePage stats lẫn cancelled tickets vào totals — toggle `showCancelled` chỉ ảnh hưởng UI list, totals không filter.

---

## ƯU TIÊN PHASE 3 — TOP 12

Sắp theo blocking E2E + effort:

| # | Severity | Tên | Effort | Phụ thuộc |
|---|---|---|---|---|
| 1 | 🔴 | B-1 + G-2: thêm bank cols vào b2b.partners + fetch ở paymentRequestService | M | Migration |
| 2 | 🔴 | B-2: proxy bank routing trên ĐNTT/Liên 2 | S | Sau #1 |
| 3 | 🟡 | G-1: PCG fees trừ vào ĐNTT amount | M | — |
| 4 | 🔴 | B-3: PCG markUsed + bảng usage history | M | — |
| 5 | 🔴 | B-7: thêm ô "Tạp chất (kg)" vào WeighingPage | S | — |
| 6 | 🔴 | B-6: bridge handle supplier_id (mở rộng trigger) | M | Migration |
| 7 | 🔴 | B-4: DRC validation cho dry pricing (throw hoặc warn) | S | — |
| 8 | 🔴 | B-5: wrap paymentRequest.create trong RPC/transaction | M | Migration RPC |
| 9 | 🟡 | G-8: thêm cột source_type vào weighbridge_tickets | S | Migration |
| 10 | 🟡 | G-3: PCG state machine validate | S | — |
| 11 | 🟡 | G-4: settlement ledger UNIQUE constraint | S | Migration |
| 12 | 🟡 | G-7: vehicle plate dup warning | S | — |

**Tổng**: ~5 migration + ~8 code change. Có thể chia 3-4 commit nhóm theo theme:
- **Commit A**: Bank info + proxy routing (#1, #2)
- **Commit B**: PCG hoàn thiện (#3, #4, #10)
- **Commit C**: Weighbridge fixes (#5, #6, #7, #9, #12)
- **Commit D**: Atomic + ledger guard (#8, #11)

---

## VIỆC ANH CHỐT TRƯỚC PHASE 3

1. **Bank info storage** — Option A: thêm 3 cột `bank_account/bank_name/bank_holder` vào `b2b.partners` (đơn giản, 1-1). Option B: bảng riêng `b2b_partner_banks` (multi-account/partner). Anh chọn?
2. **PCG fees** — trừ vào tổng amount (1 dòng net), HAY hiện riêng dòng "Phí (-X đ)" trên ĐNTT? Cái nào dễ duyệt hơn cho BGĐ?
3. **DRC missing cho dry pricing** — chặn cứng (throw error, không cho tạo ĐNTT) HAY chỉ warn + set amount=0 cho dòng đó?
4. Có cần migrate cột `source_type` cho weighbridge_tickets không, hay đoán qua deal_id/supplier_id/partner_id là đủ?

Anh chốt 4 việc trên → tôi start Phase 3 lần lượt theo nhóm A→B→C→D, mỗi nhóm 1 commit + push.
