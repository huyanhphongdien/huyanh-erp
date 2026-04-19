-- ============================================================================
-- FIX: public.b2b_deals VIEW chưa expose column target_facility_id
-- Ngày: 2026-04-19
--
-- Nguyên nhân:
--   Migration b2b_add_target_facility.sql ADD COLUMN vào b2b.deals (base
--   table) nhưng VIEW public.b2b_deals không tự động refresh cột mới.
--   Khi code INSERT qua supabase.from('b2b_deals').insert({target_facility_id})
--   Postgres bỏ qua silent → target_facility_id trong DB = NULL.
--
-- Triệu chứng:
--   - Booking metadata có target_facility_id + code + name (Portal OK)
--   - ConfirmDealModal submit với target_facility_id (ERP OK)
--   - Nhưng b2b.deals.target_facility_id = NULL (bị drop ở view layer)
--   - DealCard metadata cũng NULL → không hiện line "🏭 Giao tại"
-- ============================================================================

-- ============================================
-- BƯỚC 1 — Xem definition hiện tại của view
-- ============================================
SELECT definition
FROM pg_views
WHERE schemaname = 'public' AND viewname = 'b2b_deals';

-- ============================================
-- BƯỚC 2 — Xem columns hiện có của view (chưa có target_facility_id)
-- ============================================
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'b2b_deals'
ORDER BY ordinal_position;

-- ============================================
-- BƯỚC 3 — DROP + CREATE lại view với column mới
-- CREATE OR REPLACE VIEW sẽ fail nếu cột cũ không còn, nên dùng DROP trước
-- rồi CREATE lại. View chỉ là SELECT thẳng từ b2b.deals → sau khi recreate
-- tự động có mọi cột của base table.
-- ============================================

DROP VIEW IF EXISTS public.b2b_deals CASCADE;

CREATE VIEW public.b2b_deals
WITH (security_invoker = true)
AS SELECT * FROM b2b.deals;

-- Grant quyền cho các role (anon cho weighbridge, authenticated cho ERP/portal)
GRANT SELECT ON public.b2b_deals TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.b2b_deals TO authenticated;

-- ============================================
-- BƯỚC 4 — Verify view có column target_facility_id
-- ============================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'b2b_deals'
  AND column_name = 'target_facility_id';

-- ============================================
-- BƯỚC 5 — Backfill cột cho deal đã tạo trước khi view được fix
-- Deal DL2604-4HYZ: target_facility_id = PD (từ booking metadata)
-- ============================================

UPDATE b2b.deals d
SET target_facility_id = '755ae776-3be6-47b8-b1d0-d15b61789f24'  -- PD
WHERE d.deal_number = 'DL2604-4HYZ'
  AND d.target_facility_id IS NULL;

-- Patch DealCard message metadata cũng vậy
UPDATE b2b.chat_messages m
SET metadata = jsonb_set(
  jsonb_set(
    jsonb_set(
      m.metadata,
      '{deal,target_facility_id}', '"755ae776-3be6-47b8-b1d0-d15b61789f24"'::jsonb
    ),
    '{deal,target_facility_code}', '"PD"'::jsonb
  ),
  '{deal,target_facility_name}', '"Phong Điền (HQ)"'::jsonb
)
WHERE m.message_type = 'deal'
  AND m.metadata->'deal'->>'deal_number' = 'DL2604-4HYZ';

-- ============================================
-- BƯỚC 6 — Verify
-- ============================================
SELECT deal_number, target_facility_id FROM b2b.deals WHERE deal_number = 'DL2604-4HYZ';

SELECT
  m.metadata->'deal'->>'deal_number' AS deal_num,
  m.metadata->'deal'->>'target_facility_code' AS facility_code,
  m.metadata->'deal'->>'target_facility_name' AS facility_name
FROM b2b.chat_messages m
WHERE m.message_type = 'deal'
  AND m.metadata->'deal'->>'deal_number' = 'DL2604-4HYZ';

-- ============================================
-- HOÀN TẤT
-- Sau khi chạy xong:
--   - F5 cả ERP + Portal
--   - DealCard DL2604-4HYZ sẽ hiện line "🏭 Giao tại: PD — Phong Điền (HQ)"
--   - Các Deal mới tạo sẽ có target_facility_id đúng trong DB
-- ============================================
