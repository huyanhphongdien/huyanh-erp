# Audit E2E flow Demand → Offer → Deal (Nhà máy chủ động đi mua)

**Ngày:** 2026-04-22
**Phương pháp:** DB deep audit + SQL E2E simulation qua service_role REST API + `agent_sql` RPC helper
**Scope:** Chỉ local, KHÔNG push, KHÔNG deploy. Tập trung tìm bug để đề xuất Sprint fix.

## 0. Tóm tắt

| Severity | Findings |
|---|---|
| 🔴 CRITICAL | 1 (BUG-DEM-3 quantity_filled không auto update) |
| 🟠 HIGH | 4 (BUG-DEM-1/2/5/8) |
| 🟡 MED | 1 (BUG-DEM-4) |
| 🔵 LOW/INFO | 2 (BUG-DEM-6/7) |

**Tổng:** 8 bugs phát hiện qua E2E test.

---

## 1. Business flow (nhà máy đi mua)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        [FACTORY side]                                │
│                                                                      │
│  Tạo NCM (nhu cầu mua) ──────────────▶ b2b_demands (status=draft)    │
│  └ product, quantity_kg, drc_min/max, price_min/max, deadline        │
│                                                                      │
│  Publish ──────────────────────────▶ status=published + published_at │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────┐
│                        [PARTNER side]                                │
│                                                                      │
│  Portal > Cơ hội > Đang mở ──▶ xem danh sách demand public           │
│                                                                      │
│  Submit offer ───────────────▶ b2b_demand_offers (status=pending)    │
│  └ offered_quantity_kg, offered_price, offered_drc, delivery_date    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────┐
│                        [FACTORY side]                                │
│                                                                      │
│  Xem offers ──▶ chấp nhận offer (status pending→accepted)            │
│  └ trigger overfill check: SUM(accepted) ≤ demand.quantity_kg        │
│                                                                      │
│  Tạo deal từ offer ──▶ b2b.deals (demand_id + offer_id + partner_id) │
│  └ link back: offer.deal_id = new deal                               │
│                                                                      │
│  Update demand.quantity_filled_kg, check status filled/closed        │
│  ⚠️ CURRENT: KHÔNG có trigger auto — phải làm manual (BUG-DEM-3)     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                   ↓
                       Deal standard lifecycle:
                 QC → Duyệt → Cân → Nhập kho → Advance
                        → Settlement → Paid
```

---

## 2. Schema audit

### 2.1 `public.b2b_demands` — 30 columns

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| code | varchar | NO | — | UNIQUE `b2b_demands_code_key` |
| demand_type | varchar | NO | `'purchase'` | Không có CHECK — **bug tiềm ẩn** |
| product_type | varchar | NO | — | |
| product_name | varchar | NO | — | |
| quantity_kg | numeric | NO | — | CHECK > 0 ✅ |
| quantity_filled_kg | numeric | YES | 0 | **BUG: không auto-update** |
| drc_min/max | numeric | YES | — | CHECK range 0-100 + min≤max ✅ |
| price_min/max | numeric | YES | — | CHECK min≥0 + min≤max ✅ |
| price_unit | varchar | YES | `'VND'` | |
| preferred_regions | ARRAY | YES | — | |
| deadline | date | YES | — | |
| delivery_from/to | date | YES | — | Không check from ≤ to |
| warehouse_id | uuid | YES | FK warehouses | |
| pickup_location_id | uuid | YES | — | Không có FK |
| status | varchar | YES | `'draft'` | **BUG: Không có CHECK** |
| processing_fee_per_ton | numeric | YES | — | Chỉ cho processing deal |
| expected_output_rate | numeric | YES | — | CHECK 0-100 ✅ |
| priority | varchar | YES | `'normal'` | Không có CHECK |
| created_by | uuid | YES | — | Không có FK |
| published_at/closed_at/created_at/updated_at | timestamptz | — | — | |

### 2.2 `public.b2b_demand_offers` — 19 columns

| Column | Notes |
|---|---|
| id, demand_id, partner_id | FK chuẩn |
| offered_quantity_kg | CHECK > 0 ✅ |
| offered_price | CHECK > 0 ✅ |
| offered_drc | CHECK 0-100 ✅ |
| status | **BUG: Không CHECK** |
| deal_id | FK → `b2b.deals` ON DELETE SET NULL ✅ |
| rejected_reason | |
| lot_code, lot_description, lot_drc, lot_source | 4 field bổ sung cho lô hàng |

### 2.3 Triggers hiện tại

| Trigger | Table | Action |
|---|---|---|
| `trg_demand_overfill_check` | b2b_demand_offers | BEFORE INSERT/UPDATE status/qty — raise exception nếu SUM(accepted) > demand.quantity_kg ✅ |
| `trg_offer_accepted_warn` | b2b_demand_offers | AFTER INSERT/UPDATE status — RAISE **WARNING** (không block) nếu accepted + deal_id NULL ⚠️ |

**Thiếu trigger:**
- Auto update `demand.quantity_filled_kg` khi offer.status='accepted' hoặc khi deal created
- Auto transition `demand.status` published → filled khi fully filled
- Auto update `demand.status` published → closed khi deadline pass

### 2.4 RLS policies

`b2b_demands` (3 policies):
- `"Allow all access to b2b_demands"` — cmd=ALL, roles=public ⚠️ **quá lỏng**
- `demands_manage_staff` — ALL staff
- `demands_select_authenticated` — SELECT authenticated

`b2b_demand_offers` (4 policies):
- `"Allow all access to b2b_demand_offers"` — cmd=ALL, roles=public ⚠️ **quá lỏng**
- `offers_insert_own` — INSERT own partner
- `offers_select_own` — SELECT own
- `offers_update_own` — UPDATE own

---

## 3. SQL E2E simulation kết quả

Test environment:
- Factory employee: Lê Duy Minh (id `b8d69925-3744-4693-92d0-25235191f688`)
- Partners: TECG01, TEAN01, QHNA01 (3 đại lý verified)

### T1 · Factory INSERT demand (draft)
```sql
INSERT INTO b2b_demands (code, product_type, product_name, quantity_kg,
                        drc_min, drc_max, price_min, price_max,
                        deadline, delivery_from, delivery_to,
                        status, created_by)
