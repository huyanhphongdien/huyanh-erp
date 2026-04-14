-- ============================================================================
-- QLSX Sprint 4 RERUN — chỉ RLS, không tạo bảng mới
-- Vì safety_signs + sop_training_assignments đã tồn tại với schema riêng
-- → Chỉ bật RLS + thêm policy, không tạo bảng mới
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
-- 2. RLS cho các bảng SOP/Safety đã tồn tại (không tạo mới)
-- ============================================================================

-- Chỉ apply RLS nếu bảng tồn tại (dùng DO block để check)
DO $$
BEGIN
  -- sop_documents
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sop_documents') THEN
    EXECUTE 'ALTER TABLE public.sop_documents ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS sop_documents_select_auth ON public.sop_documents';
    EXECUTE 'CREATE POLICY sop_documents_select_auth ON public.sop_documents FOR SELECT TO authenticated USING (true)';
    EXECUTE 'DROP POLICY IF EXISTS sop_documents_modify_auth ON public.sop_documents';
    EXECUTE 'CREATE POLICY sop_documents_modify_auth ON public.sop_documents FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;

  -- sop_training_assignments (existing, không tạo sop_training_records mới)
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sop_training_assignments') THEN
    EXECUTE 'ALTER TABLE public.sop_training_assignments ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS sop_training_assignments_select_auth ON public.sop_training_assignments';
    EXECUTE 'CREATE POLICY sop_training_assignments_select_auth ON public.sop_training_assignments FOR SELECT TO authenticated USING (true)';
    EXECUTE 'DROP POLICY IF EXISTS sop_training_assignments_modify_auth ON public.sop_training_assignments';
    EXECUTE 'CREATE POLICY sop_training_assignments_modify_auth ON public.sop_training_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;

  -- safety_signs (existing với schema khác)
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'safety_signs') THEN
    EXECUTE 'ALTER TABLE public.safety_signs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS safety_signs_select_auth ON public.safety_signs';
    EXECUTE 'CREATE POLICY safety_signs_select_auth ON public.safety_signs FOR SELECT TO authenticated USING (true)';
    EXECUTE 'DROP POLICY IF EXISTS safety_signs_modify_auth ON public.safety_signs';
    EXECUTE 'CREATE POLICY safety_signs_modify_auth ON public.safety_signs FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- Add to realtime publication (nếu chưa có)
-- ============================================================================

DO $$
BEGIN
  -- sop_documents
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sop_documents')
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sop_documents'
    )
  THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.sop_documents';
  END IF;

  -- sop_training_assignments
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sop_training_assignments')
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sop_training_assignments'
    )
  THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.sop_training_assignments';
  END IF;

  -- safety_signs
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'safety_signs')
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'safety_signs'
    )
  THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.safety_signs';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFY
-- ============================================================================

SELECT 'RLS status' AS section;

SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND (tablename LIKE 'production_%'
       OR tablename IN ('sop_documents','sop_training_assignments','safety_signs'))
ORDER BY tablename;

SELECT 'Realtime publication' AS section;

SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public'
  AND (tablename LIKE 'production_%'
       OR tablename IN ('sop_documents','sop_training_assignments','safety_signs'))
ORDER BY tablename;
