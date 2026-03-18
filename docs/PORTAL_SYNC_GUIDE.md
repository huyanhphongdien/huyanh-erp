# HƯỚNG DẪN ĐỒNG BỘ PORTAL ĐẠI LÝ ↔ ERP

**Dự án:** Huy Anh Rubber ERP v8
**Ngày:** 18/03/2026
**Mục tiêu:** Đảm bảo 6 module trên Portal đại lý khớp với ERP sau khi hoàn thiện B2B Phase 5-6

---

## TỔNG QUAN KIẾN TRÚC

```
┌────────────────────────┐         ┌────────────────────────┐
│   PORTAL ĐẠI LÝ        │         │   ERP NHÀ MÁY          │
│   b2b.huyanhrubber.vn  │         │   huyanhrubber.vn      │
│                        │         │                        │
│   React 19 + Vite 8    │         │   React 18 + Vite 7    │
│   Ant Design 6         │         │   Ant Design 6         │
│   Zustand              │         │   React Query          │
│                        │         │                        │
│  ┌──────────────────┐  │         │  ┌──────────────────┐  │
│  │ sender = partner │  │         │  │ sender = factory │  │
│  └──────────────────┘  │         │  └──────────────────┘  │
└───────────┬────────────┘         └───────────┬────────────┘
            │                                  │
            └──────────┬───────────────────────┘
                       │
              ┌────────▼────────┐
              │    SUPABASE     │
              │  (Cùng database)│
              │                 │
              │  b2b_deals      │
              │  b2b_chat_*     │
              │  b2b_partners   │
              │  stock_in_*     │
              │  production_*   │
              │  b2b_settlements│
              └─────────────────┘
```

---

## 2 DẠNG MUA CỦA HUY ANH

### Dạng 1: MUA NGUYÊN LIỆU (Mua đứt)

```
Đại lý bán mủ → Huy Anh mua → Mủ thuộc sở hữu nhà máy
```

| Đặc điểm | Chi tiết |
|-----------|----------|
| **Quyền sở hữu** | Mủ thuộc nhà máy sau khi mua |
| **Thanh toán** | Tạm ứng + Quyết toán sau QC |
| **Đại lý thấy gì** | Deal, tạm ứng, quyết toán, chat |
| **Đại lý KHÔNG thấy** | Sản xuất, thành phẩm, tồn kho, xuất khẩu |
| **DRC** | Chênh lệch DRC ảnh hưởng giá trị deal |
| **deal_type** | `purchase` |

**Portal hiển thị:**
- ✅ Đơn hàng (deal status, giá, số lượng)
- ✅ Tạm ứng đã nhận
- ✅ Quyết toán (số tiền cuối cùng)
- ✅ DRC thực tế vs dự kiến
- ✅ Chat nhận thông báo nhập kho + QC
- ❌ Lệnh sản xuất (ẩn)
- ❌ Truy xuất thành phẩm (ẩn)
- ❌ Tồn kho nhà máy (ẩn)

### Dạng 2: GIA CÔNG (Chạy đầu ra)

```
Đại lý gửi mủ → Huy Anh gia công → Thành phẩm trả lại đại lý
```

| Đặc điểm | Chi tiết |
|-----------|----------|
| **Quyền sở hữu** | Mủ vẫn thuộc đại lý, nhà máy gia công |
| **Thanh toán** | Đại lý trả phí gia công |
| **Đại lý thấy gì** | Deal, lịch sản xuất, nghiệm thu, thành phẩm |
| **Đại lý KHÔNG thấy** | Giá thành sản xuất nội bộ, tồn kho của deal khác |
| **DRC** | DRC output ảnh hưởng yield → phí gia công |
| **deal_type** | `processing` |

**Portal hiển thị:**
- ✅ Đơn hàng (deal status, phí gia công)
- ✅ Lịch sản xuất (slot đặt trước)
- ✅ Tiến độ sản xuất (đang ở công đoạn nào)
- ✅ Nghiệm thu (QC thành phẩm, đại lý ký biên bản)
- ✅ Thành phẩm output (số lượng, grade, DRC)
- ❌ Chi phí sản xuất nội bộ (ẩn)
- ❌ Nguyên liệu deal khác (ẩn)

