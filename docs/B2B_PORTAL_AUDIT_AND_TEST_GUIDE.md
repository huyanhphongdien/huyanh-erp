# B2B Partner Portal — Audit & Test Guide

**Date:** 2026-04-21
**Target:** `D:\Projects\huyanh-b2b-portal` (b2b.huyanhrubber.vn)
**Dev local:** `http://localhost:5174`
**Portal redesign:** Phase 1-8 đã apply + build pass
**Scope audit:** Database + UX + test journey phía đại lý

---

## 1. DATABASE AUDIT

### 1.1. Data landscape (production)

Snapshot 2026-04-21 — số liệu thật trên Supabase `dygveetaatqllhjusyzz`.

| Table | Rows | Trạng thái | Ghi chú |
|---|---:|---|---|
| `b2b_partners` | 14 | ✅ Active | Đại lý đã register |
| `b2b_partner_users` | 9+ | ✅ Active | Login accounts |
| `b2b_chat_rooms` | 14 | ✅ Active | 1 room/partner |
| `b2b_chat_messages` | N | ✅ Active | Realtime OK |
| `b2b_deals` | 3 | ✅ Low-volume | DL2604-4HYZ, 4UEU, 7B5P |
| `b2b_demands` | 2 | ✅ Live | NCM-20260318-WFV (published), NCM-20260330-8KC (filled) |
| `b2b_demand_offers` | 3 | ✅ Live | 2 accepted, 1 withdrawn |
| `b2b_auctions` | **0** | ❌ Empty | Module chưa activate |
| `b2b_advances` | 0 | ⏳ Chưa | Sẽ có khi deal confirm |
| `b2b_settlements` | 0 | ⏳ Chưa | Sẽ có khi deal accepted |
| `b2b_partner_ledger` | 0 | ⏳ Chưa | |
| `b2b_drc_disputes` | 0 | ⏳ Chưa | |
| `b2b_notifications` | 2 | ✅ Active | Welcome msgs |

### 1.2. Schema map (partner-facing)

```
┌──────────────┐    1:N   ┌──────────────────┐
│  partners    │◄─────────│ partner_users    │  (login accounts)
└──────┬───────┘          └──────────────────┘
       │ 1:N
       ├──────────────────► chat_rooms (1 per partner)
       │                         │
       │                         ▼ 1:N
       │                    chat_messages (realtime)
       │
       ├──────────────────► deals
       │                      │
       │                      ├──► advances (tạm ứng)
       │                      ├──► settlements (quyết toán)
       │                      ├──► drc_disputes (khiếu nại)
       │                      └──► stock_in_orders (cross-schema)
       │                              └──► rubber_intake_batches
       │
       ├──────────────────► demand_offers
       │                      │
       │                      ▼ FK
       │                 demands (public)
       │
       └──────────────────► partner_ledger (công nợ)
                                │
                                └──► notifications
```

### 1.3. Column schema critical (bản rút gọn — xem memory [b2b_schema_gotchas](../memory/b2b_schema_gotchas.md) chi tiết)

#### `b2b_partners`
- `code` (VD: TETG02, TEGP01)
- `tier`: `diamond` | `gold` | `silver` | `bronze` | `new`
- `status`: `pending` | `verified` | `suspended` | `rejected`
- `partner_type`: **chỉ** `supplier` hoặc `dealer`
- `region_code` (NOT `region`), `phone` (NOT NULL)

#### `b2b_deals`
- `status`: `pending → processing → accepted → settled` (hoặc `cancelled`)
- `quantity_kg`, `unit_price`, `total_value_vnd`, `expected_drc`, `actual_drc`, `actual_weight_kg`
- `stock_in_count`, `qc_status`: `pending` | `passed` | `warning` | `failed`
- **CHECK:** `quantity_kg > 0`, `unit_price ≥ 0`, `expected_drc ∈ (0, 100]`
- **LOCK sau accepted:** không sửa được unit_price, final_price, actual_drc, actual_weight_kg, partner_id

