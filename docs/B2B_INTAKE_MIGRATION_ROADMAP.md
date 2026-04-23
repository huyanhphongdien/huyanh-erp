# B2B Intake Prototype — Migration Roadmap

**Ngày:** 2026-04-23
**Nguồn:** [docs/B2B_INTAKE_PROTOTYPE.html](B2B_INTAKE_PROTOTYPE.html) → 3 luồng mua mủ
**Đối tượng:** DB schema, service layer, UI, migration cho production

---

## 1. Tóm tắt ảnh hưởng

Prototype mô tả **3 flow mua mủ** khác biệt về: partner type, thời điểm QC, thời điểm lock giá, bypass rule. Schema hiện tại **chỉ hỗ trợ 1 loại deal generic** (purchase/processing/sale). Cần mở rộng schema + service + UI.

### 3 flow

| Flow | Tên | Đối tượng | Đặc trưng |
|---|---|---|---|
| 1 | **Mua đứt** (`outright`) | Đại lý VN / Hộ Lào | DRC cáp kinh nghiệm → bypass QC + BGĐ → cân + nhập kho + chi tiền 1 phiên |
| 2 | **Chạy đầu ra** (`drc_after_production`) | Đại lý | QC mẫu → BGĐ duyệt → cân → **chạy sản xuất** → DRC = tp_kg / nvl_kg → quyết toán |
| 3 | **Walk-in hộ NN** (`farmer_walkin`) | Hộ nông dân VN | QC đo DRC tại chỗ → cân → chi tiền mặt ngay |

---

## 2. Gap inventory (chi tiết)

### 2.1. Fields thiếu trên `b2b.deals`

| Field | Kiểu | Dùng cho | Hiện | Cần |
|---|---|---|---|---|
| `purchase_type` | enum('outright','drc_after_production','farmer_walkin') | Phân luồng | ❌ | **BẮT BUỘC** |
| `buyer_user_id` | UUID FK auth.users | Audit người cáp DRC | ❌ | Flow 1, 2 |
| `estimated_drc` | NUMERIC(5,2) | DRC ước lượng đầu vào | ❌ (có `expected_drc`) | Alias hoặc tận dụng `expected_drc` |
| `sample_drc` | NUMERIC(5,2) | QC đo mẫu Flow 2 | ❌ | Flow 2 |
| `qc_user_id` | UUID FK auth.users | Audit QC | ❌ | Flow 2, 3 |
| `finished_product_kg` | NUMERIC(12,2) | KL thành phẩm Flow 2 | ❌ | Flow 2 |
| `finished_product_code` | TEXT | CV / SVR / RSS / TSR | ❌ | Flow 2 |

Hiện có `actual_drc`, `actual_weight_kg`, `expected_drc` — sẽ tái sử dụng.

### 2.2. Tables / entities thiếu

| Entity | Mục đích | Giải pháp đề xuất |
|---|---|---|
| **Hộ nông dân** | Flow 3 walk-in | Mở rộng `b2b.partners` với `partner_type='household'` + field `national_id`, `address` (không tách bảng, tránh trùng logic RLS) |
| **Bảng giá hằng ngày** | Flow 3 gợi ý giá | Table mới `b2b.daily_price_list(date, product_code, base_price_per_drc_kg)` |
| **Bảng weighbridge scales** | Flow nào cũng cần chọn cân | Kiểm tra `weighbridge_scales` (nếu chưa có → seed data) |

### 2.3. Blockers (**conflict với code Sprint 1-2**)

| Blocker | File | Mô tả |
|---|---|---|
| **Actual DRC lock** | `b2b_sprint2_3_4_constraints.sql` trigger `trg_deal_lock` | Trigger BLOCK `actual_drc` change khi status='accepted'. Flow 2 cần set `actual_drc` **sau** accepted (từ sản xuất) → **PHẢI exception** theo `purchase_type='drc_after_production'` |
| **Sprint J weighbridge guard** | `b2b_portal_sprint_j_workflow_order_guards.sql` trigger `trg_enforce_weighbridge_accepted` | Trigger BLOCK cân IN khi deal chưa accepted. Flow 1 (outright) bypass BGĐ duyệt → deal không bao giờ accepted → **PHẢI exception** theo `purchase_type='outright'` / `'farmer_walkin'` |
| **Batch prefix cứng** | `batchService.ts` `getBatchPrefix()` | Chỉ có PT/NVL/TP. Cần thêm `LAO-`, `PCB-`, `FW-` theo flow |
| **Warehouse code mismatch** | `multi_facility_foundation.sql` | DB: `KHO-LAO-NVL`; UI: `LAO-NVL`. Chuẩn hoá 1 chỗ |
| **Tier → advance max %** | `autoSettlementService.ts` + `partnerService.ts` | Prototype ghi 70% Gold. Hiện chỉ check `advance ≤ final_value`. Cần config table hoặc constants |

### 2.4. Service layer — thay đổi chính

