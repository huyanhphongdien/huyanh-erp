-- ============================================================================
-- MIGRATION: SX-3 — SOP + Training + Safety Signs
-- Date: 2026-04-11
-- ============================================================================

-- SOP Documents
CREATE TABLE IF NOT EXISTS sop_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  category VARCHAR(30) NOT NULL CHECK (category IN ('production','quality','safety','maintenance','general')),
  department_id UUID REFERENCES departments(id),
  version INT DEFAULT 1,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','pending_review','approved','active','archived')),
  effective_date DATE,
  review_date DATE,
  approved_by UUID REFERENCES employees(id),
  approved_at TIMESTAMPTZ,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- SOP Steps
CREATE TABLE IF NOT EXISTS sop_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_id UUID NOT NULL REFERENCES sop_documents(id) ON DELETE CASCADE,
  step_number INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT,
  media_urls TEXT[],
  ppe_required TEXT[],
  warning_notes TEXT,
  duration_minutes INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SOP Checklists
CREATE TABLE IF NOT EXISTS sop_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_id UUID NOT NULL REFERENCES sop_documents(id) ON DELETE CASCADE,
  category VARCHAR(20) DEFAULT 'during' CHECK (category IN ('before','during','after')),
  item_text VARCHAR(300) NOT NULL,
  is_required BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0
);

-- SOP Versions
CREATE TABLE IF NOT EXISTS sop_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_id UUID NOT NULL REFERENCES sop_documents(id),
  version INT NOT NULL,
  changes_summary TEXT,
  changed_by UUID REFERENCES employees(id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  snapshot JSONB
);

-- Training Assignments
CREATE TABLE IF NOT EXISTS sop_training_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_id UUID NOT NULL REFERENCES sop_documents(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  assigned_by UUID REFERENCES employees(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  due_date DATE,
  status VARCHAR(20) DEFAULT 'assigned' CHECK (status IN ('assigned','in_progress','completed','overdue')),
  completed_at TIMESTAMPTZ,
  score DECIMAL(5,2),
  UNIQUE(sop_id, employee_id)
);

-- Safety Signs
CREATE TABLE IF NOT EXISTS safety_signs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(30) UNIQUE NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('prohibition','mandatory','warning','information','fire')),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  area VARCHAR(50) NOT NULL,
  location_detail TEXT,
  image_url TEXT,
  standard VARCHAR(30),
  install_date DATE,
  last_inspection_date DATE,
  next_inspection_date DATE,
  condition VARCHAR(20) DEFAULT 'good' CHECK (condition IN ('good','faded','damaged','missing','replaced')),
  linked_sop_id UUID REFERENCES sop_documents(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safety Sign Inspections
CREATE TABLE IF NOT EXISTS safety_sign_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sign_id UUID NOT NULL REFERENCES safety_signs(id),
  inspection_date DATE NOT NULL,
  inspector_id UUID REFERENCES employees(id),
  condition VARCHAR(20) NOT NULL,
  photo_url TEXT,
  action_taken TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sop_status ON sop_documents(status);
CREATE INDEX IF NOT EXISTS idx_sop_steps_sop ON sop_steps(sop_id);
CREATE INDEX IF NOT EXISTS idx_training_employee ON sop_training_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_training_status ON sop_training_assignments(status);
CREATE INDEX IF NOT EXISTS idx_safety_area ON safety_signs(area);

-- RLS
ALTER TABLE sop_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE sop_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE sop_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE sop_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sop_training_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_signs ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_sign_inspections ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$ BEGIN
  EXECUTE 'CREATE POLICY "auth_all_sop_documents" ON sop_documents FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "auth_all_sop_steps" ON sop_steps FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "auth_all_sop_checklists" ON sop_checklists FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "auth_all_sop_versions" ON sop_versions FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "auth_all_training" ON sop_training_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "auth_all_safety_signs" ON safety_signs FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "auth_all_safety_inspections" ON safety_sign_inspections FOR ALL TO authenticated USING (true) WITH CHECK (true)';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
