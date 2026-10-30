# Hàng chèn (mix) — hướng dẫn test từ đầu tới cuối

Cập nhật 30/10/2026 · tài khoản test: **minhld** (vừa là thủ kho, vừa được ký QS, vừa duyệt), nhà máy **Phong Điền**.
Điện thoại mở `https://huyanhrubber.vn/m/kho/chen`, máy tính mở `https://huyanhrubber.vn/wms/chen`.
Mỗi bước có **Kỳ vọng** để so. Số liệu ví dụ: lô A 1.000 kg hàng lỗi, lô B 300 kg dính kim loại.

## 0. Chuẩn bị (5 phút)

| # | Việc | Kỳ vọng |
|---|---|---|
| 0.1 | Supabase → SQL Editor chạy `docs/migrations/wms_mix_p2_lay_truoc_anh.sql` (p1 đã chạy hôm nay) | kiểm chứng: `f_moi` có giá trị, `f_cu_phai_null` trống |
| 0.2 | Deploy bản `main` mới (commit 661bd627 trở lên), điện thoại F5 trang | /m/kho/chen có nền xanh đậm, tiêu đề "Hôm nay" |
| 0.3 | (Tùy chọn, để test "ca tự nhận") vào `/m/app` bấm **Vào ca** chọn Ca 1 | Trang Hôm nay báo "Đang trong ca Ca 1" |
| 0.4 | (Tùy chọn, để test sổ ca tự điền) tạo phiếu ca ép bành hôm nay đúng ca đó ở `/m/app/ca` hoặc màn Sổ ca trên máy tính, lưu nháp là đủ | có phiếu ca cho PD · hôm nay · Ca 1 |

## 1. Nhập lô chèn (máy tính, thủ kho)

| # | Việc | Kỳ vọng |
|---|---|---|
| 1.1 | `/wms/chen/ton` → **Nhập lô chèn**: Hàng lỗi · mô tả "Po thấp tổ Đen" · SVR 3L · **1.000** kg · Po 28 · trộn ≤ 10 % · tick *chạy lại* | bảng có lô `CH-PD-261030-01`, tồn 1.000, trạng thái Sẵn sàng |
| 1.2 | Nhập lô thứ hai: Dính kim loại · "DKL ca 2" · **300** kg · **không** tick *đã xử lý kim loại* | lô `CH-PD-261030-02` có chip đỏ *chưa xử lý KL* |
| 1.3 | Thẻ số trên cùng | Tại kho chèn **1.300**, Đang ở dây chuyền **0**, Lô còn hàng **2** |

## 2. Trang chính điện thoại

| # | Việc | Kỳ vọng |
|---|---|---|
| 2.1 | Mở `/m/kho/chen` | Thẻ to "Chưa lấy hàng chèn ca này", nút **Lấy đầu ca** sáng; mục Kho chèn: lô 01 **1.000 kg**, lô 02 **300 kg** chữ xám + dòng đỏ *chưa xử lý, chưa lấy được*; Chờ ký: *không có* |
| 2.2 | Thanh tab dưới | 3 tab Lô NVL · Nhập · Hàng chèn; tab Hàng chèn đang sáng |

## 3. Lấy đầu ca (3 bước)

