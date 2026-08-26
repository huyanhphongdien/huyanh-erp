-- ============================================================================
-- ĐƠN HÀNG BÁN — P1: LÔ trở thành thực thể thật (sales_order_lots)
-- Ngày: 2026-08-26
--
-- VÌ SAO: 1 hợp đồng có nhiều lô; khách trả tiền THEO TỪNG LÔ, mỗi lô một lần
-- chuyển tiền kèm chứng từ riêng. Nhưng hệ thống đang theo dõi thanh toán ở mức
-- HỢP ĐỒNG (sales_orders.payment_status / actual_payment_amount), nên không trả lời
-- được câu hỏi "lô nào đã thu tiền".
--
-- HIỆN TRẠNG TRƯỚC MIGRATION (đo 2026-08-26):
--   • "Lô" chỉ là một SỐ NGUYÊN rời rạc: sales_order_containers.lot_no (105/210 dòng),
--     sales_order_bookings.lot_no (3 dòng), sales_order_lc_negotiations.lot_no,
--     sales_order_payments.lot_no (0 dòng dùng).
--   • Lô KHÔNG có giá trị tiền ở đâu cả → thiếu MẪU SỐ để nói "đã thu đủ chưa".
--   • sales_orders.lot_number: NULL toàn bộ 104 đơn — cột chết, KHÔNG dùng.
--   • sales_invoices: 0 dòng — không thể lấy hoá đơn làm mắt xích.
--
-- KHOÁ NHẬN DẠNG LÔ = (sales_order_id, lot_no).
--   Cố ý KHÔNG thêm cột lot_id vào containers/payments: cả hai bảng đó đã có sẵn
--   sales_order_id + lot_no, tức đã đủ để trỏ về đúng một lô. Thêm khoá thứ hai chỉ
--   tạo ra hai nguồn sự thật rồi lệch nhau.
--
-- Idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sales_order_lots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id    uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  lot_no            integer NOT NULL,
  lot_label         text,

  -- Khối lượng
  quantity_tons     numeric(12,3),   -- KL cam kết của lô (kế hoạch)
  net_weight_kg     numeric(14,2),   -- KL thực tế, cộng từ container thuộc lô

  -- TIỀN — mẫu số để tính "đã thu đủ chưa"
  unit_price_usd    numeric(14,2),   -- đơn giá áp cho lô này (các lô có thể khác giá)
  value_usd         numeric(14,2),   -- GIÁ TRỊ LÔ. Backfill tính từ KL × đơn giá,
                                     -- nhưng CHO PHÉP SỬA TAY: khách trả theo chứng từ
                                     -- riêng của lô, số trên chứng từ mới là số đúng.

  -- Tiến độ
  etd               date,
  delivered_at      date,
  status            text NOT NULL DEFAULT 'planning',

  -- Chứng từ đi kèm lô (khách trả theo lô → mỗi lô một bộ chứng từ)
  invoice_no        text,
  bl_no             text,

  notes             text,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_sales_order_lots UNIQUE (sales_order_id, lot_no),
  CONSTRAINT chk_sales_order_lots_lot_no CHECK (lot_no > 0),
  CONSTRAINT chk_sales_order_lots_status
    CHECK (status IN ('planning', 'packing', 'shipped', 'delivered', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_sol_order ON public.sales_order_lots (sales_order_id, lot_no);
CREATE INDEX IF NOT EXISTS idx_sol_status ON public.sales_order_lots (status);
CREATE INDEX IF NOT EXISTS idx_sol_etd ON public.sales_order_lots (etd);

COMMENT ON TABLE public.sales_order_lots IS
  'Lô giao hàng của hợp đồng bán. 1 hợp đồng nhiều lô; khách thanh toán THEO LÔ. '
  'Nhận dạng bằng (sales_order_id, lot_no) — cùng khoá mà containers và payments đang dùng.';
COMMENT ON COLUMN public.sales_order_lots.value_usd IS
  'Giá trị lô = MẪU SỐ khi tính đã thu đủ chưa. Backfill = net_weight_kg/1000 × đơn giá, '
  'nhưng phải sửa được bằng tay theo đúng chứng từ phát cho khách.';

-- ─── updated_at tự cập nhật ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_sales_order_lots_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sales_order_lots_touch ON public.sales_order_lots;
CREATE TRIGGER trg_sales_order_lots_touch
  BEFORE UPDATE ON public.sales_order_lots
  FOR EACH ROW EXECUTE FUNCTION public.fn_sales_order_lots_touch();

-- ─── RLS: theo đúng khuôn các bảng sales_* khác (authenticated toàn quyền) ────
ALTER TABLE public.sales_order_lots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.sales_order_lots'::regclass AND polname='sales_order_lots_auth_all') THEN
    CREATE POLICY sales_order_lots_auth_all ON public.sales_order_lots
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ─── VERIFY ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.sales_order_lots') IS NULL THEN
    RAISE EXCEPTION 'P1 FAIL: chưa tạo được bảng sales_order_lots';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.sales_order_lots'::regclass AND polname='sales_order_lots_auth_all') THEN
    RAISE EXCEPTION 'P1 FAIL: thiếu policy cho authenticated';
  END IF;
  RAISE NOTICE 'P1 OK — sales_order_lots sẵn sàng';
END $$;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='sales_order_lots'
ORDER BY ordinal_position;

-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
--   DROP TABLE IF EXISTS public.sales_order_lots;           -- kéo theo dữ liệu lô
--   DROP FUNCTION IF EXISTS public.fn_sales_order_lots_touch();
--   (P1 KHÔNG đụng tới bảng nào đang có dữ liệu nên rollback sạch.)
