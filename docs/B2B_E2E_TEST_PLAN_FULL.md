# Kế hoạch test E2E luồng B2B đầy đủ

**Ngày lập:** 2026-04-22
**Phạm vi:** toàn bộ business flow Booking → Deal → Nhập kho tự động → QC → Duyệt → Tạm ứng → Quyết toán → Thanh toán
**Mục tiêu:** tìm bug trước khi BGĐ go-live trên data thật. Test sâu DB trước (tránh side-effect UI) rồi test UI + DB đồng bộ.

---

## 0. Bối cảnh

### 0.1 Luồng nghiệp vụ B2B full-chain

```
 [Partner]                           [Factory]                             [Shared DB]
 Chat → Booking   ──────────────▶   Accept + ConfirmDeal   ──────────▶    b2b.deals (processing)
                                                                          b2b.chat_messages (DealCard)
                                                                          b2b.deal_audit_log (INSERT)

                                                            Đại lý chở hàng tới nhà máy
                                    Weighbridge IN scan deal_id ──────▶   public.stock_in_orders (source_type='b2b')
                                                                          BUG-9 trigger: b2b.deals.stock_in_count++
                                                                          BUG-16 trigger: DealCard stock_in_count sync

                                    QC lấy mẫu → đo DRC
                                    TP/PP QC (Lê Thành Nhân / Trần Thị Lệ Trinh)
                                    Tab QC → "Nhập DRC thực tế" ────────▶ b2b.deals.actual_drc, actual_weight_kg, qc_status
                                                                          BUG-5 trigger: final_value compute
                                                                          BUG-16 trigger: DealCard sync

                                    BGĐ xem DRC + context
                                    Duyệt Deal (chỉ cần actual_drc>0) ──▶ b2b.deals.status = 'accepted'
                                                                          b2b.deal_audit_log (UPDATE)
                                                                          BUG-16 trigger: DealCard status sync

                                    Tab Tạm ứng (chỉ enabled khi accepted)
                                    "Ứng thêm tiền" ────────────────────▶ b2b.advances (status='paid')
                                                                          b2b.partner_ledger (credit)
                                                                          BUG-3 trigger: running_balance compute
 Notification ◀── Portal Finance > Tạm ứng                                 BUG-16 trigger: DealCard total_advanced sync
 "Đã nhận" click ──────────────────────────────────────────────▶          b2b.advances.acknowledged_at

                                    QC finalize → Tạo Quyết toán ────────▶ b2b.settlements (status='approved')
                                                                          Trigger on_settlement_approved:
                                                                          b2b.partner_ledger (debit settlement_receivable)
                                                                          (Sprint G idempotent)

                                    Mark As Paid ───────────────────────▶ b2b.settlements.paid_at/paid_by/paid_amount
                                                                          b2b.partner_ledger (credit payment_paid)
                                                                          BUG-3 trigger: running_balance = 0

 Finance > Thanh toán ◀── realtime                                         Settled + Paid
```

### 0.2 Test subject

- **Partner:** `truonghv` (code TETG02) — Hà Văn Trưởng
- **Factory user test:** employee có role `manager` hoặc `admin` (để pass tất cả role checks)
- **QC test user:** employee có position level ≤5 (phó phòng trở lên) — test với chính Lê Thành Nhân (TP QC) hoặc Trần Thị Lệ Trinh (PP QC) nếu có tài khoản
- **BGĐ test user:** user có role `admin`
- **Deal sandbox:** deal mới tạo trong test (KHÔNG đụng `DL2604-7B5P` hoặc `DL2604-UD0O` production real)

### 0.3 Baseline data

Trước khi bắt đầu bất kỳ scenario:

```sql
-- Cleanup test data tồn dư
DELETE FROM b2b.partner_ledger WHERE reference_code LIKE 'ADV-E2E-%' OR reference_code LIKE 'QT-E2E-%' OR reference_code LIKE 'PAY-E2E-%';
DELETE FROM b2b.advances WHERE advance_number LIKE 'ADV-E2E-%';
DELETE FROM b2b.settlements WHERE code LIKE 'QT-E2E-%';
DELETE FROM b2b.drc_disputes WHERE reason LIKE 'E2E-%';
DELETE FROM public.stock_in_orders WHERE code LIKE 'NK-E2E-%';
DELETE FROM b2b.chat_messages WHERE message_type IN ('booking','deal') AND metadata::text LIKE '%E2E-%';
DELETE FROM b2b.deals WHERE deal_number LIKE 'DL-E2E-%';
```

### 0.4 Sprint migrations đã apply (production)

| Sprint | Migration | Trigger/Function |
|---|---|---|
| E | `b2b_portal_sprint_e_triggers.sql` | BUG-1, 3, 4, 5, 9, 16 |
| F | `b2b_portal_sprint_f_dealcard_backfill.sql` | Backfill DealCard metadata stale |
| G | `b2b_portal_sprint_g_fix_settlement_trigger.sql` | on_settlement_approved idempotent EXCEPTION handler |
| H | `b2b_portal_sprint_h_fix_deal_audit_rls.sql` | log_deal_changes SECURITY DEFINER |

### 0.5 Environment

- **Production URL:** https://huyanhrubber.vn (ERP) + https://b2b.huyanhrubber.vn (Portal)
- **Supabase project:** dygveetaatqllhjusyzz
- **SQL Editor:** Supabase dashboard
- **Test data cần giữ:** 3 deal DL2604-7B5P / 4UEU / 4HYZ + settlement TEST-QT-E2E-001 + 3 ledger entries
- **Test data tạo mới trong kế hoạch này:** prefix `E2E-F/E2E-DL/E2E-NK` etc. để cleanup dễ

