-- ============================================================================
-- MỘT ĐỊNH NGHĨA DUY NHẤT CHO "CONTAINER ĐÃ GIAO"
-- File: docs/migrations/sales_lots_p8_one_delivery_definition.sql
--
-- VÌ SAO CÓ FILE NÀY
-- Từ Đợt 2 tới nay luật "đã giao" sống ở HAI nơi không gộp được, và trong mã có sẵn
-- một lời cảnh báo dài về chuyện đó (dispatchService.ts, DELIVERED_CONTAINER_STATUSES):
--   1. TypeScript — getDeliveryStatus(): đọc dispatch_order_lines rồi hợp với status.
--   2. SQL — v_sales_order_lot_progress_all: cùng luật, gõ lại bằng tay.
-- Hai bản chép tay cùng một luật thì sớm muộn cũng lệch. File này biến nó thành MỘT
-- view, cả hai phía cùng đọc, nên không còn gì để chép.
--
-- ĐỒNG THỜI SỬA MỘT LỖI THẬT
-- Cả hai bản đều tính "đã cân xuất" = `dispatch_order_lines.actual_weight_kg IS NOT NULL`
-- mà KHÔNG hỏi dòng lệnh đó thuộc lệnh nào. Lệnh còn ở trạng thái 'draft' vẫn có số cân.
-- Bằng chứng sống (đo 27/08/2026): lệnh LDD-2608-011 status='draft', hai dòng đã mang
-- 20.450 kg, và hai container đó thuộc SO-2026-0091 lô 1 — nên lô đó đang hiện "5/5 giao
-- xong" trên Kanban, Sổ lô, tab Đóng gói và file Excel, trong khi thật ra mới đi 3/5.
-- Trị giá lô: $223.776.
--
--   Toàn hệ thống: 137 container đang được tính là đã giao → đúng phải là 129.
--   Chênh 8 container, tất cả nằm trên 16 lệnh 'draft'.
--   Chỉ DUY NHẤT lô SO-2026-0091 lô 1 đổi kết luận (5/5 → 3/5).
--
-- ⚠ 'draft' là trạng thái DUY NHẤT bị loại. 'dispatched' và 'completed' đều tính là đã
--   phát hành. Đếm hôm nay: dispatched 93 · completed 5 · draft 16.
--
-- Idempotent (CREATE OR REPLACE). KHÔNG có BEGIN/COMMIT (chạy qua RPC agent_sql).
-- ============================================================================

-- ─── 1) ĐỊNH NGHĨA. Không còn bản thứ hai ở bất kỳ đâu. ─────────────────────
-- 1 dòng = 1 container. delivery_state khớp ĐÚNG kiểu DeliveryState của TypeScript:
--   'delivered'   = đã rời kho (có chứng cứ)
--   'dispatching' = đã vào lệnh đã phát hành nhưng CHƯA cân xuất
--   NULL          = chưa điều động, hoặc mới nằm trong lệnh nháp
CREATE OR REPLACE VIEW public.v_sales_order_container_delivery AS
SELECT
  c.id                AS container_id,
  c.sales_order_id,
  c.lot_no,
  c.net_weight_kg,
  c.status            AS container_status,
  CASE
    -- Vế 1: hàng đi bằng phiếu cân / xuất kho, KHÔNG sinh dòng lệnh điều động.
    -- 'loaded' KHÔNG nằm đây: mới lên xe, chưa rời kho.
    WHEN c.status IN ('shipped', 'delivered') THEN 'delivered'
    -- Vế 2: đã cân xuất, trên một lệnh ĐÃ PHÁT HÀNH.
    WHEN EXISTS (
      SELECT 1
      FROM public.dispatch_order_lines dl
      JOIN public.dispatch_orders d ON d.id = dl.dispatch_order_id
      WHERE dl.sales_order_container_id = c.id
        AND dl.actual_weight_kg IS NOT NULL
        AND d.status <> 'draft'
    ) THEN 'delivered'
    -- Vế 3: đã nằm trong lệnh đã phát hành nhưng chưa cân.
    WHEN EXISTS (
      SELECT 1
      FROM public.dispatch_order_lines dl
      JOIN public.dispatch_orders d ON d.id = dl.dispatch_order_id
      WHERE dl.sales_order_container_id = c.id
        AND d.status <> 'draft'
    ) THEN 'dispatching'
    ELSE NULL
  END::text           AS delivery_state,
  -- Mốc tính tuổi nợ: ngày của lệnh ĐÃ PHÁT HÀNH đã chở container này.
  -- NULL khi chưa đi. Đợt 8 (công nợ theo tuổi) đọc cột này.
  (
    SELECT max(d.dispatch_date)
    FROM public.dispatch_order_lines dl
    JOIN public.dispatch_orders d ON d.id = dl.dispatch_order_id
    WHERE dl.sales_order_container_id = c.id
      AND d.status <> 'draft'
  )                   AS dispatch_date
