# Hàng chèn — hướng dẫn vận hành từ đầu tới cuối (30/10/2026)

Dành cho QS tại xưởng, QC, thủ kho và chủ doanh nghiệp. Điện thoại: `huyanhrubber.vn/m/kho` → tab **Chèn**. Máy tính: menu Kho nguyên liệu → **Hàng chèn**.

## 0. Chuẩn bị một lần

| Việc | Ở đâu | Ghi chú |
|---|---|---|
| Chạy SQL theo thứ tự p4 → p5 → p6 → p7 → p8 → p9 → p10 | Supabase SQL Editor | p4–p7 đã chạy 30/10; **p8** (`wms_mix_p8_sua_can_lay.sql`), **p9** (`wms_mix_p9_tra_bi_pallet.sql`), **p10** (`wms_nvl_p10_ma_dang_chay.sql`) chạy tiếp theo thứ tự |
| Phân công | Máy tính: Hàng chèn → tab **Phân công** | Bước 1 QS khai báo · Bước 2 QC duyệt (Lê Thành Nhân, Lê Thị Lệ Trinh, chủ DN) · Bước 3 Thủ kho nhận (tạm: chủ DN). Gõ tên → Thêm; Thu để bỏ. BGĐ level ≤ 3 làm được mọi bước |
| Cỡ bành | Danh mục chủng loại (`weight_per_unit`) | mặc định 35 kg/bành; lô TP / hàng chuẩn lấy cỡ bành của chủng loại |
| Bì pallet | Không cần cấu hình | lúc lấy chỉ là số tạm (15); **khai chính xác ở lần trả**: dùng hết thì cân pallet rỗng, số trên cân chính là bì |

Ai không có tên ở bước 1 sẽ thấy "chưa được phân công khai báo (QS)" và không lấy / nhập lô được.

## 1. Đưa hàng vào kho chèn (QS, một lần cho mỗi đợt hàng)

Điện thoại: Chèn → **Kho chèn** → **Nhập lô chèn**. Máy tính: Hàng chèn → Kho chèn → Nhập lô chèn.

| Nguồn | Cách làm | Số lô |
|---|---|---|
| Lô thành phẩm bị QC đánh CXL / Loại | Hàng lỗi (hoặc DKL) → tab **Lô TP lỗi** → chạm lô → số bành → Chuyển | tự lấy số lô TP |
| Dòng LOI / DKL trên sổ ca đã ký | tab **Từ sổ ca** → chạm dòng → kg (mặc định phần chưa chuyển) | **gõ số lô trên bao** |
| Sổ QC hàng không đạt | tab **Từ sổ QC** → chạm dòng → kg | tự lấy từ sổ QC, sửa được |
| Hàng chuẩn lấy từ kho TP để nâng chỉ số | Hàng chuẩn → chạm chủng loại → kg → chọn ca (phiếu ca phải đang nháp) | gõ, có nút gợi ý lô đạt còn tồn |
| SBR 1502 mua ngoài, hàng khác | Mua ngoài / Khác → **Số lô** → **Số bành** (máy ra kg, 35 kg/bành) hoặc gõ kg | gõ số lô nhà cung cấp |

Quy tắc: không có số lô thì không nhập được. Lô **DKL** phải bấm "Đã xử lý kim loại, mở lấy" ở Kho chèn rồi mới lấy chèn được. Lô cũ chưa có số lô: ở Kho chèn gõ số lô → **Gán**, hoặc lúc lấy máy sẽ hỏi.

## 2. Khai báo mã nguyên liệu đang chạy

- **Khai một lần, không chọn trên từng phiếu ca:** điện thoại tab Chèn, thẻ đầu **"Mã nguyên liệu đang chạy"** → Bắt đầu mã… → chạm mã. Mã chạy nhiều ngày, nhiều ca thì vẫn một dòng; xong thì bấm **Kết thúc**. Chạy chung hai mã thì bắt đầu cả hai.
- Từ đó phiếu ca mới (sổ ca ép bành), phiếu chèn và lô thành phẩm tự gắn mã đang chạy; ô mã trên sổ ca vẫn đổi được nếu ca đó chạy khác.
- Hai mã cùng chạy: phiếu ca mới không tự điền (chọn tay), phiếu chèn gắn cả hai (kg chia đều khi gom).
- Chip "Đang chạy" ở tab Lô NVL theo sổ này.

## 3. Lấy hàng chèn — mỗi pallet một lần (QS)

Trang chính tab Chèn → nút **Lấy lần n** (máy đếm theo ca).

1. **Chọn lô:** quét tem CH-… hoặc gõ / quét đúng số lô trên bao, hoặc chạm thẻ lô. Thẻ xám phía trên liệt kê các lần đã lấy của ca (L1, L2…) để đối chiếu sổ.
2. **Ca:** tự nhận theo chấm công hoặc giờ, bấm Đổi ca nếu khác. Tổ trưởng: **Ca Vang** hoặc **Ca Hiền**. Dùng để: Chạy lại / Nâng chỉ số.
3. **Chèn vào đâu:** Chèn bể Slap hoặc Chèn máy Mix (bắt buộc, máy nhớ lần trước).
4. **Cân:** chỉ cần số trên cân "Hàng + pallet" (cân tổng). Bì 15 là tạm, sẽ khai chính xác ở lần trả. Máy tạm trừ bì ra kg hàng chèn và tính **số bành** (− + nếu đếm khác). Bấm "Gõ thẳng kg" nếu không cân cả pallet.
5. **Chèn vào mã:** chip mã tự sáng theo phiếu ca; chạm thêm mã nếu chèn chung.
6. **Chụp 2 ảnh** tại cân (toàn cảnh, màn hình cân) → Tiếp tục → xem lại → **Ghi lần n**.
7. Pallet tiếp theo: **Lấy lần n+1**. Lần 1 chưa trả vẫn lấy lần 2, 3 bình thường.