| # | Việc | Kỳ vọng |
|---|---|---|
| 3.1 | Bấm **Lấy đầu ca** | Màn "Chọn lô chèn", vạch tiến độ bước 1 màu vàng; thanh tab dưới **ẩn** |
| 3.2 | Nhìn thẻ lô 02 | thẻ xám nét đứt, không bấm được, ghi *Chưa xử lý kim loại, chưa lấy được. Báo thủ kho* |
| 3.3 | Bấm **Quét tem trên lô** → không có camera thì gõ tay `CH-PD-261030-01` → OK | nhảy thẳng sang bước 2 với lô 01 (nếu gõ sai mã → dòng đỏ "Không tìm thấy lô chèn") |
| 3.4 | (Hoặc) quay lại, chạm thẻ lô 01 **Chọn lô này** | sang bước 2 "Cân và chụp", eyebrow ghi `lô CH-PD-261030-01` |
| 3.5 | Chưa gõ gì, nhìn nút **Tiếp tục** | mờ (chưa có kg, chưa có ảnh) |
| 3.6 | Gõ **5000** | ô viền đỏ, dòng "Lấy nhiều hơn tồn của lô", nút vẫn mờ |
| 3.7 | Sửa thành **600** | dòng xanh "Lô còn lại sau khi lấy **400 kg**" |
| 3.8 | Nhìn ô Ca | nếu đã Vào ca ở 0.3: "Ca 1 · 06:00–14:00 · *tự nhận theo chấm công của bạn*"; chưa vào ca: ca khớp giờ hiện tại · *tự nhận theo giờ hiện tại* |
| 3.9 | Bấm **Đổi ca** → chọn ca khác → bấm lại ca đúng | dòng dưới đổi thành *bạn chọn* |
| 3.10 | Tổ: bấm **Tổ Đen**; Dùng để: giữ **Chạy lại** | nút được chọn nền xanh đậm chữ trắng |
| 3.11 | Bấm **Khác…** gõ "Xanh" rồi bấm lại **Tổ Đen** | ô gõ tên tổ hiện rồi ẩn, Tổ Đen được chọn |
| 3.12 | Chụp ảnh ô **1 · Toàn cảnh đống hàng** (ảnh bất kỳ) | ô viền xanh, có ảnh, chữ "hh:mm · đã chụp", chip góc phải "1/2 đã chụp" |
| 3.13 | Chụp ô **2 · Màn hình cân** | chip "2/2 đã chụp", nút **Tiếp tục** sáng |
| 3.14 | Bấm **Thêm ảnh bổ sung** chụp 1 ảnh | nút ghi "… · đã có 1" |
| 3.15 | Bấm **Tiếp tục** | bước 3: số **600** to giữa thẻ, các dòng Lô / Ca · tổ (Ca 1 · Tổ Đen) / Dùng để (Chạy lại) / Ảnh lúc lấy 2 ảnh nhỏ + "2/2" |
| 3.16 | Bấm **Sửa lại** → về bước 2 (số và ảnh còn nguyên) → **Tiếp tục** | không mất dữ liệu |
| 3.17 | Gõ ghi chú "test mix" → bấm **Ghi lấy đầu ca · 600 kg** | màn nền xanh đậm: dấu tích, "Đã ghi lấy đầu ca", mã **PC-PD-261030-01** màu vàng, thẻ 600 kg · giờ · lô · Ca 1 · Tổ Đen · 3 ảnh |
| 3.18 | Bấm **Về trang chính** | thẻ to "Đang ở dây chuyền **600 kg**", chip xanh *2 ảnh lúc lấy*, nút **Trả cuối ca**; Kho chèn lô 01 **400 kg** kèm "+600 ở dây chuyền"; tiêu đề đầu trang "Ca 1 · Tổ Đen" |
| 3.19 | Máy tính `/wms/chen` → Làm mới | Phiếu đang mở: PC-…-01 · Lấy 600 · ảnh "lấy 3" xanh · trạng thái *Đã lấy · đang ở dây chuyền*; thẻ Đang ở dây chuyền **600** |
| 3.20 | Máy tính `/wms/chen/ton` | lô 01: Ở dây chuyền 600 (vàng), Tồn kho 400, trạng thái *Đang dùng dở*; sổ chuyển động có dòng *Lấy −600* |

## 4. Lấy thêm lô thứ hai (để test bàn giao và danh sách "cũng đang ở dây chuyền")

| # | Việc | Kỳ vọng |
|---|---|---|
| 4.1 | Trang chính → **Lấy thêm lô** → lô 01 → **200** kg → Tổ Đen → 2 ảnh → Ghi | mã **PC-PD-261030-02** |
| 4.2 | Về trang chính | thẻ to vẫn là phiếu 01 (600 kg); mục mới "Cũng đang ở dây chuyền · 1" có dòng PC-…-02 200 kg; lô 01 tồn **200 kg**, +800 ở dây chuyền |

