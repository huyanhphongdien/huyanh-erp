# B2B Thu Mua — Nâng cấp Multi-Lot + Hợp nhất Lý lịch mủ

> **Ngày tạo:** 03/04/2026
> **Yêu cầu từ:** Lê Văn Phú, Lê Xuân Hồng Trung
> **Phê duyệt:** Lê Duy Minh (IT/Phó phòng QLSX)
> **Trạng thái:** Phân tích xong — chờ phát triển

---

## 1. BỐI CẢNH & VẤN ĐỀ

### 1.1 Tình huống thực tế

Công ty đăng 1 Nhu cầu: **"Cần 50 tấn mủ, DRC 50-65%, giá 30-36k/kg"**

Đại lý P có **2 lô mủ** riêng biệt (mỗi lô có mã lý lịch riêng):

| | Lô 1 (LL-P-0401) | Lô 2 (LL-P-0402) |
|---|---|---|
| Loại mủ | Mủ đông | Mủ nước |
| DRC | 55% | 62% |
| Giá | 33,000 đ/kg | 36,000 đ/kg |
| Số lượng | 20 tấn | 15 tấn |
| Nguồn gốc | Vườn A, Bình Phước | Vườn B, Đồng Nai |

**Vấn đề 1:** Đại lý chỉ gửi được **1 báo giá** → mất lô còn lại.
**Vấn đề 2:** Lý lịch mủ (`rubber_intake_batches`) **tách rời** khỏi B2B thu mua → không truy xuất được.

### 1.2 Hệ thống hiện tại — 2 pipeline tách rời

```
PIPELINE A: B2B Thu mua (b2b_*)
  Nhu cầu → Chào giá → Deal → Stock-In → Batch kho
  ❌ Không có mã lô đại lý
  ❌ 1 booking = 1 deal (không multi-lot)

PIPELINE B: Lý lịch mủ (rubber_*)
  Nhà cung cấp mủ → rubber_intake_batches → Thanh toán
  ❌ Không liên kết Deal
  ❌ Không liên kết Stock-In / Batch kho
  ❌ Dùng bảng rubber_suppliers riêng (không phải b2b_partners)
```

**Mục tiêu:** Hợp nhất 2 pipeline thành **1 luồng duy nhất** trong module B2B Thu mua.

---

## 2. LUỒNG MỚI — THỐNG NHẤT

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         B2B THU MUA — LUỒNG MỚI                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ① NHU CẦU (NCM)          ② CHÀO GIÁ (OFFER)        ③ DEAL               │
│  ┌───────────────┐         ┌──────────────────┐       ┌───────────────┐    │
│  │ NCM-0401-001  │         │ Đại lý A:        │       │ DL2604-0012   │    │
│  │ 50T SVR10     │──pub──▶ │  Lô LL-A-01: 20T │──✅─▶│ Lô LL-A-01   │    │
│  │ DRC 50-65%    │         │  Lô LL-A-02: 15T │──✅─▶│ DL2604-0013   │    │
│  │ 30-36k/kg     │         │ Đại lý B:        │       │ Lô LL-A-02   │    │
│  └───────────────┘         │  Lô LL-B-01: 30T │──❌  └───────┬───────┘    │
│                             └──────────────────┘              │             │
│                                                                │             │
│  ④ PHIẾU CHỐT (BOOKING)   ⑤ GIAO HÀNG & CÂN        ⑥ NHẬP KHO & QC     │
│  ┌───────────────┐         ┌──────────────────┐       ┌───────────────┐    │
│  │ Chat: Phiếu   │         │ Cân xe (WB)      │       │ Stock-In      │    │
│  │ chốt mủ       │────────▶│ Cân vào/ra       │──────▶│ → Batch kho   │    │
│  │ lot: LL-A-01  │         │ lot: LL-A-01     │       │ NVL-MU-...-01 │    │
│  │ 20T, 33k/kg   │         │ Gross/Tare/Net   │       │ DRC thực tế   │    │
│  └───────────────┘         └──────────────────┘       │ QC check      │    │
│                                                        └───────┬───────┘    │
│                                                                │             │
│  ⑦ LÝ LỊCH MỦ (TRUY XUẤT)  ⑧ THANH TOÁN & CÔNG NỢ                       │
│  ┌───────────────┐           ┌──────────────────┐                           │
│  │ LL-A-01       │           │ Ledger: Đại lý A │                           │
│  │ Đại lý A      │           │ Deal DL2604-0012  │                           │
│  │ Nguồn: BP     │           │ 20T × 33k = 660M  │                           │
│  │ DRC gốc: 55%  │           │ Đã thanh toán: 0  │                           │
│  │ DRC nhập: 54% │           │ Còn nợ: 660M      │                           │
│  │ QC: Passed    │           └──────────────────┘                           │
│  │ Batch kho:    │                                                          │
│  │ NVL-MU-...-01 │                                                          │
│  └───────────────┘                                                          │
│                                                                             │
│  TRUY XUẤT NGƯỢC: Batch kho → Stock-In → Deal → Lô → Đại lý → Nguồn gốc  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. THAY ĐỔI DATABASE

