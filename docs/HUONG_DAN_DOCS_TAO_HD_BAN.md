# 📘 Hướng dẫn — DOCS (Nhung + Phương Anh) — Tạo Hợp Đồng Bán

> **Đối tượng:** Nhung (`nhungtt@huyanhrubber.com`) + Phương Anh (`anhlp@huyanhrubber.com`)
> **Vai trò:** Tạo đơn hàng bán → upload template HĐ → trình Phú LV duyệt
> **Cập nhật:** 2026-05-22

---

## 🎯 Tổng quan workflow

```
Docs (chị)         →   Phú LV         →   Trung/Huy
─────────────────       ───────────────     ─────────────
1. Tạo đơn ERP          4. Auto-fill       6. In + ký + đóng dấu
2. Upload template      5. Duyệt           7. Gửi KH ký
3. Submit                                  8. Nhận FINAL → upload
```

Chị chỉ làm **bước 1-3**. Khi xong, hệ thống tự chuyển HĐ qua Phú.

---

## 📋 Bước 1: Vào trang Tạo đơn

URL: **`huyanhrubber.vn/sales/orders/new`**

Hoặc: Menu sidebar → **Đơn hàng bán → Đơn hàng → + Tạo mới**

---

## 📋 Bước 2: Điền thông tin Hợp đồng

### Card "📋 Thông tin Hợp đồng"

| Trường | Điền gì | Bắt buộc? |
|---|---|---|
| **Khách hàng (Buyer)** | Chọn KH từ dropdown. Chưa có → "+ Thêm KH mới" (chú ý điền **address + phone** cho KH) | ✅ |
| **Số HĐ** | **BỎ TRỐNG** — Phú sẽ điền | ❌ |
| **Ngày HĐ** | Mặc định **hôm nay**. Sửa nếu HĐ ký ngày khác | ❌ |
| **PO# khách hàng** | Số PO bên KH (nếu có, vd `APL-2026-001`) | ❌ |

> 💡 **Smart prefill**: Khi chọn KH có đơn cũ → hệ thống tự fill **Incoterm + POL + POD + Grade + Đóng gói + Payment** từ đơn gần nhất → chỉ cần verify/sửa nếu khác.

---

## 📋 Bước 3: Điền Sản phẩm & Giá

### Card "Sản phẩm & Giá"

Mỗi sản phẩm là 1 row. Đa số HĐ chỉ có **1 sản phẩm**. HĐ nhiều mặt hàng → bấm "+ Thêm SP".

| Trường | Điền gì | Required |
|---|---|---|
| **\* Grade** | `SVR3L`, `SVR10`, `SVR_CV50`, `RSS3`, `SBR1502`... (dropdown gợi ý hoặc tự gõ) | ✅ |
| **\* Tấn** | Tổng tấn HĐ (VD `42`) | ✅ |
| **\* $/tấn** | Đơn giá USD/MT (VD `2,350`) | ✅ |
| **KG/bành** | Tích `33.33` HOẶC `35` (hoặc cả 2 nếu HĐ multi-bale-weight) | ❌ default 35 |
| **Bành/cont** | 576 cho 20ft / 1152 cho 40ft (auto-tính) | ❌ default 576 |
| **Đóng gói** | `Loose Bale` / `Wooden Pallet` / `Plastic Pallet` / `SW Pallet` / `Metal Box` | ❌ default Loose Bale |
| **Ghi chú bao bì** | "Pallet gỗ fumigation", "Bao PE lót đáy cont", "In logo khách"... | ❌ |
| **Phương thức thanh toán** | `L/C at sight` / `L/C UPAS 90 days` / `CAD 5 days` / `T/T 30/70` / ... (gợi ý click nhanh) | ❌ |

### 📊 Sidebar tự tính

Khi gõ Tấn + KG/bành:
- **Tổng bành** = Tấn × 1000 ÷ KG/bành
- **Số cont** = Tổng bành ÷ Bành/cont (làm tròn lên)
- **Giá trị USD** = Tấn × $/tấn

---

## 📋 Bước 4: Logistics

### Card "🚢 Logistics"

