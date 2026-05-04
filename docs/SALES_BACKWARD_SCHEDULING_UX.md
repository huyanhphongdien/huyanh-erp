# Sales Backward Scheduling — UX Design Spec

> Tổng hợp pattern từ thư viện `docs/design-references/` (getdesign.md mirror) áp dụng cho module Sales backward scheduling. Cập nhật 2026-05-04.

---

## 1. Lý do chọn 3 reference

| Reference | Pattern lấy về | Áp dụng cho |
|---|---|---|
| **cal.md** (Cal.com) | Clean white canvas + black CTA + rounded-12px cards + anchor-date booking | Detail page 1 đơn — friendly cho NV thu mua/sales |
| **vercel.md** | Deployment timeline pill badges + workflow accent colors + status indicator | Component "Timeline 6 bộ phận" — show stage status |
| **linear.app.md** | Dense dark surface + hairline borders + lavender accent + cmd palette | Dashboard Gantt overview — power user (BGĐ) |

**Ý tưởng chính:** Tách 2 view, mỗi view dùng 1 design language khác nhau theo mục đích.

---

## 2. View 1 — DealDetailPage Tab "Tiến độ"

**Áp dụng Cal.com light style + Vercel timeline pill**

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  ← Quay lại  •  Đơn UKKO Corporation #SO-2026-0050              │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─── Anchor Card (right-aligned, Cal.com style) ────┐          │
│  │  🎯 KHÁCH GIAO HÀNG                                │          │
│  │  Thứ 5, 25 / 06 / 2026                             │          │
│  │  Còn 23 ngày                                        │          │
│  │  ┌──────────────────┐                               │          │
│  │  │ Sửa ngày giao    │ (nút đổi anchor — modal warn) │          │
│  │  └──────────────────┘                               │          │
│  └─────────────────────────────────────────────────────┘          │
│                                                                    │
│  ─────  TIMELINE 6 BỘ PHẬN  (Vercel pill style)  ─────           │
│                                                                    │
│   Sales        Mua mủ       Sản xuất     QC final    Đóng gói    │
│   ●━━━━━━━━━━━ ●━━━━━━━━━━ ●━━━━━━━━━━ ○━━━━━━━━━ ○━━━━━━━━━●   │
│   ✅ Done       ✅ Done      🟡 In prog   ⏳ Pending  ⏳ Pending  │
│   26/05         01/06        10/06         16/06        18/06     │
│   Sales team    Khuyên       Hoàng         QC team     Pack team  │
│                                                                    │
│  Deliver: 25/06 ━━━━ ETD                                          │
│                                                                    │
│  ⚠️ Risk: QC dự kiến trễ 2 ngày → packing có thể bị đẩy           │
│                                                                    │
├──────────────────────────────────────────────────────────────────┤
│  ┌──────────────── Stage detail card đang xem ─────────────────┐ │
│  │  🏭 SẢN XUẤT (in progress)                                  │ │
│  │  Bắt đầu 04/06  •  Dự kiến xong 10/06                       │ │
│  │  Tiến độ: 60% (12/20 batch hoàn thành)                       │ │
│  │  Phụ trách: Hoàng — phòng QLSX                              │ │
│  │  Ghi chú: Đợi NVL từ Lào, dự kiến về 06/06                  │ │
│  │  [Mark done]  [Báo cáo trễ]  [Đính chính kế hoạch]          │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Design tokens cho View 1

Lấy pattern từ Cal.com:
- Background: `#ffffff` (canvas), `#f8f9fa` (card soft)
- Primary CTA: `#111111` (đen) — Cal.com style
- Card radius: `12px` (rounded-soft)
- Typography: Inter cho body, Cal Sans pattern (display geometric) cho heading

Lấy pattern từ Vercel cho status pills:
- Pill radius: `9999px` (full round)
- Done: bg `#10b98115` text `#10b981` (green soft)
- In progress: bg `#0a72ef15` text `#0a72ef` (Vercel develop blue)
- At risk: bg `#ff5b4f15` text `#ff5b4f` (Vercel ship red — neo "deadline gần")
- Pending: bg `#6b728015` text `#6b7280` (gray)

---

## 3. View 2 — Dashboard Gantt overview

**Áp dụng Linear dense-dark style** — cho BGĐ xem tất cả đơn cùng lúc

### Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  Sales Backward Scheduling — June 2026                  ⌘K Search   │
├──────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   Order               Customer    │ 1  3  5  7  9  11 13 15 17 19 21 │
│   ─────────────────────────────────┼─────────────────────────────────  │
│   SO-2026-0050 SVR_3L  UKKO       │   ▰▰▰▱▱▱▱▱▱▱▱▱  ▶ producing     │
│   SO-2026-0048 RSS_3   IE Synergy │ ▰▰▰▰▰▰▰▰▰▰▱▱  ▶ ready          │
│   SO-2026-0049 SVR_10  Toyota     │      ▰▰▰▱▱▱▱▱▱▱  ▶ confirmed   │
│   SO-2026-0051 SVR_3L  UKKO       │ ▰▰▰▰▰▰▰▰▰▰▰▰  ⚠ at risk        │
│                                                                        │
│  Today ▼                                                               │
│                                                                        │
│  ⚠️ ALERTS                                                            │
│  ─────────────────────────                                            │
│  • SO-2026-0051: QC trễ 2d → packing bị đẩy                          │
│  • SO-2026-0048: Sản xuất xong trước 3d → có thể giao sớm            │
│                                                                        │
└──────────────────────────────────────────────────────────────────────┘
```

### Design tokens cho View 2

Lấy pattern từ Linear:
- Canvas: `#010102` (near-black) hoặc `#fafafa` (light variant cho VN office)
- Surface: `#0f1011` cho dark / `#ffffff` cho light card
- Hairline: `#23252a` cho dark / `#e4e4e7` cho light
- Accent: `#5e6ad2` (Linear lavender) **hoặc** dùng brand `#1B4D3E` (Huy Anh rubber green) cho consistency

Để giữ brand, đề xuất:
- **Light variant** dùng cho VN office: canvas `#fafafa`, accent `#1B4D3E`, hairline `#e4e4e7`
- **Dark mode toggle** (optional): canvas `#010102`, accent `#1B4D3E`, hairline `#23252a` — Linear-style cho ai dùng đêm

---

## 4. Pattern: Status pills (Vercel-inspired)

```
✅ Done      → #10b981 / pill #d1fae5  (green soft)
🟡 In prog   → #0a72ef / pill #dbeafe  (blue Vercel develop)
⚠️ At risk   → #ff5b4f / pill #fee2e2  (red Vercel ship)
⏳ Pending   → #6b7280 / pill #f3f4f6  (gray)
🚫 Blocked   → #f59e0b / pill #fef3c7  (amber)
```

Pill component spec:
```css
.stage-pill {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 10px;
  border-radius: 9999px;        /* Vercel full round */
  font-size: 11px; font-weight: 500;
  font-family: Inter;
}
```

---

## 5. Pattern: Anchor date card (Cal.com-inspired)

```jsx
<AnchorCard>
  <Label muted>KHÁCH GIAO HÀNG</Label>
  <DateDisplay size="lg">Thứ 5, 25 / 06 / 2026</DateDisplay>
  <Subtext>Còn 23 ngày · ETD 25/06</Subtext>
  <Divider />
  <Button kind="primary" black>Sửa ngày giao</Button>
  <Button kind="link">Xem hợp đồng</Button>
</AnchorCard>
```

CSS:
- Border-radius: 12px
- Padding: 24px
- Background: `#f8f9fa`
- Border: 1px solid `#e5e7eb`
- Min-width: 320px
- Position: top-right của tab Tiến độ

---

## 6. Pattern: Cmd palette (Linear-inspired)

Áp dụng cho Dashboard overview:

```
⌘K → mở palette → gõ:
  - "QC delay" → filter all đơn QC trễ
  - "UKKO" → focus đơn của khách UKKO
  - "this week" → đơn deadline tuần này
  - "create" → wizard tạo đơn mới (Cal.com style)
```

Implementation: `cmdk` library (~5KB) hoặc `kbar`.

---

## 7. Pattern: Cascade alert banner

Khi 1 stage lệch → đẩy downstream:

```
┌──────────────────────────────────────────────────┐
│ ⚠️ QC trễ 2 ngày trên SO-2026-0050               │
│ → Packing 16/06 → 18/06                           │
│ → Logistics 18/06 → 20/06                         │
│ → ETD vẫn 25/06 ✓ (còn 5d buffer)                │
│                                                    │
│ [Xem chi tiết]  [Báo BGĐ]  [Đẩy ETD]             │
└──────────────────────────────────────────────────┘
```

