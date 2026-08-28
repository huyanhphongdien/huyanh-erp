-- ============================================================================
-- M3 · P5 — LUẬT KÝ SỔ CA: AI ĐƯỢC KÝ BƯỚC NÀO
-- Ngày: 28/08/2026
--
-- HIỆN TRẠNG: sổ ca ghi ĐÚNG ai đã ký (submitted_by / qc_confirmed_by /
--   received_by, cả ba đều FK về employees), nhưng KHÔNG chặn ai ĐƯỢC ký.
--   RLS đang là `FOR ALL USING(true) WITH CHECK(true)`, và ba cái nút trên màn hình
--   chỉ hiện/ẩn theo TRẠNG THÁI PHIẾU chứ không theo người. Nghĩa là sản xuất bấm
--   được nút của QC, và bất kỳ ai cũng bấm được bước làm đổi tồn kho.
--
-- VÌ SAO DÙNG TRIGGER CHỨ KHÔNG DÙNG RLS
--   Đây là luật chuyển TRẠNG THÁI, nó cần nhìn ĐỒNG THỜI trạng thái cũ và mới.
--   RLS không làm được: `USING` chỉ thấy dòng CŨ, `WITH CHECK` chỉ thấy dòng MỚI,
--   hai vế không nối được với nhau. Viết bằng RLS thì phải suy ra luật từ hai nửa
--   rời rạc, và cái giá là chặn nhầm: "muốn sửa một phiếu đang ở qc_confirmed thì
--   phải là thủ kho" — chặn luôn cả việc QC sửa lại một con số gõ nhầm.
--   Trigger BEFORE UPDATE thấy cả OLD lẫn NEW, viết đúng được luật thật.
--
--   Tiện thể trigger chặn luôn THỨ TỰ. Trước đây thứ tự chỉ do TypeScript giữ bằng
--   `.eq('status', from)`; gọi thẳng API là nhảy từ draft sang received được.
--
-- MỘT ĐỊNH NGHĨA, HAI NƠI ĐỌC
--   `fn_shift_book_duoc_ky(buoc)` là nơi DUY NHẤT viết luật. Trigger gọi nó để
--   chặn; màn hình gọi `fn_shift_book_quyen()` (cũng gọi lại nó) để ẩn nút. Đúng
--   khuôn "Container đã giao" trong CLAUDE.md: SQL và TypeScript cùng đọc một chỗ.
--   Tiền lệ ngược đang có trong dự án — `isFinanceUser` (TS) và `fn_is_finance_user`
--   (SQL) là hai bản chép tay của cùng một luật, đến mức chú thích ở
--   `financeAccess.ts:32` phải dặn "Phải KHỚP".
--
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có lệnh BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================================

-- ─── 1) Ai là thủ kho — bảng cấp quyền, theo khuôn `purchase_access` ────────
-- ⚠ CỐ Ý KHÔNG nhét email cứng vào TypeScript. Dự án đã trả giá cho lối đó:
--   `SALES_CONFIG` phải sửa 3 nơi mỗi lần thêm một người duyệt, và đã đẻ ra
--   migration tới v20. Thủ kho đổi người là chuyện của nhà máy, không phải chuyện
--   của một lần deploy.
-- ⚠ Cũng CỐ Ý KHÔNG nhận diện thủ kho theo phòng ban như QC: đã dò hết và trong hệ
--   thống KHÔNG có phòng kho, `positions` chỉ có 9 CẤP BẬC (Giám đốc→Thực tập sinh)
--   chứ không có chức danh "Thủ kho", `employees` không có cột chức danh. Không có
--   gì để suy ra, nên phải để nhà máy chỉ đích danh.
CREATE TABLE IF NOT EXISTS public.shift_book_thu_kho (
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

COMMENT ON TABLE public.shift_book_thu_kho IS
  'Ai được ký bước "Thủ kho nhận" của sổ ca ép bành — bước DUY NHẤT làm tồn kho đổi. '
  'facility_id NULL = nhận được ở mọi nhà máy.';

CREATE UNIQUE INDEX IF NOT EXISTS shift_book_thu_kho_uniq
  ON public.shift_book_thu_kho (employee_id, COALESCE(facility_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE is_active;

ALTER TABLE public.shift_book_thu_kho ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY sbtk_select ON public.shift_book_thu_kho FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Chỉ BGĐ cấp/thu quyền — chép đúng vế của purchase_access.
DO $$ BEGIN
  CREATE POLICY sbtk_write ON public.shift_book_thu_kho FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id
                    WHERE e.user_id = auth.uid() AND p.level <= 3))
    WITH CHECK (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id
                    WHERE e.user_id = auth.uid() AND p.level <= 3));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2) LUẬT — nơi DUY NHẤT viết ra ai được ký bước nào ─────────────────────
