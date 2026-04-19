-- ============================================================================
-- FEATURE: QC inline trên phiếu cân
-- Ngày: 2026-04-19
--
-- Luồng mới: Cân Gross → QC lấy mẫu test DRC → (pass/warn/fail) → Cân Tare
-- → Complete → stock-in với qc_status đã có sẵn.
--
-- Nếu chưa có kết quả lab (quick test chưa xong) → operator có thể SKIP,
-- ticket giữ qc_status = NULL → batch.qc_status = 'pending' → QC lab nhập
-- sau qua tab QC của Deal / quick-scan.
-- ============================================================================

ALTER TABLE weighbridge_tickets
  ADD COLUMN IF NOT EXISTS qc_actual_drc NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS qc_status TEXT,
  ADD COLUMN IF NOT EXISTS qc_notes TEXT,
  ADD COLUMN IF NOT EXISTS qc_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS qc_checked_by UUID REFERENCES public.employees(id);

-- CHECK constraint — NOT VALID để bypass rows cũ
ALTER TABLE weighbridge_tickets
  DROP CONSTRAINT IF EXISTS chk_weighbridge_qc_status;

ALTER TABLE weighbridge_tickets
  ADD CONSTRAINT chk_weighbridge_qc_status
  CHECK (
    qc_status IS NULL
    OR qc_status IN ('pending', 'passed', 'warning', 'failed')
  )
  NOT VALID;

COMMENT ON COLUMN weighbridge_tickets.qc_actual_drc IS
  'DRC thực đo tại trạm cân (test nhanh). NULL nếu skip QC, sẽ đo tại lab sau.';

COMMENT ON COLUMN weighbridge_tickets.qc_status IS
  'Kết quả QC nhanh: NULL (chưa test — skip cho lab làm sau), passed, warning, failed.';

CREATE INDEX IF NOT EXISTS idx_weighbridge_qc_status
  ON weighbridge_tickets (qc_status)
  WHERE qc_status IS NOT NULL;

-- Refresh PostgREST
NOTIFY pgrst, 'reload schema';

-- Verify
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'weighbridge_tickets'
  AND column_name IN ('qc_actual_drc', 'qc_status', 'qc_notes', 'qc_checked_at', 'qc_checked_by')
ORDER BY column_name;
