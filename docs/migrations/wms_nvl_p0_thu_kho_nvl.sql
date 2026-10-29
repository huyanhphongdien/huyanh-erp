-- ============================================================
-- KHO NGUYÊN LIỆU MỦ — GĐ0 · P2: AI LÀ THỦ KHO NVL, AI KÝ BƯỚC NÀO
-- Ngày: 2026-10-29
-- Phụ thuộc: employees, positions, departments (đã có); khuôn chép từ
--            wms_m3_p5_luat_ky_so_ca.sql (shift_book_thu_kho + fn_shift_book_duoc_ky)
--
-- Quyết định chủ doanh nghiệp 2026-10-29: thủ kho NVL hiện tại là
--   Lê Duy Minh (minhld@huyanhrubber.com) cho mọi nhà máy — để audit và test.
--   Khi có thủ kho thật thì BGĐ thêm dòng mới, không sửa code.
--
-- Luật ký của kho NVL (lệnh xuất, phiếu chèn, kiểm kê) — ba chữ ký như sổ ca:
--   submit         bên giao (trưởng ca / người lập)      → ai cũng ký được
--   qc_confirm     giám sát chất lượng                     → phòng HAP-QC
--   receive        thủ kho nhận — BƯỚC DUY NHẤT làm tồn đổi → raw_store_keepers
--   approve_adjust duyệt bút toán điều chỉnh sau kiểm kê   → BGĐ (level ≤ 3)
--   cancel         hủy phiếu chưa nhận                     → ai cũng ký được
-- BGĐ (level ≤ 3) luôn ký được mọi bước để gỡ kẹt.
--
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

-- ─── 1) Bảng thủ kho NVL ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.raw_store_keepers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  facility_id uuid REFERENCES public.facilities(id),   -- NULL = mọi nhà máy
  granted_by  uuid REFERENCES public.employees(id),
  granted_at  timestamptz NOT NULL DEFAULT now(),
  revoked_by  uuid REFERENCES public.employees(id),
  revoked_at  timestamptz,
  is_active   boolean NOT NULL DEFAULT true,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.raw_store_keepers IS
  'Ai được ký bước "thủ kho nhận" của kho nguyên liệu mủ và kho hàng chèn — bước duy nhất làm tồn đổi. facility_id NULL = mọi nhà máy.';

CREATE UNIQUE INDEX IF NOT EXISTS raw_store_keepers_uniq
  ON public.raw_store_keepers (employee_id, COALESCE(facility_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE is_active;

ALTER TABLE public.raw_store_keepers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY rsk_select ON public.raw_store_keepers FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Chỉ BGĐ cấp / thu quyền — đúng vế của shift_book_thu_kho.
DO $$ BEGIN
  CREATE POLICY rsk_write ON public.raw_store_keepers FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id
                    WHERE e.user_id = auth.uid() AND p.level <= 3))
    WITH CHECK (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id
                    WHERE e.user_id = auth.uid() AND p.level <= 3));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2) LUẬT — nơi DUY NHẤT viết ra ai được ký bước nào ─────────────────────
