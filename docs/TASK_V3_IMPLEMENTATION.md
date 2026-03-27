# TRIỂN KHAI HỆ THỐNG CÔNG VIỆC V3

> **Ngày:** 27/03/2026
> **Tham chiếu:** DE_XUAT_NANG_CAP_HE_THONG_CONG_VIEC_V3.docx
> **Lưu ý:** Toàn bộ UX hiển thị bằng **tiếng Việt có dấu**

---

## TỔNG QUAN

### Mục tiêu V3

1. 100% task có đánh giá (bắt buộc, không bỏ qua được)
2. 100% task quan trọng có bằng chứng (ảnh/file)
3. Giảm thao tác NV từ 6 bước xuống 2 bước
4. Giảm thời gian Manager duyệt từ ~20 phút xuống ~5 phút/ngày
5. Dashboard hiệu suất real-time cho BGĐ
6. Xếp hạng gắn trực tiếp với lương khoán

### 9 phần cần triển khai

| # | Phần | Mô tả |
|---|------|-------|
| A | SQL Migration | Thêm cột, tạo bảng cấu hình lương khoán |
| B | Đánh giá bắt buộc | Popup 1-5 sao không bỏ qua được |
| C | Tự động duyệt | Auto-approve cho tự giao + recurring + 48h |
| D | Bằng chứng checklist | Upload ảnh/file cho item quan trọng |
| E | Tracking nguồn task | task_source + template.is_routine |
| F | Dashboard hiệu suất | Tích hợp weight + fix query |
| G | Giới hạn đánh giá | Chặn tạo task khi > 3 chưa đánh giá |
| H | Lương khoán theo xếp hạng | Cấu hình + tính lương tự động |
| I | Test + Deploy | Kiểm tra toàn bộ + đẩy production |

---

## PHẦN A: SQL MIGRATION

### A.1 Bảng `tasks` — Thêm cột

```sql
-- Điểm đánh giá
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS self_score INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS manager_score INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS final_score INTEGER;

-- Nguồn tạo task
-- 'assigned' = Quản lý giao
-- 'self' = Nhân viên tự giao
-- 'recurring' = Lịch tự động (công việc lặp lại)
-- 'project' = Task dự án
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_source VARCHAR(20) DEFAULT 'assigned';

-- Số lượng bằng chứng đã đính kèm
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS evidence_count INTEGER DEFAULT 0;
```

### A.2 Bảng `task_checklist_items` — Bằng chứng

```sql
ALTER TABLE task_checklist_items
  ADD COLUMN IF NOT EXISTS requires_evidence BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS evidence_url TEXT,
  ADD COLUMN IF NOT EXISTS evidence_note TEXT;
```

### A.3 Bảng `task_templates` — Đánh dấu lặp lại

```sql
ALTER TABLE task_templates
  ADD COLUMN IF NOT EXISTS is_routine BOOLEAN DEFAULT false;

-- Cập nhật mẫu hiện có
UPDATE task_templates SET is_routine = true
WHERE name ILIKE '%trực ca%' OR name ILIKE '%định kỳ%';
```

### A.4 Bảng `task_approvals` — Deadline duyệt

```sql
ALTER TABLE task_approvals
  ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_approved BOOLEAN DEFAULT false;
```

### A.5 Bảng `performance_salary_config` — Cấu hình lương khoán

