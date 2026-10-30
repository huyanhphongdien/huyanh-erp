# Hàng chèn — đề xuất đơn giản hoá "lô hàng chèn" (30/10/2026 tối)

Chủ DN: *"tôi thấy lô hàng chèn phức tạp hơn vấn đề, nghiên cứu lại"*. Dưới đây là đối chiếu sổ tay tổ ép với màn hình hiện tại và 3 phương án.

## 1. Sổ tay thực tế ghi gì

Mỗi lần chèn một dòng: **số bành · nguồn (1502 = SBR lô 1502 / STD / DKL / "có bàn giao") · hàng + pallet · pallet · hàng chèn**, gom theo **ca** và theo **mã / lệnh** (KHMN-15 + 17, TMHG-39), chia **bể Slap / máy Mix**. Không có khái niệm "lô chèn" với tồn kho, không nhập kho chèn trước, không mã lô CH-…, không Po / Mooney / PRI, không "xử lý kim loại" tách bước. Số lô chỉ là chữ ghi trên bao.

## 2. Màn hình hiện tại bắt làm gì (3 lớp)

| Lớp | Bắt buộc | Có trong sổ tay? |
|---|---|---|
| **Kho chèn · Nhập lô chèn** (nguồn, số lô, kg, QC Po/Mooney/PRI, cho phép trộn %, DKL phải "xử lý kim loại" rồi mới lấy, kiểm kê, hủy lô) | có — không nhập lô thì không lấy được | **không** |
| **Phiếu chèn** (chọn lô → cân 1 → vị trí → lệnh → ảnh → trả cân 2/3 → ảnh) | có | có (chính là dòng sổ tay) |
| **Ký 3 bước**, gom theo ca / lệnh, tổng kết + mail | có | có (ký) |

Phức tạp nằm ở lớp 1: tổ phải "nhập kho chèn" trước rồi mới "lấy" — hai thao tác cho một việc, kèm 8 ô QC không ai điền, và tồn lô chèn phải khớp (VUOT_TON) trong khi thực tế hàng chèn thường lấy thẳng từ kho TP hoặc bao SBR.

## 3. Ba phương án

| | A · Giữ 3 lớp (hiện tại) | **B · 2 lớp, "lô chèn ngầm" (đề xuất)** | C · 1 lớp, bỏ hẳn kho chèn |
|---|---|---|---|
| Thao tác lấy | nhập lô → chọn lô → cân | **chọn nguồn + gõ số lô trên bao → cân** (một màn) | chọn nguồn + số lô → cân |
| Kho chèn | bắt buộc, tồn theo lô CH-… | **tuỳ chọn**: sổ tổng hợp theo số lô (nhập = tự ghi lúc lấy, tiêu hao, trả); SBR mua ngoài nhập trước nếu muốn theo dõi tồn | không có; chỉ còn tổng tiêu hao theo nguồn |
| Hàng chuẩn / lỗi từ kho TP | chuyển vào kho chèn rồi lấy | **chọn lô TP ngay lúc lấy**, thủ kho nhận → trừ bành lô TP | như B |
| DKL | phải bấm "đã xử lý kim loại" ở lô | ô tick "đã rà kim loại" trên phiếu (bắt buộc với DKL) | như B |
| QC Po/Mooney/PRI, % trộn | 8 ô trên lô | bỏ (ghi chú tuỳ chọn) | bỏ |
| Chặn vượt tồn | mọi nguồn | chỉ hàng từ kho TP (có tồn thật); SBR / khác: cảnh báo, không chặn | không |
| Kiểm kê kho chèn | mọi lô | chỉ SBR mua ngoài | không |
| Đổi DB | — | **không**: mix_lots giữ nguyên, máy tự tạo lô theo (nguồn + số lô); p1 → p14 vẫn dùng | bỏ mix_lots, viết lại 11 hàm + 6 view |
| Công sức | — | ~1 ngày: màn Lấy (điện thoại + máy tính), hàm fn_mix_lay thêm "tạo lô nếu chưa có", Kho chèn thành sổ tổng hợp | ~3 ngày, mất lịch sử lô |

## 4. Màn Lấy lần n theo phương án B

1. Ca (tự nhận) · Chèn vào đâu (bể Slap / máy Mix) · Chèn vào lệnh (chip).
2. **Nguồn**: 4 nút *Hàng chuẩn (kho TP)* · *Hàng lỗi (kho TP)* · *DKL* · *SBR / mua ngoài*. Chọn kho TP → danh sách lô TP còn tồn, chạm lô = số lô tự điền. SBR → gõ số lô trên bao (gợi ý 5 số lô dùng gần nhất, ví dụ 1502).
3. Số bành (ước theo cân, chỉnh − +), cân 1 cả pallet, 2 ảnh → Ghi. Máy tự tạo "lô chèn" (nguồn + số lô) nếu chưa có, cộng kg nhập = kg lấy.
4. Trả cuối ca, ký 3 bước, tổng kết lệnh: giữ như hiện nay.

Kho chèn (tab) trở thành **sổ theo số lô**: 1502 · nhập 2.000 · tiêu hao 1.300 · ở dây chuyền 200 · tồn 500, cộng nút "Nhập trước" cho SBR về kho và "Kiểm kê" — không còn là cửa ải trước khi lấy.

## 5. Khuyến nghị

Chọn **B**. Đúng sổ tay (một dòng = một lần chèn với nguồn + số lô), không đập CSDL đã chạy, vẫn truy được tiêu hao theo nguồn / số lô / lệnh / ca, và tồn SBR mua ngoài vẫn theo dõi được cho ai cần. Cần anh chốt: (1) chọn B; (2) DKL có bắt tick "đã rà kim loại" không; (3) SBR mua ngoài có cần tồn (nhập trước) hay chỉ ghi tiêu hao.
