# Hệ thống Quản lý Công việc & Đánh giá Hiệu suất

> Huy Anh Rubber ERP — Module Công việc
> Cập nhật: 06/04/2026

---

## 1. Tổng quan hệ thống

### Luồng công việc

```
Tạo CV → Giao NV → Thực hiện → Checklist 100% → Phê duyệt → Chấm điểm → Báo cáo hiệu suất
                                      ↑                            ↓
                                 Upload bằng chứng          Tính điểm tự động
```

### 4 loại công việc

| Loại | Mô tả | Hệ số điểm | Phê duyệt |
|------|--------|:-----------:|-----------|
| **assigned** | CV được giao từ cấp trên | **1.0** (100%) | Manager duyệt |
| **project** | CV thuộc dự án/phase | **0.9** (90%) | Tự động duyệt |
| **self** | Tự giao cho mình | **0.85** (85%) | Tự động duyệt |
| **recurring** | CV định kỳ (hàng ngày/tuần/tháng) | **0.8** (80%) | Tự động duyệt |

> **Tại sao hệ số khác nhau?** CV được giao (assigned) khó hơn vì do cấp trên đánh giá, nên được tính 100%. CV tự giao dễ "tự khen" nên giảm còn 85%.

---

## 2. Công thức tính điểm

### Bước 1: Chuyển sao → điểm

| Số sao | Điểm | Xếp loại |
|:------:|:----:|----------|
| 5 ★ | 100 | Xuất sắc |
| 4 ★ | 80 | Tốt |
| 3 ★ | 60 | Trung bình |
| 2 ★ | 40 | Cần cải thiện |
| 1 ★ | 20 | Chưa tốt |

### Bước 2: Áp dụng hệ số theo loại CV

```
Điểm cuối = Điểm sao × Hệ số loại CV

Ví dụ: CV assigned được 4★ = 80 × 1.0 = 80 điểm
        CV self được 5★ = 100 × 0.85 = 85 điểm
        CV recurring được 4★ = 80 × 0.8 = 64 điểm
```

### Bước 3: Tính điểm trung bình (nhiều CV)

```
Điểm TB = Σ(điểm × trọng số) / Σ(trọng số)

Ví dụ: NV có 3 CV trong tháng:
  - CV assigned: 80đ × 1.0 = 80
  - CV self: 85đ × 0.5 = 42.5  
  - CV recurring: 64đ × 0.5 = 32
  
  Điểm TB = (80 + 42.5 + 32) / (1.0 + 0.5 + 0.5) = 77.25 điểm
```

### Bước 4: Tổng hợp hiệu suất

```
Điểm hiệu suất = (TB tự đánh giá × 40%) + (TB Manager đánh giá × 60%)
```

> Công thức tự → 40%, Manager → 60% đảm bảo Manager có tiếng nói quyết định nhưng nhân viên vẫn có quyền tự đánh giá.

### Bước 5: Xếp hạng

| Hạng | Điểm | Ý nghĩa |
|:----:|:----:|---------|
| **A** | ≥ 90 | Xuất sắc — xem xét khen thưởng |
| **B** | 75–89 | Tốt — hoàn thành tốt nhiệm vụ |
| **C** | 60–74 | Trung bình — cần cố gắng thêm |
| **D** | 40–59 | Yếu — cần cải thiện rõ ràng |
| **F** | < 40 | Không đạt — xem xét kỷ luật |

---

## 3. Luồng phê duyệt

### CV được giao (assigned) — Manager duyệt

```
NV hoàn thành checklist 100%
  ↓
Tự động chuyển trạng thái "Chờ duyệt"
  ↓
Hiện trong trang Phê duyệt của Manager
  ↓
Manager chọn 1 trong 3:
  ├── ✅ Duyệt + chấm điểm (1-5★) → Xong
  ├── ❌ Từ chối + ghi lý do → NV sửa lại
  └── 🔄 Yêu cầu bổ sung → NV bổ sung rồi nộp lại
```