### 3.1 Bảng `b2b_demand_offers` — Thêm thông tin lô

```sql
ALTER TABLE b2b_demand_offers
  ADD COLUMN IF NOT EXISTS lot_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS lot_description TEXT,
  ADD COLUMN IF NOT EXISTS lot_drc NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS lot_source VARCHAR(200);

CREATE INDEX IF NOT EXISTS idx_demand_offers_lot
  ON b2b_demand_offers(demand_id, partner_id, lot_code);
```

### 3.2 Bảng `b2b_deals` — Thêm liên kết lô + lý lịch mủ

```sql
ALTER TABLE b2b_deals
  ADD COLUMN IF NOT EXISTS lot_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS lot_description TEXT,
  ADD COLUMN IF NOT EXISTS rubber_intake_id UUID REFERENCES rubber_intake_batches(id),
  ADD COLUMN IF NOT EXISTS source_region VARCHAR(200);
```

### 3.3 Bảng `rubber_intake_batches` — Thêm liên kết ngược Deal + Partner

```sql
ALTER TABLE rubber_intake_batches
  ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES b2b_deals(id),
  ADD COLUMN IF NOT EXISTS b2b_partner_id UUID,
  ADD COLUMN IF NOT EXISTS lot_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS stock_in_id UUID;
```

### 3.4 Bảng `stock_batches` — Thêm lot_code gốc

```sql
ALTER TABLE stock_batches
  ADD COLUMN IF NOT EXISTS source_lot_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS rubber_intake_id UUID;
```

### 3.5 Booking metadata — Thêm lot_code

```
Không cần ALTER TABLE — booking là JSON metadata trong chat_messages.
Chỉ cần thêm field lot_code vào BookingMetadata interface.
```

---

## 4. THAY ĐỔI PHÍA ERP (erp.huyanhrubber.vn)

### 4.1 DemandDetailPage — Tab Chào giá (Group by Partner + Lot)

**File:** `src/pages/b2b/demands/DemandDetailPage.tsx`

```
┌─────────────────────────────────────────────────────────────┐
│ 📋 Chào giá (4 báo giá từ 2 đại lý)                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 🏢 Đại lý Nguyễn Văn A  (💎 Kim cương)  — 2 lô, 35T       │
│ ┌───────────────────────────────────────────────────────┐   │
│ │ Lô LL-A-01 │ Mủ đông, BP │ 20T │ DRC 55% │ 33k/kg  │   │
│ │            │              │     │         │ [✅] [❌] │   │
│ ├────────────┼──────────────┼─────┼─────────┼─────────┤   │
│ │ Lô LL-A-02 │ Mủ nước, ĐN │ 15T │ DRC 62% │ 36k/kg  │   │
│ │            │              │     │         │ [✅] [❌] │   │
│ └───────────────────────────────────────────────────────┘   │
│                                                             │
│ 🏢 Đại lý Trần Thị B  (🥇 Vàng)  — 1 lô, 30T             │
│ ┌───────────────────────────────────────────────────────┐   │
│ │ Lô LL-B-01 │ Mủ tạp, TN  │ 30T │ DRC 58% │ 34k/kg  │   │
│ │            │              │     │         │ [✅] [❌] │   │
│ └───────────────────────────────────────────────────────┘   │
│                                                             │
│ 📊 Tổng: 65T / 50T (130%) | 3 lô chờ duyệt               │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Accept Offer → Tạo Deal + Lý lịch mủ

Khi chấp nhận 1 lô:

```
acceptOffer(offerId):
  1. Tạo Deal (b2b_deals) — ghi lot_code, lot_description, source_region
  2. Tạo Lý lịch mủ (rubber_intake_batches) — ghi deal_id, b2b_partner_id, lot_code
  3. Cập nhật demand.quantity_filled_kg
  4. Gửi notification cho đại lý
