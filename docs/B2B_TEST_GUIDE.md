# Hướng Dẫn Test Luồng B2B - Huy Anh Rubber ERP

> Test end-to-end từ Phiếu Chốt Mủ (Booking) đến Quyết Toán (Settlement)

---

## Tổng Quan Luồng

```
[1] Booking (Phiếu Chốt)
 ↓
[2] Xác Nhận Deal + Tạm Ứng (tùy chọn)
 ↓
[3] Cân Xe (Weighbridge)
 ↓
[4] Nhập Kho (Stock-In) — liên kết Deal
 ↓
[5] Kiểm Tra Chất Lượng (QC / DRC)
 ↓
[6] Duyệt Deal
 ↓
[7] Quyết Toán (Settlement)
```

---

## Điều Kiện Trước Khi Test

### Tài khoản
- Đăng nhập ERP bằng: `khuyennt@huyanhrubber.com` hoặc `duyhh@huyanhrubber.com`
  (chỉ 2 tài khoản này có quyền truy cập module B2B)

### Dữ liệu cần có sẵn
- [ ] Ít nhất 1 **Partner/Đại lý** đã tạo (status = `verified`)
- [ ] Ít nhất 1 **Chat room** với partner đó
- [ ] Ít nhất 1 **Kho** đã tạo trong WMS (ví dụ: Kho Thành Phẩm)
- [ ] Ít nhất 1 **Vật liệu/Material** (ví dụ: Mủ đông, SVR 10)

### Tạo dữ liệu nếu chưa có
| Dữ liệu | Trang tạo |
|----------|-----------|
| Partner | Cần tạo qua Supabase (bảng `b2b_partners`) |
| Chat room | Tự tạo khi mở Chat đại lý |
| Kho | `/wms/warehouses` → Thêm kho |
| Vật liệu | `/wms/materials` → Thêm sản phẩm |

---

## Bước 1: Tạo Booking (Phiếu Chốt Mủ)

### Đường dẫn
`/b2b/chat` → Chọn phòng chat → Nhấn nút **Tạo phiếu chốt**

### Thao tác
1. Mở trang **Chat Đại lý** (`/b2b/chat`)
2. Chọn phòng chat của đại lý cần test
3. Nhấn nút **"Phiếu chốt"** (hoặc icon tương tự) trong thanh nhập tin nhắn
4. Điền thông tin Booking:

| Trường | Giá trị mẫu | Ghi chú |
|--------|-------------|---------|
| Loại sản phẩm | `Mủ đông` | Chọn từ dropdown |
| Số lượng (tấn) | `5.0` | |
| DRC dự kiến (%) | `32` | Tỷ lệ cao su khô |
| Đơn giá (đ/kg) | `45,000` | |
| Loại giá | `Giá ướt` | wet = giá tính trên kg ướt |
| Ngày giao | `20/03/2026` | |
| Địa điểm | `Cam Lộ, Quảng Trị` | |
| Ghi chú | `Lô mủ đông tháng 3` | Tùy chọn |

5. Nhấn **Gửi phiếu**

### Kết quả mong đợi
- [ ] Phiếu chốt hiển thị dạng **BookingCard** trong chat
- [ ] Trạng thái: `Chờ xác nhận` (pending)
- [ ] Hiển thị: loại sản phẩm, số lượng, DRC, giá, giá trị ước tính
- [ ] Giá trị ước tính = `5 x 1000 x 45,000 = 225,000,000 VNĐ`
- [ ] Có 3 nút: **Xác nhận** / **Thương lượng** / **Từ chối**

---

## Bước 2: Xác Nhận Deal (Confirm Deal)

### Đường dẫn
Từ BookingCard trong chat → Nhấn **"Xác nhận"**

### Thao tác
1. Nhấn nút **"Xác nhận"** trên BookingCard
2. Modal **ConfirmDealModal** mở ra gồm 2 phần:

#### Phần 1: Thông tin Deal (có thể chỉnh sửa)

| Trường | Giá trị | Có thể sửa? |
|--------|---------|-------------|
| Loại sản phẩm | Mủ đông | Có |
| Số lượng (tấn) | 5.0 | Có |
| DRC dự kiến (%) | 32 | Có |
| Đơn giá (đ/kg) | 45,000 | Có (thương lượng) |
| Loại giá | Giá ướt | Có |
| Địa điểm | Cam Lộ | Có |
| Ngày giao | 20/03/2026 | Có |
| Ghi chú | | Có |

> **Giá trị ước tính** tự động tính lại khi thay đổi số lượng/giá

#### Phần 2: Tạm Ứng (tùy chọn)

3. Bật toggle **"Có tạm ứng ngay?"**
4. Điền thông tin tạm ứng:

