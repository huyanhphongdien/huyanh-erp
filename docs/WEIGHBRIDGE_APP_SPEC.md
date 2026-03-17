# Phần Mềm Cân Xe Mủ Cao Su — Huy Anh Rubber

> App cân xe độc lập, chuyên cân mủ cao su, tích hợp cùng database ERP

---

## 1. Tổng Quan

### Mục tiêu
Xây dựng app cân xe **riêng biệt** đặt tại trạm cân, chỉ phục vụ **cân mủ cao su**. App kết nối cùng Supabase database với ERP chính — mọi phiếu cân tạo từ app này đều hiển thị ngay trên ERP.

### Đặc điểm
- **Standalone** — chạy độc lập trên trình duyệt Chrome/Edge tại trạm cân
- **Tối giản** — chỉ 3 màn hình, tối ưu thao tác nhanh
- **Liên kết module** — auto-fill từ Deal B2B, NCC Mủ, lịch sử cân
- **Real-time** — ERP thấy phiếu cân ngay lập tức
- **Kết nối cân điện tử** — Web Serial API (Keli D2008FA)

### Tech Stack
| Thành phần | Công nghệ |
|-----------|-----------|
| Framework | React 18 + Vite |
| UI | Ant Design v5 |
| Language | TypeScript |
| Backend | Supabase (cùng project với ERP) |
| Cân điện tử | Web Serial API |
| Camera | RTSP streams / USB webcam |
| Deploy | Static site → `can.huyanhrubber.com` |

---

## 2. Cấu Trúc Project

```
huyanh-erp-8/
├── src/                          ← ERP chính (không đổi)
├── apps/
│   └── weighbridge/              ← App cân xe mới
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── pages/
│       │   │   ├── LoginPage.tsx       ← Đăng nhập PIN
│       │   │   ├── HomePage.tsx        ← Dashboard + DS phiếu
│       │   │   └── WeighingPage.tsx    ← Màn hình cân chính
│       │   ├── components/
│       │   │   ├── ScaleDisplay.tsx    ← Hiển thị số cân
│       │   │   ├── DealSelector.tsx    ← Chọn Deal/NCC
│       │   │   ├── VehicleInput.tsx    ← Nhập biển số + gợi ý
│       │   │   ├── CameraPanel.tsx     ← Chụp ảnh xe
│       │   │   ├── TicketSummary.tsx   ← Tóm tắt phiếu cân
│       │   │   └── TicketTable.tsx     ← Bảng phiếu hôm nay
│       │   └── lib/
│       │       └── supabase.ts        ← Cùng URL/Key với ERP
│       ├── index.html
│       ├── vite.config.ts
│       ├── package.json
│       └── tsconfig.json
└── shared/                        ← Code dùng chung
    ├── services/
    │   ├── weighbridgeService.ts
    │   └── weighbridgeImageService.ts
    ├── hooks/
    │   └── useKeliScale.ts
    └── types/
        └── wms.types.ts
```

---

## 3. Database — Bảng Hiện Có + Mở Rộng

### 3.1 Bảng `weighbridge_tickets` (đã có)

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `id` | UUID PK | |
| `code` | VARCHAR | Mã phiếu: `CX-YYYYMMDD-XXX` |
| `vehicle_plate` | VARCHAR | Biển số xe |
| `driver_name` | VARCHAR | Tên tài xế |
| `ticket_type` | ENUM | `in` / `out` |
| `gross_weight` | NUMERIC | Cân lần 1 (kg) |
| `tare_weight` | NUMERIC | Cân lần 2 (kg) |
| `net_weight` | NUMERIC | = abs(gross - tare) |
| `reference_type` | VARCHAR | `stock_in` / `stock_out` / `none` |
| `reference_id` | UUID FK | ID phiếu nhập/xuất |
| `status` | ENUM | `weighing_gross` → `weighing_tare` → `completed` / `cancelled` |
| `notes` | TEXT | Ghi chú |
| `gross_weighed_at` | TIMESTAMPTZ | Thời điểm cân L1 |
| `tare_weighed_at` | TIMESTAMPTZ | Thời điểm cân L2 |
| `completed_at` | TIMESTAMPTZ | Thời điểm hoàn tất |
| `created_by` | UUID | Nhân viên cân |
| `created_at` | TIMESTAMPTZ | |

