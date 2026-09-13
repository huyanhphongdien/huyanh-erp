-- =====================================================================
-- SCHEMA LƯƠNG KHOÁN SẢN XUẤT & ĐỘI XE CONTAINER – Huy Anh Rubber
-- PostgreSQL / Supabase. Ánh xạ 1-1 với file LUONG_KHOAN_SX_DOI_XE_chuan_hoa.xlsx
-- Chạy theo thứ tự trong file này. Chưa có RLS – bổ sung theo phân quyền HRM.
-- =====================================================================

create schema if not exists payroll;
set search_path to payroll, public;

-- ---------- 1. Danh mục ----------
create table if not exists employees (
  employee_id   text primary key,              -- mã máy chấm công / CCCD (sheet NHAN_VIEN cột B)
  full_name     text not null,
  position      text,
  department    text,                          -- 'Sản xuất' | 'Đội xe' ...
  pay_type      text not null check (pay_type in ('khoan','cong_nhat','lai_xe','thoi_gian')),
  status        text not null default 'active' check (status in ('active','probation','seasonal','left')),
  note          text
);

-- Hồ sơ trả lương có hiệu lực theo ngày: hệ số khoán, đơn giá công nhật, lương BHXH
create table if not exists employee_pay_profiles (
  id              bigserial primary key,
  employee_id     text not null references employees,
  effective_from  date not null,
  effective_to    date,                        -- null = đang hiệu lực
  grade           numeric(4,2),                -- hệ số khoán (NHAN_VIEN cột G)
  daily_rate      numeric(14,0),               -- đơn giá công nhật đ/công (cột H)
  si_salary       numeric(14,0),               -- lương đóng BHXH
  unique (employee_id, effective_from)
);

-- Đơn giá khoán theo hệ số (thay file ngoài 'HS sx'), có lịch sử
create table if not exists piece_rate_by_grade (
  id              bigserial primary key,
  grade           numeric(4,2) not null,
  rate_per_ton    numeric(14,0) not null,      -- đ/tấn
  effective_from  date not null,
  effective_to    date,
  unique (grade, effective_from)
);

-- ---------- 2. Kỳ lương & tham số ----------
create table if not exists payroll_periods (
  period_id     bigserial primary key,
  company_code  text not null default 'HAPD',
  year          int  not null,
  month         int  not null check (month between 1 and 12),
  part          text not null default 'M' check (part in ('M','H1','H2')),  -- cả tháng / 1-15 / 16-31
  status        text not null default 'draft' check (status in ('draft','review','approved','locked')),
  locked_at     timestamptz,
  locked_by     text,
  unique (company_code, year, month, part)
);

-- Sheet THAM_SO: 1 dòng / kỳ / bộ phận sản xuất
create table if not exists piece_period_params (
  period_id          bigint primary key references payroll_periods,
  tons_processed     numeric(12,3) not null,   -- C6  Khối lượng chế biến (đã trích 10%, gồm hanging)
  tons_hanging       numeric(12,3) not null default 0,   -- C7
  hanging_rate       numeric(14,0) not null default 252000, -- C8 đ/tấn
  tons_insert        numeric(12,3) not null default 0,   -- C9 hàng chèn
  insert_rate        numeric(14,0) not null default 140000, -- C10 đ/tấn
  headcount_norm     int not null default 42,            -- C11 số LĐ định mức (số 42 gõ cứng cũ)
  meal_rate_per_ton  numeric(14,0) not null default 20500, -- C12 (= 500 x 41 cũ)
  hours_per_day      numeric(4,2) not null default 8,    -- C13
  default_daily_rate numeric(14,0) not null default 270000, -- C14
  rounding           int not null default 1000           -- C15
);

-- ---------- 3. Dữ liệu phát sinh ----------
-- Sheet BCC_KHOAN: 1 dòng / người / ngày (nguồn: máy chấm công hoặc nhập tay)
create table if not exists timesheet_entries (
  id           bigserial primary key,
  period_id    bigint not null references payroll_periods,
  employee_id  text   not null references employees,
  work_date    date   not null,
  hours        numeric(5,2) not null check (hours >= 0),
  code         text,                          -- 'NL','P','CTL'... nếu cần
  source       text not null default 'manual' check (source in ('machine','manual','import')),
  entered_by   text,
  unique (employee_id, work_date)
);

-- Sheet KHOAN_KHAC: việc khoán khác; employee_id null = chia chung theo giờ; amount âm = khoản trừ
create table if not exists extra_piece_jobs (
  id           bigserial primary key,
  period_id    bigint not null references payroll_periods,
  job_date     date,
  description  text not null,
  workdays     numeric(8,2) not null,
  unit_price   numeric(14,0) not null,
  amount       numeric(14,0) generated always as (workdays * unit_price) stored,
  employee_id  text references employees,     -- đích danh
  note         text
);

