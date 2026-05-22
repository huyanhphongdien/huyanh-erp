# 📘 Hướng dẫn — PHÚ LV / MINH / LIỄU / MINH ANH — Duyệt HĐ + Auto-fill

> **Đối tượng:** Phú LV (`phulv@`), Minh LD (`minhld@`), Hồ Thị Liễu (`sales@`), Trần Thị Minh Anh (`logistics@`)
> **Vai trò:** Kiểm tra HĐ Docs trình + gõ Số HĐ + chọn Bank → ERP Auto-fill → trình Trung/Huy ký
> **Cập nhật:** 2026-05-22

---

## 🎯 Tổng quan workflow

```
Docs           →   Anh/chị (Kiểm tra)    →   Trung/Huy
─────────         ─────────────────────       ─────────
1. Tạo đơn        3. Nhận thông báo            7. In + ký + đóng dấu
2. Upload .docx   4. Mở HĐ trong Drawer       8. Gửi KH ký
                  5. 🪄 Auto-fill              9. Nhận FINAL upload
                  6. Duyệt + Trình ký
```

Anh/chị chỉ làm **bước 3-6**. Khoảng **30 giây/HĐ**.

---

## 🔔 Bước 1: Nhận thông báo

Khi Docs trình HĐ mới, anh/chị nhận:

1. 🔔 **Bell ERP** — chuông góc phải trên có số đỏ
2. 📧 **Email** đến hộp thư cá nhân
   - Subject: `📤 HĐ mới ... cần kiểm tra + nhập bank`
3. 💬 (Tương lai) System message trong tab "💬 Trao đổi" của đơn

**Click vào bell hoặc email → mở thẳng queue Kiểm tra**

---

## 📋 Bước 2: Vào Queue Kiểm tra HĐ

URL: **`huyanhrubber.vn/sales/contracts/review`**

Hoặc: Menu sidebar → **Đơn hàng bán → Kiểm tra HĐ** (chỉ 4 người trên thấy menu này)

### Queue list

Bảng hiện tất cả HĐ status `reviewing` (đang chờ duyệt):

| Cột | Ý nghĩa |
|---|---|
| **Số HĐ** | Hiện `(chưa có số)` nếu Docs chưa điền + Tag **📎 Upload** (flow file Docs upload) |
| **Khách hàng** | Tên KH |
| **Grade** | Cấp mủ (RSS_3, SVR_10...) |
| **Tấn/Cont** | Số lượng |
| **Giá trị USD** | Tổng đơn |
| **Incoterm** | FOB/CIF/... |
| **Người trình** | Tên Docs + giờ trình |

Bấm **"Mở"** ở row → **Drawer review** chi tiết bên phải.

---

## 📋 Bước 3: Review Drawer

### Layout Drawer