#### `b2b_settlements`
- `gross_amount`, `remaining_amount` = **GENERATED** (không update trực tiếp)
- `status`: `draft → pending → approved → paid` (hoặc `rejected`, `cancelled`)
- `locked_by_dispute`: TRUE khi có dispute active → block update
- **KHÔNG CÓ** columns: `submitted_at`, `paid_amount`, `rejected_*`

#### `b2b_partner_ledger`
- `entry_type` CHECK: `settlement_receivable` | `advance_paid` | `payment_paid` | `processing_fee` | `adjustment_debit` | `adjustment_credit`
- `period_month`, `period_year` = **GENERATED** từ `entry_date`
- UNIQUE `(partner_id, entry_type, reference_code)` — idempotency

#### `b2b_drc_disputes`
- `drc_variance` = GENERATED (actual - expected)
- `status`: `open` | `investigating` | `resolved_accepted` | `resolved_rejected`
- Column `resolution_notes` (NOT `resolution`)

### 1.4. RLS policies (partner scope)

Tất cả bảng `b2b.*` bật RLS. Policy pattern:
```sql
-- Chỉ partner xem được data của chính mình
CREATE POLICY partner_select ON b2b.deals FOR SELECT
  USING (partner_id = current_partner_id());
```

`current_partner_id()` lấy từ JWT claim `partner_id`. Factory user dùng service_role bypass RLS.

**⚠️ Test quan trọng:** Partner A đăng nhập KHÔNG được query data của Partner B. Xem TC-3 phần UX test.

---

## 2. UX AUDIT — User Journey phía đại lý

### 2.1. 5 journey chính (từ portal redesign V2)

```
Journey 1: ONBOARDING
  Login → Tour 3 bước → Home (tier banner)

Journey 2: TẠO BOOKING (daily)
  Chat → Gửi phiếu chốt → Nhà máy confirm → Deal created

Journey 3: NHẬN CƠ HỘI (demand/auction)
  Home "Cơ hội mới" → Opportunities page → Demand detail → Nộp offer

Journey 4: THEO DÕI ĐƠN
  Orders list → Detail → Track 6 stages (Chốt→Kho→QC→Duyệt→QT→TT)

Journey 5: QUẢN LÝ TÀI CHÍNH
  Finance Overview → Tab Settlement → Xác nhận → Tab Ledger → Check balance
```

### 2.2. Sitemap mới (5 menu + bell + avatar)

```
/partner/login                                 (public)

── Sau login (PartnerLayout) ──

/partner/home                                  Trang chủ (action-first dashboard)
/partner/opportunities?tab=open|submitted|won|closed
/partner/opportunities/demands/:id
/partner/opportunities/auctions/:id

/partner/orders?tab=all|processing|qc|accepted|settled
/partner/orders/:id?tab=overview|delivery|stockin|qc|settlement|history

/partner/finance?tab=overview|advances|settlements|ledger|payments|disputes
/partner/finance/settlements/:id

/partner/chat                                  list phòng
/partner/chat/:roomId                          chat room realtime

/partner/profile                               avatar dropdown
/partner/notifications                         bell modal full

── Legacy redirects (backward compat) ──
/partner/demands      → /partner/opportunities?tab=demands
/partner/auctions     → /partner/opportunities?tab=auctions
/partner/deals        → /partner/orders
/partner/schedule     → /partner/orders
/partner/acceptance   → /partner/orders
/partner/ledger       → /partner/finance?tab=ledger
/partner/settlements  → /partner/finance?tab=settlements
/partner/payments     → /partner/finance?tab=payments
/partner/bookings     → PartnerBookingListPage (legacy giữ nguyên)
```

### 2.3. Design hierarchy

| Tầng | Nội dung |
|---|---|
| **Tầng 1: Brand** | Header xanh `#1B4D3E` + logo "🌿 Huy Anh B2B" |
| **Tầng 2: Navigation** | 5 menu items (desktop sidebar ≥1024px, mobile bottom nav + drawer) |
| **Tầng 3: Page** | `PageHeader` (title + back + subtitle + actions) |
| **Tầng 4: Content** | Cards, tabs, lists — reusable components |
| **Tầng 5: Action** | `ActionCard` (CTA primary), Button, StatusPill |

### 2.4. Color/status code

