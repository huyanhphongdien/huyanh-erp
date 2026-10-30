# Kho nguyên liệu mủ — Test 1 lượt (Phong Điền, tài khoản minhld)

Cập nhật 30/10/2026 · sau khi code xong GĐ0 → GĐ5. Làm đúng thứ tự, mỗi bước có **kỳ vọng** để so.

## 0. Chạy SQL (Supabase → SQL Editor), đúng thứ tự

| # | File | Kiểm chứng cuối file phải ra |
|---|---|---|
| 1 | `docs/migrations/wms_nvl_p3_kiem_ke_can_doi.sql` (nếu chưa chạy) | bảng raw_stocktakes, hàm fn_nvl_ky_kiem_ke có mặt; minhld nằm trong raw_adjust_approvers |
| 2 | `docs/migrations/wms_mix_p1_hang_chen.sql` | t1 t2 t3 ≠ null, `bucket = 1`, `vi_du = CH-PD-261030-01`, và danh sách ca (shifts) |
| 3 | `docs/migrations/wms_nvl_p5_doi_chieu.sql` | t, v, f1, f2 ≠ null; bảng tồn đến ngày của PD |

Mỗi file đã có `NOTIFY pgrst, 'reload schema'`. Nếu màn hình vẫn báo *"Could not find the table … in the schema cache"* → đợi 10 giây rồi F5.

## 1. Chuẩn bị số (desktop)

1. **/wms/nvl/ton-dau** — nếu kho đã trống: thêm dòng `RSS 3 · 10.000 kg · DRC 58` và `SVR 10 · 5.000 kg · DRC 100` → **Ghi vào sổ**.
   Kỳ vọng: /wms/nvl tồn khô **10.800 kg**, 2 lô.
2. **/wms/chen/ton** → *Nhập lô chèn*:
   - Hàng lỗi · "Po thấp tổ Đen" · SVR 3L · **1.000 kg** · Po 28 · trộn ≤ 10 %
   - Dính kim loại · "DKL ca 2" · **300 kg** · **không** tick *đã xử lý kim loại*
   Kỳ vọng: Tại kho chèn **1.300 kg**, 2 lô, lô DKL có chip đỏ *chưa xử lý KL*.

## 2. Nhập kho từ phiếu cân (desktop /wms/nvl/nhap)

3. Chọn 1 phiếu cân PD sau ngày 29/10 đang *chờ DRC* → ô DRC gõ 60 → **Ghi DRC** → phiếu chuyển *sẵn sàng* → **Nhận vào kho**.
   Kỳ vọng: lô mới xuất hiện ở /wms/nvl, sổ lô có dòng *Nhập*, tồn khô tăng đúng kg × DRC.
4. Bấm nhận lại cùng phiếu → báo *"Phiếu đã nhập kho rồi"*.

## 3. Cân lại (desktop rồi mobile)

5. **/wms/nvl/can-lai** → lô RSS 3 → ướt **9.900** (DRC để trống) → *trong ngưỡng* (lệch khô −1 %? không: khô = 9.900 × 58 % = 5.742, lệch −1,0 % → **vượt 0,5 %** → phải chọn lý do) → chọn *Tạp chất* → Ghi.
   Kỳ vọng: sổ lô có dòng *Cân lại* −100 ướt / −58 khô kèm lý do; bảng *Lô lệch khô quá ngưỡng* có 1 dòng.
6. Điện thoại: **/m/kho** → chạm lô SVR 10 → *Cân lại lô này* → ướt 5.000, DRC 100 → *Ghi vào sổ* → kỳ vọng "khô 5.000 → 5.000 (0 %)", chip *đo cách 0 ng*.

## 4. Xuất sản xuất (desktop /wms/nvl/xuat)

7. *Tạo lệnh* → nhu cầu khô 2.000 kg, loại RSS 3 → gợi ý FIFO tick lô RSS 3 → tạo.
8. Mở lệnh → kg cân **3.500** → **Lưu** → ký *Gửi* → *QS xác nhận* → *Thủ kho nhận*.
   Kỳ vọng: lô RSS 3 giảm 3.500 ướt / 2.030 khô; /wms/nvl/can-doi tháng 10 có *xuất SX* 2.030.

## 5. Hàng chèn — vòng đầy đủ trên ĐIỆN THOẠI (/m/kho/chen)

9. **Lấy đầu ca**: lô `CH-PD-…-01`, **600 kg**, chọn ca, tổ "Tổ Đen", *Chạy lại* → *Ghi lấy* → tự sang trang phiếu `PC-PD-…-01`.
   Thử chọn lô DKL → dòng bị mờ (không lấy được).
   Kỳ vọng: tab Hàng chèn: *đang ở dây chuyền 600*, *tại kho 700*.
