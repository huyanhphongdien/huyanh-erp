# Multi-Facility Warehouse Workflow — Huy Anh Rubber

**Ngày:** 2026-04-16
**Cập nhật:** 2026-04-16 — User trả lời 6/8 questions, scope chốt.
**Mô hình:** 1 ERP (huyanhrubber.vn) — 3 nhà máy (Phong Điền HQ + Tân Lâm + Lào) — 3 trạm cân riêng — tất cả write vào 1 Supabase central.

## TL;DR — User decisions

| Q | Quyết định |
|---|---|
| Hao hụt vận chuyển threshold | ✅ **0.5%** |
| Reverse transfer (PD → TL/Lào) | ✅ **Có hỗ trợ**, không thường xuyên — UI có flow nhưng không cần optimize/suggest |
| Network Lào | ✅ **Ổn định** — không cần PWA offline-first |
| Lệnh sản xuất chéo NM | ⏸ **Defer** — thuộc module Production, làm sau |
| Material catalog | ✅ **Dùng chung 3 NM** — 1 bảng materials, không tách |
| NCC (đại lý) | ✅ **Dùng chung 1 bảng** `rubber_suppliers` — đại lý có thể giao bất kỳ NM nào, weighbridge ticket gắn `supplier_id` + `facility_id` để track |
| Currency Lào | ⏳ Pending (default VND, có thể thêm LAK/USD sau) |
| Thứ tự rollout | ⏳ Pending (đề xuất F1 → F2 + Tân Lâm trước) |

---

## 1. Cấu trúc tổng thể

```
                   ☁️  ERP CENTRAL (huyanhrubber.vn)
                              │
              ┌───────────────┼───────────────┐
              │               │               │
       🏭 PHONG ĐIỀN     🏭 TÂN LÂM       🏭 LÀO
       (HQ — SX + XUẤT)  (SX vệ tinh)    (SX vệ tinh)
       │                 │                 │
       ├ KHO-NVL          ├ KHO-TL-NVL      ├ KHO-LAO-NVL
       ├ KHO-A (TP)       └ KHO-TL-TP       └ KHO-LAO-TP
       └ KHO-B (TP)       │                 │
       │                  │                 │
       └ ⚖ Trạm cân PD    └ ⚖ Trạm cân TL   └ ⚖ Trạm cân LÀO
         (đã có)            (sẽ cài đặt)     (sẽ cài đặt)
```

**Vai trò mỗi nhà máy:**

| Nhà máy | Vai trò | Inbound | Sản xuất | Outbound khách |
|---|---|---|---|---|
| **Phong Điền (HQ)** | Hub trung tâm | ✅ NVL địa phương | ✅ Full | ✅ **CHỈ ĐÂY** xuất khẩu |
| **Tân Lâm** | Vệ tinh sản xuất | ✅ NVL địa phương | ✅ Full | ❌ — chỉ chuyển về PD |
| **Lào** | Vệ tinh sản xuất | ✅ NVL Lào | ✅ Full | ❌ — chỉ chuyển về PD |

---

## 2. Quy trình tổng thể (high-level)

```
┌────────────────────────────────────────────────────────────────────────┐
│                                                                        │
│   🌾 NÔNG TRẠI/NCC                  🌾 NCC ĐỊA PHƯƠNG TL/LÀO            │
│         │                                  │                           │
│         ▼                                  ▼                           │
│   ⚖ Cân tại trạm                   ⚖ Cân tại trạm TL/LÀO                │
│         │                                  │                           │
│         ▼                                  ▼                           │
│   📦 KHO-NVL Phong Điền            📦 KHO-NVL Tân Lâm/Lào                │
│         │                                  │                           │
│         ▼                                  ▼                           │
│   🏭 SX tại Phong Điền             🏭 SX tại Tân Lâm/Lào                 │
│         │                                  │                           │
│         ▼                                  ▼                           │
│   📦 KHO-A/B Phong Điền  ◀───── 🔀 TRANSFER ───── 📦 KHO-TL/LAO TP        │
│         │                  (chuyển TP về HQ)                           │
│         ▼                                                              │
│   🚚 XUẤT cho Sales Order (chỉ từ Phong Điền)                           │
│         │                                                              │
│         ▼                                                              │
│   🚢 Container ship đi cảng Đà Nẵng → khách quốc tế                     │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

**Key insight:** TP từ 3 nhà máy đều chảy về **Phong Điền** để consolidate trước khi xuất khẩu. Tân Lâm + Lào hoạt động như "supplier nội bộ" cho Phong Điền.

---

## 3. Quy trình chi tiết theo nghiệp vụ

### 3.1. Inbound — Nhập NVL (mỗi nhà máy)

```
Mỗi nhà máy độc lập, không khác nhau (đã chuẩn hoá ở Phong Điền):

