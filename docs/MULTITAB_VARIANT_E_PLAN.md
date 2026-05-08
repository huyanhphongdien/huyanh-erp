# Multi-Tab Variant E — Implementation Plan

**Date:** 2026-05-06
**Owner:** huyanhphongdien
**Scope:** Rollout multi-tab UX (Variant E từ [MULTITAB_DESIGN_MOCKUPS.html](MULTITAB_DESIGN_MOCKUPS.html)) sang module **Bán hàng** trước, sau đó các module khác.
**Reference:** [docs/MULTITAB_DESIGN_MOCKUPS.html](MULTITAB_DESIGN_MOCKUPS.html)

---

## 1. Tình trạng hiện tại

Đã có (không cần build lại):
- [src/components/common/TabbedWorkspace.tsx](../src/components/common/TabbedWorkspace.tsx) — shell với top-tab + sub-tab + keep-alive
- [src/components/common/TabContent.tsx](../src/components/common/TabContent.tsx) — keep-alive wrapper
- [src/stores/tabStore.ts](../src/stores/tabStore.ts) — Zustand store + registry + LRU + persist
- [src/lib/tabRegistry.ts](../src/lib/tabRegistry.ts) — 18 tab components đã đăng ký (WMS + B2B)
- [src/hooks/useOpenTab.ts](../src/hooks/useOpenTab.ts) — hook gọi `openTab(...)`
- [src/components/common/MainLayout.tsx](../src/components/common/MainLayout.tsx) đã wrap `<TabbedWorkspace>`

Chưa có (cần build):
- `ModuleRail` — icon rail 56px bên ngoài
- `CommandPalette` — Ctrl+K palette tìm/mở entity
- `StatHeader` — 4 KPI card cream trên đầu list page
- Đăng ký Sales detail pages vào registry
- Replace `navigate(...)` sang `openTab(...)` ở các Sales list pages

---

## 2. Sprint 1 — Sales rollout (ưu tiên) · 3 ngày

> **Mục tiêu:** User mở SO-2026-0050 thành tab, click sang đơn khác mở thành tab thứ 2, switch qua lại không mất state, F5 vẫn còn tab.

### Bước 1.1 — Đăng ký Sales detail pages vào registry · 30 phút

**File:** [src/lib/tabRegistry.ts](../src/lib/tabRegistry.ts) (line 126-128, đã có comment template)

Thêm:
```ts
// ===== SALES — Order detail flow =====
const SalesOrderDetailPage = lazy(() => import('../pages/sales/SalesOrderDetailPage'))
registerTabComponent('sales-order-detail', SalesOrderDetailPage)

const SalesOrderCreatePage = lazy(() => import('../pages/sales/SalesOrderCreatePage'))
registerTabComponent('sales-order-create', SalesOrderCreatePage)

const ContainerPackingPage = lazy(() => import('../pages/sales/ContainerPackingPage'))
registerTabComponent('sales-container-packing', ContainerPackingPage)

const ExportDocumentsPage = lazy(() => import('../pages/sales/ExportDocumentsPage'))
registerTabComponent('sales-export-documents', ExportDocumentsPage)

// ===== SALES — Customer detail =====
const CustomerDetailPage = lazy(() => import('../pages/sales/CustomerDetailPage'))
registerTabComponent('sales-customer-detail', CustomerDetailPage)
```

### Bước 1.2 — Replace navigate → openTab ở SalesOrderListPage · 1h

**File:** [src/pages/sales/SalesOrderListPage.tsx](../src/pages/sales/SalesOrderListPage.tsx)

Pattern reference: [src/pages/wms/stock-in/StockInListPage.tsx](../src/pages/wms/stock-in/StockInListPage.tsx) line 14, 48-62

Thay:
```tsx
const navigate = useNavigate()
// ...
onClick={() => navigate(`/sales/orders/${order.id}`)}
```

