# 🌿 B2B Intake — Kế hoạch triển khai micro-phase

**Ngày:** 2026-04-23
**Phiên bản:** 4.0 (micro-phase execution, ~40 bước nhỏ)
**Scope:** 🎯 **CHỈ B2B** (không động Sales)
**Triết lý:** code kỹ từng bước, test sau mỗi phase, tìm bug ngay không dồn đuôi

**Sơ đồ tham chiếu:**
- [B2B_FLOWS_PRESENTATION.html](B2B_FLOWS_PRESENTATION.html) — 10 mermaid diagrams
- [B2B_INTAKE_PROTOTYPE.html](B2B_INTAKE_PROTOTYPE.html) — UX 3 luồng

---

## 0. Nguyên tắc

### Workflow mỗi micro-phase
```
1. Đọc context (schema cũ + memory + gap) — 5 phút
2. Code/SQL phase đó — 15-90 phút
3. Build/migrate + verify — 5-10 phút
4. Test cụ thể (SQL query / manual UI / unit) — 5-15 phút
5. Tìm edge case + bug → fix tại chỗ
6. Commit (1 phase = 1 commit) + push
7. Update memory nếu gặp gotcha
```

### Size rule
- **Phase size:** 15 phút - 3 giờ (không hơn)
- **Commit size:** 1 concern per commit
- **Test criteria:** mỗi phase có PASS/FAIL check rõ ràng
- **Rollback:** mỗi SQL migration có DROP counterpart
- **Order:** schema trước, trigger sau, service sau nữa, UI cuối

### Bugs budget
- Dự kiến **3-5 bugs/phase** → không panic, fix ngay
- Khám phá được **edge case thật** (không phải lý thuyết) → update test plan
- Không skip test để chạy nhanh → vỡ sau đắt hơn

---

## 1. Context — hiện trạng B2B baseline

### Đã có (Sprint E-Q)
```
b2b.deals
├── purchase_type ❌ CHƯA CÓ
├── status (draft/processing/accepted/settled/cancelled)
├── Sprint J guards: cân + stock-in + advance chỉ khi accepted
├── trg_deal_lock: block actual_drc update khi đã accepted
└── Trigger tier auto-upgrade khi settled

b2b.partners
├── national_id ❌ CHƯA CÓ
├── nationality ❌ CHƯA CÓ
└── partner_type (đang dùng cho đại lý, chưa có household)

b2b.daily_price_list ❌ CHƯA CÓ

weighbridge_tickets
├── deal_id scalar (1 ticket = 1 deal)
├── has_items ❌ CHƯA CÓ
└── allocation_mode ❌ CHƯA CÓ

weighbridge_ticket_items ❌ CHƯA CÓ

stock_in_details
├── ticket_item_id ❌ CHƯA CÓ
└── deal_id ❌ CHƯA CÓ (hiện chỉ cha stock_in_orders.deal_id)
```

### 4 luồng mục tiêu

| # | Flow | purchase_type | Status path | Đặc thù |
|---|---|---|---|---|
| 📦 | Standard (giữ) | `standard` | draft→processing→accepted→settled | Chat/demand qua BGĐ |
| 🅰️ | Outright | `outright` | draft→processing→settled | Bypass QC+BGĐ, chi tiền tại cân |
| 🅱️ | DRC-after | `drc_after_production` | draft→processing→accepted→settled | QC mẫu → SX → actual_drc |
| 🅲 | Walk-in | `farmer_walkin` | draft→processing→settled | Hộ nông dân, chi tiền tại cân |

---

## 2. Micro-phase plan — 40 phases

### 🅰️ GIAI ĐOẠN A: Schema foundation (9 phases, ~4 giờ)

Tổng thời gian ~4 giờ dev + test. Từng phase commit riêng.

