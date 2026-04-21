# B2B Partner Portal — Redesign Plan V2

**Target repo:** `D:\Projects\huyanh-b2b-portal` (Vercel → b2b.huyanhrubber.vn)
**Date:** 2026-04-21
**Scope:** Phía đại lý (partner-facing) — `/partner/*` routes với `PartnerLayout`
**Stack detected:** React 18 + Vite + TypeScript + Tailwind + Ant Design + Capacitor (mobile app)

---

## 1. Hiện trạng audit

### 1.1. Code layout
- **27 pages** trong `src/pages/partner/` — quá nhiều, overlap nhiều
- **Dual layout:** desktop sidebar (10 items) + mobile bottom nav (5 items)
- **Capacitor native Android app** (HashRouter) + web (BrowserRouter)
- **Firebase admin SDK** file có trong repo — dùng cho push notification

### 1.2. Sidebar desktop hiện tại (10 items)

```
Trang chủ      /partner/dashboard
Nhu cầu mua    /partner/demands
Đấu thầu       /partner/auctions           ⚠️ 0 auctions trong DB
Đơn của tôi    /partner/orders
Lịch sản xuất  /partner/schedule           ⚠️ không có table
Nghiệm thu     /partner/acceptance         ⚠️ overlap deal QC stage
Phiếu chốt mủ  /partner/bookings
Lý lịch mủ     /partner/rubber-intake      ⚠️ overlap deal history
Tin nhắn       /partner/chat
Công nợ        /partner/ledger
```

### 1.3. Data audit production (2026-04-21)

| Entity | Rows | Dùng? |
|---|---:|---|
| partners | 14 | ✅ |
| chat_rooms + messages | 14 + N | ✅ |
| deals | 3 | ✅ |
| demands + offers | 2 + 3 | ✅ |
| auctions | **0** | ❌ |
| settlements / advances / disputes / ledger | 0 | ⏳ chưa activate |
| notifications | 2 | ✅ |

### 1.4. Pain points
1. **10 menu items** → cognitive overload, partner nhỏ lẻ không biết vào đâu
2. **"Lịch sản xuất" + "Nghiệm thu"** không có entity riêng — fake menu
3. **"Phiếu chốt mủ" + "Đơn của tôi" + "Lý lịch mủ"** = cùng 1 lifecycle deal
4. **"Nhu cầu mua" + "Đấu thầu"** = 2 biến thể cơ hội
5. Không có **CTA aggregator** — đại lý không biết có việc gì cần làm ngay
6. Desktop có 10 items, mobile có 5 → **IA không nhất quán**
7. Không có **Notification bell** → phải vào menu riêng

---

## 2. Proposed architecture — 5 menu items

### 2.1. Information Architecture mới

```
Desktop sidebar = Mobile bottom nav (NHẤT QUÁN)

🏠  Trang chủ        /partner/home
🎯  Cơ hội          /partner/opportunities   (demands + auctions)
📦  Đơn hàng        /partner/orders          (bookings + deals + schedule + acceptance + rubber-intake)
💰  Tài chính       /partner/finance         (ledger + advance + settlement + dispute + payments)
💬  Chat            /partner/chat

Header utilities:
🔔  Notifications bell (dropdown + badge)
👤  Profile avatar (thông tin, đổi mật khẩu, logout)
```

**10 items → 5 items (giảm 50%).** Desktop/mobile dùng chung IA.

### 2.2. Route consolidation map

| Menu cũ | → Menu mới | Route thay đổi |
|---|---|---|
| `/partner/demands` | Cơ hội | `/partner/opportunities?tab=demands` |
| `/partner/auctions` | Cơ hội | `/partner/opportunities?tab=auctions` |
| `/partner/bookings` | Đơn hàng > Phiếu chốt | `/partner/orders/bookings` |
| `/partner/orders` | Đơn hàng > Deals | `/partner/orders/deals` |
| `/partner/schedule` | Đơn hàng > Lịch | `/partner/orders/schedule` |
| `/partner/acceptance` | Đơn hàng > Nghiệm thu | `/partner/orders/acceptance` |
| `/partner/rubber-intake` | Đơn hàng > Lý lịch | `/partner/orders/history` |
| `/partner/ledger` | Tài chính > Công nợ | `/partner/finance/ledger` |
| (mới) | Tài chính > Tạm ứng | `/partner/finance/advances` |
| `/partner/settlements` | Tài chính > Quyết toán | `/partner/finance/settlements` |
| `/partner/payments` | Tài chính > Thanh toán | `/partner/finance/payments` |
| (mới) | Tài chính > Khiếu nại DRC | `/partner/finance/disputes` |
| `/partner/notifications` | Header bell | (modal/dropdown) |
| `/partner/profile` | Header avatar | (modal) |