| Status | Badge màu | Nghĩa |
|---|---|---|
| pending | 🟡 amber | Chờ xử lý |
| processing | 🔵 blue | Đang xử lý |
| accepted | 🟢 green | Đã duyệt |
| settled | 🟣 purple | Đã quyết toán |
| cancelled | 🔴 red | Đã hủy |
| draft | ⚪ gray | Nháp |
| paid | 🔵 blue | Đã thanh toán |
| open | 🔴 red | Dispute đang mở |
| investigating | 🟡 amber | Đang xử lý dispute |

### 2.5. 6 Stages timeline (Deal lifecycle)

```
● Chốt → ● Nhập kho → ○ QC → ○ Duyệt → ○ Quyết toán → ○ Thanh toán
 done     done          current  pending   pending        pending
```
- `●` done (primary green)
- `●` current (amber với ring glow)
- `○` pending (trắng, border gray)

Hiển thị ở `Home > Recent deals`, `Orders list`, `Order detail > Overview tab`.

---

## 3. TEST GUIDE — 25 Test cases

### 3.1. Pre-test setup

**Test accounts** (từ `b2b_partner_users`):

| Email | Partner | Tier | Use case |
|---|---|---|---|
| `truonghv@gmail.com` | Hà Văn Trường (TETG02) | Silver | Main test, có 1 deal + chat |
| `anhdatgroup@gmail.com` | ANH ĐẠT GROUP (TEGP01) | Gold | Gold tier test |
| `cuonglth@gmail.com` | Lê Thị Hồng Cương (TECG01) | Bronze | Bronze tier test |
| `partner@test.com` | Test partner | — | Backup |

**Dev URL:** `http://localhost:5174/partner/login`

**Tools:**
- Browser DevTools (Network + Console)
- Chrome responsive mode để test mobile breakpoint

### 3.2. Test matrix

#### ── NAVIGATION (4 TCs) ──

**TC-N1: Desktop sidebar render**
- Resize browser ≥1024px width
- **Expected:** Sidebar 240px bên trái hiển thị. 5 items + partner card + logout button.
- **Verify:** Không có scrollbar ngang; item active có `#E8F4EE` background.

**TC-N2: Mobile bottom nav**
- Resize browser <1024px
- **Expected:** Bottom nav 5 items hiện cố định dưới; sidebar ẩn; hamburger menu ở header.
- **Verify:** Click bottom nav navigate đúng; active indicator dot xanh trên.

**TC-N3: Drawer menu (mobile)**
- Click hamburger icon top-left
- **Expected:** Drawer slide từ trái, partner card gradient + 5 items + profile + logout.
- **Verify:** Click item → drawer close + navigate.

**TC-N4: Legacy redirect**
- Gõ `http://localhost:5174/partner/demands` vào URL
- **Expected:** Auto redirect `/partner/opportunities?tab=demands`
- Lặp lại với `/partner/ledger`, `/partner/deals` → redirect đúng

#### ── HOME PAGE (5 TCs) ──

**TC-H1: Tier banner render**
- Login với Silver tier → Home
- **Expected:** Banner xám gradient, emoji 🥈, text "Hạng Silver", progress bar 50%, "Còn 50% để lên Gold"
- Switch account Gold → banner vàng 🏆

**TC-H2: ActionCenter visibility**
- Nếu có pending settlement / unread chat / new opportunity → hiện card "📌 Cần làm ngay"
- **Expected:** Card tone tương ứng (warning/info/success), click → deep link module
- Nếu không có gì → ẩn hoàn toàn

**TC-H3: KPI strip clickable**
- 4 stat cards: Deals đang chạy / KL tháng / Giá trị tháng / DRC TB
- **Expected:** Click "Deals đang chạy" → navigate `/partner/orders`
- KL tháng hiện đúng số từ `actual_weight_kg || quantity_kg` của deals trong tháng

**TC-H4: Opportunities preview**
- Hiện tối đa 3 demand gần nhất (status=published, deadline ≥ now)
- **Expected:** Mỗi card: code, quantity, price range, "Còn X ngày" (amber nếu ≤2 ngày)
- Click card → `/partner/opportunities/demands/:id`

