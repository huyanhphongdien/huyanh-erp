# KẾ HOẠCH PHÁT TRIỂN B2B MODULE
## ERP (huyanhrubber.vn) + Portal (b2b.huyanhrubber.vn)
### Ngày tạo: 10/04/2026

---

## 1. HIỆN TRẠNG

### Quy trình B2B hiện tại

```
ERP                          Portal (Đại lý)
────                         ──────────────
① Đăng nhu cầu mua    →     Xem nhu cầu
                        ←    ② Gửi báo giá (multi-lot)
③ Duyệt / từ chối     →     Xem kết quả
④ Tạo Deal             →     Xem deal
   ↕ Chat real-time    ↔     Chat real-time
                        ←    ⑤ Chốt mủ (booking)
⑥ Nhập kho + QC       →     Xem lý lịch mủ
⑦ Quyết toán          →     Xem quyết toán
⑧ Sổ công nợ          ↔     Xem công nợ
```

### Tính năng theo platform

| Tính năng | ERP | Portal | Ghi chú |
|---|:---:|:---:|---|
| Dashboard B2B | ✅ | ✅ | |
| Chat real-time (text/image/file/audio) | ✅ | ✅ | |
| Đăng nhu cầu mua | ✅ | ❌ chỉ xem | |
| Gửi báo giá (multi-lot) | ❌ duyệt | ✅ | |
| Đấu giá (Auction) | ❌ | ✅ | ERP chưa thấy |
| Báo giá (Quotation) | ❌ | ✅ | ERP chưa thấy |
| Quản lý Deal | ✅ | ✅ | |
| Chốt mủ (Booking) | Chat-based | ✅ UI riêng | |
| Processing (xử lý mủ) | ❌ | ✅ | ERP mù hoàn toàn |
| Biên bản nghiệm thu (Acceptance) | ❌ | ✅ chữ ký số | ERP mù |
| Hợp đồng (Contract) | ❌ | ✅ upload + ký | ERP mù |
| Nhập kho + QC | ✅ WMS | ❌ chỉ xem | |
| Sản xuất | ✅ liên kết | ❌ | |
| Quyết toán (Settlement) | ✅ auto calc | ✅ xem | |
| Tạm ứng (Advance) | ✅ | ⚠️ thiếu | Portal confirm deal không hỗ trợ advance |
| Sổ công nợ (Ledger) | ✅ | ✅ | |
| Tỷ giá (Exchange Rate) | ❌ | ✅ | ERP chưa có |
| Thông báo | ✅ | ✅ | |
| Địa điểm bốc hàng | ✅ cài đặt | ✅ chọn khi báo giá | |

---

## 2. VẤN ĐỀ CẦN GIẢI QUYẾT

### 🔴 Nghiêm trọng (mất kiểm soát)

**P1: ERP không thấy Processing (xử lý mủ)**
- Portal có full lifecycle: intake → processing → output → batches → logs
- ERP hoàn toàn mù — quản lý nhà máy không biết đại lý xử lý mủ thế nào
- Rủi ro: không kiểm soát chất lượng đầu vào

**P2: ERP không thấy Acceptance (biên bản nghiệm thu)**
- Portal có digital signature (nhà máy + đại lý ký)
- ERP không track: ai ký, ký lúc nào, nội dung biên bản
- Rủi ro: tranh chấp không có chứng từ phía ERP

**P3: ERP không thấy Contracts (hợp đồng)**
- Portal có upload file + workflow ký
- ERP không biết deal nào đã có hợp đồng, đã ký chưa
- Rủi ro: giao dịch không có ràng buộc pháp lý

### 🟡 Quan trọng (thiếu tính năng)

**P4: ERP không thấy Auctions (đấu giá)**
- Portal hỗ trợ đấu giá realtime (bid, auto-extend, min step)
- ERP không có UI quản lý phiên đấu giá
- Quản lý phải vào Portal để xem → bất tiện

**P5: Portal confirm deal thiếu Advance (tạm ứng)**
- ERP confirm deal có tạm ứng
- Portal confirm KHÔNG có → đại lý không nhận được tạm ứng khi chốt deal từ Portal

**P6: Tỷ giá chỉ ở Portal**
- Portal có exchange rate service
- ERP không có → mismatch khi tính giá trị deal

### 🟢 Cải thiện (nâng cao trải nghiệm)

**P7**: Booking trên ERP chỉ qua chat, chưa có UI quản lý riêng
**P8**: Portal chưa có notification push (chỉ in-app)
**P9**: Thiếu báo cáo B2B tổng hợp (top đại lý, doanh thu B2B, DRC variance trend)
**P10**: Chat chưa có video call / voice call

---

## 3. KẾ HOẠCH PHÁT TRIỂN

### Phase B1: Đồng bộ dữ liệu ERP ← Portal (2 tuần)
> Mục tiêu: ERP thấy mọi thứ đang xảy ra ở Portal