### 3.2 Cột mới cần thêm (cho cân mủ)

```sql
ALTER TABLE weighbridge_tickets ADD COLUMN IF NOT EXISTS
  -- Liên kết Deal B2B
  deal_id             UUID REFERENCES b2b_deals(id),
  partner_id          UUID REFERENCES b2b_partners(id),

  -- Thông tin mủ
  rubber_type         TEXT,          -- 'mu_dong' | 'mu_nuoc' | 'mu_tap' | 'mu_to' | 'svr'
  rubber_grade        TEXT,          -- SVR 10, SVR 20, CV50, CV60...
  expected_drc        NUMERIC,       -- DRC kỳ vọng (%) từ Deal

  -- Trọng lượng chi tiết
  deduction_kg        NUMERIC DEFAULT 0,  -- Tạp chất / giảm trừ (kg)
  actual_net_weight   NUMERIC,       -- KL Thực = net_weight - deduction_kg

  -- Giá cả (copy từ Deal hoặc nhập)
  unit_price          NUMERIC,       -- Đơn giá (đ/kg)
  price_unit          TEXT,          -- 'wet' | 'dry'
  estimated_value     NUMERIC,       -- Thành tiền ước tính

  -- Xe
  vehicle_type        TEXT,          -- Loại xe: 'xe_5t', 'xe_10t', 'xe_15t'...
  destination         TEXT,          -- Vị trí dỡ: 'cong_1', 'cong_2', 'bai_mu'...

  -- NCC mủ (nếu không qua Deal)
  supplier_id         UUID REFERENCES rubber_suppliers(id),
  supplier_name       TEXT;          -- Cache tên NCC
```

### 3.3 Bảng `weighbridge_images` (đã có, không đổi)

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `id` | UUID PK | |
| `ticket_id` | UUID FK | → weighbridge_tickets |
| `image_url` | TEXT | URL ảnh trên Supabase Storage |
| `capture_type` | ENUM | `front` / `rear` / `top` / `plate` / `cargo` |
| `captured_at` | TIMESTAMPTZ | |

---

## 4. Liên Kết Module — Auto-Fill

### 4.1 Từ Deal B2B (`b2b_deals`)

Khi nhân viên cân **chọn Deal** từ dropdown:

```
Deal DL2603-A1B2 — Đại lý Nguyễn A — Mủ đông — Còn 3.2T
```

Auto-fill ngay:

| Trường app cân | Nguồn | Trường DB |
|---------------|-------|-----------|
| Tên đại lý | `deal → partner.name` | `b2b_partners.name` |
| Loại mủ | `deal.product_name` | `b2b_deals.product_name` |
| Đơn giá | `deal.unit_price` | `b2b_deals.unit_price` |
| Loại giá | `deal.price_unit` | (wet/dry từ booking) |
| DRC kỳ vọng | `deal.expected_drc` | `b2b_deals.expected_drc` |
| SL còn lại | `quantity_kg - actual_weight_kg` | Tính từ deal |

**Service đã có:** `dealWmsService.getActiveDealsForStockIn()`

```typescript
// Trả về danh sách Deal đang active
interface ActiveDealForStockIn {
  id: string
  deal_number: string
  partner_name: string
  product_name: string
  quantity_kg: number
  received_kg: number      // Đã nhận
  remaining_kg: number     // Còn lại
}
```

### 4.2 Từ NCC Mủ (`rubber_suppliers`)

Nếu **không có Deal** (mua lẻ), chọn NCC trực tiếp:

| Trường app cân | Nguồn | Trường DB |
|---------------|-------|-----------|
| Tên NCC | `supplier.name` | `rubber_suppliers.name` |
| Mã NCC | `supplier.code` | `rubber_suppliers.code` |
| Vùng | `supplier.region` | `rubber_suppliers.address` |
| Loại NCC | `supplier.supplier_type` | `farmer` / `dai_ly` |

### 4.3 Từ Lịch Sử Cân (`weighbridge_tickets`)

