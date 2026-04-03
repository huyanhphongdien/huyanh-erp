# B2B THU MUA — Tổng quan Module & Luồng nghiệp vụ

> **Hệ thống:** Huy Anh ERP v8
> **Module:** B2B Thu mua mủ cao su
> **Portal đại lý:** b2b.huyanhrubber.vn
> **ERP nội bộ:** erp.huyanhrubber.vn
> **Cập nhật:** 03/04/2026

---

## 1. TỔNG QUAN

Module B2B Thu mua quản lý toàn bộ quy trình thu mua mủ cao su từ đại lý/NCC, từ lúc đặt nhu cầu đến khi thanh toán xong.

### Sidebar Menu (ERP)
```
B2B THU MUA
├── Dashboard           /b2b
├── Chat Đại lý         /b2b/chat              [badge: tin chưa đọc]
├── Nhu cầu mua         /b2b/demands
├── Đại lý              /b2b/partners
├── Deals               /b2b/deals
├── Lý lịch mủ          /b2b/rubber-intake
├── Công nợ             /b2b/ledger
├── Quyết toán          /b2b/settlements
├── Báo cáo công nợ     /b2b/reports
└── Địa điểm chốt hàng  /b2b/pickup-locations
```

### Phân quyền
Email-based: `khuyennt@`, `duyhh@`, `minhld@`, `trunglxh@` + Admin

---

## 2. LUỒNG NGHIỆP VỤ CHÍNH

### Luồng 1: Chat → Phiếu chốt → Deal (phổ biến nhất)

```
  ĐẠI LÝ (Portal)                    NHÀ MÁY (ERP)
  ──────────────                      ──────────────
  
  ① Gửi tin nhắn chat          ───▶  Nhận tin trong Chat Đại lý
                                      (split-screen: list trái + chat phải)
  
  ② Gửi Phiếu chốt mủ         ───▶  Nhận BookingCard trong chat
     (message_type = 'booking')       ┌─────────────────────────┐
     • Loại mủ: Mủ đông              │ 📋 Phiếu chốt mủ        │
     • SL: 20 tấn                     │ Mủ đông | 20T | DRC 55% │
     • DRC: 55%                       │ Giá: 33,000 đ/kg (tươi) │
     • Giá: 33k/kg                    │ Mã lô: LL-A-0401        │
     • Mã lô: LL-A-0401              │ [✅ Xác nhận] [💬 Thương │
     • Giao: 15/04                    │  lượng]  [❌ Từ chối]     │
                                      └─────────────────────────┘

  ③ (Nếu thương lượng)         ◀───  Đề xuất giá mới (counter_price)
     Đồng ý / từ chối                

  ④                                   ★ Xác nhận Deal (ConfirmDealModal)
                                      Tự động tạo:
                                      ├── Deal DL2604-XXXX (status: processing)
                                      ├── Tạm ứng TU2604-XXXX (nếu có)
                                      ├── Bút toán công nợ (ledger credit)
                                      ├── Lý lịch mủ (rubber_intake_batch)
                                      └── DealCard message trong chat

  ⑤ Nhận thông báo Deal        ◀───  Gửi DealCard message
     trong chat
```

### Luồng 2: Nhu cầu → Chào giá → Deal (cho nhiều đại lý)

```
  NHÀ MÁY                            NHIỀU ĐẠI LÝ
  ────────                            ────────────
  
  ① Tạo Nhu cầu (NCM)
     50T, DRC 50-65%
     Giá 30-36k/kg
     Hạn chào: 10/04
     │
     │ Publish
     ▼
  ② Đăng lên Portal          ───▶   Đại lý A, B, C xem nhu cầu

                               ◀───  ③ Đại lý gửi chào giá (multi-lot)
                                        Đại lý A:
                                        ├── Lô LL-A-01: 20T, DRC 55%, 33k
                                        └── Lô LL-A-02: 15T, DRC 62%, 36k
                                        Đại lý B:
                                        └── Lô LL-B-01: 30T, DRC 58%, 34k

  ④ Review chào giá
     (group by đại lý, hiện lô)
     │
     │ Accept / Reject từng lô
     ▼
  ⑤ Chấp nhận lô LL-A-01     ───▶   Đại lý A nhận thông báo
     Tự động tạo:
     ├── Deal DL2604-XXXX
     ├── Lý lịch mủ (lot_code, DRC, nguồn)
     └── Cập nhật NCM: filled 20T/50T
```

### Luồng 3: Deal → Nhập kho → QC → Quyết toán

