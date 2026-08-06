-- ============================================================================
-- GIAI ĐOẠN 1 — Hồ sơ chứng từ theo khách (bộ chứng từ xuất khẩu)
-- File: docs/migrations/sales_customer_export_profile.sql
-- Idempotent — an toàn chạy lại. RLS khớp pattern sales_customers (authenticated).
-- ============================================================================

-- 1) 7 tài khoản ngân hàng công ty (từ sheet BANK của template) --------------
CREATE TABLE IF NOT EXISTS public.company_banks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name    text NOT NULL,
  account_name text DEFAULT 'HUY ANH RUBBER COMPANY LIMITED',
  account_no   text NOT NULL UNIQUE,
  bank_address text,
  swift_code   text,
  is_active    boolean DEFAULT true,
  sort_order   int DEFAULT 0
);

INSERT INTO public.company_banks (bank_name, account_no, bank_address, swift_code, sort_order) VALUES
  ('VIETNAM BANK FOR AGRICULTURE AND RURAL DEVELOPMENT, HUE CITY BRANCH', '4000201014000', '10 HOANG HOA THAM STREET, THUAN HOA WARD, HUE CITY, VIETNAM', 'VBAAVNVX540', 1),
  ('VIETNAM JOINT STOCK COMMERCIAL BANK FOR INDUSTRY AND TRADE', '111002648221', '02 LE QUY DON STREET, THUAN HOA WARD, HUE CITY, VIET NAM', 'ICBVVNVX460', 2),
  ('EXPORT IMPORT COMMERCIAL JOINT STOCK BANK, HUE BRANCH, VIETNAM', '100201085', '06A LY THUONG KIET, THUAN HOA WARD, HUE CITY, VIETNAM', 'EBVIVNVXXXX', 3),
  ('TIEN PHONG COMMERCIAL JOINT STOCK BANK HUE CITY BRANCH', '78468686868', '78 BEN NGHE, PHU HOI WARD, HUE CITY, VIET NAM', 'TPBVVNVX', 4),
  ('BANK FOR INVESTMENT AND DEVELOPMENT OF VIETNAM JSC - HUE BRANCH', '5510020372', '41 HUNG VUONG STREET, THUAN HOA WARD, HUE CITY', 'BIDVVNVX', 5),
  ('SAIGON THUONG TIN COMMERCIAL JOINT STOCK BANK', '680120237999', '126 NGUYEN HUE STREET, THUAN HOA WARD, HUE CITY', 'SGTTVNVX', 6),
  ('UNITED OVERSEAS BANK (VIETNAM) LIMITED', '1039019421', '17 LE DUAN, BEN NGHE WARD, DISTRICT 1, HO CHI MINH CITY', 'UOVBVNVX', 7)
ON CONFLICT (account_no) DO NOTHING;

ALTER TABLE public.company_banks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_banks_read ON public.company_banks;
CREATE POLICY company_banks_read ON public.company_banks FOR SELECT TO authenticated USING (true);

-- 2) Hồ sơ chứng từ theo khách (1–1 với sales_customers) ---------------------
CREATE TABLE IF NOT EXISTS public.sales_customer_export_profiles (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id           uuid NOT NULL UNIQUE REFERENCES public.sales_customers(id) ON DELETE CASCADE,
  buyer_legal_name      text,
  buyer_address         text,
  consignee_name        text,
  consignee_address     text,
  notify_party          text,
  notify_address        text,
  shipping_marks        text,
  attn_contacts         text,
  preferred_bank_id     uuid REFERENCES public.company_banks(id),
  default_payment_term  text,
  doc_checklist         jsonb DEFAULT '[]'::jsonb,
  special_instructions  text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

ALTER TABLE public.sales_customer_export_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scep_read   ON public.sales_customer_export_profiles;
DROP POLICY IF EXISTS scep_write  ON public.sales_customer_export_profiles;
DROP POLICY IF EXISTS scep_update ON public.sales_customer_export_profiles;
DROP POLICY IF EXISTS scep_delete ON public.sales_customer_export_profiles;
CREATE POLICY scep_read   ON public.sales_customer_export_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY scep_write  ON public.sales_customer_export_profiles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY scep_update ON public.sales_customer_export_profiles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY scep_delete ON public.sales_customer_export_profiles FOR DELETE TO authenticated USING (true);
