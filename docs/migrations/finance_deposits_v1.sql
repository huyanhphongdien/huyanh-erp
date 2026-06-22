-- ============================================================================
-- MODULE VỐN VAY — Đợt 2: HỢP ĐỒNG TIỀN GỬI (HĐTG)
-- ============================================================================
-- Tiền gửi tại ngân hàng — phần lớn ĐẢM BẢO KHOẢN VAY. Rủi ro: quên TÁI TỤC khi
-- đáo hạn → bị tất toán ép (đã xảy ra ở Eximbank 21/01). Module nhắc trước hạn.
-- An toàn go-live: create if not exists, RLS authenticated (UI siết Admin).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fin_deposits (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank              text NOT NULL,
  deposit_no        text,                          -- số HĐTG / hợp đồng cầm cố
  holder            text,                          -- chủ sổ (vd 'Sổ tiết kiệm anh Huy')
  amount            numeric NOT NULL DEFAULT 0,    -- số tiền
  currency          text DEFAULT 'VND',
  deposit_date      date,                          -- ngày gửi
  maturity_date     date,                          -- ngày đến hạn
  reopen_date       date,                          -- ngày mở lại
  extended_to       date,                          -- gia hạn đến ngày
  interest_rate     numeric,                       -- %/năm
  term              text,                          -- kỳ hạn (vd '12 tháng')
  expected_interest numeric,                       -- lãi cuối kỳ dự kiến
  purpose           text DEFAULT 'dam_bao_vay',    -- dam_bao_vay | thuong
  status            text DEFAULT 'active',         -- active | closed (tất toán)
  note              text,
  created_by        uuid,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_deposits_maturity ON public.fin_deposits(maturity_date);
CREATE INDEX IF NOT EXISTS idx_fin_deposits_bank     ON public.fin_deposits(bank);

ALTER TABLE public.fin_deposits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_deposits_all ON public.fin_deposits;
CREATE POLICY fin_deposits_all ON public.fin_deposits FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
-- Kiểm: select bank, count(*), sum(amount) from fin_deposits group by bank;
