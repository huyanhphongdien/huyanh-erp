-- ============================================================================
-- KHOẢN THU: CHẶN "LÔ MA" + GHI LẠI AI NHẬP — ĐỢT 8, P9
-- Ngày: 2026-08-27 · Chạy độc lập, không phụ thuộc P8
--
-- VÌ SAO: sales_order_payments.lot_no hiện là int nullable TRẦN — đo bằng pg_constraint,
-- chỉ có CHECK(amount>0), CHECK(payment_type IN ...), FK sales_order_id, FK created_by.
-- Gõ lot_no = 9 cho đơn có 3 lô vẫn INSERT thành công, và tiền đó biến mất khỏi CẢ HAI
-- trục: v_sales_order_lot_payments chỉ dựng vũ trụ lô = sales_order_lots ∪ container.lot_no,
-- còn unassigned_paid_usd chỉ đếm lot_no IS NULL. Sai loại IM LẶNG nhất.
-- Hôm nay 0 dòng mồ côi (2/2 payment đều lot_no NULL) — chính vì thế đây là lúc rẻ nhất.
--
-- ⚠ CỐ Ý KHÔNG ĐẶT NOT NULL và KHÔNG ĐẶT FK:
--   • NOT NULL: 80/89 đơn trong phạm vi A/R chưa chia lô ($8.877.395,42) — ép cứng là
--     CHẶN HẲN việc ghi tiền cho 90% hợp đồng, kế toán sẽ quay về gõ tay deposit_amount.
--   • FK sang sales_order_lots(id): CLAUDE.md đã chốt KHÔNG thêm lot_id vào bảng này
--     (hai nguồn sự thật sẽ lệch). Khoá nhận dạng là (sales_order_id, lot_no).
--   → Dùng trigger kiểm cặp, cho phép NULL.
--
-- Idempotent. KHÔNG có BEGIN/COMMIT (chạy qua RPC agent_sql).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_sop_check_lot_no()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.lot_no IS NULL THEN
    RETURN NEW;                          -- "cả đơn / chưa gắn lô" vẫn hợp lệ
  END IF;

  -- Vũ trụ lô = lô đã chốt ∪ lô suy từ container. Y HỆT getLotBreakdown
  -- (salesOrderPaymentService.ts:375) — lệch định nghĩa là form cho chọn mà DB chặn.
  IF NOT EXISTS (
        SELECT 1 FROM public.sales_order_lots l
        WHERE l.sales_order_id = NEW.sales_order_id AND l.lot_no = NEW.lot_no
      )
     AND NOT EXISTS (
        SELECT 1 FROM public.sales_order_containers c
        WHERE c.sales_order_id = NEW.sales_order_id AND c.lot_no = NEW.lot_no
      )
  THEN
    RAISE EXCEPTION
      'Lô % không tồn tại trong đơn này. Chia lô trước, hoặc để trống (= cả đơn).',
      NEW.lot_no
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sop_check_lot_no ON public.sales_order_payments;
CREATE TRIGGER trg_sop_check_lot_no
  BEFORE INSERT OR UPDATE OF lot_no, sales_order_id ON public.sales_order_payments
  FOR EACH ROW EXECUTE FUNCTION public.fn_sop_check_lot_no();

-- ─── Kiểm chứng (phải trả 0 dòng trước khi tạo trigger, nếu không trigger sẽ chặn sửa) ──
--   SELECT p.id, o.code, p.lot_no FROM sales_order_payments p
--   JOIN sales_orders o ON o.id = p.sales_order_id
--   WHERE p.lot_no IS NOT NULL
--     AND NOT EXISTS (SELECT 1 FROM sales_order_lots l
--                     WHERE l.sales_order_id=p.sales_order_id AND l.lot_no=p.lot_no)
--     AND NOT EXISTS (SELECT 1 FROM sales_order_containers c
--                     WHERE c.sales_order_id=p.sales_order_id AND c.lot_no=p.lot_no);
--   -- đo 27/08/2026: 0 dòng.
