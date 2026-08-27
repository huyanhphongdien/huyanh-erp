-- ============================================================================
-- ĐƠN HÀNG BÁN — P5: tiến độ giao ở mức LÔ cho MỌI container, kể cả chưa gán lô
-- Ngày: 2026-08-26
-- Chạy SAU p1..p4
--
-- VÌ SAO: p4 chỉ phủ container ĐÃ gán lot_no, đủ cho Sổ lô nhưng KHÔNG đủ để thay thế
-- dispatchService.getLotProgressForOrders — hàm đó cần cả container chưa gán lô
-- (107/210 cont hôm nay) để ra contsTotal / plannedKg đúng ở mức ĐƠN.
--
-- Hàm hiện tại chạy 3 vòng gọi mạng NỐI TIẾP, mỗi vòng lại chunk: container →
-- dòng lệnh xe → mã lệnh. Đưa xuống DB thì còn 2 truy vấn chạy SONG SONG.
--
-- ⚠ P5 NỚI RỘNG LUẬT CỦA P4, KHÔNG CHỈ ĐỔI CHỖ TÍNH:
--   p4 cũ:  c.status = 'shipped'
--   p5 nay: c.status IN ('shipped', 'delivered')
-- Cột của v_sales_order_lot_progress giữ NGUYÊN tên/kiểu/thứ tự, nhưng NGỮ NGHĨA có đổi.
-- Hôm nay tác động = 0 (sales_order_containers chỉ có 'planning' và 'shipped', 0 dòng
-- 'delivered'), nhưng CHECK constraint cho phép giá trị đó nên mai kia là có.
--
-- ⚠ DANH SÁCH TRẠNG THÁI NÀY TỒN TẠI Ở HAI NƠI:
--   • chuỗi gõ cứng trong view bên dưới
--   • hằng DELIVERED_CONTAINER_STATUSES trong src/services/logistics/dispatchService.ts
-- Sửa một bên mà quên bên kia là badge Kanban và tab Đóng gói nói khác nhau.
--
-- ⚠ PHẢI DÙNG `EXISTS`, KHÔNG ĐƯỢC JOIN dispatch_order_lines rồi count.
-- Đo 26/08/2026: 160 dòng lệnh trên 158 container phân biệt — có container mang 2 dòng
-- lệnh, JOIN sẽ đếm nó hai lần và thổi phồng cả số container lẫn số kg.
--
-- ⚠ VIEW NÀY CHỈ DÙNG CHO ERP ĐÃ ĐĂNG NHẬP. Các bảng nền chỉ có policy cho
-- `authenticated`; đọc bằng khoá anon sẽ ra 0 DÒNG, KHÔNG BÁO LỖI.
--
-- Idempotent (CREATE OR REPLACE).
-- ============================================================================

-- ─── 1) Nguồn sự thật DUY NHẤT: mọi container, gom theo (đơn, lô) ────────────
-- lot_no NULL = rổ "chưa gán lô". Có rổ này thì bất biến tự phát biểu:
--   Σ container_count (mọi rổ của đơn) = tổng container của đơn
CREATE OR REPLACE VIEW public.v_sales_order_lot_progress_all AS
WITH cont AS (
  SELECT
    c.id,
    c.sales_order_id,
    c.lot_no,
    c.net_weight_kg,
    (
      -- Vế 1: hàng đi bằng phiếu cân/xuất kho, không sinh dòng lệnh điều động.
      -- Danh sách này phải khớp DELIVERED_CONTAINER_STATUSES trong dispatchService.ts.
      -- 'loaded' KHÔNG tính: mới lên xe, chưa rời kho.
      c.status IN ('shipped', 'delivered')
      -- Vế 2: đã cân xuất theo lệnh điều động.
      OR EXISTS (
        SELECT 1 FROM public.dispatch_order_lines dl
        WHERE dl.sales_order_container_id = c.id
          AND dl.actual_weight_kg IS NOT NULL
      )
    ) AS delivered
  FROM public.sales_order_containers c
)
SELECT
  sales_order_id,
  lot_no,
  count(*)::int                                                          AS container_count,
  count(*) FILTER (WHERE delivered)::int                                 AS containers_delivered,
  COALESCE(sum(net_weight_kg), 0)::numeric(14,2)                         AS net_kg_total,
  COALESCE(sum(net_weight_kg) FILTER (WHERE delivered), 0)::numeric(14,2) AS net_kg_delivered,
  count(*) FILTER (WHERE net_weight_kg IS NOT NULL)::int                 AS conts_with_kg,
  count(*) FILTER (WHERE delivered AND net_weight_kg IS NULL)::int       AS delivered_conts_no_kg,
  CASE
    WHEN count(*) FILTER (WHERE delivered) = 0        THEN 'none'
    WHEN count(*) FILTER (WHERE delivered) < count(*) THEN 'partial'
    ELSE 'full'
  END                                                                    AS delivery_state
FROM cont
GROUP BY sales_order_id, lot_no;

