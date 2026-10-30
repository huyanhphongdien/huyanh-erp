# Hàng chèn — hướng dẫn vận hành từ đầu tới cuối (30/10/2026)

Dành cho QS tại xưởng, QC, thủ kho và chủ doanh nghiệp. Điện thoại: `huyanhrubber.vn/m/kho` → tab **Chèn**. Máy tính: menu Kho nguyên liệu → **Hàng chèn**.

## 0. Chuẩn bị một lần

| Việc | Ở đâu | Ghi chú |
|---|---|---|
| Chạy SQL theo thứ tự p4 → … → p13 | Supabase SQL Editor | p4–p10 đã chạy 30/10. Còn lại, chạy đúng thứ tự: **p11** `wms_mix_p11_bi_chi_luc_tra.sql` (bỏ bì lúc lấy + sửa audit) → **p12** `wms_nvl_p12_ket_thuc_ma.sql` (số bành tính lại, thay thế mã, tổng kết + BGĐ) → **p13** `wms_nvl_p13_lenh_chay.sql` (lệnh chạy nhiều mã). Mỗi file có dòng kiểm chứng cuối |
| Phân công | Máy tính: Hàng chèn → tab **Phân công** | Bước 1 QS khai báo · Bước 2 QC duyệt (Lê Thành Nhân, Lê Thị Lệ Trinh, chủ DN) · Bước 3 Thủ kho nhận (tạm: chủ DN). Gõ tên → Thêm; Thu để bỏ. BGĐ level ≤ 3 làm được mọi bước |
| Cỡ bành | Danh mục chủng loại (`weight_per_unit`) | mặc định 35 kg/bành; lô TP / hàng chuẩn lấy cỡ bành của chủng loại |
| Bì pallet | Không cần cấu hình | **không hỏi lúc lấy**; chỉ khai ở lần trả: dùng hết thì cân pallet rỗng (số trên cân = bì), còn dư thì gõ bì |

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

## 2. Khai lệnh chạy (mã nguyên liệu đang chạy)

Một **lệnh chạy** = một đợt chạy máy gồm **một hay nhiều mã** nguyên liệu (sổ tay tổ ép: "chèn MM vào KHMN-15 + 17" trong lúc "TMHG-39 chèn bể Slap" → lệnh 15 + 17 và lệnh 39 chạy song song). Máy đặt mã lệnh LC-PD-261030-01 và tên gộp "KHMN-15 + KHMN-17".

- **Mã lấy từ đâu:** mã sinh lúc **nhận phiếu cân vào kho** (điện thoại tab **Nhập** → ô "Mã nguyên liệu": gợi ý từ phiếu cân, hoặc gõ nguồn + số, hoặc gõ nguyên chữ trên phiếu; máy tính Kho NVL → Nhận hàng vào kho → ô "Mã nguyên liệu"). Lô xe đã vào kho mà chưa có mã: tab **Lô NVL** → "Lô xe chưa gán mã" → **Gán mã nguyên liệu** → chạm mã (hoặc gõ "Mã mới…" → Tạo mã & gán). Hàng chưa về mà muốn khai lệnh trước: tab **Lô NVL** → ô **"Tạo mã trước khi hàng về"** (điện thoại) hoặc Tổng quan kho NVL → thẻ "Tồn theo mã nguyên liệu" → **Tạo mã** (máy tính). Mã mới chưa có hàng nên chưa hiện ở "Còn hàng", nhưng chọn được ở Bắt đầu lệnh và sổ ca.

- **Khai một lần, không chọn trên từng phiếu ca.** Điện thoại tab Chèn, thẻ đầu **"Lệnh đang chạy"** → **Bắt đầu lệnh…** → chạm một hay nhiều mã → Bắt đầu. Máy tính: Hàng chèn → khung **Lệnh đang chạy** → Bắt đầu lệnh… (chọn nhiều mã). Sổ ca: ô mã có link "Khai mã này đang chạy từ giờ" (lệnh một mã).
- **Đang có lệnh khác chạy** → máy hỏi một lần, mặc định **Thay thế** (kết thúc lệnh cũ, ghi "thay bằng …" vào sổ). Hai lựa chọn kia: **Chạy song song** (lệnh riêng, ví dụ TMHG-39 bên bể Slap trong lúc 15 + 17 vào máy Mix) và **Gộp vào lệnh đang chạy** (15 đang chạy, thêm 17 → lệnh 15 + 17).
- Từ đó **phiếu ca** mới, **phiếu chèn** và **lô thành phẩm** tự gắn lệnh đang chạy. Lệnh chạy nhiều ngày, nhiều ca vẫn một dòng; xong thì bấm **Kết thúc** (mục 6b).
- **Nhiều lệnh song song:** phiếu ca và phiếu chèn không tự gắn được → sổ ca chọn mã tay, màn Cân hiện chip từng lệnh để tổ chạm (mục 3).
- **Lệnh nhiều mã (15 + 17):** phiếu ca gắn lệnh, ô mã để trống; thành phẩm và hiệu suất tính **theo lệnh** (tổng kết lệnh), không tách theo từng mã. Chèn tính cho cả lệnh; xem theo từng mã thì kg chia đều.
- Lô TP: chỉ tự gắn mã khi đúng một mã đang chạy; lệnh gộp thì chọn tay hoặc để trống.
- Chip "Đang chạy" ở tab Lô NVL theo sổ này. Mã khai trước p13 tự chuyển thành lệnh một mã, dùng như cũ.

