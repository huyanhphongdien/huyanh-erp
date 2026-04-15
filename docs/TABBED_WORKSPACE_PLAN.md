# Tabbed Workspace — Multi-tab UX Plan

**Status:** Draft, chưa implement
**Effort:** ~16h / 2 ngày
**Approach chọn:** B — Hybrid (list navigate, detail mở tab)

---

## Mục tiêu

Cho phép user mở nhiều chức năng/trang cùng lúc như trình duyệt Chrome hoặc phần mềm PC (SAP GUI, SSMS, Visual Studio). Giải quyết pain point lớn nhất: đang xem/sửa 1 đơn hàng → cần mở đơn khác để đối chiếu → hiện tại mất form state khi navigate.

## Decision matrix

| Approach | Scope | Effort | Risk | Chọn? |
|---|---|---|---|---|
| A — Multi-tab shell toàn app | Toàn bộ menu click = tab | 3-5 ngày | Cao (regression) | ❌ |
| **B — Hybrid (list navigate, detail tab)** | Chỉ detail view thành tab | **1.5-2 ngày** | **Thấp** | **✅** |
| C — Tab-per-module | Chỉ list chính là tab | 4-6h | Thấp | ❌ (không giải quyết pain point) |

**Lý do chọn B:**
- Giải quyết pain point thực tế: mất form state khi navigate giữa các detail
- List navigation giữ nguyên → back button + deep link vẫn work, không regression
- Mobile tự fallback về navigate thường (không làm gì thêm)
- Effort thấp, rủi ro thấp
- Extend lên A được sau nếu thấy cần

---

## Kiến trúc

```
┌──────────────────────────────────────────────────────────────────┐
│ Sidebar          │  Tab bar: [SO-0004 ✕][SO-0007 ✕][Lô B1-K2-A ✕] │
│                  ├───────────────────────────────────────────────┤
│ • Tổng quan      │                                                │
│ • Đơn hàng       │   ┌─ Tab container ───────────────────────┐   │
│ • Kho            │   │   [Keep-alive content]                │   │
│ • Sản xuất       │   │   Inactive tabs: display:none         │   │
│ • Chat B2B       │   │   Active tab: visible                 │   │
│                  │   └───────────────────────────────────────┘   │
└──────────────────┴───────────────────────────────────────────────┘
```

## Data flow

1. User ở list page (`/sales/orders`), click 1 row
2. Thay vì `navigate('/sales/orders/:id')` → gọi `openTab({ key, title, component, props })`
3. `TabbedWorkspace` store (Zustand) append tab mới, set active
4. Content area render tất cả tabs đã mở, dùng `display: none` ẩn các tab inactive
5. Click tab khác → chỉ đổi active key, component không unmount → state giữ nguyên
6. Close tab (✕) → remove khỏi store + unmount
7. Refresh F5 → đọc lại tabs từ localStorage (nếu bật persist)

## State shape

```ts
interface OpenTab {
  key: string              // unique: 'sales-order-123', 'batch-456'
  title: string            // hiển thị trên tab label
  icon?: ReactNode
  path: string             // URL tương ứng (cho address bar khi active)
  component: ComponentType // lazy-loaded
  props: Record<string, any>
  openedAt: number         // cho LRU eviction
}

interface TabStore {
  tabs: OpenTab[]
  activeKey: string | null
  openTab: (tab: Omit<OpenTab, 'openedAt'>) => void
  closeTab: (key: string) => void
  closeOthers: (key: string) => void
  closeAll: () => void
  setActive: (key: string) => void
}
```

---

## Files sẽ tạo

| File | Mục đích | LOC |
|---|---|---|
| `src/stores/tabStore.ts` | Zustand store quản lý tabs, persist localStorage | ~100 |
| `src/components/common/TabbedWorkspace.tsx` | Wrapper render tab bar + content area với keep-alive | ~150 |
| `src/components/common/TabContent.tsx` | Component con render 1 tab, dùng `display:none` khi inactive | ~40 |
| `src/hooks/useOpenTab.ts` | Hook tiện dụng: `openTab()`, `closeTab()`, `getCurrentTab()` | ~50 |
| `src/components/common/TabContextMenu.tsx` | Right-click menu: Close, Close Others, Close All | ~60 |

## Files sẽ sửa