---

## 3. Module detail design

### 3.1. Trang chủ (Home) — action-first dashboard

Theo best practice: **"Call-to-action trước, vanity metrics sau"**

```
┌─ Header: Avatar + Bell(2) + Tier badge ─────────────────┐

┌─ CẦN LÀM NGAY (top priority) ───────────────────────────┐
│  ⚠️ 1 phiếu QT chờ xác nhận     [Xem →]                 │
│  📄 2 phiếu cân chờ ký         [Ký ngay →]             │
│  💬 Nhà máy PD vừa nhắn tin    [Mở chat →]             │
└─────────────────────────────────────────────────────────┘

┌─ KPI 4 ô ──────────────────────────────────────────────┐
│  3 Deals │ 15.4T │ 344B │ 55% DRC                      │
│ đang chạy│ tháng │ VNĐ  │ TB                           │
└─────────────────────────────────────────────────────────┘

┌─ 🔥 CƠ HỘI MỚI (3) ──────────[Xem tất cả →]────────────┐
│  NCM002 | 50T Mủ nước | 19-22k/kg | Còn 5 ngày         │
│  AUC003 | 100T SVR-10 | Khởi điểm 45k/kg | Còn 2h      │
└─────────────────────────────────────────────────────────┘

┌─ 📦 ĐƠN GẦN ĐÂY ────────────[Xem tất cả →]─────────────┐
│  DL2604-7B5P   ●●●○○○  Đang QC                        │
│  DL2604-4HYZ   ●●●●●○  Đã duyệt                       │
└─────────────────────────────────────────────────────────┘

┌─ 💰 TÌNH HÌNH TÀI CHÍNH ──────[Chi tiết →]─────────────┐
│  Số dư: +123.000.000 đ (nhà máy nợ)                    │
│  [Mini cash flow chart 7 ngày]                         │
└─────────────────────────────────────────────────────────┘
```

**DB queries:** aggregate từ deals (pending QC count), settlements (pending ack), chat_messages (unread), demands (new), partner_ledger (balance).

---

### 3.2. Cơ hội (Opportunities)

Tab bar: `[🎯 Nhu cầu mua] [⚡ Đấu thầu]`

**Card design:**
```
┌──────────────────────────────────────────────────┐
│  NCM002        [Đang mở]    [Chưa nộp offer]     │
│  50T Mủ nước · 19-22k/kg                         │
│  Giao: Phong Điền · Hạn: 2026-05-01 (5 ngày)     │
│                                                  │
│  [💬 Hỏi thêm]              [Nộp offer →]        │
└──────────────────────────────────────────────────┘
```

Filter chips: `Đang mở / Đã nộp / Trúng thầu / Đã đóng`

**Detail page:** full spec + map pickup location + form submit offer inline (không navigate đi) + nút mở chat với nhà máy cụ thể.

**DB:** `b2b_demands`, `b2b_auctions`, `b2b_demand_offers`

---

### 3.3. Đơn hàng (Orders) — largest module

**List level — 5 status tabs:**
```
[Tất cả (3)] [Chờ xử lý] [Đang giao] [QC] [Quyết toán] [Hoàn tất]
```

**Row:**
```
┌──────────────────────────────────────────────────────┐
│  DL2604-7B5P    [Đang xử lý]                         │
│  1T Mủ tạp · 20.000 đ/kg · Giao PD                   │
│  ● Chốt → ● Kho → ○ QC → ○ Duyệt → ○ QT            │
│                                    [💬] [Chi tiết →]│
└──────────────────────────────────────────────────────┘
```

**Detail page — 6 nested tabs:**

