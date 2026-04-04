# Huy Anh ERP — Hướng dẫn Quản lý Công việc (Task V3)

> **Phiên bản:** v3.0 — Cập nhật 04/04/2026
> **Công ty:** TNHH MTV Cao su Huy Anh Phong Điền
> **Module:** Quản lý Công việc + Đánh giá Hiệu suất

---

## 1. TỔNG QUAN

Hệ thống quản lý công việc cho phép:
- Giao việc, theo dõi tiến độ, đánh giá hiệu suất
- 4 loại công việc với cách tính điểm khác nhau
- Checklist + upload ảnh minh chứng
- Người tham gia nhận điểm bằng người phụ trách
- Thông báo tự động khi giao/hoàn thành/duyệt

---

## 2. CÁC LOẠI CÔNG VIỆC

| Loại | `task_source` | Ai tạo | Ai duyệt | Hệ số |
|------|---------------|--------|----------|-------|
| **Được giao** | `assigned` | QL giao cho NV | NV tự chấm → QL duyệt | 1.0 |
| **Tự giao** | `self` | NV tự tạo cho mình | Tự động duyệt | 0.85 |
| **Định kỳ** | `recurring` | Hệ thống tự tạo | Tự động duyệt | 0.80 |
| **Dự án** | `project` | Từ dự án | Tự động duyệt (cần ảnh) | 0.90 |

### Cách xác định loại:
- **assigned**: Người tạo ≠ Người phụ trách, không thuộc dự án
- **self**: Người tạo = Người phụ trách
- **recurring**: Tạo bởi hệ thống pg_cron (hàng ngày 7:30 sáng)
- **project**: Có gắn `project_id`

---

## 3. CÁCH TÍNH ĐIỂM

### 3.1 Thang điểm sao

| Sao | Điểm gốc | Ý nghĩa |
|-----|----------|---------|
| 1 ⭐ | 20 | Chưa tốt |
| 2 ⭐⭐ | 40 | Cần cải thiện |
| 3 ⭐⭐⭐ | 60 | Trung bình |
| 4 ⭐⭐⭐⭐ | 80 | Tốt |
| 5 ⭐⭐⭐⭐⭐ | 100 | Xuất sắc |

### 3.2 Công thức tính điểm theo loại

#### Được giao (assigned) — 2 người chấm
```
Bước 1: NV tự chấm sao (1-5) → self_score (20-100)
Bước 2: QL chấm sao (1-5) → manager_score (20-100)
Bước 3: final_score = self_score × 40% + manager_score × 60%

VD: NV chấm 4⭐ (80đ) + QL chấm 5⭐ (100đ)
    → final_score = 80 × 0.4 + 100 × 0.6 = 92 điểm
```

#### Tự giao (self) — Tự động duyệt
```
Hoàn thành → final_score = 100 × 0.85 = 85 điểm (cố định)
Không cần popup đánh giá, không cần QL duyệt.
```

#### Định kỳ (recurring) — Tự động duyệt
```
Hoàn thành → final_score = 100 × 0.80 = 80 điểm (cố định)
Không cần popup đánh giá, không cần QL duyệt.
```

#### Dự án (project) — Tự động duyệt (cần ảnh)
```
Hoàn thành → final_score = 100 × 0.90 = 90 điểm (cố định)
Yêu cầu: Phải upload ảnh minh chứng trước khi hoàn thành.
```

### 3.3 Trọng số hiệu suất (Performance Weight)

Khi tính điểm trung bình tháng, mỗi loại task có trọng số khác nhau:

| Loại | Weight | Giải thích |
|------|--------|-----------|
| **Được giao** | 1.0 | Quan trọng nhất — QL giao, 2 người chấm |
| **Dự án** | 1.0 | Quan trọng — có ảnh minh chứng |
| **Tự giao** | 0.5 | Trung bình — tự duyệt |
| **Định kỳ** | 0.5 | Trung bình — routine |

**Công thức điểm tháng:**
```
Điểm TB = Σ(final_score × weight) / Σ(weight)

VD: 
  Task 1 (assigned): 92đ × 1.0 = 92.0
  Task 2 (assigned): 76đ × 1.0 = 76.0
  Task 3 (self):     85đ × 0.5 = 42.5
  Task 4 (recurring): 80đ × 0.5 = 40.0
  
  Tổng weight = 1.0 + 1.0 + 0.5 + 0.5 = 3.0
  Điểm TB = (92 + 76 + 42.5 + 40) / 3.0 = 250.5 / 3.0 = 83.5 → Hạng B
```

