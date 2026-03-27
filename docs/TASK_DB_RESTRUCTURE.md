# PHÂN TÍCH CẤU TRÚC BẢNG TASK — ĐỀ XUẤT TÁI CẤU TRÚC

> Ngày: 27/03/2026

---

## 1. HIỆN TRẠNG: BẢNG `tasks` — 34 CỘT

### Cột cần giữ (22 cột)

| Cột | Mục đích | Giữ? |
|-----|---------|------|
| `id` | Primary key | ✅ |
| `code` | Mã công việc (CV-XXXX) | ✅ |
| `name` | Tên công việc | ✅ |
| `description` | Mô tả | ✅ |
| `department_id` | Phòng ban | ✅ |
| `assignee_id` | Người thực hiện | ✅ |
| `assigner_id` | Người giao | ✅ |
| `project_id` | Liên kết dự án | ✅ |
| `phase_id` | Phase trong dự án | ✅ |
| `parent_task_id` | Subtask | ✅ |
| `start_date` | Ngày bắt đầu | ✅ |
| `due_date` | Hạn hoàn thành | ✅ |
| `completed_date` | Ngày hoàn thành thực tế | ✅ |
| `status` | Trạng thái | ✅ |
| `priority` | Ưu tiên | ✅ |
| `progress` | Tiến độ (0-100%) | ✅ |
| `evaluation_status` | Trạng thái đánh giá | ✅ |
| `is_self_assigned` | Tự giao | ✅ |
| `notes` | Ghi chú | ✅ |
| `tags` | Nhãn | ✅ |
| `created_at` | Ngày tạo | ✅ |
| `updated_at` | Ngày cập nhật | ✅ |

### Cột DƯ THỪA / TRÙNG LẶP (12 cột)

| Cột | Vấn đề | Đề xuất |
|-----|--------|---------|
| `completed_at` | **TRÙNG** với `completed_date` | ❌ XÓA — dùng `completed_date` |
| `calculated_progress` | **TRÙNG** với `progress` | ❌ XÓA — tính từ checklist |
| `progress_mode` | Chỉ có 'manual'/'auto' — không cần | ❌ XÓA — luôn auto từ checklist |
| `checklist` | JSONB cũ — đã có bảng `task_checklist_items` | ❌ XÓA — dùng bảng riêng |
| `created_by` | **TRÙNG** với `assigner_id` | ❌ XÓA — dùng `assigner_id` |
| `assigned_at` | Ít dùng — `created_at` đủ | ❌ XÓA |
| `assigned_by` | **TRÙNG** với `assigner_id` | ❌ XÓA |
| `reviewer_id` | Chưa dùng — thay bằng luồng approval | ❌ XÓA |
| `task_type` | Chưa dùng rõ ràng | ⚠️ GIỮ nếu cần phân loại |
| `milestone_id` | Ít dùng — có thể link qua project | ⚠️ GIỮ |
| `estimated_hours` | Ít dùng | ⚠️ GIỮ — hữu ích cho báo cáo |
| `actual_hours` | Ít dùng | ⚠️ GIỮ — hữu ích cho báo cáo |

### Cột CẦN THÊM

| Cột | Mục đích | Kiểu |
|-----|---------|------|
| `self_score` | NV tự chấm (1-5 sao → 20-100) | INTEGER |
| `manager_score` | Manager chấm | INTEGER |
| `final_score` | Điểm cuối = self×40% + mgr×60% | INTEGER |
| `requires_evidence` | Bắt buộc đính kèm bằng chứng | BOOLEAN DEFAULT false |
| `evidence_count` | Số file/ảnh đã đính kèm | INTEGER DEFAULT 0 |

---

## 2. BẢNG ĐÁNH GIÁ — HIỆN TẠI QUÁ PHỨC TẠP

### `task_self_evaluations` (15 cột) — QUÁ NHIỀU

```
Hiện tại NV phải điền:
- completion_percentage    ← TRÙNG progress
- self_score               ← CẦN
- quality_assessment       ← Quá phức tạp
- achievements             ← Quá phức tạp
- difficulties             ← Quá phức tạp
- solutions                ← Quá phức tạp
- recommendations          ← Quá phức tạp
- status                   ← TRÙNG
- revision_count           ← Ít dùng
```

**→ NV phải điền 7 trường → QUAY TAY → SKIP**

### Đề xuất: Đơn giản hóa

```
Chỉ cần:
- task_id
- employee_id
- score (1-5 sao → 20-100)
- notes (ghi chú ngắn, tùy chọn)
- submitted_at
```

**→ NV chỉ cần: chấm sao + ghi chú → 5 GIÂY**

### `task_approvals` — OK nhưng cần thêm

