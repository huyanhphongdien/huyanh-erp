-- ============================================================================
-- MIGRATION: Business Trip Integration
-- Date: 31/03/2026
-- Phương án C: Dùng leave_requests + thêm trường công tác
-- ============================================================================

-- 1. Thêm loại phép "Công tác" vào leave_types
INSERT INTO leave_types (code, name, description, is_paid, requires_approval, default_days, color, status)
VALUES ('BUSINESS_TRIP', 'Công tác', 'Đi công tác theo yêu cầu công ty', true, true, 365, '#1890ff', 'active')
ON CONFLICT (code) DO NOTHING;

-- 2. Thêm trường công tác cho leave_requests
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS trip_destination VARCHAR(200);
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS trip_purpose TEXT;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS trip_with TEXT;

-- 3. Verify
SELECT id, code, name, color, is_paid FROM leave_types WHERE code = 'BUSINESS_TRIP';
