-- ============================================================================
-- TASK TEMPLATES + RECURRING RULES
-- Ngày: 21/03/2026
-- Template công việc + Lịch tự động tạo task định kỳ
-- ============================================================================

-- 1. Bảng template công việc
CREATE TABLE IF NOT EXISTS task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(50) DEFAULT 'general',
  default_priority VARCHAR(20) DEFAULT 'medium',
  default_duration_days INTEGER DEFAULT 7,
  department_id UUID,
  default_assignee_id UUID,
  checklist_items JSONB DEFAULT '[]',
  tags TEXT[],
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Bảng recurring rules
CREATE TABLE IF NOT EXISTS task_recurring_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES task_templates(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,

  frequency VARCHAR(20) NOT NULL,
  day_of_week INTEGER,
  day_of_month INTEGER,
  time_of_day TIME DEFAULT '08:00',

  assignee_id UUID,
  department_id UUID,

  is_active BOOLEAN DEFAULT true,
  last_generated_at TIMESTAMPTZ,
  next_generation_at TIMESTAMPTZ,

  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_active ON task_recurring_rules(is_active, next_generation_at);

-- 3. RLS
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_recurring_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to task_templates"
  ON task_templates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to task_recurring_rules"
  ON task_recurring_rules FOR ALL USING (true) WITH CHECK (true);

-- 4. Seed data: 5 templates mặc định
INSERT INTO task_templates (name, description, category, default_priority, default_duration_days, checklist_items) VALUES
  ('Nhập mủ đợt mới', 'Quy trình nhận mủ từ đại lý', 'production', 'high', 3,
   '[{"title":"Cân xe tại trạm cân"},{"title":"Nhập kho nguyên liệu"},{"title":"QC lấy mẫu DRC"},{"title":"Ghi nhận kết quả vào Deal"},{"title":"Thông báo đại lý"}]'::jsonb),

  ('Bảo trì lò sấy', 'Bảo trì định kỳ lò sấy cao su', 'maintenance', 'high', 2,
   '[{"title":"Tắt lò, chờ nguội"},{"title":"Kiểm tra bộ phận đốt"},{"title":"Vệ sinh buồng sấy"},{"title":"Thay thế linh kiện (nếu cần)"},{"title":"Test chạy thử"},{"title":"Bật lại sản xuất"}]'::jsonb),

  ('QC định kỳ hàng tuần', 'Kiểm tra DRC các lô hàng trong kho', 'qc', 'medium', 1,
   '[{"title":"Lấy mẫu các lô cần tái kiểm"},{"title":"Đo DRC từng lô"},{"title":"Ghi nhận kết quả"},{"title":"Cập nhật batch status"},{"title":"Báo cáo lô cần blend"}]'::jsonb),

  ('Báo cáo sản lượng tuần', 'Tổng hợp sản lượng tuần để báo cáo BGĐ', 'report', 'medium', 1,
   '[{"title":"Thu thập số liệu nhập kho"},{"title":"Thu thập số liệu xuất kho"},{"title":"Tổng hợp sản lượng SX"},{"title":"Review với quản lý"},{"title":"Gửi báo cáo BGĐ"}]'::jsonb),

  ('Kiểm kê kho định kỳ', 'Kiểm kê tồn kho thực tế so với hệ thống', 'inventory', 'high', 2,
   '[{"title":"Chọn kho kiểm kê"},{"title":"Đếm thực tế từng vị trí"},{"title":"So sánh với hệ thống"},{"title":"Điều chỉnh chênh lệch"},{"title":"Duyệt kết quả kiểm kê"}]'::jsonb)
ON CONFLICT DO NOTHING;

-- 5. Verify
SELECT name, category, default_priority, default_duration_days,
       jsonb_array_length(checklist_items) as checklist_count
FROM task_templates ORDER BY created_at;