Khi nhập **biển số xe**, gợi ý từ lịch sử:

| Auto-fill | Logic | Service |
|-----------|-------|---------|
| Biển số (autocomplete) | Lịch sử biển số | `getPlateHistory(search)` |
| Tên tài xế | Tài xế gần nhất của xe | `getRecentByPlate(plate)` |
| Loại xe | Loại xe đã lưu | `getRecentByPlate(plate)` |
| Tare gợi ý | TB tare 10 lần gần nhất | `getSuggestedTare(plate)` |

**Service đã có:**

```typescript
// Gợi ý tare
getSuggestedTare(plate): {
  avgTare: number | null,     // TB: 3,200 kg
  lastTare: number | null,    // Lần gần nhất: 3,180 kg
  count: number               // Số lần cân: 15
}

// Lịch sử biển số
getPlateHistory(search, limit): string[]
// → ['74A-88888', '74A-12345', '51C-99999']

// Phiếu gần nhất của xe
getRecentByPlate(plate, limit): WeighbridgeTicket[]
// → driver_name, vehicle_type từ lần cân trước
```

### 4.4 Output → Tự động tạo cho Module sau

Khi phiếu cân **hoàn tất**, app có thể:

| Hành động | Module đích | Trường ghi | Khi nào |
|-----------|------------|-----------|---------|
| Tạo phiếu nhập kho | `stock_in_orders` | `deal_id`, `total_weight` | 1 click sau khi cân |
| Tạo lô hàng | `stock_batches` | `quantity`, `initial_drc` | Kèm phiếu nhập |
| Cập nhật Deal | `b2b_deals` | `actual_weight_kg`, `stock_in_count` | Tự động |
| Gửi chat | `b2b_chat_messages` | Thông báo hệ thống | Tự động |
| Ghi công nợ | `b2b_ledger_entries` | `estimated_value` | Tự động |

**Service đã có:**
```typescript
// Cập nhật Deal sau khi nhập kho
dealWmsService.updateDealStockInTotals(dealId)

// Gửi thông báo chat
dealWmsService.notifyDealChatStockIn(dealId, stockInCode, totalWeight)
```

---

## 5. Màn Hình App

### 5.1 Đăng Nhập (LoginPage)

```
┌──────────────────────────────────┐
│                                  │
│    🏭 TRẠM CÂN HUY ANH         │
│    Cao su Huy Anh Phước          │
│                                  │
│    Nhân viên: [Chọn        ▼]   │
│                                  │
│    Mã PIN:    [● ● ● ●]        │
│                                  │
│    [     ĐĂNG NHẬP     ]        │
│                                  │
│    Cân: ● Đã kết nối (COM3)    │
│                                  │
└──────────────────────────────────┘
```

- Chọn nhân viên cân từ danh sách
- Nhập PIN 4 số (đơn giản, không cần email/password)
- Hiển thị trạng thái kết nối cân

### 5.2 Trang Chính (HomePage)

```
┌──────────────────────────────────────────────────────────────┐
│  🏭 TRẠM CÂN HUY ANH        Ngô Thị Khuyên    08:35:27    │
│  Cân: ● Online (9600 baud)                    [⚙️] [🔄] [↪]│
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Đang cân │ │ Hôm nay  │ │ Tổng tấn │ │ Phiếu    │       │
│  │    1     │ │    8     │ │  32.5 T  │ │   12     │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                              │
│  ┌────────────────────────────────────────────────────┐     │
│  │  ╋  TẠO PHIẾU CÂN MỚI                             │     │
│  │     Nhấn để bắt đầu cân xe mủ                      │     │
│  └────────────────────────────────────────────────────┘     │
│                                                              │
│  ⚠️ PHIẾU ĐANG CÂN DỞ                                      │
│  ┌────────────────────────────────────────────────────┐     │
│  │ CX-17  74A-88888  Ng.A   Gross: 10,500  [Tiếp →] │     │
│  └────────────────────────────────────────────────────┘     │
│                                                              │
│  PHIẾU CÂN HÔM NAY                                         │
│  ┌────┬────────┬────────┬────────┬───────┬──────┬────────┐ │
│  │ #  │ Phiếu  │Đại lý  │Biển số │ NET   │Mủ    │ Tiền   │ │
│  ├────┼────────┼────────┼────────┼───────┼──────┼────────┤ │
│  │ 1  │ CX-16  │Trần B  │51C-999 │4,900  │Đông  │22.0 tr │ │
│  │ 2  │ CX-15  │Lê C    │74A-123 │3,200  │Nước  │14.4 tr │ │
│  └────┴────────┴────────┴────────┴───────┴──────┴────────┘ │
│                                          Tổng: 8,100 kg    │
└──────────────────────────────────────────────────────────────┘
```

