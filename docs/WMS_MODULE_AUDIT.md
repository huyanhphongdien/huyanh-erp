# WMS Module Deep Audit + Auto-Fix Report

**Ngày:** 2026-04-22
**Phạm vi:** Module Kho (WMS) — 10 sub-menu, full DB + UI audit, E2E SQL test
**Tools:** service_role REST + `agent_sql` RPC
**Status:** ✅ 3 bugs auto-fixed, E2E test 17/17 PASS

## Summary

| Severity | Bugs | Status |
|---|---|---|
| 🔴 CRITICAL | 1 (BUG-WMS-1 guard Sprint J không fire) | ✅ FIXED |
| 🟠 HIGH | 1 (BUG-WMS-2 15 "Allow all" RLS policies) | ✅ FIXED |
| 🟡 MED | 1 (BUG-WMS-3 SECURITY DEFINER thiếu search_path) | ✅ FIXED |

## Bugs detail

### 🔴 BUG-WMS-1 CRITICAL: Sprint J guard lowercase mismatch
**Phát hiện:** `enforce_weighbridge_requires_accepted_deal` check `ticket_type = 'IN'` (uppercase), nhưng `weighbridge_tickets.ticket_type` CHECK là `('in','out')` lowercase → guard **KHÔNG BAO GIỜ fire**.

**Impact:** Deal processing vẫn cho cân xe IN → bypass rule business "cân chỉ khi accepted" (Sprint J).

**Fix (P-0):** Rewrite function compare `!= 'in'` lowercase. Plus bypass `status IN ('cancelled','void')`.

**Verified:** Test INSERT weighbridge ticket với deal DL2604-4HYZ (processing) → **400 reject** ✅
```
ERROR P0001: Deal DL2604-4HYZ đang "processing" — chỉ cân được khi deal đã DUYỆT
```

### 🟠 BUG-WMS-2 HIGH: 15 "Allow all" RLS policies WMS tables
**Phát hiện:** Nhiều policy cmd=ALL qual=true cho role=public (pattern giống BUG-CHAT-1 earlier). Tables affected:
- `materials`, `stock_batches`, `stock_in_orders`, `stock_out_orders`, `stock_levels`, `warehouses`
- `stock_in_details`, `stock_out_details`, `warehouse_locations`
- `weighbridge_tickets`, `weighbridge_images`, `scale_operators`
- `inventory_transactions`

**Impact:** Any authenticated user có toàn quyền CRUD → leak inventory data.

**Fix (P-1):** DROP 15 policies. Granular `wms_*` policies (read/insert/update/delete) còn lại có đủ.

**Verified:** Count leftover = 0 ✅

### 🟡 BUG-WMS-3 MED: 5 SECURITY DEFINER functions thiếu search_path
**Phát hiện:**
- `trigger_set_material_code()`
- `fn_calc_intake_batch_amount()`
- `fn_update_material_stock_from_variants()`
- `enforce_batch_deal_lock()`
- `generate_material_code(uuid, uuid)`

**Impact:** Search_path hijack nguy cơ.

**Fix (P-2):** ALTER FUNCTION SET search_path = public, b2b, pg_temp.

## GOOD findings (không bug)

### CHECK constraints đầy đủ
- `stock_in_orders`: status (draft/confirmed/cancelled), type (raw/finished), source_type (purchase/production/transfer/opening_balance/b2b)
- `stock_out_orders`: status (draft/picking/picked/shipped/confirmed/cancelled), reason (sale/production/transfer/blend/loss/adjustment)
- `stock_batches`: status (active/depleted/expired), qc_status (pending/passed/warning/...), batch_type (production/blend/purchase/...)
- `weighbridge_tickets`: ticket_type (in/out), status (weighing_gross/weighing_tare/completed), qc_status, reference_type
- `inter_facility_transfers`: from != to, loss_threshold_pct 0-100, status ENUM

### Cross-table consistency
- Zero active batches with quantity_remaining <= 0
- Zero depleted batches with quantity_remaining > 0
- All stock_batches.qc_status values valid per CHECK

### Triggers installed
- `trg_enforce_weighbridge_accepted` (Sprint J) — fix lowercase
- `trg_enforce_b2b_stock_in_accepted` (Sprint J) — work đúng source_type='b2b'
- `trg_sync_deal_stock_in_count` (Sprint E BUG-9) — auto count
- `trg_batch_deal_lock` — enforce_batch_deal_lock
- `trg_rms_calc_dry_remaining` — raw_material_stock dry calc

