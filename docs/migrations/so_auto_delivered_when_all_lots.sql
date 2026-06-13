-- ============================================================================
-- ĐƠN HÀNG BÁN → tự chuyển "Đã giao" KHI TẤT CẢ container (mọi lô) đã giao
-- Date: 2026-06-13
-- ============================================================================
-- "Đã giao" = container có dòng lệnh điều động với actual_weight_kg (đã cân xuất).
-- Khi cân xuất ghi actual_weight_kg vào dispatch_order_lines → trigger kiểm tra:
--   đã tạo đủ container kế hoạch + TẤT CẢ đã giao → sales_orders.status = 'delivered'.
-- SECURITY DEFINER (chạy được từ app cân role ANON). EXCEPTION-safe: lỗi KHÔNG chặn cân.
-- Idempotent.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_so_delivered_when_all_lots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_so_id     uuid;
  v_total     int;   -- số container đã tạo của đơn
  v_delivered int;   -- số container đã giao (đã cân xuất)
  v_planned   int;   -- số container kế hoạch (sales_orders.container_count)
  v_status    text;
BEGIN
  IF NEW.actual_weight_kg IS NULL OR NEW.sales_order_container_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.sales_order_id INTO v_so_id
  FROM public.sales_order_containers c
  WHERE c.id = NEW.sales_order_container_id;
  IF v_so_id IS NULL THEN RETURN NEW; END IF;

  SELECT count(*) INTO v_total
  FROM public.sales_order_containers
  WHERE sales_order_id = v_so_id;

  SELECT count(DISTINCT c.id) INTO v_delivered
  FROM public.sales_order_containers c
  JOIN public.dispatch_order_lines dl ON dl.sales_order_container_id = c.id
  WHERE c.sales_order_id = v_so_id
    AND dl.actual_weight_kg IS NOT NULL;

  SELECT COALESCE(container_count, v_total), status
    INTO v_planned, v_status
  FROM public.sales_orders
  WHERE id = v_so_id;

  -- Đã tạo đủ container kế hoạch + tất cả đã giao + chưa ở trạng thái cuối → Đã giao.
  IF v_total > 0
     AND v_total >= COALESCE(v_planned, v_total)
     AND v_delivered >= v_total
     AND v_status NOT IN ('delivered', 'invoiced', 'paid', 'cancelled') THEN
    UPDATE public.sales_orders SET status = 'delivered' WHERE id = v_so_id;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;  -- không bao giờ chặn nghiệp vụ cân
END $$;

DROP TRIGGER IF EXISTS trg_so_delivered_when_all_lots ON public.dispatch_order_lines;
CREATE TRIGGER trg_so_delivered_when_all_lots
  AFTER INSERT OR UPDATE OF actual_weight_kg ON public.dispatch_order_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_so_delivered_when_all_lots();

DO $$ BEGIN
  RAISE NOTICE '═══ so_auto_delivered_when_all_lots: trigger created ═══';
END $$;
