-- ============================================================================
-- ĐƠN HÀNG BÁN — P4: tiến độ GIAO HÀNG theo lô, ghép chung với tiền
-- Ngày: 2026-08-26
-- Chạy SAU p1 (bảng), p2 (backfill), p3 (view tiền)
--
-- VÌ SAO: sổ lô mới chỉ trả lời được "thu bao nhiêu". Câu còn lại — "giao tới đâu" —
-- dữ liệu ĐÃ CÓ ĐỦ nhưng nằm rải ở container + dòng lệnh xe, và phép tính đang nằm ở
-- client (dispatchService.getLotProgressForOrders) chỉ chạy tới MỨC HỢP ĐỒNG.
-- Sáu màn hình sắp tới đều cần con số này ở MỨC LÔ → đưa xuống DB, tính một lần.
--
-- VÌ SAO CHỌN VIEW CHỨ KHÔNG TÍNH Ở CLIENT (đo 2026-08-26):
--   • Dữ liệu bé: 210 container, 159 dòng lệnh xe, 113 lệnh. Postgres xử lý tức thì.
--   • Bản client hiện tại phải chunk IN(...) thành nhiều vòng gọi mạng để né HTTP 414.
--     Sáu màn nhân lên là sáu lần lặp lại cùng logic — và sẽ lệch nhau khi sửa.
--   • RLS đã thông: dispatch_order_lines và dispatch_orders đều có policy
--     `ALL TO authenticated USING (true)` + GRANT SELECT → view security_invoker đọc được,
--     không rơi vào bẫy "trả rỗng im lặng".
--
-- ĐỊNH NGHĨA "ĐÃ GIAO" — GIỮ NGUYÊN như dispatchService đang dùng, không được đổi:
--   container đã giao = có dòng dispatch_order_lines với actual_weight_kg IS NOT NULL
--                       HOẶC sales_order_containers.status = 'shipped'
--   (vế thứ hai là để bù cho hàng đi bằng phiếu cân/xuất kho, không sinh lệnh điều động)
--
-- Idempotent (CREATE OR REPLACE).
-- ============================================================================

-- ─── 1) Tiến độ giao ở mức LÔ ────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_sales_order_lot_progress AS
WITH cont AS (
  SELECT
    c.id,
    c.sales_order_id,
    c.lot_no,
    c.net_weight_kg,
    (
      c.status = 'shipped'
      OR EXISTS (
        SELECT 1 FROM public.dispatch_order_lines dl
        WHERE dl.sales_order_container_id = c.id
          AND dl.actual_weight_kg IS NOT NULL
      )
    ) AS delivered
  FROM public.sales_order_containers c
  WHERE c.lot_no IS NOT NULL
)
SELECT
  sales_order_id,
  lot_no,
  count(*)::int                                              AS container_count,
  count(*) FILTER (WHERE delivered)::int                     AS containers_delivered,
  COALESCE(sum(net_weight_kg), 0)::numeric(14,2)             AS net_kg_total,
  COALESCE(sum(net_weight_kg) FILTER (WHERE delivered), 0)::numeric(14,2) AS net_kg_delivered,
  CASE
    WHEN count(*) FILTER (WHERE delivered) = 0        THEN 'none'
    WHEN count(*) FILTER (WHERE delivered) < count(*) THEN 'partial'
    ELSE 'full'
  END                                                        AS delivery_state
FROM cont
GROUP BY sales_order_id, lot_no;

ALTER VIEW public.v_sales_order_lot_progress SET (security_invoker = on);

COMMENT ON VIEW public.v_sales_order_lot_progress IS
  'Tiến độ GIAO HÀNG của từng lô, suy từ container + dòng lệnh xe. '
  'delivery_state: none / partial / full. KHÔNG đọc sales_order_lots.status.';

