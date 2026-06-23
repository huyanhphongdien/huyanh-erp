# Hướng dẫn NHẬP TAY dữ liệu mẫu để test Module Tài chính

> Mục đích: tự thêm dữ liệu qua **giao diện** (không chạy SQL) để test các form + luồng.
> Đăng nhập bằng **minhld** (đang khoá quyền chỉ admin). Dữ liệu dưới đây gọn nhưng
> đủ kích hoạt: 4 đèn CIC · HĐTG tái tục · tài sản ĐB · tuổi nợ phải thu · ACB thiếu
> đảm bảo · dòng tiền có cảnh báo.

## ⚠️ Quy ước NGÀY
Các ô ngày nhập **lệch so với HÔM NAY** (dùng lịch trong form). Ví dụ "**+20**" = hôm nay cộng 20 ngày, "**−12**" = hôm nay trừ 12 ngày. (Nhờ vậy đèn/cảnh báo luôn đúng.)

## ⚠️ THỨ TỰ NHẬP (bắt buộc — vì phụ thuộc nhau)
```
1. Hạn mức (HĐTD)  →  2. Khoản vay  →  3. Tiền gửi  →  4. Tài sản đảm bảo
        ↓ (đều CHỌN hạn mức ở bước 1)
5. Phải thu   6. Tồn quỹ   7. Phải nộp   8. Lịch lãi (trong khoản vay)   9. Trả nợ
```

---

## 1) HẠN MỨC TÍN DỤNG — `Vay vốn → tab Hạn mức → "Thêm hạn mức"`
| Ngân hàng | Số HĐTD | Hạn mức (VNĐ) | Loại | Lãi suất | Trạng thái |
|---|---|---|---|---|---|
| Vietcombank | VCB-2026-01 | 40.000.000.000 | Vay vốn | 6.4 | Hiệu lực |
| ACB | ACB-2026-02 | 20.000.000.000 | Chiết khấu BCT | 6.9 | Hiệu lực |

> ACB để ít đảm bảo → lát sẽ thấy cảnh báo "hạn mức thiếu đảm bảo".

## 2) KHOẢN VAY — `Vay vốn → tab Khoản vay → "Thêm khoản vay"`
Nhớ chọn **"Thuộc hạn mức (HĐTD)"** cho từng khoản.

| Ngân hàng | Số khế ước | Thuộc hạn mức | Số vay (VNĐ) | Lãi suất | Ngày giải ngân | Ngày đến hạn | → Đèn |
|---|---|---|---|---|---|---|---|
| Vietcombank | KU-001 | VCB-2026-01 | 8.000.000.000 | 6.4 | −60 | **+20** | 🟢 An toàn |
| ACB | KU-002 | ACB-2026-02 | 3.000.000.000 | 6.9 | −80 | **−2** | 🟧 Quá hạn |
| Vietcombank | KU-003 | VCB-2026-01 | 2.000.000.000 | 6.4 | −110 | **−12** | 🔴 Nhảy nhóm |
| ACB | KU-004 | ACB-2026-02 | 5.000.000.000 | 6.9 | −85 | **+5** | 🟡 Sắp đến hạn |

> Sau khi lưu, danh sách sẽ hiện đủ các màu đèn CIC.

## 3) TIỀN GỬI (HĐTG) — `Vay vốn → tab Tiền gửi → "Thêm HĐTG"`
Chọn **"🔗 Đảm bảo cho HẠN MỨC"** cho từng sổ.

| Ngân hàng | Số HĐTG | Số tiền (VNĐ) | Đảm bảo cho hạn mức | Ngày gửi | Ngày đến hạn | → Trạng thái |
|---|---|---|---|---|---|---|
| Vietcombank | TG-01 | 15.000.000.000 | VCB-2026-01 | −180 | **+5** | cần tái tục gấp |
| Vietcombank | TG-02 | 10.000.000.000 | VCB-2026-01 | −100 | **+150** | còn xa |
| ACB | TG-03 | 2.000.000.000 | ACB-2026-02 | −200 | **−3** | QUÁ HẠN tái tục |

> Lãi suất ~4.7, Kỳ hạn "6 tháng" (tuỳ nhập). ACB chỉ 2 tỷ đảm bảo cho 8 tỷ dư nợ → thiếu.

## 4) TÀI SẢN ĐẢM BẢO — `Vay vốn → tab Tài sản ĐB → "Thêm tài sản"`
| Tên tài sản | Loại | Đảm bảo cho hạn mức | Ngân hàng | Định giá | Giá trị bảo đảm |
|---|---|---|---|---|---|
| Nhà xưởng sản xuất khu A | Bất động sản | VCB-2026-01 | Vietcombank | 18.000.000.000 | 12.600.000.000 |