## 3. Lấy hàng chèn — mỗi pallet một lần (QS)

Trang chính tab Chèn → nút **Lấy lần n** (máy đếm theo ca).

1. **Chọn lô:** quét tem CH-… hoặc gõ / quét đúng số lô trên bao, hoặc chạm thẻ lô. Thẻ xám phía trên liệt kê các lần đã lấy của ca (L1, L2…) để đối chiếu sổ.
2. **Ca:** tự nhận theo chấm công hoặc giờ, bấm Đổi ca nếu khác. Tổ trưởng: **Ca Vang** hoặc **Ca Hiền**. Dùng để: Chạy lại / Nâng chỉ số.
3. **Chèn vào đâu:** Chèn bể Slap hoặc Chèn máy Mix (bắt buộc, máy nhớ lần trước).
4. **Cân:** chỉ gõ số trên cân "Cân cả pallet". Không hỏi bì ở bước này; kg lấy tạm bằng số cân tổng, máy ước **số bành** (− + nếu đếm khác). Bì khai ở lần trả, khi đó kg lấy tính lại. Bấm "Gõ thẳng kg" nếu không cân cả pallet.
5. **Chèn vào lệnh / mã:** đúng một lệnh đang chạy → chip tự sáng "theo lệnh" (hoặc theo phiếu ca). Nhiều lệnh song song → chạm chip lệnh pallet này chèn vào (ví dụ "KHMN-15 + KHMN-17" hay "TMHG-39"). Vẫn chạm được mã lẻ nếu không theo lệnh.
6. **Chụp 2 ảnh** tại cân (toàn cảnh, màn hình cân) → Tiếp tục → xem lại → **Ghi lần n**.
7. Pallet tiếp theo: **Lấy lần n+1**. Lần 1 chưa trả vẫn lấy lần 2, 3 bình thường.

## 4. Trả cuối ca (QS)

Trang chính, dòng **L1 · Trả L1** (từng lần có nút riêng). Ba lần cân, máy hiện theo thứ tự:
- **Cân 1** (đã có từ lúc lấy): cả hàng + pallet.
- **Cân 2 · hàng trả + pallet:** gõ số trên cân nếu còn hàng. Dùng hết thì bấm **"Dùng hết · bỏ cân 2"**, máy nhảy sang cân 3.
- **Cân 3 · pallet rỗng:** cân pallet rỗng rồi gõ (mặc định 15).
Máy tính: hàng trả = cân 2 − cân 3; kg lấy = cân 1 − cân 3; tiêu hao = kg lấy − hàng trả. Chụp 2 ảnh (pallet rỗng nếu dùng hết) → **Ghi trả và ký khai báo** (một chạm = ghi trả + chữ ký bước 1).
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
| Lệnh nào đang chạy, chèn được bao nhiêu | Điện thoại: thẻ đầu tab Chèn; máy tính: Hàng chèn → khung **Lệnh đang chạy** (tên gộp, mã LC, chèn đã nhận, chờ ký, phiếu mở, nút Tổng kết / Kết thúc lệnh) |
| Một mã đã chèn bao nhiêu, loại gì, bể hay máy | Điện thoại: tab **Lô NVL** → thẻ mã → dòng "Chèn vào mã"; máy tính: Hàng chèn → bảng **Phiếu theo mã hàng đang chạy** (chọn mã, cột Lần, tóm tắt đã nhận; mã trong lệnh gộp thì kg chia đều) |
| Phiếu chưa đủ chữ ký | Máy tính: bảng **Phiếu đang mở**; điện thoại: Chờ ký |
| Phiếu chưa gắn mã | Máy tính: bảng "Phiếu chưa gắn mã hàng" → mở phiếu → Đổi mã |
| Tồn kho chèn theo lô, số bành | Kho chèn (điện thoại / máy tính) |
| Lịch sử mọi phiếu | Điện thoại: Lịch sử phiếu |

### 6b. Kết thúc lệnh (mã) · tổng kết · mail Ban Giám đốc (SQL p12 + p13)

