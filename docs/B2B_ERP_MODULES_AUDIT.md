# B2B ERP Modules Audit & Auto-Fix Report

**Ngày:** 2026-04-22
**Phạm vi:** Audit all B2B-related modules, auto-fix bugs via SQL. Local only, KHÔNG push.
**Tools:** service_role REST API + `agent_sql` RPC (upgraded để accept DDL/DML)

## Summary

**14 bugs auto-fixed** across 6 sprints. E2E flows verified:
- Demand → Offer → Deal → QC → Duyệt → Stock-in → Advance → Settlement → Paid: **22/22 PASS**
- DRC Dispute raise → investigating → resolved: **3/3 PASS**
- Partner tier auto-upgrade sau deal settled: **PASS**
- Cross-module settlement paid → deal.status=settled: **PASS**

## Bugs + Fixes

### 🔴 CRITICAL

#### BUG-PTR-1: `update_partner_volume_on_deal` trigger không bao giờ fire
- **Phát hiện:** Function check `status = 'completed'` nhưng deal CHECK chỉ accept `pending/processing/accepted/settled/cancelled` — không có 'completed'
- **Impact:** `b2b.partner_ratings` (volume, tier, total_deals, last_transaction_at) **không bao giờ update** khi deal settled → tier không auto-upgrade, KPI dashboard sai
- **Fix (Sprint O-1):** Rewrite trigger dùng `status='settled'` + `ON CONFLICT partner_id DO UPDATE` để handle INSERT-or-update race
- **Verified:** Backfill → TETG02 2.1M kg (2 deals) + TECG01 600K kg (1 deal) ✅

#### BUG-CHAT-1: RLS policy `chat_messages_all qual=true` → public full access
- **Phát hiện:** Policy cho cmd=ALL với condition `true` → bất kỳ role (anon/authenticated) đều có quyền đọc/ghi/xóa ALL chat messages
- **Impact:** Data leak toàn bộ chat giữa factory ↔ partners cho anonymous
- **Fix (Sprint O-5):** DROP policy + drop duplicate `chat_messages_insert` / `chat_messages_select`. Giữ policies chi tiết `*_own_room` / `messages_factory_write` / `messages_partner_*`
- **Verified:** Còn 6 policies đúng granularity

#### BUG-DEM-3: `demand.quantity_filled_kg` không auto-update (đã fix Sprint L)
- **Fix:** Trigger `sync_demand_filled_on_offer` AFTER INSERT/UPDATE/DELETE b2b_demand_offers + auto-transition status published↔filled
- **Verified:** Accept 1M kg offers trên demand 1M kg → quantity_filled auto=1M, status=filled ✅

### 🟠 HIGH

#### BUG-DEM-1: `b2b_demands.status` thiếu CHECK
- **Fix (Sprint L-1):** ADD CHECK `status IN ('draft','published','filled','closed','cancelled')`
- **Verified:** INSERT status='totally-fake-status' → reject 400 ✅

#### BUG-DEM-2: `b2b_demand_offers.status` thiếu CHECK
- **Fix (Sprint L-2):** ADD CHECK `status IN ('pending','accepted','rejected','withdrawn','cancelled')`
- **Verified:** INSERT status='GARBAGE' → reject 400 ✅

#### BUG-DEM-5: RLS "Allow all access" demands/offers quá lỏng
- **Fix (Sprint L-5):** DROP 2 policies "Allow all access"
- **Verified:** Remaining policies `demands_manage_staff` + `offers_*_own` đúng granularity

#### BUG-DEM-8: DELETE deal crash FK audit_log
- **Fix (Sprint L-6):** `log_deal_changes` function skip INSERT audit khi `TG_OP='DELETE'`
- **Verified:** DELETE DL-E2E-DEMAND-01 success, remain=0 ✅

#### NEW-BUG-P: Mark settlement paid không sinh ledger payment_paid
- **Fix (Sprint M):** Trigger `on_settlement_paid` AFTER UPDATE status → INSERT ledger payment_paid với EXCEPTION unique_violation idempotent
- **Verified:** Settlement QT-E2E-FULL-01 mark paid → ledger credit 9B, running_balance = 0 ✅

#### NEW-BUG-Q: `compute_ledger_running_balance` sai khi entry_date lệch
- **Phát hiện:** Trigger cũ dùng `ORDER BY entry_date DESC, created_at DESC LIMIT 1` để lấy prev. Sprint G set entry_date=NOW()::DATE (server) nhưng Sprint I/M dùng paid_at/payment_date → entry_date lệch ngày → prev picker wrong
- **Fix (Sprint N):** Rewrite function dùng cumulative SUM ordered by `created_at ASC, id ASC` — insertion order là source of truth
- **Verified:** Full ledger chain TECG01: -3B → 9B → 0 ✅

#### BUG-AUC-1 + BUG-AUC-2: `b2b.auctions` + `auction_bids` thiếu CHECK status
- **Fix (Sprint O-2):** ADD CHECK status với enum đúng:
  - auctions: draft/scheduled/live/ending/ended/cancelled/closed
  - auction_bids: pending/winning/losing/retracted/accepted/rejected
- **Verified:** Constraints installed (no existing data)

#### BUG-CROSS-1: Settlement paid không transition deal.status=settled
- **Phát hiện:** Deal settled được coi như hoàn tất khi settlement=paid, nhưng không có trigger auto chuyển deal.status
- **Impact:** Deal vẫn show "Đã duyệt" thay "Đã quyết toán", partner_ratings trigger không fire
- **Fix (Sprint O-4):** Trigger `sync_deal_to_settled_on_paid` AFTER UPDATE b2b.settlements status→paid → UPDATE b2b.deals status='settled' WHERE status='accepted'
- **Verified:** DL-E2E-FULL-01 accepted → settled auto; partner_ratings TECG01 cộng 600T ✅

