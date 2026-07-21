-- =====================================================================
-- device_tokens — lưu FCM token cho app thông báo (GĐ 2). Đã chạy prod 21/07.
-- Chép mẫu từ b2b_push_tokens (cổng đại lý), khoá theo employee_id thay partner_id.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform varchar(12) DEFAULT 'android',
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE (employee_id, platform)
);
CREATE INDEX IF NOT EXISTS idx_device_tokens_emp ON public.device_tokens(employee_id);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dt_self ON public.device_tokens;
-- Mỗi người chỉ ghi/đọc token của chính mình
CREATE POLICY dt_self ON public.device_tokens FOR ALL TO authenticated
  USING (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()))
  WITH CHECK (employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid()));

NOTIFY pgrst, 'reload schema';
