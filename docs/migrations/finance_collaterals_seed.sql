-- ============================================================================
-- SEED TÀI SẢN ĐẢM BẢO (HĐBĐ) — gán vào hạn mức Agribank mẫu (Đợt 3c)
-- ============================================================================
-- Chạy SAU: finance_credit_lines_link.sql, finance_credit_lines_seed.sql,
--           finance_collaterals_v1.sql.
-- Lấy từ sheet "HĐBĐ" (tài sản Agribank) → đảm bảo cho hạn mức HM-AGRI-99.
-- Idempotent: chỉ seed nếu chưa có row '[seed-hdbd]'. DỮ LIỆU MẪU — xoá được.
-- ============================================================================

insert into public.fin_collaterals
  (credit_line_id, bank, contract_ref, asset_name, asset_type, appraisal_date, appraisal_value, secured_value, status, note)
select c.id, 'Agribank', v.contract_ref, v.asset_name, v.asset_type, v.appraisal_date::date, v.appraisal_value, v.secured_value, 'active', '[seed-hdbd]'
from public.fin_credit_lines c
cross join (values
  ('4000-LCL-202500495', 'Xe ô tô tải ISUZU (đầu kéo 1)', 'xe',      '2025-10-24',  517000000::numeric,  387750000::numeric),
  ('4000-LCL-202500495', 'Xe ô tô tải ISUZU (đầu kéo 2)', 'xe',      '2025-10-24',  605000000::numeric,  453750000::numeric),
  ('4000-LCL-202500493', 'Hệ thống 08 silo chứa mủ',      'may_moc', '2025-10-24', 4815510185::numeric, 3611632639::numeric),
  ('4000-LCL-202400599', 'Hệ thống máy nghiền mủ',        'may_moc', '2024-12-11', 1104100000::numeric,  828075000::numeric),
  ('4000-LCL-202500039', 'Hệ thống 15 silo chứa mủ',      'may_moc', '2025-01-23', 7410000000::numeric, 5557500000::numeric)
) as v(contract_ref, asset_name, asset_type, appraisal_date, appraisal_value, secured_value)
where c.contract_no = 'HM-AGRI-99'
  and not exists (select 1 from public.fin_collaterals fc where fc.note = '[seed-hdbd]');

-- Kiểm: select asset_name, appraisal_value, secured_value from fin_collaterals where note='[seed-hdbd]';
