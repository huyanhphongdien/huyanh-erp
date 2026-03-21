# HƯỚNG DẪN TESTING HỆ THỐNG — Huy Anh Rubber ERP v8

> **Ngày lập:** 21/03/2026
> **Phiên bản:** 1.0
> **Tổng test cases:** 73

---

## 1. TỔNG QUAN

### 1.1 Mục đích
Hướng dẫn test toàn bộ hệ thống ERP từ A-Z, đảm bảo các module hoạt động đúng và liên kết dữ liệu chính xác.

### 1.2 Hệ thống cần test

| App | URL | Mục đích |
|-----|-----|----------|
| **ERP chính** | huyanhrubber.vn | Quản lý B2B, Kho, Sản xuất |
| **Portal đại lý** | b2b.huyanhrubber.vn | Đại lý gửi booking, chat |
| **Trạm cân** | can.huyanhrubber.vn | Cân xe, chụp camera, in phiếu |

### 1.3 Tài khoản test

| App | Tài khoản | Mật khẩu |
|-----|----------|----------|
| ERP | minhld@huyanhrubber.com | (password hiện có) |
| Portal | Đại lý test | (đăng nhập qua link) |
| Trạm cân | Nhân viên cân 1 | PIN: 1234 |

### 1.4 Điều kiện tiên quyết
- [ ] Database migrations đã chạy đầy đủ
- [ ] Có ít nhất 1 đại lý (Partner) trong hệ thống
- [ ] Có ít nhất 1 kho (Warehouse) + vị trí
- [ ] Có ít nhất 1 vật liệu (Material)
- [ ] Camera proxy chạy trên máy trạm cân (`camera-proxy.exe`)

---

## 2. TEST B2B MODULE

### 2.1 Chat & Booking

**Test Case B2B-01: Đại lý gửi phiếu chốt mủ**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | Portal → Chat → Nút "Chốt mủ" | Hiện form tạo phiếu |
| 2 | Chọn loại mủ: Mủ đông | Dropdown hiện đúng |
| 3 | Nhập: 10 tấn, DRC 32%, giá 45,000đ/kg | Giá trị ước tính = 4.5 tỷ |
| 4 | Chọn địa điểm chốt: Bình Phước | Dropdown hiện danh sách |
| 5 | Nhấn "Gửi đề xuất" | Message booking xuất hiện trong chat |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

**Test Case B2B-02: Nhà máy xác nhận booking → tạo Deal**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | ERP → Chat → Thấy BookingCard | Card hiện đầy đủ thông tin |
| 2 | Nhấn "Xác nhận" | Hiện ConfirmDealModal |
| 3 | Kiểm tra: Loại mủ, SL, DRC, Giá đã fill sẵn | Đúng từ booking |
| 4 | Kiểm tra: Vùng thu mua đã fill "Bình Phước" | Đúng từ pickup_location |
| 5 | Nhấn "Tạo Deal" | Deal tạo thành công |
| 6 | Kiểm tra chat | Message "Đã xác nhận Deal DL2603-XXXX" |
| 7 | Kiểm tra Deal detail | Có đầy đủ: rubber_type, expected_drc, source_region, price_unit |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

**Test Case B2B-03: Tạo Deal từ Nhu cầu mua**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | ERP → Nhu cầu mua → Tạo mới | Form hiện đúng |
| 2 | Chọn loại: Mua đứt, Mủ nước, 20T | Điền form |
| 3 | Nhấn "Đăng ngay" | Status = published |
| 4 | Portal → Đại lý xem nhu cầu | Hiện trong danh sách |
| 5 | Đại lý gửi báo giá | Offer xuất hiện trên ERP |
| 6 | ERP → Accept offer | Deal tạo từ offer |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

### 2.2 Deal Management

