# 🏗 FLOW Hợp Đồng Bán — Trạng thái hiện tại (2026-05-15)

> Tài liệu kỹ thuật mô tả toàn bộ workflow HĐ bán quốc tế của Huy Anh Rubber sau migration v9.
> Audience: BGĐ + dev team + reviewer mới.

---

## 👥 Actors (5 vai trò)

| Vai trò | Người cụ thể | Quyền chính |
|---|---|---|
| 🟢 **Sale** | Hồ Thị Liễu (`sales@huyanhrubber.com`) | Lên HĐ, submit, upload các loại files, gửi KH |
| 🟡 **Phú LV (Kiểm tra)** | Phú LV (`phulv@`) + Minh LD (`minhld@` giám sát ngầm) | Review, nhập bank, duyệt/trả lại |
| 🟠 **Trung/Huy (Signer)** | Lê Xuân Hồng Trung (`trunglxh@`) + Lê Văn Huy (`huylv@`) | Xác nhận đã duyệt / Trả lại Phú LV / In ký + upload FINAL |
| 🔴 **Admin/BGĐ** | Minh / Thúy / Huy / Trung | Toàn quyền (xóa FINAL, archive, override) |
| 👤 **KH** | Customer (offline) | Ký HĐ trên giấy, gửi lại bản scan |

---

## 🔄 State machine — 7 trạng thái

```
                   drafting
                       │ Sale submit
                       ▼
              ┌── reviewing ◀──────────────┐
              │       │                     │
              │       │                     │ (Trung/Huy "Trả lại Phú LV")
   ❌ Phú LV  │       │ ✅ Phú LV          │
     reject  │       │  approve            │
              ▼       ▼                     │
          rejected   approved ──────────────┘
              │       │
              │ Sale   │ Trung/Huy "Xác nhận đã duyệt"
              │ resubmit│ → signer_confirmed_at set
              │ INSERT │ (status vẫn approved)
              │ row    │
              │ rev+1  │ Bất kỳ ai in HĐ + ký + upload "HĐ HA đã ký" (file event)
              │       │ KH ký lại → upload "HĐ FINAL" + markSigned()
              │       ▼
              └─→ reviewing
                       │
                  signed
                       │ Admin "Lưu trữ"
                       ▼
                  archived (terminal)
                  
   cancelled (any → cancelled via "Hủy đơn" action)
```

### Allowed transitions (DB trigger `fn_soc_status_guard`)
- `drafting → reviewing`
- `reviewing → approved | rejected | drafting` (Sale rút lại)
- `rejected → drafting`
- `approved → signed | reviewing` (Trung/Huy trả lại)
- `signed → archived`
- `archived → (terminal)`

---

## 📋 Bảng đầy đủ — 9 actions + sự kiện

| # | Action | Caller | Service method | Status change | Notify | Audit log action |
|---|---|---|---|---|---|---|
| 1 | Sale submit | Sale | `createDraftAndSubmit()` | `drafting → reviewing` (INSERT row revision_no=1) | Phú LV + Minh | `submit` |
| 2 | Sale resubmit | Sale | `resubmitRevision()` = `createDraftAndSubmit()` | INSERT row revision_no+1 | Phú LV + Minh | `resubmit` |
| 3 | Phú LV duyệt | Phú/Minh | `approve()` | `reviewing → approved` | Trung/Huy + Sale | `approve` |
| 4 | Phú LV trả lại | Phú/Minh | `reject(reason)` | `reviewing → rejected` | Sale | `reject` |
| 5 | Trung/Huy xác nhận | Trung/Huy | `confirmReadyToSign()` | Không đổi (set `signer_confirmed_at`) | Sale + Phú LV | `signer_confirm` |
| 6 | Trung/Huy trả lại Phú LV | Trung/Huy | `sendBackToReview(reason)` | `approved → reviewing` (reset signer_confirmed, reviewed_at) | Phú LV + Minh | `send_back` |
| 7 | Đánh dấu FINAL (upload PDF KH ký) | Sale/admin | `markSigned(pdfUrl)` | `approved → signed` | Sale + Phú LV | `sign` |
| 8 | Lưu trữ | Admin | `archive()` | `signed → archived` | — | `archive` |
| 9 | Hủy đơn (toàn cục) | Sale/Admin | `salesOrderService.updateFields(status='cancelled')` | sales_order.status='cancelled' (KHÔNG đụng contract) | — | — |

---

## 📂 3 loại HĐ files (sales_order_documents.doc_sub_type)

| Sub-type | Folder UI | Khi nào upload | Permission upload | Permission xóa |
|---|---|---|---|---|
| `sent_to_customer` | 📤 HĐ gửi KH | Sale gửi drafts cho KH duyệt nội dung | Sale + admin + BGĐ | Sale + admin (replace allowed) |
| `ha_signed` | ✍️ HĐ HA đã ký (1 bên) | Sau Trung/Huy xác nhận → in ký HA | Mọi role (ai cũng in ký được) | Admin replace allowed |
| `final_signed` | ✅ HĐ FINAL (2 bên) | KH ký lại → gửi PDF FINAL | **Sale + admin + BGĐ** | **Chỉ admin emails (Minh/Thúy/Huy/Trung) — RLS** |

