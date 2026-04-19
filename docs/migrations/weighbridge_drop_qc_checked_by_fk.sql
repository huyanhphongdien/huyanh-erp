-- ============================================================================
-- FIX: Drop FK constraint weighbridge_tickets_qc_checked_by_fkey
--
-- Nguyên nhân: column qc_checked_by FK tới public.employees(id), nhưng
-- operator trạm cân login qua scale_operators (PIN auth), không phải
-- employees → INSERT violation FK (23503).
--
-- Fix: drop FK, giữ column UUID làm soft-reference (có thể trỏ
-- scale_operators HOẶC employees tuỳ context).
-- ============================================================================

ALTER TABLE weighbridge_tickets
  DROP CONSTRAINT IF EXISTS weighbridge_tickets_qc_checked_by_fkey;

-- Backfill column cũ vẫn null — chỉ drop FK, data không đụng
COMMENT ON COLUMN weighbridge_tickets.qc_checked_by IS
  'ID người nhập QC (scale_operators.id khi nhập tại trạm cân, employees.id khi nhập tại lab). Soft-reference, không FK.';

NOTIFY pgrst, 'reload schema';

-- Verify FK đã bị drop
SELECT conname, conrelid::regclass, confrelid::regclass
FROM pg_constraint
WHERE conrelid = 'public.weighbridge_tickets'::regclass
  AND conname LIKE '%qc_checked%';
