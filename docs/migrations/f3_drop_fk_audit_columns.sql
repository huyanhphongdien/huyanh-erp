-- ============================================================================
-- F3 Hot-fix: Drop FK constraints trên audit columns (created_by, approved_by)
-- File: docs/migrations/f3_drop_fk_audit_columns.sql
--
-- Vấn đề: F3 migration ban đầu set FK created_by/approved_by → employees(id),
-- nhưng:
--   - User Supabase Auth có thể CHƯA gắn với employee record (employee_id = null)
--   - Operator ở sub-app cân dùng scale_operators table (KHÔNG phải employees)
-- → INSERT từ ERP hoặc auto-trigger từ sub-app cân đều violate FK.
--
-- Fix: drop FK constraint, giữ column UUID nullable (audit metadata only).
-- Pattern đúng cho audit columns — không enforce FK strict.
--
-- Cách chạy: paste vào Supabase SQL Editor → Run. Idempotent.
-- ============================================================================

BEGIN;

ALTER TABLE inter_facility_transfers
  DROP CONSTRAINT IF EXISTS inter_facility_transfers_created_by_fkey,
  DROP CONSTRAINT IF EXISTS inter_facility_transfers_approved_by_fkey;

COMMENT ON COLUMN inter_facility_transfers.created_by IS
  'Audit metadata: UUID người tạo (employees.id hoặc scale_operators.id). Không enforce FK.';
COMMENT ON COLUMN inter_facility_transfers.approved_by IS
  'Audit metadata: UUID người duyệt (employees.id). Không enforce FK.';

COMMIT;

-- Verify (nên return 0 rows nếu drop OK):
-- SELECT conname FROM pg_constraint
--  WHERE conrelid = 'inter_facility_transfers'::regclass
--    AND conname IN ('inter_facility_transfers_created_by_fkey',
--                    'inter_facility_transfers_approved_by_fkey');
