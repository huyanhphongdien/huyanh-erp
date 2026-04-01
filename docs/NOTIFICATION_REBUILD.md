# XÂY DỰNG LẠI HỆ THỐNG THÔNG BÁO

> **Ngày:** 01/04/2026
> **Trạng thái:** Hệ thống cũ không hoạt động — cần rebuild
> **Ước lượng:** 3-4 giờ

---

## VẤN ĐỀ HIỆN TẠI

1. **Chỉ 1 nơi tạo notification** (BusinessTripPage) — tất cả sự kiện khác không tạo thông báo
2. **2 bảng riêng** (`notifications` + `task_notifications`) gây nhầm lẫn
3. **RPC functions** có thể không tồn tại trên DB
4. **Field mismatch**: `employee_id` vs `recipient_id`
5. **Real-time subscription** có thể không hoạt động
6. **Notification bell** hiện 0 vì không có data

---

## QUYẾT ĐỊNH THIẾT KẾ

### Bảng dữ liệu
- **Giữ 1 bảng `notifications`** — bỏ `task_notifications`
- Field chính: `employee_id` (người nhận)

### Cơ chế
- **Polling 30s** (ổn định) + Supabase realtime (bonus)
- Không phụ thuộc RPC — dùng direct query

### Thông báo cho sự kiện nào?

| # | Sự kiện | Module | Ai nhận | Ưu tiên |
|---|---------|--------|---------|---------|
| 1 | Được giao công việc mới | task | NV được giao | high |
| 2 | Công việc quá hạn | task | NV + TP/PP | high |
| 3 | Công việc hoàn thành (cần duyệt) | task | TP/PP | normal |
| 4 | Công việc được duyệt/từ chối | task | NV | normal |
| 5 | Đơn nghỉ phép mới | leave | TP/PP | normal |
| 6 | Nghỉ phép được duyệt/từ chối | leave | NV | normal |
| 7 | Đơn tăng ca mới | overtime | TP/PP | normal |
| 8 | Tăng ca được duyệt/từ chối | overtime | NV | normal |
| 9 | Được gán đi công tác | attendance | NV | normal |
| 10 | NV đi trễ (báo TP) | attendance | TP/PP | low |
| 11 | Phân ca mới/đổi ca | shift | NV | normal |

---

## KẾ HOẠCH TRIỂN KHAI

### Phase 1: Chuẩn bị DB + Service (1h)

**1.1 Kiểm tra/tạo bảng `notifications`**

```sql
-- Verify bảng tồn tại
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'notifications' ORDER BY ordinal_position;

-- Tạo nếu chưa có
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id),
  sender_id UUID REFERENCES employees(id),
  module VARCHAR(20) NOT NULL, -- task, leave, overtime, attendance, shift, system
  notification_type VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  reference_id UUID,
  reference_type VARCHAR(50),
  reference_url TEXT,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  priority VARCHAR(10) DEFAULT 'normal', -- low, normal, high, urgent
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_employee ON notifications(employee_id, is_read, created_at DESC);

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "NV xem notification của mình" ON notifications
  FOR SELECT USING (employee_id = auth.uid() OR EXISTS (
    SELECT 1 FROM employees WHERE id = notifications.employee_id AND user_id = auth.uid()
  ));
CREATE POLICY "Hệ thống tạo notification" ON notifications
  FOR INSERT WITH CHECK (true);
```

**1.2 Viết lại `notificationService.ts` — đơn giản, không RPC**

```typescript
// Chỉ dùng direct query — không phụ thuộc RPC
const notificationService = {
  // Đếm chưa đọc
  countUnread(employeeId: string): Promise<number>
  
  // Lấy danh sách (limit 50, filter module)
  getList(employeeId: string, filter?: { module?: string; limit?: number }): Promise<Notification[]>
  
  // Tạo thông báo
  create(input: CreateNotificationInput): Promise<void>
  
  // Đánh dấu đã đọc
  markRead(id: string): Promise<void>
  markAllRead(employeeId: string): Promise<void>
  
  // Xóa
  delete(id: string): Promise<void>
  deleteAllRead(employeeId: string): Promise<void>
}
```

### Phase 2: Tích hợp vào các service (1.5h)

**2.1 Task — tạo notification khi:**

| File | Sự kiện | Code |
|------|---------|------|
| `TaskCreatePage.tsx` | Giao CV mới | Sau `handleSubmit` thành công |
| `TaskViewPage.tsx` | Hoàn thành (cần duyệt) | Trong `handleMarkComplete` khi assigned |
| `QuickEvalModal.tsx` | Gửi đánh giá cho QL | Trong `handleSubmit` khi source != self/recurring |
| `BatchApprovePage.tsx` | Duyệt/từ chối | Sau approve/reject |
| `taskChecklistService.ts` | Checklist 100% recurring | Sau auto-complete |

**2.2 Leave — tạo notification khi:**

