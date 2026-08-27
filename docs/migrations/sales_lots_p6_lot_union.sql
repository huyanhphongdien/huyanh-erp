-- ============================================================================
-- ĐƠN HÀNG BÁN — P6: không lô nào được vô hình khỏi Sổ lô
-- Ngày: 2026-08-27
-- Chạy SAU p1..p5
--
-- LỖ HỔNG ĐANG CÓ: trang Đóng gói khi gán lô chỉ ghi `sales_order_containers.lot_no`,
-- KHÔNG sinh dòng `sales_order_lots` (hàm salesLotService.createLot chưa ai gọi — đã grep).
-- Mà v_sales_order_lot_payments lại `FROM sales_order_lots`. Hệ quả:
--   • lô mới gán hiện viên trên Kanban và Sổ đơn hàng (chúng đọc container)
--   • nhưng VẮNG MẶT ở Sổ lô, và tiền thu gắn vào lô đó lọt qua cả ba rổ đối chiếu
-- Hôm nay chưa nổ vì backfill p2 phủ đúng 20/20 lô. Nó nổ ở lần gán lô tiếp theo.
--
-- CÁCH SỬA: KHÔNG tự sinh dòng lô với trị giá đoán. Thay vào đó cho view lấy HỢP của
--   (a) lô đã chốt trong sales_order_lots
--   (b) lô suy từ container
-- Lô thuộc nhóm (b) hiện ra với `value_usd` NULL và `has_lot_row = false` — tức
-- "lô có thật, chưa chốt trị giá". Người dùng chốt bằng tay theo đúng chứng từ.
-- Đoán hộ trị giá rồi để khách trả tiền vào đó là lặp lại đúng bug prorata đã gỡ.
--
-- ⚠ CỘT MỚI ĐẶT Ở CUỐI. CREATE OR REPLACE VIEW chỉ cho THÊM cột ở cuối, và phải giữ
--    nguyên tên/kiểu/thứ tự của mọi cột cũ.
-- ⚠ `lot_id` TỪ NAY CÓ THỂ NULL (lô nhóm b chưa có dòng). Dùng `lot_key` làm khoá dòng
--    ở giao diện, đừng dùng lot_id.
--
-- Idempotent (CREATE OR REPLACE).
-- ============================================================================

CREATE OR REPLACE VIEW public.v_sales_order_lot_payments AS
WITH lot_universe AS (
  -- HỢP hai nguồn. UNION (không ALL) tự khử trùng.
  SELECT sales_order_id, lot_no FROM public.sales_order_lots
  UNION
  SELECT sales_order_id, lot_no
    FROM public.v_sales_order_lot_progress_all
   WHERE lot_no IS NOT NULL
)
SELECT
  l.id                    AS lot_id,          -- NULL khi lô chưa có dòng chốt
  u.sales_order_id,
  o.contract_no,
  o.status                AS order_status,
  o.customer_id,
  u.lot_no,
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
  GREATEST(
    COALESCE(l.value_usd, est.value_est, 0) - COALESCE(p.paid_usd, 0), 0
  )                                                               AS remaining_usd,
  COALESCE(p.payment_count, 0)                                    AS payment_count,
  p.last_payment_date,
  COALESCE(p.other_currency_payments, 0)                          AS other_currency_payments,

  -- Mẫu số = trị giá CHỐT, thiếu thì tạm dùng công thức Invoice (net/1000 × đơn giá).
  -- Xem value_source để biết đang dùng cái nào — KHÔNG bao giờ 'paid' khi không có mẫu số.
  CASE
    WHEN COALESCE(l.value_usd, est.value_est, 0) <= 0            THEN 'unknown'
    WHEN COALESCE(p.paid_usd, 0) <= 0                            THEN 'unpaid'
    WHEN COALESCE(p.paid_usd, 0) + 0.01
         >= COALESCE(l.value_usd, est.value_est)                  THEN 'paid'
    ELSE 'partial'
  END                                                             AS payment_status,

  COALESCE(d.container_count, 0)                                  AS container_count,
  COALESCE(d.containers_delivered, 0)                             AS containers_delivered,
  COALESCE(d.net_kg_total, 0)                                     AS net_kg_total,
  COALESCE(d.net_kg_delivered, 0)                                 AS net_kg_delivered,
  COALESCE(d.delivery_state, 'none')                              AS delivery_state,

  CASE
    WHEN l.status = 'delivered'
         AND COALESCE(d.delivery_state, 'none') <> 'full'          THEN true
    WHEN l.status IN ('planning', 'packing')
         AND d.delivery_state = 'full'                             THEN true
    WHEN l.status = 'shipped'
         AND COALESCE(d.delivery_state, 'none') = 'none'           THEN true
    ELSE false
  END                                                             AS status_mismatch,

  -- ─── CỘT MỚI (P6) ─────────────────────────────────────────────────────────
  /* Khoá dòng ổn định cho giao diện — lot_id có thể NULL. */
  u.sales_order_id::text || '#' || u.lot_no::text                 AS lot_key,
  /* false = lô CHỈ tồn tại qua container, chưa có dòng chốt trong sales_order_lots. */
  (l.id IS NOT NULL)                                              AS has_lot_row,
  /* Trị giá tạm tính theo công thức Commercial Invoice, dùng khi chưa chốt. */
  est.value_est                                                   AS value_est_usd,
  CASE
    WHEN l.value_usd IS NOT NULL AND l.value_usd > 0 THEN 'lot'
    WHEN est.value_est IS NOT NULL AND est.value_est > 0 THEN 'invoice'
    ELSE 'unknown'
  END                                                             AS value_source
