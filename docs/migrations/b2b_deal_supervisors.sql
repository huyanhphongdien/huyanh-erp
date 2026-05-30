-- ============================================================================
-- NGƯỜI GIÁM SÁT CHO DEAL — b2b.deal_supervisors
-- File: docs/migrations/b2b_deal_supervisors.sql
-- Chạy 1 lần trên Supabase SQL Editor (DB dùng chung ERP + Portal)
--
-- Phục vụ flow "Chạy đầu ra": đại lý cử người giám sát quá trình sản xuất tại
-- nhà máy. Người giám sát có thể đứng tên ký "Phiếu chốt thành phẩm"
-- (b2b.production_completion_certs.supervisor_id tham chiếu mềm tới bảng này).
--
-- Cột khớp với:
--   Portal  src/services/b2b/dealSupervisorService.ts (interface DealSupervisor)
--   ERP     src/components/b2b/CompletionCertSection.tsx
--   Portal  src/components/b2b/CompletionCertCard.tsx
-- ============================================================================

CREATE TABLE IF NOT EXISTS b2b.deal_supervisors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES b2b.deals(id) ON DELETE CASCADE,
  partner_id uuid REFERENCES b2b.partners(id) ON DELETE SET NULL,

  supervisor_name text NOT NULL,         -- Họ tên người giám sát
  supervisor_phone text,                 -- SĐT
  supervisor_id_card text,               -- CCCD
  supervisor_photo_url text,             -- ảnh (tuỳ chọn)

  -- assigned (đã cử) -> checked_in (đã có mặt) -> checked_out (đã rời)
  status text DEFAULT 'assigned',
  assigned_at timestamptz DEFAULT now(),
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_supervisors_deal ON b2b.deal_supervisors(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_supervisors_partner ON b2b.deal_supervisors(partner_id);

-- RLS (permissive, đồng nhất với b2b.production_completion_certs)
ALTER TABLE b2b.deal_supervisors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deal_supervisors_select" ON b2b.deal_supervisors;
CREATE POLICY "deal_supervisors_select" ON b2b.deal_supervisors
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "deal_supervisors_insert" ON b2b.deal_supervisors;
CREATE POLICY "deal_supervisors_insert" ON b2b.deal_supervisors
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "deal_supervisors_update" ON b2b.deal_supervisors;
CREATE POLICY "deal_supervisors_update" ON b2b.deal_supervisors
  FOR UPDATE USING (true);

-- Grant cho anon/authenticated (Portal đại lý + ERP nhà máy)
GRANT USAGE ON SCHEMA b2b TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON b2b.deal_supervisors TO anon, authenticated;
