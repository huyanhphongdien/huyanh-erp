# LUỒNG CÔNG VIỆC B2B DEAL — TỪ CHỐT ĐẾN THANH TOÁN
## Phân tích chi tiết từng bước + modules liên quan

---

## 1. TỔNG QUAN LUỒNG

```
                        ┌─────────────┐
                        │  NHU CẦU MUA │
                        │  (Demand)    │
                        └──────┬──────┘
                               │ Đăng lên Portal
                               ▼
                        ┌─────────────┐
                        │  BÁO GIÁ    │
                        │  (Offer)     │◄── Đại lý gửi qua Portal
                        └──────┬──────┘
                               │ Duyệt / Chấp nhận
                               ▼
                        ┌─────────────┐
                        │  CHỐT MỦ    │
                        │  (Booking)   │◄── Chat: gửi phiếu chốt
                        └──────┬──────┘
                               │ Xác nhận
                               ▼
  ┌──────────────────────────────────────────────────────┐
  │               ① TẠO DEAL (processing)                │
  │  deal_number, partner, product, quantity, price       │
  └──────────┬──────────┬──────────┬──────────┬──────────┘
             │          │          │          │
    ┌────────┘   ┌──────┘   ┌──────┘   ┌──────┘
    ▼            ▼          ▼          ▼
  ┌────┐    ┌──────┐    ┌────┐    ┌──────┐
  │② TU│    │③ KHO │    │④ QC│    │⑤ SX  │
  └──┬─┘    └───┬──┘    └──┬─┘    └───┬──┘
     │          │          │          │
     ▼          ▼          ▼          ▼
  ┌──────────────────────────────────────────────────────┐
  │           ⑥ DUYỆT DEAL (accepted)                    │
  │  Đủ: actual_weight + actual_drc + qc_status=passed   │
  └──────────────────────┬───────────────────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────────────────┐
  │           ⑦ QUYẾT TOÁN (settled)                     │
  │  final_value − total_advanced = balance_due           │
  └──────────────────────┬───────────────────────────────┘
                         │
                         ▼
  ┌──────────────────────────────────────────────────────┐
  │           ⑧ THANH TOÁN (paid)                        │
  │  Chuyển khoản balance_due → đại lý                   │
  └──────────────────────────────────────────────────────┘
```

---

## 2. CHI TIẾT TỪNG BƯỚC

### BƯỚC 0: NHU CẦU → BÁO GIÁ → BOOKING (trước Deal)

| Hạng mục | Chi tiết |
|---|---|
| **Module** | B2B Demands, B2B Chat |
| **ERP pages** | `/b2b/demands/new` → `/b2b/demands/:id` |
| **Portal pages** | `/partner/demands` → `/partner/demands/:id` |
| **Tables** | `b2b_demands`, `b2b_demand_offers`, `b2b_chat_messages` (type=booking) |
| **Services ERP** | `demandService.ts`, `chatMessageService.ts` |
| **Services Portal** | `demandService.ts`, `chatService.ts` |

**Luồng:**
1. ERP: Thu mua tạo nhu cầu (product_type, quantity, price range, deadline)
2. Portal: Đại lý thấy nhu cầu → gửi báo giá (price, quantity, DRC, region, multi-lot)
3. ERP: Duyệt/từ chối báo giá
4. Chat: Thu mua gửi phiếu chốt mủ (booking card) trong chat
5. Đại lý hoặc nhà máy xác nhận booking → tạo Deal

**Cần kiểm tra:**
- [ ] Tạo demand hoạt động đúng
- [ ] Đại lý gửi báo giá multi-lot (đã fix B2 phase)
- [ ] Auto-matching gợi ý đại lý khi tạo demand (B4.1)
- [ ] Booking card hiện đúng trong chat
- [ ] Xác nhận booking tạo deal thành công

---

### BƯỚC 1: TẠO DEAL

| Hạng mục | Chi tiết |
|---|---|
| **Trigger** | Xác nhận booking card trong chat |
| **Module** | B2B Deals, B2B Chat |
| **ERP page** | `/b2b/deals/:id` (auto redirect sau confirm) |
| **Table** | `b2b_deals` |
| **Service** | `dealConfirmService.ts` |
| **Status** | `processing` |

