-- ============================================================================
-- CHI PHÍ ĐỘI XE — Đợt 1 (10/11/2026): quản lý chi phí chuyến qua Lệnh điều động
-- File: docs/migrations/fleet_costs_p1.sql
--
-- Số hoá "Form theo dõi chi phí tài xế.xlsx" (1 sheet / tài xế / tháng, 1 dòng = 1 chuyến).
-- Mỗi chuyến = một dispatch_orders đã có. Thêm:
--   · fleet_routes            danh mục hành trình (km ước, số ngày chuẩn) — HC-TH khai một lần
--   · dispatch_orders         + ngày về, km đồng hồ đi/về, hành trình, số ngày chuẩn, trạng thái duyệt chi phí
--   · dispatch_expenses       1 dòng = 1 khoản chi (VND | LAK, cờ "được tính", khoá khi lệnh đã duyệt)
--   · dispatch_expense_files  ảnh hoá đơn / phiếu của khoản chi (bucket invoice-images, thư mục fleet-receipts/)
--   · driver_advances         tạm ứng tài xế (TU-YYMM-seq), gắn lệnh tuỳ chọn
--   · v_fleet_cost_trips      1 dòng = 1 lệnh: km, ngày, vượt, tổng chi theo đồng tiền, cước thuê ngoài
--   · v_fleet_cost_month      tài xế × tháng × đồng tiền: tạm ứng − chi được tính = còn lại
-- Cước thuê xe ngoài (dispatch_orders.hire_cost) KHÔNG chép thành dòng chi — view cộng thẳng, tránh nhập hai lần.
-- Chưa làm: lương chuyến (đơn giá, hỗ trợ vượt ngày, dầu/km, tấn), giá vốn vận chuyển theo đơn hàng.
-- Idempotent: chạy lại không đổi gì. Không có BEGIN/COMMIT (chạy qua agent_sql).
-- ============================================================================

-- ─── 1. Danh mục hành trình ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fleet_routes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL UNIQUE,            -- "Phong Điền → Cảng Tiên Sa, Đà Nẵng"
  origin         text,
  destination    text,
  est_km         numeric(8,1),                    -- km ước cả đi lẫn về
  standard_days  numeric(4,1),                    -- số ngày chuẩn của chuyến
  note           text,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.fleet_routes IS 'Danh mục hành trình xe (km ước, số ngày chuẩn). Chọn khi nhập chuyến; chuyến lạ gõ tay route_name.';

