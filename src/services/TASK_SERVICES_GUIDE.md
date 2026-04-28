# Task Services Guide — Sprint 3.1

15 file `task*Service.ts` hiện tồn tại với scope chồng chéo. Sprint 3.1 (full merge) **bị defer**
vì refactor lớn touch nhiều UI component → rủi ro cao stack trên Sprint 1+2 vừa deploy.

Document này mô tả **scope hiện tại** + **kế hoạch merge tương lai** để dev mới hiểu nhanh.

## Hiện trạng — 15 files

| File | Scope chính | Trùng với | Note |
|---|---|---|---|
| `taskService.ts` | CRUD core: getAll, getById, create, update, delete, updateStatus, updateProgress, getSubtasks | — | **Service chính**, giữ lại |
| `taskDetailService.ts` | getTaskDetail (1 task + relations) | taskService.getById | Có thể merge vào taskService |
| `taskStatusService.ts` | updateStatus + transitions | taskService.updateStatus | Logic transition phức tạp — review trước khi merge |
| `taskAssignmentService.ts` | Assign/reassign | taskService.assignTask | Có thể merge |
| `taskParticipantService.ts` | Participants (add/remove, available employees) | task_assignments queries | **Giữ riêng** — logic phức tạp về quyền |
| `taskChecklistService.ts` | Checklist items CRUD + getProgress | — | **Giữ riêng** |
| `taskCommentService.ts` | Comments | — | **Giữ riêng** |
| `taskAttachmentService.ts` | Attachments (file uploads) | — | **Giữ riêng** |
| `taskActivityService.ts` | task_activities log | task_status_history? | Audit log — có thể merge với history |
| `taskHistoryService.ts` | task_status_history queries | taskActivityService | Có thể merge |
| `taskNotificationService.ts` | Notifications cho task events | notificationHelper | **Giữ riêng** |
| `taskTemplateService.ts` | Templates CRUD | — | **Giữ riêng** |
| `taskRecurringService.ts` | Recurring rules + generation | taskTemplateService | Có thể merge với template |
| `taskStatsService.ts` | Aggregate stats (count, charts) | performanceService | Có thể merge với performance |
| `taskReportService.ts` | Reports/exports | taskStatsService | Có thể merge với stats |

## Kế hoạch merge — Sprint 4 (defer)

Đề xuất gộp về **6 file core**:

1. **`taskService.ts`** — CRUD core (giữ + thêm logic từ taskDetail, taskStatus, taskAssignment)
2. **`taskParticipantService.ts`** — Participants (logic permissions phức tạp, giữ riêng)
3. **`taskChecklistService.ts`** — Checklist (giữ)
4. **`taskCommentService.ts`** — Comments (giữ)
5. **`taskAttachmentService.ts`** — Attachments (giữ)
6. **`taskNotificationService.ts`** — Notifications (giữ)
7. **`taskTemplateService.ts`** — Templates + recurring (merge)
8. **`taskAuditService.ts`** — Activities + history (merge từ activity + history)
9. **`taskAnalyticsService.ts`** — Stats + reports (merge từ stats + report)

→ Giảm từ 15 → 9 files. Functionality giữ nguyên, code dễ maintain hơn.

## Tại sao defer Sprint 3.1?

1. **Risk cao**: 15 file đang được import từ 50+ component. Merge sai → break UI nhiều chỗ.
2. **ROI thấp ngắn hạn**: Code vẫn chạy tốt. Refactor chỉ giúp dev mới đọc dễ hơn.
3. **Sprint 1+2 vừa deploy**: stack thêm refactor lớn → gấp đôi risk regression.

## Hướng dẫn cho dev mới

Khi cần thêm feature task:
- Thêm CRUD method → `taskService.ts`
- Thêm liên quan tới checklist → `taskChecklistService.ts`
- Thêm liên quan participants → `taskParticipantService.ts`
- Cần aggregate/report → `taskStatsService.ts`
- Liên quan template/recurring → `taskTemplateService.ts` hoặc `taskRecurringService.ts`

**Không** tạo file service mới. Đặt vào file phù hợp scope.
