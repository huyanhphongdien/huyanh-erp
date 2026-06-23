-- ============================================================================
-- SEED TỒN QUỸ 112 + PHẢI NỘP ĐỊNH KỲ (Đợt 5) — từ Excel
-- ============================================================================
-- Chạy SAU: finance_cash_v1.sql. Idempotent (note '[seed-quy]' / '[seed-pay]').
-- Số dư lấy snapshot Excel QUỸ 112; phải nộp từ "CÁC KHOẢN ĐẾN KỲ PHẢI NỘP".
-- DỮ LIỆU MẪU — cập nhật số thật khi dùng.
-- ============================================================================

-- Tồn quỹ 8 ngân hàng
insert into public.fin_cash_balances (bank, vnd, usd, kip, as_of_date, sort_order, note)
select v.* from (values
  ('Ngân hàng TPbank'::text,    227312709::numeric, 396.58::numeric,  0::numeric, current_date::date, 1, '[seed-quy]'::text),
  ('Ngân hàng Vietinbank',       18611523,           609.49,           0, current_date, 2, '[seed-quy]'),
  ('Ngân hàng Agribank',        279703397,          2027.43,           0, current_date, 3, '[seed-quy]'),
  ('Ngân hàng UOB',               7172500,           486.20,           0, current_date, 4, '[seed-quy]'),
  ('Ngân hàng Eximbank',          5649480,           384.20,           0, current_date, 5, '[seed-quy]'),
  ('Ngân hàng BIDV',              6657051,           248.54,           0, current_date, 6, '[seed-quy]'),
  ('Ngân hàng Sacombank',      5004954600,                0,           0, current_date, 7, '[seed-quy]'),
  ('Ngân hàng ACB',             139000000,                0,           0, current_date, 8, '[seed-quy]')
) as v(bank, vnd, usd, kip, as_of_date, sort_order, note)
where not exists (select 1 from public.fin_cash_balances where note = '[seed-quy]');

-- Khoản phải nộp định kỳ
insert into public.fin_recurring_payables (name, category, due_day, due_rule, amount_est, active, sort_order, note)
select v.* from (values
  ('Công ty cho thuê tài chính'::text, 'thue_tc'::text, 10::int,   null::text,                              null::numeric, true, 1, '[seed-pay]'::text),
  ('Điện lực Huế (CN)',                 'dien',          null,      '3 kỳ trong tháng (ngày 8 / 18 / 28)',   null,          true, 2, '[seed-pay]'),
  ('Bảo hiểm AGR',                      'bao_hiem',      25,        null,                                    null,          true, 3, '[seed-pay]'),
  ('Lãi các bank (trừ AGR & Sacom)',    'lai_vay',       25,        null,                                    null,          true, 4, '[seed-pay]')
) as v(name, category, due_day, due_rule, amount_est, active, sort_order, note)
where not exists (select 1 from public.fin_recurring_payables where note = '[seed-pay]');
