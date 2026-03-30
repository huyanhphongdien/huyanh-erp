# PHÂN TÍCH LUỒNG TỔNG THỂ HỆ THỐNG — TỪ A ĐẾN Z

> **Ngày:** 30/03/2026
> **Mục đích:** Phân tích toàn bộ luồng liên module, xác định cascade effects,
> ghi nhật ký mọi thay đổi để đảm bảo sửa 1 chỗ không phá vỡ chỗ khác.

---

## 1. BẢN ĐỒ TỔNG THỂ HỆ THỐNG

```
                    KHÁCH HÀNG QUỐC TẾ
                         │
                    ┌────▼─────┐
                    │  SALES   │ Đơn hàng bán
                    │  ORDER   │ (JK, Michelin...)
                    └────┬─────┘
                         │ Cần NVL
            ┌────────────┼────────────────┐
            ▼            ▼                ▼
    ┌──────────┐  ┌──────────┐    ┌──────────┐
    │ KHO NVL  │  │ B2B DEAL │    │ MUA HÀNG │
    │ (tồn)    │  │ (đại lý) │    │ (NCC)    │
    └────┬─────┘  └────┬─────┘    └────┬─────┘
         │             │               │
         │        ┌────▼─────┐         │
         │        │ TRẠM CÂN │         │
         │        └────┬─────┘         │
         │             │               │
         │        ┌────▼─────┐         │
         │        │ NHẬP KHO │◄────────┘
         │        │  NVL     │
         │        └────┬─────┘
         │             │
         │        ┌────▼─────┐
         │        │  QC/DRC  │
         │        └────┬─────┘
         │             │
         └──────►┌─────▼─────┐
                 │ SẢN XUẤT  │ 5 công đoạn
                 │ (LSX)     │ Rửa→Tán→Sấy→Ép→Gói
                 └─────┬─────┘
                       │
                 ┌─────▼─────┐
                 │ KHO THÀNH │
                 │ PHẨM      │
                 └─────┬─────┘
                       │
                 ┌─────▼─────┐
                 │ ĐÓNG GÓI  │ Container + Seal
                 └─────┬─────┘
                       │
                 ┌─────▼─────┐
                 │ CHỨNG TỪ  │ COA + PL + Invoice
                 └─────┬─────┘
                       │
                 ┌─────▼─────┐
                 │ XUẤT KHẨU │ Booking + B/L + DHL
                 └─────┬─────┘
                       │
                 ┌─────▼─────┐
                 │ THANH TOÁN │ L/C + T/T + DP
                 └─────┬─────┘
                       │
              ┌────────▼────────┐
              │   CÔNG NỢ /     │
              │   SỔ CÁI        │
              └─────────────────┘
```

---

## 2. MA TRẬN LIÊN KẾT GIỮA CÁC MODULE

### 2.1 Bảng kết nối (15 điểm liên kết)

| # | Từ | Đến | Bảng liên kết | Trạng thái | Lỗi/Thiếu |
|---|-----|------|-------------|-----------|-----------|
| 1 | Sales Order | Production | `sales_orders.production_order_id` | ✅ Có | Trigger thủ công |
| 2 | Production | Thành phẩm kho | `production_output → stock_batches` | ❌ **THIẾU** | **Không tự tạo nhập kho TP** |
| 3 | Sales Order | Xuất kho | `sales_orders.stock_out_id` | ❌ **THIẾU** | **Cột có nhưng không bao giờ được gán** |
| 4 | Nhập kho | Batch | `stock_in_details.batch_id` | ✅ Có | Hoạt động tốt |
| 5 | Deal B2B | Nhập kho | `stock_in_orders.deal_id` | ✅ Có | Tạo thủ công |
| 6 | Nhập kho | Phiếu cân | `weighbridge_tickets.reference_id` | ✅ Có | Không validate trọng lượng |
| 7 | Batch | QC | `batch_qc_results.batch_id` | ✅ Có | **Không cập nhật deal.qc_status** |
| 8 | Deal | Quyết toán | `b2b_settlements.deal_id` | ✅ Có | Trigger thủ công |
| 9 | Quyết toán | Tạm ứng | `b2b_settlement_advances` | ✅ Có | Hoạt động tốt |
| 10 | Quyết toán | Thanh toán | `b2b_settlement_payments` | ✅ Có | **Không tự cập nhật sổ cái** |
| 11 | Thanh toán | Sổ cái | `b2b_partner_ledger` | ⚠️ Lỗ hổng | Query thô sơ |
| 12 | Tạm ứng | Deal | `b2b_advances.deal_id` | ✅ Có | Hoạt động tốt |
| 13 | Task | Module nghiệp vụ | — | ❌ **THIẾU** | Task không link đến SO/LSX/Deal |
| 14 | Sales Invoice | Thanh toán | `sales_invoices` | ⚠️ Có | Chưa triển khai đầy đủ |
| 15 | Phiếu cân | Deal | `weighbridge_tickets.deal_id` | ✅ Có | App cân xe đã tích hợp |

