-- ============================================================================
-- Project Documents — sửa CHECK constraint cho cột `category`
-- Date: 2026-05-09
-- ============================================================================
--
-- VẤN ĐỀ:
--   User upload tài liệu với category = 'minutes' (Biên bản) → DB reject:
--     ERROR: new row for relation "project_documents" violates check constraint
--            "project_documents_category_check"
--
--   Nguyên nhân: constraint cũ thiếu giá trị 'minutes' (và có thể 'design').
--
-- GIẢI PHÁP:
--   DROP constraint cũ → CREATE lại với đủ 6 giá trị từ TS code:
--     plan, report, minutes, contract, design, other
--
-- VERIFY trước khi run:
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'project_documents'::regclass
--     AND conname = 'project_documents_category_check';
-- ============================================================================

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: Drop constraint cũ (nếu tồn tại)
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE project_documents
  DROP CONSTRAINT IF EXISTS project_documents_category_check;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: Recreate với đủ 6 giá trị + cho phép NULL
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE project_documents
  ADD CONSTRAINT project_documents_category_check
  CHECK (
    category IS NULL OR category IN (
      'plan',      -- Kế hoạch
      'report',    -- Báo cáo
      'minutes',   -- Biên bản  ← thiếu trong constraint cũ
      'contract',  -- Hợp đồng
      'design',    -- Thiết kế  ← có thể cũng thiếu
      'other'      -- Khác
    )
  );

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: Verify
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'project_documents'::regclass
  AND conname = 'project_documents_category_check';

-- Mong đợi:
--   CHECK ((category IS NULL) OR (category = ANY (ARRAY['plan'::text, 'report'::text,
--          'minutes'::text, 'contract'::text, 'design'::text, 'other'::text])))

-- Test upload mock: insert 1 dòng với category = 'minutes'
-- (Bỏ comment để test — sẽ rollback ngay)
-- BEGIN;
--   INSERT INTO project_documents (project_id, file_name, file_path, category, uploaded_by)
--   VALUES (gen_random_uuid(), 'test.pdf', '/tmp/test', 'minutes', auth.uid())
--   RETURNING id, category;
-- ROLLBACK;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (chỉ trong trường hợp muốn revert)
-- ════════════════════════════════════════════════════════════════════════════
-- ALTER TABLE project_documents DROP CONSTRAINT project_documents_category_check;
-- ALTER TABLE project_documents ADD CONSTRAINT project_documents_category_check
--   CHECK (category IN ('plan', 'report', 'contract', 'other'));  -- giá trị cũ ước đoán
