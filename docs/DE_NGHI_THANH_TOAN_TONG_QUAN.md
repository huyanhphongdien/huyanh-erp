# Đề nghị thanh toán mủ — Tổng quan đọc hiểu

> Tài liệu này giải thích **tình huống & cách vận hành** của tính năng "Đề nghị thanh toán" chạy xuyên 3 app.
> - Bản trực quan (sơ đồ): [`DE_NGHI_THANH_TOAN_FLOW.html`](./DE_NGHI_THANH_TOAN_FLOW.html)
> - Kế hoạch kỹ thuật chi tiết: [`KE_HOACH_DE_NGHI_THANH_TOAN.md`](./KE_HOACH_DE_NGHI_THANH_TOAN.md)
>
> Cập nhật: 2026-05-29

---

## 1. Tình huống bằng một câu

Cuối mỗi ngày, nhân viên nhà máy phải tổng hợp **tất cả phiếu cân mủ trong ngày** thành **một phiếu Đề nghị thanh toán** (giống mẫu giấy đang làm tay), trình duyệt rồi chi tiền cho người bán. Việc này hiện làm thủ công, dễ sai và khó đối soát công nợ. Mục tiêu: **ERP tự làm phiếu này từ dữ liệu cân**.

Điều làm nó phức tạp: nó **đụng cả 3 app**, và mủ có thể **nằm trong một deal B2B** hoặc **mua lẻ không qua deal** — hệ thống phải xử lý linh hoạt cả hai mà không chi trùng tiền.

---

## 2. Ba app và vai trò

| App | Tên miền | Vai trò trong luồng này |
|-----|----------|--------------------------|
| **App Cân** (Weighbridge) | các subdomain nhà máy | **Sinh dữ liệu gốc**: mỗi xe cân = 1 phiếu cân (`weighbridge_tickets`). Lúc cân chọn nguồn Deal hay Mua lẻ. |
| **ERP nội bộ** | huyanhrubber.vn | **Tổng hợp · Duyệt · Ghi sổ**: gom phiếu cân → đề nghị thanh toán → duyệt → ghi công nợ → in phiếu. |
| **B2B Portal** | b2b.huyanhrubber.vn | **Đại lý xem & đối soát**: theo dõi deal, công nợ, quyết toán. Quyết toán = chốt giá trị, **không** phải đường chi tiền. |

---

## 3. Điểm mấu chốt: mọi thứ gom về phiếu cân

`weighbridge_tickets` là **điểm gom chung**. Mỗi phiếu cân **hoặc** gắn một deal, **hoặc** gắn một nhà cung cấp:

- **Gắn deal** → có `deal_id` + `partner_id` (đại lý B2B; hộ nông dân walk-in cũng tạo deal loại `farmer_walkin`).
- **Gắn NCC (mua lẻ)** → có `supplier_id`, không có `deal_id`.

Chính lựa chọn này — thực hiện ngay **lúc cân** trên App Cân — tạo ra khác biệt "lô trong deal / lô ngoài deal". Vì cả hai đều là dòng trong cùng bảng phiếu cân, nên **một đề nghị thanh toán gom được cả hai** một cách tự nhiên.

---

## 4. Luồng 5 bước

1. **(App Cân)** Cân từng xe → tạo phiếu cân, chọn nguồn Deal / Mua lẻ, ghi khối lượng + loại mủ + đơn giá.
2. **(ERP)** Cuối ngày vào **WMS / Nhập kho mủ**, lọc phiếu cân theo **nhà máy + ngày + loại mủ** (điều kiện `status='completed'` và chưa thuộc đề nghị nào) → tạo **1 đề nghị thanh toán** nhiều dòng.
3. **(ERP)** Mỗi dòng prefill người nhận tiền / khối lượng / đơn giá / thành tiền — **sửa được bằng tay** (vì thực tế đôi khi trả vào tài khoản người thân). In đúng mẫu giấy, mã `TMMN-{YYMM}-{seq}`.
4. **(ERP)** Kế toán/quản lý duyệt → khi chuyển `paid` thì sinh bút toán công nợ `payment_paid`. **Đây là cửa chi tiền duy nhất.**
5. **(Portal)** Lô trong deal: đại lý thấy công nợ giảm tương ứng; quyết toán B2B chỉ để **đối soát**.