VALUES ('NCM-TEST-DEMO-001', 'mu_tap', 'Mủ tạp', 500000,
        40, 55, 18000, 22000,
        '2026-05-31', '2026-05-01', '2026-05-15',
        'draft', '<employee-uuid>');
```
**Result:** ✅ HTTP 201 — inserted OK.

### T2 · **BUG probe**: invalid status
```sql
INSERT INTO b2b_demands (..., status) VALUES (..., 'totally-fake-status');
```
**Result:** ✅ HTTP 201 — **BUG-DEM-1** accepted bất kỳ status value.

### T3 · Publish demand
```sql
UPDATE b2b_demands SET status='published', published_at=now()
WHERE code='NCM-TEST-DEMO-001';
```
**Result:** ✅ HTTP 204 — OK.

### T4 · Partners submit offers
- TECG01: 400T × 20.000đ/kg
- TEAN01: 200T × 19.500đ/kg

**Result:** ✅ HTTP 201 cả 2.

### T5 · **BUG probe**: partner offer status invalid
```sql
INSERT INTO b2b_demand_offers (..., status) VALUES (..., 'FAKE-STATUS-XYZ');
```
**Result:** ✅ HTTP 201 — **BUG-DEM-2** offer status không có CHECK.

### T6 · Accept offers + trigger overfill
- T6a/T6b: accept 200T TEAN01 + 100T QHNA01 → OK (total 300T/500T)
- T6d: accept 400T TECG01 → total 700T > 500T → **trigger reject** ✅

```
ERROR P0001: Tổng offer accepted (700000.00 kg) vượt quantity demand (500000.00 kg)
```

### T7 · Factory tạo deal từ offer accepted
Initial attempt với `deal_number='DL-TEST-FROMDEMAND-001'` (22 ký tự):
```
ERROR 22001: value too long for type character varying(20)
```
→ **BUG-DEM-4** `b2b.deals.deal_number` giới hạn 20 ký tự, UI không validate.

Retry với 16 ký tự `DL-E2E-DEMAND-01` → ✅ HTTP 201.

### T8 · Link offer.deal_id
```sql
UPDATE b2b_demand_offers SET deal_id = '<deal-uuid>' WHERE id = '<offer-uuid>';
```
**Result:** ✅ HTTP 204.

### T9 · **BUG-DEM-3 CRITICAL**: demand.quantity_filled_kg KHÔNG auto-update
Sau khi 2 offers accepted (tổng 300T) + 1 deal tạo:
```json
{"quantity_kg": 500000, "quantity_filled_kg": 0, "status": "published"}
```
→ `quantity_filled_kg` vẫn = 0 dù có 300T accepted. Status vẫn `published` dù chưa full 500T.

### T11 · Cleanup DELETE deal → **BUG-DEM-8**
```sql
DELETE FROM b2b_deals WHERE deal_number='DL-E2E-DEMAND-01';
-- ERROR 23503: insert or update on table "deal_audit_log" violates FK
-- Key (deal_id)=(<uuid>) is not present in table "deals".
```
Phân tích: trigger `trg_deal_audit` AFTER DELETE attempt INSERT audit row WITH deal_id → but deal row đã deleted → FK violation.

`deal_audit_log.deal_id FK REFERENCES b2b.deals(id) ON DELETE CASCADE`

→ Hard delete deal bị crash bởi trigger audit. Không thể cleanup test data.

---

## 4. Danh sách BUGS chi tiết

### 🔴 BUG-DEM-3 CRITICAL: quantity_filled_kg không auto-update

**Reproduce:**
1. Factory tạo demand 500T
2. Partners submit 2 offers tổng 300T
3. Factory accept cả 2 offers
4. Factory tạo deal từ 1 offer, link deal_id

→ Sau cả quá trình `b2b_demands.quantity_filled_kg` vẫn = 0, `status` vẫn = `published`.

**Impact:**
- UI "Nhu cầu mua" hiển thị `quantity_filled_kg/quantity_kg` progress bar → luôn 0%
- Demand không bao giờ auto → status `filled` khi fully filled
- Không biết khi nào close demand (chỉ dựa deadline)
- Hiển thị demand "đã đầy" cho partners khác vẫn có thể submit offer (confusing UX)

**Fix:** Sprint L SQL — 2 triggers:
1. `sync_demand_filled_on_offer_accept`: AFTER UPDATE OF status on b2b_demand_offers
   - Nếu NEW.status='accepted' → recompute demand.quantity_filled_kg = SUM(accepted)
   - Nếu quantity_filled >= quantity_kg → set demand.status='filled'
2. `sync_demand_close_on_deadline`: scheduled CRON hoặc app-side check
   - WHERE deadline < now() AND status='published' → set status='closed'

---

### 🟠 BUG-DEM-1 HIGH: b2b_demands.status không có CHECK
**Reproduce:** INSERT với status='totally-fake-status' → success HTTP 201.

**Impact:**
- Data integrity hole: bất kỳ value nào lưu vào DB
- UI filter theo status có thể miss demand lỗi
- Application code compare `status === 'published'` fail ngầm

**Fix:** Sprint L SQL:
```sql
ALTER TABLE b2b_demands ADD CONSTRAINT chk_demand_status
  CHECK (status IN ('draft','published','filled','closed','cancelled'));