## 5. Trả cuối ca một chạm (phiếu 01)

| # | Việc | Kỳ vọng |
|---|---|---|
| 5.1 | Trang chính bấm **Trả cuối ca** | màn "Trả cuối ca", eyebrow `PC-PD-261030-01 · Ca 1 · Tổ Đen`; dòng trên: Đã lấy đầu ca 600 kg · 3 ảnh |
| 5.2 | Nút dưới **Ghi trả và ký bên giao** | mờ (chưa có kg, chưa có ảnh) |
| 5.3 | Bấm **Dùng hết · 0 kg** | ô = 0, thẻ xanh "Tiêu hao ca này **600 kg**", thanh đầy 100 % |
| 5.4 | Bấm **Chưa dùng · 600 kg** | tiêu hao 0, thanh trống |
| 5.5 | Gõ **700** | dòng đỏ "Số trả phải từ 0 đến 600 kg", nút mờ |
| 5.6 | Gõ **150** | tiêu hao **450 kg**, thanh 75 %, chữ "Đã dùng 450 kg (75 %) · Trả 150 kg" |
| 5.7 | Chưa tick *Để 150 kg lại dây chuyền* | ô tick trống |
| 5.8 | Chụp **1 · Toàn cảnh phần trả** | chip "1/2 · thiếu 1", nút vẫn mờ |
| 5.9 | Chụp **2 · Màn hình cân** | chip "2/2 đã chụp", nút sáng, dòng dưới nút "Một chạm = ghi 150 kg trả + chữ ký 1/3 của bạn" |
| 5.10 | Bấm **Ghi trả và ký bên giao** | màn "Đã trả, bạn đã ký": 3 ô Lấy 600 · Trả 150 · Tiêu hao 450; "Còn 2 chữ ký nữa": ① Bên giao đã ký (tên bạn, giờ) ② QS đang chờ ③ Thủ kho |
| 5.11 | Bấm **Xem phiếu** | dòng thời gian: Lấy ✓ (2 ảnh nhỏ), Trả ✓ 150 kg (2 ảnh nhỏ), Bên giao ký ✓, QS **đang chờ** (vàng), Thủ kho chưa đến lượt; chip đầu trang **Chờ QS**; mục "Bước 2/3 · QS xác nhận" có nút **Xác nhận QS** (vì minhld được ký QS) |
| 5.12 | Chạm một ảnh nhỏ | ảnh mở to nền đen, dòng chú thích "Toàn cảnh · giờ"; chạm để đóng |
| 5.13 | Máy tính `/wms/chen` | phiếu 01: Trả 150 · Tiêu hao **450** · ảnh "trả 2" xanh · trạng thái *Bên giao đã ký*; thẻ **Chờ ký (kg) 450** |

## 6. Chờ ký: QS rồi thủ kho

| # | Việc | Kỳ vọng |
|---|---|---|
| 6.1 | Trang chính → mục Chờ ký "1 phiếu" → chạm | màn "Chờ bạn ký", số trên góc **1**; thẻ PC-…-01 chip **Bước 2/3 · QS**; 3 ô 600 / 150 / 450; 4 ảnh thu nhỏ (lấy toàn cảnh, lấy cân, trả toàn cảnh, trả cân) |
| 6.2 | Chạm ảnh "Trả · màn hình cân" | mở to, chú thích "Trả · màn hình cân · ngày giờ" |
| 6.3 | Bấm **Xác nhận QS** | dòng xanh "PC-…-01: đã ký"; thẻ đổi thành chip **Bước 3/3 · Thủ kho**, nút **Nhận · trừ kho chèn 450 kg** |
| 6.4 | Bấm **Nhận · trừ kho chèn 450 kg** | dòng xanh "thủ kho đã nhận, kho chèn trừ 450 kg"; danh sách còn trống "Không có phiếu chờ ký" |
| 6.5 | Về trang chính | thẻ to giờ là phiếu **02** (200 kg); mục "Đã nhận gần đây" có PC-…-01 **450 kg** xanh; Kho chèn lô 01 tồn **350 kg** (1.000 − 450 − 200 ở dây chuyền) |
| 6.6 | Máy tính `/wms/chen` | phiếu 01 *Thủ kho đã nhận*; thẻ **Tiêu hao hôm nay 450**; `/wms/chen/ton`: lô 01 Tiêu hao 450, Ở dây chuyền 200, Tồn 350; sổ chuyển động: Nhập +1.000, Lấy −600, Trả +150, Lấy −200 |
| 6.7 | Nếu đã làm 0.4: chạy SQL dưới | `xuat_kg_manual = 450`, note "Tự điền từ phiếu chèn"; `chen_tieu_hao_kg = 450` |