Khi lệnh chạy xong (hết NVL vào máy, phiếu chèn cuối đã trả):
1. **Điện thoại** tab Chèn, thẻ "Lệnh đang chạy" → **Kết thúc** → xác nhận → máy mở trang **Tổng kết lệnh**. **Máy tính** /wms/chen, khung "Lệnh đang chạy" → **Kết thúc lệnh** → xác nhận → cửa sổ tổng kết. (Mã khai trước p13 không nằm trong lệnh: nút **Kết thúc mã** ở khung "Phiếu theo mã".)
2. Tổng kết gồm: tiêu hao chèn (kg, % hàng vào máy, bể Slap / máy Mix, theo nguồn lỗi / DKL / chuẩn / khác, theo lô chèn, theo ca), NVL nhập kho / xuất vào máy / còn kho (lệnh nhiều mã: từng mã rồi tổng), thành phẩm đạt + hiệu suất, đợt chạy, và cảnh báo phiếu chưa trả / chờ ký.
3. Mail **soạn sẵn** cho Ban Giám đốc (người nhận = nhân viên chức vụ level ≤ 3 có email trong Nhân sự, sửa được): **Gửi mail cho BGĐ** (gửi qua hệ thống, tài khoản mail công ty) · **Mở ứng dụng mail** (Outlook/Mail điền sẵn, tự bấm gửi) · **Sao chép nội dung** (dán Zalo/Teams).
4. Xem lại bất cứ lúc nào: nút **Tổng kết · mail BGĐ** cạnh lệnh, hoặc **Tổng kết mã · mail BGĐ** ở khung theo mã (máy tính); **Tổng kết** cạnh lệnh (điện thoại), kể cả lệnh đã kết thúc. Nếu còn phiếu chờ ký, gửi lại sau khi thủ kho nhận để số chốt.

**Số bành:** lúc lấy máy ước theo (cân − 15) / kg mỗi bành; lúc trả máy **tính lại** theo kg lấy thật (cân 1 − bì). Tổ đã bấm − / + lúc lấy thì giữ nguyên số tổ chỉnh.

## 7. Sửa khi sai

| Sai gì | Làm gì | Được tới khi |
|---|---|---|
| Gõ nhầm số cân / số bành lúc lấy | Mở phiếu → **Sửa cân lúc lấy** (cần SQL p8; đã trả rồi thì máy giữ bì đã khai lúc trả) | trước khi QS ký khai báo xong bước 1 (phiếu đang ở dây chuyền hoặc đã trả) |
| Nhầm kg trả | Mở phiếu → **Sửa kg trả** | trước khi QC duyệt |
| Nhầm mã gốc / lệnh hoặc bể / máy | Mở phiếu → **Đổi mã** (chọn lại mã, bể Slap / máy Mix; máy tự tìm lệnh chứa bộ mã) | trước khi thủ kho nhận |
| Khai nhầm lệnh (thiếu / thừa mã) | Kết thúc lệnh rồi Bắt đầu lệnh đúng; hoặc Bắt đầu mã còn thiếu → chọn **Gộp vào lệnh đang chạy** | bất kỳ lúc nào |
| Lấy nhầm lô | Mở phiếu → **Lấy nhầm? Hủy phiếu** → kg trả về tồn kho chèn | trước khi thủ kho nhận |
| Tồn kho chèn lệch cân thực | Kho chèn → **Kiểm kê lô này** → kg cân thực + lý do | bất kỳ lúc nào |
| Lô nhập nhầm | Kho chèn → **Nhập nhầm? Hủy lô** | lô chưa có phiếu lấy |

## 8. Quy ước nhanh

- Một lệnh = một hay nhiều mã chạy chung; nhiều lệnh chạy song song được. Chỉ **2 vị trí chèn**: bể Slap và máy Mix (chèn băng tải ghi là máy Mix).
- Mỗi phiếu = một pallet = một lần chèn; số lần đếm theo ca, gom theo lệnh / mã gốc.
- Bành 35 kg (hoặc cỡ bành của chủng loại), máy tự quy; chỉ chỉnh khi đếm khác.
- Bì pallet: lúc lấy không hỏi, lúc trả khai; máy tự tính lại kg lấy = cân tổng − bì.
- 2 ảnh lúc lấy và 2 ảnh lúc trả luôn bắt buộc, kể cả dùng hết (ảnh pallet rỗng trên cân là bằng chứng bì).
- Kho chèn, sổ ca, gom theo mã chỉ thay đổi ở bước thủ kho nhận.
- Chi tiết kiểm thử từng màn: `docs/HANG_CHEN_TEST_TU_DAU_TOI_CUOI.md` (mục 14–24).
