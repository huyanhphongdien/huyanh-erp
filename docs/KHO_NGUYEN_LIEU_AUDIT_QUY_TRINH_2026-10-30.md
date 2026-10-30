# Audit quy trình: Cân Phong Điền → Kho NVL → Sản xuất (có hàng chèn) → Kho thành phẩm

Ngày 30/10/2026 · phạm vi: nhà máy Phong Điền · cách làm: đọc toàn bộ hàm DB, view, service và màn hình đang chạy trên `main`; **chưa đối chiếu số thật** (mục 6 có SQL để bạn chạy lấy số).

## 1. Luồng hiện tại và nơi dữ liệu nằm

```
[1] CÂN (can.huyanhrubber.vn)            weighbridge_tickets (+ _items từng dòng lô)
     phiếu in/fetch/retail, cargo raw      DRC: tra bảng ĐỐT (lookup) hoặc gõ tay (manual) → qc_actual_drc
        │ status = completed
        ▼
[2] HÀNG ĐỢI NHẬP KHO (/wms/nvl/nhap · /m/kho/nhap)      v_raw_intake_queue
     sẵn sàng khi: có nhà máy, loại mủ chuẩn hoá được, có DRC (đo / mặc định), sau ngày mở sổ
     thiếu DRC → QC/thủ kho ghi tại ERP: fn_nvl_ghi_drc_phieu
        │ thủ kho bấm NHẬN  (fn_nhap_kho_tu_phieu_can, quyền 'receive')
        ▼
[3] SỔ KHO KHÔ          raw_stock_ledger (+ dòng 'in', txn_date = ngày cân)      stock_batches (1 lô / dòng phiếu)
     tồn lô = Σ ướt, Σ khô       cân lại (recheck_adjust) · kiểm kê (stocktake_adjust) · khoá kỳ ngay_khoa_so
        │ lệnh xuất NVL (raw_issue_orders): FIFO → cân thực → ký 3 bước (giao → QS → thủ kho)
        ▼
[4] XUẤT SẢN XUẤT       ledger 'out_production' (−ướt, −khô theo DRC lô)        production_order_items (lô nguồn, kg, DRC)
        │
        ▼
[5] SẢN XUẤT / SỔ CA ÉP BÀNH     shift_production_reports + _lines (bành theo chủng loại SVR…, LOI, DKL, CHÈN)
     ký 3 bước (giao → QC → thủ kho)   tồn TP = v_shift_stock_balance (chỉ phiếu 'received')
        │                                        ▲
        │        [5b] HÀNG CHÈN  mix_lots (kho chèn, kg) ── phiếu chèn mix_issues: lấy đầu ca → trả cuối ca → ký 3 bước
        │             nguồn: hàng lỗi (LOI) / dính kim loại (DKL) / hàng chuẩn kho TP / mua ngoài
        │             khi thủ kho nhận: dòng CHÈN của sổ ca tự điền kg tiêu hao (fn_mix_cap_nhat_dong_chen)
        ▼
[6] KHO THÀNH PHẨM      sổ ca 'received' → tồn bành/kg theo chủng loại;  xuất bán theo lệnh điều xe
     đối chiếu: v_doi_chieu_xuat_kho (sổ ca vs lệnh điều xe) · v_vong_tai_che (LOI/DKL/chèn)
```

### Mỗi bước: ai làm, kiểm soát gì