CREATE OR REPLACE FUNCTION public.fn_shift_book_duoc_ky(p_buoc text, p_facility_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_emp   uuid;
  v_level int;
  v_dept  text;
  v_co_ai boolean;
BEGIN
  -- Gọi bằng service_role / chạy tay trong SQL console thì auth.uid() là NULL.
  -- Đó là khoá quản trị nằm trong .env.local, không phải người dùng — cho qua.
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
    -- BÊN GIAO — người ghi sổ chính là người giao hàng. CỐ Ý KHÔNG siết:
    -- siết bước nhập liệu là chặn đúng chỗ dữ liệu chảy vào, và không ai ghi nữa.
    WHEN 'submit' THEN
      RETURN true;

    -- GIÁM SÁT CHẤT LƯỢNG — phải là Phòng QC. Đây là chữ ký về CHẤT LƯỢNG;
    -- để sản xuất tự ký thay QC thì cả chữ ký đó không còn nghĩa gì.
    -- Nhận diện theo MÃ PHÒNG, đúng khuôn TRANSPORT_DEPTS và isFinanceUser đã dùng.
    WHEN 'qc_confirm' THEN
      RETURN v_dept = 'HAP-QC';

    -- BÊN NHẬN — bước DUY NHẤT làm tồn kho đổi.
    -- ⚠ Khi chưa ai được chỉ định thì MỞ cho mọi người, và màn hình phải nói rõ điều
    --   đó. Đây là lựa chọn có ý thức: nhà máy chưa cho biết ai là thủ kho, mà khoá
    --   cứng lúc này thì không phiếu nào đi hết được ba chữ ký, tồn kho đứng im, và
    --   cả tính năng chết trong lúc chờ một câu trả lời. Chỉ cần chỉ định MỘT người
    --   là vế này siết lại ngay.
    WHEN 'receive' THEN
      SELECT EXISTS (SELECT 1 FROM public.shift_book_thu_kho WHERE is_active) INTO v_co_ai;
      IF NOT v_co_ai THEN RETURN true; END IF;
      RETURN EXISTS (
        SELECT 1 FROM public.shift_book_thu_kho t
         WHERE t.is_active AND t.employee_id = v_emp
           AND (t.facility_id IS NULL OR p_facility_id IS NULL OR t.facility_id = p_facility_id)
      );

    WHEN 'cancel' THEN
      RETURN true;
    ELSE
      RETURN false;
  END CASE;
END $$;

GRANT EXECUTE ON FUNCTION public.fn_shift_book_duoc_ky(text, uuid) TO authenticated;

-- ─── 3) Màn hình đọc CHÍNH luật đó để ẩn nút ───────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_shift_book_quyen(p_facility_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT json_build_object(
    'submit',     public.fn_shift_book_duoc_ky('submit',     p_facility_id),
    'qc_confirm', public.fn_shift_book_duoc_ky('qc_confirm', p_facility_id),
    'receive',    public.fn_shift_book_duoc_ky('receive',    p_facility_id),
    'cancel',     public.fn_shift_book_duoc_ky('cancel',     p_facility_id),
    -- Để màn hình nói thật: bước nhận đang mở vì chưa ai được chỉ định làm thủ kho.
    'chua_chi_dinh_thu_kho', NOT EXISTS (SELECT 1 FROM public.shift_book_thu_kho WHERE is_active)
  )
$$;

GRANT EXECUTE ON FUNCTION public.fn_shift_book_quyen(uuid) TO authenticated;

-- ─── 4) Chốt thật: trigger chặn cả THỨ TỰ lẫn NGƯỜI ────────────────────────
CREATE OR REPLACE FUNCTION public.trg_shift_book_chan_ky()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE v_buoc text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;   -- sửa số liệu, không phải ký — không đụng tới
  END IF;

  v_buoc := CASE
    WHEN OLD.status = 'draft'        AND NEW.status = 'submitted'    THEN 'submit'
    WHEN OLD.status = 'submitted'    AND NEW.status = 'qc_confirmed' THEN 'qc_confirm'
    WHEN OLD.status = 'qc_confirmed' AND NEW.status = 'received'     THEN 'receive'
    WHEN NEW.status = 'cancelled'    AND OLD.status <> 'received'    THEN 'cancel'
    ELSE NULL
  END;

  IF v_buoc IS NULL THEN
    RAISE EXCEPTION 'Phiếu ca không đi được từ "%" sang "%". Ba chữ ký phải đi đúng thứ tự: sản xuất giao → QC xác nhận → thủ kho nhận.',
      OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.fn_shift_book_duoc_ky(v_buoc, NEW.facility_id) THEN
    RAISE EXCEPTION '%', CASE v_buoc
      WHEN 'qc_confirm' THEN 'Chỉ Phòng QC mới xác nhận được chất lượng ca này.'
      WHEN 'receive'    THEN 'Chỉ người được chỉ định làm thủ kho mới nhận hàng vào kho được.'
      ELSE 'Bạn không có quyền thực hiện bước này.'
    END USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_shift_book_chan_ky ON public.shift_production_reports;
