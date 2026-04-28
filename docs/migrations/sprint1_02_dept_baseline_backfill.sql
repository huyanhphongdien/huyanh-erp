-- ============================================================
-- SPRINT 1.2 — Backfill department_performance_baseline
-- Ngày: 2026-04-28
-- Mục đích: 8 phòng ban có baseline task/tháng/NV phù hợp,
--   tránh fallback default 10 cứng (gây volume score thấp oan)
-- ============================================================

-- Đảm bảo bảng tồn tại (đã tạo từ trước, chạy CREATE IF NOT EXISTS để idempotent)
CREATE TABLE IF NOT EXISTS department_performance_baseline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID UNIQUE NOT NULL REFERENCES departments(id),
  monthly_task_target INTEGER NOT NULL DEFAULT 10,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bảng đã tồn tại từ trước có thể THIẾU cột description (schema cũ).
-- Thêm column nếu chưa có (idempotent).
ALTER TABLE department_performance_baseline ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE department_performance_baseline ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill 8 phòng (ON CONFLICT update để idempotent)
INSERT INTO department_performance_baseline (department_id, monthly_task_target, description)
VALUES
  ('d0000000-0000-0000-0000-000000000001', 5,  'BGD — task chiến lược, ít số lượng'),
  ('d0000000-0000-0000-0000-000000000002', 8,  'QLSX — sản xuất + bảo trì + xử lý sự cố'),
  ('d0000000-0000-0000-0000-000000000003', 12, 'HCTH — văn thư + hành chính'),
  ('d0000000-0000-0000-0000-000000000004', 15, 'KT — chứng từ + đối chiếu'),
  ('20efb1f7-2a72-4f53-94a5-d513dc9fd756', 10, 'Logistics — xe + giao nhận'),
  ('d0000000-0000-0000-0000-000000000005', 8,  'Thu Mua 1 — đàm phán + đặt hàng'),
  ('d0000000-0000-0000-0000-000000000006', 6,  'R&D — nghiên cứu, ít số lượng'),
  ('d0000000-0000-0000-0000-000000000008', 20, 'QC — kiểm tra nhiều lô')
ON CONFLICT (department_id) DO UPDATE
  SET monthly_task_target = EXCLUDED.monthly_task_target,
      description = EXCLUDED.description,
      updated_at = NOW();

-- Verify
SELECT d.code, d.name, b.monthly_task_target, b.description
FROM department_performance_baseline b
JOIN departments d ON d.id = b.department_id
ORDER BY d.code;