### CV tự giao / định kỳ / dự án — Tự động duyệt

```
NV hoàn thành checklist 100%
  ↓
Hệ thống tự động duyệt + tính điểm
  ↓
Điểm = Điểm sao × Hệ số (0.8~0.9)
```

---

## 4. Người tham gia công việc

### 5 vai trò

| Vai trò | Quyền | Được tính điểm? |
|---------|-------|:---------------:|
| **owner** | Phụ trách chính | ✅ |
| **assignee** | Người được giao | ✅ |
| **participant** | Người tham gia | ✅ (cùng điểm assignee) |
| **reviewer** | Người kiểm tra | ❌ |
| **watcher** | Người theo dõi | ❌ |

### Quyền thêm người tham gia

| Cấp | Quyền |
|-----|-------|
| Giám đốc / PGĐ (level 1-3) | Thêm bất kỳ NV nào trong công ty |
| Trưởng/Phó phòng (level 4-5) | Thêm NV trong cùng phòng |
| Nhân viên (level 6-7) | Gửi yêu cầu (chờ duyệt) |

### Upload bằng chứng

- **Tất cả** người tham gia đều upload được bằng chứng
- Mỗi file ghi rõ: **Ai tải** + **Lúc nào**
- Tối đa 10 file / checklist item, mỗi file ≤ 50MB

---

## 5. Checklist & Bằng chứng

### Cấu trúc checklist

```
Checklist (3/5) ████░░ 60%
  ✅ Kiểm tra máy sấy         ← Minh, 06/04 08:30
  ✅ Đánh giá dàn henging      📎 2 file  ← Lượng, 06/04 09:15
  ✅ Thay bao bì               📎 1 file  ← Vang, 06/04 10:00
  ☐ Kiểm tra QC               📷 Cần bằng chứng
  ☐ Báo cáo kết quả
```

### Thông tin mỗi file bằng chứng

| Trường | Ví dụ |
|--------|-------|
| Tên file | `IMG_20260406_093000.jpg` |
| Người tải | `Phạm Bá Lượng` |
| Thời gian | `06/04/2026, 09:15` |
| Dung lượng | `2.1 MB` |

### Ai được làm gì?

| Thao tác | NV (level 6-7) | TP/PP (level 4-5) |
|----------|:--------------:|:-----------------:|
| Tick hoàn thành | ✅ | ✅ |
| Upload bằng chứng | ✅ | ✅ |
| Thêm checklist item | ❌ | ✅ |
| Xóa checklist item | ❌ | ✅ |

---

## 6. Công việc định kỳ (Recurring)

### 4 tần suất

| Tần suất | Tự động tạo lúc | Ví dụ |
|----------|:----------------:|-------|
| **daily** | 8:00 sáng mỗi ngày | Kiểm tra máy hàng ngày |
| **weekly** | 8:00 sáng ngày chỉ định | Báo cáo tuần (Thứ 2) |
| **biweekly** | 14 ngày 1 lần | Vệ sinh tổng thể |
| **monthly** | Ngày chỉ định hàng tháng | Kiểm kê cuối tháng |

### Thiết lập

- Chọn nhân viên hoặc nhóm NV
- Chọn tần suất + ngày
- Gắn template checklist (tự động tạo checklist)
- Bật/tắt (`is_active`)

---

## 7. Hệ thống cảnh báo

### Trên giao diện

| Cảnh báo | Điều kiện | Hiển thị |
|----------|-----------|----------|
| Quá hạn | `due_date < hôm nay` + chưa xong | Badge đỏ trên sidebar |
| Sắp đến hạn | `due_date ≤ 2 ngày` | Highlight vàng |
| Chờ duyệt | Có task pending_approval | Badge trên menu Phê duyệt |
| Nháp > 3 ngày | Draft quá lâu | Nhắc trong email |

### Email báo cáo hàng ngày (17:30)

Gửi cho: **Giám đốc, Trợ lý BGĐ, QL Sản xuất**