| Bước | Ai | Ghi vào đâu | Kiểm soát đang có | Khoá |
|---|---|---|---|---|
| 1 Cân | nhân viên cân (app cân) | weighbridge_tickets/_items | phiếu phải `completed`, nhà máy, loại mủ, ĐỐT→DRC | — |
| 2 DRC tại ERP | QC / thủ kho / BGĐ | ticket.qc_actual_drc (nguồn manual) | chỉ phiếu chưa vào sổ | — |
| 3 Nhập kho | thủ kho NVL (raw_store_keepers) | ledger `in` + stock_batches | chặn nhập 2 lần (unique ref), DRC bắt buộc, loại mủ lạ chặn | ngày mở sổ |
| 3b Cân lại | thủ kho / QC / BGĐ | ledger `recheck_adjust` | lệch khô > 0,5 % phải ghi lý do | kỳ đã khoá |
| 3c Kiểm kê | đếm: thủ kho/QC; duyệt: raw_adjust_approvers | ledger `stocktake_adjust` | đếm đủ mới gửi, duyệt mới đổi sổ, duyệt = khoá kỳ | khoá đến ngày KK |
| 4 Xuất SX | giao: bất kỳ NV · QS: HAP-QC / raw_qc_signers · nhận: thủ kho | ledger `out_production` + production_order_items | kg cân thực ≤ tồn lô, chỉ bước 3 trừ sổ | kỳ đã khoá |
| 5 Sổ ca | giao: SX · QC: HAP-QC · nhận: shift_book_thu_kho | shift_production_lines | thứ tự ký (trigger), sau 'received' không sửa được | — |
| 5b Hàng chèn | lấy/trả: bất kỳ NV · QS: như trên · nhận: thủ kho | mix_issues, mix_lots, raw_photos | 2 ảnh bắt buộc mỗi lần lấy/trả, DKL phải xử lý KL, kg trả ≤ kg lấy, chỉ bước 3 đổi tồn | không có khoá kỳ |
| 6 Kho TP | — (tự tính) | v_shift_stock_balance | chỉ cộng phiếu 'received' | — |

## 2. Phát hiện — mức CAO (có thể làm sai số hoặc kẹt luồng ngay khi dùng thật)

### C1. Hai đường trừ NVL cho một lệnh sản xuất: lệnh xuất NVL (mới) và "Bắt đầu sản xuất" (cũ) đụng nhau
- **Hiện trạng.** Lệnh xuất NVL khi thủ kho nhận ghi `production_order_items` với `allocated_quantity = kg cân thực` và đã trừ sổ kho khô + `stock_batches.current_weight`. Màn Lệnh sản xuất cũ (`/wms/production`, nút *Bắt đầu sản xuất* → `productionService.startProduction`) **lại đọc chính các dòng đó** và trừ `stock_batches.quantity_remaining` thêm một lần. Lô NVL mới được tạo với `quantity_remaining = 1` (cột cũ, không dùng), nên bước này sẽ **báo lỗi "Lô … không đủ NVL: cần 3.500 kg, còn 1 kg"** và lệnh sản xuất không bắt đầu được; nếu ai sửa tay cột đó thì sẽ trừ hai lần.
- **Rủi ro.** Luồng SX trên ERP kẹt ngay bước đầu, hoặc tồn hai sổ lệch nhau.
- **Đề xuất.** Chốt một đường: NVL vào sản xuất **chỉ qua lệnh xuất NVL**. Trong `startProduction` bỏ phần trừ lô (hoặc bỏ qua các item có ghi chú "Lệnh xuất NVL"); `completeProduction` tính hiệu suất theo **kg khô** từ `production_order_items.actual_input_quantity × actual_drc_before` thay vì `required_quantity` (đang là kg ướt → hiệu suất sai hệ thống). Việc: 1 ngày.

### C2. Thành phẩm đang có hai sổ: sổ ca ép bành và lô thành phẩm của lệnh sản xuất
- **Hiện trạng.** Sổ ca (3 chữ ký) sinh tồn TP theo bành (`v_shift_stock_balance`). `completeProduction` **cũng tạo một `stock_batches` loại `production`** cho thành phẩm. Hai con số không nối nhau: sổ ca không biết lệnh sản xuất nào (bảng `shift_production_reports` không có `production_order_id`), lệnh sản xuất không biết ca nào.
- **Rủi ro.** Báo cáo tồn TP, truy xuất lô SVR ← lô NVL, và hiệu suất chế biến đều không khép được.
- **Đề xuất.** Quyết định sổ ca là **nguồn sự thật duy nhất** của TP (đúng với quyết định 2019 của nhà máy). Lệnh sản xuất chỉ còn vai trò kế hoạch + gom NVL; không tạo lô TP khi hoàn tất, hoặc tạo lô TP **từ dòng sổ ca đã nhận**. Thêm cột `production_order_id` (nullable) vào `shift_production_reports` để nối ca ↔ lệnh ↔ lô NVL. Việc: 1–2 ngày.