### 5.3 Màn Hình Cân Chính (WeighingPage)

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Quay lại    PHIẾU CÂN CX-20260317-017         Cân: ● Online    │
├─────────────────────────────┬────────────────────────────────────────┤
│ THÔNG TIN                   │  SỐ CÂN                               │
│                              │                                        │
│ Deal:  [DL2603-A1B2      ▼] │  ┌────────────────────────────┐        │
│  → Đại lý Nguyễn Văn A      │  │                            │        │
│  → Còn lại: 3.2 T           │  │       10,520               │ kg     │
│                              │  │                            │        │
│ ─── hoặc NCC trực tiếp ──── │  └────────────────────────────┘        │
│ NCC: [NCC-001 Nguyễn B   ▼] │  ● Ổn định                            │
│                              │  [📥 GHI CÂN LẦN 1]                  │
│ Biển số: [74A-88888       ] │                                        │
│  💡 Tài xế: Văn B (tự fill) │  ──────────────────────                │
│  💡 Xe 15T | Tare TB: 3,200 │                                        │
│                              │  Cân L1 (Gross):  10,520  kg          │
│ Loại mủ: [Mủ đông        ▼] │  Cân L2 (Tare):   -----   kg          │
│ DRC KV:     32    %          │  ────────────────                     │
│ Đơn giá: 45,000  đ/kg       │  NET:             -----   kg          │
│ Loại giá: ○Ướt ●Khô         │  Tạp chất:       [    0]  kg          │
│                              │  ────────────────                     │
│ Vị trí dỡ: [Cổng 2       ▼] │  KL Thực:         -----   kg          │
│ Ghi chú:  [               ] │  KL Khô ước:      -----   kg          │
│                              │  Thành tiền:      -----   đ           │
│                              │                                        │
│ 📷 ẢNH XE                   │                                        │
│ [Trước] [Sau] [Biển] [Hàng] │  [💾 LƯU]   [🖨️ IN]   [✓ HOÀN TẤT]  │
├─────────────────────────────┴────────────────────────────────────────┤
│  ☑ Tự tạo phiếu nhập kho sau khi hoàn tất                          │
│  ☑ Gửi thông báo chat cho đại lý                                    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 6. Luồng Hoạt Động Chi Tiết

### 6.1 Tạo phiếu + Cân lần 1 (Xe vào)

```
Nhân viên cân thao tác:

1. Nhấn [TẠO PHIẾU CÂN MỚI]

2. Chọn nguồn mủ (1 trong 2):
   a. Chọn Deal → auto-fill: đại lý, loại mủ, giá, DRC
   b. Chọn NCC  → auto-fill: tên NCC, vùng

3. Nhập biển số xe → auto-fill: tài xế, loại xe, tare TB
   (Autocomplete từ lịch sử)

4. Xe lên bàn cân → số cân hiện real-time

5. Nhấn [GHI CÂN LẦN 1] khi số ổn định
   → gross_weight = 10,520 kg
   → status: weighing_gross → weighing_tare
   → Chụp ảnh xe lần 1 (tùy chọn)

6. Xe vào dỡ hàng
```

### 6.2 Cân lần 2 (Xe ra) + Hoàn tất

