# B2B Module — Phân tích gaps & ràng buộc quy trình

**Ngày audit:** 2026-04-21
**Scope:** 12 sub-module B2B (Dashboard, Chat, Demands, Partners, Deals, Auctions, Rubber Intake, Ledger, Settlements, Disputes, Analytics, Reports)
**Mục đích:** Tìm lỗ hổng nghiệp vụ, race condition, thiếu validation, cross-module conflicts để hoàn thiện enforcement.

---

## 1. Luồng quy trình B2B tổng thể

```
Đại lý gửi phiếu chốt mủ (Chat)
    ↓
Nhân viên xác nhận → Deal tạo (status: processing)
    ↓
Đại lý giao hàng → Phiếu cân IN (weighbridge)
    ↓
QC test (pending → passed / failed)
    ↓
Tạo stock_in + batch (đã có stock_in_count > 0)
    ↓
Deal duyệt (accepted) — yêu cầu: actual_weight > 0, actual_drc > 0, qc ≠ failed
    ↓
Auto-create Settlement (draft → pending → approved → paid)
    ↓
Ledger entry (advance/settlement/payment/adjustment)
    ↓                    ↓
(nếu DRC lệch)       Thanh toán
Dispute raised
    ↓
Resolve (adjustment entry → update balance)
```

Kiến trúc: **2 schemas** — `b2b` (base tables, realtime) + `public` (views FOR API). RLS enabled trên b2b.* với `current_partner_id()` check. Factory user dùng service_role hoặc `authenticated` bypass.

---

## 2. Phân tích từng sub-module

### 2.1. Dashboard

**Trạng thái:** Hoạt động. Stats theo status, advances, settlements, disputes, chat activity. Soft-delete (`deleted_at IS NULL`). Realtime subscriptions.

**Gaps:**
- ❌ **Suspended partner không warning:** Dashboard không flag deal đang active với partner đã suspended → nhân viên không biết
- ❌ **"Deal chưa QC pass" không alert:** Field `qc_status` tồn tại nhưng không hiển thị trên card warning
- ❌ **Aging debt invisible:** Không có box "Đại lý quá hạn thanh toán" → không proactive

---

### 2.2. Chat Đại lý

**Trạng thái:** Realtime OK. BookingCard → ConfirmDealModal → Deal tạo ngay (`processing`).

**Gaps:**
- 🔴 **RACE CONDITION — Duplicate deals:** 2 nhân viên cùng click "Xác nhận Deal" trong chat → client-check `booking.status === 'confirmed'` không atomic, Supabase UPDATE tuần tự → **CÓ THỂ tạo 2 deals cho 1 booking**
  - File: [dealConfirmService.ts](src/services/b2b/dealConfirmService.ts) ~line 100-120
  - Fix: RPC atomic `UPDATE b2b_bookings SET status='confirmed' WHERE id=$1 AND status != 'confirmed' RETURNING *` → nếu 0 rows → đã có người xác nhận
- ⚠️ **Chat-Form conflict:** User đang edit DealDetailPage form, realtime update metadata chat → form value stale, user save = ghi đè dữ liệu mới
- ⚠️ **Chat không close sau settle:** Deal đã settled, chat room vẫn `active=true` → đại lý gửi tin nhắn rác

---

### 2.3. Nhu cầu mua (Demands)

**Trạng thái:** Demand published → nhận offers → accept → tạo deal. Multi-lot support via `lot_code`, `lot_drc`.

**Gaps:**
- ⚠️ **Quantity tracking lỏng:** Khi accept offer, không validate `SUM(accepted_offers.qty) <= demand.quantity_kg` → có thể chấp nhận vượt nhu cầu
- ⚠️ **Demand published không lock:** Edit quantity/deadline lúc partner đang submit offer → offer cũ invalidated, không notify
- ⚠️ **Offer → Deal không 1:1:** 1 offer có thể tạo multiple deals (tách lô) → chỉ track bằng `lot_code` là convention, không enforce FK

---

### 2.4. Đại lý (Partners)

**Trạng thái:** Tier (diamond/gold/silver/bronze/new), status (pending/verified/suspended/rejected). Code auto-gen `[Region][Name][Seq]`.

**Gaps:**
- 🔴 **Suspended partner vẫn tạo deal được:** `dealService.createDeal()` KHÔNG check `partner.status === 'verified'`
  - File: [dealService.ts](src/services/b2b/dealService.ts) ~line 332-376
  - Fix: `if (partner.status !== 'verified') throw "Đại lý chưa được duyệt"`
