# NGHIÊN CỨU: CHẤM CÔNG BẰNG APP ERP — THIẾT KẾ vs THỰC TẾ VẬN HÀNH

> v1 · 13/09/2026 · Nguồn: dữ liệu thật bảng `attendance` (6.050 bản ghi, 24/02→13/09/2026), code module chấm công,
> bảng lương Excel T8/2026 (fixture trong [`handoff/`](handoff/)). Bổ sung cho [01-PHƯƠNG ÁN LƯƠNG](01-PHUONG_AN_TICH_HOP_LUONG_VAO_ERP.md).
> **Nghiên cứu để quyết định — chưa sửa code.**

---

## 0. Kết luận

**App chấm công hiện tại KHÔNG thể là nguồn công cho bảng lương — không phải vì công thức, mà vì nó được thiết kế cho
nhân viên văn phòng tự chấm bằng điện thoại, còn 85% người ăn lương là công nhân ca 12h, thời vụ, Lào, lái xe không có
tài khoản/điện thoại và làm theo tổ.** Ngay với ~35 người văn phòng đang dùng, số công app ghi cũng **không khớp bảng
lương** (T8: chỉ 2/13 người khớp, nhiều người bị thổi lên gấp đôi) vì checkout hỏng, sửa tay tràn lan, GPS/OT/phép không
chạy. Hướng đi: **coi app là 1 trong 3 kênh nhập công** (app · máy chấm công · tổ trưởng chấm cho tổ) đổ vào cùng một bảng
công, và **sửa ~9 lỗi vận hành** trước khi cho nhóm văn phòng dùng app làm căn cứ lương.

---

## 1. App đang được dùng thế nào (số đo thật)

| Chỉ số | Giá trị |
|---|---|
| Bản ghi chấm công | **6.050** (24/02/2026 → 13/09/2026), ~880–990 bản ghi/tháng |
| Số người từng chấm | **55**; 3 tháng gần nhất **35 người** |
| Phòng ban đang dùng (3 tháng) | QLSX 16 · QC 11 · HC-TH 4 · R&D 2 · Thu mua 2 → **100% khối văn phòng/quản lý** |
| NV active trong ERP không chấm lần nào 3 tháng | **24 / 59 (41%)** |
| Ngày chấm/người trong T8 (tháng đủ) | ≥26 ngày: 16 người · 20–25: 16 · 10–19: 1 · <10: 2 → nhóm đang dùng thì dùng khá đều |
| Ca đã cấu hình | 7 ca: Ca ngày/đêm **Dài 12h** (1,5 công), Ca 1/2/3 8h, HC Sản xuất 07–17, HC Văn phòng 08–17; **7.232** lượt phân ca |

→ App **chạy được và có người dùng đều** — nhưng chỉ ở đúng nhóm nó được thiết kế cho.

## 2. Ai KHÔNG được phủ (đối chiếu bảng lương T8/2026)

| Nhóm lương (Excel T8) | Số người | Có trong ERP `employees` | Có dùng app |
|---|---|---|---|
| Khoán sản xuất HAPĐ | 50 | **5** (3 active) | 0 |
| Lương thời gian APQT + HAQT | 17 | 13 | ~11 |
| Thời vụ RSS / trực lò / A Lưới / HAQT / **Lào** | 58 | **0** | 0 |
| Đội xe container | (tính theo chuyến) | — | 0 |
| **Tổng (gộp trùng)** | **122** | **18 (16 active)** | **~11** |

**104/122 người (85%) không tồn tại trong ERP** → không có tài khoản → không thể tự chấm dù muốn. Nguyên nhân thiết kế:
chấm công đòi hỏi `employees.user_id` → tài khoản email/mật khẩu → điện thoại có mạng (`authStore.ts:47-52, :198`).
Không có khái niệm thời vụ / hợp đồng ngắn hạn / quốc tịch trên `employees`. Người không điện thoại chỉ có cách quản lý
**gõ tay từng người từng ngày** (`attendanceEditService.setDaySymbol`).

## 3. Số liệu app có tin được không? — Đối chiếu T8 với bảng lương thời gian

16 người lương thời gian (đã kiểm chứng khớp Excel 16/16). Cột "app" = số ngày có bản ghi / công = Σ giờ app ÷ 8:

| Người | Công Excel | App (ngày / công) | Nhận xét |
|---|---|---|---|
| Nguyễn Quang Quốc | 36 | 28 / 35,7 | ✅ khớp |
| Phạm Bá Vinh | 34,5 | 26 / 35,1 | ✅ khớp |
| Nguyễn Mạnh Thắng | 25,5 | 24 / 26,7 | ~ gần |
| Mai Bá Trung | 35 | 30 / 37,9 | ~ gần |
| Hoàng Xuân Quang | 35 | 30 / 41,6 | ⚠ +6,6 |
| Nguyễn Hào | 29 | 28 / 37,4 | ⚠ +8,4 |
| Trần Đình Chiến | 25 | 26 / 34,5 | ⚠ +9,5 |
| Đặng Quang Chung | 31 | 28 / 43,5 | ⚠ +12,5 |
| Nguyễn Văn Cường | 34,5 | 30 / 46,8 | ⚠ +12,3 |
| **Dương Vinh Quang** | 27 | 27 / **60,1** | ❌ gấp 2,2 (≈18 giờ/ngày) |
| **Nguyễn Ngọc Thanh** | 27 | 27 / **61,1** | ❌ gấp 2,3 |
| Cao Phước Tiến | 28 | **0 / 0** | ❌ có trong ERP, không bao giờ chấm |
| Nguyễn Nhật Tân (PGĐ) | 31 | **0 / 0** | ❌ không chấm |
| Hồ Thị Ngọc Á, Lê Văn Dũng, Trần Văn Khai | 27 / 31 / 31 | — | ❌ không có trong ERP |

**Kết quả: 2/16 khớp.** Nếu lấy app làm căn cứ lương tháng 8, ít nhất 9 người bị trả **thừa** hàng chục công và 5 người
**0 công**. Đây là bằng chứng quyết định: *chưa thể*.

### 3.1 Tám nguyên nhân lệch (đo trên 2.748 bản ghi 3 tháng gần nhất)

| # | Hiện tượng | Số đo | Gốc rễ (code) |
|---|---|---|---|
| 1 | **Bản ghi >12 giờ** | **577 (21%)** — riêng HC Sản xuất 233, HC Văn phòng 224 (ca 8–10h mà >12h!) | Quên checkout → không có gì đóng theo lịch (mục 3.2) → giờ phình |
| 2 | Giờ TB/ngày | **11,1 h**; 230 bản ghi <4h; 227 bản ghi 0/null | Checkout hỏng cả 2 chiều |
| 3 | **Sửa tay** | **1.215 log ≈ 20% bản ghi**; `shift_change` 938 (77%), lý do "Thêm ca" 235; **1 tài khoản sửa 865 (71%)** | Không có màn nhập cho tổ → quản lý "vá" bằng thêm ca/sửa nhanh cả ngày; sửa xong vào thẳng dữ liệu, **không ai duyệt** (`attendanceEditService.ts`) |
| 4 | Không checkout | 193 (7%); `auto_checkout` = **0** dù setting bật 30' | `auto_checkout_v6` có trong DB nhưng **không có cron job gọi** (bảng `cron.job` không có); trong code chỉ chạy "nhân tiện" khi chính người đó check-in lần sau (`attendanceService.ts:538`) |
| 5 | **OT luôn = 0** | avg OT 0,00 | OT chỉ tính khi có `overtime_requests` duyệt **trước**, và sửa tay ép OT=0 (`attendanceService.ts:742-751`, `attendanceEditService.ts:312`) |
| 6 | Đi trễ 20% | 538 lượt, **TB 137 phút**, 291 lượt >60' | Trễ 2 tiếng trung bình = phần lớn là **gán sai ca** (Ca 1 06:00 nhưng làm 07:00…), không phải trễ thật |
| 7 | Phép không vào công | 57 đơn phép duyệt; **0** bản ghi `attendance` gắn `leave_request_id`; 102 dòng `status=leave` là đánh tay | Đơn phép và chấm công **không nối nhau**; bảng công tính **P/L/X = 0 công** (`monthlyTimesheetService.ts:422`) → lương trả thiếu phép/lễ |
| 8 | Công tính từ ký hiệu tối giản | 10 ký hiệu S/Đ/C2/HC/P/CT/2ca/L/X/— | Không có P/2, NL, L1…L24, CTL, CT, H, CĐ, KL, nửa ngày — trong khi bảng lương dùng đủ bộ đó |

### 3.2 Kiểm soát gian lận thực tế đang tắt