```sql
CREATE TABLE IF NOT EXISTS performance_salary_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade CHAR(1) NOT NULL UNIQUE,
  grade_label VARCHAR(50) NOT NULL,
  min_score INTEGER NOT NULL,
  max_score INTEGER NOT NULL,
  salary_coefficient DECIMAL(4,2) NOT NULL DEFAULT 1.0,
  bonus_percentage INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE performance_salary_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cho phép đọc cấu hình lương" ON performance_salary_config
  FOR SELECT USING (true);

-- Dữ liệu mặc định theo Phương án 3
INSERT INTO performance_salary_config (grade, grade_label, min_score, max_score, salary_coefficient, bonus_percentage, description)
VALUES
  ('A', 'Xuất sắc',       90, 100, 1.00, 100, 'Đủ lương + 100% thưởng hiệu suất. Ưu tiên thăng tiến, khen thưởng.'),
  ('B', 'Tốt',            75,  89, 1.00,  50, 'Đủ lương + 50% thưởng hiệu suất. Hoàn thành tốt nhiệm vụ.'),
  ('C', 'Trung bình',     60,  74, 0.95,   0, 'Trừ 5% lương, không thưởng. Cần nỗ lực thêm.'),
  ('D', 'Cần cải thiện',  40,  59, 0.90,   0, 'Trừ 10% lương, không thưởng. Cần cải thiện gấp.'),
  ('F', 'Không đạt',       0,  39, 0.85,   0, 'Trừ 15% lương, không thưởng. Xem xét kỷ luật.')
ON CONFLICT (grade) DO NOTHING;
```

### A.6 Bảng `salary_grades` — Thêm mức thưởng tối đa

```sql
ALTER TABLE salary_grades
  ADD COLUMN IF NOT EXISTS max_performance_bonus INTEGER DEFAULT 0;

-- Cập nhật mức thưởng theo vị trí (ví dụ)
-- UPDATE salary_grades SET max_performance_bonus = 2000000 WHERE level >= 6; -- NV
-- UPDATE salary_grades SET max_performance_bonus = 3000000 WHERE level = 5;  -- Phó phòng
-- UPDATE salary_grades SET max_performance_bonus = 4000000 WHERE level = 4;  -- Trưởng phòng
```

### A.7 Backfill task_source cho task cũ

```sql
UPDATE tasks SET task_source = 'self' WHERE is_self_assigned = true AND task_source IS NULL;
UPDATE tasks SET task_source = 'project' WHERE project_id IS NOT NULL AND task_source IS NULL;
UPDATE tasks SET task_source = 'assigned' WHERE task_source IS NULL;
```

### A.8 Storage bucket cho bằng chứng

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-evidence', 'task-evidence', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Cho phép đọc bằng chứng" ON storage.objects
  FOR SELECT USING (bucket_id = 'task-evidence');

CREATE POLICY "Cho phép upload bằng chứng" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'task-evidence');
```

---

## PHẦN B: ĐÁNH GIÁ BẮT BUỘC

### B.1 Sửa QuickEvalModal.tsx

**Thay đổi:**
- Bỏ nút **"Bỏ qua"** — chỉ còn nút **"Gửi đánh giá"**
- Modal `closable={false}`, `maskClosable={false}`, `keyboard={false}`
- Bắt buộc chọn sao (1-5)
- Bắt buộc ghi chú tối thiểu **10 ký tự**

**UI:**
```
┌─────────────────────────────────────┐
│  ⭐ Tự đánh giá công việc           │
│                                     │
│  CV-0238: Bảo trì lò sấy           │
│                                     │
│  Bạn tự chấm:  ☆ ☆ ☆ ☆ ☆          │
│                                     │
│  ⭐⭐⭐⭐ = Tốt (80 điểm)           │
│                                     │
│  Ghi chú *:                         │
│  ┌──────────────────────────────┐   │
│  │ Hoàn thành đúng tiến độ     │   │
│  └──────────────────────────────┘   │
│  (Tối thiểu 10 ký tự)              │
│                                     │
│              [🌟 Gửi đánh giá]      │
│                                     │
│  ⚠️ Bạn phải đánh giá để tiếp tục  │
└─────────────────────────────────────┘
```

### B.2 Khi nào popup hiện

1. Checklist 100% → tự động hoàn thành → popup hiện ngay
2. Nhân viên bấm nút "Hoàn thành" → popup hiện ngay
3. Nhân viên mở "Công việc của tôi" có task chờ đánh giá → nhắc ở đầu trang

### B.3 Khi nào popup KHÔNG hiện

- Task bị hủy
- Task đã đánh giá rồi

---

## PHẦN C: TỰ ĐỘNG DUYỆT (AUTO-APPROVE)

### C.1 Quy tắc

| Loại task | Sau khi đánh giá | Công thức điểm |
|-----------|-----------------|----------------|
| **Tự giao** | Tự động duyệt ngay | NV × 70% |
| **Lặp lại** (recurring) | Tự động duyệt ngay | NV × 80% |
| **Quản lý giao** | Gửi quản lý, tự động sau 48h | NV×40% + QL×60% |
| **Dự án** | Gửi PM, tự động sau 48h | NV×40% + PM×60% |

### C.2 Logic trong QuickEvalModal

```typescript
// Sau khi NV chấm sao xong:

