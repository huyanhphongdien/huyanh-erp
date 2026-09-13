# MODULE CHẤM CÔNG – TÍNH LƯƠNG: BÀN GIAO TỪ PHIÊN PHÂN TÍCH (12–13/09/2026)

Tài liệu này để phiên Claude Code tiếp tục. Mọi kết luận dưới đây rút từ 7 file Excel lương tháng 08/2026 của HCNS (HAPĐ, HAQT, APQT, thời vụ, đội xe container).

## 1. File đi kèm trong Project (thư mục `claude/`)
- `payroll/schema_luong_khoan.sql` – schema PostgreSQL/Supabase (schema `payroll`), hàm `fn_calc_piece_payroll`, view đội xe, hàm kiểm tra + chốt kỳ, trigger chặn sửa kỳ đã chốt. **Đã nạp và test trên PostgreSQL 16: kết quả khớp 100% Excel tháng 8.**
- `payroll/LUONG_KHOAN_SX_DOI_XE_chuan_hoa.xlsx` – file Excel chuẩn hoá 13 sheet (lương khoán sản xuất + đội xe), có dữ liệu tháng 8 làm fixture, sheet `ERP_MAP` ánh xạ sheet → bảng.
- `payroll/De_xuat_CNTT_tinh_luong.docx` – đề xuất trình BGĐ (hiện trạng, 3 phương án, lộ trình 16 tuần).

## 2. Quyết định thiết kế đã chốt
1. Đặt module vào hệ thống HRM (`cao_su_hr`, nơi có máy chấm công Ronald Jack/ZK) – ERP chỉ đọc kết quả lương.
2. Mã nhân viên (mã máy chấm công) là khoá; **không tra cứu theo tên**.
3. Mọi định mức có `effective_from/effective_to`; kỳ lương chốt là bản chụp bất biến (`payslip_lines`), sửa = kỳ điều chỉnh.
4. Máy tính lương là hàm thuần có test; fixture = số liệu tháng 8/2026.
5. Excel hiện tại chỉ còn là bản xuất (Bảng lương, ĐNTT, BHXH, tem lương giữ đúng mẫu cũ).

## 3. Công thức lương khoán sản xuất (từ sheet "BCC sx khoán" – đã kiểm chứng)
Ký hiệu: T = tấn chế biến (đã trích 10%, gồm hanging, không gồm hàng chèn); H = tổng giờ khoán; N = số LĐ định mức (**42, gõ cứng trong file cũ – cần HCNS xác nhận**); h_i = giờ của người i; d_i = h_i/8.
- Đơn giá theo hệ số (bảng HS_SX, đ/tấn): 0.9→5800, 1.0→6400, 1.05→6700, 1.1→7100, 1.15→7400, 1.2→7700, 1.25→8000, 1.3→8300, 1.35→8600, 1.5→9600 (quy luật 400 + 6000×hs).
- Lương khoán SP_i = rate_i × T × h_i / (H/N)
- Hanging_i = (tấn hanging × 252.000) × h_i/H ; Chèn_i = (tấn chèn × 140.000) × h_i/H
- Việc khác chia chung_i = (Σ việc khác không đích danh, gồm khoản trừ âm) × h_i/H ; đích danh cộng thẳng cho người được ghi.
- Trừ công nhật_i = −(Σ lương công nhật) × h_i/H ; công nhật = d × đơn giá (270k/300k)
- Tổng lương khoán_i = ROUNDDOWN(tổng trên, −3)
- Tiền ăn_i = ROUNDDOWN( T × 20.500 / Σ d (khoán + công nhật) × d_i , −3 )  (**20.500 = 500×41 gõ cứng – cần xác nhận**)
- Kết quả kiểm chứng T8: Nguyễn Ngọc Phương 106.735.000/6.408.000; Trần Văn Tâm 88.448.000/5.971.000; Hoàng Văn Anh 137.850.000/9.709.000; tổng 333.433.000 + 22.088.000.

## 4. Đội xe container
File cũ chỉ ghi chép chuyến/chi phí; lương khoán (10.253.000) gõ tay vào Bảng lương, **chưa có đơn giá**. Mô hình đề xuất: bảng giá tuyến (số ngày chuẩn, đơn giá chuyến) + nhật ký chuyến + nhật ký chi phí (VND/LAK, cờ được tính) → lương chuyến = đơn giá + vượt ngày × hỗ trợ + km × hỗ trợ dầu. Đơn giá trong file/SQL là **VÍ DỤ**, chờ HCNS.

