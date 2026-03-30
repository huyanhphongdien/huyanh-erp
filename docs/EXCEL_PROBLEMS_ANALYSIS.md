# PHÂN TÍCH VẤN ĐỀ KHI DÙNG EXCEL QUẢN LÝ ĐƠN HÀNG

> **Ngày:** 30/03/2026
> **Thực trạng:** 2 file Excel chính đang dùng:
> - `HĐ HUY ANH - SC + PI 2026.xlsx` — Hợp đồng + PI
> - `SHIPMENT FOLLOWING.xlsx` — Theo dõi lô hàng xuất
>
> **Vấn đề gốc:** Nhiều bộ phận cùng theo dõi 1 thông tin → mất thời gian gấp đôi,
> hàng chưa load nhưng tưởng load rồi, không ai nắm được tiến độ thật.

---

## 1. CÁC LỖI PHÁT HIỆN TỪ DỮ LIỆU THỰC

### 1.1 Lỗi dữ liệu trong file Excel hiện tại

| # | Lỗi | Ví dụ thực tế | Hậu quả |
|---|-----|-------------|---------|
| 1 | **Năm sai** | UKKO 02.2026: ghi "MARCH, **2023**" thay vì 2026 | Lọc theo năm sẽ mất đơn này |
| 2 | **Trùng PO/LC** | PIX 02A: `1010000239 / 0` + `LC: 240LC01251910013` — 2 dòng cùng LC | Kế toán không biết đã thu bao nhiêu |
| 3 | **Ghi chú lẫn vào dữ liệu** | "SVR3L - **chưa mua hàng ĐÃ CỌC**" ghi trong cột TÊN HÀNG | Filter/sort bị sai |
| 4 | **CANCEL không rõ** | 4 đơn GOUTAM ghi "CANCEL LATE DEPOSIT" ở cột 1 | Không biết đã cancel chính thức hay đang pending |
| 5 | **Giá 2 loại** | "GIÁ CHỐT 1.980 / GIÁ HĐ 2.000" ghi cùng 1 ô | Kế toán không biết lấy giá nào |
| 6 | **Hàng hỗn hợp** | "RSS3+SVR10", "SVR10 CV60 + SBR1502" | Không tách được SL từng loại |
| 7 | **Booking thay đổi** | "7261744780 **-> 8035147720**" | Booking cũ vẫn hiện, dễ nhầm |
| 8 | **Cột trống/thiếu** | Nhiều dòng thiếu DISCOUNT, BANK, PAYMENT DATE | Kế toán không biết đã thu chưa |
| 9 | **Ngày format lẫn** | "02/08/2025" vs "JAN 2026" vs "MARCH SHIPMENT" vs "1ST WEEK OF MARCH" | Không sort/filter được |
| 10 | **Chú ý đặc biệt** | "SHIP CHO **ADIDAS** — CHÚ Ý CHẤT LƯỢNG" | Ai sẽ thấy ghi chú này? |

### 1.2 Lỗi tiềm ẩn khi nhiều người dùng chung Excel

| # | Tình huống | Rủi ro | Xác suất |
|---|-----------|--------|---------|
| 1 | **2 người mở cùng lúc** | Ai save sau sẽ ghi đè người save trước | **CAO** |
| 2 | **Sale cập nhật giá, Logistics chưa thấy** | Logistics book tàu theo giá cũ | **CAO** |
| 3 | **Kế toán nhập TT xong, Sale không biết** | Sale hỏi KH đã TT chưa → mất uy tín | **CAO** |
| 4 | **SX xong nhưng Logistics chưa cập nhật** | Sale báo KH hàng chưa sẵn sàng (sai) | **TRUNG BÌNH** |
| 5 | **Copy-paste sai dòng** | Booking đơn A gán nhầm cho đơn B | **TRUNG BÌNH** |
| 6 | **Xóa nhầm dòng** | Mất data, không recovery được | **THẤP** (nhưng nghiêm trọng) |
| 7 | **File hỏng** | Excel crash → mất data chưa save | **THẤP** |
| 8 | **Version control** | "HĐ HUY ANH (1).xlsx", "HĐ HUY ANH final.xlsx", "HĐ HUY ANH final2.xlsx" | **CAO** |

