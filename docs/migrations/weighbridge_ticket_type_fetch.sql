-- ============================================================================
-- MIGRATION: Cho phép ticket_type = 'fetch' (Đi lấy mủ / Nhận mủ NM khác)
-- Date: 2026-07-16  (Đợt 2 phương án cân pallet TL→PĐ)
-- ----------------------------------------------------------------------------
-- Bối cảnh: PĐ đi lấy mủ ở Tân Lâm về — cân xe RỖNG lúc đi + xe HÀNG lúc về,
--   CÙNG bàn cân PĐ. Cân đảo chiều như 'out' (L1 tare → L2 gross) nhưng GHI NHẬN
--   là mủ NHẬP (có loại mủ/lô). Loại phiếu thứ 4 ngoài in/out/gate.
--
-- An toàn / idempotent (mẫu weighbridge_ticket_type_gate.sql):
--   - Nếu ticket_type có CHECK giới hạn → nới thêm 'fetch'. Dò động tên constraint.
--   - Nếu không có CHECK → bỏ qua. Chạy lại nhiều lần vẫn an toàn.
-- ============================================================================

DO $$
DECLARE v_conname text;
BEGIN
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
      CHECK (ticket_type IN ('in', 'out', 'gate', 'fetch'));
    RAISE NOTICE 'Đã nới CHECK ticket_type (%) → in/out/gate/fetch', v_conname;
  ELSE
    RAISE NOTICE 'Không có CHECK constraint trên ticket_type — không cần sửa (text tự do).';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