if (task.task_source === 'self' || task.task_source === 'recurring') {
  // TỰ ĐỘNG DUYỆT — không cần quản lý
  const hệSố = task.task_source === 'self' ? 0.7 : 0.8
  const điểmCuối = Math.round(điểmNV * hệSố)

  // Cập nhật task
  await supabase.from('tasks').update({
    self_score: điểmNV,
    final_score: điểmCuối,
    evaluation_status: 'approved',
  }).eq('id', taskId)

  // Tạo bản ghi đánh giá
  await supabase.from('task_evaluations').insert({
    task_id: taskId, employee_id: userId,
    evaluator_id: userId,
    score: điểmCuối,
    rating: tínhXếpHạng(điểmCuối),
  })

} else {
  // GỬI QUẢN LÝ DUYỆT
  const hạnDuyệt = new Date(Date.now() + 48 * 3600 * 1000) // 48 giờ

  await supabase.from('tasks').update({
    self_score: điểmNV,
    evaluation_status: 'pending_approval',
  }).eq('id', taskId)

  await supabase.from('task_approvals').insert({
    task_id: taskId,
    deadline: hạnDuyệt.toISOString(),
  })
}
```

### C.3 Tự động duyệt khi quá 48 giờ

Trong Edge Function `task-reminders` (chạy 8:00 AM hàng ngày):
- Tìm task chờ duyệt quá 48 giờ
- Tự động duyệt với `final_score = self_score`
- Đánh dấu `auto_approved = true`
- Ghi chú: "Tự động duyệt do quá thời hạn 48 giờ"

### C.4 Phê duyệt nhanh (Batch Approve)

Quản lý chấm sao → tính điểm cuối:
```
Điểm cuối = NV tự chấm × 40% + Quản lý chấm × 60%
```

---

## PHẦN D: BẰNG CHỨNG CHECKLIST

### D.1 TaskChecklist — Upload bằng chứng

Khi item có `requires_evidence = true`:
- Hiện icon 📷 bên cạnh tiêu đề
- Tick → hiện modal upload (không tick ngay)
- Phải upload ít nhất 1 file (ảnh/PDF)
- File lưu vào Supabase Storage bucket `task-evidence`
- Sau upload → item mới được tick hoàn thành

**UI:**
```
Danh sách bước (3/5)

  ✅ 1. Tắt lò, chờ nguội
  ✅ 2. Kiểm tra bộ phận đốt  📷 (1 ảnh đã đính kèm)
  ☐  3. Vệ sinh buồng sấy    📷 Cần ảnh bằng chứng
  ☐  4. Chạy thử nghiệm       📷 Cần ảnh bằng chứng
  ☐  5. Bật lại sản xuất
```

**Modal upload bằng chứng:**
```
┌─────────────────────────────────────┐
│  📷 Đính kèm bằng chứng            │
│                                     │
│  Bước: Vệ sinh buồng sấy           │
│                                     │
│  ┌─────────────────────────────┐    │
│  │                             │    │
│  │   Kéo thả ảnh vào đây     │    │
│  │   hoặc bấm để chọn file   │    │
│  │                             │    │
│  └─────────────────────────────┘    │
│                                     │
│  Ghi chú: [___________________]     │
│                                     │
│  [Hủy]     [✅ Xác nhận hoàn thành] │
└─────────────────────────────────────┘
```

### D.2 Mẫu công việc — Đánh dấu bước cần bằng chứng

```
Danh sách bước:
  1. [Tắt lò, chờ nguội        ] ☐ Cần bằng chứng  [×]
  2. [Kiểm tra bộ phận đốt     ] ☑ Cần bằng chứng  [×]
  3. [Vệ sinh buồng sấy        ] ☑ Cần bằng chứng  [×]
  4. [Chạy thử nghiệm           ] ☑ Cần bằng chứng  [×]
  5. [Bật lại sản xuất          ] ☐ Cần bằng chứng  [×]

  [+ Thêm bước mới]