```sql
SELECT r.report_date, s.name AS ca, l.xuat_kg_manual, l.note
  FROM shift_production_lines l JOIN shift_production_reports r ON r.id = l.report_id
  JOIN shifts s ON s.id = r.shift_id JOIN materials m ON m.id = l.material_id
 WHERE m.code = 'CHEN' AND r.report_date = current_date;
SELECT ngay, chen_tieu_hao_kg, dat_tu_nvl_moi_kg FROM v_vong_tai_che WHERE ngay = current_date;
```

## 7. Bàn giao ca sau (phiếu 02)

| # | Việc | Kỳ vọng |
|---|---|---|
| 7.1 | Trang chính → **Trả cuối ca** (phiếu 02, 200 kg) → gõ **80** → **tick** "Để 80 kg lại dây chuyền cho ca sau" → 2 ảnh → **Ghi trả và ký bên giao** | tiêu hao 120; màn đã trả |
| 7.2 | Chờ ký → **Xác nhận QS** → **Nhận · trừ kho chèn 120 kg** | dòng xanh có thêm "· đã mở phiếu bàn giao cho ca sau" |
| 7.3 | Về trang chính | thẻ to là phiếu **PC-PD-261030-03** 80 kg, dòng mô tả có tên người tạo; lô 01: tồn 350, +80 ở dây chuyền, tiêu hao 570 |
| 7.4 | Mở phiếu 03 (Xem phiếu) | ghi chú "Bàn giao từ PC-PD-261030-02"; ca để trống (ca sau tự ghi khi trả) |

## 8. Hủy phiếu lấy nhầm

| # | Việc | Kỳ vọng |
|---|---|---|
| 8.1 | **Lấy thêm lô** → lô 01 → **100** kg → 2 ảnh → Ghi (PC-…-04) → về trang chính → mở phiếu 04 qua "Cũng đang ở dây chuyền" | màn Trả cuối ca của phiếu 04 |
| 8.2 | Kéo xuống cuối, bấm **Lấy nhầm? Hủy phiếu** → gõ lý do "test" → **Xác nhận hủy** | chuyển sang dòng thời gian, chip đỏ **Đã hủy**, ô đỏ "Đã hủy: test. Kg lấy đã trả về tồn kho chèn" |
| 8.3 | Trang chính | lô 01 tồn trở lại **350 kg**, dây chuyền 80 (chỉ còn phiếu 03) |

## 9. Trường hợp thiếu ảnh và sửa kg trả (đi đường máy tính)

