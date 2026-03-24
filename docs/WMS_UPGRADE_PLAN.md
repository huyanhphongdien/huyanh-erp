# KẾ HOẠCH NÂNG CẤP TOÀN DIỆN KHO WMS

**Dự án:** Huy Anh Rubber ERP v8
**Ngày:** 24/03/2026
**Phiên bản:** WMS v2.0

---

## 1. LUỒNG KHO NGUYÊN LIỆU — QUY TRÌNH THỰC TẾ

### 1.1 Luồng chính tại bãi mủ

```
XE MỦ VÀO CỔNG
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  TRẠM CÂN (can.huyanhrubber.vn)                            │
│  ├─ Chọn Deal / NCC                                        │
│  ├─ Cân Gross → Dỡ hàng → Cân Tare → NET                  │
│  ├─ Chụp 3 camera (trước/sau/trên)                         │
│  ├─ DRC TẠM TÍNH (đại lý báo, VD: 32%)                    │
│  ├─ In phiếu cân (có QR phiếu cân)                        │
│  └─ Dữ liệu → Supabase                                    │
└─────────────────────────────────────────────────────────────┘
    │
    │ QR phiếu cân (quét hoặc nhập mã)
    ▼
┌─────────────────────────────────────────────────────────────┐
│  NHẬP KHO (ERP — /wms/stock-in/new)                        │
│  ├─ Quét QR phiếu cân → Auto fill: Deal, đại lý, KL, mủ   │
│  ├─ Chọn kho + vị trí bãi (VD: Bãi A — Ô 3)              │
│  ├─ Tạo lô hàng (batch) — trạng thái: "Chờ QC"            │
│  ├─ DRC ghi nhận = DRC tạm tính (đại lý báo)              │
│  ├─ ❌ CHƯA IN NHÃN QR — chờ QC                            │
│  └─ Có thể in nhãn tạm (không có DRC chính thức)           │
└─────────────────────────────────────────────────────────────┘
    │
    │ Lô hàng trạng thái "Chờ QC"
    ▼
┌─────────────────────────────────────────────────────────────┐
│  QC LẤY MẪU + TEST DRC (ERP — /wms/qc)                     │
│  ├─ Quét QR lô (nếu có nhãn tạm) hoặc chọn từ danh sách   │
│  ├─ Lấy mẫu → Đo DRC thật → VD: 33.8%                     │
│  ├─ Đo thêm: độ ẩm, tạp chất, volatile, ash...            │
│  ├─ Phân loại Grade tự động (SVR 3L/5/10/20)              │
│  ├─ Ghi nhận kết quả → Lô chuyển "Đạt QC" / "Không đạt"  │
│  └─ Cập nhật Deal: actual_drc, qc_status                   │
└─────────────────────────────────────────────────────────────┘
    │
    │ ✅ QC xong — DRC CHÍNH THỨC đã có
    ▼
┌─────────────────────────────────────────────────────────────┐
│  IN NHÃN QR CHÍNH THỨC — DÁN TẠI BÃI MỦ                   │
│  ├─ Mã QR (quét → xem chi tiết lô trên ERP)               │
│  ├─ Mã lô: LOT-20260324-001                                │
│  ├─ Đại lý: Nguyễn Văn Tính                                │
│  ├─ Loại mủ: Mủ nước                                       │
│  ├─ Trọng lượng: 30,000 kg                                 │
│  ├─ DRC CHÍNH THỨC: 33.8% (từ QC)                          │
│  ├─ Grade: SVR 10                                           │
│  ├─ Vị trí: Bãi A — Ô 3                                   │
│  ├─ Ngày nhập: 24/03/2026                                  │
│  └─ Khổ in: A5 ngang (dán bảng tại bãi)                   │
│                                                             │
│  ⚠️ CHỈ IN SAU KHI QC XONG — không in trước               │
│  ⚠️ DRC trên nhãn = DRC từ QC, KHÔNG PHẢI DRC đại lý báo  │
└─────────────────────────────────────────────────────────────┘
    │
    │ Lô đã có nhãn QR, sẵn sàng sử dụng
    ▼
┌─────────────────────────────────────────────────────────────┐
│  XUẤT KHO CHO SẢN XUẤT (ERP — /wms/stock-out)              │
│  ├─ Quét QR lô tại bãi → thêm vào phiếu xuất              │
│  ├─ Hoặc chọn lô từ danh sách (lọc theo DRC, Grade)       │
│  ├─ Link với lệnh sản xuất (Production Order)              │
│  ├─ Trừ tồn kho → cập nhật vị trí bãi                     │
│  └─ Lô → "Đã xuất" / "Đang sản xuất"                      │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Quy tắc quan trọng

| Quy tắc | Mô tả |
|---------|-------|
| DRC tạm tính | Từ đại lý báo khi cân → ghi nhận nhưng KHÔNG in lên nhãn |
| DRC chính thức | Từ QC test → IN LÊN NHÃN QR tại bãi |
| In nhãn QR lô | CHỈ SAU KHI QC xong, KHÔNG in trước |
| Nhãn tạm | Có thể in nhãn tạm (không có DRC) ngay khi nhập kho, tùy chọn |
| Vị trí bãi | Mỗi lô phải gán vị trí tại bãi (grid) |

---

## 2. KẾ HOẠCH NÂNG CẤP TỔNG THỂ

### Phase A: Kho Nguyên Liệu (Ưu tiên CAO — làm trước)

| # | Tính năng | Mô tả | Ngày |
|---|----------|-------|------|
| A.1 | **In nhãn QR lô hàng** | Component in nhãn A5/A4 với QR code + thông tin lô. Nút "In nhãn" xuất hiện SAU KHI QC xong | 1 ngày |
| A.2 | **Bản đồ bãi mủ (Yard Map)** | Sơ đồ grid bãi nguyên liệu — hiện lô nào ở ô nào, màu theo DRC/Grade/trạng thái QC | 2 ngày |
| A.3 | **Quét QR tại QC** | QC page thêm nút quét QR → mở form nhập DRC cho lô đó (hiện phải chọn thủ công) | 0.5 ngày |
| A.4 | **Quét QR xuất kho SX** | StockOutCreate thêm quét QR lô → auto thêm vào phiếu xuất | 0.5 ngày |
| A.5 | **Dashboard bãi NVL** | Tổng quan: tồn bãi, lô chờ QC, lô sẵn SX, DRC trung bình, cảnh báo lưu kho lâu | 1 ngày |
| A.6 | **Nhãn tạm (tùy chọn)** | In nhãn tạm ngay khi nhập kho (không có DRC), để nhận diện tại bãi trước QC | 0.5 ngày |

**Tổng Phase A: ~5.5 ngày**

### Phase B: Nâng cấp Nhập/Xuất Kho

| # | Tính năng | Mô tả | Ngày |
|---|----------|-------|------|
| B.1 | **Quick Stock-In từ Cân** | Sau khi cân xong → 1 click tạo phiếu nhập kho (không cần vào ERP nhập lại) | 1 ngày |
| B.2 | **Batch split/merge** | Tách 1 lô thành 2 (chia bãi) hoặc gộp 2 lô (cùng DRC) | 1 ngày |
| B.3 | **Xuất kho multi-scan** | Quét liên tục nhiều QR lô → thêm hết vào 1 phiếu xuất | 0.5 ngày |
| B.4 | **Phiếu xuất gia công** | Thêm reason "Trả gia công" vào stock-out (hiện chỉ có sale/blend) | 0.5 ngày |
| B.5 | **Lịch sử di chuyển lô** | Timeline mỗi lô: nhập kho → QC → chuyển vị trí → xuất SX | 0.5 ngày |

**Tổng Phase B: ~3.5 ngày**

### Phase C: Nâng cấp QC/DRC

| # | Tính năng | Mô tả | Ngày |
|---|----------|-------|------|
| C.1 | **QC mobile-friendly** | Tối ưu QC page cho tablet/phone (nhân viên QC dùng tại bãi) | 1 ngày |
| C.2 | **DRC trend chart** | Biểu đồ DRC theo thời gian cho mỗi lô (theo dõi biến đổi) | 0.5 ngày |
| C.3 | **Auto grade classification** | Sau QC → tự động xác định SVR grade dựa trên DRC + tiêu chuẩn | 0.5 ngày |
| C.4 | **QC batch scan** | Quét QR → mở ngay form QC cho lô đó (không cần tìm trong danh sách) | 0.5 ngày |
| C.5 | **Cảnh báo DRC chênh lệch** | Nếu DRC QC chênh > 5% so với đại lý báo → cảnh báo + ghi log | 0.5 ngày |

**Tổng Phase C: ~3 ngày**

### Phase D: Nâng cấp Sản xuất

| # | Tính năng | Mô tả | Ngày |
|---|----------|-------|------|
| D.1 | **Lệnh SX từ xuất kho** | Tạo lệnh SX trực tiếp từ phiếu xuất (link NVL tự động) | 1 ngày |
| D.2 | **Tracking công đoạn real-time** | Dashboard 5 công đoạn — biết đang ở bước nào, ai đang làm | 1 ngày |
| D.3 | **Yield analytics** | Phân tích yield theo: grade, đại lý, mùa vụ, dây chuyền | 1 ngày |
| D.4 | **Production planning** | Lên kế hoạch SX tuần/tháng — dựa trên tồn NVL + đơn hàng | 2 ngày |

**Tổng Phase D: ~5 ngày**

### Phase E: Nâng cấp Phối trộn

| # | Tính năng | Mô tả | Ngày |
|---|----------|-------|------|
| E.1 | **Smart blend suggest** | AI gợi ý phối trộn tối ưu — chọn lô nào trộn để đạt DRC target | 1 ngày |
| E.2 | **Blend simulation chart** | Biểu đồ trực quan kết quả mô phỏng (bar chart DRC trước/sau) | 0.5 ngày |
| E.3 | **Auto blend trigger** | Khi lô QC không đạt → tự gợi ý blend với lô nào | 0.5 ngày |

**Tổng Phase E: ~2 ngày**

### Phase F: Báo cáo & Analytics

| # | Tính năng | Mô tả | Ngày |
|---|----------|-------|------|
| F.1 | **Báo cáo xuất nhập tồn** | Theo ngày/tuần/tháng — có thể xuất Excel | 1 ngày |
| F.2 | **Báo cáo DRC theo đại lý** | So sánh DRC đại lý báo vs QC thực tế — đánh giá chất lượng NCC | 1 ngày |
| F.3 | **Báo cáo hao hụt** | Theo dõi hao hụt NVL theo thời gian lưu kho, loại mủ, mùa vụ | 1 ngày |
| F.4 | **Dashboard tổng hợp** | KPI: tồn kho, DRC TB, yield SX, doanh thu, công nợ — 1 trang | 1 ngày |
| F.5 | **Export PDF/Excel** | Xuất báo cáo chuyên nghiệp cho BGĐ | 1 ngày |

**Tổng Phase F: ~5 ngày**

---

## 3. LỘ TRÌNH THỰC HIỆN

```
Tuần 1:  Phase A (Kho NVL)     ████████████████████████  5.5 ngày
Tuần 2:  Phase B (Nhập/Xuất)   ██████████████            3.5 ngày
         Phase C (QC/DRC)      ████████████              3 ngày
