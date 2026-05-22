# 📘 Hướng dẫn — DOCS (Nhung + Phương Anh) — Đổi template HĐ từ Highlight vàng sang Placeholder text

> **Đối tượng:** Nhung + Phương Anh (Docs)
> **Mục đích:** Đổi 4 template HĐ master 1 lần → Phú LV không phải mở Word fill thủ công nữa
> **Thời gian thực hiện:** ~10 phút (làm 1 lần duy nhất, lợi mãi)
> **Cập nhật:** 2026-05-22

---

## ❓ Tại sao 2 ngoặc `{{...}}` thay vì 1 ngoặc `{...}`?

> Nhung/Phương Anh có thể đã thấy các template CŨ trong máy với `{contract_no}`, `{contract_date}`... **1 ngoặc**. Đó là format **compose flow cũ (deprecated)** — ERP tự render TOÀN BỘ HĐ từ form Sale. Workflow đó không còn dùng.

**Workflow MỚI (upload flow)** — Docs upload file, ERP chỉ fill **6 trường** — bắt buộc dùng **2 ngoặc**:

| Format | Ý nghĩa | Khi nào dùng |
|--------|---------|--------------|
| `{contract_no}` (1 ngoặc) | ❌ Format CŨ (compose flow deprecated) — ERP cũ tự render full HĐ | Đừng dùng cho HĐ mới |
| `{{contract_no}}` (2 ngoặc) | ✅ Format MỚI (upload flow) — ERP chỉ fill 6 trường | Dùng cho mọi HĐ từ giờ |

**Lý do dùng 2 ngoặc:** Tránh nhầm với các text bình thường có dấu `{` hoặc `}` trong HĐ (vd: ghi chú, công thức, ký hiệu). 2 ngoặc gần như không bao giờ xuất hiện ngẫu nhiên trong HĐ thực tế.

**Action cho chị Nhung/Phương Anh:**
1. Nếu template hiện tại có `{contract_no}` (1 ngoặc) → đổi thành `{{contract_no}}` (2 ngoặc) — thêm 1 ngoặc mỗi bên
2. Áp dụng tương tự cho 5 token bank (xem bảng bên dưới)
3. Các token CŨ khác (vd: `{buyer_name}`, `{grade}`, `{quantity}`...) → **xóa và gõ giá trị thật** vào per HĐ. Workflow mới Docs custom HĐ theo từng khách, ERP không tự fill các trường này.

> 💡 Quick check: trong Word bấm **Ctrl+F** → tìm `{` (1 ngoặc) → nếu còn token nào dạng 1 ngoặc trong template chính (HĐ chính + PI), sửa hết thành 2 ngoặc cho 6 token chính, hoặc thay bằng giá trị thật cho các token khác.

---

## 🎯 Vì sao phải đổi?

### Tình trạng hiện tại

Mỗi HĐ mới, quy trình giữa Docs ↔ Phú đang là:

1. **Docs:** Mở template gốc → copy ra HĐ mới → custom buyer/grade/giá → để **highlight vàng** ở 2 chỗ (số HĐ + bank) → upload ERP
2. **Phú LV:** Download file → mở Word → click vào vùng vàng → gõ số HĐ + bank info → save → upload lại ERP
3. **Mất ~3 phút/HĐ** cho Phú × N HĐ/tuần = nhiều thời gian

### Sau khi đổi

1. **Docs:** Mở template (đã sửa sẵn theo hướng dẫn này) → custom buyer/grade/giá → upload ERP (giữ nguyên các `{{...}}`)
2. **Phú LV:** Vào ERP, gõ số HĐ + chọn ngân hàng từ dropdown → bấm **"🪄 Auto-fill"** → ERP tự fill vào file → bấm Duyệt
3. **Chỉ ~30 giây/HĐ.** Docs không tốn thêm thời gian gì so với hiện tại.

---

## 📂 4 file template cần sửa

Đây là **file master** của Docs (lưu chỗ nào quen — Drive, máy cá nhân, OneDrive...). Có **4 biến thể** tùy loại HĐ:

| File | Khi nào dùng |
|------|---|
| `HA_template_SC_FOB.docx` | Sales Contract (HĐ chính) — Incoterm FOB |
| `HA_template_SC_CIF.docx` | Sales Contract (HĐ chính) — Incoterm CIF |
| `HA_template_PI_FOB.docx` | Proforma Invoice / Commercial Invoice — FOB |
| `HA_template_PI_CIF.docx` | Proforma Invoice / Commercial Invoice — CIF |

