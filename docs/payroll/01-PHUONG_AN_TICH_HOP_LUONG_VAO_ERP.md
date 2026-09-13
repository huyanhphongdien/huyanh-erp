# PHƯƠNG ÁN ĐƯA MODULE CHẤM CÔNG – TÍNH LƯƠNG VÀO ERP HUY ANH

> Bản nháp v1 · 13/09/2026 · Người lập: Claude Code (phiên ERP) trên cơ sở gói bàn giao của phiên phân tích
> "Phương án CNTT tính lương" (12–13/09/2026) và khảo sát DB ERP hiện tại.
> **Trạng thái: ĐỀ XUẤT ĐỂ THẢO LUẬN — chưa code, chưa chạy migration, chưa đụng DB.**
> Gói bàn giao gốc để tham chiếu: [`handoff/00-HANDOFF.md`](handoff/00-HANDOFF.md) (đọc trước), schema nháp
> [`handoff/schema_luong_khoan_DRAFT_CHUA_AP.sql`](handoff/schema_luong_khoan_DRAFT_CHUA_AP.sql) (**chưa áp**),
> fixture tháng 8/2026: `handoff/tests/payroll/fixtures/`.

---

## 0. Tóm tắt điều hành

Khoảng **150 lao động** của 3 pháp nhân (HAPĐ – HAQT – APQT) + nhóm thời vụ (RSS, trực lò, A Lưới, công nhân Lào)
+ đội xe container đang tính lương hoàn toàn trên **7 file Excel** đã vượt ngưỡng an toàn (riêng HAPĐ 12.966 công thức,
3.805 `#REF!`, 240 công thức trỏ file ngoài trên OneDrive cá nhân/ổ D:/máy chủ 2005). Phiên phân tích đã **trích được
toàn bộ quy tắc lương và kiểm chứng công thức khớp 100% số liệu tháng 8** cho 3 kiểu lương (khoán sản xuất, thời gian,
thời vụ/Lào); đội xe mới có mô hình, **chưa có đơn giá thật**.

**Đề xuất:**
1. **Đặt module ngay trong ERP này** (không tách HRM riêng như bàn giao giả định) — vì ERP đã có `employees`, chấm công,
   `payroll_periods/payslips`, ca kíp, điều động, cân xe. Tách ra = 2 danh mục nhân viên, sẽ lệch.
2. **Ghép vào bảng sẵn có, thêm schema `payroll` cho máy tính lương**: `payslip_lines` (từng khoản, có công thức truy vết)
   → cuộn lên `payslips` cũ để màn/xuất cũ chạy tiếp.
3. **Khoá nhân viên = mã máy chấm công** (thêm cột `timekeeping_code`), mở danh mục từ 59 → ~150 người, đủ 3 pháp nhân.
4. **Tận dụng dữ liệu ERP đã có**: đội xe lấy chuyến/tấn/km từ Điều động + Cân xe (không nhập lại); sản lượng khoán đối
   chiếu sổ ca ép bánh.
5. **Chưa code cho tới khi HCNS/KTT chốt ~12 quy tắc còn treo** (mục 7) — đó là lý do phần này chỉ là phương án.

Lộ trình ~12 tuần + chạy song song 1–2 kỳ (khớp lộ trình 16 tuần trong đề xuất trình BGĐ).

---

## 1. Đánh giá gói bàn giao