**Test Case DEAL-01: Deal lifecycle**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | Deals → click deal vừa tạo | Status: Chờ xử lý |
| 2 | Nhấn "Bắt đầu xử lý" | Status → Đang xử lý |
| 3 | Nhấn "Duyệt Deal" → nhập giá chốt | Status → Đã duyệt |
| 4 | (Sau khi có QC) Nhấn "Quyết toán" | Tạo Settlement draft |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

**Test Case DEAL-02: Deal detail tabs**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | Tab "Thông tin" | Hiện đầy đủ: loại mủ, DRC, giá, vùng |
| 2 | Tab "Nhập kho" | Bảng phiếu nhập + phiếu cân |
| 3 | Tab "QC" | DRC Variance card + bảng batches |
| 4 | Tab "Sản xuất" | Bảng lệnh SX liên quan |
| 5 | Tab "Tạm ứng" | Tổng hợp tài chính + bảng advances |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

### 2.3 Tạm ứng

**Test Case ADV-01: Tạo + Chi tạm ứng**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | Tạm ứng → Tạo mới | Form hiện đúng |
| 2 | Chọn Deal, nhập 500 triệu, chuyển khoản | Validate OK |
| 3 | Nhấn "Lưu" | Phiếu tạo status = Chờ duyệt |
| 4 | Duyệt → Chi tiền | Status = Đã chi |
| 5 | Kiểm tra Công nợ đại lý | Số dư giảm 500 triệu |
| 6 | Kiểm tra Chat | Thông báo tạm ứng xuất hiện |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

### 2.4 Quyết toán

**Test Case SET-01: Auto-settlement**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | Deal (đã duyệt + có actual_drc) → "Quyết toán" | Modal hiện ước tính |
| 2 | Xác nhận | Settlement draft tạo tự động |
| 3 | Kiểm tra settlement | final_value, total_advanced, balance_due đúng |
| 4 | Deal status → Settled | Chuyển trạng thái |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

**Test Case SET-02: Approval workflow**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | Settlement (Draft) → "Gửi duyệt" | Status → Pending |
| 2 | "Duyệt" | Status → Approved |
| 3 | "Đã thanh toán" → nhập phương thức | Status → Paid |
| 4 | Kiểm tra Timeline phê duyệt | Hiện đầy đủ các bước |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

**Test Case SET-03: Từ chối + gửi duyệt lại**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | Settlement (Pending) → "Từ chối" → nhập lý do | Status → Rejected |
| 2 | "Gửi duyệt lại" | Status → Pending (lại) |
| 3 | Kiểm tra Timeline | Hiện bước từ chối + lý do |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

### 2.5 Công nợ

**Test Case LED-01: Sổ cái đại lý**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | Công nợ → chọn đại lý | Hiện sổ cái chi tiết |
| 2 | Kiểm tra bút toán | Có: Deal, Tạm ứng, Quyết toán |
| 3 | Kiểm tra số dư | Đúng = Deal value - Advances - Payments |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

## 3. TEST WMS MODULE (KHO)

### 3.1 Nhập kho

**Test Case SI-01: Tạo phiếu nhập kho + link Deal**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | Nhập kho → Tạo phiếu nhập | Form Step 1 |
| 2 | Chọn kho, nguồn = Mua hàng | Hiện dropdown Deal |
| 3 | Chọn Deal DL2603-XXXX | Auto fill: đại lý, loại mủ |
| 4 | Hiện summary Deal | Còn lại: X tấn |
| 5 | Tiếp theo → Thêm mặt hàng | Step 2 |
| 6 | Nhập SL, DRC sơ bộ → Xác nhận | Phiếu tạo thành công |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

**Test Case SI-02: Quét QR phiếu cân**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | Ô "Quét QR phiếu cân" → nhập CX-XXXXXXX-XXX | Tìm phiếu cân |
| 2 | Hiện thông tin phiếu cân | Biển số, NET, đại lý |
| 3 | Auto fill: Deal, đại lý, loại mủ | Đúng từ phiếu cân |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