```
  DEAL (processing)                   KHO / QC                    TÀI CHÍNH
  ─────────────                       ──────                      ─────────
  
  DL2604-0012                         
  Partner: Đại lý A                   
  20T, 33k/kg, DRC 55%               
  Lô: LL-A-01                        
  │                                   
  │ Xe chở hàng đến                   
  ▼                                   
  ① Cân xe (Weighbridge)     ───▶    Phiếu cân WB-XXXX
     Gross / Tare / Net               
  │                                   
  ▼                                   
  ② Nhập kho (Stock-In)      ───▶    Phiếu nhập SI-XXXX
     deal_id = DL2604-0012            ├── Batch NVL-MU-260415-001
     │                                │   DRC gốc: 54%
     │ Auto-update deal:              │   KL: 20,000 kg
     │ stock_in_count++               │
     │ actual_weight_kg               │
     ▼                                ▼
  ③ QC kiểm tra              ───▶    Batch QC:
     │                                ├── DRC thực tế: 54%
     │ Auto-update deal:              ├── QC status: Passed ✅
     │ actual_drc = 54%               └── Cập nhật latest_drc
     │ qc_status = 'passed'           
     │ final_value tính lại           
     ▼                                                            
  ④ Deal → accepted                                              ⑤ Tạo Quyết toán
                                                                     QT2604-XXXX
                                                                     ├── Gross: 20T × 33k = 660M
                                                                     ├── Trừ tạm ứng: -200M
                                                                     ├── Còn lại: 460M
                                                                     │
                                                                     │ Approve → Ledger DEBIT
                                                                     │ Pay    → Ledger CREDIT
                                                                     ▼
                                                                  ⑥ Thanh toán xong
                                                                     Deal → settled
                                                                     Công nợ = 0
```

---

## 3. CÁC MODULE LIÊN QUAN

### 3.1 Chat Đại lý (`/b2b/chat`)

| Thành phần | Mô tả |
|-----------|-------|
| **Layout** | Split-screen: list trái (340px) + chat phải |
| **Room types** | `general` (chat chung), `deal` (theo deal), `support` |
| **Message types** | text, image, file, audio, booking, deal, quotation, system |
| **Realtime** | Supabase subscription, auto-refresh khi tin mới |
| **Booking** | Phiếu chốt mủ có: loại mủ, SL, DRC, giá, mã lô, địa điểm |
| **Thương lượng** | Counter-price, negotiation notes |

### 3.2 Nhu cầu mua (`/b2b/demands`)

| Thành phần | Mô tả |
|-----------|-------|
| **Tạo NCM** | Wizard 2 bước: thông tin chung → chi tiết |
| **Loại** | `purchase` (mua đứt), `processing` (gia công) |
| **Specs** | product_type, quantity_kg, DRC min/max, price min/max |
| **Offer** | Đại lý chào giá multi-lot (lot_code, lot_drc, lot_source) |
| **Accept** | Tự động tạo Deal + Lý lịch mủ |
| **Status** | draft → published → partially_filled → filled → closed |

### 3.3 Đại lý (`/b2b/partners`)

| Thành phần | Mô tả |
|-----------|-------|
| **Tier** | new → bronze → silver → gold → diamond 💎 |
| **Status** | pending → verified / suspended / rejected |
| **Type** | dealer, supplier, both |
| **Stats** | Tổng deal, đang xử lý, tổng KL, tổng giá trị, tin chưa đọc |

### 3.4 Deals (`/b2b/deals`)

| Thành phần | Mô tả |
|-----------|-------|
| **Tạo từ** | Chat booking HOẶC Demand offer accept |
| **Status** | pending → processing → accepted → settled / cancelled |
| **Type** | purchase, sale, processing, consignment |
| **WMS tab** | Stock-in, batches, weighbridge, QC summary |
| **Lot** | lot_code, lot_description, rubber_intake_id |
| **Tài chính** | total_value_vnd, total_advanced, balance_due |

### 3.5 Lý lịch mủ (`/b2b/rubber-intake`)

| Thành phần | Mô tả |
|-----------|-------|
| **Tạo từ** | Tự động khi accept offer / confirm booking |
| **Liên kết** | deal_id → Deal, b2b_partner_id → Đại lý, stock_in_id → Nhập kho |
| **Lot** | lot_code, product_code, drc_percent, source (VN/Lào) |
| **Trạng thái** | draft → confirmed → settled |
| **Chi tiết** | Partner card, Deal link, DRC gauge, nhập kho & QC batches, thanh toán progress |

### 3.6 Công nợ (`/b2b/ledger`)

