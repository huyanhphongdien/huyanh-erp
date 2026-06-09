-- ============================================================================
-- TRIGGER: tự đồng bộ ĐỐT + DRC từ phiếu cân (weighbridge_tickets) sang
--          lý lịch mủ (rubber_intake_batches) mỗi khi giá trị thay đổi.
-- ----------------------------------------------------------------------------
-- Bối cảnh: ĐỐT/DRC nhập ở phiếu cân (qc_actual_drc, field_dot_reading) đôi khi
--   KHÔNG xuống lý lịch mủ → cột ĐỐT/DRC ở "Nhập kho mủ" trống dù phiếu cân có.
--   App đã đồng bộ ở handleComplete + nút "Lưu ĐỐT/DRC", nhưng để CHẮC CHẮN
--   (từ nay về sau mủ nước luôn có ĐỐT/DRC) → thêm trigger DB: hễ ticket đổi
--   qc_actual_drc / field_dot_reading thì cập nhật batch tương ứng.
-- An toàn/idempotent. Chỉ ghi đè batch khi ticket có giá trị (COALESCE).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_intake_drc_from_ticket()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.qc_actual_drc IS DISTINCT FROM OLD.qc_actual_drc
     OR NEW.field_dot_reading IS DISTINCT FROM OLD.field_dot_reading THEN
    UPDATE public.rubber_intake_batches
    SET drc_percent       = COALESCE(NEW.qc_actual_drc,    drc_percent),
        field_dot_reading = COALESCE(NEW.field_dot_reading, field_dot_reading)
    WHERE weighbridge_ticket_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_intake_drc ON public.weighbridge_tickets;
CREATE TRIGGER trg_sync_intake_drc
AFTER UPDATE OF qc_actual_drc, field_dot_reading ON public.weighbridge_tickets
FOR EACH ROW
EXECUTE FUNCTION public.sync_intake_drc_from_ticket();

-- VÁ NGAY data hiện có: đồng bộ DRC/ĐỐT cho mọi batch đang trống mà ticket đã có.
UPDATE public.rubber_intake_batches b
SET drc_percent       = COALESCE(b.drc_percent,       t.qc_actual_drc),
    field_dot_reading = COALESCE(b.field_dot_reading, t.field_dot_reading)
FROM public.weighbridge_tickets t
WHERE b.weighbridge_ticket_id = t.id
  AND (
    (b.drc_percent IS NULL       AND t.qc_actual_drc    IS NOT NULL)
    OR (b.field_dot_reading IS NULL AND t.field_dot_reading IS NOT NULL)
  );