ALTER VIEW public.v_sales_order_lot_progress_all SET (security_invoker = on);

COMMENT ON VIEW public.v_sales_order_lot_progress_all IS
  'Tiến độ GIAO của mọi container, gom theo (sales_order_id, lot_no). '
  'lot_no NULL = rổ container chưa gán lô. Nguồn sự thật duy nhất cho "đã giao".';

-- ─── 2) View p4 định nghĩa lại từ view trên — không còn hai nơi tính ─────────
-- Giữ NGUYÊN tên/kiểu/thứ tự cột để v_sales_order_lot_payments không gãy.
CREATE OR REPLACE VIEW public.v_sales_order_lot_progress AS
SELECT
  sales_order_id,
  lot_no,
  container_count,
  containers_delivered,
  net_kg_total,
  net_kg_delivered,
  delivery_state
FROM public.v_sales_order_lot_progress_all
WHERE lot_no IS NOT NULL;

ALTER VIEW public.v_sales_order_lot_progress SET (security_invoker = on);

-- ─── 3) Mã lệnh điều động của từng đơn ───────────────────────────────────────
-- Trước đây phải 1 vòng gọi mạng riêng SAU khi đã có id container. Ở đây gộp sẵn
-- để client đọc SONG SONG với view trên, không còn phụ thuộc nối tiếp.
CREATE OR REPLACE VIEW public.v_sales_order_dispatch_codes AS
SELECT
  t.sales_order_id,
  jsonb_agg(jsonb_build_object('id', t.id, 'code', t.code) ORDER BY t.code) AS dispatch_orders
FROM (
  SELECT DISTINCT c.sales_order_id, d.id, d.code
  FROM public.sales_order_containers c
  JOIN public.dispatch_order_lines dl ON dl.sales_order_container_id = c.id
  JOIN public.dispatch_orders d       ON d.id = dl.dispatch_order_id
  WHERE d.code IS NOT NULL
) t
GROUP BY t.sales_order_id;

ALTER VIEW public.v_sales_order_dispatch_codes SET (security_invoker = on);

COMMENT ON VIEW public.v_sales_order_dispatch_codes IS
  'Mã lệnh điều động đã chở container của từng đơn, dạng mảng jsonb [{id, code}] sắp theo code.';

GRANT SELECT ON public.v_sales_order_lot_progress_all TO authenticated;
GRANT SELECT ON public.v_sales_order_lot_progress     TO authenticated;
GRANT SELECT ON public.v_sales_order_dispatch_codes   TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ─── VERIFY ──────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_cont_view int; v_cont_bang int; v_kg_view numeric; v_kg_bang numeric;
BEGIN
  SELECT sum(container_count), sum(net_kg_total)
    INTO v_cont_view, v_kg_view
  FROM public.v_sales_order_lot_progress_all;

  SELECT count(*), COALESCE(sum(net_weight_kg), 0)
    INTO v_cont_bang, v_kg_bang
  FROM public.sales_order_containers;

  IF v_cont_view <> v_cont_bang THEN
    RAISE EXCEPTION 'P5 FAIL: view đếm % container, bảng có % — mất hoặc nhân đôi dòng',
      v_cont_view, v_cont_bang;
  END IF;
  IF abs(v_kg_view - v_kg_bang) > 0.01 THEN
    RAISE EXCEPTION 'P5 FAIL: view cộng % kg, bảng có % kg', v_kg_view, v_kg_bang;
  END IF;

  RAISE NOTICE 'P5 OK — % container / % kg, không mất không nhân đôi', v_cont_view, v_kg_view;
END $$;

-- Bất biến: p4 phải là tập con đúng của p5 (chỉ khác ở rổ lot_no NULL)
SELECT
  (SELECT count(*) FROM public.v_sales_order_lot_progress_all)                       AS ro_tat_ca,
  (SELECT count(*) FROM public.v_sales_order_lot_progress_all WHERE lot_no IS NULL)  AS ro_chua_gan_lo,
  (SELECT count(*) FROM public.v_sales_order_lot_progress)                           AS ro_co_lo,
  (SELECT count(*) FROM public.v_sales_order_dispatch_codes)                         AS don_co_lenh_xe;

-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
--   ⚠ Chạy lại p4 sẽ ÂM THẦM thu luật về chỉ còn 'shipped' — không lỗi, không cảnh báo,
--   chỉ là container mang status 'delivered' thôi được tính là đã giao. Nếu lúc đó đã có
--   dòng như vậy thì Sổ lô và badge Kanban tụt số mà không ai biết vì sao.
--
--   Chạy lại docs/migrations/sales_lots_p4_delivery.sql để dựng lại
--   v_sales_order_lot_progress theo bản cũ (tự tính, không đọc view _all), rồi:
--   DROP VIEW IF EXISTS public.v_sales_order_dispatch_codes;
--   DROP VIEW IF EXISTS public.v_sales_order_lot_progress_all;
--   (P5 KHÔNG đụng bảng nào có dữ liệu — rollback sạch.)