CREATE TRIGGER trg_shift_book_chan_ky
  BEFORE UPDATE ON public.shift_production_reports
  FOR EACH ROW EXECUTE FUNCTION public.trg_shift_book_chan_ky();

-- ─── 5) KIỂM CHỨNG (chạy tay sau khi apply) ────────────────────────────────
-- a) Bảng + 2 hàm + trigger tồn tại:
--    SELECT count(*) FROM information_schema.tables WHERE table_name='shift_book_thu_kho';   -- 1
--    SELECT count(*) FROM pg_proc WHERE proname IN
--      ('fn_shift_book_duoc_ky','fn_shift_book_quyen','trg_shift_book_chan_ky');             -- 3
--    SELECT tgname FROM pg_trigger WHERE tgrelid='public.shift_production_reports'::regclass
--      AND NOT tgisinternal;                                                                 -- trg_shift_book_chan_ky
--
-- b) Thứ tự bị chặn (chạy trong DO ... RAISE EXCEPTION để tự rollback):
--    draft -> received phải báo lỗi "không đi được từ".
--
-- c) Chỉ định thủ kho (BGĐ chạy, hoặc chạy tay khi nhà máy cho tên):
--    INSERT INTO public.shift_book_thu_kho (employee_id, notes)
--    SELECT id, 'Thủ kho nhà máy Phong Điền' FROM public.employees WHERE email = '<email>';
--
-- ─── CÒN NỢ ────────────────────────────────────────────────────────────────
-- 1. CHƯA BIẾT AI LÀ THỦ KHO. Đã dò: không có phòng kho trong 8 phòng ban;
--    `positions` chỉ có 9 cấp bậc, không có chức danh "Thủ kho"; `employees` không
--    có cột chức danh; `warehouses` không có cột người phụ trách; các bảng nhập kho
--    đều 0 dòng nên không suy ra được từ hành vi. Phải hỏi nhà máy rồi INSERT theo
--    mục (c) ở trên. Trong lúc chờ, bước "Thủ kho nhận" đang MỞ và màn hình có nói.
-- 2. Bước "submit" cố ý không siết. Nếu sau này muốn siết thì siết theo phòng
--    HAP-QLSX — nhưng lưu ý công nhân ép bành KHÔNG nằm trong bảng employees.
-- ============================================================================