🚚 Xe NVL đến NM X
   ↓
⚖ Cân tại trạm X (subdomain riêng):
   • can.huyanhrubber.vn (Phong Điền)
   • can-tl.huyanhrubber.vn (Tân Lâm)
   • can-lao.huyanhrubber.vn (Lào)
   ↓
🌐 Auto-sync → ERP central
   • weighbridge_tickets.facility_id = X
   • Stock-in tự động vào KHO-X-NVL
   ↓
🔬 QC tại NM X (DRC, tạp chất)
   ↓
✅ Batch active trong KHO-X-NVL
```

**Đặc điểm:** Hoàn toàn local — NVL nhập NM nào thì vào kho NM đó. Không có cross-facility ở bước này.

---

### 3.2. Sản xuất — Mỗi nhà máy độc lập

```
🏭 NM X có lệnh sản xuất:
   ↓
📦 Pick NVL từ KHO-X-NVL (chỉ kho local)
   ↓
🏭 Dây chuyền SX của NM X
   ↓
📦 Output TP vào KHO-X-TP (kho TP local)
   ↓
🔬 QC TP tại NM X
   ↓
✅ Batch TP sẵn sàng
   • Phong Điền → có thể ship trực tiếp
   • Tân Lâm/Lào → chờ TRANSFER về Phong Điền
```

**Đặc điểm:** Lệnh sản xuất gắn `facility_id`. Mỗi NM tự quản lý dây chuyền, không pick NVL chéo.

---

### 3.3. 🔀 TRANSFER — Chuyển TP từ vệ tinh về Phong Điền (CORE FLOW)

Đây là **luồng quan trọng nhất** vì là cách duy nhất đưa hàng từ Tân Lâm/Lào về Phong Điền để xuất khẩu.

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   📋 BƯỚC 1: TẠO PHIẾU TRANSFER                                      │
│   ─────────────────────────────                                     │
│   Quản lý NM Tân Lâm tạo phiếu xuất:                                 │
│     reason = 'transfer'                                             │
│     destination_facility_id = Phong Điền                            │
│     destination_warehouse_id = KHO-A hoặc KHO-B                     │
│     items = [batches RSS3 cần chuyển]                               │
│                                                                     │
│           ↓                                                         │
│                                                                     │
│   ⚖ BƯỚC 2: CÂN XUẤT TẠI NM GỬI (Tân Lâm)                            │
│   ─────────────────────────────                                     │
│   Xe đến trạm cân Tân Lâm (can-tl.huyanhrubber.vn)                   │
│   • Toggle XUẤT → chọn "Transfer Phong Điền"                        │
│   • Cân gross + tare → net = X kg                                   │
│   • Hoàn tất → status='in_transit'                                  │
│                                                                     │
│           ↓                                                         │
│                                                                     │
│   💾 BƯỚC 3: HÀNG ĐANG VẬN CHUYỂN (in_transit)                       │
│   ─────────────────────────────                                     │
│   • Trừ KHO-TL-TP                                                   │
│   • CHƯA cộng vào KHO-A Phong Điền                                  │
│   • Hiện trong section "🚛 Hàng đang vận chuyển" (cấp công ty)       │
│   • Track GPS xe (optional) hoặc estimated arrival                  │
│                                                                     │
│           ↓                                                         │
│                                                                     │
│   ⚖ BƯỚC 4: CÂN NHẬN TẠI PHONG ĐIỀN (đối soát hao hụt)               │
│   ─────────────────────────────                                     │
│   Xe đến trạm cân Phong Điền sau N giờ                              │
│   • Toggle NHẬP → chọn "Nhận transfer từ Tân Lâm"                   │
│   • Cân gross + tare → net = Y kg                                   │
│   • Hệ thống tính: hao hụt = X - Y kg                               │
│   • Nếu hao hụt < 0.5% → auto-confirm                               │
│   • Nếu hao hụt > 0.5% → cảnh báo, cần BGD duyệt                    │
│                                                                     │
│           ↓                                                         │
│                                                                     │
│   ✅ BƯỚC 5: HOÀN TẤT TRANSFER                                       │
│   ─────────────────────────────                                     │
│   • Cộng Y kg vào KHO-A Phong Điền                                  │
│   • Status phiếu = 'received'                                       │
│   • Log hao hụt vào báo cáo                                         │
│   • Batch RSS3 giờ thuộc Phong Điền, sẵn sàng ship                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**State machine của transfer:**

```
draft → picking → picked → in_transit → arrived → received
                       ↘                       ↘
                    cancelled              rejected (hao hụt cao)
