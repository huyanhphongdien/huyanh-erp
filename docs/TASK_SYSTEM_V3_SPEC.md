# HỆ THỐNG CÔNG VIỆC V3 — THIẾT KẾ TỐI ƯU

> **Ngày:** 27/03/2026
> **Mục tiêu:** Giảm thao tác tối đa, automation tối đa, đánh giá hiệu suất chính xác

---

## 1. NGUYÊN TẮC THIẾT KẾ

```
1. NV chỉ cần LÀM VIỆC + TICK CHECKLIST — hệ thống lo phần còn lại
2. Không bắt NV điền form dài — chỉ chấm sao
3. Manager không phải duyệt từng task — batch + auto approve
4. Mọi task đều tính hiệu suất — không cho skip
5. Bằng chứng bắt buộc cho task quan trọng
```

---

## 2. THAY ĐỔI SO VỚI HIỆN TẠI

### 2.1 Những gì GIỮ NGUYÊN

| Tính năng | Lý do giữ |
|-----------|----------|
| 2 luồng phân công (Manager + Tự giao) | Đang hoạt động đúng |
| Phân quyền theo level (BGĐ/TP/PP/NV) | Đang hoạt động đúng |
| Checklist trong task | Core feature |
| Kanban board | Mới thêm, tốt |
| Template + Recurring | Mới thêm, tốt |
| Email nhắc nhở (Edge Function) | Đang hoạt động |

### 2.2 Những gì BỎ

| Bỏ | Lý do |
|----|-------|
| Form tự đánh giá 7 trường | Quá phức tạp → NV skip |
| Slider progress thủ công | Thay bằng auto từ checklist |
| Trạng thái "Nháp" cho task có assignee | Không cần — task có người = đang làm |
| Cột `completed_at` | Trùng `completed_date` |
| Cột `calculated_progress` | Trùng `progress` |
| Cột `progress_mode` | Luôn auto |
| Cột `checklist` (JSONB) | Có bảng riêng `task_checklist_items` |
| Cột `assigned_at`, `assigned_by` | Trùng `created_at`, `assigner_id` |
| Cột `reviewer_id` | Thay bằng luồng approval |

### 2.3 Những gì THÊM MỚI

| Thêm | Mục đích |
|------|---------|
| Cột `self_score` (tasks) | NV tự chấm sao |
| Cột `manager_score` (tasks) | Manager chấm sao |
| Cột `final_score` (tasks) | Điểm cuối cùng |
| Cột `requires_evidence` (checklist) | Đánh dấu cần ảnh/file |
| Cột `evidence_url` (checklist) | Link ảnh/file bằng chứng |
| Auto-approve cho task tự giao | Giảm tải Manager |
| Deadline duyệt 48h | Chống tồn đọng |
| Ràng buộc đánh giá | Không skip, không fake |

---

## 3. LUỒNG MỚI CHI TIẾT

### 3.1 Luồng Manager giao task

```
Manager tạo task → Chọn NV → Chọn template (nếu có)
    │
    ▼ [TỰ ĐỘNG]
Task status = "Đang làm", progress = 1%
Email thông báo → NV
Notification bell → NV
    │
    ▼ [NV LÀM VIỆC]
NV tick checklist từng bước
    ├─ Bước thường: tick → done
    └─ Bước có 📷: upload ảnh/file → mới được tick
    │
    ▼ [TỰ ĐỘNG] khi checklist 100%
Task status = "Hoàn thành"
Popup đánh giá hiện ra (KHÔNG ĐÓNG ĐƯỢC)
    │
    ▼ [NV CHẤM SAO] — thao tác duy nhất
⭐⭐⭐⭐☆ (1-5 sao) + ghi chú ngắn (≥10 ký tự)
    │
    ▼ [TỰ ĐỘNG]
evaluation_status = "Chờ duyệt"
Notification → Manager
    │
    ▼ [MANAGER DUYỆT]
Batch approve: chọn nhiều → chấm sao → duyệt 1 click
    │
    ▼ [TỰ ĐỘNG] nếu Manager không duyệt trong 48h
Auto approve: final_score = NV tự chấm (không có bonus Manager)
    │
    ▼ [TỰ ĐỘNG]
final_score = NV × 40% + Manager × 60%
→ Hiện trên Dashboard hiệu suất
```

