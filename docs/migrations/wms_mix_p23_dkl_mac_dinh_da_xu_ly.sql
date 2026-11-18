-- ============================================================
-- HÀNG CHÈN — p23: DKL (dính kim loại) MẶC ĐỊNH LÀ ĐÃ XỬ LÝ KIM LOẠI (18/11/2026)
--   User: "Mặc định cái này là đã xử lý mới đem vô chèn, làm đơn giản đi" — hàng DKL chỉ được đem vào chèn SAU khi đã
--   xử lý kim loại ở khâu trước, nên bỏ hẳn bước chặn "chưa xử lý kim loại, chưa lấy được" + nút "Đã xử lý kim loại, mở lấy"
--   + ô tick "Đã rà kim loại pallet này" lúc lấy.
--   · mix_lots.metal_cleared: DEFAULT true; dòng cũ chưa true thì đặt true.
--   · Trigger trg_mix_lots_metal_mac_dinh: MỌI lô chèn (INSERT / UPDATE metal_cleared) luôn = true — nên client cũ chưa
--     deploy (vẫn gửi p_metal_cleared = false) cũng không làm lô bị khoá.
--   · Cột metal_cleared và nhánh DKL_CHUA_XU_LY trong fn_mix_lay GIỮ NGUYÊN (không bao giờ kích hoạt nữa) — không viết lại
--     hàm lớn chỉ để bỏ một dòng chết.
-- ⚠ agent_sql: KHÔNG BEGIN/COMMIT. Idempotent.
-- ============================================================

UPDATE public.mix_lots SET metal_cleared = true WHERE metal_cleared IS DISTINCT FROM true;

ALTER TABLE public.mix_lots ALTER COLUMN metal_cleared SET DEFAULT true;

CREATE OR REPLACE FUNCTION public.fn_mix_lots_metal_mac_dinh()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.metal_cleared := true;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mix_lots_metal_mac_dinh ON public.mix_lots;
CREATE TRIGGER trg_mix_lots_metal_mac_dinh
  BEFORE INSERT OR UPDATE OF metal_cleared ON public.mix_lots
  FOR EACH ROW EXECUTE FUNCTION public.fn_mix_lots_metal_mac_dinh();

COMMENT ON COLUMN public.mix_lots.metal_cleared IS 'Luôn true từ p23 (18/11/2026): hàng DKL phải xử lý kim loại TRƯỚC khi đem vào chèn, hệ thống không còn chặn / hỏi bước này.';

NOTIFY pgrst, 'reload schema';

-- ─── KIỂM CHỨNG ────────────────────────────────────────────────────────────
SELECT (SELECT count(*) FROM public.mix_lots WHERE NOT metal_cleared) AS lo_chua_xu_ly_phai_la_0,
       (SELECT column_default FROM information_schema.columns WHERE table_name = 'mix_lots' AND column_name = 'metal_cleared') AS mac_dinh_phai_la_true,
       (SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_mix_lots_metal_mac_dinh' AND NOT tgisinternal) AS trigger_phai_la_1;