**Dữ liệu tạo:**
```
b2b_deals:
  deal_number     = DL2604-XXXX (auto)
  partner_id      = đại lý
  product_code    = mu_tap / mu_nuoc / ...
  quantity_kg     = số lượng × 1000
  unit_price      = giá VNĐ/kg
  total_value_vnd = ước tính
  expected_drc    = DRC dự kiến
  status          = 'processing'
  booking_id      = ID tin nhắn booking
  lot_code        = mã lô (nếu có)
  source_region   = vùng nguyên liệu
  pickup_location_name = nơi bốc hàng
```

**Cần kiểm tra:**
- [ ] Deal tạo từ chat booking hoạt động
- [ ] Deal tạo từ Portal confirm hoạt động (B2.1 advance fix)
- [ ] Deal number unique, không duplicate
- [ ] DealCard message gửi vào chat sau confirm
- [ ] Advance tạo nếu has_advance = true

---

### BƯỚC 2: TẠM ỨNG (Advance)

| Hạng mục | Chi tiết |
|---|---|
| **Trigger** | Manual: click "Ứng thêm tiền" trong Deal Detail |
| **Module** | B2B Advances |
| **ERP page** | `/b2b/deals/:id` → Tab "Tạm ứng" |
| **Table** | `b2b_advances`, `b2b_partner_ledger` |
| **Service** | `advanceService.ts`, `dealChatActionsService.ts` |
| **Ai làm** | Kế toán / Thu mua |

**Luồng:**
1. Mở Deal → Tab "Tạm ứng" → Click "Ứng thêm tiền"
2. Nhập số tiền, phương thức (cash/bank_transfer)
3. Hệ thống: tạo advance record → ghi ledger → update deal.total_advanced
4. Gửi notification vào chat: "Đã tạm ứng X VNĐ"

**Cần kiểm tra:**
- [ ] Tạo advance hoạt động (cả từ ERP và Portal)
- [ ] Ledger ghi đúng (debit/credit)
- [ ] Deal.total_advanced cập nhật
- [ ] Deal.balance_due = total_value − total_advanced
- [ ] Chat notification gửi đúng
- [ ] Không advance được khi deal đã settled/cancelled

---

### BƯỚC 3: NHẬP KHO (Stock In)

| Hạng mục | Chi tiết |
|---|---|
| **Trigger** | Xe chở mủ vào nhà máy → cân → nhập kho |
| **Module** | WMS (Warehouse Management) |
| **ERP page** | `/wms/stock-in` → tạo phiếu → link deal_id |
| **Tables** | `stock_in_orders`, `stock_in_details`, `inventory` |
| **Service** | `stockInService.ts`, `dealWmsService.ts` |
| **Ai làm** | Kho / Cân |

**Luồng:**
1. WMS → Nhập kho → Tạo phiếu nhập → Chọn Deal liên kết
2. Nhập: trọng lượng, số lô, vị trí kho, xe/tài xế
3. Cân: ghi trọng lượng (hoặc tự động từ weighbridge)
4. Confirm phiếu nhập → cập nhật inventory
5. Auto update deal: `stock_in_count++`, `actual_weight_kg += weight`

**Cần kiểm tra:**
- [ ] Phiếu nhập kho link được deal_id
- [ ] Trọng lượng cập nhật vào deal.actual_weight_kg
- [ ] stock_in_count tăng
- [ ] Inventory cập nhật đúng vị trí kho
- [ ] Nhiều phiếu nhập cho 1 deal (giao hàng nhiều đợt)
- [ ] Weighbridge integration (nếu có)

---

### BƯỚC 4: KIỂM TRA CHẤT LƯỢNG (QC / DRC)

| Hạng mục | Chi tiết |
|---|---|
| **Trigger** | Sau nhập kho → lấy mẫu → test DRC |
| **Module** | WMS QC |
| **ERP page** | `/wms/qc` hoặc `/b2b/deals/:id` → Tab "QC" |
| **Tables** | `quality_checks`, `stock_in_details` (batch_drc) |
| **Service** | `qcService.ts`, `dealWmsService.ts` |
| **Ai làm** | Phòng QC |

**Luồng:**
1. QC lấy mẫu từ batch đã nhập kho
2. Test: DRC, tạp chất, độ ẩm, Mooney viscosity
3. Nhập kết quả: initial_drc, latest_drc, qc_status (passed/warning/failed)
4. Auto: `dealWmsService.updateDealActualDrc(dealId)`
   → actual_drc = bình quân gia quyền (weighted by batch weight)
5. Auto: qc_status tổng hợp (all passed → passed, any failed → failed)

