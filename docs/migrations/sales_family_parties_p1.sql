-- ============================================================================
-- sales_family_parties_p1.sql — Đơn mua tiếp theo HĐ đã ký + Các bên của đơn (Người mua → Người nhận)
-- Đề xuất owner duyệt 17/11/2026 (artifact "Đơn mua tiếp & người nhận hàng").
--
-- KHÔNG THÊM BẢNG. Không đụng sales_order_lots / payments / containers, 3 view tiền theo lô, v_ar_aging_rows,
-- v_sales_order_container_delivery — mỗi đợt mua tiếp là MỘT đơn bình thường (mẫu số công nợ riêng).
--
-- ⚠ ship_to_customer_id CỐ Ý KHÔNG có khoá ngoại sang sales_customers (kiểm bằng trigger fn_so_ship_to_guard):
--   khoá ngoại thứ hai sales_orders → sales_customers làm mọi embed `sales_customers(...)` không ghi khoá đang chạy
--   (app cân getActiveForShipping, phiếu xuất từ phiếu cân, /api/chat) báo PGRST201 "more than one relationship" —
--   hỏng IM LẶNG trên production ngay khi chạy migration. Không có FK thì migration chạy trước/sau deploy đều an toàn.
--   Đọc tên người nhận bằng truy vấn thứ hai theo id (salesOrderService.attachShipTo).
-- ⚠ Thay file CHƯA TỪNG ÁP docs/migrations/sales_contract_no_unique.sql — đừng chạy file cũ.
-- Chạy qua agent_sql: KHÔNG BEGIN/COMMIT (đã nằm trong transaction); chạy lại được.
-- ============================================================================

-- ── Preflight (17/11/2026: 0 | 0 | 0) ─────────────────────────────────────────
-- SELECT count(*) FROM sales_orders WHERE contract_no ~* '-D[0-9]+$';
-- SELECT count(*) FROM (SELECT 1 FROM sales_orders WHERE nullif(btrim(contract_no),'') IS NOT NULL AND status<>'cancelled'
--   GROUP BY upper(regexp_replace(btrim(contract_no),'\s+',' ','g')) HAVING count(*)>1) x;
-- SELECT count(*) FROM sales_orders WHERE nullif(btrim(contract_no),'') IS NULL;

-- ── A. Cột mới ────────────────────────────────────────────────────────────────
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS parent_order_id uuid,                              -- đơn giữ HĐ gốc (luôn trỏ GỐC, không có cấp cháu)
  ADD COLUMN IF NOT EXISTS continuation_seq smallint,                         -- số đợt: gốc NULL (= đợt 1), đợt con ≥ 2, trigger cấp
  ADD COLUMN IF NOT EXISTS docs_cite_root boolean NOT NULL DEFAULT true,      -- ô CONTRACT NO. trên chứng từ in số HĐ gốc
  ADD COLUMN IF NOT EXISTS ship_to_customer_id uuid,                          -- NGƯỜI NHẬN HÀNG theo đơn; NULL = chính người mua
  ADD COLUMN IF NOT EXISTS consignee_name text,                               -- 4 cột CHỮ IN ghi đè ô Consignee/Notify (chỉ để in)
  ADD COLUMN IF NOT EXISTS consignee_address text,
  ADD COLUMN IF NOT EXISTS notify_party text,
  ADD COLUMN IF NOT EXISTS notify_address text;

ALTER TABLE public.sales_customer_export_profiles
  ADD COLUMN IF NOT EXISTS hide_receiver_on_invoice boolean NOT NULL DEFAULT false;   -- "chứng từ trung tính"

COMMENT ON COLUMN public.sales_orders.parent_order_id IS 'Đơn mua tiếp: trỏ đơn GỐC giữ HĐ đã ký (trigger làm phẳng). NULL = HĐ mới.';
COMMENT ON COLUMN public.sales_orders.continuation_seq IS 'Số đợt mua tiếp (≥2), trigger trg_so_family_guard cấp max+1 dưới khoá, không cấp lại số đã huỷ.';
COMMENT ON COLUMN public.sales_orders.docs_cite_root IS 'true: ô CONTRACT NO. trên chứng từ in số HĐ gốc. Đơn cũ nối vào họ đặt false để in lại y như đã phát.';
COMMENT ON COLUMN public.sales_orders.ship_to_customer_id IS 'Người nhận hàng (khách cuối) của đơn này — KHÔNG FK (xem đầu file), kiểm bằng fn_so_ship_to_guard. NULL = người mua.';