**TC-H5: Recent deals timeline**
- Hiện 5 deals gần nhất với stages timeline
- **Expected:** Stages chấm tiến trình đúng status (Chốt=done nếu deal tồn tại, Kho=done nếu stock_in_count>0, QC=current nếu stock_in_count>0 + qc_status=pending)
- Click deal card → `/partner/orders/:id`

#### ── OPPORTUNITIES (4 TCs) ──

**TC-O1: 4 filter chips**
- Tabs: Đang mở / Đã nộp / Trúng thầu / Đã đóng
- **Expected:** Count chip đúng với filter. VD: partner có 2 accepted offers → "Trúng thầu (2)"

**TC-O2: Demand card info**
- Mỗi demand card: badge (Trúng thầu/Đã nộp/Đang mở), title code, qty · product, price range, DRC, deadline
- **Expected:** Demand status="filled" → không hiện ở tab "Đang mở"; hiện ở tab "Đã đóng" nếu chưa submit

**TC-O3: Nộp offer flow**
- Click demand "Đang mở" → detail page → form nộp offer (form này dùng `PartnerDemandDetailPage` legacy)
- **Expected:** Submit offer → status của partner với demand đó thành "Đã nộp", biến mất khỏi tab "Đang mở", xuất hiện ở tab "Đã nộp"

**TC-O4: Empty state**
- Tab "Trúng thầu" khi partner chưa trúng: hiện empty illustration + text
- **Expected:** CTA "Mở chat" nếu tab "Đang mở" empty

#### ── ORDERS (5 TCs) ──

**TC-OR1: List search + filter**
- Gõ "DL2604" vào search → filter client-side
- Click chip "Chờ QC" → filter deals có stock_in_count>0 và qc_status=pending

**TC-OR2: Deal row timeline**
- Mỗi deal row hiển thị 6-dot stages
- **Expected:** Với DL2604-7B5P (qc_status=pending, stock_in_count=0) → stages: Chốt=done, Kho=current, QC+ =pending

**TC-OR3: Order detail 6 tabs**
- Click row → detail page với 6 tabs: Tổng quan / Giao hàng / Nhập kho / QC / Quyết toán / Lịch sử
- **Expected:** Tab URL sync `?tab=overview|delivery|stockin|qc|settlement|history`. F5 giữ tab.

**TC-OR4: QC dispute CTA**
- Tab QC của deal có `actual_drc != expected_drc` quá 2% → hiện button đỏ "Khiếu nại DRC"
- Click → navigate `/partner/finance?tab=disputes&deal=<id>` → auto-open modal với deal pre-filled

**TC-OR5: Chat từ deal detail**
- Button "Chat" top-right
- **Expected:** Query chat_room của partner_id → navigate `/partner/chat/:roomId`
- Không có room → navigate `/partner/chat` (list)

#### ── FINANCE (5 TCs) ──

**TC-F1: Overview stat + aging**
- Tab Overview: 4 stat cards (Số dư / Tạm ứng / Đã TT / Chờ TT)
- Aging bar: current / 31-60 / 61-90 / >90 ngày
- **Expected:** Tính đúng từ partner_ledger (debit - credit + entry_date age)

**TC-F2: Advances list**
- Tab Tạm ứng: list `b2b_advances` của partner (hiện tại 0 rows → empty state)
- **Expected:** Nếu có paid advance → hiển thị: number, amount VND lớn, status pill, payment_date, method (Tiền mặt/Chuyển khoản), purpose

**TC-F3: Settlements view-only**
- Tab Quyết toán: list settlements (hiện tại 0 rows)
- Click row → `/partner/finance/settlements/:id` (dùng `PartnerSettlementDetailPage` legacy)
- **Expected:** Partner có quyền xem (RLS pass) nhưng không sửa

**TC-F4: Ledger entries + running balance**
- Tab Công nợ: list entries DESC, mỗi row có running balance cộng dồn
- **Expected:** Format +xxx (debit=xanh) / -xxx (credit=đỏ)