| Tab | Nội dung | Data source |
|---|---|---|
| Tổng quan | Metadata, status timeline, số liệu | b2b_deals |
| Phiếu chốt | Booking gốc + nút tạo phiếu mới | b2b_chat_messages metadata |
| Giao hàng | Delivery plans, xe, tài xế | dealDeliveryPlanService |
| Nhập kho | Stock-in orders list + phiếu cân | stock_in_orders, weighbridge_tickets |
| QC | QC result, variance %, nút "Khiếu nại DRC" | rubber_intake_batches |
| Quyết toán | Settlement view-only, nút "Xác nhận" | b2b_settlements |
| Lịch sử | Lot code traceability, EUDR, audit | b2b_deal_audit_log |

**Linkage:** "Khiếu nại DRC" button ở QC tab → redirect `/partner/finance/disputes?deal_id=X` với pre-filled form.

---

### 3.4. Tài chính (Finance) — consolidated money flow

**Tab bar: `[Tổng quan] [Tạm ứng] [Quyết toán] [Công nợ] [Thanh toán] [Khiếu nại DRC]`**

**Tổng quan page:**
```
┌─ 4 balance cards ──────────────────────────────────┐
│  +123M        │  +50M      │  500M       │  73M   │
│  Số dư hiện tại│ Tạm ứng   │ Đã thanh toán│ Chờ TT │
└────────────────┴────────────┴──────────────┴────────┘

┌─ Cash flow 12 tháng ─────[line chart]──────────────┐
└─────────────────────────────────────────────────────┘

┌─ Aging nợ quá hạn ────────────────────────────────┐
│  Hiện tại: 50M │ 31-60: 20M │ 61-90: 3M │ >90: 0M │
└─────────────────────────────────────────────────────┘
```

**Sub-tabs:**
- **Tạm ứng**: list advances where partner=self, filter date range
- **Quyết toán**: list settlements view-only + nút "Xác nhận đã nhận"
- **Công nợ**: full ledger với running balance + filter kỳ
- **Thanh toán**: lịch sử payments với receipt/bank_reference
- **Khiếu nại DRC**: list disputes + nút "Tạo mới" (modal với deal dropdown)

**DB:** `b2b_advances`, `b2b_settlements`, `b2b_partner_ledger`, `b2b_payments` (nếu có), `b2b_drc_disputes`

---

### 3.5. Chat (giữ nguyên, cải tiến)

- Tab row top để mở nhiều phòng song song (như ERP vừa rollout)
- Sub-tab mỗi nhà máy (nếu đại lý làm với >1 factory)
- Scroll-to-bottom behavior đã fix
- Inline DealCard + Click → mở Đơn hàng detail

---

### 3.6. Notifications (header bell)

- Badge số unread trên icon bell
- Dropdown panel 10 recent với filter type
- Click notification → deep link entity (`/partner/orders/xxx`, `/partner/finance/settlements/xxx`)
- "Xem tất cả" → full page modal
- Mark as read on click + bulk "Đánh dấu tất cả đã đọc"

---

## 4. Design system

### 4.1. Color tokens
```css
--color-primary: #1B4D3E;       /* rubber green */
--color-primary-light: #2D8B6E;
--color-accent: #E8A838;        /* amber CTA */
--color-success: #10B981;
--color-warning: #F59E0B;
--color-error: #EF4444;
--color-bg: #F9FAFB;
--color-card: #FFFFFF;
--color-text: #111827;
--color-text-muted: #6B7280;
--color-border: #E5E7EB;
```

### 4.2. Typography (giữ font hiện tại)
- Heading: 24/20/18 (`font-semibold`)
- Body: 14 (`font-normal`)
- Caption: 12 (`text-muted`)
- Number display: `tabular-nums`

### 4.3. Reusable components cần build

| Component | Mục đích |
|---|---|
| `StatCard` | KPI với icon + value + trend |
| `ActionCard` | Top card "Cần làm ngay" với CTA |
| `StagesTimeline` | Horizontal dot chain 6 bước |
| `StatusPill` | Badge màu theo status |
| `EmptyState` | Illustration + CTA khi list rỗng |
| `SkeletonCard` / `SkeletonTable` | Placeholder loading |
| `NotificationItem` | Row trong dropdown bell |
| `TabbedContent` | Nested tabs component |
| `FilterChips` | Multi-select filter |
| `AgingBar` | Stacked bar cho aging report |

### 4.4. Responsive breakpoints

