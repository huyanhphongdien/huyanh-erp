-- ============================================================================
-- QLSX Sprint 2 — Data integrity migration
--
-- 1. Thêm FK constraints cho các cột tham chiếu employees.id
--    (supervisor_id, operator_id, qc_inspector_id, tester_id)
-- 2. Thêm CHECK constraint cho DRC ranges (0-100)
-- 3. Thêm index còn thiếu trên production_output_batches.status
--
-- Pre-check: đã verify 4 cột này hiện đều 0 rows → an toàn add FK
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. FK constraints → employees.id
-- ON DELETE SET NULL: nếu xóa employee, không cascade xóa PO/stage/QC
-- (audit trail giữ nguyên, chỉ mất reference)
-- ============================================================================

-- production_orders.supervisor_id
ALTER TABLE public.production_orders
  ADD CONSTRAINT production_orders_supervisor_id_fkey
  FOREIGN KEY (supervisor_id) REFERENCES public.employees(id)
  ON DELETE SET NULL;

-- production_orders.created_by + updated_by (audit trail)
ALTER TABLE public.production_orders
  ADD CONSTRAINT production_orders_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.employees(id)
  ON DELETE SET NULL;

ALTER TABLE public.production_orders
  ADD CONSTRAINT production_orders_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES public.employees(id)
  ON DELETE SET NULL;

-- production_stage_progress.operator_id
ALTER TABLE public.production_stage_progress
  ADD CONSTRAINT production_stage_progress_operator_id_fkey
  FOREIGN KEY (operator_id) REFERENCES public.employees(id)
  ON DELETE SET NULL;

-- production_stage_progress.qc_inspector_id
ALTER TABLE public.production_stage_progress
  ADD CONSTRAINT production_stage_progress_qc_inspector_id_fkey
  FOREIGN KEY (qc_inspector_id) REFERENCES public.employees(id)
  ON DELETE SET NULL;

-- production_qc_results.tester_id
ALTER TABLE public.production_qc_results
  ADD CONSTRAINT production_qc_results_tester_id_fkey
  FOREIGN KEY (tester_id) REFERENCES public.employees(id)
  ON DELETE SET NULL;

-- ============================================================================
-- 2. CHECK constraints — DRC ranges
-- DRC phải trong khoảng 0-100% (actually 30-100 cho cao su, nhưng cho phép 0 để null-safe)
-- ============================================================================

ALTER TABLE public.production_orders
  ADD CONSTRAINT production_orders_target_drc_min_check
  CHECK (target_drc_min IS NULL OR (target_drc_min >= 0 AND target_drc_min <= 100));

ALTER TABLE public.production_orders
  ADD CONSTRAINT production_orders_target_drc_max_check
  CHECK (target_drc_max IS NULL OR (target_drc_max >= 0 AND target_drc_max <= 100));

ALTER TABLE public.production_orders
  ADD CONSTRAINT production_orders_final_drc_check
  CHECK (final_drc IS NULL OR (final_drc >= 0 AND final_drc <= 100));

ALTER TABLE public.production_stage_progress
  ADD CONSTRAINT production_stage_progress_input_drc_check
  CHECK (input_drc IS NULL OR (input_drc >= 0 AND input_drc <= 100));

ALTER TABLE public.production_stage_progress
  ADD CONSTRAINT production_stage_progress_output_drc_check
  CHECK (output_drc IS NULL OR (output_drc >= 0 AND output_drc <= 100));

ALTER TABLE public.production_qc_results
  ADD CONSTRAINT production_qc_results_drc_value_check
  CHECK (drc_value IS NULL OR (drc_value >= 0 AND drc_value <= 100));

ALTER TABLE public.production_qc_results
  ADD CONSTRAINT production_qc_results_moisture_check
  CHECK (moisture_content IS NULL OR (moisture_content >= 0 AND moisture_content <= 100));

-- Yield percent 0-100 (có thể > 100 trong trường hợp đặc biệt nên cho max 150)
ALTER TABLE public.production_orders
  ADD CONSTRAINT production_orders_yield_percent_check
  CHECK (yield_percent IS NULL OR (yield_percent >= 0 AND yield_percent <= 150));

-- ============================================================================
-- 3. Indexes còn thiếu cho performance
-- ============================================================================

-- Query by output batch status (QC pending, passed, failed)
CREATE INDEX IF NOT EXISTS idx_production_output_batches_status
  ON public.production_output_batches(status);

-- Query QC results by grade/result
CREATE INDEX IF NOT EXISTS idx_production_qc_results_result
  ON public.production_qc_results(result);

-- Query stages by status (for active-stage lookups)
CREATE INDEX IF NOT EXISTS idx_production_stage_progress_status
  ON public.production_stage_progress(status)
  WHERE status IN ('in_progress', 'pending');

-- Query production orders by facility + status (cho scheduler)
CREATE INDEX IF NOT EXISTS idx_production_orders_facility_status
  ON public.production_orders(facility_id, status);

-- Stock batches by batch_type + production_order_id (query "thành phẩm của PO này")
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

SELECT conrelid::regclass AS table_name, conname AS constraint_name
FROM pg_constraint
WHERE contype = 'c'
  AND conname LIKE '%drc%' OR conname LIKE '%yield%' OR conname LIKE '%moisture%'
  AND conrelid::regclass::text LIKE 'production_%'
ORDER BY conrelid::regclass::text;

SELECT 'Indexes created' AS section;

SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_production_%'
ORDER BY tablename, indexname;
