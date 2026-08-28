-- ============================================================================
-- M3 · P4 — TỒN KG KHÔNG ĐƯỢC NUỐT SỐ
-- Ngày: 28/08/2026
--
-- HAI LỖI CỦA VIEW TỒN, CÙNG MỘT GỐC: NULL LAN RA MÀ KHÔNG AI BIẾT
--
--  (1) `round(sum(nhap_kg) - sum(xuat_kg), 2)` — với mã chưa có cỡ bành trong danh
--      mục thì `xuat_kg` là NULL ở mọi dòng, `sum()` trên toàn NULL trả về NULL, và
--      `số − NULL = NULL`. Tồn kg của mã đó biến mất hoàn toàn, kể cả khi cột NHẬP
--      có số hẳn hoi. Màn hình hiện 0 hoặc trống — trông y như "mã này không có
--      tồn", trong khi sự thật là "máy không tính nổi".
--
--  (2) Ngược lại, khi mã đó có VÀI dòng tính được kg và vài dòng không, `sum()` lặng
--      lẽ bỏ qua dòng NULL và trả về TỔNG CỦA PHẦN CÒN LẠI. Ra một con số trông rất
--      hợp lý, nhỏ hơn sự thật, và không có gì báo là nó thiếu. Đây mới là vế nguy
--      hiểm hơn: (1) chỉ làm mất số, (2) làm SAI số mà vẫn tự tin.
--
-- CÁCH SỬA: cộng bằng COALESCE để không mất số, ĐỒNG THỜI dựng cờ `thieu_kg` để nói
-- thẳng rằng tổng này chưa đầy đủ. Không bao giờ biến "chưa biết" thành một con số mà
-- không kèm lời cảnh báo — đó đúng là cách một sổ kho bắt đầu nói dối.
--
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN/COMMIT (lỗi 0A000).
-- ============================================================================

DROP VIEW IF EXISTS public.v_shift_stock_balance;

CREATE VIEW public.v_shift_stock_balance AS
SELECT
  v.facility_id,
  v.material_id,
  v.sort_order, v.code, v.material_name, v.unit, v.weight_per_unit,
  sum(v.nhap_banh)::int                      AS tong_nhap_banh,
  sum(v.xuat_banh)::int                      AS tong_xuat_banh,
  (sum(v.nhap_banh) - sum(v.xuat_banh))::int AS ton_banh,
  -- COALESCE từng vế: một vế toàn NULL không được phép xoá sổ cả hiệu số.
  round(sum(COALESCE(v.nhap_kg, 0)) - sum(COALESCE(v.xuat_kg, 0)), 2) AS ton_kg,
  -- ⚠ Cờ này là phần QUAN TRỌNG NHẤT của view. `ton_kg` ở trên là tổng của những
  --   dòng tính được; nếu có dòng nào máy không tính nổi kg thì con số đó THIẾU, và
  --   màn hình bắt buộc phải nói ra thay vì hiển thị nó như một con số đầy đủ.
  bool_or(v.nhap_kg IS NULL OR v.xuat_kg IS NULL) AS thieu_kg,
  count(*) FILTER (WHERE v.nhap_kg IS NULL OR v.xuat_kg IS NULL)::int AS so_dong_thieu_kg,
  max(v.report_date)                         AS ngay_gan_nhat
FROM public.v_shift_production_lines v
WHERE v.status = 'received'   -- ⚠ chỉ phiếu đủ ba chữ ký mới được đụng vào tồn kho
GROUP BY v.facility_id, v.material_id, v.sort_order, v.code, v.material_name, v.unit, v.weight_per_unit;

ALTER VIEW public.v_shift_stock_balance SET (security_invoker = on);
GRANT SELECT ON public.v_shift_stock_balance TO authenticated;

-- ─── KIỂM CHỨNG (chạy tay sau khi apply) ───────────────────────────────────
-- a) View đọc được và có 2 cột mới:
--    SELECT count(*) FROM v_shift_stock_balance;                                  -- 0
--    SELECT count(*) FROM information_schema.columns
--     WHERE table_name='v_shift_stock_balance'
--       AND column_name IN ('thieu_kg','so_dong_thieu_kg');                       -- 2
--
-- b) Quyền còn nguyên:
--    SELECT reloptions FROM pg_class WHERE relname='v_shift_stock_balance';       -- {security_invoker=on}
--    SELECT has_table_privilege('authenticated','v_shift_stock_balance','SELECT');-- true
--
-- c) Phép cộng đúng cả khi có dòng thiếu kg — kiểm bằng dữ liệu giả, tự huỷ:
--    (xem khối DO ... RAISE EXCEPTION trong ghi chú kiểm thử của phiên 28/08)
-- ============================================================================