**Test Case SI-03: Confirm nhập kho → cập nhật Deal**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | Xác nhận phiếu nhập | Status → Confirmed |
| 2 | Kiểm tra Deal | actual_weight_kg tăng |
| 3 | Kiểm tra Deal | stock_in_count tăng |
| 4 | Kiểm tra Chat | Thông báo "Đã nhập kho X tấn" |
| 5 | Kiểm tra stock_batches | Batch mới tạo với DRC sơ bộ |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

### 3.2 QC / DRC

**Test Case QC-01: QC Dashboard**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | QC/DRC → Dashboard | 4 cards: Chờ, Đạt, Cảnh báo, Không đạt |
| 2 | Danh sách lô cần kiểm | Hiện batch vừa nhập |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

**Test Case QC-02: QC Recheck → cập nhật Deal**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | QC Recheck → chọn batch | Form nhập DRC |
| 2 | Nhập DRC = 31.5%, độ ẩm, tạp chất | Validate OK |
| 3 | Submit | Batch.latest_drc = 31.5% |
| 4 | Kiểm tra Deal | actual_drc cập nhật (weighted avg) |
| 5 | Kiểm tra Deal | qc_status = passed/warning/failed |
| 6 | Kiểm tra Deal | final_value tính lại |
| 7 | Kiểm tra Chat | "QC hoàn thành — DRC thực tế = 31.5%" |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

### 3.3 Xuất kho

**Test Case SO-01: Tạo phiếu xuất kho**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | Xuất kho → Tạo phiếu | Form Step 1 |
| 2 | Chọn kho, lý do, SVR grade, DRC range | Điền form |
| 3 | Chọn lô → thêm vào phiếu | Lô hiện đúng DRC, grade |
| 4 | Xác nhận | Phiếu xuất tạo, tồn kho giảm |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

**Test Case SO-02: Picking List**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | Xuất kho → click phiếu → Picking | Danh sách cần lấy |
| 2 | Vuốt/đánh dấu từng item | Progress bar cập nhật |
| 3 | Hoàn tất picking | 100% completed |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

### 3.4 Tồn kho

**Test Case INV-01: Dashboard tồn kho**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | Tồn kho → Dashboard | Stats cards đúng |
| 2 | Biểu đồ phân bố DRC | Hiện đúng |
| 3 | Click vật liệu → Chi tiết | Batches, chart, history |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

**Test Case INV-02: Cảnh báo**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | Cảnh báo → Tất cả | Danh sách alerts |
| 2 | Tab Rubber | Hao hụt, lưu kho quá lâu, tạp chất |
| 3 | Dismiss cảnh báo | Ẩn khỏi danh sách |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

### 3.5 Sản xuất

**Test Case PROD-01: Tạo lệnh sản xuất**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | Sản xuất → Tạo lệnh SX | Form hiện đúng |
| 2 | Chọn grade SVR 10, SL 5 tấn | BOM template load |
| 3 | Chọn NVL từ batches | Hiện DRC, SL có sẵn |
| 4 | Lưu | Lệnh SX tạo status = Draft |
| 5 | Bắt đầu SX | Status = In Progress |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

**Test Case PROD-02: 5 công đoạn sản xuất**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | Công đoạn 1: Rửa → Bắt đầu | Ghi nhận input qty |
| 2 | Hoàn thành Rửa | Output qty, weight loss |
| 3 | Công đoạn 2: Tán/Kéo → Hoàn thành | DRC tăng |
| 4 | Công đoạn 3: Sấy → Hoàn thành | Moisture giảm |
| 5 | Công đoạn 4: Ép → Hoàn thành | Bành thành phẩm |
| 6 | Công đoạn 5: Đóng gói → Hoàn thành | Lệnh SX completed |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

**Test Case PROD-03: Tạo lô thành phẩm**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | Lệnh SX (completed) → Tạo lô TP | Form output |
| 2 | Nhập SL, grade, DRC, số bành | Validate |
| 3 | Chọn kho TP + vị trí | Kho thành phẩm |
| 4 | Lưu | Batch TP tạo trong stock_batches |
| 5 | Kiểm tra tồn kho | Batch TP hiện trong kho |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