---

## PHASE A — Database-only tests (SQL thuần)

**Mục đích:** Verify schema, triggers, constraints, RLS không cần UI. Chạy trong Supabase SQL Editor. Tôi soạn queries, bạn run + screenshot.

### A1. Schema integrity check

**Mục tiêu:** Tất cả column tồn tại và đúng data type.

```sql
-- A1.1 b2b.deals full schema
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'b2b' AND table_name = 'deals'
ORDER BY ordinal_position;

-- A1.2 b2b.advances full schema
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'b2b' AND table_name = 'advances'
ORDER BY ordinal_position;

-- A1.3 b2b.settlements full schema + paid_at/paid_by/paid_amount (Sprint E BUG-4)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'b2b' AND table_name = 'settlements'
ORDER BY ordinal_position;

-- A1.4 b2b.drc_disputes schema + GENERATED drc_variance
SELECT column_name, data_type, is_generated, generation_expression
FROM information_schema.columns
WHERE table_schema = 'b2b' AND table_name = 'drc_disputes'
ORDER BY ordinal_position;

-- A1.5 b2b.partner_ledger schema
SELECT column_name, data_type, is_generated, generation_expression
FROM information_schema.columns
WHERE table_schema = 'b2b' AND table_name = 'partner_ledger'
ORDER BY ordinal_position;

-- A1.6 b2b.chat_messages schema (đặc biệt column edited_at / metadata)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'b2b' AND table_name = 'chat_messages'
ORDER BY ordinal_position;

-- A1.7 public.stock_in_orders.source_type CHECK extends 'b2b' (Sprint E BUG-1)
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.stock_in_orders'::regclass
  AND conname LIKE '%source_type%';

-- A1.8 b2b.deal_audit_log schema
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'b2b' AND table_name = 'deal_audit_log'
ORDER BY ordinal_position;
```

**Pass criteria:**
- b2b.deals có actual_drc, actual_weight_kg, qc_status, final_value, stock_in_count, target_facility_id, booking_id
- b2b.advances có acknowledged_at (nếu không → flag, phải thêm)
- b2b.settlements có paid_at, paid_by, paid_amount (Sprint E BUG-4 applied)
- b2b.drc_disputes có drc_variance GENERATED + dispute_number NOT NULL
- b2b.partner_ledger có running_balance, entry_date, period_month GENERATED
- stock_in_orders source_type CHECK list gồm 'b2b'

### A2. Trigger installation + function properties

```sql
-- A2.1 Tất cả trigger trên b2b.deals
SELECT tgname, pg_get_triggerdef(oid) AS def, tgenabled
FROM pg_trigger
WHERE tgrelid = 'b2b.deals'::regclass AND NOT tgisinternal
ORDER BY tgname;
-- Expected: trg_compute_deal_final_value (BEFORE UPDATE BUG-5),
--           trg_sync_deal_card_metadata (AFTER UPDATE BUG-16),
--           trg_deal_audit (AFTER INSERT/UPDATE/DELETE),
--           trg_enforce_deal_lock (BEFORE UPDATE),
--           và các trigger Sprint A-D khác.

-- A2.2 Trigger trên b2b.advances
SELECT tgname, pg_get_triggerdef(oid) AS def
FROM pg_trigger
WHERE tgrelid = 'b2b.advances'::regclass AND NOT tgisinternal;
-- Kỳ vọng: ít nhất có trigger cập nhật updated_at.
-- (Trigger sinh ledger khi advance=paid: nếu chưa có → cần Sprint I, test case A5.4)

-- A2.3 Trigger trên b2b.settlements
SELECT tgname, pg_get_triggerdef(oid) AS def
FROM pg_trigger
WHERE tgrelid = 'b2b.settlements'::regclass AND NOT tgisinternal;
-- Expected: trg_on_settlement_approved (Sprint G đã idempotent)

-- A2.4 Trigger trên b2b.partner_ledger
SELECT tgname, pg_get_triggerdef(oid) AS def
FROM pg_trigger
WHERE tgrelid = 'b2b.partner_ledger'::regclass AND NOT tgisinternal;
-- Expected: trg_compute_ledger_running_balance (BEFORE INSERT BUG-3)

-- A2.5 Trigger trên public.stock_in_orders
SELECT tgname, pg_get_triggerdef(oid) AS def
FROM pg_trigger
WHERE tgrelid = 'public.stock_in_orders'::regclass AND NOT tgisinternal;
-- Expected: trg_sync_deal_stock_in_count (AFTER INSERT/UPDATE/DELETE BUG-9)

-- A2.6 Functions SECURITY DEFINER (Sprint H)
SELECT proname, prosecdef, proconfig
FROM pg_proc
WHERE pronamespace = 'b2b'::regnamespace
  AND prosecdef = true
ORDER BY proname;
-- Expected: log_deal_changes có prosecdef=true, proconfig chứa search_path

-- A2.7 Functions liên quan b2b (không DEFINER)
SELECT proname, prosecdef
FROM pg_proc
WHERE pronamespace = 'b2b'::regnamespace
ORDER BY proname;
```

### A3. Business rules (CHECK constraints + guard functions)