---

## 5. Lô trong deal vs lô ngoài deal

Cả hai cùng chảy vào một đề nghị; chỉ khác cách truy nguồn & nhãn hiển thị:

| | Lô **trong deal** | Lô **ngoài deal** (mua lẻ) |
|---|---|---|
| Gắn ở phiếu cân | `deal_id` + `partner_id` | `supplier_id` |
| Người nhận (prefill) | Tên đại lý / partner | Tên NCC / người dân |
| Đơn giá | Kế thừa từ deal | Nhập khi cân |
| Nhãn dòng | "Deal #… · Đại lý A" | "Mua lẻ · NCC B" |
| Ảnh hưởng | Giảm công nợ đại lý trên Portal | Chi trực tiếp, không lên Portal |

**Vì sao linh hoạt được:** bộ lọc gom phiếu **không** phân biệt có deal hay không — chỉ cần phiếu đã hoàn tất và chưa nằm trong đề nghị nào. Từng dòng tự đọc `deal_id`/`supplier_id` để hiện nhãn và prefill người nhận.

---

## 6. Quyết định đã chốt: PA1 — một cửa chi tiền duy nhất

**Vấn đề:** lô trong deal có thể bị chi qua **2 đường** → trả trùng:
1. Đề nghị thanh toán (theo phiếu cân) → `payment_paid`
2. Quyết toán B2B (settlement) → `payment_paid`

**Đã chốt PA1:**
- **Đề nghị thanh toán là đường chi tiền DUY NHẤT** cho mọi mủ mua về (cả deal lẫn lẻ).
- Chỉ đề nghị thanh toán mới sinh `payment_paid`.
- Quyết toán / settlement chỉ để **chốt giá trị / đối soát**, không tự sinh chi.
- ⚠️ **Đợt 2 phải gỡ/tắt** đường app hiện đang ghi `payment_paid` từ settlement, nếu không sẽ trả trùng.

---

## 7. Triển khai 2 đợt (tóm tắt)

- **Đợt 1 — Tạo & In phiếu:** migration `wms_payment_request.sql` (2 bảng + cột `payment_request_id`), `paymentRequestService.ts`, 3 trang trong WMS/Nhập kho mủ, mẫu in khớp giấy, mã `TMMN-{YYMM}-{seq}`, người nhận gõ tay, chỉ VNĐ.
- **Đợt 2 — Duyệt & Ghi sổ:** workflow duyệt, ghi ledger `payment_paid`, **gỡ đường chi từ settlement (PA1)**, đa tiền tệ KIP/THB, phí xử lý dòng riêng.

Chi tiết kỹ thuật & quyết định: [`KE_HOACH_DE_NGHI_THANH_TOAN.md`](./KE_HOACH_DE_NGHI_THANH_TOAN.md).

---

## 8. Thuật ngữ nhanh

- **Phiếu cân** (`weighbridge_tickets`): 1 lần cân 1 xe. Dữ liệu gốc.
- **Đề nghị thanh toán** (`payment_requests` + `payment_request_lines`): phiếu tổng hợp cuối ngày để chi tiền. **Mới, Đợt 1 tạo.**
- **Quyết toán (settlement)**: chốt giá trị một đợt mủ của đại lý B2B. Theo PA1 = chỉ đối soát.
- **Công nợ** (`b2b_partner_ledger`): sổ debit/credit. Chi tiền = bút toán `payment_paid` (credit).
- **Lô trong deal / ngoài deal**: phiếu cân có `deal_id` hay chỉ có `supplier_id`.
