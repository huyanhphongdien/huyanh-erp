-- ============================================================
-- KHO NGUYÊN LIỆU MỦ — GĐ2 · v2: NGƯỜI ĐƯỢC KÝ "GIÁM SÁT CHẤT LƯỢNG" CHO KHO NVL
-- Ngày: 2026-10-30
-- Phụ thuộc: wms_nvl_p0_thu_kho_nvl.sql (fn_nvl_duoc_ky, fn_nvl_quyen, raw_store_keepers)
--
-- Bước qc_confirm (lệnh xuất, phiếu chèn, kiểm kê) hiện chỉ phòng HAP-QC hoặc BGĐ
-- (level ≤ 3) ký được. Chủ DN (Phó phòng, đang là thủ kho để audit & test) cần ký
-- được cả vòng. Thêm bảng raw_qc_signers theo đúng khuôn raw_store_keepers:
-- BGĐ thêm / thu dòng, không sửa code. Phòng HAP-QC vẫn ký được như cũ.
--
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.raw_qc_signers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  facility_id uuid REFERENCES public.facilities(id),   -- NULL = mọi nhà máy
  granted_by  uuid REFERENCES public.employees(id),
  granted_at  timestamptz NOT NULL DEFAULT now(),
  revoked_by  uuid REFERENCES public.employees(id),
  revoked_at  timestamptz,
  is_active   boolean NOT NULL DEFAULT true,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.raw_qc_signers IS
  'Ai được ký bước "giám sát chất lượng" của kho NVL ngoài phòng HAP-QC. facility_id NULL = mọi nhà máy.';

CREATE UNIQUE INDEX IF NOT EXISTS raw_qc_signers_uniq
  ON public.raw_qc_signers (employee_id, COALESCE(facility_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE is_active;

ALTER TABLE public.raw_qc_signers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY rqs_select ON public.raw_qc_signers FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY rqs_write ON public.raw_qc_signers FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id WHERE e.user_id = auth.uid() AND p.level <= 3))
    WITH CHECK (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id WHERE e.user_id = auth.uid() AND p.level <= 3));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Luật ký v2: qc_confirm = HAP-QC HOẶC raw_qc_signers ──────────────────
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
  IF auth.uid() IS NULL THEN RETURN true; END IF;

  SELECT e.id, COALESCE(p.level, 99), upper(COALESCE(d.code, ''))
    INTO v_emp, v_level, v_dept
    FROM public.employees e
    LEFT JOIN public.positions   p ON p.id = e.position_id
    LEFT JOIN public.departments d ON d.id = e.department_id
   WHERE e.user_id = auth.uid();

  IF v_emp IS NULL THEN RETURN false; END IF;
  IF v_level <= 3 THEN RETURN true; END IF;

  CASE p_buoc
    WHEN 'submit' THEN
      RETURN true;
    WHEN 'qc_confirm' THEN
      RETURN v_dept = 'HAP-QC' OR EXISTS (
        SELECT 1 FROM public.raw_qc_signers t
         WHERE t.is_active AND t.employee_id = v_emp
           AND (t.facility_id IS NULL OR p_facility_id IS NULL OR t.facility_id = p_facility_id));
    WHEN 'receive' THEN
      SELECT EXISTS (SELECT 1 FROM public.raw_store_keepers WHERE is_active) INTO v_co_ai;
      IF NOT v_co_ai THEN RETURN true; END IF;
      RETURN EXISTS (
        SELECT 1 FROM public.raw_store_keepers t
         WHERE t.is_active AND t.employee_id = v_emp
           AND (t.facility_id IS NULL OR p_facility_id IS NULL OR t.facility_id = p_facility_id));
    WHEN 'approve_adjust' THEN
      RETURN false;
    WHEN 'cancel' THEN
      RETURN true;
    ELSE
      RETURN false;
  END CASE;
END $$;

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
    'la_qc', (v_dept = 'HAP-QC' OR (v_emp IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.raw_qc_signers t
         WHERE t.is_active AND t.employee_id = v_emp
           AND (t.facility_id IS NULL OR p_facility_id IS NULL OR t.facility_id = p_facility_id)))),
    'la_bgd',     (COALESCE(v_level, 99) <= 3),
    'co_thu_kho', EXISTS (SELECT 1 FROM public.raw_store_keepers WHERE is_active)
  );
END $$;

-- ─── Chỉ định Lê Duy Minh ký QS (audit & test), mọi nhà máy ─────────────────
INSERT INTO public.raw_qc_signers (employee_id, facility_id, granted_by, notes)
SELECT e.id, NULL, e.id, 'GĐ2 2026-10-30: ký QS kho NVL để audit & test — quyết định chủ doanh nghiệp'
  FROM public.employees e
 WHERE lower(e.email) = 'minhld@huyanhrubber.com'
   AND NOT EXISTS (SELECT 1 FROM public.raw_qc_signers q WHERE q.employee_id = e.id AND q.facility_id IS NULL AND q.is_active);

NOTIFY pgrst, 'reload schema';

-- ─── KIỂM CHỨNG ────────────────────────────────────────────────────────────
SELECT e.full_name, e.email, q.facility_id, q.is_active
  FROM public.raw_qc_signers q JOIN public.employees e ON e.id = q.employee_id WHERE q.is_active;   -- 1 dòng: Lê Duy Minh
