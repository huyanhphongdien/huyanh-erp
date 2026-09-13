# Test lương khoán sản xuất – fixture tháng 08/2026 (HAPĐ)

Nguồn: sheet "BCC sx khoán" file Lương nội bộ HAPĐ T8/2026, đã chuẩn hoá trong `fixtures/2026-08-hapd/LUONG_KHOAN_SX_DOI_XE_chuan_hoa.xlsx`.

Cách dùng (PostgreSQL / Supabase):
1. Chạy migration `supabase/migrations/20260912000000_payroll_schema.sql`.
2. Nạp `employees.csv` → `payroll.employees` + `payroll.employee_pay_profiles` (effective_from 2026-01-01),
   `period_params.json` → `payroll.payroll_periods` + `payroll.piece_period_params`,
   `timesheet_entries.csv` → `payroll.timesheet_entries`, `extra_piece_jobs.csv` → `payroll.extra_piece_jobs`.
3. `select payroll.fn_calc_piece_payroll(<period_id>);`
4. So `select employee_id, piece_total, meal_total from payroll.v_piece_payslip` với `expected.json`.
   Phải khớp tuyệt đối (đã kiểm chứng ngày 12/09/2026).
