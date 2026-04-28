# Task Services Guide — Sprint 4 status

**Sprint 4 đã merge 4 cặp file** (15 → 11 files). Còn 2 cặp defer sang Sprint 5
vì rủi ro cao (taskStatusService overlap với DB trigger fn_normalize_task_state,
taskAssignmentService overlap với business logic phức tạp).

## Hiện trạng — 11 files (sau Sprint 4)

| File | Scope | Status Sprint 4 |
|---|---|---|
| `taskService.ts` | CRUD core + TaskDetail (merged M1) | ✅ Đã gộp taskDetailService |
| `taskAssignmentService.ts` | Assign/reassign | ⏳ Defer Sprint 5 |
| `taskStatusService.ts` | updateStatus + transitions | ⏳ Defer Sprint 5 |
| `taskParticipantService.ts` | Participants | Giữ riêng (logic permissions phức tạp) |
| `taskChecklistService.ts` | Checklist | Giữ riêng |
| `taskCommentService.ts` | Comments | Giữ riêng |
| `taskAttachmentService.ts` | Attachments | Giữ riêng |
| `taskNotificationService.ts` | Notifications | Giữ riêng |
| `taskTemplateService.ts` | Templates + Recurring (merged M3) | ✅ Đã gộp taskRecurringService |
| `taskAuditService.ts` | Activities + History (merged M2) | ✅ Đã gộp taskActivityService + taskHistoryService |
| `taskAnalyticsService.ts` | Stats + Reports (merged M4) | ✅ Đã gộp taskStatsService + taskReportService |

## Xóa khỏi codebase (sau Sprint 4)

- ❌ `taskDetailService.ts` (merged → `taskService.ts`)
- ❌ `taskRecurringService.ts` (merged → `taskTemplateService.ts`)
- ❌ `taskActivityService.ts` (merged → `taskAuditService.ts`)
- ❌ `taskHistoryService.ts` (merged → `taskAuditService.ts`)
- ❌ `taskStatsService.ts` (merged → `taskAnalyticsService.ts`)
- ❌ `taskReportService.ts` (merged → `taskAnalyticsService.ts`)

## Backward compat

Các named exports cũ (taskRecurringService, taskActivityService, taskHistoryService,
taskStatsService, taskReportService) vẫn được export từ file mới — code legacy
import qua named exports vẫn chạy được. Chỉ đường dẫn file thay đổi.

```typescript
// Trước:
import { taskRecurringService } from '../services/taskRecurringService'

// Sau:
import { taskRecurringService } from '../services/taskTemplateService'
```

## Defer Sprint 5

### `taskStatusService.ts` (558 dòng)
**Lý do defer**: Logic transition tại đây có overlap phức tạp với DB trigger
`fn_normalize_task_state` (Sprint 1.3) đã handle status↔progress consistency.
Merge cần audit kỹ để không break behavior cron + UI flow.

### `taskAssignmentService.ts` (310 dòng)
**Lý do defer**: Có business rules đặc thù cho việc assign (chuyển NV, validate
permissions). Merge vào taskService cần regression test toàn bộ luồng task
assignment + email notification.

## Hướng dẫn cho dev mới

Khi cần thêm feature task:
- CRUD core → `taskService.ts`
- Detail/budget/milestones → `taskService.ts` (TaskDetail interface, taskDetailService object)
- Checklist → `taskChecklistService.ts`
- Participants → `taskParticipantService.ts`
- Comments → `taskCommentService.ts`
- Files → `taskAttachmentService.ts`
- Notifications → `taskNotificationService.ts`
- Template + Recurring → `taskTemplateService.ts`
- Activity log + History → `taskAuditService.ts`
- Stats + Reports → `taskAnalyticsService.ts`
- Assign → `taskAssignmentService.ts` (sẽ merge vào taskService Sprint 5)
- Status transitions → `taskStatusService.ts` (sẽ merge Sprint 5)

**Không** tạo file service mới. Đặt vào file phù hợp scope.