Nội dung:
- Danh sách CV quá hạn
- CV sắp đến hạn (7 ngày)
- CV nháp > 3 ngày
- Thống kê điểm danh
- Cảnh báo đơn hàng (L/C, thanh toán)

---

## 8. Báo cáo hiệu suất

### Dashboard quản lý

| Chỉ số | Mô tả |
|--------|-------|
| Tổng CV | Tổng số CV trong kỳ |
| Tỷ lệ hoàn thành | CV xong / Tổng × 100% |
| Tỷ lệ đúng hạn | CV xong đúng hạn / CV xong × 100% |
| Điểm TB | Trung bình điểm hiệu suất |
| Phân bố xếp hạng | A/B/C/D/F bao nhiêu người |
| Top performers | Xếp hạng NV theo điểm |

### Báo cáo theo phòng ban

| Phòng | NV | CV hoàn thành | Đúng hạn | Điểm TB | Hạng |
|-------|:--:|:-------------:|:--------:|:-------:|:----:|
| QLSX | 15 | 89% | 72% | 76.5 | B |
| Kho | 8 | 95% | 88% | 82.3 | B |
| Kế toán | 5 | 78% | 65% | 68.1 | C |

### Xuất báo cáo

- Lọc theo: phòng ban, nhân viên, khoảng thời gian
- Xuất Excel với đầy đủ chi tiết

---

## 9. Phân quyền tổng hợp

| Chức năng | NV (6-7) | PP (5) | TP (4) | PGĐ (3) | GĐ (1-2) | Admin |
|-----------|:--------:|:------:|:------:|:--------:|:---------:|:-----:|
| Xem CV mình | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Xem CV phòng | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Xem CV công ty | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Tạo CV | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Giao CV cho NV | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Phê duyệt | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Sửa checklist | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Upload bằng chứng | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Xem báo cáo | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cấu hình định kỳ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 10. Hướng tối ưu hiệu suất

### Đang hoạt động tốt

- Công thức tính điểm rõ ràng, minh bạch
- Hệ số theo loại CV hợp lý (assigned > project > self > recurring)
- Phê duyệt nhanh: tự động duyệt CV tự giao/định kỳ
- Checklist có bằng chứng + theo dõi ai tải
- Dashboard realtime, không cần chờ cuối tháng

### Có thể cải thiện

| Vấn đề | Hiện tại | Đề xuất |
|--------|----------|---------|
| Độ khó CV | Không phân biệt | Thêm trường `difficulty` (easy/medium/hard) → hệ số 0.8/1.0/1.2 |
| Deadline quá hạn | Chỉ cảnh báo | Trừ điểm tự động: mỗi ngày trễ -2 điểm |
| Người tham gia | Cùng điểm assignee | Có thể cho % (VD: tham gia = 70% điểm) |
| Lịch sử sửa | Không track | Thêm audit log cho checklist changes |
| Template CV | Có nhưng chưa tự gắn checklist | Tự động tạo checklist từ template |
| Phê duyệt batch | Từng cái một | Cho chọn nhiều + duyệt 1 lần |

---

## FAQ

**Q: Tại sao CV tự giao chỉ được 85% điểm?**
A: Vì CV tự giao không có người kiểm tra bên ngoài, nên giảm 15% để công bằng với CV được giao (có Manager đánh giá).

**Q: Người tham gia có được tính điểm không?**
A: Có — participant (người tham gia) được tính cùng điểm với người được giao. Reviewer và watcher thì không.

**Q: CV quá hạn có bị trừ điểm không?**
A: Hiện tại chưa tự động trừ. Nhưng Manager có thể chấm điểm thấp hơn khi duyệt.

**Q: Làm sao biết ai tải bằng chứng nào?**
A: Mỗi file hiện tên người tải + thời gian ngay dưới thumbnail. Click vào tag file để xem chi tiết.

**Q: Email báo cáo gửi khi nào?**
A: 17:30 hàng ngày, tự động qua Azure/Microsoft Graph API.
