# Weighbridge — Workflow IN/OUT & Module Linkages

**Ngày:** 2026-04-16
**Mục đích:** Định nghĩa luồng nghiệp vụ cân xe NHẬP và XUẤT, mối liên kết với các module liên quan, và scope điều chỉnh UI cho khớp thực tế.

---

## Tổng quan 2 luồng

```
┌─────────────────────────────────────────────────────────────────┐
│                    🚚 WEIGHBRIDGE (CÂN XE)                       │
│                  can.huyanhrubber.vn/weigh                       │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
          📥 NHẬP (IN)                   📤 XUẤT (OUT)
        Cân xe vào kho NVL              Cân xe xuất TP
              │                               │
              ▼                               ▼
```

### 📥 IN — Nhập NVL từ nông trại / nhà cung cấp

```
1. Chọn nguồn:
   ├─ Theo Deal B2B   → b2b_deals (purchase deal đang active)
   └─ Theo NCC (đại lý) → rubber_suppliers (nông trại trực tiếp)

2. Cân 2 lần:
   ├─ Lần 1 (Gross): xe + mủ
   ├─ Lần 2 (Tare):  xe rỗng (sau khi dỡ)
   └─ Net = Gross − Tare (− tạp chất)

3. Thông tin mủ:
   ├─ Loại mủ (mủ đông / mủ nước / mủ tạp / SVR)
   ├─ DRC kỳ vọng (%)
   ├─ Đơn giá (đ/kg ướt hoặc khô)
   ├─ Vị trí dỡ (bãi nào trong kho NVL)
   └─ Tạp chất (kg trừ)

4. Hoàn tất → Auto-sync (flag VITE_AUTO_WEIGHBRIDGE_SYNC=true):
   ├─ stockInService.createFromWeighbridgeTicket()
   ├─ Tạo stock_in_orders (status=confirmed)
   ├─ Tạo stock_batches (NVL, status=active)
   ├─ Tạo stock_in_details + inventory_transactions
   └─ updateDealStockInTotals (nếu link deal)
```

### 📤 OUT — Xuất TP đi xuất khẩu / bán nội địa

```
1. Chọn nguồn:
   ├─ Theo Sales Order → sales_orders (status=ready/packing)
   │  └─ Auto-load customer info từ sales_customers
   └─ (deferred) Theo Deal sale B2B → b2b_deals (sale)

2. Chọn container (trong SO đã chọn):
   ├─ sales_order_containers (status=planning/packing)
   ├─ Hiện: container_no, seal_no, container_type, bale_count
   └─ Có thể chọn 1 container OR cân toàn bộ SO

3. Cân 1 lần (gross loaded):
   ├─ Container có sẵn tare_weight_kg (nhập trước hoặc từ trip cũ)
   ├─ Cân gross = container + bales
   ├─ Net = gross - tare
   └─ Update sales_order_containers: gross_weight_kg, net_weight_kg

4. Thông tin xuất:
   ├─ Container number (auto từ SO)
   ├─ Seal number (nhập tại cảng)
   ├─ Cảng đích (auto từ SO.port_of_destination)
   ├─ Vessel name + booking ref (auto từ SO)
   └─ Ghi chú đặc biệt

5. Hoàn tất → Auto-sync (flag VITE_AUTO_WEIGHBRIDGE_OUT_SYNC=true):
   ├─ stockOutService.createDraftFromWeighbridgeTicketOut()
   ├─ Tạo stock_out_orders (status=draft)
   │  + Link sales_order_id (nếu có)
   ├─ User pick batches (từ allocation đã có cho SO)
   └─ Confirm → cập nhật:
      ├─ sales_order_containers.status='sealed'
      ├─ sales_order.status='shipped' (nếu hết container)
      └─ updateDealStockOutTotals (nếu link deal)
```

---

## Mối liên kết module

