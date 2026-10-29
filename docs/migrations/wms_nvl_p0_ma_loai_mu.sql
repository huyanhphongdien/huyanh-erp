-- ============================================================
-- KHO NGUYÊN LIỆU MỦ — GĐ0 · P1: MÃ LOẠI MỦ THỐNG NHẤT
-- Ngày: 2026-10-29
-- Phụ thuộc: không (chỉ ĐỌC các bảng đã có nếu tồn tại)
--
-- Vấn đề: cùng một loại mủ đang có 3 cách ghi
--   · weighbridge_tickets / stock_batches / raw_rubber_type: mu_nuoc, mu_dong, mu_tap, mu_chen, mu_to
--   · rubber_intake_batches.rubber_type (thưởng B2B): 'tap' | 'nuoc'
--   · wms.types.ts còn latex / cup_lump / sheet / crepe / mixed
-- Sổ kho khô (GĐ1) sẽ cộng theo loại mủ, nên phải có MỘT mã chuẩn.
--
-- Cách làm: KHÔNG sửa dữ liệu cũ, KHÔNG đổi CHECK của bảng cũ (thưởng B2B vẫn
-- chạy với 'tap'/'nuoc'). Thêm:
--   1. Danh mục raw_rubber_types (mã chuẩn)
--   2. Hàm fn_chuan_hoa_loai_mu(text) → mã chuẩn, dùng trong mọi view của kho NVL
--   3. View kiểm toán v_raw_rubber_type_audit: giá trị gốc → mã chuẩn → số dòng
--
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

-- ─── 1) Danh mục mã chuẩn ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.raw_rubber_types (
  code        text PRIMARY KEY,
  name        text NOT NULL,
  sort_order  int  NOT NULL DEFAULT 0,
  is_raw      boolean NOT NULL DEFAULT true,   -- false = không phải nguyên liệu thô (crepe, hỗn hợp)
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.raw_rubber_types (code, name, sort_order, is_raw, note) VALUES
  ('mu_nuoc', 'Mủ nước', 1, true,  'DRC đo Metrolac tại cân; xuất thẳng dây chuyền mủ nước'),
  ('mu_dong', 'Mủ đông', 2, true,  'DRC sấy mẫu'),
  ('mu_tap',  'Mủ tạp',  3, true,  'DRC sấy mẫu'),
  ('mu_chen', 'Mủ chén', 4, true,  'DRC sấy mẫu; cup_lump cũ'),
  ('mu_to',   'Mủ tờ',   5, true,  'RSS / sheet'),
  ('khac',    'Khác',    9, false, 'crepe, mixed, chưa phân loại — không vào sổ kho khô')
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order,
      is_raw = EXCLUDED.is_raw, note = EXCLUDED.note;

COMMENT ON TABLE public.raw_rubber_types IS
  'Mã loại mủ CHUẨN của kho nguyên liệu. Mọi view/sổ của kho NVL đi qua fn_chuan_hoa_loai_mu().';

ALTER TABLE public.raw_rubber_types ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY rrt_select ON public.raw_rubber_types FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY rrt_write ON public.raw_rubber_types FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id
                    WHERE e.user_id = auth.uid() AND p.level <= 3))
    WITH CHECK (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id
                    WHERE e.user_id = auth.uid() AND p.level <= 3));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2) Hàm chuẩn hóa — nơi DUY NHẤT biết các cách ghi cũ ─────────────────