-- ── B. Ràng buộc + index ──────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_parent_order_id_fkey') THEN
    ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_parent_order_id_fkey
      FOREIGN KEY (parent_order_id) REFERENCES public.sales_orders(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_so_family_shape') THEN
    ALTER TABLE public.sales_orders ADD CONSTRAINT chk_so_family_shape CHECK (
      (parent_order_id IS NULL AND continuation_seq IS NULL)
      OR (parent_order_id IS NOT NULL AND parent_order_id <> id AND continuation_seq >= 2));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_so_ship_to_not_buyer') THEN
    ALTER TABLE public.sales_orders ADD CONSTRAINT chk_so_ship_to_not_buyer
      CHECK (ship_to_customer_id IS NULL OR ship_to_customer_id <> customer_id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_so_family_seq
  ON public.sales_orders (parent_order_id, continuation_seq) WHERE parent_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_so_ship_to
  ON public.sales_orders (ship_to_customer_id) WHERE ship_to_customer_id IS NOT NULL;
-- Số đơn (contract_no) DUY NHẤT sau chuẩn hoá hoa/thường + khoảng trắng; đơn huỷ được trùng.
CREATE UNIQUE INDEX IF NOT EXISTS ux_sales_orders_contract_no_norm_active
  ON public.sales_orders (upper(regexp_replace(btrim(contract_no), '\s+', ' ', 'g')))
  WHERE nullif(btrim(contract_no), '') IS NOT NULL AND status <> 'cancelled';

-- ── C. Trigger luật HỌ HĐ ─────────────────────────────────────────────────────
-- Chỉ giữ luật họ; KHÔNG ghi số hay ngày HĐ (ô CONTRACT NO. của đợt đọc số gốc qua liên kết).
CREATE OR REPLACE FUNCTION public.fn_so_family_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p record; n_all int := 0; n_live int := 0;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT count(*), count(*) FILTER (WHERE c.status <> 'cancelled') INTO n_all, n_live
      FROM public.sales_orders c WHERE c.parent_order_id = NEW.id;
    IF n_all > 0 THEN
      IF NEW.parent_order_id IS NOT NULL THEN
        RAISE EXCEPTION 'Đơn % đang là HĐ gốc của % đơn mua tiếp — không biến nó thành đơn mua tiếp được', coalesce(NEW.contract_no, NEW.code), n_all; END IF;
      IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
        RAISE EXCEPTION 'HĐ gốc % đã có % đơn mua tiếp — không đổi người mua được', coalesce(NEW.contract_no, NEW.code), n_all; END IF;
      IF NEW.currency IS DISTINCT FROM OLD.currency THEN
        RAISE EXCEPTION 'HĐ gốc % đã có đơn mua tiếp — không đổi đồng tiền được', coalesce(NEW.contract_no, NEW.code); END IF;
      IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' AND n_live > 0 THEN
        RAISE EXCEPTION 'HĐ gốc % còn % đơn mua tiếp chưa huỷ — huỷ các đợt đó trước', coalesce(NEW.contract_no, NEW.code), n_live; END IF;
    END IF;
  END IF;

  IF NEW.parent_order_id IS NULL THEN NEW.continuation_seq := NULL; RETURN NEW; END IF;

  -- Đợt chỉ đổi trạng thái (hoặc cột khác) → bỏ qua kiểm họ
  IF TG_OP = 'UPDATE' AND NEW.parent_order_id IS NOT DISTINCT FROM OLD.parent_order_id
     AND NEW.customer_id IS NOT DISTINCT FROM OLD.customer_id AND NEW.currency IS NOT DISTINCT FROM OLD.currency
     AND NEW.continuation_seq IS NOT DISTINCT FROM OLD.continuation_seq THEN
    RETURN NEW;
  END IF;

  SELECT id, parent_order_id, customer_id, currency, contract_no, code, status INTO p
    FROM public.sales_orders WHERE id = NEW.parent_order_id;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy HĐ gốc của đơn mua tiếp'; END IF;
  IF p.parent_order_id IS NOT NULL THEN       -- làm phẳng: luôn trỏ GỐC
    NEW.parent_order_id := p.parent_order_id;
    SELECT id, parent_order_id, customer_id, currency, contract_no, code, status INTO p
      FROM public.sales_orders WHERE id = NEW.parent_order_id;
  END IF;
  IF p.id = NEW.id THEN RAISE EXCEPTION 'Đơn không thể mua tiếp theo chính nó'; END IF;
  IF p.status = 'cancelled' THEN
    RAISE EXCEPTION 'HĐ gốc % đã huỷ — không tạo đơn mua tiếp được', coalesce(p.contract_no, p.code); END IF;
  IF nullif(btrim(p.contract_no), '') IS NULL THEN
    RAISE EXCEPTION 'Đơn gốc % chưa có số HĐ — điền số HĐ cho đơn gốc trước', p.code; END IF;
  IF NEW.customer_id IS DISTINCT FROM p.customer_id THEN
    RAISE EXCEPTION 'Đơn mua tiếp phải cùng NGƯỜI MUA với HĐ gốc % — hàng giao cho công ty khác thì điền ô Người nhận hàng', p.contract_no; END IF;
  IF coalesce(NEW.currency, 'USD') <> coalesce(p.currency, 'USD') THEN
    RAISE EXCEPTION 'Đơn mua tiếp phải cùng đồng tiền với HĐ gốc % (%) — đổi đồng tiền thì làm HĐ mới', p.contract_no, coalesce(p.currency, 'USD'); END IF;

  IF NEW.continuation_seq IS NULL OR (TG_OP = 'UPDATE' AND NEW.parent_order_id IS DISTINCT FROM OLD.parent_order_id) THEN
    PERFORM pg_advisory_xact_lock(hashtext('so_family:' || NEW.parent_order_id::text));
    SELECT coalesce(max(continuation_seq), 1) + 1 INTO NEW.continuation_seq
      FROM public.sales_orders WHERE parent_order_id = NEW.parent_order_id AND id <> NEW.id;   -- tính cả đợt đã huỷ: không cấp lại
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_so_family_guard ON public.sales_orders;
CREATE TRIGGER trg_so_family_guard
  BEFORE INSERT OR UPDATE OF parent_order_id, customer_id, currency, continuation_seq, status ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_so_family_guard();

-- ── D. Trigger kiểm NGƯỜI NHẬN (thay cho khoá ngoại) ─────────────────────────
CREATE OR REPLACE FUNCTION public.fn_so_ship_to_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ship_to_customer_id IS NOT NULL THEN
    IF NEW.ship_to_customer_id = NEW.customer_id THEN
      NEW.ship_to_customer_id := NULL;      -- người nhận = người mua → một cách ghi duy nhất (NULL)
    ELSIF NOT EXISTS (SELECT 1 FROM public.sales_customers s WHERE s.id = NEW.ship_to_customer_id) THEN
      RAISE EXCEPTION 'Không tìm thấy khách nhận hàng — chọn lại ô Người nhận hàng';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_so_ship_to_guard ON public.sales_orders;
CREATE TRIGGER trg_so_ship_to_guard
  BEFORE INSERT OR UPDATE OF ship_to_customer_id, customer_id ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_so_ship_to_guard();

-- ── E. View ───────────────────────────────────────────────────────────────────
-- Khách cuối: 1 dòng / đơn chưa huỷ. CỐ Ý KHÔNG CÓ CỘT TIỀN (công nợ/doanh thu luôn theo người mua).
-- "Đã giao" đọc từ v_sales_order_container_delivery — không tự viết luật. Bản sao luật ở TS: salesTypes.receiverOf
-- (sửa một nơi sửa cả hai).
CREATE OR REPLACE VIEW public.v_sales_order_end_customer WITH (security_invoker = on) AS
SELECT o.id AS sales_order_id, o.code, o.contract_no, o.status, o.order_date, o.etd, o.quantity_tons,
       round(coalesce(dl.kg, 0) / 1000.0, 3) AS delivered_tons,
       o.customer_id AS buyer_id, o.ship_to_customer_id,
       coalesce(o.ship_to_customer_id, o.customer_id) AS end_customer_id,
       (o.ship_to_customer_id IS NOT NULL) AS via_intermediary,
       coalesce(o.parent_order_id, o.id) AS family_root_id
FROM public.sales_orders o
LEFT JOIN LATERAL (
  SELECT sum(d.net_weight_kg) AS kg FROM public.v_sales_order_container_delivery d
  WHERE d.sales_order_id = o.id AND d.delivery_state = 'delivered'
) dl ON true
WHERE o.status <> 'cancelled';

-- Phải LUÔN 0 dòng.
CREATE OR REPLACE VIEW public.v_sales_order_family_drift WITH (security_invoker = on) AS
SELECT * FROM (
  SELECT c.id AS sales_order_id, c.code, c.contract_no, p.contract_no AS root_contract_no,
    CASE WHEN p.parent_order_id IS NOT NULL THEN 'long_2_tang'
         WHEN c.customer_id IS DISTINCT FROM p.customer_id THEN 'khac_nguoi_mua'
         WHEN coalesce(c.currency, 'USD') <> coalesce(p.currency, 'USD') THEN 'khac_dong_tien'
         WHEN p.status = 'cancelled' AND c.status <> 'cancelled' THEN 'goc_da_huy'
         WHEN nullif(btrim(p.contract_no), '') IS NULL THEN 'goc_chua_co_so_hd'
         WHEN left(c.contract_no, length(p.contract_no) + 2) = p.contract_no || '-D'
              AND c.contract_no <> p.contract_no || '-D' || c.continuation_seq THEN 'hau_to_lech_so_dot'
    END AS issue
  FROM public.sales_orders c JOIN public.sales_orders p ON p.id = c.parent_order_id
  UNION ALL
  SELECT o.id, o.code, o.contract_no, NULL::varchar, 'nguoi_nhan_mat'
  FROM public.sales_orders o
  WHERE o.ship_to_customer_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.sales_customers s WHERE s.id = o.ship_to_customer_id)
) x WHERE issue IS NOT NULL;

NOTIFY pgrst, 'reload schema';

-- ── Kiểm sau khi chạy ─────────────────────────────────────────────────────────
-- SELECT count(*) FROM v_sales_order_family_drift;   -- 0
-- SELECT count(*) FROM sales_orders WHERE parent_order_id IS NOT NULL OR ship_to_customer_id IS NOT NULL;   -- 0 trước P5
