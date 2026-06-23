-- ============================================================================
-- SEED PHẢI THU KHÁCH HÀNG (Đợt 4) — vài hóa đơn xuất khẩu mẫu (USD)
-- ============================================================================
-- Chạy SAU: finance_receivables_v1.sql.
-- Ngày theo CURRENT_DATE → tuổi nợ luôn đúng. Idempotent ([seed-ar]). Xoá được.
-- (Dữ liệu THẬT 186 dòng từ Excel sẽ import riêng khi cần.)
-- ============================================================================

insert into public.fin_receivables
  (buyer_name, contract_no, commodity, currency, amount, amount_received, atd, term_days, bank, received_date, status, note)
select v.* from (values
  ('JIANGSU 241012'::text,    'GSZX241012'::text,      'SVR 10'::text, 'USD'::text, 467250::numeric, 0::numeric,      (CURRENT_DATE - 100)::date, 90, 'Vietinbank'::text, null::date,             'pending'::text,  '[seed-ar]'::text),
  ('KOHINOOR',                'HA20260050',            'SVR 10',       'USD', 89250,   0,        (CURRENT_DATE - 95)::date,  90, 'Vietinbank', null::date,             'pending',  '[seed-ar]'),
  ('CHINA TEA AUCTION',       '01/PD-CTA/2025',        'RSS 3',        'USD', 463050,  0,        (CURRENT_DATE - 70)::date,  90, 'Eximbank',   null::date,             'pending',  '[seed-ar]'),
  ('SHANGHAI YOUPU',          '01/PD-SYR/2025',        'SVR 10',       'USD', 232561,  0,        (CURRENT_DATE - 30)::date,  90, 'Vietinbank', null::date,             'pending',  '[seed-ar]'),
  ('GOUTAM',                  'GOUTAM HA 2026',        'SVR 3L',       'USD', 176554,  0,        (CURRENT_DATE - 135)::date, 90, 'Agribank',   null::date,             'pending',  '[seed-ar]'),
  ('ATC EOU',                 'LTC2024/PD-ATC',        'SVR 10',       'USD', 165057,  165057,   (CURRENT_DATE - 120)::date, 90, 'Vietinbank', (CURRENT_DATE - 20)::date, 'received', '[seed-ar]')
) as v(buyer_name, contract_no, commodity, currency, amount, amount_received, atd, term_days, bank, received_date, status, note)
where not exists (select 1 from public.fin_receivables r where r.note = '[seed-ar]');

-- Kiểm: select buyer_name, amount, atd, term_days, status from fin_receivables where note='[seed-ar]';