-- ---------- 4. Kết quả ----------
create table if not exists payslip_lines (
  id              bigserial primary key,
  period_id       bigint not null references payroll_periods,
  employee_id     text   not null references employees,
  component_code  text   not null,   -- KHOAN_SP | HANGING | CHEN | KHAC_CHUNG | KHAC_DICHDANH | TRU_CONGNHAT | CONG_NHAT | TIEN_AN | TRIP_PAY | TRIP_OT | TRIP_FUEL | TRIP_SUPPORT
  qty             numeric(14,4),
  rate            numeric(14,4),
  amount          numeric(14,0) not null,
  formula_note    text,             -- ghi công thức đã áp dụng để truy vết
  calculated_at   timestamptz not null default now()
);
create index if not exists payslip_lines_period_emp on payslip_lines(period_id, employee_id);

create table if not exists validation_results (
  id          bigserial primary key,
  period_id   bigint not null references payroll_periods,
  check_code  text not null,
  value       numeric,
  status      text not null check (status in ('OK','WARN','ERROR')),
  message     text,
  run_at      timestamptz not null default now()
);

-- =====================================================================
-- 5. HÀM TÍNH LƯƠNG KHOÁN SẢN XUẤT – mô phỏng đúng cột I..R sheet LUONG_KHOAN
-- =====================================================================
create or replace function fn_calc_piece_payroll(p_period_id bigint)
returns void language plpgsql as $$
declare
  p            piece_period_params%rowtype;
  v_from date; v_to date;
  v_total_hours_khoan numeric;   -- THAM_SO!C18
  v_avg_hours         numeric;   -- C19 = C18 / headcount_norm
  v_pool_hanging      numeric;   -- C20
  v_pool_insert       numeric;   -- C21
  v_pool_extra_shared numeric;   -- C22
  v_total_daily_pay   numeric;   -- C24 tổng lương công nhật
  v_total_days_meal   numeric;   -- C25 tổng công (khoán + công nhật)
  v_meal_per_day      numeric;   -- C27
  r record;