#### **P1** — Add `b2b.deals.purchase_type` (15 phút)
- Migration SQL idempotent: `ALTER TABLE b2b.deals ADD COLUMN purchase_type TEXT DEFAULT 'standard'`
- CHECK IN ('standard','outright','drc_after_production','farmer_walkin')
- Backfill: `UPDATE ... SET purchase_type='standard' WHERE NULL`
- SET NOT NULL
- **Test:** `SELECT purchase_type, COUNT(*) FROM b2b.deals GROUP BY 1` → tất cả 'standard'
- **Rollback:** `ALTER TABLE ... DROP COLUMN purchase_type`

#### **P2** — Add 3 audit cột `buyer_user_id`, `qc_user_id`, `sample_drc` (15 phút)
- ALTER ADD nullable
- **Test:** `\d b2b.deals` → 3 cột mới hiện
- **Rollback:** DROP COLUMN

#### **P3** — Add `finished_product_kg` cho flow 🅱️ (10 phút)
- ALTER ADD NUMERIC(12,2) nullable
- **Test:** `\d` verify

#### **P4** — Add `b2b.partners.national_id` + `nationality` (20 phút)
- ALTER ADD + UNIQUE INDEX trên national_id (WHERE NOT NULL)
- CHECK nationality IN ('VN','LAO')
- **Test:** INSERT 2 partner cùng national_id → reject 2nd
- **Gotcha:** CCCD 12 số VN ≠ hộ chiếu LAO format khác → regex khác nhau

#### **P5** — Create `b2b.daily_price_list` với tstzrange EXCLUDE (30 phút)
- CREATE TABLE với EXCLUDE gist constraint
- Cần extension `btree_gist` (check có chưa)
- **Test SQL:**
  ```sql
  INSERT INTO b2b.daily_price_list (product_code, base_price_per_kg, effective_from)
    VALUES ('mu_tap', 12000, NOW());
  -- Thêm row overlap → expect reject
  INSERT INTO b2b.daily_price_list (product_code, base_price_per_kg, effective_from)
    VALUES ('mu_tap', 13000, NOW() - INTERVAL '1 hour');
  -- EXCLUDE violation expected
  ```
- **Bug predicted:** extension btree_gist chưa có → fail. Cần `CREATE EXTENSION IF NOT EXISTS btree_gist;`

#### **P6** — Create `weighbridge_ticket_items` table (30 phút)
- Full schema §4.2 v3
- CHECK exactly one source (deal_id XOR partner_id XOR supplier_id)
- UNIQUE (ticket_id, line_no)
- Index trên ticket_id + deal_id (WHERE NOT NULL)
- **Test:** insert 3 rows khác source — check constraint fire đúng

#### **P7** — Add `weighbridge_tickets.has_items` + `allocation_mode` (15 phút)
- ALTER ADD BOOLEAN DEFAULT FALSE
- CHECK allocation_mode IN ('by_share','direct')
- **Test:** default ticket cũ has_items=false không break query hiện tại

#### **P8** — Add 3 cột `stock_in_details` (15 phút)
- ticket_item_id UUID REFERENCES
- deal_id UUID REFERENCES
- lot_code TEXT
- Tất cả nullable (backward-compat)
- **Test:** `\d stock_in_details` verify

#### **P9** — Regenerate Supabase types + rebuild ERP + weighbridge (45 phút)
- `npx supabase gen types typescript > src/types/database.types.ts`
- Update Deal interface trong dealService.ts thủ công nếu cần
- `npm run build` ERP + `apps/weighbridge/`
- **Test:** tsc không lỗi, vite build xanh
- **Bug predicted:** interface TypeScript mismatch với schema mới, ~5-10 TS errors cần fix

**Gate Gate Giai đoạn A:** schema OK, build xanh, không break standard flow hiện tại (regression smoke test).

---

### 🅱️ GIAI ĐOẠN B: Multi-lot trigger + helper (4 phases, ~3 giờ)