| Thành phần | Mô tả |
|-----------|-------|
| **Entry types** | settlement (nợ), advance (trả trước), payment (thanh toán), adjustment |
| **Debit** | Khi quyết toán approved → nhà máy nợ đại lý |
| **Credit** | Khi tạm ứng/thanh toán → giảm nợ |
| **Balance** | running_balance = total_debit - total_credit |
| **Aging** | 0-30, 31-60, 61-90, 90+ ngày |

### 3.7 Quyết toán (`/b2b/settlements`)

| Thành phần | Mô tả |
|-----------|-------|
| **Tạo** | Từ deal đã accepted, tính gross_amount |
| **Tạm ứng** | Link advance đã trả → trừ vào gross |
| **Status** | draft → pending → approved → paid / rejected / cancelled |
| **Ledger** | Approve → DEBIT, Pay → CREDIT |
| **Chat** | Tự động gửi thông báo vào chat khi status thay đổi |

### 3.8 Tạm ứng (Advance)

| Thành phần | Mô tả |
|-----------|-------|
| **Tạo từ** | Confirm booking trong chat (tự động) hoặc tạo tay |
| **Status** | pending → approved → paid / rejected |
| **Ledger** | Khi paid → tạo bút toán CREDIT |
| **Link** | Gắn vào settlement khi quyết toán |

---

## 4. SƠ ĐỒ QUAN HỆ DỮ LIỆU

```
b2b_partners ─────────────────────────────────────────────────────────┐
│ id, code, name, tier, status, partner_type                          │
├──── 1:N ── b2b_chat_rooms (partner_id)                              │
│               └── 1:N ── b2b_chat_messages (room_id)                │
│                            ├── booking metadata → tạo Deal          │
│                            └── deal metadata (DealCard)             │
│                                                                     │
├──── 1:N ── b2b_deals (partner_id)                                   │
│               ├── lot_code, lot_description, rubber_intake_id       │
│               ├── demand_id, offer_id, booking_id                   │
│               ├── actual_drc, actual_weight_kg, qc_status           │
│               │                                                     │
│               ├──── 1:N ── stock_in_orders (deal_id) ──── WMS      │
│               │               └── stock_in_details                  │
│               │                     └── stock_batches (QC, DRC)     │
│               │                                                     │
│               ├──── 1:1 ── rubber_intake_batches (deal_id)          │
│               │               lot_code, drc, source, weight         │
│               │                                                     │
│               ├──── 1:N ── b2b_advances (deal_id)                   │
│               │               amount, status, payment_date          │
│               │                                                     │
│               └──── 1:N ── b2b_settlements (deal_id)                │
│                               gross_amount, total_advance           │
│                               └── b2b_settlement_payments           │
│                                                                     │
├──── 1:N ── b2b_partner_ledger (partner_id)                          │
│               entry_type, debit, credit, running_balance            │
│                                                                     │
├──── 1:N ── b2b_demand_offers (partner_id)                           │
│               lot_code, lot_drc, offered_qty, offered_price         │
│               └── deal_id (khi accepted)                            │
│                                                                     │
└──── 1:N ── rubber_intake_batches (b2b_partner_id)                   │
                                                                      │
b2b_demands ──────────────────────────────────────────────────────────┘
│ id, code, demand_type, status, quantity_kg, quantity_filled_kg
└── 1:N ── b2b_demand_offers (demand_id)
              └── accepted → tạo Deal + Lý lịch mủ
```

---

## 5. TÍCH HỢP VỚI CÁC MODULE ERP KHÁC

### 5.1 WMS (Kho thành phẩm)

| Liên kết | Chi tiết |
|---------|---------|
| Deal → Stock-In | `stock_in_orders.deal_id` → khi nhập kho gắn deal |
| Stock-In → Batch | Tạo `stock_batches` với batch_no, DRC, QC |
| Deal WMS update | Auto-update deal: stock_in_count, actual_weight, actual_drc, qc_status |
| Weighbridge | Phiếu cân liên kết stock_in → deal |
| Chat notify | Gửi tin chat khi nhập kho xong, QC xong |

### 5.2 Trạm cân (Weighbridge)

| Liên kết | Chi tiết |
|---------|---------|
| Phiếu cân → Stock-In | `weighbridge_tickets.reference_id` |
| Gross/Tare/Net | Tính khối lượng thực nhận |

### 5.3 QC (Kiểm tra chất lượng)

| Liên kết | Chi tiết |
|---------|---------|
| Batch QC | `stock_batches.qc_status` (pending/passed/warning/failed) |
| DRC | `initial_drc` (lúc nhập) vs `latest_drc` (sau QC) |
| Deal update | `actual_drc` = weighted avg tất cả batches |
| Variance | Chênh lệch DRC gốc (expected) vs thực tế (actual) |