```

---

## PHẦN E: XÁC ĐỊNH NGUỒN TASK

### E.1 task_source — Tự động xác định (hệ thống tự biết)

| Ngữ cảnh | task_source | Cách xác định |
|-----------|-------------|--------------|
| Edge Function tạo | `recurring` | Edge Function gán khi tạo |
| Nhân viên bấm "Tự giao" | `self` | `is_self_assigned = true` |
| Task thuộc dự án | `project` | `project_id IS NOT NULL` |
| Còn lại | `assigned` | Mặc định |

→ Không cần nhân viên hay quản lý chọn — hệ thống tự xác định.

### E.2 template.is_routine — Quản lý đánh dấu khi tạo mẫu

```
┌─────────────────────────────────────┐
│ Tạo mẫu công việc mới               │
│                                     │
│ Tên mẫu: [Trực ca Điện-Nước      ] │
│ Danh mục: [Chung ▼]                │
│                                     │
│ ☑ Công việc lặp lại                │
│   Task tạo từ mẫu này sẽ có        │
│   trọng số 0.5 khi tính hiệu suất  │
│                                     │
│ Danh sách bước: ...                 │
└─────────────────────────────────────┘
```

### E.3 Bảng xác định weight

| Cách tạo | task_source | Mẫu lặp lại? | Tự động duyệt? | Weight | Công thức |
|----------|-------------|--------------|----------------|--------|-----------|
| Lịch tự động | `recurring` | — | ✅ | 0.5 | NV × 80% |
| Quản lý chọn mẫu lặp lại | `assigned` | ✅ | ❌ QL duyệt | 0.5 | NV×40% + QL×60% |
| Quản lý chọn mẫu thường | `assigned` | ❌ | ❌ QL duyệt | 1.0 | NV×40% + QL×60% |
| Quản lý tạo mới (không mẫu) | `assigned` | — | ❌ QL duyệt | 1.0 | NV×40% + QL×60% |
| Nhân viên tự giao | `self` | — | ✅ | 0.3 | NV × 70% |
| Task dự án | `project` | — | ❌ PM duyệt | 1.0 | NV×40% + PM×60% |

---

## PHẦN F: TÍNH ĐIỂM HIỆU SUẤT

### F.1 Thang điểm sao

| Sao | Điểm | Nhận xét |
|-----|------|---------|
| ⭐ | 20 | Chưa tốt |
| ⭐⭐ | 40 | Cần cải thiện |
| ⭐⭐⭐ | 60 | Trung bình |
| ⭐⭐⭐⭐ | 80 | Tốt |
| ⭐⭐⭐⭐⭐ | 100 | Xuất sắc |

### F.2 Điểm từng task

```
Quản lý giao / Dự án:  final_score = NV×40% + QL×60%
Lặp lại (recurring):   final_score = NV × 80%
Tự giao:               final_score = NV × 70%
```

### F.3 Điểm công việc tháng (trung bình có trọng số)

```
              Σ (final_score × weight)
Điểm CV = ─────────────────────────────
                   Σ weight

Weight:
  Quản lý giao + Dự án:  1.0
  Lặp lại:               0.5
  Tự giao:               0.3
```

**Ví dụ:**
```
NV Nguyễn Văn A — Tháng 3/2026:

1. Bảo trì lò sấy (QL giao):     85đ × 1.0 = 85.0
2. Xử lý đơn hàng (Dự án):       90đ × 1.0 = 90.0
3. Trực ca điện (Lặp lại):        80đ × 0.5 = 40.0
4. Dọn dẹp kho (Tự giao):        75đ × 0.3 = 22.5