```sql
-- A3.1 All CHECK constraints b2b.* tables
SELECT n.nspname AS schema, t.relname AS table_name, c.conname, pg_get_constraintdef(c.oid)
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
JOIN pg_namespace n ON t.relnamespace = n.oid
WHERE n.nspname = 'b2b' AND c.contype = 'c'
ORDER BY t.relname, c.conname;

-- A3.2 enforce_deal_lock trigger source
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'enforce_deal_lock'
  AND pronamespace = 'b2b'::regnamespace;
-- Xem nó reject actions gì khi deal='settled'

-- A3.3 chk_deals_drc_requires_stockin
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'chk_deals_drc_requires_stockin';
-- Hiểu chính xác điều kiện actual_drc khi stock_in_count=0
-- Có thể cần nới rule vì QC có thể đo mẫu trước khi nhập kho toàn bộ.

-- A3.4 chk_dispute_status
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'chk_dispute_status';
-- Expected: valid states ['open','investigating','resolved_accepted','resolved_rejected','withdrawn']
```

### A4. RLS policies

```sql
-- A4.1 RLS trạng thái (enabled/disabled) cho tất cả bảng b2b.*
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'b2b'
ORDER BY tablename;
-- Expected: rowsecurity=true cho tất cả (Sprint C RLS fix)

-- A4.2 Tất cả policy b2b.*
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'b2b'
ORDER BY tablename, policyname;

-- A4.3 b2b.deal_audit_log RLS policies (expected: ZERO — chỉ SECURITY DEFINER trigger viết)
SELECT * FROM pg_policies WHERE schemaname = 'b2b' AND tablename = 'deal_audit_log';

-- A4.4 Views security_invoker (Sprint C)
SELECT schemaname, viewname,
       CASE WHEN 'security_invoker=true' = ANY(regexp_split_to_array(ARRAY_TO_STRING(reloptions, ','), ','))
            THEN 'INVOKER' ELSE 'DEFINER' END AS security_mode
FROM pg_views v
JOIN pg_class c ON c.relname = v.viewname
WHERE v.schemaname = 'public' AND v.viewname LIKE 'b2b_%';
-- Expected: tất cả = INVOKER
```

### A5. Trigger chain simulation (full lifecycle bằng SQL)

**Tạo deal sandbox + chạy qua toàn bộ lifecycle, verify trigger fires đúng order.**

```sql
-- ═══════════════════════════════════════════════════════════════
-- A5.0 TẠO DEAL SANDBOX
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_partner_id UUID;
  v_deal_id UUID;
  v_deal_number TEXT := 'DL-E2E-' || to_char(now(), 'HH24MISS');
  v_booking_msg_id UUID;
BEGIN
  SELECT id INTO v_partner_id FROM b2b.partners WHERE code = 'TETG02';

  -- A5.0.a Tạo booking message giả
  INSERT INTO b2b.chat_messages (
    room_id, sender_type, sender_id, content, message_type, metadata, sent_at
  )
  SELECT r.id, 'partner', v_partner_id,
         '📦 Booking test E2E',
         'booking',
         jsonb_build_object(
           'code', 'BK-E2E-' || to_char(now(), 'HH24MISS'),
           'product_type', 'mu_tap',
           'quantity_tons', 300,
           'drc_percent', 45,
           'price_per_kg', 18000,
           'price_unit', 'wet',
           'target_facility_id', '755ae776-3be6-47b8-b1d0-d15b61789f24',
           'target_facility_code', 'PD',
           'estimated_value', 5400000000,
           'status', 'confirmed'
         ),
         now()
  FROM b2b.chat_rooms r WHERE r.partner_id = v_partner_id
  ORDER BY r.created_at DESC LIMIT 1
  RETURNING id INTO v_booking_msg_id;

  -- A5.0.b Tạo deal
  INSERT INTO b2b.deals (
    deal_number, partner_id, booking_id,
    product_code, product_name,
    quantity_kg, unit_price, price_unit, expected_drc,
    total_value_vnd, target_facility_id,
    rubber_region, status
  ) VALUES (
    v_deal_number, v_partner_id, v_booking_msg_id,
    'mu_tap', 'Mủ tạp',
    300000, 18000, 'wet', 45,
    5400000000, '755ae776-3be6-47b8-b1d0-d15b61789f24',
    'Tây Ninh', 'processing'
  ) RETURNING id INTO v_deal_id;

  RAISE NOTICE 'Deal created: % (id=%)', v_deal_number, v_deal_id;
END $$;

-- Note deal_number vừa tạo để các step sau reference
SELECT deal_number, id FROM b2b.deals
WHERE deal_number LIKE 'DL-E2E-%'
ORDER BY created_at DESC LIMIT 1;
```

