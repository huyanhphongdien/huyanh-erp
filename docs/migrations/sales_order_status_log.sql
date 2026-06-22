-- ============================================================================
-- SALES ORDER STATUS LOG — Lịch sử đổi TRẠNG THÁI đơn hàng bán (ai · khi nào · từ→tới)
-- ============================================================================
-- Hiện sales_order_handoffs chỉ log đổi GIAI ĐOẠN (current_stage). Đổi TRẠNG THÁI
-- (status: draft/confirmed/producing/.../delivered/cancelled) CHƯA được log ai đổi.
-- Bảng + trigger này log MỌI lần status đổi, dù từ app, SQL, hay trigger tự động.
--
-- Cơ chế "ai đổi": app set sẵn last_status_changed_by_* trong CÙNG câu UPDATE đổi
-- status. Trigger BEFORE UPDATE đọc 2 cột đó để ghi log, rồi RESET về NULL để lần
-- đổi sau (nếu là SQL/tự động, không set) sẽ ghi "Hệ thống" — tránh gán nhầm.
--
-- An toàn go-live: create if not exists + add column if not exists. Chạy 1 lần.
-- ============================================================================

-- 1) Bảng log
CREATE TABLE IF NOT EXISTS public.sales_order_status_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id   uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  from_status      text,
  to_status        text NOT NULL,
  changed_by_id    uuid,
  changed_by_name  text,
  reason           text,
  source           text DEFAULT 'app',   -- app | system (SQL/trigger tự động)
  created_at       timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_so_status_log_so
  ON public.sales_order_status_log(sales_order_id, created_at DESC);

COMMENT ON TABLE public.sales_order_status_log IS
  'Lịch sử đổi trạng thái đơn hàng bán — ai/khi nào/từ→tới. Tab Lịch sử cho admin.';

-- 2) Cột phụ trên sales_orders để app "mang" người đổi vào trigger
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS last_status_changed_by_id   uuid;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS last_status_changed_by_name text;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS last_status_change_reason   text;

-- 3) Trigger BEFORE UPDATE: log khi status đổi + reset cột "ai đổi"
CREATE OR REPLACE FUNCTION public.fn_log_sales_status_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.sales_order_status_log
      (sales_order_id, from_status, to_status, changed_by_id, changed_by_name, reason, source)
    VALUES (
      NEW.id, OLD.status, NEW.status,
      NEW.last_status_changed_by_id,
      COALESCE(NULLIF(NEW.last_status_changed_by_name, ''), 'Hệ thống / tự động'),
      NEW.last_status_change_reason,
      CASE WHEN NEW.last_status_changed_by_id IS NOT NULL THEN 'app' ELSE 'system' END
    );
    -- Reset để lần đổi sau buộc phải set lại (tránh gán nhầm người cho thay đổi tự động)
    NEW.last_status_changed_by_id   := NULL;
    NEW.last_status_changed_by_name := NULL;
    NEW.last_status_change_reason   := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_sales_status ON public.sales_orders;
CREATE TRIGGER trg_log_sales_status
  BEFORE UPDATE ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_sales_status_change();

-- 4) RLS: nội bộ, authenticated đọc/ghi
ALTER TABLE public.sales_order_status_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS so_status_log_all ON public.sales_order_status_log;
CREATE POLICY so_status_log_all ON public.sales_order_status_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

-- Kiểm: select * from sales_order_status_log order by created_at desc limit 20;
