-- ============================================================
-- KHO NGUYÊN LIỆU MỦ — GĐ1 · P2: HÀNG ĐỢI NHẬP KHO + CẢNH BÁO
-- Ngày: 2026-10-29
-- Phụ thuộc: wms_nvl_p1_so_kho_kho.sql, weighbridge_tickets(+items), raw_settings
--
--   · v_raw_intake_queue: phiếu cân VÀO đã hoàn tất, chưa vào sổ — kèm DRC đã có
--     hay chưa, số dòng lô, quy khô dự kiến. Màn "Nhập kho từ phiếu cân" đọc view này.
--   · v_raw_alerts: lô quá tuổi · phiếu chờ DRC · DRC thực thấp hơn NCC khai báo
--     quá ngưỡng · lô tồn đầu ước. Ngưỡng đọc từ raw_settings theo nhà máy.
--
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

-- ─── 1) Hàng đợi nhập kho ──────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_raw_intake_queue AS
WITH items AS (
  SELECT i.ticket_id,
         count(*)::int AS so_dong_lo,
         round(sum(COALESCE(i.actual_qty_kg, i.declared_qty_kg)), 2) AS wet_kg_dong,
         -- dòng thiếu DRC mà loại mủ không có DRC mặc định
         count(*) FILTER (
           WHERE i.drc_percent IS NULL
             AND (SELECT rt.drc_mac_dinh FROM public.raw_rubber_types rt
                   WHERE rt.code = public.fn_chuan_hoa_loai_mu(i.rubber_type)) IS NULL
         )::int AS so_dong_thieu_drc_rieng,
         count(*) FILTER (WHERE public.fn_chuan_hoa_loai_mu(i.rubber_type) = 'khac')::int AS so_dong_loai_la,
         round(sum(COALESCE(i.actual_qty_kg, i.declared_qty_kg) * COALESCE(i.drc_percent, 0) / 100), 2) AS dry_kg_dong_co_drc
    FROM public.weighbridge_ticket_items i
   GROUP BY i.ticket_id
)
SELECT
  t.id                                              AS ticket_id,
  t.code,
  t.facility_id,
  f.code                                            AS facility_code,
  t.ticket_type,
  t.status,
  t.completed_at,
  t.vehicle_plate,
  t.driver_name,
  t.supplier_name,
  t.source_type,
  t.rubber_type                                     AS rubber_type_goc,
  public.fn_chuan_hoa_loai_mu(t.rubber_type)        AS rubber_type,
  rt.name                                           AS rubber_type_name,
  rt.nhom,
  t.net_weight,
  t.expected_drc,
  t.qc_actual_drc,
  t.qc_status,
  COALESCE(t.qc_actual_drc, rt.drc_mac_dinh)        AS drc_dung,
  COALESCE(it.so_dong_lo, 0)                        AS so_dong_lo,
  it.wet_kg_dong,
  -- Sẵn sàng nhập: có dòng lô thì mọi dòng phải có DRC (riêng hoặc của phiếu / mặc định);
  -- không có dòng lô thì phiếu phải có DRC đo hoặc loại có DRC mặc định
  CASE
    WHEN COALESCE(it.so_dong_lo, 0) > 0 THEN
      (it.so_dong_loai_la = 0) AND (it.so_dong_thieu_drc_rieng = 0 OR t.qc_actual_drc IS NOT NULL)
    ELSE
      public.fn_chuan_hoa_loai_mu(t.rubber_type) <> 'khac' AND COALESCE(t.qc_actual_drc, rt.drc_mac_dinh) IS NOT NULL
  END                                               AS san_sang,
  CASE
    WHEN COALESCE(it.so_dong_lo, 0) > 0 AND it.so_dong_loai_la > 0 THEN 'loai_mu_la'
    WHEN COALESCE(it.so_dong_lo, 0) = 0 AND public.fn_chuan_hoa_loai_mu(t.rubber_type) = 'khac' THEN 'loai_mu_la'
    WHEN COALESCE(it.so_dong_lo, 0) > 0 AND it.so_dong_thieu_drc_rieng > 0 AND t.qc_actual_drc IS NULL THEN 'cho_drc'
    WHEN COALESCE(it.so_dong_lo, 0) = 0 AND COALESCE(t.qc_actual_drc, rt.drc_mac_dinh) IS NULL THEN 'cho_drc'
    ELSE 'ok'
  END                                               AS ly_do_cho,
  -- Quy khô dự kiến (ước, để hiển thị; số thật tính khi nhập)
  CASE
    WHEN COALESCE(it.so_dong_lo, 0) > 0 AND t.qc_actual_drc IS NOT NULL
      THEN round(it.wet_kg_dong * t.qc_actual_drc / 100, 2)
    WHEN COALESCE(it.so_dong_lo, 0) > 0 THEN it.dry_kg_dong_co_drc
    WHEN COALESCE(t.qc_actual_drc, rt.drc_mac_dinh) IS NOT NULL
      THEN round(t.net_weight * COALESCE(t.qc_actual_drc, rt.drc_mac_dinh) / 100, 2)
    ELSE NULL
  END                                               AS dry_kg_du_kien,
  -- DRC thực thấp hơn NCC khai (điểm) — dương = NCC khai cao hơn thực
  CASE WHEN t.expected_drc IS NOT NULL AND t.qc_actual_drc IS NOT NULL
       THEN round(t.expected_drc - t.qc_actual_drc, 2) END AS lech_drc_ncc,
  EXISTS (SELECT 1 FROM public.raw_stock_ledger l WHERE l.ref_type = 'weighbridge_ticket' AND l.ref_id = t.id) AS da_nhap,
  (SELECT min(b.batch_no) FROM public.stock_batches b WHERE b.weighbridge_ticket_id = t.id) AS batch_no
