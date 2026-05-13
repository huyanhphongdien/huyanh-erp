# Sales Order UI — Benchmarking các phần mềm thế giới

**Date:** 2026-05-09
**Mục đích:** Khảo sát giao diện Đơn hàng Bán của các ERP/SaaS lớn để rút ra patterns áp dụng cho Huy Anh ERP.

---

## 1. Tổng hợp 8 sản phẩm tham chiếu

| # | Sản phẩm | Triết lý chính | Điểm mạnh |
|---|---|---|---|
| 1 | **SAP S/4HANA Fiori — Manage Sales Orders (F1873)** | Filter bar trên cùng + table dense. Settings (gear icon) cho phép tùy chỉnh cột + lưu view | Mature filter, save view persist user-level |
| 2 | **NetSuite — Sales Orders** | List view với saved searches + customizable columns + bulk actions toolbar | Saved search, formula columns |
| 3 | **Odoo Sales — Quotations/Orders** | 4 view: List / Kanban / Calendar / Pivot — toggle ở góc trên phải | Hybrid 4-view, switch nhanh |
| 4 | **Shopify Admin — Orders** | Tabs theo status (All / Open / Unfulfilled / Unpaid / Archived) + bulk checkbox | Status tabs cực rõ, mobile-friendly |
| 5 | **Stripe Dashboard — Payments/Invoices** | Table cực sạch, không màu mè. Filter chips trên top, click chip để remove. Saved filters | Cực tối giản, density vừa phải |
| 6 | **Pipedrive — Deals** | Kanban-first (drag pipeline), table là view phụ. Deal rotting indicator | Pipeline view = main UX |
| 7 | **HubSpot — Deals** | Table + Board view. Smart properties, customizable columns, saved views per user | Saved view per user/role |
| 8 | **Linear — Issues** (analogy) | Dropdown filter 4 nhóm (Priority/Assignee/Date/Tag), filter chips inline trên top | Filter UX = best-in-class |

---

## 2. Patterns chung nổi bật (5 product trở lên dùng)

### 2.1. Filter trên top, KHÔNG sidebar
Stripe, Shopify, Linear, Pipedrive, HubSpot đều đặt filter ở **top horizontal bar** chứ không sidebar. Lý do:
- Bảng list cần full width
- Filter ít khi mở rộng > 6 chips
- Sidebar tốn space cho data

→ **Huy Anh hiện đã làm đúng** (Filter card ở top).

### 2.2. Filter chips hiển thị active filter
Stripe + Linear + Notion đều có pattern: filter active hiện thành **chip nhỏ với X để remove**:

```
[Status: Đã giao ✕]  [Khách: Đồng Phú ✕]  [Tháng 4 ✕]   + Add filter
```

→ **Huy Anh chưa làm.** Hiện filter ở dropdown — user phải mở lại để xem đã chọn gì.

### 2.3. Saved views per user
SAP Fiori, NetSuite, HubSpot, Linear đều cho phép user **lưu filter+columns+sort thành "view"** (vd "Đơn quá hạn của tôi", "Đơn tháng này EU"):

```
Views: ★ All orders | ★ My overdue | ★ This month EU | + New view
```

→ **Huy Anh chưa làm.** Đáng để implement Mức 4.

### 2.4. Column customizer (Settings gear)
SAP Fiori, NetSuite, HubSpot, Stripe đều có gear icon trên top-right table → modal chọn cột.

→ **Huy Anh đã làm Mức 2** ✓ (Dropdown "Tùy chỉnh cột").

### 2.5. Bulk actions toolbar
Shopify, Stripe, NetSuite — khi check rows: toolbar xuất hiện ở **bottom hoặc top sticky**:

```
3 đơn được chọn  ·  [Đánh dấu giao]  [Gửi email]  [Export]  [Xóa]    [✕ Hủy chọn]
```

→ **Huy Anh đã làm Mức 1+2** ✓ (Copy mã + Excel SELECTED).

### 2.6. Status tabs với count badge
Shopify, HubSpot, Linear — status tabs có badge số ngay cạnh label:

```
[All 1,243]  [Open 87]  [Unfulfilled 23]  [Unpaid 12]  [Archived 1,121]
```

→ **Huy Anh đã làm Mức 1** ✓

### 2.7. Hybrid view toggle (Table ↔ Kanban ↔ Calendar)
Odoo, Pipedrive, Notion, Airtable — toggle ở góc top-right:

```
[≡ Table] [▦ Kanban] [📅 Calendar] [📊 Pivot]
```

→ **Huy Anh đã làm Mức 3** ✓ (nút Kanban).

### 2.8. Inline edit cell (click → edit)
Notion, Airtable, Linear — cell click vào edit thẳng, không mở detail.

→ **Huy Anh đã làm Mức 3** ✓ (4 cột: Hạn giao / BKG / ETD / Tiền về).

### 2.9. Density toggle
Notion, Linear — toggle "Compact / Normal / Comfortable" cho row height.

→ **Huy Anh chưa làm.** Nice-to-have.

### 2.10. Row hover quick actions
Stripe, Linear, Notion — hover row → xuất hiện 3-4 nút action mờ ở cuối row (...).

→ **Huy Anh có** (eye + delete icon ở cột actions).

---

## 3. Patterns "best-in-class" để học theo

### A. Stripe — Minimalism dense
- Không có row coloring nào cả (only status pill)
- Mọi text 14px, mono cho số
- Filter chips ngang trên top
- Empty state lớn, friendly
- **Áp dụng được:** giảm row màu (Huy Anh đã làm Mức 1)

### B. Linear — Filter best-in-class
- Dropdown filter nhóm thành 4 cụm visual (separator)
- Filter chips hiển thị active inline với "+ Add filter" button
- Save view = command palette `Ctrl+S`
- **Áp dụng được:** filter chips active state (chưa làm)

### C. Pipedrive — Pipeline-first
- Kanban board là chế độ chính, không phải phụ
- Mỗi card có: tên, giá trị, owner, dynamic icon (rotting/won/lost)
- **Áp dụng được:** Huy Anh đã có Kanban, có thể nâng cấp card design

### D. SAP Fiori — Settings & save view
- Gear icon → modal lớn với tab "Columns / Sort / Filter / Group"
- Lưu view + share view với role
- **Áp dụng được:** Mức 4 (saved view per user)

### E. Shopify — Status tabs
- Tab với badge count + clear visual hierarchy
- Bulk action top sticky bar
- **Áp dụng được:** Huy Anh đã làm

---

## 4. So sánh Huy Anh sau Mức 1+2+3 vs benchmark

| Pattern | SAP | NetSuite | Odoo | Shopify | Stripe | Pipedrive | Linear | **Huy Anh** |
|---|---|---|---|---|---|---|---|---|
| Filter top bar | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **✅** |
| Filter chips active | ⚪ | ⚪ | ⚪ | ⚪ | ✅ | ⚪ | ✅ | ❌ |
| Saved views per user | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Column customizer | ✅ | ✅ | ⚪ | ✅ | ✅ | ⚪ | ✅ | **✅** |
| Bulk actions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **✅** |
| Status tabs with count | ⚪ | ⚪ | ✅ | ✅ | ⚪ | ✅ | ✅ | **✅** |
| View toggle (Table/Kanban) | ⚪ | ⚪ | ✅ | ⚪ | ⚪ | ✅ | ⚪ | **✅** |
| Inline edit cells | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | ✅ | **✅** |
| Density toggle | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | ✅ | ❌ |
| Row hover actions | ⚪ | ⚪ | ⚪ | ✅ | ✅ | ⚪ | ✅ | **✅** |
| Realtime collab | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | ✅ | ❌ |
| AI-assisted filter | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | ⚪ | ✅ | ❌ |

**Huy Anh được 7/12 patterns** = trên trung bình (SAP 6/12, Stripe 7/12, Linear 11/12).

---

## 5. Đề xuất Mức 4 — Còn thiếu vs benchmark

### M4-A: Filter chips active state (Linear/Stripe pattern)
Hiện filter chọn từ dropdown nhưng không hiện chip. Thêm row chip:

```
🔍 Lọc: [Trạng thái: Đang SX ✕]  [KH: Đồng Phú ✕]  [04/2026 ✕]   [+ Lọc thêm]  [Xóa tất cả]
```

Effort: 0.5 ngày.

### M4-B: Saved views per user (SAP/HubSpot pattern)
Dropdown "Views" cạnh status tabs:

```
[★ Tất cả] [⭐ Đơn quá hạn của tôi] [⭐ Đơn tháng này] [⭐ Khách EU] + Lưu view hiện tại
```

