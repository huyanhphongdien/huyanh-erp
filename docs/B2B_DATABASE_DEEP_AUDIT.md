# B2B Database — Deep Audit & Constraint Gaps

**Date:** 2026-04-21
**Scope:** Audit sâu schema + data thực tế production (dygveetaatqllhjusyzz) — tập trung ràng buộc data integrity phía partner portal
**Method:** Query production trực tiếp qua service_role, cross-reference schema gotchas

---

## 🔴 CRITICAL BUGS

### BUG-1: Tier casing inconsistent → Home banner render SAI
**Severity:** HIGH | **User-facing:** YES

**Hiện trạng:**
```
Tier values in DB: {'silver': 5, 'gold': 3, 'bronze': 3, 'Bronze': 1, 'diamond': 1, 'new': 1}
```
Partner `TETG01` (Đại lý Mủ Cao Su Miền Trung) có `tier = 'Bronze'` (capital B), khác 13 partners còn lại dùng lowercase.

**Impact:**
Frontend `TIER_CONFIG` key `'bronze'` (lowercase) không match `'Bronze'` → fallback to `'new'` → banner hiện "Thành viên mới" thay vì "Hạng Bronze" cho TETG01.

**File:** `D:\Projects\huyanh-b2b-portal\src\pages\partner\v2\HomePage.tsx:34-40`

**Fix DB:**
```sql
UPDATE b2b.partners SET tier = LOWER(tier) WHERE tier != LOWER(tier);

ALTER TABLE b2b.partners
  DROP CONSTRAINT IF EXISTS chk_partners_tier_lowercase;
ALTER TABLE b2b.partners
  ADD CONSTRAINT chk_partners_tier_lowercase
  CHECK (tier IN ('diamond','gold','silver','bronze','new'));
```

**Fix Frontend (defensive):**
```ts
const tier = TIER_CONFIG[(partner?.tier || 'new').toLowerCase()] || TIER_CONFIG.new
```

---

### BUG-2: Demand over-filled (sum offers > quantity)
**Severity:** HIGH | **User-facing:** YES (reporting sai)

**Hiện trạng:**
```
NCM-20260330-8KC | total=10,000,000kg | quantity_filled_kg=14,000,000kg | sum_accepted=14,000,000kg | status=filled
```
Demand gốc chỉ cần **10T** nhưng nhà máy đã accept **14T** (140% quantity). `quantity_filled_kg` tự update bằng `sum_accepted` nhưng không validate ≤ `quantity_kg`.

**Impact:**
- Partner thấy demand "Đã đóng" với qty vượt → hiểu nhầm
- Báo cáo sai mức độ filled
- Không có enforcement — nhà máy có thể tiếp tục accept vô hạn

**Root cause:**
Chưa có trigger validate ở INSERT/UPDATE offers khi status → accepted.

**Fix DB:**
```sql
CREATE OR REPLACE FUNCTION b2b.check_demand_not_overfill()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  total_qty NUMERIC;
  accepted_sum NUMERIC;
BEGIN
  IF NEW.status = 'accepted' THEN
    SELECT quantity_kg INTO total_qty FROM b2b.demands WHERE id = NEW.demand_id;
    SELECT COALESCE(SUM(offered_quantity_kg), 0) INTO accepted_sum
    FROM b2b.demand_offers
    WHERE demand_id = NEW.demand_id AND status = 'accepted' AND id != NEW.id;

    IF accepted_sum + COALESCE(NEW.offered_quantity_kg, 0) > total_qty THEN
      RAISE EXCEPTION 'Tổng offer accepted (%) vượt quantity demand (%)', accepted_sum + NEW.offered_quantity_kg, total_qty;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_demand_overfill_check ON b2b.demand_offers;
CREATE TRIGGER trg_demand_overfill_check
  BEFORE INSERT OR UPDATE OF status ON b2b.demand_offers
  FOR EACH ROW EXECUTE FUNCTION b2b.check_demand_not_overfill();
```

---

### BUG-3: Accepted offers không link tới deal
**Severity:** HIGH | **User-facing:** YES (workflow vỡ)

