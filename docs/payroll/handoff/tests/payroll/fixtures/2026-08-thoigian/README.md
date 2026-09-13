# Fixture lương thời gian – tháng 08/2026 (APQT 13 người + HAQT 3 người)
Nguồn: sheet BCC lương thời gian / Bảng lương của 2 file cũ, chuẩn hoá trong LUONG_THOI_GIAN_chuan_hoa.xlsx.
- employees.csv: hồ sơ lương (pay_type: Thời gian / Khoán tháng / Thử việc; std_days 26|30)
- attendance_codes.csv: bảng ký hiệu → giờ theo loại (thay cho COUNTIF L1..L24 trong công thức cũ)
- timesheet_entries.csv: value = số giờ hoặc mã
- adjustments.csv: tạm ứng / trừ khác / chuyên cần điều chỉnh (3 dòng chuyên cần là ghi tay trong file cũ, HCNS cần xác nhận)
- expected.json: kết quả phải khớp tuyệt đối (net = cột AC file cũ)
Công thức: xem sheet LUONG cột R–AF, hoặc docs/payroll/00-HANDOFF.md mục 9.
