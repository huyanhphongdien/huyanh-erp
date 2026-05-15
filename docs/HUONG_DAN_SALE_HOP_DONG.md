# 📘 Hướng dẫn — SALE — Quy trình Hợp Đồng Bán

> Đối tượng: Hồ Thị Liễu (`sales@huyanhrubber.com`) và các Sale khác
> Cập nhật: 2026-05-15

---

## 🎯 Trách nhiệm của Sale trong quy trình HĐ

1. **Lên HĐ mới** — tạo đơn + sinh HĐ tự động từ template
2. **Trình HĐ cho Phú LV duyệt** — Sale **KHÔNG** nhập bank info (Phú LV nhập)
3. **Sửa & trình lại** nếu bị trả lại
4. **Sau khi HĐ được duyệt + Trung/Huy xác nhận**:
   - In + ký + đóng dấu (Sale có thể tự làm)
   - Upload bản scan vào folder "HĐ HA đã ký"
   - Gửi cho khách qua email/chat
5. **Khi KH gửi lại bản đã ký 2 bên** → Sale upload vào folder "HĐ FINAL"

---

## 🟢 Bước 1: Lên HĐ mới

### 1.1. Vào Compose Studio
Menu: **Đơn hàng bán → Tạo đơn hàng mới**

### 1.2. Điền form

| Field | Ghi chú |
|---|---|
| Số HĐ | Sale tự đặt (`HA20260053` chẳng hạn) |
| Ngày HĐ | Chọn date picker |
| Khách hàng | Chọn từ dropdown (đã có sẵn — nếu chưa có thì vào **Khách hàng → Thêm mới**) |
| Grade + Quantity + Đơn giá | Multi-item: có thể thêm nhiều grade trong 1 HĐ |
| Đóng gói (`packing_type`) | loose_bale / sw_pallet / wooden_pallet / metal_box |
| Incoterm | FOB / CIF / CNF / DDP / EXW |
| POL/POD | Cảng xếp/đích |
| Shipment time | Text tự do — VD: "June, 2026" |
| Payment terms | Tag chọn nhanh + textarea override nếu khác |
| Điều kiện kèm theo | Partial / Trans / Claims days / Freight mark |
| Điều khoản bổ sung | Tối đa 300 ký tự — clause đặc thù của KH |
| **Bank info** | ⚠ **KHÔNG có ở form Sale** — Phú LV sẽ nhập khi review |

### 1.3. Preview SC/PI
- Bấm "**Preview SC**" / "**Preview PI**" / "**Preview SC + PI**"
- File .docx tải về để xem trước
- ⚠ **CẢNH BÁO**: Bản preview dùng bank info DEFAULT (Vietin Hue) — **KHÔNG gửi KH bản này!**

### 1.4. Lưu nháp HOẶC Submit cho Phú LV
- **Lưu nháp**: lưu lại để chỉnh sau (status = `drafting`)
- **Submit + trình Phú LV**: chuyển sang status `reviewing`, Phú LV nhận email + bell

---

## 🟡 Bước 2: Khi bị Phú LV trả lại

### 2.1. Anh nhận **3 kênh thông báo**:
- 🔔 **Bell ERP** (chuông góc phải trên) — đỏ với số
- 📧 **Email** đến hộp thư cá nhân
- 💬 **Tin nhắn system** trong tab "💬 Trao đổi" của đơn

### 2.2. Lý do trả lại — Phú LV chọn từ 9 nhóm:
- 💰 Giá đơn / Đơn giá sai
- 🏢 Tên / Địa chỉ KH sai
- 🚢 Incoterm / Port (POL/POD) sai
- 📦 Đóng gói / Số lượng / Bales
- 💳 Điều khoản thanh toán sai
- 📅 Thời gian giao hàng sai
- 📝 Điều khoản kèm theo sai
- 🔢 Số HĐ / Ngày HĐ sai
- ❓ Khác (kèm chi tiết)

### 2.3. Sửa & Trình lại