### 3.2 Luồng NV tự giao task

```
NV tạo task cho mình → Chọn template (nếu có)
    │
    ▼ [TỰ ĐỘNG]
Task status = "Đang làm", is_self_assigned = true
    │
    ▼ [NV LÀM VIỆC]
NV tick checklist (giống luồng 1)
    │
    ▼ [TỰ ĐỘNG] khi checklist 100%
Popup đánh giá (KHÔNG ĐÓNG ĐƯỢC)
    │
    ▼ [NV CHẤM SAO]
⭐⭐⭐⭐☆ + ghi chú
    │
    ▼ [TỰ ĐỘNG — KHÁC LUỒNG 1]
AUTO APPROVE — không cần Manager duyệt
final_score = NV tự chấm × 70% (hệ số thấp hơn)
    │
    ▼ [TỰ ĐỘNG]
→ Hiện trên Dashboard hiệu suất
```

### 3.3 Luồng Task Recurring (tự động)

```
Edge Function 6:00 AM → Tạo task cho NV
    │
    ▼ [TỰ ĐỘNG]
Task status = "Đang làm", checklist từ template
    │
    ▼ [NV LÀM VIỆC]
Tick checklist (CÓ DEADLINE cuối ngày)
    │
    ▼ [TỰ ĐỘNG] khi 100%
Popup đánh giá
    │
    ▼ [TỰ ĐỘNG]
Recurring task → Auto approve
final_score = NV tự chấm × 80% (hệ số vừa)
```

---

## 4. CÔNG THỨC TÍNH ĐIỂM

### 4.1 Điểm từng Task

```
┌──────────────────────────────────────────────────┐
│                                                  │
│  TASK DO MANAGER GIAO:                           │
│  final_score = NV × 40% + Manager × 60%         │
│  Hệ số: 1.0 (full weight)                       │
│                                                  │
│  TASK TỰ GIAO:                                   │
│  final_score = NV × 70%                          │
│  Hệ số: 0.7 (thấp hơn, không có Manager verify)│
│  Auto approve — Manager không cần duyệt          │
│                                                  │
│  TASK RECURRING:                                  │
│  final_score = NV × 80%                          │
│  Hệ số: 0.8 (task routine, auto approve)         │
│  Auto approve — Manager không cần duyệt          │
│                                                  │
│  TASK DỰ ÁN:                                     │
│  final_score = NV × 40% + PM × 60%              │
│  Hệ số: 1.0 (giống Manager giao)                │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 4.2 Quy đổi sao → điểm

| Sao | Điểm | Nhận xét |
|-----|------|---------|
| ⭐ | 20 | Chưa tốt |
| ⭐⭐ | 40 | Cần cải thiện |
| ⭐⭐⭐ | 60 | Trung bình |
| ⭐⭐⭐⭐ | 80 | Tốt |
| ⭐⭐⭐⭐⭐ | 100 | Xuất sắc |

### 4.3 Điểm tháng

```
Điểm Công việc = Trung bình weighted (tất cả task trong tháng)

Weight:
- Task Manager giao:  weight = 1.0 (quan trọng nhất)
- Task dự án:         weight = 1.0
- Task recurring:     weight = 0.5 (task routine, ít quan trọng)
- Task tự giao:       weight = 0.3 (cá nhân, ít quan trọng)

Ví dụ:
  Task 1 (Manager giao):  85đ × weight 1.0 = 85
  Task 2 (Dự án):         90đ × weight 1.0 = 90
  Task 3 (Recurring):     80đ × weight 0.5 = 40
  Task 4 (Tự giao):       75đ × weight 0.3 = 22.5

  Tổng weight = 1.0 + 1.0 + 0.5 + 0.3 = 2.8
  Điểm CV = (85 + 90 + 40 + 22.5) / 2.8 = 84.8
