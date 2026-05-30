# HƯỚNG DẪN SỬ DỤNG MODULE THU MUA — Cao Su Huy Anh

**Phiên bản**: 2026-05-30 · **Đối tượng**: Operator cân, Kế toán Thu mua, Trưởng phòng, BGĐ

---

## MỤC LỤC

1. [Tổng quan module Thu Mua](#1-tổng-quan-module-thu-mua)
2. [Các luồng nghiệp vụ](#2-các-luồng-nghiệp-vụ)
3. [Quy trình cân (app cân)](#3-quy-trình-cân-app-cân)
4. [Phiếu chốt giá (PCG)](#4-phiếu-chốt-giá-pcg)
5. [Đề nghị thanh toán (ĐNTT)](#5-đề-nghị-thanh-toán-đntt)
6. [Liên 2 — Xác nhận khối lượng & thanh toán](#6-liên-2--xác-nhận-khối-lượng--thanh-toán)
7. [Quản lý đại lý + Tài khoản ngân hàng](#7-quản-lý-đại-lý--tài-khoản-ngân-hàng)
8. [Thống kê + Thưởng đại lý](#8-thống-kê--thưởng-đại-lý)
9. [Sự cố thường gặp](#9-sự-cố-thường-gặp)

---

## 1. Tổng quan module Thu Mua

Module Thu Mua quản lý toàn bộ luồng mua mủ cao su từ đại lý / NCC. Bao gồm 3 phần mềm liên thông:

| Hệ thống | URL / vị trí | Người dùng chính |
|---|---|---|
| **App Cân** | `/wb` (sub-app) | Nhân viên trạm cân |
| **ERP Thu Mua** | huyanhrubber.vn | Kế toán, BGĐ, Thu mua |
| **Portal B2B** | b2b.huyanhrubber.vn | Đại lý (đăng nhập tự xem deal/công nợ) |

Module trả lời 4 câu hỏi:
- **Cân gì?** — Phiếu cân (weighbridge_tickets): xe nào, KL bao nhiêu, DRC bao nhiêu, ngày nào.
- **Giá gì?** — Từ Deal (chat → chốt giá B2B) hoặc Phiếu chốt giá (bộc phát đại lý đến đột xuất).
- **Trả ai?** — TK ngân hàng đại lý (có thể qua proxy nếu đại lý nhờ người khác nhận hộ).
- **Trả bao nhiêu?** — Đề nghị thanh toán (ĐNTT) gom phiếu cân + tính thành tiền + trừ phí PCG.

---

## 2. Các luồng nghiệp vụ

### 2.1 Luồng A — Deal có kế hoạch (qua chat B2B)

```
Đại lý chat → Sale chốt deal trên hệ thống (giá + KL kế hoạch)
   → Đại lý chở mủ đến cân → Cân (chọn nguồn = Deal)
   → ĐNTT tự lấy giá deal → Duyệt → Chuyển khoản
```

### 2.2 Luồng B — Bộc phát (đại lý đến đột xuất, chốt giá cuối ngày)

```
Đại lý đến cân (KHÔNG có deal trước) → Cân (chọn nguồn = Bộc phát + chọn đại lý)
   → Trạng thái "Chưa chốt giá"
   → Cuối ngày: Thu mua lập Phiếu chốt giá (PCG) cho đại lý + ngày + giá
   → ĐNTT match phiếu cân với PCG → tự điền giá + trừ phí → Duyệt → Chuyển khoản
```

### 2.3 Luồng C — NCC lẻ / Mủ Lào (qua supplier)

```
NCC lẻ đến cân → Cân (chọn nguồn = NCC) → KL + DRC
   → ĐNTT tự lấy giá đã thoả thuận từ NCC (mua lẻ) → Duyệt
```

### 2.4 Luồng D — Chuyển kho nội bộ (transfer)

```
Xe nội bộ chở mủ giữa các cơ sở → Cân nhập / cân xuất → Không tạo ĐNTT
   (chỉ để cập nhật tồn kho)
```

**Tỷ lệ thực tế tại HAQT/Tân Lâm**: ~80% là Bộc phát (Luồng B), 15% Deal, 5% còn lại.

---

## 3. Quy trình cân (app cân)

### 3.1 Cân lần 1 (Gross — xe + mủ)

1. Vào app cân, bấm **"Tạo phiếu mới"**.
2. Nhập **Biển số xe** (có gợi ý từ lịch sử) + **Tài xế**.
3. Chọn **Nguồn**:
   - **Deal** → chọn Deal đang processing
   - **NCC** → chọn NCC từ danh sách
   - **Bộc phát** → chọn đại lý B2B
4. Chọn **Loại mủ** (mủ nước / mủ tạp / mủ đông / mủ chén / mủ tờ).
5. Nhập **Vị trí dỡ** + **Tạp chất (kg)** nếu có giảm trừ.
6. Bấm **"Cân lần 1"** → hệ thống tự đọc cân + chụp ảnh xe (3 góc).

### 3.2 Đo DRC tại cân (chỉ mủ nước, theo quy trình Tân Lâm)

Sau cân lần 1, đại lý đem mủ vào bể. Trong khi đợi:

1. Lấy mẫu mủ → đo bằng metrolac → ghi số đốt (180-240).
2. Nhập **ĐỐT** vào ô card "Đo DRC tại cân".
3. **DRC thực** tự suy từ bảng quy đổi (`drc_lookup`) → vd ĐỐT 200 → DRC 36.6%.
4. Operator có thể override DRC nếu cần.

### 3.3 Cân lần 2 (Tare — xe rỗng)

Sau khi xả mủ:

1. Xe trống vào cân lần 2.
2. Bấm **"Cân lần 2"** → hệ thống tự đọc + chụp ảnh.
3. **NET** = Gross - Tare - Tạp chất.
4. **KL khô** = NET × DRC% (chỉ mủ nước, các loại khác bỏ qua).
5. Trạng thái phiếu → `completed`.
6. Bridge tự tạo `rubber_intake_batches` (lý lịch mủ ERP).

### 3.4 In phiếu cân

- A4 / A5 ngang / Nhiệt 80mm / Nhiệt 58mm.
- A4 / A5: serif (Times New Roman) — đúng chứng từ.
- Nhiệt: sans-serif (Be Vietnam Pro) — rõ ở size nhỏ.
- Có QR code ticket để tra cứu.

---

## 4. Phiếu chốt giá (PCG)

### 4.1 Khi nào dùng

**Chỉ cho luồng B (bộc phát)** — đại lý đến cân nhưng chưa thoả thuận giá trước. Cuối ngày Thu mua lập PCG cho toàn bộ đại lý đã giao mủ hôm đó.

### 4.2 Tạo PCG

`B2B THU MUA → Phiếu chốt giá → Tạo phiếu`

1. **Thông tin chung**: Cơ sở (TL / HAQT), Ngày chốt, Hình thức mua (Cụm/Đại lý/Hộ ND/Công ty).
2. **Danh sách đại lý + giá áp** (1 phiếu = nhiều đại lý):
   - Chọn đại lý (autofill tên)
   - Khối lượng dự kiến (kg), DRC dự kiến (%), **Giá áp (đ/tấn)**.
   - Nhiều đại lý cùng ngày → mỗi đại lý 1 giá khác nhau.
3. **Bảng giá tham chiếu**: Sàn / Trung / Cao (đ/tấn) — cho BGĐ tham chiếu.
4. **Loại tiền + tỷ giá**: VNĐ / KIP / THB.
5. **Các phí phải chi** (tick để áp dụng + nhập giá):
   - Bốc xếp, Bến bãi, Thuế Xã/Bản, Giấy tờ đi đường, Hoa hồng, Bo hàng, Thuê xe, Khác
   - Theo tấn (× KL khô) hoặc theo lô (cố định 1 lần)
6. **Thời gian**: Ngày cân (từ - đến) → PCG sẽ match phiếu cân trong khoảng này.
7. **Người chốt giá**: Lê Thì / Nguyễn Nhật Tân.
8. **Trạng thái**: Nháp → Đã chốt → Đã dùng → Đã huỷ.
   - Nháp = soạn thảo, chưa enforce.
   - **Đã chốt** = khoá giá, sẵn sàng match phiếu cân.
   - **Đã dùng** = đã match vào ĐNTT (auto-update sau khi tạo ĐNTT).
   - Huỷ chỉ được khi chưa duyệt ĐNTT.

### 4.3 In phiếu chốt giá

Form theo mẫu **BM CL.BMQT.KH.01.01** — có logo, 3 chữ ký (BGĐ, Trưởng phòng Thu mua, Người chốt giá), bảng đại lý + giá áp + phí + thời gian.

### 4.4 Cảnh báo

- PCG `Đã dùng` không thể sửa. Tạo PCG mới nếu cần.
- 1 đại lý ngày này 1 giá — không trùng. Nếu lỡ chốt 2 PCG cùng đại lý cùng ngày, resolver lấy PCG mới nhất.
- Phí "theo lô" áp dụng 1 lần/PCG. Phí "theo tấn" nhân với tổng KL khô của PCG đó.

---

## 5. Đề nghị thanh toán (ĐNTT)

### 5.1 Tạo ĐNTT

`B2B THU MUA → Đề nghị thanh toán → Tạo phiếu`

1. **Bộ lọc**:
   - Nhà máy (cơ sở)
   - Từ ngày — Đến ngày (mặc định **1 ngày = hôm nay**)
   - Loại mủ (mủ nước / mủ tạp / …)
2. Bấm **"Tìm phiếu cân"** → list phiếu khả dụng (đã hoàn tất, chưa thuộc ĐNTT khác).
3. Mỗi phiếu hiện badge **"Nguồn giá"**:
   - 🟢 **Giá deal** → giá lấy từ Deal (Luồng A)
   - 🟡 **Giá PCG-XXXX** → giá lấy từ PCG (Luồng B)
   - 🔴 **⚠ Chưa có giá** → không match được → kế toán phải nhập tay
   - ⚠️ **Thiếu DRC** → mủ nước nhưng phiếu cân thiếu DRC → tự đặt 0đ, nhập tay
4. Tick phiếu cần gom (mặc định tick hết).
5. Nhập tiêu đề ĐNTT (vd "Mủ nước Tân Lâm 26/05/2026") + chọn tiền tệ.
6. Bấm **"Tạo đề nghị"** → hệ thống:
   - Tạo header ĐNTT (mã `TMMN-YYMM-NNN`)
   - Tạo dòng cho mỗi phiếu cân (KL khô × đơn giá)
   - **Tạo dòng riêng "Phí áp dụng (PCG XXX)"** với amount âm — trừ phí trên PCG
   - Đánh dấu phiếu cân `payment_request_id` (chống gom trùng)
   - Đánh dấu PCG `Đã dùng`

### 5.2 Workflow trạng thái

```
draft → submitted → approved (BGĐ duyệt) → paid (kế toán chi)
   ↘ cancelled
```

### 5.3 In ĐNTT

A4 — 1 trang, có:
- Header công ty + logo
- Bảng dòng: số phiếu cân | đại lý | KL khô | đơn giá | thành tiền
- **Dòng "Phí (-X đ)"** riêng (BGĐ thấy rõ phí áp dụng)
- Tổng cộng + số tiền bằng chữ
- 3 chữ ký: Người lập / Kế toán / Giám đốc

### 5.4 Sửa ĐNTT

Khi `draft` — sửa được. Khi `approved` hoặc `paid` — không sửa được (audit lock).

---

## 6. Liên 2 — Xác nhận khối lượng & thanh toán

### 6.1 Mục đích

Bản giấy **giao cho đại lý** sau khi cân xong — để đại lý đến thanh toán mang theo + xác nhận đúng KL nhận được.

### 6.2 Cách in

`B2B THU MUA → Nhập kho mủ → [Mở 1 phiếu] → "In Liên 2"`

A4 — 1 trang, có:
- Header công ty + logo
- Tiêu đề "XÁC NHẬN KHỐI LƯỢNG NHẬP MỦ VÀ THANH TOÁN (Liên 2 — Giao khách hàng)"
- Số phiếu (PNK number sequential per năm/cơ sở)
- Họ tên người bán + ĐT + Địa chỉ
- **Tài khoản nhận**: TK + Tên chủ TK + NH (kèm "chuyển hộ qua X" nếu đại lý có proxy)
- Bảng: Loại mủ | Khối lượng | Hàm lượng (Độ đốt + DRC) | Đơn giá | Thành tiền
- 3 ô ký: KCS / Thanh toán / Khách hàng
- Lưu ý: "Khi đi thanh toán nhớ mang theo CMND"

### 6.3 Điều kiện in

Phiếu nhập phải **đã chốt giá** (status `confirmed` + có PNK number). Nếu chưa chốt → in ra ô số phiếu trống.

---

## 7. Quản lý đại lý + Tài khoản ngân hàng

### 7.1 Đại lý B2B

`B2B THU MUA → Đại lý`

Mỗi đại lý có:
- Mã (HAC-13 auto-gen)
- Tên + Biệt danh liên hệ
- Loại: dealer / supplier / both
- Tier: bronze / silver / gold / diamond (ảnh hưởng thưởng)
- Status: pending / verified / suspended / rejected
- **Đại lý đầu mối** (`payment_proxy_partner_id`): trỏ đến đại lý khác — tiền sẽ chuyển vào TK proxy

### 7.2 Tài khoản ngân hàng

`PartnerDetailPage → "Tài khoản ngân hàng"` (UI sẽ có ở commit follow-up).

Hiện tại quản lý qua SQL hoặc thông qua seed. Mỗi đại lý:
- Có thể có **nhiều TK** (`b2b_partner_banks`).
- 1 TK đặt `is_default=true` → in ra ĐNTT/Liên 2.
- Khi khách yêu cầu chuyển TK khác → tạo TK mới, set default mới (TK cũ giữ lịch sử).

**Resolver TK chuyển tiền**:
1. Nếu partner có `payment_proxy_partner_id` → lấy TK default của proxy.
2. Else → TK default của partner.
3. Else → trống → kế toán nhập tay.

### 7.3 Ví dụ thực tế (Tân Lâm)

- **Trần Thị Mỹ Hoà** = proxy hub, có TK Agribank 3905205089190.
- **Nguyễn Thị Hương**, **Nguyễn Thị Hiền** → mỗi người set `payment_proxy_partner_id` = Mỹ Hoà.
- Khi cân cho Nguyễn Thị Hương → ĐNTT in ra TK của Mỹ Hoà + ghi "(chuyển hộ qua Trần Thị Mỹ Hoà)".

---

## 8. Thống kê + Thưởng đại lý

### 8.1 Trang thống kê

`B2B THU MUA → Nhập kho mủ → tab "Thống kê"`

Hiển thị theo từng đại lý:
- Tổng KL khô tháng / quý
- Tách **"Khô từ Deal"** vs **"Khô bộc phát"** → biết đại lý nào chủ yếu mua qua deal
- Xuất Excel chi tiết

### 8.2 Tính thưởng

- Bonus tính theo **KL khô** (`dry_weight_kg`) — quy chế T1/2026.
- Áp dụng theo tier: bronze/silver/gold/diamond → mức thưởng/tấn khác nhau.
- Cuối quý → tự tổng hợp thưởng → Quyết toán.

### 8.3 Quyết toán

`B2B THU MUA → Quyết toán` → tự tổng hợp công nợ + thưởng + advance đã chi → ra số cuối kỳ chuyển khoản.

---

## 9. Sự cố thường gặp

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| ĐNTT hiện "⚠ Chưa có giá" | Phiếu bộc phát, chưa có PCG khớp ngày/đại lý | Tạo PCG cho đại lý + ngày đó, hoặc nhập đơn giá tay |
| Liên 2 không có TK | Đại lý chưa khai TK ngân hàng | Vào PartnerDetailPage → khai TK → set default |
| Bridge không tạo intake batch | Phiếu cân không có `partner_id` lẫn `supplier_id` (orphan) | Mở phiếu cân → chọn nguồn → save lại |
| PCG không match phiếu cân | Ngày cân ngoài range `weigh_from..weigh_to`, hoặc partner_id không khớp | Sửa PCG (nếu draft), hoặc tạo PCG mới |
| `qc_actual_drc` null + mủ nước | Operator quên đo DRC | ĐNTT hiện "⚠ Thiếu DRC", kế toán nhập tay; quay lại app cân update DRC nếu phiếu chưa thuộc ĐNTT |
| Thưởng tính sai | Bridge không tạo intake hoặc `dry_weight_kg` = 0 (thiếu DRC) | Verify rubber_intake_batches có row tương ứng, DRC > 0 |

---

## PHỤ LỤC: Mã định danh

- **Phiếu cân (weighbridge_tickets.code)**: `CX-YYYYMMDD-NNN` — vd `CX-20260526-001`
- **PNK number (rubber_intake_batches.pnk_number)**: int sequential per (cơ sở, năm) — vd `73`
- **PCG (b2b_price_lock_tickets.code)**: `PCG-YYYY-NNNN` — vd `PCG-2026-0001`
- **ĐNTT (payment_requests.code)**: `TMMN-YYMM-NNN` — vd `TMMN-2605-001`
- **Deal (b2b_deals.deal_number)**: `D-YYYY-NNNN` (legacy)
- **Đại lý**: HAC-13 (13 chữ số) — vd `8999100012346`

---

*Tài liệu cập nhật theo audit + fix Phase 3 (commits A→D). Mọi thắc mắc gửi về kỹ thuật.*

---

## Chuyển sang .docx

File markdown này có thể convert thành Word document bằng nhiều cách:

**Cách 1 (đơn giản nhất)**: Mở `docs/THU_MUA_FLOWS.html` trực tiếp trong Microsoft Word → File → Save As → chọn `.docx`. Giữ nguyên font + layout.

**Cách 2**: Dùng [Pandoc](https://pandoc.org/installing.html) — cài 1 lần:
```bash
pandoc docs/HUONG_DAN_THU_MUA.md -o docs/HUONG_DAN_THU_MUA.docx --reference-doc=template.docx
```

**Cách 3**: Online converter — vd [pandoc.org/try](https://pandoc.org/try) hoặc [cloudconvert.com/md-to-docx](https://cloudconvert.com/md-to-docx) — paste nội dung MD, tải về .docx.

Sau khi convert, anh có thể chỉnh thêm logo, header/footer công ty trong Word.