> Cố ý không thêm tài sản cho ACB → ACB thiếu đảm bảo (để test cảnh báo).

## 5) PHẢI THU KHÁCH HÀNG — `Phải thu KH → "Thêm phải thu"`
Tiền tệ **USD**. Hạn thu **để trống** (hệ thống tự tính = ATD + Term).

| Khách hàng (Buyer) | Số HĐ | Hàng | Giá trị (USD) | ATD | Term (ngày) | Ngày tiền về | → Tuổi nợ |
|---|---|---|---|---|---|---|---|
| EVERGREEN RUBBER PTE | HD-01 | SVR 10 | 200000 | −88 | 90 | (trống) | Trong hạn (còn 2d) |
| PACIFIC LATEX CO | HD-02 | RSS 3 | 150000 | −100 | 90 | (trống) | Quá 1–30 |
| ORIENT TYRE LTD | HD-03 | SVR 3L | 100000 | −165 | 90 | (trống) | Quá 61–90 |
| SUMMIT TRADING LLC | HD-04 | SVR 20 | 95000 | −120 | 90 | **−15** | Đã thu |

> Nhập "Đã thu" = nhập **Ngày tiền về** → tự chuyển trạng thái Đã thu (nhớ điền "Đã thu" = 95000 nếu muốn khớp).

## 6) TỒN QUỸ — `Tồn quỹ & phải nộp → khối Tồn quỹ → "Thêm TK"`
| Ngân hàng | Số dư VNĐ | Số dư USD |
|---|---|---|
| Vietcombank | 3.000.000.000 | 6000 |
| MB Bank | 2.500.000.000 | 4000 |
| ACB | 1.200.000.000 | 0 |

> Cập nhật ngày = HÔM NAY.

## 7) PHẢI NỘP ĐỊNH KỲ — `Tồn quỹ & phải nộp → khối Phải nộp → "Thêm khoản"`
| Tên | Nhóm | Ngày nộp | Số tiền ước |
|---|---|---|---|
| Tiền điện nhà máy | Tiền điện | 12 | 85.000.000 |
| Bảo hiểm tài sản | Bảo hiểm | 20 | 45.000.000 |

## 8) LỊCH TRẢ LÃI — trong tab Khoản vay, bấm icon **%** ở dòng KU-001
Trong Drawer → điền rồi bấm **"Sinh lịch"**:
- Kỳ trả lãi: **Hằng tháng** · Ngày trả: **25** · Lãi suất: **6.4**
- Từ ngày: **ngày giải ngân (−60)** · Đến ngày: **ngày đến hạn (+20)** · Dư nợ gốc: **8.000.000.000**
→ Sinh ra các kỳ lãi. Bấm ✓ "đã trả" 1 kỳ cũ để test.

## 9) GHI TRẢ NỢ — tab Khoản vay, bấm icon **💲** ở dòng KU-001
- Ngày trả: **−7** · Số tiền: **2.000.000.000** · Nguồn: Tiền hàng KH → "Ghi trả nợ"
→ Dư nợ KU-001 giảm còn 6 tỷ.

---

## ✅ Sau khi nhập xong — kiểm tra các luồng
| Vào màn hình | Sẽ thấy |
|---|---|
| **Khoản vay** | 4 đèn: 🟢 An toàn · 🟧 Quá hạn · 🔴 Nhảy nhóm · 🟡 Sắp đến hạn |
| **Hạn mức** → bấm dòng **ACB** | Drawer: tiền gửi 2 tỷ < dư nợ 8 tỷ → **thiếu đảm bảo**; bấm dòng khoản vay/tiền gửi để nhảy |
| **Tiền gửi** | TG-01 cần tái tục gấp · TG-03 quá hạn tái tục (banner đỏ) |
| **Phải thu** | Bảng tuổi nợ đủ nhóm · 1 dòng "Đã thu" |
| **Tồn quỹ & phải nộp** | Lưới số dư + tổng · 2 khoản phải nộp có "kỳ tới" |
| **Dòng tiền tổng hợp** | Tiền vào (phải thu) vs tiền ra (vay+lãi+phải nộp) theo tuần + tồn dự kiến |
| **Tổng quan vốn vay** | KPI + bảng "Nguy cơ nhảy nhóm" (KU-003, KU-002) |

> Mỗi đối tượng bấm **📎** để thử đính kèm 1 file bất kỳ (test upload).

## Dọn dữ liệu test
Khi muốn xoá: vào từng màn hình bấm 🗑 từng dòng — hoặc nhờ tôi cấp lại file SQL xoá nhanh.