---

## 6 MODULE PORTAL — CẬP NHẬT ĐỂ KHỚP ERP

### Module 1: NHU CẦU MUA (Demands)

**Route Portal:** `/partner/demands`
**File Portal:** `src/pages/partner/PartnerDemandsPage.tsx`
**Bảng DB:** `b2b_demands`

**Hiện tại:** Đại lý xem danh sách nhu cầu mua của nhà máy
**Cần cập nhật:**

| Task | Mô tả | Ưu tiên |
|------|-------|---------|
| Thêm filter theo product_type | Mủ đông / Mủ nước / Mủ tạp / SVR | TB |
| Hiển thị DRC yêu cầu | `expected_drc` từ demand | CAO |
| Hiển thị vùng thu mua | `region` preference | TB |
| Nút "Gửi chào giá" | Tạo booking từ demand | CAO |

**Logic phân quyền:**
```
Dạng Mua đứt: Đại lý thấy demands + gửi chào giá
Dạng Gia công: Đại lý thấy demands (nếu có) + đặt slot gia công
```

---

### Module 2: ĐẤU THẦU (Auctions)

**Route Portal:** `/partner/auctions`
**File Portal:** `src/pages/partner/PartnerAuctionsPage.tsx`
**Bảng DB:** `b2b_auctions`

**Hiện tại:** Đại lý tham gia đấu giá
**Cần cập nhật:**

| Task | Mô tả | Ưu tiên |
|------|-------|---------|
| Hiển thị DRC yêu cầu | Nhà máy yêu cầu DRC bao nhiêu | CAO |
| Hiển thị giá sàn/trần | Min/max price range | TB |
| Countdown timer | Thời gian còn lại đấu thầu | TB |
| Kết quả trúng thầu → auto tạo Deal | Link auction_id → deal | CAO |

---

### Module 3: ĐƠN HÀNG (Deals) ⭐ CẬP NHẬT NHIỀU NHẤT

**Route Portal:** `/partner/deals`, `/partner/deals/:id`
**Files Portal:** `PartnerDealsPage.tsx`, `PartnerDealDetailPage.tsx`
**Bảng DB:** `b2b_deals`

**Hiện tại:** Đại lý xem deal, status, giá
**Cần cập nhật cho khớp ERP Phase 5-6:**

| Task | Mô tả | ERP tương ứng | Ưu tiên |
|------|-------|---------------|---------|
| **DRC Variance** | Hiện chênh lệch DRC dự kiến vs thực tế | `DrcVarianceCard.tsx` | CAO |
| **Quyết toán tab** | Hiện settlement info (nếu có) | `DealAdvancesTab.tsx` | CAO |
| **Tiến độ nhập kho** | Hiện bao nhiêu tấn đã nhập vs tổng deal | `DealWmsTab.tsx` | CAO |
| **QC status badge** | Badge trạng thái QC trên deal card | `DealQcTab.tsx` | TB |
| **Sản xuất tab** (chỉ Gia công) | Tiến độ SX, công đoạn hiện tại | `DealProductionTab.tsx` | CAO |
| **Nghiệm thu** (chỉ Gia công) | Link đến acceptance page | Mới | TB |

**Logic phân quyền theo deal_type:**

```typescript
// Portal DealDetailPage
const tabs = [
  { key: 'info', label: 'Thông tin', always: true },
  { key: 'advances', label: 'Tạm ứng', show: deal.deal_type === 'purchase' },
  { key: 'settlement', label: 'Quyết toán', show: deal.deal_type === 'purchase' },
  { key: 'drc', label: 'DRC', always: true },
  { key: 'delivery', label: 'Nhập kho', always: true },
  // CHỈ HIỆN CHO GIA CÔNG:
  { key: 'production', label: 'Sản xuất', show: deal.deal_type === 'processing' },
  { key: 'output', label: 'Thành phẩm', show: deal.deal_type === 'processing' },
]
```

