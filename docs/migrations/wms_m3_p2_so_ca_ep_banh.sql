-- ============================================================================
-- M3 · BƯỚC 1 — SỔ CA ÉP BÀNH: mở rộng bảng báo cáo ca + bảng con theo chủng loại
-- File: docs/migrations/wms_m3_p2_so_ca_ep_banh.sql
--
-- Số hoá đúng biểu mẫu CL.BMQT.SX.04.06 (hiệu lực 20/5/2019), không phát minh lại.
-- Bảng `shift_production_reports` đã được ai đó dựng theo đúng biểu mẫu này rồi bỏ dở
-- (24 cột, 0 dòng, có sẵn cả `rejected_bales`). Migration này nối nốt phần còn thiếu.
--
-- BẢNG CŨ THIẾU ĐÚNG HAI CHIỀU:
--   1. Không có CHỦNG LOẠI HÀNG — nó chỉ có 1 dòng mỗi ca (`total_bales`, `passed_bales`,
--      `rejected_bales`), trong khi biểu mẫu có 24 dòng, mỗi dòng nhập/xuất/tồn riêng.
--   2. Không có ba bước ký. Biểu mẫu có sẵn từ 2019: BÊN GIAO (sản xuất) → GIÁM SÁT CHẤT
--      LƯỢNG (QS) → BÊN NHẬN (Thủ kho). Đây là kiểm soát của nhà máy, phần mềm tôn trọng nó.
--
-- NGUYÊN TẮC: TỒN KHÔNG LƯU, TỒN ĐƯỢC TÍNH.
--   Lưu tồn thì sẽ có ngày tồn-lưu và tồn-tính lệch nhau, và lúc đó không ai biết bên nào đúng.
--   Bảng con chỉ giữ SỐ BÀNH. Kilogam cũng được tính (bành × weight_per_unit), CHỈ lưu khi
--   không tính được — đúng một mã: CHÈN chưa ai xác nhận cỡ bành.
--   Quy tắc chung: cái tính được thì tính, cái ngoại lệ thì lưu.
--
-- ⚠ 5 cột `oee_*` của bảng cũ là mơ ước — không có gì trên giấy nuôi chúng. Không dùng, không xoá.
--
-- Idempotent. KHÔNG có BEGIN/COMMIT (chạy qua RPC agent_sql, lỗi 0A000).
-- ============================================================================

-- ─── 1) Bổ sung cột cho bảng báo cáo ca ─────────────────────────────────────
ALTER TABLE public.shift_production_reports
  ADD COLUMN IF NOT EXISTS facility_id      uuid REFERENCES public.facilities(id),
  ADD COLUMN IF NOT EXISTS shift_from       time,
  ADD COLUMN IF NOT EXISTS shift_to         time,
  ADD COLUMN IF NOT EXISTS status           text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS submitted_at     timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_by     uuid REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS qc_confirmed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS qc_confirmed_by  uuid REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS received_at      timestamptz,
  ADD COLUMN IF NOT EXISTS received_by      uuid REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS is_opening       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at       timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.shift_production_reports.status IS
  'draft → submitted (sản xuất giao) → qc_confirmed (QS giám sát) → received (thủ kho nhận). '
  'CHỈ ''received'' mới được tính vào tồn kho — trước đó chỉ là đề nghị.';
COMMENT ON COLUMN public.shift_production_reports.is_opening IS
  'true = phiếu MỞ SỔ, mang tồn đầu kỳ của nhà máy. Mỗi nhà máy đúng 1 phiếu.';