**TC-F5: Dispute modal flow**
- Tab Khiếu nại DRC → button "Tạo khiếu nại mới" → modal
- Select deal từ dropdown (hiện kèm DRC variance info nếu có)
- Viết lý do ≥10 ký tự → Submit
- **Expected:** Gọi RPC `partner_raise_drc_dispute` → dispute tạo, modal close, list refresh
- Nếu deal chưa có actual_drc → RPC reject

#### ── CHAT + NOTIFICATIONS (3 TCs) ──

**TC-C1: Chat list existing**
- Tab Chat → list phòng chat (legacy `PartnerChatListPage`)
- **Expected:** Hiện room với nhà máy, tier badge, unread count

**TC-C2: Notification bell realtime**
- Click bell icon top-right → dropdown 360px
- **Expected:** List 10 notifications recent, unread highlighted, "Đánh dấu đã đọc" button top-right
- Click notification → mark read + deep link entity
- Thêm notification mới từ SQL (INSERT vào `b2b.notifications`) → bell badge tăng realtime

**TC-C3: Deep link từ notification**
- Notification type `deal` + `deal_id` → click redirect `/partner/orders/:id`
- Type `settlement` → `/partner/finance/settlements/:id`
- Type `dispute` → `/partner/finance?tab=disputes`

#### ── SECURITY (RLS) (4 TCs) ──

**TC-S1: Login partner A, query partner B ko leak**
- Login `truonghv@gmail.com` (TETG02)
- Mở DevTools Console:
```js
(await supabase.from('b2b_deals').select('*')).data
```
- **Expected:** Chỉ trả deals của TETG02. Không leak deal partner khác.

**TC-S2: Direct access forbidden**
- Login TETG02 → gõ URL `/partner/orders/<deal_id_của_partner_khác>`
- **Expected:** "Không tìm thấy đơn hàng" (query trả null, RLS filter)

**TC-S3: Dispute RPC verify ownership**
- Login TETG02 → tạo dispute với `deal_id` của partner khác (qua console)
- **Expected:** RPC `partner_raise_drc_dispute` reject với error

**TC-S4: Logout session cleanup**
- Logout → gõ URL `/partner/home` → redirect login

#### ── PERFORMANCE & QA (4 TCs) ──

**TC-Q1: Loading states**
- Refresh mỗi tab lớn → phải thấy `SkeletonCard` shimmer, không spinner thô
- **Expected:** Skeleton 3 rows 100px cho list pages; 4 stat cards 90px cho Home/Finance

**TC-Q2: Empty states**
- Partner chưa có deal → Orders list hiện EmptyState icon + "Chưa có đơn hàng" + CTA "Mở chat"
- Dispute empty → "Chưa có khiếu nại" + hint

**TC-Q3: Responsive breakpoints**
- 360px (mobile) / 768px (tablet) / 1024px (desktop) / 1440px (large)
- **Expected:** <1024 bottom nav + drawer; ≥1024 sidebar; không overflow horizontal

**TC-Q4: Build production**
- `cd D:/Projects/huyanh-b2b-portal && npm run build`
- **Expected:** ✓ built in < 15s, không TS errors, không Vite warnings quan trọng

---

## 4. KNOWN GOTCHAS

### 4.1. DB gotchas (từ memory [b2b_schema_gotchas](../memory/b2b_schema_gotchas.md))

- `partner_type` chỉ accept `'supplier' | 'dealer'` — tạo partner test cần đúng
- `gross_amount`, `remaining_amount`, `drc_variance`, `period_month`, `period_year` là **GENERATED**
- `entry_type` của ledger là 6 giá trị fixed (không phải `'adjustment'`)
- Deal accepted → lock sửa 6 columns (trigger chặn)
- Settlement approved → lock sửa 5 columns
- Audit trigger fail nếu DELETE settlement → FK violation; workaround: DISABLE TRIGGER

### 4.2. UX gotchas portal

- **Auctions module = 0 data** → tabs/filter liên quan auction ẩn tự động khi empty
- **Stock-in data** được tạo bên ERP (factory side) — portal chỉ read
- **Settlement partner-side = view-only** — không có nút sửa
- **Dispute RPC yêu cầu partner ownership** — test từ ERP (factory user) sẽ fail
- **Capacitor mobile app** dùng HashRouter, desktop web dùng BrowserRouter → test cả 2
- **Firebase push notification** đã setup nhưng chưa rollout production