```

---

### 🟠 BUG-DEM-2 HIGH: b2b_demand_offers.status không có CHECK
**Reproduce:** INSERT với status='FAKE-STATUS-XYZ' → success HTTP 201.

**Current values seen in DB:** `pending`, `accepted`, `withdrawn`. Có thể có `rejected` từ code.

**Fix:**
```sql
ALTER TABLE b2b_demand_offers ADD CONSTRAINT chk_offer_status
  CHECK (status IN ('pending','accepted','rejected','withdrawn','cancelled'));
```

---

### 🟠 BUG-DEM-5 HIGH: RLS policies "Allow all access"
**Finding:** `"Allow all access to b2b_demands"` / `"Allow all access to b2b_demand_offers"` — cmd=ALL, roles=public.

**Impact:**
- Partner authenticated có thể UPDATE/DELETE demand của factory
- Partner có thể UPDATE offer của partner khác
- Violate RLS principle of least privilege

**Fix:** Sprint L SQL — DROP policies "Allow all" + giữ các policy specific:
```sql
DROP POLICY "Allow all access to b2b_demands" ON b2b_demands;
DROP POLICY "Allow all access to b2b_demand_offers" ON b2b_demand_offers;
-- Dependent specific policies (demands_manage_staff / offers_*_own) giữ nguyên
```

---

### 🟠 BUG-DEM-8 HIGH: DELETE deal crash vì audit log trigger
**Reproduce:**
```sql
DELETE FROM b2b_deals WHERE id = '<uuid>';
-- ERROR 23503 audit_log FK violation
```

**Root cause:** Trigger `trg_deal_audit` AFTER DELETE fires after deal row deleted. Function `log_deal_changes()` INSERT audit row WITH deal_id = OLD.id, nhưng deal row đã biến mất → FK `deal_audit_log.deal_id → deals(id) ON DELETE CASCADE` block.

**Impact:**
- Admin KHÔNG thể hard delete deal (kể cả test data)
- Chỉ cancel qua status='cancelled' (soft delete)
- Cleanup migration / data seeding bị khóa

**Fix:** Sprint L — 1 trong 2 cách:
- (a) Sửa `log_deal_changes()` skip INSERT khi TG_OP='DELETE' (chỉ log UPDATE + INSERT)
- (b) Thay ON DELETE CASCADE bằng ON DELETE SET NULL cho `deal_audit_log.deal_id` + giữ audit record standalone

---

### 🟡 BUG-DEM-4 MED: deal_number max 20 chars
**Reproduce:** `deal_number='DL-TEST-FROMDEMAND-001'` (22 chars) → ERROR 22001.

**Impact:** UI tự generate hoặc user input dài > 20 ký tự → ERP fail.

**Fix:** Sprint L SQL:
```sql
ALTER TABLE b2b.deals ALTER COLUMN deal_number TYPE VARCHAR(32);
```
Hoặc UI validate max length 20.

---

### 🔵 BUG-DEM-6 LOW: trigger `warn_accepted_offer_no_deal` silent
Trigger chỉ RAISE WARNING khi offer=accepted + deal_id NULL. PostgREST KHÔNG trả warning về client → effectively silent log.

**Fix:** Đổi RAISE WARNING → RAISE NOTICE với pg_notify + app-side subscribe, hoặc RAISE EXCEPTION với soft block. Hoặc bỏ trigger (coi như reminder dev-only).

### 🔵 BUG-DEM-7 INFO: CHECK deadline NOT VALID
`chk_demand_deadline_after_publish` định nghĩa `NOT VALID` → không enforce existing rows. New rows vẫn check OK.

**Fix (optional):** `ALTER TABLE b2b_demands VALIDATE CONSTRAINT chk_demand_deadline_after_publish;` — validate + fail nếu có row vi phạm (cần cleanup trước).

---

## 5. GOOD findings (hoạt động đúng)

- ✅ CHECK `chk_demand_qty_positive` (> 0)
- ✅ CHECK `chk_demand_drc_range` (0-100 + min≤max)
- ✅ CHECK `chk_demand_price_range` (min≥0 + min≤max)
- ✅ CHECK `chk_demand_output_rate_range` (0-100)
- ✅ CHECK `chk_offer_price_positive`, `chk_offer_qty_positive`, `chk_offer_drc_range`
- ✅ UNIQUE `b2b_demands_code_key`
- ✅ FK `b2b_demand_offers.demand_id → b2b_demands ON DELETE CASCADE` — xoá demand tự động xoá offers
- ✅ FK `b2b_demand_offers.partner_id → b2b.partners ON DELETE RESTRICT` — không xoá partner nếu còn offer
- ✅ FK `b2b_demand_offers.deal_id → b2b.deals ON DELETE SET NULL` — xoá deal nulls offer.deal_id
- ✅ Trigger `trg_demand_overfill_check` work chính xác — reject khi SUM(accepted) > demand.quantity_kg
- ✅ FK `b2b_deals.demand_id` + `b2b_deals.offer_id` để track nguồn gốc deal

---

## 6. Sprint L — đề xuất migration

```sql
-- ============================================================================
-- B2B Sprint L — Fix 6 bugs E2E Demand→Offer→Deal audit
-- ============================================================================