| Mạnh (dùng được ngay) | Thiếu / phải điều chỉnh |
|---|---|
| Quy tắc lương trích từ >15.600 công thức, **kiểm chứng khớp tuyệt đối T8**: khoán SX (Phương 106.735.000/6.408.000 · Tâm 88.448.000/5.971.000 · Anh 137.850.000/9.709.000 · tổng 333.433.000 + 22.088.000), thời gian 16/16 người, thời vụ RSS 15/15 · trực lò 2/2 · A Lưới 7/7 · HAQT 30/30 · bốc xếp 3/3 | **Giả định sai bối cảnh**: đặt module ở HRM riêng `cao_su_hr`, tạo `payroll.employees` + `payroll.payroll_periods` MỚI → trùng với `public.employees`/`public.payroll_periods` đang có trong ERP |
| Schema `payroll` + hàm `fn_calc_piece_payroll` + view đội xe + `fn_validate` + `fn_lock` + trigger chặn sửa kỳ chốt, đã test trên PostgreSQL 16 | Schema mới chỉ có **khoán SX + đội xe**; hàm **thời gian** (`fn_calc_time_payroll`) và **thời vụ** (`fn_calc_seasonal_payroll`) mới được mô tả + có fixture, **chưa viết SQL** |
| 3 bộ fixture CSV + `expected.json` = bộ test nghiệm thu sẵn | Đội xe: đơn giá tuyến/vượt ngày/dầu là **VÍ DỤ**, lương khoán 10.253.000 T8 là **gõ tay**, chưa có công thức thật |
| Thiết kế đúng nguyên tắc: định mức có `effective_from/to`, kỳ chốt bất biến, kỳ điều chỉnh, máy tính lương thuần có test, Excel chỉ là bản xuất | Khoá nhân viên trong fixture là **CCCD/mã máy chấm công 12 số** (vd `046074013724`), ERP đang dùng **mã 13 số riêng** (`8999300000013`) → chưa có cầu nối |
| Danh sách 10 lỗi chấm công thực tế phải chặn ở màn mới (trùng bảng, sửa tay đè công thức, ngày 30/31, giờ >12h, giờ lẻ 8,3, mã không thống nhất, 1 người 3 bảng, mã trống/trùng, không audit) | ~12 quy tắc **"cần HCNS xác nhận"** (N=42, tiền ăn 20.500, chuyên cần, chia khoán tấn, Lào chia 30/31, vá cá nhân 4,5% / ×2 / +7tr) |

**Kết luận:** phần *công thức* đã rất chắc; phần *tích hợp vào ERP* và *chốt nghiệp vụ* là việc còn lại.

---

## 2. Hiện trạng ERP liên quan (khảo sát 13/09/2026)

| Hạng mục | Có gì | Ý nghĩa với module lương |
|---|---|---|
| `public.employees` | uuid `id`, `code` (13 số `8999300000xxx`), `full_name`, `department_id`, `position_id`, `salary_grade_id`, `status`, `hire_date`, `hac13_code` — **59 active** | Chỉ ~40% số người cần trả lương; **không có mã máy chấm công/CCCD**; thiếu pháp nhân, thiếu người thời vụ/Lào/lái xe. Đối chiếu 6 người khoán SX T8: tìm được 4 (Lê Vang, Trần Văn Hiền, Phạm Bá Lượng, Hoàng Văn Anh — *inactive*), **thiếu Nguyễn Ngọc Phương, Trần Văn Tâm** |
| `public.payroll_periods` | id, code, name, year, month, start/end, payment_date, status, total_*, confirmed_by/at | **Tái dùng** làm kỳ lương; thiếu `company_code` (pháp nhân), `part` (M / H1 / H2 cho thời vụ 2 kỳ), `locked_at/by` |
| `public.payslips` + `payslip_items` + `payrolls` | Model lương tháng chuẩn: công, lương CB, phụ cấp, OT, thưởng, gross, BHXH/BHYT/BHTN, thuế, net | Không biểu diễn được khoán/thời vụ/đội xe theo khoản → giữ làm **bản tổng hợp**, số chi tiết nằm ở `payslip_lines` mới |
| `salary_grades`, `performance_salary_config` | bậc lương, cấu hình KPI | Dùng cho lương thời gian (lương CB/BHXH), KPI hệ số |
| `public.attendance` | **sự kiện check-in/out** (GPS/QR): check_in/out_time, working_minutes, overtime_minutes, shift_id, is_gps_verified, work_units… + `attendance_edit_logs` | Khác mô hình lương cần (**giờ + mã ký hiệu P/NL/L1… theo người-ngày**); ghi nhớ: GPS chưa thực thi, 15% chấm không toạ độ → **không lấy làm nguồn lương ngay**, dùng đối chiếu |
| `shifts`, `shift_assignments`, `shift_teams`, `shift_production_reports`, sổ ca ép bánh (WMS) | ca kíp, tổ, sản lượng ca | Nguồn đối chiếu sản lượng khoán SX (tấn chế biến) |
| Điều động (`dispatch_orders`) + Cân xe (`weighbridge_tickets`) | chuyến, biển số, tấn, ngày đi/về | **Nguồn trực tiếp cho đội xe** (chuyến × tuyến, tấn, ngày) — không cần nhập lại nhật ký chuyến |
| Đề nghị thanh toán (`payment_requests`) | cửa chi tiền duy nhất của ERP | ĐNTT lương có thể đi qua đây (quyết định ở mục 8-G) |
| Schema `payroll` | **chưa có** | Sạch để thêm |

