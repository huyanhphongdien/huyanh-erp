# 03 — Nghiên cứu khoán đội xe container

**Ngày:** 15/09/2026 · **Trạng thái:** nghiên cứu, CHƯA code · **Người đọc:** BGĐ, HCNS, Kế toán, Điều độ
**Nguồn:** file "Theo dõi chi phí đội xe container T02/2026" (qua bản chuẩn hoá `XE_*` trong gói bàn giao
`docs/payroll/handoff/`), schema nháp `fleet_*` (chưa áp), dữ liệu **Lệnh điều động ERP 06–09/2026** (đo trực tiếp trên
production 15/09), danh mục tài xế/xe ERP.
Liên quan: `01-PHUONG_AN_TICH_HOP_LUONG_VAO_ERP.md` (quyết định D: đội xe lấy từ Điều động/Cân), `02-…` (chấm công).

---

## 1. Tóm tắt một phút

- **Đội xe:** ERP có 8 tài xế đang hoạt động, 8 đầu kéo, 11 rơ-moóc, 10 xe khác. Bảng lương có 6 "lái xe cont" — hai danh sách
  **không khớp nhau** (3 tài xế ERP không có trong lương, 1 tài xế lương không có trong ERP) và **không nối với nhau**.
- **Việc:** 30–50 lệnh điều động/tháng. T8/2026: 31 lệnh = 22 chuyến cảng (≈ 869 t kế hoạch) + 8 chuyến nội bộ (7 là *đi lấy
  rỗng*) + 1 đi lấy mủ.
- **Lương khoán tài xế hôm nay:** file Excel chỉ ghi chuyến và chi phí, cột đơn giá **trống**, số khoán (vd 10.253.000) **gõ tay**
  vào Bảng lương → không ai tái lập được con số, và "Lệch do lương đội xe cont" xuất hiện trong ĐNTT.
- **ERP đã có ~70% dữ liệu chuyến** (ai, xe nào, ngày đi, loại chuyến, số cont, khối lượng thật qua phiếu cân cho 45% chuyến cảng)
  nhưng **thiếu đúng 3 thứ** để tính khoán: **ngày/giờ về, tuyến chuẩn, km**. Không cần bảng `fleet_trips` mới như schema nháp —
  `dispatch_orders` chính là nhật ký chuyến, chỉ cần thêm vài cột.
- **Đề xuất:** khoán theo **chuyến × tuyến** (bảng giá tuyến, có hệ số 1 cont / 2 cont) + phụ cấp **vượt ngày chuẩn**; chi phí dọc
  đường theo **định mức tuyến**; dầu theo **định mức L/100 km**. Kiểm soát bằng 4 chứng cứ có sẵn hoặc rẻ: lệnh điều động, giờ
  cổng + công-tơ-mét, phiếu cân, chứng từ chi phí.
- **Trước khi code:** 7 quyết định ở mục 8 và HCNS cấp **đơn giá thật** (mọi số trong gói bàn giao là ví dụ).

---

## 2. Hiện trạng cách theo dõi và trả lương đội xe

### 2.1 File cũ (T02/2026 — tháng có số liệu mẫu)
- **6 sheet, mỗi tài xế một sheet.** Mỗi sheet ghi: chuyến (ngày đi/về, hành trình, km, số cont), tạm ứng LAK/VND, chi phí phát
  sinh dọc đường, cột "Đơn giá chuyến / Hỗ trợ dầu" **để trống**, chỉ có SUM. Chứng từ chấm "v/x".
- **16 chuyến / 3 tài xế** (Hòa 4, Nghĩa 4, Cường 8); tuyến: cảng Đà Nẵng 10, Kon Tum 2, Lào Kho 2 2, Gia Lai→Chu Lai 1, mỏ đá Tứ Hạ
  1; 32 ngày chạy. Ba tài xế còn lại (Hiếu, Thiện, Tấn Anh) 0 chuyến trong tháng đó.
- **Chi phí ghi nhận 46,3 triệu** (LAK+VND quy đổi), tạm ứng 12 triệu VND + 12 triệu LAK. Chi phí Lào **lặp lại y hệt mỗi chuyến**
  (trạm cân Nam Thon 1.000.000 LAK, Tha Khẹt 1.000.000, Đông Hen 2.000.000, CA các trạm 200–850k LAK; VND: CA Đường 9 1.000.000,
  tránh Đông Hà 500.000, Hải Lăng 500.000, cửa khẩu 300.000) → tổng **≈ 8–9 triệu VND/chuyến Lào**, đủ đều để làm định mức.
