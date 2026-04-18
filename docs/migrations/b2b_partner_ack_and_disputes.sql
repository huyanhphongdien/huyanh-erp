-- ============================================================================
-- B2B — Partner acknowledge advance + DRC disputes
-- File: docs/migrations/b2b_partner_ack_and_disputes.sql
-- Ngày: 2026-04-18 (sửa: base tables ở schema b2b, public.b2b_* là VIEW)
--
-- MỤC TIÊU:
--   1. Cho phép đại lý xác nhận "Đã nhận tạm ứng" (tránh tranh chấp)
--   2. Cho phép đại lý khiếu nại DRC variance khi không đồng ý kết quả QC
--
-- QUAN TRỌNG:
--   Supabase REST API mặc định chỉ expose schema public → phải tạo VIEW
--   public.b2b_drc_disputes để frontend query được (supabase.from('b2b_drc_disputes')).
--   VIEW public.b2b_advances cần recreate để bao gồm 2 cột mới.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. b2b.advances — thêm cột partner acknowledgment
-- ============================================================================
ALTER TABLE b2b.advances
  ADD COLUMN IF NOT EXISTS partner_ack_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS partner_ack_by UUID;

COMMENT ON COLUMN b2b.advances.partner_ack_at IS
  'Thời điểm partner xác nhận đã nhận tạm ứng qua Portal đại lý';
COMMENT ON COLUMN b2b.advances.partner_ack_by IS
  'partner_id đã ack (set bởi RPC partner_acknowledge_advance)';

CREATE INDEX IF NOT EXISTS idx_b2b_advances_partner_ack
  ON b2b.advances(partner_id, partner_ack_at)
  WHERE partner_ack_at IS NULL AND status = 'paid';

-- Recreate view public.b2b_advances để include 2 cột mới
DROP VIEW IF EXISTS public.b2b_advances CASCADE;
CREATE VIEW public.b2b_advances AS
  SELECT * FROM b2b.advances;

GRANT SELECT ON public.b2b_advances TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.b2b_advances TO authenticated;

-- ============================================================================
-- 2. b2b.drc_disputes — bảng khiếu nại DRC
-- ============================================================================
CREATE TABLE IF NOT EXISTS b2b.drc_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_number VARCHAR(50) UNIQUE NOT NULL,

  -- Liên kết
  deal_id UUID NOT NULL REFERENCES b2b.deals(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL,

  -- Dữ liệu tranh chấp
  expected_drc NUMERIC(5, 2) NOT NULL,
  actual_drc NUMERIC(5, 2) NOT NULL,
  drc_variance NUMERIC(5, 2) GENERATED ALWAYS AS (actual_drc - expected_drc) STORED,

  -- Nội dung khiếu nại
  reason TEXT NOT NULL,
  partner_evidence JSONB,

  -- Xử lý
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  CONSTRAINT chk_dispute_status CHECK (
    status IN ('open', 'investigating', 'resolved_accepted', 'resolved_rejected', 'withdrawn')
  ),

  resolution_notes TEXT,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,

  adjustment_drc NUMERIC(5, 2),
  adjustment_amount NUMERIC(15, 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raised_by UUID NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_drc_disputes_deal ON b2b.drc_disputes(deal_id);
CREATE INDEX IF NOT EXISTS idx_drc_disputes_partner ON b2b.drc_disputes(partner_id);
CREATE INDEX IF NOT EXISTS idx_drc_disputes_status ON b2b.drc_disputes(status);

-- Sequence cho dispute_number
CREATE SEQUENCE IF NOT EXISTS b2b.drc_disputes_seq START 1;

CREATE OR REPLACE FUNCTION b2b.generate_dispute_number()
RETURNS TEXT
LANGUAGE sql
AS $$
  SELECT 'KN' || TO_CHAR(NOW(), 'YYMM') || '-' || LPAD(nextval('b2b.drc_disputes_seq')::TEXT, 4, '0')
$$;

-- Auto set updated_at
CREATE OR REPLACE FUNCTION b2b.drc_disputes_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drc_disputes_updated ON b2b.drc_disputes;
CREATE TRIGGER trg_drc_disputes_updated
  BEFORE UPDATE ON b2b.drc_disputes
  FOR EACH ROW
  EXECUTE FUNCTION b2b.drc_disputes_touch_updated_at();

-- ============================================================================
-- 3. VIEW public.b2b_drc_disputes — để frontend query qua supabase.from()
-- ============================================================================
DROP VIEW IF EXISTS public.b2b_drc_disputes CASCADE;
CREATE VIEW public.b2b_drc_disputes AS
  SELECT * FROM b2b.drc_disputes;

GRANT SELECT ON public.b2b_drc_disputes TO anon, authenticated;
GRANT INSERT, UPDATE ON public.b2b_drc_disputes TO authenticated;

-- ============================================================================
-- 4. current_partner_id() helper (nếu chưa có từ rls_partner_scope migration)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.current_partner_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, b2b
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.partner_id', true), ''),
    NULLIF(current_setting('request.jwt.claims', true)::json ->> 'partner_id', ''),
    NULLIF(auth.jwt() ->> 'partner_id', '')
  )::UUID
$$;

-- ============================================================================
-- 5. RLS cho b2b.drc_disputes (chỉ áp dụng cho bảng mới, KHÔNG động tới bảng cũ)
-- ============================================================================
ALTER TABLE b2b.drc_disputes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drc_disputes_select ON b2b.drc_disputes;
CREATE POLICY drc_disputes_select ON b2b.drc_disputes
  FOR SELECT TO authenticated
  USING (
    public.current_partner_id() IS NULL
    OR partner_id = public.current_partner_id()
  );

DROP POLICY IF EXISTS drc_disputes_insert ON b2b.drc_disputes;
CREATE POLICY drc_disputes_insert ON b2b.drc_disputes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_partner_id() IS NULL
    OR (partner_id = public.current_partner_id() AND status = 'open')
  );