#### **P10** — Function `allocate_ticket_item_weights()` (45 phút)
- CREATE FUNCTION (xem §4.3 v3)
- Logic: mode `by_share` = prorata, mode `direct` = strict match
- **Test SQL chi tiết:**
  ```sql
  -- Setup
  INSERT INTO weighbridge_tickets (id, net_weight, has_items, allocation_mode)
    VALUES ('T1', 985, TRUE, 'by_share');
  INSERT INTO weighbridge_ticket_items (ticket_id, line_no, deal_id, rubber_type, declared_qty_kg)
    VALUES ('T1', 1, 'D1', 'mu_tap', 500),
           ('T1', 2, 'D2', 'mu_nuoc', 300),
           ('T1', 3, 'D3', 'mu_tap', 200);
  -- Update net_weight trigger nên fire
  UPDATE weighbridge_tickets SET net_weight=985 WHERE id='T1';
  -- Expect actual_qty_kg = [492.5, 295.5, 197]
  SELECT line_no, actual_qty_kg FROM weighbridge_ticket_items WHERE ticket_id='T1';
  ```
- **Bug predicted:** ROUND precision có thể lệch sum±0.01 → tạo ra NET=985.01 thay vì 985. Test edge.

#### **P11** — Trigger `trg_items_allocate_on_insert/update` (15 phút)
- AFTER INSERT OR UPDATE trên weighbridge_ticket_items
- WHEN tuned để không recompute khi chỉ update notes
- **Test:** Update declared_qty_kg → actual recompute; update notes → không fire

#### **P12** — Trigger `trg_ticket_allocate_on_weigh` (15 phút)
- AFTER UPDATE OF net_weight ON weighbridge_tickets
- WHEN (NEW.has_items = true)
- **Test:** Update ticket.net_weight → items auto allocate

#### **P13** — Helper `getTicketLines()` + unit test (1 giờ)
- Create `src/services/weighbridge/ticketLinesService.ts`
- Logic: nếu has_items → query items; else synthesize 1 line từ scalar
- Return type unified: `TicketLine[]` với `_source: 'scalar'|'item'`
- **Test:** 2 case — legacy ticket (has_items=false) + new ticket (has_items=true) cùng trả shape nhất quán

**Gate B:** Chạy `.tmp/test_multi_lot.py` với 4 case (ML-1 through ML-4 từ v3 §8.8).

---

### 🅲 GIAI ĐOẠN C: Đặc thù đại lý Flow 🅱️ (5 phases, ~3.5 giờ)

#### **P14** — Schema `production_mode`, `pool_id`, `production_sla_days` (20 phút)
- ALTER b2b.deals ADD 3 cột
- production_mode DEFAULT 'pooled' CHECK IN ('pooled','isolated')
- production_sla_days INT DEFAULT 7
- production_pool_id UUID nullable
- **Test:** verify column added

#### **P15** — Schema `production_reject_reason`, `reject_loss_amount` + `production_started_at` (15 phút)
- ALTER ADD với CHECK reject_reason IN ('raw_material_quality','production_error','force_majeure')
- `production_sla_deadline` GENERATED column = started_at + sla_days
- **Test:** INSERT reject_reason='invalid' → reject

#### **P16** — Trigger `auto_raise_drc_dispute` (1 giờ)
- Function check |actual - sample| > 3%
- AFTER UPDATE OF actual_drc ON b2b.deals
- WHEN purchase_type='drc_after_production'
- INSERT vào b2b.drc_disputes với status='open'
- **Test SQL:**
  ```sql
  UPDATE b2b.deals SET actual_drc=30 WHERE id='D-drc' AND sample_drc=35;
  -- Expect: drc_disputes có 1 row mới với reason "variance 5%"
  ```
- **Bug predicted:** drc_disputes có dispute_number NOT NULL không có default → cần generate trong trigger
- **Bug predicted:** raised_by NOT NULL → dùng NULL hay auth.uid()? → cần set 'system' user riêng

#### **P17** — Service `previewSettlement(deal)` (45 phút)
- `src/services/b2b/dealService.ts::previewSettlement(dealId)`
- Tính gross estimated từ sample_drc + range ±5%
- Return `{estimated_gross, estimated_remaining, range: {low, high}, disclaimer}`
- Unit test với mock data 3 case: sample có / không có / standard flow
- **Test:** Call với deal drc_after_production → trả range hợp lý

