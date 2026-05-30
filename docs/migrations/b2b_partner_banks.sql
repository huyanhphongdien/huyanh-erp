-- ============================================================================
-- b2b_partner_banks — Tài khoản ngân hàng đại lý B2B (multi-account/partner)
-- Date: 2026-05-30
-- ============================================================================
-- Mục đích: linh hoạt — 1 đại lý có thể có nhiều TK NH. Khi khách yêu cầu
-- chuyển vào TK khác, tạo thêm row, set default mới. Lịch sử TK cũ giữ lại.
-- 1 row default per partner → in ra mặc định trên ĐNTT/Liên 2.
--
-- Resolver bank cho thanh toán (xem partnerBankService.getEffectiveBank):
--   1) Nếu partner có payment_proxy_partner_id → lấy bank default của PROXY.
--   2) Else → bank default của chính partner.
--   3) Else → NULL (kế toán nhập tay).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.b2b_partner_banks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id    uuid NOT NULL,             -- FK b2b.partners.id (b2b schema, không enforce)
  bank_account  text NOT NULL,             -- Số TK (chuỗi vì có thể có gạch/dấu chấm)
  bank_name     text NOT NULL,             -- Tên NH (Agribank, VPBank, LPBank…)
  bank_holder   text,                      -- Chủ TK; nếu NULL UI fallback partner.name
  is_default    boolean NOT NULL DEFAULT false,
  note          text,                      -- Ghi chú (vd "TK chính", "TK con", "TK vợ")
  is_active     boolean NOT NULL DEFAULT true,  -- Tắt khi TK cũ không còn dùng
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.b2b_partner_banks IS
  'TK ngân hàng đại lý B2B (multi-account). 1 default/partner in ra ĐNTT/Liên 2.';

CREATE INDEX IF NOT EXISTS idx_pbank_partner ON public.b2b_partner_banks (partner_id);
-- 1 default per partner (chỉ enforce khi is_default=true)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pbank_default
  ON public.b2b_partner_banks (partner_id)
  WHERE is_default = true;

-- ════════════════════════════════════════════════════════════════════════════
-- updated_at auto-touch
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.trg_pbank_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_pbank_touch ON public.b2b_partner_banks;
CREATE TRIGGER trg_pbank_touch
  BEFORE UPDATE ON public.b2b_partner_banks
  FOR EACH ROW EXECUTE FUNCTION public.trg_pbank_touch_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- Trigger: chỉ 1 default/partner → khi set is_default=true, unset row cũ.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.trg_pbank_ensure_single_default()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.b2b_partner_banks
       SET is_default = false
     WHERE partner_id = NEW.partner_id
       AND id <> NEW.id
       AND is_default = true;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pbank_single_default ON public.b2b_partner_banks;
CREATE TRIGGER trg_pbank_single_default
  BEFORE INSERT OR UPDATE OF is_default ON public.b2b_partner_banks
  FOR EACH ROW EXECUTE FUNCTION public.trg_pbank_ensure_single_default();

-- ════════════════════════════════════════════════════════════════════════════
-- RLS — authenticated full access, anon read
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.b2b_partner_banks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='b2b_partner_banks' AND policyname='pbank_auth_all') THEN
    EXECUTE 'CREATE POLICY pbank_auth_all ON public.b2b_partner_banks
      FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='b2b_partner_banks' AND policyname='pbank_anon_select') THEN
    EXECUTE 'CREATE POLICY pbank_anon_select ON public.b2b_partner_banks
      FOR SELECT TO anon USING (true)';
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_partner_banks TO authenticated;
GRANT SELECT ON public.b2b_partner_banks TO anon;

-- ════════════════════════════════════════════════════════════════════════════
-- SEED bank info cho 5 proxy TLM (từ Excel Tân Lâm)
-- Sellers không seed bank vì tiền đi qua proxy theo payment_proxy_partner_id.
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO public.b2b_partner_banks (partner_id, bank_account, bank_name, bank_holder, is_default, note)
SELECT p.id, b.acct, b.name, b.holder, true, 'TK chính (seed Tân Lâm)'
FROM (VALUES
  ('TLM-NHN', '3900205248772', 'Agribank', 'NGUYỄN HỒNG NHUNG'),
  ('TLM-TMH', '3905205089190', 'Agribank', 'TRẦN THỊ MỸ HOÀ'),
  ('TLM-HTC', '3905205347818', 'Agribank', 'HỒ THỊ CÚC'),
  ('TLM-NVQ', '3905205184603', 'Agribank', 'NGUYỄN VĂN QUÝ'),
  ('TLM-NNH', '3907205101928', 'Agribank', 'NGUYỄN NGỌC HOA'),
  -- Seller có TK riêng (không qua proxy)
  ('TLM-DBL', '3905205036',    'Agribank', 'DƯƠNG BÁ LÊ'),
  ('TLM-LVT', '3905205185296', 'Agribank', 'LÊ VĂN THẠO'),
  ('TLM-NTT', '3904205207982', 'Agribank', 'NGUYỄN THỊ THANH'),
  ('TLM-NTHTAM', '3905205218770', 'Agribank', 'NGUYỄN THỊ HỒNG'),
  ('TLM-NTO', '0704594221',    'LPBank',   'NGUYỄN THỊ OANH'),
  ('TLM-HTT', '02032364501',   'Agribank', 'HOÀNG THỊ THU'),
  ('TLM-TTY', '0818175123',    'VPBank',   'TRẦN THỊ YẾN'),
  ('TLM-NTN', '3907205099615', 'Agribank', 'NGUYỄN THỊ NGUYỆT'),
  ('TLM-HTCH','3905205058246', 'Agribank', 'HOÀNG THỊ CHÍNH')
) AS b(alias, acct, name, holder)
JOIN public.bp_search_keys sk ON sk.key_type='ALIAS' AND sk.key_value=b.alias
JOIN b2b.partners p ON p.bp_id = sk.bp_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.b2b_partner_banks pb
  WHERE pb.partner_id = p.id AND pb.bank_account = b.acct
);

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_total int;
  v_proxies_with_bank int;
BEGIN
  SELECT count(*) INTO v_total FROM public.b2b_partner_banks;
  SELECT count(*) INTO v_proxies_with_bank
    FROM public.b2b_partner_banks pb
    JOIN b2b.partners p ON p.id = pb.partner_id
    WHERE p.is_payment_proxy = true;

  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE 'b2b_partner_banks VERIFY:';
  RAISE NOTICE '  • Total bank rows:        %', v_total;
  RAISE NOTICE '  • Proxies có bank:        % (kỳ vọng 5 cho TLM)', v_proxies_with_bank;
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS trg_pbank_single_default ON public.b2b_partner_banks;
-- DROP TRIGGER IF EXISTS trg_pbank_touch ON public.b2b_partner_banks;
-- DROP FUNCTION IF EXISTS public.trg_pbank_ensure_single_default();
-- DROP FUNCTION IF EXISTS public.trg_pbank_touch_updated_at();
-- DROP TABLE IF EXISTS public.b2b_partner_banks;