| # | Việc | Kỳ vọng |
|---|---|---|
| 9.1 | Máy tính `/wms/chen` → **Lấy đầu ca** lô 01, 50 kg (PC-…-05), **không** chụp ảnh | phiếu tạo được, cột ảnh "lấy 0" đỏ |
| 9.2 | Điện thoại mở phiếu 05 (trang chính → Cũng đang ở dây chuyền) | màn Trả cuối ca có thêm ô đỏ "Lúc lấy còn thiếu 2 ảnh bắt buộc. Chụp bổ sung ở đây rồi mới ký được" với 2 ô chụp |
| 9.3 | Máy tính mở phiếu 05 → **Ghi trả cuối ca** 20 kg (không ký) | trạng thái *Đã trả · chờ ký* |
| 9.4 | Điện thoại F5 phiếu 05 | dòng thời gian, chip **Chờ bên giao ký**; mục "Bước 1/3 · bên giao ký" báo thiếu ảnh lúc lấy (2) và lúc trả (2), có 4 ô chụp; nút **Ký bên giao** mờ |
| 9.5 | Bấm **Sửa kg trả** → gõ 25 → **Lưu** | dòng xanh "Đã sửa kg trả", số Trả đổi thành 25, Tiêu hao 25 |
| 9.6 | Chụp đủ 4 ảnh → **Ký bên giao** | chip đổi **Chờ QS** |
| 9.7 | `/m/kho/chen/ky` thẻ phiếu 05 → **Xác nhận QS** → **Nhận** | xong, trang chính "Đã nhận gần đây" có 05 |

## 10. Lô dính kim loại sau khi xử lý

| # | Việc | Kỳ vọng |
|---|---|---|
| 10.1 | Máy tính (chưa có nút trên giao diện, dùng SQL BGĐ): `UPDATE mix_lots SET metal_cleared = true WHERE code = 'CH-PD-261030-02';` | — |
| 10.2 | Điện thoại → Lấy đầu ca | lô 02 giờ là thẻ trắng bấm được, chip đỏ "Dính kim loại" vẫn còn để biết nguồn |

## 11. Dọn sau test (SQL, BGĐ)

```sql
DELETE FROM raw_photos WHERE ref_type LIKE 'mix_%';
DELETE FROM mix_issues;
DELETE FROM mix_lots;
SELECT fn_mix_don_anh_mo_coi();   -- 0 vì đã xóa hết ở trên
```

Ảnh trong bucket `raw-photos` vẫn còn trên Storage, không ảnh hưởng gì; xóa tay trong Supabase → Storage nếu muốn.

## 12. Khép vòng (sau SQL `wms_khep_vong_p1.sql`, 30/10)

| # | Việc | Kỳ vọng |
|---|---|---|
| 12.1 | Sổ ca ép bành (máy tính) → tạo phiếu ca hôm nay, Ca 1, ô **Lệnh sản xuất** chọn 1 lệnh đang mở → lưu nháp | phiếu ca lưu được, mở lại vẫn thấy lệnh SX |
| 12.2 | Điện thoại → Hàng chèn → Kho chèn → **Nhập lô chèn** → chọn **Hàng chuẩn** → chạm một chủng loại còn trong kho TP → gõ 70 kg | máy báo "= 2 bành × 35 kg = 70 kg"; ca tự nhận; bấm chuyển |
| 12.3 | Kỳ vọng sau 12.2 | kho chèn có lô `std` 70 kg; phiếu ca nháp của ca đó có dòng chủng loại ấy **xuất 2 bành**, note "Chuyển 2 bành sang kho chèn"; nếu phiếu ca chưa mở → báo "Tổ chưa mở phiếu ca của ca này" |
| 12.4 | Nhập lô chèn → **Hàng lỗi** → tab "Từ sổ ca" | liệt kê dòng LOI của các phiếu ca đã ký 3 bước, kg chưa chuyển; chạm → kg mặc định = phần chưa chuyển → chuyển; chạm lại dòng đó lần nữa phải thấy "đã chuyển" giảm phần còn lại |
| 12.5 | Nhập lô chèn → Hàng lỗi → tab "Từ sổ QC" | dòng sổ QC hàng không đạt; chạm, gõ kg, chuyển → dòng đó chuyển sang chip "đã chuyển CH-…" |
| 12.6 | Phiếu bàn giao (bước 7 ở trên) → **Trả cuối ca** | có thêm thẻ "Ca nhận bàn giao · bắt buộc" tự nhận theo chấm công; chưa chọn ca thì nút trả mờ |
| 12.7 | Kho chèn → lô bất kỳ → **Kiểm kê lô này** → gõ số lệch 20 kg | bắt chọn lý do; ghi xong sổ chuyển động có dòng "Kiểm kê" đỏ, tồn lô = số cân thực |
| 12.8 | Kiểm kê NVL (điện thoại hoặc máy tính) khi còn phiếu cân sẵn sàng chưa nhập | báo "Còn N phiếu cân sẵn sàng chưa nhập kho", có nút "Vẫn tạo" |
| 12.9 | Máy tính → Kho NVL mủ → tab **Cân đối & hao hụt** | bảng "Cân đối NVL khô → thành phẩm theo ngày" có số NVL xuất SX, chèn tiêu hao, TP đạt, LOI/DKL, hao hụt, hiệu suất % |
| 12.10 | Máy tính → Lệnh sản xuất có dòng NVL từ lệnh xuất → **Bắt đầu sản xuất** | không còn báo "không đủ NVL"; lệnh sang Đang sản xuất |
| 12.11 | Thử sửa tay một lô NVL ở trang vật tư cũ `/wms/vat-tu` (xuất kho / kiểm kho) | báo "Lô NVL chỉ sửa được qua sổ kho" |