- Tạm ứng, chi phí và lương **lẫn nhau**; "được tính / không được tính" quyết định tay, không có người duyệt.

### 2.2 Bản chuẩn hoá trong gói bàn giao (chưa áp)
Đã tách 4 bảng `XE_TUYEN` (giá theo tuyến), `XE_CHUYEN` (1 dòng/chuyến), `XE_CHI_PHI` (1 dòng/khoản), `XE_LUONG` (tổng hợp) và công
thức **lương chuyến = đơn giá tuyến + vượt ngày × hỗ trợ + km × hỗ trợ dầu + tấn × hỗ trợ vận chuyển**. Với đơn giá **ví dụ**
(cảng ĐN 1,2 triệu; Kon Tum 3,5; Gia Lai–Chu Lai 3,8; Lào 6,5; mỏ đá 0,5; vượt ngày 300k) T02 ra 37,2 triệu cho 3 tài xế — con số
này chỉ chứng minh công thức chạy, **không phải lương thật**.

Schema nháp tạo bảng `fleet_trips` / `fleet_expenses` / `fleet_routes` / `fleet_rate_rules` riêng. **Không nên** — xem mục 6.

---

## 3. ERP đang có gì (đo trên production 15/09/2026)

| Dữ liệu | Có | Thiếu / vấn đề |
|---|---|---|
| `fleet_drivers` | 8 active: Bùi Văn Nghĩa, Hoàng Hòa, Nguyễn Hữu Mạnh Cường, Nguyễn Đình Hiếu, Nguyễn Đăng Thiện, Cao Phước Tiến, Nguyễn Công Thịnh, Nguyễn Tiến Sỹ | **Không có `code`, không nối `employees`.** Lương có 6 lái cont (Hòa, Nghĩa, Cường, Hiếu, Thiện, **Lê Tấn Anh**) → Tấn Anh không có trong ERP; Tiến/Thịnh/Sỹ không có trong bảng lương lái cont (lái xe con/xe tải?) |
| `fleet_vehicles` | 8 đầu kéo (5 có tài xế mặc định), 11 rơ-moóc, 10 xe khác | — |
| `dispatch_orders` | **130 lệnh** từ 06/2026 (T6 37 · T7 49 · T8 31 · T9 13 đến 15/09). `driver_id` 128/130, đầu kéo 127/130, rơ-moóc 105/130 | Không có **ngày/giờ về**, **km**, **tuyến chuẩn** |
| Trạng thái | dispatched 98 · draft 26 · completed **6** | 15/26 lệnh **nháp** có khối lượng thật (chuyến đã chạy nhưng không ai bấm điều xe); `completed_at` = 0 trong T8 → không có mốc "xe về" |
| Điểm đến | Chuyến cảng: `destination` = **cảng đến quốc tế** (Chennai 25, Shanghai 13, Nhava Sheva 12, Colombo 12…) | Đây là điểm đến của *hàng*, không phải của *xe* (xe chỉ chạy ra cảng Đà Nẵng). Nội bộ ghi chữ tự do: "tân lâm", "ĐÀ NẴNG", "Nam Đông " |
| Phiếu cân | `weighbridge_ticket_id` nối **10/22** chuyến cảng T8 (45%); `tl_ticket_id` cho đi lấy mủ | KL thật: 1 cont = 20,97–22,58 t; 2 cont = 40,5–45,2 t; KL kế hoạch luôn 40.320 = 2 × 20.160 → **tấn đã có nguồn thật**, chỉ chưa phủ hết |
| "Đi lấy rỗng" | 7/31 lệnh T8 ghi `internal`, 0 khối lượng | Thực chất là **nửa chuyến cảng chạy không** — phải quyết là chuyến riêng hay gộp |
| Chi phí dọc đường, tạm ứng | — | Không có trong ERP, vẫn Excel |

**T8/2026 theo tài xế (ERP):**

| Tài xế | Lệnh | Loại | Tấn kế hoạch |
|---|---|---|---|
| Bùi Văn Nghĩa | 8 | cảng, lấy rỗng | 258,7 |
| Nguyễn Hữu Mạnh Cường | 8 | cảng, lấy rỗng | 231,8 |
| Hoàng Hòa | 7 | cảng, lấy rỗng | 250,3 |
| Cao Phước Tiến | 3 | đi lấy mủ, nội bộ (sang hàng ĐN, Quảng Trị) | — |
| Nguyễn Đình Hiếu | 3 | cảng, lấy rỗng | 85,7 |
| Nguyễn Đăng Thiện | 2 | cảng, lấy rỗng | 42,0 |