**Dữ liệu đại lý ĐƯỢC thấy:**

| Field | Mua đứt | Gia công |
|-------|---------|----------|
| deal_number, status | ✅ | ✅ |
| product_name, quantity_kg | ✅ | ✅ |
| unit_price, total_value | ✅ | ❌ (thấy phí gia công) |
| expected_drc, actual_drc | ✅ | ✅ |
| actual_weight_kg | ✅ | ✅ |
| final_value | ✅ | ❌ |
| stock_in_count | ✅ | ✅ |
| qc_status | ✅ | ✅ |
| processing_fee_per_ton | ❌ | ✅ |
| expected_output_rate | ❌ | ✅ |
| production stage | ❌ | ✅ |
| output batches (TP) | ❌ | ✅ |

---

### Module 4: LỊCH SẢN XUẤT (Schedule) — CHỈ GIA CÔNG

**Route Portal:** `/partner/schedule`
**File Portal:** `src/pages/partner/PartnerSchedulePage.tsx`
**Bảng DB:** `production_slots` (cần tạo nếu chưa có)

**Mục tiêu:** Đại lý gia công đặt slot sản xuất trước

**Cần cập nhật:**

| Task | Mô tả | Ưu tiên |
|------|-------|---------|
| Hiển thị calendar slots | Lịch dây chuyền còn trống | CAO |
| Đặt slot | Chọn ngày + dây chuyền + SL | CAO |
| Link deal → slot | Slot gắn với deal gia công | CAO |
| Tiến độ sản xuất | Hiện công đoạn hiện tại (1-5) | TB |
| Thông báo khi hoàn thành | Push notification | TB |

**Logic:**
```
Đại lý đặt slot → Nhà máy duyệt → Sản xuất → Nghiệm thu → Giao TP
```

**Chỉ hiện cho deal_type = 'processing'**

---

### Module 5: NGHIỆM THU (Acceptance) — CHỈ GIA CÔNG

**Route Portal:** `/partner/acceptance`
**File Portal:** `src/pages/partner/PartnerAcceptancePage.tsx`
**Bảng DB:** `production_qc_results`, `production_output_batches`

**Mục tiêu:** Đại lý gia công kiểm tra & ký nhận thành phẩm

**Cần cập nhật:**

| Task | Mô tả | Ưu tiên |
|------|-------|---------|
| Danh sách lô TP chờ nghiệm thu | Output batches status = 'created' | CAO |
| Chi tiết lô: grade, DRC, SL, ảnh | QC results + batch info | CAO |
| Nút "Chấp nhận" / "Từ chối" | Đại lý xác nhận chất lượng | CAO |
| Biên bản nghiệm thu PDF | Export PDF ký xác nhận | TB |
| Ảnh chụp sản phẩm | Từ QC images | TB |

**Dữ liệu đại lý thấy:**
```
Lô TP: TP-SVR10-20260318-001
├── Grade: SVR 10
├── DRC: 52.3%
├── Số lượng: 5,200 kg
├── Số bành: 156 bành × 33.33kg
├── QC Results:
│   ├── Moisture: 0.45% ✅
│   ├── Dirt: 0.03% ✅
│   ├── Ash: 0.42% ✅
│   └── PRI: 42 ✅
├── Yield: 82% (so với NVL đầu vào)
└── Trạng thái: Chờ nghiệm thu
```

**Chỉ hiện cho deal_type = 'processing'**

---

### Module 6: TIN NHẮN (Messages) ⭐ CẬP NHẬT THÔNG BÁO MỚI

**Route Portal:** `/partner/chat`, `/partner/chat/:roomId`
**Files Portal:** `PartnerChatListPage.tsx`, `PartnerChatRoomPage.tsx`
**Bảng DB:** `b2b_chat_messages`

**Hiện tại:** Chat 2 chiều, booking, deal card
**Cần cập nhật cho khớp ERP Phase 5-6:**