```

---

### 3.4. Outbound — Xuất hàng cho Sales Order (CHỈ Phong Điền)

```
📋 BGD tạo Sales Order tại HQ
   • ship_from_facility = Phong Điền (mặc định, không thay đổi)
   • Container packing tại KHO-A hoặc KHO-B
   ↓
📦 Allocate batches (TỰ DO chọn batch trong KHO-A/B Phong Điền,
   bao gồm cả batch chuyển từ Tân Lâm/Lào)
   ↓
🚚 Container đến NM Phong Điền
   ↓
⚖ Cân OUT tại trạm Phong Điền (can.huyanhrubber.vn)
   • Chọn SO + container → cân 1 lần → Hoàn tất
   ↓
✅ Auto-confirm: stock-out + container sealed + SO shipped
   ↓
🚢 Container ship đi cảng Đà Nẵng
```

**Quan trọng:** Trạm cân Tân Lâm/Lào KHÔNG có Sales Order trong dropdown — chỉ có "Transfer to Phong Điền" cho XUẤT. Nếu muốn ship trực tiếp từ NM khác trong tương lai, đổi flag `facilities.can_ship_to_customer=true`.

---

## 4. 🧠 Optimization — Smart Transfer Suggestions

Vì Tân Lâm/Lào phải chuyển hàng về Phong Điền, hệ thống cần **gợi ý chuyển khi nào, bao nhiêu** để tối ưu chi phí vận chuyển + đảm bảo Phong Điền luôn đủ hàng cho SO sắp ship.

### Algorithm gợi ý:

```python
mỗi đêm cron job chạy:
  1. Lấy tất cả SO status IN ('confirmed', 'producing', 'ready') chưa ship
  2. Tính demand_kg_by_grade tại Phong Điền cho 30 ngày tới
  3. Tính supply_kg_by_grade hiện có tại Phong Điền (KHO-A + KHO-B)
  4. Tính gap = demand - supply
  5. Nếu gap > 0:
     → Tìm tồn kho tại Tân Lâm/Lào (KHO-TL-TP, KHO-LAO-TP) match grade
     → Suggest transfer: "NM X có Y kiện RSS3, cần transfer Z kiện về Phong Điền trong N ngày"
  6. Tính cost-benefit:
     • Distance: TL gần hơn LÀO → ưu tiên TL nếu đủ
     • Volume: gộp nhiều grade trong 1 chuyến để full container
     • Aging: ưu tiên transfer batch lưu lâu trước (FIFO)
```

### UI gợi ý — Dashboard "Transfer Planning"

```
┌──────────────────────────────────────────────────────────────────┐
│  🚛 GỢI Ý CHUYỂN HÀNG VỀ PHONG ĐIỀN — Tuần 16/04 - 22/04         │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  📦 RSS_3 — Phong Điền cần 800 kiện cho SO sắp ship              │
│     Hiện có: 350 kiện. Gap: 450 kiện                             │
│     ┌────────────────────────────────────────────────────────┐   │
│     │ Nguồn         │ Tồn       │ Gợi ý chuyển │ Tuổi kho   │   │
│     │ Tân Lâm       │ 280 kiện  │ ✅ 280 kiện  │ 25 ngày    │   │
│     │ Lào           │ 200 kiện  │ ✅ 170 kiện  │ 40 ngày    │   │
│     └────────────────────────────────────────────────────────┘   │
│     Tổng có thể fill: 450/450 ✅                                 │
│     [+ Tạo phiếu transfer Tân Lâm]  [+ Tạo phiếu transfer Lào]   │
│                                                                  │
│  📦 SVR_10 — Phong Điền dư 120 bành, không cần transfer          │
│                                                                  │
│  📦 SVR_3L — Cần 200 bành, NM khác không có                      │
│     ⚠️ Phải đợi sản xuất tại Phong Điền                          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. Dashboard cross-facility cho BGD

