-- ============================================================================
-- FIX: PostgREST schema cache — reload để pickup column target_facility_id
-- + Backfill Deal mới tạo nhưng target_facility_id NULL (bug silent drop)
-- ============================================================================

-- ============================================
-- BƯỚC 1 — Force PostgREST reload schema cache
-- Sau khi DROP/CREATE view public.b2b_deals, PostgREST vẫn cache schema
-- cũ → INSERT bỏ qua column mới. NOTIFY ép reload.
-- ============================================

NOTIFY pgrst, 'reload schema';

-- Chạy lại (Supabase đôi khi cần 2 lần)
SELECT pg_notify('pgrst', 'reload schema');

-- ============================================
-- BƯỚC 2 — Backfill Deal đã tạo với target_facility_id NULL
-- Lấy target_facility_id từ booking metadata (nơi portal đã lưu đúng).
-- ============================================

UPDATE b2b.deals d
SET target_facility_id = (
  SELECT (m.metadata->'booking'->>'target_facility_id')::uuid
  FROM b2b.chat_messages m
  WHERE m.id::text = d.booking_id::text
    AND m.metadata->'booking'->>'target_facility_id' IS NOT NULL
  LIMIT 1
)
WHERE d.target_facility_id IS NULL
  AND d.booking_id IS NOT NULL;

-- ============================================
-- BƯỚC 3 — Update DealCard chat message metadata cho các deal vừa backfill
-- ============================================

UPDATE b2b.chat_messages cm
SET metadata = jsonb_set(
  jsonb_set(
    jsonb_set(
      cm.metadata,
      '{deal,target_facility_id}',
      to_jsonb(d.target_facility_id::text)
    ),
    '{deal,target_facility_code}',
    to_jsonb(f.code)
  ),
  '{deal,target_facility_name}',
  to_jsonb(f.name)
)
FROM b2b.deals d
JOIN public.facilities f ON f.id = d.target_facility_id
WHERE cm.message_type = 'deal'
  AND cm.metadata->'deal'->>'deal_id' = d.id::text
  AND d.target_facility_id IS NOT NULL
  AND (cm.metadata->'deal'->>'target_facility_id' IS NULL
       OR cm.metadata->'deal'->>'target_facility_id' = '');

-- ============================================
-- BƯỚC 4 — Verify
-- ============================================

SELECT
  d.deal_number,
  d.target_facility_id,
  f.code AS facility_code,
  f.name AS facility_name,
  (SELECT m.metadata->'deal'->>'target_facility_code'
   FROM b2b.chat_messages m
   WHERE m.metadata->'deal'->>'deal_id' = d.id::text
   LIMIT 1) AS dealcard_facility
FROM b2b.deals d
LEFT JOIN public.facilities f ON f.id = d.target_facility_id
WHERE d.status IN ('processing', 'accepted')
ORDER BY d.created_at DESC;

-- ============================================
-- BƯỚC 5 — Nếu PostgREST vẫn cache cũ, restart connection:
--   Vào Supabase Dashboard → Settings → API → Restart
-- Hoặc trong app: F5 hard reload (Ctrl+Shift+R) để force re-auth
-- ============================================