```sql
-- ═══════════════════════════════════════════════════════════════
-- A5.1 DealCard message + BUG-16 initial
-- ═══════════════════════════════════════════════════════════════
-- Insert DealCard message tương ứng với deal vừa tạo, xem metadata có sync sau UPDATE.

-- A5.1.a INSERT DealCard message (factory reply)
INSERT INTO b2b.chat_messages (room_id, sender_type, content, message_type, metadata, sent_at)
SELECT r.id, 'factory',
       '✅ Deal tạo thành công',
       'deal',
       jsonb_build_object(
         'deal', jsonb_build_object(
           'deal_id', d.id::text,
           'deal_number', d.deal_number,
           'status', d.status,
           'product_type', d.product_code,
           'quantity_kg', d.quantity_kg,
           'expected_drc', d.expected_drc,
           'agreed_price', d.unit_price,
           'estimated_value', d.total_value_vnd,
           'stock_in_count', 0
         )
       ),
       now()
FROM b2b.deals d
JOIN b2b.chat_rooms r ON r.partner_id = d.partner_id
WHERE d.deal_number LIKE 'DL-E2E-%'
ORDER BY d.created_at DESC, r.created_at DESC
LIMIT 1;

-- A5.1.b Verify DealCard metadata baseline
SELECT metadata->'deal'->>'deal_number' AS deal_number,
       metadata->'deal'->>'status' AS status,
       metadata->'deal'->>'stock_in_count' AS stock_count,
       metadata->'deal'->>'actual_drc' AS actual_drc
FROM b2b.chat_messages
WHERE message_type = 'deal'
  AND metadata->'deal'->>'deal_id' = (
    SELECT id::text FROM b2b.deals
    WHERE deal_number LIKE 'DL-E2E-%'
    ORDER BY created_at DESC LIMIT 1
  );
-- Expected: status=processing, stock_count=0, actual_drc=NULL
```

```sql
-- ═══════════════════════════════════════════════════════════════
-- A5.2 Stock-in tự động + BUG-9 trigger + BUG-16 cascade
-- ═══════════════════════════════════════════════════════════════

INSERT INTO public.stock_in_orders (
  code, deal_id, warehouse_id, source_type,
  total_weight, total_quantity, status, notes,
  created_by, created_at
)
SELECT
  'NK-E2E-A52-' || to_char(now(), 'HH24MISS'),
  (SELECT id FROM b2b.deals WHERE deal_number LIKE 'DL-E2E-%' ORDER BY created_at DESC LIMIT 1),
  (SELECT id FROM public.warehouses WHERE code = 'KHO-NVL' LIMIT 1),
  'b2b',  -- BUG-1 CHECK extend
  300000,
  8,
  'confirmed',
  'A5.2: auto stock-in từ cân weighbridge',
  (SELECT id FROM public.employees LIMIT 1),
  now();

-- Verify cả BUG-9 (deal.stock_in_count) và BUG-16 (DealCard metadata sync)
SELECT d.deal_number,
       d.stock_in_count AS deal_stock_count,
       (SELECT COUNT(*) FROM public.stock_in_orders WHERE deal_id = d.id) AS actual_count,
       m.metadata->'deal'->>'stock_in_count' AS meta_stock_count,
       d.stock_in_count = (SELECT COUNT(*) FROM public.stock_in_orders WHERE deal_id = d.id)
         AND (m.metadata->'deal'->>'stock_in_count')::int = d.stock_in_count AS all_synced
FROM b2b.deals d
LEFT JOIN b2b.chat_messages m ON m.metadata->'deal'->>'deal_id' = d.id::text AND m.message_type = 'deal'
WHERE d.deal_number LIKE 'DL-E2E-%'
ORDER BY d.created_at DESC LIMIT 1;
-- Expected: deal_stock_count=1, actual_count=1, meta_stock_count="1", all_synced=true
```

```sql
-- ═══════════════════════════════════════════════════════════════
-- A5.3 QC nhập DRC + BUG-5 final_value + BUG-16 cascade
-- ═══════════════════════════════════════════════════════════════

UPDATE b2b.deals
SET actual_drc = 46,
    actual_weight_kg = 300000,
    qc_status = 'passed'
WHERE deal_number LIKE 'DL-E2E-%'
  AND created_at > now() - INTERVAL '1 hour';

-- Verify BUG-5 (final_value) + BUG-16 (DealCard metadata sync)
SELECT d.deal_number,
       d.actual_drc, d.actual_weight_kg, d.qc_status,
       d.final_value,
       d.actual_weight_kg * d.unit_price AS expected_final,  -- wet formula
       m.metadata->'deal'->>'actual_drc' AS meta_drc,
       m.metadata->'deal'->>'final_value' AS meta_final,
       m.metadata->'deal'->>'qc_status' AS meta_qc
FROM b2b.deals d
LEFT JOIN b2b.chat_messages m ON m.metadata->'deal'->>'deal_id' = d.id::text AND m.message_type = 'deal'
WHERE d.deal_number LIKE 'DL-E2E-%'
ORDER BY d.created_at DESC LIMIT 1;
-- Expected: final_value = 300000 * 18000 = 5,400,000,000
--           meta_drc="46", meta_final="5400000000", meta_qc="passed"
```

```sql
-- ═══════════════════════════════════════════════════════════════
-- A5.4 Duyệt Deal (processing → accepted) + BUG-16 cascade + audit log
-- ═══════════════════════════════════════════════════════════════

UPDATE b2b.deals
SET status = 'accepted'
WHERE deal_number LIKE 'DL-E2E-%'
  AND created_at > now() - INTERVAL '1 hour';

-- Verify DealCard metadata sync
SELECT d.deal_number, d.status,
       m.metadata->'deal'->>'status' AS meta_status,
       d.status::text = m.metadata->'deal'->>'status' AS sync_ok
FROM b2b.deals d
JOIN b2b.chat_messages m ON m.metadata->'deal'->>'deal_id' = d.id::text AND m.message_type = 'deal'
WHERE d.deal_number LIKE 'DL-E2E-%'
ORDER BY d.created_at DESC LIMIT 1;

-- Verify audit log (Sprint H SECURITY DEFINER bypass RLS)
SELECT deal_id, op, changed_at, new_data->>'status' AS new_status, old_data->>'status' AS old_status
FROM b2b.deal_audit_log
WHERE deal_id = (SELECT id FROM b2b.deals WHERE deal_number LIKE 'DL-E2E-%' ORDER BY created_at DESC LIMIT 1)
ORDER BY changed_at DESC;
-- Expected: ≥2 rows (INSERT initial + UPDATE status change)
```

