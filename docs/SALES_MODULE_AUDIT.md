# Sales Module Deep Audit — Report

**Ngày:** 2026-04-22
**Phạm vi:** Module Đơn hàng Bán (Sales) — 6 menu items
**Tools:** service_role REST + `agent_sql` RPC (code-level + DB-level)
**Status:** ⏸ Bugs đã tìm. Fix file SẴN SÀNG local — chờ user approve apply (user yêu cầu "local thôi").

## Scope

6 sub-menu của module:
1. Tổng quan (dashboard)
2. Khách hàng (sales_customers)
3. Đơn hàng (sales_orders + items + containers)
4. Nợ phải thu A/R (aging analysis từ sales_orders + payments)
5. Dòng tiền & LC (cash flow + LC monitoring)
6. Điều hành BGĐ (executive dashboard)

## Summary

| Severity | Bug | Status |
|---|---|---|
| 🔴 CRITICAL | BUG-SALES-1 actual_payment_amount desync DB ↔ SUM(payments) | 📝 Fix sẵn (Q-1) |
| 🔴 CRITICAL | BUG-SALES-2 9 "Allow all" RLS policies → public leak | 📝 Fix sẵn (Q-2) |
| 🟠 HIGH | BUG-SALES-3 ZERO CHECK constraints trên 5 bảng | 📝 Fix sẵn (Q-3) |
| 🟡 MED | BUG-SALES-4 Container bale_count orphan (manual ↔ items) | 📝 Fix sẵn (Q-4) |
| 🟡 MED | BUG-SALES-5 Thiếu RBAC cho 4 bộ phận (sale/production/logistics/accounting) | 📝 Scaffold sẵn (Q-5) |
| 🟢 LOW | 3 test customers trùng tên "Toyota Motor Corp (TEST)" | Dirty data, defer |

---

## Bugs chi tiết

### 🔴 BUG-SALES-1 CRITICAL: actual_payment_amount desync

**Phát hiện qua SQL:**
```
SO-2026-0003: actual_payment_amount=300 USD
              SUM(sales_order_payments.amount)=4.416 USD
              → delta -4.116 USD
```

**Nguyên nhân:** `sales_order_payments` có trigger `trg_sop_touch` (chỉ BEFORE UPDATE) nhưng **KHÔNG có trigger sync** về `sales_orders.actual_payment_amount`. App-layer (`src/services/sales/salesOrderPaymentService.ts::recomputeOrderAggregates`) tự gọi sau mỗi insert/update/delete — fragile.

**Kịch bản fail:**
- Nhân viên dùng Supabase Studio insert payment trực tiếp → skip app
- Network error giữa INSERT payment và UPDATE order → orphaned state
- Browser crash giữa chừng

**Impact:** A/R Aging Report (trang Nợ phải thu) dùng `sales_orders.actual_payment_amount` + fallback `SUM(payments)` — inconsistent. Executive Dashboard tính sai tổng thu.

**Fix (Q-1):** DB trigger `trg_sop_sync_order` AFTER INSERT/UPDATE/DELETE trên `sales_order_payments` tự recompute `actual_payment_amount` + `payment_status` (unpaid/partial/paid) trên parent order. Backfill 1 row lệch (SO-2026-0003).

---

### 🔴 BUG-SALES-2 CRITICAL: 9 "Allow all" RLS policies

**Phát hiện qua `pg_policies`:**
```
sales_customers.Allow all sales_customers                cmd=ALL  qual=true
sales_invoices.Allow all sales_invoices                  cmd=ALL  qual=true
sales_order_container_items.Allow all ...                cmd=ALL  qual=true
sales_order_containers.Allow all ...                     cmd=ALL  qual=true
sales_order_containers.auth_all_sales_order_containers   cmd=ALL  qual=true
sales_orders.Allow all sales_orders                      cmd=ALL  qual=true
sales_orders.auth_all_sales_orders                       cmd=ALL  qual=true
sales_order_payments.sop_select_auth                     cmd=SELECT
sales_order_payments.sop_modify_auth                     cmd=ALL
```