### 5.4 Sản xuất (Production)

| Liên kết | Chi tiết |
|---------|---------|
| NVL → Sản xuất | Batch NVL từ deal → dùng trong production_orders |
| Truy xuất | Sản phẩm → NVL → Stock-In → Deal → Đại lý → Nguồn gốc |

### 5.5 Thông báo (Notification)

| Sự kiện | Type | Tab |
|---------|------|-----|
| Tag trong bình luận dự án | `system_mention` | Hệ thống |
| Tag trong bình luận task | `task_mention` | Công việc |
| Chat tin mới | Realtime (không qua notification) | — |
| Nhập kho xong | System message trong chat | — |
| QC xong | System message trong chat | — |
| Quyết toán status | System message trong chat | — |

---

## 6. CÔNG NGHỆ & KIẾN TRÚC

| Thành phần | Công nghệ |
|-----------|----------|
| Frontend | React 18 + TypeScript + Vite |
| UI | Tailwind CSS (trang mới) + Ant Design (trang cũ) |
| State | React Query (TanStack) + Zustand (auth) |
| Backend | Supabase (PostgreSQL + Realtime + Storage + RLS) |
| Chat Realtime | Supabase Realtime subscriptions |
| File upload | Supabase Storage |
| Voice message | MediaRecorder API → Supabase Storage |
| Code splitting | React.lazy + Suspense (tất cả pages) |

### Database Schema
```
Schema public:
  b2b_partners, b2b_chat_rooms, b2b_chat_messages,
  b2b_demands, b2b_demand_offers,
  b2b_partner_ledger, b2b_settlements, b2b_settlement_items,
  b2b_settlement_advances, b2b_settlement_payments,
  b2b_advances,
  rubber_intake_batches, rubber_suppliers,
  stock_in_orders, stock_in_details, stock_batches,
  weighbridge_tickets

Schema b2b:
  deals (bảng gốc, có view public.b2b_deals)
```

---

## 7. TRẠNG THÁI CÁC ENTITY

### Deal
```
pending ──▶ processing ──▶ accepted ──▶ settled
   │                          │
   └──▶ cancelled             └──▶ cancelled
```

### Nhu cầu (Demand)
```
draft ──▶ published ──▶ partially_filled ──▶ filled ──▶ closed
   │                                                      │
   └──▶ cancelled ◀────────────────────────────────────────┘
```

### Chào giá (Offer)
```
pending ──▶ accepted (→ tạo Deal + Lý lịch mủ)
   │
   ├──▶ rejected (có lý do)
   └──▶ withdrawn (đại lý rút)
```

### Quyết toán (Settlement)
```
draft ──▶ pending ──▶ approved ──▶ paid
   │         │
   └──▶ cancelled   └──▶ rejected ──▶ draft (sửa lại)
```

### Tạm ứng (Advance)
```
pending ──▶ approved ──▶ paid
   │
   └──▶ rejected
```

### Lý lịch mủ (Rubber Intake)
```
draft ──▶ confirmed ──▶ settled
   │
   └──▶ cancelled
```

### Phiếu chốt mủ (Booking)
```
pending ──▶ confirmed (→ tạo Deal)
   │
   ├──▶ negotiating (counter-price)
   └──▶ rejected
```

---

## 8. TRUY XUẤT NGUỒN GỐC (TRACEABILITY)

```
Sản phẩm xuất kho
  │ batch: TP-SVR10-260425-001
  │
  ├── Lệnh sản xuất PO-260420-001
  │     └── NVL: batch NVL-MU-260415-001
  │
  ├── Nhập kho SI-260415-001
  │     └── deal_id: DL2604-0012
  │
  ├── Deal DL2604-0012
  │     ├── Đại lý: Nguyễn Văn A (💎 Diamond)
  │     ├── Mã lô: LL-A-0401
  │     ├── Nhu cầu: NCM-0401-001
  │     └── rubber_intake_id → Lý lịch mủ
  │
  ├── Lý lịch mủ
  │     ├── Lô: LL-A-0401
  │     ├── Loại: Mủ đông
  │     ├── Nguồn: Vườn A, Bình Phước
  │     ├── DRC gốc: 55% → DRC nhập: 54%
  │     └── QC: Passed ✅
  │
  └── Đại lý
        ├── Tên: Nguyễn Văn A
        ├── Tier: Diamond 💎
        └── Liên hệ: 0909-xxx-xxx
```

---

## 9. FILE CẤU TRÚC

