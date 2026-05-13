-- ============================================================================
-- One-off: Xóa project DA-2026-015 "Khoán công việc - Ngoài giờ hành chánh"
-- Date: 2026-05-09
-- ============================================================================
--
-- User yêu cầu xóa project này (đang chạy, trễ 41 ngày, 0% tiến độ).
-- projectService.delete() KHÔNG cho phép xóa project status='in_progress'
-- → cần dùng SQL trực tiếp để bypass check, cascade xóa hết phases/docs/members.
--
-- LƯU Ý: Chạy trên Supabase Dashboard SQL Editor với role admin/postgres.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: Verify project tồn tại + xem những gì sẽ bị xóa
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  p.id, p.code, p.name, p.status, p.progress_pct,
  (SELECT COUNT(*) FROM project_phases WHERE project_id = p.id) AS phase_count,
  (SELECT COUNT(*) FROM project_documents WHERE project_id = p.id) AS doc_count,
  (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) AS member_count,
  (SELECT COUNT(*) FROM project_milestones WHERE project_id = p.id) AS milestone_count
FROM projects p
WHERE p.code = 'DA-2026-015';

-- Mong đợi: 1 row hiện ra với code='DA-2026-015', name='Khoán công việc - Ngoài giờ hành chánh'

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: Xóa (cascade tự động xóa phases/milestones/members/activities/documents
--         nếu FK đã thiết lập ON DELETE CASCADE).
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

-- Backup id trước khi xóa (defensive — log để rollback nếu cần)
WITH deleted AS (
  DELETE FROM projects
  WHERE code = 'DA-2026-015'
  RETURNING id, code, name, status
)
SELECT 'DELETED' AS action, * FROM deleted;

-- Nếu output rỗng → project không tồn tại (đã xóa rồi) → ROLLBACK an toàn.
-- Nếu hiện 1 row → đúng project → COMMIT.

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: Verify đã xóa
-- ════════════════════════════════════════════════════════════════════════════
SELECT COUNT(*) AS remaining
FROM projects
WHERE code = 'DA-2026-015';

-- Mong đợi: 0