So với T02 trong Excel (16 chuyến/3 tài xế), ERP T8 đã ghi **31 lệnh/6 tài xế** — nghĩa là **sheet `XE_CHUYEN` có thể thay bằng
export từ ERP ngay bây giờ**, chưa cần đơn giá.

---

## 4. Bản chất khoán đội xe — trả tiền cho cái gì?

**Chuyến** là đơn vị tự nhiên. Giá trị một chuyến phụ thuộc: quãng đường và số ngày (tuyến), tải (1 hay 2 cont, tấn), độ khó
(biên giới Lào, đèo Lò Xo), thời gian chờ (cảng, cửa khẩu). Ba cách trả:

| | PA-A · Chuyến × Tuyến | PA-B · Tấn-km | PA-C · Lương cứng + phụ cấp chuyến + thưởng dầu |
|---|---|---|---|
| Công thức | đơn giá tuyến (× hệ số tải) + vượt ngày × phụ cấp | đ/(tấn·km) × tấn thật × km thật | lương tháng + đ/chuyến theo tuyến + (định mức dầu − thực đổ) × giá |
| Dữ liệu cần | tuyến, ngày đi/về, số cont | **km thật** (công-tơ-mét/GPS), tấn thật (phiếu cân) | như PA-A + nhật ký đổ dầu |
| Ưu | Ít tuyến (≈ 8 mã phủ 95%), giá **kiểm tra được**, ERP đã có đơn vị "lệnh" | Công bằng nhất với tải lệch | Ổn định thu nhập tháng ít chuyến (Thiện 2, Hiếu 3 trong T8); BHXH rõ |
| Nhược | Chuyến 1 cont và 2 cont phải tách hệ số | Chưa có km; dễ cãi số km | Ít thúc đẩy năng suất nếu phụ cấp thấp |

**Đề xuất:** **PA-A làm lõi**, gắn hệ số tải (1 cont = 0,7–0,8; 2 cont = 1,0 — HCNS chốt) và phụ cấp vượt ngày; **có lương cứng
hay không là quyết định D1** (nếu hiện tài xế đã có lương BHXH thì giữ, khoán chuyến là phần biến đổi). Tấn-km để dành khi đã có
km tin cậy 3 tháng.

**Danh mục tuyến rút từ dữ liệu 4 tháng** (HCNS điền đơn giá, ngày chuẩn, km chuẩn):

| Mã | Hành trình | Nguồn |
|---|---|---|
| NM-DN | Nhà máy → cảng Đà Nẵng / Tiên Sa (đi đầy) → NM | 22/31 lệnh T8 |
| NM-DN-R | NM → cảng Đà Nẵng lấy rỗng → NM (chạy không) | 7/31 lệnh T8 — **quyết định D3** |
| NM-CL | NM → Chu Lai | file cũ |
| NM-KT | NM → Kon Tum / Ngọc Hồi | file cũ |
| NM-GL-CL | NM → Gia Lai đóng hàng → Chu Lai | file cũ |
| NM-LAO-K2 | NM → Kho 2 (Lào) — có định mức LAK | file cũ |
| NM-TL | NM ↔ Tân Lâm / Huy Anh Quảng Trị (đi lấy mủ, chở mủ tờ) | ERP `fetch_mu`, `internal` |
| NM-ND | NM → Nam Đông (viên nén) | ERP |
| NM-NA | NM → Thái Hoà, Nghệ An (bốc mủ thương mại) | ERP 1 lần |
| NM-MODA | NM → mỏ đá Tứ Hạ | file cũ |

---

## 5. Kiểm soát — bốn chứng cứ cho mỗi chuyến

Cùng nguyên tắc với khối sản xuất: *tài xế/điều độ toàn quyền chạy, nhưng mỗi chuyến để lại vết do người khác ghi*.