FROM lot_universe u
JOIN public.sales_orders o ON o.id = u.sales_order_id
LEFT JOIN public.sales_order_lots l
  ON l.sales_order_id = u.sales_order_id AND l.lot_no = u.lot_no
LEFT JOIN public.v_sales_order_lot_progress_all d
  ON d.sales_order_id = u.sales_order_id AND d.lot_no = u.lot_no
LEFT JOIN LATERAL (
  -- ⚠ net_kg_total là số ĐỘNG (containerService._recalcContainerTotals ghi đè mỗi lần
  -- gán cont) nên trị giá tạm tính này ĐỔI sau khi hoá đơn đã phát. Chỉ dùng để gợi ý,
  -- phải chốt vào sales_order_lots.value_usd rồi mới dùng làm mẫu số thật.
  SELECT ROUND(COALESCE(d.net_kg_total, 0) / 1000.0 * o.unit_price, 2) AS value_est
  WHERE o.unit_price IS NOT NULL AND o.unit_price > 0
) est ON true
LEFT JOIN LATERAL (
  SELECT
    SUM(pay.amount) FILTER (WHERE pay.currency = 'USD' OR pay.currency IS NULL) AS paid_usd,
    COUNT(*)                                                                    AS payment_count,
    MAX(pay.payment_date)                                                       AS last_payment_date,
    COUNT(*) FILTER (WHERE pay.currency IS NOT NULL AND pay.currency <> 'USD')  AS other_currency_payments
  FROM public.sales_order_payments pay
  WHERE pay.sales_order_id = u.sales_order_id
    AND pay.lot_no = u.lot_no
    AND pay.payment_type IS DISTINCT FROM 'fee_offset'
) p ON true;

ALTER VIEW public.v_sales_order_lot_payments SET (security_invoker = on);

COMMENT ON VIEW public.v_sales_order_lot_payments IS
  'Mỗi dòng = 1 lô, lấy HỢP của sales_order_lots và lô suy từ container — không lô nào '
  'vô hình. has_lot_row = false nghĩa là lô có thật nhưng CHƯA CHỐT trị giá.';

GRANT SELECT ON public.v_sales_order_lot_payments TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ─── VERIFY ──────────────────────────────────────────────────────────────────
DO $$
DECLARE v_lo int; v_chot int; v_chua int; v_tu_bang int; v_tu_cont int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE has_lot_row), count(*) FILTER (WHERE NOT has_lot_row)
    INTO v_lo, v_chot, v_chua
  FROM public.v_sales_order_lot_payments;

  SELECT count(*) INTO v_tu_bang FROM public.sales_order_lots;
  SELECT count(*) INTO v_tu_cont
    FROM public.v_sales_order_lot_progress_all WHERE lot_no IS NOT NULL;

  RAISE NOTICE 'P6: % lô (% đã chốt, % chưa) | bảng lô % dòng | container suy ra % lô',
    v_lo, v_chot, v_chua, v_tu_bang, v_tu_cont;

  IF v_lo < GREATEST(v_tu_bang, v_tu_cont) THEN
    RAISE EXCEPTION 'P6 FAIL: HỢP ra % lô, nhỏ hơn một trong hai nguồn (% / %)',
      v_lo, v_tu_bang, v_tu_cont;
  END IF;
END $$;

SELECT contract_no, lot_no, has_lot_row, value_source, value_usd, value_est_usd,
       containers_delivered || '/' || container_count AS cont, payment_status
FROM public.v_sales_order_lot_payments
ORDER BY contract_no, lot_no;

-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
--   ⚠ KHÔNG chạy thẳng lại p4: `CREATE OR REPLACE VIEW` KHÔNG BỎ ĐƯỢC CỘT, nó sẽ báo lỗi
--   "cannot drop columns from view". Phải DROP theo đúng thứ tự phụ thuộc:
--     DROP VIEW IF EXISTS public.v_sales_order_lot_summary;    -- phụ thuộc vào view dưới
--     DROP VIEW IF EXISTS public.v_sales_order_lot_payments;
--   rồi chạy lại sales_lots_p4_delivery.sql và sales_lots_p7_summary_fix.sql.
--
--   ⚠ VÀ PHẢI REVERT CẢ GIAO DIỆN: SalesLotLedgerPage dùng `lot_key` làm rowKey, đọc
--   `has_lot_row` / `value_est_usd` / `value_source`. Mất các cột đó thì rowKey thành
--   undefined và React sẽ cảnh báo trùng key, cột Trị giá hiện sai.
--   Sau rollback, lô chưa chốt trị giá VÔ HÌNH trở lại khỏi Sổ lô — đúng lỗ hổng p6 vá.
