-- ============================================================================
-- QLSX Sprint 2 RERUN — Fully idempotent version
-- Dùng khi lần chạy đầu bị lỗi giữa chừng (vd yield_percent violation)
-- DROP trước rồi ADD lại → chạy được lần 2 không báo "already exists"
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. FK constraints → employees.id
-- ============================================================================

ALTER TABLE public.production_orders
  DROP CONSTRAINT IF EXISTS production_orders_supervisor_id_fkey;
ALTER TABLE public.production_orders
  ADD CONSTRAINT production_orders_supervisor_id_fkey
  FOREIGN KEY (supervisor_id) REFERENCES public.employees(id)
  ON DELETE SET NULL;

ALTER TABLE public.production_orders
  DROP CONSTRAINT IF EXISTS production_orders_created_by_fkey;
ALTER TABLE public.production_orders
  ADD CONSTRAINT production_orders_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.employees(id)
  ON DELETE SET NULL;

ALTER TABLE public.production_orders
  DROP CONSTRAINT IF EXISTS production_orders_updated_by_fkey;
ALTER TABLE public.production_orders
  ADD CONSTRAINT production_orders_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES public.employees(id)
  ON DELETE SET NULL;

ALTER TABLE public.production_stage_progress
  DROP CONSTRAINT IF EXISTS production_stage_progress_operator_id_fkey;
ALTER TABLE public.production_stage_progress
  ADD CONSTRAINT production_stage_progress_operator_id_fkey
  FOREIGN KEY (operator_id) REFERENCES public.employees(id)
  ON DELETE SET NULL;

ALTER TABLE public.production_stage_progress
  DROP CONSTRAINT IF EXISTS production_stage_progress_qc_inspector_id_fkey;
ALTER TABLE public.production_stage_progress
  ADD CONSTRAINT production_stage_progress_qc_inspector_id_fkey
  FOREIGN KEY (qc_inspector_id) REFERENCES public.employees(id)
  ON DELETE SET NULL;

ALTER TABLE public.production_qc_results
  DROP CONSTRAINT IF EXISTS production_qc_results_tester_id_fkey;
ALTER TABLE public.production_qc_results
  ADD CONSTRAINT production_qc_results_tester_id_fkey
  FOREIGN KEY (tester_id) REFERENCES public.employees(id)
  ON DELETE SET NULL;

-- ============================================================================
-- 2. CHECK constraints
-- ============================================================================

ALTER TABLE public.production_orders
  DROP CONSTRAINT IF EXISTS production_orders_target_drc_min_check;
ALTER TABLE public.production_orders
  ADD CONSTRAINT production_orders_target_drc_min_check
  CHECK (target_drc_min IS NULL OR (target_drc_min >= 0 AND target_drc_min <= 100));

ALTER TABLE public.production_orders
  DROP CONSTRAINT IF EXISTS production_orders_target_drc_max_check;
ALTER TABLE public.production_orders
  ADD CONSTRAINT production_orders_target_drc_max_check
  CHECK (target_drc_max IS NULL OR (target_drc_max >= 0 AND target_drc_max <= 100));

ALTER TABLE public.production_orders
  DROP CONSTRAINT IF EXISTS production_orders_final_drc_check;
ALTER TABLE public.production_orders
  ADD CONSTRAINT production_orders_final_drc_check
  CHECK (final_drc IS NULL OR (final_drc >= 0 AND final_drc <= 100));

ALTER TABLE public.production_stage_progress
  DROP CONSTRAINT IF EXISTS production_stage_progress_input_drc_check;
ALTER TABLE public.production_stage_progress
  ADD CONSTRAINT production_stage_progress_input_drc_check
  CHECK (input_drc IS NULL OR (input_drc >= 0 AND input_drc <= 100));

ALTER TABLE public.production_stage_progress
  DROP CONSTRAINT IF EXISTS production_stage_progress_output_drc_check;
ALTER TABLE public.production_stage_progress
  ADD CONSTRAINT production_stage_progress_output_drc_check
  CHECK (output_drc IS NULL OR (output_drc >= 0 AND output_drc <= 100));

ALTER TABLE public.production_qc_results
  DROP CONSTRAINT IF EXISTS production_qc_results_drc_value_check;
ALTER TABLE public.production_qc_results
  ADD CONSTRAINT production_qc_results_drc_value_check
  CHECK (drc_value IS NULL OR (drc_value >= 0 AND drc_value <= 100));

ALTER TABLE public.production_qc_results
  DROP CONSTRAINT IF EXISTS production_qc_results_moisture_check;
ALTER TABLE public.production_qc_results
  ADD CONSTRAINT production_qc_results_moisture_check
  CHECK (moisture_content IS NULL OR (moisture_content >= 0 AND moisture_content <= 100));

ALTER TABLE public.production_orders
  DROP CONSTRAINT IF EXISTS production_orders_yield_percent_check;
ALTER TABLE public.production_orders
  ADD CONSTRAINT production_orders_yield_percent_check
  CHECK (yield_percent IS NULL OR (yield_percent >= 0 AND yield_percent <= 150));

-- ============================================================================
-- 3. Indexes (đã có IF NOT EXISTS nên idempotent sẵn)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_production_output_batches_status
  ON public.production_output_batches(status);

CREATE INDEX IF NOT EXISTS idx_production_qc_results_result
  ON public.production_qc_results(result);

CREATE INDEX IF NOT EXISTS idx_production_stage_progress_status
  ON public.production_stage_progress(status)
  WHERE status IN ('in_progress', 'pending');

CREATE INDEX IF NOT EXISTS idx_production_orders_facility_status
  ON public.production_orders(facility_id, status);

CREATE INDEX IF NOT EXISTS idx_stock_batches_production
  ON public.stock_batches(production_order_id, batch_type)
  WHERE batch_type = 'production';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFY
-- ============================================================================

SELECT 'FK constraints added' AS section;

SELECT
  tc.table_name,
  kcu.column_name,
  tc.constraint_name,
  ccu.table_name || '.' || ccu.column_name AS references
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN ('production_orders','production_stage_progress','production_qc_results')
  AND kcu.column_name IN ('supervisor_id','operator_id','qc_inspector_id','tester_id','created_by','updated_by')
ORDER BY tc.table_name, kcu.column_name;

SELECT 'CHECK constraints added' AS section;

SELECT conrelid::regclass::text AS table_name, conname AS constraint_name
FROM pg_constraint
WHERE contype = 'c'
  AND (conname LIKE '%drc%' OR conname LIKE '%yield%' OR conname LIKE '%moisture%')
  AND conrelid::regclass::text LIKE 'production_%'
ORDER BY conrelid::regclass::text, conname;

SELECT 'Indexes created' AS section;

SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_production_%'
ORDER BY tablename, indexname;
