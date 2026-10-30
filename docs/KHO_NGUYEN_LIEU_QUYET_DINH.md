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
| 12 | Hàng vào kho NVL gồm cả **thành phẩm từ nhà máy khác** (SVR, RSS, mủ ly tâm) và **hàng thương mại** | Danh mục mở rộng 2 nhóm: `mu_tho` (phải đo DRC) và `thanh_pham` (DRC mặc định 100 cho SVR/RSS, 60 cho latex 60 %). "Hàng thương mại" là **nguồn của lô** (`nguon_hang`: nông hộ / đại lý / nhà máy khác / thương mại / chuyển kho, ghi ở GĐ1), sổ có bút toán **xuất bán** riêng, không trộn với xuất sản xuất | **Chủ doanh nghiệp** (29/10) | `wms_nvl_p0_ma_loai_mu_v2_thanh_pham.sql`, `raw.types.ts` |
| 13 | Có thêm **SBR 1502** (cao su tổng hợp, mua ngoài) | Nhóm mới `tong_hop`, không đo DRC, sổ khô tính 100 % | **Chủ doanh nghiệp** (29/10) | `wms_nvl_p0_ma_loai_mu_v3_sbr.sql`, `raw.types.ts` |
| 14 | **Ngày mở sổ** theo nhà máy | Sổ kho khô bắt đầu **29/10/2026** cho cả 3 nhà máy; phiếu cân ra trước ngày đó không vào hàng đợi, không nhập được (hàng đã thuộc tồn đầu kiểm kê). Lùi ngày chỉ khi chưa nhập tồn đầu của khoảng đó | Claude đề xuất sau khi thấy 277 + 22 phiếu cũ | `raw_settings.ngay_mo_so`, `wms_nvl_p1_v2_ngay_mo_so.sql` |
| 15 | **Chỉ tập trung Phong Điền** đợt này | Màn hình mặc định chọn PD; Tân Lâm, Lào để sau khi PD chạy ổn | **Chủ doanh nghiệp** (29/10) | Màn tổng quan, hàng đợi, tồn đầu |
| 16 | PD chỉ 7 % phiếu có DRC tại cân (60 ngày) → **ghi DRC trong ERP** | Lab / thủ kho / BGĐ ghi DRC đo vào phiếu cân ngay ở hàng đợi nhập kho (chỉ phiếu chưa vào sổ); sau khi vào sổ, DRC đổi bằng cân lại (GĐ2) | Claude đề xuất từ số liệu kiểm chứng | `fn_nvl_ghi_drc_phieu`, màn 02 |
| 17 | **Tồn đầu nhập linh động** vì chưa có số thật | Màn Tồn đầu: thêm từng dòng (lô thật hoặc dòng gộp theo loại) bất kỳ lúc nào, sửa / xóa khi chưa ghi sổ, "Ghi vào sổ" theo đợt; sau khi ghi sổ chỉ sửa bằng cân lại / kiểm kê | **Chủ doanh nghiệp** (29/10) | `/wms/nvl/ton-dau`, `raw_opening_stock_staging`, `fn_mo_so_ton_dau` |
| 18 | **Kho chèn tính bằng kg**, tồn = nhập − tiêu hao − đang ở dây chuyền; tiêu hao ca = kg lấy đầu ca − kg trả cuối ca; chỉ bước "thủ kho nhận" (chữ ký 3) mới làm tồn kho chèn đổi | Mỗi lần lấy / trả là một phiếu chèn `PC-PD-…`, ký 3 bước như lệnh xuất NVL; thiếu ảnh bắt buộc thì không ký được | **Chủ doanh nghiệp** (29/10) + Claude | `mix_lots`, `mix_issues`, `raw_photos`, `wms_mix_p1_hang_chen.sql` |
| 19 | Dòng **CHÈN của sổ ca ép bành tự điền** từ phiếu chèn đã nhận (Σ kg tiêu hao cùng nhà máy / ngày / ca → `xuat_kg_manual`) | Hết gõ tay khi đã có phiếu; `v_vong_tai_che` có thêm `chen_tieu_hao_kg` và `dat_tu_nvl_moi_kg` (số thật thay cho cờ) | Claude đề xuất | `fn_mix_cap_nhat_dong_chen`, `v_vong_tai_che` |
| 20 | Lô chèn gốc **dính kim loại (DKL)** phải đánh dấu *đã xử lý kim loại* mới được lấy chèn; lô QC ghi *không chạy lại* vẫn lấy được nhưng cảnh báo | Chặn ở DB (`DKL_CHUA_XU_LY`), không chặn nhập lô | Claude đề xuất | `mix_lots.metal_cleared`, `fn_mix_lay` |
| 21 | **Chạy song song giấy – máy**: cuối ngày thủ kho ghi tồn ƯỚT sổ giấy từng loại mủ; máy so với tồn sổ máy đến ngày đó; lệch quá ngưỡng 0,5 % phải ghi lý do; màn này **không sửa sổ máy** (sửa bằng cân lại / kiểm kê) | Có bảng lịch sử để BGĐ xem xu hướng lệch trước khi bỏ sổ giấy | Claude đề xuất | `raw_paper_checks`, `v_raw_doi_chieu`, `/wms/nvl/doi-chieu`, `wms_nvl_p5_doi_chieu.sql` |
| 22 | **App mobile thủ kho** `/m/kho` (3 tab: Lô NVL · Nhập · Hàng chèn) dùng tài khoản ERP, quyền lấy từ DB như desktop; quẹt QR tem lô / mã lô chèn / mã phiếu chèn | Cân lại ngay tại bãi, nhận phiếu cân, lấy – trả hàng chèn kèm 2 ảnh bắt buộc; nhà máy nhớ theo máy | Claude đề xuất | `src/pages/mobile/kho/*` |

Các ngưỡng số (1–5, 11) đổi bằng cách BGĐ sửa bảng `raw_settings` theo nhà máy, không cần sửa code.

## Việc nhà máy làm trước GĐ 1

- Kiểm kê mở sổ tại Phong Điền: cân lại từng lô tồn, lấy mẫu DRC, ghi vào `docs/templates/kiem_ke_mo_so_nvl_mau.csv` (xóa dòng ví dụ), nhập vào bảng `raw_opening_stock_staging` (Supabase → Table Editor → Import CSV), rồi xem `v_raw_opening_stock_check` để sửa dòng lỗi.
- Lô không lấy được mẫu DRC: điền DRC ước và đánh dấu `drc_estimated = true`; lô đó sẽ mang cờ "tồn đầu ước" trong sổ.