```
Xe dỡ hàng xong, quay lại cân:

7. Từ HomePage → chọn phiếu đang dở [Tiếp →]

8. Xe lên bàn cân → số cân hiện real-time
   💡 Gợi ý: "Tare TB xe này: 3,200 kg"

9. Nhấn [GHI CÂN LẦN 2]
   → tare_weight = 3,180 kg
   → Auto tính:
     NET         = 10,520 - 3,180 = 7,340 kg
     Tạp chất    = 0 kg (nhập tay nếu có)
     KL Thực     = 7,340 - 0 = 7,340 kg
     KL Khô ước  = 7,340 × 32% = 2,349 kg
     Thành tiền  = 2,349 × 45,000 = 105,705,000 đ
   → Chụp ảnh xe lần 2 (tùy chọn)

10. Nhấn [HOÀN TẤT]
    → status: completed
    → Tự động (nếu tick checkbox):
      a. Tạo phiếu nhập kho (stock_in_orders)
      b. Cập nhật Deal: actual_weight += 7,340 kg
      c. Gửi chat: "Đã cân 7.34T mủ đông, Deal DL2603-A1B2"
      d. Ghi công nợ sơ bộ: 105,705,000 đ

11. [IN PHIẾU] → In phiếu cân (PDF/thermal)
```

### 6.3 Trạng thái phiếu cân

```
weighing_gross ──[Ghi cân L1]──► weighing_tare ──[Ghi cân L2 + Hoàn tất]──► completed
      │                                │
      └────────[Hủy]──────────────────┘──────────────────────────────► cancelled
```

---

## 7. Công Thức Tính Toán

### 7.1 Trọng lượng

```
NET (kg)       = |Gross - Tare|
KL Thực (kg)   = NET - Tạp chất
KL Khô (kg)    = KL Thực × (DRC% / 100)
```

### 7.2 Thành tiền

```
Nếu giá ướt (wet):
  Thành tiền = KL Thực × Đơn giá

Nếu giá khô (dry):
  Thành tiền = KL Khô × Đơn giá

Ví dụ (giá khô):
  KL Thực   = 7,340 kg
  DRC       = 32%
  Đơn giá   = 45,000 đ/kg
  KL Khô    = 7,340 × 0.32 = 2,348.8 kg
  Thành tiền = 2,348.8 × 45,000 = 105,696,000 đ
```

### 7.3 Gợi ý Tare

```
Tare gợi ý = TB(tare_weight) của 10 phiếu gần nhất cùng biển số

Ví dụ: Xe 74A-88888 đã cân 15 lần
  → avgTare  = 3,200 kg
  → lastTare = 3,180 kg
  → Hiển thị: "TB 15 lần cân trước: 3,200 kg"
```

---

## 8. Services Dùng Lại (Không Viết Mới)

### 8.1 weighbridgeService (100% dùng lại)

| Method | Mô tả |
|--------|-------|
| `generateCode()` | Sinh mã `CX-YYYYMMDD-XXX` |
| `create(data)` | Tạo phiếu, status = `weighing_gross` |
| `updateGrossWeight(id, weight)` | Ghi cân L1, status → `weighing_tare` |
| `updateTareWeight(id, weight)` | Ghi cân L2, tính NET |
| `complete(id)` | Hoàn tất, status → `completed` |
| `cancel(id, reason)` | Hủy phiếu |
| `getAll(params)` | Danh sách có phân trang + filter |
| `getById(id)` | Chi tiết + ảnh |
| `getRecentByPlate(plate)` | Lịch sử xe |
| `getSuggestedTare(plate)` | Gợi ý tare |
| `getPlateHistory(search)` | Autocomplete biển số |
| `getStats()` | Thống kê dashboard |
| `linkToReference(id, type, refId)` | Liên kết phiếu nhập/xuất |

### 8.2 weighbridgeImageService (100% dùng lại)

| Method | Mô tả |
|--------|-------|
| `uploadImage(ticketId, file, captureType)` | Upload ảnh từ file |
| `uploadBase64(ticketId, base64, captureType)` | Upload từ camera snapshot |
| `saveExternalUrl(ticketId, url, captureType)` | Lưu URL camera IP |
| `getByTicket(ticketId)` | Lấy tất cả ảnh của phiếu |
| `deleteImage(imageId)` | Xóa ảnh |

### 8.3 useKeliScale hook (100% dùng lại)

