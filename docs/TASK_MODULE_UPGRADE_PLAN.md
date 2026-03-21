# KẾ HOẠCH NÂNG CẤP MODULE CÔNG VIỆC

> **Ngày lập:** 21/03/2026
> **Module:** Quản lý Công việc (Task Management)
> **Phiên bản hiện tại:** v1.0 (Phase 4.1-4.3)
> **Mục tiêu:** v2.0

---

## TỔNG QUAN

| # | Tính năng | Ưu tiên | Thời gian | Phụ thuộc |
|---|----------|---------|-----------|-----------|
| 1 | Dashboard công việc cá nhân | CAO | 1 ngày | — |
| 2 | Nhắc nhở tự động | CAO | 1 ngày | Supabase Edge Function |
| 3 | Checklist trong Task | CAO | 0.5 ngày | SQL migration |
| 4 | Template công việc | TRUNG BÌNH | 1 ngày | #3 |
| 5 | Công việc định kỳ | TRUNG BÌNH | 1 ngày | #4, Supabase cron |

**Tổng thời gian ước tính: 4-5 ngày**

---

## PHASE 1: Dashboard cá nhân + Checklist (Ngày 1-2)

### 1.1 Dashboard công việc cá nhân

**Mục tiêu:** Thay thế trang `/my-tasks` hiện tại (chỉ danh sách) bằng dashboard tổng quan.

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  📋 Công việc của tôi                          Nguyễn Văn A  │
├─────────────┬──────────────┬──────────────┬─────────────────┤
│ 🔵 Đang làm │ 🔴 Quá hạn   │ ⏳ Chờ đánh  │ ✅ Hoàn thành   │
│     5       │     2        │  giá: 3      │   tháng: 12     │
├─────────────┴──────────────┴──────────────┴─────────────────┤
│                                                             │
│  📅 Deadline sắp tới              📊 Tiến độ tuần này       │
│  ┌─────────────────────┐          ┌──────────────────┐     │
│  │ T2  ● QC lô 251     │          │ ████████░░ 80%   │     │
│  │ T4  ● Báo cáo SX    │          │ Tuần trước: 65%  │     │
│  │ T6  ● Bảo trì lò    │          │ Tháng: 72%       │     │
│  │ CN  ● Kiểm kê kho   │          └──────────────────┘     │
│  └─────────────────────┘                                    │
│                                                             │
│  Tabs: [Tất cả] [Đang làm] [Chờ đánh giá] [Đã duyệt]     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Danh sách task (giữ nguyên UI hiện tại)              │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Công việc:**
- Thêm overview cards (4 thống kê) phía trên danh sách
- Thêm mini calendar (7 ngày tới) hiện task có deadline
- Thêm biểu đồ tiến độ (bar chart đơn giản)
- Giữ nguyên tabs + danh sách bên dưới

**Files cần sửa/tạo:**
- Sửa: `src/pages/evaluations/MyTasksPage.tsx` — thêm dashboard section
- Tạo: `src/services/myTaskDashboardService.ts` — query stats

---

### 1.2 Checklist trong Task

**Mục tiêu:** Mỗi task có danh sách bước nhỏ, tick từng bước → tự tính progress.

**Database:**

```sql
CREATE TABLE IF NOT EXISTS task_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by UUID,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_checklist_task ON task_checklist_items(task_id);
```

**UI trong Task Detail:**

```
┌─────────────────────────────────────────┐
│ ✅ Checklist (3/5 hoàn thành)    [+ Thêm] │
│ ─────────────────────── 60% ████████░░░ │
│                                         │
│ ☑ Cân xe tại trạm cân                  │
│ ☑ Nhập kho nguyên liệu                 │
│ ☑ QC lấy mẫu DRC                       │
│ ☐ Ghi nhận kết quả QC vào Deal         │
│ ☐ Thông báo đại lý                     │
│                                         │
│ [+ Thêm bước mới...]                   │
└─────────────────────────────────────────┘
```

**Logic:**
- Tick item → `is_completed = true`, `completed_at = now()`
- Nếu task.progress_mode = 'checklist' → progress = completed/total * 100
- Drag & drop sắp xếp thứ tự
- Có thể thêm/xóa/sửa checklist items

**Files cần tạo:**
- Tạo: `src/services/taskChecklistService.ts`
- Tạo: `src/components/tasks/TaskChecklist.tsx` — Ant Design component
- Sửa: `src/features/tasks/TaskViewPage.tsx` — thêm Checklist section
- Sửa: `src/types/task.types.ts` — thêm progress_mode: 'checklist'

