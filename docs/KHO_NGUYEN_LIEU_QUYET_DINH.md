# Kho nguyên liệu mủ — nhật ký quyết định

Mỗi quyết định ghi: ai chốt, ngày, giá trị, nằm ở đâu trong hệ thống. Đổi quyết định = thêm dòng mới, không xóa dòng cũ.

## 2026-10-29 · Giai đoạn 0

| # | Quyết định | Giá trị | Ai chốt | Nằm ở đâu |
|---|---|---|---|---|
| 1 | Ngưỡng tuổi lô cảnh báo (mủ đông, tạp, chén) | **20 ngày** | Claude đề xuất, chủ DN giao tự quyết | `raw_settings.tuoi_lo_canh_bao_ngay` |
| 2 | Chu kỳ cân lại + kiểm tra DRC | **7 ngày**, và **cân lại trước khi xuất nếu lần đo gần nhất quá 3 ngày** | Claude đề xuất (khớp `recheck_interval_days` QC đang dùng) | `raw_settings.chu_ky_can_lai_ngay`, `can_lai_truoc_xuat_ngay` |
| 3 | Ngưỡng lệch kg khô phải ghi nguyên nhân | **0,5 %** cho lô và cho tổng tháng (cùng ngưỡng chuyển kho liên nhà máy) | Claude đề xuất | `raw_settings.nguong_lech_kho_pct` |
| 4 | Giới hạn % hàng chèn theo grade | **SVR 10 / 20: 20 % · SVR 3L / L / 5: 10 % · SVR CV50 / CV60: 0 %**; vượt thì QC duyệt riêng | Claude đề xuất, cần QC xác nhận lại trước GĐ 4 | `raw_settings.gioi_han_chen_pct` |
| 5 | Hàng chèn dùng dở cuối ca | **Được bàn giao ca sau** (không bắt trả về kho), vẫn giữ mã lô và chỉ số | Claude đề xuất | `raw_settings.chen_ban_giao_ca` |
| 6 | Thủ kho NVL (ký bước "nhận", bước duy nhất làm tồn đổi) | **Lê Duy Minh — minhld@huyanhrubber.com, mọi nhà máy**, để audit và test; thủ kho thật thêm sau | **Chủ doanh nghiệp** | `raw_store_keepers` (BGĐ thêm dòng, không sửa code) |
| 7 | Ảnh bắt buộc cho mỗi lần lấy / trả hàng chèn | **Toàn cảnh + màn hình cân** bắt buộc, ảnh 3 bổ sung tùy chọn | Chủ doanh nghiệp (29/10) | `raw_settings.anh_bat_buoc` |
| 8 | Khối lượng hàng chèn | **Nhập theo kg đọc từ màn hình cân**, không quy đổi từ số bành | Chủ doanh nghiệp (29/10) | Thiết kế màn 09, 11, 12 |
| 9 | Sơ đồ ô bãi, bể chứa | **Chưa làm** đợt này; lô chỉ thuộc "kho NVL" của nhà máy | Chủ doanh nghiệp (29/10) | Mockup đã bỏ màn 05 |
| 10 | Mã loại mủ chuẩn | `mu_nuoc · mu_dong · mu_tap · mu_chen · mu_to · khac`; dữ liệu cũ không sửa, đi qua `fn_chuan_hoa_loai_mu()` | Claude đề xuất | `raw_rubber_types`, `wms_nvl_p0_ma_loai_mu.sql` |
| 11 | Lệch DRC nhà cung cấp khai báo so với thực | Gắn cờ điểm NCC khi thấp hơn **3 điểm** | Claude đề xuất | `raw_settings.nguong_lech_drc_ncc_diem` |

Các ngưỡng số (1–5, 11) đổi bằng cách BGĐ sửa bảng `raw_settings` theo nhà máy, không cần sửa code.

## Việc nhà máy làm trước GĐ 1

- Kiểm kê mở sổ tại Phong Điền: cân lại từng lô tồn, lấy mẫu DRC, ghi vào `docs/templates/kiem_ke_mo_so_nvl_mau.csv` (xóa dòng ví dụ), nhập vào bảng `raw_opening_stock_staging` (Supabase → Table Editor → Import CSV), rồi xem `v_raw_opening_stock_check` để sửa dòng lỗi.
- Lô không lấy được mẫu DRC: điền DRC ước và đánh dấu `drc_estimated = true`; lô đó sẽ mang cờ "tồn đầu ước" trong sổ.