```
┌─ Header ────────────────────────────────────────────────┐
│ Review HĐ (chưa có số)        revision #1   📎 Upload   │
│                          [Trả lại]  [Duyệt + Trình ký]  │
├─────────────────────────────────────────────────────────┤
│ Alert hướng dẫn 4 bước                                  │
│ ┌─ 🪄 Card Auto-fill ──────────────────────────────────┐ │
│ │ * Số HĐ: [________]      Bank: [Chọn dropdown ▾]   │ │
│ │ [🪄 Auto-fill N file Docs upload]                   │ │
│ └──────────────────────────────────────────────────────┘ │
│ 📎 Xem N file Docs upload (gốc — collapsed) ▶          │
│ ┌─ ② File anh đã fill ─────────────────────────────────┐ │
│ │ ✅ sample_PI_CIF.docx  [Tải về verify]              │ │
│ │ ✅ sample_SC_CIF.docx  [Tải về verify]              │ │
│ └──────────────────────────────────────────────────────┘ │
│ ┌─ Tóm tắt đơn (read-only) ────────────────────────────┐ │
│ │ Số HĐ | HA20260100 | Revision | #1                  │ │
│ │ Khách hàng | APOLLO TYRES LTD (KH-APL)              │ │
│ │ Grade | RSS_3 | Incoterm | CIF                      │ │
│ │ Tấn/Cont | 42 MT / 3 cont | $/MT | $2,456           │ │
│ │ Tổng USD | $103,152                                 │ │
│ └──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## 📋 Bước 4: 🪄 Auto-fill — gõ Số HĐ + chọn Bank

### Card vàng cam 🪄 "Auto-fill — gõ Số HĐ + chọn Bank, ERP tự fill vào file"

#### 4.1. Số HĐ (BẮT BUỘC)

- Gõ số HĐ theo format Huy Anh quy định
- VD: `HA20260100`, `HA20260101`, `LTC2026/HA-BRS05` (format đặc biệt)
- **Drawer title live update** khi gõ — anh/chị thấy ngay "Review HĐ HA20260100"

#### 4.2. Bank nhận tiền (TUỲ CHỌN)

Dropdown với 7 ngân hàng có sẵn:
- **Vietin Bank — Hue Branch** (default — TK chính)
- **Vietcombank — Hue Branch**
- **BIDV — Hue Branch**
- **Agribank — Hue Branch**
- **TP Bank — Hue Branch**
- **Eximbank — Hue Branch**
- **UOB — Ho Chi Minh City**

Chọn 1 → ERP tự fill 5 field bank trong file (Account name, Account no, Bank name, Address, SWIFT).

> 💡 **Bank chưa quyết được?** Để trống dropdown → 5 field bank trong file render rỗng. Phú có thể:
> - **Duyệt revision sau** khi tài vụ chốt TK (Trung/Huy trả lại Phú → Phú chọn bank + Auto-fill lại + duyệt revision mới)
> - HOẶC SC ghi "Payment as per Commercial Invoice" → bank chỉ ở PI

#### 4.3. Bấm "🪄 Auto-fill N file Docs upload"

Đợi ~3-5 giây:
1. ERP download từng file Docs upload từ Storage
2. Render với 18+ token (số HĐ + 5 bank + 12 auto từ DB: buyer/grade/qty/price/incoterm/POL/POD/...)
3. Upload file đã render vào ô ②

→ Toast: "Đã auto-fill N file. Verify rồi bấm Duyệt + Trình ký."

---

## 📋 Bước 5: Verify file đã fill (RECOMMEND)

### Card ② "File anh đã fill"

Mỗi file hiện trong row xanh nhạt với:
- ✅ Tên file (đã strip prefix timestamp)
- **Nút "Tải về verify"** XANH ĐẬM (primary)

### Cách verify

1. Bấm **"Tải về verify"** → mở file trong Word
2. Kiểm tra 18+ vùng đã thay đúng:
   - ✅ `No.: HA20260100` (số HĐ anh gõ)
   - ✅ `THE BUYER: APOLLO TYRES LTD` + `ADDRESS: 7, INSTITUTIONAL AREA...`
   - ✅ `NATURAL RUBBER RSS3 | 42.00 MTS | 2,456 USD/MT | 98,952.00 USD`
   - ✅ `CIF — Yokohama, Japan` (hoặc POD nếu CIF)
   - ✅ `Bank: VIETIN BANK FOR INDUSTRY AND TRADE — HUE BRANCH` + `SWIFT: ICBVVNVX460`...
   - ✅ `Time of shipment: 30 May 2026` (hoặc "TBD" nếu chưa có)
   - ✅ `Beneficiary's Bank detail:` (không phải "Ben's")

3. Nếu file đúng → quay lại ERP bấm **Duyệt + Trình ký**
4. Nếu file SAI → 2 option:
   - **Auto-fill lại** với data khác (vd đổi bank, sửa số HĐ) → bấm 🪄 Auto-fill lần nữa
   - **Trả lại Sale** (xem bước 7) nếu data đơn sai

### Tóm tắt đơn (read-only) — đối chiếu nhanh