**Công thức DRC bình quân:**
```
actual_drc = Σ(batch_weight × batch_drc) / Σ(batch_weight)
```

**Cần kiểm tra:**
- [ ] QC results link đúng batch → deal
- [ ] actual_drc tính đúng weighted average
- [ ] qc_status tổng hợp đúng logic
- [ ] DRC variance giữa expected vs actual
- [ ] Multiple batches QC cho 1 deal

---

### BƯỚC 5: SẢN XUẤT (Production)

| Hạng mục | Chi tiết |
|---|---|
| **Trigger** | Sau nhập kho → tạo lệnh sản xuất |
| **Module** | WMS Production |
| **ERP page** | `/wms/production` hoặc `/b2b/deals/:id` → Tab "Sản xuất" |
| **Tables** | `production_orders`, `production_stages` |
| **Service** | `productionService.ts`, `dealProductionService.ts` |
| **Ai làm** | Phòng QLSX |

**Luồng:**
1. Tạo lệnh sản xuất từ batches đã nhập → link deal_id
2. Chọn BOM (Bill of Materials) / công thức phối trộn
3. Tracking: stage hiện tại, target_quantity, actual_quantity
4. Hoàn thành → output ghi nhận

**Lưu ý:** Bước này chỉ áp dụng khi:
- Mủ cần chế biến (SVR, TSR) trước khi xuất
- Deal type = 'processing' (gia công)
- Nếu deal type = 'purchase' (mua thẳng) → có thể bỏ qua bước này

**Cần kiểm tra:**
- [ ] Lệnh SX link đúng deal_id
- [ ] Batches từ stock_in → production_order đúng
- [ ] Stage tracking hoạt động
- [ ] Output quantity ghi nhận

---

### BƯỚC 5B: XỬ LÝ MỦ + BIÊN BẢN (Portal side)

| Hạng mục | Chi tiết |
|---|---|
| **Trigger** | Portal: đại lý/nhà máy gia công → tạo processing order |
| **Module** | B2B Processing, B2B Acceptance |
| **Portal pages** | Processing orders, Acceptance signing |
| **ERP pages** | `/b2b/deals/:id` → Tab "Xử lý mủ" + Tab "Biên bản" |
| **Tables** | `b2b.processing_orders`, `b2b.acceptances` |
| **Ai xem ERP** | Quản lý, Thu mua |

**Luồng:**
1. Portal: tạo processing order (input tons, output tons, fee)
2. Portal: xử lý → tracking tiến trình
3. Portal: hoàn thành → tạo biên bản nghiệm thu
4. Portal: nhà máy ký + đại lý ký (digital signature)
5. ERP: xem tất cả qua Tab "Xử lý mủ" + Tab "Biên bản" (đã tạo Phase B1)

**Cần kiểm tra:**
- [ ] ERP Tab "Xử lý mủ" hiện đúng data từ b2b.processing_orders
- [ ] ERP Tab "Biên bản" hiện đúng data + chữ ký + PDF
- [ ] Timeline processing hiện đúng trạng thái
- [ ] Tranh chấp (dispute) hiện đúng nếu có

---

### BƯỚC 5C: HỢP ĐỒNG (Contract)

| Hạng mục | Chi tiết |
|---|---|
| **Trigger** | Portal: upload hợp đồng → ký |
| **Module** | B2B Contracts |
| **Portal pages** | Contract management |
| **ERP pages** | `/b2b/deals/:id` → Tab "Hợp đồng" |
| **Tables** | `b2b.contracts` |

**Cần kiểm tra:**
- [ ] ERP Tab "Hợp đồng" hiện đúng file + status ký
- [ ] Download file hợp đồng hoạt động
- [ ] Cảnh báo hết hạn hoạt động

---

### BƯỚC 6: DUYỆT DEAL (Processing → Accepted)

| Hạng mục | Chi tiết |
|---|---|
| **Trigger** | Manual: Quản lý click "Duyệt Deal" |
| **Điều kiện** | actual_weight_kg > 0 AND actual_drc > 0 AND qc_status = 'passed' |
| **Module** | B2B Deals |
| **ERP page** | `/b2b/deals/:id` → Tab "Thông tin" → Button "Duyệt" |
| **Service** | `dealService.ts` → `acceptDeal()` |
| **Ai làm** | Quản lý / Giám đốc |

**Khi duyệt:**
```
deal.status         = 'accepted'
deal.final_price    = unit_price (hoặc adjusted nếu DRC khác)
deal.final_value    = actual_weight_kg × (actual_drc / 100) × final_price
deal.balance_due    = final_value − total_advanced
```