-- L-1 BUG-DEM-1: CHECK status b2b_demands
ALTER TABLE public.b2b_demands
  ADD CONSTRAINT chk_demand_status
  CHECK (status IN ('draft','published','filled','closed','cancelled'));

-- L-2 BUG-DEM-2: CHECK status b2b_demand_offers
ALTER TABLE public.b2b_demand_offers
  ADD CONSTRAINT chk_offer_status
  CHECK (status IN ('pending','accepted','rejected','withdrawn','cancelled'));

-- L-3 BUG-DEM-3: Auto-update quantity_filled_kg + status transition
CREATE OR REPLACE FUNCTION public.sync_demand_filled_on_offer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, b2b, pg_temp
AS $$
DECLARE
  v_total_accepted NUMERIC;
  v_demand_qty NUMERIC;
  v_demand_id UUID;
BEGIN
  v_demand_id := COALESCE(NEW.demand_id, OLD.demand_id);
  SELECT quantity_kg INTO v_demand_qty
  FROM public.b2b_demands WHERE id = v_demand_id;

  SELECT COALESCE(SUM(offered_quantity_kg), 0) INTO v_total_accepted
  FROM public.b2b_demand_offers
  WHERE demand_id = v_demand_id AND status = 'accepted';

  UPDATE public.b2b_demands
  SET quantity_filled_kg = v_total_accepted,
      status = CASE
        WHEN v_total_accepted >= v_demand_qty AND status = 'published' THEN 'filled'
        WHEN v_total_accepted < v_demand_qty AND status = 'filled' THEN 'published'
        ELSE status
      END,
      updated_at = NOW()
  WHERE id = v_demand_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_demand_filled ON public.b2b_demand_offers;
