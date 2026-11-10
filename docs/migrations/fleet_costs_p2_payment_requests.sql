-- ============================================================================
-- CHI PHÍ ĐỘI XE — Đợt 2 (10/11/2026): ĐỀ NGHỊ THANH TOÁN chi phí xe cho tài xế
-- File: docs/migrations/fleet_costs_p2_payment_requests.sql  (chạy SAU fleet_costs_p1.sql)
--
-- Áp mẫu "Đề nghị thanh toán" của thanh toán mủ (payment_requests, TMMN-…) cho chi phí xe:
--   · fleet_payment_requests       1 phiếu = 1 tài xế × 1 kỳ (tháng); mã TTDX-YYMM-seq; trạng thái
--                                   draft → submitted → approved → paid (+ cancelled) như thanh toán mủ
--   · fleet_payment_request_lines  dòng chuyến (amount dương = chi được tính của chuyến, quy đổi VNĐ),
--                                   dòng tạm ứng (amount ÂM = khấu trừ), dòng tay
--   · dispatch_orders.fleet_payment_request_id / driver_advances.fleet_payment_request_id:
--                                   chuyến / tạm ứng đã gom vào phiếu nào (chặn gom hai lần; huỷ phiếu thì nhả)
-- Tiền thực chi = net_amount = Σ chi được tính − Σ tạm ứng khấu trừ. Cước thuê xe ngoài KHÔNG
-- vào phiếu của tài xế (trả cho nhà xe, luồng khác) — view có cột counted_driver_vnd_equiv.
-- Idempotent. Không BEGIN/COMMIT.
-- ============================================================================

-- ─── 1. Bảng phiếu ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fleet_payment_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text UNIQUE,                               -- TTDX-YYMM-seq (trigger)
  request_date    date NOT NULL DEFAULT CURRENT_DATE,
  period_ym       text,                                      -- kỳ chi phí 'YYYY-MM'
  driver_id       uuid REFERENCES public.fleet_drivers(id) ON DELETE RESTRICT,
  payee_name      text,                                      -- người nhận tiền (mặc định = tài xế)
  payment_method  text NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash','transfer_company','transfer_fund')),
  payee_account   text,                                      -- số TK / tên TK khi chuyển khoản
  title           text,
  reason          text,
  note            text,
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','paid','cancelled')),
  total_expense   numeric(16,2) NOT NULL DEFAULT 0,          -- Σ dòng dương (chuyến + tay)
  total_advance   numeric(16,2) NOT NULL DEFAULT 0,          -- Σ |dòng tạm ứng|
  net_amount      numeric(16,2) NOT NULL DEFAULT 0,          -- Σ amount (số thực chi; âm = tài xế nộp lại)
  line_count      integer NOT NULL DEFAULT 0,
  created_by      uuid,
  submitted_at    timestamptz,
  approved_at     timestamptz,
  approved_by     uuid,
  paid_at         timestamptz,
  paid_by         uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fleet_pr_status ON public.fleet_payment_requests(status);
CREATE INDEX IF NOT EXISTS idx_fleet_pr_driver ON public.fleet_payment_requests(driver_id, period_ym);
COMMENT ON TABLE public.fleet_payment_requests IS 'Đề nghị thanh toán chi phí xe cho tài xế (mẫu như thanh toán mủ). net_amount = chi được tính − tạm ứng khấu trừ.';