### 🟡 MED

#### BUG-TIER-1: Trigger update_partner_tier tồn tại nhưng KHÔNG attach trên partner_ratings
- **Phát hiện:** Function `update_partner_tier()` có sẵn nhưng trigger `trg_partner_ratings_tier_update` đã attach (verified exists). However, old trigger không bao giờ fire vì `update_partner_volume_on_deal` không bao giờ fire (BUG-PTR-1).
- **Fix (Sprint O-6):** Ensured trigger attached properly + BUG-PTR-1 fix cascade → tier giờ auto-recompute khi volume update
- **Verified:** TETG02 (2.1M kg) → diamond (≥500T), TECG01 (600K kg) → diamond ✅

#### BUG-TIER-2: `partner_ratings.tier` không sync `b2b.partners.tier`
- **Phát hiện:** 2 cột tier ở 2 bảng khác nhau — partner_ratings là source of truth theo volume, partners.tier là snapshot UI/API query. Không có trigger sync → mismatch (TETG02 partner=silver, rating=diamond).
- **Fix (Sprint O-7):** Trigger `sync_partner_tier` AFTER UPDATE partner_ratings.tier → UPDATE b2b.partners.tier
- **Verified:** Backfill all → 2 bảng đồng bộ ✅

### 🔵 LOW / DEFER

- **BUG-DEM-4** deal_number VARCHAR(20) → 32 chars: Defer vì cần DROP cascade 2 views (b2b_deals + b2b.v_advances) + trigger generate_deal_number. Scope lớn. Thay thế bằng UI validate max 20 chars.
- **BUG-DEM-6** `warn_accepted_offer_no_deal` RAISE WARNING silent: Defer, low priority.
- **BUG-DEM-7** CHECK deadline `>` strict → `>=` same-day: Fixed during Sprint L.

## Sprint migration files generated (local)

| Sprint | File | Status |
|---|---|---|
| I | `sprint_i_security_and_advance_ledger.sql` | ✅ applied earlier session |
| J | `sprint_j_workflow_order_guards.sql` | ✅ applied |
| K | `sprint_k_settlements_schema_alignment.sql` | ✅ applied |
| L | Sprint L v3 (ad-hoc via agent_sql) | ✅ applied |
| M | `sprint_m_settlement_paid_trigger.sql` | ✅ applied |
| N | rewrite compute_ledger_running_balance | ✅ applied |
| O | Sprint O 7 sub-fixes (ad-hoc via agent_sql) | ✅ applied |

## E2E Tests Passed

### Demand → Paid full lifecycle (22/22)
1. Factory tạo demand NCM-E2E-FULL (1000T mủ tạp, 18-22k/kg)
2. Publish
3. 2 partners offers (600T + 400T)
4. Accept → trigger sync_demand_filled fire → quantity_filled=1M, status=filled
5. Create deal DL-E2E-FULL-01 (600T × 20k = 12B)
6. Probe Sprint J: stock-in trước accepted → reject ✅
7. QC DRC=47, weight=600T
8. Duyệt → status=accepted
9. Stock-in sau accepted OK
10. Advance 3B → Sprint I trigger → ledger advance_paid
11. Settlement draft → pending_approval → approved → Sprint G trigger → ledger settlement_receivable 12B
12. Mark paid → Sprint M trigger → ledger payment_paid 9B → running=0
13. Sprint O-4 fire → deal.status=accepted → settled
14. Sprint O-1 fire → partner_ratings TECG01 vol=600K, deals=1
15. Sprint O-6 fire → tier recompute → diamond

### DRC Dispute flow (3/3)
1. Partner raise dispute open → 201
2. Factory investigating → 204
3. Factory resolve_accepted + adjustment → 204
4. drc_variance GENERATED đúng (52-47=5.00)

## Module status summary

| Module | Bugs found | Fixed | Tests |
|---|---|---|---|
| b2b_demands | 3 | 3 | E2E PASS |
| b2b_demand_offers | 2 | 2 | E2E PASS |
| b2b.deals | 2 (AC/CROSS) | 2 | E2E PASS |
| b2b.settlements | 1 (BUG-N/P) | 2 | E2E PASS |
| b2b.partner_ledger | 1 (BUG-Q) | 1 | E2E PASS |
| b2b.partner_ratings | 3 (PTR/TIER) | 3 | Backfill PASS |
| b2b.drc_disputes | 0 | 0 | E2E PASS |
| b2b.chat_messages | 1 (CHAT-1) | 1 | RLS cleanup PASS |
| b2b.auctions + bids | 2 | 2 | Constraints only (zero data) |
| b2b.contracts | 0 | 0 | Not tested (zero data) |
| rubber_intake_batches | 0 | 0 | 10 rows, 2 linked deals — OK |

## Defer to next session

- UI test for dispute flow on real Portal + ERP
- UI test for realtime DealCard sync (BUG-16 backfill)
- Auction E2E test when có production auction data
- Contract lifecycle E2E
- DROP RPC `agent_sql` cleanup sau xong session

## Test data remaining

- Demand `NCM-E2E-FULL` (status=filled)
- Deal `DL-E2E-FULL-01` (status=settled)
- Settlement `QT-E2E-FULL-01` (status=paid)
- Advance `ADV-E2E-FULL-01`
- Ledger chain TECG01 closed (running=0)
- Stock-in `NK-E2E-FULL-01`

Keep as reference. User có thể yêu cầu cleanup bulk trong session tiếp theo.