| Trường | Giá trị mẫu |
|--------|-------------|
| Số tiền ứng | `20,000,000` |
| Hình thức | `Tiền mặt` hoặc `Chuyển khoản` |
| Người nhận | `Nguyễn Văn A` |
| SĐT | `0905123456` |
| Ghi chú ứng | `Ứng tại vườn` |

5. Kiểm tra **Tóm tắt**:
   ```
   Giá trị Deal:     225,000,000 VNĐ
   Tạm ứng:         - 20,000,000 VNĐ
   Còn phải trả:     205,000,000 VNĐ
   ```

6. Nhấn **"Tạo Deal"**

### Kết quả mong đợi
- [ ] **DealCard** xuất hiện trong chat (hiển thị mã deal, thông tin, tạm ứng)
- [ ] Mã deal tự sinh: `DL{YY}{MM}-{XXXX}` (ví dụ: `DL2603-A1B2`)
- [ ] BookingCard đổi trạng thái → `Đã xác nhận`
- [ ] Deal xuất hiện trong `/b2b/deals` với status = `processing`
- [ ] Nếu có tạm ứng:
  - [ ] Bản ghi tạm ứng tạo với mã `TU{YY}{MM}-{XXXX}`
  - [ ] Bút toán công nợ (ledger entry) được tạo
  - [ ] Số dư công nợ đại lý cập nhật tại `/b2b/ledger`

### Kiểm tra thêm
- Mở `/b2b/deals` → Tìm deal vừa tạo → Nhấn vào xem chi tiết
- Tab **Thông tin**: đầy đủ thông tin deal + timeline
- Tab **Tạm ứng**: hiển thị phiếu tạm ứng (nếu có)
- Tab **Nhập kho**: trống (chưa có phiếu nhập)
- Tab **QC**: trống (chưa có kết quả)

---

## Bước 3: Cân Xe (Weighbridge) — Tùy chọn

### Đường dẫn
`/wms/weighbridge` → **Tạo phiếu cân**

### Thao tác
1. Mở trang **Trạm cân** (`/wms/weighbridge`)
2. Nhấn **"Tạo phiếu cân"**
3. Điền thông tin:

| Trường | Giá trị mẫu |
|--------|-------------|
| Biển số xe | `51C-12345` |
| Tên tài xế | `Nguyễn Văn B` |
| Loại cân | `Xe vào` (cân lần 1 - gross) |
| Trọng lượng (kg) | `10,500` (hoặc đọc từ cân điện tử) |

4. Sau khi xe dỡ hàng xong, tạo phiếu cân lần 2:
   - Loại cân: `Xe ra` (cân lần 2 - tare)
   - Trọng lượng: `300` kg (xe rỗng)

### Kết quả mong đợi
- [ ] Phiếu cân tạo thành công
- [ ] Net weight = Gross - Tare = `10,500 - 300 = 10,200 kg`
- [ ] Phiếu cân hiển thị tại `/wms/weighbridge`

---

## Bước 4: Nhập Kho (Stock-In) — Liên kết Deal

### Đường dẫn
`/wms/stock-in` → **Tạo phiếu nhập**

### Thao tác
1. Mở `/wms/stock-in` → Nhấn **"Tạo phiếu nhập"**
2. Chọn **Nguồn nhập**: `Mua hàng` (purchase)
3. **Chọn Deal liên kết** từ dropdown:
   - Dropdown hiển thị: `DL2603-A1B2 — Đại lý Nguyễn A — Còn 5.0 T`
   - Chọn deal vừa tạo ở Bước 2

4. Điền thông tin phiếu nhập:

| Trường | Giá trị mẫu |
|--------|-------------|
| Kho nhập | `Kho Nguyên Liệu` |
| Ghi chú | `Nhập mủ đông Deal DL2603` |

5. Thêm lô hàng (items):

| Lô | Vật liệu | Số lượng (kg) | DRC sơ bộ (%) |
|----|----------|---------------|---------------|
| 1 | Mủ đông | 5,200 | 52 |
| 2 | Mủ đông | 5,000 | 51 |

6. Nhấn **Xác nhận nhập kho**

### Kết quả mong đợi
- [ ] Phiếu nhập kho tạo thành công (mã: `NK-XX-YYYYMMDD-XXX`)
- [ ] 2 lô hàng (stock_batches) được tạo với DRC sơ bộ
- [ ] **Deal tự động cập nhật**:
  - `stock_in_count`: 1
  - `actual_weight_kg`: 10,200 kg
- [ ] **Tin nhắn hệ thống** xuất hiện trong chat:
  > "Đã nhập kho 10.2 tấn cho Deal DL2603-A1B2 (NK-...)"