| File | Thay đổi |
|---|---|
| `src/components/layout/MainLayout.tsx` | Wrap content area bằng `<TabbedWorkspace>` |
| `src/App.tsx` | Thêm route catchall cho detail pages (redirect sang tab) |
| `src/components/common/Sidebar.tsx` | Menu item click → nếu là list page thì navigate như cũ; detail shortcut → openTab |
| Detail page launchers (list pages mở detail) | Đổi `navigate()` → `openTab()` — liệt kê bên dưới |

## Detail pages sẽ convert sang tab

| List page | Khi click row → mở tab |
|---|---|
| `SalesOrderListPage` | `SalesOrderDetailPanel` |
| `StockInListPage` | `StockInDetailPage` |
| `StockOutListPage` | `StockOutDetailPage` |
| `ProductionListPage` | `ProductionDetailPage` |
| `BlendListPage` | `BlendDetailPage` |
| `CustomerListPage` | `CustomerDetailPage` |
| `B2BDealListPage` | `DealInlineDetail` |
| `B2BChatListPage` | `B2BChatRoomPage` |
| Inventory dashboard batch row | Batch detail inline |

~10 list pages, tất cả dùng cùng pattern → fix 1 chỗ, các nơi khác copy pattern.

---

## Phase implementation

### Phase 1.1 — Core infrastructure (5h)

| # | Task | Ước tính |
|---|---|---|
| 1 | Tạo `src/stores/tabStore.ts` — Zustand + persist | 1h |
| 2 | Tạo `src/components/common/TabbedWorkspace.tsx` — Ant Design Tabs `type="editable-card"` | 2h |
| 3 | Tạo `src/components/common/TabContent.tsx` — keep-alive via display:none + useMemo | 1h |
| 4 | Tạo `src/hooks/useOpenTab.ts` — API chính `openTab({ key, title, component, props })` | 1h |

**Deliverable:** Có thể gọi `openTab()` từ bất kỳ component nào, tabs xuất hiện đúng chỗ, switch tab không mất state. Test bằng 1 detail page duy nhất.

### Phase 1.2 — Wire vào MainLayout (2h)

| # | Task |
|---|---|
| 5 | Edit `MainLayout.tsx` — wrap content area bằng `<TabbedWorkspace>` |
| 6 | Edit `App.tsx` — thêm route wrapper để list pages route bình thường |
| 7 | Xử lý edge case: active tab URL sync với browser address bar |
| 8 | Handle refresh F5 → restore tabs từ localStorage |

**Deliverable:** App load lên có tab bar, close tab = unmount đúng, refresh giữ được tabs.

### Phase 1.3 — Convert detail pages (5h)

Mỗi list page → đổi `navigate(/detail/:id)` thành `openTab({ key: detail-${id}, component: DetailPage, props: { id } })`.

| # | Task | Thời gian |
|---|---|---|
| 9 | Sales orders (list + detail panel) | 1h |
| 10 | Stock-in (list + detail) | 30p |
| 11 | Stock-out (list + detail) | 30p |
| 12 | Production (list + detail) | 30p |
| 13 | Blending (list + detail) | 30p |
| 14 | Customers (list + detail) | 30p |
| 15 | B2B Deals + B2B Chat | 1h |
| 16 | Batch detail từ inventory dashboard | 30p |

**Deliverable:** 8 module detail hoạt động ở tab mode, user có thể mở 3-5 tabs song song.

### Phase 1.4 — UX polish + safety (2h)

| # | Task |
|---|---|
| 17 | Middle-click / Ctrl+click row trong list → force mở tab mới |
| 18 | Right-click tab → context menu: Đóng / Đóng tất cả khác / Đóng tất cả |
| 19 | LRU eviction: khi > 15 tabs, auto-close tab ít dùng nhất (có confirm) |
| 20 | Keyboard shortcut: Ctrl+W close tab, Ctrl+Tab next tab |
| 21 | Tab title hiển thị loading indicator khi component đang lazy-load |

### Phase 1.5 — Test + commit (2h)

| # | Task |
|---|---|
| 22 | Regression test: list navigation vẫn work, deep link `/sales/orders/:id` vẫn mở thành tab đúng |
| 23 | Realtime test: update ở tab A reflect sang tab B (TanStack Query + Supabase subscription) |
| 24 | Mobile check — fallback về navigate thường khi viewport nhỏ |
| 25 | Commit từng phase + push |

