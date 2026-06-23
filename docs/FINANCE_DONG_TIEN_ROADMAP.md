# LỘ TRÌNH TÀI CHÍNH — DÒNG TIỀN (Treasury) Cao Su Huy Anh

Nguồn gốc: file Excel `PHẢI THU, NỢ ĐẾN HẠN, HĐTG` (27 sheet) = bộ quản lý **dòng tiền**.
Mục tiêu cuối: **1 dashboard BGĐ nhìn ra tuần này thừa/thiếu tiền** + audit toàn bộ sức khỏe tài chính.

## ✅ ĐÃ XONG — trụ "ĐI VAY" (tiền ra) trọn vẹn
| Module | Sheet Excel | Route |
|---|---|---|
| Khoản vay + đèn CIC nhảy nhóm + trả nợ | NỢ ĐẾN HẠN GỐC | `/finance/loans` |
| Lịch trả lãi (tự sinh kỳ) | (lãi) | `/finance/interest` |
| Tiền gửi (HĐTG) | HĐTG 2025/2026 | `/finance/deposits` |
| Hạn mức tín dụng (HĐTD) — trục nối | HĐTD, HĐ THẤU CHI | `/finance/credit-lines` |
| Tài sản đảm bảo (HĐBĐ) | HĐBĐ | `/finance/collaterals` |
| Đính kèm tài liệu (bucket private) | Hồ sơ | (mọi đối tượng) |
| Email "Tình trạng vốn vay đầu ngày" | — | edge `finance-loan-alert` |

→ Hạn mức giờ khép kín: được chống lưng bởi **tiền gửi + tài sản**, rút thành **nhiều khoản vay**, còn **room**.

## 🔜 CÒN LẠI — trụ "TIỀN VÀO" + dòng tiền

### Đợt 4 — Phải thu khách hàng *(đang làm)*
- Sheet `PHẢI THU KH` (186 dòng có tiền, ~40,16 triệu USD xuất khẩu).
- Bảng `fin_receivables`: buyer, contract_no (nối Đơn hàng bán), commodity, amount + currency (USD),
  ETD/ATD, term (ngày), **due_date** (hạn thu), bộ chứng từ (ngày DHL + tracking), bank, **ngày tiền về**, đã thu.
- Trang `/finance/receivables`: KPI (tổng phải thu / quá hạn / sắp về ≤30 ngày) + **bảng tuổi nợ (aging)**
  current · 1–30 · 31–60 · 61–90 · >90 + lọc + 📎 bộ chứng từ.
- Trạng thái derive: có ngày tiền về / đã thu đủ → **đã thu**; quá due → **quá hạn**; else pending/sắp về.

### Đợt 5 — Tồn quỹ 112 + Phải nộp định kỳ
- Sheet `QUỸ 112` (8 bank × VNĐ/USD/KÍP). Bảng `fin_cash_balances` (bank, currency, balance, as_of).
  Trang `/finance/cash`: lưới số dư đa tệ + tổng + ngày cập nhật.
- Sheet `CÁC KHOẢN ĐẾN KỲ PHẢI NỘP` (thuê TC ngày 10; điện 3 kỳ; bảo hiểm + lãi ngày 25).
  Bảng `fin_recurring_payables` (tên, nhóm, ngày trong tháng, số tiền ước). → nhắc vào **email sáng**.

### Đợt 6 — Dashboard dòng tiền tổng (AUDIT TOÀN BỘ)
- `/finance/cashflow`: 1 màn hình BGĐ.
  - **Tồn quỹ hiện tại** (112) đa tệ.
  - **Tiền VÀO 4 tuần tới** = phải thu đến hạn.
  - **Tiền RA 4 tuần tới** = nợ gốc đến hạn + lãi đến kỳ + phải nộp định kỳ.
  - **Net theo tuần** + cảnh báo thiếu hụt.
  - Thẻ "sức khỏe": dư nợ · room hạn mức · đảm bảo (gửi+tài sản) · phải thu · tồn quỹ.
- Email gộp "Tình trạng tài chính đầu ngày" (đổi tên từ vốn vay) — tiền vào + tiền ra + tồn quỹ.

## Nguyên tắc (go-live, audit)
- Migration idempotent; module **Admin-only** (AdminGate) vì dữ liệu mật.
- Mọi đối tượng đều **đính kèm chứng từ** được (bucket private, signed URL).
- Demo bằng seed `[seed-*]` xoá được; dữ liệu thật nhập tay hoặc import sau.