### 3.6 Phối trộn

**Test Case BLD-01: Phối trộn lô**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | Phối trộn → Tạo lệnh | Form target DRC |
| 2 | Chọn các lô NVL (DRC khác nhau) | Tính DRC mô phỏng |
| 3 | DRC mô phỏng = weighted average | Đúng công thức |
| 4 | Lưu → Duyệt → Thực hiện | Status flow đúng |
| 5 | Hoàn tất → Tạo batch trộn | Batch mới với DRC blend |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

### 3.7 Báo cáo

**Test Case RPT-01: Báo cáo xuất nhập tồn**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | Báo cáo WMS → Xuất nhập tồn | Chọn khoảng ngày |
| 2 | Xem bảng: Tồn đầu, Nhập, Xuất, Tồn cuối | Số liệu đúng |
| 3 | Tồn cuối = Tồn đầu + Nhập - Xuất | Cân bằng |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

## 4. TEST TRẠM CÂN (can.huyanhrubber.vn)

### 4.1 Setup

**Test Case WB-01: Login**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | Mở can.huyanhrubber.vn | Trang login hiện |
| 2 | Chọn "Nhân viên cân 1", nhập PIN 1234 | Đăng nhập OK |
| 3 | Trang Home hiện | Stats + phiếu hôm nay |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

**Test Case WB-02: Kết nối cân Keli**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | Cắm cáp USB-RS232 | Device Manager hiện COM port |
| 2 | Nhấn "Kết nối cân" | Popup chọn cổng COM |
| 3 | Chọn COM đúng (USB-Serial) | "Cân online" hiện xanh |
| 4 | ⚙️ → Baud Rate = 2400 (XK3118T1-A3) | Config đúng |
| 5 | Đặt vật lên cân | Số hiện trên màn hình app |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

**Test Case WB-03: Camera Dahua**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | camera-proxy.exe đang chạy | localhost:3456/health = OK |
| 2 | ⚙️ Camera → nhập IP, port 80, user/pass | Lưu config |
| 3 | Nhấn "Chụp" | 3 ảnh camera hiện |
| 4 | Nhấn "Lưu tất cả" | Upload lên Supabase Storage |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

### 4.2 Cân xe

**Test Case WB-04: Full flow cân xe**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | "Tạo phiếu cân mới" | Form tạo phiếu |
| 2 | Chọn Deal DL2603-XXXX | Auto fill: đại lý, mủ, DRC, giá |
| 3 | Nhập biển số: 75H-12345 | Gợi ý tài xế (nếu có) |
| 4 | "Tạo phiếu & Bắt đầu cân" | Phiếu tạo, chuyển trang cân |
| 5 | Đọc số cân → "GHI CÂN LẦN 1" | Gross ghi, 3 ảnh auto chụp |
| 6 | Xe dỡ hàng, quay lại cân | |
| 7 | Đọc số cân → "GHI CÂN LẦN 2" | Tare ghi, 3 ảnh auto chụp |
| 8 | NET tự tính = Gross - Tare | Hiện KL Thực, KL Khô, Thành tiền |
| 9 | Auto mở trang in | Phiếu cân in đúng format |
| 10 | Nhấn "In" | Máy in ra phiếu |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

**Test Case WB-05: In phiếu**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | Chọn format A4 → In | Phiếu A4 đầy đủ thông tin, QR, ảnh |
| 2 | Chọn format 80mm → In | Phiếu nhiệt compact |
| 3 | Chọn format 58mm → In | Phiếu XP-58 |
| 4 | Quét QR trên phiếu | Hiện mã phiếu cân |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

### 4.3 Quản lý phiếu

