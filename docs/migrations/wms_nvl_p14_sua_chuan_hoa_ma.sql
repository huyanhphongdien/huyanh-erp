-- ============================================================
-- MÃ NVL — p14: SỬA HÀM CHUẨN HOÁ MÃ (30/10/2026 tối): gõ "TMHG-15" bị thành "TMHG-1"
--   Nguyên nhân: regex '^([A-Z][A-Z ]*?)\s*(\d{1,4})…' có quantifier lười (*?) đứng đầu → trong Postgres cả biểu thức
--   ưu tiên khớp NGẮN NHẤT, nên (\d{1,4}) chỉ lấy 1 chữ số. Ảnh hưởng: ô "Tạo mã", ô mã lúc nhận phiếu cân, gợi ý mã.
--   Sửa: nhóm chữ dùng quantifier tham ([A-Z]+(?: [A-Z]+)*) → cả biểu thức tham → số lấy đủ 1–4 chữ số.
--   Dọn: xoá mã TMHG-1 tạo nhầm hôm nay nếu chưa gắn gì.
-- Ngày: 2026-10-30 · Độc lập với p11–p13 (chạy lúc nào cũng được, nên chạy NGAY trước khi nhập dữ liệu thật).
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_chuan_hoa_ma_nvl(p_text text)
RETURNS TABLE (ma text, nguon text, so int, xe text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v text; m text[]; v_nguon text; v_so int; v_xe text; v_alias text;
BEGIN
  IF p_text IS NULL OR btrim(p_text) = '' THEN RETURN; END IF;
  v := upper(p_text);
  v := translate(v, 'ÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ',
                     'AAAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYD');
  v := btrim(regexp_replace(v, '[^A-Z0-9]+', ' ', 'g'));
  -- bỏ cụm loại mủ đứng đầu (MU TAP, MU TO, HU TO, MH TO, MU NUOC, MU DONG…)
  v := regexp_replace(v, '^(MU|HU|MH|MUI)\s+(TAP|TO|NUOC|DONG|CHEN|DA|TO SO)\s+', '');
  v := regexp_replace(v, '^(MU|MUI)\s+', '');
  -- XE n
  v_xe := substring(v from '\mXE\s*(\d+)');
  v := regexp_replace(v, '\s*\mXE\s*\d*.*$', '');
  -- chữ (cho phép khoảng trắng giữa các chữ) rồi số 1–4 chữ số, rồi (tuỳ chọn) số thứ hai = xe
  -- ⚠ KHÔNG dùng quantifier lười (*?) ở đây: Postgres lấy ưu tiên của quantifier đầu tiên cho cả biểu thức → số bị cắt còn 1 chữ số
  m := regexp_match(v, '^([A-Z]+(?: [A-Z]+)*)\s*(\d{1,4})(?:\s+(\d{1,3}))?');
  IF m IS NULL THEN RETURN; END IF;
  v_nguon := regexp_replace(m[1], '\s+', '', 'g');
  v_so := m[2]::int;
  IF v_xe IS NULL AND m[3] IS NOT NULL THEN v_xe := m[3]; END IF;
  SELECT a.thanh INTO v_alias FROM public.raw_lot_aliases a WHERE a.tu = v_nguon;
  IF v_alias IS NOT NULL THEN v_nguon := v_alias; END IF;
  ma := v_nguon || '-' || v_so; nguon := v_nguon; so := v_so; xe := v_xe;
  RETURN NEXT;
END $$;

-- Dọn mã tạo nhầm hôm nay (TMHG-1 từ "TMHG-15") nếu chưa gắn lô xe / phiếu nào
DELETE FROM public.raw_lots rl
 WHERE rl.ma = 'TMHG-1' AND rl.created_at >= timestamptz '2026-10-30 00:00+07'
   AND NOT EXISTS (SELECT 1 FROM public.stock_batches b WHERE b.raw_lot_id = rl.id)
   AND NOT EXISTS (SELECT 1 FROM public.raw_lot_runs r WHERE r.raw_lot_id = rl.id)
   AND NOT EXISTS (SELECT 1 FROM public.mix_issues i WHERE i.raw_lot_id = rl.id)
   AND NOT EXISTS (SELECT 1 FROM public.shift_production_reports s WHERE s.raw_lot_id = rl.id);

NOTIFY pgrst, 'reload schema';

-- ─── KIỂM CHỨNG: cột ma phải ra TMHG-15, TMHG-17, TMHG-40, SBR-1502, KHMN-15 (xe 07), TMHG-40 ──
SELECT t.vao, p.ma, p.nguon, p.so, p.xe
  FROM (VALUES ('TMHG-15'), ('TMHG-17'), ('TMHG 40'), ('SBR-1502'), ('KH MN 15 07'), ('Mủ tạp TMHG 40 xe 3'), ('tmhg40')) AS t(vao)
  LEFT JOIN LATERAL public.fn_chuan_hoa_ma_nvl(t.vao) p ON true;