### 2.2 Cascade Effects — Sửa gì ảnh hưởng gì

```
⚠️ QUAN TRỌNG: Mỗi thay đổi dưới đây ảnh hưởng đa module

SỬA salesOrderService:
  → Ảnh hưởng: salesProductionService, containerService, documentService
  → Ảnh hưởng: performanceService (nếu link task)
  → Ảnh hưởng: Dashboard BGĐ

SỬA stockInService:
  → Ảnh hưởng: dealWmsService (cập nhật deal totals)
  → Ảnh hưởng: batchService (tạo batch)
  → Ảnh hưởng: stock_levels, inventory_transactions
  → Ảnh hưởng: costTrackingService (giá vốn)

SỬA qcService:
  → Ảnh hưởng: deal.actual_drc, deal.qc_status
  → Ảnh hưởng: autoSettlementService (settlement value)
  → Ảnh hưởng: batchService (batch.qc_status)
  → Ảnh hưởng: pickingService (batch có thể pick không)

SỬA productionService:
  → Ảnh hưởng: salesProductionService (sales order status)
  → Ảnh hưởng: stock_batches (NVL consumed)
  → Ảnh hưởng: costTrackingService (COGS)
  → Ảnh hưởng: batch (finished goods)

SỬA settlementService:
  → Ảnh hưởng: ledgerService (sổ cái)
  → Ảnh hưởng: advanceService (trừ tạm ứng)
  → Ảnh hưởng: deal status (settled)
  → Ảnh hưởng: Chat notification
```

---

## 3. LỖ HỔNG NGHIÊM TRỌNG (6 CRITICAL GAPS)

### Gap #1: Sản xuất xong → KHÔNG tự nhập kho thành phẩm

```
HIỆN TẠI:
  Production completed → output_batch tạo → DỪNG Ở ĐÂY
  → Thành phẩm KHÔNG vào stock_levels
  → KHÔNG thể pick cho xuất kho
  → Sales Order KHÔNG biết TP đã sẵn sàng

CẦN:
  Production completed → auto tạo stock_in_order (type='production')
  → stock_batch tạo (loại thành phẩm)
  → stock_levels cập nhật
  → Sales Order status → 'ready'
```

**Ảnh hưởng khi fix:** productionService, stockInService, salesProductionService, stock_levels

### Gap #2: Sales Order → KHÔNG tự tạo xuất kho

```
HIỆN TẠI:
  Sales Order 'ready' → DỪNG Ở ĐÂY
  → sales_orders.stock_out_id luôn NULL
  → Không có phiếu xuất kho

CẦN:
  Sales Order 'packing' → auto tạo stock_out_order
  → Pick batches theo specs (DRC, grade)
  → Link container items
  → Khi xuất kho confirmed → Sales Order → 'shipped'
```

**Ảnh hưởng khi fix:** salesOrderService, stockOutService, containerService, pickingService

### Gap #3: QC batch KHÔNG cập nhật deal.qc_status

```
HIỆN TẠI:
  QCRecheckPage gọi dealWmsService.updateDealActualDrc()
  → NHƯNG QCDashboardPage KHÔNG gọi
  → QC lần đầu KHÔNG trigger update deal

CẦN:
  MỌI lần QC (lần đầu + recheck) → đều check deal link → update deal
```

**Ảnh hưởng khi fix:** qcService, dealWmsService, autoSettlementService

### Gap #4: Quyết toán KHÔNG tự trigger