begin
  select * into p from piece_period_params where period_id = p_period_id;
  if not found then raise exception 'Chưa có tham số kỳ %', p_period_id; end if;
  select make_date(year, month, 1), (make_date(year, month, 1) + interval '1 month - 1 day')::date
    into v_from, v_to from payroll_periods where period_id = p_period_id;

  delete from payslip_lines where period_id = p_period_id
    and component_code in ('KHOAN_SP','HANGING','CHEN','KHAC_CHUNG','KHAC_DICHDANH','TRU_CONGNHAT','CONG_NHAT','TIEN_AN');

  -- Bảng tạm: giờ công + hồ sơ lương từng người trong kỳ
  create temp table t_emp on commit drop as
  select e.employee_id, e.pay_type,
         coalesce(sum(t.hours),0)                         as hours,
         coalesce(sum(t.hours),0) / p.hours_per_day        as days,
         pp.grade,
         coalesce(pp.daily_rate, p.default_daily_rate)     as daily_rate,
         (select rate_per_ton from piece_rate_by_grade g
            where g.grade = pp.grade and g.effective_from <= v_to
              and (g.effective_to is null or g.effective_to >= v_from)
            order by g.effective_from desc limit 1)        as rate_per_ton
  from employees e
  join employee_pay_profiles pp on pp.employee_id = e.employee_id
       and pp.effective_from <= v_to and (pp.effective_to is null or pp.effective_to >= v_from)
  left join timesheet_entries t on t.employee_id = e.employee_id and t.period_id = p_period_id
  where e.pay_type in ('khoan','cong_nhat')
  group by e.employee_id, e.pay_type, pp.grade, pp.daily_rate;

  select coalesce(sum(hours),0) into v_total_hours_khoan from t_emp where pay_type = 'khoan';
  v_avg_hours         := case when p.headcount_norm > 0 then v_total_hours_khoan / p.headcount_norm else 0 end;
  v_pool_hanging      := p.tons_hanging * p.hanging_rate;
  v_pool_insert       := p.tons_insert  * p.insert_rate;
  select coalesce(sum(amount),0) into v_pool_extra_shared from extra_piece_jobs where period_id = p_period_id and employee_id is null;
  select coalesce(sum(days * daily_rate),0) into v_total_daily_pay from t_emp where pay_type = 'cong_nhat';
  select coalesce(sum(days),0) into v_total_days_meal from t_emp;
  v_meal_per_day := case when v_total_days_meal > 0 then p.tons_processed * p.meal_rate_per_ton / v_total_days_meal else 0 end;

  if v_total_hours_khoan = 0 then raise exception 'Kỳ % chưa có giờ công khoán', p_period_id; end if;

  for r in select * from t_emp loop
    if r.pay_type = 'khoan' then
      if r.rate_per_ton is null then raise exception 'NV % hệ số % không có đơn giá', r.employee_id, r.grade; end if;
      -- I: tấn quy đổi = giờ / giờ TB * tấn ; J = đơn giá * tấn quy đổi
      insert into payslip_lines(period_id, employee_id, component_code, qty, rate, amount, formula_note) values
       (p_period_id, r.employee_id, 'KHOAN_SP', r.hours / v_avg_hours * p.tons_processed, r.rate_per_ton,
        round(r.rate_per_ton * r.hours / v_avg_hours * p.tons_processed), 'rate_per_ton * hours/avg_hours * tons_processed'),
       (p_period_id, r.employee_id, 'HANGING',   r.hours, v_pool_hanging / v_total_hours_khoan, round(v_pool_hanging / v_total_hours_khoan * r.hours), 'pool_hanging/total_hours*hours'),
       (p_period_id, r.employee_id, 'KHAC_CHUNG',r.hours, v_pool_extra_shared / v_total_hours_khoan, round(v_pool_extra_shared / v_total_hours_khoan * r.hours), 'pool_extra_shared/total_hours*hours'),
       (p_period_id, r.employee_id, 'CHEN',      r.hours, v_pool_insert / v_total_hours_khoan, round(v_pool_insert / v_total_hours_khoan * r.hours), 'pool_insert/total_hours*hours'),
       (p_period_id, r.employee_id, 'TRU_CONGNHAT', r.hours, -v_total_daily_pay / v_total_hours_khoan, round(-v_total_daily_pay / v_total_hours_khoan * r.hours), '-total_daily_pay/total_hours*hours');
    else
      insert into payslip_lines(period_id, employee_id, component_code, qty, rate, amount, formula_note) values
       (p_period_id, r.employee_id, 'CONG_NHAT', r.days, r.daily_rate, round(r.days * r.daily_rate), 'days * daily_rate');
    end if;
    -- M: đích danh
    insert into payslip_lines(period_id, employee_id, component_code, qty, rate, amount, formula_note)
    select p_period_id, r.employee_id, 'KHAC_DICHDANH', sum(workdays), null, sum(amount), 'extra_piece_jobs.employee_id = me'
      from extra_piece_jobs where period_id = p_period_id and employee_id = r.employee_id having sum(amount) <> 0;
    -- R: tiền ăn = ROUNDDOWN(tiền ăn/công * công, -3)
    insert into payslip_lines(period_id, employee_id, component_code, qty, rate, amount, formula_note) values
      (p_period_id, r.employee_id, 'TIEN_AN', r.days, v_meal_per_day, floor(v_meal_per_day * r.days / p.rounding) * p.rounding, 'floor(meal_per_day*days, rounding)');
  end loop;
end $$;

-- Tổng lương khoán từng người = ROUNDDOWN(tổng các dòng trừ TIEN_AN, -3) đối với khoán (giống cột Q)
create or replace view v_piece_payslip as
select l.period_id, l.employee_id, e.full_name, e.pay_type,
       case when e.pay_type = 'khoan'
            then floor(sum(amount) filter (where component_code <> 'TIEN_AN') / pp.rounding) * pp.rounding
            else sum(amount) filter (where component_code <> 'TIEN_AN') end as piece_total,      -- cột Q
       sum(amount) filter (where component_code = 'TIEN_AN')                as meal_total,       -- cột R
       sum(amount) filter (where component_code = 'KHOAN_SP')                as khoan_sp
from payslip_lines l
join employees e using (employee_id)
join piece_period_params pp using (period_id)
group by l.period_id, l.employee_id, e.full_name, e.pay_type, pp.rounding;

-- =====================================================================
-- 6. ĐỘI XE CONTAINER
-- =====================================================================
create table if not exists fleet_routes (               -- sheet XE_TUYEN
  route_code   text primary key,
  description  text not null,
  std_km       numeric(8,1),
  std_days     int not null,
  trip_rate    numeric(14,0) not null,
  support_per_ton numeric(14,0) not null default 0,
  effective_from date not null default current_date,
  effective_to   date
);