Card "Tóm tắt đơn (read-only)" phía dưới hiện:
- **Số HĐ** + Revision
- **Khách hàng** (name + code)
- **Grade + Incoterm** (Tag)
- **Tấn/Cont + $/MT**
- **Tổng USD** (highlight xanh)

→ So với file vừa download — phải khớp 100%. Nếu khác → có lỗi data trong sales_order.

---

## 📋 Bước 6: Duyệt + Trình ký

Bấm nút lớn xanh đậm góc phải trên: **"✅ Duyệt + Trình ký"**

### Modal confirm

```
Duyệt + Trình ký
HĐ HA20260100 sẽ chuyển sang [approved], trình Trung/Huy ký.
Sẽ copy 2 file đã fill (ưu tiên) + file gốc còn lại vào folder "HĐ gửi KH".

[Quay lại sửa]  [Duyệt + Trình ký]
```

Bấm **"Duyệt + Trình ký"** → confirm.

### Sau khi bấm

- ✅ Toast "Đã duyệt HĐ HA20260100 → trình ký"
- ✅ Drawer close, HĐ biến mất khỏi queue Kiểm tra
- ✅ HĐ status: `reviewing` → **`approved`**
- ✅ HĐ vào queue **Ký HĐ** (`/sales/contracts/sign`)
- ✅ **Trung + Huy + Minh + Minh Anh** nhận email + bell — họ vào ký
- ✅ Sale (người tạo) nhận email "✅ HĐ đã được duyệt"
- ✅ File đã fill **auto-copy** vào tab Hợp đồng của đơn → folder "📤 HĐ gửi KH"

---

## 📋 Bước 7: (Khi cần) Trả lại Sale

### Khi nào Trả lại?

- Giá đơn / đơn giá sai
- Tên KH / địa chỉ thiếu
- Incoterm / POL / POD sai
- Đóng gói / Số lượng / bales sai
- Điều khoản thanh toán không phù hợp
- Thời gian giao hàng không đúng
- Điều khoản kèm theo sai
- Số HĐ / Ngày HĐ sai
- Khác (ghi chi tiết)

### Cách trả lại

1. Bấm nút **"🚫 Trả lại"** ở header (cạnh "Duyệt + Trình ký")
2. Modal mở ra:
   - **Chọn lý do** (multi-select, 9 nhóm category)
   - **Chi tiết** (TextArea — bắt buộc, ghi cụ thể Sale sửa gì)
3. Bấm **"Trả lại Sale"**

### Sau khi Trả lại

- ✅ HĐ status: `reviewing` → **`rejected`**
- ✅ Sale (Docs) nhận email + bell với full lý do
- ✅ HĐ biến mất khỏi queue Kiểm tra
- ✅ Sale vào HĐ → bấm "Sửa & Trình lại" → upload revision mới (`revision #2`)

---

## ⚠ Trường hợp đặc biệt

### TH1: File template chưa có placeholder `{{...}}`

**Triệu chứng:** Bấm Auto-fill → toast warning "N file lỗi" + Modal liệt kê file nào fail.

**Nguyên nhân:** Docs upload file dùng template cũ (highlight vàng) thay vì placeholder `{{...}}`.

**Cách xử lý fallback:**
1. Mở section "📎 Xem N file Docs upload (gốc)" (expand) → bấm "Tải" download file gốc
2. Mở Word → fill thủ công 2 vùng highlight (số HĐ + bank)
3. Save file
4. Vào dropzone ô ② → kéo thả file đã fill (REPLACE bộ cũ)
5. Bấm Duyệt + Trình ký

**Báo Docs sửa template** theo file hướng dẫn `HUONG_DAN_DOCS_TEMPLATE_HOP_DONG.docx`.

### TH2: KH chưa có Address trong DB

**Triệu chứng:** File HĐ render `ADDRESS:` rỗng sau khi Auto-fill.