CREATE OR REPLACE FUNCTION public.fn_chuan_hoa_loai_mu(p text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT CASE lower(trim(coalesce(p, '')))
    WHEN 'mu_nuoc'  THEN 'mu_nuoc'
    WHEN 'nuoc'     THEN 'mu_nuoc'
    WHEN 'latex'    THEN 'mu_nuoc'
    WHEN 'mủ nước'  THEN 'mu_nuoc'
    WHEN 'mu_dong'  THEN 'mu_dong'
    WHEN 'dong'     THEN 'mu_dong'
    WHEN 'mủ đông'  THEN 'mu_dong'
    WHEN 'mu_tap'   THEN 'mu_tap'
    WHEN 'tap'      THEN 'mu_tap'
    WHEN 'mủ tạp'   THEN 'mu_tap'
    WHEN 'mu_chen'  THEN 'mu_chen'
    WHEN 'chen'     THEN 'mu_chen'
    WHEN 'cup_lump' THEN 'mu_chen'
    WHEN 'mủ chén'  THEN 'mu_chen'
    WHEN 'mu_to'    THEN 'mu_to'
    WHEN 'to'       THEN 'mu_to'
    WHEN 'sheet'    THEN 'mu_to'
    WHEN 'mu_rss3'  THEN 'mu_to'
    WHEN 'rss'      THEN 'mu_to'
    WHEN 'mủ tờ'    THEN 'mu_to'
    ELSE 'khac'
  END
$$;

COMMENT ON FUNCTION public.fn_chuan_hoa_loai_mu(text) IS
  'Giá trị loại mủ bất kỳ (mu_*, tap/nuoc, latex/cup_lump/sheet, tiếng Việt) → mã chuẩn raw_rubber_types.code. Không khớp → khac.';

GRANT EXECUTE ON FUNCTION public.fn_chuan_hoa_loai_mu(text) TO authenticated;

-- ─── 3) View kiểm toán: ghép từ những bảng ĐANG CÓ trong DB ────────────────
-- Dựng động để không vỡ nếu một bảng chưa được tạo ở môi trường này.
DO $$
DECLARE
  v_sql text := '';
  v_src record;
BEGIN
  FOR v_src IN
    SELECT * FROM (VALUES
      ('weighbridge_tickets',                  'rubber_type'),
      ('weighbridge_ticket_items',             'rubber_type'),
      ('weighbridge_ticket_lots',              'rubber_type'),
      ('stock_batches',                        'rubber_type'),
      ('rubber_intake_batches',                'rubber_type'),
      ('rubber_intake_batches',                'raw_rubber_type')
    ) AS t(tbl, col)
  LOOP
    IF to_regclass('public.' || v_src.tbl) IS NOT NULL
       AND EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = v_src.tbl AND column_name = v_src.col)
    THEN
      IF v_sql <> '' THEN v_sql := v_sql || ' UNION ALL '; END IF;
      v_sql := v_sql || format(
        'SELECT %L AS bang, %I::text AS gia_tri_goc, public.fn_chuan_hoa_loai_mu(%I::text) AS ma_chuan, count(*)::int AS so_dong FROM public.%I GROUP BY 1, 2',
        v_src.tbl || '.' || v_src.col, v_src.col, v_src.col, v_src.tbl);
    END IF;
  END LOOP;

  IF v_sql = '' THEN
    v_sql := 'SELECT NULL::text AS bang, NULL::text AS gia_tri_goc, NULL::text AS ma_chuan, 0::int AS so_dong WHERE false';
  END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.v_raw_rubber_type_audit AS ' || v_sql;
END $$;

ALTER VIEW public.v_raw_rubber_type_audit SET (security_invoker = on);
GRANT SELECT ON public.v_raw_rubber_type_audit TO authenticated;
GRANT SELECT ON public.raw_rubber_types TO authenticated;

-- ─── KIỂM CHỨNG (gửi lại kết quả) ──────────────────────────────────────────
-- (a) 6 mã chuẩn:
SELECT code, name, is_raw FROM public.raw_rubber_types ORDER BY sort_order;

-- (b) Mọi giá trị đang có trong DB ánh xạ về đâu. Dòng nào ma_chuan = 'khac'
--     mà gia_tri_goc KHÔNG rỗng là giá trị lạ, cần xem tay:
SELECT bang, gia_tri_goc, ma_chuan, so_dong
FROM public.v_raw_rubber_type_audit
ORDER BY (ma_chuan = 'khac') DESC, bang, so_dong DESC;

-- (c) Hàm chuẩn hóa:
SELECT public.fn_chuan_hoa_loai_mu('tap')      AS t1,   -- mu_tap
       public.fn_chuan_hoa_loai_mu('nuoc')     AS t2,   -- mu_nuoc
       public.fn_chuan_hoa_loai_mu('cup_lump') AS t3,   -- mu_chen
       public.fn_chuan_hoa_loai_mu('mu_rss3')  AS t4,   -- mu_to
       public.fn_chuan_hoa_loai_mu(NULL)       AS t5;   -- khac
