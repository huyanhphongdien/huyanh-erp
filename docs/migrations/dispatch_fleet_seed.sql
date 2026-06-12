-- ============================================================================
-- SEED ĐỘI XE — import từ Excel "THEO DÕI THÔNG TIN ĐỘI XE HAPĐ 2026"
-- Date: 2026-06-12
-- Chạy SAU dispatch_module_v1.sql.
--
-- Idempotent:
--   - Tài xế: INSERT ... WHERE NOT EXISTS (theo full_name).
--   - Phương tiện: INSERT ... ON CONFLICT (plate) DO NOTHING.
-- Ngày dd.mm.yyyy đã đổi sang ISO. Giá trị phi-ngày (chưa/không/Chạy cảng) → *_note.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- TÀI XẾ (gắn đầu kéo). "Trống" trong Excel = chưa có tài xế → bỏ qua.
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO public.fleet_drivers (full_name)
SELECT v.full_name
FROM (VALUES
  ('Nguyễn Đăng Thiện'),
  ('Nguyễn Đình Hiếu'),
  ('Hoàng Hòa'),
  ('Nguyễn Hữu Mạnh Cường'),
  ('Bùi Văn Nghĩa'),
  ('Cao Phước Tiến'),
  ('Nguyễn Tiến Sỹ')
) AS v(full_name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.fleet_drivers d WHERE d.full_name = v.full_name
);

-- ════════════════════════════════════════════════════════════════════════════
-- ĐẦU KÉO (kind='tractor') — gắn tài xế cố định
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO public.fleet_vehicles
  (plate, kind, internal_code, brand, year_made, capacity_note, chassis_no, engine_no, color,
   default_driver_id, inspection_expiry, transit_expiry, badge_expiry, cavet_expiry, border_gate, note)
VALUES
  ('75H-02821','tractor','75H00604','CNHTC',2021,'2 chỗ','LZZ1CLVC3MA837860','MC114450210417214567','Trắng',
     (SELECT id FROM public.fleet_drivers WHERE full_name='Nguyễn Đăng Thiện' LIMIT 1),
     '2026-10-07','2026-10-13','2032-10-10','2046-06-01','VN-LAO',NULL),
  ('75H-03846','tractor','75H01041','CNHTC',2021,'2 chỗ','LZZ1CLVC5NA919641','MC114450211217218267','Trắng',
     (SELECT id FROM public.fleet_drivers WHERE full_name='Nguyễn Đình Hiếu' LIMIT 1),
     '2026-06-09','2027-06-08','2032-06-19','2047-12-31','VN-LAO','Phù hiệu chờ cấp mới'),
  ('75H-042.82','tractor','75H01093','CNHTC',2021,'2 chỗ','LZZ1CLVC7MA916495','MC11445021111721517','Trắng',
     NULL,
     '2026-06-03','2027-06-08','2032-06-09','2047-12-31','VN-LAO','Chưa gắn tài xế'),
  ('75H-038.43','tractor','75H01058','CNHTC',2021,'2 chỗ','LZZ1CLVC5MA916494','MC114450211117211547','Trắng',
     (SELECT id FROM public.fleet_drivers WHERE full_name='Hoàng Hòa' LIMIT 1),
     '2027-06-07','2027-06-08','2032-06-09','2046-12-31','VN-LAO',NULL),
  ('75H-038.41','tractor','75H00766','CNHTC',2021,'2 chỗ','LZZ1CLVC7MA840471','MC114450210417231747','Trắng',
     (SELECT id FROM public.fleet_drivers WHERE full_name='Nguyễn Hữu Mạnh Cường' LIMIT 1),
     '2027-05-28','2027-05-27','2032-05-15','2046-12-31','VN-LAO',NULL),
  ('75H-042.80','tractor','75H00668','CNHTC',2021,'2 chỗ','LZZ1CLVC5MA840467','MC114450210417231647','Trắng',
     NULL,
     '2026-05-13','2026-05-20','2032-05-17','2046-12-31','VN-LAO','Chưa gắn tài xế'),
  ('75H-042.85','tractor','75H00732','CNHTC',2021,'2 chỗ','LZZ1CLVC5MA840470','MC114450210417231667','Trắng',
     (SELECT id FROM public.fleet_drivers WHERE full_name='Bùi Văn Nghĩa' LIMIT 1),
     '2027-05-20','2027-05-27','2032-05-15','2046-12-31','VN-LAO',NULL),
  ('75H-038.85','tractor',NULL,'CNHTC',2025,'2 chỗ','LZZ1BGMJXSJ409176','MC072850250507825597','Trắng',
     (SELECT id FROM public.fleet_drivers WHERE full_name='Cao Phước Tiến' LIMIT 1),
     '2027-09-10',NULL,'2032-09-18','2050-09-11','VN-LAO','Transit: chưa')
