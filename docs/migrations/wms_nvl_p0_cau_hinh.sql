-- ============================================================
-- KHO NGUYÊN LIỆU MỦ — GĐ0 · P3: NGƯỠNG & CẤU HÌNH THEO NHÀ MÁY
-- Ngày: 2026-10-29
-- Phụ thuộc: facilities (đã có)
--
-- Các ngưỡng mà màn hình và view của kho NVL đọc, KHÔNG gõ cứng trong code.
-- Giá trị khởi tạo = quyết định 2026-10-29 (chủ DN giao tự chọn cho hợp lý):
--   tuoi_lo_canh_bao_ngay      20   mủ đông/tạp/chén quá 20 ngày → cảnh báo, ưu tiên xuất
--   chu_ky_can_lai_ngay         7   cân lại + DRC mỗi 7 ngày (= recheck_interval_days đang dùng ở QC)
--   can_lai_truoc_xuat_ngay     3   trước khi xuất, nếu lần đo gần nhất quá 3 ngày thì cân lại
--   nguong_lech_kho_pct       0,5   lệch kg khô quá 0,5 % → phải ghi nguyên nhân (= ngưỡng chuyển kho liên NM)
--   nguong_lech_drc_ncc_diem    3   DRC thực thấp hơn NCC khai quá 3 điểm → gắn cờ điểm NCC
--   gioi_han_chen_pct          SVR_10/20: 20 %, SVR_3L/L/5: 10 %, SVR_CV50/CV60: 0 %
--   chen_ban_giao_ca          true  hàng chèn dùng dở được bàn giao ca sau (không bắt trả về kho)
--   anh_bat_buoc              toan_canh, man_hinh_can (ảnh 3 bo_sung tùy chọn)
-- Đổi ngưỡng = UPDATE bảng này (BGĐ), không sửa code.
--
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.raw_settings (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id               uuid REFERENCES public.facilities(id),   -- NULL = mặc định toàn công ty
  tuoi_lo_canh_bao_ngay     int           NOT NULL DEFAULT 20,
  chu_ky_can_lai_ngay       int           NOT NULL DEFAULT 7,
  can_lai_truoc_xuat_ngay   int           NOT NULL DEFAULT 3,
  nguong_lech_kho_pct       numeric(5,2)  NOT NULL DEFAULT 0.5,
  nguong_lech_drc_ncc_diem  numeric(5,2)  NOT NULL DEFAULT 3,
  gioi_han_chen_pct         jsonb         NOT NULL DEFAULT
    '{"SVR_10":20,"SVR_20":20,"SVR_3L":10,"SVR_L":10,"SVR_5":10,"SVR_CV50":0,"SVR_CV60":0}'::jsonb,
  chen_ban_giao_ca          boolean       NOT NULL DEFAULT true,
  anh_bat_buoc              jsonb         NOT NULL DEFAULT '["toan_canh","man_hinh_can"]'::jsonb,
  notes                     text,
  updated_by                uuid REFERENCES public.employees(id),
  updated_at                timestamptz   NOT NULL DEFAULT now(),
  created_at                timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT raw_settings_tuoi_chk   CHECK (tuoi_lo_canh_bao_ngay BETWEEN 1 AND 365),
  CONSTRAINT raw_settings_chu_ky_chk CHECK (chu_ky_can_lai_ngay BETWEEN 1 AND 90),
  CONSTRAINT raw_settings_truoc_xuat_chk CHECK (can_lai_truoc_xuat_ngay BETWEEN 0 AND 90),
  CONSTRAINT raw_settings_lech_kho_chk CHECK (nguong_lech_kho_pct > 0 AND nguong_lech_kho_pct <= 20)
);

COMMENT ON TABLE public.raw_settings IS
  'Ngưỡng của kho nguyên liệu mủ theo nhà máy. Dòng facility_id NULL là mặc định; fn_raw_setting() trả dòng nhà máy, không có thì trả mặc định.';

-- Mỗi nhà máy một dòng (NULL gom về một khóa giả để UNIQUE hoạt động)
CREATE UNIQUE INDEX IF NOT EXISTS raw_settings_facility_uniq
  ON public.raw_settings (COALESCE(facility_id, '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE public.raw_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY rs_select ON public.raw_settings FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY rs_write ON public.raw_settings FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id
                    WHERE e.user_id = auth.uid() AND p.level <= 3))
    WITH CHECK (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id
                    WHERE e.user_id = auth.uid() AND p.level <= 3));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- updated_at tự cập nhật
CREATE OR REPLACE FUNCTION public.fn_raw_settings_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS raw_settings_touch ON public.raw_settings;
CREATE TRIGGER raw_settings_touch BEFORE UPDATE ON public.raw_settings
  FOR EACH ROW EXECUTE FUNCTION public.fn_raw_settings_touch();

-- ─── Hàm đọc: dòng của nhà máy, không có thì dòng mặc định ─────────────────
CREATE OR REPLACE FUNCTION public.fn_raw_setting(p_facility_id uuid DEFAULT NULL)
RETURNS public.raw_settings
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.* FROM public.raw_settings s
   WHERE s.facility_id = p_facility_id
      OR (s.facility_id IS NULL)
   ORDER BY (s.facility_id IS NOT NULL) DESC
   LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.fn_raw_setting(uuid) TO authenticated;

-- ─── Khởi tạo: 1 dòng mặc định + 1 dòng cho mỗi nhà máy đang có ────────────
INSERT INTO public.raw_settings (facility_id, notes)
SELECT NULL, 'Mặc định toàn công ty — quyết định 2026-10-29'
 WHERE NOT EXISTS (SELECT 1 FROM public.raw_settings WHERE facility_id IS NULL);

INSERT INTO public.raw_settings (facility_id, notes)
SELECT f.id, 'Khởi tạo bằng mặc định 2026-10-29 cho ' || f.code
  FROM public.facilities f
 WHERE NOT EXISTS (SELECT 1 FROM public.raw_settings s WHERE s.facility_id = f.id);

-- ─── KIỂM CHỨNG (gửi lại kết quả) ──────────────────────────────────────────
-- (a) Mỗi nhà máy một dòng + 1 dòng mặc định, đủ ngưỡng:
SELECT COALESCE(f.code, '(mặc định)') AS nha_may,
       s.tuoi_lo_canh_bao_ngay, s.chu_ky_can_lai_ngay, s.can_lai_truoc_xuat_ngay,
       s.nguong_lech_kho_pct, s.nguong_lech_drc_ncc_diem, s.gioi_han_chen_pct, s.chen_ban_giao_ca, s.anh_bat_buoc
  FROM public.raw_settings s LEFT JOIN public.facilities f ON f.id = s.facility_id
 ORDER BY f.code NULLS FIRST;

-- (b) Hàm đọc theo nhà máy PD và theo NULL đều trả 1 dòng:
SELECT (public.fn_raw_setting((SELECT id FROM public.facilities WHERE code = 'PD'))).tuoi_lo_canh_bao_ngay AS pd_tuoi,
       (public.fn_raw_setting(NULL)).chu_ky_can_lai_ngay AS mac_dinh_chu_ky;