| Prop | Mô tả |
|------|-------|
| `supported` | Browser có Web Serial API? |
| `connected` | Đang kết nối cân? |
| `liveWeight` | Số cân real-time: `{ weight, unit, stable }` |
| `connect()` | Mở dialog chọn COM port |
| `disconnect()` | Ngắt kết nối |
| `config` | `{ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' }` |

**Hỗ trợ cân Keli D2008FA:**
```
Format: ST,GS,+  12345 kg
  ST = Stable, US = Unstable
  GS = Gross, NT = Net
  Weight: 8 chars right-aligned
```

### 8.4 dealWmsService (dùng lại 4 methods)

| Method | Mô tả |
|--------|-------|
| `getActiveDealsForStockIn()` | DS Deal đang active cho dropdown |
| `updateDealStockInTotals(dealId)` | Cập nhật SL đã nhận của Deal |
| `notifyDealChatStockIn(dealId, ...)` | Gửi chat thông báo |
| `getWeighbridgeByDeal(dealId)` | DS phiếu cân của Deal |

---

## 9. Code Mới Cần Viết

### 9.1 Components (~7 files)

| Component | Chức năng | Độ phức tạp |
|-----------|----------|-------------|
| `ScaleDisplay` | Hiển thị số cân lớn, trạng thái ổn định | Thấp |
| `DealSelector` | Dropdown chọn Deal, hiển thị info | Trung bình |
| `SupplierSelector` | Dropdown chọn NCC mủ | Thấp |
| `VehicleInput` | Input biển số + autocomplete + auto-fill | Trung bình |
| `CameraPanel` | Chụp ảnh 4 góc + biển số | Trung bình |
| `TicketSummary` | Tóm tắt: NET, KL Khô, thành tiền | Thấp |
| `TicketTable` | Bảng phiếu hôm nay | Thấp |

### 9.2 Pages (~3 files)

| Page | Chức năng |
|------|----------|
| `LoginPage` | Chọn nhân viên + PIN |
| `HomePage` | Dashboard + DS phiếu + nút tạo mới |
| `WeighingPage` | Form cân chính (tạo + cân L1 + cân L2 + hoàn tất) |

### 9.3 Service mới (~1 file)

| Service | Chức năng |
|---------|----------|
| `rubberWeighService` | Tính toán KL khô, thành tiền, tạo phiếu nhập kho tự động |

---

## 10. Tính Năng Đặc Biệt

### 10.1 Auto-fill thông minh

```
Nhập biển số "74A"
  → Gợi ý: 74A-88888, 74A-12345

Chọn "74A-88888"
  → Auto: Tài xế = "Nguyễn Văn B"
  → Auto: Loại xe = "Xe 15T"
  → Auto: Tare gợi ý = 3,200 kg (TB 15 lần)

Chọn Deal "DL2603-A1B2"
  → Auto: Đại lý = "Nguyễn Văn A"
  → Auto: Loại mủ = "Mủ đông"
  → Auto: Giá = 45,000 đ/kg (khô)
  → Auto: DRC KV = 32%
  → Auto: Còn lại = 3.2 T
```

### 10.2 In phiếu cân

```
┌────────────────────────────────────┐
│  CÔNG TY TNHH MTV                  │
│  CAO SU HUY ANH PHƯỚC              │
│                                     │
│  PHIẾU CÂN XE                      │
│  Số: CX-20260317-017               │
│  Ngày: 17/03/2026  08:35           │
│                                     │
│  Biển số:    74A-88888              │
│  Tài xế:    Nguyễn Văn B           │
│  Đại lý:    Nguyễn Văn A           │
│  Deal:      DL2603-A1B2            │
│  Loại mủ:   Mủ đông               │
│                                     │
│  Cân L1 (Gross):   10,520 kg       │
│  Cân L2 (Tare):     3,180 kg       │
│  ──────────────────────             │
│  NET:                7,340 kg       │
│  Tạp chất:               0 kg      │
│  KL Thực:            7,340 kg       │
│                                     │
│  DRC kỳ vọng:          32 %        │
│  KL Khô ước:        2,349 kg       │
│  Đơn giá:          45,000 đ/kg     │
│  Thành tiền:   105,705,000 đ       │
│                                     │
│  NV Cân: Ngô Thị Khuyên            │
│                                     │
│  Chữ ký NV cân     Chữ ký tài xế  │
│                                     │
└────────────────────────────────────┘
```