---

## 2. VẤN ĐỀ CỤ THỂ THEO TỪNG BỘ PHẬN

### 2.1 BP Sale — Vấn đề

```
HIỆN TẠI:
  Sale tạo HĐ trong Excel → Gửi email cho SX + Logistics + KT
  → Mỗi BP mở file riêng để cập nhật
  → Không ai biết BP khác đã làm đến đâu

VẤN ĐỀ:
  ❌ Sale không biết SX đã bắt đầu chưa
  ❌ Sale không biết Logistics đã book tàu chưa
  ❌ Sale không biết KT đã nhận L/C chưa
  ❌ KH hỏi tiến độ → Sale phải gọi 3 BP mới trả lời được
  ❌ 1 đơn GOUTAM cancel → Sale ghi "CANCEL LATE DEPOSIT" →
     nhưng KT vẫn chờ deposit → SX vẫn chuẩn bị NVL
```

### 2.2 BP Sản xuất — Vấn đề

```
HIỆN TẠI:
  SX mở file Excel để biết cần SX gì
  → Không biết ưu tiên đơn nào trước
  → Không biết NVL đã đủ chưa

VẤN ĐỀ:
  ❌ Không biết ETD thực tế (Logistics mới biết)
  ❌ Chuẩn bị NVL cho đơn đã cancel (chưa cập nhật)
  ❌ Không biết specs đã thay đổi (Sale sửa nhưng SX dùng bản cũ)
  ❌ Xong SX nhưng không ai biết → hàng nằm kho chờ
```

### 2.3 BP Logistics — Vấn đề

```
HIỆN TẠI:
  Logistics cập nhật Booking, B/L, ETD, DHL vào file
  → Cùng file với Sale → conflict khi save cùng lúc

VẤN ĐỀ:
  ❌ Booking thay đổi (VD: "7261744780 -> 8035147720") → Sale dùng số cũ
  ❌ Container chưa seal nhưng tưởng seal rồi (chưa cập nhật)
  ❌ DHL number gửi xong nhưng KT chưa biết → chậm trình BTC
  ❌ ETD thay đổi → Sale không cập nhật cho KH kịp
  ❌ Hàng đã load nhưng Excel chưa update → ai cũng tưởng chưa load
```

### 2.4 BP Kế toán — Vấn đề

```
HIỆN TẠI:
  KT nhập chiết khấu, payment date, bank vào Excel
  → Phải chờ Logistics gửi chứng từ mới biết số liệu

VẤN ĐỀ:
  ❌ Không biết đơn nào đã xuất (chờ Logistics nói)
  ❌ L/C sắp hết hạn nhưng không có cảnh báo
  ❌ Chiết khấu chưa ghi → cuối tháng phát hiện chênh lệch
  ❌ Hoa hồng broker chưa chi → quên → broker khiếu nại
  ❌ "DISCOUNT AMOUNT" nhiều ô trống → không biết chưa có hay quên nhập
```

---

## 3. HẬU QUẢ NGHIÊM TRỌNG

### 3.1 Hàng chưa load nhưng tưởng load rồi

```
TÌNH HUỐNG THỰC TẾ:

Ngày 1:  Logistics book tàu, ETD 02/08
Ngày 2:  SX xong, hàng sẵn sàng
Ngày 3:  Logistics đóng gói container
Ngày 4:  Container seal xong
Ngày 5:  Xe chở container ra cảng
         → NHƯNG tàu delay → ETD đổi thành 05/08
         → Logistics cập nhật file → nhưng Sale chưa mở file
         → Sale báo KH "hàng đã load ngày 02/08" (SAI!)
         → KH check B/L → không có → mất niềm tin

TRÊN ERP:
  Logistics cập nhật ETD → Sale thấy NGAY trên Dashboard
  → Sale không thể báo sai cho KH
  → Cảnh báo tự động: "ETD thay đổi từ 02/08 → 05/08"
```

