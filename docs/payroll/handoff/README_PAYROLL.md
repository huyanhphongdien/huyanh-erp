# Gói bàn giao module Chấm công – Tính lương (giải nén vào gốc repo HRM)

docs/payroll/00-HANDOFF.md            ← ĐỌC TRƯỚC: quyết định, công thức, lưu ý chấm công, sprint
docs/payroll/De_xuat_CNTT_tinh_luong.docx  ← đề xuất trình BGĐ
supabase/migrations/20260912000000_payroll_schema.sql  ← schema + hàm tính + kiểm tra/chốt kỳ (đổi tên/đường dẫn nếu repo dùng Prisma/NestJS)
tests/payroll/fixtures/2026-08-hapd      ← lương khoán SX + đội xe (Excel + CSV + expected.json)
tests/payroll/fixtures/2026-08-thoigian  ← lương thời gian 3 pháp nhân (Excel + CSV + expected.json)
tests/payroll/fixtures/2026-08-thoivu    ← thời vụ RSS/trực lò/A Lưới/HAQT khoán tấn + công nhân Lào (Excel + CSV + expected.json)

Câu lệnh mở đầu cho Claude Code:
"Đọc docs/payroll/00-HANDOFF.md và tests/payroll/README.md. Kiểm tra stack hiện tại và bảng employees đã có,
điều chỉnh migration cho khớp, nạp fixture, chạy fn_calc_piece_payroll và viết test so với expected.json. Chưa làm UI."