**Cần kiểm tra:**
- [ ] Không duyệt được nếu thiếu weight/DRC/QC
- [ ] final_value tính đúng công thức
- [ ] balance_due cập nhật
- [ ] Status chuyển sang 'accepted'

---

### BƯỚC 7: QUYẾT TOÁN (Accepted → Settled)

| Hạng mục | Chi tiết |
|---|---|
| **Trigger** | Click "Quyết toán" trong Deal Detail |
| **Module** | B2B Settlements |
| **ERP pages** | `/b2b/settlements/new` → `/b2b/settlements/:id` |
| **Tables** | `b2b_settlements`, `b2b_settlement_advances`, `b2b_partner_ledger` |
| **Service** | `settlementService.ts`, `autoSettlementService.ts` |
| **Ai làm** | Kế toán |

**Phiếu quyết toán bao gồm:**
```
Tổng giá trị hàng:        2,250,000,000 VNĐ
  (50T × 62% DRC × 45,000 VNĐ/kg khô)
Trừ tạm ứng đợt 1:         -500,000,000 VNĐ
Trừ tạm ứng đợt 2:         -200,000,000 VNĐ
Trừ chi phí vận chuyển:      -50,000,000 VNĐ
────────────────────────────────────────
CÒN PHẢI TRẢ:             1,500,000,000 VNĐ
```

**Luồng:**
1. Hệ thống tự tính: gross = weight × DRC% × price
2. Trừ tất cả advances đã ứng
3. Trừ các khoản deduction (nếu có)
4. Tạo phiếu quyết toán (status = 'draft')
5. Kế toán duyệt → status = 'approved'
6. Deal.status → 'settled'

**Cần kiểm tra:**
- [ ] Auto tính đúng gross amount
- [ ] Advances liên kết đúng
- [ ] Deductions tính đúng
- [ ] Balance due = gross − advances − deductions
- [ ] Phiếu QT tạo thành công
- [ ] Deal status chuyển 'settled'
- [ ] Ledger ghi đúng

---

### BƯỚC 8: THANH TOÁN (Payment)

| Hạng mục | Chi tiết |
|---|---|
| **Trigger** | Sau khi phiếu QT được duyệt |
| **Module** | B2B Payments, Ledger |
| **ERP pages** | Phiếu quyết toán → "Thanh toán" |
| **Tables** | `b2b_settlement_payments`, `b2b_partner_ledger` |
| **Service** | `paymentService.ts`, `ledgerService.ts` |
| **Ai làm** | Kế toán |

**Luồng:**
1. Mở phiếu QT đã duyệt → Click "Ghi nhận thanh toán"
2. Nhập: số tiền, phương thức (bank/cash), mã giao dịch ngân hàng
3. Hệ thống: tạo payment record → ghi ledger → update settlement status
4. Nếu thanh toán đủ → settlement.status = 'paid'
5. Gửi notification chat: "Đã thanh toán X VNĐ"

**Cần kiểm tra:**
- [ ] Thanh toán một phần (partial payment)
- [ ] Thanh toán nhiều đợt
- [ ] Ledger ghi đúng mỗi lần thanh toán
- [ ] Settlement status chuyển 'paid' khi đủ
- [ ] Không thanh toán vượt balance_due

---

## 3. BẢNG TỔNG HỢP MODULE LIÊN QUAN

### ERP Services (src/services/b2b/)

| Service | Vai trò | Bước |
|---|---|---|
| `demandService.ts` | Tạo/quản lý nhu cầu mua | 0 |
| `dealConfirmService.ts` | Xác nhận booking → tạo Deal | 1 |
| `dealService.ts` | CRUD Deal, accept, update | 1-6 |
| `dealChatActionsService.ts` | Actions từ chat (advance, delivery) | 2 |
| `advanceService.ts` | Tạo/quản lý tạm ứng | 2 |
| `dealWmsService.ts` | Link Deal ↔ WMS (stock in, QC) | 3-4 |
| `dealProductionService.ts` | Link Deal ↔ Production | 5 |
| `autoSettlementService.ts` | Auto tính phiếu quyết toán | 7 |
| `settlementService.ts` | CRUD Settlement | 7 |
| `paymentService.ts` | Ghi nhận thanh toán | 8 |
| `ledgerService.ts` | Ghi sổ công nợ | 2,7,8 |
| `chatMessageService.ts` | Chat notifications | All |
| `partnerMatchingService.ts` | Gợi ý đại lý (AI matching) | 0 |