### 10.3 Phím tắt

| Phím | Hành động |
|------|----------|
| `F2` | Tạo phiếu mới |
| `F5` | Ghi cân (lần 1 hoặc lần 2) |
| `F8` | Hoàn tất phiếu |
| `F9` | In phiếu |
| `F12` | Chụp ảnh tất cả camera |
| `Esc` | Hủy / Quay lại |

### 10.4 Cảnh báo

| Tình huống | Cảnh báo |
|-----------|---------|
| Tare chênh > 20% so với TB | ⚠️ "Tare chênh lệch lớn so với TB (3,200 → 4,100)" |
| NET > SL còn lại của Deal | ⚠️ "NET 8.5T vượt SL còn lại Deal (3.2T)" |
| Cân chưa ổn định | ⚠️ "Cân chưa ổn định, chờ thêm..." |
| Trùng biển số đang cân dở | ⚠️ "Xe 74A-88888 có phiếu CX-16 đang cân dở" |

---

## 11. Bảo Mật & Phân Quyền

### Auth đơn giản cho trạm cân

```
Bảng: scale_operators (mới)

id          UUID PK
name        TEXT         -- Tên nhân viên
pin_hash    TEXT         -- Hash PIN 4 số
station     TEXT         -- Trạm cân: 'tram_1', 'tram_2'
is_active   BOOLEAN
created_at  TIMESTAMPTZ
```

- Không dùng email/password phức tạp
- PIN 4 số, đổi được
- Ghi nhận `created_by` = operator.id trên mỗi phiếu
- Logout tự động sau 8h hoặc cuối ca

### Phân quyền

| Quyền | Nhân viên cân | Quản lý (ERP) |
|-------|--------------|---------------|
| Tạo phiếu | ✅ | ✅ |
| Cân L1/L2 | ✅ | ✅ |
| Hoàn tất | ✅ | ✅ |
| Hủy phiếu | ❌ | ✅ |
| Sửa phiếu đã hoàn tất | ❌ | ✅ |
| Xem báo cáo | ❌ | ✅ |
| Cài đặt cân | ❌ | ✅ |

---

## 12. Deploy & Vận Hành

### 12.1 Build & Deploy

```bash
# Build app cân xe
cd apps/weighbridge
npm run build

# Output: apps/weighbridge/dist/
# Deploy lên: can.huyanhrubber.com
```

### 12.2 Yêu cầu phần cứng trạm cân

| Thiết bị | Yêu cầu |
|---------|---------|
| Máy tính | Windows/Linux, Chrome/Edge mới nhất |
| Cân điện tử | Keli D2008FA hoặc tương thích |
| Kết nối cân | USB (COM port) |
| Camera | IP camera RTSP hoặc USB webcam |
| Máy in | Thermal printer (khổ 80mm) hoặc A4 |
| Mạng | Internet (kết nối Supabase) |

### 12.3 Xử lý offline (tương lai)

- Cache phiếu cân khi mất mạng
- Sync lên Supabase khi có mạng lại
- IndexedDB cho queue offline
- Service Worker cho PWA

---

## 13. Ước Lượng

### Files cần tạo mới

| Loại | Số file | Ghi chú |
|------|---------|---------|
| Pages | 3 | Login, Home, Weighing |
| Components | 7 | Scale, Deal, Vehicle, Camera... |
| Services | 1 | rubberWeighService |
| Config | 3 | vite.config, package.json, tsconfig |
| Shared setup | 1 | Symlink hoặc path alias |
| **Tổng** | **~15 files mới** | |

### Code dùng lại từ ERP

| Module | Files | Tỷ lệ dùng lại |
|--------|-------|----------------|
| weighbridgeService | 1 | 100% |
| weighbridgeImageService | 1 | 100% |
| useKeliScale | 1 | 100% |
| dealWmsService | 1 | 40% (4 methods) |
| wms.types | 1 | 30% (weighbridge types) |
| supabase client | 1 | 100% |
| **Tổng** | **6 files** | **~80%** |