-- ─── 2) Ghép giao + tiền vào MỘT view cho mọi màn ────────────────────────────
-- Cột cũ giữ nguyên tên/thứ tự (CREATE OR REPLACE chỉ cho THÊM cột ở cuối).
CREATE OR REPLACE VIEW public.v_sales_order_lot_payments AS
SELECT
  l.id                    AS lot_id,
  l.sales_order_id,
  o.contract_no,
  o.status                AS order_status,
  o.customer_id,
  l.lot_no,
  l.lot_label,
  l.status                AS lot_status,
  l.net_weight_kg,
  l.unit_price_usd,
  l.value_usd,
  l.etd,
  l.delivered_at,
  l.invoice_no,
  l.bl_no,

  COALESCE(p.paid_usd, 0)                                         AS paid_usd,
  GREATEST(COALESCE(l.value_usd, 0) - COALESCE(p.paid_usd, 0), 0) AS remaining_usd,
  COALESCE(p.payment_count, 0)                                    AS payment_count,
  p.last_payment_date,
  COALESCE(p.other_currency_payments, 0)                          AS other_currency_payments,

  CASE
    WHEN l.value_usd IS NULL OR l.value_usd <= 0       THEN 'unknown'
    WHEN COALESCE(p.paid_usd, 0) <= 0                  THEN 'unpaid'
    WHEN COALESCE(p.paid_usd, 0) + 0.01 >= l.value_usd THEN 'paid'
    ELSE 'partial'
  END                                                             AS payment_status,

  -- ─── CỘT MỚI: trục GIAO HÀNG ───────────────────────────────────────────────
  COALESCE(d.container_count, 0)                                  AS container_count,
  COALESCE(d.containers_delivered, 0)                             AS containers_delivered,
  COALESCE(d.net_kg_total, 0)                                     AS net_kg_total,
  COALESCE(d.net_kg_delivered, 0)                                 AS net_kg_delivered,
  COALESCE(d.delivery_state, 'none')                              AS delivery_state,

  -- ─── CỘT MỚI: cờ lệch ──────────────────────────────────────────────────────
  -- sales_order_lots.status là số CHÉP XUỐNG từ trạng thái hợp đồng lúc backfill,
  -- không phải chứng cứ. So nó với delivery_state để bật cờ. Giao diện dùng cờ này
  -- để chấm đỏ, và TUYỆT ĐỐI không dùng lot_status để tô màu tiến độ giao.
  CASE
    WHEN l.status = 'delivered'
         AND COALESCE(d.delivery_state, 'none') <> 'full'          THEN true
    WHEN l.status IN ('planning', 'packing')
         AND d.delivery_state = 'full'                             THEN true
    WHEN l.status = 'shipped'
         AND COALESCE(d.delivery_state, 'none') = 'none'           THEN true
    ELSE false
  END                                                             AS status_mismatch
FROM public.sales_order_lots l
JOIN public.sales_orders o ON o.id = l.sales_order_id
LEFT JOIN LATERAL (
  SELECT
    SUM(pay.amount) FILTER (WHERE pay.currency = 'USD' OR pay.currency IS NULL) AS paid_usd,
    COUNT(*)                                                                    AS payment_count,
    MAX(pay.payment_date)                                                       AS last_payment_date,
    COUNT(*) FILTER (WHERE pay.currency IS NOT NULL AND pay.currency <> 'USD')  AS other_currency_payments
  FROM public.sales_order_payments pay
  WHERE pay.sales_order_id = l.sales_order_id
    AND pay.lot_no = l.lot_no
    AND pay.payment_type IS DISTINCT FROM 'fee_offset'
) p ON true
LEFT JOIN public.v_sales_order_lot_progress d
  ON d.sales_order_id = l.sales_order_id AND d.lot_no = l.lot_no;

ALTER VIEW public.v_sales_order_lot_payments SET (security_invoker = on);

COMMENT ON VIEW public.v_sales_order_lot_payments IS
  'Mỗi dòng = 1 lô, đủ CẢ HAI trục: giao hàng (container/tấn/delivery_state) và tiền '
  '(paid_usd/remaining_usd/payment_status). status_mismatch = lot_status trái chứng cứ giao.';