#### **P18** — Service `productionProgressService.getTimeline(dealId)` (45 phút)
- Return array stages với status (done/current/pending) + timestamp
- Stages: cân → nhập kho → QC sample → BGĐ duyệt → tạm ứng → SX → ra TP → QC final → quyết toán → thanh toán
- **Test:** Mock deal ở các status khác nhau → trả timeline đúng

**Gate C:** Test DRC variance trigger fire đúng + preview range hợp lý + timeline display OK.

---

### 🅳 GIAI ĐOẠN D: Triggers bypass Sprint J (3 phases, ~2 giờ)

#### **P19** — Rewrite `trg_enforce_weighbridge_accepted` (1 giờ)
- Logic mới:
  - Nếu ticket.has_items=false: giữ logic cũ + exception outright/walk-in
  - Nếu has_items=true: loop items, mỗi item nếu có deal_id thì check status
- Exception: `purchase_type IN ('outright','farmer_walkin')` + `buyer_user_id IS NOT NULL` → allow
- **Test 5 case:**
  1. Standard deal processing → reject ✅
  2. Standard deal accepted → allow ✅
  3. Outright deal processing → allow (bypass) ✅
  4. Outright không có buyer_user_id → reject (guard) ✅
  5. Multi-lot 3 items, 1 item deal processing → reject, 2 item OK → reject all (safest)

#### **P20** — Rewrite `trg_enforce_b2b_stock_in_accepted` (30 phút)
- Tương tự P19 cho stock_in
- **Test:** 4 case tương ứng

#### **P21** — Exception `trg_deal_lock` cho flow 🅱️ (30 phút)
- Cho phép actual_drc update 1 lần NULL → value khi purchase_type='drc_after_production'
- Sau value → lock bất biến
- **Test 3 case:**
  1. Flow B deal accepted, actual_drc NULL → set 35.5 ✅
  2. Flow B deal có actual_drc, update lại → reject ❌
  3. Standard deal → giữ logic cũ (block update sau accepted) ❌

**Gate D:** 3 flow happy path + 2 regression standard flow PASS. 12 test case tổng.

---

### 🅴 GIAI ĐOẠN E: Services foundation (5 phases, ~4 giờ)

#### **P22** — `dailyPriceListService` CRUD + `getCurrent()` (1 giờ)
- File mới `src/services/b2b/dailyPriceListService.ts`
- Methods: list, create, update, delete, getCurrent(productCode, at=NOW)
- **Test:** getCurrent với overlap time → trả row effective đúng

#### **P23** — `partnerService.quickCreateHousehold()` + CCCD validate (45 phút)
- Method mới với regex CCCD VN 12 số
- Throw error rõ ràng nếu CCCD fail
- Auto tier='new', partner_type='household', nationality='VN'
- **Test:** 3 case — CCCD hợp lệ / 11 số / 13 số / có chữ cái

#### **P24** — `batchService.generateBatchCode()` extension (30 phút)
- Accept `options: { purchase_type, nationality }`
- LAO- prefix nếu nationality='LAO'
- PCB- nếu drc_after_production
- FW- nếu farmer_walkin
- Giữ NVL- default
- **Test:** 4 combination → 4 prefix khác nhau

#### **P25** — `autoSettlementService.createFromTicket()` multi-lot fan-out (1.5 giờ)
- Input: ticketId
- Call `getTicketLines()` → group by deal_id
- Create settlement per deal group
- Partner-only lines (walk-in) → path riêng, tạo settlement không link deal
- **Test:** ML-3 + ML-4 + ML-7 từ §8.8 v3

#### **P26** — Guard tier advance max (30 phút)
- Constants `ADVANCE_MAX_PERCENT_BY_TIER = {diamond:0.85, gold:0.70, silver:0.55, bronze:0.40, new:0.25}`
- Sửa `advanceService.createAdvance` reject nếu > max
- Error message rõ: "Tạm ứng vượt hạn mức tier gold 70% (max: X đ)"
- **Test:** 5 tier × 2 case (trong/ngoài max)

**Gate E:** Unit test suite cho 5 service PASS.

