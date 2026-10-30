# Kho NVL theo MÃ NGUYÊN LIỆU — phát hiện từ phiếu cân và đề xuất (30/10/2026)

## 1. Nhà máy đang làm gì (số thật, Phong Điền, 180 ngày)

Người cân gõ **mã nguyên liệu** vào ô "mã LLM gộp" của phiếu cân (`weighbridge_tickets.consolidation_code`). 90 ngày gần nhất: 126 phiếu nhập, 4.021 tấn, trong đó **76 % kg có mã**.

| Mã gõ trên phiếu | Phiếu | kg | Nhận xét |
|---|---|---|---|
| `TMHG-40 XE1`, `TMHG 40 XE 1`, `TMHG   40  XE 1` | 3 | 93.830 + 6.160 + 6.000 | cùng một mã, ba cách gõ, "XE 1" dán cho cả ba xe |
| `TMHG  39`, `TMHG   35`, `TMHG-36`, `TMHG   -33`, `T MHG-32`, `TMGH-31` | 1 mỗi mã | 90–97 tấn | số lô tăng dần 26 → 40 từ 09/08 đến 26/10; một mã = một xe lớn |
| `KHMN-14  XE 1`, `KHMN-14  XE 2` | 2 | 99.850 + 94.770 | một mã, hai xe |
| `LASI 28 XE 1`, `LAS1-29 XE 1`, `la si -31`, `LÁ[SI 23 XE 1` | — | 60–65 tấn | cùng nguồn LASI, gõ lệch chính tả |
| `MU TO - TMMN-25-08`, `TMMN 25 07`, `HU TO TMMN-25- -05 NM2 QT` | 1 mỗi mã | 5–7 tấn | mủ tờ đi lấy (fetch), mã kèm loại mủ |
| `TMNI 08` | 1 | 13.790 | |
| `SBR-1502` | 1 | 20.300 | hàng tổng hợp, mã = tên hàng |
| (trống) | 65/119 phiếu mủ tạp, 7 phiếu nông hộ | 24 % kg | không có mã |

Kết luận: **đơn vị nhà máy vận hành là mã nguyên liệu** `NGUỒN-SỐ` (TMHG-40), một mã gồm 1–3 xe (`XE n`), chạy sản xuất theo mã, QC ghi hàng không đạt theo mã (`qc_reject_log.ma_nguyen_lieu`, ví dụ TMHG-26), thành phẩm cũng được gọi theo mã. Kho NVL mủ hiện đặt lô theo **phiếu cân** (`NVL-CX-…-1`), nên thủ kho không nhìn thấy "mã TMHG-40 còn bao nhiêu", không xuất được "cả mã TMHG-40", không tính được hiệu suất theo mã.

Tân Lâm: 739 phiếu, **không phiếu nào có mã** (lô ghi bằng chữ "lô mủ tháng 10" trong ghi chú) — sẽ khác PD, để sau.

## 2. Bài toán giải được không — được, và không phải làm lại

Sổ kho khô ghi theo lô xe (một phiếu = một lô) là đúng và giữ nguyên. Chỉ thêm **một tầng trên**: mã nguyên liệu gom nhiều lô xe. Mọi số (ướt, khô, DRC, tuổi) của mã là tổng của các lô xe bên dưới, không lưu riêng.

```
MÃ NGUYÊN LIỆU  TMHG-40  (nguồn TMHG · số 40 · mủ tạp)      ← đơn vị chạy máy, QC, hiệu suất
   ├─ lô xe NVL-PD-20261027-002   93.830 kg  (XE 1, 74H-020.43)
   ├─ lô xe NVL-PD-20261027-003    6.160 kg  (75C 0635)
   └─ lô xe NVL-PD-20261027-004    6.000 kg  (75C 06354)
```

### Những gì sẽ thêm (GĐ6 · "Mã nguyên liệu")