```
┌────────────────────────────────────────────────────────────────────┐
│  📊 TỔNG QUAN KHO TOÀN CÔNG TY — 16/04/2026                         │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────┬─────────┬─────────┬─────────┬─────────────────┐  │
│  │ Grade        │ Phong Đ │ Tân Lâm │  Lào    │ 🚛 In transit   │  │
│  ├──────────────┼─────────┼─────────┼─────────┼─────────────────┤  │
│  │ NVL          │ 125T    │ 80T     │ 45T     │ 0               │  │
│  │ TP-RSS3      │ 350     │ 280     │ 200     │ 30 (TL→PD)      │  │
│  │ TP-SVR10     │ 200     │ 180     │ 90      │ 0               │  │
│  │ TP-SVR3L     │ 100     │ 0       │ 0       │ 0               │  │
│  └──────────────┴─────────┴─────────┴─────────┴─────────────────┘  │
│                                                                    │
│  ⚠️ Cảnh báo (3):                                                  │
│  • Phong Điền hết SVR_3L cho SO-2026-0055 ship 20/04               │
│  • Lào tồn RSS3 > 40 ngày → ưu tiên transfer                       │
│  • Tân Lâm hết NVL — đã có 5 xe đăng ký giao 17/04                 │
│                                                                    │
│  📈 Hôm nay (16/04):                                               │
│  • 8 phiếu cân (PD: 5, TL: 2, LÀO: 1)                              │
│  • 2 transfer hoàn tất (TL→PD: 280 kiện RSS3)                      │
│  • 1 container ship đi (XK-PD-TP-... cho Coelsin)                  │
│  • Hao hụt vận chuyển: 0.3% (trong ngưỡng)                         │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## 6. Phân quyền (RBAC theo facility)

| Vai trò | PD | TL | Lào | Có thể làm |
|---|---|---|---|---|
| **BGD / Giám đốc** | Full | Full | Full | Mọi thứ + duyệt SO + duyệt transfer |
| **Kế toán** | Read | Read | Read | Báo cáo + audit, không chỉnh sửa |
| **Quản lý NM Phong Điền** | Full | Read | Read | CRUD NM mình + xem các NM khác |
| **Quản lý NM Tân Lâm** | Read | Full | — | Tương tự, KHÔNG thấy Lào |
| **Quản lý NM Lào** | Read | — | Full | Tương tự, KHÔNG thấy Tân Lâm |
| **NV kho Phong Điền** | Kho mình | — | — | Nhập/xuất/QC trong kho được gán |
| **NV cân Phong Điền** | (qua subdomain riêng) | | | Chỉ tạo phiếu cân, không chỉnh sửa khác |

→ Quản lý NM Tân Lâm khi xin transfer từ Phong Điền sẽ thấy được tồn Phong Điền (read-only) để biết xin được hay không.

---

## 7. Schema thay đổi

### Bảng mới
```sql
CREATE TABLE facilities (
  id UUID PRIMARY KEY,
  code VARCHAR UNIQUE,         -- 'PD', 'TL', 'LAO'
  name VARCHAR,                -- 'Phong Điền (HQ)', 'Tân Lâm', 'Lào'
  address TEXT,
  region VARCHAR,              -- 'Huế', 'Quảng Trị', 'Lào'
  country VARCHAR DEFAULT 'VN',
  manager_employee_id UUID,
  phone VARCHAR,
  gps_lat NUMERIC, gps_lng NUMERIC,
  timezone VARCHAR DEFAULT 'Asia/Ho_Chi_Minh',
  can_ship_to_customer BOOLEAN DEFAULT false,  -- chỉ PD = true
  weighbridge_subdomain VARCHAR,  -- 'can.huyanhrubber.vn'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ
);
```

### Bảng cần thêm column
```sql
ALTER TABLE warehouses ADD COLUMN facility_id UUID REFERENCES facilities(id);
ALTER TABLE weighbridge_tickets ADD COLUMN facility_id UUID REFERENCES facilities(id);
ALTER TABLE production_orders ADD COLUMN facility_id UUID REFERENCES facilities(id);
ALTER TABLE rubber_intake_batches ADD COLUMN facility_id UUID REFERENCES facilities(id);

