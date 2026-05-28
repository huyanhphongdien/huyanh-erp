-- ============================================================================
-- Sprint 1.8 — Chat per-employee model: NV ↔ ĐL assignment + room riêng
-- Date: 2026-05-28
-- ============================================================================
--
-- Vấn đề: Hiện tại 1 đại lý → 1 chat room shared, mọi nhân viên thấy chung.
-- Yêu cầu: Mỗi NV được phân công 1 số đại lý nhất định, mỗi cặp (NV × ĐL) =
-- 1 phòng chat riêng. NV chỉ thấy đại lý mình phụ trách. Admin thấy tất cả.
--
-- Thay đổi:
--   1. CREATE b2b.partner_assignments (NV ↔ ĐL, many-to-many)
--   2. CREATE public view b2b_partner_assignments
--   3. ALTER b2b.chat_rooms ADD assigned_user_id UUID REFERENCES auth.users(id)
--   4. ADD partial UNIQUE (partner_id, assigned_user_id, room_type) WHERE NOT NULL
--   5. DROP + RECREATE view b2b_chat_rooms để expose assigned_user_id
--   6. DELETE toàn bộ data chat cũ (user choice — go-live 2026-06-01, data demo)
--   7. Add RLS policies cho partner_assignments
--
-- Cut-over: 2026-05-28 onwards. Data trước ngày này đã bị xóa sạch.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 1: Clean slate cho chat data (user yêu cầu xóa hết)
-- ────────────────────────────────────────────────────────────────────────────
DELETE FROM b2b.chat_messages;
DELETE FROM b2b.chat_rooms;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 2: Bảng phân công NV ↔ ĐL (many-to-many)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS b2b.partner_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id  UUID NOT NULL REFERENCES b2b.partners(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID REFERENCES auth.users(id),
  UNIQUE (partner_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_partner_assignments_user
  ON b2b.partner_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_partner_assignments_partner
  ON b2b.partner_assignments(partner_id);

COMMENT ON TABLE b2b.partner_assignments IS
  'NV ↔ Đại lý: mỗi NV phụ trách 1 số ĐL. 1 ĐL có thể có nhiều NV (primary + backup).';
COMMENT ON COLUMN b2b.partner_assignments.is_primary IS
  'NV phụ trách CHÍNH cho đại lý (mỗi đại lý nên có tối đa 1 NV primary).';

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 3: Public view để client query (b2b schema không expose)
-- ────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.b2b_partner_assignments CASCADE;
CREATE VIEW public.b2b_partner_assignments AS
  SELECT * FROM b2b.partner_assignments;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_partner_assignments
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON b2b.partner_assignments
  TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 4: Thêm cột assigned_user_id vào chat_rooms
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE b2b.chat_rooms
  ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_chat_rooms_assigned_user
  ON b2b.chat_rooms(assigned_user_id);

COMMENT ON COLUMN b2b.chat_rooms.assigned_user_id IS
  'NV sở hữu phòng chat này. NULL = legacy/admin room (trước sprint1_08).';

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 5: Unique partial — mỗi cặp (partner, NV, room_type) chỉ 1 room
-- ────────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS b2b.idx_chat_rooms_partner_user_type_unique;
CREATE UNIQUE INDEX idx_chat_rooms_partner_user_type_unique
  ON b2b.chat_rooms (partner_id, assigned_user_id, room_type)
  WHERE assigned_user_id IS NOT NULL AND is_active = true;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 6: DROP + RECREATE view b2b_chat_rooms để expose assigned_user_id
-- ────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.b2b_chat_rooms CASCADE;
CREATE VIEW public.b2b_chat_rooms AS
  SELECT * FROM b2b.chat_rooms;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_chat_rooms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON b2b.chat_rooms TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 7: RLS policies cho partner_assignments
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE b2b.partner_assignments ENABLE ROW LEVEL SECURITY;

-- Authenticated users xem được tất cả (để admin assign + để chat tự discover)
DROP POLICY IF EXISTS partner_assignments_select_all ON b2b.partner_assignments;
CREATE POLICY partner_assignments_select_all ON b2b.partner_assignments
  FOR SELECT TO authenticated USING (true);

-- INSERT/UPDATE/DELETE: tạm thời cho phép tất cả authenticated (sẽ siết khi
-- có rõ role admin). Client-side gate bằng is_manager check.
DROP POLICY IF EXISTS partner_assignments_write_all ON b2b.partner_assignments;
CREATE POLICY partner_assignments_write_all ON b2b.partner_assignments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────────
-- VERIFY
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_chat_rooms_count INT;
  v_assignments_count INT;
  v_has_column BOOL;
BEGIN
  SELECT COUNT(*) INTO v_chat_rooms_count FROM b2b.chat_rooms;
  SELECT COUNT(*) INTO v_assignments_count FROM b2b.partner_assignments;
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='b2b' AND table_name='chat_rooms'
      AND column_name='assigned_user_id'
  ) INTO v_has_column;

  RAISE NOTICE '═══ Sprint 1.8 verify ═══';
  RAISE NOTICE '  chat_rooms.assigned_user_id exists: %', v_has_column;
  RAISE NOTICE '  chat_rooms count (post-DELETE): %', v_chat_rooms_count;
  RAISE NOTICE '  partner_assignments count: %', v_assignments_count;
  RAISE NOTICE '  ✓ Migration sprint1_08 applied.';
END $$;

COMMIT;