| Chứng cứ | Ai ghi | Trong ERP? | Kiểm được gì |
|---|---|---|---|
| **Lệnh điều động** (số LĐĐ, tài xế, xe, tuyến, loại) | Điều độ | **Có** | Chuyến có tồn tại; không LĐĐ = không chuyến |
| **Giờ ra / vào cổng + công-tơ-mét** | Bảo vệ hoặc trạm cân | **Chưa** (4 ô, thêm vào lệnh hoặc phiếu chuyến giấy) | Ngày về → vượt ngày tự tính; km thật → dầu, lệch tuyến |
| **Phiếu cân** | Trạm cân | Có 45% chuyến cảng | Tấn thật, 1 hay 2 cont |
| **Chứng từ chi phí** (ảnh hoá đơn / biên lai) | Tài xế | Chưa (Excel) | Khoản trong định mức tuyến → tự chấp nhận; ngoài → kế toán duyệt |

**Luật kiểm:**
1. Chỉ tính lệnh ở trạng thái **đã điều xe → đã về**. Lệnh nháp không tính (hiện 15 lệnh nháp có hàng thật → phải dọn).
2. **Vượt ngày** = ngày về (giờ cổng) − ngày đi − ngày chuẩn tuyến; > 0 mới có phụ cấp; > 2 ngày → cờ, điều độ ghi lý do.
3. **Km** lệch > 10% km chuẩn tuyến → cờ. Dầu thực đổ > định mức L/100 km × km thật → cờ (rò rỉ lớn nhất của mọi đội xe là dầu,
   không phải lương).
4. **Chi phí Lào** theo bảng định mức LAK/VND của tuyến (mục 2.1): khoản khớp định mức tự chấp nhận, khoản khác cần ảnh chứng từ +
   kế toán duyệt. **Tạm ứng quyết toán riêng** qua công nợ nhân viên, không trộn vào lương (bàn giao đã đúng chỗ này).
5. "Lấy rỗng" phải có LĐĐ riêng (mã NM-DN-R) hoặc cờ "kèm lấy rỗng" trên lệnh cảng — không để tài xế tự khai cuối tháng.
6. Cuối tháng: **Bảng chuyến tài xế** (export ERP) niêm yết 2 ngày, tài xế ký; sửa qua phiếu điều chỉnh có duyệt (dùng lại BM-05).

---

## 6. Cần sửa gì trong ERP Điều động — nhỏ, làm trước engine lương

**Không tạo `fleet_trips`.** `dispatch_orders` đã là nhật ký chuyến (130 dòng thật, có tài xế/xe/cont/phiếu cân). Thêm:

1. `route_code` (FK danh mục tuyến `fleet_routes`: km chuẩn, ngày chuẩn, đơn giá có hiệu lực theo ngày, định mức chi phí, định mức
   dầu) — điều độ chọn khi lập lệnh; chuyến cảng mặc định NM-DN.
2. `gate_out_at`, `odo_out`, `gate_in_at`, `odo_in` — bảo vệ/trạm cân bấm "Xe ra" / "Xe về"; "Xe về" đồng thời chuyển `completed`.
3. `load_factor` suy từ số cont/phiếu cân (1 cont / 2 cont / chạy không).
4. `fleet_drivers.employee_id` + `code` (nối bảng lương); thêm Lê Tấn Anh; phân loại Tiến/Thịnh/Sỹ (lái cont hay xe khác).
5. Bảng `dispatch_expenses` (= XE_CHI_PHI): ngày, nội dung, VND/LAK, được tính, ảnh chứng từ, người duyệt; tạm ứng đi riêng.
6. Báo cáo: **Bảng chuyến tháng theo tài xế** (thay `XE_CHUYEN`), **lệnh nháp có hàng**, **chuyến chưa về**.
7. Lương: view `v_fleet_trip_pay` tính từ `dispatch_orders` + `fleet_routes` (công thức bàn giao giữ nguyên) → dòng `payslip_lines`
   TRIP_PAY / TRIP_OT / TRIP_FUEL — chỉ chạy khi D1–D7 chốt và đơn giá thật đã nhập.

Ước lượng: mục 1–3, 6 ≈ 1 tuần; mục 4–5 ≈ 1 tuần; mục 7 ≈ 1 tuần sau khi có đơn giá.

---

## 7. Lộ trình (song song với khối sản xuất)