---

### 🅵 GIAI ĐOẠN F: Orchestrators (3 phases, ~6 giờ)

#### **P27** — `intakeOutrightService.execute()` (2 giờ)
- Transaction 1-shot RPC function hoặc service wrapper
- Steps: createDeal(purchase_type='outright') → createTicket → stockIn → advance (nếu có) → settlement → payment
- Rollback nếu bất kỳ step fail
- Return: `{deal, ticket, stock_in, settlement, payment, receipt_url}`
- **Test:** Happy path + 3 fail case (partner không có, giá âm, net=0)

#### **P28** — `intakeWalkinService.execute()` (2 giờ)
- Tương tự outright nhưng lookup daily price + quickCreateHousehold nếu partner mới
- **Test:** Happy path + 2 edge (chưa có bảng giá hôm nay, CCCD duplicate)

#### **P29** — `intakeProductionService` + hook `productionOutputHookService` (2 giờ)
- productionOutputHookService.onFinish(po_id) — chạy khi production_orders.finished_at set
- Compute actual_drc = finished_product_kg / nvl_kg × 100
- Update deal.actual_drc → trigger auto-dispute fire nếu variance > 3%
- Call createFromTicket → settlement
- **Test:** 3 case (variance 1% → no dispute, variance 5% → dispute, nvl_kg=0 → error handling)

**Gate F:** E2E test 3 flow mỗi flow 1 happy + 2 fail case PASS.

---

### 🅶 GIAI ĐOẠN G: UI components (6 phases, ~10 giờ)

#### **P30** — Component `<MultiLotEditor/>` (3 giờ)
- Ant Design Table editable
- Mặc định 1 dòng + nút "+ Thêm lô"
- Mỗi dòng: Source (deal/partner/supplier dropdown), Rubber type, Declared qty, DRC, Unit price
- Validation: exactly 1 source, qty > 0
- Auto-compute line_amount preview
- Mode toggle by_share / direct
- **Test manual:** render với 1/2/5 dòng, xóa dòng, switch mode

#### **P31** — `OutrightWizardPage` 4-step (2 giờ)
- Step 1: Partner + product + giá cáp + DRC cáp
- Step 2: MultiLotEditor (default 1 line)
- Step 3: Weighbridge integration (open scale in new tab or embed)
- Step 4: Settlement preview + "Chi tiền + In phiếu" button
- **Test UI:** navigate next/back/skip steps, validation errors hiện đúng

#### **P32** — `WalkinWizardPage` 4-step (2 giờ)
- Step 1: Quick create household (CCCD + name + phone)
- Step 2: QC DRC input + product type
- Step 3: Weighbridge + daily price lookup
- Step 4: Settlement cash modal + receipt
- **Test:** CCCD validate realtime, daily price auto-load

#### **P33** — `ProductionWizardPage` 8-step + ProductionProgress (3 giờ)
- Step 1-3: partner + product + sample_drc + BGĐ duyệt
- Step 4: Weighbridge + stock-in
- Step 5: Advance (tier-based max warning)
- Step 6: SX hook (link production_order)
- Step 7: QC final + actual_drc (có variance warning)
- Step 8: Settlement preview + confirm
- Progress timeline component render realtime
- **Test:** 8 step navigate + tier advance reject test

#### **P34** — `DailyPriceListPage` admin (1 giờ)
- Table list + add/edit/delete
- Warning đỏ nếu hôm nay chưa có giá cho product quan trọng
- **Test:** CRUD basic

#### **P35** — Portal partner `/deals/:id/production` timeline (1.5 giờ)
- Reuse ProductionProgress component từ ERP
- Supabase realtime subscribe `b2b.deals.status` + production_orders
- **Test:** Open 2 tab (ERP + portal), update status ERP → portal reload &lt; 2s

**Gate G:** Manual UI test 4 wizard + 2 admin page + 1 portal page PASS.

---

### 🅷 GIAI ĐOẠN H: Weighbridge app (4 phases, ~4 giờ)

