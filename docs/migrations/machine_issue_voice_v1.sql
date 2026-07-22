-- =====================================================================
-- Báo hỏng máy: thêm GHI ÂM (voice) — cột machine_issues.voice_url đã có sẵn,
-- chỉ thiếu đường truyền qua RPC.
-- Thêm tham số p_voice_url (DEFAULT NULL) → chỗ gọi cũ 6 tham số vẫn chạy.
-- DROP rồi CREATE để KHÔNG tạo overload gây "function is not unique".
-- =====================================================================

DROP FUNCTION IF EXISTS public.report_machine_issue(
  character varying, character varying, character varying, text, jsonb, character varying);

CREATE OR REPLACE FUNCTION public.report_machine_issue(
  p_equipment_code character varying,
  p_severity       character varying,
  p_symptom        character varying DEFAULT NULL::character varying,
  p_note           text              DEFAULT NULL::text,
  p_photo_urls     jsonb             DEFAULT '[]'::jsonb,
  p_reporter_name  character varying DEFAULT NULL::character varying,
  p_voice_url      text              DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_eq record; v_id uuid;
BEGIN
  IF p_severity NOT IN ('do','vang') THEN RAISE EXCEPTION 'severity phải do|vang'; END IF;
  SELECT id, code, facility_code INTO v_eq FROM public.equipment WHERE code = p_equipment_code AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Máy % không tồn tại', p_equipment_code; END IF;

  INSERT INTO public.machine_issues (equipment_id, equipment_code, severity, symptom, note,
    photo_urls, voice_url, reporter_name, reporter_ip, facility_code)
  VALUES (v_eq.id, v_eq.code, p_severity, p_symptom, p_note, COALESCE(p_photo_urls,'[]'),
    p_voice_url,
    p_reporter_name,
    current_setting('request.headers', true)::json ->> 'cf-connecting-ip',
    COALESCE(v_eq.facility_code,'PD'))
  RETURNING id INTO v_id;

  INSERT INTO public.machine_issue_events (issue_id, event_type, actor_name, detail)
  VALUES (v_id, 'created', p_reporter_name,
    p_severity || ' · ' || COALESCE(p_symptom,'') || CASE WHEN p_voice_url IS NOT NULL THEN ' · có ghi âm' ELSE '' END);

  RETURN v_id;
END $function$;

GRANT EXECUTE ON FUNCTION public.report_machine_issue(
  character varying, character varying, character varying, text, jsonb, character varying, text)
  TO anon, authenticated;