### ERP Pages

| Page | URL | Bước |
|---|---|---|
| DemandCreatePage | `/b2b/demands/new` | 0 |
| DemandDetailPage | `/b2b/demands/:id` | 0 |
| B2BChatRoomPage | `/b2b/chat/:roomId` | 0-1 |
| DealDetailPage | `/b2b/deals/:id` | 1-8 (8 tabs) |
| StockInCreatePage | `/wms/stock-in` | 3 |
| QCDashboardPage | `/wms/qc` | 4 |
| ProductionListPage | `/wms/production` | 5 |
| SettlementCreatePage | `/b2b/settlements/new` | 7 |
| SettlementDetailPage | `/b2b/settlements/:id` | 7-8 |
| AuctionListPage | `/b2b/auctions` | 0 (alt) |
| B2BAnalyticsDashboard | `/b2b/analytics` | Reporting |
| PriceIntelligencePage | `/b2b/price-intelligence` | Reporting |

### Deal Detail Tabs

| Tab | Component | Bước | Data source |
|---|---|---|---|
| Thông tin | inline | 1,6 | `b2b_deals` |
| Nhập kho | DealWmsTab | 3 | `stock_in_orders` |
| QC | DealQcTab | 4 | `quality_checks` |
| Sản xuất | DealProductionTab | 5 | `production_orders` |
| Tạm ứng | DealAdvancesTab | 2 | `b2b_advances` |
| Xử lý mủ | DealProcessingTab | 5B | `b2b.processing_orders` |
| Biên bản | DealAcceptanceTab | 5B | `b2b.acceptances` |
| Hợp đồng | DealContractTab | 5C | `b2b.contracts` |

### Portal Pages liên quan

| Page | URL | Bước |
|---|---|---|
| PartnerDemandsPage | `/partner/demands` | 0 |
| PartnerDemandDetailPage | `/partner/demands/:id` | 0 (gửi báo giá) |
| PartnerChatRoomPage | `/partner/chat/:roomId` | 0-1 |
| PartnerDealDetailPage | `/partner/deals/:id` | 1-8 |
| PartnerBookingListPage | `/partner/bookings` | 0-1 |
| PartnerAcceptancePage | `/partner/acceptance` | 5B |
| PartnerSettlementListPage | `/partner/settlements` | 7-8 |
| PartnerDebtPage | `/partner/debt` | 8 |

### Database Tables

| Table | Schema | Bước | Ghi chú |
|---|---|---|---|
| `b2b_demands` | public | 0 | Nhu cầu mua |
| `b2b_demand_offers` | public | 0 | Báo giá đại lý |
| `b2b_chat_messages` | public | All | Chat messages |
| `b2b_chat_rooms` | public | All | Chat rooms |
| `b2b_deals` | public | 1-8 | **Core table** |
| `b2b_advances` | public | 2 | Tạm ứng |
| `b2b_partner_ledger` | public | 2,7,8 | Sổ công nợ |
| `stock_in_orders` | public | 3 | Phiếu nhập kho |
| `stock_in_details` | public | 3 | Chi tiết phiếu nhập |
| `inventory` | public | 3 | Tồn kho |
| `quality_checks` | public | 4 | Kết quả QC |
| `production_orders` | public | 5 | Lệnh sản xuất |
| `b2b.processing_orders` | b2b | 5B | Xử lý mủ (Portal) |
| `b2b.acceptances` | b2b | 5B | Biên bản (Portal) |
| `b2b.contracts` | b2b | 5C | Hợp đồng (Portal) |
| `b2b_settlements` | public | 7 | Phiếu quyết toán |
| `b2b_settlement_advances` | public | 7 | Link QT ↔ tạm ứng |
| `b2b_settlement_payments` | public | 8 | Thanh toán |
| `b2b.auctions` | b2b | 0 (alt) | Đấu giá |
| `b2b.auction_bids` | b2b | 0 (alt) | Lượt đấu giá |

---

## 4. CHECKLIST KIỂM TRA TOÀN BỘ

### Luồng chính (Happy Path)

