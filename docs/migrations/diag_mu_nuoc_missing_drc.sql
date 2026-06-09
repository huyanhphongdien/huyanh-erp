-- DIAGNOSTIC: mủ nước có batch nhưng thiếu DRC/ĐỐT — do ticket chưa có hay trigger không sync?
SELECT
  b.pnk_number                         AS pnk,
  b.intake_date,
  b.raw_rubber_type,
  b.drc_percent                        AS batch_drc,
  b.field_dot_reading                  AS batch_dot,
  t.code                               AS ticket_code,
  t.status                             AS ticket_status,
  t.qc_actual_drc                      AS ticket_drc,
  t.field_dot_reading                  AS ticket_dot,
  CASE
    WHEN t.id IS NULL THEN 'KHÔNG có ticket liên kết'
    WHEN t.qc_actual_drc IS NULL AND t.field_dot_reading IS NULL
         THEN 'OPERATOR CHƯA NHẬP DRC/ĐỐT ở phiếu cân'
    WHEN b.drc_percent IS NULL AND t.qc_actual_drc IS NOT NULL
         THEN 'TRIGGER KHÔNG SYNC — chạy backfill bên dưới'
    ELSE 'OK một phần'
  END AS chan_doan
FROM public.rubber_intake_batches b
LEFT JOIN public.weighbridge_tickets t ON t.id = b.weighbridge_ticket_id
WHERE b.raw_rubber_type = 'mu_nuoc'
  AND (b.drc_percent IS NULL OR b.field_dot_reading IS NULL)
ORDER BY b.intake_date DESC, b.pnk_number;

-- BACKFILL (chạy lại an toàn): vá batch nào ticket đã có DRC/ĐỐT mà batch còn trống
-- UPDATE public.rubber_intake_batches b
-- SET drc_percent       = COALESCE(b.drc_percent,       t.qc_actual_drc),
--     field_dot_reading = COALESCE(b.field_dot_reading, t.field_dot_reading)
-- FROM public.weighbridge_tickets t
-- WHERE b.weighbridge_ticket_id = t.id
--   AND ((b.drc_percent IS NULL AND t.qc_actual_drc IS NOT NULL)
--     OR (b.field_dot_reading IS NULL AND t.field_dot_reading IS NOT NULL));
