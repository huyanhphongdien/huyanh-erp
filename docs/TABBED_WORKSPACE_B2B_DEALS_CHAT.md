# Tabbed Workspace — Rollout B2B (Deals + Chat)

**Status:** Draft — chờ review trước khi implement
**Phase:** 2 (sau pilot WMS — đã live 2026-04-15)
**Scope:** Deals + Chat (không đụng Auctions, Demands, Partners, Settlements, Ledger, Disputes, Reports — sẽ phase 3)
**Estimated effort:** ~3-4h
**Risk:** Thấp — pattern đã proven ở WMS, chỉ cần áp dụng lại

---

## Tại sao Deals + Chat trước?

| Lý do | Chi tiết |
|---|---|
| **Pain point lớn nhất** | Nhân viên B2B mở Deal A để đối chiếu giá, cần mở Deal B so sánh → hiện tại mất form state + scroll position |
| **Chat cần multi-room** | Phải trả lời nhiều đại lý cùng lúc. Hiện chuyển phòng chat = unmount → mất lịch sử realtime subscription, phải reconnect |
| **Tần suất cao nhất** | Deals = core B2B workflow. Chat = daily communication. Cả 2 đều high-frequency |
| **Isolated scope** | Không đụng WMS/Sales/Production → rollback an toàn nếu có vấn đề |

---

## Scope — Pages sẽ convert

### Group A: Deals (3 detail pages)

| Page | Route hiện tại | Tab key convention | Tab title |
|---|---|---|---|
| `DealDetailPage` | `/b2b/deals/:id` | `deal-${id}` | `Deal ${deal_code}` |
| `DealCreatePage` | `/b2b/deals/create` | `deal-create` (single-use) | `Tạo Deal mới` |
| `DealPrintPage` | `/b2b/deals/:id/print` | `deal-print-${id}` | `In Deal ${deal_code}` |

**Ghi chú:**
- `DealListPage` KHÔNG convert (giữ navigate thường — pattern Approach B)
- Khi click row list → `openTab('deal-${id}')` thay vì `navigate('/b2b/deals/${id}')`
- Nút "Tạo Deal mới" → `openTab('deal-create')` — dùng key cố định để trùng key = focus tab cũ (tránh mở nhiều tab create)
- Nút "In" trong DealDetailPage → `openTab('deal-print-${id}')` — mở tab mới song song để user có thể xem detail + print cùng lúc

### Group B: Chat (1 detail page)

| Page | Route hiện tại | Tab key convention | Tab title |
|---|---|---|---|
| `B2BChatRoomPage` | `/b2b/chat/:id` | `chat-${roomId}` | `Chat: ${partner_name}` |

**Ghi chú:**
- `B2BChatListPage` KHÔNG convert
- `B2BChatPage` (legacy portal view) KHÔNG convert — sẽ deprecated sau
- Mở nhiều phòng chat song song → mỗi phòng = 1 tab, realtime subscription giữ nguyên vì component không unmount
- Key = `chat-${roomId}` để tránh mở trùng cùng 1 phòng

### Tổng: **4 detail pages** được convert

---

## Files cần sửa

### Phase 2.1 — Tab registry (5 phút)

**File:** [src/lib/tabRegistry.ts](src/lib/tabRegistry.ts)

Thêm:
```ts
const DealDetailPage = lazy(() => import('../pages/b2b/deals/DealDetailPage'))
const DealCreatePage = lazy(() => import('../pages/b2b/deals/DealCreatePage'))
const DealPrintPage = lazy(() => import('../pages/b2b/deals/DealPrintPage'))
const B2BChatRoomPage = lazy(() => import('../pages/b2b/B2BChatRoomPage'))

registerTabComponent('b2b-deal-detail', DealDetailPage)
registerTabComponent('b2b-deal-create', DealCreatePage)
registerTabComponent('b2b-deal-print', DealPrintPage)
registerTabComponent('b2b-chat-room', B2BChatRoomPage)
```

### Phase 2.2 — Detail pages accept optional props (15 phút × 4 = 1h)

Pattern (đã chuẩn hoá ở WMS):

```ts
interface DealDetailPageProps { id?: string }
export default function DealDetailPage({ id: propId }: DealDetailPageProps = {}) {
  const { id: paramId } = useParams<{ id: string }>()
  const id = propId || paramId
  // ...rest giữ nguyên
}
```

Áp dụng cho:
- [src/pages/b2b/deals/DealDetailPage.tsx](src/pages/b2b/deals/DealDetailPage.tsx)
- [src/pages/b2b/deals/DealCreatePage.tsx](src/pages/b2b/deals/DealCreatePage.tsx) — không có id, chỉ cần export default function không đổi
- [src/pages/b2b/deals/DealPrintPage.tsx](src/pages/b2b/deals/DealPrintPage.tsx)
- [src/pages/b2b/B2BChatRoomPage.tsx](src/pages/b2b/B2BChatRoomPage.tsx) — dùng `roomId` hoặc `dealId` tuỳ logic hiện tại

### Phase 2.3 — List pages dùng `useOpenTab` (30 phút × 2 = 1h)

#### [src/pages/b2b/deals/DealListPage.tsx](src/pages/b2b/deals/DealListPage.tsx)

**Thay:**
```ts
const navigate = useNavigate()
// ...
onClick={() => navigate(`/b2b/deals/${record.id}`)}
```