**Hiện trạng:**
```
offer=347466ec | demand=fae94e7e | accepted | deal_id=NULL   ← BUG
offer=02cdc628 | demand=fae94e7e | accepted | deal_id=NULL   ← BUG
```
Theo workflow chuẩn: offer accepted → nhà máy auto tạo deal → FK `offer.deal_id = deal.id`. Hiện tại 2 offers accepted không có deal tương ứng → workflow broken.

**Impact:**
- Partner thấy "Trúng thầu" trong Opportunities nhưng KHÔNG có Deal ở Orders → confuse
- Nhà máy không thực hiện được bước tiếp (advance, settlement)
- Báo cáo volume sai

**Fix code (ERP side):**
Khi factory accept offer → RPC tự tạo deal + link:
```ts
// dealService.acceptOffer()
const deal = await createDeal(...)
await supabase.from('b2b_demand_offers').update({ deal_id: deal.id }).eq('id', offerId)
```

**Fix DB (enforcement):**
```sql
ALTER TABLE b2b.demand_offers
  ADD CONSTRAINT chk_accepted_has_deal
  CHECK (status != 'accepted' OR deal_id IS NOT NULL);
```
(Cần backfill trước khi enforce.)

---

### BUG-4: actual_drc populated mà stock_in_count = 0 (data phi logic)
**Severity:** MEDIUM | **User-facing:** partial

**Hiện trạng:**
```
DL2604-7B5P actual_drc=55.0, stock_in=0, qc_status=pending
```
DRC thực tế có nghĩa đã cân QC → phải có stock_in. Hiện `stock_in_count = 0` — ai đó set `actual_drc` bằng tay mà chưa qua luồng nhập kho.

**Impact:**
- Stages timeline sai: QC bị current mà Nhập kho không done
- Partner thấy inconsistency
- QC dispute trigger sớm (nút "Khiếu nại DRC" hiện khi chưa thực sự có data)

**Fix:**
- Clean data: set `actual_drc = NULL` nếu `stock_in_count = 0`
- Thêm CHECK:
```sql
ALTER TABLE b2b.deals
  ADD CONSTRAINT chk_deals_drc_requires_stockin
  CHECK (actual_drc IS NULL OR stock_in_count > 0);
```

---

### BUG-5: Notifications `audience = NULL` → bell dropdown miss notifications
**Severity:** MEDIUM | **User-facing:** YES (partner không nhận notification)

**Hiện trạng:**
```
type=success | audience=None | title="Chào mừng đến B2B Portal"
type=deal    | audience=None | title="Phiếu chốt mới"
```

Bell dropdown query:
```ts
.in('audience', ['partner', 'both'])
```
Rows với `audience=NULL` → bị loại → partner không thấy.

**Impact:** 2 notifications hiện có đều không tới partner.

**Fix:**
- Migration: backfill `UPDATE b2b.notifications SET audience='both' WHERE audience IS NULL`
- Thêm NOT NULL constraint:
```sql
ALTER TABLE b2b.notifications ALTER COLUMN audience SET NOT NULL;
ALTER TABLE b2b.notifications ALTER COLUMN audience SET DEFAULT 'both';
```

---

## 🟡 HIGH — Missing constraints / validations

### GAP-6: Demand offers không có UNIQUE(partner_id, demand_id)
**Severity:** MEDIUM

Partner có thể nộp **N offers** cùng 1 demand → messy.
```
Current: partner 11111111 submitted 2 offers cho demand fae94e7e (5000T + 9000T, cả 2 accepted)
```

**Fix:**
```sql
-- Giữ 1 offer active / (partner, demand) — offer withdrawn không count
CREATE UNIQUE INDEX idx_offer_active_unique
  ON b2b.demand_offers (partner_id, demand_id)
  WHERE status IN ('pending', 'submitted', 'accepted');
```

---

### GAP-7: Chat rooms thiếu `factory_id`
**Severity:** MEDIUM

```
b2b_chat_rooms columns: created_at, deal_id, demand_id, id, is_active, last_message_at,
message_count, partner_id, room_name, room_type, status
```
Không có `factory_id`. Nếu partner làm với **>1 nhà máy** (VD: Phong Điền + Tân Lâm) → chỉ có 1 room chung, không phân biệt được nhà máy nào.

**Fix:**
```sql
ALTER TABLE b2b.chat_rooms ADD COLUMN IF NOT EXISTS factory_id UUID REFERENCES public.facilities(id);

-- Unique (partner_id, factory_id)
CREATE UNIQUE INDEX idx_chat_room_partner_factory
  ON b2b.chat_rooms (partner_id, factory_id)
  WHERE is_active = true;
```