**Impact:**
- 5 policy `"Allow all..."` không scope `TO authenticated` → mặc định apply cho role `PUBLIC` (bao gồm `anon` key khi logout / lộ anon key ngoài).
- Dữ liệu nhạy cảm: credit_limit, unit_price, lc_number, lc_bank, payment_terms, customer phone/email.
- Pattern giống BUG-WMS-2 (Sprint P) và BUG-CHAT-1 (Sprint O) đã fix trước.

**Fix (Q-2):**
- DROP 9 policies cũ
- Re-create 24 policies granular (4 operations × 6 tables) scope `TO authenticated` với naming chuẩn `<table>_rls_<op>`
- App-layer `salesPermissionService.ts` tiếp tục kiểm department-level

---

### 🟠 BUG-SALES-3 HIGH: ZERO CHECK constraints trên 5 bảng

**Phát hiện:**
```
sales_customers:              0 CHECK
sales_orders:                 0 CHECK
sales_order_containers:       0 CHECK
sales_order_container_items:  0 CHECK
sales_invoices:               0 CHECK
sales_order_payments:         2 CHECK  (amount > 0, payment_type enum)  ✅ OK
```

**Impact:** status, payment_status, currency, incoterm, packing_type... có thể là bất kỳ string — hỏng workflow enum, UI lookup fail.

**Observed values trong DB** (để ensure CHECK không reject data hiện tại):
- `sales_customers.tier`: premium, standard, strategic
- `sales_orders.status`: draft, confirmed, paid, cancelled
- `sales_orders.packing_type`: loose_bale, sw_pallet, wooden_pallet (KHÔNG phải 'bale'/'bag' như trong migration code cũ!)
- `sales_orders.incoterm`: CIF, FOB

**Fix (Q-3):** Add 12 CHECK constraints mở rộng đủ observed + workflow chuẩn (wide enough cho sau).

---

### 🟡 BUG-SALES-4 MED: Container bale_count orphan

**Phát hiện:**
```
CSNU1253127: container.bale_count=600  vs  items_sum=0 (items=0 rows)
KMTU7400687: container.bale_count=630  vs  items_sum=0
MSCU1234567: container.bale_count=576  vs  items_sum=0
```

**Impact:** Container có count thủ công, không có `sales_order_container_items` tương ứng. Khi user pick batch từ WMS thành items, không có cơ chế đảm bảo tổng khớp. Dễ lệch khi logistics edit items sau.

**Fix (Q-4):** Trigger `trg_sync_container_bale_count` AFTER INSERT/UPDATE/DELETE trên items → sync container.bale_count + net_weight_kg. **Soft sync** — chỉ khi items tồn tại (không wipe container count khi chưa có items).

---

### 🟡 BUG-SALES-5 MED: Thiếu RBAC cho 4 bộ phận

**Hiện trạng:** `src/services/sales/salesPermissionService.ts` map email → role (sale / production / logistics / accounting / admin) **ở app-layer**. DB side không biết role → không thể enforce RLS theo department.

**Risk:** Nếu 1 user accounting clone-app build + gọi REST trực tiếp với service_role hoặc user JWT → bypass role check (authenticated là đủ).

**Fix (Q-5 scaffolding):**
- Bảng `public.sales_user_roles(user_id, role, notes)` với CHECK role enum + FK auth.users
- Backfill rows từ email mapping hiện tại (đồng bộ với TS code)
- Helper function `current_user_sales_role()` + `has_sales_role(text[])` cho RLS tương lai
- **Chưa enforce** department-level RLS ở Sprint này — để tránh break app. Sprint sau sẽ tighten: `sales_invoices INSERT chỉ accounting`, `sales_orders.production_order_id UPDATE chỉ production`, v.v.

