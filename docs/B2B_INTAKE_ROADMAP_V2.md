# B2B Intake Migration Roadmap — v2

**Ngày:** 2026-04-23
**Scope:** 🎯 **CHỈ B2B** (không động đến module Sales)
**Nguồn tham chiếu:**
- [B2B_INTAKE_PROTOTYPE.html](B2B_INTAKE_PROTOTYPE.html) — UX 3 luồng
- [B2B_FLOWS_PRESENTATION.html](B2B_FLOWS_PRESENTATION.html) — sơ đồ luồng (10 mermaid diagrams đã có, không vẽ lại)
- v1 roadmap: [B2B_INTAKE_MIGRATION_ROADMAP.md](B2B_INTAKE_MIGRATION_ROADMAP.md)

**Thay đổi chính v1 → v2:**
1. ✅ Trả lời 9 câu `?` với giá trị default BGĐ có thể approve nhanh
2. ✅ Status flow rõ cho 3 luồng (bảng chi tiết status path)
3. ✅ **Multi-lot vào Sprint A** (thay vì §8 defer) — là core không phải add-on
4. ✅ RLS household + daily price timezone fixed
5. ✅ Hỗ trợ rollback từng Sprint nếu cần

---

## 1. 3 luồng B2B — tóm gọn

| # | Luồng | Đối tượng | Đặc thù | Status flow |
|---|---|---|---|---|
| 🅰️ | **Outright** (mua đứt) | Đại lý VN · Hộ Lào | DRC cáp kinh nghiệm → bypass QC/BGĐ → chi tiền tại cân | `draft → processing → settled` |
| 🅱️ | **DRC-after-production** | Đại lý (tier ≥ silver) | QC mẫu → BGĐ duyệt → chạy SX → DRC = TP/NVL → quyết toán | `draft → processing → accepted → settled` |
| 🅲 | **Farmer walk-in** | Hộ nông dân VN | QC đo DRC tại cân → chi tiền mặt ngay | `draft → processing → settled` |

**Standard** (current chat/demand flow): giữ nguyên — `purchase_type='standard'`.

### Status flow chi tiết — state diagram

```
┌──────────────────────────────────────────────────────┐
│  STANDARD (chat/demand — hiện tại)                    │
│  draft → processing → accepted → settled              │
│          ↑ QC         ↑ BGĐ     ↑ Settlement paid     │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  OUTRIGHT (Flow 🅰️) — bypass QC + BGĐ                  │
│  draft → processing → settled (1-shot)                │
│          ↑ DRC cáp kinh nghiệm (buyer_user_id lock)   │
│  Sprint J guard BYPASS via purchase_type='outright'   │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  DRC-AFTER (Flow 🅱️) — giống standard + 2 chi tiết     │
│  draft → processing → accepted → settled              │
│          ↑ sample_drc  ↑ BGĐ   ↑ production_finish    │
│  Exception: trg_deal_lock cho phép actual_drc=NULL    │
│             → giá trị (1 lần duy nhất)                │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  WALK-IN (Flow 🅲) — hộ nông dân                       │
│  draft → processing → settled (1-shot)                │
│          ↑ QC DRC at weighbridge                       │
│  Sprint J guard BYPASS via purchase_type='farmer_walkin'│
└──────────────────────────────────────────────────────┘
```

---

## 2. Câu trả lời 9 `?` — default BGĐ approve

> Dùng luôn giá trị này nếu BGĐ không muốn debate. Mỗi câu có "nếu khác" để BGĐ override.

| # | Câu hỏi | **Default approve ngay** | Nếu BGĐ muốn khác |
|---|---|---|---|
| 1 | Range DRC cáp? | **25% ≤ drc ≤ 70%**, warning nếu lệch trung bình 30 ngày ± 10% | Hardcode từng grade riêng |
| 2 | Công thức flow 1? | **A: qty × price** (DRC đã bake vào price) | B: qty × drc × price_base (cần bảng base) |
| 3 | Chụp ảnh xe/mủ? | **Bắt buộc 2 ảnh**: toàn xe + mẫu mủ | Optional nhưng khuyến nghị |
| 4 | Nguồn bảng giá? | **Table `b2b.daily_price_list`**, admin nhập mỗi sáng 7h | API giá cao su quốc tế (SMR/RSS) |
| 5 | Tier max advance %? | **diamond 85% · gold 70% · silver 55% · bronze 40% · new 25%** | Dynamic negotiate per deal |
| 6 | Trừ phí sản xuất? | **KHÔNG trừ** (settlement gross = final). Phí SX ghi riêng production_cost | Trừ 3-5% cháy đầu ra |
| 7 | CMND flow 3? | **Bắt buộc** (GTGT + audit) | Optional nếu &lt; 500kg |
| 8 | Farmer table? | **Mở rộng `b2b.partners` + `partner_type='household'`** | Tách table riêng |
| 9 | Hộ LAO đi flow 3? | **KHÔNG** — LAO đi flow 1 (outright) có đại lý | Cho phép nếu có hộ chiếu |