Style: bg `#fef3c7` (Vercel preview pink soft), border-left 3px `#f59e0b`.

---

## 8. Color palette tổng hợp

```yaml
# Brand (giữ Huy Anh)
brand-primary: "#1B4D3E"       # Rubber green
brand-accent: "#CA252C"        # Tân Cảng red (cho alert critical)

# Surface (Cal.com light + Linear dark variant)
canvas-light: "#ffffff"
canvas-soft: "#f8f9fa"
canvas-dark: "#010102"          # Linear option
surface-card: "#ffffff"
surface-card-soft: "#fafafa"
hairline: "#e4e4e7"
hairline-strong: "#d4d4d8"

# Ink
ink-primary: "#111111"
ink-body: "#374151"
ink-muted: "#6b7280"

# Status (Vercel-inspired)
status-done: "#10b981"
status-progress: "#0a72ef"
status-risk: "#ff5b4f"
status-blocked: "#f59e0b"
status-pending: "#6b7280"

# Background pills (10-15% opacity)
pill-done-bg: "#d1fae5"
pill-progress-bg: "#dbeafe"
pill-risk-bg: "#fee2e2"
pill-blocked-bg: "#fef3c7"
pill-pending-bg: "#f3f4f6"
```

---

## 9. Typography

Cal.com pattern: heading geometric + body Inter. Áp dụng:

```css
/* Display (anchor date, page heading) */
.display { font-family: 'Inter Display', 'Inter', sans-serif;
  font-weight: 600; letter-spacing: -0.02em; }

/* Body */
.body { font-family: 'Inter', 'Segoe UI', sans-serif;
  font-weight: 400; }

/* Mono (deal numbers, codes) */
.mono { font-family: 'JetBrains Mono', monospace; }

/* Sizes */
.text-xs:    11px         /* pills, labels */
.text-sm:    13px         /* body */
.text-base:  14px         /* default */
.text-lg:    18px         /* card titles */
.text-xl:    24px         /* section heading */
.text-2xl:   32px         /* anchor date */
```

---

## 10. Component map

| Component | Style nguồn | Files cần tạo |
|---|---|---|
| `AnchorCard` | Cal.com card | `src/pages/sales/components/AnchorCard.tsx` |
| `StageTimeline` | Vercel pill timeline | `src/pages/sales/components/StageTimeline.tsx` |
| `StagePill` | Vercel status badge | `src/components/common/StagePill.tsx` |
| `CascadeAlert` | Custom warning banner | `src/pages/sales/components/CascadeAlert.tsx` |
| `BackwardGanttView` | Linear dense table | `src/pages/sales/SalesBackwardGanttPage.tsx` |
| `SalesCmdPalette` | Linear cmd-K | `src/components/common/SalesCmdPalette.tsx` (later) |

---

## 11. Roadmap UX → code

| Sprint | Phạm vi UX | Output |
|---|---|---|
| **S1** | AnchorCard + StagePill + StageTimeline (read-only) | Tab "Tiến độ" hiển thị 6 stages, status pills |
| **S2** | CascadeAlert + auto-recompute deadline | Khi update stage, alert tự sinh |
| **S3** | BackwardGanttView (Linear style dashboard) | BGĐ xem tổng quan |
| **S4** | SalesCmdPalette + filter shortcuts | Power user navigate |

---

## 12. Branding consistency

Tránh quá phụ thuộc 1 design — kết hợp:

- **Brand colors giữ Huy Anh** (`#1B4D3E` + `#CA252C` đỏ Tân Cảng) — không thay
- **Layout/spacing/typography** học từ Cal.com (clean) + Vercel (functional)
- **Dense data view** (Gantt overview) học từ Linear
- **Status indicators** (pill 9999px) lấy từ Vercel
- **Anchor card pattern** lấy từ Cal.com booking

Kết quả: Brand vẫn là Huy Anh Rubber, nhưng UX hiện đại theo level Linear/Vercel/Cal.

---

## 13. Tham chiếu nguồn

- `docs/design-references/cal.md` — clean canvas + anchor card pattern
- `docs/design-references/vercel.md` — deployment timeline + status pills
- `docs/design-references/linear.app.md` — dense dark + cmd palette
- `docs/design-references/_eport_learnings.md` — bài học UX VN context

---

**Tác giả:** Claude Opus 4.7 — Co-author huyanhphongdien@gmail.com
**Ngày:** 2026-05-04