#### **P36** — App cân schema compat + source_type (30 phút)
- Check weighbridge_tickets.source_type? Hiện có hay cần add?
- Nếu thiếu: ADD column nullable
- Seed weighbridge_scales nếu chưa có
- **Test:** app cân load không lỗi

#### **P37** — App cân multi-lot UI (2 giờ)
- Integrate `<MultiLotEditor/>` vào WeighingPage (share code với ERP)
- Giữ mode 1-dòng mặc định (backward compat operator cũ)
- **Test:** operator nhập 3 dòng khác deal → auto-allocate đúng

#### **P38** — App cân settlement modal (outright + walkin) (1 giờ)
- Sau khi cân xong + purchase_type='outright' hoặc 'farmer_walkin':
  - Hiện modal "Chi tiền + In phiếu"
  - Compute auto từ line_amount
  - Button "Đã chi" → update settlement status='paid'
- **Test:** 2 case outright + walkin + print receipt dạng PDF

#### **P39** — App cân QC DRC input (walk-in) (30 phút)
- Field mới xuất hiện khi purchase_type='farmer_walkin'
- QC nhập DRC measured tại cân, save vào item.drc_percent
- **Test:** walkin flow hoàn chỉnh từ cân → chi tiền

---

### 🅸 GIAI ĐOẠN I: Testing + Bug hunt (3 phases, ~4 giờ)

#### **P40** — E2E Python test script `.tmp/e2e_b2b_intake.py` (1.5 giờ)
- 4 luồng × (1 happy + 2 edge) = 12 scenarios
- + 8 multi-lot ML-1..ML-8
- + 6 đặc thù đại lý E1-E6
- Total ~26 scenarios
- Chạy qua service_role REST + agent_sql
- **Expected:** 26/26 PASS

#### **P41** — Manual UI smoke test (1 giờ)
- Chạy dev server ERP + weighbridge + portal song song
- Test mỗi wizard + progress + admin page
- Document bugs vào `.tmp/bugs_intake_v4.md`

#### **P42** — Bug fix pass (1.5 giờ)
- Fix 5-10 bugs tìm được
- Commit riêng per bug
- Regression test sau fix

**Gate I:** 26 E2E PASS + 0 blocking UI bug.

---

### 🅹 GIAI ĐOẠN J: Production deploy (3 phases, ~2 giờ + monitor 48h)

#### **P43** — Deploy wave 1 (30 phút)
- Apply SQL migration Sprint A-C (nullable, backward-compat)
- Không deploy FE
- **Verify:** standard flow vẫn chạy bình thường 30 phút sau migrate

#### **P44** — Deploy wave 2 (30 phút)
- Apply SQL trigger bypass (Sprint D)
- Deploy FE ERP service layer (không UI mới)
- **Verify:** API test PASS, không break

#### **P45** — Deploy wave 3 (30 phút)
- Deploy FE UI full (wizards + portal progress)
- Deploy weighbridge app v2
- **Monitor 48h:** error rate < 1%, DRC dispute rate < 5%, settlement mismatch = 0

**Gate J:** 48h monitor green → sprint hoàn thành.

---

## 3. Tổng kết effort 45 phases

| Giai đoạn | Phases | Hours | Gate criteria |
|---|---|---|---|
| 🅰️ Schema foundation | P1-P9 | 4h | Schema verify + build xanh + regression OK |
| 🅱️ Multi-lot trigger | P10-P13 | 3h | ML-1..ML-4 test PASS |
| 🅲 Đặc thù đại lý | P14-P18 | 3.5h | DRC variance trigger + preview OK |
| 🅳 Triggers bypass | P19-P21 | 2h | 12 test case (3 flow + regression) PASS |
| 🅴 Services foundation | P22-P26 | 4h | 5 service unit test PASS |
| 🅵 Orchestrators | P27-P29 | 6h | E2E 3 flow × 3 case PASS |
| 🅶 UI components | P30-P35 | 10h | Manual UI test 7 pages PASS |
| 🅷 Weighbridge app | P36-P39 | 4h | Operator workflow 4 flow OK |
| 🅸 Testing + bug hunt | P40-P42 | 4h | 26 E2E + 0 blocking bug |
| 🅹 Production deploy | P43-P45 | 2h + 48h monitor | Error rate < 1% |
| **Tổng** | **45 phases** | **~43h dev + 48h monitor** | ≈ 5-6 ngày full-time hoặc 10-12 ngày part-time |