- ⚠️ **Tier hoàn toàn manual:** Không có rule auto "đạt X tấn/năm → upgrade silver" → tier sai thực tế
- ⚠️ **Delete partner cascade không test:** Xóa partner còn active deals → FK dangling, query join có thể fail
- ⚠️ **Portal/ERP parity undocumented:** Không rõ feature nào chỉ Portal có, nào chỉ ERP có

---

### 2.5. Deals

**Trạng thái:** Status `pending → processing → accepted → settled/cancelled`. `checkAcceptConditions`: yêu cầu processing + stock_in_count > 0 + actual_weight > 0 + actual_drc > 0 + qc ≠ failed.

**Gaps:**
- 🔴 **CRITICAL — DRC/Giá edit sau accepted:** `dealService.updateDeal()` không restrict field ở status=`accepted` → sửa `expected_drc`, `actual_drc`, `unit_price` tự do → Partner khiếu nại "data thay đổi sau duyệt"
  - File: [dealService.ts](src/services/b2b/dealService.ts) ~line 455-492
  - Fix: Policy-based → nếu accepted, chỉ cho edit notes/attachments, lock amount fields
- 🔴 **CRITICAL — No audit trail:** Thay đổi DRC/price không ghi history → không có evidence khi dispute
  - Fix: Tạo table `b2b_deal_changes` log mọi UPDATE qua trigger
- ⚠️ **Quantity/Price = 0 hoặc negative:** Không validate `quantity_kg > 0`, `unit_price > 0` → Settlement tính ra 0đ (misleading) hoặc âm (bug)
- ⚠️ **No debt check:** createDeal không check partner balance quá hạn → bypass credit policy
- ⚠️ **Race acceptDeal:** 2 manager duyệt 1 lúc → cả 2 update accepted (Supabase idempotent), nhưng DealCard metadata gọi 2 lần → waste + realtime noise

---

### 2.6. Đấu giá (Auctions)

**Trạng thái:** UI tồn tại (AuctionListPage, AuctionDetailPage) nhưng không tìm thấy service file chuyên biệt → tích hợp yếu với deal flow.

**Gaps:**
- 🔴 **MAJOR GAP — Không có AuctionService:** Workflow đấu giá → winning bid → deal creation không document. Code có thể chưa complete
- ⚠️ **Winning bid lock:** Sau khi chọn winner, các bid khác không auto-close → đại lý thua vẫn thấy "pending"

---

### 2.7. Lý lịch mủ (Rubber Intake — B2B)

**Trạng thái:** Link rubber_intake_batches với deal qua `b2b_partner_id`, `deal_id`, `lot_code`, `stock_in_id`. Status draft → confirmed → settled → cancelled.

**Gaps:**
- 🔴 **1 Batch link nhiều deals:** `batch.deal_id` scalar FK (không unique) — có thể bị gán 2 batch cùng deal_id, hoặc update batch.deal_id trỏ deal khác → quantity tính sai
  - File: [rubberIntakeB2BService.ts](src/services/b2b/rubberIntakeB2BService.ts) ~line 47
  - Fix: UNIQUE constraint `(batch_id, deal_id)` hoặc dùng junction table
- ⚠️ **Quantity mismatch không detect:** Batch `net_weight_kg` vs Deal `quantity_kg` không auto-compare → stock-in có thể tạo với số khác xa booking
- ⚠️ **DRC variance không auto-flag:** Batch `drc_percent` vs Deal `expected_drc` → sai lệch lớn cần manual phát hiện
- ⚠️ **Hard delete:** Không thấy `deleted_at` ở rubber_intake_batches → xóa mất lịch sử

---

### 2.8. Công nợ (Ledger)

**Trạng thái:** Entry types (settlement/advance/payment/adjustment/opening_balance). `running_balance` cộng dồn. `period_month/year`.

**Gaps:**
- 🔴 **Period cutting unclear:** Deal span tháng 1-3, settle tháng 4 → entry period=4? Không rule → báo cáo kỳ sai
  - Fix: Explicit rule: `period = settle_date.month` (không phải deal_date)
- 🔴 **Non-idempotent manual entry:** `createManualEntry()` không có idempotency key → retry/double-click = double entry
  - Fix: UNIQUE `(partner_id, reference_code)` hoặc `ON CONFLICT DO NOTHING`
- 🔴 **Multi-currency broken:** Deal có `currency` + `exchange_rate` nhưng ledger chỉ VND → running_balance sai khi mix USD/VND
  - Fix: Convert về VND dùng rate tại thời điểm entry, lưu rate trong entry