-- Ba bước ký, không có bước nào khác.
DO $$ BEGIN
  ALTER TABLE public.shift_production_reports
    ADD CONSTRAINT spr_status_check
    CHECK (status IN ('draft','submitted','qc_confirmed','received','cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ⚠ `team` đang CHECK chỉ cho 'A','B','C' — nhưng nhà máy ghi tên tổ bằng MÀU:
--   sổ QC ngày 15–24/8 ghi "Ca làm việc: Vàng" và "Đen". Giữ CHECK cũ thì không lưu được
--   đúng thứ người ta viết trên giấy, và người nhập sẽ phải quy đổi trong đầu — chỗ đó sinh lỗi.
--   Nới ra, không bỏ hẳn: vẫn chặn được chuỗi rác dài.
ALTER TABLE public.shift_production_reports DROP CONSTRAINT IF EXISTS shift_production_reports_team_check;
DO $$ BEGIN
  ALTER TABLE public.shift_production_reports
    ADD CONSTRAINT spr_team_check CHECK (team IS NULL OR char_length(team) BETWEEN 1 AND 20);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ⚠ Ràng buộc UNIQUE(report_date, shift, line_id) cũ KHÔNG chặn được trùng: `line_id` để NULL
--   (nhà máy không dùng dây chuyền riêng), mà trong Postgres NULL khác NULL ⇒ hai phiếu cùng
--   ngày cùng ca đều lọt. Thay bằng khoá đúng: mỗi NHÀ MÁY một phiếu cho mỗi ngày × ca.
ALTER TABLE public.shift_production_reports
  DROP CONSTRAINT IF EXISTS shift_production_reports_report_date_shift_line_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS spr_facility_date_shift_uniq
  ON public.shift_production_reports (facility_id, report_date, shift)
  WHERE status <> 'cancelled';

CREATE INDEX IF NOT EXISTS spr_facility_date_idx
  ON public.shift_production_reports (facility_id, report_date DESC);

-- ─── 2) Bảng con: 1 dòng = 1 (ca × chủng loại hàng) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.shift_production_lines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   uuid NOT NULL REFERENCES public.shift_production_reports(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materials(id),

  -- SỐ NGƯỜI GÕ. Đây là toàn bộ dữ liệu mới của một ca — thường 2-4 dòng có số.
  nhap_banh   integer NOT NULL DEFAULT 0,
  xuat_banh   integer NOT NULL DEFAULT 0,

  -- ⚠ CHỈ điền khi KHÔNG tính được từ bành × weight_per_unit — đúng một mã: CHÈN.
  --   Mọi mã khác để NULL và đọc qua view. Điền tay ở mã có cỡ bành là tạo nguồn sự thật thứ hai.
  nhap_kg_manual numeric(14,2),
  xuat_kg_manual numeric(14,2),

  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT spl_report_material_uniq UNIQUE (report_id, material_id),
  CONSTRAINT spl_nonneg CHECK (nhap_banh >= 0 AND xuat_banh >= 0),
  -- Một dòng trống thì đừng lưu. Bắt phải có ít nhất một con số.
  CONSTRAINT spl_khong_rong CHECK (
    nhap_banh > 0 OR xuat_banh > 0 OR nhap_kg_manual IS NOT NULL OR xuat_kg_manual IS NOT NULL
  )
);

COMMENT ON TABLE public.shift_production_lines IS
  'Một dòng = một (ca × chủng loại hàng) trên biểu mẫu CL.BMQT.SX.04.06. '
  'CHỈ lưu số bành. Kilogam và TỒN đều được TÍNH — xem v_shift_production_lines.';

CREATE INDEX IF NOT EXISTS spl_report_idx   ON public.shift_production_lines (report_id);
CREATE INDEX IF NOT EXISTS spl_material_idx ON public.shift_production_lines (material_id);

-- ─── 3) View: kilogam tính từ bành, giữ đúng thứ tự tờ giấy ─────────────────
CREATE OR REPLACE VIEW public.v_shift_production_lines AS
SELECT
  l.id, l.report_id, l.material_id,
  m.sort_order, m.code, m.sku, m.name AS material_name, m.unit, m.weight_per_unit,
  r.facility_id, r.report_date, r.shift, r.status,
  l.nhap_banh, l.xuat_banh,
  -- Quy tắc: tính được thì tính, ngoại lệ thì lấy số đã lưu.
  COALESCE(l.nhap_kg_manual, round(l.nhap_banh * m.weight_per_unit, 2)) AS nhap_kg,
  COALESCE(l.xuat_kg_manual, round(l.xuat_banh * m.weight_per_unit, 2)) AS xuat_kg,
  -- Cờ cho giao diện: dòng nào máy chưa tính được kg thì bắt người nhập tay.
  (m.weight_per_unit IS NULL)                                            AS phai_nhap_kg_tay,
  l.note, l.created_at, l.updated_at