**Action:** gửi 9 default này cho BGĐ — approve qua email/chat 1 lần → khởi động Sprint A.

---

## 3. Gap cần fix (trừ Sales) — prioritized

### 3.1 Schema `b2b.deals` — add 5 columns

| Column | Kiểu | Purpose | Flow |
|---|---|---|---|
| `purchase_type` | ENUM('outright','drc_after_production','farmer_walkin','standard') | Phân luồng | All |
| `buyer_user_id` | UUID FK auth.users | Người cáp DRC outright | 🅰️ |
| `qc_user_id` | UUID FK auth.users | Người đo DRC | 🅱️🅲 |
| `sample_drc` | NUMERIC(5,2) | DRC mẫu QC trước sản xuất | 🅱️ |
| `finished_product_kg` | NUMERIC(12,2) | KL thành phẩm sau sản xuất | 🅱️ |

Các cột có sẵn tận dụng: `actual_drc`, `actual_weight_kg`, `expected_drc`, `product_type`.

### 3.2 Schema `b2b.partners` — extend household

```sql
ALTER TABLE b2b.partners
  ADD COLUMN national_id TEXT UNIQUE,      -- CCCD 12 số, validate VN regex
  ADD COLUMN nationality TEXT DEFAULT 'VN' CHECK (nationality IN ('VN','LAO'));
-- partner_type: ADD VALUE 'household' (nếu enum) hoặc update CHECK
```

### 3.3 Schema mới — `daily_price_list`

```sql
CREATE TABLE b2b.daily_price_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- ← timezone-aware (fix gap v1)
  effective_to   TIMESTAMPTZ,                          -- NULL = chưa có giá mới
  product_code   TEXT NOT NULL,
  base_price_per_kg NUMERIC(12,2) NOT NULL,
  notes TEXT,
  created_by UUID,
  EXCLUDE USING gist (
    product_code WITH =,
    tstzrange(effective_from, effective_to) WITH &&
  )                                                    -- ← chặn overlap
);
```

**Vì sao bỏ `DATE`:** Tài xế cân 23:59 vs 00:01 phải lấy giá file khác nhau → dùng `TIMESTAMPTZ` với range không overlap (gist EXCLUDE).

### 3.4 Schema CORE — `weighbridge_ticket_items` (multi-lot) ⭐

**Đẩy từ §8 v1 LÊN Sprint A** — đây không phải nice-to-have, mà core không có không chạy được S1-S4 case (xe 2 lô, xe gom N hộ).

```sql
CREATE TABLE weighbridge_ticket_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES weighbridge_tickets(id) ON DELETE CASCADE,
  line_no INT NOT NULL,

  -- EXACTLY 1 of 3 source (CHECK)
  deal_id      UUID REFERENCES b2b_deals(id),
  partner_id   UUID REFERENCES b2b_partners(id),
  supplier_id  UUID REFERENCES rubber_suppliers(id),

  rubber_type TEXT NOT NULL,
  lot_code TEXT,
  declared_qty_kg NUMERIC(12,2) NOT NULL CHECK (declared_qty_kg > 0),
  actual_qty_kg NUMERIC(12,2),      -- auto-compute by trigger
  drc_percent NUMERIC(5,2),
  unit_price NUMERIC(12,2),
  line_amount_vnd NUMERIC(14,2),    -- auto-compute
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (ticket_id, line_no),
  CONSTRAINT chk_exactly_one_source CHECK (
    (deal_id IS NOT NULL)::INT +
    (partner_id IS NOT NULL)::INT +
    (supplier_id IS NOT NULL)::INT = 1
  )
);

ALTER TABLE weighbridge_tickets
  ADD COLUMN has_items BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN allocation_mode TEXT NOT NULL DEFAULT 'by_share'
    CHECK (allocation_mode IN ('by_share','direct'));

ALTER TABLE stock_in_details
  ADD COLUMN ticket_item_id UUID REFERENCES weighbridge_ticket_items(id),
  ADD COLUMN deal_id UUID REFERENCES b2b_deals(id),
  ADD COLUMN lot_code TEXT;
```