| Service | Thay đổi |
|---|---|
| `dealService.createDeal` | Nhận `purchase_type`. Nếu `outright` / `farmer_walkin` → bỏ qua status='pending', đi thẳng 'processing' |
| `dealService.updateDeal` lock guard | Thêm exception: Flow 2 cho phép set `actual_drc` khi `purchase_type='drc_after_production'` + `finished_product_kg` vừa set |
| `autoSettlementService.createAutoSettlement` | Branch theo `purchase_type`: flow 1 trả auto từ ticket cân, flow 2 tính từ `finished_product_kg/input_kg`, flow 3 tính ngay từ DRC QC |
| `batchService.generateBatchCode` | Accept optional `purchase_type` + `is_lao` → trả prefix phù hợp |
| `partnerService.create` | Hỗ trợ `partner_type='household'` + quick-create form (national_id, address, nationality) |
| **Mới**: `dailyPriceListService` | CRUD bảng giá ngày + get current price by product + DRC |
| **Mới**: `productionOutputHookService` | Khi `production_orders.finished_at` set + deal linked với flow 2 → auto-calculate `actual_drc` + cascade settlement |

---

## 3. Lộ trình migration (6 sprints)

### Sprint A — Schema foundation (1-2 ngày, DB + types)
**Ưu tiên: CRITICAL — unblock tất cả flow**

- [ ] Migration SQL:
  - `ALTER TABLE b2b.deals ADD COLUMN purchase_type TEXT`
  - CHECK IN `('outright','drc_after_production','farmer_walkin','standard')` (standard = luồng deal cũ)
  - Backfill existing deals: `UPDATE b2b.deals SET purchase_type='standard' WHERE purchase_type IS NULL`
  - Sau đó: `ALTER ... SET NOT NULL`
  - `ADD COLUMN buyer_user_id UUID`, `qc_user_id UUID` (nullable)
  - `ADD COLUMN sample_drc NUMERIC(5,2)`, `finished_product_kg NUMERIC(12,2)`, `finished_product_code TEXT`
  - Partial UNIQUE: nếu `finished_product_code IS NOT NULL` check giá trị ∈ ('CV','SVR3L','RSS1','TSR20')

- [ ] Cập nhật interface `Deal`, `DealCreateData`, `DealUpdateData` trong `dealService.ts`

- [ ] Regenerate types Supabase: `npx supabase gen types typescript > src/types/database.types.ts`

- [ ] **Test:** build + tsc pass

### Sprint B — Unblock triggers (1 ngày, SQL)
**Ưu tiên: HIGH — để không block flow 1 & flow 2**

