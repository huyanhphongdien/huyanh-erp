-- ============================================================================
-- V14 — B2B Chat Negotiation hardening (RLS UPDATE + history schema notes)
-- Date: 2026-05-20
-- ============================================================================
--
-- Bối cảnh audit phát hiện 3 P0 issues:
--   #4: RLS UPDATE policy thiếu cho b2b.chat_messages — bất kỳ ai trong room
--       cũng có thể UPDATE message của người khác (sửa booking status, đổi
--       counter_price), gây nguy cơ tampering.
--   #7: negotiation_history schema không có — service code lưu vào
--       metadata.booking.negotiation_history[] (JSONB array). Migration này
--       documents schema và add jsonb_array_length check.
--   #5: negotiation_version optimistic locking — service đã handle, không
--       cần DB change (lưu trong JSONB).
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- 1. RLS UPDATE policy — chỉ cho phép update booking metadata nếu:
--    - User là sender của message (b2b.chat_messages.sender_id = auth.uid())
--    - HOẶC user là factory employee (sender_type='factory' từ phía Huy Anh)
--    - HOẶC user là partner_id của room (đăng nhập portal)
-- ════════════════════════════════════════════════════════════════════════════

-- Drop old policy nếu có (idempotent)
DROP POLICY IF EXISTS chat_messages_update_negotiation ON b2b.chat_messages;

CREATE POLICY chat_messages_update_negotiation ON b2b.chat_messages
  FOR UPDATE
  USING (
    -- Sender của message (cả factory + partner)
    sender_id = auth.uid()
    -- HOẶC partner_id của room (đang tham gia)
    OR room_id IN (
      SELECT id FROM b2b.chat_rooms
       WHERE partner_id = auth.uid()
    )
    -- HOẶC service_role (backend admin operations)
    OR auth.role() = 'service_role'
  )
  WITH CHECK (
    sender_id = auth.uid()
    OR room_id IN (
      SELECT id FROM b2b.chat_rooms
       WHERE partner_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

COMMENT ON POLICY chat_messages_update_negotiation ON b2b.chat_messages IS
  'UPDATE booking metadata (negotiate/confirm/reject) chỉ cho sender / partner / service_role. Chặn third-party tamper.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Validation function — count negotiation_history rounds
--    Dùng cho dashboard/analytics, không enforce ở DB level (giữ flexible JSONB).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION b2b.fn_count_negotiation_rounds(msg_id UUID)
RETURNS INT
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_array_length(
    COALESCE(metadata -> 'booking' -> 'negotiation_history', '[]'::jsonb)
  )
  FROM b2b.chat_messages
  WHERE id = msg_id
$$;

COMMENT ON FUNCTION b2b.fn_count_negotiation_rounds IS
  'Đếm số round thương lượng của 1 booking. Dùng cho metrics/alerts (>5 round → cảnh báo).';

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Index để query messages đang negotiating nhanh hơn
-- ════════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_chat_messages_booking_status
  ON b2b.chat_messages ((metadata -> 'booking' ->> 'status'))
  WHERE message_type = 'booking';

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Reload PostgREST cache
-- ════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════════════════
SELECT policyname, cmd, qual::TEXT
  FROM pg_policies
 WHERE schemaname = 'b2b'
   AND tablename = 'chat_messages'
   AND policyname LIKE '%negotiation%';

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
-- DROP POLICY IF EXISTS chat_messages_update_negotiation ON b2b.chat_messages;
-- DROP FUNCTION IF EXISTS b2b.fn_count_negotiation_rounds;
-- DROP INDEX IF EXISTS idx_chat_messages_booking_status;
-- NOTIFY pgrst, 'reload schema';
