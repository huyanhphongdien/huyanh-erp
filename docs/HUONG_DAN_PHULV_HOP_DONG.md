# 📘 Hướng dẫn — PHÚ LV (Kiểm tra HĐ) — Quy trình Hợp Đồng Bán

> Đối tượng: Phú LV (`phulv@huyanhrubber.com`) + Minh LD (`minhld@huyanhrubber.com` — giám sát ngầm)
> Cập nhật: 2026-05-15

---

## 🎯 Trách nhiệm của Phú LV (Kiểm tra)

1. **Nhận HĐ mới từ Sale** — qua bell + email + chat
2. **Review thông tin** — đảm bảo HĐ đúng nội dung trước khi đưa lên ký
3. **Nhập bank info nhận tiền** — chọn ngân hàng từ dropdown (7 banks có sẵn) hoặc nhập tay
4. **Duyệt** → trình Trung/Huy ký
5. **Hoặc trả lại Sale** với lý do rõ ràng (9 nhóm category)
6. **Nếu Trung/Huy trả lại** → review + sửa lại

---

## 🔔 Nhận thông báo từ Sale

### Khi Sale submit HĐ mới hoặc trình lại:

**3 kênh thông báo song song:**
1. 🔔 **Bell ERP** — chuông góc phải trên (có số đỏ)
2. 📧 **Email** đến hộp thư cá nhân (`phulv@huyanhrubber.com`)
   - Subject: `📤 HĐ mới {số HĐ} cần kiểm tra + nhập bank`
   - Hoặc với resubmit: `🔄 HĐ {số HĐ} rev #N đã sửa — trình lại`
3. 💬 **System message** trong tab "💬 Trao đổi" của đơn

### Click vào bell hoặc email → mở thẳng queue Kiểm tra

URL: `/sales/contracts/review`

---

## 🟢 Bước 1: Vào Queue Kiểm tra HĐ

### 1.1. Menu sidebar
**Đơn hàng bán → Kiểm tra HĐ** (chỉ Phú LV + Minh thấy menu này)

### 1.2. Queue list
- Hiện tất cả HĐ status = `reviewing` (đang chờ duyệt)
- Filter: "Chỉ HĐ giao tôi" (mặc định) hoặc "Xem tất cả" (cả của Minh)
- Sort: HĐ submit gần nhất lên trên

### 1.3. Click 1 hàng → mở Drawer review chi tiết

---

## 🟢 Bước 2: Review thông tin

### 2.1. Card "Tóm tắt HĐ" (read-only)
Hiện toàn bộ thông tin Sale đã nhập:
- Số HĐ + Ngày HĐ
- KH (tên + địa chỉ)
- Grade + Số lượng + Đơn giá + Tổng
- Incoterm + POL/POD
- Đóng gói + Containers
- Shipment time + Payment
- Extra terms (nếu có)

### 2.2. Preview SC/PI để check format
- Bấm "Tải SC" / "Tải PI" / "Tải cả 2"
- File .docx tải về → mở Word kiểm tra format

⚠ **Lưu ý**: Bản tải về DÙNG bank info bạn đang nhập trong form — không phải bank đã save

---

## 🟢 Bước 3: Nhập Bank info (5 field bắt buộc)

### 3.1. Dropdown "Chọn nhanh ngân hàng" (recommend dùng)

Có **7 bank presets** sẵn sàng:
- 🏦 Vietin Bank — Hue Branch (default)
- 🏦 Vietcombank — Hue Branch
- 🏦 BIDV — Hue Branch
- 🏦 Agribank — Hue Branch
- 🏦 TP Bank — Hue Branch
- 🏦 Eximbank — Hue Branch
- 🏦 UOB — Ho Chi Minh City

→ Chọn 1 trong list → **5 field auto-fill** đầy đủ:
- Account name (luôn `HUY ANH RUBBER COMPANY LIMITED`)
- Account No.
- Bank full name (English cho L/C)
- Bank address
- SWIFT code

**Search**: Anh gõ `VCB` hoặc `7100...` hoặc `BIDV` → dropdown tự lọc

### 3.2. Nhập tay (cho edge case)
Nếu KH yêu cầu bank khác 7 list → nhập trực tiếp 5 field

### 3.3. Validate trước khi duyệt
- ❌ Không đủ 5 field → bấm Duyệt sẽ báo lỗi
- ✅ Đủ 5 field → cho phép duyệt

---

## 🟢 Bước 4: Duyệt + Trình ký

### 4.1. Bấm nút **"✅ Duyệt + Trình ký"** (xanh)

### 4.2. Modal confirm
> HĐ HA20260053 sẽ chuyển sang `approved`, trình Trung/Huy ký.
> Bank info đã chọn sẽ được lưu vào form_data và dùng cho file ký.

### 4.3. Sau khi bấm OK
- Status: `reviewing` → `approved`
- **3 kênh thông báo gửi đi**:
  - Trung/Huy nhận email "✍️ HĐ ... chờ ký + đóng dấu"
  - Sale nhận email "✅ HĐ ... đã được duyệt"
  - System message vào chat đơn

---

## 🔴 Bước 5: Trả lại Sale (nếu HĐ có vấn đề)

### 5.1. Bấm nút **"❌ Trả lại"** (đỏ)

### 5.2. Modal mở ra với 2 phần BẮT BUỘC

**Phần 1: 🏷 Lý do (chọn 1 hoặc nhiều)**

Dropdown multi-select với 9 nhóm:

| Icon | Category | Khi dùng |
|---|---|---|
| 💰 | Giá đơn / Đơn giá sai | Giá USD không khớp deal đã chốt |
| 🏢 | Tên / Địa chỉ KH sai | Thiếu PTE LTD, sai postal code |
| 🚢 | Incoterm / Port (POL/POD) sai | KH yêu cầu CIF nhưng HĐ ghi FOB |
| 📦 | Đóng gói / Số lượng / Bales | Sai số bales, sai loose/wooden |
| 💳 | Điều khoản thanh toán sai | KH yêu cầu L/C UPAS, HĐ ghi at sight |
| 📅 | Thời gian giao hàng sai | ETD không match |
| 📝 | Điều khoản kèm theo sai | Thiếu fumigation note |
| 🔢 | Số HĐ / Ngày HĐ sai | Số HĐ trùng đơn khác |
| ❓ | Khác | Edge case |

**Phần 2: 📝 Chi tiết (textarea bắt buộc)**

Ghi cụ thể để Sale biết phải sửa field nào, giá trị đúng là gì.

VD: *"Giá USD 2,435 không khớp với deal đã chốt — KH yêu cầu 2,420. POD phải là Colombo SL, HĐ ghi sai thành FOB Da Nang."*

### 5.3. Preview reason trước khi submit
Modal có dòng "**Reason sẽ lưu thành: [💰 Giá đơn · 🚢 Incoterm] — Giá USD ...**"

### 5.4. Bấm "Trả lại Sale" (đỏ)
- Status: `reviewing` → `rejected`
- Sale nhận email + bell + chat: "❌ HĐ ... bị trả lại — cần sửa"
- Sale mở HĐ → bấm "Sửa & Trình lại" → tạo revision mới

---

## 🔁 Bước 6: Khi Trung/Huy trả lại HĐ về Phú LV

### 6.1. Trường hợp xảy ra
Sau khi anh duyệt → Trung/Huy mở queue Ký → phát hiện sai (vd: bank account số sai, số HĐ trùng) → bấm "🔁 Trả lại Phú LV" với lý do.

### 6.2. Anh nhận thông báo
- 🔔 Bell: "🔁 Trung/Huy TRẢ LẠI HĐ ... — review lại"
- 📧 Email với lý do
- 💬 System message trong chat

### 6.3. Action
- Mở queue Kiểm tra → HĐ về trạng thái `reviewing` lại
- Bank info giữ nguyên (KHÔNG reset) — anh chỉ cần sửa field cụ thể Trung/Huy chỉ ra
- Duyệt lại → trình Trung/Huy lần nữa

---

## 📊 Audit log đầy đủ — Anh nên check

Tab Hợp đồng → nút **"🕐 Lịch sử"** → modal hiện toàn bộ event:

| Icon | Event | Hiển thị thông tin |
|---|---|---|
| 📨 Trình HĐ | Sale submit lần đầu | rev #1 |
| 🔁 Trình lại | Sale resubmit sau reject | rev #2+ |
| 👁 Xem | Ai mở/xem file | user + time |
| 📥 Tải về | Ai download SC/PI | file_name + time |
| ✅ Duyệt | Anh approve | reviewNotes |
| ❌ Trả lại Sale | Anh reject | reason |
| 🖊 Xác nhận đã duyệt | Trung/Huy confirm | time |
| 🔁 Trả Phú LV | Trung/Huy send back | reason |
| ✍️ Đã ký FINAL | Upload PDF FINAL | path |
| 📤 Tải lên | Sale upload file | file_name |
| 🗑 Xóa | Admin xóa file | file_name |
| 📁 Lưu trữ | Archive HĐ | — |

---

## ⚙️ State machine HĐ — Anh cần nắm rõ

```
   drafting       (Sale nháp, chưa submit)
       ▼ Sale "Submit"
  reviewing  ◀───────── (status anh xử lý)
       │
       │ Anh có 2 lựa chọn:
       │
   ┌───┴───┐
   ▼       ▼
 rejected   approved
    │         │
    │ Sale    │ Trung/Huy xác nhận
    │ resubmit  ai cũng in ký
    │         │
    │         ▼ Upload PDF FINAL (KH ký 2 bên)
    │
    └─→ INSERT row mới rev+1 → reviewing
              
            signed       (HĐ pháp lý sẵn sàng)
              ▼ Admin "Lưu trữ"
            archived     (Terminal)
```

---

## 🚨 Lưu ý quan trọng

1. **Bank info SAU KHI DUYỆT vẫn sửa được**: chỉ qua Trung/Huy trả lại → status về reviewing → anh nhập lại
2. **HĐ FINAL không xóa được**: chỉ admin emails (Minh/Thúy/Huy/Trung) — RLS DB guard
3. **Anh không thấy nút "Khóa HĐ"**: đơn workflow tự lock qua status `signed`/`archived`, KHÔNG dùng cờ `is_locked` cũ
4. **Email có thể delay ~1-2 phút** (qua Microsoft Graph API) — bell + chat real-time
5. **HĐ cũ trước 2026-05-14** không dùng workflow — anh không cần review

---

## 💬 Liên hệ hỗ trợ

- **Bug / thắc mắc tính năng**: Phòng IT — `minhld@huyanhrubber.com`
- **Quy trình nội bộ**: BGĐ (Trung — `trunglxh@huyanhrubber.com`, Huy — `huylv@huyanhrubber.com`)