-- Stock-out đã có deal_id/sales_order_id, transfer cần thêm:
ALTER TABLE stock_out_orders ADD COLUMN destination_facility_id UUID REFERENCES facilities(id);
ALTER TABLE stock_out_orders ADD COLUMN destination_warehouse_id UUID REFERENCES warehouses(id);
ALTER TABLE stock_out_orders ADD COLUMN transit_status VARCHAR;
  -- 'departed', 'in_transit', 'arrived', 'received', 'rejected'

-- Stock-in cần biết origin nếu là transfer:
ALTER TABLE stock_in_orders ADD COLUMN origin_facility_id UUID REFERENCES facilities(id);
ALTER TABLE stock_in_orders ADD COLUMN origin_stock_out_id UUID REFERENCES stock_out_orders(id);

-- Sales order
ALTER TABLE sales_orders ADD COLUMN ship_from_facility_id UUID REFERENCES facilities(id);
  -- Mặc định = Phong Điền cho mọi SO mới
```

### Backfill data cũ
```sql
-- Tạo 3 facilities
INSERT INTO facilities (code, name, can_ship_to_customer, weighbridge_subdomain) VALUES
  ('PD', 'Phong Điền (HQ)', true, 'can.huyanhrubber.vn'),
  ('TL', 'Tân Lâm', false, 'can-tl.huyanhrubber.vn'),
  ('LAO', 'Lào', false, 'can-lao.huyanhrubber.vn');

-- Gán tất cả warehouse hiện có vào Phong Điền (assumption)
UPDATE warehouses SET facility_id = (SELECT id FROM facilities WHERE code='PD');

-- Tạo 4 kho mới cho TL + LAO
INSERT INTO warehouses (code, name, type, facility_id, is_active) VALUES
  ('KHO-TL-NVL', 'Kho NVL Tân Lâm', 'raw', (SELECT id FROM facilities WHERE code='TL'), true),
  ('KHO-TL-TP', 'Kho TP Tân Lâm', 'finished', (SELECT id FROM facilities WHERE code='TL'), true),
  ('KHO-LAO-NVL', 'Kho NVL Lào', 'raw', (SELECT id FROM facilities WHERE code='LAO'), true),
  ('KHO-LAO-TP', 'Kho TP Lào', 'finished', (SELECT id FROM facilities WHERE code='LAO'), true);