```sql
-- ═══════════════════════════════════════════════════════════════
-- A5.5 Advance + ledger + BUG-3 running_balance
-- ═══════════════════════════════════════════════════════════════

INSERT INTO b2b.advances (
  deal_id, partner_id, amount, amount_vnd, currency,
  payment_method, purpose, status, payment_date,
  advance_number, paid_by, paid_at, approved_by, approved_at
)
SELECT
  d.id, d.partner_id, 1000000000, 1000000000, 'VND',
  'cash', 'A5.5 test advance', 'paid', now()::date,
  'ADV-E2E-A55-' || to_char(now(), 'HH24MISS'),
  (SELECT id FROM public.employees LIMIT 1), now(),
  (SELECT id FROM public.employees LIMIT 1), now()
FROM b2b.deals d
WHERE d.deal_number LIKE 'DL-E2E-%'
ORDER BY d.created_at DESC LIMIT 1
RETURNING id, advance_number;

-- Verify ledger entry + running_balance
-- (Nếu KHÔNG có trigger advance→ledger: 0 row mới → Sprint I-1 cần)
SELECT entry_type, debit, credit, running_balance, reference_code, entry_date
FROM b2b.partner_ledger
WHERE partner_id = (SELECT id FROM b2b.partners WHERE code = 'TETG02')
ORDER BY entry_date DESC, created_at DESC
LIMIT 5;

-- Manual insert nếu thiếu trigger (coi như service làm giúp)
INSERT INTO b2b.partner_ledger (
  partner_id, entry_type, debit, credit,
  advance_id, reference_code, description,
  entry_date, created_by
)
SELECT
  d.partner_id, 'advance_paid', 0, 1000000000,
  (SELECT id FROM b2b.advances WHERE advance_number LIKE 'ADV-E2E-A55-%'),
  (SELECT advance_number FROM b2b.advances WHERE advance_number LIKE 'ADV-E2E-A55-%'),
  'Ứng thêm A5.5',
  now()::date,
  (SELECT id FROM public.employees LIMIT 1)
FROM b2b.deals d
WHERE d.deal_number LIKE 'DL-E2E-%'
ORDER BY d.created_at DESC LIMIT 1;

-- Re-verify running_balance (BUG-3 auto-compute khi INSERT ledger)
SELECT entry_type, debit, credit, running_balance, reference_code
FROM b2b.partner_ledger
WHERE partner_id = (SELECT id FROM b2b.partners WHERE code = 'TETG02')
ORDER BY entry_date DESC, created_at DESC
LIMIT 5;
-- Expected row mới nhất: advance_paid, credit 1B, running_balance = prev - 1B
```

```sql
-- ═══════════════════════════════════════════════════════════════
-- A5.6 Settlement + Sprint G idempotent + BUG-4 paid columns
-- ═══════════════════════════════════════════════════════════════

-- A5.6.a Tạo settlement approved
INSERT INTO b2b.settlements (
  code, deal_id, partner_id, status,
  weighed_kg, drc_percent, approved_price, finished_kg,
  gross_amount, total_advance, remaining_amount,
  approved_by, approved_at, product_type
)
SELECT
  'QT-E2E-A56-' || to_char(now(), 'HH24MISS'),
  d.id, d.partner_id, 'approved',
  300000, 46, 18000, 300000,
  5400000000, 1000000000, 4400000000,
  (SELECT id FROM public.employees LIMIT 1), now(),
  'mu_tap'
FROM b2b.deals d
WHERE d.deal_number LIKE 'DL-E2E-%'
ORDER BY d.created_at DESC LIMIT 1
RETURNING code, status, gross_amount;

-- Verify trigger on_settlement_approved fire → ledger settlement_receivable
SELECT entry_type, debit, credit, running_balance, reference_code
FROM b2b.partner_ledger
WHERE reference_code LIKE 'QT-E2E-A56-%'
  OR reference_code = (SELECT code FROM b2b.settlements WHERE code LIKE 'QT-E2E-A56-%' LIMIT 1);

-- A5.6.b Mark paid
UPDATE b2b.settlements
SET status = 'paid',
    paid_at = now(),
    paid_by = (SELECT id FROM public.employees LIMIT 1),
    paid_amount = remaining_amount
WHERE code LIKE 'QT-E2E-A56-%'
RETURNING code, status, paid_at, paid_by, paid_amount;

-- A5.6.c Test Sprint G idempotent: rollback paid → approved
UPDATE b2b.settlements
SET status = 'approved', paid_at = NULL, paid_by = NULL, paid_amount = 0
WHERE code LIKE 'QT-E2E-A56-%';
-- Expected: không error 23505 duplicate (Sprint G EXCEPTION handler work)
```

### A6. Cleanup test data sandbox