---

## PHASE 2: Nhắc nhở tự động (Ngày 3)

### 2.1 Supabase Edge Function: task-reminders

**Trigger:** Cron job chạy mỗi ngày lúc 8:00 sáng

**Logic:**

```
1. Deadline sắp tới (1-3 ngày)
   → Query tasks WHERE due_date BETWEEN now() AND now() + 3 days
   → AND status IN ('in_progress', 'draft')
   → Gửi email nhắc nhở

2. Task quá hạn
   → Query tasks WHERE due_date < now()
   → AND status NOT IN ('finished', 'cancelled')
   → Gửi email cho assignee + escalate cho manager

3. Chưa tự đánh giá (>3 ngày sau hoàn thành)
   → Query tasks WHERE status = 'finished'
   → AND evaluation_status = 'none'
   → AND finished_at < now() - 3 days
   → Gửi email nhắc tự đánh giá

4. Manager chưa phê duyệt (>2 ngày)
   → Query tasks WHERE evaluation_status = 'pending_approval'
   → AND submitted_at < now() - 2 days
   → Gửi email nhắc manager duyệt
```

**Email templates mới:**

| Template | Subject | Người nhận |
|----------|---------|-----------|
| `deadline_approaching` | "⏰ Sắp đến hạn: {task}" | Assignee |
| `task_overdue_escalation` | "🔴 Quá hạn: {task}" | Assignee + Manager |
| `self_eval_reminder` | "📝 Nhắc tự đánh giá: {task}" | Assignee |
| `approval_reminder` | "⏳ Chờ phê duyệt: {task}" | Manager |

**Files cần tạo:**
- Tạo: `supabase/functions/task-reminders/index.ts` — Edge Function
- Sửa: `src/services/emailService.ts` — thêm 4 templates
- Cấu hình: Supabase Dashboard → Database → Extensions → pg_cron

**Cron setup:**

```sql
-- Chạy mỗi ngày lúc 8:00 AM (Vietnam time = 1:00 UTC)
SELECT cron.schedule(
  'task-daily-reminders',
  '0 1 * * *',
  $$SELECT net.http_post(
    url := 'https://dygveetaatqllhjusyzz.supabase.co/functions/v1/task-reminders',
    headers := '{"Authorization": "Bearer xxx"}'::jsonb
  )$$
);
```

---

## PHASE 3: Template + Công việc định kỳ (Ngày 4-5)

### 3.1 Template công việc

**Mục tiêu:** Tạo sẵn mẫu công việc cho quy trình lặp lại.

**Database:**

```sql
CREATE TABLE IF NOT EXISTS task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(50),           -- 'production', 'qc', 'maintenance', 'report'
  default_priority VARCHAR(20) DEFAULT 'medium',
  default_duration_days INTEGER DEFAULT 7,
  department_id UUID,
  checklist_items JSONB DEFAULT '[]',  -- [{title, sort_order}]
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Templates mặc định (seed data):**

| Template | Category | Duration | Checklist |
|----------|----------|----------|-----------|
| Nhập mủ đợt mới | production | 3 ngày | Cân xe → Nhập kho → QC → Ghi Deal → Thông báo |
| Bảo trì lò sấy | maintenance | 2 ngày | Tắt lò → Kiểm tra → Thay thế → Test → Bật lại |
| QC định kỳ hàng tuần | qc | 1 ngày | Lấy mẫu → Đo DRC → Ghi nhận → Cập nhật batch |
| Báo cáo sản lượng | report | 1 ngày | Thu thập số liệu → Tổng hợp → Review → Gửi |
| Kiểm kê kho | inventory | 2 ngày | Chọn kho → Đếm → So sánh → Điều chỉnh → Duyệt |

**UI:**

```
┌─────────────────────────────────────────┐
│ 📄 Tạo từ template               [Tìm] │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 🏭 Nhập mủ đợt mới                 │ │
│ │ Sản xuất • 3 ngày • 5 bước         │ │
│ │                              [Tạo] │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ 🔧 Bảo trì lò sấy                  │ │
│ │ Bảo trì • 2 ngày • 5 bước          │ │
│ │                              [Tạo] │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [+ Tạo template mới]                   │
└─────────────────────────────────────────┘
```

**Files cần tạo:**
- Tạo: `src/services/taskTemplateService.ts`
- Tạo: `src/components/tasks/TaskTemplateModal.tsx`
- Tạo: `src/pages/tasks/TaskTemplateListPage.tsx`
- Sửa: `src/features/tasks/TaskCreatePage.tsx` — nút "Tạo từ template"

---

### 3.2 Công việc định kỳ (Recurring Tasks)

**Mục tiêu:** Auto tạo task theo lịch cố định.

**Database:**

```sql
CREATE TABLE IF NOT EXISTS task_recurring_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES task_templates(id),

  -- Lịch lặp
  frequency VARCHAR(20) NOT NULL,     -- 'daily', 'weekly', 'biweekly', 'monthly'
  day_of_week INTEGER,                -- 0=CN, 1=T2... (cho weekly)
  day_of_month INTEGER,               -- 1-31 (cho monthly)
  time_of_day TIME DEFAULT '08:00',

  -- Gán cho
  assignee_id UUID,
  department_id UUID,

  -- Trạng thái
  is_active BOOLEAN DEFAULT true,
  last_generated_at TIMESTAMPTZ,
  next_generation_at TIMESTAMPTZ,

  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Recurring rules mặc định:**