Bằng:
```tsx
import { useOpenTab } from '../../hooks/useOpenTab'
const openTab = useOpenTab()
// ...
onClick={() => openTab({
  key: `sales-order-${order.id}`,
  title: `Đơn ${order.code || order.contract_no}`,
  componentId: 'sales-order-detail',
  props: { orderId: order.id },
  path: `/sales/orders/${order.id}`,
})}
```

**Lưu ý:** `SalesOrderDetailPage` hiện đọc `useParams<{orderId}>` — cần đổi sang đọc `props.orderId` (fallback `useParams` để giữ tương thích link trực tiếp).

### Bước 1.3 — Sub-tab trong SalesOrderDetailPage · 2h

`SalesOrderDetailPage` đã có nội dung tab nội bộ (ContractTab, ProductionTab, ShippingTab, FinanceTabV4...). Quyết định:

- **Phương án A** (đơn giản, recommended): Giữ tab Ant Design nội bộ trong DetailPage. Chỉ TabbedWorkspace top-level quản đơn hàng nào đang mở.
- **Phương án B**: Mỗi sub-tab (Contract / Production / Shipping / Finance) thành 1 sub-tab riêng trong TabbedWorkspace với `parentKey: sales-order-${id}`. Phức tạp hơn, dùng URL `?stage=production`.

→ **Chọn A** cho sprint này. B để dành nếu user muốn sau.

### Bước 1.4 — Replace navigate → openTab ở CustomerListPage · 30 phút

**File:** [src/pages/sales/CustomerListPage.tsx](../src/pages/sales/CustomerListPage.tsx)

Tương tự bước 1.2:
```tsx
openTab({
  key: `sales-customer-${customer.id}`,
  title: customer.name,
  componentId: 'sales-customer-detail',
  props: { customerId: customer.id },
  path: `/sales/customers/${customer.id}`,
})
```

### Bước 1.5 — Action button "Tạo đơn" mở thành tab · 15 phút

Replace `navigate('/sales/orders/new')` bằng `openTab({key: 'sales-order-new', title: 'Đơn mới', componentId: 'sales-order-create', ...})`. Khi save xong → close tab này + open tab detail của đơn vừa tạo.

### Bước 1.6 — Test thủ công · 30 phút

Checklist:
- [ ] Click 1 đơn từ list → mở thành tab, list vẫn đứng nguyên
- [ ] Click đơn thứ 2 → có 2 tab, switch qua lại không mất scroll/state
- [ ] Đóng tab giữa → URL đổi sang tab kế bên
- [ ] F5 → tabs restore từ localStorage
- [ ] Ctrl+W đóng tab active
- [ ] Right-click tab → "Đóng các tab khác" / "Đóng tất cả"
- [ ] Click sidebar "Khách hàng" trong khi đang mở 3 tab đơn → tab bar vẫn còn, list khách hiện ra
- [ ] Mở 1 customer → có thêm tab thứ 4

**Deliverable Sprint 1:** Sales orders + customers chạy multi-tab. User có thể mở 5-6 đơn cùng lúc, so sánh, edit từng đơn.

---

## 3. Sprint 2 — Shared components mới · 4 ngày

### Bước 2.1 — `StatHeader` · 0.5 ngày

**File mới:** `src/components/common/StatHeader.tsx`

Props:
```ts
interface StatHeaderProps {
  stats: Array<{
    label: string
    value: string | number
    delta?: string
    deltaTone?: 'positive' | 'negative' | 'neutral'
  }>
}
```

Style: 4-column grid, card cream `#fafaf5` border `#e6dfd8`, value 22px bold green `#1B4D3E`, delta 11px.

Reference markup: section `.v-e-stats` trong [MULTITAB_DESIGN_MOCKUPS.html](MULTITAB_DESIGN_MOCKUPS.html).

Áp dụng cho:
- SalesOrderListPage (Doanh thu tháng / Đang xử lý / Phải thu / Đơn TB)
- CustomerListPage (Tổng KH / KH active / Phải thu / KH mới)

### Bước 2.2 — `CommandPalette` (Ctrl+K) · 1.5 ngày