- [ ] Tab **Nhập kho** trong Deal Detail hiển thị phiếu nhập

### Kiểm tra thêm
- Mở `/b2b/deals/{id}` → Tab **Nhập kho**
- KPI hiển thị:
  - Phiếu nhập: `1`
  - Đã nhận: `10.2 T`
  - Lô hàng: `2`
- Bảng phiếu nhập có 1 dòng với thông tin đúng

---

## Bước 5: Kiểm Tra Chất Lượng (QC / DRC)

### Đường dẫn
`/wms/qc/recheck` → Chọn lô hàng → Ghi nhận kết quả

### Thao tác
1. Mở trang **Tái kiểm QC** (`/wms/qc/recheck`)
2. Tìm và chọn lô hàng từ Bước 4
3. Ghi nhận kết quả QC cho **Lô 1**:

| Chỉ tiêu | Giá trị |
|-----------|---------|
| DRC (%) | `53.5` |
| Tạp chất (%) | `0.02` |
| Moisture (%) | `0.5` |
| Grade | `SVR 10` |

4. Ghi nhận kết quả QC cho **Lô 2**:

| Chỉ tiêu | Giá trị |
|-----------|---------|
| DRC (%) | `51.0` |
| Tạp chất (%) | `0.03` |
| Moisture (%) | `0.6` |
| Grade | `SVR 10` |

5. Nhấn **Xác nhận** cho mỗi lô

### Kết quả mong đợi

#### DRC trung bình gia quyền:
```
actual_drc = (53.5 x 5200 + 51.0 x 5000) / (5200 + 5000)
           = (278,200 + 255,000) / 10,200
           = 52.27%
```

- [ ] Lô 1: `latest_drc = 53.5%`, qc_status = `passed`
- [ ] Lô 2: `latest_drc = 51.0%`, qc_status = `passed`
- [ ] **Deal tự động cập nhật**:
  - `actual_drc`: ~52.27%
  - `qc_status`: `passed`
  - `final_value`: tính lại dựa trên DRC thực tế
- [ ] **Tin nhắn hệ thống** trong chat:
  > "QC hoàn thành — Deal DL2603-A1B2: DRC thực tế = 52.27%, Trạng thái: Đạt"

### Kiểm tra thêm
- Mở `/b2b/deals/{id}` → Tab **QC**
- Hiển thị:
  - DRC dự kiến: `32%`
  - DRC thực tế: `52.27%`
  - Chênh lệch: `+20.27%`
  - Trạng thái QC: `Đạt`
- Bảng batch QC có 2 dòng với DRC đúng

---

## Bước 6: Duyệt Deal (Accept)

### Đường dẫn
`/b2b/deals` → Chọn deal → Thao tác → **"Duyệt Deal"**

### Thao tác
1. Mở `/b2b/deals`
2. Tìm deal đang ở trạng thái `processing`
3. Nhấn menu **Thao tác** (⋮) → **"Duyệt Deal"**
4. Nhập **Giá chốt cuối cùng** (final_price): `44,500 đ/kg`
5. Xác nhận duyệt

### Kết quả mong đợi
- [ ] Deal status chuyển: `processing` → `accepted`
- [ ] `final_price` = `44,500`
- [ ] Timeline trong Deal Detail cập nhật mốc "Duyệt giao dịch"
- [ ] Tag trạng thái đổi sang màu xanh lá

---

## Bước 7: Quyết Toán (Settlement)

### Đường dẫn
`/b2b/settlements` → **Tạo quyết toán**

### Thao tác
1. Mở `/b2b/settlements` → Nhấn **"Tạo quyết toán"**
2. **Chọn đối tác**: Đại lý liên quan đến deal
3. **Chọn deal** cần quyết toán (checkbox deal `DL2603-A1B2`)
4. Hệ thống tự tính:
   ```
   Giá trị deal:      225,000,000 VNĐ
   Đã tạm ứng:       - 20,000,000 VNĐ
   Cần thanh toán:     205,000,000 VNĐ
   ```
5. Chọn **Loại quyết toán**: `Thanh toán tiền mặt`
6. Chọn **Hình thức**: `Chuyển khoản`
7. Nhập thông tin bổ sung (mã ngân hàng, ngày thanh toán...)
8. Nhấn **Tạo**

### Kết quả mong đợi
- [ ] Phiếu quyết toán tạo với status = `draft`
- [ ] Hiển thị trong danh sách `/b2b/settlements`

### Duyệt quyết toán
1. Chọn phiếu quyết toán → **Gửi duyệt** → status = `pending`
2. Duyệt → status = `approved`
3. Xác nhận thanh toán → status = `paid`

