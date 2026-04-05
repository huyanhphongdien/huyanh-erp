# Huy Anh ERP — Phân quyền & Nhiệm vụ Module Đơn Hàng Bán

> **Phiên bản:** v2.0 — Cập nhật 05/04/2026
> **File code:** `src/services/sales/salesPermissionService.ts`

---

## 1. CÁC VAI TRÒ (5 ROLES)

| Role | Tên tiếng Việt | Phòng ban | Nhiệm vụ chính |
|------|---------------|-----------|----------------|
| `sale` | Kinh doanh | Phòng Thu Mua 1, Phòng Kinh doanh | Tạo đơn, quản lý KH, đàm phán giá |
| `production` | Sản xuất | Phòng QLSX, Phòng QC, Phòng R&D | Kiểm tra NVL, theo dõi SX |
| `logistics` | Xuất nhập khẩu | Phòng XNK, Phòng Xuất nhập khẩu | Container, shipment, chứng từ, hải quan |
| `accounting` | Kế toán | Phòng Kế toán, Phòng Tài chính | LC, thanh toán, chiết khấu, dòng tiền |
| `admin` | Quản trị | Ban Giám đốc + minhld@ | Toàn quyền |

### Cách xác định role
```
Hệ thống tự gán role theo phòng ban của nhân viên:
  "Phòng Thu Mua 1"       → sale
  "Phòng QLSX"            → production
  "Phòng QC"              → production
  "Phòng Kế toán"         → accounting
  "Phòng XNK"             → logistics
  "Ban Giám đốc"          → admin
  Email: minhld@...        → admin (override)
```

---

## 2. NHIỆM VỤ TỪNG BỘ PHẬN

### 2.1 BP Sale (Kinh doanh) — Nhập hợp đồng

```
TRÁCH NHIỆM:
✅ Tạo đơn hàng mới (wizard 4 bước)
✅ Nhập thông tin: khách hàng, grade, số lượng, đơn giá
✅ Chọn payment terms (LC/TT/CAD), incoterms (FOB/CIF/CNF)
✅ Quản lý khách hàng (thêm/sửa/xem)
✅ Xác nhận đơn hàng (Draft → Confirmed)
✅ Hủy đơn hàng
✅ Xem dashboard doanh thu

KHÔNG ĐƯỢC:
❌ Sửa thông tin sản xuất
❌ Sửa booking/container/B/L
❌ Sửa thông tin tài chính/LC
❌ Xem báo cáo A/R Aging
❌ Xem Executive Dashboard
```

### 2.2 BP Sản xuất — Kiểm tra hàng hóa

```
TRÁCH NHIỆM:
✅ Kiểm tra NVL có sẵn (check batch cao su trong kho)
✅ Tạo lệnh sản xuất từ đơn hàng
✅ Theo dõi 5 công đoạn: Rửa → Tán/Kéo → Sấy → Ép → Đóng gói
✅ Cập nhật tiến độ sản xuất
✅ Phân bổ batch NVL (FIFO)
✅ Xác nhận hàng sẵn sàng giao (Ready)

KHÔNG ĐƯỢC:
❌ Tạo/sửa đơn hàng
❌ Sửa giá, payment terms
❌ Quản lý container/booking
❌ Upload chứng từ
❌ Sửa thông tin tài chính
```

### 2.3 BP Logistics (XNK) — Vận chuyển & Chứng từ

```
TRÁCH NHIỆM:
✅ Tạo/quản lý container (auto/manual)
✅ Gán bành vào container
✅ Seal container (nhập số seal)
✅ Cập nhật booking: vessel, voyage, ETD/ETA, cutoff
✅ Cập nhật B/L number, B/L type, DHL number
✅ Cập nhật tờ khai hải quan + thông quan
✅ Sinh COA (Certificate of Analysis)
✅ Sinh Packing List
✅ Upload chứng từ gốc (B/L, CO, Form A/E, Phytosanitary...)
✅ Cập nhật Shipment Following (inline edit)
✅ Xem/sửa port of loading/discharge, freight terms

KHÔNG ĐƯỢC:
❌ Tạo/sửa đơn hàng (giá, SL)
❌ Sửa thông tin sản xuất
❌ Tạo Commercial Invoice (chỉ KT)
❌ Sửa LC, chiết khấu, thanh toán
❌ Xem A/R Aging
```