Lưu vào bảng `user_saved_views(user_id, name, filters_json, columns_json, sort_json)`.

Effort: 1 ngày.

### M4-C: Density toggle (Notion/Linear pattern)
Button ở góc table:

```
[≡ Compact] [≡ Normal] [≡ Comfortable]
```

Compact = font 11px, row 28px. Normal = 12px, 36px. Comfortable = 13px, 44px.

Effort: 2 giờ.

### M4-D: Empty state đẹp (Stripe pattern)
Khi filter ra 0 đơn, hiện illustration + CTA:

```
   📦 (illustration)
   Không tìm thấy đơn hàng nào
   Thử bỏ vài bộ lọc hoặc tạo đơn mới
   [Xóa filter]  [+ Tạo đơn]
```

Effort: 1 giờ.

### M4-E: Inline edit thêm cột (Notion pattern)
Hiện 4 cột inline. Thêm:
- Đơn giá (number input + ENTER lưu)
- Đặt cọc
- Ngân hàng (autocomplete dropdown)
- Trạng thái (status pill click → select dropdown)

Effort: 0.5 ngày.

### M4-F: Realtime collab (Linear pattern — nice-to-have)
Khi 2 user cùng xem list, mỗi user thấy avatar người khác đang ở row nào. Cần Supabase Realtime.

Effort: 2 ngày.

---

## 6. Khuyến nghị thứ tự nếu làm Mức 4

| Order | Item | Effort | Impact |
|---|---|---|---|
| 1 | **M4-A**: Filter chips active state | 0.5 ngày | ⭐⭐⭐ User thấy filter rõ ngay |
| 2 | **M4-C**: Density toggle | 2 giờ | ⭐⭐ Quick win |
| 3 | **M4-D**: Empty state đẹp | 1 giờ | ⭐⭐ Nhỏ nhưng nice |
| 4 | **M4-E**: Inline edit thêm | 0.5 ngày | ⭐⭐⭐ Update đơn nhanh hơn |
| 5 | **M4-B**: Saved views | 1 ngày | ⭐⭐⭐⭐ Mỗi role có view riêng |
| 6 | **M4-F**: Realtime collab | 2 ngày | ⭐ (nice-to-have) |

Tổng Mức 4 nếu làm hết: **~5 ngày**. Nếu chỉ làm 4 item đầu (top quick wins): **~1.5 ngày**.

---

## 7. Sources

- [Enterprise UX Design Guide 2026](https://fuselabcreative.com/enterprise-ux-design-guide-2026-best-practices/)
- [30+ List UI Design Examples](https://www.eleken.co/blog-posts/list-ui-design)
- [19+ Filter UI Examples for SaaS](https://www.eleken.co/blog-posts/filter-ux-and-ui-for-saas)
- [Order Management System UX Case Study (Medium)](https://medium.com/@urvashi_s/order-management-system-ux-case-study-f1a2f874161f)
- [SAP S/4HANA Fiori Manage Sales Orders (F1873)](https://fioriappslibrary.hana.ondemand.com/sap/fix/externalViewer/#/detail/Apps('F1814')/S24OP)
- [SAP Fiori Sales Order Apps Review (Mindset)](https://www.mindsetconsulting.com/product-review-sap-fiori-sales-order/)
- [Pipedrive vs HubSpot CRM 2026 (Spotsaas)](https://www.spotsaas.com/blog/pipedrive-vs-hubspot)
- [Pipedrive vs HubSpot (Zapier)](https://zapier.com/blog/pipedrive-vs-hubspot/)
- [Odoo 18 View Types](https://muchconsulting.com/blog/odoo-2/odoo-view-types-33)
- [Shopify Orders Dashboard](https://www.coupler.io/dashboard-examples/shopify-dashboard)
- [Sales Order Processing 2026 (Artsyl)](https://www.artsyltech.com/sales-order-processing)
- [Linear Design Reference (in repo)](docs/design-references/linear.app.md)
- [Stripe Design Reference (in repo)](docs/design-references/stripe.md)
- [Notion Design Reference (in repo)](docs/design-references/notion.md)
- [Pipedrive CRM UX Case Study (Rondesignlab)](https://rondesignlab.com/blog/work-in-progress/pipedrive-crm-sales-deal-management-mobile-app-ux-ui-design)