**Cách xử lý:**
1. Trả lại Sale với lý do "Tên / Địa chỉ KH sai" + ghi chú "KH chưa có address — chị vào /sales/customers update"
2. Hoặc: anh/chị tự vào `/sales/customers` mở KH → điền address + save → quay lại Auto-fill lại

### TH3: Trung/Huy trả lại — Phú phải review lại

**Triệu chứng:** HĐ từ status `approved` quay về `reviewing` với note "Trung/Huy trả lại".

**Cách xử lý:**
1. Mở HĐ trong queue Kiểm tra (re-appear)
2. Đọc `review_notes` (note Trung/Huy viết)
3. Sửa Bank / Số HĐ → Auto-fill lại
4. Duyệt + Trình ký lần 2

### TH4: Auto-fill nhiều lần (đổi bank/số HĐ)

Cứ Auto-fill thoải mái — mỗi lần bấm sẽ REPLACE bộ file ở ô ②. File cũ trong Storage tự xóa, không leak.

---

## 🎯 Tổng kết — workflow Phú duyệt

```
1. Nhận bell/email "HĐ mới cần kiểm tra"
2. /sales/contracts/review → Mở HĐ
3. Card 🪄: gõ Số HĐ + chọn Bank
4. Bấm Auto-fill 2 file
5. Bấm "Tải về verify" → kiểm Word file đúng chưa
6. Đối chiếu Tóm tắt đơn (read-only)
7. Bấm "Duyệt + Trình ký" → HĐ chuyển Trung/Huy
```

**Thời gian/HĐ: ~30 giây - 1 phút** sau khi quen.

---

## ❓ FAQ

### Q1: Tôi với Phú LV / Minh / Liễu cùng có quyền duyệt — ai vào trước duyệt?
**A:** Ai vào queue trước thấy HĐ thì duyệt được. Cả 4 người dùng chung queue. Nếu cùng mở 1 HĐ → người duyệt trước thì người sau sẽ thấy HĐ biến mất (hoặc lỗi optimistic lock).

### Q2: Tôi duyệt nhầm — undo được không?
**A:** Không undo được trực tiếp. Phải:
1. Sang queue Ký HĐ
2. Mở HĐ vừa duyệt
3. Bấm "Trả lại Phú LV" với lý do
4. HĐ quay về queue Kiểm tra → anh/chị Auto-fill lại + duyệt lại

### Q3: Phải verify file mỗi lần không?
**A:** Lần đầu **NÊN** verify (lỗi template/data có thể có). Sau khi quen + tin tưởng → có thể skip verify, bấm Duyệt thẳng.

### Q4: Trung/Huy ký xong tôi có nhận thông báo không?
**A:** Có. Nhận email "🎉 HĐ ... đã ký + đóng dấu" khi Trung/Huy upload bản FINAL (KH ký 2 bên).

### Q5: HĐ revision nhiều (rev #2, #3, #4...) — sao biết khác gì?
**A:** Mỗi revision là 1 contract row riêng trong DB. `review_notes` có lý do cũ. Sale phải trình LẠI từ đầu (form mới + upload file mới). Hệ thống auto-tăng `revision_no`.

### Q6: TEST_MODE email — chỉ tôi nhận thì sao Sale biết?
**A:** Hiện tại đang test → tất cả email vào hộp Minh. Khi rollout, Minh sẽ tắt flag → mỗi role nhận email đúng người. Tạm thời Minh forward email cần thiết cho người liên quan.

### Q7: Tôi muốn xem audit log — ai làm gì lúc nào?
**A:** Bảng `sales_contract_access_log` trong DB ghi đầy đủ. Hoặc Minh LD cung cấp report khi cần.

---

## 📞 Liên hệ khi có vấn đề

- **Auto-fill fail / template không nhận**: báo Minh LD check template
- **Bank thiếu / sai info**: báo Minh check BANK_PRESETS config
- **Email không nhận**: check spam / báo Minh
- **HĐ kẹt trong queue không tiến**: báo Minh check RLS / status DB
