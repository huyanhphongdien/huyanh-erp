-- ============================================================================
-- CHẤM CÔNG — ÉP GPS TRÊN ĐIỆN THOẠI, BÁN KÍNH 3 KM (owner chốt 16/09/2026)
-- ============================================================================
-- Luật: điện thoại / tablet PHẢI có toạ độ và nằm trong bán kính nhà máy mới được
-- điểm danh; máy tính (PC/laptop) bỏ qua. Client (attendanceService.checkIn) đã
-- kiểm; trigger này lặp lại luật ở tầng dữ liệu để client sửa/lỗi cũng không lọt.
--
-- Thiết bị lấy từ attendance.check_in_device = "<mobile|tablet|desktop>|<userAgent>"
-- (client ghi). Dòng không có check_in_device (HCNS nhập tay, backfill) → không ép.
--
-- Idempotent. Chạy qua RPC agent_sql: KHÔNG có BEGIN/COMMIT, mỗi statement 1 lần gọi.
-- ============================================================================

-- 1. Bán kính 3 km cho mọi điểm đang cấu hình (trước đây 500 m nhưng chưa bao giờ được kiểm)
UPDATE public.attendance_settings
SET setting_value = jsonb_set(
      setting_value,
      '{locations}',
      (SELECT jsonb_agg(loc || jsonb_build_object('radius_meters', 3000))
       FROM jsonb_array_elements(setting_value->'locations') AS loc)
    ) || '{"enabled": true}'::jsonb,
    updated_at = now()
WHERE setting_key = 'gps_config'
  AND jsonb_typeof(setting_value->'locations') = 'array';

-- 2. Hàm trigger — SECURITY DEFINER để đọc attendance_settings bất kể RLS của người chấm
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
    -- Haversine (m)
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

-- 3. Gắn trigger (BEFORE INSERT — chỉ lúc check-in tạo dòng)
DROP TRIGGER IF EXISTS trg_attendance_enforce_mobile_gps ON public.attendance;

CREATE TRIGGER trg_attendance_enforce_mobile_gps
BEFORE INSERT ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.attendance_enforce_mobile_gps();
