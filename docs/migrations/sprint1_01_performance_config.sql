-- ============================================================
-- SPRINT 1.1 — Bảng performance_config (config động)
-- Ngày: 2026-04-28
-- Mục đích: HR/BGD chỉnh weight + threshold + baseline qua DB,
--   không cần deploy code.
-- ============================================================

CREATE TABLE IF NOT EXISTS performance_config (
  config_key VARCHAR(100) PRIMARY KEY,
  config_value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES employees(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE performance_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read performance_config" ON performance_config
  FOR SELECT USING (true);

CREATE POLICY "Admin write performance_config" ON performance_config
  FOR ALL USING (true) WITH CHECK (true);

-- 6 config keys mặc định
INSERT INTO performance_config (config_key, config_value, description) VALUES

('formula_weights',
 '{"quality":0.5,"on_time":0.2,"volume":0.2,"difficulty":0.1}'::jsonb,
 'Trọng số 4 thành tố trong final_score (tổng = 1.0)'),

('task_source_weights',
 '{"recurring":0.5,"self":0.5,"assigned":1.0,"project":1.0}'::jsonb,
 'Trọng số task theo nguồn — quality score'),

('difficulty_scores',
 '{"normal":70,"hard":85,"critical":100}'::jsonb,
 'Điểm theo difficulty cho thành tố difficulty_score'),

('grade_thresholds',
 '{"A":90,"B":75,"C":60,"D":40}'::jsonb,
 'Ngưỡng điểm cho grade A/B/C/D/F'),

('attendance_weights',
 '{"base":80,"bonus_full_attendance":10,"bonus_no_late":5,"bonus_overtime_per_hour":1,"bonus_overtime_max":5,"penalty_absent":10,"penalty_late":3,"penalty_late_max":15,"penalty_early_leave":2}'::jsonb,
 'Attendance score 2 chiều. LƯU Ý: bonus_overtime CHỈ tính cho overtime_requests có status=approved (rule policy)'),

('combined_weights',
 '{"task":0.7,"attendance":0.3}'::jsonb,
 'Tỷ trọng kết hợp task_score + attendance_score (combined_score)')

ON CONFLICT (config_key) DO NOTHING;

-- Verify
SELECT config_key, jsonb_pretty(config_value) AS config_value, description
FROM performance_config
ORDER BY config_key;