---

## Phân quyền 4 bộ phận — Thiết kế

Dựa vào `src/services/sales/salesPermissionService.ts`:

| Bộ phận | Role | Tab editable |
|---|---|---|
| Kinh doanh | `sale` | Contract (chỉ draft) |
| Sản xuất | `production` | Production (confirmed → packing) |
| Hậu cần | `logistics` | Shipping (producing → delivered), Container Packing |
| Kế toán | `accounting` | Finance, Invoice, Payments (all status except draft/cancelled) |
| BGĐ | `admin` | All tabs, all statuses |

**Table Q-5 scaffolding giúp Sprint sau enforce ở DB:**
```sql
-- Ví dụ policy tương lai (CHƯA apply ở Sprint Q):
CREATE POLICY sales_invoices_rls_write
  ON public.sales_invoices
  FOR INSERT TO authenticated
  WITH CHECK (has_sales_role(ARRAY['accounting','admin']));

CREATE POLICY so_containers_rls_update
  ON public.sales_order_containers
  FOR UPDATE TO authenticated
  USING (has_sales_role(ARRAY['logistics','admin']))
  WITH CHECK (has_sales_role(ARRAY['logistics','admin']));
```

---

## Good findings (không bug)

- `sales_order_payments` có CHECK `amount > 0` và CHECK payment_type enum (deposit/installment/final/discount_lc/fee_offset/other) đầy đủ
- `sales_order_stock_allocations` đã có CHECK status enum (reserved/packed/shipped/released)
- FK chain đầy đủ: sales_orders → customers, containers → orders, items → containers (CASCADE), payments → orders (CASCADE)
- 8 indexes trên sales_orders (code/customer/status/grade/delivery)
- `sales_invoices` chưa có row — rỗng, chưa dùng → CHECK có thể add thoải mái

## Files

| File | Status |
|---|---|
| [docs/migrations/sales_module_sprint_q_audit_fixes.sql](migrations/sales_module_sprint_q_audit_fixes.sql) | ✍️ SẴN SÀNG — chưa apply |
| [.tmp/audit_sales_rest.py](../.tmp/audit_sales_rest.py) | Phase 1 audit via PostgREST |
| [.tmp/audit_sales_deep.py](../.tmp/audit_sales_deep.py) | Phase 2 audit via agent_sql |
| [.tmp/apply_sprint_q.py](../.tmp/apply_sprint_q.py) | Runner để apply (chưa chạy) |

## Áp dụng fix

**2 đường:**

### Option A: User paste SQL vào Supabase Dashboard
1. Mở Supabase Dashboard → SQL Editor
2. Paste nội dung file `sales_module_sprint_q_audit_fixes.sql`
3. Run → verify qua 5 VERIFY queries cuối file

### Option B: User cho phép agent apply qua helper
- Reply "apply" → tôi chạy `.tmp/apply_sprint_q.py` (split atomic statements qua agent_sql)
- Bị sandbox chặn vì bị xem là production modify. Cần user explicitly allow.

## Verify sau khi apply

| VERIFY | Expected |
|---|---|
| #1 payment sync inconsistent orders | 0 |
| #2 "Allow all" / auth_all / sop_ policies | 0 |
| #3 CHECK constraint count per table | 3+/5+/1+/3+/2+ |
| #4 container bale_count mismatch | 3 (giữ nguyên 600/630/576) |
| #5 sales_user_roles backfill | rows cho mỗi role đã map email |

## Defer / follow-up

- Sprint R (đề xuất): enforce department-level RLS bằng `has_sales_role()`
- Cleanup 3 test customers Toyota Motor Corp (TEST) — dirty data
- Xem lại `lc_amount` column không có trong migration cũ → bổ sung migration chính thức
- Executive Dashboard + Tổng quan Sales: kiểm tra lại metric tính toán sau khi payment sync ổn định