| Rule | Template | Frequency | Day | Assignee |
|------|----------|-----------|-----|----------|
| QC hàng tuần | QC định kỳ | weekly | Thứ 2 | Phòng QC |
| Bảo trì hàng tháng | Bảo trì lò sấy | monthly | Ngày 1 | Phòng Kỹ thuật |
| Báo cáo tuần | Báo cáo sản lượng | weekly | Thứ 6 | Phòng SX |

**Edge Function: task-recurring-generator**

```
Chạy mỗi ngày lúc 7:00 AM:
1. Query task_recurring_rules WHERE is_active = true
   AND next_generation_at <= now()
2. Với mỗi rule:
   → Tạo task mới từ template
   → Copy checklist items
   → Gán assignee
   → Set due_date = now + template.duration_days
   → Update last_generated_at, tính next_generation_at
3. Gửi email thông báo task mới
```

**Files cần tạo:**
- Tạo: `src/services/taskRecurringService.ts`
- Tạo: `supabase/functions/task-recurring-generator/index.ts`
- Sửa: `src/pages/tasks/TaskTemplateListPage.tsx` — thêm tab Recurring

---

## THỨ TỰ TRIỂN KHAI

```
Ngày 1:
  ├── [AM] SQL migration: task_checklist_items
  ├── [AM] taskChecklistService.ts
  ├── [PM] TaskChecklist.tsx component
  └── [PM] Tích hợp vào TaskViewPage

Ngày 2:
  ├── [AM] myTaskDashboardService.ts
  ├── [AM] Dashboard cards + mini calendar
  ├── [PM] Biểu đồ tiến độ
  └── [PM] Test + deploy

Ngày 3:
  ├── [AM] Email templates mới (4 loại)
  ├── [AM] Edge Function: task-reminders
  ├── [PM] Cấu hình pg_cron
  └── [PM] Test email gửi đúng

Ngày 4:
  ├── [AM] SQL migration: task_templates, task_recurring_rules
  ├── [AM] taskTemplateService.ts
  ├── [PM] TaskTemplateModal + TaskTemplateListPage
  └── [PM] Seed data templates

Ngày 5:
  ├── [AM] taskRecurringService.ts
  ├── [AM] Edge Function: task-recurring-generator
  ├── [PM] UI quản lý recurring rules
  └── [PM] Test E2E + deploy
```

---

## CHECKLIST

### Phase 1: Dashboard + Checklist
- [ ] SQL: Tạo bảng task_checklist_items
- [ ] Service: taskChecklistService.ts
- [ ] Component: TaskChecklist.tsx
- [ ] Tích hợp TaskViewPage
- [ ] Dashboard cards trong MyTasksPage
- [ ] Mini calendar
- [ ] Biểu đồ tiến độ

### Phase 2: Nhắc nhở tự động
- [ ] 4 email templates mới
- [ ] Edge Function: task-reminders
- [ ] Cấu hình pg_cron
- [ ] Test: deadline approaching email
- [ ] Test: overdue escalation
- [ ] Test: self-eval reminder

### Phase 3: Template + Recurring
- [ ] SQL: task_templates, task_recurring_rules
- [ ] Service: taskTemplateService.ts
- [ ] TaskTemplateModal + List page
- [ ] Seed data 5 templates
- [ ] Service: taskRecurringService.ts
- [ ] Edge Function: task-recurring-generator
- [ ] UI recurring rules

---

*Task Module Upgrade Plan v1.0*
*Huy Anh Rubber ERP v8*