FROM public.shift_production_lines l
JOIN public.materials m ON m.id = l.material_id
JOIN public.shift_production_reports r ON r.id = l.report_id;

ALTER VIEW public.v_shift_production_lines SET (security_invoker = on);
GRANT SELECT ON public.v_shift_production_lines TO authenticated;

-- ─── 4) View: TỒN — cộng dồn từ các phiếu ĐÃ ĐƯỢC THỦ KHO NHẬN ──────────────
-- ⚠ Lọc status='received' là điều quan trọng nhất của view này. Phiếu chưa qua đủ ba chữ ký
--   thì KHÔNG được đụng vào tồn kho — đó là kỷ luật của tờ giấy, không phải lựa chọn kỹ thuật.
CREATE OR REPLACE VIEW public.v_shift_stock_balance AS
SELECT
  v.facility_id,
  v.material_id,
  v.sort_order, v.code, v.material_name, v.unit, v.weight_per_unit,
  sum(v.nhap_banh)::int                      AS tong_nhap_banh,
  sum(v.xuat_banh)::int                      AS tong_xuat_banh,
  (sum(v.nhap_banh) - sum(v.xuat_banh))::int AS ton_banh,
  round(sum(v.nhap_kg) - sum(v.xuat_kg), 2)  AS ton_kg,
  max(v.report_date)                         AS ngay_gan_nhat
FROM public.v_shift_production_lines v
WHERE v.status = 'received'
GROUP BY v.facility_id, v.material_id, v.sort_order, v.code, v.material_name, v.unit, v.weight_per_unit;

ALTER VIEW public.v_shift_stock_balance SET (security_invoker = on);
GRANT SELECT ON public.v_shift_stock_balance TO authenticated;

-- ─── 5) Quyền — theo đúng khuôn 2 policy đang có trên bảng cha ──────────────
ALTER TABLE public.shift_production_lines ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY auth_read_shift_lines  ON public.shift_production_lines FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY auth_write_shift_lines ON public.shift_production_lines FOR ALL    TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 6) KIỂM CHỨNG (chạy tay sau khi apply) ────────────────────────────────
-- a) Bảng con và 2 view tồn tại, đọc được:
--    SELECT count(*) FROM shift_production_lines;                              -- 0
--    SELECT count(*) FROM v_shift_production_lines;                            -- 0
--    SELECT count(*) FROM v_shift_stock_balance;                               -- 0
--
-- b) Cột mới đã có đủ trên bảng cha:
--    SELECT count(*) FROM information_schema.columns
--     WHERE table_name='shift_production_reports'
--       AND column_name IN ('facility_id','status','submitted_at','qc_confirmed_at',
--                           'received_at','is_opening','shift_from','shift_to');  -- 8
--
-- c) Khoá chống trùng phiếu đã đúng (khoá cũ dựa vào line_id NULL nên vô hiệu):
--    SELECT indexdef FROM pg_indexes WHERE indexname='spr_facility_date_shift_uniq';
--
-- d) Tổ ghi bằng tên màu đã lưu được:
--    -- 'Vàng' và 'Đen' phải qua được spr_team_check (độ dài 1..20).
--
-- ─── CÒN NỢ, LÀM Ở BƯỚC SAU ────────────────────────────────────────────────
-- 1. Phiếu MỞ SỔ (is_opening) mang tồn đầu kỳ — chưa có dữ liệu, chờ buổi kiểm kê.
--    Trước khi có nó, v_shift_stock_balance chỉ phản ánh phần phát sinh từ ngày chạy sổ.
-- 2. Cột `xuat_banh` hiện nhập tay. Đúng thiết kế thì XUẤT phải suy từ lệnh điều xe
--    (160/161 dòng đã gắn container) — nối ở M4, đừng để nhập tay vĩnh viễn.
-- 3. `rubberGradeService.ts:141` gõ cứng `Math.floor(weightKg / 33.33)`, không đọc
--    `weight_per_unit` ⇒ 19.600 kg vẫn ra 588 bành thay vì 560. Phải sửa cùng màn hình nhập.
-- 4. 5 cột `oee_*` và `planned_output_kg`/`yield_percent` của bảng cũ: không dùng.