**Cách 1: Sửa nhanh trong Drawer (nếu chỉ ≤22 field cơ bản)**
- Mở đơn → Tab Tiến độ → Bấm **"Sửa & Trình lại"** trong contract card đỏ
- Drawer mở ra với 5 nhóm fields (📋 HĐ / 🏢 Buyer / 💰 Commodity / 📦 Packing / 🚢 Trade / 💳 Payment)
- Sửa → **Trình lại** → tạo **revision mới (rev #2, #3, ...)**

**Cách 2: Sửa toàn bộ trong Compose Studio**
- Trong Drawer trên, có link "*Hoặc mở Compose Studio để sửa toàn bộ →*"
- Click → mở full form Compose Studio

### 2.4. Lưu ý quan trọng
- **KHÔNG sửa được bank info** — chỉ Phú LV nhập
- **Revision auto-increment** — DB tự +1, KHÔNG mất history

---

## 🟢 Bước 3: HĐ được duyệt → Trung/Huy xác nhận

### 3.1. Khi Phú LV duyệt
- Anh nhận email: "✅ HĐ ... đã được duyệt"
- Status đơn: `approved`
- HĐ chuyển sang queue Ký của Trung/Huy

### 3.2. Trung/Huy review & xác nhận
- Trung hoặc Huy mở queue Ký HĐ
- Có **2 lựa chọn**:
  - ✅ **Xác nhận đã duyệt** → HĐ sẵn sàng để in
  - 🔁 **Trả lại Phú LV** → nếu phát hiện sai bank/giá. Phú LV review lại → có thể đến tay Sale nếu cần sửa

### 3.3. Sau khi Trung/Huy xác nhận → Anh in HĐ
- "Ai cũng in ký được" — không bắt buộc Trung/Huy phải tự in
- Mở Tab Tiến độ → Bấm "📥 Tải SC" hoặc "Tải PI" hoặc "Tải SC + PI"
- File .docx mở trong Word → Print A4
- **2 bản** mỗi loại (1 cho KH, 1 lưu HA)

### 3.4. Ký + đóng dấu HA
- Trung/Huy ký vào ô "FOR THE SELLER"
- Đóng dấu công ty

### 3.5. Scan thành PDF + upload
- Scanner office → file PDF
- Vào **Tab Hợp đồng** → bấm **"✍️ HĐ HA đã ký"** → upload PDF
- File hiện trong folder "HĐ HA đã ký" của widget Tài liệu

### 3.6. Gửi cho KH
- Tải file vừa upload về máy
- Đính kèm email gửi KH (qua Outlook/Gmail) — yêu cầu KH ký + đóng dấu lại + gửi PDF FINAL về

---

## 🟢 Bước 4: KH gửi lại bản FINAL → Anh upload

### 4.1. KH gửi PDF FINAL (có chữ ký 2 bên + 2 dấu)
- Lưu PDF từ email về máy

### 4.2. Upload vào folder FINAL
- Vào đơn → **Tab Hợp đồng** → bấm **"✅ HĐ FINAL (2 bên)"**
- Chọn PDF → upload
- ⚠ **Quan trọng**: File này là **bản pháp lý** — phải đảm bảo có chữ ký + dấu **CỦA CẢ 2 BÊN** rồi mới upload

### 4.3. Đánh dấu FINAL
- Vào queue Ký (chỉ Trung/Huy hoặc admin) → mở HĐ → bấm **"Đánh dấu FINAL (KH đã ký lại)"**
- Status đơn: `signed` → workflow hoàn tất

### 4.4. Lưu trữ (optional)
- Admin/BGĐ có thể bấm "📁 Lưu trữ" → status: `archived` (terminal)

---

## 🔧 Action buttons ở header detail panel

| Nút | Chức năng |
|---|---|
| 🔗 **Copy link** | Copy URL đơn vào clipboard |
| 📥 **Xuất PDF** | In trang detail → Save as PDF qua browser dialog |
| ⚡ **Hành động** (dropdown) | • 📋 Copy thông tin đơn (clipboard multi-line)<br>• 💬 Mở chat đơn<br>• 📁 Xem tài liệu đính kèm<br>• 🚫 Hủy đơn (Sale + Admin, với lý do) |

---

## 📂 3 folder HĐ — phân biệt rõ

```
📁 Hợp đồng (parent — Tab Tiến độ widget Tài liệu)
   ├─ 📤 HĐ gửi KH         (sent_to_customer)
   │     Drafts gửi khách duyệt — có thể nhiều revision
   │     • rev1_HA20260053_SC.docx
   │     • rev2_HA20260053_SC.docx
   │
   ├─ ✍️ HĐ HA đã ký        (ha_signed)
   │     Bản scan PDF Huy Anh ký + đóng dấu (1 bên)
   │     • HA20260053_ha_signed.pdf
   │
   └─ ✅ HĐ FINAL (2 bên)   (final_signed)
         Bản scan PDF có chữ ký + dấu CỦA CẢ 2 BÊN — PHÁP LÝ
         • HA20260053_FINAL_signed_both.pdf
```

## 🚨 Lưu ý quan trọng

1. **KHÔNG bao giờ gửi bản "Preview" cho KH** — đó là bản DEFAULT bank Vietin, có thể sai bank
2. **CHỈ gửi bản trong folder "HĐ HA đã ký"** sau khi Trung/Huy đã xác nhận
3. **Bank info do Phú LV nhập** — Sale không có quyền nhập/sửa
4. **Cancel đơn** — Sale có thể cancel khi status chưa terminal (draft/confirmed/producing)
   - Yêu cầu nhập **lý do bắt buộc**
   - Status → `cancelled` (audit log + append vào notes)
5. **Tất cả hành động đều có log** — tab Hợp đồng → nút "🕐 Lịch sử" hiện 13 event types với timestamp + user

---

## 💬 Liên hệ hỗ trợ

- **Bug / thắc mắc tính năng**: Phòng IT — `minhld@huyanhrubber.com`
- **Quy trình nội bộ**: BGĐ