---

## 4. Sprint Plan v2 — 5 sprints + QA

Tổng effort: **15-20 ngày (3-4 tuần)** — rút gọn từ v1 (18.5-23.5 ngày) nhờ move multi-lot lên Sprint A (tránh rework).

### 🅰️ Sprint A — Foundation (4 ngày) | CRITICAL

**Deliverable:** Schema đầy đủ + multi-lot infra + Deal interface TS update.

| Task | Effort |
|---|---|
| A.1 Migration `b2b.deals` add 5 columns + CHECK purchase_type | 0.5 |
| A.2 Migration `b2b.partners` household + CCCD validate | 0.5 |
| A.3 Migration `b2b.daily_price_list` with tstzrange EXCLUDE | 0.5 |
| A.4 Migration `weighbridge_ticket_items` + `has_items` flag | 0.5 |
| A.5 Trigger `allocate_ticket_item_weights` (by_share / direct) | 0.5 |
| A.6 Backfill: deals.purchase_type = 'standard' WHERE NULL | 0.2 |
| A.7 Regenerate Supabase types + update `Deal` interface TS | 0.5 |
| A.8 Helper `getTicketLines(ticketId)` unify scalar + items | 0.5 |
| A.9 Build + tsc pass, migration safe re-run (DROP IF EXISTS) | 0.3 |

**Gate out:** chạy pg_policies + pg_constraint verify; `npm run build` xanh; không break deal test hiện tại.

### 🅱️ Sprint B — Unblock triggers (1.5 ngày) | HIGH

**Deliverable:** Sprint J + deal_lock guards mở exception cho 3 luồng mới.

| Task | Effort |
|---|---|
| B.1 Rewrite `trg_enforce_weighbridge_accepted` — support `has_items` + bypass `outright`/`farmer_walkin` | 0.5 |
| B.2 Rewrite `trg_enforce_b2b_stock_in_accepted` — tương tự | 0.3 |
| B.3 Update `trg_deal_lock` — exception cho flow 🅱️ actual_drc NULL→value | 0.3 |
| B.4 Test 3 flow happy path + 2 negative (cố ý vi phạm) | 0.4 |

**Gate out:** 5 test cases PASS (flow 🅰️/🅱️/🅲 happy + 2 regression case standard flow vẫn chạy đúng).

### 🅲 Sprint C — Household + Daily price + Service (3 ngày) | HIGH

**Deliverable:** Partner household CRUD + bảng giá hằng ngày + 3 service orchestrator.

| Task | Effort |
|---|---|
| C.1 Service `partnerService.quickCreateHousehold()` + validate CCCD 12 số | 0.5 |
| C.2 Service `dailyPriceListService` — CRUD + `getCurrent(product, at=NOW)` | 0.5 |
| C.3 Service `intakeOutrightService.execute()` — 1-transaction orchestrator | 0.5 |
| C.4 Service `intakeWalkinService.execute()` — tương tự + use daily price | 0.5 |
| C.5 Service `intakeProductionService` + hook `productionOutputHookService.onFinish()` | 0.5 |
| C.6 Update `batchService.generateBatchCode(purchase_type, nationality)` — LAO-/PCB-/FW- prefix | 0.2 |
| C.7 Update `autoSettlementService.createAutoSettlement` + `createFromTicket` (multi-lot fan-out) | 0.3 |

**Gate out:** Unit test mỗi service pass với mock data 3 luồng.

### 🅳 Sprint D — UI 3 luồng + MultiLotEditor (4 ngày) | HIGH

**Deliverable:** 3 wizard page + component multi-lot reusable.

| Task | Effort |
|---|---|
| D.1 Component `<MultiLotEditor/>` — default 1 dòng, + Thêm lô | 1 |
| D.2 Page `/b2b/intake/outright` (4-step wizard) | 0.8 |
| D.3 Page `/b2b/intake/production` (8-step wizard) | 1 |
| D.4 Page `/b2b/intake/walkin` (4-step wizard) + CCCD input + camera | 0.8 |
| D.5 Page `/b2b/settings/daily-prices` (admin nhập giá) | 0.4 |

**Gate out:** Manual smoke test 3 flow end-to-end trên local + staging.

### 🅴 Sprint E — Tier advance + polish (1.5 ngày) | MED

**Deliverable:** Guard tier-based advance max %.

| Task | Effort |
|---|---|
| E.1 Constants `ADVANCE_MAX_PERCENT_BY_TIER` (5 tiers × 5 %) | 0.2 |
| E.2 Guard `advanceService.createAdvance` — reject nếu vượt tier max | 0.3 |
| E.3 UI warning đỏ trên form advance khi nhập > max | 0.3 |
| E.4 Polish: loading state, error toast, mobile responsive | 0.7 |