### 2.4 BP Kế toán — Tài chính & Thanh toán

```
TRÁCH NHIỆM:
✅ Quản lý LC (số LC, ngân hàng, hạn, giá trị)
✅ Cập nhật chiết khấu ngân hàng (ngày CK, số tiền, NH chiết khấu)
✅ Cập nhật phí ngân hàng
✅ Cập nhật số tiền thực nhận
✅ Cập nhật ngày thanh toán + trạng thái thanh toán
✅ Tạo Commercial Invoice
✅ Xem báo cáo A/R Aging (nợ phải thu)
✅ Xem dòng tiền & quản lý LC hết hạn
✅ Sửa thông tin tài chính trên Shipment Following
✅ Xem khách hàng

KHÔNG ĐƯỢC:
❌ Tạo/sửa đơn hàng (giá, SL, KH)
❌ Sửa thông tin sản xuất
❌ Quản lý container/booking
❌ Sinh COA/Packing List
❌ Xem Executive Dashboard (chỉ Admin)
```

### 2.5 Admin (BGĐ) — Toàn quyền

```
TRÁCH NHIỆM:
✅ Tất cả quyền của 4 BP trên
✅ Executive Dashboard (KPI toàn công ty)
✅ Override phân quyền
✅ Xem tất cả báo cáo
```

---

## 3. MA TRẬN PHÂN QUYỀN CHI TIẾT

### 3.1 Menu Sidebar

| Menu | Sale | SX | LOG | KT | Admin |
|------|:----:|:---:|:---:|:---:|:-----:|
| Tổng quan (Dashboard) | ✅ | | ✅ | ✅ | ✅ |
| Khách hàng | ✅ | | | ✅ | ✅ |
| Đơn hàng (list) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Theo dõi lô hàng | ✅ | | ✅ | ✅ | ✅ |
| Nợ phải thu (A/R) | | | | ✅ | ✅ |
| Dòng tiền & LC | | | | ✅ | ✅ |
| Điều hành BGĐ | | | | | ✅ |

### 3.2 Tabs trong Chi tiết Đơn hàng

| Tab | Sale | SX | LOG | KT | Admin |
|-----|:----:|:---:|:---:|:---:|:-----:|
| Thông tin (Info) | ✅ Xem+Sửa | ✅ Xem | ✅ Xem | ✅ Xem | ✅ |
| Chất lượng (Quality) | ✅ Xem+Sửa | ✅ Xem | ✅ Xem | ✅ Xem | ✅ |
| Sản xuất (Production) | ✅ Xem | ✅ Xem+Sửa | ✅ Xem | | ✅ |
| Đóng gói (Packing) | ✅ Xem | | ✅ Xem+Sửa | | ✅ |
| Chứng từ (Documents) | ✅ Xem | | ✅ Xem+Sửa | ✅ Xem | ✅ |
| Tài chính (Finance) | | | | ✅ Xem+Sửa | ✅ |

### 3.3 Hành động trên Đơn hàng

| Hành động | Sale | SX | LOG | KT | Admin |
|-----------|:----:|:---:|:---:|:---:|:-----:|
| Tạo đơn hàng | ✅ | | | | ✅ |
| Sửa thông tin chung | ✅ | | | | ✅ |
| Hủy đơn hàng | ✅ | | | | ✅ |
| Kiểm tra NVL | | ✅ | | | ✅ |
| Tạo lệnh SX | | ✅ | | | ✅ |
| Tạo container | | | ✅ | | ✅ |
| Gán bành vào container | | | ✅ | | ✅ |
| Seal container | | | ✅ | | ✅ |
| Sinh COA | | | ✅ | | ✅ |
| Sinh Packing List | | | ✅ | | ✅ |
| Sinh Invoice | | | | ✅ | ✅ |
| Upload chứng từ | | | ✅ | ✅ | ✅ |
| Sửa LC info | | | | ✅ | ✅ |
| Sửa chiết khấu | | | | ✅ | ✅ |
| Cập nhật thanh toán | | | | ✅ | ✅ |

