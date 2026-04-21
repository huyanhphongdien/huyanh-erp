# B2B RLS Manual Test Checklist — TC-S1 đến S4

**Date:** 2026-04-21
**Tiêu đề blocker:** Security — verify data isolation giữa các đại lý
**Test accounts:**
- `truonghv@gmail.com` (TETG02) → partner_id `11111111-aaaa-1111-1111-000000000002` · 3 deals
- `cuonglth@gmail.com` (TECG01) → partner_id `11111111-aaaa-1111-1111-000000000003` · 0 deals

---

## TC-S1 — Partner A query → chỉ thấy data A

### Steps:

1. Login **truonghv** → portal `localhost:5174`
2. F12 → Console → paste:

```js
// Test 1: Deals
const { data: deals } = await window.supabase.from('b2b_deals').select('id, deal_number, partner_id')
console.log('Deals visible:', deals?.length, deals)

// Expected: 3 deals, tất cả partner_id = '11111111-aaaa-1111-1111-000000000002'
```

```js
// Test 2: Chat rooms
const { data: rooms } = await window.supabase.from('b2b_chat_rooms').select('id, partner_id, room_name')
console.log('Rooms visible:', rooms?.length, rooms)

// Expected: Chỉ room của truonghv, không leak partner khác
```

```js
// Test 3: Partner ledger
const { data: ledger } = await window.supabase.from('b2b_partner_ledger').select('*')
console.log('Ledger entries visible:', ledger?.length, ledger)

// Expected: Empty (chưa có) HOẶC chỉ entries của truonghv
```

**⚠️ Lưu ý:** `window.supabase` có thể không expose global — thay bằng import:
```js
const { supabase } = await import('/src/lib/supabase.ts')
const { data } = await supabase.from('b2b_deals').select('*')
console.log(data)
```

### Pass criteria:
- ✅ Tất cả data trả về đều có `partner_id === '11111111-aaaa-1111-1111-000000000002'`
- ❌ Nếu có row khác partner_id → **LEAK CRITICAL**

---

## TC-S2 — Partner A thử query data Partner B → phải reject

### Steps:

Vẫn login truonghv. Console:

```js
// Cố query deal của cuonglth (partner_id=...003)
const { data: ok, error } = await supabase
  .from('b2b_deals')
  .select('*')
  .eq('partner_id', '11111111-aaaa-1111-1111-000000000003')

console.log('Leak check:', { rows: ok?.length, error })

// Expected: rows=0, error=null (RLS filter silently, không error)
```

```js
// Direct access bằng UUID deal của truonghv (OK) vs UUID giả của partner khác (fail)
const dealIdOwn = '<UUID_deal_của_truonghv>' // copy từ Orders list
const dealIdFake = '00000000-0000-0000-0000-000000000000'

const r1 = await supabase.from('b2b_deals').select('*').eq('id', dealIdOwn).single()
const r2 = await supabase.from('b2b_deals').select('*').eq('id', dealIdFake).single()

console.log('Own deal:', r1) // expected: data
console.log('Fake UUID:', r2) // expected: null (RLS + no match)
```

### Pass criteria:
- ✅ Cross-partner query trả empty
- ✅ Fake UUID không crash app

---

## TC-S3 — Partner A thử INSERT vào table Partner B → RLS reject

### Steps:

```js
// Thử tạo dispute với partner_id của partner khác
const { data, error } = await supabase
  .from('b2b_drc_disputes')
  .insert({
    deal_id: '<bất kỳ>',
    partner_id: '11111111-aaaa-1111-1111-000000000003', // Partner khác
    reason: 'Test RLS bypass',
    status: 'open',
    expected_drc: 50,
    actual_drc: 60,
    raised_by: '<partner B id>'
  })

console.log('INSERT attempt:', { data, error })

// Expected: error với code 42501 (insufficient_privilege) hoặc row-level policy violation
```

```js
// Thử UPDATE deal partner khác
const { data, error } = await supabase
  .from('b2b_deals')
  .update({ notes: 'Hacked by truonghv' })
  .eq('partner_id', '11111111-aaaa-1111-1111-000000000003')
  .select()

console.log('UPDATE attempt:', { data, error })

// Expected: data=[] empty (RLS filter), không update row nào
```

### Pass criteria:
- ✅ INSERT reject với policy error
- ✅ UPDATE không ảnh hưởng partner khác (data empty)

---

## TC-S4 — Logout session cleanup

### Steps:

1. Click avatar → Đăng xuất
2. Sau logout, gõ URL `localhost:5174/partner/home` vào address bar

### Pass criteria:
- ✅ Redirect về `/partner/login`
- ✅ Console chạy `await supabase.from('b2b_deals').select('*')` trả `error: Auth session missing`

---

## TC-S5 (BONUS) — Verify RLS policies từ DB side

Paste vào Supabase SQL Editor (service_role):

```sql
-- List tất cả RLS policies trên b2b.*
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'b2b'
ORDER BY tablename, policyname;

-- Check RLS enabled
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'b2b'
ORDER BY tablename;
-- Kỳ vọng: tất cả `rowsecurity = true`

-- Function current_partner_id() tồn tại?
SELECT proname, prorettype::regtype AS returns
FROM pg_proc
WHERE proname = 'current_partner_id';
-- Kỳ vọng: 1 row, returns = uuid
```

---

## Pass criteria tổng

| TC | Pass? |
|---|---|
| S1 — Partner A thấy đúng data A | ☐ |
| S2 — A không leak sang B | ☐ |
| S3 — A không INSERT/UPDATE B | ☐ |
| S4 — Logout session clear | ☐ |
| S5 — RLS policies DB-side | ☐ |

**Tất cả PASS → deploy OK.**
**Fail TC-S1 hoặc S2 → CRITICAL, dừng deploy ngay.**
**Fail TC-S3 → INSERT/UPDATE không enforce, tùy severity.**

---

## Fix pattern (nếu có leak)

Nếu RLS không enforce đúng:

```sql
-- Re-create strict policy
DROP POLICY IF EXISTS partner_select ON b2b.deals;
CREATE POLICY partner_select ON b2b.deals
  FOR SELECT
  USING (
    partner_id = public.current_partner_id()
    OR auth.role() = 'service_role'
  );
```

Lặp tương tự cho: advances, settlements, partner_ledger, chat_rooms, drc_disputes, demand_offers.
