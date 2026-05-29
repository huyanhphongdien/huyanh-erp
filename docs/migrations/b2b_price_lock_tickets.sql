-- ============================================================================
-- PHIẾU CHỐT GIÁ — b2b_price_lock_tickets  (NHIỀU ĐẠI LÝ / phiếu)
-- Date: 2026-05-30
-- ============================================================================
-- Mục đích: số hoá form "PHIẾU CHỐT GIÁ" (BM: CL.BMQT.KH.01.01) — thoả thuận giá
-- TRƯỚC khi cân. 1 phiếu = 1 NGÀY chốt tại 1 điểm cân, GỒM NHIỀU ĐẠI LÝ, mỗi
-- đại lý 1 giá áp riêng (giá khác nhau theo đại lý + theo ngày). In 1 trang trình ký.
--
-- dealer_lines (jsonb): [{ partner_id, dealer_name, expected_weight_kg,
--                          expected_drc_percent, price_per_ton, note }]
-- price_floor/mid/high_per_ton = bảng giá cao su tham chiếu chung của ngày.
-- fees/fee_flags (jsonb) = chi phí + checkbox "các phí phải chi" (chung cho phiếu).
--
-- Code format: PCG-{YYYY}-{NNNN}  (vd PCG-2026-0006). Sequential per năm lock_date,
-- gán tự động qua trigger (advisory_xact_lock chống trùng khi insert đồng thời).
--
-- facility_id: uuid lỏng (KHÔNG FK) — tránh rủi ro migration sát go-live.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.b2b_price_lock_tickets (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  text UNIQUE,
  status                text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','locked','used','cancelled')),

  -- Địa điểm cân
  facility_id           uuid,                 -- link facilities (lỏng)
  facility_label        text,                 -- nhãn hiển thị (vd "HAQT")

  -- Danh sách đại lý + giá áp (mỗi dòng 1 đại lý)
  -- [{ partner_id, dealer_name, expected_weight_kg, expected_drc_percent, price_per_ton, note }]
  dealer_lines          jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Loại tiền + tỷ giá (chung phiếu)
  currency              text NOT NULL DEFAULT 'VND'
                          CHECK (currency IN ('VND','KIP','THB','OTHER')),
  currency_other        text,
  rate_thb_kip          numeric,
  rate_kip_vnd          numeric,
  rate_thb_vnd          numeric,

  -- Hình thức mua: Cụm/Đấu giá | Đại lý | Hộ ND | Công ty
  purchase_method       text CHECK (purchase_method IN ('cum_daugia','dai_ly','ho_nd','cong_ty')),

  -- Bảng giá cao su tham chiếu (đ/tấn): sàn / trung / cao
  price_floor_per_ton   numeric,
  price_mid_per_ton     numeric,
  price_high_per_ton    numeric,

  -- Phí: fees = [{label, basis:'ton'|'lot', amount}]; fee_flags = checkbox "các phí phải chi"
  fees                  jsonb NOT NULL DEFAULT '[]'::jsonb,
  fee_flags             jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Thời gian
  lock_date             date NOT NULL DEFAULT CURRENT_DATE,
  weigh_from            date,
  weigh_to              date,

  -- Ký
  signer_locker         text,                 -- Người chốt giá

  note                  text,
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.b2b_price_lock_tickets IS
  'Phiếu chốt giá (BM CL.BMQT.KH.01.01) — 1 ngày/1 điểm cân, nhiều đại lý (dealer_lines), giá áp riêng từng đại lý. Code PCG-{year}-{seq}.';

CREATE INDEX IF NOT EXISTS idx_pcg_lock_date  ON public.b2b_price_lock_tickets (lock_date DESC);
CREATE INDEX IF NOT EXISTS idx_pcg_facility   ON public.b2b_price_lock_tickets (facility_id);
CREATE INDEX IF NOT EXISTS idx_pcg_status     ON public.b2b_price_lock_tickets (status);

-- ════════════════════════════════════════════════════════════════════════════
-- updated_at auto-touch
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.trg_pcg_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pcg_touch ON public.b2b_price_lock_tickets;
CREATE TRIGGER trg_pcg_touch
  BEFORE UPDATE ON public.b2b_price_lock_tickets
  FOR EACH ROW EXECUTE FUNCTION public.trg_pcg_touch_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- Code generator: PCG-{year}-{NNNN} sequential per năm lock_date
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.next_price_lock_code(p_year int)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_lock_key bigint;
  v_next int;
  v_prefix text;
BEGIN
  v_prefix := 'PCG-' || p_year::text || '-';
  -- Hash 'pcg' + year → advisory key (tuần tự khi concurrent insert)
  v_lock_key := ('x' || substr(md5('pcg' || p_year::text), 1, 15))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX( (regexp_replace(code, '^PCG-\d+-', ''))::int ), 0) + 1
    INTO v_next
  FROM public.b2b_price_lock_tickets
  WHERE code LIKE v_prefix || '%'
    AND code ~ '^PCG-\d+-\d+$';

  RETURN v_prefix || lpad(v_next::text, 4, '0');
END $$;

CREATE OR REPLACE FUNCTION public.trg_pcg_auto_code()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code := public.next_price_lock_code(extract(year FROM COALESCE(NEW.lock_date, CURRENT_DATE))::int);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pcg_auto_code ON public.b2b_price_lock_tickets;
CREATE TRIGGER trg_pcg_auto_code
  BEFORE INSERT ON public.b2b_price_lock_tickets
  FOR EACH ROW EXECUTE FUNCTION public.trg_pcg_auto_code();

-- ════════════════════════════════════════════════════════════════════════════
-- RLS — authenticated full access, anon read (khớp pattern weighbridge/b2b)
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.b2b_price_lock_tickets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='b2b_price_lock_tickets' AND policyname='pcg_auth_all') THEN
    EXECUTE 'CREATE POLICY pcg_auth_all ON public.b2b_price_lock_tickets
      FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='b2b_price_lock_tickets' AND policyname='pcg_anon_select') THEN
    EXECUTE 'CREATE POLICY pcg_anon_select ON public.b2b_price_lock_tickets
      FOR SELECT TO anon USING (true)';
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_price_lock_tickets TO authenticated;
GRANT SELECT ON public.b2b_price_lock_tickets TO anon;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_tbl boolean;
  v_fn  boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='b2b_price_lock_tickets') INTO v_tbl;
  SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='next_price_lock_code') INTO v_fn;
  IF NOT (v_tbl AND v_fn) THEN
    RAISE EXCEPTION 'price_lock migration FAIL: table=% fn=%', v_tbl, v_fn;
  END IF;
  RAISE NOTICE 'VERIFY PASS — b2b_price_lock_tickets (multi-dealer) + code generator OK';
END $$;

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS trg_pcg_auto_code ON public.b2b_price_lock_tickets;
-- DROP TRIGGER IF EXISTS trg_pcg_touch ON public.b2b_price_lock_tickets;
-- DROP FUNCTION IF EXISTS public.trg_pcg_auto_code();
-- DROP FUNCTION IF EXISTS public.trg_pcg_touch_updated_at();
-- DROP FUNCTION IF EXISTS public.next_price_lock_code(int);
-- DROP TABLE IF EXISTS public.b2b_price_lock_tickets;
