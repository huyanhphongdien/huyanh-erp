-- ============================================================================
-- ĐƠN HÀNG BÁN — P2: nạp dữ liệu lô có sẵn vào sales_order_lots
-- Ngày: 2026-08-26
-- Chạy SAU sales_lots_p1_table.sql
--
-- NGUỒN DUY NHẤT: sales_order_containers (dòng nào có lot_no).
-- Đo thực tế trên production 2026-08-26:
--   • 104 hợp đồng, 42 hợp đồng có container, nhưng CHỈ 9 hợp đồng đánh lot_no
--   • 105 container có lot_no → gom thành 20 lô
--   • 105 container còn lại KHÔNG có lot_no → KHÔNG tự đoán được, bỏ qua (xem cuối file)
--   • cả 20 lô đều có net_weight_kg > 0, và cả 9 hợp đồng đều có unit_price
--     → tính được giá trị lô cho 20/20 lô, không lô nào thiếu mẫu số
--
-- CÔNG THỨC GIÁ TRỊ LÔ = (tổng net_weight_kg của lô / 1000) × unit_price hợp đồng.
--
-- ⚠ TỔNG GIÁ TRỊ CÁC LÔ SẼ KHÔNG BẰNG total_value_usd CỦA HỢP ĐỒNG. Đây KHÔNG phải lỗi:
--   total_value_usd tính theo khối lượng DANH NGHĨA lúc ký (quantity_tons), còn lô tính theo
--   khối lượng THỰC ĐÓNG của container. Ví dụ HA20260056: hợp đồng ghi 342,72 tấn nhưng
--   20 container đóng thật 403,2 tấn. Hoá đơn phát cho khách đi theo số thực, nên số của lô
--   mới là số dùng để đối chiếu thu tiền. Khối VERIFY ở cuối in ra các hợp đồng lệch > 2%
--   để người dùng soi lại, KHÔNG tự sửa gì.
--
-- Idempotent: ON CONFLICT DO NOTHING. Chạy lại chỉ thêm lô mới, không đụng lô đã sửa tay.
--
-- KHÔNG có BEGIN/COMMIT trong file này: nếu chạy qua RPC agent_sql thì cả file đã nằm sẵn
-- trong một transaction, và Postgres báo lỗi 0A000 "EXECUTE of transaction commands is not
-- implemented". Chạy trong SQL Editor của Supabase cũng tự bọc transaction. Muốn chạy bằng
-- psql thì tự thêm BEGIN/COMMIT ở ngoài.
-- ============================================================================

INSERT INTO public.sales_order_lots (
  sales_order_id, lot_no, net_weight_kg, unit_price_usd, value_usd, etd, status, notes
)
SELECT
  c.sales_order_id,
  c.lot_no,
  SUM(c.net_weight_kg)                                            AS net_weight_kg,
  MIN(o.unit_price)                                               AS unit_price_usd,
  ROUND(SUM(c.net_weight_kg) / 1000.0 * MIN(o.unit_price), 2)     AS value_usd,

  -- lot_deadline chỉ có ở 25/105 container. Ở luồng này nó chính là hạn đóng/đi của lô,
  -- nên đưa vào etd; lô nào không có thì để trống.
  MAX(c.lot_deadline)                                             AS etd,

  -- Suy trạng thái lô từ trạng thái hợp đồng. Trong 1 nhóm, o.status là hằng số
  -- (mọi container của nhóm thuộc cùng 1 hợp đồng) nên MIN() chỉ để gom nhóm.
  CASE MIN(o.status)
    WHEN 'confirmed' THEN 'planning'
    WHEN 'producing' THEN 'packing'
    WHEN 'shipped'   THEN 'shipped'
    WHEN 'delivered' THEN 'delivered'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE 'planning'
  END                                                             AS status,

  'Backfill 2026-08-26 từ ' || COUNT(*) || ' container.'          AS notes
FROM public.sales_order_containers c
JOIN public.sales_orders o ON o.id = c.sales_order_id
WHERE c.lot_no IS NOT NULL
  AND c.lot_no > 0                     -- khớp chk_sales_order_lots_lot_no
  AND c.net_weight_kg IS NOT NULL
GROUP BY c.sales_order_id, c.lot_no
HAVING SUM(c.net_weight_kg) > 0
ON CONFLICT (sales_order_id, lot_no) DO NOTHING;

-- ─── VERIFY ──────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_lots int; v_orders int; v_no_value int;
BEGIN
  SELECT count(*), count(DISTINCT sales_order_id), count(*) FILTER (WHERE value_usd IS NULL OR value_usd <= 0)
    INTO v_lots, v_orders, v_no_value
  FROM public.sales_order_lots;

  RAISE NOTICE 'P2: % lô / % hợp đồng; % lô thiếu giá trị', v_lots, v_orders, v_no_value;

  IF v_lots = 0 THEN
    RAISE EXCEPTION 'P2 FAIL: không nạp được lô nào — kiểm tra lại sales_order_containers.lot_no';
  END IF;
  IF v_no_value > 0 THEN
    RAISE WARNING 'P2: % lô không có giá trị USD → không tính được "đã thu đủ chưa" cho các lô đó', v_no_value;
  END IF;
END $$;

-- Đối chiếu tổng giá trị lô với giá trị hợp đồng (chỉ để NGƯỜI xem, không tự sửa).
SELECT
  o.contract_no,
  o.status                                              AS trang_thai_hd,
  count(l.*)                                            AS so_lo,
  o.quantity_tons                                       AS tan_theo_hd,
  ROUND(SUM(l.net_weight_kg) / 1000.0, 3)               AS tan_dong_that,
  o.total_value_usd                                     AS gia_tri_hd,
  SUM(l.value_usd)                                      AS tong_gia_tri_lo,
  ROUND(100.0 * (SUM(l.value_usd) - o.total_value_usd)
        / NULLIF(o.total_value_usd, 0), 1)              AS lech_phan_tram
FROM public.sales_order_lots l
JOIN public.sales_orders o ON o.id = l.sales_order_id
GROUP BY o.id, o.contract_no, o.status, o.quantity_tons, o.total_value_usd
HAVING abs(SUM(l.value_usd) - o.total_value_usd) > 0.02 * NULLIF(o.total_value_usd, 0)
ORDER BY abs(SUM(l.value_usd) - o.total_value_usd) DESC;

-- ─── CÒN LẠI GÌ CHƯA XỬ LÝ ───────────────────────────────────────────────────
-- 105 container KHÔNG có lot_no, thuộc 33 hợp đồng. KHÔNG backfill được:
-- không có căn cứ nào để chia chúng thành lô (không có ngày đóng riêng, không có
-- booking riêng, không có invoice riêng). Đoán bừa = tạo ra lô sai rồi thu tiền sai lô.
-- Cách xử lý đúng: để người làm sale gán lô trên giao diện "Danh sách lô", hoặc chấp nhận
-- các hợp đồng đó theo dõi ở mức hợp đồng như cũ. Xem danh sách bằng:
--
--   SELECT o.contract_no, count(*) AS container_chua_co_lo
--   FROM public.sales_order_containers c
--   JOIN public.sales_orders o ON o.id = c.sales_order_id
--   WHERE c.lot_no IS NULL
--   GROUP BY 1 ORDER BY 2 DESC;
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
--   DELETE FROM public.sales_order_lots WHERE notes LIKE 'Backfill 2026-08-26%';
--   (chỉ xoá đúng dòng do lần backfill này sinh ra, không đụng lô nhập tay sau đó)