Tuần 3:  Phase D (Sản xuất)    ████████████████████      5 ngày
Tuần 4:  Phase E (Phối trộn)   ████████                  2 ngày
         Phase F (Báo cáo)     ████████████████████      5 ngày
```

| Tuần | Phase | Tổng ngày | Tích lũy |
|------|-------|-----------|----------|
| 1 | A: Kho NVL | 5.5 | 5.5 |
| 2 | B + C: Nhập/Xuất + QC | 6.5 | 12 |
| 3 | D: Sản xuất | 5 | 17 |
| 4 | E + F: Phối trộn + Báo cáo | 7 | 24 |

**Tổng: ~24 ngày làm việc (khoảng 1 tháng)**

---

## 4. ƯU TIÊN KHUYẾN NGHỊ

### Làm ngay (impact lớn nhất):
1. **A.1 — In nhãn QR lô** → Giải quyết vấn đề nhận diện lô tại bãi
2. **A.2 — Bản đồ bãi** → Biết lô nào ở đâu
3. **A.5 — Dashboard bãi NVL** → Tổng quan nhanh

### Làm sau (nâng cao):
4. **B.1 — Quick Stock-In** → Giảm thao tác nhập kho
5. **C.1 — QC mobile** → Nhân viên QC dùng tablet tại bãi
6. **F.4 — Dashboard tổng hợp** → BGĐ xem KPI

### Làm cuối (tối ưu):
7. **D.4 — Production planning** → Lên kế hoạch dài hạn
8. **E.1 — Smart blend** → AI gợi ý phối trộn
9. **F.5 — Export PDF** → Báo cáo chuyên nghiệp

---

*WMS Upgrade Plan v1.0*
*Huy Anh Rubber ERP v8*
*24/03/2026*
