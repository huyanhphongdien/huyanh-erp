-- ============================================================================
-- MIGRATION: Cho phép ticket_type = 'gate' (Cân xe ra/vô CỔNG — hàng nội bộ)
-- ----------------------------------------------------------------------------
-- Bối cảnh: nhà máy Phong Điền có thêm trường hợp cân xe chở HÀNG NỘI BỘ
--   (vật tư / phế liệu / thành phẩm...) ra vào cổng — KHÔNG phải mủ mua,
--   KHÔNG dính quy trình tồn kho/DRC/đề nghị thanh toán. Cân 2 lần (vào → ra),
--   chênh lệch = khối lượng hàng. Loại phiếu thứ 3 ngoài 'in' / 'out'.
--
-- An toàn / idempotent (go-live 2026-06-02):
--   - Nếu cột ticket_type có CHECK constraint giới hạn ('in','out') → nới ra
--     thành ('in','out','gate'). Tự dò tên constraint (không hard-code).
--   - Nếu KHÔNG có CHECK nào → bỏ qua (ticket_type là text tự do, không cần sửa).
--   - Chạy lại nhiều lần vẫn an toàn.
-- ============================================================================

DO $$
DECLARE
  v_conname text;
BEGIN
  -- Dò CHECK constraint hiện ràng buộc ticket_type (nếu có)
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.weighbridge_tickets'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%ticket_type%'
  LIMIT 1;

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.weighbridge_tickets DROP CONSTRAINT %I', v_conname);
    ALTER TABLE public.weighbridge_tickets
      ADD CONSTRAINT weighbridge_tickets_ticket_type_check
      CHECK (ticket_type IN ('in', 'out', 'gate'));
    RAISE NOTICE 'Đã nới CHECK ticket_type (%) → in/out/gate', v_conname;
  ELSE
    RAISE NOTICE 'Không có CHECK constraint trên ticket_type — không cần sửa (text tự do).';
  END IF;
END $$;