---

## 🔔 Notification channels (3 kênh song song)

Mỗi action workflow trigger 3 kênh:

| Channel | Service | Pattern | Real-time? |
|---|---|---|---|
| 🔔 Bell ERP | `createNotification` (notificationService) | INSERT vào `notifications` table | ✅ Yes |
| 📧 Email | `salesContractEmailService` → Edge Function `send-email` → Microsoft Graph API | Sender: `huyanhphongdien@huyanhrubber.com` | ⏱ ~1-2 phút delay |
| 💬 Chat đơn | DB trigger `fn_som_post_contract_status_change` | INSERT system message vào `sales_order_messages` | ✅ Yes |

---

## 📧 6 Email templates (mobile-first)

| Template | Sender → Recipient | Subject prefix |
|---|---|---|
| `contract_submitted` | Sale → Phú+Minh | 📤 HĐ mới {no} cần kiểm tra |
| `contract_resubmitted` | Sale → Phú+Minh | 🔄 HĐ {no} rev #N đã sửa |
| `contract_rejected` | Phú LV → Sale | ❌ HĐ {no} bị trả lại |
| `contract_approved_sign` | Phú LV → Trung+Huy | ✍️ HĐ {no} chờ ký |
| `contract_approved_info` | Phú LV → Sale | ✅ HĐ {no} đã được duyệt |
| `contract_signed` | Trung/Huy → Sale+Phú | 🎉 HĐ {no} đã ký — sẵn sàng |

Mobile UX: max-width 600px, font 14-16px, button ≥44px tap target, brand color #1B4D3E.

---

## 🗄 Database schema

### Tables chính

| Table | Mục đích |
|---|---|
| `sales_orders` | Đơn hàng bán quốc tế (master) |
| `sales_order_items` | Multi-item per order (grade × qty × price) |
| `sales_order_contracts` | Workflow HĐ — mỗi revision = 1 row |
| `sales_order_documents` | Files đính kèm (6 doc_type + sub_type cho contract) |
| `sales_order_messages` | Chat trao đổi + system messages |
| `sales_contract_access_log` | Audit trail — 13 action types |
| `sales_customers` | KH quốc tế |
| `employees` | Nhân viên (link user_id auth) |
| `notifications` | Bell notifications |
| `email_notifications` | Log email gửi ra |

### Quan hệ key

```
sales_orders (1) ──── (N) sales_order_contracts  ── status workflow
              │
              ├─── (N) sales_order_items
              ├─── (N) sales_order_documents     ── doc_type + doc_sub_type
              └─── (N) sales_order_messages      ── chat + system

sales_customers (1) ── (N) sales_orders
```

### sales_order_contracts columns (sau v9)

| Column | Type | Mô tả |
|---|---|---|
| id | uuid | PK |
| sales_order_id | uuid | FK |
| revision_no | int | Auto-increment per order |
| status | text | `drafting`/`reviewing`/`rejected`/`approved`/`signed`/`archived` |
| form_data | jsonb | Snapshot contract data (bank info nằm trong này) |
| signed_pdf_url | text | Path PDF FINAL (KH ký 2 bên) |
| created_by | uuid (employees.id) | Sale tạo |
| reviewer_id | uuid | Phú LV/Minh |
| reviewed_at | timestamptz | |
| review_notes | text | |
| signer_id | uuid | Trung/Huy |
| signed_at | timestamptz | |
| **signer_confirmed_at** | timestamptz | **v9 NEW** — Trung/Huy bấm "Xác nhận đã duyệt" |
| **signer_confirmed_by** | uuid | **v9 NEW** |
| rejected_at | timestamptz | Auto-set bởi DB trigger |
| rejected_reason | text | Bắt buộc khi reject (DB validate) |
| created_at / updated_at | timestamptz | |

---

## 🔒 RLS (Row Level Security)

| Bảng | Policy quan trọng |
|---|---|
| `sales_order_contracts` | `soc_update_allowed_reviewer` — chỉ Phú LV/Minh approve/reject. `soc_update_allowed_signer` — chỉ Trung/Huy markSigned |
| `sales_order_documents` | `sod_delete_final_admin_only` — chỉ 4 admin emails xóa được `doc_sub_type='final_signed'` |
| `sales_customers` | Public select cho user tham gia module Sales |

---

## 🚦 DB Triggers tự động