**Chốt:** ~1.5-2 tuần calendar time nếu code liên tục, test kỹ, fix bug tại chỗ. So với v3 nói 4-5 tuần → rút còn ~2 tuần vì không cần wait BGĐ approve + không có padding.

---

## 4. Test cases — chi tiết tập trung

### 4.1 Multi-lot (8 cases)

| ID | Scenario | Expected |
|---|---|---|
| ML-1 | 1 ticket 3 items by_share NET=985 declared=[500,300,200] | actual=[492.5, 295.5, 197] |
| ML-2 | 1 ticket 2 items direct declared=[600,400] NET=1000 | actual=[600,400] (pass) |
| ML-3 | 1 ticket 2 items same deal | 1 settlement 2 intake_ids |
| ML-4 | 1 ticket 3 items 3 deals khác | 3 settlement riêng |
| ML-5 | Legacy ticket has_items=false | `getTicketLines()` trả array 1 phần tử |
| ML-6 | 1 ticket 3 items, 1 item deal pending | RAISE EXCEPTION name deal vi phạm |
| ML-7 | 2 farmer walk-in chung xe (partner_id only) | createFromTicket bypass deal path |
| ML-8 | Update item.drc_percent | line_amount recalc |

### 4.2 Đặc thù đại lý Flow 🅱️ (6 cases)

| ID | Scenario | Expected |
|---|---|---|
| E1 | Đại lý gộp 2 lô sample_drc khác | Multi-lot: mỗi lô 1 item, settlement riêng |
| E2 | Đại lý rút mủ trước SX | Cancel deal, reverse ledger, refund advance |
| E3 | Production yield < 80% | Auto-pause settlement, notification BGĐ |
| E4 | 2 deal cùng đại lý 1 pool SX | Allocate TP theo tỷ lệ nvl_kg |
| E5 | Tỷ giá thay đổi | advance_fx_rate vs settlement_fx_rate riêng |
| E6 | Partner tier downgrade giữa chừng | Lock advance max theo tier lúc cân |

### 4.3 4 flow happy path + edge

Mỗi flow: 1 happy + 2 edge = 12 scenarios:

| Flow | Happy | Edge 1 | Edge 2 |
|---|---|---|---|
| Standard | Chat booking → settled | Partner tier downgrade | Dispute mid-flow |
| Outright | 1-shot cân + chi tiền | buyer_user_id NULL → reject | Giá cáp âm → reject |
| DRC-after | Full 8 step | Variance 5% → auto-dispute | SLA quá hạn → advance bổ sung |
| Walk-in | Cân + chi tiền | CCCD duplicate → household lookup | Daily price missing → UI đỏ |

---

## 5. Bug tracking

Tạo `.tmp/bugs_intake_v4.md` sau mỗi phase, format:
```
## P<N> — <title>
- Date: YYYY-MM-DD HH:MM
- Phase: P<N>
- Description: ...
- Root cause: ...
- Fix: commit <sha>
- Severity: critical/high/med/low
```

Dự đoán **~15-20 bugs** qua 45 phases (3-5% bug rate). Cuối giai đoạn I sẽ có cleanup pass.

---

## 6. Schema changes consolidated

### 6 migration files

| File | Phases | Purpose |
|---|---|---|
| `b2b_intake_p1_deals_schema.sql` | P1-P3 | deals +5 cột |
| `b2b_intake_p4_partners_household.sql` | P4 | household + CCCD |
| `b2b_intake_p5_daily_price_list.sql` | P5 | daily price tstzrange |
| `b2b_intake_p6_multi_lot.sql` | P6-P8, P10-P12 | items table + trigger |
| `b2b_intake_p14_agent_hardening.sql` | P14-P16 | 6 đặc thù đại lý |
| `b2b_intake_p19_bypass_triggers.sql` | P19-P21 | Sprint J exception |

