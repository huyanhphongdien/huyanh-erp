-- ============================================================
-- HÀNG CHÈN — p24: MỖI MÃ TRONG SỔ PALLET LÀ MỘT LOẠI, GỒM NHIỀU PALLET THẬT (18/11/2026)
--   Sửa lỗi do p22: 5 mã H1, H2, EJ, H3, H4 là 5 LOẠI pallet (mỗi loại có nhiều pallet cùng số kg), nhưng p19→p22
--   coi mỗi dòng sổ là MỘT pallet vật lý nên khoá "một pallet chỉ nằm ở một phiếu đang mở" → chỉ 5 phiếu cùng lúc,
--   lần lấy thứ 6 bị chặn "PALLET_DANG_O_DAY_CHUYEN" — trong khi một ca chèn tới 20 lần.
--   · Bỏ unique index mix_issues_pallet_issued_uniq (1 phiếu / pallet).
--   · fn_mix_pallet_phieu_dang_gan luôn trả NULL → mọi chặn "pallet đang gắn phiếu khác" trong fn_mix_lay / sua_lay /
--     tra / ky / pallet_khai / pallet_tat không bao giờ kích hoạt nữa (nhánh chết, giữ nguyên thân hàm).
--   · v_mix_pallets: trang_thai chỉ còn tat | chua_bi | trong (HẾT 'day_chuyen'); thêm so_phieu_dang_dung = số phiếu đang
--     mở dùng loại đó (chỉ để xem). issue_* vẫn là phiếu gần nhất (chỉ để xem).
--   Bì vẫn CHỐT vào phiếu lúc lấy (mix_issues.pallet_kg) nên đổi số kg của loại sau này không đụng phiếu đang mở.
-- ⚠ agent_sql: KHÔNG BEGIN/COMMIT. Idempotent.
-- ============================================================

DROP INDEX IF EXISTS public.mix_issues_pallet_issued_uniq;

CREATE OR REPLACE FUNCTION public.fn_mix_pallet_phieu_dang_gan(p_pallet_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NULL::uuid
$$;
COMMENT ON FUNCTION public.fn_mix_pallet_phieu_dang_gan(uuid) IS
  'p24 (18/11/2026): luôn NULL — mã trong Sổ pallet là LOẠI pallet (nhiều pallet thật), không khoá một phiếu / mã. Giữ hàm để các hàm cũ gọi vẫn chạy.';

DROP VIEW IF EXISTS public.v_mix_pallets;
CREATE VIEW public.v_mix_pallets AS
SELECT p.*,
       f.code AS facility_code,
       e.full_name AS bi_khai_name,
       CASE WHEN NOT p.is_active THEN 'tat'::text
            WHEN p.bi_kg IS NULL THEN 'chua_bi'::text
            ELSE 'trong'::text END AS trang_thai,
       x.id AS issue_id, x.code AS issue_code, x.kg_out AS issue_kg_out, x.out_at AS issue_out_at,
       x.status AS issue_status, x.vi_tri AS issue_vi_tri,
       l.so_lo AS issue_lot_so_lo, l.code AS issue_lot_code, g.ma_gop AS issue_lenh_ma_gop,
       CASE WHEN p.bi_khai_at IS NULL THEN NULL::integer ELSE CURRENT_DATE - p.bi_khai_at::date END AS bi_cu_ngay,
       (SELECT count(*) FROM public.mix_pallet_logs lg WHERE lg.pallet_id = p.id AND lg.loai = 'can_lai')::integer AS so_lan_can_lai,
       COALESCE(n.so, 0) AS so_phieu_dang_dung
  FROM public.mix_pallets p
  LEFT JOIN public.facilities f ON f.id = p.facility_id
  LEFT JOIN public.employees e ON e.id = p.bi_khai_by
  LEFT JOIN LATERAL (
        SELECT i.id, i.code, i.kg_out, i.out_at, i.status, i.vi_tri, i.mix_lot_id, i.lenh_id
          FROM public.mix_issues i
         WHERE i.pallet_id = p.id
           AND (i.status = 'issued' OR (i.handover_to_next AND i.status IN ('returned', 'submitted', 'qc_confirmed')))
         ORDER BY i.out_at DESC LIMIT 1) x ON true
  LEFT JOIN LATERAL (
        SELECT count(*)::integer AS so
          FROM public.mix_issues i
         WHERE i.pallet_id = p.id
           AND (i.status = 'issued' OR (i.handover_to_next AND i.status IN ('returned', 'submitted', 'qc_confirmed')))) n ON true
  LEFT JOIN public.mix_lots l ON l.id = x.mix_lot_id
  LEFT JOIN public.nvl_lenh_chay g ON g.id = x.lenh_id;
ALTER VIEW public.v_mix_pallets SET (security_invoker = on);
GRANT SELECT ON public.v_mix_pallets TO authenticated;

COMMENT ON TABLE public.mix_pallets IS 'Sổ pallet hàng chèn: mỗi dòng là một LOẠI pallet (mã H1, H2, EJ, H3, H4 — mỗi loại gồm nhiều pallet thật cùng số kg bì). p19/p20/p22/p24.';

NOTIFY pgrst, 'reload schema';

-- ─── KIỂM CHỨNG ────────────────────────────────────────────────────────────
SELECT (SELECT count(*) FROM pg_indexes WHERE indexname = 'mix_issues_pallet_issued_uniq') AS index_phai_la_0,
       (SELECT public.fn_mix_pallet_phieu_dang_gan(id) IS NULL FROM public.mix_pallets LIMIT 1) AS ham_phai_la_true,
       (SELECT count(*) FROM public.v_mix_pallets) AS so_dong_view,
       (SELECT count(*) FROM public.v_mix_pallets WHERE trang_thai = 'day_chuyen') AS day_chuyen_phai_la_0,
       (SELECT count(*) FROM information_schema.columns WHERE table_name = 'v_mix_pallets' AND column_name = 'so_phieu_dang_dung') AS cot_moi_phai_la_1;