FROM public.weighbridge_tickets t
LEFT JOIN public.facilities f ON f.id = t.facility_id
LEFT JOIN public.raw_rubber_types rt ON rt.code = public.fn_chuan_hoa_loai_mu(t.rubber_type)
LEFT JOIN items it ON it.ticket_id = t.id
WHERE t.status = 'completed'
  AND t.ticket_type IN ('in', 'fetch', 'retail')
  AND COALESCE(t.cargo_kind, 'raw') = 'raw';

ALTER VIEW public.v_raw_intake_queue SET (security_invoker = on);
GRANT SELECT ON public.v_raw_intake_queue TO authenticated;

-- ─── 2) Cảnh báo ───────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_raw_alerts AS
-- Lô quá tuổi
SELECT v.facility_id, 'qua_tuoi'::text AS loai, 'cao'::text AS muc,
       v.batch_id, v.batch_no, NULL::uuid AS ticket_id, NULL::text AS ticket_code,
       'Lô ' || v.batch_no || ' tồn ' || v.tuoi_ngay || ' ngày (ngưỡng ' || s.tuoi_lo_canh_bao_ngay || ')' AS tieu_de,
       v.rubber_type_name || ' · ' || v.wet_kg || ' kg ướt · ' || v.dry_kg || ' kg khô' AS chi_tiet,
       v.tuoi_ngay::numeric AS gia_tri
  FROM public.v_raw_stock_balance v
  CROSS JOIN LATERAL public.fn_raw_setting(v.facility_id) s
 WHERE v.dry_kg > 0.005 AND v.nhom = 'mu_tho' AND v.tuoi_ngay > s.tuoi_lo_canh_bao_ngay
UNION ALL
-- Phiếu cân xong, chờ DRC / loại mủ lạ
SELECT q.facility_id, CASE WHEN q.ly_do_cho = 'loai_mu_la' THEN 'loai_mu_la' ELSE 'cho_drc' END, 'vua',
       NULL, NULL, q.ticket_id, q.code,
       CASE WHEN q.ly_do_cho = 'loai_mu_la' THEN 'Phiếu ' || q.code || ' có loại mủ lạ: ' || COALESCE(q.rubber_type_goc, '(trống)')
            ELSE 'Phiếu ' || q.code || ' chờ DRC, chưa nhập kho được' END,
       COALESCE(q.supplier_name, '') || ' · ' || q.net_weight || ' kg ướt',
       NULL
  FROM public.v_raw_intake_queue q
 WHERE NOT q.da_nhap AND NOT q.san_sang
UNION ALL
-- DRC thực thấp hơn NCC khai báo quá ngưỡng (phiếu 7 ngày gần nhất)
SELECT q.facility_id, 'lech_drc_ncc', 'vua',
       NULL, NULL, q.ticket_id, q.code,
       COALESCE(q.supplier_name, 'NCC') || ': DRC thực thấp hơn khai báo ' || q.lech_drc_ncc || ' điểm',
       'Phiếu ' || q.code || ' · khai ' || q.expected_drc || ' % · đo ' || q.qc_actual_drc || ' %',
       q.lech_drc_ncc
  FROM public.v_raw_intake_queue q
  CROSS JOIN LATERAL public.fn_raw_setting(q.facility_id) s
 WHERE q.lech_drc_ncc > s.nguong_lech_drc_ncc_diem
   AND q.completed_at >= now() - interval '7 days'
UNION ALL
-- Lô tồn đầu ước (cần lấy mẫu DRC khi cân lại)
SELECT v.facility_id, 'ton_dau_uoc', 'thap',
       v.batch_id, v.batch_no, NULL, NULL,
       'Lô ' || v.batch_no || ' tồn đầu với DRC ước',
       v.rubber_type_name || ' · ' || v.wet_kg || ' kg ướt · lấy mẫu DRC ở lần cân lại',
       NULL
  FROM public.v_raw_stock_balance v
 WHERE v.dry_kg > 0.005 AND v.ton_dau_uoc;

ALTER VIEW public.v_raw_alerts SET (security_invoker = on);
GRANT SELECT ON public.v_raw_alerts TO authenticated;

-- ─── KIỂM CHỨNG (gửi lại kết quả) ──────────────────────────────────────────
-- (a) Hàng đợi: phiếu vào đã hoàn tất chưa vào sổ, theo nhà máy & lý do:
SELECT facility_code, ly_do_cho, count(*) AS so_phieu, round(sum(net_weight)) AS uot_kg
  FROM public.v_raw_intake_queue WHERE NOT da_nhap
 GROUP BY 1, 2 ORDER BY 1, 2;

-- (b) 5 phiếu mới nhất sẵn sàng nhập:
SELECT code, facility_code, completed_at, rubber_type, net_weight, drc_dung, so_dong_lo, dry_kg_du_kien
  FROM public.v_raw_intake_queue WHERE NOT da_nhap AND san_sang
 ORDER BY completed_at DESC LIMIT 5;

-- (c) Cảnh báo hiện có:
SELECT loai, muc, count(*) FROM public.v_raw_alerts GROUP BY 1, 2 ORDER BY 1;