DROP POLICY IF EXISTS drc_disputes_update ON b2b.drc_disputes;
CREATE POLICY drc_disputes_update ON b2b.drc_disputes
  FOR UPDATE TO authenticated
  USING (public.current_partner_id() IS NULL)
  WITH CHECK (public.current_partner_id() IS NULL);

-- ============================================================================
-- 6. RPC cho partner
-- ============================================================================
CREATE OR REPLACE FUNCTION public.partner_raise_drc_dispute(
  p_deal_id UUID,
  p_reason TEXT,
  p_evidence JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, b2b
AS $$
DECLARE
  v_partner_id UUID;
  v_deal RECORD;
  v_dispute_id UUID;
  v_dispute_number TEXT;
  v_existing_open UUID;
BEGIN
  v_partner_id := public.current_partner_id();
  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'Chỉ partner mới có thể raise dispute';
  END IF;

  SELECT id, partner_id, expected_drc, actual_drc, status
  INTO v_deal
  FROM b2b.deals
  WHERE id = p_deal_id;

  IF v_deal.id IS NULL THEN RAISE EXCEPTION 'Deal không tồn tại'; END IF;
  IF v_deal.partner_id != v_partner_id THEN RAISE EXCEPTION 'Deal không thuộc partner này'; END IF;
  IF v_deal.actual_drc IS NULL THEN RAISE EXCEPTION 'Deal chưa có DRC thực tế'; END IF;
  IF v_deal.status IN ('settled', 'cancelled') THEN RAISE EXCEPTION 'Deal đã quyết toán/hủy'; END IF;

  IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Lý do khiếu nại phải có ít nhất 10 ký tự';
  END IF;

  SELECT id INTO v_existing_open
  FROM b2b.drc_disputes
  WHERE deal_id = p_deal_id AND status IN ('open', 'investigating');

  IF v_existing_open IS NOT NULL THEN
    RAISE EXCEPTION 'Deal này đã có khiếu nại đang mở';
  END IF;

  v_dispute_number := b2b.generate_dispute_number();

  INSERT INTO b2b.drc_disputes (
    dispute_number, deal_id, partner_id,
    expected_drc, actual_drc,
    reason, partner_evidence,
    status, raised_by
  ) VALUES (
    v_dispute_number, p_deal_id, v_partner_id,
    v_deal.expected_drc, v_deal.actual_drc,
    p_reason, p_evidence,
    'open', v_partner_id
  ) RETURNING id INTO v_dispute_id;

  RETURN v_dispute_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.partner_raise_drc_dispute(UUID, TEXT, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.partner_withdraw_drc_dispute(p_dispute_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, b2b
AS $$
DECLARE
  v_partner_id UUID;
  v_dispute_partner UUID;
  v_status TEXT;
BEGIN
  v_partner_id := public.current_partner_id();
  IF v_partner_id IS NULL THEN RAISE EXCEPTION 'Chỉ partner mới gọi được'; END IF;

  SELECT partner_id, status INTO v_dispute_partner, v_status
  FROM b2b.drc_disputes WHERE id = p_dispute_id;

  IF v_dispute_partner IS NULL THEN RAISE EXCEPTION 'Dispute không tồn tại'; END IF;
  IF v_dispute_partner != v_partner_id THEN RAISE EXCEPTION 'Dispute không thuộc partner này'; END IF;
  IF v_status NOT IN ('open', 'investigating') THEN RAISE EXCEPTION 'Chỉ rút được dispute đang mở'; END IF;

  UPDATE b2b.drc_disputes SET status = 'withdrawn', updated_at = NOW() WHERE id = p_dispute_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.partner_withdraw_drc_dispute(UUID) TO authenticated;

-- RPC partner acknowledge advance
CREATE OR REPLACE FUNCTION public.partner_acknowledge_advance(p_advance_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, b2b
AS $$
DECLARE
  v_partner_id UUID;
  v_advance_partner UUID;
BEGIN
  v_partner_id := public.current_partner_id();
  IF v_partner_id IS NULL THEN RAISE EXCEPTION 'Chỉ partner mới gọi được'; END IF;

  SELECT partner_id INTO v_advance_partner FROM b2b.advances WHERE id = p_advance_id;

  IF v_advance_partner IS NULL THEN RAISE EXCEPTION 'Advance không tồn tại'; END IF;
  IF v_advance_partner != v_partner_id THEN RAISE EXCEPTION 'Advance không thuộc partner này'; END IF;

  UPDATE b2b.advances
  SET partner_ack_at = NOW(),
      partner_ack_by = v_partner_id,
      updated_at = NOW()
  WHERE id = p_advance_id AND partner_ack_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.partner_acknowledge_advance(UUID) TO authenticated;

-- ============================================================================
-- 7. Realtime publication cho b2b.drc_disputes
-- ============================================================================
ALTER TABLE b2b.drc_disputes REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE b2b.drc_disputes;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Grants cho realtime admin
GRANT SELECT ON b2b.drc_disputes TO anon, authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_realtime_admin') THEN
    EXECUTE 'GRANT SELECT ON b2b.drc_disputes TO supabase_realtime_admin';
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFY
-- ============================================================================
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'b2b' AND table_name = 'advances'
  AND column_name IN ('partner_ack_at', 'partner_ack_by');

SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'b2b' AND table_name = 'drc_disputes'
ORDER BY ordinal_position;

SELECT table_name FROM information_schema.views
WHERE table_schema = 'public' AND table_name = 'b2b_drc_disputes';
