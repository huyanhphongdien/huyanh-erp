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

### Tính điểm hiệu suất tháng — Công thức 2 thành phần

```
┌─────────────────────────────────────────────────────────────────┐
│  ĐIỂM CUỐI = (Điểm chất lượng × 60%) + (Điểm khối lượng × 40%)│
└─────────────────────────────────────────────────────────────────┘
```

#### Thành phần 1: Điểm chất lượng (60%)

```
Điểm CL = Σ(điểm CV × trọng số) / Σ(trọng số)
```

Trọng số theo loại:
- assigned / project = **1.0**
- self / recurring = **0.5**

#### Thành phần 2: Điểm khối lượng (40%)

```
Điểm KL = min(100, số CV hoàn thành / mức chuẩn phòng × 100)
```

Mỗi phòng ban có **mức chuẩn** riêng (số CV kỳ vọng/tháng/người):

| Phòng ban | Mức chuẩn (CV/tháng) | Ghi chú |
|-----------|:--------------------:|---------|
| Quản lý SX | 15 | Nhiều CV định kỳ hàng ngày |
| Kho / Logistics | 12 | CV trung bình |
| Kế toán | 8 | Ít CV hơn nhưng phức tạp |
| Kinh doanh | 10 | CV theo đơn hàng |
| Hành chính | 10 | CV đa dạng |

> Manager/Admin có thể điều chỉnh mức chuẩn phòng. Nếu chưa set → mặc định 10 CV/tháng.

#### Cộng thêm: Trừ điểm quá hạn

```
Điểm sau trừ = Điểm cuối - (Số ngày trễ TB × 2)
Tối thiểu = 0 điểm
```

Manager có quyền tick **"Miễn trừ trễ hạn"** khi duyệt cho trường hợp bất khả kháng (chờ NVL, máy hỏng...).

---

### Ví dụ tính điểm đầy đủ

**NV Phạm Bá Lượng — Phòng QLSX — Tháng 4/2026**
Mức chuẩn phòng: 15 CV/tháng

**Bước 1: Tính điểm chất lượng**

| # | Công việc | Loại | Điểm | Trọng số | Điểm × TS |
|---|-----------|------|:----:|:--------:|:---------:|
| 1 | Kiểm tra máy sấy | assigned | 80 (4★) | 1.0 | 80.0 |
| 2 | Bảo trì dàn henging | assigned | 60 (3★) | 1.0 | 60.0 |
| 3 | Xử lý sự cố máy ép | assigned (khó ×1.2) | 96 | 1.0 | 96.0 |
| 4 | Báo cáo tuần 1 | recurring | 80 | 0.5 | 40.0 |
| 5 | Báo cáo tuần 2 | recurring | 80 | 0.5 | 40.0 |
| 6 | Báo cáo tuần 3 | recurring | 80 | 0.5 | 40.0 |
| 7 | Báo cáo tuần 4 | recurring | 80 | 0.5 | 40.0 |
| 8-18 | CV hàng ngày (×11) | recurring | 80 | 0.5×11 | 440.0 |
| 19 | Sắp xếp kho | self | 85 | 0.5 | 42.5 |
| 20 | Đề xuất cải tiến | self | 85 | 0.5 | 42.5 |
| | **Tổng** | | | **11.5** | **921.0** |

```
Điểm CL = 921.0 / 11.5 = 80.1
```

**Bước 2: Tính điểm khối lượng**

```
Điểm KL = min(100, 20 / 15 × 100) = min(100, 133) = 100
```

**Bước 3: Tổng hợp**

```
Điểm cuối = (80.1 × 60%) + (100 × 40%) = 48.1 + 40 = 88.1
```

**Bước 4: Trừ quá hạn** (giả sử 1 CV trễ 3 ngày, không miễn trừ)

```
Ngày trễ TB = 3 / 20 = 0.15 ngày → trừ = 0.15 × 2 = 0.3đ
Điểm cuối = 88.1 - 0.3 = 87.8 → Hạng B (Tốt)
```

---

### So sánh: Làm nhiều vs Làm ít

| NV | CV xong | Điểm CL | Điểm KL | Trễ | Cuối cùng | Hạng |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **A** (làm nhiều, tốt) | 20 | 80 | 100 | 0 | 80×60%+100×40% = **88** | **B** |
| **B** (làm ít, giỏi) | 5 | 90 | 33 | 0 | 90×60%+33×40% = **67** | **C** |
| **C** (chuẩn, giỏi) | 15 | 90 | 100 | 0 | 90×60%+100×40% = **94** | **A** |
| **D** (làm nhiều, TB) | 18 | 65 | 100 | 2d | 65×60%+100×40%-0.2 = **79** | **B** |
| **E** (làm ít, TB) | 3 | 65 | 20 | 0 | 65×60%+20×40% = **47** | **D** |