### C3. Hàng chuẩn chuyển sang kho chèn không trừ kho thành phẩm; hàng lỗi/DKL không tự vào kho chèn
- **Hiện trạng.** Nhập lô chèn nguồn *hàng chuẩn (kho TP)* chỉ ghi `mix_lots`; tồn TP của chủng loại đó **không giảm** (phải tự nhớ ghi "xuất bành" ở sổ ca). Ngược lại, LOI/DKL làm ra trong ca đã nằm trong sổ ca (nhập bành LOI/DKL, "đem xử lý" = xuất bành) và sổ QC hàng không đạt, nhưng **không có nút nào tạo lô chèn từ đó**; thủ kho gõ lại bằng tay, mã lô nguyên liệu truy ngược (`ma_nguyen_lieu`) mất ở bước này.
- **Rủi ro.** Tồn TP ảo (cao hơn thật) đúng bằng số kg đã đem đi chèn; vòng tái chế không khép, truy ngược hàng hỏng đứt.
- **Đề xuất.** (a) Nút **"Chuyển sang kho chèn"** ngay trên dòng LOI/DKL của sổ ca và trên dòng sổ QC: tạo `mix_lots` với `source_ref_type/id` tương ứng, kg = bành × cỡ bành. (b) Khi nhập lô chèn nguồn *hàng chuẩn*: bắt chọn chủng loại TP và tự ghi dòng `xuat_banh` (hoặc kg) vào phiếu ca của ca hiện tại, note "chuyển kho chèn". Việc: 2 ngày.

### C4. Phiếu chèn bàn giao ca sau không điền được sổ ca
- **Hiện trạng.** Phiếu bàn giao tự mở với `shift_id = NULL`; màn trả cuối ca của phiếu đó không hỏi lại ca. `fn_mix_cap_nhat_dong_chen` bỏ qua khi `shift_id` NULL → tiêu hao của ca sau **không vào dòng CHÈN**, trong khi `v_vong_tai_che` vẫn cộng (tính theo ngày). Hai báo cáo lệch nhau.
- **Đề xuất.** Ở màn Trả cuối ca, nếu phiếu không có ca thì **bắt chọn ca** (gợi ý ca đang chấm công) trước khi ghi; DB: `fn_mix_tra` nhận thêm `p_shift_id` và từ chối khi NULL. Việc: nửa ngày.

## 3. Phát hiện — mức TRUNG BÌNH (không sai ngay, nhưng sẽ sai dần)

### T1. Đồng bộ sang sổ cũ chạy ở trình duyệt, không trong cùng giao dịch
- Sau khi `fn_nhap_kho_tu_phieu_can` thành công, app mới ghi `stock_in_orders`, `stock_in_details`, `inventory_transactions` (best-effort, bỏ qua lỗi). Mất mạng giữa chừng → sổ kho khô có, sổ cũ không. Các báo cáo WMS cũ (stock-movement, inventory-value) đọc sổ cũ nên **lệch với Kho NVL mủ** mà không ai báo.
- **Đề xuất.** Vì kho vật tư đã rút khỏi menu: **bỏ đồng bộ sổ cũ** cho NVL (hoặc chuyển vào trong hàm DB nếu còn cần cho báo cáo WMS). Báo cáo WMS tab *inventory-value* nên bỏ NVL (lô NVL có `quantity_remaining = 1`, tính giá trị theo số lượng sẽ sai).

### T2. Trang vật tư cũ vẫn ghi được lên lô NVL
- Route `/wms/vat-tu`, `/wms/stock-out`… còn sống và sửa trực tiếp `stock_batches` (quantity_remaining, current_weight, status). Một thao tác "xuất kho" nhầm lô NVL ở đó sẽ làm `current_weight` lệch sổ kho khô (sổ khô không đổi, nhưng tem/lô hiển thị sai).
- **Đề xuất.** Trigger trên `stock_batches`: dòng có `raw_rubber_type IS NOT NULL` chỉ cho sửa qua các hàm `fn_nvl_*` (kiểm `current_setting('app.nvl_fn', true)`), còn lại từ chối. Việc: nửa ngày.

### T3. DRC phụ thuộc người cân, tỷ lệ phiếu có DRC ở PD thấp
- Thống kê 29/10: PD chỉ ~7 % phiếu có DRC tại cân. Nhập kho chỉ được khi có DRC nên hàng đợi sẽ dồn, tồn sổ chậm hơn thực tế nhiều giờ/ngày; txn_date vẫn là ngày cân nên nếu nhập **sau khi kiểm kê đã duyệt** sẽ bị chặn `KY_DA_KHOA`.
- **Đề xuất.** Quy định: lab ghi DRC trước 16h cùng ngày (màn hàng đợi đã có ô ghi DRC trên điện thoại). Khi tạo phiếu kiểm kê: **cảnh báo/chặn nếu còn phiếu cân sẵn sàng chưa nhập**. Mủ nước nông hộ (retail) phải có DRC từng phiếu, không dùng mặc định.