**File mới:** `src/components/common/CommandPalette.tsx`

Mở bằng `Ctrl/Cmd+K` global shortcut. Chứa:
1. **Recent tabs** — list 5 tab gần nhất từ tabStore
2. **Open module** — list các module (Sales / WMS / Production…) → click → navigate
3. **Search entity** — gõ text → query Supabase 3 bảng đồng thời:
   - `sales_orders` (where code ILIKE %q% OR contract_no ILIKE %q%) → mở tab `sales-order-detail`
   - `customers` (where name ILIKE %q%) → mở tab `sales-customer-detail`
   - `b2b_partners` (where name ILIKE %q%) → mở tab `b2b-partner-detail`
4. **Quick actions** — "Tạo đơn mới", "Tạo phiếu nhập"…

Tech:
- Ant Design `<Modal>` + `<Input>` + custom list, hoặc `cmdk` package
- TanStack Query với `enabled: !!query` + `debounce 200ms`
- Trigger: `useEffect` listen `keydown` `(e.ctrlKey || e.metaKey) && e.key === 'k'`
- Mount trong MainLayout 1 lần

### Bước 2.3 — `ModuleRail` · 1 ngày

**File mới:** `src/components/layout/ModuleRail.tsx`

Vertical bar 56px bên trái, đứng ngoài Sidebar hiện có. Mỗi icon = 1 module:
- 📊 Dashboard (`/`)
- 💰 Bán hàng (`/sales/orders`)
- 🛒 Mua hàng (`/purchasing`)
- 📦 Kho (`/wms`)
- 🏭 Sản xuất (`/wms/production`)
- 👥 Nhân sự (`/hr`)
- 🤝 B2B (`/b2b`)
- 📈 Báo cáo (`/reports`)
- ⚙ Cài đặt (`/settings`)

Click icon → navigate + Sidebar update context theo module. Active state = green `#2D8B6E` bg.

Badge đỏ trên icon nếu module có alert (vd. Sales 3 đơn quá hạn, B2B 5 dispute).

**Decision needed:** ModuleRail có thay thế Sidebar hiện tại không, hay đứng cạnh? Đề xuất: ModuleRail = level-1 nav, Sidebar = level-2 (sub-menu trong module được chọn). Đây là pattern Linear/Slack/Notion dùng.

### Bước 2.4 — Refactor MainLayout · 1 ngày

**File:** [src/components/common/MainLayout.tsx](../src/components/common/MainLayout.tsx)

Layout mới:
```tsx
<div className="flex min-h-screen">
  <ModuleRail />              {/* 56px */}
  <Sidebar />                  {/* 200px, contextual */}
  <main className="flex-1">
    <TopBar />                 {/* 44px — search Ctrl+K + avatar */}
    <TabbedWorkspace>
      <Outlet />
    </TabbedWorkspace>
  </main>
  <CommandPalette />           {/* portal modal */}
</div>
```

Cần:
- Tạo `TopBar` component nhỏ (1 file ~40 dòng)
- Update Sidebar để filter menu theo module hiện tại (đọc URL prefix)

**Deliverable Sprint 2:** ModuleRail + CommandPalette + StatHeader live. Sales list page có header KPI. Ctrl+K mở từ bất kỳ đâu, search được đơn/khách.

---

## 4. Sprint 3 — Rollout module khác · 5 ngày

Mỗi module ~0.5-1 ngày. Pattern giống Sprint 1: register vào tabRegistry + replace navigate→openTab + StatHeader.

| Module | Pages cần thêm tab | Ưu tiên | Effort |
|---|---|---|---|
| HR — Attendance | `AttendanceDetailPage`, `EmployeeDetailPage` | High | 0.5 ngày |
| HR — Payroll | `PayrollDetailPage`, `OvertimeRequestDetailPage` | High | 0.5 ngày |
| Production | `ProductionOrderDetailPage` (đã trong WMS) | Medium | 0.5 ngày |
| Accounting | `ARAgingReportPage`, `CashFlowPage`, settlements | Medium | 1 ngày |
| Tasks (CV) | `TaskDetailPage`, `ProjectDetailPage` | Medium | 1 ngày |
| Evaluations | `EvaluationDetailPage` | Low | 0.5 ngày |
| B2B Portal | đã 90% xong | Low | 0.5 ngày |
| Settings | `SettingsTabbedPage` | Low | 0.5 ngày |