- [ ] **0.1** Tạo nhu cầu mua thành công
- [ ] **0.2** Auto-matching gợi ý đại lý
- [ ] **0.3** Đại lý gửi báo giá (1 lô)
- [ ] **0.4** Đại lý gửi báo giá (multi-lot)
- [ ] **0.5** ERP duyệt báo giá
- [ ] **0.6** Gửi booking card trong chat
- [ ] **0.7** Xác nhận booking → tạo Deal
- [ ] **1.1** Deal hiện đúng thông tin
- [ ] **1.2** DealCard message trong chat
- [ ] **2.1** Tạm ứng từ Deal tab
- [ ] **2.2** Tạm ứng từ chat action
- [ ] **2.3** Ledger ghi đúng advance
- [ ] **3.1** Tạo phiếu nhập kho link deal
- [ ] **3.2** actual_weight_kg cập nhật
- [ ] **3.3** stock_in_count tăng
- [ ] **4.1** QC batch → DRC result
- [ ] **4.2** actual_drc weighted average đúng
- [ ] **4.3** qc_status tổng hợp đúng
- [ ] **5.1** Lệnh sản xuất link deal
- [ ] **5.2** Production stage tracking
- [ ] **5B.1** Tab "Xử lý mủ" hiện data Portal
- [ ] **5B.2** Tab "Biên bản" hiện chữ ký + PDF
- [ ] **5C.1** Tab "Hợp đồng" hiện file + status ký
- [ ] **6.1** Duyệt deal khi đủ điều kiện
- [ ] **6.2** Không duyệt khi thiếu weight/DRC/QC
- [ ] **6.3** final_value tính đúng
- [ ] **7.1** Tạo phiếu quyết toán auto
- [ ] **7.2** Advances liên kết đúng
- [ ] **7.3** Balance_due đúng
- [ ] **7.4** Deal status → settled
- [ ] **8.1** Ghi nhận thanh toán
- [ ] **8.2** Partial payment
- [ ] **8.3** Settlement → paid khi đủ
- [ ] **8.4** Ledger ghi đúng

### Luồng phụ

- [ ] **A.1** Đấu giá: tạo phiên
- [ ] **A.2** Đấu giá: đại lý bid
- [ ] **A.3** Đấu giá: chọn winner → tạo deal
- [ ] **C.1** Chat: gửi text
- [ ] **C.2** Chat: gửi ảnh
- [ ] **C.3** Chat: reply
- [ ] **C.4** Chat: thu hồi
- [ ] **C.5** Chat: ghim
- [ ] **C.6** Chat: read receipt ✓✓
- [ ] **R.1** Báo cáo: top đại lý
- [ ] **R.2** Báo cáo: funnel conversion
- [ ] **R.3** Báo cáo: settlement aging
- [ ] **R.4** Giá mủ: trend 12 tháng
- [ ] **R.5** Giá mủ: theo vùng

### Edge Cases

- [ ] **E.1** Deal bị cancel giữa chừng
- [ ] **E.2** DRC thực tế thấp hơn expected → giá trị thay đổi
- [ ] **E.3** Đại lý giao thiếu số lượng
- [ ] **E.4** QC fail → dispute
- [ ] **E.5** Thanh toán thừa (overpayment)
- [ ] **E.6** Nhiều deal cùng lúc cho 1 đại lý
- [ ] **E.7** Deal kéo dài > 30 ngày
- [ ] **E.8** Advance > final_value (đại lý nợ ngược)

---

## 5. GAP ANALYSIS

### Thiếu / Chưa implement

| Gap | Mức độ | Giải pháp |
|---|---|---|
| Không có trang "Duyệt Deal" riêng (phải vào từng deal) | Thấp | Thêm batch approval page |
| Auto-settlement chưa trừ chi phí vận chuyển | Trung bình | Thêm deduction items vào settlement |
| Không cảnh báo khi DRC thấp hơn expected | Trung bình | Thêm alert khi actual_drc < expected_drc - 5% |
| Không track lịch sử thay đổi deal | Thấp | Thêm deal_history table |
| Portal không thấy được QC result detail | Trung bình | Thêm QC tab vào Portal deal detail |
| Không có dashboard tổng hợp "Deals đang xử lý" | Trung bình | Thêm deal pipeline board |
| Thiếu print phiếu quyết toán PDF | Cao | Thêm PDF export cho settlement |
| Không notify khi deal > 15 ngày chưa settled | Trung bình | Thêm cron job / scheduled check |

---

*Tài liệu tạo: 10/04/2026*
*Dùng cho: Kiểm tra toàn bộ luồng B2B Deal trước go-live*
*Trạng thái: DRAFT — cần test từng checklist item*
