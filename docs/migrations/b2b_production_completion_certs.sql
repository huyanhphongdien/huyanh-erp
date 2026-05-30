-- ============================================================================
-- PHIẾU CHỐT THÀNH PHẨM — Production Completion Certificate (ký 2 bên)
-- File: docs/migrations/b2b_production_completion_certs.sql
-- Chạy 1 lần trên Supabase SQL Editor (DB dùng chung ERP + Portal b2b)
-- Bản sao đồng bộ với huyanh-b2b-portal/sql/production_completion_certs.sql
--
-- Phục vụ phương cách mua "Chạy đầu ra" (purchase_type='drc_after_production'):
-- Sau khi nhà máy ra thành phẩm + QC final, nhà máy lập "Phiếu chốt thành phẩm"
-- (đính kèm file/PDF), người giám sát đại lý (đã cử qua b2b.deal_supervisors)
-- xem + ký xác nhận trên Portal. Mô phỏng pattern b2b.acceptances (ký số 2 bên).
-- ============================================================================

CREATE TABLE IF NOT EXISTS b2b.production_completion_certs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cert_number text UNIQUE NOT NULL,
  deal_id uuid NOT NULL REFERENCES b2b.deals(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES b2b.partners(id) ON DELETE CASCADE,

  -- Snapshot số liệu chốt tại thời điểm lập phiếu (giữ nguyên kể cả deal đổi sau)
  quantity_kg numeric,            -- KL nguyên liệu đầu vào (kg)
  sample_drc numeric,             -- DRC mẫu (trước SX, %)
  actual_drc numeric,             -- DRC thực tế sau QC final (%)
  finished_product_kg numeric,    -- KL thành phẩm ra (kg)
  unit_price numeric,             -- đơn giá quy khô (đ/kg)
  final_value numeric,            -- giá trị cuối (đ)

  -- File phiếu nhà máy upload (PDF/scan) — bucket b2b-documents
  factory_file_url text,
  factory_file_name text,

  -- Ký nhà máy
  factory_signer_name text,
  factory_signed_at timestamptz,
  factory_signature_url text,     -- ảnh chữ ký PNG — bucket b2b-signatures

  -- Ký đại lý / người giám sát
  -- (tham chiếu mềm tới b2b.deal_supervisors.id — KHÔNG FK cứng để tránh phụ
  --  thuộc thứ tự migration; chạy deal_supervisors_and_acceptances.sql để dùng
  --  tính năng "Cử người giám sát")
  supervisor_id uuid,
  partner_signer_name text,
  partner_signed_at timestamptz,
  partner_signature_url text,

  -- Trạng thái: draft -> pending_partner (nhà máy đã ký, chờ đại lý) -> fully_signed
  status text DEFAULT 'draft',
  note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT uq_completion_cert_deal UNIQUE (deal_id)
);

CREATE INDEX IF NOT EXISTS idx_completion_certs_deal ON b2b.production_completion_certs(deal_id);
CREATE INDEX IF NOT EXISTS idx_completion_certs_partner ON b2b.production_completion_certs(partner_id);

-- RLS (permissive, đồng nhất với b2b.acceptances / b2b.deal_supervisors)
ALTER TABLE b2b.production_completion_certs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "completion_certs_select" ON b2b.production_completion_certs;
CREATE POLICY "completion_certs_select" ON b2b.production_completion_certs
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "completion_certs_insert" ON b2b.production_completion_certs;
CREATE POLICY "completion_certs_insert" ON b2b.production_completion_certs
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "completion_certs_update" ON b2b.production_completion_certs;
CREATE POLICY "completion_certs_update" ON b2b.production_completion_certs
  FOR UPDATE USING (true);

-- Grant cho anon/authenticated (Portal đại lý + ERP nhà máy)
GRANT USAGE ON SCHEMA b2b TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON b2b.production_completion_certs TO anon, authenticated;

-- updated_at tự cập nhật
CREATE OR REPLACE FUNCTION b2b.touch_completion_cert_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_completion_cert_updated_at ON b2b.production_completion_certs;
CREATE TRIGGER trg_completion_cert_updated_at
  BEFORE UPDATE ON b2b.production_completion_certs
  FOR EACH ROW EXECUTE FUNCTION b2b.touch_completion_cert_updated_at();