Mỗi file idempotent (DROP IF EXISTS + CREATE). Có rollback SQL counterpart.

---

## 7. Files tạo mới

```
src/services/b2b/
├── dailyPriceListService.ts       (P22)
├── intakeOutrightService.ts       (P27)
├── intakeWalkinService.ts         (P28)
├── intakeProductionService.ts     (P29)
├── productionOutputHookService.ts (P29)
├── productionProgressService.ts   (P18)
└── dealService.ts (extend P17)

src/services/weighbridge/
└── ticketLinesService.ts          (P13)

src/components/b2b/
├── MultiLotEditor.tsx             (P30)
└── ProductionProgress.tsx         (P18)

src/pages/b2b/intake/
├── OutrightWizardPage.tsx         (P31)
├── WalkinWizardPage.tsx           (P32)
└── ProductionWizardPage.tsx       (P33)

src/pages/b2b/settings/
└── DailyPriceListPage.tsx         (P34)

src/pages/b2b/deals/
└── ProductionTimelinePortal.tsx   (P35, portal)

apps/weighbridge/src/pages/
└── WeighingPageV2.tsx (hoặc extend) (P36-P39)
```

---

## 8. 13 defaults BGĐ (không cần approve, dùng luôn)

| # | Config | Default |
|---|---|---|
| 1 | Range DRC cáp | 25-70%, warning ±10% trung bình 30d |
| 2 | Công thức flow 🅰️ | qty × price |
| 3 | Chụp ảnh | Bắt buộc 2 ảnh (xe + mẫu) |
| 4 | Bảng giá | daily_price_list, admin nhập 7h sáng |
| 5 | Tier advance max | diamond 85 / gold 70 / silver 55 / bronze 40 / new 25 |
| 6 | Trừ phí SX | KHÔNG (ghi riêng production_cost) |
| 7 | CMND flow 🅲 | Bắt buộc |
| 8 | Farmer table | b2b.partners type='household' |
| 9 | Hộ LAO flow 🅲 | KHÔNG (đi flow 🅰️) |
| 10 | Production mode | pooled default, isolated tier gold+ |
| 11 | DRC variance threshold | 3% → auto dispute |
| 12 | Production SLA | 7 ngày (diamond 5d / gold 7d / silver 10d) |
| 13 | Reject loss split | raw→đại lý 100%, production→nhà máy 100%, force→50/50 |

---

## 9. Current status + next step

### Trạng thái trước Phase 1
- Schema B2B baseline Sprint E-Q stable
- Portal fix 4 bug (commit b96f21d3, d42d8fc0, 43f32aa5, 54b4b47c)
- Sales module permission tách riêng (commit 5d9cc769 không đụng)
- Documentation: FLOWS_PRESENTATION + INTAKE_PROTOTYPE + ROADMAP v4 này

### Bắt đầu Phase 1 (P1 — Add purchase_type)
Ready để chạy ngay. Không cần BGĐ approve. Chỉ cần:
1. User confirm "start P1"
2. Tôi viết SQL + apply via agent_sql + commit
3. Next phase tiếp

**Cũng OK nếu user muốn:**
- Skip đến phase nào
- Đổi thứ tự
- Chia nhỏ hơn nữa phase nào khó
- Pause giữa chừng

---

## 10. Rule guard

1. **Không skip test.** Gate mỗi giai đoạn phải PASS mới qua.
2. **1 phase = 1 commit** (trừ phase quá lớn chia 2-3 commit).
3. **Schema migration idempotent + có rollback.**
4. **Bug tìm được → commit fix ngay.** Không dồn đuôi.
5. **Memory update** nếu phát hiện gotcha hoặc quy tắc mới.
6. **48h monitor** sau deploy wave 3.
7. **Standard flow không được break** suốt 45 phases.

---

**File canonical duy nhất cho B2B intake. v1, v2, v3 đã deprecated.**

Ready P1 → start ngay.
