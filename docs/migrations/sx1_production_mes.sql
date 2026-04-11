-- ============================================================================
-- MIGRATION: SX-1 — Production MES Tables
-- Module: Quản lý Sản xuất (10-step SVR + Downtime + Shift Report)
-- Date: 2026-04-11
-- ============================================================================

-- 1. Nhật ký 10 công đoạn sản xuất SVR
CREATE TABLE IF NOT EXISTS production_step_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id UUID NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  step_number INT NOT NULL CHECK (step_number BETWEEN 1 AND 10),
  step_name VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','completed','skipped')),
  operator_id UUID REFERENCES employees(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_minutes INT,
  parameters JSONB NOT NULL DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(production_order_id, step_number)
);

-- 2. Sự cố / dừng máy
CREATE TABLE IF NOT EXISTS production_downtimes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id UUID REFERENCES production_orders(id),
  line_id UUID,
  reason_category VARCHAR(30) NOT NULL
    CHECK (reason_category IN (
      'mechanical','electrical','material_shortage',
      'quality_issue','planned_maintenance','operator','other'
    )),
  reason_detail TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_minutes INT,
  impact_level VARCHAR(10) DEFAULT 'medium'
    CHECK (impact_level IN ('low','medium','high','critical')),
  resolution TEXT,
  reported_by UUID REFERENCES employees(id),
  resolved_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Báo cáo ca sản xuất
CREATE TABLE IF NOT EXISTS shift_production_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE NOT NULL,
  shift VARCHAR(10) NOT NULL CHECK (shift IN ('1','2','3')),
  team VARCHAR(10) CHECK (team IN ('A','B','C')),
  line_id UUID,
  -- Sản lượng
  planned_output_kg DECIMAL(15,2) DEFAULT 0,
  actual_output_kg DECIMAL(15,2) DEFAULT 0,
  yield_percent DECIMAL(5,2),
  -- Thời gian
  total_run_minutes INT DEFAULT 0,
  total_downtime_minutes INT DEFAULT 0,
  -- Chất lượng
  total_bales INT DEFAULT 0,
  passed_bales INT DEFAULT 0,
  rejected_bales INT DEFAULT 0,
  qc_pass_rate DECIMAL(5,2),
  -- OEE
  oee_availability DECIMAL(5,2),
  oee_performance DECIMAL(5,2),
  oee_quality DECIMAL(5,2),
  oee_overall DECIMAL(5,2),
  -- Nhân sự
  headcount INT,
  -- Ghi chú
  handover_notes TEXT,
  incidents TEXT,
  reported_by UUID REFERENCES employees(id),
  approved_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(report_date, shift, line_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_step_logs_order ON production_step_logs(production_order_id);
CREATE INDEX IF NOT EXISTS idx_step_logs_status ON production_step_logs(status);
CREATE INDEX IF NOT EXISTS idx_downtimes_order ON production_downtimes(production_order_id);
CREATE INDEX IF NOT EXISTS idx_downtimes_started ON production_downtimes(started_at);
CREATE INDEX IF NOT EXISTS idx_shift_reports_date ON shift_production_reports(report_date);

-- RLS
ALTER TABLE production_step_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_downtimes ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_production_reports ENABLE ROW LEVEL SECURITY;

-- Policies (authenticated users can read/write)
CREATE POLICY "auth_read_step_logs" ON production_step_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_step_logs" ON production_step_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_downtimes" ON production_downtimes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_downtimes" ON production_downtimes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_shift_reports" ON shift_production_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_shift_reports" ON shift_production_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);