FROM public.sales_order_containers c;

ALTER VIEW public.v_sales_order_container_delivery SET (security_invoker = on);
GRANT SELECT ON public.v_sales_order_container_delivery TO authenticated;

COMMENT ON VIEW public.v_sales_order_container_delivery IS
  'ĐỊNH NGHĨA DUY NHẤT "container đã giao". SQL và TypeScript cùng đọc view này — '
  'đừng gõ lại luật ở bất kỳ đâu khác. Xem sales_lots_p8_one_delivery_definition.sql.';

-- ─── 2) View tiến độ lô đọc lại từ định nghĩa trên ──────────────────────────
-- ⚠ GIỮ NGUYÊN 9 cột, đúng tên / đúng kiểu / đúng thứ tự — CREATE OR REPLACE VIEW chỉ
--   cho THÊM cột ở cuối, đổi hay đảo là lỗi. Chữ ký hiện tại:
--   sales_order_id uuid | lot_no integer | container_count integer |
--   containers_delivered integer | net_kg_total numeric | net_kg_delivered numeric |
--   conts_with_kg integer | delivered_conts_no_kg integer | delivery_state text
CREATE OR REPLACE VIEW public.v_sales_order_lot_progress_all AS
SELECT
  sales_order_id,
  lot_no,
  count(*)::int                                                           AS container_count,
  count(*) FILTER (WHERE delivery_state = 'delivered')::int               AS containers_delivered,
  COALESCE(sum(net_weight_kg), 0)::numeric(14,2)                          AS net_kg_total,
  COALESCE(sum(net_weight_kg) FILTER (WHERE delivery_state = 'delivered'), 0)::numeric(14,2)
                                                                          AS net_kg_delivered,
  count(*) FILTER (WHERE net_weight_kg IS NOT NULL)::int                  AS conts_with_kg,
  count(*) FILTER (WHERE delivery_state = 'delivered' AND net_weight_kg IS NULL)::int
                                                                          AS delivered_conts_no_kg,
  CASE
    WHEN count(*) FILTER (WHERE delivery_state = 'delivered') = 0        THEN 'none'
    WHEN count(*) FILTER (WHERE delivery_state = 'delivered') < count(*) THEN 'partial'
    ELSE 'full'
  END                                                                     AS delivery_state
FROM public.v_sales_order_container_delivery
GROUP BY sales_order_id, lot_no;

ALTER VIEW public.v_sales_order_lot_progress_all SET (security_invoker = on);

COMMENT ON VIEW public.v_sales_order_lot_progress_all IS
  'Tiến độ GIAO của mọi container, gom theo (sales_order_id, lot_no). '
  'lot_no NULL = rổ container chưa gán lô. Luật "đã giao" đọc từ '
  'v_sales_order_container_delivery — KHÔNG gõ lại ở đây.';

-- ─── 3) KIỂM CHỨNG (chạy tay sau khi apply) ────────────────────────────────
-- a) Đúng 129 container đã giao, không phải 137:
--    SELECT count(*) FROM v_sales_order_container_delivery WHERE delivery_state='delivered';
-- b) Đúng MỘT lô đổi kết luận, và là SO-2026-0091 lô 1 → 3/5:
--    SELECT o.code, p.lot_no, p.containers_delivered||'/'||p.container_count
--    FROM v_sales_order_lot_progress_all p JOIN sales_orders o ON o.id=p.sales_order_id
--    WHERE o.code='SO-2026-0091' AND p.lot_no=1;                       -- 3/5
-- c) Bất biến rổ chưa-gán-lô vẫn đứng (Σ mọi rổ = tổng container của đơn):
--    SELECT count(*) FROM (
--      SELECT p.sales_order_id, sum(p.container_count) s,
--             (SELECT count(*) FROM sales_order_containers c WHERE c.sales_order_id=p.sales_order_id) t
--      FROM v_sales_order_lot_progress_all p GROUP BY p.sales_order_id
--    ) x WHERE s <> t;                                                  -- phải = 0