```

### 4.3 Chat — Phiếu chốt mủ (Booking) thêm Lô

**File:** `src/pages/b2b/B2BChatRoomPage.tsx`

```
BookingMetadata {
  ...existing fields...
  lot_code: string        // ★ NEW: Mã lô
  lot_description: string // ★ NEW: Mô tả lô
  lot_source: string      // ★ NEW: Nguồn gốc
}
```

Khi confirm booking → tạo Deal có `lot_code` → tạo `rubber_intake_batch` tự động.

### 4.4 Lý lịch mủ — Chuyển vào B2B Thu mua

**Hiện tại:** Menu riêng "Lý lịch mủ" (WMS > rubber-intake)
**Mới:** Đưa vào **B2B Thu mua > Lý lịch mủ** trên Sidebar

Trang lý lịch mủ hiện:
- Liên kết với Deal (deal_id) — click để xem deal
- Liên kết với Partner (b2b_partner_id) — click để xem đại lý
- Liên kết với Stock-In (stock_in_id) — click để xem phiếu nhập kho
- Liên kết với Batch kho (qua stock_in) — xem DRC thực tế, QC

### 4.5 Sidebar — Thêm menu Lý lịch mủ vào B2B

**File:** `src/components/common/Sidebar.tsx`

```
B2B THU MUA
  ├── Dashboard
  ├── Chat đại lý
  ├── Nhu cầu
  ├── Đối tác
  ├── Deals
  ├── Lý lịch mủ        ★ MỚI (di chuyển từ WMS)
  ├── Công nợ
  ├── Quyết toán
  ├── Báo cáo
  └── Điểm nhận hàng
```

---

## 5. THAY ĐỔI PHÍA PORTAL ĐẠI LÝ (b2b.huyanhrubber.vn)

### 5.1 Trang Nhu cầu — Form báo giá Multi-lot

```
┌───────────────────────────────────────────────────────┐
│ 📋 Gửi báo giá: NCM-20260401-001                     │
│ "Cần 50 tấn SVR10, DRC 50-65%, giá 30-36k/kg"       │
│                                                       │
│ ┌── Lô 1 ──────────────────────────────────────── ✕ ┐│
│ │ Mã lô:      [LL-P-0401      ]                    ││
│ │ Loại mủ:    [Mủ đông     ▼]                      ││
│ │ Mô tả:      [Mủ đông vườn Bình Phước        ]   ││
│ │ Số lượng:   [20,000    ] kg                      ││
│ │ DRC:        [55    ] %                            ││
│ │ Giá:        [33,000    ] đ/kg                    ││
│ │ Nguồn gốc:  [Vườn A, Bình Phước          ]      ││
│ │ Ngày giao:  [15/04/2026]                          ││
│ └───────────────────────────────────────────────────┘│
│                                                       │
│ ┌── Lô 2 ──────────────────────────────────────── ✕ ┐│
│ │ Mã lô:      [LL-P-0402      ]                    ││
│ │ Loại mủ:    [Mủ nước     ▼]                      ││
│ │ Mô tả:      [Mủ nước vườn Đồng Nai          ]   ││
│ │ Số lượng:   [15,000    ] kg                      ││
│ │ DRC:        [62    ] %                            ││
│ │ Giá:        [36,000    ] đ/kg                    ││
│ │ Nguồn gốc:  [Vườn B, Đồng Nai            ]      ││
│ │ Ngày giao:  [20/04/2026]                          ││
│ └───────────────────────────────────────────────────┘│
│                                                       │
│ [+ Thêm lô khác]                                     │
│                                                       │
│ ┌─────────────────────────────────────────────────┐  │
│ │ Tổng: 2 lô | 35 tấn | Giá TB: 34,286 đ/kg     │  │
│ │ Giá trị ước tính: 1,200,000,000 đ              │  │
│ └─────────────────────────────────────────────────┘  │
│                                                       │
│                    [Gửi báo giá]                      │
└───────────────────────────────────────────────────────┘
```

### 5.2 Lịch sử báo giá — Nhóm theo lô

```
NCM-20260401-001: Cần 50T SVR10
  ├── Lô LL-P-0401: 20T, 33k  ✅ Chấp nhận → Deal DL2604-0012
  └── Lô LL-P-0402: 15T, 36k  ⏳ Đang chờ