| File | Sự kiện | Code |
|------|---------|------|
| `leaveRequestService.ts` → `create()` | NV tạo đơn | Thông báo TP/PP |
| `leaveRequestService.ts` → `approve()` | Duyệt | Thông báo NV |
| `leaveRequestService.ts` → `reject()` | Từ chối | Thông báo NV |

**2.3 Overtime — tạo notification khi:**

| File | Sự kiện | Code |
|------|---------|------|
| `overtimeService.ts` → `create()` | NV tạo đơn | Thông báo TP/PP |
| `overtimeService.ts` → `approve()` | Duyệt | Thông báo NV |
| `overtimeService.ts` → `reject()` | Từ chối | Thông báo NV |

**2.4 Attendance — đã có:**

| File | Sự kiện | Trạng thái |
|------|---------|-----------|
| `BusinessTripPage.tsx` | Gán công tác | ✅ Đã có |

### Phase 3: UI Components (1h)

**3.1 Sidebar badge** — hiện số chưa đọc cạnh "Thông báo"

```
Sidebar:
  🔔 Thông báo  (3)  ← badge đỏ
```

**3.2 NotificationPage** — giữ nguyên UI hiện tại, chỉ sửa service calls

**3.3 Hook `useUnreadCount`** — polling 30s

```typescript
export function useUnreadNotificationCount() {
  const { user } = useAuthStore()
  return useQuery({
    queryKey: ['unread-notifications', user?.employee_id],
    queryFn: () => notificationService.countUnread(user.employee_id),
    enabled: !!user?.employee_id,
    refetchInterval: 30000,
  })
}
```

### Phase 4: Test (30p)

- [ ] Giao CV → NV nhận thông báo
- [ ] Hoàn thành CV → TP nhận "cần duyệt"
- [ ] Duyệt CV → NV nhận "đã duyệt"
- [ ] Tạo đơn phép → TP nhận thông báo
- [ ] Duyệt phép → NV nhận thông báo
- [ ] Gán công tác → NV nhận thông báo (đã có)
- [ ] Badge sidebar hiện đúng số
- [ ] Click thông báo → đi đúng trang
- [ ] Đánh dấu đã đọc → badge giảm

---

## HELPER FUNCTION

Tạo 1 helper dùng chung cho tất cả:

```typescript
// src/services/notificationHelper.ts

import { supabase } from '../lib/supabase'

export async function notify(params: {
  recipientId: string       // employee_id người nhận
  senderId?: string         // employee_id người gửi
  module: 'task' | 'leave' | 'overtime' | 'attendance' | 'shift' | 'system'
  type: string              // task_assigned, leave_approved, etc.
  title: string             // "Bạn được giao công việc mới"
  message?: string          // Chi tiết
  referenceUrl?: string     // "/tasks/xxx"
  priority?: 'low' | 'normal' | 'high'
}) {
  try {
    await supabase.from('notifications').insert({
      employee_id: params.recipientId,
      sender_id: params.senderId || null,
      module: params.module,
      notification_type: params.type,
      title: params.title,
      message: params.message || null,
      reference_url: params.referenceUrl || null,
      priority: params.priority || 'normal',
    })
  } catch (e) {
    console.error('[notify] error:', e)
  }
}
```

### Cách dùng

```typescript
// Khi giao CV
await notify({
  recipientId: assigneeId,
  senderId: currentUserId,
  module: 'task',
  type: 'task_assigned',
  title: `Bạn được giao: ${taskName}`,
  message: `${assignerName} đã giao công việc cho bạn`,
  referenceUrl: `/tasks/${taskId}`,
})

// Khi duyệt phép
await notify({
  recipientId: employeeId,
  senderId: approverId,
  module: 'leave',
  type: 'leave_approved',
  title: 'Đơn nghỉ phép đã được duyệt',
  referenceUrl: '/leave-requests',
})
```

---

## THỨ TỰ THỰC HIỆN

```
1. Kiểm tra DB bảng notifications         [5 phút]
2. Viết notificationHelper.ts (notify)     [10 phút]
3. Viết useUnreadNotificationCount hook    [10 phút]
4. Sửa Sidebar — badge thông báo           [10 phút]
5. Tích hợp: TaskCreatePage (giao CV)      [10 phút]
6. Tích hợp: TaskViewPage (hoàn thành)     [10 phút]
7. Tích hợp: QuickEvalModal (đánh giá)     [10 phút]
8. Tích hợp: BatchApprovePage (duyệt)      [10 phút]
9. Tích hợp: leaveRequestService           [15 phút]
10. Tích hợp: overtimeService              [15 phút]
11. Sửa NotificationPage dùng service mới  [15 phút]
12. Test toàn bộ flow                      [20 phút]
```

**Tổng: ~2.5 giờ**

---

> Kế hoạch xây dựng lại hệ thống thông báo
> Huy Anh ERP v8 — 01/04/2026