ON CONFLICT (plate) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- RƠ-MÓOC (kind='trailer') — KHÔNG gắn tài xế, đổi liên tục mỗi chuyến
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO public.fleet_vehicles
  (plate, kind, internal_code, brand, year_made, capacity_kg, chassis_no, color,
   inspection_expiry, transit_expiry, transit_note, border_gate)
VALUES
  ('75RM-004.92','trailer','75R00732','DOOSUNG',    2021,32600,'RR2CNSXTZMVB07034','Xanh','2026-05-13','2027-06-08',NULL,'VN-LAO'),
  ('75RM-004.95','trailer','75R00730','DOOSUNG',    2021,32600,'RR2CNSXTZMVB07035','Xanh','2027-06-08','2027-05-27',NULL,'VN-LAO'),
  ('75RM-007.56','trailer','75R00773','DOOSUNG',    2021,32600,'RR2CNSXTZMVB07033','Xanh','2027-05-28','2027-05-27',NULL,'VN-LAO'),
  ('75RM-004.98','trailer','75R00725','XINHONGDONG',2021,33250,'LA9940JC7M9LHD046', 'Xanh','2026-09-03',NULL,'chưa','CẢNG'),
  ('75RM-00151', 'trailer','75R00951','DOOSUNG',    2022,32600,'RR2CNSXTZNVB07071','Xanh','2026-11-09','2027-01-28',NULL,'VN-LAO'),
  ('75RM-004.94','trailer','75R01046','HONGCHANG',  2022,29900,'LA99Z3DH2N0XHC370','Nâu','2026-04-22',NULL,'chưa','VN-LAO'),
  ('75RM-00141', 'trailer','75R00741','XINHONGDONG',2021,33250,'LA9940JC3M9LHD044', 'Xanh','2025-07-29',NULL,'Chạy cảng','VN-LAO'),
  ('75RM-00153', 'trailer','75R00953','DOOSUNG',    2022,32600,'RR2CNSXTZNVB07069','Xanh','2025-08-05',NULL,'chưa','VN-LAO'),
  ('75RM-00154', 'trailer','75R00709','XINHONGDONG',2021,33250,'LA9940JC1M9LHD043', 'Xanh','2025-07-29',NULL,'Chạy cảng','CẢNG'),
  ('75RM-007.55','trailer','75R00794','DOOSUNG',    2021,32600,'RR2CNSXTZNVB07055','Xanh','2027-05-21','2027-06-08',NULL,'VN-LAO'),
  ('75RM-007.57','trailer','75R00781','DOOSUNG',    2022,32600,'RR2CNSXTZNVB07054','Xanh','2025-06-09','2027-06-08',NULL,'VN-LAO')
ON CONFLICT (plate) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- XE KHÁC (kind='other') — tải nhỏ, bán tải, xe con/khách
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO public.fleet_vehicles
  (plate, kind, internal_code, brand, year_made, capacity_kg, capacity_note, chassis_no, engine_no, color,
   default_driver_id, inspection_expiry, transit_note, badge_expiry, cavet_expiry, border_gate)