NCM-20260328-003: Cần 30T mủ tạp
  └── Lô LL-P-0399: 30T, 28k  ❌ Từ chối (giá cao)
```

### 5.3 Trang Lý lịch mủ (cho đại lý xem)

Đại lý xem lý lịch các lô mủ đã giao:
```
┌───────────────────────────────────────────────────┐
│ 📦 Lý lịch mủ của bạn                             │
│                                                   │
│ LL-P-0401 | Mủ đông | Vườn A, BP                  │
│ Deal: DL2604-0012 | Giao: 15/04 | DRC gốc: 55%   │
│ Nhập kho: ✅ | DRC thực tế: 54% | QC: Passed      │
│ Thanh toán: 500M / 660M (75%)                     │
│                                                   │
│ LL-P-0402 | Mủ nước | Vườn B, ĐN                  │
│ Deal: DL2604-0013 | Giao: 20/04 | DRC gốc: 62%   │
│ Nhập kho: ⏳ Chờ giao                              │
└───────────────────────────────────────────────────┘
```

### 5.4 Thông báo cho đại lý

| Sự kiện | Thông báo |
|---------|----------|
| Lô được chấp nhận | "Lô LL-P-0401 (20T, 33k/kg) đã được chấp nhận! Deal DL2604-0012." |
| Lô bị từ chối | "Lô LL-P-0402 bị từ chối. Lý do: Giá cao hơn thị trường." |
| Hàng đã nhập kho | "Lô LL-P-0401 đã nhập kho. DRC thực tế: 54%. QC: Passed." |
| Thanh toán | "Đã thanh toán 500,000,000đ cho Deal DL2604-0012." |

---

## 6. TRUY XUẤT NGUỒN GỐC — CHUỖI LIÊN KẾT

```
Sản phẩm xuất kho (SVR10, batch TP-SVR10-260425-001)
  │
  ├── Lệnh sản xuất (PO-260420-001)
  │     └── Nguyên liệu: batch NVL-MU-260415-001
  │
  ├── Nhập kho (SI-260415-001)
  │     ├── deal_id: DL2604-0012
  │     └── source_lot_code: LL-P-0401
  │
  ├── Deal (DL2604-0012)
  │     ├── Đại lý: Nguyễn Văn A (💎)
  │     ├── lot_code: LL-P-0401
  │     ├── Nhu cầu: NCM-0401-001
  │     └── rubber_intake_id: → Lý lịch mủ
  │
  ├── Lý lịch mủ (rubber_intake_batches)
  │     ├── lot_code: LL-P-0401
  │     ├── Loại: Mủ đông
  │     ├── Nguồn: Vườn A, Bình Phước
  │     ├── DRC gốc: 55%
  │     ├── DRC nhập: 54%
  │     └── QC: Passed
  │
  └── Đại lý (b2b_partners)
        ├── Tên: Nguyễn Văn A
        ├── Tier: Diamond
        └── SĐT: 0909...