| Kiểm soát | Thực tế |
|---|---|
| GPS | `is_gps_verified` = **0 / 2.748**; **33% (915) chấm không toạ độ**. Cấu hình GPS nằm ở `attendance_settings.gps_config` (bật, bán kính 500 m) nhưng **code đọc `app_settings.gps_attendance`** (không có) → vòng kiểm bán kính **không bao giờ chạy**; máy tính bỏ qua GPS luôn (`CheckInOutWidget.tsx:231-235`) |
| Ai chấm từ máy tính | Đặng Quang Chung 91/91 · Hoàng Hải Duy 70/70 · Lê Thị Thuỳ 60/60 · H.X.Quang 86/111 · H.T.Nghĩa 56/72 · N.V.Cường 51/95 · V.V.Hoài 50/95 · M.B.Trung 49/96 |
| IP / thiết bị | `check_in_ip`, `check_in_device` = **0 / 2.748** — cột có, **không có dòng code nào ghi** |
| QR cổng | Bất kỳ chuỗi bắt đầu `HUYANH_CHECKIN` đều qua, không token ngày/địa điểm, không kiểm server (`QRCheckInPage.tsx:21`) → chụp ảnh QR là chấm được ở nhà |
| Duyệt sửa | Không có bước duyệt; đánh "X vắng" **không ghi log** (`attendanceEditService.ts:477-481`) |

## 4. Vì sao: giả định thiết kế vs thực tế nhà máy

| Giả định trong code | Thực tế Huy Anh |
|---|---|
| 1 người = 1 điện thoại + 1 email login | Công nhân khoán/thời vụ/Lào không có; làm theo tổ |
| Tự chấm cá nhân; **không có màn tổ trưởng chấm cho cả tổ** | Tổ trưởng/HCNS đang chấm cho hàng chục người → dùng "Sửa nhanh/Thêm ca" thay thế |
| Không ca → mặc định giờ hành chính 08:00, trễ sau 30' (`attendanceService.ts:663-673`) | Thời vụ, trực lò 12h, ca đêm N |
| Phép/lễ = 0 công; lễ hard-code 2025–2026 (`monthlyTimesheetService.ts:124-148`) | Phép = lương BHXH/26, lễ đi làm ×150%; 2027 sẽ mất lễ |
| OT phải duyệt trước | OT phát sinh theo lò/ca, không kế hoạch |
| Khoá checkout tới 50% ca (`CheckInOutWidget.tsx:342`) | Về sớm có lý do → không đóng được → auto-đóng thổi giờ |
| Vắng (X) = không có bản ghi, không nhìn lịch ca | Người không được phân ca thành "vắng" cả tháng |
| 1 pháp nhân "Huy Anh Phong Điền" cứng trong xuất Excel; không có `facility/company` | 3 pháp nhân + 3 nhà máy (PD/TL/LAO) |
| Danh sách người/phòng cứng trong code (VIP email, HAP-KT, HAP-HCTH, HAP-RD) | Mỗi thay đổi tổ chức = deploy code |
| Ca đêm ghi vào ngày check-in | Bảng lương tính theo ngày công thực |

## 5. Mô hình vận hành đề xuất — chọn kênh chấm công theo nhóm

Không cố ép 1 kênh cho tất cả. **Một bảng công duy nhất** (`payroll.timesheet_entries`: người · ngày · giờ/mã · ca đêm ·
nguồn · người nhập · người duyệt — như phương án 01) nhận từ **3 kênh**:

| Nhóm | Số người | Kênh chấm công phù hợp | Vì sao |
|---|---|---|---|
| **A. Văn phòng / QLSX / QC / kỹ thuật** (lương thời gian) | ~35–40 | **App ERP** (điện thoại + PC trong mạng) — *sau khi sửa mục 6* | Đã dùng đều 20+ ngày/tháng; cần GPS/IP thật, checkout đúng, phép/OT/ký hiệu |
| **B. Công nhân khoán SX HAPĐ** | ~50 | **Máy chấm công Ronald Jack/ZK** (đã có) → import giờ/ngày; dự phòng: tổ trưởng chấm tổ | Lương khoán chỉ cần **giờ h_i** — máy khách quan hơn app; không cần điện thoại |
| **C. Thời vụ / RSS / trực lò / A Lưới / Lào** | ~58 | **Tổ trưởng chấm cho tổ** trên 1 tablet (màn lưới người×ngày, mã giờ/12N, đi theo tổ khác) + máy chấm công nếu điểm đó có | Không tài khoản, 2 kỳ/tháng, đổi tổ, ca đêm N |
| **D. Đội xe** | vài người | **Không chấm giờ** — tính theo **chuyến** từ Điều động + Cân xe | Lương theo chuyến/tấn/ngày, dữ liệu đã có |

→ App ERP giữ vai trò cho nhóm A và là **màn nhập/duyệt** cho kênh B–C (màn "bảng công tổ" là thứ **phải xây mới** —
hiện chưa có). Máy chấm công là kênh **khách quan nhất** cho khối sản xuất.

## 6. Sửa tối thiểu để app đủ tin cậy cho nhóm A (thứ tự ưu tiên)

