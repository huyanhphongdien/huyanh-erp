-- ============================================================================
-- ĐƠN HÀNG BÁN — P3: view trả lời "lô nào đã thanh toán, nằm trong hợp đồng nào"
-- Ngày: 2026-08-26
-- Chạy SAU p1 (bảng) và p2 (backfill)
--
-- Khách trả THEO TỪNG LÔ, mỗi lô một lần chuyển tiền kèm chứng từ riêng.
-- Ghi nhận tiền vẫn ở sales_order_payments — bảng đó ĐÃ CÓ SẴN cột lot_no,
-- không thêm bảng tiền mới. View chỉ ghép:  tiền (lot_no) ↔ lô (value_usd).
--
-- ⚠ HIỆN TRẠNG PHẢI BIẾT TRƯỚC (đo 2026-08-26):
--   sales_order_payments chỉ có 2 DÒNG trên toàn hệ thống, và CẢ HAI đều lot_no = NULL.
--   103/104 hợp đồng đang ở payment_status = 'unpaid', actual_payment_amount điền đúng 1 dòng.
--   Nghĩa là: cơ chế theo dõi thanh toán mức hợp đồng hiện nay gần như KHÔNG AI DÙNG.
--   Vì vậy view này sẽ trả về "chưa thu" cho toàn bộ lô — đúng với dữ liệu, không phải lỗi.
--   Nó chỉ có giá trị khi người dùng thật sự ghi mỗi lần thu tiền kèm số lô.
--
-- TIỀN KHÁC USD: chỉ cộng dòng USD (hoặc currency NULL) vào paid_usd. Dòng ngoại tệ khác
-- KHÔNG bị nuốt im lặng — đếm riêng ở cột other_currency_payments để còn biết mà xử lý.
--
-- Idempotent (CREATE OR REPLACE).
-- ============================================================================

-- ─── 1) Mức LÔ ───────────────────────────────────────────────────────────────
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

  COALESCE(p.paid_usd, 0)                                       AS paid_usd,
  GREATEST(COALESCE(l.value_usd, 0) - COALESCE(p.paid_usd, 0), 0) AS remaining_usd,
  COALESCE(p.payment_count, 0)                                  AS payment_count,
  p.last_payment_date,
  COALESCE(p.other_currency_payments, 0)                        AS other_currency_payments,

  CASE
    -- Không có giá trị lô thì không có mẫu số → không kết luận được.
    WHEN l.value_usd IS NULL OR l.value_usd <= 0            THEN 'unknown'
    WHEN COALESCE(p.paid_usd, 0) <= 0                       THEN 'unpaid'
    -- Dung sai 0,01 USD cho sai số làm tròn numeric.
    WHEN COALESCE(p.paid_usd, 0) + 0.01 >= l.value_usd      THEN 'paid'
    ELSE 'partial'
  END                                                           AS payment_status
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
    AND pay.lot_no = l.lot_no          -- lot_no NULL không khớp → không tính vào lô nào
) p ON true;

ALTER VIEW public.v_sales_order_lot_payments SET (security_invoker = on);

COMMENT ON VIEW public.v_sales_order_lot_payments IS
  'Mỗi dòng = 1 lô + tình trạng thu tiền của riêng lô đó. Ghép qua (sales_order_id, lot_no). '
  'payment_status: unpaid / partial / paid / unknown (lô chưa có giá trị USD).';

-- ─── 2) Mức HỢP ĐỒNG — cuộn từ lô lên, để Kanban/bảng hiển thị "2/3 lô đã thu" ─
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

  -- Tiền đã thu nhưng KHÔNG gắn số lô. Không cộng vào lô nào cả — hiện riêng để
  -- kế toán còn biết mà gán lại, thay vì để nó biến mất khỏi mọi báo cáo.
  COALESCE(u.unassigned_paid_usd, 0)                           AS unassigned_paid_usd,
  COALESCE(u.unassigned_count, 0)                              AS unassigned_payment_count
FROM public.sales_orders o
LEFT JOIN public.v_sales_order_lot_payments v ON v.sales_order_id = o.id
LEFT JOIN LATERAL (
  SELECT
    SUM(pay.amount) FILTER (WHERE pay.currency = 'USD' OR pay.currency IS NULL) AS unassigned_paid_usd,
    COUNT(*)                                                                    AS unassigned_count
  FROM public.sales_order_payments pay
  WHERE pay.sales_order_id = o.id AND pay.lot_no IS NULL
) u ON true
GROUP BY o.id, o.contract_no, o.status, u.unassigned_paid_usd, u.unassigned_count;

ALTER VIEW public.v_sales_order_lot_summary SET (security_invoker = on);

COMMENT ON VIEW public.v_sales_order_lot_summary IS
  'Mỗi dòng = 1 hợp đồng, cuộn tình trạng thu tiền của các lô lên. '
  'unassigned_paid_usd = tiền đã thu nhưng chưa gắn số lô.';

-- Index đỡ cho join tiền ↔ lô (bảng payments hiện rất nhỏ, nhưng sẽ lớn dần).
CREATE INDEX IF NOT EXISTS idx_sop_order_lot
  ON public.sales_order_payments (sales_order_id, lot_no);

GRANT SELECT ON public.v_sales_order_lot_payments TO authenticated;
GRANT SELECT ON public.v_sales_order_lot_summary  TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ─── VERIFY ──────────────────────────────────────────────────────────────────
DO $$
DECLARE v_lots int; v_paid int; v_unknown int;
BEGIN
  IF to_regclass('public.v_sales_order_lot_payments') IS NULL
     OR to_regclass('public.v_sales_order_lot_summary') IS NULL THEN
    RAISE EXCEPTION 'P3 FAIL: chưa tạo được view';
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE payment_status = 'paid'),
         count(*) FILTER (WHERE payment_status = 'unknown')
    INTO v_lots, v_paid, v_unknown
  FROM public.v_sales_order_lot_payments;

  RAISE NOTICE 'P3 OK — % lô, % đã thu đủ, % chưa có giá trị USD', v_lots, v_paid, v_unknown;
END $$;

SELECT contract_no, lot_no, net_weight_kg, value_usd, paid_usd, remaining_usd, payment_status
FROM public.v_sales_order_lot_payments
ORDER BY contract_no, lot_no;

-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
--   DROP VIEW IF EXISTS public.v_sales_order_lot_summary;
--   DROP VIEW IF EXISTS public.v_sales_order_lot_payments;
--   DROP INDEX IF EXISTS public.idx_sop_order_lot;
