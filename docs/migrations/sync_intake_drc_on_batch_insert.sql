-- ============================================================================
-- VÁ KHE HỞ THỨ TỰ: ĐỐT/DRC không xuống lý lịch mủ khi batch sinh ra TRƯỚC
--   thời điểm trigger sync bắt được UPDATE DRC trên phiếu cân.
-- ----------------------------------------------------------------------------
-- Bối cảnh: trg_sync_intake_drc (AFTER UPDATE OF qc_actual_drc trên
--   weighbridge_tickets) chỉ chạy khi batch ĐÃ tồn tại. Nếu bridge tạo batch
--   ở cùng/ trước transaction nhập DRC, UPDATE bắt 0 dòng → batch trống dù
--   ticket có DRC (vd CX-20260609-003: ticket_drc=37, ĐỐT=201 mà batch NULL).
-- Cách bịt: thêm trigger PHÍA batch (AFTER INSERT) — hễ batch sinh ra mà chưa
--   có DRC/ĐỐT thì tự KÉO từ phiếu cân liên kết. Bất kể thứ tự, batch luôn
--   nhận được DRC/ĐỐT hiện có trên ticket.
-- An toàn/idempotent. Chỉ điền khi batch còn trống & ticket có giá trị.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pull_intake_drc_from_ticket()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_drc numeric;
  v_dot int;
BEGIN
  IF NEW.weighbridge_ticket_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Chỉ kéo khi batch còn thiếu
  IF NEW.drc_percent IS NOT NULL AND NEW.field_dot_reading IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT qc_actual_drc, field_dot_reading
    INTO v_drc, v_dot
  FROM public.weighbridge_tickets
  WHERE id = NEW.weighbridge_ticket_id;

  -- AFTER INSERT → cập nhật lại chính dòng vừa chèn (không sửa được NEW)
  IF (NEW.drc_percent IS NULL AND v_drc IS NOT NULL)
     OR (NEW.field_dot_reading IS NULL AND v_dot IS NOT NULL) THEN
    UPDATE public.rubber_intake_batches
    SET drc_percent       = COALESCE(drc_percent,       v_drc),
        field_dot_reading = COALESCE(field_dot_reading, v_dot)
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pull_intake_drc ON public.rubber_intake_batches;
CREATE TRIGGER trg_pull_intake_drc
AFTER INSERT ON public.rubber_intake_batches
FOR EACH ROW
EXECUTE FUNCTION public.pull_intake_drc_from_ticket();

-- VÁ NGAY data hiện có (gồm CX-20260609-003 / pnk #62): batch trống mà ticket có.
UPDATE public.rubber_intake_batches b
SET drc_percent       = COALESCE(b.drc_percent,       t.qc_actual_drc),
    field_dot_reading = COALESCE(b.field_dot_reading, t.field_dot_reading)
FROM public.weighbridge_tickets t
WHERE b.weighbridge_ticket_id = t.id
  AND (
    (b.drc_percent IS NULL       AND t.qc_actual_drc    IS NOT NULL)
    OR (b.field_dot_reading IS NULL AND t.field_dot_reading IS NOT NULL)
  );