### 3.4 Xếp hạng

| Hạng | Điểm | Đánh giá |
|------|------|---------|
| **A** | 90 – 100 | Xuất sắc |
| **B** | 75 – 89 | Tốt |
| **C** | 60 – 74 | Trung bình |
| **D** | 40 – 59 | Cần cải thiện |
| **F** | < 40 | Không đạt |

---

## 4. VÒNG ĐỜI CÔNG VIỆC

### 4.1 Trạng thái công việc

```
Nháp (draft) ──► Đang làm (in_progress) ──► Hoàn thành (finished)
                     │                            
                     ├── Tạm dừng (paused) ──► Đang làm
                     │
                     └── Đã hủy (cancelled)
```

### 4.2 Trạng thái đánh giá (chỉ task assigned)

```
Chưa đánh giá (none)
  ──► Chờ NV tự chấm (pending_self_eval)
  ──► Chờ QL duyệt (pending_approval)
  ──► Đã duyệt (approved) → có final_score
```

### 4.3 Luồng hoàn thành theo loại

#### Được giao:
```
NV bấm "Hoàn thành"
  → Popup QuickEvalModal (chấm sao + ghi chú ≥ 10 ký tự)
  → status = finished, evaluation_status = pending_approval
  → Thông báo QL: "Chờ phê duyệt"
  → QL vào BatchApprove chấm sao
  → final_score = NV×40% + QL×60%
  → evaluation_status = approved
  → Thông báo NV: "Đã duyệt X điểm"
```

#### Tự giao / Định kỳ / Dự án:
```
NV bấm "Hoàn thành" (hoặc checklist đạt 100%)
  → Auto: status = finished, final_score = [85/80/90]
  → evaluation_status = approved
  → Không cần popup, không cần QL duyệt
```

---

## 5. CHECKLIST & ẢNH MINH CHỨNG

### 5.1 Quy tắc

- Mỗi task có thể có nhiều checklist items
- Mỗi item có thể yêu cầu ảnh (`requires_evidence = true`)
- Khi tick item có yêu cầu ảnh → mở panel upload (không tick ngay)
- Upload xong → bấm "Hoàn thành" → tick + lưu ảnh
- Tối đa 10 file/item, mỗi file ≤ 50MB
- Loại file: ảnh, video, PDF, Word, Excel

### 5.2 Ai làm gì

| Hành động | NV phụ trách | NV tham gia | QL (level ≤ 5) |
|-----------|-------------|-------------|----------------|
| Tick checklist | ✅ | ✅ | ✅ |
| Upload ảnh | ✅ | ✅ | ✅ |
| Thêm/sửa/xóa item | ❌ | ❌ | ✅ |
| Xem ảnh đã upload | ✅ | ✅ | ✅ |

### 5.3 Thông tin ghi nhận

Mỗi checklist item khi hoàn thành lưu:
- **Ai tick** (`completed_by` → tên nhân viên)
- **Khi nào** (`completed_at` → ngày giờ)
- **Ảnh minh chứng** (`evidence_urls` → danh sách URL)

Hiển thị: `✓ Phạm Bá Lượng • 04/04 lúc 14:30`

---

## 6. NGƯỜI THAM GIA (PARTICIPANTS)

### 6.1 Vai trò

- **Phụ trách chính** (assignee): Người chịu trách nhiệm, nhận đánh giá
- **Người tham gia** (participant): Cùng làm, nhận điểm bằng phụ trách

### 6.2 Quyền thêm tham gia

| Cấp bậc | Có thể thêm | Phạm vi | Cách thêm |
|---------|-------------|---------|-----------|
| GĐ/TP/PP (level 1-3) | ✅ | Toàn công ty | Trực tiếp |
| Trưởng/Phó nhóm (4-5) | ✅ | Cùng phòng ban | Trực tiếp |
| NV/TTS (6-7) | ✅ | Cùng phòng ban | Gửi yêu cầu → chờ chấp nhận |

### 6.3 Tính điểm

**Participants nhận điểm bằng assignee:**
```
Task CV-0000355 hoàn thành → final_score = 85

Lê Vang (phụ trách):       85 điểm ✅
Phạm Bá Lượng (tham gia):  85 điểm ✅
```