-- Tất cả ticket cũ + production cũ + stock-in/out cũ → Phong Điền
UPDATE weighbridge_tickets SET facility_id = (SELECT id FROM facilities WHERE code='PD');
UPDATE production_orders SET facility_id = (SELECT id FROM facilities WHERE code='PD');
UPDATE sales_orders SET ship_from_facility_id = (SELECT id FROM facilities WHERE code='PD');
```

---

## 8. Roadmap implementation

### Phase F1 — Foundation (4-6h, no breaking changes)
- [ ] Migration: tạo `facilities` table + thêm `facility_id` vào các bảng liên quan
- [ ] Backfill: 3 facilities + 4 kho mới (TL/LAO) + gán data cũ về PD
- [ ] FacilityPicker shared component (giống WarehousePicker)
- [ ] Dropdown chọn facility ở header sidebar (cho user multi-facility)
- [ ] RLS policies update theo facility_id (nếu cần per-NM access control)

### Phase F2 — Inbound + Production multi-facility (4-6h)
- [ ] Stock-in form: thêm warehouse picker filter theo facility user đang chọn
- [ ] Production order: thêm facility_id selector
- [ ] Weighbridge sub-app: clone 2 bản (TL + LAO) với env `VITE_FACILITY_CODE`
- [ ] Sub-app gán `facility_id` tự động khi create ticket dựa vào env

### Phase F3 — Inter-facility Transfer (CORE — 6-8h)
- [ ] Stock-out reason='transfer': thêm UI chọn destination_facility + destination_warehouse
- [ ] State machine `transit_status` với 5 trạng thái
- [ ] "Hàng đang vận chuyển" view ở dashboard cấp công ty
- [ ] Receive workflow: cân ở NM nhận → đối soát hao hụt → confirm tạo stock-in tự động link `origin_stock_out_id`
- [ ] Hao hụt threshold config + alert

### Phase F4 — Smart Transfer Planning (4-6h)
- [ ] Cron job/scheduled function: tính gap demand vs supply mỗi đêm
- [ ] Dashboard "Transfer Planning" với suggestions
- [ ] One-click "Tạo phiếu transfer từ gợi ý"
- [ ] FIFO batch selection across facilities

### Phase F5 — Cross-facility Reports & Polish (3-4h)
- [ ] Pivot table tồn kho 3 facilities
- [ ] So sánh KPI per facility (turnover, hao hụt, picking accuracy)
- [ ] Inter-facility transfer log + analytics
- [ ] Facility-aware permissions UI (admin gán user vào facility)

**Tổng:** ~21-30h cho hệ thống multi-facility production-ready.

---

## 9. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Migration data cũ sai facility | High — phải rollback | Backup trước migration, test trên staging trước |
| Trạm cân TL/LÀO mất internet | Critical — không cân được | PWA offline-first cho 2 sub-app này, sync sau khi có mạng |
| Hao hụt vận chuyển bất thường | Medium — gian lận hoặc sai cân | Threshold alert + duyệt BGD nếu > 0.5% |
| User Tân Lâm vô tình tạo SO ship | Medium — nhầm flow | Hide "Tạo SO" button khỏi user role NM khác PD |
| Permission sai → user thấy data NM khác | Medium — privacy nội bộ | RLS policies theo facility_id, test kỹ với từng role |
| Đổi facility ở giữa session | Low — mất context | Sticky facility filter, confirm khi đổi |

---

## 10. Còn 2 câu chưa quyết

7. **Currency Lào:** Tạm thời VND. Sau khi vận hành sẽ thêm LAK/USD nếu cần (column `currency` trên rubber_intake_batches/weighbridge_tickets, default 'VND').

8. **Thứ tự rollout:** Đề xuất Tân Lâm trước (gần PD, dễ test transfer), Lào sau khi TL ổn 1-2 tuần. → Xác nhận lại nếu khác.

---

## 11. 🚀 EXECUTION PLAN — Ý tưởng thực hiện

### Tổng quan thứ tự

```
F1 Foundation                           ← BẮT BUỘC làm đầu tiên
  └─ Schema + migration + facilities CRUD
     └─ TEST: ERP load OK với 3 facilities + 7 kho
        └─ Decision point: deploy → tiếp tục F2

F2 Tân Lâm vào ERP (chưa có trạm cân)
  └─ Sub-app weighbridge clone cho TL
     └─ User cài máy cân vật lý + setup
        └─ TEST: cân ở TL, check hàng vào KHO-TL-NVL
           └─ Decision point: Lào hoặc Transfer

F3 Inter-facility Transfer (CORE — quan trọng nhất)
  └─ TEST flow TL → PD trước (gần, dễ thử)
     └─ Sau ổn → enable cho Lào

F4 Lào vào ERP
  └─ Tương tự F2 nhưng cho Lào