```
HIỆN TẠI:
  Deal có actual_drc + actual_weight → DỪNG
  → Phải vào Deal → bấm "Quyết toán" thủ công

CẦN:
  Khi deal.qc_status = 'passed' VÀ stock_in_count > 0
  → Hiện notification "Deal sẵn sàng quyết toán"
  → Hoặc auto tạo settlement draft
```

**Ảnh hưởng khi fix:** dealWmsService, autoSettlementService, notificationService

### Gap #5: Thanh toán KHÔNG tự cập nhật sổ cái

```
HIỆN TẠI:
  settlementService.markAsPaid() → tạo ledger entry
  → NHƯNG advanceService.markPaid() → KHÔNG tạo ledger (đã fix nhưng chưa deploy?)
  → paymentService → KHÔNG đồng bộ remaining_amount

CẦN:
  MỌI giao dịch tiền → đều phải tạo ledger entry
  → Ledger balance = SUM(debit) - SUM(credit) = 0 khi hoàn tất
```

**Ảnh hưởng khi fix:** advanceService, settlementService, paymentService, ledgerService

### Gap #6: Task KHÔNG liên kết module nghiệp vụ

```
HIỆN TẠI:
  Task là standalone — không biết thuộc Deal/SO/LSX nào
  → Không tạo task tự động khi có đơn hàng mới
  → Không track tiến độ deal/production qua task

CẦN:
  Task có thể link: deal_id, sales_order_id, production_order_id
  → Khi SO confirmed → auto tạo task cho Sale/SX/Logistics
  → Khi Deal processing → auto tạo task cho Kho/QC
```

**Ảnh hưởng khi fix:** taskService, salesOrderService, dealService, productionService

---

## 4. NHẬT KÝ SỬA CHỮA

### Quy tắc ghi nhật ký

```
Mỗi lần sửa code phải ghi:
1. Ngày sửa
2. File nào sửa
3. Logic thay đổi gì
4. Ảnh hưởng module nào
5. Test case nào cần chạy lại
6. Commit hash
```

### Template nhật ký

```
────────────────────────────────────────
NGÀY:      dd/mm/yyyy
FILE:      src/services/xxx.ts (line X-Y)
THAY ĐỔI:  Mô tả thay đổi
LÝ DO:     Tại sao sửa
ẢNH HƯỞNG: [Module 1] [Module 2] [Module 3]
TEST:      Luồng nào cần test lại
COMMIT:    abc1234
NGƯỜI SỬA: Tên
────────────────────────────────────────
```

### Nhật ký đã thực hiện (tóm tắt)

| Ngày | Thay đổi | Files | Ảnh hưởng | Commit |
|------|---------|-------|-----------|--------|
| 16/03 | Phase 4 Deal↔WMS: thêm deal_id vào stock_in | stockInService, dealWmsService | B2B, WMS, Chat | Nhiều commits |
| 17/03 | WMS Rubber fields: thêm grade, DRC, weight tracking | wms.types, batchService, alertService | WMS toàn bộ | Nhiều commits |
| 17/03 | WMS Redesign: 22 pages → Ant Design | Tất cả pages WMS | UI only | Nhiều commits |
| 18/03 | B2B Demands: nhu cầu mua NVL | demandService, DemandPages | B2B, Portal | Nhiều commits |
| 18/03 | Deal fields sync: thêm expected_drc, rubber_type | dealService, dealConfirmService | B2B, WMS, Cân xe | 40ed165 |
| 20/03 | App Cân xe: standalone weighbridge app | apps/weighbridge/ | Cân xe, WMS | Nhiều commits |
| 21/03 | Task Checklist + Templates + Recurring | taskService, Edge Functions | Công việc | Nhiều commits |
| 23/03 | Fix 12 B2B bugs: ledger, DRC variance, status guards | 8 services B2B | B2B toàn bộ | Nhiều commits |
| 24/03 | Sales Order Module S1-S6 | services/sales/, pages/sales/ | Sales, WMS, SX | Nhiều commits |
| 25/03 | WMS Upgrade Phase 1-11 | 20+ files WMS | WMS toàn bộ | Nhiều commits |
| 26/03 | Fix processing deal logic (7 issues) | dealConfirm, autoSettlement, dealWms | B2B, WMS, QC | a789ab2 |
| 27/03 | Task Module v3: Kanban + Comments + History | TaskPages, services | Công việc, HR | Nhiều commits |
| 27/03 | Performance System P1-P6 | performanceService, Dashboard | Công việc, HR, Lương | Nhiều commits |
| 27/03 | VIP exclusion: huylv@ + thuyht@ | TaskCreatePage, TemplateListPage | Công việc | cba2dae |
| 30/03 | Sales Order Update Plan: phân quyền 4 BP | docs/ | Sales | 8ec9b5a |