### T4. Hiệu suất chế biến chưa có chỗ nào khép
- Có đủ số: NVL khô xuất SX theo ngày (`v_raw_daily_flow.xuat_kho_kg`), chèn tiêu hao (`v_vong_tai_che.chen_tieu_hao_kg`), TP đạt làm ra kg và LOI/DKL kg (`v_vong_tai_che`). Chưa có view/trang nào đặt chúng cạnh nhau.
- **Đề xuất.** View `v_can_doi_nvl_tp` theo ngày/tháng/nhà máy: `NVL khô xuất SX + chèn tiêu hao = TP đạt + LOI/DKL + hao hụt chế biến`, hiệu suất % = TP đạt / (NVL khô + chèn). Đặt vào tab *Cân đối & hao hụt*. Việc: 1 ngày. Cần quyết định một chuẩn: TP tính 100 % khô (SVR) — hợp lý.

### T5. Kho chèn chưa có kiểm kê và khoá kỳ
- NVL có kiểm kê + khoá; kho chèn chỉ có nhập/lấy/trả. Sai số dồn (rơi vãi, cân lệch) không có chỗ điều chỉnh.
- **Đề xuất.** Hàm `fn_mix_kiem_ke(lot, kg_thuc, ly_do)` ghi dòng điều chỉnh vào `v_mix_movements`; làm cùng kỳ kiểm kê NVL. Việc: nửa ngày.

### T6. Phiếu ca cần tồn tại trước khi thủ kho nhận phiếu chèn
- Dòng CHÈN chỉ tự điền khi phiếu ca cùng nhà máy/ngày/ca **đã được tạo**; nếu thủ kho nhận phiếu chèn trước khi tổ mở phiếu ca, số bị bỏ qua và không có cơ chế điền bù.
- **Đề xuất.** Khi tạo phiếu ca (`create`), gọi `fn_mix_cap_nhat_dong_chen` cho ca đó để kéo số về. Việc: 1 giờ.

## 4. Phát hiện — mức THẤP / lưu ý vận hành

| # | Nội dung | Đề xuất |
|---|---|---|
| L1 | Ảnh phiếu chèn ở bucket `raw-photos` public-read (ai có URL xem được) | chấp nhận được như ảnh cân hiện nay; nếu cần, đổi bucket private + signed URL |
| L2 | Bước "giao" (submit) ở NVL, sổ ca, hàng chèn mở cho **mọi nhân viên** (cố ý, để không chặn nhập liệu) | giữ; nhưng dashboard nên hiện "ai ký giao" để BGĐ soát |
| L3 | Lô bãi `ma_nguyen_lieu` trong sổ QC là chữ tự do (TMHG-26…), không khớp mã lô NVL mới (NVL-…) | khi sổ QC nối với kho chèn (C3), chọn lô NVL từ danh sách thay vì gõ |
| L4 | Mục đích "nâng chỉ số" chưa gắn với kết quả QC của mẻ sau | sau này: nối `mix_issues.output_batch_id` với kết quả QC để biết chèn có hiệu quả |
| L5 | Phiếu cân Tân Lâm / Lào vẫn vào hàng đợi (lọc theo nhà máy ở màn hình) | đúng ý "chỉ tập trung PD"; khi mở TL thì phải chỉ định thủ kho TL trong `raw_store_keepers` |
| L6 | Ngày mở sổ 29/10: phiếu cân trước đó không nhập được; tồn đầu phải vào qua màn Tồn đầu | cần làm kiểm kê mở sổ thật tại PD trước khi chạy song song |

## 5. Những chỗ đã đúng, không nên đụng

- Sổ kho khô chỉ thêm dòng, tồn được tính, không lưu; một chứng từ không ghi hai lần (unique `ref_type/ref_id/ref_line`).
- Chỉ chữ ký thứ ba (thủ kho nhận) mới đổi tồn ở cả ba sổ: NVL, sổ ca, hàng chèn. Ba sổ cùng một kỷ luật.
- Ngưỡng lệch khô 0,5 % phải ghi lý do; kiểm kê duyệt là khoá kỳ; sổ ca sau khi nhận không sửa được.
- DRC trên phiếu cân phân biệt nguồn lookup/manual; DRC sau khi vào sổ chỉ đổi bằng cân lại / kiểm kê (có dấu vết).
- Hàng chèn: tồn = nhập − tiêu hao − đang ở dây chuyền; ảnh bắt buộc có giờ, vị trí, người chụp; DKL phải xử lý mới lấy được.