```

### 4.4 Điểm tổng hợp

```
┌─────────────────────────────────────────────┐
│                                             │
│  Điểm Tổng = Điểm CV × 70%                │
│             + Điểm Chấm công × 30%         │
│                                             │
│  Chấm công:                                │
│    Base = 100                               │
│    - 10 × nghỉ không phép                  │
│    - 5 × đi trễ                            │
│    + 5 × tăng ca approved (max +20)        │
│                                             │
└─────────────────────────────────────────────┘
```

### 4.5 Xếp hạng

| Hạng | Điểm | Màu |
|------|------|-----|
| **A** | 90 - 100 | 🟢 Xanh lá |
| **B** | 75 - 89 | 🔵 Xanh dương |
| **C** | 60 - 74 | 🟠 Cam |
| **D** | 40 - 59 | 🔴 Đỏ |
| **F** | < 40 | ⚫ Đen |

---

## 5. RÀNG BUỘC QUY TRÌNH

### 5.1 Bắt buộc đánh giá

```
Task hoàn thành → Popup đánh giá KHÔNG ĐÓNG ĐƯỢC
    │
    ├─ NV phải chấm sao (1-5)
    ├─ NV phải ghi chú ≥ 10 ký tự
    └─ Không có nút "Bỏ qua"
    │
    ▼
Nếu NV refresh trang / đóng tab:
    → Mở /my-tasks → popup hiện lại
    → Có > 3 task chưa đánh giá → KHÔNG cho tạo task mới
```

### 5.2 Bằng chứng cho checklist

```
Template đánh dấu item "Cần bằng chứng" 📷
    │
    ▼
NV tick item đó → Modal upload ảnh/file hiện ra
    → Phải upload ít nhất 1 file
    → Mới cho tick hoàn thành
    → File lưu vào Supabase Storage
```

### 5.3 Auto-approve rules

```
TASK TỰ GIAO:
  → NV đánh giá xong → AUTO APPROVE ngay
  → final_score = NV × 70%
  → Manager KHÔNG cần duyệt

TASK RECURRING:
  → NV đánh giá xong → AUTO APPROVE ngay
  → final_score = NV × 80%
  → Manager KHÔNG cần duyệt

TASK MANAGER GIAO:
  → NV đánh giá xong → Gửi Manager
  → Manager có 48h
  → Quá 48h → AUTO APPROVE: final_score = NV tự chấm (100%)
  → Notification cảnh báo Manager mỗi 24h

TASK DỰ ÁN:
  → Giống Manager giao (PM duyệt)
```

### 5.4 Giới hạn task chưa đánh giá

```
NV có > 3 task status "Chờ tự đánh giá":
  → Không cho tạo task mới (tự giao)
  → Hiện cảnh báo đỏ trên /my-tasks
  → Email nhắc nhở
```

---

## 6. CẤU TRÚC DATABASE

### 6.1 Bảng `tasks` — Sau tối ưu

```
GIỮA (22 cột):
  id, code, name, description, department_id, assignee_id, assigner_id,
  project_id, phase_id, parent_task_id, milestone_id,
  start_date, due_date, completed_date,
  status, priority, progress, evaluation_status,
  is_self_assigned, notes, tags,
  created_at, updated_at

THÊM (5 cột):
  self_score INTEGER          -- NV tự chấm (20-100)
  manager_score INTEGER       -- Manager chấm (20-100)
  final_score INTEGER         -- Điểm cuối
  task_source VARCHAR(20)     -- 'assigned' | 'self' | 'recurring' | 'project'
  evidence_count INTEGER      -- Số file bằng chứng

BỎ (7 cột):
  completed_at, calculated_progress, progress_mode,
  checklist, assigned_at, assigned_by, reviewer_id
```

### 6.2 Bảng `task_checklist_items` — Thêm evidence

```
HIỆN TẠI:
  id, task_id, title, is_completed, completed_at, completed_by, sort_order

