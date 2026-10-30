# Audit quy trình kho NVL → hàng chèn → thành phẩm — lần 2, tối 30/10/2026

Phạm vi: toàn bộ thay đổi trong ngày (GĐ6 mã nguyên liệu, GĐ7 lô TP, hàng chèn p4 → p11, sổ mã đang chạy p10, phân công p7). Cách làm: đọc lại từng hàm SQL theo vòng đời phiếu chèn (lấy → trả → ký 3 bước → nhận), đối chiếu với màn hình điện thoại và máy tính, chạy thử trên bản local.

## 1. Những chỗ đã kiểm và đúng

| Bước | Kiểm gì | Kết quả |
|---|---|---|
| Lấy (cân 1) | kg lấy tạm = cân tổng, số bành ước theo cân − 15, tồn dây chuyền của lô + cân tổng | đúng, có ghi "cả pallet, bì trừ lúc trả" |
| Trả (cân 2, cân 3) | hàng trả = cân 2 − cân 3; kg lấy = cân 1 − cân 3; tiêu hao = kg lấy − hàng trả; dùng hết → bỏ cân 2 | đúng; cân 2 < cân 3 bị chặn; bì ≥ cân 1 bị chặn |
| Tồn dây chuyền | lấy cộng cân tổng, trả điều chỉnh về kg lấy thật, nhận trừ đúng kg lấy thật, hủy trừ kg lấy | khớp, không lệch |
| Ảnh | 2 ảnh lúc lấy + 2 ảnh lúc trả, kể cả dùng hết | đúng theo quyết định #33 |
| Ký 3 bước | QS (khai_bao) → QC (duyet_qc) → thủ kho (nhan_kho); ký cả ca; bước chưa phân công dùng luật cũ | đúng |
| Mã gốc | tay → phiếu ca → sổ mã đang chạy; chèn chung nhiều mã chia đều kg khi gom | đúng |
| Sổ mã đang chạy | phiếu ca mới, phiếu chèn, lô TP tự gắn; hai mã chạy chung thì phiếu ca không tự điền | đúng |
| Số lô | bắt buộc khi nhập lô chèn; lô cũ gõ lúc lấy hoặc gán ở Kho chèn | đúng |
| Sổ ca dòng CHÈN | Σ tiêu hao các phiếu đã nhận cùng ca, kể cả phiếu bàn giao (ca ghi lúc trả) | đúng |
| Tổng kết theo mã (máy tính) | lũy kế theo thời gian, dòng tổng | đúng sau khi sửa lệch cột (c77efa6c) |

## 2. Lỗi tìm thấy và đã sửa (nằm trong `wms_mix_p11_bi_chi_luc_tra.sql`, chưa chạy)

| # | Lỗi | Hậu quả nếu không sửa | Sửa |
|---|---|---|---|
| A1 | **Sửa cân lúc lấy** sau khi đã trả: hàm tính kg lấy = cân tổng mới − 0 vì không còn ô bì | kg lấy và tiêu hao đội lên đúng bằng bì pallet | hàm lấy bì đã khai lúc trả (`return_pallet_kg`) |
| A2 | **Kiểm kê kho chèn** chỉ cho người ở bước QS khai báo | thủ kho (bước 3) không kiểm kê được kho chèn | cho cả `nhan_kho` |
| A3 | **% chèn so với hàng vào máy** hiện 100 % khi mã chưa xuất NVL (TMHG-40 hôm nay) | đọc nhầm là chèn toàn bộ | chỉ tính khi mã đã xuất NVL, chưa thì để trống |
| A4 | Dòng tổng bảng theo mã lệch một cột | 53 rơi vào cột tiêu hao | đã sửa trên app (c77efa6c) |

## 3. Chỗ cần anh quyết định

| # | Vấn đề | Đề xuất |
|---|---|---|
| B1 | **Phiếu bàn giao ca sau** (phần dư để lại dây chuyền) không có ảnh lúc lấy vì máy tự mở; QS ca sau phải chụp bổ sung mới ký được | giữ (ca sau chụp pallet lúc bắt đầu ca), hoặc miễn ảnh lấy cho phiếu bàn giao |
| B2 | **Mã đang chạy không ai Kết thúc** → mọi ca sau vẫn gắn mã cũ | ✅ ĐÃ LÀM (p12, 30/10 tối): Bắt đầu mã mới mặc định **thay thế**, hộp xác nhận có "chạy chung"; thêm nút **Kết thúc mã** → tổng kết chèn + mail BGĐ |
| B3 | **"Đã lấy" trên trang chính** gộp cân tổng của phiếu chưa trả với kg lấy thật của phiếu đã trả | ghi rõ "cả pallet tới khi trả" (đã làm ở dòng L), chấp nhận lệch tạm vài kg/pallet |
| B4 | **Số bành lúc lấy** là ước tính; lúc trả máy không tính lại vì không biết tổ đã chỉnh tay hay chưa | ✅ ĐÃ LÀM (p12): cờ `so_banh_tay`, lúc trả tính lại theo kg lấy thật nếu tổ không chỉnh |
| B5 | **Phân công (mix_signers)** chỉ chức vụ level ≤ 3 thêm/thu được. Nếu tài khoản anh là "Phó phòng" level 4 thì màn Phân công chỉ xem, không thêm được QS | kiểm tra bằng SQL bên dưới; nếu level > 3 thì cho thêm người ở bước `nhan_kho` quyền phân công |
| B6 | **Máy tính, màn trả** vẫn kiểu 2 ô (dùng hết / cân pallet rỗng, hàng + pallet, bì), chưa đổi theo 3 lần cân như điện thoại | ✅ ĐÃ LÀM (30/10 tối): cân 1 (khóa) · cân 2 + "Dùng hết · bỏ cân 2" · cân 3 pallet rỗng |
| B7 | **Vercel** 100 build/ngày, 4 project cùng repo | đặt Ignored Build Step cho 4 project (bảng lệnh ở hướng dẫn 30/10); gom nhiều sửa vào một lần đẩy |

Kiểm tra level của anh:

```sql
SELECT e.full_name, p.name AS chuc_vu, p.level FROM employees e JOIN positions p ON p.id = e.position_id WHERE e.email = 'huyanhphongdien@gmail.com';
```

## 4. Việc vận hành còn treo

1. Chạy `docs/migrations/wms_mix_p11_bi_chi_luc_tra.sql` rồi `wms_nvl_p12_ket_thuc_ma.sql` (sau p8 → p9 → p10 đã chạy).
2. Vercel mở hạn mức → Create Deployment nhánh main (hiện production còn ở 9df49751, thiếu 16 commit hôm nay). Trong lúc chờ dùng bản local `npx vite --host`.
3. Thêm tên QS vào bước 1 ở màn Phân công; thủ kho thật vào bước 3 rồi thu anh ra.
4. Gán các lô xe cũ vào TMHG-40 (tab Lô NVL) để % chèn và hiệu suất có số.
5. Test lại theo mục 14–22 của `docs/HANG_CHEN_TEST_TU_DAU_TOI_CUOI.md` (mục 14 và 21 vừa cập nhật theo 3 lần cân).
6. Còn mở từ trước: báo cáo tổng hợp chèn theo ca / loại / sản phẩm (pivot), quy ước số lô S2308AB.