Điểm được tính vào hiệu suất tháng với cùng weight.

---

## 7. TASK ĐỊNH KỲ (RECURRING)

### 7.1 Hệ thống tự động

- **Chạy:** Mỗi ngày lúc 7:30 sáng (VN)
- **Nguồn:** Bảng `task_recurring_rules` + `task_templates`
- **Tần suất:** Hàng ngày / Hàng tuần / 2 tuần / Hàng tháng

### 7.2 Template mẫu

| Template | Loại | Ưu tiên | Thời hạn |
|----------|------|---------|---------|
| Nhập mủ đợt mới | production | Cao | 3 ngày |
| Bảo trì lò sấy | maintenance | Cao | 2 ngày |
| QC định kỳ hàng tuần | qc | TB | 1 ngày |
| Báo cáo sản lượng tuần | report | TB | 1 ngày |
| Kiểm kê kho định kỳ | inventory | Cao | 2 ngày |

### 7.3 Tạo task recurring thủ công

Ví dụ tạo task bảo trì hàng tuần:
```
Tên: Bảo trì và vệ sinh nhà máy - Nhóm 1 (Vang, Lượng) - Tuần 14
Loại: assigned (QL giao)
Phụ trách: Lê Vang
Tham gia: Phạm Bá Lượng
Checklist:
  ☐ Vệ sinh lá và tháo lá apron [📷]
  ☐ Phụ cơ khí lắp lá apron [📷]
  ...
```

---

## 8. THÔNG BÁO TỰ ĐỘNG

| Sự kiện | Ai nhận | Nội dung |
|---------|---------|---------|
| Giao việc mới | NV được giao | "Bạn được giao: {tên CV}" |
| NV tự đánh giá xong | QL/Người giao | "Chờ phê duyệt: {tên CV}" |
| QL duyệt đánh giá | NV phụ trách | "CV đã duyệt: {điểm}" |
| Tag @tên trong bình luận | Người được tag | "{tên} đã tag bạn" |

---

## 9. PHÂN QUYỀN

### 9.1 Ai được làm gì

| Hành động | NV (6-7) | Trưởng nhóm (4-5) | TP/PP (1-3) |
|-----------|---------|-------------------|-------------|
| Tạo task tự giao | ✅ | ✅ | ✅ |
| Giao task cho NV khác | ❌ | ✅ cùng PB | ✅ toàn CTy |
| Hoàn thành task (mình phụ trách) | ✅ | ✅ | ✅ |
| Hoàn thành task (của NV khác) | ❌ | ✅ cùng PB | ✅ |
| Phê duyệt đánh giá | ❌ | ✅ | ✅ |
| Thêm/sửa checklist | ❌ | ✅ | ✅ |
| Xem hiệu suất NV | ❌ | ✅ cùng PB | ✅ toàn CTy |

### 9.2 Quy tắc đặc biệt

- **Phòng Kế toán (HAP-KT):** Auto-attendance 08:00-20:00, auto task hàng ngày, không phân ca
- **Participant không được mark complete task** — chỉ assignee + QL cùng PB
- **QL mark complete thay NV → 100 điểm** (full score)

---

## 10. BẢNG HIỆU SUẤT

### 10.1 Dashboard hiệu suất

Hiển thị:
- **KPI tháng:** NV được đánh giá, Điểm TB, Task xong, Đúng hạn %, Quá hạn
- **Phân bố hạng:** Thanh bar A/B/C/D/F
- **Bảng xếp hạng:** Top NV với điểm + hạng
- **Xu hướng 6 tháng:** Biểu đồ điểm TB theo tháng

### 10.2 Chi tiết NV

- Điểm TB tháng (weighted)
- Số task hoàn thành
- Tỷ lệ đúng hạn
- Hạng (A-F)
- Lịch sử task + điểm từng task
- Xu hướng 6 tháng

### 10.3 Mốc thời gian

- Task tạo tháng 3, hoàn thành tháng 5 → tính vào **tháng 5**
- Dùng `completed_date` (ngày hoàn thành), không dùng `created_at`

---

## 11. CÁC VẤN ĐỀ ĐÃ XỬ LÝ

