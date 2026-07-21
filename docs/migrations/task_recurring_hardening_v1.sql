-- =====================================================================
-- BƯỚC 0.3 — Schema chống lỗi bộ sinh việc định kỳ
-- Ngày 21/07/2026. AN TOÀN: mọi cột mới nullable, chạy lại nhiều lần không lỗi.
-- Bảng tasks = 874 dòng (index khoá vài mili-giây, không cần CONCURRENTLY).
-- PG 17.6 → dùng được NULLS NOT DISTINCT.
--
-- ROLLBACK ở cuối file.
-- =====================================================================

-- ── 1. tasks: cột theo dõi chống trùng + loại việc ───────────────────
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS recurring_rule_id uuid;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS recurring_date    date;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS work_category     varchar(30);
COMMENT ON COLUMN public.tasks.recurring_rule_id IS 'Rule sinh ra việc này (dedup). NULL với việc thường.';
COMMENT ON COLUMN public.tasks.recurring_date    IS 'Ngày rule dự kiến sinh (theo giờ VN). Khoá chống trùng.';
COMMENT ON COLUMN public.tasks.work_category     IS 'Nhóm việc: kiem_tra|do|su_co|bao_duong|van_hanh|gia_cong|khac — để áp quy tắc bắt buộc ảnh.';

-- ── 2. task_recurring_rules: lịch linh hoạt + truy nguồn ─────────────
ALTER TABLE public.task_recurring_rules ADD COLUMN IF NOT EXISTS days_of_week int[];
ALTER TABLE public.task_recurring_rules ADD COLUMN IF NOT EXISTS source_ref   varchar(80);
COMMENT ON COLUMN public.task_recurring_rules.days_of_week IS 'Nhiều thứ trong tuần (0=CN..6=T7). Ưu tiên hơn day_of_week đơn.';
COMMENT ON COLUMN public.task_recurring_rules.source_ref   IS 'Mã nguồn khi nạp hàng loạt (vd QLSX-STT-05) để idempotent.';

-- ── 3. task_templates: số ảnh tối thiểu ─────────────────────────────
ALTER TABLE public.task_templates ADD COLUMN IF NOT EXISTS min_evidence_count int DEFAULT 0;

-- ── 4. Unique index chống trùng (partial, KHÔNG CONCURRENTLY) ────────
--     WHERE recurring_rule_id IS NOT NULL → loại 874 việc cũ (đều NULL) → index rỗng, an toàn.
--     NULLS NOT DISTINCT → 2 việc cùng rule+ngày+assignee(NULL) vẫn coi là trùng.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_recurring_slot
  ON public.tasks (recurring_rule_id, recurring_date, assignee_id) NULLS NOT DISTINCT
  WHERE recurring_rule_id IS NOT NULL;

-- ── 5. Bảng lý do "không làm được" + seed 8 lý do (user đã chốt) ─────
CREATE TABLE IF NOT EXISTS public.task_blocked_reasons (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       varchar(30) UNIQUE NOT NULL,
  label      varchar(100) NOT NULL,
  sort_order int DEFAULT 0,
  is_active  boolean DEFAULT true
);
INSERT INTO public.task_blocked_reasons (code, label, sort_order) VALUES
  ('thieu_vat_tu',   'Thiếu vật tư',                    1),
  ('may_dang_chay',  'Máy đang chạy, không dừng được',  2),
  ('cho_phe_duyet',  'Chờ phê duyệt',                   3),
  ('mat_dien',       'Mất điện',                        4),
  ('thoi_tiet',      'Thời tiết',                       5),
  ('nghi_phep',      'Nghỉ phép',                       6),
  ('nguoi_khac_lam', 'Người khác đã làm',               7),
  ('khac',           'Lý do khác',                      8)
ON CONFLICT (code) DO NOTHING;

-- RLS: đọc công khai cho user đăng nhập (bảng danh mục tĩnh)
ALTER TABLE public.task_blocked_reasons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tbr_read ON public.task_blocked_reasons;
CREATE POLICY tbr_read ON public.task_blocked_reasons FOR SELECT TO authenticated USING (true);

-- ── 6. Xoá cột chết require_evidence (số ít) ─────────────────────────
--     0.1 xác nhận: 0/2302 dòng dùng; code chỉ dùng requires_evidence (số nhiều).
ALTER TABLE public.task_checklist_items DROP COLUMN IF EXISTS require_evidence;

-- ── 7. Nạp lại schema cache của PostgREST ───────────────────────────
NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- ROLLBACK (nếu cần):
--   DROP INDEX IF EXISTS public.uq_tasks_recurring_slot;
--   ALTER TABLE public.tasks DROP COLUMN IF EXISTS recurring_rule_id, DROP COLUMN IF EXISTS recurring_date, DROP COLUMN IF EXISTS work_category;
--   ALTER TABLE public.task_recurring_rules DROP COLUMN IF EXISTS days_of_week, DROP COLUMN IF EXISTS source_ref;
--   ALTER TABLE public.task_templates DROP COLUMN IF EXISTS min_evidence_count;
--   DROP TABLE IF EXISTS public.task_blocked_reasons;
--   ALTER TABLE public.task_checklist_items ADD COLUMN IF NOT EXISTS require_evidence boolean DEFAULT false;
-- =====================================================================