-- ─── 2. Cột chuyến trên lệnh điều động ──────────────────────────────────────
ALTER TABLE public.dispatch_orders
  ADD COLUMN IF NOT EXISTS return_date        date,
  ADD COLUMN IF NOT EXISTS odometer_start_km  numeric(10,1),
  ADD COLUMN IF NOT EXISTS odometer_end_km    numeric(10,1),
  ADD COLUMN IF NOT EXISTS route_id           uuid REFERENCES public.fleet_routes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS route_name         text,
  ADD COLUMN IF NOT EXISTS standard_days      numeric(4,1),
  ADD COLUMN IF NOT EXISTS cost_status        text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS cost_reviewed_by   uuid,
  ADD COLUMN IF NOT EXISTS cost_reviewed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS cost_note          text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dispatch_orders_cost_status_chk') THEN
    ALTER TABLE public.dispatch_orders ADD CONSTRAINT dispatch_orders_cost_status_chk CHECK (cost_status IN ('open','reviewed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dispatch_orders_return_after_go_chk') THEN
    ALTER TABLE public.dispatch_orders ADD CONSTRAINT dispatch_orders_return_after_go_chk CHECK (return_date IS NULL OR return_date >= dispatch_date);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dispatch_orders_odometer_chk') THEN
    ALTER TABLE public.dispatch_orders ADD CONSTRAINT dispatch_orders_odometer_chk
      CHECK (odometer_start_km IS NULL OR odometer_end_km IS NULL OR odometer_end_km >= odometer_start_km);
  END IF;
END $$;

COMMENT ON COLUMN public.dispatch_orders.return_date       IS 'Ngày xe về. Tổng ngày = return_date − dispatch_date + 1 (như cột "Tổng ngày đi và về" của form).';
COMMENT ON COLUMN public.dispatch_orders.odometer_start_km IS 'Số km trên đồng hồ lúc đi';
COMMENT ON COLUMN public.dispatch_orders.odometer_end_km   IS 'Số km trên đồng hồ lúc về. Km chuyến = end − start.';
COMMENT ON COLUMN public.dispatch_orders.standard_days     IS 'Số ngày chuẩn của hành trình (chép từ fleet_routes lúc chọn, sửa tay được). Vượt = tổng ngày − chuẩn.';
COMMENT ON COLUMN public.dispatch_orders.cost_status       IS 'open = HC-TH đang nhập · reviewed = kế toán đã duyệt, khoá sửa khoản chi';

-- ─── 3. Khoản chi của chuyến ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dispatch_expenses (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_order_id  uuid NOT NULL REFERENCES public.dispatch_orders(id) ON DELETE CASCADE,
  driver_id          uuid REFERENCES public.fleet_drivers(id) ON DELETE SET NULL,   -- snapshot từ lệnh lúc ghi
  expense_date       date NOT NULL DEFAULT CURRENT_DATE,
  kind               text NOT NULL
                       CHECK (kind IN ('fuel','toll','port','loading','meals','repair','border','parking','other')),
  description        text,
  amount             numeric(14,2) NOT NULL CHECK (amount > 0),
  currency           text NOT NULL DEFAULT 'VND' CHECK (currency IN ('VND','LAK')),
  fx_rate_vnd        numeric(12,4) CHECK (fx_rate_vnd IS NULL OR fx_rate_vnd > 0),   -- 1 LAK = ? VNĐ, chỉ dùng khi LAK
  amount_vnd         numeric(16,2) GENERATED ALWAYS AS (
                       CASE WHEN currency = 'VND' THEN amount ELSE round(amount * coalesce(fx_rate_vnd, 0), 0) END
                     ) STORED,
  counted            boolean NOT NULL DEFAULT true,     -- true = công ty chịu (được tính) · false = tài xế chịu
  uncounted_reason   text,
  note               text,
  created_by         uuid,                               -- auth uid (như dispatch_orders.created_by)
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dispatch_expenses_order  ON public.dispatch_expenses(dispatch_order_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_expenses_driver ON public.dispatch_expenses(driver_id, expense_date);
COMMENT ON TABLE public.dispatch_expenses IS 'Khoản chi của một chuyến (lệnh điều động). amount_vnd tự quy đổi khi LAK. Khoá khi lệnh cost_status = reviewed.';

CREATE TABLE IF NOT EXISTS public.dispatch_expense_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id    uuid NOT NULL REFERENCES public.dispatch_expenses(id) ON DELETE CASCADE,
  storage_path  text NOT NULL,
  public_url    text NOT NULL,
  file_name     text,
  mime          text,
  size_bytes    integer,
  uploaded_by   uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dispatch_expense_files_expense ON public.dispatch_expense_files(expense_id);

-- ─── 4. Tạm ứng tài xế ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.driver_advances (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code               text UNIQUE,                         -- TU-YYMM-seq, trigger sinh khi để trống
  driver_id          uuid NOT NULL REFERENCES public.fleet_drivers(id) ON DELETE RESTRICT,
  advance_date       date NOT NULL DEFAULT CURRENT_DATE,
  amount             numeric(14,2) NOT NULL CHECK (amount > 0),
  currency           text NOT NULL DEFAULT 'VND' CHECK (currency IN ('VND','LAK')),
  fx_rate_vnd        numeric(12,4) CHECK (fx_rate_vnd IS NULL OR fx_rate_vnd > 0),
  dispatch_order_id  uuid REFERENCES public.dispatch_orders(id) ON DELETE SET NULL,   -- gắn chuyến: tuỳ chọn
  paid_by_name       text,                                -- người chi tiền (HC-TH / thủ quỹ)
  note               text,
  created_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_driver_advances_driver ON public.driver_advances(driver_id, advance_date);
CREATE INDEX IF NOT EXISTS idx_driver_advances_order  ON public.driver_advances(dispatch_order_id) WHERE dispatch_order_id IS NOT NULL;
COMMENT ON TABLE public.driver_advances IS 'Tạm ứng tiền đi đường cho tài xế. Đối soát theo THÁNG × tài xế: tạm ứng − chi được tính = còn lại. Sổ riêng, chưa nối quỹ.';

CREATE OR REPLACE FUNCTION public.fn_driver_advance_code()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prefix text; n int;
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    prefix := 'TU-' || to_char(NEW.advance_date, 'YYMM') || '-';
    SELECT coalesce(max((regexp_match(code, '(\d+)$'))[1]::int), 0) + 1 INTO n
      FROM public.driver_advances WHERE code LIKE prefix || '%';
    NEW.code := prefix || lpad(n::text, 3, '0');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_driver_advance_code ON public.driver_advances;
CREATE TRIGGER trg_driver_advance_code BEFORE INSERT ON public.driver_advances
  FOR EACH ROW EXECUTE FUNCTION public.fn_driver_advance_code();

-- ─── 5. Trigger: snapshot tài xế + khoá khi lệnh đã duyệt + updated_at ──────
CREATE OR REPLACE FUNCTION public.fn_dispatch_expense_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o record;
BEGIN
  SELECT driver_id, cost_status INTO o FROM public.dispatch_orders
   WHERE id = coalesce(NEW.dispatch_order_id, OLD.dispatch_order_id);
  IF o.cost_status = 'reviewed' THEN
    RAISE EXCEPTION 'Lệnh đã duyệt chi phí (khoá). Mở lại lệnh trước khi sửa khoản chi.' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.driver_id IS NULL THEN NEW.driver_id := o.driver_id; END IF;
  IF NEW.currency = 'VND' THEN NEW.fx_rate_vnd := NULL; END IF;
  IF NEW.counted THEN NEW.uncounted_reason := NULL; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_dispatch_expense_guard ON public.dispatch_expenses;
CREATE TRIGGER trg_dispatch_expense_guard BEFORE INSERT OR UPDATE OR DELETE ON public.dispatch_expenses
  FOR EACH ROW EXECUTE FUNCTION public.fn_dispatch_expense_guard();

-- Chứng từ cũng khoá theo lệnh
CREATE OR REPLACE FUNCTION public.fn_dispatch_expense_file_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
  SELECT o.cost_status INTO st FROM public.dispatch_expenses x JOIN public.dispatch_orders o ON o.id = x.dispatch_order_id
   WHERE x.id = coalesce(NEW.expense_id, OLD.expense_id);
  IF st = 'reviewed' THEN
    RAISE EXCEPTION 'Lệnh đã duyệt chi phí (khoá). Mở lại lệnh trước khi sửa chứng từ.' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_dispatch_expense_file_guard ON public.dispatch_expense_files;
CREATE TRIGGER trg_dispatch_expense_file_guard BEFORE INSERT OR DELETE ON public.dispatch_expense_files
  FOR EACH ROW EXECUTE FUNCTION public.fn_dispatch_expense_file_guard();

-- ─── 6. Ảnh hoá đơn: DÙNG LẠI bucket `invoice-images` (public, jpeg/png/webp/pdf, 10 MB) ──
-- Bucket mới `fleet-receipts` tạo được nhưng CREATE POLICY trên storage.objects bị từ chối
-- ("must be owner of table objects") khi chạy qua agent_sql. invoice-images đã có sẵn policy
-- invoice_images_insert/select/delete cho authenticated → file lưu ở
-- invoice-images/fleet-receipts/<mã lệnh>/<expense_id>/<tên file>. Bucket rỗng `fleet-receipts`
-- tạo nhầm đã gỡ bằng Storage API (SQL không cho DELETE storage.buckets). Không có statement ở mục này.

-- ─── 7. View: 1 dòng = 1 lệnh ───────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_fleet_cost_trips AS
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
  -- chi theo đồng tiền GỐC (đúng cột LAK / VNĐ của form); cước thuê ngoài là VNĐ, cộng vào "được tính"
  coalesce(e.counted_vnd, 0)   + CASE WHEN o.is_hired AND coalesce(o.hire_cost, 0) > 0 THEN o.hire_cost ELSE 0 END AS counted_vnd,
  coalesce(e.counted_lak, 0)   AS counted_lak,
  coalesce(e.uncounted_vnd, 0) AS uncounted_vnd,
  coalesce(e.uncounted_lak, 0) AS uncounted_lak,
  -- quy đổi tất cả về VNĐ để cộng KPI
  coalesce(e.counted_vnd_equiv, 0) + CASE WHEN o.is_hired AND coalesce(o.hire_cost, 0) > 0 THEN o.hire_cost ELSE 0 END AS counted_vnd_equiv,
  coalesce(e.uncounted_vnd_equiv, 0) AS uncounted_vnd_equiv,
  coalesce(e.n_expenses, 0) AS n_expenses,
  coalesce(e.n_missing_receipt, 0) AS n_missing_receipt,
  e.kinds,
  coalesce(a.adv_vnd, 0) AS adv_vnd,
  coalesce(a.adv_lak, 0) AS adv_lak
FROM public.dispatch_orders o
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
COMMENT ON VIEW public.v_fleet_cost_trips IS 'Chi phí theo chuyến: km/ngày/vượt + tổng chi theo đồng tiền (cước thuê ngoài cộng vào counted_vnd). Trang và Excel đọc view này, không tự cộng.';

-- ─── 8. View: tài xế × tháng × đồng tiền ────────────────────────────────────
CREATE OR REPLACE VIEW public.v_fleet_cost_month AS
WITH ex AS (
  SELECT o.driver_id, to_char(o.dispatch_date, 'YYYY-MM') AS ym, x.currency,
         sum(x.amount) FILTER (WHERE x.counted)     AS counted,
         sum(x.amount) FILTER (WHERE NOT x.counted) AS uncounted,
         count(DISTINCT x.dispatch_order_id)        AS n_trips_with_cost
  FROM public.dispatch_expenses x JOIN public.dispatch_orders o ON o.id = x.dispatch_order_id
  WHERE o.status <> 'cancelled'
  GROUP BY 1, 2, 3
),
hire AS (   -- cước thuê xe ngoài: VNĐ, thường không có driver_id (xe thuê gõ tên tài xế tay) → nhóm "thuê ngoài"
  SELECT o.driver_id, to_char(o.dispatch_date, 'YYYY-MM') AS ym, 'VND'::text AS currency, sum(o.hire_cost) AS hire
  FROM public.dispatch_orders o
  WHERE o.status <> 'cancelled' AND o.is_hired AND coalesce(o.hire_cost, 0) > 0
  GROUP BY 1, 2
),
adv AS (
  SELECT driver_id, to_char(advance_date, 'YYYY-MM') AS ym, currency, sum(amount) AS advanced
  FROM public.driver_advances GROUP BY 1, 2, 3
),
keys AS (
  SELECT driver_id, ym, currency FROM ex
  UNION SELECT driver_id, ym, currency FROM hire
  UNION SELECT driver_id, ym, currency FROM adv
)
SELECT k.driver_id, d.full_name AS driver_name, k.ym, k.currency,
       coalesce(ex.counted, 0) + coalesce(h.hire, 0) AS counted,
       coalesce(ex.uncounted, 0)                      AS uncounted,
       coalesce(a.advanced, 0)                        AS advanced,
       coalesce(a.advanced, 0) - (coalesce(ex.counted, 0) + coalesce(h.hire, 0)) AS balance,
       coalesce(ex.n_trips_with_cost, 0)              AS n_trips_with_cost
FROM keys k
LEFT JOIN public.fleet_drivers d ON d.id = k.driver_id
LEFT JOIN ex   ON ex.driver_id IS NOT DISTINCT FROM k.driver_id AND ex.ym = k.ym AND ex.currency = k.currency
LEFT JOIN hire h ON h.driver_id IS NOT DISTINCT FROM k.driver_id AND h.ym = k.ym AND h.currency = k.currency
LEFT JOIN adv  a ON a.driver_id IS NOT DISTINCT FROM k.driver_id AND a.ym = k.ym AND a.currency = k.currency;
COMMENT ON VIEW public.v_fleet_cost_month IS 'Đối soát tháng theo tài xế và đồng tiền: tạm ứng − chi được tính (kể cả cước thuê ngoài) = còn lại (dương = tài xế hoàn).';

-- ─── 9. RLS: mọi tài khoản đăng nhập (như các bảng vận tải khác; siết theo phòng ở UI) ──
DO $$ BEGIN
  EXECUTE 'ALTER TABLE public.fleet_routes           ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.dispatch_expenses      ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.dispatch_expense_files ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.driver_advances        ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS fleet_routes_auth_all           ON public.fleet_routes';
  EXECUTE 'DROP POLICY IF EXISTS dispatch_expenses_auth_all      ON public.dispatch_expenses';
  EXECUTE 'DROP POLICY IF EXISTS dispatch_expense_files_auth_all ON public.dispatch_expense_files';
  EXECUTE 'DROP POLICY IF EXISTS driver_advances_auth_all        ON public.driver_advances';
  EXECUTE 'CREATE POLICY fleet_routes_auth_all           ON public.fleet_routes           FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY dispatch_expenses_auth_all      ON public.dispatch_expenses      FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY dispatch_expense_files_auth_all ON public.dispatch_expense_files FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY driver_advances_auth_all        ON public.driver_advances        FOR ALL TO authenticated USING (true) WITH CHECK (true)';
END $$;
GRANT SELECT ON public.v_fleet_cost_trips, public.v_fleet_cost_month TO authenticated;

-- ─── 10. Hành trình mẫu (chỉ chèn khi chưa có) ──────────────────────────────
INSERT INTO public.fleet_routes (name, origin, destination, est_km, standard_days)
SELECT v.name, v.origin, v.destination, v.est_km, v.standard_days
FROM (VALUES
  ('Phong Điền → Cảng Tiên Sa, Đà Nẵng', 'NM Phong Điền', 'Cảng Tiên Sa, Đà Nẵng', 310, 1),
  ('Phong Điền → Cảng Chân Mây',          'NM Phong Điền', 'Cảng Chân Mây',          120, 1),
  ('Phong Điền → Tân Lâm (HAQT)',          'NM Phong Điền', 'NM Tân Lâm',             190, 1),
  ('Phong Điền → Savannakhet (Lào)',       'NM Phong Điền', 'NM Savannakhet, Lào',    920, 4)
) AS v(name, origin, destination, est_km, standard_days)
WHERE NOT EXISTS (SELECT 1 FROM public.fleet_routes r WHERE r.name = v.name);