---

## Migration strategy

**Zero regression approach** — làm từng detail page một, không thay đổi list page nào trong Phase 1.1.

1. Deploy Phase 1.1 + 1.2 với TabbedWorkspace **rỗng** (không có tab nào, không ai gọi `openTab`)
2. App vẫn work như cũ 100%
3. Bắt đầu convert từng detail page một. Mỗi lần convert xong 1 page → commit riêng, deploy, test
4. Nếu page nào gây lỗi → revert chỉ 1 file (không ảnh hưởng page khác)

## Tab key convention

- `sales-order-${id}` — đơn hàng
- `stock-in-${id}` — phiếu nhập
- `stock-out-${id}` — phiếu xuất
- `production-${id}` — lệnh sản xuất
- `blend-${id}` — lệnh trộn
- `batch-${id}` — lô hàng
- `chat-room-${id}` — phòng chat

Key trùng = focus tab đã mở (không tạo mới).

---

## Testing checklist

- [ ] Click 3 đơn hàng khác nhau từ list → 3 tabs mở, switch giữa chúng form state giữ nguyên
- [ ] Sửa 1 đơn (nhập form chưa save) → switch tab → quay lại → data chưa save vẫn còn
- [ ] Close tab đơn đã sửa → có warning "chưa save"
- [ ] Middle-click 1 row → mở tab mới, không focus
- [ ] Deep link URL `https://huyanhrubber.vn/sales/orders/123` → auto mở tab
- [ ] F5 refresh → tabs được restore từ localStorage
- [ ] Realtime: tab A đang xem đơn X, tab B đang xem cùng đơn X → thay đổi sync (TanStack Query invalidate)
- [ ] Mobile viewport (< 768px) → không hiện tab bar, fallback navigate
- [ ] Ctrl+W close tab, Ctrl+Tab next
- [ ] Right-click tab → Close Others
- [ ] 16 tab mở → auto-close tab cũ nhất với confirm
- [ ] B2B chat tab vẫn nhận realtime messages khi không active

---

## Rollback plan

Nếu có vấn đề nghiêm trọng ở production:

1. **Kill switch trong env:** thêm `VITE_TABS_ENABLED=true` — nếu `false`, `useOpenTab` fallback về `navigate()` như cũ
2. **Git revert 1 commit:** vì mỗi phase là 1 commit riêng, revert được không ảnh hưởng phase khác
3. **Worst case:** revert toàn bộ 5 commits → về trạng thái trước Phase 1 → deploy

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Memory grow với nhiều tab | LRU eviction > 15 tabs + confirm trước khi close |
| Form state lost khi component lazy-load lần 2 | Store props + form values trong tabStore, rehydrate khi reopen |
| Deep link break khi refresh | Route `/sales/orders/:id` trong App.tsx tự `openTab()` on mount |
| Realtime collision: 2 tabs cùng đơn | TanStack Query cache share — cả 2 tab đọc cùng 1 cache entry, update đồng loạt |
| Mobile UX confusing | Detect viewport, < 768px không render tab bar, gọi `navigate` thay `openTab` |
| User quên close tab → memory leak | LRU + warning toast khi > 10 tabs |

---

## Thư viện sử dụng

| Yêu cầu | Giải pháp |
|---|---|
| Tab UI component | **Ant Design `<Tabs type="editable-card">`** — có sẵn, closable, có nút + |
| State management | **Zustand** (dùng sẵn trong project) |
| Keep-alive | Tự implement bằng `display: none` + `useMemo` (không cần lib ngoài) |
| URL sync | Active tab URL = window URL, inactive tabs lưu trong Zustand |
| Persist tab list qua refresh | localStorage via `zustand/middleware/persist` |
| Dynamic import per tab | Đã có sẵn (React.lazy trong App.tsx) |

---

## Tổng kết

- **5 phase, 25 sub-task, ~16h**
- **Mỗi phase deploy được độc lập**, rollback an toàn
- **Risk thấp:** list navigation không đổi, back button vẫn work, mobile fallback tự động
- **Impact cao:** giải quyết pain point lớn nhất của enterprise ERP — multi-task qua nhiều detail mà không mất state
- **Extend path:** sau này có thể nâng lên Approach A (toàn bộ menu click = tab) dễ dàng