| # | Việc | Ở đâu |
|---|---|---|
| 1 | Bảng `raw_lots` (mã NVL): nhà máy, `ma` chuẩn hoá (TMHG-40), nguồn (TMHG), số (40), loại mủ, trạng thái *đang nhập / sẵn sàng / đang chạy / đã chạy xong*, ngày về đầu–cuối | DB |
| 2 | `stock_batches.raw_lot_id` — lô xe thuộc mã nào; hàm `fn_chuan_hoa_ma_nvl(text)` đọc chữ người cân gõ → mã + số xe (bỏ "MU TAP/MU TO", gộp khoảng trắng, bảng bí danh TMGH→TMHG, LAS1/LA SI→LASI do BGĐ sửa được) | DB |
| 3 | **Nhập kho**: hàng đợi hiện sẵn mã đọc từ phiếu; thủ kho xác nhận hoặc chạm chọn mã đang mở / tạo mã mới (nguồn bằng nút, số tự đề xuất +1). Phiếu không có mã **không nhập được** cho tới khi gán mã | điện thoại + máy tính |
| 4 | **Tồn theo mã**: thẻ mã (tồn ướt, khô, DRC bình quân, số xe, tuổi, trạng thái), chạm vào xem từng xe; tem QR in theo mã; cân lại vẫn theo từng xe | điện thoại + máy tính |
| 5 | **Xuất sản xuất theo mã**: lệnh xuất chọn mã (một hoặc nhiều), cân thực ghi **một số cho cả mã**, máy phân bổ xuống từng lô xe theo tỷ lệ ướt còn lại; xuất hết thì mã sang *đã chạy xong* | điện thoại + máy tính |
| 6 | **Phiếu ca** ghi *mã đang chạy* (một ca một mã, đổi mã thì tách phiếu ca) → thành phẩm của ca mang mã đó; sổ QC chọn mã từ danh sách thay vì gõ | sổ ca, sổ QC |
| 7 | **Hiệu suất theo mã**: NVL khô đã xuất của mã + chèn so với TP đạt + LOI/DKL của các ca chạy mã đó | tab Cân đối |
| 8 | App cân: ô mã nguyên liệu thành 3 ô *nguồn (chọn) · số · xe* để hết lệch chính tả (làm ở repo app cân, sau) | app cân |

Việc 1–7 khoảng 3–4 ngày làm, không đụng sổ đã ghi: các lô xe đã nhập chỉ cần gán mã (máy đề xuất từ phiếu cân, thủ kho xác nhận một lần).

## 3. Bốn điểm cần chủ doanh nghiệp chốt

1. Mã chuẩn là `NGUỒN-SỐ` (TMHG-40), "XE n" chỉ là lô xe con của mã. Mủ tổng hợp (SBR-1502) và hàng thương mại dùng tên hàng làm mã.
2. Phiếu cân không có mã (24 % kg): thủ kho gán mã lúc nhập kho (đề xuất), về sau app cân bắt buộc nhập.
3. Xuất sản xuất cân **theo mã** (một số), máy chia về từng xe; không cân từng xe.
4. Một ca chạy **một mã**; chạy hai mã thì tách hai phiếu ca.

## 4. Tầng còn thiếu để đi hết đến xuất kho thành phẩm: LÔ THÀNH PHẨM (30/10, từ 2 cuốn sổ giấy)

Hai cuốn sổ chủ doanh nghiệp đưa:

- **Sổ QC hàng không đạt**: mỗi dòng là một *số lô thành phẩm* (S2308AB, S2309AB, S2324AB, CV2622A/B…) kèm *mã nguyên liệu* (TMHG-26, S1-25, TMNH-01, TNTV 18-19), tình trạng CXL/LOẠI, lý do (Po 263–284, MV↓), ghi chú "xuất chèn 22/8", "Kalamo 22/8". Một ca (14/8 Đen) ra 5 số lô.
- **Sổ ca ép bành** (24/10): tồn kho theo *chủng loại* (SVR10 35KG STD 5.029 bành · 176.015 kg; SVR10 MIX 1502 35KG 1.025 · 35.875; SVL3L 1.253 · 43.855; SVR10CV60 1.035 · 36.225; BÀNH 1502 1.620 · 56.700; HÀNG DKL 318 · 11.130; RSS3 nhập 55 · 1.925, tồn 406 · 14.210; SẢN PHẨM LỖI 1.114 · 38.990 CXL…). Sổ ca **không ghi số lô**, chỉ ghi tổng bành theo chủng loại.

Vậy sợi dây đầy đủ nhà máy đang có trên giấy là:

```
MÃ NGUYÊN LIỆU (TMHG-26)  →  ca / tổ ép  →  SỐ LÔ THÀNH PHẨM (S2308AB, 35 kg/bành × N bành, chủng loại)
       │                                            │
   phiếu chèn (lấy SBR-1502, hàng lỗi…)             ├─ QC đạt  → tồn TP theo chủng loại → lệnh điều xe (xuất theo số lô / mã hàng)
                                                    └─ QC CXL / LOẠI → "SẢN PHẨM LỖI", "HÀNG DKL" → xuất chèn → chạy lại thành số lô mới
```

Phần mềm hiện có: mã NVL (đề xuất GĐ6 ở trên), phiếu chèn, sổ ca theo chủng loại, lệnh điều xe có mã hàng. **Thiếu đúng một thực thể: lô thành phẩm.** Thêm nó (GĐ7) thì toàn bộ chuỗi khép:

| # | Việc | Ghi chú |
|---|---|---|
| 1 | Bảng `fg_lots` (lô thành phẩm): số lô (S2308AB), nhà máy, ngày SX, ca, tổ, chủng loại (material), số bành, kg/bành → kg, **mã NVL** (một hoặc nhiều), có chèn hay không (từ phiếu chèn của ca), kết quả QC (Po, MV, PRI, đạt / CXL / LOẠI, lý do), trạng thái (tồn · đã xuất · đã chuyển chèn · đã chạy lại), ghi chú | tồn TP theo chủng loại = Σ lô; "SẢN PHẨM LỖI" = Σ lô CXL/LOẠI; đúng hai dòng cuối của sổ ca |
| 2 | **Sổ ca** giữ nguyên tờ giấy, chỉ thêm dưới mỗi dòng nhập: danh sách số lô nhập trong ca (số lô + số bành); tổng bành tự cộng lên dòng chủng loại | tổ ép gõ số lô ngay lúc nhập kho, trên điện thoại |
| 3 | **Sổ QC hàng không đạt**: chọn số lô từ danh sách thay vì gõ, mã NVL tự hiện; CXL/LOẠI đổi trạng thái lô → tồn "SẢN PHẨM LỖI" tự đúng | |
| 4 | **Hàng chèn**: nguồn "hàng lỗi" chọn số lô CXL/LOẠI (thay cho dòng LOI tổng); lô chạy lại ra số lô mới ghi "từ lô S2308AB" | truy ngược hai chiều |
| 5 | **Xuất kho TP**: lệnh điều xe chọn số lô (bành cụ thể) thay vì chỉ mã hàng; tồn giảm theo lô; đối chiếu xuất kho giữ như cũ | |
| 6 | **Truy xuất**: từ container đã giao → số lô → ca → mã NVL → phiếu cân → nhà cung cấp; và ngược lại từ mã NVL → mọi số lô, hiệu suất, tỷ lệ lỗi của mã đó | đây là câu trả lời cho "mã nào hay hỏng" |

Cần chốt thêm: quy ước **số lô thành phẩm** (S2308AB nghĩa là gì: S = SVR10? 23 = ? 08 = thứ tự? AB = máy ép A và B?) để máy tự đề xuất số lô kế tiếp cho tổ ép.