**Test Case WB-06: Tìm kiếm + lọc**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | Ô tìm kiếm → nhập biển số | Filter đúng |
| 2 | Chọn ngày khác | Hiện phiếu theo ngày |
| 3 | "Tất cả ngày" | Hiện toàn bộ lịch sử |
| 4 | Lọc: Hoàn tất / Đã hủy | Filter đúng status |
| 5 | Sort cột NET | Sắp xếp đúng |
| 6 | Click 📷 → xem ảnh L1/L2 | Ảnh phân biệt lần cân |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

## 5. TEST TÍCH HỢP END-TO-END

### 5.1 Luồng chính: Booking → Cân → Nhập kho → QC → Quyết toán

**Test Case E2E-01: Full flow mua mủ**

```
Portal                    Trạm cân              ERP
──────                    ────────              ───
1. Đại lý gửi booking
   └→ Loại: Mủ đông
   └→ 10T, DRC 32%, 45k/kg
   └→ Vùng: Bình Phước
                                                2. Xác nhận → Deal
                                                   └→ DL2603-XXXX
                                                   └→ Status: Processing
                          3. Xe mủ về
                          └→ Chọn Deal
                          └→ Cân L1: 12,500 kg
                          └→ Cân L2: 3,200 kg
                          └→ NET: 9,300 kg
                          └→ In phiếu QR
                                                4. Nhập kho
                                                   └→ Quét QR phiếu cân
                                                   └→ Auto fill Deal
                                                   └→ Confirm
                                                   └→ Deal.actual_weight += 9,300
                                                   └→ Chat: "Đã nhập 9.3T"
                                                5. QC
                                                   └→ DRC thực = 31.5%
                                                   └→ Deal.actual_drc = 31.5%
                                                   └→ Deal.final_value tính lại
                                                   └→ Chat: "DRC = 31.5%"
                                                6. Duyệt Deal
                                                   └→ Status: Accepted
                                                7. Quyết toán
                                                   └→ Auto Settlement
                                                   └→ final_value - advances
                                                   └→ Duyệt → Thanh toán
                                                8. Kiểm tra Công nợ
                                                   └→ Sổ cái cân bằng
```

**Kiểm tra dữ liệu tại mỗi bước:**

| Checkpoint | Trường | Giá trị mong đợi |
|-----------|--------|-------------------|
| Sau cân | weighbridge_tickets.net_weight | 9,300 |
| Sau nhập kho | deal.actual_weight_kg | 9,300 |
| Sau nhập kho | deal.stock_in_count | 1 |
| Sau QC | deal.actual_drc | 31.5 |
| Sau QC | deal.qc_status | passed |
| Sau QC | deal.final_value | 9300 × 0.315 × 45000 |
| Sau quyết toán | settlement.final_value | = deal.final_value |
| Sau thanh toán | settlement.status | paid |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

### 5.2 Luồng sản xuất

**Test Case E2E-02: NVL → Sản xuất → Thành phẩm**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | Batch NVL (DRC 31.5%) có trong kho | Từ E2E-01 |
| 2 | Tạo lệnh SX → SVR 10, 5 tấn | Chọn batch NVL |
| 3 | 5 công đoạn: Rửa → Tán → Sấy → Ép → Đóng gói | Hoàn thành |
| 4 | Tạo lô thành phẩm | Batch TP trong kho |
| 5 | QC thành phẩm | DRC, moisture, grade xác nhận |
| 6 | Xuất kho TP | Chọn container, lô, picking |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

### 5.3 Truy xuất nguồn gốc

**Test Case E2E-03: Trace ngược từ TP → Deal**

| Bước | Thao tác | Kết quả mong đợi |
|------|---------|-------------------|
| 1 | Batch TP → Truy xuất nguồn gốc | Cây truy xuất hiện |
| 2 | TP → Lệnh SX → Batch NVL | Đúng link |
| 3 | Batch NVL → Phiếu nhập → Deal | Đúng link |
| 4 | Deal → Đại lý Bình Phước | Đúng nguồn gốc |