- ⚠️ **Opening balance không validate:** Tạo tay, không check = closing balance của kỳ trước → account mismatch
- ⚠️ **Aging report chỉ có interface:** `AgingItem` defined nhưng không implementation → UI báo cáo rỗng

---

### 2.9. Quyết toán (Settlements)

**Trạng thái:** Auto-create từ accepted deal. `final_value = actual_weight × (actual_drc/100) × price`. Link advances via junction `b2b_settlement_advances`. Status draft → pending → approved → paid.

**Gaps:**
- 🔴 **CRITICAL — Settle trước khi dispute close:** Settlement có thể submit-for-approval khi deal có dispute đang open → Ledger ghi settlement + sau đó adjustment (dispute) → double entry, khó reconcile
  - File: [autoSettlementService.ts](src/services/b2b/autoSettlementService.ts)
  - Fix: Check `NOT EXISTS (SELECT 1 FROM drc_disputes WHERE deal_id = X AND status IN ('open', 'investigating'))` trước submit
- 🔴 **CRITICAL — Advance > final_value không block:** Tổng advance vượt giá trị deal → `remaining_amount` âm → balance âm
  - Fix: Validate `total_advance <= final_value` trước approve
- 🔴 **CRITICAL — Settlement draft editable after approve:** Sửa amount sau khi đã approve → ledger entry không update theo → imbalance
  - Fix: Lock fields khi status >= approved, chỉ cho edit notes
- ⚠️ **Processing fee negative:** `processingFeePerTon` không validate > 0
- ⚠️ **Partial payment không support:** `markAsPaid()` full amount only → không track partial

---

### 2.10. Khiếu nại DRC (Disputes)

**Trạng thái:** Partner raise qua RPC → open → investigating → accepted/rejected. Adjustment entry nếu accepted.

**Gaps:**
- 🔴 **CRITICAL — Settlement-Dispute race:** Settlement approved + dispute raise sau → adjustment tạo entry duplicate → balance lỗi
  - Fix: Flag `settlement.locked_by_dispute = true` khi dispute raise; adjustment luôn ghi new entry, không modify settlement
- 🔴 **Non-blocking ledger:** `resolveDispute()` gọi ledger entry, nếu fail → chỉ console.error, dispute vẫn mark resolved → balance mismatch silent
  - Fix: Transaction — nếu ledger fail → rollback dispute status
- ⚠️ **Withdraw không undo adjustment:** `withdrawDispute()` không revert ledger entry đã tạo → orphan entry
- ⚠️ **Negative adjustment không check balance:** `adjustment_amount < 0` (refund cho partner) không validate balance đủ → có thể tạo balance âm tạm thời

---

### 2.11. Phân tích B2B (Analytics)

**Trạng thái:** Dashboard summary, chưa xem chi tiết.

**Gaps:**
- ⚠️ **Multi-currency mix:** Reports gộp VND + USD không convert → số liệu sai
- ⚠️ **Snapshot delay:** Không reactive → delay 5-10 phút

---

### 2.12. Báo cáo công nợ (LedgerReportPage)

**Trạng thái:** Partner ledger với running_balance, filter period/tier.

**Gaps:**
- ⚠️ **Aging (0/30/60/90+ days) chưa implement:** Interface có, function không
- ⚠️ **Export Excel/CSV missing:** Read-only, không xuất file

---

## 3. Cross-module gaps

| # | Gap | Module liên quan | Severity |
|---|---|---|---|
| 1 | Auto-close chat khi settle → tránh đại lý spam | Chat + Settlement | LOW |
| 2 | Auto-pause settlement khi dispute raise | Settlement + Dispute | **HIGH** |
| 3 | QC fail auto-reject deal? (hiện chỉ warning) | QC + Deal | MEDIUM |
| 4 | Partner delete cascade chưa test | Partner + Deal/Ledger | MEDIUM |
| 5 | Ledger vs Settlement reconciliation auto-check | Ledger + Settlement | MEDIUM |
| 6 | Advance allocation multi-deal — manual, có thể duplicate | Advance + Settlement | **HIGH** |
| 7 | Multi-currency: lock rate ở deal hay recalc khi settle? | Deal + Ledger | MEDIUM |
| 8 | Notification: deal accept/settle không notify partner | Deal + Settlement | LOW |

---

## 4. TOP 10 gaps nghiêm trọng — ưu tiên fix