## 13. Mã nguyên liệu (GĐ6) và lô thành phẩm (GĐ7) — sau SQL `wms_nvl_p6_ma_nguyen_lieu.sql` rồi `wms_tp_p1_lo_thanh_pham.sql`

| # | Việc | Kỳ vọng |
|---|---|---|
| 13.1 | Chạy p6 → đọc 5 dòng kiểm chứng đầu | `TMHG-40 / TMHG / 40 / 1`, `TMMN-25 / 25 / 08`, `LASI-31`, `TMHG-31` (bí danh), `SBR-1502`; `lo_xe_da_gan_ma` = số lô NVL cũ đã tự gán mã từ phiếu cân |
| 13.2 | Điện thoại **Nhập** (/m/kho/nhap) | mỗi phiếu có ô "Mã nguyên liệu" xanh (đọc từ phiếu, ví dụ TMHG-40 · xe 1) hoặc đỏ "Chưa có mã · phải chọn" |
| 13.3 | Phiếu không mã → **Chọn mã** → chạm mã đang mở, hoặc chọn nguồn TMHG + số 41 → **Dùng** | ô chuyển xanh, nút thành "Nhận vào mã TMHG-41"; bấm nhận → thông báo "Mã TMHG-41: nhập 1 lô xe, … kg khô" |
| 13.4 | Thử bấm nhận khi chưa chọn mã | báo "chưa có mã nguyên liệu" và tự mở bảng chọn |
| 13.5 | Tab **Lô NVL** | thẻ theo mã: TMHG-41 · loại · số xe · tồn ướt/khô · chip Sẵn sàng; chạm "n xe ›" thấy từng lô xe; chạm xe → cân lại như cũ; lô xe cũ không mã nằm mục "chưa gán mã" với nút gán |
| 13.6 | Thẻ mã → **Xuất cả mã ›** → gõ tổng kg (hoặc "Lấy hết mã") → **Xuất mã … · ký giao** | thông báo mã, số xe, kg; bên dưới lệnh hiện "Bên giao đã ký · chờ QS" với nút QS xác nhận → Thủ kho nhận; máy tính /wms/nvl/xuat/:id thấy kg cân đã chia về từng xe |
| 13.7 | Máy tính /wms/nvl/xuat/new | thẻ "Xuất cả một mã nguyên liệu" ở trên: chọn mã, tổng kg, "Tạo lệnh theo mã" |
| 13.8 | Máy tính sổ ca ép bành | ô "Mã nguyên liệu đang chạy" bên cạnh lệnh SX |
| 13.9 | Chạy tp_p1 → kiểm chứng cuối: bảng chủng loại với `weight_per_unit` | chủng loại nào trống cỡ bành thì BGĐ cập nhật danh mục, nếu không tổ ép không ghi lô được (báo THIEU_CO_BANH) |
| 13.10 | Điện thoại **Thành phẩm** (/m/kho/tp) → **Thêm lô vừa ép xong** → chủng loại SVR10 STD → số lô S2401AB → 40 bành → ca tự nhận → tổ → mã NVL đang chạy → Nhập kho TP | thông báo "40 bành (1.400 kg) đã vào kho TP, phiếu ca đã cộng"; sổ ca (máy tính) ca đó có dòng SVR10 STD nhập 40 bành, note "Từ lô TP" |
| 13.11 | Thêm lô thứ hai cùng chủng loại | ô số lô tự gợi ý S2402AB |
| 13.12 | Chạm lô → **Ghi kết quả** QC: Chờ xử lý, Po 26–28, lý do "Po thấp" → Lưu | chip đổi "Chờ xử lý"; máy tính Sổ hàng không đạt có dòng mới với mã NVL tự điền |
| 13.13 | Cùng lô → **Chuyển 40 bành vào kho chèn** | kho chèn có lô CH-… nguồn hàng lỗi, mô tả "Lô TP S2401AB"; lô TP còn 0, trạng thái hết; sổ QC cột xử lý ghi "Đã chuyển kho chèn" |
| 13.14 | Hàng chèn → Nhập lô chèn → Hàng lỗi → tab **Lô TP lỗi** | liệt kê lô CXL/Loại còn tồn, chạm → số bành → chuyển |
| 13.15 | Lô đạt → **Xuất 10 bành** (thủ kho) | lô còn 30; tab Thành phẩm phần "đạt · chờ xuất" giảm 10 |
| 13.16 | Mục "Tồn theo chủng loại (theo lô)" | đạt / chưa kiểm / lỗi đúng bằng các lô vừa làm; SQL `SELECT * FROM v_fg_doi_chieu_so_ca` so lệch với sổ ca (lệch do sổ ca xuất bành chưa gắn lô — chấp nhận trong giai đoạn song song) |