create table if not exists fleet_rate_rules (           -- sheet XE_THAM_SO
  id               bigserial primary key,
  effective_from   date not null,
  effective_to     date,
  overtime_day_rate numeric(14,0) not null default 0,   -- hỗ trợ vượt ngày
  fuel_rate_km      numeric(14,2) not null default 0,   -- hỗ trợ dầu /km
  lak_fx_rate       numeric(10,4) not null default 1    -- 1 LAK = ? VND
);

create table if not exists fleet_trips (                -- sheet XE_CHUYEN
  trip_id        bigserial primary key,
  period_id      bigint references payroll_periods,
  driver_id      text not null references employees,
  route_code     text not null references fleet_routes,
  depart_date    date not null,
  return_date    date not null check (return_date >= depart_date),
  truck_plate    text,
  trailer_plate  text,
  km_out         numeric(8,1) default 0,
  km_back        numeric(8,1) default 0,
  tons           numeric(10,3) default 0,
  containers     text,
  dispatch_no    text,
  has_dispatch_doc  boolean default false,   -- Phiếu điều động
  has_transport_log boolean default false,   -- Lý lịch vận tải
  note           text
);

create table if not exists fleet_expenses (             -- sheet XE_CHI_PHI
  expense_id    bigserial primary key,
  period_id     bigint references payroll_periods,
  trip_id       bigint references fleet_trips,
  driver_id     text not null references employees,
  expense_date  date not null,
  description   text not null,
  kind          text not null check (kind in ('advance','expense')),
  currency      text not null check (currency in ('VND','LAK')),
  amount        numeric(14,0) not null,
  approved      boolean not null default true,   -- "Được tính"
  has_invoice   boolean,
  invoice_url   text,                             -- ảnh hoá đơn (Supabase storage)
  note          text
);

-- Lương chuyến = trip_rate + vượt ngày*overtime + km*fuel + tấn*support  (cột V sheet XE_CHUYEN)
create or replace view v_fleet_trip_pay as
select t.trip_id, t.period_id, t.driver_id, t.route_code,
       (t.return_date - t.depart_date + 1)                       as total_days,
       greatest(0, (t.return_date - t.depart_date + 1) - r.std_days) as over_days,
       r.trip_rate,
       greatest(0, (t.return_date - t.depart_date + 1) - r.std_days) * rr.overtime_day_rate as overtime_pay,
       (coalesce(t.km_out,0) + coalesce(t.km_back,0)) * rr.fuel_rate_km                   as fuel_pay,
       coalesce(t.tons,0) * r.support_per_ton                                             as support_pay,
       r.trip_rate
         + greatest(0, (t.return_date - t.depart_date + 1) - r.std_days) * rr.overtime_day_rate
         + (coalesce(t.km_out,0) + coalesce(t.km_back,0)) * rr.fuel_rate_km
         + coalesce(t.tons,0) * r.support_per_ton                                         as trip_pay
from fleet_trips t
join fleet_routes r on r.route_code = t.route_code
join lateral (select * from fleet_rate_rules x where x.effective_from <= t.depart_date
              and (x.effective_to is null or x.effective_to >= t.depart_date)
              order by x.effective_from desc limit 1) rr on true;

-- Tổng hợp theo tài xế (sheet XE_LUONG)
create or replace view v_fleet_driver_summary as
select p.period_id, d.employee_id as driver_id, d.full_name,
       count(v.trip_id)                          as trips,
       coalesce(sum(v.total_days),0)             as days_on_road,
       coalesce(sum(v.trip_pay),0)               as trip_pay_total,        -- → Bảng lương cột X
       coalesce(sum(x.amount) filter (where x.kind='advance' and x.currency='VND'),0) as advance_vnd,
       coalesce(sum(x.amount) filter (where x.kind='advance' and x.currency='LAK'),0) as advance_lak,
       coalesce(sum(case when x.currency='LAK' then x.amount*rr.lak_fx_rate else x.amount end)
                filter (where x.kind='expense' and x.approved),0)          as approved_expense_vnd,
       coalesce(sum(case when x.currency='LAK' then x.amount*rr.lak_fx_rate else x.amount end)
                filter (where x.kind='expense' and not x.approved),0)      as rejected_expense_vnd
from payroll_periods p
cross join employees d
left join v_fleet_trip_pay v on v.driver_id = d.employee_id and v.period_id = p.period_id
left join fleet_expenses x on x.driver_id = d.employee_id and x.period_id = p.period_id
left join lateral (select * from fleet_rate_rules r where r.effective_from <= make_date(p.year,p.month,1)
                   order by r.effective_from desc limit 1) rr on true
where d.pay_type = 'lai_xe'
group by p.period_id, d.employee_id, d.full_name;