### 3.4 Shipment Following — Cột editable

| Nhóm cột | Sale | SX | LOG | KT | Admin |
|----------|:----:|:---:|:---:|:---:|:-----:|
| Contract No, Lot | ✅ | | | | ✅ |
| Booking No, Vessel, ETD/ETA | | | ✅ | | ✅ |
| B/L No, B/L Type, DHL | | | ✅ | | ✅ |
| Cutoff, Tờ khai HQ, Thông quan | | | ✅ | | ✅ |
| Discount, NH chiết khấu, Phí NH | | | | ✅ | ✅ |
| Thực nhận, Payment Date | | | | ✅ | ✅ |
| Ngày trình BTC, Ngày CK | | | ✅ | ✅ | ✅ |

### 3.5 Khách hàng

| Hành động | Sale | SX | LOG | KT | Admin |
|-----------|:----:|:---:|:---:|:---:|:-----:|
| Xem danh sách | ✅ | | | ✅ | ✅ |
| Tạo KH mới | ✅ | | | | ✅ |
| Sửa thông tin KH | ✅ | | | | ✅ |
| Xem lịch sử đơn | ✅ | | | ✅ | ✅ |

---

## 4. LUỒNG NGHIỆP VỤ THEO BP

```
BP SALE              BP SẢN XUẤT          BP LOGISTICS          BP KẾ TOÁN
────────             ───────────          ────────────          ──────────

① Tạo đơn hàng
   KH, grade, giá
   Payment terms
   ──────────────────────────────────────────────────────────────────────

② Xác nhận đơn
   ──────────────────────────────────────────────────────────────────────

                     ③ Check NVL
                        Tạo lệnh SX
                        5 công đoạn
                        ────────────────────────────────────────────────

                     ④ Hàng Ready
                        ────────────────────────────────────────────────

                                          ⑤ Tạo container
                                             Gán bành, seal
                                             ──────────────────────────

                                          ⑥ Xuất hàng
                                             Booking, vessel
                                             B/L, DHL, tờ khai
                                             ──────────────────────────

                                          ⑦ Hàng đến
                                             Upload chứng từ
                                             ──────────────────────────

                                                                ⑧ Lập HĐ
                                                                   Invoice
                                                                   LC, CK NH
                                                                   ────────

                                                                ⑨ Thanh toán
                                                                   Nhận tiền
                                                                   ────────
```

---

## 5. CHỨNG TỪ — AI LÀM GÌ

### Sinh chứng từ (tự động từ dữ liệu đơn hàng)

| Chứng từ | Ai sinh | Dữ liệu từ đâu |
|----------|---------|----------------|
| COA (Certificate of Analysis) | **LOG** | Batch QC results + grade specs |
| Packing List | **LOG** | Container breakdown |
| Commercial Invoice | **KT** | Đơn hàng + bank info |

### Upload chứng từ gốc (scan/photo)

| Chứng từ | Ai upload | Khi nào |
|----------|----------|---------|
| B/L (Bill of Lading) | **LOG** | Sau khi shipped |
| CO (Certificate of Origin) | **LOG** | Sau khi shipped |
| Form A/E | **LOG** | Nếu có yêu cầu |
| Phytosanitary Certificate | **LOG** | Nếu cần |
| Fumigation Certificate | **LOG** | Nếu cần |
| LC Copy | **KT** | Khi nhận LC |
| Insurance Certificate | **KT** | Nếu CIF |
| Weight Note | **LOG** | Sau khi cân |
| Commercial Invoice gốc | **KT** | Sau khi ký |
| Packing List gốc | **LOG** | Sau khi đóng gói |

---

## 6. BÁO CÁO — AI XEM GÌ