VALUES
  ('75C-064.37','other',NULL,      'HYUNDAI',   2009,3500,NULL,    'KMFGA17BPAC129545','D4DB9412407','Trắng',NULL,'2025-12-25','Transit: 10.12.2025','2031-07-23','2035-12-31','VN-LAO'),
  ('75C-063.54','other',NULL,      'HYUNDAI',   2009,3500,NULL,    'KMFGA17BPAC130430','D4DB9413758','Xanh', NULL,'2026-01-15','Transit: không','2025-12-17','2035-12-31','VN-LAO'),
  ('51C-658.34','other',NULL,      'ISUZU',     2015,3855,NULL,    'RLEN1R75MF7100510','4HK1-391800','Trắng',
     (SELECT id FROM public.fleet_drivers WHERE full_name='Nguyễn Tiến Sỹ' LIMIT 1),
     '2025-12-05','Transit: không','2031-07-25','2040-12-31','VN'),
  ('51C-509.61','other',NULL,      'FORD',      2014,NULL,'5 chỗ', 'MNCDMFF20FW311907','P4AT1212400','Xanh', NULL,'2026-01-24','Transit: 08.12.2025',NULL,'2014-12-05','VN-LAO'),
  ('75A-417.13','other','75B023.61','HYUNDAI',  2022,NULL,'16 ghế','RLUUP37RPNB000650','N374110D4CB','Trắng',NULL,'2027-05-28','Transit: không; Chờ cấp mới',NULL,'2025-08-05','VN-LAO'),
  ('75A-109.37','other',NULL,      'MITSUBISHI',2017,NULL,'7 chỗ', 'RLA0NKG4WH1000293','4D56-UCFX5809','Đen',NULL,'2025-12-18','Transit: 19.12.2025',NULL,'2017-11-22','VN-LAO'),
  ('75A-524.73','other','51D869.49','MITSUBISHI',2023,NULL,'5 chỗ','MMBJJKL10PH075945','4N15UKD7127','Trắng',NULL,'2026-09-11','Transit: chưa',NULL,'2048-12-31','VN-LAO'),
  ('75A-417.50','other','51D860.17','ISUZU',    2022,NULL,'5 chỗ', 'MPATFS87JNT016321','RZ4EYS5853','Bạc',  NULL,'2027-06-10','Transit: 12.06.2026',NULL,'2047-12-31','VN-LAO'),
  ('75A-418.44','other','51D928.11','ISUZU',    2023,NULL,'5 chỗ', 'MPATFS87JPT024322','RZ4EEFK551','Trắng',NULL,'2026-06-17','Transit: 21.06.2026',NULL,'2048-12-31','VN-LAO'),
  ('75A-528.60','other','51D941.72','ISUZU',    2023,NULL,'5 chỗ', 'MPATFS87JPT024321','RZ4EEFK540','Trắng',NULL,'2026-09-11','Transit: chưa',NULL,'2048-12-31','VN')
ON CONFLICT (plate) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_tractor int; v_trailer int; v_other int; v_drivers int;
BEGIN
  SELECT COUNT(*) INTO v_tractor  FROM public.fleet_vehicles WHERE kind='tractor';
  SELECT COUNT(*) INTO v_trailer  FROM public.fleet_vehicles WHERE kind='trailer';
  SELECT COUNT(*) INTO v_other    FROM public.fleet_vehicles WHERE kind='other';
  SELECT COUNT(*) INTO v_drivers  FROM public.fleet_drivers;
  RAISE NOTICE '═══ dispatch_fleet_seed VERIFY ═══';
  RAISE NOTICE '  Đầu kéo: %  | Rơ-moóc: %  | Xe khác: %  | Tài xế: %', v_tractor, v_trailer, v_other, v_drivers;
END $$;
