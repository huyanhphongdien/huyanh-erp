-- =====================================================================
-- BƯỚC 1.4 — Bảng báo hỏng máy + RLS + RPC. Đã chạy prod 21/07/2026.
-- anon KHÔNG đọc/ghi trực tiếp bảng — chỉ qua RPC SECURITY DEFINER.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.machine_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid REFERENCES public.equipment(id),
  equipment_code varchar(20) NOT NULL,
  severity varchar(10) NOT NULL CHECK (severity IN ('do','vang')),  -- do=đang dừng, vang=vẫn chạy
  symptom varchar(40), note text,
  photo_urls jsonb DEFAULT '[]', voice_url text,
  reporter_name varchar(100), reporter_employee_id uuid, reporter_ip varchar(64),
  status varchar(20) DEFAULT 'moi' CHECK (status IN ('moi','da_nhan','dang_xu_ly','xong','huy')),
  acked_by uuid, acked_at timestamptz, resolved_by uuid, resolved_at timestamptz,
  confirmed_by_reporter boolean, facility_code varchar(10) DEFAULT 'PD',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_machine_issues_open ON public.machine_issues (status, created_at)
  WHERE status IN ('moi','da_nhan','dang_xu_ly');

CREATE TABLE IF NOT EXISTS public.machine_issue_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid REFERENCES public.machine_issues(id) ON DELETE CASCADE,
  event_type varchar(24) NOT NULL, actor_id uuid, actor_name varchar(100),
  detail text, created_at timestamptz DEFAULT now()
);

-- RLS: authenticated (thợ) đọc + sửa; anon chỉ qua RPC dưới.
ALTER TABLE public.machine_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_issue_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mi_read ON public.machine_issues;
CREATE POLICY mi_read ON public.machine_issues FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS mi_update ON public.machine_issues;
CREATE POLICY mi_update ON public.machine_issues FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS mie_read ON public.machine_issue_events;
CREATE POLICY mie_read ON public.machine_issue_events FOR SELECT TO authenticated USING (true);

-- RPC báo hỏng cho anon (công nhân vận hành KHÔNG có tài khoản) — SECURITY DEFINER.
-- Tự lấy IP thật qua cf-connecting-ip, ghi event 'created'.
CREATE OR REPLACE FUNCTION public.report_machine_issue(
  p_equipment_code varchar, p_severity varchar, p_symptom varchar DEFAULT NULL,
  p_note text DEFAULT NULL, p_photo_urls jsonb DEFAULT '[]', p_reporter_name varchar DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_eq record; v_id uuid;
BEGIN
  IF p_severity NOT IN ('do','vang') THEN RAISE EXCEPTION 'severity phải do|vang'; END IF;
  SELECT id, code, facility_code INTO v_eq FROM public.equipment WHERE code = p_equipment_code AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Máy % không tồn tại', p_equipment_code; END IF;
  INSERT INTO public.machine_issues (equipment_id, equipment_code, severity, symptom, note,
    photo_urls, reporter_name, reporter_ip, facility_code)
  VALUES (v_eq.id, v_eq.code, p_severity, p_symptom, p_note, COALESCE(p_photo_urls,'[]'), p_reporter_name,
    current_setting('request.headers', true)::json ->> 'cf-connecting-ip', COALESCE(v_eq.facility_code,'PD'))
  RETURNING id INTO v_id;
  INSERT INTO public.machine_issue_events (issue_id, event_type, actor_name, detail)
  VALUES (v_id, 'created', p_reporter_name, p_severity || ' · ' || COALESCE(p_symptom,''));
  RETURN v_id;
END $fn$;
GRANT EXECUTE ON FUNCTION public.report_machine_issue(varchar,varchar,varchar,text,jsonb,varchar) TO anon, authenticated;

-- RPC tra trạng thái cho người báo (anon) theo dõi "đã nhận việc chưa" — chỉ trả field an toàn.
CREATE OR REPLACE FUNCTION public.get_issue_status(p_id uuid)
RETURNS TABLE(status varchar, acked_at timestamptz, equipment_code varchar, severity varchar)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  SELECT status, acked_at, equipment_code, severity FROM public.machine_issues WHERE id = p_id
$fn$;
GRANT EXECUTE ON FUNCTION public.get_issue_status(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