```sql
-- Sau khi xong Phase A: restore DB về baseline
DELETE FROM b2b.partner_ledger
  WHERE reference_code LIKE 'ADV-E2E-A55-%' OR reference_code LIKE 'QT-E2E-A56-%';

DELETE FROM b2b.settlements WHERE code LIKE 'QT-E2E-A56-%';
DELETE FROM b2b.advances WHERE advance_number LIKE 'ADV-E2E-A55-%';
DELETE FROM public.stock_in_orders WHERE code LIKE 'NK-E2E-A52-%';
DELETE FROM b2b.chat_messages WHERE message_type = 'deal'
  AND metadata->'deal'->>'deal_id' = (SELECT id::text FROM b2b.deals WHERE deal_number LIKE 'DL-E2E-%' ORDER BY created_at DESC LIMIT 1);
DELETE FROM b2b.deal_audit_log WHERE deal_id IN (SELECT id FROM b2b.deals WHERE deal_number LIKE 'DL-E2E-%');
DELETE FROM b2b.chat_messages WHERE message_type = 'booking' AND metadata->'booking'->>'code' LIKE 'BK-E2E-%';
DELETE FROM b2b.deals WHERE deal_number LIKE 'DL-E2E-%';
```

---

## PHASE B — UI + DB integrated tests

**Mỗi flow: UI action (bạn thao tác) + SQL verify (tôi cung cấp, bạn run + screenshot).**

### B1. Flow: Portal tạo booking → Factory accept → Deal created

| Actor | Action | UI location | Verify SQL |
|---|---|---|---|
| Partner | Tạo booking từ chat | Portal → Chat → nút "Tạo phiếu chốt mủ" | `b2b.chat_messages` message_type='booking' mới |
| Factory | Click "Chấp nhận" trên BookingCard | ERP → B2B Chat → room → BookingCard | ConfirmDealModal mở |
| Factory | Submit form ConfirmDealModal | Modal (5 field lock theo NEW-BUG-F) | `b2b.deals` INSERT + DealCard message sinh |

**Key verify:**
- Modal lock 5 field (product_type, quantity, DRC, price, facility)
- Deal booking_id link đến message UUID
- DealCard metadata sync với deal DB
- Audit log INSERT row (Sprint H SECURITY DEFINER)

### B2. Flow: Weighbridge IN → Auto stock-in (nhập kho tự động)

| Actor | Action | UI location | Verify SQL |
|---|---|---|---|
| Bảo vệ | Scan QR deal / gõ deal number ở trạm cân IN | Weighbridge app | `public.weighbridge_tickets` INSERT |
| System | Khi ticket confirmed → auto create stock_in_order | Weighbridge auto-sync IN flag C1 | `public.stock_in_orders` INSERT source_type='b2b' |
| Trigger | BUG-9 fire | — | `b2b.deals.stock_in_count` ++ |
| Trigger | BUG-16 fire | — | DealCard metadata stock_in_count sync |
| Factory | View Deal → Tab Nhập kho | ERP → B2B Deals → deal → Nhập kho | Table có row mới |

**Edge case:**
- Weighbridge ticket deal_number không khớp → stock-in không sinh (flag error)
- Deal settled → block stock-in mới
- Multiple stock-in → count cumulative

### B3. Flow: QC nhập DRC (TP/PP QC)

| Actor | Action | UI location | Verify SQL |
|---|---|---|---|
| Non-QC user | Mở Tab QC | ERP → Deal → QC tab | Button "Nhập DRC thực tế" **disabled** + tooltip |
| TP QC (Lê Thành Nhân) | Login → Tab QC | — | Button enabled |
| TP QC | Fill modal: DRC=46%, weight=300000, status=passed | Modal | `b2b.deals.actual_drc` updated |
| Trigger | BUG-5 fire | — | `b2b.deals.final_value` recompute |
| Trigger | BUG-16 fire | — | DealCard metadata sync actual_drc + final_value + qc_status |

**Edge cases:**
- DRC < 1 hoặc > 100 → form validate reject
- qc_status='failed' → deal vẫn duyệt được (rule mới)
- Deal settled → enforce_deal_lock block

### B4. Flow: BGĐ Duyệt Deal

| Actor | Action | UI location | Verify SQL |
|---|---|---|---|
| Employee (không phải manager/admin) | Click Duyệt Deal | ERP → Deal detail | Button disabled + tooltip "Chỉ Quản lý/Admin" |
| Deal chưa có actual_drc | Hover Duyệt Deal | — | Tooltip "QC chưa đo DRC thực tế" |
| Admin | Click Duyệt Deal (đủ điều kiện) | ERP → Deal detail header | `b2b.deals.status` = 'accepted' |
| Trigger | BUG-16 fire | — | DealCard status='accepted' |
| Trigger | log_deal_changes SECURITY DEFINER | — | `b2b.deal_audit_log` UPDATE row |

### B5. Flow: Tạm ứng (chỉ khi deal accepted)

| Actor | Action | UI location | Verify SQL |
|---|---|---|---|
| Factory | Mở Deal processing → Tab Tạm ứng | ERP → Deal → Tạm ứng | Button "Ứng thêm tiền" **disabled** + tooltip "deal chưa Duyệt" |
| Factory | Duyệt deal → mở Tab Tạm ứng | — | Button enabled |
| Factory | Fill AddAdvanceModal → submit | Modal | `b2b.advances` INSERT status=paid |
| Service | dealChatActionsService step 3 | — | `b2b.partner_ledger` INSERT advance_paid |
| Trigger | BUG-3 fire | — | running_balance compute |
| Service | step 5 patch metadata | — | DealCard metadata.total_advanced update |
| Service | step 6 gửi system message | — | `b2b.chat_messages` system message |
| Partner | Portal → Finance → Tạm ứng | Portal | Card advance hiện, button "Đã nhận" |
| Partner | Click "Đã nhận" | — | `b2b.advances.acknowledged_at` set |

