# Phase E1: B2B Chat - ERP Side

## 📦 Files

```
phase-e1/
├── README.md
├── index.ts                           # Barrel exports
├── services/
│   ├── chatRoomService.ts            # Chat rooms & messages service
│   └── chatAttachmentService.ts      # Upload files/images/voice
├── pages/
│   ├── B2BChatListPage.tsx           # Danh sách phòng chat
│   └── B2BChatRoomPage.tsx           # Phòng chat chi tiết
└── components/
    └── chat/
        ├── BookingCard.tsx            # Phiếu chốt mủ
        └── VoiceRecorder.tsx          # Ghi âm tin nhắn thoại
```

---

## 🔧 Setup

### 1. Copy files vào project

```bash
# Copy services
cp -r phase-e1/services/* src/services/b2b/

# Copy pages
cp -r phase-e1/pages/* src/pages/b2b/

# Copy components
cp -r phase-e1/components/chat/* src/components/chat/
```

### 2. Update import paths

Các file sử dụng relative imports, cần điều chỉnh theo cấu trúc project:

```tsx
// Ví dụ trong B2BChatListPage.tsx
import { chatRoomService } from '../../services/b2b/chatRoomService';
import { TierBadge } from '../../components/ui/TierBadge';
import { colors } from '../../config/antdTheme';
```

### 3. Add routes

Trong `App.tsx` hoặc router config:

```tsx
import { B2BChatListPage, B2BChatRoomPage } from './pages/b2b';

// Trong B2BLayout routes
<Route path="/b2b" element={<B2BLayout />}>
  {/* ... other routes */}
  <Route path="chat" element={<B2BChatListPage />} />
  <Route path="chat/:roomId" element={<B2BChatRoomPage />} />
</Route>
```

### 4. Verify Supabase views

Đảm bảo các public views đã tồn tại:

```sql
-- Check views
SELECT table_name FROM information_schema.views 
WHERE table_schema = 'public' 
AND table_name LIKE 'b2b_%';

-- Expected:
-- b2b_chat_rooms
-- b2b_chat_messages
-- b2b_partners
```

---

## 🎯 Features

### B2BChatListPage
- [x] Danh sách phòng chat với partner info
- [x] Unread badge per room
- [x] Search theo tên/mã đại lý
- [x] Filter: Tất cả / Chưa đọc
- [x] Filter theo tier
- [x] Realtime update khi có tin mới
- [x] Skeleton loading
- [x] Empty state

### B2BChatRoomPage
- [x] Message list với bubble styling
- [x] Phân biệt factory/partner messages
- [x] Send text message
- [x] Upload ảnh (auto compress)
- [x] Upload file (PDF, Word, Excel)
- [x] Voice message (MediaRecorder)
- [x] Reply tin nhắn
- [x] Edit tin nhắn (own messages)
- [x] Recall tin nhắn
- [x] Pin/Unpin tin nhắn
- [x] Delete tin nhắn (soft delete)
- [x] Mark as read on open
- [x] Realtime messages

### BookingCard
- [x] Hiển thị thông tin phiếu chốt mủ
- [x] Status badge (pending/confirmed/negotiating/rejected)
- [x] Action buttons: Xác nhận, Thương lượng, Từ chối
- [x] Negotiation modal với counter price

### VoiceRecorder
- [x] Record audio với MediaRecorder
- [x] Waveform visualization
- [x] Duration timer
- [x] Playback before send
- [x] Cancel recording

---

## 📝 Service API

### chatRoomService

```typescript
// Lấy danh sách rooms
const rooms = await chatRoomService.getRooms({
  search: 'anh đạt',
  hasUnread: true,
  tier: 'diamond',
});

// Lấy chi tiết 1 room
const room = await chatRoomService.getRoomById(roomId);

// Tạo room mới
const newRoom = await chatRoomService.createRoom(partnerId, employeeId, {
  roomType: 'general',
});

// Tổng unread
const total = await chatRoomService.getTotalUnreadCount();

// Subscribe realtime
chatRoomService.subscribeToRooms((payload) => {
  console.log('Room changed:', payload);
});
```