> 💡 Tên file có thể khác tùy chị đang đặt. Cứ tìm 4 file gốc tương ứng 4 loại HĐ này.

---

## 🔧 Cách sửa — Step by step

### Bước 1: Mở file template gốc trong Word

VD: `HA_template_SC_FOB.docx`

### Bước 2: Tìm các vùng **highlight vàng** (số HĐ + bank info)

Mở file ra, tìm những đoạn đang để trống/có highlight vàng. Có **6 vùng** điển hình:

| # | Vùng | Vị trí trong HĐ |
|---|---|---|
| 1 | **Số HĐ** | Đầu HĐ — "SALES CONTRACT No.: ___" |
| 2 | **Tên TK ngân hàng** | Cuối HĐ — phần "Account Name: ___" |
| 3 | **Số TK** | "Account No.: ___" |
| 4 | **Tên đầy đủ ngân hàng** | "Bank: ___" |
| 5 | **Địa chỉ ngân hàng** | "Address: ___" |
| 6 | **SWIFT code** | "SWIFT: ___" |

### Bước 3: Xóa highlight vàng, gõ vào đúng vùng đó **token text**

Thay vùng trống/highlight bằng các token chính xác sau (chú ý: **CHÍNH XÁC từng ký tự**, không dấu cách thừa):

| Vùng | Gõ vào file |
|---|---|
| Số HĐ | `{{contract_no}}` |
| Tên TK ngân hàng | `{{bank_account_name}}` |
| Số TK | `{{bank_account_no}}` |
| Tên đầy đủ ngân hàng | `{{bank_full_name}}` |
| Địa chỉ ngân hàng | `{{bank_address}}` |
| SWIFT code | `{{bank_swift}}` |

### Bước 4: Xóa background vàng

Sau khi gõ token vào, có thể vùng đó vẫn còn highlight vàng từ trước. Bôi đen → menu **Home → Text Highlight Color → No Color** để xóa.

### Bước 5: Save file (Ctrl+S)

**Quan trọng:** Save dưới dạng `.docx` (không phải `.doc`).

### Bước 6: Lặp lại Bước 1-5 cho 3 file template còn lại

---

## ✅ Ví dụ Trước / Sau

### Trước (file template hiện tại)

```
SALES CONTRACT
No.: ░░░░░░░░░░░░          ← highlight vàng, trống
Date: 22 May 2026

Buyer: APOLLO TYRES LTD
Address: ...

...

PAYMENT:
Account Name: ░░░░░░░░░░░░░░░░░░░░░░    ← highlight vàng
Account No.:  ░░░░░░░░░░                ← highlight vàng
Bank:         ░░░░░░░░░░░░░░░░░░░░░░    ← highlight vàng
Address:      ░░░░░░░░░░░░░░░░░░░░░░    ← highlight vàng
SWIFT:        ░░░░░░░░                  ← highlight vàng
```

### Sau (file template sửa xong)

```
SALES CONTRACT
No.: {{contract_no}}                    ← token, KHÔNG highlight
Date: 22 May 2026

Buyer: APOLLO TYRES LTD
Address: ...

...

PAYMENT:
Account Name: {{bank_account_name}}
Account No.:  {{bank_account_no}}
Bank:         {{bank_full_name}}
Address:      {{bank_address}}
SWIFT:        {{bank_swift}}
```

---

## ⚠️ 5 LỖI THƯỜNG GẶP — TRÁNH NGAY

### ❌ Lỗi 1: Format trong token

**SAI:** Bôi đậm/in nghiêng/màu khác ngay GIỮA token

```
{{contract_no}}     ← phần "contract" bị bôi đậm
```

**ĐÚNG:** Toàn bộ token cùng 1 format (cùng font, cùng size, cùng màu).

> 💡 Cách test: bôi đen toàn bộ `{{contract_no}}` (cả 2 dấu `{{` lẫn `}}`) — nếu hiện **B** ở thanh format khi click vào giữa token thì OK.

### ❌ Lỗi 2: Gõ thiếu/thừa dấu ngoặc

**SAI:**
- `{contract_no}` (chỉ 1 ngoặc)
- `{{contract_no}` (thiếu 1 ngoặc cuối)
- `{{ contract_no }}` (có dấu cách thừa)

**ĐÚNG:** `{{contract_no}}` — chính xác 2 mở + 2 đóng + không cách

### ❌ Lỗi 3: Sai tên biến

**SAI:**
- `{{contract-no}}` (gạch ngang thay vì gạch dưới)
- `{{contractno}}` (thiếu gạch dưới)
- `{{Contract_No}}` (viết hoa)

