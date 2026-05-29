-- ============================================================================
-- WMS — Đề nghị thanh toán (Payment Request) — ĐỢT 1
-- Date: 2026-05-29
-- ============================================================================
--
-- Mục đích:
--   Cuối ngày nhân viên gom các phiếu cân (weighbridge_tickets) thành MỘT
--   "Đề nghị thanh toán" để trình duyệt + chi tiền cho người bán.
--
-- Quyết định nền (xem docs/KE_HOACH_DE_NGHI_THANH_TOAN.md + DE_NGHI_THANH_TOAN_TONG_QUAN.md):
--   - PA1: Đề nghị thanh toán là CỬA CHI TIỀN DUY NHẤT (cả lô-trong-deal lẫn lô-lẻ).
--          Quyết toán B2B = đối soát, KHÔNG tự ghi payment_paid (việc gỡ ở Đợt 2).
--   - Nguồn = phiếu cân. Một dòng đề nghị = một phiếu cân (hoặc dòng thủ công).
--   - Linh hoạt deal/không-deal: dòng tự đọc deal_id / supplier_id từ phiếu cân.
--   - Đợt 1 chỉ tạo + in; workflow duyệt + ghi sổ ở Đợt 2 (cột status/approved_*/paid_* để sẵn).
--
-- Idempotent: chạy lại nhiều lần an toàn (IF NOT EXISTS / DROP ... IF EXISTS).
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: Bảng payment_requests (phiếu tổng hợp)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.payment_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,                 -- VD: TMMN-2605-001
  facility_id   uuid REFERENCES public.facilities(id) ON DELETE SET NULL,
  request_date  date NOT NULL DEFAULT CURRENT_DATE,
  rubber_type   text,                                 -- loại mủ chính (null = gộp nhiều loại)
  title         text,                                 -- tiêu đề tự do (vd "Mủ nước Tân Lâm 26/05")
  status        text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','submitted','approved','paid','cancelled')),
  currency      text NOT NULL DEFAULT 'VND'
                  CHECK (currency IN ('VND','KIP','THB')),
  total_weight  numeric(14,3) NOT NULL DEFAULT 0,     -- tổng kg
  total_amount  numeric(14,2) NOT NULL DEFAULT 0,     -- tổng tiền
  line_count    int NOT NULL DEFAULT 0,
  note          text,
  created_by    uuid,
  -- Đợt 2 dùng (để sẵn, nullable):
  submitted_at  timestamptz,
  approved_at   timestamptz,
  approved_by   uuid,
  paid_at       timestamptz,
  paid_by       uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.payment_requests IS 'Đề nghị thanh toán mủ — gom từ phiếu cân cuối ngày. PA1: cửa chi tiền duy nhất.';
COMMENT ON COLUMN public.payment_requests.code IS 'Mã phiếu, sinh ở app: {PREFIX}-{YYMM}-{seq}. Mặc định prefix TMMN (Tân Lâm mủ nước).';
COMMENT ON COLUMN public.payment_requests.currency IS 'Đợt 1 chỉ dùng VND. KIP/THB để sẵn cho Đợt 2.';

CREATE INDEX IF NOT EXISTS idx_payment_requests_facility ON public.payment_requests(facility_id);
CREATE INDEX IF NOT EXISTS idx_payment_requests_date     ON public.payment_requests(request_date DESC);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status   ON public.payment_requests(status);

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: Bảng payment_request_lines (dòng chi tiết)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.payment_request_lines (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_request_id  uuid NOT NULL REFERENCES public.payment_requests(id) ON DELETE CASCADE,
  ticket_id           uuid REFERENCES public.weighbridge_tickets(id) ON DELETE SET NULL,  -- null = dòng thủ công
  source_type         text NOT NULL DEFAULT 'manual'
                        CHECK (source_type IN ('deal','supplier','manual')),
  deal_id             uuid,        -- snapshot từ phiếu cân (lô-trong-deal)
  partner_id          uuid,        -- snapshot
  supplier_id         uuid,        -- snapshot (lô-lẻ)
  payee_name          text NOT NULL,                  -- người nhận tiền — prefill + GÕ TAY được
  payee_note          text,                           -- ghi chú người nhận (số TK / người thân...)
  rubber_type         text,
  vehicle_plate       text,
  weight              numeric(14,3) NOT NULL DEFAULT 0,  -- kg (net)
  unit_price          numeric(14,2) NOT NULL DEFAULT 0,  -- đơn giá
  amount              numeric(14,2) NOT NULL DEFAULT 0,  -- thành tiền (gõ tay được, không bắt = weight*price)
  note                text,
  sort_order          int NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.payment_request_lines IS 'Dòng đề nghị thanh toán. 1 dòng = 1 phiếu cân (hoặc dòng thủ công). payee/amount gõ tay được.';
COMMENT ON COLUMN public.payment_request_lines.source_type IS 'deal = lô-trong-deal; supplier = mua lẻ; manual = nhập tay không từ phiếu cân.';

CREATE INDEX IF NOT EXISTS idx_pr_lines_request ON public.payment_request_lines(payment_request_id);
CREATE INDEX IF NOT EXISTS idx_pr_lines_ticket  ON public.payment_request_lines(ticket_id) WHERE ticket_id IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: weighbridge_tickets.payment_request_id (đánh dấu phiếu đã vào đề nghị)
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='weighbridge_tickets') THEN
    RAISE NOTICE 'SKIP STEP 3: weighbridge_tickets không tồn tại';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.weighbridge_tickets ADD COLUMN IF NOT EXISTS payment_request_id uuid REFERENCES public.payment_requests(id) ON DELETE SET NULL';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_wt_payment_request ON public.weighbridge_tickets(payment_request_id) WHERE payment_request_id IS NOT NULL';
  EXECUTE $cm$
    COMMENT ON COLUMN public.weighbridge_tickets.payment_request_id IS
      'Đề nghị thanh toán đã gom phiếu cân này (NULL = chưa gom). Dùng để lọc phiếu khả dụng + chống gom trùng.'
  $cm$;

  RAISE NOTICE 'STEP 3: weighbridge_tickets.payment_request_id added';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 4: Trigger updated_at + tự tính tổng (total_weight/total_amount/line_count)
