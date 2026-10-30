-- ============================================================
-- HÀNG CHÈN — p16: NỚI RÀNG BUỘC kg_in ĐỂ TẠO LÔ CHÈN NGẦM (30/10/2026 tối)
--   Lỗi khi bấm "Dùng" ở màn Lấy: new row for relation "mix_lots" violates check constraint "ml_kg_chk"
--   Nguyên nhân: p1 đặt CHECK (kg_in > 0 …) — lô chèn ngầm của phương án B (p15) tạo với kg_in = 0 rồi mới cộng lúc lấy.
--   Sửa: kg_in >= 0 (vẫn giữ kg_used >= 0, kg_at_line >= 0). Không đổi gì khác.
-- Ngày: 2026-10-30 · Phụ thuộc: wms_mix_p15_lo_chen_ngam.sql (CHẠY SAU p15)
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

ALTER TABLE public.mix_lots DROP CONSTRAINT IF EXISTS ml_kg_chk;
ALTER TABLE public.mix_lots ADD CONSTRAINT ml_kg_chk CHECK (kg_in >= 0 AND kg_used >= 0 AND kg_at_line >= 0);

NOTIFY pgrst, 'reload schema';

-- ─── KIỂM CHỨNG: phải thấy "kg_in >= 0" ─────────────────────────────────────
SELECT pg_get_constraintdef(oid) AS rang_buoc FROM pg_constraint WHERE conname = 'ml_kg_chk' AND conrelid = 'public.mix_lots'::regclass;
