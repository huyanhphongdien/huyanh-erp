-- ============================================================
-- ĐI LẤY MỦ TL→PĐ — 4 LẦN CÂN + ĐỐI CHIẾU (2 TL + 2 PĐ)
-- Ngày: 2026-07-16
-- Bối cảnh: chốt cân 4 lần để kiểm soát quá trình:
--   1) PĐ xe rỗng đi   2) TL xe rỗng đến   3) TL xe+mủ rời TL   4) PĐ xe+mủ về
--   - Mỗi trạm TỰ tính mủ trên chính bàn cân của mình (TL: 3−2, PĐ: 4−1) → không
--     lấy số chéo 2 cân nên KL mủ không dính lệch 0,9%.
--   - Số pallet RỜI TL do TL cân lần 2 xác lập → PĐ cân lần 2 đối chiếu.
-- Nối qua LỆNH ĐIỀU ĐỘNG: cả 2 phiếu cân (PĐ + TL) trỏ reference_id = lệnh.
--
-- Idempotent + an toàn go-live. Chạy 1 lần trên prod.
-- ============================================================

-- ─── Cột đối chiếu trên lệnh điều động ───
ALTER TABLE public.dispatch_orders
  -- Pallet CÒN TRÊN XE khi rời TL (= số về PĐ). TL cân lần 2 ghi vào.
  ADD COLUMN IF NOT EXISTS pallet_plastic_return integer,
  ADD COLUMN IF NOT EXISTS pallet_steel_return   integer,
  ADD COLUMN IF NOT EXISTS pallet_kg_return      numeric,
  -- Kết quả cân phía TÂN LÂM (cân 2+3): KL mủ theo TL.
  ADD COLUMN IF NOT EXISTS tl_ticket_id          uuid,
  ADD COLUMN IF NOT EXISTS tl_net_kg             numeric,
  ADD COLUMN IF NOT EXISTS tl_weighed_at         timestamptz,
  -- Kết quả cân phía PHONG ĐIỀN (cân 1+4): KL mủ theo PĐ. (pd_ticket = weighbridge_ticket_id)
  ADD COLUMN IF NOT EXISTS pd_net_kg             numeric,
  ADD COLUMN IF NOT EXISTS pd_weighed_at         timestamptz;

-- ─── Quyền cho app cân (anon) ghi các cột đối chiếu ───
-- App cân dùng anon key; cần UPDATE được các cột này trên lệnh.
GRANT UPDATE (
  pallet_plastic_return, pallet_steel_return, pallet_kg_return,
  tl_ticket_id, tl_net_kg, tl_weighed_at,
  pd_net_kg, pd_weighed_at, weighbridge_ticket_id
) ON public.dispatch_orders TO anon;

-- RLS: đảm bảo có policy cho anon UPDATE lệnh (app cân ghi kết quả cân).
-- Tạo nếu chưa có (không phá policy cũ). WITH CHECK true — app cân là nội bộ, mạng riêng.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.dispatch_orders'::regclass
      AND polname = 'do_anon_update_weighbridge'
  ) THEN
    CREATE POLICY "do_anon_update_weighbridge" ON public.dispatch_orders
      FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ─── Reload PostgREST schema cache ───
NOTIFY pgrst, 'reload schema';

-- ─── VERIFY ───
-- (a) Cột đã thêm đủ?
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'dispatch_orders'
  AND column_name IN (
    'pallet_plastic_return','pallet_steel_return','pallet_kg_return',
    'tl_ticket_id','tl_net_kg','tl_weighed_at','pd_net_kg','pd_weighed_at'
  )
ORDER BY column_name;

-- (b) Policy anon update tồn tại?
SELECT polname, polcmd
FROM pg_policy
WHERE polrelid = 'public.dispatch_orders'::regclass
  AND polname = 'do_anon_update_weighbridge';