## 4. Trả cuối ca (QS)

Trang chính, dòng **L1 · Trả L1** (từng lần có nút riêng). Bì pallet khai ở bước này mới là số chính xác.
- **Dùng hết** (mặc định): đặt pallet rỗng lên cân, gõ số trên cân → đó là bì; trả 0 kg. Máy tính lại kg lấy = cân tổng lúc lấy − bì. Chụp 2 ảnh pallet rỗng trên cân → **Ghi trả và ký khai báo** (một chạm = ghi trả + chữ ký bước 1).
- **Còn hàng dư:** gõ bì pallet chính xác và số trên cân "Hàng trả + pallet" → kg trả = cân − bì, kg lấy cũng tính lại theo bì này. Chụp 2 ảnh phần trả, rồi ghi và ký.
- Để phần dư lại dây chuyền cho ca sau: tick "Để lại dây chuyền cho ca sau" (máy tự mở phiếu lấy cho ca kế khi thủ kho nhận; ca kế phải chọn ca khi trả).

Tiêu hao = cân lúc lấy − cân lúc trả (bì triệt tiêu). Kho chèn chỉ trừ khi thủ kho nhận.

## 5. Ký 3 bước

Trang chính → **Chờ ký** (`/m/kho/chen/ky`). Mỗi người chỉ thấy nút của bước mình:
1. **QS ký khai báo** (đã ký ngay lúc trả; nếu chưa, ký ở đây).
2. **QC duyệt** (Nhân, Trinh, chủ DN).
3. **Thủ kho nhận** → kho chèn trừ tiêu hao, sổ ca ép bành tự điền dòng CHÈN, số liệu gom vào mã gốc.

Nhiều phiếu một ca: thẻ đầu trang **"Ký tất cả N phiếu · ngày · ca · bước"**, một chạm cho cả ca. Phiếu thiếu ảnh bắt buộc bị bỏ qua và nhắc riêng.

## 6. Theo dõi

| Muốn xem | Ở đâu |
|---|---|
| Ca này chèn mấy lần, lần nào chưa trả, gom theo mã | Điện thoại: trang chính tab Chèn (thẻ ca: L1, L2… nhóm theo mã, chip n lần · kg · bành, "đã nhận X kg · % hàng vào máy") |
| Một mã đã chèn bao nhiêu, loại gì, bể hay máy | Điện thoại: tab **Lô NVL** → thẻ mã → dòng "Chèn vào mã"; máy tính: Hàng chèn → bảng **Phiếu theo mã hàng đang chạy** (chọn mã, cột Lần, tóm tắt đã nhận) |
| Phiếu chưa đủ chữ ký | Máy tính: bảng **Phiếu đang mở**; điện thoại: Chờ ký |
| Phiếu chưa gắn mã | Máy tính: bảng "Phiếu chưa gắn mã hàng" → mở phiếu → Đổi mã |
| Tồn kho chèn theo lô, số bành | Kho chèn (điện thoại / máy tính) |
| Lịch sử mọi phiếu | Điện thoại: Lịch sử phiếu |

## 7. Sửa khi sai

| Sai gì | Làm gì | Được tới khi |
|---|---|---|
| Gõ nhầm bì / số cân / số bành lúc lấy | Mở phiếu → **Sửa cân lúc lấy** (cần SQL p8) | trước khi QS ký khai báo xong bước 1 (phiếu đang ở dây chuyền hoặc đã trả) |
| Nhầm kg trả | Mở phiếu → **Sửa kg trả** | trước khi QC duyệt |
| Nhầm mã gốc hoặc bể / máy | Mở phiếu → **Đổi mã** (chọn lại mã, bể Slap / máy Mix) | trước khi thủ kho nhận |
| Lấy nhầm lô | Mở phiếu → **Lấy nhầm? Hủy phiếu** → kg trả về tồn kho chèn | trước khi thủ kho nhận |
| Tồn kho chèn lệch cân thực | Kho chèn → **Kiểm kê lô này** → kg cân thực + lý do | bất kỳ lúc nào |
| Lô nhập nhầm | Kho chèn → **Nhập nhầm? Hủy lô** | lô chưa có phiếu lấy |

## 8. Quy ước nhanh

- Mỗi phiếu = một pallet = một lần chèn; số lần đếm theo ca, gom theo mã gốc.
- Bành 35 kg (hoặc cỡ bành của chủng loại), máy tự quy; chỉ chỉnh khi đếm khác.
- Bì pallet: lúc lấy tạm, lúc trả chính xác; máy tự tính lại kg lấy theo bì lúc trả.
- 2 ảnh lúc lấy và 2 ảnh lúc trả luôn bắt buộc, kể cả dùng hết (ảnh pallet rỗng trên cân là bằng chứng bì).
- Kho chèn, sổ ca, gom theo mã chỉ thay đổi ở bước thủ kho nhận.
- Chi tiết kiểm thử từng màn: `docs/HANG_CHEN_TEST_TU_DAU_TOI_CUOI.md` (mục 14–22).