| Trigger | Bảng | Khi nào | Action |
|---|---|---|---|
| `trg_soc_set_revision_no` | sales_order_contracts | BEFORE INSERT | Auto-increment revision_no per sales_order |
| `trg_soc_touch_updated_at` | sales_order_contracts | BEFORE UPDATE | Set updated_at = NOW() |
| `trg_soc_status_guard` | sales_order_contracts | BEFORE UPDATE | Validate state transition, set rejected_at/reviewed_at |
| `trg_som_post_order_status_change` | sales_orders | AFTER UPDATE status | Post system message vào chat |
| `trg_som_post_contract_status_change` | sales_order_contracts | AFTER UPDATE status | Post system message vào chat |
| `trg_som_post_contract_new` | sales_order_contracts | AFTER INSERT | Post message "📤 Sale đã trình HĐ rev #N" |
| **v6** trigger | sales_order_contracts | AFTER UPDATE status='signed' | Auto-promote sales_orders.status `draft → confirmed` |

---

## 🔐 Bank info flow (CRITICAL)

```
Sale tạo HĐ Compose Studio
  • Preview với DEFAULT_BANK (Vietin Hue) — chỉ để xem
  • CẢNH BÁO banner: "Bản preview, KHÔNG gửi KH"
  • Sale KHÔNG có form input nhập bank

Sale submit → Phú LV
  • Phú LV mở Review → form bank với DEFAULT pre-filled
  • CHỌN 7 BANK PRESETS hoặc nhập tay 5 field
  • Validate đủ 5 field → approve được
  • form_data lưu bank info vào sales_order_contracts.form_data JSONB

Trung/Huy xem bank info READ-ONLY trước khi xác nhận
  • Nếu sai → bấm "Trả lại Phú LV" với reason
  • Nếu OK → "Xác nhận đã duyệt"

markSigned()
  • KHÔNG đụng form_data → bank info preserved
  • Status: approved → signed
```

### Block tải HĐ gửi KH khi bank chưa duyệt

- Status `drafting`/`reviewing`/`rejected` → nút "Tải SC/PI" block (banner đỏ warning)
- Admin có thể bypass với confirm modal (cảnh báo KHÔNG gửi KH)
- Status `approved`/`signed`/`archived` → tải bình thường

---

## 📊 Audit log — 13 event types

Tất cả workflow events + file actions log vào `sales_contract_access_log`:

**File events** (5):
- 📤 upload · 🔄 replace · 👁 view · 📥 download · 🗑 delete

**Workflow events** (8):
- 📨 submit · 🔁 resubmit · ✅ approve · ❌ reject
- 🖊 signer_confirm · 🔁 send_back · ✍️ sign · 📁 archive

Mỗi log row: `created_at + action + user_id + user_email + user_name + file_name (nếu có) + notes`.

UI: Tab Hợp đồng → nút "🕐 Lịch sử" → Modal Table 760px.

---

## 📁 7 migrations đã apply

| Migration | Mục đích | Trạng thái |
|---|---|---|
| `sales_contract_workflow.sql` (v1) | Schema base + state machine | ✅ |
| `sales_contract_workflow_v2_reviewers.sql` | Mở reviewer cho minhld | ✅ |
| `sales_contract_workflow_v3_signers.sql` | Trung/Huy signers | ✅ |
| `sales_contract_files_multi_v4.sql` | Multi-file + delete | ✅ |
| `sales_contract_workflow_v5_with_check.sql` | RLS hardening | ✅ |
| `sales_contract_workflow_v6_auto_promote.sql` | Trigger SO draft→confirmed khi signed | ✅ |
| `sales_order_files_categories_v7.sql` | 6 doc_type categories + chat messages | ✅ |
| `sales_order_files_subtype_v8.sql` | doc_sub_type (sent_to_customer + final_signed) | ✅ |
| **`sales_contract_workflow_v9_signer_confirm.sql`** | signer_confirmed_at/by + thêm `ha_signed` | ✅ (2026-05-15) |

---

## 🚨 Cut-over policy (Phương án A — applied 2026-05-14)

- **HĐ trước 2026-05-14**: KHÔNG dùng workflow mới — giữ `ContractFileSection` legacy (upload PDF scan)
- **HĐ tạo từ 2026-05-14 trở đi**: Bắt buộc qua workflow `sales_order_contracts`
- **`ContractTab.tsx` tự detect**: `hasWorkflow = listBySalesOrder().length > 0`
  - `true` → render `ContractWorkflowSection` + `ContractFileSection` (HĐ bổ sung)
  - `false` → render `ContractFileSection` legacy

---

## 🎯 Quick reference — Khi nào dùng menu nào

| Menu | Role | URL | Mục đích |
|---|---|---|---|
| Đơn hàng | All | `/sales/orders` | List + Split View |
| Tạo đơn mới | Sale + Admin | `/sales/orders/new` | Compose Studio |
| **Kiểm tra HĐ** | Phú LV + Minh | `/sales/contracts/review` | Queue review |
| **Ký HĐ** | Trung + Huy | `/sales/contracts/sign` | Queue ký |
| Kanban tiến độ | All Sales roles | `/sales/kanban` | 7 column stages |
| Khách hàng | Sale + Accounting + Admin | `/sales/customers` | CRUD KH |

---

## 📞 Liên hệ

- **Phòng IT**: `minhld@huyanhrubber.com`
- **BGĐ**: `trunglxh@`, `huylv@`, `thuyht@`
- **Kế toán bank info**: `phulv@`