### chatMessageService

```typescript
// Lấy messages
const messages = await chatMessageService.getMessages(roomId, { limit: 50 });

// Gửi message
await chatMessageService.sendMessage(roomId, employeeId, 'Hello!', {
  replyToId: '...',
});

// Mark as read
await chatMessageService.markAsRead(roomId);

// Edit message
await chatMessageService.editMessage(messageId, 'Updated content');

// Recall message
await chatMessageService.recallMessage(messageId);

// Update booking status
await chatMessageService.updateBookingStatus(messageId, 'confirmed');

// Subscribe realtime
chatMessageService.subscribeToMessages(roomId, (payload) => {
  console.log('Message:', payload);
});
```

### chatAttachmentService

```typescript
// Upload image (auto compress)
const result = await chatAttachmentService.uploadImage({
  roomId,
  file,
  onProgress: (p) => console.log(p + '%'),
});

// Upload file
const result = await chatAttachmentService.uploadFile({ roomId, file });

// Upload voice
const result = await chatAttachmentService.uploadVoice({ roomId, file: blob });

// Auto detect type
const result = await chatAttachmentService.upload({ roomId, file });
```

---

## ⚠️ Lưu ý quan trọng

### 1. sender_type & sender_id

```typescript
// ERP side LUÔN dùng:
sender_type: 'factory'
sender_id: employee_id  // từ useAuthStore()

// KHÔNG dùng auth.uid()!
```

### 2. Supabase Realtime

```typescript
// Realtime phải dùng schema: 'b2b' trực tiếp
.on('postgres_changes', {
  event: '*',
  schema: 'b2b',  // ← Quan trọng!
  table: 'chat_messages',
  filter: `room_id=eq.${roomId}`,
}, callback)
```

### 3. Query views

```typescript
// Query qua public views (không cần .schema('b2b'))
supabase.from('b2b_chat_rooms').select('*')  // ✓ OK

// KHÔNG dùng:
supabase.schema('b2b').from('chat_rooms')  // ✗ Không hoạt động với client
```

### 4. Mark as read

```typescript
// Chỉ mark messages từ partner
.eq('sender_type', 'partner')
.is('read_at', null)
```

---

## ✅ Checklist

| ID | Task | Status |
|----|------|:------:|
| E1.1.1 | B2BChatListPage layout | ✅ |
| E1.1.2 | Service getRooms() | ✅ |
| E1.1.3 | ChatRoomItem component | ✅ |
| E1.1.4 | Unread count per room | ✅ |
| E1.1.5 | Filter & Search | ✅ |
| E1.1.6 | Realtime subscription | ✅ |
| E1.1.7 | Empty/Loading state | ✅ |
| E1.2.1 | B2BChatRoomPage layout | ✅ |
| E1.2.2 | Message list | ✅ |
| E1.2.3 | Send message service | ✅ |
| E1.2.4 | Upload ảnh/file | ✅ |
| E1.2.5 | Voice message | ✅ |
| E1.2.6 | Realtime messages | ✅ |
| E1.2.7 | Scroll to bottom | ✅ |
| E1.2.8 | Context menu | ✅ |
| E1.3.1 | BookingCard component | ✅ |
| E1.3.2 | Action buttons | ✅ |
| E1.3.3 | Update booking status | ✅ |
| E1.3.4 | Negotiation modal | ✅ |
| E1.3.5 | Status badge | ✅ |
| E1.4.1 | Mark as read on open | ✅ |
| E1.4.2 | markAsRead service | ✅ |
| E1.4.3 | Unread Badge menu | ⏳ (trong B2BLayout) |
| E1.4.4 | getUnreadCount service | ✅ |
| E1.4.5 | Realtime unread update | ⏳ |

**23/25 tasks hoàn thành**

---

*Phase E1 hoàn thành: 25 tasks | ~26h*