### 3.2 Mất thời gian gấp đôi cho việc quản lý

```
HIỆN TẠI (Excel):
  KH hỏi Sale: "Đơn hàng tôi đến đâu rồi?"

  Sale:  → Mở Excel xem → thấy "confirmed"
         → Gọi SX: "SX xong chưa?"
         → SX: "Xong rồi, tuần trước"
         → Gọi Logistics: "Book tàu chưa?"
         → Logistics: "Book rồi, ETD 15/04"
         → Gọi KT: "L/C nhận chưa?"
         → KT: "Nhận rồi, hạn 30/04"

  → Sale mất 30 PHÚT để trả lời 1 câu hỏi
  → Nhân 14 đơn = 7 GIỜ / THÁNG chỉ để hỏi tiến độ

TRÊN ERP:
  Sale mở đơn hàng → thấy TẤT CẢ thông tin:
  ✅ SX: Đã hoàn thành (25/03)
  ✅ Đóng gói: 5 container sealed
  ✅ Booking: DADF09844500, ETD 25/10
  ✅ L/C: 240LC01252810006, hạn 30/11
  ✅ Thanh toán: Chờ TT

  → Sale trả lời KH trong 30 GIÂY
```

### 3.3 Các lỗi dây chuyền (domino effect)

```
LỖI 1: Sale quên cập nhật cancel
  → SX chuẩn bị NVL 21T cho GOUTAM (đã cancel)
  → Tiêu tốn NVL + nhân công
  → NVL thiếu cho đơn khác

LỖI 2: Logistics thay đổi booking, Sale không biết
  → Sale gửi booking cũ cho KH
  → KH track sai container
  → Tranh cãi khi hàng không đến

LỖI 3: KT chưa nhập payment, Sale tưởng chưa TT
  → Sale đòi tiền KH lần 2
  → KH bực, gửi proof đã TT
  → Mất uy tín, mất thời gian xin lỗi

LỖI 4: Giá chốt ≠ Giá HĐ, ai cũng ghi khác nhau
  → Sale ghi giá chốt 1,980
  → KT ghi giá HĐ 2,000
  → Invoice sai → KH từ chối TT
  → Phải sửa invoice → delay payment
```

---

## 4. ERP GIẢI QUYẾT NHƯ THẾ NÀO

### 4.1 Nguyên tắc: 1 nguồn sự thật (Single Source of Truth)

```
EXCEL (hiện tại):         ERP (đề xuất):
4 người × 1 file          4 người × 1 hệ thống
= 4 phiên bản             = 1 phiên bản DUY NHẤT
= ai cũng đúng            = ai cũng thấy giống nhau
  (từ góc nhìn riêng)       (cùng 1 data)
```

### 4.2 Mỗi BP chỉ nhập phần MÌNH — thấy phần NGƯỜI KHÁC

```
┌─────────────────────────────────────────────────┐
│              ĐƠN HÀNG SO-2026-0001              │
│                                                 │
│  SALE nhập:         SX nhập:        LOGISTICS:  │
│  ✎ KH, giá, specs   ✎ Tiến độ SX    ✎ Booking  │
│  ✎ Incoterms        ✎ Yield         ✎ B/L      │
│  ✎ Packing          ✎ QC TP         ✎ ETD      │
│                                     ✎ Container│
│                                                 │
│  KẾ TOÁN nhập:                                  │
│  ✎ L/C number                                   │
│  ✎ Thanh toán                                    │
│  ✎ Chiết khấu                                   │
│  ✎ Hoa hồng                                     │
│                                                 │
│  ─── AI CŨNG THẤY TẤT CẢ (chỉ đọc) ───        │
│  Sale thấy: SX đã xong ✓, Booking đã có ✓      │
│  SX thấy: Specs đã chuẩn ✓, ETD 25/10          │
│  Logistics thấy: SX sẵn sàng ✓, giá $1,890     │
│  KT thấy: đã xuất ✓, chờ TT, L/C hạn 30/11    │
└─────────────────────────────────────────────────┘
```