## 6. Kiểm chứng trên số thật (chạy ở Supabase, gửi lại kết quả)

```sql
-- (a) C1: lệnh SX nào đã có dòng từ lệnh xuất NVL và đang ở trạng thái gì
SELECT po.code, po.status, count(*) AS dong_nvl, sum(i.actual_input_quantity) AS kg_uot
  FROM production_order_items i JOIN production_orders po ON po.id = i.production_order_id
 WHERE i.notes LIKE 'Lệnh xuất NVL%' GROUP BY po.code, po.status;

-- (b) C2: lô TP do lệnh SX tạo vs tồn TP theo sổ ca
SELECT count(*) AS lo_tp_tu_lenh_sx FROM stock_batches WHERE batch_type = 'production';
SELECT code, material_name, ton_banh, ton_kg FROM v_shift_stock_balance WHERE facility_id = (SELECT id FROM facilities WHERE code = 'PD') ORDER BY code;

-- (c) C3: hàng chuẩn đã nhập kho chèn (tồn TP đáng lẽ phải giảm)
SELECT code, grade, kg_in, received_date FROM mix_lots WHERE source_type = 'std' AND status <> 'cancelled';

-- (d) C4: phiếu chèn đã nhận nhưng không có ca → không vào dòng CHÈN
SELECT code, shift_date, kg_used FROM mix_issues WHERE status = 'received' AND shift_id IS NULL;

-- (e) T1: phiếu cân đã vào sổ khô nhưng thiếu phiếu nhập sổ cũ
SELECT t.code FROM weighbridge_tickets t
 WHERE EXISTS (SELECT 1 FROM raw_stock_ledger l WHERE l.ref_type = 'weighbridge_ticket' AND l.ref_id = t.id)
   AND NOT EXISTS (SELECT 1 FROM stock_in_orders s WHERE s.notes LIKE '%phiếu cân ' || t.code || '%');

-- (f) T3: hàng đợi PD đang kẹt vì DRC
SELECT ly_do_cho, count(*), round(sum(net_weight)) AS kg FROM v_raw_intake_queue
 WHERE facility_code = 'PD' AND NOT da_nhap GROUP BY ly_do_cho;

-- (g) T4: cân đối thô theo ngày (NVL khô xuất SX vs TP đạt + chèn)
SELECT f.txn_date, f.xuat_kho_kg AS nvl_kho_xuat_sx, v.chen_tieu_hao_kg, v.dat_lam_ra_kg AS tp_dat_kg, v.khong_dat_lam_ra_kg AS loi_dkl_kg
  FROM v_raw_daily_flow f LEFT JOIN v_vong_tai_che v ON v.facility_id = f.facility_id AND v.ngay = f.txn_date
 WHERE f.facility_id = (SELECT id FROM facilities WHERE code = 'PD') ORDER BY f.txn_date DESC LIMIT 14;
```

## 7. Thứ tự nên làm

1. **C1 + C2** — chốt "NVL vào SX chỉ qua lệnh xuất NVL; TP chỉ theo sổ ca", sửa `startProduction`/`completeProduction`, thêm `production_order_id` vào phiếu ca. Đây là điều kiện để mọi báo cáo khép sổ.
2. **C3 + C4 + T6** — khép vòng hàng chèn: nút chuyển LOI/DKL/hàng chuẩn sang kho chèn, bắt ca ở phiếu bàn giao, kéo số CHÈN khi tạo phiếu ca.
3. **T4** — view cân đối NVL → TP và hiệu suất, đưa vào tab Cân đối.
4. **T1 + T2** — cắt sổ cũ khỏi NVL, khoá sửa tay lô NVL.
5. **T3 + T5 + L6** — quy định DRC trước 16h, kiểm kê kho chèn, kiểm kê mở sổ thật ở PD.

Sau bước 1 và 2, quy trình từ cân đến kho thành phẩm là **một chuỗi khép kín, mỗi kg có chứng từ và chữ ký**; trước đó, hai chỗ C1/C2 là nơi số có thể tách làm hai.