**Kết quả:** ☐ Đạt / ☐ Không đạt

---

## 6. KIỂM TRA TÍNH NHẤT QUÁN DỮ LIỆU

**Test Case DATA-01: DRC Weighted Average**

```sql
-- Verify actual_drc = weighted average of all batches
SELECT d.deal_number, d.actual_drc,
  (SELECT SUM(sb.latest_drc * sb.quantity_remaining) / NULLIF(SUM(sb.quantity_remaining), 0)
   FROM stock_in_orders sio
   JOIN stock_in_details sid ON sid.stock_in_id = sio.id
   JOIN stock_batches sb ON sb.id = sid.batch_id
   WHERE sio.deal_id = d.id AND sio.status = 'confirmed'
  ) as calculated_drc
FROM b2b_deals d
WHERE d.actual_drc IS NOT NULL;
```

☐ actual_drc = calculated_drc (±0.01)

---

**Test Case DATA-02: Deal weight = Sum of stock-ins**

```sql
SELECT d.deal_number, d.actual_weight_kg,
  (SELECT SUM(total_weight) FROM stock_in_orders
   WHERE deal_id = d.id AND status = 'confirmed') as sum_weight
FROM b2b_deals d
WHERE d.actual_weight_kg > 0;
```

☐ actual_weight_kg = sum_weight

---

**Test Case DATA-03: Settlement balance**

```sql
SELECT s.code, s.final_value, s.total_advanced,
  s.final_value - s.total_advanced as expected_balance,
  s.balance_due
FROM b2b_settlements s;
```

☐ balance_due = final_value - total_advanced

---

## 7. CHECKLIST TỔNG HỢP

### B2B Module
- [ ] B2B-01: Đại lý gửi booking
- [ ] B2B-02: Xác nhận booking → Deal
- [ ] B2B-03: Nhu cầu mua → Offer → Deal
- [ ] DEAL-01: Deal lifecycle
- [ ] DEAL-02: Deal detail tabs
- [ ] ADV-01: Tạm ứng
- [ ] SET-01: Auto-settlement
- [ ] SET-02: Approval workflow
- [ ] SET-03: Từ chối + duyệt lại
- [ ] LED-01: Sổ cái

### WMS Module
- [ ] SI-01: Nhập kho + link Deal
- [ ] SI-02: Quét QR phiếu cân
- [ ] SI-03: Confirm → cập nhật Deal
- [ ] QC-01: QC Dashboard
- [ ] QC-02: QC Recheck → cập nhật Deal
- [ ] SO-01: Xuất kho
- [ ] SO-02: Picking List
- [ ] INV-01: Tồn kho Dashboard
- [ ] INV-02: Cảnh báo
- [ ] PROD-01: Lệnh sản xuất
- [ ] PROD-02: 5 công đoạn
- [ ] PROD-03: Lô thành phẩm
- [ ] BLD-01: Phối trộn
- [ ] RPT-01: Báo cáo XNT

### Trạm Cân
- [ ] WB-01: Login PIN
- [ ] WB-02: Kết nối cân Keli
- [ ] WB-03: Camera Dahua
- [ ] WB-04: Full flow cân xe
- [ ] WB-05: In phiếu (A4, 80mm, 58mm)
- [ ] WB-06: Tìm kiếm + lọc

### End-to-End
- [ ] E2E-01: Full flow mua mủ
- [ ] E2E-02: Sản xuất
- [ ] E2E-03: Truy xuất nguồn gốc

### Data Consistency
- [ ] DATA-01: DRC weighted average
- [ ] DATA-02: Deal weight = sum stock-ins
- [ ] DATA-03: Settlement balance

---

**Người test:** ________________________

**Ngày test:** ________________________

**Kết quả tổng hợp:** ___/37 test cases đạt

**Nhận xét:** ________________________

---

*Huy Anh Rubber ERP v8 — System Testing Guide v1.0*
