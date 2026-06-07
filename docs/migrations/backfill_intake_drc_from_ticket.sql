-- ============================================================================
-- BACKFILL: ĐỐT + DRC cho rubber_intake_batches từ phiếu cân (mủ nước)
-- ----------------------------------------------------------------------------
-- Bối cảnh: nút "Lưu ĐỐT/DRC" ở app cân trước đây ghi nhầm vào cột
--   planned_drc_percent (DRC dự kiến) thay vì drc_percent (DRC thực — cột lái
--   dry_weight_kg GENERATED + hiển thị list + áp giá). Hệ quả: list Nhập kho mủ
--   trống cột DRC + KL khô + giá = 0 dù đã nhập ĐỐT/DRC.
--
-- Fix code: handleSaveDrc giờ ghi drc_percent. SQL này vá DỮ LIỆU CŨ:
--   drc_percent  ← COALESCE(drc_percent, qc_actual_drc của ticket, planned_drc_percent)
--   field_dot_reading ← COALESCE(field_dot_reading, ticket.field_dot_reading)
-- An toàn/idempotent: chỉ điền khi đang NULL, không đè giá trị đã có.
-- ============================================================================

UPDATE public.rubber_intake_batches b
SET
  drc_percent = COALESCE(b.drc_percent, t.qc_actual_drc, b.planned_drc_percent),
  field_dot_reading = COALESCE(b.field_dot_reading, t.field_dot_reading)
FROM public.weighbridge_tickets t
WHERE b.weighbridge_ticket_id = t.id
  AND (
    (b.drc_percent IS NULL AND (t.qc_actual_drc IS NOT NULL OR b.planned_drc_percent IS NOT NULL))
    OR (b.field_dot_reading IS NULL AND t.field_dot_reading IS NOT NULL)
  );

-- VERIFY: các lô mủ nước còn thiếu DRC sau backfill (nếu có → chưa đo DRC thật)
-- SELECT b.product_code, b.intake_date, b.raw_rubber_type, b.drc_percent, b.field_dot_reading,
--        t.code AS ticket_code, t.qc_actual_drc, t.field_dot_reading AS ticket_dot
-- FROM public.rubber_intake_batches b
-- LEFT JOIN public.weighbridge_tickets t ON t.id = b.weighbridge_ticket_id
-- WHERE b.raw_rubber_type = 'mu_nuoc' AND b.drc_percent IS NULL
-- ORDER BY b.intake_date DESC;