-- ─── 3) Cuộn lên mức HỢP ĐỒNG — thêm trục giao ───────────────────────────────
CREATE OR REPLACE VIEW public.v_sales_order_lot_summary AS
SELECT
  o.id                    AS sales_order_id,
  o.contract_no,
  o.status                AS order_status,
  COUNT(v.lot_id)                                              AS lot_count,
  COUNT(*) FILTER (WHERE v.payment_status = 'paid')            AS lots_paid,
  COUNT(*) FILTER (WHERE v.payment_status = 'partial')         AS lots_partial,
  COUNT(*) FILTER (WHERE v.payment_status = 'unpaid')          AS lots_unpaid,
  COUNT(*) FILTER (WHERE v.payment_status = 'unknown')         AS lots_unknown,
  COALESCE(SUM(v.value_usd), 0)                                AS lots_value_usd,
  COALESCE(SUM(v.paid_usd), 0)                                 AS lots_paid_usd,
  COALESCE(SUM(v.remaining_usd), 0)                            AS lots_remaining_usd,
  COALESCE(u.unassigned_paid_usd, 0)                           AS unassigned_paid_usd,
  COALESCE(u.unassigned_count, 0)                              AS unassigned_payment_count,

  -- ─── CỘT MỚI: trục giao cuộn lên ───────────────────────────────────────────
  COUNT(*) FILTER (WHERE v.delivery_state = 'full')            AS lots_delivered,
  COUNT(*) FILTER (WHERE v.delivery_state = 'partial')         AS lots_delivering,
  COUNT(*) FILTER (WHERE v.delivery_state = 'none')            AS lots_not_shipped,
  COALESCE(SUM(v.container_count), 0)                          AS containers_total,
  COALESCE(SUM(v.containers_delivered), 0)                     AS containers_delivered,
  COALESCE(SUM(v.net_kg_total), 0)                             AS net_kg_total,
  COALESCE(SUM(v.net_kg_delivered), 0)                         AS net_kg_delivered,
  COUNT(*) FILTER (WHERE v.status_mismatch)                    AS lots_mismatch
FROM public.sales_orders o
LEFT JOIN public.v_sales_order_lot_payments v ON v.sales_order_id = o.id
LEFT JOIN LATERAL (
  SELECT
    SUM(pay.amount) FILTER (WHERE pay.currency = 'USD' OR pay.currency IS NULL) AS unassigned_paid_usd,
    COUNT(*)                                                                    AS unassigned_count
  FROM public.sales_order_payments pay
  WHERE pay.sales_order_id = o.id
    AND pay.lot_no IS NULL
    AND pay.payment_type IS DISTINCT FROM 'fee_offset'
) u ON true
GROUP BY o.id, o.contract_no, o.status, u.unassigned_paid_usd, u.unassigned_count;

ALTER VIEW public.v_sales_order_lot_summary SET (security_invoker = on);

GRANT SELECT ON public.v_sales_order_lot_progress TO authenticated;
GRANT SELECT ON public.v_sales_order_lot_payments TO authenticated;
GRANT SELECT ON public.v_sales_order_lot_summary  TO authenticated;

-- Đỡ cho EXISTS(...) trên dòng lệnh xe
CREATE INDEX IF NOT EXISTS idx_dol_container_actual
  ON public.dispatch_order_lines (sales_order_container_id)
  WHERE actual_weight_kg IS NOT NULL;

NOTIFY pgrst, 'reload schema';

-- ─── VERIFY ──────────────────────────────────────────────────────────────────
DO $$
DECLARE v_lots int; v_full int; v_part int; v_none int; v_mm int; v_kg numeric; v_kgt numeric;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE delivery_state='full'),
         count(*) FILTER (WHERE delivery_state='partial'),
         count(*) FILTER (WHERE delivery_state='none'),
         count(*) FILTER (WHERE status_mismatch),
         sum(net_kg_delivered), sum(net_kg_total)
    INTO v_lots, v_full, v_part, v_none, v_mm, v_kg, v_kgt
  FROM public.v_sales_order_lot_payments;

  RAISE NOTICE 'P4: % lô — giao đủ %, giao dở %, chưa đi % | lệch % | % / % kg',
    v_lots, v_full, v_part, v_none, v_mm, v_kg, v_kgt;

  IF v_lots = 0 THEN
    RAISE EXCEPTION 'P4 FAIL: view không trả dòng nào';
  END IF;
  -- Số đã đo tay 26/08/2026: 20 lô, 12 giao đủ, 6 giao dở, 2 chưa đi, 9 lệch.
  IF v_full + v_part + v_none <> v_lots THEN
    RAISE EXCEPTION 'P4 FAIL: delivery_state có giá trị lạ';
  END IF;
END $$;

SELECT contract_no, lot_no, containers_delivered || '/' || container_count AS cont,
       net_kg_delivered, net_kg_total, delivery_state, lot_status, status_mismatch,
       value_usd, paid_usd, payment_status
FROM public.v_sales_order_lot_payments
ORDER BY contract_no, lot_no;

-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
--   Khôi phục v_sales_order_lot_payments và v_sales_order_lot_summary bằng cách
--   chạy lại docs/migrations/sales_lots_p3_payment_views.sql, rồi:
--   DROP VIEW IF EXISTS public.v_sales_order_lot_progress;
--   DROP INDEX IF EXISTS public.idx_dol_container_actual;
--   (P4 KHÔNG đụng bảng nào có dữ liệu — rollback sạch.)