## 5. Các quy tắc lương khác đã trích (cần HCNS xác nhận từng dòng)
Công chuẩn 26 hoặc 30; thử việc 85%; khoán tháng nhận nguyên lương; phép/lễ = lương BHXH/26 × ngày, lễ đi làm ×150%; chuyên cần 300.000 khi ≥ 29 công (cơ điện: 700k > 40 công, 500k > 26); BHXH NLĐ 10,5% (8+1,5+1), NSDLĐ 21,5%; công đoàn 1% tạm dừng 2026; trả nợ theo lịch; KPI hệ số; thực nhận ROUNDDOWN −3; thời vụ 300k–370k/ngày, trực lò 250k/12h, ca đêm A Lưới +100k/+80k; công nhân Lào lương/30 × công + 90k ăn/công.

## 6. Lưu ý chấm công phải xử lý trong màn hình mới
1. APQT có 2 bảng công trùng (BCC & Chuyên cần) đã lệch 1 ô (Chiến 17/08: "  " vs 8) → một nguồn duy nhất.
2. Chuyên cần bị sửa tay đè công thức không nhất quán → cần cột lý do/người duyệt cho ngoại lệ.
3. Ngày 30/31 gõ cứng 1900-01-30/31; công thức phép/lễ quét thiếu ngày 31 (I:AL vs I:AM); 6 dòng HAPĐ quét thiếu ngày 1.
4. Giờ >12 (16h, 24h) và giờ Chủ nhật tính như giờ thường (SUM/8); chỉ lễ có 150% → cần chính sách rõ + cảnh báo >12h/ngày.
5. Giờ lẻ 8,3 / 8,5 / 10,5 / 12,5 không có quy ước → validation bội số 0,5, 0–24.
6. Chú giải NLĐL2…24, NL\, CĐ không khớp công thức (chỉ L1…L24) → bảng ký hiệu chung 3 pháp nhân.
7. Ô chữ/dấu cách trong vùng số bị SUM bỏ qua âm thầm → data validation.
8. Một người xuất hiện ở 2–3 bảng (thời gian, khoán, RSS) không có kiểm tra tổng giờ/ngày.
9. Mã NV trống, thừa khoảng trắng, hai người chung mã (Trần Văn Tâm / Trần Đình Hải); tên có dấu cách đầu.
10. Không có dấu vết ai chấm/ai duyệt; ghi chú nghiệp vụ lẫn trong ô công.

## 7. Cấu trúc đề xuất trong repo và sprint
```
docs/payroll/{01-quy-tac-luong.md, 02-ky-hieu-cham-cong.md, 03-luu-y-file-cu.md, spec/}
supabase/migrations/20260912_payroll_schema.sql   (từ schema_luong_khoan.sql)
tests/payroll/fixtures/2026-08-hapd/*.csv + expected.json
tests/payroll/piece_payroll.test.ts
```
Sprint 1: migration + test xanh với fixture T8. Sprint 2: màn hình bảng công + import máy chấm công. Sprint 3: khoán/đội xe + đơn giá thật. Sprint 4: kiểm tra – duyệt – chốt kỳ – xuất Excel; chạy song song 1 kỳ.

## 8. Việc đầu tiên cho phiên Claude Code
1. Xác định repo HRM đang dùng stack gì (NestJS+Neon hay Supabase) và đã có bảng `employees` chưa → điều chỉnh schema cho khớp (tránh trùng bảng).
2. Tạo migration từ `schema_luong_khoan.sql`, xuất fixture CSV từ sheet NHAN_VIEN / BCC_KHOAN / KHOAN_KHAC / THAM_SO của file Excel, viết test so với `expected.json` (số ở mục 3).
3. Chỉ sau khi test xanh mới làm UI.