-- =====================================================================
-- 7. KIỂM TRA TRƯỚC KHI CHỐT (sheet KIEM_TRA) – gọi trước khi update status = 'locked'
-- =====================================================================
create or replace function fn_validate_piece_period(p_period_id bigint)
returns table(check_code text, value numeric, status text, message text) language sql as $$
  with p as (select * from piece_period_params where period_id = p_period_id),
  meal as (select coalesce(sum(amount),0) s from payslip_lines where period_id = p_period_id and component_code='TIEN_AN'),
  n as (select count(*) c from payslip_lines where period_id = p_period_id and component_code='TIEN_AN')
  select 'MEAL_POOL', (select tons_processed*meal_rate_per_ton from p) - meal.s,
         case when abs((select tons_processed*meal_rate_per_ton from p) - meal.s) <= n.c * (select rounding from p) then 'OK' else 'ERROR' end,
         'Tổng tiền ăn phân bổ so với quỹ tiền ăn' from meal, n
  union all
  select 'HEADCOUNT', count(distinct employee_id)::numeric,
         case when count(distinct employee_id) = (select headcount_norm from p) then 'OK' else 'WARN' end,
         'Số LĐ khoán có giờ công so với định mức'
    from timesheet_entries t join employees e using(employee_id)
   where t.period_id = p_period_id and e.pay_type='khoan' and t.hours > 0
  union all
  select 'DUP_EMP_DAY', count(*)::numeric, case when count(*)=0 then 'OK' else 'ERROR' end, 'Trùng chấm công người/ngày'
    from (select employee_id, work_date from timesheet_entries where period_id = p_period_id group by 1,2 having count(*)>1) d
  union all
  select 'NO_RATE', count(*)::numeric, case when count(*)=0 then 'OK' else 'ERROR' end, 'Người khoán có hệ số không có đơn giá'
    from employees e join employee_pay_profiles pp using(employee_id)
   where e.pay_type='khoan' and pp.effective_to is null
     and not exists (select 1 from piece_rate_by_grade g where g.grade = pp.grade and g.effective_to is null);
$$;

-- Chốt kỳ: chỉ cho phép khi không còn ERROR
create or replace function fn_lock_period(p_period_id bigint, p_user text)
returns void language plpgsql as $$
begin
  if exists (select 1 from fn_validate_piece_period(p_period_id) where status = 'ERROR') then
    raise exception 'Kỳ % còn lỗi kiểm tra, không được chốt', p_period_id;
  end if;
  update payroll_periods set status='locked', locked_at=now(), locked_by=p_user where period_id = p_period_id;
end $$;

-- Ngăn sửa dữ liệu của kỳ đã chốt
create or replace function trg_block_locked() returns trigger language plpgsql as $$
declare pid bigint;
begin
  pid := coalesce(new.period_id, old.period_id);
  if exists (select 1 from payroll_periods where period_id = pid and status = 'locked') then
    raise exception 'Kỳ % đã chốt – tạo kỳ điều chỉnh thay vì sửa', pid;
  end if;
  return coalesce(new, old);
end $$;
do $$
declare t text;
begin
  foreach t in array array['timesheet_entries','extra_piece_jobs','fleet_trips','fleet_expenses','piece_period_params'] loop
    execute format('drop trigger if exists block_locked on %I', t);
    execute format('create trigger block_locked before insert or update or delete on %I for each row execute function trg_block_locked()', t);
  end loop;
end $$;

-- =====================================================================
-- 8. DỮ LIỆU KHỞI TẠO – đơn giá theo hệ số (từ sheet HS_SX)
-- =====================================================================
insert into piece_rate_by_grade(grade, rate_per_ton, effective_from) values
 (0.90,5800,'2026-01-01'),(1.00,6400,'2026-01-01'),(1.05,6700,'2026-01-01'),(1.10,7100,'2026-01-01'),
 (1.15,7400,'2026-01-01'),(1.20,7700,'2026-01-01'),(1.25,8000,'2026-01-01'),(1.30,8300,'2026-01-01'),
 (1.35,8600,'2026-01-01'),(1.40,8800,'2026-01-01'),(1.50,9600,'2026-01-01')
on conflict do nothing;

-- Gợi ý test: nạp NHAN_VIEN, BCC_KHOAN, KHOAN_KHAC, THAM_SO tháng 8/2026 từ file Excel (CSV),
-- chạy select fn_calc_piece_payroll(<period_id>); rồi so v_piece_payslip với cột Q, R sheet LUONG_KHOAN:
--   Nguyễn Ngọc Phương 106.735.000 / 6.408.000 ; Trần Văn Tâm 88.448.000 / 5.971.000 ; Hoàng Văn Anh 137.850.000 / 9.709.000
