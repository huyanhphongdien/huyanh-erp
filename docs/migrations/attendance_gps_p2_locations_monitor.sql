-- ============================================================================
-- CHẤM CÔNG GPS — ĐỢT 2: thêm điểm Tân Lâm / Lào, log lượt bị chặn, ghi IP (16/09/2026)
-- ============================================================================
-- Owner: "không để ngoại lệ, vẫn note Tân Lâm và Lào để theo dõi".
--  1. Thêm điểm cho phép: Nhà máy Huy Anh Quảng Trị (Tân Lâm) — toạ độ đo từ 30+ lượt chấm
--     thật của 4 nhân viên QLSX (03–09/2026), tâm 16.7896, 106.9556. Lào: chờ owner cho toạ độ
--     (statement để sẵn ở cuối, hiện comment).
--  2. Bảng attendance_gps_rejections: mỗi lượt điện thoại bị chặn (không toạ độ / ngoài phạm vi
--     / DB chặn) → HCNS xem ở /attendance/gps-monitor.
--  3. Ghi IP client (x-forwarded-for do PostgREST truyền) vào attendance.check_in_ip và
--     rejections.ip — để sau này siết máy tính theo IP nhà máy nếu cần.
-- Idempotent. Chạy qua RPC agent_sql: KHÔNG BEGIN/COMMIT, mỗi statement 1 lần gọi.
-- ============================================================================

-- 1a. Điểm Tân Lâm (chỉ thêm nếu chưa có)
UPDATE public.attendance_settings
SET setting_value = jsonb_set(
      setting_value, '{locations}',
      (setting_value->'locations') || '[{"name":"Nhà máy Huy Anh Quảng Trị (Tân Lâm)","latitude":16.7896,"longitude":106.9556,"radius_meters":3000}]'::jsonb
    ),
    updated_at = now()
WHERE setting_key = 'gps_config'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(setting_value->'locations') l
    WHERE l->>'name' ILIKE '%Tân Lâm%' OR l->>'name' ILIKE '%Quảng Trị%'
  );

-- 2a. Hàm lấy IP client từ header PostgREST (NULL nếu không có / gọi ngoài PostgREST)
CREATE OR REPLACE FUNCTION public.request_client_ip()
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  h  text;
  ip text;
BEGIN
  h := current_setting('request.headers', true);
  IF h IS NULL OR h = '' THEN
    RETURN NULL;
  END IF;
  ip := split_part(COALESCE((h::json->>'x-forwarded-for'), ''), ',', 1);
  RETURN NULLIF(trim(ip), '');
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END
$$;

-- 2b. Bảng log lượt bị chặn
CREATE TABLE IF NOT EXISTS public.attendance_gps_rejections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  attempted_at  timestamptz NOT NULL DEFAULT now(),
  lat           numeric,
  lng           numeric,
  accuracy_m    numeric,
  distance_m    numeric,
  nearest_name  text,
  radius_m      numeric,
  device        text,
  ip            text DEFAULT public.request_client_ip(),
  reason        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_gps_rejections_attempted_idx
  ON public.attendance_gps_rejections (attempted_at DESC);

ALTER TABLE public.attendance_gps_rejections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gps_rejections_insert_self" ON public.attendance_gps_rejections;
CREATE POLICY "gps_rejections_insert_self" ON public.attendance_gps_rejections
  FOR INSERT TO authenticated
  WITH CHECK (employee_id = public.current_employee_id());

DROP POLICY IF EXISTS "gps_rejections_select_all" ON public.attendance_gps_rejections;
CREATE POLICY "gps_rejections_select_all" ON public.attendance_gps_rejections
  FOR SELECT TO authenticated
  USING (true);

-- 3. Trigger chấm công: ghi IP + luật GPS điện thoại (thay bản p1, giữ nguyên luật)
CREATE OR REPLACE FUNCTION public.attendance_enforce_mobile_gps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg          jsonb;
  loc          jsonb;
  dist_m       double precision;
  radius_m     double precision;
  in_range     boolean := false;
  nearest_m    double precision;
  nearest_name text;
  nearest_r    double precision;
BEGIN
  -- IP client (để theo dõi; máy tính sau này có thể siết theo IP nhà máy)
  IF NEW.check_in_ip IS NULL THEN
    NEW.check_in_ip := public.request_client_ip();
  END IF;

  -- Chỉ ép với thiết bị di động do client khai; máy tính / nhập tay → cho qua
  IF NEW.check_in_device IS NULL OR NEW.check_in_device !~* '^(mobile|tablet)' THEN
    RETURN NEW;
  END IF;

  SELECT setting_value INTO cfg
  FROM public.attendance_settings
  WHERE setting_key = 'gps_config';

  IF cfg IS NULL
     OR COALESCE((cfg->>'enabled')::boolean, false) = false
     OR jsonb_typeof(cfg->'locations') <> 'array' THEN
    RETURN NEW;
  END IF;

  IF NEW.check_in_lat IS NULL OR NEW.check_in_lng IS NULL THEN
    RAISE EXCEPTION 'Điện thoại phải bật định vị (GPS) mới được điểm danh'
      USING ERRCODE = 'P0001';
  END IF;

  FOR loc IN SELECT * FROM jsonb_array_elements(cfg->'locations') LOOP
    radius_m := COALESCE((loc->>'radius_meters')::double precision, 3000);
    dist_m := 2 * 6371000 * asin(sqrt(
        power(sin(radians((loc->>'latitude')::double precision - NEW.check_in_lat::double precision) / 2), 2)
      + cos(radians(NEW.check_in_lat::double precision))
        * cos(radians((loc->>'latitude')::double precision))
        * power(sin(radians((loc->>'longitude')::double precision - NEW.check_in_lng::double precision) / 2), 2)
    ));
    IF dist_m <= radius_m THEN
      in_range := true;
    END IF;
    IF nearest_m IS NULL OR dist_m < nearest_m THEN
      nearest_m := dist_m;
      nearest_name := loc->>'name';
      nearest_r := radius_m;
    END IF;
  END LOOP;

  IF NOT in_range THEN
    RAISE EXCEPTION 'Ngoài phạm vi điểm danh: cách % %, chỉ được trong % m',
      nearest_name, round(nearest_m)::int || ' m', round(nearest_r)::int
      USING ERRCODE = 'P0001';
  END IF;

  NEW.is_gps_verified := true;
  RETURN NEW;
END
$$;

-- (trigger trg_attendance_enforce_mobile_gps đã gắn ở p1; CREATE OR REPLACE hàm là đủ)

-- 1b. Điểm Lào — CHỜ toạ độ từ owner. Khi có, thay LAT/LNG rồi chạy (idempotent theo tên):
-- UPDATE public.attendance_settings
-- SET setting_value = jsonb_set(setting_value, '{locations}',
--       (setting_value->'locations') || '[{"name":"Nhà máy Huy Anh Lào","latitude":LAT,"longitude":LNG,"radius_meters":3000}]'::jsonb),
--     updated_at = now()
-- WHERE setting_key = 'gps_config'
--   AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(setting_value->'locations') l WHERE l->>'name' ILIKE '%Lào%');