**ĐÚNG:** Chính xác như bảng ở Bước 3. Tất cả **chữ thường + gạch dưới `_`**.

### ❌ Lỗi 4: Copy-paste từ chỗ khác mang theo format ẩn

Khi copy `{{contract_no}}` từ file/website khác paste vào Word, có thể mang theo định dạng vô hình làm Word chia token thành nhiều "run" XML → ERP không nhận.

**Cách an toàn:** Gõ TAY 6 token trực tiếp trong Word, không copy-paste.

Nếu phải copy-paste: **Paste Special → Unformatted Text** (Ctrl+Alt+V → chọn "Unformatted Text").

### ❌ Lỗi 5: Để sót highlight vàng

Sau khi gõ token, kiểm tra lại file — không được còn vùng vàng nào nữa. Nếu còn → ERP có thể fill nhầm chỗ.

> 💡 Cách check nhanh: Ctrl+F → tìm `░` không ra → trong View → chọn xem highlight cả file.

---

## 🧪 Test sau khi sửa

Sau khi sửa xong 4 template, chị test thử 1 HĐ:

1. Mở `HA_template_SC_FOB.docx` đã sửa
2. Save as → đổi tên thành `TEST_SC_FOB.docx` (giữ template gốc nguyên)
3. Custom thông tin buyer/grade/giá như HĐ thật
4. Upload lên ERP test (HĐ thử) ở `/sales/orders/new`
5. Gọi Phú LV bấm Auto-fill → check xem 6 vùng có fill đúng không

Nếu OK → dùng cho production. Nếu sai chỗ nào → báo Minh để check token nào lệch.

---

## 📝 Bảng tổng kết 6 token

In ra dán cạnh bàn cho dễ nhớ:

```
┌────────────────────────────────────────────────┐
│ TOKEN HĐ — Docs điền vào file template Word   │
├────────────────────────────────────────────────┤
│ Số HĐ:               {{contract_no}}           │
│ Tên TK ngân hàng:    {{bank_account_name}}     │
│ Số tài khoản:        {{bank_account_no}}       │
│ Tên đầy đủ NH:       {{bank_full_name}}        │
│ Địa chỉ ngân hàng:   {{bank_address}}          │
│ SWIFT code:          {{bank_swift}}            │
├────────────────────────────────────────────────┤
│ ⚠ Tất cả chữ thường, gạch dưới _,             │
│   chính xác 2 ngoặc `{{` mở + `}}` đóng,       │
│   không có dấu cách thừa.                      │
└────────────────────────────────────────────────┘
```

---

## ❓ FAQ

### Q: Có thay đổi nội dung HĐ không?
**A: Không.** Chỉ đổi 6 vùng để trống thành token. Tất cả nội dung khác (điều khoản, giá, format, font) giữ nguyên y nguyên.

### Q: Sau này thêm bank mới (vd. Eximbank) thì có phải sửa template không?
**A: Không.** Bank info chứa trong token `{{bank_*}}`, ERP sẽ fill bất cứ bank nào Phú LV chọn. Template không cần biết bank nào.

### Q: HĐ có nhiều phụ lục (Packing List, Annex…) thì sao?
**A:** Nếu phụ lục có số HĐ → cũng gõ `{{contract_no}}` vào. Nếu phụ lục không có số HĐ → giữ nguyên file. ERP fill được multi-file (max 10 file/HĐ).

### Q: HĐ chưa quyết bank (KH confirm sau) thì sao?
**A:** Phú LV vẫn upload + duyệt được. Token bank sẽ render thành `(See Commercial Invoice)` cho SC hoặc để trống cho PI. Khi tài vụ chốt bank → Phú LV mở HĐ → fill bank → duyệt revision mới.

### Q: Em đã quen với highlight vàng, đổi sang token có khó không?
**A:** Không khó hơn. Cả 2 cách đều là "đặt placeholder ở vị trí cần điền". Highlight vàng = visual marker, token = text marker. Token có ưu thế là ERP đọc được, highlight thì không.

---

## 📞 Liên hệ khi có vấn đề

- Hỏi Minh LD nếu không biết token đúng/sai
- Hỏi Phú LV nếu Auto-fill không hoạt động sau khi sửa template
- Báo Minh LD nếu thấy ý tưởng cải tiến quy trình

---

**Lưu ý cuối:**
Sửa 4 file template là việc làm **1 lần duy nhất**. Sau đó mỗi HĐ mới, Docs làm y nguyên quy trình hiện tại (mở template → custom → upload). Khác biệt duy nhất: vùng vàng → token. ERP lo phần còn lại.