## 14. Phiếu chèn theo sổ tay tổ ép: cân cả pallet + mã gốc (sau SQL `wms_mix_p4_ma_goc.sql`, 30/10)

Sổ tay thực tế có **2 bảng**: *"Ca Vàng chèn vào KHMN-15 + 17 · L1: 5 bành 1502 · hàng+pallet 191,5 · pallet 15 · hàng chèn 176,5 kg"* (chèn máy Mix) và *"Chèn Bể: L1 9 bành DKL 341,5 … L7 12 bành mix 446 · pallet 147 · hàng chèn 2.404 kg ⇒ Mix 36 b, DKL 33 b"*. Mỗi dòng L1…L7 = một phiếu chèn; một ca chèn nhiều lần = nhiều phiếu; bì pallet mặc định 15 kg, sửa được từng phiếu (bảng Chèn Bể ghi 147 kg cho 7 pallet ⇒ gõ 21 mỗi phiếu, hoặc bấm "Gõ thẳng kg").

| # | Việc | Kỳ vọng |
|---|---|---|
| 14.1 | Chạy SQL → 2 dòng kiểm chứng | `f_lay_v3`, `f_tra_v3`, `v_chen` khác null; `phieu_co_ma_goc` = số phiếu cũ đã gán mã từ phiếu ca; bảng 2 (mã có chèn) có thể trống nếu chưa có phiếu nào nhận |
| 14.2 | Điện thoại Chèn → **Lấy đầu ca** → chọn lô 1502 → màn Cân | thẻ đầu **"Chèn vào đâu?"** 2 nút *Chèn bể Slap* / *Chèn máy Mix* (bắt buộc, máy nhớ lần trước); mặc định **"Cân cả pallet, như sổ tay"**: ô Số bành · Bì pallet (nhớ lần trước, mặc định 15) · ô to "Hàng + pallet"; gõ 5 / 15 / 191,5 → dòng xanh "Hàng chèn = 191,5 − bì 15 → **176,5 kg**" |
| 14.3 | Bấm "Gõ thẳng kg" | về ô kg như cũ; máy nhớ cách cân cho lần sau |
| 14.4 | Thẻ **"Chèn vào mã nguyên liệu nào?"** | nếu ca này đã có phiếu ca ghi mã → mã tự sáng + chip "theo phiếu ca"; nếu không, kho chỉ có 1 mã đang chạy → tự chọn, chip "mã đang chạy"; còn lại tổ chạm mã (chọn **nhiều** mã được, ví dụ KHMN-15 + KHMN-17 → chữ "kg chia đều cho mỗi mã") |
| 14.5 | Tiếp tục → Xem lại | dòng "Cân: 5 bành · cả pallet 191,5 − bì 15 kg", "Chèn vào mã: KHMN-15 + KHMN-17", số to 176,5 kg; Ghi → màn đã ghi nêu mã + số bành |
| 14.6 | Máy tính /wms/chen | cột **Chèn vào** (Bể Slap xanh ngọc / Máy Mix tím + mã gốc geekblue + số bành); modal Lấy đầu ca bắt chọn "Chèn vào đâu", chọn nhiều mã + Số bành / Hàng + pallet / Bì pallet / Kg hàng chèn (tự tính) |
| 14.7 | Trả cuối ca (điện thoại) | cũng "Cân phần còn lại cả pallet": Số bành còn · Bì · Hàng + pallet → Trả = cân − bì; nút "Dùng hết · 0 kg" vẫn một chạm |
| 14.8 | Phiếu (dòng thời gian) → dòng "Chèn Bể Slap · Chèn vào mã: …" → **Đổi mã** | đổi bể Slap/máy Mix, chọn lại 1 hay nhiều mã → Lưu; bỏ hết = máy lấy theo phiếu ca lúc thủ kho nhận; sau khi thủ kho đã nhận thì không còn nút Đổi |
| 14.9 | Ký đủ 3 bước → tab **Lô NVL** → thẻ mã KHMN-15 | dòng vàng "Chèn vào mã: 176,5 kg · 5 bành · 1 phiếu · x % hàng vào máy" + dòng tách *bể Slap / máy Mix* rồi theo loại (lỗi/DKL/chuẩn); mở thẻ thấy từng lô chèn, phiếu chèn chung 2 mã ghi "chèn chung mã khác" (kg đã chia đôi) |
| 14.10 | SQL `SELECT ma, chen_kg, chen_be_kg, chen_mix_kg, so_banh_chen, chi_tiet FROM v_raw_lot_chen WHERE chen_kg > 0` | khớp số trên điện thoại; `v_raw_lot_yield.chen_tieu_hao_kg` cùng số |

## Lỗi hay gặp

| Màn hình báo | Nguyên nhân | Làm gì |
|---|---|---|
| "Could not find the function … fn_mix_lay" hoặc nút Ghi báo lỗi tham số | chưa chạy `wms_mix_p2_lay_truoc_anh.sql` | chạy SQL rồi F5 |
| "Tải ảnh lên thất bại" | bucket `raw-photos` chưa có (chạy lại `wms_mix_p1_hang_chen.sql`) hoặc mất mạng | kiểm tra Storage có bucket raw-photos |
| Nút Ký bên giao / Xác nhận QS mờ dù đủ ảnh | tài khoản không có quyền bước đó | QS: phòng HAP-QC hoặc `raw_qc_signers`; thủ kho: `raw_store_keepers` |
| Ca hiện "Chưa chọn ca" | giờ hiện tại không rơi vào ca sản xuất nào và chưa chấm công | bấm Đổi ca chọn tay |
| Sổ ca không có dòng CHÈN | ca đó chưa có phiếu ca ép bành | tạo phiếu ca trước rồi thủ kho nhận lại phiếu chèn khác, hoặc chấp nhận đọc số từ /wms/chen |