### 4.3. Accessibility TODOs (Phase 8 chưa làm hết)

- [ ] Keyboard navigation cho dropdown bell (Tab/Enter/Esc)
- [ ] ARIA labels cho StatusPill (aria-label = status Vietnamese)
- [ ] Focus ring màu `#2D8B6E` cho button
- [ ] Screen reader announce khi tab change
- [ ] Color contrast ratio ≥4.5:1 cho text trên background

---

## 5. TEST CHECKLIST (copy qua spreadsheet)

| # | Category | TC | Status | Notes |
|---|---|---|---|---|
| 1 | Nav | N1 Desktop sidebar | ☐ |  |
| 2 | Nav | N2 Mobile bottom nav | ☐ |  |
| 3 | Nav | N3 Drawer | ☐ |  |
| 4 | Nav | N4 Legacy redirect | ☐ |  |
| 5 | Home | H1 Tier banner | ☐ |  |
| 6 | Home | H2 ActionCenter | ☐ |  |
| 7 | Home | H3 KPI clickable | ☐ |  |
| 8 | Home | H4 Opportunities preview | ☐ |  |
| 9 | Home | H5 Recent deals timeline | ☐ |  |
| 10 | Opp | O1 4 filter chips | ☐ |  |
| 11 | Opp | O2 Demand card info | ☐ |  |
| 12 | Opp | O3 Nộp offer flow | ☐ |  |
| 13 | Opp | O4 Empty state | ☐ |  |
| 14 | Order | OR1 Search + filter | ☐ |  |
| 15 | Order | OR2 Timeline stages | ☐ |  |
| 16 | Order | OR3 6 tabs | ☐ |  |
| 17 | Order | OR4 QC dispute CTA | ☐ |  |
| 18 | Order | OR5 Chat từ deal | ☐ |  |
| 19 | Finance | F1 Overview + aging | ☐ |  |
| 20 | Finance | F2 Advances list | ☐ |  |
| 21 | Finance | F3 Settlement view | ☐ |  |
| 22 | Finance | F4 Ledger balance | ☐ |  |
| 23 | Finance | F5 Dispute modal | ☐ |  |
| 24 | Chat | C1 Chat list | ☐ |  |
| 25 | Chat | C2 Bell realtime | ☐ |  |
| 26 | Chat | C3 Deep link notif | ☐ |  |
| 27 | Sec | S1 RLS data isolation | ☐ |  |
| 28 | Sec | S2 Direct URL forbid | ☐ |  |
| 29 | Sec | S3 Dispute ownership | ☐ |  |
| 30 | Sec | S4 Logout cleanup | ☐ |  |
| 31 | QA | Q1 Skeleton loader | ☐ |  |
| 32 | QA | Q2 Empty state | ☐ |  |
| 33 | QA | Q3 Responsive | ☐ |  |
| 34 | QA | Q4 Build | ☐ |  |

**Pass criteria:** 34/34 pass → deploy production. Fail TC-S* (security) → **blocker**.

---

## 6. NEXT STEPS SAU KHI TEST

1. Fix bug từ test results (nếu có)
2. Phase 9 (tương lai): Khi auction module có data → unhide source toggle trong Opportunities
3. Phase 10: Khi advance/settlement/ledger có data real → test Finance đầy đủ
4. Deploy staging → UAT 3 ngày với 2-3 partner thực
5. Rollout production với feature flag

---

## 7. Ghi chú quan trọng

- **KHÔNG có** endpoint `partner_dashboard_counts` RPC — Home currently làm 5 queries song song (Promise.all). Nếu slow → optimize = 1 RPC.
- **Aging calculation** client-side từ ledger rows — OK cho partner ít entries, chậm nếu >1000 entries → move server-side.
- **NotificationBell realtime** subscribe với filter `partner_id=eq.X` — test kỹ khi insert vào `b2b.notifications` (schema `b2b`, không phải public).
- **StagesTimeline helper** `dealStatusToStages()` chưa bao gồm `cancelled` gracefully — nếu cancel giữa chừng, stages reset.