| Width | Layout |
|---|---|
| `<768px` (mobile) | Bottom nav 5 items + hamburger menu top |
| `768-1024px` (tablet) | Sidebar icon-only (60px) + content |
| `>1024px` (desktop) | Sidebar full (240px) + content |

### 4.5. Micro-interactions
- Hover card: `shadow-md → shadow-lg` + `scale-[1.01]`
- Tab switch: 150ms slide fade
- Status change: pulse dot animation
- Realtime new message: row glow 2s

---

## 5. Technical plan

### 5.1. File structure mới

```
src/pages/partner/
├── home/
│   ├── HomePage.tsx                  (hub mới)
│   └── components/
│       ├── ActionCenter.tsx
│       ├── KPIStrip.tsx
│       ├── OpportunityPreview.tsx
│       └── RecentDeals.tsx
├── opportunities/
│   ├── OpportunitiesPage.tsx         (list unified)
│   ├── DemandDetailPage.tsx
│   └── AuctionDetailPage.tsx
├── orders/
│   ├── OrdersPage.tsx                (list)
│   ├── OrderDetailPage.tsx           (6 nested tabs)
│   └── BookingCreatePage.tsx
├── finance/
│   ├── FinancePage.tsx               (overview + tabs)
│   ├── AdvancesTab.tsx
│   ├── SettlementsTab.tsx
│   ├── LedgerTab.tsx
│   ├── PaymentsTab.tsx
│   └── DisputesTab.tsx
├── chat/ (giữ nguyên)
└── layout/
    ├── PartnerLayout.tsx             (redesign sidebar)
    ├── NotificationBell.tsx          (new)
    └── ProfileMenu.tsx               (new)
```

### 5.2. State management
- **TanStack Query** cho server state (giữ hiện tại)
- **Zustand** cho UI state: active tab, filters, sidebar collapse
- **Supabase Realtime** cho chat + notifications (subscribe trong layout, push vào bell)

### 5.3. Queries cần optimize
- Dashboard "Cần làm ngay": aggregate 4-5 counts trong 1 RPC duy nhất (`partner_dashboard_counts(partner_id)`) tránh N queries
- Finance overview: RPC `partner_finance_summary(partner_id)` trả aging buckets + balance trong 1 call
- Orders list: include latest stage inline, không query nested

### 5.4. RLS audit (từ memory b2b_schema_gotchas)
- `partner_id = current_partner_id()` trên tất cả queries
- Test với JWT claim populate đúng role=partner_user
- Không leak data giữa partner (verify qua Postman với 2 partner JWT)

### 5.5. Capacitor native considerations
- Hash router cho native build (đã có)
- Push notification qua Firebase SDK (đã có)
- Offline-first cho chat messages (cache trong IndexedDB)
- Native back button handler cho nested tabs

---

## 6. Roadmap 8 phase (~3 tuần)

| Phase | Nội dung | Effort |
|---|---|---|
| **1. IA refactor** | Sidebar 5 items + routing consolidation | 1 ngày |
| **2. Design system** | Color tokens + 10 components mới | 2 ngày |
| **3. Home redesign** | ActionCenter + KPIStrip + aggregation RPC | 2 ngày |
| **4. Opportunities** | Merge demands + auctions, unified list | 2 ngày |
| **5. Orders** | Consolidated with 6 nested tabs | 3 ngày |
| **6. Finance** | Overview + 5 sub-tabs + RPC summary | 3 ngày |
| **7. Chat polish + Notifications** | Multi-room tabs + bell dropdown | 2 ngày |
| **8. QA + Mobile + A11y** | Responsive test + native build + empty states | 2 ngày |

**Total: ~17 ngày (3.5 tuần).** Có thể chạy parallel 2-3 phase nếu có team.

### Quick wins (< 1 ngày) làm trước khi full redesign
1. Ẩn 2 menu fake (Lịch SX + Nghiệm thu nếu không có data) — 30 phút
2. Bell icon thay menu Thông báo — 2h
3. Dashboard "Cần làm ngay" card trên top — 3h
4. Stats card click drill-down — 1h

---

## 7. Industry reference & best practices (web research 2026)

Từ research thực tế các B2B supplier portal hiện đại:

### Role-Based Dashboard (từ [Fuselab Enterprise UX Guide 2026](https://fuselabcreative.com/enterprise-ux-design-guide-2026-best-practices/))
> "Modern B2B dashboards use role-based interfaces. Each role sees only what they need. Hide irrelevant complexity."

**Apply:** Partner portal chỉ hiện data của partner đó. Không có admin view, không có cross-partner comparison. Tier Silver có thể hide feature của Gold (locked + upgrade CTA).

### Time-to-Value (từ [Onething Design B2B SaaS UX 2026](https://www.onething.design/post/b2b-saas-ux-design))
> "Role-aware onboarding, guided walkthrough, first meaningful task trong <5 phút."

**Apply:** Partner lần đầu login → tour guide 3 bước: (1) xem cơ hội, (2) nộp offer, (3) vào chat. Không nhồi nhét metric.

### Self-Service Portal là core hub (từ [Asabix — Top 5 Features 2026](https://asabix.com/blog/top-5-features-b2b-portal-in-2026/))
> "Orders, pricing, analytics, personalization synchronized in real time. Not a convenient dashboard — core hub of digital collaboration."

**Apply:** Orders module = core hub. Tất cả deep link từ chat, notification, email, mobile push đều chạm tới deal detail.

### Dashboard = Action, không phải Report (từ [Rucha Abhyankar — UX Collective](https://uxdesign.cc/design-thoughtful-dashboards-for-b2b-saas-ff484385960d))
> "If data doesn't lead to action, it's reporting — not analytics."

**Apply:** KPI strip ở Home KHÔNG là mục tiêu chính. "Cần làm ngay" section với CTA buttons mới là.

### Agricultural trading platforms (từ [cieTrade](https://www.cietrade.com/agricultural-commodities-software/), [Agri Marketplace](https://agrimp.com/))
> "24/7 on-demand visibility to material, pricing, shipments, payments, documents. Product quality check + end-to-end logistics."

**Apply:** Đơn hàng detail phải hiện: status realtime, phiếu cân scan, QC result photo, delivery tracking, payment receipt trong 1 flow.

### Consolidated workflow (từ [Gatekeeper](https://knowledge.gatekeeperhq.com/en/docs/supplier-portal-overview), [Clinked Vendor Portals](https://www.clinked.com/blog/vendor-portals))
> "Unite all sites and systems under one login. Workflow triggers automate supplier-related processes."

**Apply:** Không còn 10 menu rời rạc. Deal lifecycle là 1 workflow duy nhất hiện trong Orders, các trigger (QC pass, settle approved) auto-notify.

---

## 8. Next action

Plan đầy đủ. Bạn chọn:

- **A)** Làm **quick wins** (4 mục < 1 ngày) trước, chiều nay xong
- **B)** Chạy full **Phase 1 (IA refactor)** — 1 ngày, risk thấp, unblock phase khác
- **C)** Làm **Phase 3 (Home redesign)** trước vì user vào nhiều nhất
- **D)** Phân công: tôi làm phase 1+2+3, bạn/dev khác làm phase 4-8

Tôi recommend **A → B → 3**: quick wins build momentum, IA refactor clean foundation, Home polish first user impression.

---

## Sources (web research)

- [B2B SaaS UX Design 2026 — Onething](https://www.onething.design/post/b2b-saas-ux-design)
- [Enterprise UX Guide 2026 — Fuselab](https://fuselabcreative.com/enterprise-ux-design-guide-2026-best-practices/)
- [Top 5 Features Modern B2B Portal 2026 — Asabix](https://asabix.com/blog/top-5-features-b2b-portal-in-2026/)
- [Design thoughtful B2B SaaS dashboards — UX Collective](https://uxdesign.cc/design-thoughtful-dashboards-for-b2b-saas-ff484385960d)
- [Vendor Portal Overview — Gatekeeper](https://knowledge.gatekeeperhq.com/en/docs/supplier-portal-overview)
- [11 Building Blocks for High-Performing Supplier Portal — Liferay](https://www.liferay.com/blog/business-partner-experience/-11-building-blocks-for-a-high-performing-supplier-portal)
- [cieTrade Agricultural Commodities Software](https://www.cietrade.com/agricultural-commodities-software/)
- [Agri Marketplace](https://agrimp.com/)
- [B2B UX Definitive Guide — ParallelHQ](https://www.parallelhq.com/blog/b2b-ux-design)
