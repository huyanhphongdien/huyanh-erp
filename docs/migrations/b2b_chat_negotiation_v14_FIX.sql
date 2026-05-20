-- ============================================================================
-- V14 FIX — Sửa RLS UPDATE policy chat_messages (sai mapping auth.uid())
-- Date: 2026-05-20
-- ============================================================================
--
-- Bug: Migration v14 đầu tiên dùng:
--   sender_id = auth.uid()
--   room.partner_id = auth.uid()
--
-- Nhưng:
--   - b2b_chat_messages.sender_id:
--     + Partner side = b2b_partner_users.id (KHÔNG phải auth_user_id)
--     + Factory side = employees.id (KHÔNG phải auth.uid())
--   - b2b_chat_rooms.partner_id = b2b_partners.id (entity, KHÔNG phải auth.uid())
--
-- → Policy đã chặn TẤT CẢ update của portal đại lý (gồm action thương lượng).
--
-- FIX: Mapping qua b2b_partner_users.auth_user_id + employees.user_id.
-- ============================================================================

-- Drop policy cũ sai
DROP POLICY IF EXISTS chat_messages_update_negotiation ON b2b.chat_messages;

-- Tạo policy mới với mapping đúng
CREATE POLICY chat_messages_update_negotiation ON b2b.chat_messages
  FOR UPDATE
  USING (
    -- Service role bypass
    auth.role() = 'service_role'
    -- Partner: sender là partner_user của user đang login
    OR sender_id IN (
      SELECT id FROM b2b_partner_users WHERE auth_user_id = auth.uid()
    )
    -- Partner: đang trong room thuộc partner mình
    OR room_id IN (
      SELECT cr.id FROM b2b.chat_rooms cr
       WHERE cr.partner_id IN (
         SELECT partner_id FROM b2b_partner_users WHERE auth_user_id = auth.uid()
       )
    )
    -- Factory employee: sender là employee của user đang login
    OR sender_id IN (
      SELECT id FROM employees WHERE user_id = auth.uid()
    )
    -- Factory employee: đang trong room (any factory authenticated user)
    -- Mọi factory employee có quyền thao tác mọi room — same pattern existing
    -- SELECT policy b2b_chat_messages_select_*
    OR EXISTS (
      SELECT 1 FROM employees WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR sender_id IN (
      SELECT id FROM b2b_partner_users WHERE auth_user_id = auth.uid()
    )
    OR room_id IN (
      SELECT cr.id FROM b2b.chat_rooms cr
       WHERE cr.partner_id IN (
         SELECT partner_id FROM b2b_partner_users WHERE auth_user_id = auth.uid()
       )
    )
    OR sender_id IN (
      SELECT id FROM employees WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM employees WHERE user_id = auth.uid()
    )
  );

COMMENT ON POLICY chat_messages_update_negotiation ON b2b.chat_messages IS
  'V14 FIX 2026-05-20: mapping auth.uid() qua b2b_partner_users.auth_user_id + employees.user_id (KHÔNG phải sender_id/partner_id trực tiếp).';

NOTIFY pgrst, 'reload schema';

-- Verify
SELECT policyname, cmd
  FROM pg_policies
 WHERE schemaname = 'b2b'
   AND tablename = 'chat_messages'
   AND policyname = 'chat_messages_update_negotiation';