-- ════════════════════════════════════════════════════════════════════════════

-- 4a. updated_at cho cả 2 bảng
CREATE OR REPLACE FUNCTION public.pr_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_payment_requests_updated_at ON public.payment_requests;
CREATE TRIGGER trg_payment_requests_updated_at
  BEFORE UPDATE ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.pr_set_updated_at();

DROP TRIGGER IF EXISTS trg_pr_lines_updated_at ON public.payment_request_lines;
CREATE TRIGGER trg_pr_lines_updated_at
  BEFORE UPDATE ON public.payment_request_lines
  FOR EACH ROW EXECUTE FUNCTION public.pr_set_updated_at();

-- 4b. Recompute tổng trên payment_requests khi lines thay đổi
CREATE OR REPLACE FUNCTION public.pr_recompute_totals()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_req_id uuid := COALESCE(NEW.payment_request_id, OLD.payment_request_id);
BEGIN
  IF v_req_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE public.payment_requests pr SET
    total_weight = COALESCE((SELECT SUM(weight) FROM public.payment_request_lines WHERE payment_request_id = v_req_id), 0),
    total_amount = COALESCE((SELECT SUM(amount) FROM public.payment_request_lines WHERE payment_request_id = v_req_id), 0),
    line_count   = COALESCE((SELECT COUNT(*)   FROM public.payment_request_lines WHERE payment_request_id = v_req_id), 0)
  WHERE pr.id = v_req_id;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_pr_lines_recompute ON public.payment_request_lines;
CREATE TRIGGER trg_pr_lines_recompute
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_request_lines
  FOR EACH ROW EXECUTE FUNCTION public.pr_recompute_totals();

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 5: RLS (dev-mode trước go-live — authenticated full; thắt lại sau)
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.payment_requests      ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.payment_request_lines ENABLE ROW LEVEL SECURITY';

  EXECUTE 'DROP POLICY IF EXISTS payment_requests_auth_all ON public.payment_requests';
  EXECUTE 'DROP POLICY IF EXISTS pr_lines_auth_all ON public.payment_request_lines';

  EXECUTE 'CREATE POLICY payment_requests_auth_all ON public.payment_requests FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY pr_lines_auth_all ON public.payment_request_lines FOR ALL TO authenticated USING (true) WITH CHECK (true)';

  RAISE NOTICE 'STEP 5: RLS enabled + authenticated full-access policies created';
END $$;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_has_col boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payment_requests') THEN
    RAISE EXCEPTION 'FAIL: payment_requests chưa tạo';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payment_request_lines') THEN
    RAISE EXCEPTION 'FAIL: payment_request_lines chưa tạo';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='weighbridge_tickets' AND column_name='payment_request_id'
  ) INTO v_has_col;

  RAISE NOTICE '═══ wms_payment_request VERIFY PASS ═══';
  RAISE NOTICE '  payment_requests + payment_request_lines: OK';
  RAISE NOTICE '  weighbridge_tickets.payment_request_id: %', CASE WHEN v_has_col THEN 'OK' ELSE 'MISSING (weighbridge_tickets vắng?)' END;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (chạy tay nếu cần gỡ):
-- ════════════════════════════════════════════════════════════════════════════
-- ALTER TABLE public.weighbridge_tickets DROP COLUMN IF EXISTS payment_request_id;
-- DROP TABLE IF EXISTS public.payment_request_lines CASCADE;
-- DROP TABLE IF EXISTS public.payment_requests CASCADE;
-- DROP FUNCTION IF EXISTS public.pr_recompute_totals();
-- DROP FUNCTION IF EXISTS public.pr_set_updated_at();