```
┌───────────────────────────────────────────────────────────────────┐
│                                                                   │
│   B2B DEALS              SALES ORDERS         RUBBER SUPPLIERS    │
│   (mua/bán)              (xuất khẩu)          (đại lý/nông trại)  │
│       │                       │                       │           │
│       │                       │                       │           │
│       └──────┐         ┌──────┴──────┐         ┌──────┘           │
│              │         │             │         │                   │
│              ▼         ▼             ▼         ▼                   │
│         ┌─────────────────┐    ┌──────────────────┐                │
│         │ WEIGHBRIDGE IN  │    │ WEIGHBRIDGE OUT  │                │
│         │ (cân nhập NVL)  │    │ (cân xuất TP)    │                │
│         └────────┬────────┘    └────────┬─────────┘                │
│                  │                      │                          │
│                  ▼                      ▼                          │
│         ┌──────────────┐       ┌────────────────┐                  │
│         │  STOCK-IN    │       │   STOCK-OUT    │                  │
│         │  (NVL kho)   │       │  (TP xuất kho) │                  │
│         └──────┬───────┘       └────────┬───────┘                  │
│                │                        │                          │
│                ▼                        ▼                          │
│         ┌──────────────────────────────────────┐                   │
│         │       STOCK_BATCHES (lô hàng)        │                   │
│         │  (NVL → SX → blend → TP → ship)      │                   │
│         └──────────────────────────────────────┘                   │
│                          │                                         │
│                          ▼                                         │
│         ┌──────────────────────────────────────┐                   │
│         │  PRODUCTION + BLENDING (chế biến)     │                   │
│         └──────────────────────────────────────┘                   │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### Liên kết cụ thể (FK + table)

| Module nguồn | Module đích | Cơ chế link |
|---|---|---|
| `weighbridge_tickets` (IN) | `stock_in_orders` | `notes` LIKE 'phiếu cân CX-...' (idempotent) + future: `stock_in_orders.weighbridge_ticket_id` |
| `weighbridge_tickets` (OUT) | `stock_out_orders` | `notes` LIKE 'phiếu cân CX-...' (idempotent) + future: `stock_out_orders.weighbridge_ticket_id` |
| `weighbridge_tickets` | `b2b_deals` (purchase) | `weighbridge_tickets.deal_id` |
| `weighbridge_tickets` | `rubber_suppliers` | `weighbridge_tickets.supplier_id` |
| `weighbridge_tickets` (OUT) | `sales_orders` | **CẦN THÊM:** `weighbridge_tickets.sales_order_id` |
| `weighbridge_tickets` (OUT) | `sales_order_containers` | **CẦN THÊM:** `weighbridge_tickets.container_id` |
| `stock_in_orders` | `b2b_deals` | `stock_in_orders.deal_id` → cập nhật `actual_weight_kg` |
| `stock_out_orders` | `b2b_deals` (sale) | `stock_out_orders.deal_id` → cập nhật `delivered_weight_kg` (S2 đã làm) |
| `stock_out_orders` | `sales_orders` | **CẦN THÊM:** `stock_out_orders.sales_order_id` → cập nhật shipped status |
| `sales_order_stock_allocations` | `stock_batches` | Đã có — assign batch cho SO/container |

---

## Gap hiện tại vs kế hoạch

### ✅ Đã làm

- IN flow: form đầy đủ (Deal/NCC, mủ info, 2 lần cân) — `WeighingPage.tsx`
- OUT flow toggle: 1 lần cân, ticket_type='out' — commit `b2ec8540`
- Auto-sync IN: flag VITE_AUTO_WEIGHBRIDGE_SYNC ✅ active
- Auto-sync OUT: flag VITE_AUTO_WEIGHBRIDGE_OUT_SYNC, code deployed
- Stock-out → Deal sale sync (S2): `delivered_weight_kg` + migration ✅ done

### ❌ Còn thiếu (cần làm tiếp)

**OUT form fields chưa khớp thực tế:**

| Field hiện tại (chung IN/OUT) | Đúng cho IN? | Đúng cho OUT? | Đề xuất OUT |
|---|---|---|---|
| Loại mủ (Mủ đông/nước/tạp/SVR) | ✅ | ❌ | **BỎ** — TP đã xác định trong batch |
| DRC kỳ vọng (%) | ✅ | ❌ | **BỎ** — DRC đã có trong batch QC |
| Đơn giá (đ/kg) | ✅ | ❌ | **BỎ** — giá nằm ở SO |
| Vị trí dỡ | ✅ | ❌ | **BỎ** — TP đã ở location khi pick |
| Tạp chất (kg) | ✅ | ❌ | **BỎ** — không relevant cho TP |
| Nguồn (Deal/NCC) | ✅ | ❌ | **THAY:** Sales Order picker |
| — | — | — | **THÊM:** Container picker (từ SO) |
| — | — | — | **THÊM:** Seal number input |
| — | — | — | **THÊM:** Cảng đích (auto từ SO) |
| — | — | — | **THÊM:** Vessel/Booking (auto từ SO) |

**Backend changes cần:**

1. Thêm column `weighbridge_tickets.sales_order_id` (UUID, FK → sales_orders)
2. Thêm column `weighbridge_tickets.container_id` (UUID, FK → sales_order_containers)
3. Thêm column `stock_out_orders.sales_order_id` (UUID, FK)
4. `salesOrderService.getActiveForShipping()` — list SO status=ready/packing cho dropdown
5. Update `createDraftFromWeighbridgeTicketOut`:
   - Đọc `ticket.sales_order_id` + `ticket.container_id`
   - Pre-link `stock_out_orders.sales_order_id`
   - Pre-fill `customer_name` từ SO
   - Update `sales_order_containers` (gross/net weight + status)

**Frontend changes cần:**

1. `WeighingPage.tsx` — refactor để conditional render fields theo `ticketDirection`:
   - IN: giữ nguyên (Deal/NCC + rubber info)
   - OUT: thay bằng SO picker + container picker + shipping info
2. `StockOutCreatePage.tsx` — add SO picker khi reason='sale' (similar pattern Deal picker)

---

## Workflow đề xuất cuối cùng

### IN — KHÔNG ĐỔI (đã ổn)

```
Operator → vào /weigh → toggle 📥 NHẬP
       → Chọn Deal HOẶC chọn NCC
       → Nhập biển số xe + tài xế
       → Nhập loại mủ + DRC kỳ vọng + đơn giá + vị trí dỡ + tạp chất
       → Tạo phiếu → Cân Gross → Cân Tare → Hoàn tất
       → Auto: tạo stock_in confirmed + batch active + inventory sync
       → Update deal.actual_weight_kg