10. Trang phiếu: chụp **ảnh 1 toàn cảnh** + **ảnh 2 màn hình cân** (ô 3 bỏ qua). Mục *3 · Ký* chưa có nút (chưa trả).
11. **Trả cuối ca**: kg trả **150** → *Ghi trả* → tiêu hao **450** → chụp 2 ảnh trả.
    Thử bấm *Bên giao ký* trước khi chụp ảnh trả → nút mờ + dòng đỏ *thiếu ảnh lúc trả · toàn cảnh*.
12. Ký đủ: *Bên giao ký* → *QS xác nhận* → *Thủ kho nhận*.
    Kỳ vọng: tại kho **850**, dây chuyền **0**, lô trở lại *Sẵn sàng*; desktop /wms/chen *Tiêu hao hôm nay 450*; /wms/chen/ton sổ chuyển động có 3 dòng (lấy −600, trả +150, …).
13. **Bàn giao ca sau**: lấy **200** → trả **80**, tick *bàn giao ca sau* → chụp ảnh → ký đủ.
    Kỳ vọng: tiêu hao 120; tự mở phiếu mới `PC-…-03` 80 kg (ở dây chuyền 80, tại kho 730); phiếu mới ghi *"Bàn giao từ PC-…-02"*.
14. **Hủy**: lấy 100 → *Hủy phiếu* (lý do "test") → tồn trả về (tại kho 730, dây chuyền 80).
15. **Sổ ca tự điền** (chỉ khi ca đó đã có phiếu ca ép bành cùng nhà máy/ngày/ca): chạy
    ```sql
    SELECT r.report_date, s.name AS ca, m.code, l.xuat_kg_manual, l.note
      FROM shift_production_lines l JOIN shift_production_reports r ON r.id = l.report_id
      JOIN shifts s ON s.id = r.shift_id JOIN materials m ON m.id = l.material_id
     WHERE m.code = 'CHEN' AND r.report_date = current_date;
    SELECT ngay, chen_tieu_hao_kg, dat_tu_nvl_moi_kg FROM v_vong_tai_che WHERE ngay = current_date;
    ```
    Kỳ vọng: `xuat_kg_manual = 570` (450 + 120), note *Tự điền từ phiếu chèn*; `chen_tieu_hao_kg = 570`.

## 6. Đối chiếu giấy – máy (desktop /wms/nvl/doi-chieu)

16. Ngày hôm nay: cột *Giấy · ướt* gõ RSS 3 = số máy − 20 kg, SVR 10 = số máy → **Lưu tất cả**.
    Kỳ vọng: RSS 3 lệch −20 kg, % nhỏ hơn 0,5 → xanh; SVR 10 lệch 0.
17. Sửa RSS 3 giấy = số máy − 500 → lệch > 0,5 % → ô lý do viền đỏ, bắt chọn → *Lô chưa cân lại* → Lưu → lịch sử có dòng *vượt 0,5 %*.
18. *CSV 60 ngày* tải được file.

## 7. Kiểm kê + khóa kỳ — LÀM CUỐI CÙNG (desktop /wms/nvl/kiem-ke)

19. *Tạo kiểm kê* ngày hôm nay → đếm từng lô (lô SVR 10 gõ 4.950) → *Hoàn tất đếm* → *Duyệt*.
    Kỳ vọng: sổ lô SVR 10 có dòng *Kiểm kê* −50 ướt; raw_settings PD `ngay_khoa_so = hôm nay`.
20. Thử cân lại bất kỳ lô nào → báo *"Kỳ đã khóa sổ"*. (Phiếu chèn KHÔNG bị khóa — kho chèn không ghi vào sổ kho khô.)
21. **/wms/nvl/can-doi** tháng 10: tồn đầu + nhập − xuất ± điều chỉnh = tồn cuối, cột hao ướt theo tuổi lô có số.

## 8. Mobile tổng quát

22. **/m/kho**: 3 tab hiện đúng; ô tìm "RSS" lọc được; bộ lọc *Đến hạn cân lại* / *Quá tuổi*.
23. In tem lô từ /wms/nvl/lo/:id → *In tem QR* → điện thoại bấm 📷 quẹt → mở đúng lô. Quẹt mã `PC-PD-…-01` gõ tay → mở đúng phiếu chèn.
24. Tab *Nhập*: ghi DRC + nhận một phiếu ngay trên điện thoại.

## Reset sau khi test (SQL, chỉ BGĐ)

```sql
-- Mở lại kỳ (sau bước 19) để tiếp tục ghi sổ hôm nay
UPDATE raw_settings SET ngay_khoa_so = NULL WHERE facility_id = (SELECT id FROM facilities WHERE code = 'PD');

-- Xóa dữ liệu hàng chèn + đối chiếu test (ảnh trong bucket raw-photos giữ nguyên, không ảnh hưởng)
DELETE FROM raw_photos WHERE ref_type LIKE 'mix_%';
DELETE FROM mix_issues; DELETE FROM mix_lots;
DELETE FROM raw_paper_checks;
```

Sổ kho khô (`raw_stock_ledger`) là sổ chỉ-thêm-dòng: không xóa; muốn làm lại từ đầu thì BGĐ xóa toàn bộ dòng của PD và nhập lại tồn đầu.