### 🅵 Sprint F — Test + Production deploy (2 ngày) | HIGH

**Deliverable:** Test plan docx + deploy 3 wave an toàn.

| Task | Effort |
|---|---|
| F.1 Test plan 3 luồng × (happy + 3 edge case) + 8 multi-lot test (ML-1..ML-8) | 0.5 |
| F.2 E2E SQL test script `.tmp/e2e_b2b_intake.py` | 0.5 |
| F.3 Deploy wave 1: Sprint A migration (backward-compat nullable) | 0.2 |
| F.4 Deploy wave 2: Sprint B trigger + FE Sprint C service | 0.3 |
| F.5 Deploy wave 3: FE Sprint D UI 3 flow active | 0.3 |
| F.6 Post-deploy monitor 24h: error rate, ticket mismatch | 0.2 |

---

## 5. Weighbridge app coordination

App `can.huyanhrubber.vn` (deploy riêng `apps/weighbridge/`) chia sẻ DB Supabase. Migration Sprint A phải compat với app cân.

### 5.1 Gap app cân (đã identify v1 §7)

| # | Gap | Fix |
|---|---|---|
| W1 | `weighbridge_tickets.source_type` chưa có | Sprint A add column |
| W2 | Không có UI quick-create household | Sprint D component reuse từ ERP |
| W3 | Không có settlement modal tại cân (flow 🅰️🅲) | Sprint D add modal |
| W4 | Không có QC DRC input tại cân (flow 🅲) | Sprint D add field |
| W5 | Không có daily price lookup | Sprint C service reuse |
| W6 | HomePage filter deal `status ∈ {processing, accepted}` cứng | Sprint D update để include `outright` + `farmer_walkin` không qua accepted |
| W7 | Trigger Sprint J block cân khi deal chưa accepted | Sprint B bypass theo purchase_type |
| W8 | Seed `weighbridge_scales` (PD-SCALE-01, TL-SCALE-01, LAO-SCALE-01) | Sprint A data seed |

### 5.2 App cân effort — song song ERP Sprint A-D

**+ 4 ngày** cho app cân (chạy song song, không nối tiếp):

| Sprint | Task | Effort |
|---|---|---|
| W-A | Schema share + seed scales | 0.5 |
| W-D1 | Outright flow UI + settlement modal | 1.5 |
| W-D2 | Farmer walk-in UI + CCCD + daily price lookup | 1.5 |
| W-D3 | DRC-after reuse existing flow | 0.5 |

### 5.3 Deploy coordination 3 app

| Target | Deploy | Wave |
|---|---|---|
| **huyanhrubber.vn** (ERP) | Vercel main | Wave 1-3 |
| **can.huyanhrubber.vn** (weighbridge) | Vercel riêng | Wave 2-3 |
| **b2b.huyanhrubber.vn** (portal) | Vercel riêng | Wave 3 (hiển thị badge purchase_type) |

**Thứ tự deploy:**
1. SQL Sprint A (nullable) → không break app cũ
2. FE Sprint C service layer → đọc/ghi field mới
3. SQL Sprint B (trigger exception) → unblock flow mới
4. FE Sprint D UI → user bắt đầu dùng 3 flow
5. SQL Sprint A2 (SET NOT NULL sau backfill) → cleanup
6. Monitor 48h → confirm zero regression

---

## 6. Rủi ro + Mitigation (updated v2)

| Rủi ro | Mức | Mitigation |
|---|---|---|
| Trigger Sprint J nới lỏng sai → cân lậu | 🔴 HIGH | Exception chỉ kích hoạt khi `purchase_type IN (outright, farmer_walkin)` VÀ `buyer_user_id/qc_user_id IS NOT NULL` — có người chịu trách nhiệm |
| Flow 🅱️ actual_drc lock bypass → tranh chấp DRC | 🔴 HIGH | Exception chỉ cho update 1 lần NULL→value. Sau đó LOCK bất biến. DB trigger enforce. |
| Multi-lot trigger allocation lệch > 1kg | 🟠 MED | Mode `direct`: RAISE EXCEPTION nếu sum(declared) != net. Mode `by_share`: compute với precision NUMERIC(12,2). |
| Daily price race 23:59/00:01 | 🟠 MED | Dùng tstzrange + EXCLUDE gist index → không overlap, không có gap (enforce ở DB) |
| CCCD trùng giữa hộ và đại lý | 🟡 LOW | UNIQUE constraint `b2b.partners.national_id` + regex validate 12 số VN |
| Backfill purchase_type='standard' miss | 🔴 HIGH | Chạy UPDATE + verify `COUNT(*) FILTER (WHERE purchase_type IS NULL) = 0` trước khi SET NOT NULL |
| Partner portal hiện badge sai `purchase_type` | 🟡 LOW | Portal chỉ read — update sau ERP + weighbridge stable |
| Service fan-out settlement miss partner-only lines (walk-in) | 🟠 MED | `createFromTicket` tách 2 path: `byDeal` (có deal) + `byPartner` (walk-in). Unit test ML-7. |
| App cân v1 không hiểu `has_items=true` | 🟠 MED | Sprint A: app cân deploy wave 2 sau khi có `getTicketLines()` fallback |