| Task | Mô tả | Effort |
|---|---|---|
| **B1.1** Processing view trên ERP | Trang `/b2b/deals/:id` tab "Xử lý mủ" hiện intake sessions, processing orders, output từ Portal tables | 3 ngày |
| **B1.2** Acceptance view trên ERP | Tab "Biên bản" trong deal detail: hiện biên bản + chữ ký + PDF download | 2 ngày |
| **B1.3** Contract view trên ERP | Tab "Hợp đồng" trong deal detail: hiện file HĐ + status ký | 1 ngày |
| **B1.4** Auction management trên ERP | Trang `/b2b/auctions`: tạo phiên đấu giá, theo dõi bids realtime, chọn winner | 3 ngày |
| **B1.5** Exchange rate trên ERP | Trang cài đặt tỷ giá, đồng bộ với Portal | 1 ngày |

### Phase B2: Hoàn thiện Portal (1 tuần)
> Mục tiêu: Portal mượt mà, không kẹt flow

| Task | Mô tả | Effort |
|---|---|---|
| **B2.1** Fix advance trong deal confirm | Portal deal confirm gọi advanceService khi có tạm ứng | 1 ngày |
| **B2.2** Push notification (Web Push) | NV nhận notification ngoài app: đơn mới, deal confirm, settlement | 2 ngày |
| **B2.3** Portal partner dashboard v2 | KPI: số deal active, tổng giá trị, DRC avg, thời gian giao trung bình | 1 ngày |
| **B2.4** Đại lý tự đăng ký | Trang đăng ký + admin duyệt trên ERP (hiện tạo tay) | 2 ngày |

### Phase B3: Báo cáo & Analytics (1 tuần)
> Mục tiêu: Ra quyết định từ data

| Task | Mô tả | Effort |
|---|---|---|
| **B3.1** B2B Report Dashboard (ERP) | Top đại lý theo doanh thu, DRC variance trend, thời gian xử lý avg, settlement aging | 2 ngày |
| **B3.2** Đại lý xếp hạng (Tier) | Auto-tier dựa trên: volume, DRC accuracy, payment speed, dispute rate | 2 ngày |
| **B3.3** Demand analytics | Thống kê: bao nhiêu demand → offer → deal → settlement (funnel conversion) | 1 ngày |

### Phase B4: Nâng cao (2 tuần)
> Mục tiêu: Competitive advantage

| Task | Mô tả | Effort |
|---|---|---|
| **B4.1** Auto-matching | Demand post → AI gợi ý đại lý phù hợp (dựa trên region, DRC history, tier) | 3 ngày |
| **B4.2** Price intelligence | Biểu đồ giá mủ theo vùng/thời gian, dự báo xu hướng | 2 ngày |
| **B4.3** Mobile-optimized Portal | PWA: offline support, camera QR cho intake, push notification | 3 ngày |
| **B4.4** API cho đại lý lớn | REST API để đại lý lớn tích hợp trực tiếp (auto-submit offers, get settlements) | 2 ngày |
| **B4.5** Multi-language | Portal hỗ trợ Lào/Campuchia/English (đại lý nước ngoài) | 3 ngày |

---

## 4. ƯU TIÊN ĐỀ XUẤT

```
Tuần 1-2:  Phase B1 (ERP thấy Processing + Acceptance + Contract + Auction)
           → Giải quyết vấn đề "ERP mù" — QUAN TRỌNG NHẤT

Tuần 3:    Phase B2 (Portal fix advance + notification + dashboard)
           → Portal hoàn chỉnh, không kẹt flow

Tuần 4:    Phase B3 (Reports + Analytics + Tier)
           → Data-driven decisions

Tuần 5-6:  Phase B4 (Auto-matching + Price intel + Mobile + API)
           → Competitive advantage, scale
```

---

## 5. CHI PHÍ

| Hạng mục | Chi phí |
|---|---|
| Phát triển (Claude Code) | $0 (có sẵn) |
| Hosting (Vercel) | $0 (free tier) |
| Database (Supabase) | $0-25/tháng (đang dùng) |
| Web Push (OneSignal/FCM) | $0 (free tier) |
| **Tổng thêm** | **$0** |

---

## 6. KIẾN TRÚC DỮ LIỆU

### Tables cần ERP đọc thêm (đã có ở Portal)

```sql
-- Schema b2b (Portal tạo, ERP cần SELECT)
b2b.processing_orders     -- Lệnh xử lý mủ
b2b.processing_batches    -- Lô xử lý
b2b.processing_logs       -- Log tiến trình
b2b.acceptances           -- Biên bản nghiệm thu
b2b.acceptance_items      -- Chi tiết biên bản
b2b.contracts             -- Hợp đồng
b2b.exchange_rates        -- Tỷ giá
b2b.auctions              -- Phiên đấu giá
b2b.auction_bids          -- Lượt đấu giá
intake_sessions            -- Phiên nhập mủ
intake_logs                -- Log nhập mủ
intake_disputes            -- Tranh chấp
```

### RLS cần cập nhật
- ERP users (role = admin/manager) → SELECT trên các tables trên
- Portal users → giữ nguyên (chỉ thấy data của partner mình)

---

*Tài liệu tạo: 10/04/2026*
*Trạng thái: DRAFT — chờ duyệt*