| # | Việc | Chặn lỗi nào (mục 3) | Độ khó |
|---|---|---|---|
| 1 | **GPS thật**: trỏ code về đúng bảng cấu hình (hoặc tạo `app_settings.gps_attendance`), siết bán kính 150–200 m, ghi `check_in_ip/device`, PC chỉ chấm khi IP thuộc mạng nhà máy | 3.2 | Nhỏ |
| 2 | **Auto-checkout theo lịch**: tạo cron job gọi `auto_checkout_v6` (hoặc đưa hàm vào repo + migration), đóng đúng giờ cuối ca, **không** thổi giờ; cảnh báo bản ghi >12h | 1, 2, 4 | Nhỏ |
| 3 | **Bỏ khoá checkout 50%** → cho "về sớm có lý do" (ghi lý do) | 1, 2 | Nhỏ |
| 4 | **OT thực tế + duyệt sau** (không bắt duyệt trước); sửa tay không ép OT = 0 | 5 | Vừa |
| 5 | **Bộ ký hiệu đầy đủ + nửa ngày** (P, P/2, NL, NL/2, L1…L24, CTL, CT, H, H/2, CĐ, KL, X) → dùng chung `attendance_codes` của phương án lương; **phép/lễ có công** theo quy tắc; lễ lấy từ bảng, không hard-code | 7, 8 | Vừa |
| 6 | **Nối đơn phép → chấm công** tự động (duyệt phép = sinh dòng công P) | 7 | Nhỏ |
| 7 | **Duyệt sửa**: tổ trưởng/QLSX sửa → HCNS duyệt trước khi khoá tháng; "X" phải ghi log | 3 | Vừa |
| 8 | **Gán ca đúng** trước khi bắt trễ (rà 538 lượt trễ TB 137') — hoặc coi trễ chỉ là cảnh báo, không trừ lương tự động | 6 | Nhỏ |
| 9 | **Pháp nhân / nhà máy** trên attendance + xuất; bỏ danh sách người/phòng cứng trong code | mục 4 | Vừa |

**Tiêu chí nghiệm thu:** chạy lại đối chiếu mục 3 — **13/13 người có trong ERP phải khớp công Excel T8** (hiện 2/13),
trước khi cho app làm căn cứ lương nhóm A.

## 7. Liên hệ với phương án lương (tài liệu 01)

- Phương án 01 đã đề xuất `timesheet_entries` là nguồn sự thật và **ERP `attendance` chỉ đối chiếu** — nghiên cứu này
  **xác nhận đúng** và làm rõ vì sao: app hôm nay chưa đủ để thay.
- Sau khi sửa mục 6, nhóm A có thể chuyển sang **app là nguồn chính** (attendance → timesheet_entries tự động), nhóm B–C
  vẫn đi máy chấm công + tổ trưởng.
- `attendance_codes`, `pay_groups`, `payroll_periods.part` (2 kỳ/tháng) của phương án 01 chính là những thứ app đang thiếu.

## 8. Quyết định cần chốt (nối tiếp A–G của tài liệu 01)

| | Câu hỏi | Đề xuất |
|---|---|---|
| **H** | Có sửa app cho nhóm A (9 việc mục 6) hay bỏ app, tất cả dùng máy chấm công? | **Sửa** — nhóm A đang dùng đều, chi phí sửa nhỏ–vừa; máy chấm công không tiện cho người đi công tác/nhiều điểm |
| **I** | Khối sản xuất khoán: máy chấm công hay tổ trưởng chấm tổ làm kênh CHÍNH? | **Máy chấm công** chính, tổ trưởng dự phòng/điều chỉnh có duyệt |
| **J** | Xây màn **"bảng công tổ"** (tổ trưởng chấm cho cả tổ trên tablet) cho thời vụ/Lào? | **Có** — bắt buộc, không có cách khác cho 58 người không tài khoản |
| **K** | Mở danh mục nhân sự cho 104 người chưa có (mã máy chấm công, pháp nhân, loại lao động)? | **Có** — điều kiện tiên quyết của mọi kênh |
| **L** | Trễ: trừ lương tự động hay chỉ cảnh báo/thống kê? | **Chỉ cảnh báo** cho tới khi gán ca sạch |

---

## Phụ lục — cách tái kiểm (SQL rút gọn, chạy qua `agent_sql`)
- Chất lượng 3 tháng: `select count(*), count(*) filter (where is_gps_verified), count(*) filter (where check_in_lat is null), count(*) filter (where working_minutes>720), count(*) filter (where check_out_time is null) from attendance where date >= current_date - interval '3 months'`
- Đối chiếu T8 (công = Σ giờ/8) cho danh sách tên: xem truy vấn B2 trong phiên 13/09 (join `employees.full_name` → `attendance` T8).
- Cron: `select jobname, schedule, command from cron.job` — hiện **không** có job auto_checkout.