### Services (`src/services/b2b/`)
```
├── chatRoomService.ts          Chat rooms CRUD + realtime
├── chatMessageService.ts       Messages + booking confirm
├── chatAttachmentService.ts    File uploads
├── dealService.ts              Deal CRUD + stats
├── dealWmsService.ts           Deal ↔ WMS (stock-in, batch, QC)
├── dealConfirmService.ts       Booking → Deal conversion
├── dealChatActionsService.ts   Chat actions for deals
├── dealProductionService.ts    Deal → Production
├── demandService.ts            Nhu cầu + offers + accept/reject
├── partnerService.ts           Đại lý CRUD + tier + stats
├── ledgerService.ts            Công nợ (debit/credit/balance)
├── settlementService.ts        Quyết toán (create → approve → pay)
├── advanceService.ts           Tạm ứng (create → approve → pay)
├── paymentService.ts           Settlement payments
├── autoSettlementService.ts    Auto settlement
├── drcVarianceService.ts       DRC chênh lệch
├── rubberIntakeB2BService.ts   Lý lịch mủ tích hợp B2B
└── b2bDashboardService.ts      Dashboard KPIs
```

### Pages (`src/pages/b2b/`)
```
├── B2BDashboardPage.tsx        Dashboard
├── B2BChatPage.tsx             Chat split-screen (list + room)
├── B2BChatListPage.tsx         Chat list (standalone, legacy)
├── B2BChatRoomPage.tsx         Chat room (embedded or standalone)
├── NotificationPage.tsx        Thông báo
├── PickupLocationSettingsPage.tsx  Địa điểm chốt hàng
├── deals/
│   ├── DealListPage.tsx
│   ├── DealCreatePage.tsx
│   └── DealDetailPage.tsx      Tabs: Overview, WMS, Production, QC, Advances
├── demands/
│   ├── DemandListPage.tsx
│   ├── DemandCreatePage.tsx
│   └── DemandDetailPage.tsx    Tabs: Info, Chào giá (offers), Deals liên kết
├── partners/
│   ├── PartnerListPage.tsx
│   └── PartnerDetailPage.tsx
├── ledger/
│   ├── LedgerOverviewPage.tsx  Tổng quan công nợ tất cả đại lý
│   └── PartnerLedgerPage.tsx   Sổ công nợ 1 đại lý
├── settlements/
│   ├── SettlementListPage.tsx
│   ├── SettlementCreatePage.tsx
│   └── SettlementDetailPage.tsx
├── reports/
│   └── LedgerReportPage.tsx    Báo cáo công nợ + aging
└── rubber-intake/
    ├── B2BRubberIntakePage.tsx      List + stats + filter
    └── B2BRubberIntakeDetailPage.tsx Detail + DRC + QC + payment
```

### Components (`src/components/b2b/`)
```
├── BookingFormModal.tsx         Form tạo phiếu chốt mủ (có lot_code)
├── ConfirmDealModal.tsx        Modal xác nhận deal từ booking
├── AddAdvanceModal.tsx         Modal tạo tạm ứng
├── RecordDeliveryModal.tsx     Modal ghi nhận giao hàng
├── NegotiateModal.tsx          Modal thương lượng giá
├── ChatAttachmentUpload.tsx    Upload file/ảnh trong chat
├── VoiceRecorder.tsx           Ghi âm tin nhắn thoại
├── DealCard.tsx                Card hiển thị deal trong chat
└── ...
```

---

## 10. TỔNG KẾT STATUS

| Module | Trạng thái | Ghi chú |
|--------|-----------|---------|
| Chat Đại lý | ✅ Production | Split-screen, booking, voice, file |
| Nhu cầu mua | ✅ Production | Multi-lot offer, auto-create deal |
| Đại lý | ✅ Production | CRUD, tier, stats |
| Deals | ✅ Production | Từ chat/demand, WMS integration |
| Lý lịch mủ | ✅ Production | Tích hợp B2B, auto-create từ deal |
| Công nợ | ✅ Production | Debit/credit, aging, balance |
| Quyết toán | ✅ Production | Draft → approve → pay, link advance |
| Tạm ứng | ✅ Production | Auto từ booking, link settlement |
| Dashboard | ✅ Production | KPIs, trends, top dealers |
| WMS tích hợp | ✅ Production | Stock-in, batch, QC, DRC |
| Truy xuất nguồn gốc | ⚠️ Partial | Deal → Stock-In OK, Rubber Intake chưa full |
| Portal Đại lý | 🔜 Riêng | b2b.huyanhrubber.vn (dự án khác) |

---

> **Tài liệu tổng quan Module B2B Thu mua — Huy Anh ERP v8**
> Công ty TNHH MTV Cao su Huy Anh Phong Điền
> Cập nhật: 03/04/2026