---

## 5. DASHBOARD CHO BAN GIÁM ĐỐC

### 5.1 Executive Dashboard — Trang `/executive`

**Ai xem được:** BGĐ (huylv@, thuyht@) + Admin (minhld@)

```
┌─────────────────────────────────────────────────────────┐
│ TỔNG QUAN ĐIỀU HÀNH              [Tháng 3/2026 ▼] [PDF] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ 💰 DOANH THU BÁN HÀNG                                  │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐           │
│ │ $1.2M  │ │ $850K  │ │  14    │ │ $350K  │           │
│ │Doanh   │ │Đã thu  │ │Đơn    │ │Chưa thu│           │
│ │thu     │ │        │ │hàng   │ │        │           │
│ └────────┘ └────────┘ └────────┘ └────────┘           │
│                                                         │
│ 🌿 THU MUA NGUYÊN LIỆU                                │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐           │
│ │ 320T   │ │ 12     │ │ 33.5%  │ │  85tr  │           │
│ │NVL đã  │ │Đại lý  │ │DRC TB  │ │Tạm ứng│           │
│ │mua     │ │hoạt    │ │        │ │chưa QT│           │
│ └────────┘ └────────┘ └────────┘ └────────┘           │
│                                                         │
│ 🏭 SẢN XUẤT                                            │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐           │
│ │ 450T   │ │  82%   │ │  3     │ │ 120T   │           │
│ │Sản     │ │Yield   │ │LSX     │ │Tồn TP │           │
│ │lượng   │ │TB      │ │đang SX │ │        │           │
│ └────────┘ └────────┘ └────────┘ └────────┘           │
│                                                         │
│ 👥 NHÂN SỰ & HIỆU SUẤT                                │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐           │
│ │  42    │ │ 87.6   │ │  95%   │ │  2     │           │
│ │Nhân   │ │Điểm TB │ │Chuyên  │ │NV hạng│           │
│ │viên   │ │        │ │cần     │ │F      │           │
│ └────────┘ └────────┘ └────────┘ └────────┘           │
│                                                         │
│ ⚠️ CẢNH BÁO QUAN TRỌNG                                │
│ ┌───────────────────────────────────────────────────┐  │
│ │ 🔴 3 đơn hàng sắp tới hạn giao (< 7 ngày)       │  │
│ │ 🔴 Container PIX chưa seal — ETD 05/04           │  │
│ │ 🟡 NVL SVR3L tồn thấp — đủ SX 15 ngày           │  │
│ │ 🟡 Công nợ JK quá hạn $85,000 (> 30 ngày)       │  │
│ │ 🟡 5 nhân viên có task quá hạn                    │  │
│ │ 🟢 Đơn TOWER GLOBAL lot 10 đã thanh toán $353K   │  │
│ └───────────────────────────────────────────────────┘  │
│                                                         │
│ 📊 PIPELINE ĐƠN HÀNG                                  │
│ Nháp → Xác nhận → Đang SX → Sẵn sàng → Xuất → TT    │
│  (2)     (3)       (2)       (1)        (3)    (2)    │
│  ██      ███       ██        █          ███    ██     │
│                                                         │
│ 📈 XU HƯỚNG 6 THÁNG                                   │
│                                                         │
│ ┌─ Doanh thu ─────┐  ┌─ Sản lượng ─────┐              │
│ │ ▁▃▅▇█▇          │  │ ▁▂▅▇█▇          │              │
│ │ T10→T3           │  │ T10→T3           │              │
│ └──────────────────┘  └──────────────────┘              │
│                                                         │
│ ┌─ Top KH ──────────────┐  ┌─ Top Đại lý ────────┐    │
│ │ 1. JK       $670K     │  │ 1. Nguyễn Thị Lệ    │    │
│ │ 2. Tower    $358K     │  │ 2. Nguyễn Văn Tính   │    │
│ │ 3. PIX      $290K     │  │ 3. Phạm Minh Ân     │    │
│ └────────────────────────┘  └──────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### 5.2 Cảnh báo tự động

| # | Loại | Cảnh báo | Mức | Tần suất | Module nguồn |
|---|------|---------|-----|----------|-------------|
| 1 | 📦 Đơn hàng | Sắp tới hạn giao (< 7 ngày) | 🔴 | Hàng ngày | Sales |
| 2 | 📦 Đơn hàng | Container chưa seal, ETD < 5 ngày | 🔴 | Hàng ngày | Sales + Logistics |
| 3 | 📦 Đơn hàng | Đơn mới chưa xác nhận > 3 ngày | 🟡 | Hàng ngày | Sales |
| 4 | 🏭 Sản xuất | LSX trễ tiến độ | 🔴 | Hàng ngày | Production |
| 5 | 🏭 Sản xuất | Yield < 75% | 🟡 | Khi xảy ra | Production |
| 6 | 🌿 Tồn kho | NVL tồn thấp (< 15 ngày SX) | 🟡 | Hàng ngày | WMS |
| 7 | 🌿 Tồn kho | TP tồn > 60 ngày | 🟡 | Hàng tuần | WMS |
| 8 | 🌿 Tồn kho | Lô QC không đạt chưa xử lý | 🔴 | Hàng ngày | QC |
| 9 | 💰 Tài chính | Công nợ KH quá hạn > 30 ngày | 🔴 | Hàng ngày | Sales Finance |
| 10 | 💰 Tài chính | Công nợ đại lý chưa quyết toán | 🟡 | Hàng tuần | B2B |
| 11 | 💰 Tài chính | Thanh toán lớn sắp đến | 🟢 | 3 ngày trước | Finance |
| 12 | 👥 Nhân sự | NV hiệu suất hạng F | 🔴 | Cuối tháng | HR |
| 13 | 👥 Nhân sự | > 5 task quá hạn | 🟡 | Hàng ngày | Task |
| 14 | 🌿 Thu mua | DRC đại lý chênh > 5% so với QC | 🟡 | Khi QC xong | B2B + QC |
| 15 | 🌿 Thu mua | Deal sắp hết SL chưa nhập đủ | 🟡 | Hàng tuần | B2B |

### 5.3 Phân quyền Dashboard

| Vai trò | Xem được | Route |
|---------|---------|-------|
| BGĐ (huylv@, thuyht@) | Executive Dashboard — toàn bộ | `/executive` |
| Admin (minhld@) | Executive + tất cả module | `/executive` + tất cả |
| Trưởng phòng Sale | Sales Dashboard | `/sales/dashboard` |
| Trưởng phòng SX | Production Dashboard | `/wms/production/dashboard` |
| Trưởng phòng Kho | WMS Dashboard + Bãi NVL | `/wms` + `/wms/nvl-dashboard` |
| Trưởng phòng KT | Tài chính + công nợ | `/b2b` (phần công nợ) |
| Nhân viên | Công việc của tôi | `/my-tasks` |

---

## 6. KẾ HOẠCH SỬA CHỮA — THEO THỨ TỰ ƯU TIÊN

### Nguyên tắc: Sửa từ nền tảng lên, không sửa ngược

```
Thứ tự sửa:
  1. Database (SQL) — nền tảng, ảnh hưởng tất cả
  2. Services (logic) — business logic
  3. Pages (UI) — giao diện
  4. Dashboard — tổng hợp, sửa cuối cùng