| # | Gap | Severity | Effort | File |
|---|---|---|---|---|
| 1 | **Race condition tạo duplicate deals từ 1 booking** | 🔴 CRITICAL | MED | [dealConfirmService.ts](src/services/b2b/dealConfirmService.ts):100-120 |
| 2 | **Suspended partner vẫn tạo deal được** | 🔴 CRITICAL | LOW | [dealService.ts](src/services/b2b/dealService.ts):332 |
| 3 | **Settle trước khi dispute close → double ledger entry** | 🔴 CRITICAL | MED | [autoSettlementService.ts](src/services/b2b/autoSettlementService.ts) |
| 4 | **DRC/Giá edit sau accepted không lock + không audit log** | 🔴 CRITICAL | MED | [dealService.ts](src/services/b2b/dealService.ts):455 |
| 5 | **Advance > final_value không block → balance âm** | 🔴 HIGH | LOW | [autoSettlementService.ts](src/services/b2b/autoSettlementService.ts):137 |
| 6 | **Validation thiếu: quantity/price/advance ≤ 0** | 🔴 HIGH | LOW | Multiple services |
| 7 | **Settlement edit sau approve → ledger imbalance** | 🔴 HIGH | MED | [settlementService.ts](src/services/b2b/settlementService.ts) |
| 8 | **Ledger manual entry non-idempotent → retry = double** | 🟡 MED | MED | [ledgerService.ts](src/services/b2b/ledgerService.ts) |
| 9 | **Ledger period cutting rule không rõ** | 🟡 MED | LOW | [autoSettlementService.ts](src/services/b2b/autoSettlementService.ts):145 |
| 10 | **1 Batch ↔ nhiều Deals (no UNIQUE)** | 🟡 MED | MED | [rubberIntakeB2BService.ts](src/services/b2b/rubberIntakeB2BService.ts):47 |

---

## 5. RLS & permission gaps

- `b2b.*` RLS enabled với `current_partner_id()` — **nhưng chưa test JWT claim populate trên staging**
- `public.b2b_*` views: không chắc RLS inherit khi JOIN → test
- Factory user dùng `service_role` → bypass hoàn toàn. Nếu có factory user `authenticated` → cần check role = `factory_user`
- **Risk:** JWT claim populate sai → partner leaked data của partner khác

**Action:** Viết test suite RLS trên staging với 3 role (anon, partner_A, partner_B, factory) để verify policy hoạt động đúng.

---

## 6. Missing features (Nice-to-haves)

- 🎯 Advance auto-allocation theo FIFO khi submit settlement
- 🎯 Audit log universal (`b2b_changes` table qua trigger)
- 🎯 Notification engine (email/SMS/push) cho deal events
- 🎯 Partner tier auto-calc từ doanh số 12 tháng trượt
- 🎯 Aging report implementation (0/30/60/90+)
- 🎯 Export Excel/CSV cho tất cả list pages
- 🎯 Delivery mismatch alert (portal delivery qty ≠ stock-in qty)

---

## 7. Lộ trình fix đề xuất

### Sprint 1 (Critical — 1 tuần)
- [ ] Gap #1: Atomic confirm booking qua RPC
- [ ] Gap #2: Suspended partner check ở createDeal
- [ ] Gap #3: Settlement block khi active dispute
- [ ] Gap #5: Advance ≤ final_value validation
- [ ] Gap #6: Universal validation quantity/price > 0

### Sprint 2 (High — 1 tuần)
- [ ] Gap #4: Lock deal fields khi accepted + audit log trigger
- [ ] Gap #7: Lock settlement khi approved
- [ ] Cross #2: Auto-pause settlement khi dispute raise (overlap #3)

### Sprint 3 (Medium — 1 tuần)
- [ ] Gap #8: Idempotency key cho ledger manual entry
- [ ] Gap #9: Period cutting rule + backfill
- [ ] Gap #10: UNIQUE constraint batch-deal
- [ ] RLS test suite trên staging

### Sprint 4 (Nice-to-have — 2 tuần)
- [ ] Audit log universal
- [ ] Advance auto-allocation
- [ ] Notification engine
- [ ] Aging report
- [ ] Export Excel

---

## 8. Ghi chú

- Tất cả file citation đã verify đường dẫn tại thời điểm audit (2026-04-21). Line numbers có thể shift nếu commit thêm code.
- "CRITICAL" = có thể gây loss money/data corruption, "HIGH" = operational pain, "MED" = reporting/UX, "LOW" = polish.
- Fix cần đi kèm **migration SQL** + **test case** + **RLS update** (nếu đụng policy).
- Sau mỗi sprint, chạy audit lại — gaps mới có thể xuất hiện khi hệ thống evolve.
