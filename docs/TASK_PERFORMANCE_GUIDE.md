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

> **Đã bỏ tự đánh giá.** NV không cần chấm sao — hoàn thành xong là Manager duyệt + chấm điểm luôn.

### Nguồn điểm theo loại CV

| Loại CV | Ai chấm điểm? | Cách tính | Ví dụ |
|---------|---------------|-----------|-------|
| **assigned** | **Manager chấm** (1-5★) | Điểm sao × 1.0 | Manager chấm 4★ = 80đ |
| **project** | Tự động | Cố định 90đ | Hoàn thành = 90đ |
| **self** | Tự động | Cố định 85đ | Hoàn thành = 85đ |
| **recurring** | Tự động | Cố định 80đ | Hoàn thành = 80đ |

### Bảng quy đổi sao → điểm (Manager chấm CV assigned)

| Số sao | Điểm | Xếp loại |
|:------:|:----:|----------|
| 5 ★ | 100 | Xuất sắc |
| 4 ★ | 80 | Tốt |
| 3 ★ | 60 | Trung bình |
| 2 ★ | 40 | Cần cải thiện |
| 1 ★ | 20 | Chưa tốt |

### Tính điểm hiệu suất tháng (nhiều CV)

```
Điểm tháng = Σ(điểm CV × trọng số) / Σ(trọng số)
```

**Trọng số theo loại:**
- assigned = **1.0** (quan trọng nhất — do Manager đánh giá)
- project = **1.0**
- self = **0.5** (ít trọng lượng hơn)
- recurring = **0.5**

**Ví dụ: NV Phạm Bá Lượng — tháng 4/2026**

| # | Công việc | Loại | Điểm | Trọng số | Điểm × TS |
|---|-----------|------|:----:|:--------:|:---------:|
| 1 | Kiểm tra máy sấy | assigned | 80 (4★) | 1.0 | 80.0 |
| 2 | Bảo trì dàn henging | assigned | 60 (3★) | 1.0 | 60.0 |
| 3 | Báo cáo tuần | recurring | 80 | 0.5 | 40.0 |
| 4 | Sắp xếp kho | self | 85 | 0.5 | 42.5 |
| 5 | Kiểm kê hàng ngày | recurring | 80 | 0.5 | 40.0 |
| | **Tổng** | | | **3.5** | **262.5** |

```
Điểm tháng = 262.5 / 3.5 = 75.0 → Hạng B (Tốt)
```

### Xếp hạng

| Hạng | Điểm | Ý nghĩa | Hành động |
|:----:|:----:|---------|-----------|
| **A** | ≥ 90 | Xuất sắc | Xem xét khen thưởng, tăng lương |
| **B** | 75–89 | Tốt | Hoàn thành tốt, giữ nguyên |
| **C** | 60–74 | Trung bình | Cần theo dõi, coaching |
| **D** | 40–59 | Yếu | Cần cải thiện rõ ràng, cảnh báo |
| **F** | < 40 | Không đạt | Xem xét kỷ luật, chuyển vị trí |

---

## 3. Luồng phê duyệt

### CV được giao (assigned) — Manager chấm điểm

```
NV hoàn thành checklist 100%
  ↓
Tự động chuyển "Chờ duyệt" (KHÔNG cần tự đánh giá)
  ↓
Hiện trong trang Phê duyệt (/tasks/approve-batch)
  ↓
Manager chọn 1 trong 3:
  ├── ✅ Duyệt + chấm điểm (1-5★) → Xong
  ├── ❌ Từ chối + ghi lý do → NV sửa lại
  └── 🔄 Yêu cầu bổ sung → NV bổ sung rồi nộp lại
```

> **Đã bỏ bước tự đánh giá.** NV không cần tự chấm sao — hoàn thành checklist xong là Manager duyệt luôn.

### CV tự giao / định kỳ / dự án — Tự động duyệt

```
NV hoàn thành checklist 100%
  ↓
Hệ thống tự động duyệt + tính điểm (KHÔNG cần ai duyệt)
  ↓
Điểm: self=85đ | recurring=80đ | project=90đ
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

## 10. Đánh giá hệ thống hiện tại

### Đang hoạt động tốt

| Tính năng | Chi tiết |
|-----------|---------|
| Công thức tính điểm | Rõ ràng, minh bạch, có trọng số theo loại CV |
| Phê duyệt nhanh | Tự giao/định kỳ/dự án → auto-approve, không cần chờ |
| Bỏ tự đánh giá | NV hoàn thành → thẳng vào Manager duyệt, tiết kiệm 1 bước |
| Checklist + bằng chứng | Upload ảnh, biết ai tải, lúc nào |
| Nhiều người tham gia | Mỗi người upload bằng chứng riêng, cùng được tính điểm |
| Dashboard realtime | Xem hiệu suất ngay, không cần chờ cuối tháng |
| Cảnh báo email | 17:30 hàng ngày — quá hạn, sắp hạn, nháp tồn |

### Chưa tốt / Có thể cải thiện

| Vấn đề | Hiện tại | Tác động |
|--------|----------|---------|
| Không phân biệt độ khó | CV dễ = CV khó | NV chọn CV dễ để lấy điểm cao |
| Quá hạn chỉ cảnh báo | Trễ 1 ngày = trễ 30 ngày | Không tạo áp lực hoàn thành đúng hạn |
| Participant = 100% điểm | Tham gia ít = làm chính | Không công bằng |
| Phê duyệt batch chậm | Manager duyệt từng cái | Tốn thời gian khi nhiều CV |
| Template chưa auto-checklist | Tạo CV xong phải thêm checklist tay | Mất thời gian lặp lại |
| Không track lịch sử sửa checklist | Ai sửa gì không biết | Khó audit |

---

## 11. Đề xuất cải tiến (theo mức ưu tiên)

### Ưu tiên cao — Nên làm ngay

#### 1. Trừ điểm khi quá hạn

```
Công thức đề xuất:
  Điểm cuối = Điểm gốc - (Số ngày trễ × 2)
  Tối thiểu = 0 điểm

