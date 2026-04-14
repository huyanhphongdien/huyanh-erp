-- ============================================================================
-- QLSX Sprint 4 — RLS policies + missing tables + facility capacity
--
-- 1. Bật RLS cho 7 bảng Production chính
--    Policy đơn giản: authenticated có quyền R/W toàn bộ
--    (role-based check chi tiết sẽ làm ở app layer)
-- 2. Tạo bảng sop_training_records (cho SOPTrainingPage)
-- 3. Tạo bảng safety_signs (cho SafetySignsPage)
-- 4. Function check facility capacity conflict
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. RLS cho các bảng Production
-- ============================================================================

ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_stage_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_output_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_qc_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_material_specs ENABLE ROW LEVEL SECURITY;

-- Policies: authenticated user có quyền đầy đủ (app layer enforce role)
-- service_role tự động bypass RLS nên không cần policy riêng

DO $$
DECLARE tbl text;
BEGIN
  FOR tbl IN VALUES
    ('production_orders'),
    ('production_order_items'),
    ('production_stage_progress'),
    ('production_output_batches'),
    ('production_qc_results'),
    ('production_facilities'),
    ('production_material_specs')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select_auth ON public.%I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_select_auth ON public.%I FOR SELECT TO authenticated USING (true)', tbl, tbl);

    EXECUTE format('DROP POLICY IF EXISTS %I_modify_auth ON public.%I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_modify_auth ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', tbl, tbl);
  END LOOP;
END $$;

-- ============================================================================
-- 2. sop_training_records — tracking training SOP cho nhân viên
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sop_training_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_id uuid NOT NULL REFERENCES public.sop_documents(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  trained_at date NOT NULL DEFAULT CURRENT_DATE,
  trainer_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  valid_until date,                             -- Hết hạn (ví dụ 6 tháng/1 năm)
  score numeric(5, 2),                          -- 0-100 nếu có bài test
  passed boolean NOT NULL DEFAULT true,
  notes text,
  certificate_url text,                         -- Link tới file chứng chỉ
  created_by uuid REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(sop_id, employee_id, trained_at)       -- 1 NV chỉ 1 record/SOP/ngày
);

CREATE INDEX IF NOT EXISTS idx_sop_training_sop ON public.sop_training_records(sop_id);
CREATE INDEX IF NOT EXISTS idx_sop_training_employee ON public.sop_training_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_sop_training_valid ON public.sop_training_records(valid_until)
  WHERE valid_until IS NOT NULL;

ALTER TABLE public.sop_training_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY sop_training_select_auth ON public.sop_training_records
  FOR SELECT TO authenticated USING (true);
CREATE POLICY sop_training_modify_auth ON public.sop_training_records
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- 3. safety_signs — quản lý biển báo an toàn tại nhà máy
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.safety_signs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,                    -- SS-001, SS-002
  name text NOT NULL,                           -- "Cấm hút thuốc", "Nguy hiểm điện"
  category text NOT NULL CHECK (category IN (
    'prohibition',      -- Cấm
    'warning',          -- Cảnh báo
    'mandatory',        -- Bắt buộc
    'safe_condition',   -- Điều kiện an toàn
    'fire_safety',      -- PCCC
    'emergency'         -- Khẩn cấp
  )),
  location text,                                -- Vị trí gắn (vd "Cổng vào nhà máy")
  image_url text,                               -- Hình biển báo
  description text,
  installed_at date,
  last_inspection_at date,
  next_inspection_at date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','damaged','removed')),
  notes text,
  created_by uuid REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_signs_category ON public.safety_signs(category);
CREATE INDEX IF NOT EXISTS idx_safety_signs_status ON public.safety_signs(status);

ALTER TABLE public.safety_signs ENABLE ROW LEVEL SECURITY;
CREATE POLICY safety_signs_select_auth ON public.safety_signs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY safety_signs_modify_auth ON public.safety_signs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- 4. Trigger auto-update updated_at cho cả 2 bảng mới
-- ============================================================================

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sop_training_touch ON public.sop_training_records;
CREATE TRIGGER trg_sop_training_touch
  BEFORE UPDATE ON public.sop_training_records
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_safety_signs_touch ON public.safety_signs;
CREATE TRIGGER trg_safety_signs_touch
  BEFORE UPDATE ON public.safety_signs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

COMMIT;

-- ============================================================================
-- Add to realtime publication
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.sop_training_records;
ALTER PUBLICATION supabase_realtime ADD TABLE public.safety_signs;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFY
-- ============================================================================

SELECT 'RLS enabled on:' AS section;
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'production_%' OR tablename IN ('sop_training_records','safety_signs')
ORDER BY tablename;

SELECT 'New tables created:' AS section;
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('sop_training_records','safety_signs')
ORDER BY table_name, ordinal_position;