CREATE TRIGGER trg_sync_demand_filled
  AFTER INSERT OR UPDATE OF status OR DELETE
  ON public.b2b_demand_offers
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_demand_filled_on_offer();

-- L-4 BUG-DEM-4: Nới deal_number max 32 chars
ALTER TABLE b2b.deals ALTER COLUMN deal_number TYPE VARCHAR(32);

-- L-5 BUG-DEM-5: Drop over-permissive RLS policies
DROP POLICY IF EXISTS "Allow all access to b2b_demands" ON public.b2b_demands;
DROP POLICY IF EXISTS "Allow all access to b2b_demand_offers" ON public.b2b_demand_offers;

-- L-6 BUG-DEM-8: Fix log_deal_changes skip DELETE case
CREATE OR REPLACE FUNCTION b2b.log_deal_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = b2b, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Không INSERT audit row cho DELETE vì deal row đã gone → FK violation.
    -- Audit log của DELETE nên lưu qua service-side log (app table audit).
    RETURN OLD;
  END IF;
  -- ... keep existing INSERT/UPDATE logic ...
  RETURN NEW;
END;
$$;

-- Backfill quantity_filled_kg cho existing demands
UPDATE public.b2b_demands d
SET quantity_filled_kg = (
  SELECT COALESCE(SUM(offered_quantity_kg), 0)
  FROM public.b2b_demand_offers
  WHERE demand_id = d.id AND status = 'accepted'
);

NOTIFY pgrst, 'reload schema';
```

---

## 7. Test data remaining

Deal ID `4cd4e7a1-8435-40df-8261-64156a8d7f69` (`DL-E2E-DEMAND-01`) tồn đọng vì không DELETE được (BUG-DEM-8). Giữ lại để reference / manual cleanup sau khi Sprint L fix log_deal_changes.

Cleanup manual khi Sprint L applied:
```sql
DELETE FROM b2b.deals WHERE deal_number = 'DL-E2E-DEMAND-01';
```

---

## 8. Next actions đề xuất

1. **Review Sprint L migration file** — chốt logic với BGĐ trước apply
2. **Apply Sprint L** trên staging trước production (backfill quantity_filled có thể nặng)
3. **Update UI** validate deal_number length ≤ 32 chars
4. **Service code audit** — tìm chỗ nào set `demand.status` / `offer.status` để đảm bảo dùng value trong enum CHECK mới
5. **E2E test UI** sau Sprint L:
   - Factory tạo demand → publish → đại lý thấy
   - Partner submit offer → factory accept (test trigger fire → quantity_filled++)
   - Tạo deal từ offer → link chain đúng
6. **Performance test**: với demand có >100 offers, trigger `sync_demand_filled` recompute SUM có nặng không?

---

## 9. Summary bảng mapping → fix

| Bug | File migration | Trạng thái |
|---|---|---|
| BUG-DEM-1 status check demand | Sprint L L-1 | 🔜 pending |
| BUG-DEM-2 status check offer | Sprint L L-2 | 🔜 pending |
| BUG-DEM-3 auto quantity_filled | Sprint L L-3 | 🔜 pending (CRITICAL) |
| BUG-DEM-4 deal_number length | Sprint L L-4 | 🔜 pending |
| BUG-DEM-5 RLS too permissive | Sprint L L-5 | 🔜 pending |
| BUG-DEM-6 warning silent | Optional | defer |
| BUG-DEM-7 CHECK NOT VALID | Optional | defer |
| BUG-DEM-8 DELETE deal crash | Sprint L L-6 | 🔜 pending |

Không push file Sprint L SQL. Chờ user review trước.