---

### GAP-8: Demand không có CHECK `quantity_kg > 0`
```sql
ALTER TABLE b2b.demands
  ADD CONSTRAINT chk_demand_qty_positive CHECK (quantity_kg > 0);
ALTER TABLE b2b.demands
  ADD CONSTRAINT chk_demand_price_range CHECK (
    price_min IS NULL OR price_max IS NULL OR price_min <= price_max
  );
ALTER TABLE b2b.demands
  ADD CONSTRAINT chk_demand_drc_range CHECK (
    drc_min IS NULL OR drc_max IS NULL OR (drc_min > 0 AND drc_max <= 100 AND drc_min <= drc_max)
  );
```

---

### GAP-9: Offer không có CHECK positive values
```sql
ALTER TABLE b2b.demand_offers
  ADD CONSTRAINT chk_offer_qty_positive CHECK (offered_quantity_kg > 0);
ALTER TABLE b2b.demand_offers
  ADD CONSTRAINT chk_offer_price_positive CHECK (offered_price > 0);
ALTER TABLE b2b.demand_offers
  ADD CONSTRAINT chk_offer_drc_range CHECK (
    offered_drc IS NULL OR (offered_drc > 0 AND offered_drc <= 100)
  );
```

---

### GAP-10: Demand `deadline` có thể < `published_at`
Không kiểm tra deadline tương lai. Demand có thể publish với deadline quá khứ.
```sql
ALTER TABLE b2b.demands
  ADD CONSTRAINT chk_demand_deadline_after_publish CHECK (
    deadline IS NULL OR published_at IS NULL OR deadline > published_at
  );
```

---

## 🟢 MEDIUM — Code/UX issues phát hiện trong audit

### ISSUE-11: Expired demand vẫn filter vào "Đang mở"
**File:** `OpportunitiesPage.tsx:84-93` (portal)

Filter hiện:
```ts
if (activeTab === 'open') return d.status === 'published' && !demandIdsSubmitted.has(d.id)
```
Chưa loại trừ `deadline < now`.

**Fix:**
```ts
const now = new Date()
if (activeTab === 'open') {
  return d.status === 'published'
    && !demandIdsSubmitted.has(d.id)
    && (!d.deadline || new Date(d.deadline) >= now)
}
// Expired demands → add to 'closed' tab
if (activeTab === 'closed') {
  return d.status === 'closed'
    || d.status === 'filled'
    || (d.status === 'published' && d.deadline && new Date(d.deadline) < now)
}
```

---

### ISSUE-12: Status `filled` không load
Query hiện tại:
```ts
supabase.from('b2b_demands').select('*').in('status', ['published', 'closed'])
```
Missing `'filled'` → demand 8KC không hiện → tab "Trúng thầu" / "Đã đóng" empty sai.

**Fix:**
```ts
.in('status', ['published', 'closed', 'filled'])
```

---

### ISSUE-13: HomePage KPI "Khối lượng tháng" format sai
Hiện: `15400.0 T` (đọc khó)
**Fix:** dùng `formatTons()` helper đã có → `15.4K T`

---

### ISSUE-14: FinancePage dispute modal dùng RPC sai trong context factory
**File:** `FinancePage.tsx:304`
```ts
await supabase.rpc('partner_raise_drc_dispute', { ... })
```
RPC này verify `auth.uid() → partner_user_id → partner_id` match. Nếu partner JWT không populate đúng → fail silently với error generic "Không thể gửi khiếu nại".

**Verify RLS:**
Cần test thực tế — login partner → raise dispute → check success.

---

## 📋 RLS POLICY AUDIT (chưa verify thực tế)

Các policy documented ở [memory/b2b_realtime_schema.md] và [memory/b2b_sprint_1_4_enforcement.md]:

| Table | Expected Policy | Verified? |
|---|---|---|
| b2b.partners | `SELECT` — verified only or own | ⏳ |
| b2b.deals | `SELECT/UPDATE` — own partner | ⏳ |
| b2b.chat_rooms | `SELECT` — partner = self | ⏳ |
| b2b.chat_messages | `SELECT/INSERT` — room in own partner | ⏳ |
| b2b.demand_offers | `SELECT/INSERT` — own partner | ⏳ |
| b2b.demands | `SELECT` — all published + own offers | ⏳ |
| b2b.advances | `SELECT` — own partner | ⏳ |
| b2b.settlements | `SELECT` — own partner | ⏳ |
| b2b.partner_ledger | `SELECT` — own partner | ⏳ |
| b2b.drc_disputes | `SELECT/INSERT` — own partner | ⏳ |
| b2b.notifications | `SELECT` — own partner + audience | ⏳ |

### Test manual RLS (cần chạy):

Login 2 partner khác nhau (VD TETG02 + TEGP01) → mỗi partner verify:
- `/partner/orders` chỉ thấy deals của mình
- `/partner/finance?tab=ledger` chỉ thấy entries của mình
- Direct API call qua DevTools: `supabase.from('b2b_deals').select('*')` → trả đúng partner scope
- Nếu leak data partner khác → **CRITICAL**

---

## 🔍 DATA INTEGRITY issues found

### Data cleanup cần làm

```sql
-- 1. Fix tier casing
UPDATE b2b.partners SET tier = LOWER(tier);

-- 2. Clean actual_drc của deals chưa stock_in
UPDATE b2b.deals SET actual_drc = NULL, qc_status = 'pending'
WHERE stock_in_count = 0 OR stock_in_count IS NULL;

-- 3. Backfill notifications.audience
UPDATE b2b.notifications SET audience = 'both' WHERE audience IS NULL;

-- 4. Recalc demand.quantity_filled_kg từ sum accepted offers
UPDATE b2b.demands d SET quantity_filled_kg = (
  SELECT COALESCE(SUM(o.offered_quantity_kg), 0)
  FROM b2b.demand_offers o
  WHERE o.demand_id = d.id AND o.status = 'accepted'
);

-- 5. Nếu muốn reset demand 8KC (over-filled) — xem xét reject bớt offers hoặc tăng quantity gốc
```

---

## 🏗️ ROADMAP FIX — 3 sprint

### Sprint A (CRITICAL — 1 ngày)
- [ ] BUG-1: Lowercase tier migration + CHECK + frontend defensive
- [ ] BUG-3: Backfill `offer.deal_id` cho 2 offers accepted của 8KC
- [ ] BUG-4: Clean `actual_drc` data + CHECK constraint
- [ ] BUG-5: Backfill `notifications.audience` + NOT NULL default
- [ ] ISSUE-11, 12, 13: Frontend fixes (expired filter, filled status, format tons)

### Sprint B (HIGH — 1.5 ngày)
- [ ] BUG-2: Trigger check demand overfill + backfill 8KC
- [ ] GAP-6: UNIQUE (partner_id, demand_id) offers
- [ ] GAP-8, 9, 10: CHECK constraints demand + offers
- [ ] RLS manual verify 2 partner accounts

### Sprint C (MEDIUM — 1 ngày)
- [ ] GAP-7: `chat_rooms.factory_id` column + migration
- [ ] ISSUE-14: RPC dispute verify với partner JWT
- [ ] Audit trigger DELETE bug fix (từ memory Sprint 1-4 còn tồn)
- [ ] TypeScript types sync với DB schema thực tế

---

## Summary severity

| # | Bug/Gap | Severity | Data loss risk | User-facing |
|---|---|---|---|---|
| 1 | Tier casing | HIGH | NO | YES (wrong tier display) |
| 2 | Demand over-filled | HIGH | NO | YES (report wrong) |
| 3 | Offer-deal link missing | HIGH | NO | YES (workflow broken) |
| 4 | DRC without stock-in | MED | NO | YES (inconsistency) |
| 5 | Notification audience NULL | MED | NO | YES (miss notifications) |
| 6 | Offer duplicate per demand | MED | NO | NO |
| 7 | Chat factory_id missing | MED | NO | NO (yet) |
| 8-10 | CHECK constraints | MED | NO | NO |
| 11-13 | Frontend filter bugs | LOW | NO | YES (minor UX) |
| 14 | RPC verify | LOW | NO | NO |

**Total:** 14 issues — 5 CRITICAL/HIGH, 5 MEDIUM, 4 LOW.
**Blocker trước rollout:** BUG-1 đến BUG-5 + RLS manual verify.