Tổng weight = 1.0 + 1.0 + 0.5 + 0.3 = 2.8
Điểm CV = (85 + 90 + 40 + 22.5) / 2.8 = 84.8 điểm
```

### F.4 Điểm chấm công

```
Điểm cơ sở:              100 điểm
Nghỉ không phép:          −10 điểm / ngày
Đi trễ:                   −5 điểm / lần
Tăng ca được duyệt:       +5 điểm / lần (tối đa +20)
```

### F.5 Điểm tổng hợp

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  Điểm Tổng hợp = Điểm CV × 70%               │
│                 + Điểm Chấm công × 30%         │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Ví dụ:**
```
NV Nguyễn Văn A:
  Điểm CV:       84.8
  Điểm chấm công: 95 (nghỉ 0, trễ 1 lần, tăng ca 2 lần)

  Tổng hợp = 84.8 × 0.7 + 95 × 0.3
           = 59.36 + 28.5
           = 87.9 → Hạng B (Tốt)
```

### F.6 Xếp hạng

| Hạng | Điểm | Đánh giá |
|------|------|---------|
| **A** | 90 – 100 | Xuất sắc |
| **B** | 75 – 89 | Tốt |
| **C** | 60 – 74 | Trung bình |
| **D** | 40 – 59 | Cần cải thiện |
| **F** | < 40 | Không đạt |

### F.7 Dashboard hiển thị (tiếng Việt có dấu)

Tất cả label trên Dashboard:
- "NV được đánh giá" — "Điểm trung bình" — "Đúng hạn" — "Quá hạn"
- "Phân bố xếp hạng" — "Bảng xếp hạng nhân viên"
- "So sánh phòng ban" — "Xu hướng 6 tháng"
- "Chỉ công việc" / "Kết hợp chấm công"

---

## PHẦN G: GIỚI HẠN ĐÁNH GIÁ

### G.1 Chặn tạo task khi > 3 chưa đánh giá

Khi nhân viên có hơn 3 task hoàn thành nhưng chưa đánh giá:
- Không cho tạo task mới (tự giao)
- Hiện thông báo: "Bạn có X công việc chưa đánh giá. Vui lòng đánh giá trước khi tạo công việc mới."
- Chuyển hướng đến trang "Công việc của tôi"

### G.2 Cảnh báo trên trang "Công việc của tôi"

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️ Bạn có 4 công việc chưa đánh giá.                      │
│  Vui lòng đánh giá để tiếp tục tạo công việc mới.          │
│                                              [Đánh giá ngay →] │
└─────────────────────────────────────────────────────────────┘
```

---

## PHẦN H: LƯƠNG KHOÁN THEO XẾP HẠNG (Phương án 3)

### H.1 Cấu trúc 2 tầng

```
┌──────────────────────────────────────────────────────────────┐
│ TẦNG 1: Hệ số lương khoán                                   │
│                                                              │
│ Hạng A (90-100): × 1.00  — Đủ lương (không phạt)           │
│ Hạng B (75-89):  × 1.00  — Đủ lương (không phạt)           │
│ Hạng C (60-74):  × 0.95  — Trừ 5% lương                    │
│ Hạng D (40-59):  × 0.90  — Trừ 10% lương                   │
│ Hạng F (<40):    × 0.85  — Trừ 15% lương                   │
│                                                              │
│ → Hạng A và B: đủ lương — KHÔNG PHẠT nhân viên tốt         │
│ → Hạng C, D, F: trừ lương — PHẠT nhân viên kém             │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ TẦNG 2: Thưởng hiệu suất                                    │
│                                                              │
│ Mức thưởng tối đa theo vị trí:                              │
│   Nhân viên:       2.000.000đ                                │
│   Phó phòng:       3.000.000đ                                │
│   Trưởng phòng:    4.000.000đ                                │
│                                                              │
│ Chỉ Hạng A và B được thưởng:                                │
│   Hạng A: nhận 100% mức thưởng                              │
│   Hạng B: nhận 50% mức thưởng                               │
│   Hạng C trở xuống: không thưởng                             │
│                                                              │
│ → B muốn lên A = thưởng gấp đôi → động lực rõ ràng        │
└──────────────────────────────────────────────────────────────┘
```