THÊM:
  requires_evidence BOOLEAN DEFAULT false    -- Cần ảnh/file
  evidence_url TEXT                          -- Link file đã upload
  evidence_note TEXT                         -- Ghi chú bằng chứng
```

### 6.3 Bảng `task_approvals` — Thêm deadline

```
THÊM:
  deadline TIMESTAMPTZ         -- 48h sau khi NV đánh giá
  auto_approved BOOLEAN        -- True nếu quá deadline
```

---

## 7. SO SÁNH TRƯỚC / SAU

### Thao tác nhân viên

| Bước | TRƯỚC | SAU |
|------|-------|-----|
| Nhận task | Xem → bấm bắt đầu | **Tự động** |
| Cập nhật progress | Kéo slider | **Tự động** từ checklist |
| Hoàn thành | Bấm nút | **Tự động** khi checklist 100% |
| Tự đánh giá | Điền 7 trường form | **Chấm 1-5 sao** + ghi chú |
| Chờ duyệt | Chờ Manager | **Auto approve** (tự giao/recurring) |
| **Tổng thao tác** | **6 bước** | **2 bước** |

### Thao tác Manager

| Bước | TRƯỚC | SAU |
|------|-------|-----|
| Duyệt task | Từng task một | **Batch approve** (chọn nhiều) |
| Task tự giao NV | Phải duyệt | **Auto approve** |
| Task recurring | Phải duyệt | **Auto approve** |
| Quên duyệt | Tồn đọng mãi | **Auto approve sau 48h** |
| **Tổng thao tác** | **~20 phút/ngày** | **~5 phút/ngày** |

### Chất lượng data

| Metric | TRƯỚC | SAU |
|--------|-------|-----|
| Task có đánh giá | ~30% (NV skip) | **100%** (bắt buộc) |
| Bằng chứng | 0% | **100%** cho task quan trọng |
| Dashboard hiệu suất | Không có | **Có** (real-time) |
| Báo cáo BGĐ | Không có | **Có** (PDF/Excel) |

---

## 8. SQL MIGRATION

```sql
-- 1. Thêm cột mới cho tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS self_score INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS manager_score INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS final_score INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_source VARCHAR(20) DEFAULT 'assigned';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS evidence_count INTEGER DEFAULT 0;

-- 2. Checklist evidence
ALTER TABLE task_checklist_items
  ADD COLUMN IF NOT EXISTS requires_evidence BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS evidence_url TEXT,
  ADD COLUMN IF NOT EXISTS evidence_note TEXT;

-- 3. Approval deadline
ALTER TABLE task_approvals
  ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_approved BOOLEAN DEFAULT false;

-- 4. Backfill task_source cho task cũ
UPDATE tasks SET task_source = 'self' WHERE is_self_assigned = true AND task_source IS NULL;
UPDATE tasks SET task_source = 'project' WHERE project_id IS NOT NULL AND task_source IS NULL;
UPDATE tasks SET task_source = 'assigned' WHERE task_source IS NULL;
```

---

## 9. IMPLEMENTATION PLAN

| Phase | Nội dung | Files | Effort |
|-------|----------|-------|--------|
| **A** | SQL migration + backfill | SQL | 10 phút |
| **B** | QuickEvalModal bắt buộc (không skip) + ghi chú ≥10 ký tự | QuickEvalModal.tsx | 30 phút |
| **C** | Auto-approve logic (tự giao + recurring + 48h timeout) | taskService.ts, QuickEvalModal | 1 giờ |
| **D** | Checklist evidence (upload ảnh) | TaskChecklist.tsx, checklistService | 1 giờ |
| **E** | Task weight + source tracking | performanceService.ts | 30 phút |
| **F** | Fix Performance Dashboard query | performanceService.ts | 30 phút |
| **G** | Giới hạn 3 task chưa đánh giá | TaskCreatePage, MyTasksPage | 30 phút |
| **H** | Test + deploy | — | 30 phút |

**Tổng: ~5 giờ**

---

> Hệ thống Công việc v3.0 — Thiết kế tối ưu
> Huy Anh Rubber ERP v8
> 27/03/2026