Ví dụ: Manager chấm 4★ (80đ) nhưng trễ 5 ngày
  → 80 - (5 × 2) = 70 điểm
```

| Trễ | Trừ | 5★ (100đ) | 4★ (80đ) | 3★ (60đ) |
|:---:|:---:|:---------:|:--------:|:--------:|
| 0 ngày | 0 | 100 | 80 | 60 |
| 3 ngày | -6 | 94 | 74 | 54 |
| 7 ngày | -14 | 86 | 66 | 46 |
| 15 ngày | -30 | 70 | 50 | 30 |

> **Tác động:** NV có động lực hoàn thành đúng hạn. Manager vẫn chấm điểm chất lượng, hệ thống tự trừ phần trễ.

#### 2. Phân biệt độ khó công việc

| Độ khó | Hệ số | Ví dụ |
|--------|:-----:|-------|
| Dễ (easy) | ×0.8 | Kiểm kê, báo cáo định kỳ |
| Bình thường (medium) | ×1.0 | Bảo trì máy, kiểm tra QC |
| Khó (hard) | ×1.2 | Xử lý sự cố, dự án phức tạp |
| Rất khó (critical) | ×1.5 | Vấn đề khẩn cấp, deadline gấp |

```
Điểm cuối = Điểm sao × Hệ số loại CV × Hệ số độ khó

Ví dụ: CV assigned khó, Manager chấm 4★
  → 80 × 1.0 × 1.2 = 96 điểm (thưởng vì làm việc khó)
```

> **Tác động:** NV được khuyến khích nhận CV khó. CV dễ không bị phạt nhưng được ít điểm hơn.

#### 3. Điểm tham gia theo mức đóng góp

| Vai trò | % điểm | Lý do |
|---------|:------:|-------|
| assignee (người chính) | 100% | Chịu trách nhiệm chính |
| participant (tham gia) | 70% | Hỗ trợ, không chịu trách nhiệm chính |
| reviewer (kiểm tra) | 0% | Chỉ kiểm tra, không tham gia trực tiếp |
| watcher (theo dõi) | 0% | Chỉ xem |

```
Ví dụ: CV assigned 80đ
  → Assignee: 80đ
  → Participant: 80 × 70% = 56đ
```

### Ưu tiên trung bình — Nên làm sau

#### 4. Template tự động tạo checklist

Khi tạo CV từ template → tự động gắn checklist mẫu, không cần nhập tay.

#### 5. Phê duyệt batch nhanh hơn

Cho phép Manager:
- Chọn nhiều CV → chấm cùng 1 mức sao → duyệt 1 lần
- Gợi ý sao dựa trên tỷ lệ đúng hạn

#### 6. Audit log cho checklist

Ghi lại: ai thêm/sửa/xóa checklist item, lúc nào → phòng gian lận.

### Ưu tiên thấp — Nâng cấp tương lai

#### 7. KPI cá nhân tùy chỉnh

Mỗi NV có bộ KPI riêng (VD: số CV hoàn thành/tháng, tỷ lệ đúng hạn, điểm TB). Gắn vào đánh giá cuối kỳ.

#### 8. Gamification

- Badge: "Hoàn thành 10 CV liên tiếp đúng hạn"
- Leaderboard: Top 5 NV mỗi phòng
- Streak: Số ngày liên tiếp hoàn thành CV

---

## Tổng kết công thức hiện tại

```
┌──────────────────────────────────────────────────────────┐
│                  TÍNH ĐIỂM HIỆU SUẤT                    │
│                                                          │
│  CV assigned:  Manager chấm 1-5★ → 20~100đ × 1.0       │
│  CV project:   Auto 90đ                                 │
│  CV self:      Auto 85đ                                 │
│  CV recurring: Auto 80đ                                 │
│                                                          │
│  Điểm tháng = Σ(điểm × trọng số) / Σ(trọng số)         │
│    assigned/project: trọng số 1.0                        │
│    self/recurring:   trọng số 0.5                        │
│                                                          │
│  Xếp hạng: A(≥90) B(75-89) C(60-74) D(40-59) F(<40)    │
└──────────────────────────────────────────────────────────┘
```

---

## FAQ

**Q: NV có cần tự chấm sao không?**
A: Không. Đã bỏ tự đánh giá. NV chỉ cần hoàn thành checklist → hệ thống tự chuyển cho Manager duyệt.

**Q: Tại sao CV tự giao chỉ được 85 điểm?**
A: Vì không có Manager kiểm tra chất lượng. CV được giao (assigned) do Manager đánh giá nên được tối đa 100đ.

**Q: Người tham gia có được tính điểm không?**
A: Có — participant được tính cùng điểm với assignee. Reviewer và watcher thì không.

**Q: CV quá hạn có bị trừ điểm không?**
A: Hiện tại chưa tự động trừ. Manager có thể chấm thấp hơn. Đề xuất: tự động trừ 2đ/ngày trễ.

**Q: Làm sao biết ai tải bằng chứng nào?**
A: Dưới mỗi file thumbnail hiện tên người tải + thời gian.

**Q: Email báo cáo gửi khi nào?**
A: 17:30 hàng ngày — quá hạn, sắp hạn, nháp tồn, L/C, thanh toán.