```

**Truy xuất ngược hoàn chỉnh:** Sản phẩm → Nguyên liệu → Nhập kho → Deal → Lô → Đại lý → Nguồn gốc vườn

---

## 7. DANH SÁCH FILE CẦN SỬA

### Database (Supabase)

| # | Bảng | Thay đổi |
|---|------|---------|
| 1 | `b2b_demand_offers` | +`lot_code`, +`lot_description`, +`lot_drc`, +`lot_source` |
| 2 | `b2b_deals` | +`lot_code`, +`lot_description`, +`rubber_intake_id`, +`source_region` |
| 3 | `rubber_intake_batches` | +`deal_id`, +`b2b_partner_id`, +`lot_code`, +`stock_in_id` |
| 4 | `stock_batches` | +`source_lot_code`, +`rubber_intake_id` |

### Phía ERP (erp.huyanhrubber.vn)

| # | File | Thay đổi |
|---|------|---------|
| 5 | `src/services/b2b/demandService.ts` | Interface + acceptOffer tạo rubber_intake_batch |
| 6 | `src/services/b2b/dealService.ts` | Thêm lot_code, link rubber_intake |
| 7 | `src/pages/b2b/demands/DemandDetailPage.tsx` | Group by partner, hiện lot, tổng hợp |
| 8 | `src/pages/b2b/B2BChatRoomPage.tsx` | Booking metadata thêm lot_code |
| 9 | `src/components/common/Sidebar.tsx` | Thêm "Lý lịch mủ" vào nhóm B2B THU MUA |
| 10 | `src/services/wms/stockInService.ts` | Khi tạo stock-in từ deal → ghi source_lot_code |
| 11 | `src/services/wms/traceabilityService.ts` | Mở rộng truy xuất: thêm lot + rubber_intake |

### Phía Portal Đại lý (b2b.huyanhrubber.vn)

| # | Trang | Thay đổi |
|---|-------|---------|
| 12 | Form báo giá | Multi-lot: thêm/xóa lô, mỗi lô có mã/DRC/giá/SL/nguồn |
| 13 | Lịch sử báo giá | Nhóm theo nhu cầu → từng lô + trạng thái + deal link |
| 14 | Lý lịch mủ (trang mới) | Đại lý xem lô đã giao: DRC thực, QC, thanh toán |
| 15 | Thông báo | Notification khi lô chấp nhận/từ chối/nhập kho/thanh toán |
| 16 | Dashboard | Widget: lô đang chờ, đã giao, công nợ |

---

## 8. ƯU TIÊN TRIỂN KHAI

### Phase 1 — Database + Backend (1 ngày)
- [ ] Migration: thêm cột vào 4 bảng
- [ ] Cập nhật interfaces TypeScript
- [ ] acceptOffer → tạo Deal + rubber_intake_batch liên kết
- [ ] Test end-to-end với Supabase

### Phase 2 — ERP Frontend (1.5 ngày)
- [ ] DemandDetailPage: group by partner + lot cards
- [ ] Booking trong chat thêm lot_code
- [ ] Sidebar: chuyển Lý lịch mủ vào B2B
- [ ] Trang Lý lịch mủ: hiện liên kết Deal + Stock-In + QC

### Phase 3 — Portal Đại lý (2 ngày)
- [ ] Multi-lot form báo giá
- [ ] Lịch sử báo giá nhóm theo lô
- [ ] Trang Lý lịch mủ cho đại lý
- [ ] Dashboard widget

### Phase 4 — Truy xuất & Tích hợp (1 ngày)
- [ ] Stock-In: ghi source_lot_code khi tạo từ deal
- [ ] Traceability: mở rộng chuỗi → lot + rubber_intake
- [ ] Notification cho đại lý: nhập kho, QC, thanh toán

**Tổng ước tính: 5.5 ngày phát triển**

---

## 9. BACKWARD COMPATIBILITY

| Yếu tố | Ảnh hưởng |
|--------|----------|
| Offer cũ (không có lot) | ✅ Hoạt động bình thường — lot_code = null |
| Deal cũ (không có lot) | ✅ Giữ nguyên — lot_code = null |
| Rubber intake cũ | ✅ Giữ nguyên — deal_id = null |
| Stock batch cũ | ✅ Giữ nguyên — source_lot_code = null |
| Chat booking cũ | ✅ Giữ nguyên — metadata không có lot_code |
| Truy xuất cũ | ✅ Vẫn hoạt động — chỉ thêm thông tin mới |

**100% backward compatible** — chỉ thêm, không sửa/xóa cấu trúc cũ.

---

## 10. SƠ ĐỒ QUAN HỆ SAU CẬP NHẬT

```
b2b_demands (Nhu cầu)
  │
  ├── 1:N ── b2b_demand_offers (Chào giá — có lot_code)
  │              │
  │              └── 1:1 ── b2b_deals (Deal — có lot_code)
  │                            │
  │                            ├── 1:1 ── rubber_intake_batches (Lý lịch mủ)
  │                            │              │
  │                            │              └── → b2b_partners (Đại lý)
  │                            │
  │                            ├── 1:N ── stock_in_orders (Nhập kho)
  │                            │              │
  │                            │              └── 1:N ── stock_batches (Batch kho)
  │                            │                           │
  │                            │                           └── → QC, DRC, Production
  │                            │
  │                            └── → b2b_ledger_entries (Công nợ)
  │
  └── → b2b_partners (Đại lý chào giá)
```

---

> **Tài liệu dùng để brief cho team ERP + team Portal đại lý.**
> Mọi thay đổi đều backward compatible — deploy bất kỳ lúc nào.
>
> Cập nhật: 03/04/2026 — Lê Duy Minh (IT/Phó phòng QLSX)
> Công ty TNHH MTV Cao su Huy Anh Phong Điền