```

### Phase S-A: Database + Sản phẩm + Khách hàng (NỀN TẢNG)

```
Thêm 16 cột sales_orders
Thêm 4 sản phẩm (RSS1, RSS3, SBR1502, Compound)
Import 25 khách hàng thật
Thêm payment terms mới
→ Không ảnh hưởng code hiện tại (chỉ thêm, không sửa)
```

### Phase S-B: Phân quyền (QUAN TRỌNG — ảnh hưởng toàn bộ Sales UI)

```
Tạo salesPermissionService
Áp dụng vào tất cả trang Sales
→ Ảnh hưởng: Tất cả pages/sales/
→ Test: 4 role khác nhau phải thấy đúng quyền
```

### Phase S-C: Tab Tài chính + Logistics (MỞ RỘNG)

```
Thêm tab Tài chính vào SalesOrderDetailPage
Thêm fields logistics (B/L, DHL, booking)
→ Ảnh hưởng: SalesOrderDetailPage, salesOrderService
→ Test: Kế toán chỉnh được tab Tài chính, Logistics chỉnh được booking
```

### Phase S-D: Shipment Following (TRANG MỚI)

```
Trang theo dõi lô hàng (giống Excel hiện tại)
→ Không ảnh hưởng code cũ (trang mới 100%)
→ Test: Data hiện đúng, export Excel
```

### Phase S-E: Executive Dashboard (TỔNG HỢP — SỬA CUỐI)

```
Tạo trang /executive cho BGĐ
Tổng hợp data từ TẤT CẢ modules
→ Ảnh hưởng: Cần tất cả module hoạt động đúng trước
→ Test: Data chính xác từ Sales + B2B + WMS + HR
```

### Phase S-F: Fix 6 Critical Gaps (SỬA SAU KHI CÓ NỀN TẢNG)

```
Gap 1: SX xong → auto nhập kho TP
Gap 2: SO ready → auto tạo xuất kho
Gap 3: QC → auto update deal
Gap 4: Deal ready → auto notification quyết toán
Gap 5: Thanh toán → auto sổ cái
Gap 6: Task link module nghiệp vụ