### Kết quả cuối cùng
- [ ] Deal status: `settled`
- [ ] Công nợ đại lý về 0 (đã thanh toán hết)
- [ ] Kiểm tra `/b2b/ledger/{partnerId}`:
  - Credit (deal value): 225,000,000
  - Debit (tạm ứng): 20,000,000
  - Debit (quyết toán): 205,000,000
  - **Số dư: 0**

---

## Tóm Tắt Checklist Toàn Luồng

| # | Bước | Trang | Trạng thái Deal | Kiểm tra |
|---|------|-------|-----------------|----------|
| 1 | Tạo Booking | `/b2b/chat` | — | BookingCard hiện trong chat |
| 2 | Xác nhận Deal | Chat → ConfirmModal | `processing` | DealCard hiện, deal tạo trong DB |
| 2a | Tạm ứng (tùy chọn) | Trong ConfirmModal | `processing` | Ledger entry, advance record |
| 3 | Cân xe | `/wms/weighbridge` | `processing` | Phiếu cân tạo thành công |
| 4 | Nhập kho | `/wms/stock-in/new` | `processing` | Deal.actual_weight cập nhật, chat notify |
| 5 | QC / DRC | `/wms/qc/recheck` | `processing` | Deal.actual_drc cập nhật, chat notify |
| 6 | Duyệt Deal | `/b2b/deals` | `accepted` | final_price set, timeline update |
| 7 | Quyết toán | `/b2b/settlements` | `settled` | Công nợ = 0, tất cả đã thanh toán |

---

## Các Trường Hợp Đặc Biệt Cần Test

### A. Deal không có tạm ứng
- Bỏ qua phần tạm ứng ở Bước 2
- Quyết toán thanh toán toàn bộ giá trị deal

### B. Nhiều phiếu nhập cho 1 Deal
- Tạo 2-3 phiếu nhập khác nhau cho cùng 1 deal
- Kiểm tra `stock_in_count` tăng đúng
- Kiểm tra `actual_weight_kg` cộng dồn đúng

### C. QC không đạt (DRC thấp)
- Ghi nhận QC với DRC rất thấp hoặc tạp chất cao
- Kiểm tra `qc_status` = `failed` hoặc `warning`
- Chat notification hiển thị "Không đạt"

### D. Hủy Deal
- Từ deal đang `processing` → Nhấn **Hủy**
- Nhập lý do hủy
- Kiểm tra status = `cancelled`
- Timeline hiển thị mốc "Hủy giao dịch" với lý do

### E. Thương lượng giá
- Từ BookingCard → Nhấn **Thương lượng**
- Đề xuất giá mới
- Booking status = `negotiating`
- Sau đó xác nhận với giá đã thương lượng

### F. Nhiều tạm ứng
- Tạo deal với tạm ứng lần 1 (qua ConfirmDealModal)
- Từ DealCard trong chat → Nhấn **"+ Ứng thêm"**
- Thêm tạm ứng lần 2
- Kiểm tra tổng tạm ứng cộng dồn
- Quyết toán trừ đúng tổng tạm ứng

---

## Công Thức Tính Toán Tham Khảo

### Giá trị ước tính
```
Nếu giá ướt (wet):
  estimated_value = quantity_tons x 1000 x price_per_kg

Nếu giá khô (dry):
  estimated_value = quantity_tons x 1000 x (drc/100) x price_per_kg
```

### DRC trung bình gia quyền
```
actual_drc = Sum(batch_drc x batch_qty) / Sum(batch_qty)
```

### Giá trị thực tế (sau QC)
```
dry_weight = actual_weight_kg x (actual_drc / 100)
final_value = dry_weight x unit_price
```

### Số dư công nợ
```
Balance = Total Credit (giá trị deal) - Total Debit (tạm ứng + thanh toán)

Balance > 0: Đại lý nợ nhà máy
Balance < 0: Nhà máy nợ đại lý
Balance = 0: Đã thanh toán hết
```

---

## Lưu Ý Khi Test

1. **Thứ tự quan trọng**: Phải tạo Deal trước khi tạo phiếu nhập kho liên kết
2. **QC sau nhập kho**: QC chỉ thực hiện được sau khi có lô hàng từ phiếu nhập kho
3. **Chat notification**: Sau mỗi hành động WMS (nhập kho, QC), kiểm tra chat xem có tin nhắn hệ thống không
4. **Dữ liệu real-time**: Dashboard B2B (`/b2b`) auto-refresh 30s, có thể nhấn "Làm mới" để cập nhật ngay
5. **Công nợ**: Kiểm tra `/b2b/ledger` sau mỗi bước có tạm ứng hoặc quyết toán