---

## 3. Năm bài toán tích hợp phải giải (khác với bàn giao)

1. **Định danh nhân viên** — bàn giao khoá theo CCCD/mã máy chấm công; ERP khoá theo uuid + mã 13 số; danh mục ERP chỉ 59/150.
   → Cần **một danh mục hợp nhất** với `timekeeping_code` ổn định, không tra theo tên (đúng nguyên tắc bàn giao #2).
2. **Kỳ lương** — không tạo `payroll.payroll_periods` mới; **mở rộng** `public.payroll_periods` (pháp nhân, kỳ 1–15/16–31, chốt).
3. **Mô hình chấm công** — ERP có sự kiện check-in; lương cần bảng công người×ngày (giờ/mã). → `timesheet_entries` là
   **nguồn sự thật cho lương**, nạp từ máy chấm công + nhập tay có duyệt; `attendance` (GPS/QR) chỉ **đối chiếu** giai đoạn đầu.
4. **Mô hình kết quả** — `payslips` cũ không có chỗ cho từng khoản khoán. → `payslip_lines` (khoản, qty, rate, amount,
   `formula_note`) là bản ghi truy vết; view cuộn lên `payslips` để màn cũ, xuất cũ chạy tiếp.
5. **Nhiều pháp nhân, nhiều chu kỳ** — 3 pháp nhân + thời vụ 2 kỳ/tháng + đội xe theo chuyến. → mọi bảng có `company_code`,
   kỳ có `part`; phân quyền theo pháp nhân.

---

## 4. Phương án kiến trúc đề xuất

### 4.1 Nguyên tắc
- **Một nguồn sự thật, trong ERP.** Không dựng HRM song song.
- **Dữ liệu tách khỏi quy tắc.** Mọi đơn giá/định mức là bảng có `effective_from/effective_to`.
- **Kỳ chốt là bản chụp bất biến.** Sửa = kỳ điều chỉnh (truy lĩnh/thu hồi).
- **Máy tính lương = hàm SQL thuần có test.** Fixture T8/2026 là điều kiện nghiệm thu, **test xanh rồi mới làm UI**.
- **Excel chỉ còn là bản xuất** (Bảng lương, BCC, BHXH, Tem lương, ĐNTT, file ngân hàng) — giữ đúng mẫu cũ.

### 4.2 Sơ đồ dữ liệu (rút gọn)
```
public.employees (+ timekeeping_code, company_code, employment_kind)        ← danh mục hợp nhất ~150
   └─ payroll.employee_pay_profiles (effective_from/to): pay_type, grade, daily_rate, si_salary,
        std_days, attendance_group, fixed_allowance, pay_group, own_rate, own_meal, team, team_role
public.payroll_periods (+ company_code, part M|H1|H2, locked_at/by)          ← kỳ lương dùng chung
   ├─ payroll.timesheet_entries   (employee, date, hours|code, is_night, group, source, entered_by, approved_by)
   ├─ payroll.piece_period_params (tấn chế biến, hanging, chèn, N, tiền ăn/tấn, giờ/công, làm tròn)
   ├─ payroll.extra_piece_jobs    (việc khoán khác: chung / đích danh, âm = trừ)
   ├─ payroll.piece_tonnage + piece_participation (khoán tấn HAQT theo ngày/tổ, ai tham gia)
   ├─ payroll.payroll_adjustments (tạm ứng, trả nợ theo lịch, truy lĩnh, KPI, chuyên cần ngoại lệ; có lý do + người duyệt)
   ├─ payroll.fleet_trips ⇐ (kéo từ dispatch_orders + weighbridge_tickets) + fleet_expenses (VND/LAK, "được tính")
   └─ payroll.payslip_lines       (component_code, qty, rate, amount, formula_note)  ← KẾT QUẢ truy vết
         └─ view → public.payslips (tổng hợp)  → xuất Excel/PDF/bank file
Danh mục dùng chung: payroll.attendance_codes (P, P/2, NL, L1…L24, CTL, CT, H, CĐ, KL, X → giờ theo 6 loại),
  piece_rate_by_grade (HS 0,9…1,5 → đ/tấn), pay_groups (RSS, trực lò, A Lưới, Lào…), fleet_routes, fleet_rate_rules
Kiểm soát: fn_validate_*(period) → validation_results; fn_lock_period; trigger block_locked
```

### 4.3 Bốn máy tính lương (engine) — trạng thái
| Engine | Áp dụng | Trạng thái công thức | Việc còn lại |
|---|---|---|---|
| **Khoán sản xuất** (`fn_calc_piece_payroll`) | SX HAPĐ (~50 người) | ✅ SQL có sẵn, khớp 100% T8 | Đổi khoá sang uuid/`timekeeping_code`, kỳ dùng `public.payroll_periods`; xác nhận N=42, ăn 20.500 |
| **Thời gian** (`fn_calc_time_payroll`) | Văn phòng/kỹ thuật 3 pháp nhân (16 người T8) | ✅ Công thức + fixture khớp 16/16, **chưa có SQL** | Viết hàm; bảng `attendance_codes`; chuyên cần theo nhóm; BHXH 10,5% |
| **Thời vụ & Lào** (`fn_calc_seasonal_payroll`) | RSS, trực lò, A Lưới, HAQT, Lào (~60 người) | ✅ Khớp các nhóm; khoán tấn & Lào **chờ HCNS chốt quy tắc** | Viết hàm; `pay_groups`, `piece_tonnage/participation`, ca đêm N, làm tròn theo nhóm |
| **Đội xe** (`v_fleet_trip_pay`) | Lái xe container | ⚠ Mô hình có, **đơn giá ví dụ** | Bảng giá tuyến thật; kéo chuyến từ Điều động/Cân xe; chi phí LAK |

### 4.4 Màn hình (sau khi test xanh)
1. **Danh mục nhân viên hợp nhất** — import 3 pháp nhân + thời vụ + Lào + lái xe, gán `timekeeping_code`, pháp nhân, kiểu trả lương; cảnh báo trùng mã/trùng tên (Trần Thắng/Thăng; Trần Văn Tâm/Trần Đình Hải chung mã).
2. **Bảng công** — lưới người × ngày, gõ giờ hoặc mã; validation: 0–24, bội 0,5, cảnh báo >12h/ngày, trùng người/ngày, 1 người ở 2 bảng; cột lý do + người duyệt cho ngoại lệ; **import file máy chấm công** (Ronald Jack/ZK); audit ai nhập/sửa.
3. **Tham số kỳ khoán** (tấn chế biến/hanging/chèn/N/tiền ăn) + **Việc khoán khác** + **Khoán tấn HAQT** (ngày/tổ/kg + tick người tham gia).
4. **Đội xe** — bảng giá tuyến; nhật ký chuyến **kéo từ Điều động/Cân xe** (sửa được); chi phí VND/LAK, cờ "được tính", ảnh hoá đơn.
5. **Điều chỉnh** — tạm ứng, trả nợ theo lịch (từ/đến), truy lĩnh, KPI, chuyên cần ngoại lệ — bắt buộc lý do + người duyệt.
6. **Tính lương → Xem payslip_lines** (từng khoản + công thức) → **Kiểm tra** (sheet KIEM_TRA: quỹ ăn, số LĐ, trùng, thiếu đơn giá, tổng công = tổng bảng lương, BHXH khớp) → **Duyệt** (tổ trưởng → HCNS → KTT) → **Chốt kỳ**.
7. **Xuất**: Bảng lương, BCC, BHXH (21,5%/10,5%), Tem lương (PDF/Zalo), ĐNTT có số thành chữ, file chuyển khoản, chia đợt 1/2. Giữ đúng mẫu cũ.
8. **Kỳ điều chỉnh** (truy lĩnh/thu hồi) thay vì sửa đè kỳ đã chốt.

### 4.5 Phân quyền & dữ liệu cá nhân
- Module **admin/HCNS/KTT/BGĐ only**, RLS theo `company_code` (như module Tài chính).
- CCCD, STK, MST, số sổ BHXH **tách khỏi bảng lương** → hồ sơ nhân sự có RLS; file ngân hàng sinh riêng lúc chi; Excel xuất chỉ giữ mã NV.

---

## 5. Tối ưu nhờ dữ liệu ERP đã có (điểm bàn giao chưa khai thác)

| Nguồn ERP | Dùng cho | Lợi ích |
|---|---|---|
| **Điều động + Cân xe** (chuyến, biển số, tấn, ngày đi/về) | `fleet_trips` | Không nhập lại nhật ký chuyến; tấn/km có chứng cứ cân; giảm gõ tay lương khoán xe |
| **Sổ ca ép bánh / báo cáo ca** (WMS) | đối chiếu `tons_processed` khoán SX | Phát hiện lệch tấn chế biến trước khi chia lương |
| `shift_assignments` / `shift_teams` | gợi ý tổ, ca đêm, người tham gia khoán tấn | Bớt tick tay |
| `attendance` (GPS/QR) | đối chiếu bảng công (khác giờ vào/ra > ngưỡng → cảnh báo) | Không thay thế máy chấm công ngay, nhưng bắt sai lệch |
| **Đề nghị thanh toán** | ĐNTT lương đi chung cửa chi | Kế toán một luồng chi, có số thành chữ tự sinh (hết lỗi "ba mươi lăm triệu…" vs 28.238.000) |

---

## 6. Lộ trình đề xuất (~12 tuần + song song)

| GĐ | Thời lượng | Nội dung | Đầu ra nghiệm thu |
|---|---|---|---|
| **0 · Chốt nghiệp vụ** *(không code)* | 1–2 tuần | Họp HCNS + KTT chốt danh sách mục 7; thu mẫu export máy chấm công; đơn giá đội xe; danh sách 150 NV có mã máy chấm công. **Song song: PA1 chuẩn hoá Excel** cho lương T9–T10 (HCNS + Cơ điện, 0 đồng) | Biên bản chốt quy tắc; file danh mục NV; mẫu export máy; bảng giá tuyến |
| **1 · Danh mục + máy tính lương** | 2 tuần | `timekeeping_code` + mở rộng `employees`; migration `payroll` (đã chỉnh khoá/kỳ); nạp 3 fixture T8; viết `fn_calc_time` + `fn_calc_seasonal`; test | **Test xanh**: khoán SX 100%, thời gian 16/16, thời vụ theo quy tắc đã chốt |
| **2 · Bảng công + import máy** | 3 tuần | Màn bảng công, ký hiệu chung 3 pháp nhân, validation, audit; importer Ronald Jack/ZK; điều chỉnh có duyệt | HCNS nhập được công T10 trên ERP song song Excel |
| **3 · Khoán SX + thời vụ + đội xe** | 3 tuần | Tham số kỳ, việc khác, khoán tấn, nhóm thời vụ; đội xe: bảng giá thật + kéo chuyến từ Điều động/Cân xe + chi phí LAK | Tính được đủ 4 engine cho T10 |
| **4 · Kiểm tra – duyệt – chốt – xuất** | 2–3 tuần | Sheet kiểm tra, luồng duyệt, chốt bất biến, kỳ điều chỉnh, xuất Bảng lương/BHXH/Tem/ĐNTT/bank/chia đợt | Bộ file xuất khớp mẫu cũ |
| **Song song** | 1–2 kỳ (T11–T12) | ERP và Excel cùng chạy, đối chiếu từng người | Lệch = 0 → cắt Excel từ T1/2027 |

Thứ tự engine đề xuất: **thời gian → khoán SX → thời vụ → đội xe** (đội xe cuối vì chờ đơn giá). Có thể đổi nếu ưu tiên
theo giá trị tiền (khoán SX ~355 tr/tháng lớn nhất).

---

## 7. Điểm thực tế CHƯA GỠ (phải chốt trước khi code)

| # | Vấn đề | Ai gỡ | Cần gì |
|---|---|---|---|
| 1 | Khoán SX: **N = 42** LĐ định mức và **tiền ăn 20.500 = 500×41** đang gõ cứng — là quy tắc hay số tháng 8? | HCNS + Quản đốc | Xác nhận công thức/đầu vào từng kỳ |
| 2 | **Đơn giá đội xe** chưa có: tuyến, ngày chuẩn, hỗ trợ vượt ngày, dầu/km, hỗ trợ/tấn, tỷ giá LAK | HCNS + Đội xe + BGĐ | Bảng giá tuyến chính thức |
| 3 | **Danh mục NV hợp nhất**: ERP 59 vs lương ~150; mã máy chấm công; người ở 2–3 bảng; trùng tên/trùng mã | HCNS | File NHAN_VIEN 3 pháp nhân + thời vụ + Lào + lái xe có mã máy chấm công |
| 4 | **Mẫu export máy chấm công** Ronald Jack/ZK + bảng ký hiệu thống nhất (NL vs NL\, CĐ, L1…L24) | HCNS/IT | 1 file export thật T8 hoặc T9 |
| 5 | **Chia khoán tấn HAQT** (file cũ chia tay không theo quy tắc) và **Lào chia 30 hay 31** | HCNS + BGĐ | Chốt quy tắc (đề xuất: ROUNDDOWN(tiền/n,−3), trưởng tổ nhận dư; Lào /30) |
| 6 | Chính sách **giờ >12h/ngày, Chủ nhật** (đang tính như giờ thường), **giờ lẻ 8,3/8,5** | BGĐ + HCNS | Quy định + ngưỡng cảnh báo |
| 7 | **Chuyên cần**: ≥29 → 300k; cơ điện >26 → 500k, >40 → 700k; 3 khoản APQT ghi tay trái quy tắc | HCNS | Xác nhận & xử lý ngoại lệ |
| 8 | **Vá cá nhân trong công thức cũ** (4,5% dòng 101; ×2 ô Z97; +7.000.000/26×công ô W20) — quy tắc hay ngoại lệ? | HCNS + KTT | Phân loại từng dòng → đưa vào `payroll_adjustments` hoặc bỏ |
| 9 | **Luồng duyệt & chu kỳ**: ai nhập (tổ trưởng?), ai duyệt (HCNS→KTT), thời vụ 2 kỳ/tháng, chia đợt chi | HCNS + KTT | Sơ đồ duyệt + lịch chốt |
| 10 | **ĐNTT lương** đi qua module Đề nghị thanh toán hiện có hay xuất riêng? | KTT + anh | Quyết định |
| 11 | **Dữ liệu cá nhân** (CCCD/STK/MST/BHXH) đang trong Excel gửi qua lại | HCNS + IT | Đồng ý tách vào hồ sơ có RLS |
| 12 | **Phép/lễ chia 26 kể cả người công chuẩn 30** (theo file cũ) — giữ hay sửa? | HCNS | Xác nhận |

Chưa gỡ được các điểm 1–5 thì **không nên code** engine tương ứng (sẽ phải làm lại).

---

## 8. Quyết định cần anh chốt

| | Câu hỏi | Đề xuất của tôi |
|---|---|---|
| **A** | Đặt module trong ERP này hay tách HRM riêng như bàn giao? | **Trong ERP** (đã là HRM thực tế; 1 danh mục NV) |
| **B** | Khoá NV = mã máy chấm công (`timekeeping_code`), mở danh mục lên ~150? | **Đồng ý** |
| **C** | Nguồn chấm công cho lương = máy chấm công import + nhập tay có duyệt; GPS/QR chỉ đối chiếu? | **Đồng ý giai đoạn đầu** |
| **D** | Đội xe lấy chuyến/tấn từ Điều động + Cân xe? | **Đồng ý** (bớt nhập tay) |
| **E** | Thứ tự làm engine? | thời gian → khoán SX → thời vụ → đội xe |
| **F** | Làm **PA1 chuẩn hoá Excel** song song cho T9–T10? | **Nên** (0 đồng, chặn lỗi ngay) |
| **G** | ĐNTT lương qua module Đề nghị thanh toán hiện có? | **Nên** (một cửa chi) — cần KTT đồng ý |

---

## 9. Phụ lục — công thức tóm tắt (đã kiểm chứng T8/2026)

**Khoán SX** (T = tấn chế biến; H = Σ giờ khoán; N = LĐ định mức; h_i giờ người i; d_i = h_i/8):
- Đơn giá theo hệ số: 0,9→5.800 … 1,5→9.600 đ/tấn (≈ 400 + 6.000×hs)
- Khoán SP_i = rate_i × T × h_i / (H/N) · Hanging_i = tấn hanging×252.000 × h_i/H · Chèn_i = tấn chèn×140.000 × h_i/H
- Việc khác chung chia theo giờ; đích danh cộng thẳng · Trừ công nhật_i = −Σ(d×270k/300k) × h_i/H
- Tổng khoán_i = ROUNDDOWN(…, −3) · Tiền ăn_i = ROUNDDOWN(T×20.500/Σd × d_i, −3)

**Thời gian**: giờ = Σgiờ + Σ COUNT(mã)×giờ_mã; công = giờ/8; lương = (khoán tháng ? CB : (thử việc ? CB×85% : CB))/công chuẩn×công;
phép/lễ = lương BHXH/26×ngày; làm lễ = CB/công chuẩn/8×giờ×150%; chuyên cần theo nhóm; BHXH NLĐ 10,5%;
thực nhận = ROUNDDOWN(tổng − BHXH − tạm ứng − trừ − KPI, −3).

**Thời vụ/Lào**: công = giờ/giờ-nhóm (8 hoặc 12 trực lò); ca đêm (N) hỗ trợ đêm; lương ngày = công×đơn giá; lương tháng = LT/30×MIN(công,30);
khoán tấn = ROUNDDOWN(kg/1000×đ/tấn ÷ n, −3), trưởng tổ nhận dư; bốc xếp đích danh ≤3 chia đều; thực nhận làm tròn theo nhóm (Lào: nghìn).

**Đội xe**: lương chuyến = đơn giá tuyến + vượt ngày×hỗ trợ + km×hỗ trợ dầu + tấn×hỗ trợ/tấn; chi phí LAK quy đổi; tạm ứng trừ.

Tham số T8 khoán SX (HAPĐ): 1.077,49 t chế biến · 105,37 t chèn @140.000 · hanging 0 @252.000 · N 42 · ăn 20.500 đ/t · công nhật 270.000 · làm tròn 1.000.