| Trường | Điền gì |
|---|---|
| **Incoterm** | `FOB` (KH lo cước) / `CIF` (HA lo cước + bảo hiểm) / `CFR` / `EXW` / `DDP` |
| **Cảng xếp (POL)** | `Đà Nẵng` / `HCM Cát Lái` / `HCM Cái Mép` / `Hải Phòng` / `Quy Nhơn` |
| **Cảng đích (POD)** | Chỉ hiện khi `Incoterm ≠ FOB/EXW`. VD `Shanghai`, `Yokohama`, `NHAVA SHEVA`, `BELAWAN` |
| **Ngày giao dự kiến** | Tuỳ chọn — render thành "Time of shipment" trong HĐ. Để trống → "TBD" |

---

## 📋 Bước 5: (Mở rộng nếu cần) Chỉ tiêu kỹ thuật + Hoa hồng + Ghi chú

Các section sau đang **collapsed mặc định**:
- **📊 Chỉ tiêu kỹ thuật** — DRC, Moisture, Dirt, Ash... (KH có yêu cầu kỹ thuật riêng → expand điền)
- **💰 Hoa hồng môi giới** — % hoặc USD/MT (chỉ deal có môi giới)
- **📝 Ghi chú đơn hàng** — note nội bộ

---

## 📋 Bước 6: Upload file template HĐ

### Panel phải

Section **"Đã chọn N/10 file — bấm để thêm"**:

1. Kéo thả **file `.docx` template** vào dropzone
2. Hoặc bấm để chọn file từ máy
3. Có thể chọn nhiều file cùng lúc (max 10 file/HĐ, mỗi file max 20MB)

### File template — đang dùng tạm

Hiện tại chị dùng **4 file mẫu của ERP** ở folder:

```
d:\Projects\huyanh-erp-8\docs\contract-template-samples\
├── sample_SC_FOB.docx   (Sales Contract FOB)
├── sample_SC_CIF.docx   (Sales Contract CIF)
├── sample_PI_FOB.docx   (Proforma Invoice FOB)
└── sample_PI_CIF.docx   (Proforma Invoice CIF)
```

**Quy tắc chọn:**
- HĐ FOB → upload `sample_SC_FOB.docx` + `sample_PI_FOB.docx` (2 file)
- HĐ CIF → upload `sample_SC_CIF.docx` + `sample_PI_CIF.docx` (2 file)

### 💡 Sau này có thay đổi template

Khi chị có template mới (đổi format/condition/clause), copy file mẫu trên → sửa nội dung theo template Huy Anh chuẩn → **GIỮ NGUYÊN** các placeholder `{{...}}` (ERP fill 18 trường vào đó):

| Token | Nghĩa |
|---|---|
| `{{contract_no}}` | Số HĐ — Phú điền |
| `{{contract_date}}` | Ngày HĐ — auto từ form |
| `{{buyer_name}}` | Tên KH — auto từ customer |
| `{{buyer_address}}` | Địa chỉ KH — auto |
| `{{buyer_phone}}` | Phone KH — auto |
| `{{grade}}` | Cấp mủ — auto |
| `{{quantity}}` | Tấn — auto |
| `{{unit_price}}` | Đơn giá — auto |
| `{{amount}}` | Tổng tiền — auto |
| `{{amount_words}}` | Số tiền bằng chữ — auto |
| `{{incoterm}}` | FOB/CIF — auto |
| `{{pol}}` | Cảng xếp — auto |
| `{{pod}}` | Cảng đích — auto |
| `{{packing_desc}}` | Mô tả đóng gói — auto |
| `{{bales_total}}` | Tổng bành — auto |
| `{{containers}}` | Số cont — auto |
| `{{cont_type}}` | 20'/40' — auto |
| `{{shipment_time}}` | Thời gian giao — auto |
| `{{payment}}` | Phương thức TT — auto |
| `{{bank_account_name}}` + `{{bank_account_no}}` + `{{bank_full_name}}` + `{{bank_address}}` + `{{bank_swift}}` | Bank info — Phú chọn |