### 4.3 Cảnh báo tự động — không ai phải hỏi ai

| Sự kiện | Ai cần biết | Excel | ERP |
|---------|-----------|-------|-----|
| ETD thay đổi | Sale + KT | Phải mở file xem | **Auto thông báo** |
| SX hoàn thành | Logistics | Phải gọi hỏi | **Auto thông báo** |
| Container sealed | Sale + KT | Phải gọi hỏi | **Auto thông báo** |
| L/C sắp hết hạn | Sale + Logistics | **Không ai biết** | **Cảnh báo 7 ngày trước** |
| Đơn cancel | Tất cả BP | Có thể bỏ sót | **Tất cả thấy ngay** |
| Chưa TT quá 30 ngày | Sale + KT | Cuối tháng mới biết | **Cảnh báo tự động** |
| Hàng load xong | Sale | Phải gọi Logistics | **Trạng thái update ngay** |

### 4.4 Lịch sử thay đổi — biết ai sửa gì

```
EXCEL: Ai sửa? Sửa gì? Khi nào? → KHÔNG BIẾT

ERP:
  14:30 Sale cập nhật: Giá chốt $1,890 → $1,900 (Lê Duy Minh)
  15:00 Logistics cập nhật: ETD 02/08 → 05/08 (Nguyễn Văn A)
  16:00 KT cập nhật: Nhận L/C 0273NMLC0003926 (Trần Thị B)

  → Mọi thay đổi đều có: AI sửa + SỬA GÌ + KHI NÀO
  → Nếu sai → biết ngay ai sai → sửa ngay
```

---

## 5. SCOPE TRIỂN KHAI TỐI THIỂU

### Không cần xây toàn bộ luồng — chỉ cần kiểm soát vài điểm nóng

**5 vấn đề cần giải quyết NGAY:**

| # | Vấn đề | Giải pháp trên ERP | Effort |
|---|--------|-------------------|--------|
| 1 | **Không biết đơn nào đã load** | Trạng thái rõ ràng: Đóng gói → Đã xuất | Đã có |
| 2 | **Booking thay đổi không ai biết** | Notification khi Logistics sửa booking/ETD | 2 giờ |
| 3 | **L/C sắp hết hạn** | Cảnh báo tự động 7 ngày trước | 1 giờ |
| 4 | **Không biết SX đến đâu** | Tab Sản xuất hiện tiến độ real-time | Đã có |
| 5 | **Ai cũng tự theo dõi** | 1 trang duy nhất — mỗi BP nhập phần mình | 3 giờ |

**Tổng effort: ~6 giờ** — giải quyết 80% vấn đề.

### Không cần làm (phức tạp, để sau):

- ❌ Tự động tạo invoice (KT làm thủ công OK)
- ❌ Liên kết thanh toán ngân hàng (quá phức tạp)
- ❌ Import toàn bộ data Excel cũ (làm từ đơn mới)

---

## 6. SO SÁNH TRỰC QUAN

```
                    EXCEL                          ERP
                    ─────                          ───
Ai cập nhật?       Ai cũng sửa được               Mỗi BP sửa phần mình
Ai thấy gì?       Ai cũng thấy hết               Ai cũng thấy hết (nhưng chỉ sửa được phần mình)
Conflict?          2 người mở = ghi đè            Không conflict (database)
Version?           File (1), final, final2         1 version duy nhất
History?           Không                           Có (ai sửa gì khi nào)
Cảnh báo?          Không                           Tự động (L/C hạn, ETD đổi...)
Trả lời KH?       Gọi 3 BP → 30 phút             Mở ERP → 30 giây
Đơn cancel?        Có thể bỏ sót                  Tất cả BP thấy ngay
Load hàng?         Phải hỏi Logistics              Trạng thái hiện ngay
Báo cáo BGĐ?      Tự tổng hợp từ Excel           Dashboard tự động
```

---

> Phân tích vấn đề Excel — Huy Anh Rubber ERP
> 30/03/2026