**Edge cases:**
- Advance amount > remaining balance → warning (service check)
- Deal không có chat room → service graceful error
- 2 advances cùng lúc → không race condition (ledger idempotency)

### B6. Flow: Settlement + Payment

| Actor | Action | UI location | Verify SQL |
|---|---|---|---|
| Factory | Tạo settlement từ deal accepted | ERP → Deal → Quyết toán | `b2b.settlements` INSERT status='draft' |
| Factory | Approve settlement | — | status='approved' |
| Trigger | on_settlement_approved (Sprint G idempotent) | — | `b2b.partner_ledger` INSERT settlement_receivable |
| Factory | Mark as paid | — | `b2b.settlements.paid_at/paid_by/paid_amount` populated |
| Factory | Ghi ledger thanh toán | — | `b2b.partner_ledger` INSERT payment_paid |
| Trigger | BUG-3 fire | — | running_balance = 0 |
| Partner | Portal → Finance → Thanh toán | — | Card paid visible |

**Edge case:** rollback paid → approved KHÔNG sinh duplicate ledger (Sprint G EXCEPTION).

### B7. Flow: DRC Dispute bi-directional

| Actor | Action | UI location | Verify SQL |
|---|---|---|---|
| Partner | Portal → Finance → Khiếu nại DRC → Tạo mới | Portal | `b2b.drc_disputes` INSERT status='open' |
| Factory | ERP → B2B Disputes → Xử lý | ERP | UPDATE status='investigating' → 'resolved_accepted'/'resolved_rejected' |
| Partner | Portal refresh | — | Hiện resolution_notes |

**Edge case:** Deal variance ≤ 2% → Portal UI filter không hiện deal này trong dropdown (BUG-13/14 fix).

### B8. Cross-portal realtime sync

| Trigger | Expected on both ERP and Portal |
|---|---|
| Factory tạo deal | Portal chat realtime thấy DealCard mới |
| QC cập nhật DRC | Portal chat DealCard show DRC mới (BUG-16 trigger + realtime channel) |
| Factory duyệt deal | Portal status pill đổi thành "Đã duyệt" |
| Factory tạo advance | Portal Finance Tạm ứng tab hiện advance mới + notification bell |
| Partner ack advance | ERP Deal Tạm ứng tab hiện acknowledged_at |
| Settlement paid | Portal Finance Thanh toán tab hiện card mới |

---

## PHASE C — Edge cases + regression

### C1. Duyệt Deal edge cases
- `status != 'processing'` → guard chặn
- `actual_drc IS NULL` → guard chặn
- `role = 'employee'` → UI disabled
- Deal đang có unresolved dispute → should block? (TBD với BGĐ)

### C2. Tạm ứng edge cases
- `deal.status != 'accepted'` → service throw
- `deal.status = 'settled'` → service throw "đã settle"
- Partner không có chat room → UI graceful error
- Amount > remaining → warning hoặc block
- 2 user tạo advance đồng thời cho cùng deal → race condition

### C3. QC edge cases
- Non-manager/admin role → UI disabled
- DRC ngoài 1-100 → form reject
- Weight = 0 → form reject
- QC notes > 1000 ký tự → form reject
- Deal settled → trigger enforce_deal_lock block UPDATE

### C4. Stock-in edge cases
- source_type không trong list → CHECK reject
- Deal settled → nên block stock-in mới (cần trigger riêng)
- DELETE stock-in → BUG-9 trigger decrement count đúng

### C5. Partner dispute edge cases
- Deal chưa có actual_drc → không thể dispute (filter UI)
- Variance ≤ threshold → filter UI
- Dispute đang open → không cho raise duplicate

### C6. Settlement edge cases
- Gross amount < total advance → balance_due âm (rollback?)
- Mark paid 2 lần → idempotency check
- Partial paid_amount → ledger entry chỉ 1 lần hay multiple?

### C7. Concurrent writes
- 2 factory users tạo advance đồng thời
- QC nhập DRC + BGĐ duyệt cùng lúc
- Settlement approve + stock-in new cùng lúc

### C8. Realtime + offline
- Portal mất mạng → retry logic
- Chat message lost → reconnect + replay

---

## PHASE D — Cleanup + baseline restore

Sau mỗi phase, chạy block cleanup prefix `E2E-*` để xoá test data. KHÔNG đụng dữ liệu production DL2604-7B5P / 4UEU / 4HYZ / TEST-QT-E2E-001.

```sql
-- Master cleanup
DELETE FROM b2b.partner_ledger WHERE reference_code LIKE '%E2E-%';
DELETE FROM b2b.advances WHERE advance_number LIKE 'ADV-E2E-%';
DELETE FROM b2b.settlements WHERE code LIKE 'QT-E2E-%';
DELETE FROM b2b.drc_disputes WHERE reason LIKE 'E2E-%';
DELETE FROM public.stock_in_orders WHERE code LIKE 'NK-E2E-%';
DELETE FROM b2b.chat_messages
  WHERE (message_type = 'booking' AND metadata->'booking'->>'code' LIKE 'BK-E2E-%')
     OR (message_type = 'deal' AND metadata->'deal'->>'deal_number' LIKE 'DL-E2E-%');
DELETE FROM b2b.deal_audit_log
  WHERE deal_id IN (SELECT id FROM b2b.deals WHERE deal_number LIKE 'DL-E2E-%');
DELETE FROM b2b.deals WHERE deal_number LIKE 'DL-E2E-%';
```