- [ ] Sửa trigger `trg_deal_lock` (từ Sprint 2 Gap #4):
  ```sql
  -- Exception cho flow 2: cho phép set actual_drc khi chuyển từ NULL → giá trị
  -- VÀ purchase_type='drc_after_production' VÀ chưa có settlement approved
  ```

- [ ] Sửa trigger Sprint J `trg_enforce_weighbridge_accepted`:
  ```sql
  -- Exception: IF NEW.deal_id → check deal.purchase_type
  --   IN ('outright','farmer_walkin') THEN allow regardless status
  ```

- [ ] Sửa trigger Sprint J `trg_enforce_b2b_stock_in_accepted`: tương tự

- [ ] **Test:**
  - Flow 1 happy path: create deal outright → weighbridge → stock-in → settle (không bao giờ 'accepted')
  - Flow 2 happy path: accepted → stock-in → production finish → set actual_drc → settle
  - Flow 2 negative: sau khi settlement approved, trigger phải block actual_drc update (Sprint 2 behavior giữ nguyên)

### Sprint C — Farmer household + Daily price (2-3 ngày, DB + service + UI)
**Ưu tiên: MEDIUM — chỉ block flow 3**

- [ ] Extend `b2b.partners`:
  - `ALTER TABLE b2b.partners ADD COLUMN national_id TEXT` (CMND/CCCD, unique if not null)
  - `ADD COLUMN nationality TEXT DEFAULT 'VN'` (CHECK IN ('VN','LAO'))
  - Partner type: nếu enum → `ALTER TYPE ADD VALUE 'household'`, nếu text → update CHECK

- [ ] Create table `b2b.daily_price_list`:
  ```sql
  CREATE TABLE b2b.daily_price_list (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    effective_date DATE NOT NULL,
    product_code TEXT NOT NULL,  -- mu_nuoc, mu_tap, ...
    base_price_per_kg NUMERIC(12,2) NOT NULL,  -- đơn giá nền DRC 100%
    notes TEXT,
    created_by UUID, created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (effective_date, product_code)
  );
  ```

- [ ] Service mới `src/services/b2b/dailyPriceListService.ts`: CRUD + `getCurrent(productCode)`

- [ ] Service `partnerService`:
  - Method mới `quickCreateHousehold(data)` — insert partner với tier='new', status='verified', partner_type='household'
  - Validation `national_id` format VN CCCD 12 số

- [ ] UI:
  - Page `/b2b/farmer-walkin` (Flow 3 wizard)
  - Component `QuickCreateHouseholdModal`
  - Page settings: `DailyPriceListPage` (admin nhập giá mỗi sáng)

### Sprint D — Intake flow UI + service orchestration (3-4 ngày)
**Ưu tiên: HIGH — core feature**

- [ ] **Flow 1 — Outright**:
  - Page `/b2b/intake/outright` — 4-step wizard theo prototype
  - Orchestrator `intakeOutrightService.execute()` → chạy: createDeal + weighbridgeTicket + stockInOrder + settlement + payment trong 1 transaction RPC

- [ ] **Flow 2 — DRC after production**:
  - Page `/b2b/intake/production` — 8-step wizard
  - Orchestrator `intakeProductionService.execute()` phân tách theo step (không 1-shot)
  - Trigger từ production_orders: `productionOutputHookService.onFinish(po_id)` → compute actual_drc → call `autoSettlementService.createAutoSettlement(deal_id)`

- [ ] **Flow 3 — Farmer walk-in**:
  - Page `/b2b/intake/walkin` — 4-step wizard
  - Orchestrator `intakeWalkinService.execute()` → tương tự Flow 1 nhưng dùng partner_type='household' + lấy giá từ dailyPriceListService

- [ ] Update `batchService.generateBatchCode()` accept `options: { purchase_type, nationality }`:
  ```ts
  if (purchase_type === 'outright' && nationality === 'LAO') return 'LAO-...'
  if (purchase_type === 'drc_after_production') return 'PCB-...'
  if (purchase_type === 'farmer_walkin') return 'FW-...'
  return 'NVL-...'  // default
  ```

- [ ] Update `autoSettlementService.createAutoSettlement()`:
  - Branch `switch(deal.purchase_type)` cho formula 3 flow
  - Flow 1: weight × price (DRC đã bake vào giá)
  - Flow 2: input_kg × (actual_drc from production / 100) × price
  - Flow 3: weight × (drc_qc / 100) × price_daily

### Sprint E — Tier-based advance + polish (1-2 ngày)
**Ưu tiên: LOW — nice-to-have**

- [ ] Config constants `ADVANCE_MAX_PERCENT_BY_TIER`:
  ```ts
  { diamond: 0.85, gold: 0.70, silver: 0.55, bronze: 0.40, new: 0.25 }
  ```

- [ ] Guard trong `advanceService.createAdvance`: compute max từ deal.estimated_value × tier%, reject nếu vượt

- [ ] UI hiển thị max tạm ứng trên form

### Sprint F — Test + migration production (2 ngày)
- [ ] Test plan chi tiết (viết riêng, mỗi flow 1 happy path + 3-5 edge case)
- [ ] Backfill data: migrate existing deals về `purchase_type='standard'`
- [ ] Production deploy theo thứ tự:
  1. SQL migration Sprint A (add columns nullable)
  2. Deploy FE v1 (đọc được field mới)
  3. SQL migration Sprint A2 (SET NOT NULL sau khi backfill)
  4. SQL migration Sprint B (update triggers)
  5. Deploy FE v2 (flow 1 UI)
  6. SQL migration Sprint C + deploy FE v3 (flow 3 UI)
  7. Deploy FE v4 (flow 2 UI + production hook)

---

## 4. Rủi ro + Mitigation

| Rủi ro | Mức | Mitigation |
|---|---|---|
| Trigger Sprint J bị nới lỏng sai → cân lậu | HIGH | Exception chỉ kích hoạt khi `deal.purchase_type IN (...)` VÀ `deal.buyer_user_id IS NOT NULL` (có người chịu trách nhiệm) |
| Flow 2 lock actual_drc bị break → đại lý tranh chấp | HIGH | Exception chỉ cho update 1 lần: NULL → value. Sau đó LOCK. DB trigger enforce. |
| Batch prefix đổi → report cũ break | MED | Không đổi prefix cũ (NVL-…), chỉ thêm prefix mới. Report group by prefix vẫn đúng |
| Partner type `household` làm logic cũ break | MED | Test kỹ các view/report lọc theo partner_type. Household mặc định verified, tier='new' |
| Production hook chạy sai → actual_drc sai | HIGH | Hook chạy trong transaction; nếu fail → rollback. Có manual override cho kế toán |
| Daily price list không cập nhật → flow 3 stall | MED | UI báo đỏ nếu hôm nay chưa có giá. Cron nhắc admin mỗi sáng |
| Backfill `purchase_type='standard'` lỗi → deal cũ không load | HIGH | Chạy UPDATE trước khi SET NOT NULL. Verify count = 0 null trước khi ALTER |

---

## 5. Ước lượng effort

| Sprint | Ngày công | Module |
|---|---|---|
| A — Schema foundation | 1-2 | DB + types |
| B — Unblock triggers | 1 | DB |
| C — Household + daily price | 2-3 | DB + service + UI |
| D — Intake flow UI | 3-4 | Full-stack |
| E — Tier advance | 1-2 | Service + UI |
| F — Test + deploy | 2 | QA + ops |
| **Tổng** | **10-14 ngày** | ~2 tuần |

---

## 6. Câu hỏi cần confirm (mark `?` trong prototype)

Prototype có 9 điểm `?`:

| # | Câu hỏi | Location |
|---|---|---|
| 1 | Range validation DRC cáp 25-70%? Cảnh báo nếu cách xa DRC trung bình? | Flow 1 step 2 |
| 2 | Công thức tính tiền flow 1: (A) qty×price hay (B) qty×DRC×price_base? | Flow 1 step 2 |
| 3 | Có bắt buộc chụp ảnh xe/mủ cho audit? | Flow 1 step 4 |
| 4 | Bảng giá ngày lấy từ đâu? | Flow 2 step 1 + Flow 3 step 3 |
| 5 | % tạm ứng max theo tier — Gold=70%, còn lại? | Flow 2 step 5 |
| 6 | Có trừ phí sản xuất / cháy đầu ra vào settlement không? | Flow 2 step 8 |
| 7 | CMND bắt buộc cho phiếu chi GTGT hay optional? | Flow 3 step 1 |
| 8 | Farmer table riêng hay mở rộng partners? | Flow 3 step 1 |
| 9 | Nationality check — LAO có thể đi flow 3 không? | Flow 3 step 1 |

**Cần BGĐ/kế toán confirm trước khi vào Sprint A** — vài câu có thể thay đổi schema (VD câu 8 ảnh hưởng table structure).

---

## 7. Ảnh hưởng đến **can.huyanhrubber.vn** (weighbridge app)

`apps/weighbridge/` — app Vite+React riêng, deploy Vercel độc lập (3 instance theo facility: PD/TL/LAO qua `VITE_FACILITY_CODE`), login PIN qua `scale_operators`, shared Supabase với ERP chính.

### 7.1. Luồng hiện tại của app cân

- **HomePage**: dashboard + danh sách ticket, `getActiveDealsForStockIn()` chỉ load deal status ∈ `{processing, accepted}`.
- **WeighingPage**: chọn deal (existing) → auto-fill rubber_type/expected_drc/unit_price → cân GROSS/TARE → `saveRubberFields()` → nếu `VITE_AUTO_WEIGHBRIDGE_SYNC=true` thì auto-create draft stock_in. **KHÔNG có settlement trực tiếp từ app cân.**
- **Partner selection**: chỉ có existing `rubber_suppliers` dropdown; KHÔNG có quick-create.
- **Source type**: implicit từ toggle `'deal'|'supplier'`, KHÔNG lưu enum trên ticket.

### 7.2. Blocker của app cân với 3 flow mới

| # | Vấn đề | Flow ảnh hưởng | File |
|---|---|---|---|
| W1 | `weighbridge_tickets` chưa có field `source_type` enum (outright/drc_after/farmer_walkin/standard) | Cả 3 | schema + `rubberWeighService.ts` |
| W2 | Không có UI quick-create household partner | Flow 3 | `WeighingPage.tsx` |
| W3 | Không có settlement modal (cash payment ngay tại cân) | Flow 1, 3 | `WeighingPage.tsx` (mới) |
| W4 | Không có on-site QC DRC input (QC đo DRC tại cân, không từ deal metadata) | Flow 3 | `WeighingPage.tsx` |
| W5 | Không có daily price lookup | Flow 3 | service + UI mới |
| W6 | Filter deal `status ∈ {processing, accepted}` cứng | Flow 1 (deal không bao giờ 'accepted') | `HomePage.tsx` line 252 |
| W7 | Trigger Sprint J cấm cân khi deal chưa accepted | Flow 1 | trigger DB (đã list ở mục 2.3) |
| W8 | Scale seed data (PD-SCALE-01, LAO-SCALE-01...) chưa rõ có trong DB | Cả 3 | `weighbridge_scales` |

### 7.3. Sprint bổ sung cho weighbridge app

**Sprint A bổ sung** (DB migration — cần chạy chung với schema foundation ERP):
- [ ] `ALTER TABLE weighbridge_tickets ADD COLUMN source_type TEXT CHECK (source_type IN ('outright','drc_after_production','farmer_walkin','standard'))` — nullable, default 'standard' cho ticket cũ
- [ ] Expose cho app cân qua `rubberWeighService.RubberWeighData.source_type`
- [ ] Seed `weighbridge_scales` nếu thiếu (PD-SCALE-01, TL-SCALE-01, LAO-SCALE-01)

**Sprint D1 — Outright flow trong app cân** (1-2 ngày):
- [ ] WeighingPage: thêm radio "Loại nhập" trên cùng form (Standard / Outright / DRC-after / Farmer-walkin)
- [ ] Nếu Outright: bỏ dropdown deal, thêm button "Quick-create deal outright" → modal nhập partner + DRC cáp + đơn giá
- [ ] Sau cân xong: modal **Settlement cash** inline (giá tiền tính từ `actualWeight × unit_price`) → button "Chi tiền + In phiếu"
- [ ] Gọi `intakeOutrightService.execute()` (orchestrator đã plan ở Sprint D) từ app cân

**Sprint D2 — Farmer walk-in trong app cân** (2 ngày):
- [ ] WeighingPage: nếu chọn "Farmer-walkin" → button "Quick-create hộ nông dân" → modal mini (name, phone, CMND, address)
- [ ] QC DRC input field (không từ deal metadata — QC đo máy tại chỗ nhập tay)
- [ ] Daily price auto-load: call `dailyPriceListService.getCurrent(product_code)` → prefill + cho edit (thương lượng)
- [ ] Settlement cash modal giống Flow 1
- [ ] Receipt in phiếu với info CMND đầy đủ

**Sprint D3 — DRC-after flow app cân** (0.5 ngày — đơn giản nhất):
- [ ] WeighingPage: "DRC-after" giữ nguyên flow cũ (chọn deal accepted, cân, sync stock_in)
- [ ] HomePage filter: include deal `purchase_type='drc_after_production'` status='accepted'
- [ ] **Không có settlement** ở app cân — vẫn đi qua ERP main sau khi production xong

**Sprint E bổ sung — Auth & audit**:
- [ ] PIN login hiện là plaintext (authStore.ts line 52 đánh dấu "can hash later"). Bắt buộc hash khi chạm vào flow có settlement (Flow 1, 3 chi tiền thật).
- [ ] Log operator_id vào settlement entry để audit (hiện chỉ có trên ticket, chưa propagate xuống settlement).

### 7.4. Deploy coordination

3 deploy target phải sync version:

| Target | Deploy | Migration require |
|---|---|---|
| **huyanhrubber.vn** (ERP) | Vercel main branch | Sprint A schema |
| **can.huyanhrubber.vn** (weighbridge) | Vercel app riêng (từ `apps/weighbridge/`) | Sprint A schema (shared DB) |
| **b2b.huyanhrubber.vn** (Partner Portal) | Vercel project khác (`huyanh-b2b-portal` repo) | Sprint A schema — thêm hiển thị `purchase_type` trên deal cards |

**Thứ tự deploy an toàn:**
1. Chạy migration Sprint A (nullable columns + default) — backward-compat
2. Deploy ERP main (đọc được field mới, chưa dùng)
3. Deploy weighbridge (đọc `source_type`, gửi default 'standard' cho ticket cũ)
4. Deploy Partner Portal (hiển thị badge purchase_type)
5. Migration Sprint B (trigger exception cho outright/farmer_walkin)
6. Deploy ERP + weighbridge wave 2 (UI 3 flow active)
7. Migration Sprint A2 (SET NOT NULL sau backfill)

### 7.5. Effort bổ sung cho weighbridge

| Sprint | Ngày công | Module |
|---|---|---|
| W-D1 Outright in can | 1-2 | app cân |
| W-D2 Farmer walk-in in can | 2 | app cân |
| W-D3 DRC-after in can | 0.5 | app cân |
| W-E PIN hash + audit | 1 | auth |
| **Tổng bổ sung** | **4.5-5.5 ngày** | + vào tổng roadmap |

**Tổng roadmap mới: 10-14 ngày ERP + 4.5-5.5 ngày weighbridge = 14.5-19.5 ngày (~3-4 tuần)**

---

## 8. BUG LỚN — 1 xe nhiều mã lô (multi-lot per ticket)

### 8.1. Thực tế kinh doanh

| # | Scenario | Ví dụ |
|---|---|---|
| **S1** | 1 xe gom từ **N hộ nông dân** | Tài xế đi 3 xã gom 3 hộ: A 500kg + B 300kg + C 200kg → 1 xe 1000kg → đến cân |
| **S2** | 1 xe chở **N loại mủ** | 600kg mủ nước (giá 13k) + 400kg mủ tạp (giá 8k) → cần 2 batch giá khác |
| **S3** | 1 đại lý **N vườn DRC khác nhau** | Lô A vườn 1 DRC 35%, lô B vườn 2 DRC 38% → 2 lot_code |
| **S4** | 1 deal **multi-lot** từ Demand/Offer | `b2b_demands` đã có concept lot_code, lot_drc, lot_qty nhưng không cascade |

### 8.2. Hiện trạng — **tất cả 1:1 scalar, KHÔNG hỗ trợ**

| Layer | Field | Kiểu | Bug |
|---|---|---|---|
| `weighbridge_tickets` | `deal_id`, `partner_id`, `supplier_id`, `rubber_type`, `expected_drc`, `unit_price`, `lot_code` | scalar / không có | 1 ticket chỉ 1 deal, 1 partner, 1 product |
| `stock_in_orders` | `deal_id` | scalar | 1 order = 1 deal |
| `stock_in_details` | không có `deal_id`, không có `lot_code` | — | Detail chỉ là item breakdown, không track lô khác deal |
| `rubber_intake_batches` | `deal_id`, `lot_code`, `stock_in_id` | scalar | 1 batch = 1 deal, không có FK ticket |
| `b2b.deals` | `lot_code` | scalar | 1 deal = 1 lot; demand multi-lot phải tạo N deal |
| `b2b.settlements` | `deal_id` scalar nhưng `intake_ids UUID[]` | mix | Settle N batch về 1 deal được, nhưng không settle N deal về 1 phiếu cân |
| UI `WeighingPage.tsx` | Không có multi-select product/partner/lot | — | Form enforce 1 giá trị |

### 8.3. Bug cụ thể trên 3 flow prototype

| Flow | Bug thực tế |
|---|---|
| **Flow 1 (outright)** | Tài xế gom 3 hộ Lào ở 3 bản → 1 xe → hiện phải cân **3 lần riêng** hoặc tạo 3 deal khác ticket. Không thực tế, tài xế không chờ. |
| **Flow 2 (drc_after)** | Đại lý Gold gửi 2 lô từ 2 vườn khác DRC → hiện phải tách 2 deal, 2 booking. Nhưng thực tế đại lý gửi **1 lần** cho cả 2 vườn — sẽ hỏi "sao anh bắt tôi tạo 2 phiếu?" |
| **Flow 3 (farmer walk-in)** | Ít gặp hơn (hộ đi riêng) nhưng nếu **2 hộ góp xe tiết kiệm xăng** → bị kẹt |
| **Demand/Offer** | `b2b.demand_offers.lot_code` đã có, nhưng khi accept multi-lot offer → tạo N deal, không cascade thành 1 ticket cân duy nhất |

### 8.4. Phương án tối ưu — **Hybrid Items, backward-compat, zero-downtime**

Sau khi đánh giá 3 hướng (junction table, array JSONB, fully-normalized), chọn phương án sau vì nó **đáp ứng cả 4 mục tiêu thường xung đột nhau**:

| Mục tiêu | Đáp ứng |
|---|---|
| Backward-compat: ticket cũ 1:1 không break | ✅ scalar fields trên ticket giữ nguyên |
| Code không đầy `if (has_items) else` | ✅ service helper `getTicketLines()` unify 1 API |
| Clean schema, query dễ, FK đầy đủ | ✅ junction table chuẩn SQL |
| Zero-downtime deploy, không backfill bắt buộc | ✅ items table nullable, old tickets để nguyên |

#### Schema — 3 bảng thêm/sửa

```sql
-- ─── 1. Junction table chính ────────────────────────────────────────
CREATE TABLE weighbridge_ticket_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES weighbridge_tickets(id) ON DELETE CASCADE,
  line_no INT NOT NULL,                    -- thứ tự: 1, 2, 3...

  -- Source of item (EXACTLY 1 of 3 phải NOT NULL — enforce qua CHECK)
  deal_id      UUID NULL REFERENCES b2b_deals(id),
  partner_id   UUID NULL REFERENCES b2b_partners(id),   -- dùng khi walk-in không qua deal
  supplier_id  UUID NULL REFERENCES rubber_suppliers(id),

  -- Payload
  rubber_type        TEXT NOT NULL,              -- mu_nuoc, mu_tap, ...
  lot_code           TEXT NULL,                   -- LAO-..., PCB-..., FW-...
  declared_qty_kg    NUMERIC(12,2) NOT NULL,      -- tài xế khai (trước cân)
  actual_qty_kg      NUMERIC(12,2) NULL,          -- sau cân, allocate theo tỷ lệ
  drc_percent        NUMERIC(5,2) NULL,           -- QC đo riêng (có thể khác nhau)
  unit_price         NUMERIC(12,2) NULL,          -- giá riêng (flow 3 multi-hộ)
  line_amount_vnd    NUMERIC(14,2) NULL,          -- auto-compute

  notes TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (ticket_id, line_no),

  CONSTRAINT chk_exactly_one_source CHECK (
    (deal_id IS NOT NULL)::INT +
    (partner_id IS NOT NULL)::INT +
    (supplier_id IS NOT NULL)::INT = 1
  ),
  CONSTRAINT chk_declared_positive CHECK (declared_qty_kg > 0)
);

CREATE INDEX idx_ticket_items_ticket ON weighbridge_ticket_items(ticket_id);
CREATE INDEX idx_ticket_items_deal ON weighbridge_ticket_items(deal_id) WHERE deal_id IS NOT NULL;

-- ─── 2. Flag trên ticket + allocation mode ──────────────────────────
ALTER TABLE weighbridge_tickets
  ADD COLUMN IF NOT EXISTS has_items BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS allocation_mode TEXT NOT NULL DEFAULT 'by_share'
    CHECK (allocation_mode IN ('by_share','direct'));
  -- by_share: actual = net × (declared / sum(declared)) — thực tế phổ biến
  -- direct:   actual = declared (sum(declared) phải = net, enforce qua trigger)

-- ─── 3. Downstream liên kết về item ─────────────────────────────────
ALTER TABLE stock_in_details
  ADD COLUMN IF NOT EXISTS ticket_item_id UUID NULL REFERENCES weighbridge_ticket_items(id),
  ADD COLUMN IF NOT EXISTS deal_id UUID NULL REFERENCES b2b_deals(id),
  ADD COLUMN IF NOT EXISTS lot_code TEXT NULL;

ALTER TABLE rubber_intake_batches
  ADD COLUMN IF NOT EXISTS ticket_item_id UUID NULL;
```

#### Trigger phân bổ trọng lượng

```sql
CREATE OR REPLACE FUNCTION allocate_ticket_item_weights()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  t weighbridge_tickets%ROWTYPE;
  total_declared NUMERIC;
BEGIN
  SELECT * INTO t FROM weighbridge_tickets WHERE id = NEW.ticket_id;
  IF t.net_weight IS NULL OR NOT t.has_items THEN RETURN NEW; END IF;

  SELECT SUM(declared_qty_kg) INTO total_declared
  FROM weighbridge_ticket_items WHERE ticket_id = t.id;

  IF t.allocation_mode = 'by_share' AND total_declared > 0 THEN
    UPDATE weighbridge_ticket_items
    SET actual_qty_kg = ROUND(t.net_weight * declared_qty_kg / total_declared, 2),
        line_amount_vnd = ROUND(
          t.net_weight * declared_qty_kg / total_declared
          * COALESCE(drc_percent, 100) / 100
          * COALESCE(unit_price, 0), 0)
    WHERE ticket_id = t.id;
  ELSIF t.allocation_mode = 'direct' THEN
    IF ABS(COALESCE(total_declared,0) - t.net_weight) > 1 THEN
      RAISE EXCEPTION 'Mode direct: tổng declared (%) phải = NET (%)', total_declared, t.net_weight;
    END IF;
    UPDATE weighbridge_ticket_items
    SET actual_qty_kg = declared_qty_kg,
        line_amount_vnd = ROUND(declared_qty_kg * COALESCE(drc_percent,100)/100 * COALESCE(unit_price,0), 0)
    WHERE ticket_id = t.id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_items_allocate_on_insert
  AFTER INSERT OR UPDATE OF declared_qty_kg, drc_percent, unit_price
  ON weighbridge_ticket_items FOR EACH ROW
  EXECUTE FUNCTION allocate_ticket_item_weights();

CREATE TRIGGER trg_ticket_allocate_on_weigh
  AFTER UPDATE OF net_weight ON weighbridge_tickets
  FOR EACH ROW WHEN (NEW.has_items) EXECUTE FUNCTION allocate_ticket_item_weights();
```

#### Service contract — **1 helper duy nhất**

```typescript
// src/services/weighbridge/ticketLinesService.ts

export interface TicketLine {
  line_no: number
  deal_id: string | null
  partner_id: string | null
  supplier_id: string | null
  rubber_type: string
  lot_code: string | null
  actual_qty_kg: number
  drc_percent: number | null
  unit_price: number | null
  line_amount_vnd: number | null
  _source: 'scalar' | 'item'  // để debug, caller không cần care
}

/**
 * Helper duy nhất để đọc lines — unify 1:1 scalar và multi-lot items.
 * Mọi downstream (settlement, stock-in, audit) chỉ gọi hàm này.
 */
export async function getTicketLines(ticketId: string): Promise<TicketLine[]> {
  const ticket = await weighbridgeService.getById(ticketId)
  if (ticket.has_items) {
    const { data } = await supabase
      .from('weighbridge_ticket_items')
      .select('*').eq('ticket_id', ticketId).order('line_no')
    return (data || []).map(i => ({ ...i, _source: 'item' as const }))
  }
  // Synthesize 1 line từ scalar ticket (legacy 1:1)
  return [{
    line_no: 1,
    deal_id: ticket.deal_id,
    partner_id: ticket.partner_id,
    supplier_id: ticket.supplier_id,
    rubber_type: ticket.rubber_type,
    lot_code: ticket.lot_code ?? null,
    actual_qty_kg: ticket.net_weight,
    drc_percent: ticket.expected_drc,
    unit_price: ticket.unit_price,
    line_amount_vnd: ticket.net_weight * (ticket.expected_drc ?? 100) / 100 * (ticket.unit_price ?? 0),
    _source: 'scalar',
  }]
}
```

**Mọi code downstream (settlement, stock-in, audit, report) chỉ gọi `getTicketLines()`** — không branching, không biết là scalar hay item.

#### Settlement fan-out

```typescript
// src/services/b2b/autoSettlementService.ts — thêm method mới
async createFromTicket(ticketId: string): Promise<Settlement[]> {
  const lines = await getTicketLines(ticketId)
  const byDeal = groupBy(lines.filter(l => l.deal_id), 'deal_id')
  const settlements = []
  for (const [dealId, group] of Object.entries(byDeal)) {
    const s = await this.createAutoSettlement(dealId, { lines: group })
    settlements.push(s)
  }
  // Lines không có deal_id (farmer walk-in partner-only) → skip, đi path khác
  return settlements
}
```

Overload signature của `createAutoSettlement` nhận optional `{ lines }` — nếu truyền thì dùng thay vì query lại.

#### UI pattern — **MultiLotEditor mặc định 1 dòng**

Component `<MultiLotEditor />` thay thế 3 field cũ (deal/partner/product) trong `WeighingPage.tsx`:

```
┌─────────────────────────────────────────────────────────┐
│ Lines                                      [+ Thêm lô]  │
├────┬──────────┬─────────┬──────┬──────┬──────┬─────────┤
│ #1 │ Đại lý A │ Mủ nước │ 600  │ 35%  │ 13k  │  [xóa]  │
│ #2 │ Đại lý B │ Mủ tạp  │ 400  │ 28%  │  8k  │  [xóa]  │
├────┴──────────┴─────────┴──────┴──────┴──────┴─────────┤
│ Tổng declared: 1000 kg   |  NET thực tế: 985 kg         │
│ (sẽ phân bổ theo tỷ lệ)                                 │
└─────────────────────────────────────────────────────────┘
```

- Mặc định 1 dòng → UX không khác gì flow cũ
- Click "+ Thêm lô" → thêm dòng mới
- Mỗi dòng có thể là: (deal có sẵn) | (partner quick-create household) | (supplier)
- Khi save: nếu chỉ 1 dòng → ticket `has_items=false`, ghi vào scalar. Nếu N dòng → `has_items=true`, ghi items.

### 8.5. Migration & deploy — zero-downtime

**Phase 1 (Sprint A schema):** Chạy DDL thêm bảng `weighbridge_ticket_items` + columns mới. Tất cả nullable. Code cũ chạy bình thường (không đọc/ghi items).

**Phase 2 (Sprint D0 service + UI):** Deploy code mới — service `getTicketLines()` fallback về scalar nếu `has_items=false`. UI `MultiLotEditor` mặc định 1 dòng. **Không cần backfill** — ticket cũ vẫn `has_items=false`, đọc từ scalar.

**Phase 3 (Sprint D1-D3):** UI 3 flow gọi `MultiLotEditor`. Từ đây ticket mới có thể là 1 dòng (scalar fast-path) hoặc N dòng (items).

**Phase 4 (tuỳ chọn, sau 1-2 tháng):** Migrate dần data cũ sang items (scheduled job buổi tối), deprecate scalar fields trên ticket. Không gấp.

### 8.6. Ảnh hưởng đến triggers đã làm (Sprint 2-3)

3 trigger cần update, **nhưng không phá logic cũ**:

| Trigger | Fix |
|---|---|
| `trg_batch_deal_lock` (Sprint 3 Gap #10) | Vẫn hoạt động — batch vẫn scalar `deal_id`. Không đổi. |
| Sprint J `trg_enforce_weighbridge_accepted` | Rewrite: nếu `NEW.has_items=true` → loop qua items kiểm tra từng `deal_id`. Nếu `has_items=false` → giữ logic cũ. |
| `trg_enforce_b2b_stock_in_accepted` | Rewrite tương tự — check từ `stock_in_details.deal_id` nếu có, fallback `stock_in_orders.deal_id`. |

DDL rewrite Sprint J trigger:
```sql
CREATE OR REPLACE FUNCTION enforce_weighbridge_accepted()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE d_status TEXT; bad_deal UUID;
BEGIN
  -- Case 1: ticket scalar 1:1 (has_items=false)
  IF NOT NEW.has_items AND NEW.deal_id IS NOT NULL THEN
    SELECT status INTO d_status FROM b2b.deals WHERE id = NEW.deal_id;
    -- (giữ logic cũ + exception outright/farmer_walkin ở Sprint B)
    ...
  END IF;
  -- Case 2: multi-lot (has_items=true) → loop items
  IF NEW.has_items THEN
    SELECT i.deal_id INTO bad_deal
    FROM weighbridge_ticket_items i
    JOIN b2b.deals d ON d.id = i.deal_id
    WHERE i.ticket_id = NEW.id
      AND d.status NOT IN ('accepted','settled','processing')
      AND d.purchase_type NOT IN ('outright','farmer_walkin')
    LIMIT 1;
    IF bad_deal IS NOT NULL THEN
      RAISE EXCEPTION 'Deal % chưa sẵn sàng cho cân', bad_deal;
    END IF;
  END IF;
  RETURN NEW;
END $$;
```

### 8.7. Effort điều chỉnh

Thêm **Sprint D0** (multi-lot foundation) vào trước Sprint D:

| Sprint | Việc | Ngày |
|---|---|---|
| **D0.1** | Schema + trigger allocate + types | 1 |
| **D0.2** | `getTicketLines()` helper + refactor `createFromTicket()` settlement | 1 |
| **D0.3** | Component `<MultiLotEditor/>` | 1.5 |
| **D0.4** | Update Sprint J trigger để support items + test | 0.5 |
| **D0** | **Total** | **4 ngày** |

Sprint D1-D3 sau đó **không tăng thêm effort** vì đã reuse `MultiLotEditor` + `createFromTicket`.

**Tổng roadmap mới: 14.5-19.5 + 4 = 18.5-23.5 ngày ≈ 4-5 tuần.**

### 8.8. Test cases chính cho multi-lot (bổ sung vào test plan)

| # | Scenario | Expected |
|---|---|---|
| ML-1 | 1 ticket, 3 items (3 hộ), allocation_mode=by_share, NET=985kg, declared [500,300,200] | actual [492.5, 295.5, 197] |
| ML-2 | 1 ticket, 2 items (2 product types), allocation_mode=direct, declared=[600,400]=1000 | NET phải = 1000, nếu lệch > 1kg → trigger raise |
| ML-3 | 1 ticket, 2 items same deal (2 vườn cùng đại lý) | `createFromTicket()` → 1 settlement với 2 intake_ids |
| ML-4 | 1 ticket, 3 items 3 deal khác nhau | `createFromTicket()` → 3 settlement riêng |
| ML-5 | Legacy ticket has_items=false, 1:1 scalar | `getTicketLines()` trả array 1 phần tử từ scalar, downstream không đổi |
| ML-6 | Trigger Sprint J: 1 ticket 3 items, 1 item deal ở status 'pending' → block | RAISE EXCEPTION nêu tên deal vi phạm |
| ML-7 | Farmer walk-in 2 hộ chung xe: item có `partner_id` nhưng `deal_id=NULL` | `createFromTicket()` trả 0 settlement (skip), tạo settlement path partner-only riêng |
| ML-8 | Update item.drc_percent → trigger recompute line_amount | actual_qty unchanged, line_amount recalc |

---

## 9. Tiếp theo

1. **User confirm 9 câu hỏi `?`** (hoặc chọn default từ tôi gợi ý)
2. **Approve roadmap** → vào Sprint A ngay
3. Lập test plan Sprint A-F (giống format `B2B_TEST_PLAN_SPRINT_1_4.md`) — **cần tách test plan riêng cho app cân** vì deploy riêng
4. Setup feature branch `feat/b2b-intake-3-flows` (hoặc merge thẳng main như convention)
5. Coordinate với admin Vercel 3 project để deploy cùng wave