| # | Vấn đề | Giải pháp | Ngày |
|---|--------|----------|------|
| 1 | Task self kẹt `pending_self_eval` không có điểm | Auto-approve 85đ khi hoàn thành | 04/04/2026 |
| 2 | Task project kẹt không có điểm | Auto-approve 90đ (cần ảnh) | 04/04/2026 |
| 3 | Participant không nhận điểm | Cùng điểm + weight với assignee | 04/04/2026 |
| 4 | Ai cũng mark complete + auto 85đ | Chỉ assignee + QL cùng PB | 04/04/2026 |
| 5 | BatchApprove self_score null → 100% QL | Fallback 60đ (3 sao) | 04/04/2026 |
| 6 | Hệ số self 0.7 quá thấp | Tăng lên 0.85 | 04/04/2026 |
| 7 | Performance weight self 0.3 quá thấp | Tăng lên 0.5 | 04/04/2026 |
| 8 | Checklist yêu cầu ảnh chỉ ghi text | Thêm `requires_evidence` + upload flow | 04/04/2026 |
| 9 | Hiện ai tick checklist + lúc nào | Join employees, hiện tên + thời gian | 04/04/2026 |

---

## 12. VÍ DỤ THỰC TẾ

### 12.1 Bảo trì nhà máy — 2 nhóm ca

```
CV-0000355: Bảo trì - Nhóm 1 (Vang, Lượng) - Tuần 14
  Người giao: Đặng Quang Chung
  Phụ trách: Lê Vang
  Tham gia: Phạm Bá Lượng
  Checklist: 9 mục, tất cả yêu cầu ảnh
  → Cả Vang + Lượng đều tick + upload ảnh
  → Hoàn thành → 85đ cho cả 2

CV-0000356: Bảo trì - Nhóm 2 (Trình, Hiền) - Tuần 14
  Phụ trách: Trần Văn Trình
  Tham gia: Trần Văn Hiền
  → Cùng checklist, tick + upload riêng
```

### 12.2 Công tác tháo dỡ lò

```
CV-0000357: Tháo dỡ lò nhà máy số 3 Bến Hải - Tuần 14
  Phụ trách: Châu Quốc Vịnh
  Tham gia: Nguyễn Văn Cương, Nguyễn Văn Cường, Nguyễn Mạnh Thắng
  Checklist:
    ☐ Chuyển goong [📷]
    ☐ Tháo lò [📷]
  Ưu tiên: Cao
```

### 12.3 Tính điểm tháng — Ví dụ đầy đủ

```
NV: Châu Quốc Vịnh — Tháng 4/2026

| # | Công việc          | Loại     | Điểm | Weight | Score×W |
|---|-------------------|----------|------|--------|---------|
| 1 | Tháo dỡ lò BH     | assigned | 100  | 1.0    | 100.0   |
| 2 | Bảo trì tuần 14   | assigned | 85   | 1.0    | 85.0    |
| 3 | Trực ca 07/04      | recurring| 80   | 0.5    | 40.0    |
| 4 | Vệ sinh máy       | self     | 85   | 0.5    | 42.5    |

Tổng Weight = 1.0 + 1.0 + 0.5 + 0.5 = 3.0
Điểm TB = (100 + 85 + 40 + 42.5) / 3.0 = 267.5 / 3.0 = 89.2 → Hạng B
```

---

## 13. CÁC FILE LIÊN QUAN

| File | Chức năng |
|------|----------|
| `src/features/tasks/TaskViewPage.tsx` | Xem + hoàn thành task |
| `src/features/tasks/TaskCreatePage.tsx` | Tạo task mới |
| `src/features/tasks/TaskListPage.tsx` | Danh sách task |
| `src/components/tasks/QuickEvalModal.tsx` | NV tự chấm sao |
| `src/components/tasks/TaskChecklist.tsx` | Checklist + upload ảnh |
| `src/pages/tasks/BatchApprovePage.tsx` | QL duyệt hàng loạt |
| `src/pages/evaluations/MyTasksPage.tsx` | Công việc của tôi |
| `src/services/performanceService.ts` | Tính hiệu suất |
| `src/services/taskParticipantService.ts` | Quản lý người tham gia |
| `src/services/taskChecklistService.ts` | CRUD checklist |
| `supabase/functions/task-recurring-generator` | Tạo task định kỳ |
| `docs/TASK_V3_SCORING_GUIDE.md` | Hướng dẫn chấm điểm chi tiết |

---

> **Tài liệu hướng dẫn Quản lý Công việc — Huy Anh ERP v3**
> Công ty TNHH MTV Cao su Huy Anh Phong Điền
> Cập nhật: 04/04/2026