CREATE OR REPLACE FUNCTION public.fn_nvl_duoc_ky(p_buoc text, p_facility_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_emp   uuid;
  v_level int;
  v_dept  text;
  v_co_ai boolean;
BEGIN
  -- Gọi bằng service_role / SQL console: auth.uid() NULL → khoá quản trị, cho qua.
  IF auth.uid() IS NULL THEN RETURN true; END IF;

  SELECT e.id, COALESCE(p.level, 99), upper(COALESCE(d.code, ''))
    INTO v_emp, v_level, v_dept
    FROM public.employees e
    LEFT JOIN public.positions   p ON p.id = e.position_id
    LEFT JOIN public.departments d ON d.id = e.department_id
   WHERE e.user_id = auth.uid();

  IF v_emp IS NULL THEN RETURN false; END IF;   -- đăng nhập nhưng không gắn hồ sơ NV
  IF v_level <= 3 THEN RETURN true; END IF;     -- BGĐ luôn gỡ được thế kẹt

  CASE p_buoc
    WHEN 'submit' THEN
      RETURN true;
    WHEN 'qc_confirm' THEN
      RETURN v_dept = 'HAP-QC';
    WHEN 'receive' THEN
      SELECT EXISTS (SELECT 1 FROM public.raw_store_keepers WHERE is_active) INTO v_co_ai;
      -- Chưa chỉ định ai thì MỞ, màn hình phải nói rõ. Có một người là siết ngay.
      IF NOT v_co_ai THEN RETURN true; END IF;
      RETURN EXISTS (
        SELECT 1 FROM public.raw_store_keepers t
         WHERE t.is_active AND t.employee_id = v_emp
           AND (t.facility_id IS NULL OR p_facility_id IS NULL OR t.facility_id = p_facility_id)
      );
    WHEN 'approve_adjust' THEN
      RETURN false;   -- chỉ BGĐ (đã return true ở trên)
    WHEN 'cancel' THEN
      RETURN true;
    ELSE
      RETURN false;
  END CASE;
END $$;

GRANT EXECUTE ON FUNCTION public.fn_nvl_duoc_ky(text, uuid) TO authenticated;

-- ─── 3) Màn hình đọc CHÍNH luật đó để ẩn / hiện nút ─────────────────────────
CREATE OR REPLACE FUNCTION public.fn_nvl_quyen(p_facility_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_emp   uuid;
  v_level int;
  v_dept  text;
BEGIN
  SELECT e.id, COALESCE(p.level, 99), upper(COALESCE(d.code, ''))
    INTO v_emp, v_level, v_dept
    FROM public.employees e
    LEFT JOIN public.positions   p ON p.id = e.position_id
    LEFT JOIN public.departments d ON d.id = e.department_id
   WHERE e.user_id = auth.uid();

  RETURN json_build_object(
    'submit',         public.fn_nvl_duoc_ky('submit',         p_facility_id),
    'qc_confirm',     public.fn_nvl_duoc_ky('qc_confirm',     p_facility_id),
    'receive',        public.fn_nvl_duoc_ky('receive',        p_facility_id),
    'approve_adjust', public.fn_nvl_duoc_ky('approve_adjust', p_facility_id),
    'cancel',         public.fn_nvl_duoc_ky('cancel',         p_facility_id),
    'la_thu_kho', (v_emp IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.raw_store_keepers t
         WHERE t.is_active AND t.employee_id = v_emp
           AND (t.facility_id IS NULL OR p_facility_id IS NULL OR t.facility_id = p_facility_id))),
    'la_qc',      (v_dept = 'HAP-QC'),
    'la_bgd',     (COALESCE(v_level, 99) <= 3),
    'co_thu_kho', EXISTS (SELECT 1 FROM public.raw_store_keepers WHERE is_active)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.fn_nvl_quyen(uuid) TO authenticated;

-- ─── 4) Chỉ định thủ kho hiện tại: Lê Duy Minh, mọi nhà máy ─────────────────
INSERT INTO public.raw_store_keepers (employee_id, facility_id, granted_by, notes)
SELECT e.id, NULL, e.id,
       'GĐ0 2026-10-29: thủ kho NVL hiện tại để audit & test — quyết định chủ doanh nghiệp'
  FROM public.employees e
 WHERE lower(e.email) = 'minhld@huyanhrubber.com'
   AND NOT EXISTS (
     SELECT 1 FROM public.raw_store_keepers k
      WHERE k.employee_id = e.id AND k.facility_id IS NULL AND k.is_active);

-- ─── KIỂM CHỨNG (gửi lại kết quả) ──────────────────────────────────────────
-- (a) Có đúng 1 thủ kho đang hiệu lực, là Lê Duy Minh, mọi nhà máy:
SELECT k.id, e.full_name, e.email, k.facility_id, k.is_active, k.notes
  FROM public.raw_store_keepers k JOIN public.employees e ON e.id = k.employee_id
 WHERE k.is_active;
--   ⚠ Nếu ra 0 dòng: employees.email của Lê Duy Minh đang NULL hoặc khác —
--   chạy: UPDATE employees e SET email = u.email FROM auth.users u
--         WHERE e.user_id = u.id AND lower(u.email) = 'minhld@huyanhrubber.com';
--   rồi chạy lại khối 4.

-- (b) Quyền của tài khoản đang đăng nhập (chạy trong SQL Editor sẽ thấy
--     auth.uid() NULL → mọi quyền true; kiểm tra thật từ màn hình ở GĐ1):
SELECT public.fn_nvl_quyen(NULL);
