-- ============================================================
-- TÁCH NHIỀU LÔ TRÊN 1 PHIẾU CÂN — bảng con weighbridge_ticket_lots
-- Ngày: 2026-07-17
-- Bối cảnh: 1 xe chở NHIỀU lô/mã hàng khác nhau (vd mủ tạp + mủ tờ). Cân tổng ra
--   Tổng NET; cân thêm 1 lần (xe sau khi dỡ 1 lô) → suy ra KL từng lô:
--     Lô đã dỡ  = (cân tổng − pallet tổng) − (cân sau dỡ − pallet sau dỡ)
--     Lô còn lại = Tổng NET − lô đã dỡ
--   Mỗi lô = 1 dòng ở bảng này → mở rộng N mã hàng dễ (chỉ thêm dòng).
-- Idempotent + an toàn go-live. App cân (anon) đọc+ghi được.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.weighbridge_ticket_lots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES public.weighbridge_tickets(id) ON DELETE CASCADE,
  lot_code    text,                    -- mã lô / mã hàng
  rubber_type text,                    -- loại mủ của lô (có thể khác nhau giữa các lô)
  net_kg      numeric NOT NULL DEFAULT 0,  -- KL thuần của lô (đã trừ pallet)
  is_derived  boolean NOT NULL DEFAULT false, -- true = lô SUY RA (= Tổng − các lô đã cân)
  sort_order  int NOT NULL DEFAULT 0,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wbl_ticket ON public.weighbridge_ticket_lots(ticket_id);

COMMENT ON TABLE public.weighbridge_ticket_lots IS
  'Chi tiết nhiều lô/mã hàng trên 1 phiếu cân (tách lô). Tổng phiếu = Σ net_kg các lô.';

-- ─── RLS: app cân dùng anon key → cho anon đọc+ghi (giống các bảng cân khác) ───
ALTER TABLE public.weighbridge_ticket_lots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.weighbridge_ticket_lots'::regclass AND polname='wbl_anon_all') THEN
    CREATE POLICY "wbl_anon_all" ON public.weighbridge_ticket_lots
      FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.weighbridge_ticket_lots'::regclass AND polname='wbl_auth_all') THEN
    CREATE POLICY "wbl_auth_all" ON public.weighbridge_ticket_lots
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weighbridge_ticket_lots TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ─── VERIFY ───
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='weighbridge_ticket_lots'
ORDER BY ordinal_position;
