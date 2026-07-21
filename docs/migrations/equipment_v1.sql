-- =====================================================================
-- BƯỚC 1.2 — Bảng thiết bị (77 máy) + RLS. Đã chạy prod 21/07/2026.
-- Seed data: equipment_seed_data.json (mã HA-<KHU>-<số>). Idempotent.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(20) UNIQUE NOT NULL, name varchar(150) NOT NULL,
  khu_vuc varchar(60), cong_suat_kw numeric,
  facility_code varchar(10) DEFAULT 'PD', qr_token varchar(24),
  is_active boolean DEFAULT true, sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS equipment_read ON public.equipment;
CREATE POLICY equipment_read ON public.equipment FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS equipment_read_anon ON public.equipment;
-- anon đọc để quét QR chưa đăng nhập vẫn thấy tên máy
CREATE POLICY equipment_read_anon ON public.equipment FOR SELECT TO anon USING (is_active = true);
-- Seed 77 máy: chạy scripts/seed_equipment.py hoặc INSERT từ equipment_seed_data.json.