F5 Smart suggestions + reports + polish
```

### Phase F1 — Foundation (4-6h, bắt buộc làm trước)

**Goal:** Đặt nền tảng schema + UI để các phase sau xây lên. KHÔNG ảnh hưởng vận hành hiện tại của Phong Điền.

**Steps:**
1. Migration SQL: `facilities` table + `facility_id` FK trên 6 bảng + backfill
   - Tất cả data hiện có gán facility = Phong Điền (transparent, không break gì)
   - Thêm 4 kho mới (KHO-TL-NVL, KHO-TL-TP, KHO-LAO-NVL, KHO-LAO-TP) status=active nhưng chưa có data
2. `facilityService.ts` + `useActiveFacilities()` hook (mirror pattern WarehousePicker)
3. `<FacilityPicker>` shared component
4. Header sidebar: dropdown chọn facility (với user multi-facility, default "Tất cả")
5. URL search param `?facility=TL` để filter dashboards

**Deliverable:** ERP vẫn chạy bình thường (như Phong Điền hiện tại), nhưng schema đã sẵn sàng cho multi-facility. User có thể tạo phiếu nhập/xuất cho TL/LÀO bằng tay (dropdown warehouse mới có).

**Risk:** Low — pure additive, có rollback SQL.

---

### Phase F2 — Tân Lâm vào ERP (4-6h)

**Goal:** Tân Lâm hoạt động được trên ERP central như nhà máy thứ 2.

**Steps:**
1. Sub-app weighbridge clone:
   ```
   apps/weighbridge-tanlam/   (copy apps/weighbridge/)
     .env: VITE_FACILITY_CODE=TL
   ```
2. Code update sub-app:
   - Read `VITE_FACILITY_CODE` → tự gán `facility_id` khi create ticket
   - Header hiện tên facility "TRẠM CÂN — Tân Lâm"
   - Auto-sync IN/OUT vào kho của facility đó (KHO-TL-NVL/KHO-TL-TP)
3. ERP UI:
   - Stock-in/out create page: warehouse picker filter theo facility user chọn
   - Production order create page: thêm facility selector
4. Vercel: deploy sub-app riêng `huyanh-weighbridge-tanlam` → subdomain `can-tl.huyanhrubber.vn`
5. User cài đặt phần cứng cân vật lý + Keli scale software ở Tân Lâm
6. **TEST:** Cân thử NVL ở TL → check tồn KHO-TL-NVL tăng đúng

**Deliverable:** Tân Lâm hoạt động full chu trình NVL nhập + sản xuất + TP vào kho local. **CHƯA có transfer** — TP nằm tại TL, BGD thấy trong dashboard.

---

### Phase F3 — Transfer NM ↔ Phong Điền (6-8h, CORE)

**Goal:** Mở khóa flow chuyển TP từ TL/Lào về PD để xuất khẩu.

**Steps:**
1. Schema bổ sung:
   ```sql
   ALTER TABLE stock_out_orders ADD COLUMN destination_facility_id UUID;
   ALTER TABLE stock_out_orders ADD COLUMN destination_warehouse_id UUID;
   ALTER TABLE stock_out_orders ADD COLUMN transit_status VARCHAR;
   ALTER TABLE stock_in_orders ADD COLUMN origin_facility_id UUID;
   ALTER TABLE stock_in_orders ADD COLUMN origin_stock_out_id UUID;
   ```
2. `stockOutService.createTransferOrder` — tạo phiếu xuất reason='transfer' với destination
3. State machine `transit_status`: departed → in_transit → arrived → received (+ rejected nếu hao hụt cao)
4. Cân tại NM gửi (TL): trừ KHO-TL-TP, set status='in_transit'
5. Cân tại NM nhận (PD): tạo stock-in tự động link `origin_stock_out_id`, tính hao hụt
6. Threshold check: hao hụt < 0.5% → auto-confirm, > 0.5% → cảnh báo BGD duyệt
7. UI mới:
   - Trang "🚛 Hàng đang vận chuyển" (tab trong /wms hoặc dashboard riêng)
   - Form tạo phiếu transfer (giống stock-out nhưng có destination picker)
   - Reverse direction: PD → TL/Lào — chung component, swap source/dest

**Deliverable:** Hoàn chỉnh chu trình TL produce → transfer to PD → ship to khách. Hao hụt được track + duyệt nếu vượt ngưỡng.

---

### Phase F4 — Lào vào ERP (3-4h)

**Goal:** Lào hoạt động giống TL.

**Steps:** Lặp lại F2 cho Lào:
- Clone `apps/weighbridge-lao/` với `VITE_FACILITY_CODE=LAO`
- Subdomain `can-lao.huyanhrubber.vn`
- Cài đặt cân vật lý ở Lào
- Test inbound + transfer Lào → PD

**Deliverable:** 3/3 nhà máy hoạt động đầy đủ trên 1 ERP.

---

### Phase F5 — Smart suggestions + Reports + Polish (4-6h, có thể defer)

**Goal:** Tối ưu vận hành — gợi ý transfer, báo cáo cross-facility.

**Steps:**
1. Cron job (Supabase Edge Function hoặc Vercel cron):
   - Mỗi đêm tính demand vs supply tại PD
   - Generate transfer suggestions
   - Lưu vào `transfer_suggestions` table
2. Dashboard "Transfer Planning" (tab trong /wms/reports)
3. Pivot table tồn kho 3 facilities
4. So sánh KPI per facility (turnover, hao hụt, picking accuracy)
5. Permission UI: BGD gán user vào facility(s)

**Deliverable:** ERP enterprise-grade với suggestions tự động + báo cáo cấp công ty.

---

## 12. Tổng effort + lịch trình đề xuất

| Phase | Effort | Có thể deploy độc lập? | Phụ thuộc |
|---|---|---|---|
| F1 Foundation | 4-6h | ✅ Yes (no breaking) | — |
| F2 Tân Lâm | 4-6h | ✅ Yes | F1 |
| F3 Transfer | 6-8h | ✅ Yes | F1 + F2 |
| F4 Lào | 3-4h | ✅ Yes | F1 (F3 nếu muốn transfer luôn) |
| F5 Polish | 4-6h | ✅ Yes (additive) | F1+F2+F3 |

**Tổng:** ~21-30h. Gợi ý chia ra 3-5 sessions:

- **Session 1 (F1, ~5h):** Foundation — schema + facility CRUD. Test ERP vẫn chạy ổn với Phong Điền.
- **Session 2 (F2, ~5h):** Tân Lâm vào ERP. User song song cài đặt phần cứng cân TL.
- **Session 3 (F3, ~7h):** Transfer flow + state machine. Test với data thật ở TL.
- **Session 4 (F4, ~3h):** Lào vào ERP. Tương tự TL nhưng nhanh hơn vì code đã có.
- **Session 5 (F5, ~5h):** Suggestions + reports — sau khi 3 NM ổn 1-2 tuần.

---

## 13. Đề xuất bắt đầu — Session 1: F1 Foundation

**Bắt đầu ngay được — KHÔNG cần đợi gì:**

1. Tạo migration `multi_facility_foundation.sql`:
   - CREATE TABLE facilities
   - INSERT 3 facilities (PD, TL, LAO)
   - ALTER TABLE warehouses ADD facility_id + INSERT 4 kho mới
   - ALTER TABLE weighbridge_tickets ADD facility_id (backfill = PD)
   - ALTER TABLE production_orders ADD facility_id (backfill = PD)
   - ALTER TABLE sales_orders ADD ship_from_facility_id (backfill = PD)
   - ALTER TABLE rubber_intake_batches ADD facility_id (backfill = PD)
   - RLS policies cho facilities (admin write, all read)

2. Code:
   - `src/services/wms/facilityService.ts` (~50 LOC, CRUD đơn giản)
   - `src/hooks/useActiveFacilities.ts` (~15 LOC, mirror useActiveWarehouses)
   - `src/components/wms/FacilityPicker.tsx` (~80 LOC, mirror WarehousePicker)
   - Header dropdown facility selector (+30 LOC vào Sidebar/Header)

3. Test:
   - ERP load OK (Phong Điền data nguyên vẹn)
   - Sidebar có dropdown facility
   - Tạo thử phiếu nhập kho cho KHO-TL-NVL từ ERP UI

**Risk:** Rất thấp — pure additive. Rollback = drop table + remove columns.

**Sau F1 xong + deploy:** User có thể xem ERP có 7 kho thay vì 3, dropdown facility hoạt động. Phong Điền vẫn dùng bình thường, TL/Lào kho rỗng chờ data.

---

## 14. Tham chiếu

---

## 11. Tham chiếu

- [WMS_CONSOLIDATION_PLAN.md](./WMS_CONSOLIDATION_PLAN.md) — Phase A-D đã hoàn tất
- [STOCK_OUT_IMPROVEMENT_PLAN.md](./STOCK_OUT_IMPROVEMENT_PLAN.md) — S1-S4 stock-out
- [WEIGHBRIDGE_WORKFLOW.md](./WEIGHBRIDGE_WORKFLOW.md) — Weighbridge IN/OUT W1-W7

Memory notes: `~/.claude/projects/d--Projects-huyanh-erp-8/memory/weighbridge_out_workflow.md` — gotchas RLS + schema từ session OUT auto-confirm.