---

## 7. Rollback plan per sprint

Nếu 1 Sprint fail trên production, rollback theo thứ tự **ngược lại** deploy:

| Fail at | Rollback action | Data impact |
|---|---|---|
| Sprint F post-deploy | Revert FE Sprint D → user quay về flow cũ | Ticket mới có thể orphan purchase_type mới → cron auto-fix sau |
| Sprint E advance guard | Revert constants → advance không giới hạn | Không mất data |
| Sprint D UI | Revert FE → UI không hiện 3 flow | DB đã có schema mới, không break |
| Sprint C service | Revert service → API cũ | Trigger mới chạy OK với standard flow |
| Sprint B trigger | `DROP TRIGGER ... CREATE TRIGGER old_version` | Flow 🅰️🅲 bị block, standard flow giữ nguyên |
| Sprint A schema | **KHÔNG rollback** — nullable columns không break old code | Khó revert sau deploy vì app cân + portal đã đọc |

**Key rule:** Sprint A schema là **point of no return**. Pre-deploy phải chạy full regression test trên staging ≥ 48h.

---

## 8. Deliverable checklist — Sprint A gate

Trước khi merge Sprint A vào `main`, đảm bảo:

- [ ] Migration `b2b_intake_sprint_a_foundation.sql` idempotent (DROP IF EXISTS trước CREATE)
- [ ] Migration `weighbridge_multi_lot.sql` idempotent
- [ ] Migration `daily_price_list.sql` idempotent + tstzrange EXCLUDE verify
- [ ] `src/services/b2b/dealService.ts` — Deal interface có 5 field mới
- [ ] `src/services/weighbridge/ticketLinesService.ts` — `getTicketLines()` helper export
- [ ] `src/types/database.types.ts` — regenerate từ Supabase
- [ ] `npm run build` pass (tsc + vite)
- [ ] Test script `.tmp/e2e_sprint_a_foundation.py` PASS:
  - Schema verification (columns, constraints, triggers existent)
  - Backfill verify (all deals have purchase_type)
  - Multi-lot allocate trigger fires correctly (by_share + direct mode)
- [ ] Rollback SQL `b2b_intake_sprint_a_rollback.sql` sẵn sàng (DROP constraints + columns)
- [ ] Update memory: file mới `docs/B2B_INTAKE_ROADMAP_V2.md` là nguồn chính

---

## 9. Sau khi chốt roadmap v2

1. **Gửi 9 default answer cho BGĐ** — approve qua email/chat
2. **Setup branch** `feat/b2b-intake-v2` (hoặc merge thẳng main per convention)
3. **Kick-off Sprint A** — migration SQL + types đi trước, UI đi sau
4. **Daily sync** với admin Vercel 3 project cho deploy wave
5. **Memory update:** lưu `b2b_intake_v2_status.md` tracking Sprint A-F progress

---

## 10. Changelog v1 → v2

| v1 | v2 |
|---|---|
| Multi-lot ở §8 (defer) | Multi-lot ở **Sprint A** (core) |
| 9 câu `?` chưa trả lời | 9 câu có default approve-ready |
| `daily_price_list.date DATE` | `effective_from TIMESTAMPTZ` + tstzrange EXCLUDE |
| Status flow 3 luồng implicit | Status flow **state diagram** rõ ràng trong §1 |
| Không có rollback plan | Rollback per sprint table §7 |
| Effort 18.5-23.5 ngày | Effort **15-20 ngày** (tiết kiệm 4 ngày rework) |
| Tách biệt weighbridge coordination ở §7 | Integrated Sprint A-D + dedicated §5 |
| Sales module permission gap | **Không đề cập** (focus B2B only) |

---

**Chờ BGĐ approve 9 default + kick Sprint A.**