CREATE TABLE IF NOT EXISTS public.fleet_payment_request_lines (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id         uuid NOT NULL REFERENCES public.fleet_payment_requests(id) ON DELETE CASCADE,
  line_type          text NOT NULL CHECK (line_type IN ('trip','advance','manual')),
  dispatch_order_id  uuid REFERENCES public.dispatch_orders(id) ON DELETE SET NULL,
  advance_id         uuid REFERENCES public.driver_advances(id) ON DELETE SET NULL,
  description        text NOT NULL,
  unit               text DEFAULT 'chuyến',
  qty                numeric(10,2) NOT NULL DEFAULT 1,
  unit_price         numeric(16,2),
  amount             numeric(16,2) NOT NULL,                 -- dòng tạm ứng: ÂM
  note               text,
  sort_order         integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fleet_pr_lines_req ON public.fleet_payment_request_lines(request_id, sort_order);

ALTER TABLE public.dispatch_orders
  ADD COLUMN IF NOT EXISTS fleet_payment_request_id uuid REFERENCES public.fleet_payment_requests(id) ON DELETE SET NULL;
ALTER TABLE public.driver_advances
  ADD COLUMN IF NOT EXISTS fleet_payment_request_id uuid REFERENCES public.fleet_payment_requests(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_dispatch_orders_fleet_pr ON public.dispatch_orders(fleet_payment_request_id) WHERE fleet_payment_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_driver_advances_fleet_pr ON public.driver_advances(fleet_payment_request_id) WHERE fleet_payment_request_id IS NOT NULL;
COMMENT ON COLUMN public.dispatch_orders.fleet_payment_request_id IS 'Chuyến đã gom vào đề nghị thanh toán nào (NULL = chưa). Huỷ phiếu thì nhả.';
COMMENT ON COLUMN public.driver_advances.fleet_payment_request_id IS 'Tạm ứng đã khấu trừ ở đề nghị thanh toán nào (NULL = chưa đối soát).';

-- ─── 2. Mã phiếu TTDX-YYMM-seq ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_fleet_pr_code()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prefix text; n int;
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    prefix := 'TTDX-' || to_char(NEW.request_date, 'YYMM') || '-';
    SELECT coalesce(max((regexp_match(code, '(\d+)$'))[1]::int), 0) + 1 INTO n
      FROM public.fleet_payment_requests WHERE code LIKE prefix || '%';
    NEW.code := prefix || lpad(n::text, 3, '0');
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_fleet_pr_code ON public.fleet_payment_requests;
CREATE TRIGGER trg_fleet_pr_code BEFORE INSERT OR UPDATE ON public.fleet_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.fn_fleet_pr_code();

-- ─── 3. Dòng: chỉ sửa khi phiếu NHÁP; tổng tự tính ─────────────────────────
CREATE OR REPLACE FUNCTION public.fn_fleet_pr_line_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
  SELECT status INTO st FROM public.fleet_payment_requests WHERE id = coalesce(NEW.request_id, OLD.request_id);
  IF st IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Đề nghị thanh toán không ở trạng thái Nháp — không sửa được dòng' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.line_type = 'advance' AND NEW.amount > 0 THEN NEW.amount := -NEW.amount; END IF;   -- tạm ứng luôn là khấu trừ
  IF NEW.line_type <> 'advance' AND NEW.amount < 0 THEN
    RAISE EXCEPTION 'Dòng chi phải có số tiền dương' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_fleet_pr_line_guard ON public.fleet_payment_request_lines;
CREATE TRIGGER trg_fleet_pr_line_guard BEFORE INSERT OR UPDATE OR DELETE ON public.fleet_payment_request_lines
  FOR EACH ROW EXECUTE FUNCTION public.fn_fleet_pr_line_guard();

CREATE OR REPLACE FUNCTION public.fn_fleet_pr_recompute()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid uuid;
BEGIN
  rid := coalesce(NEW.request_id, OLD.request_id);
  UPDATE public.fleet_payment_requests r SET
    total_expense = coalesce((SELECT sum(amount) FROM public.fleet_payment_request_lines l WHERE l.request_id = rid AND l.amount > 0), 0),
    total_advance = coalesce((SELECT -sum(amount) FROM public.fleet_payment_request_lines l WHERE l.request_id = rid AND l.line_type = 'advance'), 0),
    net_amount    = coalesce((SELECT sum(amount) FROM public.fleet_payment_request_lines l WHERE l.request_id = rid), 0),
    line_count    = (SELECT count(*) FROM public.fleet_payment_request_lines l WHERE l.request_id = rid),
    updated_at    = now()
  WHERE r.id = rid;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_fleet_pr_recompute ON public.fleet_payment_request_lines;
CREATE TRIGGER trg_fleet_pr_recompute AFTER INSERT OR UPDATE OR DELETE ON public.fleet_payment_request_lines
  FOR EACH ROW EXECUTE FUNCTION public.fn_fleet_pr_recompute();

-- ─── 4. View chuyến: thêm phần chi của TÀI XẾ (không gồm cước thuê) + phiếu đã gom ──
DROP VIEW IF EXISTS public.v_fleet_cost_trips;
CREATE VIEW public.v_fleet_cost_trips AS
SELECT
  o.id AS dispatch_order_id, o.code, o.dispatch_date, o.return_date, to_char(o.dispatch_date, 'YYYY-MM') AS ym,
  o.trip_type, o.status, o.driver_id, o.driver_name, o.tractor_vehicle_id, o.tractor_plate, o.trailer_plate,
  o.is_hired, o.hire_company, o.hire_cost, o.customer_name, o.destination, o.pickup_location, o.reason,
  o.total_weight, o.route_name, o.standard_days, o.odometer_start_km, o.odometer_end_km,
  CASE WHEN o.odometer_start_km IS NOT NULL AND o.odometer_end_km IS NOT NULL THEN o.odometer_end_km - o.odometer_start_km END AS trip_km,
  CASE WHEN o.return_date IS NOT NULL THEN (o.return_date - o.dispatch_date) + 1 END AS trip_days,
  CASE WHEN o.return_date IS NOT NULL AND o.standard_days IS NOT NULL
       THEN greatest(((o.return_date - o.dispatch_date) + 1) - o.standard_days, 0) END AS over_days,
  o.cost_status, o.cost_reviewed_by, o.cost_reviewed_at, o.cost_note,
  coalesce(e.counted_vnd, 0)   + CASE WHEN o.is_hired AND coalesce(o.hire_cost, 0) > 0 THEN o.hire_cost ELSE 0 END AS counted_vnd,
  coalesce(e.counted_lak, 0)   AS counted_lak,
  coalesce(e.uncounted_vnd, 0) AS uncounted_vnd,
  coalesce(e.uncounted_lak, 0) AS uncounted_lak,
  coalesce(e.counted_vnd_equiv, 0) + CASE WHEN o.is_hired AND coalesce(o.hire_cost, 0) > 0 THEN o.hire_cost ELSE 0 END AS counted_vnd_equiv,
  coalesce(e.uncounted_vnd_equiv, 0) AS uncounted_vnd_equiv,
  coalesce(e.n_expenses, 0) AS n_expenses,
  coalesce(e.n_missing_receipt, 0) AS n_missing_receipt,
  e.kinds,
  coalesce(a.adv_vnd, 0) AS adv_vnd,
  coalesce(a.adv_lak, 0) AS adv_lak,
  -- Đợt 2: phần TÀI XẾ được thanh toán (không gồm cước thuê xe ngoài) + phiếu đã gom
  coalesce(e.counted_vnd_equiv, 0) AS counted_driver_vnd_equiv,
  o.fleet_payment_request_id,
  pr.code   AS payment_request_code,
  pr.status AS payment_request_status
FROM public.dispatch_orders o
LEFT JOIN public.fleet_payment_requests pr ON pr.id = o.fleet_payment_request_id
LEFT JOIN LATERAL (
  SELECT
    sum(x.amount)     FILTER (WHERE x.counted     AND x.currency = 'VND') AS counted_vnd,
    sum(x.amount)     FILTER (WHERE x.counted     AND x.currency = 'LAK') AS counted_lak,
    sum(x.amount)     FILTER (WHERE NOT x.counted AND x.currency = 'VND') AS uncounted_vnd,
    sum(x.amount)     FILTER (WHERE NOT x.counted AND x.currency = 'LAK') AS uncounted_lak,
    sum(x.amount_vnd) FILTER (WHERE x.counted)     AS counted_vnd_equiv,
    sum(x.amount_vnd) FILTER (WHERE NOT x.counted) AS uncounted_vnd_equiv,
    count(*) AS n_expenses,
    count(*) FILTER (WHERE x.counted AND NOT EXISTS (SELECT 1 FROM public.dispatch_expense_files f WHERE f.expense_id = x.id)) AS n_missing_receipt,
    string_agg(DISTINCT x.kind, ',') AS kinds
  FROM public.dispatch_expenses x WHERE x.dispatch_order_id = o.id
) e ON true
LEFT JOIN LATERAL (
  SELECT sum(amount) FILTER (WHERE currency = 'VND') AS adv_vnd,
         sum(amount) FILTER (WHERE currency = 'LAK') AS adv_lak
  FROM public.driver_advances a WHERE a.dispatch_order_id = o.id
) a ON true
WHERE o.status <> 'cancelled';
COMMENT ON VIEW public.v_fleet_cost_trips IS 'Chi phí theo chuyến: km/ngày/vượt + tổng chi theo đồng tiền (cước thuê ngoài cộng vào counted_vnd; counted_driver_vnd_equiv = phần tài xế, không gồm cước thuê). Trang và Excel đọc view này.';
GRANT SELECT ON public.v_fleet_cost_trips TO authenticated;

-- ─── 5. RLS ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  EXECUTE 'ALTER TABLE public.fleet_payment_requests      ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.fleet_payment_request_lines ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS fleet_pr_auth_all       ON public.fleet_payment_requests';
  EXECUTE 'DROP POLICY IF EXISTS fleet_pr_lines_auth_all ON public.fleet_payment_request_lines';
  EXECUTE 'CREATE POLICY fleet_pr_auth_all       ON public.fleet_payment_requests      FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY fleet_pr_lines_auth_all ON public.fleet_payment_request_lines FOR ALL TO authenticated USING (true) WITH CHECK (true)';
END $$;

-- ─── 6. Khoá khoản chi khi chuyến đã gom vào đề nghị thanh toán còn hiệu lực ─
-- (số tiền đã chép sang dòng phiếu; muốn sửa thì bỏ chuyến khỏi phiếu nháp trước)
CREATE OR REPLACE FUNCTION public.fn_dispatch_expense_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o record; pr_status text;
BEGIN
  SELECT driver_id, cost_status, fleet_payment_request_id INTO o FROM public.dispatch_orders
   WHERE id = coalesce(NEW.dispatch_order_id, OLD.dispatch_order_id);
  IF o.cost_status = 'reviewed' THEN
    RAISE EXCEPTION 'Lệnh đã duyệt chi phí (khoá). Mở lại lệnh trước khi sửa khoản chi.' USING ERRCODE = 'check_violation';
  END IF;
  IF o.fleet_payment_request_id IS NOT NULL THEN
    SELECT status INTO pr_status FROM public.fleet_payment_requests WHERE id = o.fleet_payment_request_id;
    IF pr_status IS DISTINCT FROM 'cancelled' THEN
      RAISE EXCEPTION 'Chuyến đã gom vào đề nghị thanh toán — bỏ chuyến khỏi phiếu nháp trước khi sửa khoản chi.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.driver_id IS NULL THEN NEW.driver_id := o.driver_id; END IF;
  IF NEW.currency = 'VND' THEN NEW.fx_rate_vnd := NULL; END IF;
  IF NEW.counted THEN NEW.uncounted_reason := NULL; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