| Báo cáo | Sale | SX | LOG | KT | Admin |
|---------|:----:|:---:|:---:|:---:|:-----:|
| Dashboard doanh thu | ✅ | | ✅ | ✅ | ✅ |
| Nợ phải thu (A/R Aging) | | | | ✅ | ✅ |
| Dòng tiền (Cash Flow) | | | | ✅ | ✅ |
| Quản lý LC | | | | ✅ | ✅ |
| Shipment Following | ✅ | | ✅ | ✅ | ✅ |
| Executive Dashboard | | | | | ✅ |

---

## 7. CẢNH BÁO — AI NHẬN

| Cảnh báo | Điều kiện | Ai nhận |
|---------|----------|---------|
| LC sắp hết hạn (< 7 ngày) | `lc_expiry_date - now < 7` | KT + Admin |
| Giao hàng trễ hạn | `now > etd` & status < shipped | LOG + Sale |
| Thanh toán quá hạn (> 30 ngày) | `now - delivery_date > 30` & unpaid | KT + Admin |
| Đơn hàng pending (> 3 ngày draft) | `now - created_at > 3` & draft | Sale |

---

## 8. VÍ DỤ THỰC TẾ

### Đơn hàng SO-2026-0015 — ATC Tires (Ấn Độ)

```
NGÀY 1 — BP Sale:
  Tạo đơn: KH-ATC, SVR 10, 20 tấn, $1,650/MT
  Payment: LC 60 ngày, FOB
  Quy cách: 35 kg/bành → 572 bành, 1 container 20ft
  → Status: Draft → Confirmed

NGÀY 3 — BP Sản xuất:
  Check NVL: 5 batch SVR 10 có sẵn (tổng 25T, đủ)
  Tạo lệnh SX: PO-SVR10-260405-001
  Theo dõi: Rửa → Tán → Sấy → Ép → Đóng gói
  → Status: Producing → Ready

NGÀY 7 — BP Logistics:
  Tạo 1 container 20ft
  Gán 572 bành từ batch
  Seal: MSKU-1234567
  Booking: BK-260407-ATC, Vessel: OOCL Tokyo V.025
  ETD: 10/04, ETA: 25/04
  Tờ khai HQ: 30156/NKD-ĐN
  → Status: Packing → Shipped

NGÀY 10 — BP Logistics:
  Upload B/L, CO, Packing List, COA
  DHL: 1234567890
  → Status: Shipped

NGÀY 25 — Hàng đến:
  → Status: Delivered

NGÀY 26 — BP Kế toán:
  Sinh Commercial Invoice
  Nộp bộ chứng từ cho NH
  LC: LC-ATC-2026-015, VCB
  Chiết khấu NH: VCB, $32,500
  Phí NH: $150
  → Status: Invoiced

NGÀY 56 (60 ngày sau giao):
  Nhận thanh toán: $33,000
  Thực nhận: $32,850 (trừ phí NH)
  → Status: Paid ✅
```

---

## 9. FILE CODE LIÊN QUAN

| File | Chức năng |
|------|----------|
| `salesPermissionService.ts` | Định nghĩa 5 roles + permissions |
| `getSalesRole(user)` | Xác định role từ phòng ban |
| `salesPermissions.*` | 25+ hàm check quyền |
| `getVisibleTabs(role)` | Tabs nào hiện cho role |
| `isFieldEditable(role, group)` | Field nào sửa được |

### Thêm phòng ban mới
Sửa `DEPT_ROLE_MAP` trong `salesPermissionService.ts`:
```typescript
const DEPT_ROLE_MAP = {
  'Phòng Mới': 'logistics', // → gán role logistics
}
```

### Thêm email admin
Sửa `ADMIN_EMAILS`:
```typescript
const ADMIN_EMAILS = ['minhld@huyanhrubber.com', 'newadmin@huyanhrubber.com']
```

---

> **Tài liệu phân quyền Module Đơn Hàng Bán — Huy Anh ERP**
> Công ty TNHH MTV Cao su Huy Anh Phong Điền
> Cập nhật: 05/04/2026