### H.2 Công thức tính lương

```
Lương thực nhận = Lương cơ bản × Hệ số hạng + Thưởng hiệu suất
```

### H.3 Ví dụ minh họa

**Nhân viên — Lương cơ bản 8.000.000đ — Thưởng tối đa 2.000.000đ**

| Hạng | Điểm | Lương | Thưởng | Tổng nhận | Chênh lệch |
|------|------|-------|--------|-----------|-----------|
| A | 95 | 8.000.000 × 1.00 = 8.000.000 | 2.000.000 × 100% = 2.000.000 | **10.000.000đ** | +2.000.000 |
| B | 82 | 8.000.000 × 1.00 = 8.000.000 | 2.000.000 × 50% = 1.000.000 | **9.000.000đ** | +1.000.000 |
| C | 68 | 8.000.000 × 0.95 = 7.600.000 | 0 | **7.600.000đ** | −400.000 |
| D | 50 | 8.000.000 × 0.90 = 7.200.000 | 0 | **7.200.000đ** | −800.000 |
| F | 35 | 8.000.000 × 0.85 = 6.800.000 | 0 | **6.800.000đ** | −1.200.000 |

**Trưởng phòng — Lương cơ bản 15.000.000đ — Thưởng tối đa 4.000.000đ**

| Hạng | Lương | Thưởng | Tổng nhận |
|------|-------|--------|-----------|
| A | 15.000.000 | 4.000.000 | **19.000.000đ** |
| B | 15.000.000 | 2.000.000 | **17.000.000đ** |
| C | 14.250.000 | 0 | **14.250.000đ** |

### H.4 Trang cấu hình cho BGĐ

**Route:** `/settings/performance-salary` (chỉ Admin/BGĐ truy cập)

```
┌─────────────────────────────────────────────────────────────┐
│  ⚙️ Cấu hình lương khoán theo hiệu suất                    │
│                                                             │
│  Hạng │ Điểm      │ Hệ số lương │ % Thưởng │ Mô tả        │
│  ─────┼───────────┼─────────────┼──────────┼──────────     │
│  A    │ 90 - 100  │    1.00     │   100%   │ Xuất sắc      │
│  B    │ 75 - 89   │    1.00     │    50%   │ Tốt           │
│  C    │ 60 - 74   │    0.95     │     0%   │ Trung bình    │
│  D    │ 40 - 59   │    0.90     │     0%   │ Cần cải thiện │
│  F    │  0 - 39   │    0.85     │     0%   │ Không đạt     │
│                                                             │
│  Mức thưởng tối đa theo vị trí:                            │
│  ─────────────────────────────                              │
│  Nhân viên:     [2.000.000] đ                               │
│  Phó phòng:     [3.000.000] đ                               │
│  Trưởng phòng:  [4.000.000] đ                               │
│                                                             │
│                          [Lưu thay đổi]                     │
└─────────────────────────────────────────────────────────────┘
```

### H.5 Tích hợp Dashboard hiệu suất

Trên trang `/performance`, thêm cột:
- "Lương khoán" — hiện lương sau khi áp hệ số
- "Thưởng hiệu suất" — hiện số tiền thưởng
- "Tổng nhận" — lương + thưởng

```
Bảng xếp hạng nhân viên — Tháng 3/2026

#  │ Nhân viên      │ Phòng ban  │ Điểm │ Hạng │ Hệ số │ Thưởng      │
───┼────────────────┼────────────┼──────┼──────┼───────┼─────────────│
1  │ Võ Thị Kim Ngân│ Phòng QC   │  95  │  A   │ 1.00  │ 2.000.000đ  │
2  │ Lê Văn Huy     │ Ban GĐ     │  86  │  B   │ 1.00  │ 1.000.000đ  │
3  │ Trần Thị Bé    │ Phòng QC   │  68  │  C   │ 0.95  │ 0đ          │
```

---

## PHẦN I: TEST + DEPLOY

### I.1 Danh sách kiểm tra