> NV C (đủ chuẩn + chất lượng cao) đạt hạng A — đây là mục tiêu lý tưởng.
> NV B (làm ít dù giỏi) chỉ được C — khuyến khích nhận thêm CV.
> NV A (làm nhiều) được B — nếu nâng chất lượng lên sẽ đạt A.

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

## 11. Cải tiến đã quyết định

### Đã áp dụng

| # | Cải tiến | Trạng thái | Chi tiết |
|---|----------|:----------:|---------|
| 1 | **Bỏ tự đánh giá** | ✅ Xong | NV hoàn thành → thẳng vào Manager duyệt |
| 2 | **Công thức 2 thành phần** | ✅ Xong | CL×60% + KL×40% — giải quyết vấn đề làm nhiều vs làm ít |
| 3 | **Trừ điểm quá hạn** | ✅ Xong | -2đ/ngày trễ TB, Manager có quyền miễn trừ |
| 4 | **Hệ số độ khó** | ✅ Xong | 3 mức: Bình thường ×1.0, Khó ×1.2, Rất khó ×1.5 |
| 5 | **Participant = 100%** | ✅ Giữ nguyên | Dùng để gom nhóm, không phải phụ giúp |

### Chờ implement

| # | Cải tiến | Ưu tiên | Mô tả |
|---|----------|:-------:|-------|
| 6 | Template auto-checklist | TB | Tạo CV từ template → tự gắn checklist |
| 7 | Phê duyệt batch nhanh | TB | Chọn nhiều CV → duyệt cùng 1 mức sao |
| 8 | Audit log checklist | TB | Ghi ai thêm/sửa/xóa checklist |
| 9 | KPI cá nhân tùy chỉnh | Thấp | Bộ KPI riêng cho mỗi NV |
| 10 | Gamification | Thấp | Badge, leaderboard, streak |

---

## Tổng kết công thức

```
┌──────────────────────────────────────────────────────────────┐
│                    TÍNH ĐIỂM HIỆU SUẤT                      │
│                                                              │
│  ĐIỂM CUỐI = (Chất lượng × 60%) + (Khối lượng × 40%)       │
│                        - (Ngày trễ TB × 2)                   │
│                                                              │
│  ── Chất lượng ──                                            │
│  CV assigned:  Manager chấm 1-5★ × hệ số độ khó (1.0~1.5)  │
│  CV project:   Auto 90đ                                     │
│  CV self:      Auto 85đ                                     │
│  CV recurring: Auto 80đ                                     │
│  → TB có trọng số: assigned/project=1.0, self/recurring=0.5 │
│                                                              │
│  ── Khối lượng ──                                            │
│  = min(100, số CV hoàn thành / mức chuẩn phòng × 100)       │
│                                                              │
│  ── Quá hạn ──                                               │
│  = Ngày trễ trung bình × 2 (Manager có thể miễn trừ)        │
│                                                              │
│  Xếp hạng: A(≥90) B(75-89) C(60-74) D(40-59) F(<40)        │
└──────────────────────────────────────────────────────────────┘
```

---

## FAQ

**Q: NV có cần tự chấm sao không?**
A: Không. Đã bỏ tự đánh giá. NV hoàn thành checklist → Manager duyệt + chấm điểm luôn.

**Q: Làm nhiều CV nhưng điểm TB thấp hơn người làm ít — có công bằng không?**
A: Có. Công thức mới tính cả **khối lượng (40%)** nên NV làm nhiều được cộng thêm. NV làm ít dù giỏi vẫn bị giảm 40% phần khối lượng.

**Q: CV tự giao chỉ được 85 điểm — tại sao?**
A: Vì không có Manager kiểm tra chất lượng. CV assigned do Manager đánh giá → tối đa 100đ.

**Q: Participant (người tham gia) được bao nhiêu điểm?**
A: **100%** — cùng điểm assignee. Participant dùng để gom nhóm nhiều NV cùng làm 1 việc, không phải "phụ giúp".

**Q: CV quá hạn bị trừ bao nhiêu?**
A: Trừ 2đ/ngày trễ trung bình. Manager có thể tick "Miễn trừ" nếu trễ do bất khả kháng.

**Q: Mức chuẩn CV/tháng ai quyết định?**
A: Admin/Manager set cho mỗi phòng. Mặc định 10 CV/tháng nếu chưa set.

**Q: CV khó được thưởng thêm bao nhiêu?**
A: Bình thường ×1.0, Khó ×1.2, Rất khó ×1.5. Manager gán độ khó khi tạo CV.

**Q: Email báo cáo gửi khi nào?**
A: 17:30 hàng ngày — quá hạn, sắp hạn, nháp tồn, L/C, thanh toán.