| Task | Mô tả | ERP nguồn | Ưu tiên |
|------|-------|-----------|---------|
| **Thông báo nhập kho** | "Đã nhập 5.2T cho Deal X" | `notifyDealChatStockIn` | ✅ Đã có |
| **Thông báo QC** | "DRC thực tế = 53.5%" | `notifyDealChatQcUpdate` | ✅ Đã có |
| **Thông báo quyết toán** | "Đã tạo QT cho Deal X" | `notifyDealChatSettlement` | 🆕 Cần thêm card |
| **Thông báo tạm ứng** | "Đã chi 50M cho Deal X" | `notifyDealChatAdvance` | 🆕 Cần thêm card |
| **Settlement Card** | Card hiện thông tin quyết toán | Mới | CAO |
| **Advance Card** | Card hiện thông tin tạm ứng | Mới | TB |

**Cập nhật ChatMessageBubble.tsx trong Portal:**

```typescript
// Thêm xử lý message_type cho notifications mới
case 'system':
  if (metadata?.notification_type === 'settlement_update') {
    return <SettlementNotifCard settlement={metadata} />
  }
  if (metadata?.notification_type === 'advance_paid') {
    return <AdvanceNotifCard advance={metadata} />
  }
  if (metadata?.notification_type === 'stock_in_confirmed') {
    return <StockInNotifCard stockIn={metadata} />  // đã có
  }
  if (metadata?.notification_type === 'qc_completed') {
    return <QcNotifCard qc={metadata} />  // đã có
  }
```

---

## BẢNG PHÂN QUYỀN THEO DEAL_TYPE

```
┌─────────────────────┬──────────────────┬──────────────────┐
│     MODULE          │  MUA ĐỨT         │  GIA CÔNG        │
│                     │  (purchase)      │  (processing)    │
├─────────────────────┼──────────────────┼──────────────────┤
│ Nhu cầu mua         │  ✅ Xem + Chào   │  ✅ Xem + Đặt    │
│ Đấu thầu           │  ✅               │  ✅               │
│ Đơn hàng            │  ✅               │  ✅               │
│  → Tab Tạm ứng     │  ✅               │  ❌ Ẩn           │
│  → Tab Quyết toán  │  ✅               │  ❌ Ẩn           │
│  → Tab DRC          │  ✅               │  ✅               │
│  → Tab Nhập kho    │  ✅               │  ✅               │
│  → Tab Sản xuất    │  ❌ Ẩn           │  ✅               │
│  → Tab Thành phẩm  │  ❌ Ẩn           │  ✅               │
│ Lịch sản xuất       │  ❌ Ẩn           │  ✅               │
│ Nghiệm thu          │  ❌ Ẩn           │  ✅               │
│ Tin nhắn            │  ✅               │  ✅               │
│  → Thông báo NK     │  ✅               │  ✅               │
│  → Thông báo QC     │  ✅               │  ✅               │
│  → Thông báo QT     │  ✅               │  ❌               │
│  → Thông báo SX     │  ❌               │  ✅               │
└─────────────────────┴──────────────────┴──────────────────┘
```

---

## CHECKLIST CẬP NHẬT PORTAL

### Ưu tiên 1: Đơn hàng (Deal Detail) — 2 ngày
```
□ Thêm DrcVarianceCard (copy từ ERP, adjust cho Portal)
□ Thêm tab Quyết toán (chỉ Mua đứt)
  - Hiện settlement status, số tiền, timeline
  - KHÔNG có nút duyệt (chỉ nhà máy duyệt)
□ Thêm tab Sản xuất (chỉ Gia công)
  - Hiện production order status, công đoạn, yield
  - KHÔNG có nút thao tác (chỉ xem)
□ Thêm tab Thành phẩm (chỉ Gia công)
  - Hiện output batches, grade, DRC, SL
  - Nút "Nghiệm thu" navigate → acceptance page
□ Cập nhật deal card hiện DRC badge + QC status
□ Logic deal_type phân quyền tabs
```