**Đánh giá:**
- [ ] Popup đánh giá không bỏ qua được (không có nút đóng)
- [ ] Ghi chú bắt buộc tối thiểu 10 ký tự
- [ ] Chọn sao bắt buộc (1-5)

**Tự động duyệt:**
- [ ] Task tự giao → tự động duyệt → điểm = NV × 70%
- [ ] Task lặp lại → tự động duyệt → điểm = NV × 80%
- [ ] Task quản lý giao → gửi quản lý → điểm = NV×40% + QL×60%
- [ ] Quá 48 giờ không duyệt → tự động duyệt

**Bằng chứng:**
- [ ] Checklist item có 📷 → bắt buộc upload ảnh
- [ ] Upload thành công → item mới được tick
- [ ] Mẫu công việc → toggle "Cần bằng chứng" cho từng bước

**Nguồn task:**
- [ ] task_source tự động xác định đúng loại
- [ ] Mẫu có toggle "Công việc lặp lại" → weight 0.5

**Hiệu suất:**
- [ ] Dashboard hiện đúng dữ liệu
- [ ] Weight tính đúng theo loại task
- [ ] Xếp hạng A/B/C/D/F chính xác

**Lương khoán:**
- [ ] Bảng cấu hình hiện đúng hệ số + % thưởng
- [ ] Tính lương đúng công thức
- [ ] Dashboard hiện cột lương khoán + thưởng
- [ ] Chỉ BGĐ/Admin truy cập trang cấu hình

**Giới hạn:**
- [ ] > 3 task chưa đánh giá → không cho tạo task mới
- [ ] Cảnh báo trên trang "Công việc của tôi"

**VIP:**
- [ ] huylv@huyanhrubber.com không xuất hiện trong dropdown
- [ ] thuyht@huyanhrubber.com không xuất hiện trong dropdown

**Giao diện:**
- [ ] Toàn bộ tiếng Việt có dấu

### I.2 Thứ tự triển khai

```bash
# 1. Chạy SQL trên Supabase SQL Editor (Phần A toàn bộ)

# 2. Build + Push ERP
cd d:/Projects/huyanh-erp-8
npx tsc --noEmit
git add -A
git commit -m "Hệ thống Công việc V3: tự động duyệt + bằng chứng + lương khoán"
git push origin main

# 3. Deploy Edge Functions
npx supabase functions deploy task-recurring-generator
npx supabase functions deploy task-reminders
```

---

## VIP EXCLUSION (đã triển khai)

2 nhân sự cấp cao **không ai được giao công việc:**
- `huylv@huyanhrubber.com` — Giám đốc (Lê Văn Huy)
- `thuyht@huyanhrubber.com` — Trợ lý BGĐ (Hồ Thị Thủy)

---

## TÓM TẮT TOÀN BỘ THAY ĐỔI

```
V2 (hiện tại)                         V3 (nâng cấp)
─────────────────────────────────────────────────────────────
NV: 6 bước thủ công                   NV: 2 bước (tick + sao)
Form đánh giá 7 trường                1-5 sao + ghi chú ngắn
Có nút "Bỏ qua"                       Bắt buộc (không bỏ qua)
~30% có đánh giá                      100% có đánh giá
0% có bằng chứng                      100% (task quan trọng)
Quản lý duyệt từng task               Phê duyệt hàng loạt + tự động 48h
Task tự giao → Quản lý duyệt         Tự động duyệt ngay
Task lặp lại → Quản lý duyệt         Tự động duyệt ngay
Không phân biệt loại task             Weight: 1.0 / 0.5 / 0.3
Không có dashboard                    Dashboard + xếp hạng + báo cáo
Không liên kết chấm công              Chấm công = 30% tổng điểm
Không liên kết lương                  Lương khoán = hệ số × hạng + thưởng
Quản lý quên duyệt = tồn đọng       Tự động duyệt sau 48 giờ
```

---

> Tài liệu triển khai Hệ thống Công việc V3
> Công ty TNHH MTV Cao su Huy Anh Phong Điền
> ERP v8 — 27/03/2026