**Conditional blocks** (tự ẩn/hiện theo data):
- `{{#has_pallets}}Wooden pallets / {{/has_pallets}}` — chỉ hiện khi đóng gói pallet
- `{{#is_lc_payment}}The L/C draft must be opened...{{/is_lc_payment}}` — chỉ hiện khi Payment có "L/C"
- `{{#has_fumigation}}Fumigation Certificate{{/has_fumigation}}` — chỉ hiện khi Wooden Pallet

> 📄 **Xem hướng dẫn chi tiết về template** trong file `HUONG_DAN_DOCS_TEMPLATE_HOP_DONG.docx` đã gửi chị trước đó.

---

## 📋 Bước 7: Submit — Trình Kiểm tra

Bấm nút lớn xanh đậm: **"Upload N file + Trình Kiểm tra (Phú LV)"**

### Sau khi bấm

- ✅ Toast "Đã trình HĐ cho Phú LV (Kiểm tra) duyệt"
- ✅ Redirect về danh sách đơn (`/sales/orders`) — HĐ mới xuất hiện status `draft`
- ✅ **Phú LV / Minh / Liễu / Minh Anh** nhận email + bell notification — họ vào duyệt
- ✅ Chị có thể đóng tab, đợi Phú duyệt

---

## ❓ FAQ

### Q1: Tôi không biết Số HĐ — có sao không?
**A:** Không sao. Phú LV sẽ điền lúc duyệt. Cứ để trống trường "Số HĐ".

### Q2: Tôi upload nhầm file/sai template — sửa được không?
**A:** Được. Khi HĐ còn status `reviewing`, Phú có thể:
- Trả lại chị → chị sửa + trình lại (revision mới)
- Hoặc chị báo Phú reject để chị làm lại

### Q3: HĐ có phụ lục / packing list / annex — upload chung không?
**A:** Có. Upload tối đa **10 file** cùng lúc. ERP sẽ Auto-fill các `{{token}}` trong TẤT CẢ files. File không có token (vd packing list) → ERP để nguyên không động vào.

### Q4: KH chưa có địa chỉ trong hệ thống — sao?
**A:** Trước khi tạo HĐ, vào `/sales/customers` → mở KH → điền **Address + Phone** → save. Nếu không, ô `{{buyer_address}}` trong HĐ sẽ trống.

### Q5: KH có Bank/payment đặc biệt — chỉnh ở đâu?
**A:** Payment chị gõ trong textbox "Phương thức thanh toán" của item. Bank thì **Phú LV chọn** ở bước duyệt (chị không cần lo).

### Q6: Tôi muốn xem trước file HĐ render trước khi submit — được không?
**A:** Phase này CHƯA có preview. Sau khi Phú Auto-fill, **chị xem được trong tab Hợp đồng của đơn** (folder "📤 HĐ gửi KH"). Hoặc bảo Phú forward file cho chị qua chat.

### Q7: Sale có quyền tạo HĐ không hay chỉ Docs?
**A:** Cả 2 đều được. Hiện tại hệ thống cho phép: `logistics@`, `anhlp@`, `nhungtt@`, `minhld@` đều tạo được.

### Q8: Nếu tạo nhầm HĐ → xóa được không?
**A:** Khi HĐ còn `draft` thì xóa được qua /sales/orders → mở HĐ → bấm Xóa (nếu có permission). Hoặc báo Minh LD xóa giúp.

---

## 📞 Liên hệ khi có vấn đề

- **UI lỗi / không submit được**: báo Minh LD
- **Phú LV không duyệt** sau 24h: nhắc Phú hoặc gọi điện
- **KH chưa có trong hệ thống**: vào `/sales/customers` tự thêm + báo Minh kiểm tra

---

## 🎯 Tổng kết — workflow Docs

```
1. /sales/orders/new
2. Chọn KH → smart prefill
3. Điền 4 trường required: KH, Grade, Tấn, $/tấn
4. Verify defaults: Ngày HĐ, Incoterm, POL, POD, Payment
5. Upload 2 file template .docx (SC + PI tương ứng FOB/CIF)
6. Submit → đợi Phú duyệt
```

**Thời gian/HĐ: ~1-2 phút** sau khi quen.