---

## 5. Quyết định cần BGĐ duyệt trước khi code

1. **ModuleRail vs Sidebar hiện tại** — thay thế hay cùng tồn tại? (đề xuất: cùng tồn tại, ModuleRail = level 1, Sidebar = level 2)
2. **Icon set** — emoji (như mockup) hay Lucide icons (đẹp hơn, đồng bộ)? (đề xuất: Lucide)
3. **CommandPalette search scope** — chỉ entity (đơn/khách) hay cả menu/action/setting? (đề xuất: gồm tất cả, có header phân nhóm)
4. **Mobile fallback** — ModuleRail ẩn trên mobile, Sidebar thành drawer? (đề xuất: yes — < 768px ẩn rail, sidebar drawer như hiện tại)
5. **Tên menu module mới** — Bán hàng / Mua hàng / Kho / Sản xuất / Nhân sự / B2B / Báo cáo / Cài đặt — có thiếu module nào không?

---

## 6. Risk & rollback

| Risk | Mitigation |
|---|---|
| Sales detail có tab Ant Design nội bộ → conflict với TabbedWorkspace top-level | Phương án A (giữ Ant tabs nội bộ) trong Sprint 1, đánh giá lại Sprint 3 |
| User F5 mất tab vì localStorage clear | persist đã có, test scenario này trước rollout |
| ModuleRail làm chật màn hình &lt; 1280px | Hide ModuleRail trên Tailwind `lg:` breakpoint, fallback sang Sidebar đầy đủ menu |
| CommandPalette query nặng làm chậm | Debounce 200ms + `staleTime 30s` + limit 10 results/table |
| Tab quá nhiều (&gt; 15) | LRU eviction đã có, MAX_TABS=15 trong tabStore |

Rollback: Mỗi sprint là 1 PR riêng. Nếu Sprint 1 gãy → revert PR là quay về trạng thái cũ (sales navigate bình thường). Sprint 2/3 không phụ thuộc Sprint 1 đã commit.

---

## 7. Timeline tổng

| Tuần | Sprint | Deliverable |
|---|---|---|
| 1 | Sprint 1 — Sales rollout | Đơn hàng bán + khách hàng chạy multi-tab |
| 2 | Sprint 2 — Shared components | ModuleRail + CommandPalette + StatHeader |
| 3 | Sprint 3 (phần 1) | HR + Production rollout |
| 4 | Sprint 3 (phần 2) | Accounting + Tasks + B2B + Settings |

Tổng: **~3-4 tuần** đến khi toàn ERP đa-tab. Sprint 1 chạy được sau **3 ngày** — user thử ngay được trên đơn hàng.

---

## 8. Bắt đầu từ đâu

Khi user OK plan này, sẽ làm theo thứ tự:

1. ✏️ Edit [tabRegistry.ts](../src/lib/tabRegistry.ts) — thêm 5 entry sales
2. ✏️ Edit [SalesOrderListPage.tsx](../src/pages/sales/SalesOrderListPage.tsx) — replace navigate → openTab
3. ✏️ Edit [SalesOrderDetailPage.tsx](../src/pages/sales/SalesOrderDetailPage.tsx) — đọc props.orderId fallback useParams
4. ✏️ Edit [CustomerListPage.tsx](../src/pages/sales/CustomerListPage.tsx) — same pattern
5. 🧪 Test localhost
6. 📝 Commit `feat(sales): rollout multi-tab workspace cho đơn hàng + khách hàng`
7. ⏸ Đợi user duyệt local trước khi push

Sau Sprint 1 OK → sang Sprint 2 (build ModuleRail + CommandPalette + StatHeader).