---

## Execution roadmap

### Ngày 1 — Phase A (DB deep audit) — 2h
- A1 Schema integrity (20 phút)
- A2 Triggers + SECURITY DEFINER (20 phút)
- A3 CHECK + guard rules (20 phút)
- A4 RLS policies (20 phút)
- A5 Lifecycle simulation SQL (45 phút)
- A6 Cleanup (5 phút)

### Ngày 2 — Phase B (UI + DB) — 3-4h
- B1 Booking→Deal (30 phút)
- B2 Auto stock-in weighbridge (30 phút, cần xe cân thật)
- B3 QC nhập DRC (20 phút)
- B4 Duyệt Deal (15 phút)
- B5 Tạm ứng (30 phút)
- B6 Settlement + Paid (30 phút)
- B7 Dispute (20 phút)
- B8 Realtime sync (30 phút, cần 2 browser tab)

### Ngày 3 — Phase C + D (edge + cleanup) — 2h
- C1–C8 edge cases (1h)
- D master cleanup + baseline verify (30 phút)
- Tổng hợp bug report (30 phút)

**Total:** ~7-9h test work split 3 ngày.

---

## Bug reporting template

```markdown
### BUG-{id}: {tên ngắn}
- **Phase:** A/B/C
- **Scenario:** A5.3 / B3 / C2 ...
- **Severity:** CRITICAL / HIGH / MED / LOW
- **Reproduce steps:**
  1. ...
  2. ...
- **Expected:** ...
- **Actual:** ...
- **Screenshot:** [link]
- **DB state:** [SQL query + result]
- **Root cause hypothesis:** ...
- **Fix proposal:** Sprint I-{n} migration OR code change ...
```

---

## Exit criteria

Sprint sẵn sàng go-live khi:

- **Phase A:** 100% test pass. Mọi trigger fire đúng chain, RLS blocked direct access audit_log, CHECK constraints reject invalid transitions.
- **Phase B:** 80% test pass. Bug CRITICAL = 0, HIGH ≤ 2 (có fix trong 24h).
- **Phase C:** edge cases không có data corruption. Graceful error messages.
- **Phase D:** cleanup không còn row `E2E-*` trong production DB. Baseline data DL2604-7B5P intact.

---

## Out of scope (kỳ này KHÔNG test)

- Performance / load test (đẩy sang sprint riêng)
- Security penetration (SQL injection, XSS)
- Mobile app (Capacitor push, offline mode) — chỉ verify Portal web
- Migration backward compat từ schema cũ
- ERP modules khác (attendance, payroll, tasks)

---

## Phụ lục: mapping sprint → bug fix

| Bug | Sprint | File | Status |
|---|---|---|---|
| BUG-1 stock_in_orders.source_type thêm 'b2b' | E | sprint_e_triggers.sql | ✅ live |
| BUG-3 partner_ledger.running_balance trigger | E | sprint_e_triggers.sql | ✅ live |
| BUG-4 settlements paid_at/paid_by/paid_amount | E | sprint_e_triggers.sql | ✅ live |
| BUG-5 deals.final_value compute trigger | E | sprint_e_triggers.sql | ✅ live |
| BUG-7 HomePage unread_count_partner | E FE | HomePage.tsx | ✅ live |
| BUG-8 facility UUID → name | E FE | OrderDetailPage.tsx | ✅ live |
| BUG-9 deals.stock_in_count sync trigger | E | sprint_e_triggers.sql | ✅ live |
| BUG-11 formatVND full precision | F FE | HomePage/FinancePage.tsx | ✅ live |
| BUG-13/14 dispute dropdown filter | E FE | FinancePage.tsx | ✅ live |
| BUG-15 Ant App wrapper | E FE | App.tsx | ✅ live |
| BUG-16 DealCard metadata sync trigger | E + F backfill | sprint_e/f.sql | ✅ live |
| NEW-BUG-A HomePage formatCurrency full | F FE | HomePage.tsx | ✅ live |
| NEW-BUG-B Finance Công nợ dùng DB running_balance | F FE | FinancePage.tsx | ✅ live |
| NEW-BUG-C KPI Giá trị tháng tách đã chốt / dự kiến | F FE | HomePage.tsx | ✅ live |
| NEW-BUG-D on_settlement_approved idempotent | G SQL | sprint_g.sql | ✅ live |
| NEW-BUG-E dispute status filter 'open' | F FE | FinancePage.tsx | ✅ live |
| NEW-BUG-F ConfirmDealModal lock 5 field | F FE | ConfirmDealModal.tsx | ✅ live |
| NEW-BUG-G deal_audit_log RLS SECURITY DEFINER | H SQL | sprint_h.sql | ✅ live |
| NEW-BUG-H dealChatActionsService SELECT total_advanced | local | dealChatActionsService.ts | 🕐 local commit |
| NEW-BUG-I advance→ledger trigger (pending phát hiện) | I SQL | TBD | 🔜 pending |
| Simplify Duyệt Deal rule (2 conditions) | local | dealService.ts | 🕐 local commit |
| Tab Tạm ứng có nút Ứng thêm | local | DealAdvancesTab.tsx | 🕐 local commit |
| Tab QC có UX nhập DRC | local | DealQcTab.tsx | 🕐 local commit |

**Legend:** ✅ live = đã push + Vercel deployed · 🕐 local = commit chưa push · 🔜 pending = chưa code