→ Mỗi gap sửa riêng, test riêng
→ Ghi nhật ký chi tiết cho mỗi gap
```

---

## 7. CHECKLIST TRƯỚC KHI SỬA

Trước mỗi lần sửa code, phải kiểm tra:

- [ ] Đã đọc file SYSTEM_FLOW_ANALYSIS.md (file này)
- [ ] Xác định module nào bị ảnh hưởng
- [ ] Liệt kê test case cần chạy lại
- [ ] Backup data nếu sửa database
- [ ] Ghi nhật ký sau khi sửa xong
- [ ] Chạy `npx tsc --noEmit` trước khi push
- [ ] Test trên staging trước production

---

## 8. DANH SÁCH FILES QUAN TRỌNG

### Services (logic nghiệp vụ — SỬA CẨN THẬN)

| File | Module | Kết nối với |
|------|--------|------------|
| `salesOrderService.ts` | Sales | Production, Stock-Out, Invoice |
| `salesProductionService.ts` | Sales↔SX | salesOrder, productionService |
| `containerService.ts` | Sales Logistics | salesOrder, stock_batches |
| `documentService.ts` | Sales Docs | salesOrder, QC, containers |
| `dealConfirmService.ts` | B2B | Deal, Advance, Chat, Stock-In |
| `dealWmsService.ts` | B2B↔WMS | Deal, Stock-In, QC, Weighbridge |
| `autoSettlementService.ts` | B2B Finance | Deal, Advance, Settlement |
| `settlementService.ts` | B2B Finance | Settlement, Ledger, Payment |
| `advanceService.ts` | B2B Finance | Deal, Ledger |
| `stockInService.ts` | WMS | Batch, Stock-Levels, Deal |
| `stockOutService.ts` | WMS | Batch, Stock-Levels, Picking |
| `productionService.ts` | SX | Batch, Output, Stages |
| `qcService.ts` | QC | Batch, QC Results, Deal |
| `batchService.ts` | WMS Core | Batch (dùng bởi nhiều module) |
| `performanceService.ts` | HR | Task, Evaluation, Attendance |
| `taskService.ts` | Task | Task, Checklist, Approval |

### Edge Functions (chạy server-side — CẨN THẬN KHI DEPLOY)

| Function | Tần suất | Ảnh hưởng |
|----------|---------|-----------|
| `task-recurring-generator` | 6:00 AM hàng ngày | Task tự động |
| `task-reminders` | 8:00 AM hàng ngày | Email nhắc nhở |
| `auto-checkout` | Mỗi 30 phút | Chấm công |

---

> Phân tích luồng tổng thể Huy Anh ERP v8
> Tài liệu nội bộ — 30/03/2026