### Ưu tiên 2: Tin nhắn — 1 ngày
```
□ Thêm SettlementNotifCard component
□ Thêm AdvanceNotifCard component
□ Thêm ProductionNotifCard component (cho Gia công)
□ Cập nhật ChatMessageBubble xử lý notification_type mới
□ Test: ERP tạo Settlement → Portal nhận thông báo chat
```

### Ưu tiên 3: Lịch sản xuất — 1.5 ngày
```
□ Tạo bảng production_slots (nếu chưa có)
□ Calendar view hiện slots trống
□ Form đặt slot (deal_id, ngày, dây chuyền, SL)
□ Trạng thái slot: pending → approved → in_production → completed
□ Notification khi slot được duyệt
```

### Ưu tiên 4: Nghiệm thu — 1.5 ngày
```
□ List lô TP chờ nghiệm thu (của đại lý này)
□ Chi tiết lô: grade, DRC, QC results
□ Nút Accept / Reject
□ PDF biên bản nghiệm thu
□ Notification khi nghiệm thu hoàn tất
```

### Ưu tiên 5: Nhu cầu mua + Đấu thầu — 1 ngày
```
□ Thêm DRC filter vào demands
□ Thêm region vào demands
□ Auction countdown + kết quả
□ Auto tạo Deal khi trúng thầu
```

---

## TEST LUỒNG END-TO-END

### Luồng 1: Mua đứt (Purchase)

```
Portal                          ERP                         App Cân
──────                          ───                         ───────
1. Đại lý gửi booking    →
                                2. Xem booking, thương lượng
                                3. Xác nhận Deal
                                                            4. Xe mủ về, cân gross
                                                            5. Dỡ hàng
                                                            6. Cân tare → NET
                                7. Nhập kho (chọn Deal)
                                → Portal nhận chat "Đã nhập 5T"
                                8. QC kiểm DRC
                                → Portal nhận chat "DRC = 53.5%"
9. Portal xem DRC variance
                                10. Auto-Settlement
                                → Portal nhận chat "Quyết toán X VNĐ"
11. Portal xem settlement
                                12. Duyệt Settlement
                                13. Thanh toán
                                → Portal nhận chat "Đã thanh toán"
14. Portal xem công nợ
```

### Luồng 2: Gia công (Processing)

```
Portal                          ERP                         App Cân
──────                          ───                         ───────
1. Đại lý đặt slot SX    →
                                2. Duyệt slot
                                                            3. Xe mủ về, cân
                                4. Nhập kho (Deal gia công)
                                → Portal nhận chat "Đã nhập"
                                5. Tạo lệnh SX
                                → Portal thấy tiến độ SX
                                6. Sản xuất 5 công đoạn
                                → Portal theo dõi real-time
                                7. QC thành phẩm
                                → Portal thấy output batches
8. Portal xem lô TP
9. Nghiệm thu (Accept/Reject)
                                10. Xuất kho TP cho đại lý
                                11. Tính phí gia công
                                → Portal nhận invoice
12. Portal thanh toán phí
```

---

## LƯU Ý QUAN TRỌNG

### Bảo mật dữ liệu
- Đại lý chỉ thấy data **của mình** (filter by `partner_id`)
- RLS trên Supabase phải enforce: `partner_id = auth.uid()`
- Không expose: giá thành SX, lợi nhuận, deal của đại lý khác, tồn kho tổng

### Shared Components
- Copy component từ ERP → Portal, **bỏ đi phần admin** (nút duyệt, sửa, xóa)
- Portal chỉ có **view + accept/reject** cho nghiệm thu
- Portal **KHÔNG** tạo settlement, advance (chỉ nhà máy làm)

### Real-time Sync
- Chat messages: Supabase Realtime ✅ (đã có)
- Deal status: Poll mỗi 30s hoặc Realtime subscription
- Production stage: Nên dùng Realtime cho UX tốt

---

*Huy Anh Rubber ERP v8 — Portal Sync Guide*
*Ngày: 18/03/2026*