```

### OUT — REFACTOR

```
Operator → vào /weigh → toggle 📤 XUẤT
       → Chọn Sales Order (status=ready/packing)
       → [Auto-load: customer_name, port_of_destination, vessel_name, total_bales]
       → Chọn container (từ SO's containers, status=planning/packing)
       → [Auto-load: container_no, seal_no, container_type, expected weight]
       → Nhập biển số xe + tài xế
       → Nhập seal_no thực tế (nếu khác kế hoạch)
       → Tạo phiếu → Cân 1 lần (gross loaded) → Hoàn tất
       → Auto:
          ├─ tạo stock_out draft + link sales_order_id + container_id
          ├─ update container.gross_weight_kg + net_weight_kg
          ├─ container.status='sealed'
          └─ Operator vào ERP → pick batches từ allocation → confirm
              ├─ batch.quantity_remaining giảm
              ├─ stock_levels giảm
              ├─ inventory_transactions log
              └─ sales_order.status='shipped' (nếu hết container)
```

---

## Roadmap implementation

| Bước | Việc | Effort | Priority |
|---|---|---|---|
| W1 | DB migration: thêm sales_order_id + container_id vào weighbridge_tickets + stock_out_orders | 30 min | 🔴 Blocker |
| W2 | salesOrderService.getActiveForShipping() | 15 min | 🔴 Blocker |
| W3 | WeighingPage refactor: conditional form fields theo direction | 2-3h | 🔴 Critical |
| W4 | createDraftFromWeighbridgeTicketOut: pre-link SO + container, pre-fill customer | 1h | 🔴 Critical |
| W5 | StockOutCreatePage: SO picker khi reason='sale' (thay/thêm Deal picker) | 1h | 🟡 |
| W6 | Container weight update: stock-out confirm → cập nhật container gross/net | 30 min | 🟡 |
| W7 | sales_order.status auto-transition → 'shipped' khi all container shipped | 1h | 🟡 |

**Tổng:** ~6-8h cho full integration weighbridge OUT ↔ sales orders.

---

## Decisions cần xác nhận từ user

1. **Mỗi container 1 phiếu cân hay nhiều container 1 phiếu?**
   - 1-1: Workflow rõ ràng, dễ track. Đề xuất.
   - N-1: Phức tạp, cần modal chọn nhiều container.

2. **Tare weight container lấy từ đâu?**
   - Option A: Nhập tay khi tạo container (sales_order_containers.tare_weight_kg)
   - Option B: Cân 2 lần (như IN — gross/tare/net) — bỏ "1 lần cân"
   - Option C: Tare cố định theo container_type (20ft = 2.3 tấn, 40ft = 3.8 tấn)

3. **Sales order có bắt buộc cho OUT không?**
   - Yes: 100% OUT đều có SO (chuẩn xuất khẩu)
   - No: cho phép OUT lẻ không SO (bán nội địa, chuyển kho, mẫu hàng)

4. **Stock-out auto-confirm hay luôn draft?**
   - Hiện tại OUT auto-create draft → user pick batch + confirm manual
   - Có thể auto-confirm nếu allocation đã set sẵn cho SO