| Khi | Việc | Ai |
|---|---|---|
| Tuần cuối T9 | Chốt danh mục tuyến + ngày chuẩn + km chuẩn (chưa cần đơn giá); dọn 15 lệnh nháp có hàng; nối tài xế ↔ nhân viên | Điều độ, HCNS |
| T10 | ERP thêm tuyến + 4 ô cổng/km; bảo vệ ghi giờ/km mỗi chuyến; điều độ bấm "Xe về"; cuối tháng export Bảng chuyến T10 đối chiếu 6 sheet tài xế → đo lệch. **Chưa tính tiền.** | Điều độ, bảo vệ, HCNS |
| T11 | HCNS chốt đơn giá tuyến + hệ số tải + phụ cấp vượt ngày + định mức chi phí/dầu; chạy `v_fleet_trip_pay` song song với số gõ tay; giải thích mọi chênh | HCNS, KTT |
| T12 | Trả lương khoán chuyến từ ERP; tạm ứng/chi phí quyết toán qua kế toán | BGĐ quyết |

---

## 8. Quyết định cần chốt (đội xe)

| # | Câu hỏi | Đề xuất |
|---|---|---|
| **D1** | Tài xế **khoán thuần** hay **lương cứng + khoán chuyến**? Hiện Bảng lương ghi gì ngoài cột "Lương khoán"? | Giữ đúng cơ cấu đang trả; khoán chuyến là phần biến đổi |
| **D2** | Đơn vị khoán: **chuyến × tuyến** hay tấn-km? | Chuyến × tuyến, hệ số 1 cont / 2 cont |
| **D3** | **Lấy rỗng** là chuyến riêng (giá riêng) hay gộp vào chuyến cảng? | Chuyến riêng giá ~50–60% NM-DN, để lệnh khớp thực tế xe chạy |
| **D4** | Chi phí dọc đường: **định mức tuyến** tự chấp nhận, hay duyệt từng khoản? | Định mức + duyệt phần vượt |
| **D5** | Dầu: công ty đổ (0 đ/km, kiểm bằng định mức) hay khoán dầu cho tài xế? | Công ty đổ + định mức L/100 km + thưởng/phạt chênh |
| **D6** | Xe thuê ngoài (`is_hired`) và tài xế ngoài: chắc chắn không vào lương? | Không |
| **D7** | Tiến / Thịnh / Sỹ (xe con, xe tải nhỏ) có khoán chuyến không, hay lương thời gian? | Lương thời gian + phụ cấp chuyến xa (nếu có) |

**HCNS cần cấp trước T11:** đơn giá thật từng tuyến; cơ cấu lương tài xế hiện tại (giải thích con số 10.253.000); danh sách tài
xế có mã; quy định vượt ngày và tiết kiệm dầu (nếu đã có).

---

## 9. Phụ lục

### 9.1 Định mức chi phí tuyến Lào (rút từ T02/2026, để HCNS xác nhận)
LAK: trạm cân Nam Thon 1.000.000 · trạm cân Tha Khẹt 1.000.000 · CA Tha Khẹt 500.000 · CA Salavan 200.000 · CA LN Savannakhet
600.000–850.000 · trạm cân Đông Hen 2.000.000 · CA Si Tha Buộc 800.000–1.000.000 · CA Sê Pôn 200.000 · CA Trạm B 200.000.
VND: CA Đường 9 1.000.000 · CA đường tránh Đông Hà 500.000 · CA Hải Lăng 500.000 · phí cửa khẩu 300.000 · CA 3 trạm 2.000.000
(xuất hiện 1 lần). Chuyến cảng Đà Nẵng: CA Đà Nẵng 400.000 · vé hầm Hải Vân 275.000.

### 9.2 Ánh xạ gói bàn giao → ERP
| Sheet / bảng nháp | ERP |
|---|---|
| `XE_TUYEN` → `fleet_routes` | Tạo mới (giữ), thêm định mức chi phí + dầu |
| `XE_THAM_SO` → `fleet_rate_rules` | Tạo mới (giữ) |
| `XE_CHUYEN` → `fleet_trips` | **Không tạo** — dùng `dispatch_orders` + cột mới (mục 6) |
| `XE_CHI_PHI` → `fleet_expenses` | `dispatch_expenses` gắn `dispatch_order_id` |
| `XE_LUONG` → `fn_calc_fleet_payroll` | View `v_fleet_trip_pay` trên `dispatch_orders` → `payslip_lines` |

### 9.3 Số liệu đã dùng
`dispatch_orders` 130 dòng (06/2026 → 15/09/2026); `fleet_drivers` 8; `fleet_vehicles` 29; phiếu cân nối 37 lệnh; file
`LUONG_KHOAN_SX_DOI_XE_chuan_hoa.xlsx` sheet `XE_*` (16 chuyến, 106 dòng chi phí T02/2026).