Thêm:
- `deadline` (48h sau khi NV đánh giá)
- `auto_approved` (boolean — tự duyệt nếu quá deadline)

### `task_evaluations` — OK, giữ nguyên

Đây là bảng cuối cùng lưu điểm final — đã đúng.

---

## 3. RÀNG BUỘC QUY TRÌNH MỚI

### 3.1 Checklist bắt buộc bằng chứng

```sql
-- Thêm cột cho task_checklist_items
ALTER TABLE task_checklist_items
  ADD COLUMN IF NOT EXISTS requires_evidence BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS evidence_url TEXT,
  ADD COLUMN IF NOT EXISTS evidence_note TEXT;
```

Khi `requires_evidence = true`:
- NV phải upload ảnh/file **TRƯỚC** khi tick hoàn thành
- UI hiện icon 📷 bên cạnh item
- Không cho tick nếu chưa có evidence

### 3.2 Bắt buộc đánh giá

```
Task hoàn thành → Popup đánh giá → KHÔNG CHO BỎ QUA

Nếu NV đóng popup → Task vẫn "Hoàn thành" nhưng:
- evaluation_status = 'pending_self_eval'
- Mỗi lần mở /my-tasks → nhắc đánh giá
- Sau 24h → email nhắc
- KHÔNG cho nhận task mới nếu có > 3 task chưa đánh giá
```

### 3.3 Manager deadline duyệt

```
NV đánh giá xong → Manager có 48h để duyệt
- 24h: Notification nhắc
- 48h: Email cảnh báo
- 72h: Auto approve với score = NV tự chấm (không bonus manager)
```

### 3.4 Bằng chứng cho task quan trọng

```
Template có thể đánh dấu checklist item "Cần bằng chứng":

Ví dụ: Bảo trì lò sấy
  ☐ Tắt lò, chờ nguội
  ☐ Kiểm tra bộ phận đốt        📷 (cần ảnh)
  ☐ Vệ sinh buồng sấy           📷 (cần ảnh)
  ☐ Test chạy thử               📷 (cần ảnh)
  ☐ Bật lại sản xuất

→ 3/5 items cần ảnh → NV phải chụp ảnh chứng minh
```

---

## 4. SQL MIGRATION ĐỀ XUẤT

```sql
-- 1. Thêm cột mới cho tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS self_score INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS manager_score INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS final_score INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS requires_evidence BOOLEAN DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS evidence_count INTEGER DEFAULT 0;

-- 2. Thêm cột cho checklist evidence
ALTER TABLE task_checklist_items
  ADD COLUMN IF NOT EXISTS requires_evidence BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS evidence_url TEXT,
  ADD COLUMN IF NOT EXISTS evidence_note TEXT;

-- 3. Xóa cột dư thừa (CẨN THẬN — backup trước)
-- ALTER TABLE tasks DROP COLUMN IF EXISTS completed_at;
-- ALTER TABLE tasks DROP COLUMN IF EXISTS calculated_progress;
-- ALTER TABLE tasks DROP COLUMN IF EXISTS progress_mode;
-- ALTER TABLE tasks DROP COLUMN IF EXISTS checklist;
-- ALTER TABLE tasks DROP COLUMN IF EXISTS assigned_at;
-- ALTER TABLE tasks DROP COLUMN IF EXISTS assigned_by;
-- ALTER TABLE tasks DROP COLUMN IF EXISTS reviewer_id;

-- 4. Thêm deadline cho approvals
ALTER TABLE task_approvals
  ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_approved BOOLEAN DEFAULT false;
```

---

## 5. TÓM TẮT THAY ĐỔI

### Trước (34 cột, nhiều trùng lặp)

```
tasks: 34 cột (12 dư thừa)
task_self_evaluations: 15 cột (7 trường NV phải điền)
task_approvals: không có deadline
task_checklist_items: không có evidence
```

### Sau (25 cột, gọn gàng)

```
tasks: 25 cột (bỏ 12 dư, thêm 3 mới)
task_self_evaluations: giữ nguyên bảng nhưng UI đơn giản (chỉ sao + ghi chú)
task_approvals: thêm deadline + auto_approved
task_checklist_items: thêm requires_evidence + evidence_url
```

### Ràng buộc quy trình

```
✅ Checklist quan trọng → bắt buộc ảnh
✅ Hoàn thành → bắt buộc đánh giá (không skip)
✅ > 3 task chưa đánh giá → không cho nhận task mới
✅ Manager 48h deadline → auto approve nếu quá
✅ Progress tự động từ checklist (không thủ công)
```

---

> Phân tích cấu trúc DB Task v2.0
> Huy Anh Rubber ERP v8