### UI Route (inline tabs thông minh)
- `/wms` — tồn kho (tabs: overview/nvl/alerts/stock-check)
- `/wms/qc` — QC / DRC (tabs: dashboard/recheck/quick-scan/standards)
- `/wms/reports` — báo cáo (tabs: dashboard/stock-movement/supplier-quality/inventory-value/supplier-scoring)

## E2E Test Results

**17/17 PASS:**

| # | Step | Status |
|---|---|---|
| T1 | Warehouses (7 rows) | ✅ |
| T2 | Materials (19 rows) | ✅ |
| T3 | CHECK stock_in status reject invalid | ✅ |
| T4 | CHECK stock_in type reject invalid | ✅ |
| T5 | Create stock_in_order (purchase/raw) | ✅ |
| T6 | Confirm stock_in (status draft→confirmed) | ✅ |
| T7 | Create stock_batch | ✅ |
| T8 | CHECK batch status reject invalid | ✅ |
| T9 | QC update batch (drc, qc_status=passed) | ✅ |
| T10 | Create stock_out_order (sale) | ✅ |
| T11 | CHECK reason reject invalid | ✅ |
| T12 | Weighbridge IN ticket (no deal) | ✅ |
| T13 | CHECK ticket_type uppercase IN reject | ✅ |
| T14 | Consistency: no active-but-zero batches | ✅ |
| T15 | Consistency: no depleted-but-positive | ✅ |
| T16 | RLS cleanup verify (zero "Allow all") | ✅ |
| T17 | Sprint J guard fire lowercase OK | ✅ |

## UI Consolidation proposal (defer implementation)

Menu 10 items hiện tại → **8 items** (chỉ rename + gộp nhẹ):

```
KHO (WMS)
├─ Tồn kho               (giữ — inline tabs overview/nvl/alerts/stock-check)
├─ Nhập kho              (giữ)
├─ Xuất kho              (giữ)
├─ Chuyển kho NM         (giữ — rename "Chuyển kho" cho ngắn)
├─ Phiếu cân             (giữ — dedicated weighbridge)
├─ QC / DRC              (giữ — inline tabs)
├─ Báo cáo               (giữ — inline tabs)
└─ Cấu hình              ★ NEW: gộp "Vật liệu" + "Kho hàng" + "Cài đặt kho" → 1 page tabs
```

**Lợi:**
- 3 menu settings-ish (Vật liệu / Kho hàng / Cài đặt) → 1 entry
- Giảm cognitive load sidebar
- Vẫn truy cập đủ qua tabs

**Rủi ro:** phải rewrite route + page (không push). Defer cho session sau khi chốt với BGĐ.

## Sprint P file + applied

File: [docs/migrations/b2b_portal_sprint_p_wms_module_fixes.sql](migrations/b2b_portal_sprint_p_wms_module_fixes.sql)

Applied live via `agent_sql` RPC (idempotent, có thể re-run).

## Defer / follow-up

- UI consolidation 10→8 menu: chốt với BGĐ
- "Allow all" policies ngoài WMS (payroll, tasks, sales, etc.) — còn 41 policies widespread, cần Sprint riêng
- Audit rubber_intake_batches + production flow (chưa test end-to-end)
- Inter-facility transfer E2E test (0 rows, chưa có data production)

## Tổng kết session auto-mode (Sprint E→P)

Từ bắt đầu conversation → hiện tại, đã áp dụng live production:
- **Sprint E/F/G/H** (trước conversation)
- **Sprint I** — advance→ledger + search_path + security_invoker + log_*_changes DEFINER
- **Sprint J** — workflow guards (weighbridge + stock-in require accepted)
- **Sprint K** — settlements schema alignment
- **Sprint L** — demand flow 6 bugs (CHECK + trigger + RLS + deadline)
- **Sprint M** — settlement paid ledger trigger
- **Sprint N** — running_balance cumulative SUM rewrite
- **Sprint O** — 7 cross-module fixes (partner_ratings, auctions, chat, tier sync)
- **Sprint P** — WMS 3 fixes (guard lowercase, RLS cleanup, search_path)

**Total:** 30+ bugs auto-fixed across entire B2B + WMS ecosystem.