**Bằng:**
```ts
import { useOpenTab } from '../../../hooks/useOpenTab'
const openTab = useOpenTab()
// ...
onClick={() => openTab({
  key: `deal-${record.id}`,
  title: `Deal ${record.deal_code}`,
  componentId: 'b2b-deal-detail',
  props: { id: record.id },
  path: `/b2b/deals/${record.id}`,
})}
```

**Nút "Tạo Deal mới":**
```ts
onClick={() => openTab({
  key: 'deal-create',
  title: 'Tạo Deal mới',
  componentId: 'b2b-deal-create',
  props: {},
  path: '/b2b/deals/create',
})}
```

#### [src/pages/b2b/B2BChatListPage.tsx](src/pages/b2b/B2BChatListPage.tsx)

**Thay:**
```ts
navigate(`/b2b/chat/${room.id}`)
```

**Bằng:**
```ts
openTab({
  key: `chat-${room.id}`,
  title: `Chat: ${room.partner_name}`,
  componentId: 'b2b-chat-room',
  props: { roomId: room.id },
  path: `/b2b/chat/${room.id}`,
})
```

### Phase 2.4 — Internal navigate trong detail pages (30 phút)

**DealDetailPage.tsx:** nút "In" → `openTab('deal-print-${id}')` thay vì `window.open()` hoặc `navigate()`

**DealPrintPage.tsx:** nút "Quay lại" → `useCloseCurrentTab()` thay `navigate(-1)` để đóng tab thay vì back browser.

**B2BChatRoomPage.tsx:** nút "Back to list" → `useCloseCurrentTab()`

---

## Key convention summary

| Prefix | Dùng cho | Ví dụ |
|---|---|---|
| `deal-${id}` | Deal detail | `deal-a1b2c3` |
| `deal-create` | Create form | `deal-create` (single-use) |
| `deal-print-${id}` | Print view | `deal-print-a1b2c3` |
| `chat-${roomId}` | Chat room | `chat-xyz789` |

**Rule:** trùng key = focus tab đã mở. Max 15 tabs, LRU eviction (oldest bị close).

---

## Testing checklist

### Deals
- [ ] Click row trong DealListPage → mở tab `deal-${id}`, title đúng mã deal
- [ ] Click cùng row lần 2 → focus tab cũ, không tạo tab mới
- [ ] Click row deal khác → tab mới, tab cũ giữ nguyên state (filter, scroll, form dirty)
- [ ] Nút "Tạo Deal mới" → mở tab `deal-create`. Click lần 2 → focus tab cũ (giữ form state)
- [ ] Nút "In" trong DealDetailPage → mở tab `deal-print-${id}` song song detail
- [ ] F5 refresh → tabs giữ nguyên (localStorage persist)
- [ ] Deep link `/b2b/deals/${id}` → route cũ vẫn work, render MyDetailPage qua useParams

### Chat
- [ ] Click phòng chat A → mở tab `chat-A`, realtime subscription start
- [ ] Mở thêm phòng chat B → tab mới, subscription phòng A VẪN CHẠY (không unmount)
- [ ] Switch về tab A → realtime messages nhận được từ lúc switch sang B vẫn hiển thị
- [ ] Close tab A → subscription A cleanup
- [ ] F5 → cả 2 phòng chat giữ nguyên tab

### Regression
- [ ] WMS tabs vẫn hoạt động (stock-in, stock-out, inventory, etc.)
- [ ] Mobile (< 768px) → fallback navigate, không hiển thị tab bar
- [ ] Max 15 tabs → LRU eviction, oldest bị close khi mở thêm

---

## Không làm (out of scope phase 2)

- ❌ B2B Auctions — phase 3
- ❌ B2B Demands — phase 3
- ❌ B2B Partners — phase 3
- ❌ B2B Settlements — phase 3
- ❌ B2B Ledger (PartnerLedger) — phase 3
- ❌ B2B Disputes — phase 3
- ❌ B2B Reports — list only, không detail
- ❌ B2BDashboardPage — là dashboard, không phải detail
- ❌ NotificationPage — giữ navigate

---

## Rollout plan

1. **Commit riêng** cho Phase 2 — không bundle với WMS hoặc module khác
2. **Deploy** lên Vercel + Cloudflare sau khi test local pass checklist
3. **User test 2-3 ngày** với Deals + Chat thực tế
4. **Nếu OK** → mở Phase 3 (các sub-module B2B còn lại)
5. **Nếu có issue** → hotfix hoặc revert chỉ 1 commit, không đụng WMS

---

## Ghi chú kỹ thuật

- Chat realtime subscription (Supabase channel) KHÔNG tự cleanup khi tab `display:none` → subscription vẫn active = đúng ý muốn (nhận message khi tab background)
- `B2BChatRoomPage` đã có auto-reconnect (commit `51411397`) → an toàn khi localStorage restore sau F5
- `DealDetailPage` có thể có nested tabs bên trong (Tổng quan / Giao hàng / Lịch sử / QC...) — Ant Design `<Tabs>` nested trong tabbed workspace OK, không conflict
- Form state trong `DealCreatePage` giữ nguyên khi switch tab (vì không unmount) → user có thể mở Deal detail khác để tham khảo giá rồi quay lại form tạo
