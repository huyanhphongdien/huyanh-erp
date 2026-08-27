-- ============================================================================
-- ĐƠN HÀNG BÁN — P7: vá hai chỗ view cuộn nói sai sau khi p6 cho lot_id nullable
-- Ngày: 2026-08-27
-- Chạy SAU p6
--
-- LỖI 1 — ĐẾM HỤT LÔ:
--   v_sales_order_lot_summary.lot_count = COUNT(v.lot_id). P6 làm `lot_id` NULLABLE
--   (lô chỉ tồn tại qua container thì chưa có dòng nên không có id). COUNT(cột) bỏ qua
--   NULL → lot_count nhỏ hơn thực tế, và nhỏ hơn cả lots_paid + lots_partial + lots_unpaid
--   vốn dùng COUNT(*) FILTER. Một hợp đồng có thể hiện "2 lô" trong khi có 3.
--   Frontend chưa đọc view này (grep = 0) nên đây là bom hẹn giờ, chưa nổ.
--
-- LỖI 2 — HAI MẪU SỐ KHÁC NHAU TRONG CÙNG MỘT DÒNG:
--   lots_value_usd  cộng  v.value_usd            (chỉ trị giá ĐÃ CHỐT)
--   lots_remaining  cộng  v.remaining_usd        (p6 tính theo COALESCE(chốt, tạm tính))
--   Lô chưa chốt góp 0 vào tử số nhưng góp đủ vào phần còn nợ → "Còn nợ" LỚN HƠN
--   "Trị giá". Người đọc thấy ngay là sai và mất niềm tin vào cả bảng.
--   → Chọn MỘT chuẩn: cộng theo mẫu số HIỆU DỤNG (chốt, thiếu thì tạm tính), và tách
--     riêng phần đã chốt để vẫn biết bao nhiêu là số chắc.
--
-- Idempotent (CREATE OR REPLACE). Cột cũ giữ nguyên tên/kiểu/thứ tự, cột mới ở cuối.
-- ============================================================================

CREATE OR REPLACE VIEW public.v_sales_order_lot_summary AS
SELECT
  o.id                    AS sales_order_id,
  o.contract_no,
  o.status                AS order_status,
  -- ĐẾM THEO lot_no, không theo lot_id: lot_id NULL với lô chưa chốt trị giá.
  COUNT(*) FILTER (WHERE v.lot_no IS NOT NULL)                 AS lot_count,
  COUNT(*) FILTER (WHERE v.payment_status = 'paid')            AS lots_paid,
  COUNT(*) FILTER (WHERE v.payment_status = 'partial')         AS lots_partial,
  COUNT(*) FILTER (WHERE v.payment_status = 'unpaid')          AS lots_unpaid,
  COUNT(*) FILTER (WHERE v.payment_status = 'unknown')         AS lots_unknown,
  -- Mẫu số HIỆU DỤNG — cùng chuẩn với remaining_usd, để "Còn nợ" không bao giờ vượt "Trị giá".
  COALESCE(SUM(COALESCE(v.value_usd, v.value_est_usd)), 0)     AS lots_value_usd,
  COALESCE(SUM(v.paid_usd), 0)                                 AS lots_paid_usd,
  COALESCE(SUM(v.remaining_usd), 0)                            AS lots_remaining_usd,
  COALESCE(u.unassigned_paid_usd, 0)                           AS unassigned_paid_usd,
  COALESCE(u.unassigned_payment_count, 0)                      AS unassigned_payment_count,

  COUNT(*) FILTER (WHERE v.delivery_state = 'full')            AS lots_delivered,
  COUNT(*) FILTER (WHERE v.delivery_state = 'partial')         AS lots_delivering,
  COUNT(*) FILTER (WHERE v.delivery_state = 'none')            AS lots_not_shipped,
  COALESCE(SUM(v.container_count), 0)                          AS containers_total,
  COALESCE(SUM(v.containers_delivered), 0)                     AS containers_delivered,
  COALESCE(SUM(v.net_kg_total), 0)                             AS net_kg_total,
  COALESCE(SUM(v.net_kg_delivered), 0)                         AS net_kg_delivered,
  COUNT(*) FILTER (WHERE v.status_mismatch)                    AS lots_mismatch,

  -- ─── CỘT MỚI (P7) ─────────────────────────────────────────────────────────
  /* Phần trị giá ĐÃ CHỐT — số chắc chắn, dùng khi cần con số không suy đoán. */
  COALESCE(SUM(v.value_usd), 0)                                AS lots_value_locked_usd,
  /* Lô chưa chốt trị giá: có container gán lô nhưng chưa có dòng sales_order_lots. */
  COUNT(*) FILTER (WHERE v.lot_no IS NOT NULL AND NOT v.has_lot_row) AS lots_unpriced
FROM public.sales_orders o
LEFT JOIN public.v_sales_order_lot_payments v ON v.sales_order_id = o.id
LEFT JOIN LATERAL (
  SELECT
    SUM(pay.amount) FILTER (WHERE pay.currency = 'USD' OR pay.currency IS NULL) AS unassigned_paid_usd,
    COUNT(*)                                                                    AS unassigned_payment_count
  FROM public.sales_order_payments pay
  WHERE pay.sales_order_id = o.id
    AND pay.lot_no IS NULL
    AND pay.payment_type IS DISTINCT FROM 'fee_offset'
) u ON true
GROUP BY o.id, o.contract_no, o.status, u.unassigned_paid_usd, u.unassigned_payment_count;

ALTER VIEW public.v_sales_order_lot_summary SET (security_invoker = on);
GRANT SELECT ON public.v_sales_order_lot_summary TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ─── VERIFY ──────────────────────────────────────────────────────────────────
DO $$
DECLARE v_sai_dem int; v_sai_mau int;
BEGIN
  -- Bất biến 1: lot_count phải bằng tổng các nhóm trạng thái thu.
  SELECT count(*) INTO v_sai_dem
  FROM public.v_sales_order_lot_summary
  WHERE lot_count <> lots_paid + lots_partial + lots_unpaid + lots_unknown;

  -- Bất biến 2: còn nợ không bao giờ vượt trị giá.
  SELECT count(*) INTO v_sai_mau
  FROM public.v_sales_order_lot_summary
  WHERE lots_remaining_usd > lots_value_usd + 0.01;

  IF v_sai_dem > 0 THEN
    RAISE EXCEPTION 'P7 FAIL: % hợp đồng có lot_count lệch tổng các nhóm', v_sai_dem;
  END IF;
  IF v_sai_mau > 0 THEN
    RAISE EXCEPTION 'P7 FAIL: % hợp đồng có "còn nợ" lớn hơn "trị giá"', v_sai_mau;
  END IF;

  RAISE NOTICE 'P7 OK — hai bất biến đứng vững trên toàn bộ hợp đồng';
END $$;

SELECT contract_no, lot_count, lots_unpriced,
       lots_value_usd, lots_value_locked_usd, lots_paid_usd, lots_remaining_usd
FROM public.v_sales_order_lot_summary
WHERE lot_count > 0
ORDER BY contract_no;

-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
--   ⚠ CREATE OR REPLACE VIEW KHÔNG bỏ được cột. Muốn quay lại bản cũ phải:
--     DROP VIEW IF EXISTS public.v_sales_order_lot_summary;
--   rồi chạy lại docs/migrations/sales_lots_p4_delivery.sql (phần tạo view summary).