## 9. Lương thời gian (bổ sung 13/09/2026) – file `LUONG_THOI_GIAN_chuan_hoa.xlsx`
Một bảng công cho cả 3 pháp nhân; bảng ký hiệu KY_HIEU (P, P/2, NL, NL/2, L1…L24, CTL, CTL/2, CT, H, H/2, CĐ, KL, X) quy ra giờ theo 6 loại; điều chỉnh (tạm ứng, trả nợ, truy lĩnh, KPI, chuyên cần) ở sheet DIEU_CHINH có hiệu lực từ/đến và người duyệt.
Công thức (đã kiểm chứng khớp 16/16 người APQT + HAQT tháng 8):
- Giờ tính lương = Σ số giờ + Σ COUNTIF(mã) × giờ_tính_lương(mã); Công = giờ/8
- Lương thời gian = Khoán tháng ? lương CB : (Thử việc ? lương thử việc hoặc CB×85% : CB) / công chuẩn × công
- Lương phép / nghỉ lễ / chế độ cty = lương BHXH / 26 × ngày (chia 26 kể cả người công chuẩn 30 – theo file cũ)
- Lương làm ngày lễ (cộng thêm) = CB / công chuẩn / 8 × giờ L-n × 150%
- Chuyên cần: nhóm Chung ≥ 29 công → 300.000; nhóm Cơ điện > 26 → 500.000, > 40 → 700.000; nhóm Không (khoán tháng, công chuẩn 30) → 0; cộng điều chỉnh
- Tổng = thời gian + phép + lễ + làm lễ + chế độ + chuyên cần + phụ cấp cố định + truy lĩnh/cộng khác
- BHXH NLĐ = lương BHXH × 10,5% (nếu Đóng BHXH = Có); Thực nhận = ROUNDDOWN(tổng − BHXH − tạm ứng − trừ khác − KPI, −3)
Phát hiện khi đối chiếu: 3 khoản chuyên cần APQT (Hào −, Vinh −, Dương Vinh Quang +) là ghi tay trái quy tắc → để trong DIEU_CHINH với người duyệt "?" chờ HCNS.
Fixture: tests/payroll/fixtures/2026-08-thoigian/ (employees, attendance_codes, timesheet_entries, adjustments, expected.json).
Bảng ERP tương ứng: attendance_codes, employee_pay_profiles (thêm std_days, pay_type, attendance_group, fixed_allowance), timesheet_entries (value = hours hoặc code), payroll_adjustments (kind, amount, effective_from/to, reason, approved_by), fn_calc_time_payroll.

## 10. Lương thời vụ & công nhân Lào (bổ sung 13/09/2026) – file `LUONG_THOI_VU_LAO_chuan_hoa.xlsx`
Nhóm lao động (sheet NHOM) quyết định: đơn giá ngày mặc định, giờ/công (8 hoặc 12 trực lò), hỗ trợ/công ngày, hỗ trợ/công đêm, tiền ăn/công, ngày chia lương tháng, làm tròn. Người có đơn giá/tiền ăn riêng ghi ở NHAN_VIEN. Một người làm 2 nhóm = 2 dòng BCC (cùng mã, khác nhóm), thực nhận gộp theo người.
- Chấm công: số giờ, hậu tố N = ca đêm (12N). Công = giờ / giờ-của-nhóm; công đêm tính hỗ trợ đêm; (công − đêm) tính hỗ trợ ngày.
- Lương công = Lương ngày: công × đơn giá; Lương tháng: lương tháng / 30 × MIN(công, 30); Khoán tháng: lương tháng.
- Khoán tấn HAQT: KHOAN_TAN (ngày, tổ, kg, đ/tấn) + KT_NGUOI đánh dấu người tham gia theo ngày (ngày khoán tấn không chấm giờ). Chia: ROUNDDOWN(tiền/n, −3) mỗi người, trưởng tổ nhận phần dư; người đi theo tổ khác ghi "Tổ n" thay vì x. Bốc xếp mủ tạp: đích danh ≤ 3 mã, chia đều.
- Thực nhận = ROUNDDOWN((tổng − tạm ứng − trừ) / làm tròn nhóm) × làm tròn (Lào: nghìn; còn lại: đồng).
Kiểm chứng T8: khớp tuyệt đối RSS 15/15, trực lò 2/2, A Lưới 7/7 (Bảng lương A Lưới), lương ngày HAQT 30/30, bốc xếp 3/3. Khoán tấn: tổng khớp quỹ, từng người lệch vì file cũ chia tay không theo quy tắc (HCNS chốt quy tắc). Lào: thống nhất chia 30 (Ken lệch 61.290 so với cũ chia 31).
Phát hiện thêm: "Trần Thắng"/"Trần Thăng" là 1 người 2 tên; Lê Văn Nghị có ngày 29 giờ (17h RSS + 12h trực lò); ô chấm công định dạng ngày (8 hiển thị 08/01/1900); giờ 8,3 thay vì 8,5; Dương (Lào) ô ngày 31 ghi "31".
Fixture: tests/payroll/fixtures/2026-08-thoivu/. Bảng ERP: pay_groups, employee_pay_profiles (+group, pay_type, own_rate, own_meal, team, team_role), timesheet_entries (value hours + is_night), piece_tonnage, piece_participation (employee, date, team), fn_calc_seasonal_payroll.
