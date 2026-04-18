# B2B — Luồng hai phía sau khi chốt Deal trên chat

> **Trạng thái:** Draft — ghi ý tưởng để BÀN LUẬN, chưa phải quyết định kỹ thuật
> **Ngày:** 2026-04-18
> **Phạm vi:** Mọi việc xảy ra SAU khi `dealConfirmService.confirmDealFromChat()` chạy xong — ở cả ERP (nhà máy) và Portal (đại lý)
> **Liên quan:** [B2B_10_LUONG_HIEN_TAI.md](./B2B_10_LUONG_HIEN_TAI.md) + 5 commit chuẩn hoá 2026-04-17/18

---

## 0. Mốc mở đầu: "Chốt Deal thành công" nghĩa là gì?

Ngay sau khi nút **Xác nhận Deal** trong chat được bấm (phía thu mua ERP), các thứ sau đã xảy ra một cách atomic *ở server*:

| Thay đổi | Nơi | Ghi chú |
|---|---|---|
| `b2b_deals` insert 1 row | DB | status=`processing`, có `booking_id`, `lot_code` auto |
| Booking message → `booking.status='confirmed'` + `deal_id` | `b2b_chat_messages.metadata` | để card cũ đổi màu |
| DealCard message mới | `b2b_chat_messages` | `message_type='deal'`, metadata đầy đủ |
| `b2b_advances` + `b2b_partner_ledger` (CREDIT) nếu có ứng | DB | ledger chỉ ghi 1 lần qua `markPaid` |
| Deal totals (`total_advanced`, `balance_due`) | DB | |

Từ đây về sau mỗi phía phải "tiếp sóng" được sự kiện này. Phần bên dưới liệt kê **đã có gì** trong repo và **còn thiếu/cần bàn gì**.

---

## 1. PHÍA NHÀ MÁY (ERP — repo này)

### 1A. Những luồng ĐÃ có sẵn (kiểm tra file hiện tại)

| # | Luồng | File / Service | Trạng thái |
|---|-------|----------------|-----------|
| 1 | Deal List / Filter / Search | [src/pages/b2b/deals/DealListPage.tsx](../src/pages/b2b/deals/DealListPage.tsx) | ✅ |
| 2 | Deal Detail với 7 tabs (Processing / WMS / QC / Production / Acceptance / Advances / Contract) | [src/pages/b2b/deals/DealDetailPage.tsx](../src/pages/b2b/deals/DealDetailPage.tsx) + [src/components/b2b/Deal*Tab.tsx](../src/components/b2b/) | ✅ |
| 3 | Gắn phiếu cân nhập vào deal (stock_in_orders.deal_id) | [src/services/b2b/dealWmsService.ts](../src/services/b2b/dealWmsService.ts) | ✅ |
| 4 | QC batch → auto sync `actual_drc` + `final_value` + notify chat | [src/services/wms/qcService.ts:339](../src/services/wms/qcService.ts#L339) → `syncDealDrcFromBatch` | ✅ mới (commit `a530fee9`) |
| 5 | Ứng thêm từ Deal Detail / từ Chat | [src/components/b2b/AddAdvanceModal.tsx](../src/components/b2b/AddAdvanceModal.tsx), [src/services/b2b/dealChatActionsService.ts](../src/services/b2b/dealChatActionsService.ts) | ✅ |
| 6 | Duyệt Deal (`processing → accepted`) với 5 điều kiện + role gate | [src/services/b2b/dealService.ts:551](../src/services/b2b/dealService.ts#L551) + [DealDetailPage.tsx:204](../src/pages/b2b/deals/DealDetailPage.tsx#L204) | ✅ mới |
| 7 | Quyết toán tự động (gross − advance) | [src/services/b2b/autoSettlementService.ts](../src/services/b2b/autoSettlementService.ts) + [src/pages/b2b/settlements/](../src/pages/b2b/settlements/) | ✅ |
| 8 | Thanh toán từng phần | [src/services/b2b/paymentService.ts](../src/services/b2b/paymentService.ts) + [PaymentForm.tsx](../src/components/b2b/PaymentForm.tsx) | ✅ |
| 9 | Ledger + `running_balance` auto | [src/services/b2b/ledgerService.ts](../src/services/b2b/ledgerService.ts) + trigger DB | ✅ mới (migration `b2b_ledger_running_balance_trigger.sql`) |
| 10 | DRC Variance card | [src/services/b2b/drcVarianceService.ts](../src/services/b2b/drcVarianceService.ts) + [DrcVarianceCard.tsx](../src/components/b2b/DrcVarianceCard.tsx) | ✅ |
| 11 | Notify chat cho: stock-in / QC / settlement / advance | `dealWmsService.notifyDealChat*` (4 hàm) | ✅ |
| 12 | Ghi nhận giao hàng từ chat | [RecordDeliveryModal.tsx](../src/components/b2b/RecordDeliveryModal.tsx) | ✅ |

### 1B. Những luồng CÒN THIẾU hoặc chưa rõ — **đề xuất**

#### 1B.1 Internal notification (bell icon) cho B2B events
**Vấn đề:** Thu mua/kế toán đang dựa 100% vào việc vào chat room tương ứng để thấy system message. Nếu không mở chat thì miss.
**Ý tưởng:** Mở rộng `notificationService.ts` — thêm `NotificationModule='b2b'` với các type:
- `b2b_deal_confirmed` → bắn cho thu mua + kế toán (phòng trường hợp thu mua khác xác nhận)
- `b2b_qc_variance_warning` → bắn cho kế toán khi |actual − expected| > 3%
- `b2b_deal_accept_pending` → khi deal đủ điều kiện duyệt, bắn cho manager
- `b2b_settlement_pending_approval` → bắn cho manager khi kế toán tạo settlement
- `b2b_payment_overdue` → deadline giao/trả bị quá
**Bàn:** Có cần thêm email/zalo không, hay chỉ bell icon?

#### 1B.2 Task tự động theo trạng thái Deal
**Vấn đề:** Deal chuyển trạng thái nhưng không có "next action" rõ ràng gán cho ai.
**Ý tưởng:** Khi `status='processing'` + đủ 5 điều kiện duyệt → tạo task "Duyệt deal DLxxxx" gán cho manager qua `taskNotificationService`. Tương tự cho settlement.
**Bàn:** Có muốn gắn B2B vào task system hiện tại không, hay giữ tách rời?

#### 1B.3 Assign RACI cho mỗi deal
**Vấn đề:** Hiện chưa biết ai là "owner" của deal (thu mua A hay B), ai là kế toán phụ trách.
**Ý tưởng:** Thêm cột `purchaser_id`, `accountant_id` vào `b2b_deals` — mặc định = người xác nhận. Tab Processing hiện tên + phone.
**Bàn:** Cần không? Hay 1 deal cả team cùng xử lý ổn rồi?

#### 1B.4 Dashboard "Deal đang mở" tổng hợp
**Vấn đề:** [B2BDashboardPage.tsx](../src/pages/b2b/B2BDashboardPage.tsx) có số liệu nhưng chưa có view "các deal đang chặn ở đâu".
**Ý tưởng:** Bảng grouped theo status với quick-action:
- processing + qc_status=failed → nút "Xử lý"
- processing + đủ điều kiện → nút "Duyệt"
- accepted chưa có settlement → nút "Lập phiếu"
**Bàn:** Ưu tiên bao nhiêu? Có cần card cảnh báo trên đầu dashboard không?

#### 1B.5 Hủy Deal cascade (bug P2 trong doc cũ)
**Vấn đề:** `cancelDeal` hiện chỉ đổi status, KHÔNG rollback advance đã chi, stock-in đã nhập, ledger entry.
**Ý tưởng cascade checklist:**
1. Nếu có advance `paid` → tạo ledger adjustment DEBIT bằng số ứng (gắn note "hủy deal")
2. Nếu có stock-in confirmed → chặn hủy (phải xuất kho trả trước)
3. Archive chat room (set `is_active=false`) + gửi message "Deal đã hủy"
4. Mở modal nhập lý do bắt buộc
**Bàn:** Policy "chặn hủy khi có stock-in" đúng chưa? Hay cho hủy nhưng bắt dọn kho sau?

#### 1B.6 Penalty DRC tự động (bug P2)
**Vấn đề:** DRC thực thấp hơn expected → chỉ cảnh báo, kế toán tự quyết.
**Ý tưởng:** Config mỗi partner 1 rule: `auto_penalty_if_drc_variance_pct > -3` → giảm giá tỷ lệ hoặc flat. Tạo bảng `b2b_partner_penalty_rules`.
**Bàn:** Đại lý có chấp nhận rule này không? Cần điều khoản hợp đồng chứ không chỉ code.

#### 1B.7 Xuất biên bản / hợp đồng / phiếu thanh toán
**Vấn đề:** [DealContractTab.tsx](../src/components/b2b/DealContractTab.tsx) có sẵn nhưng chưa thấy xuất PDF/Word.
**Ý tưởng:** Dùng template docx có sẵn trong `docs/SALES_02_Huong_Dan_San_Xuat.docx`, render server-side hoặc client-side bằng `docx-templates`.
**Bàn:** E-sign tại chỗ hay in giấy ký tay?

---

## 2. PHÍA ĐẠI LÝ (Portal b2b.huyanhrubber.vn — repo riêng `huyanh-b2b-portal`)

> **Lưu ý:** Repo portal KHÔNG nằm trong workspace này nên chỉ đề xuất dựa trên schema DB chung + pattern realtime đã thấy ở ERP.

### 2A. Những luồng giả định ĐÃ có (cần xác minh từ repo portal)

1. Đăng nhập bằng `b2b_partner_users`
2. Xem list Demand của nhà máy → gửi Offer
3. Chat real-time với nhà máy (đã fix auto-reconnect commit `51411397`)
4. Gửi BookingCard từ form
5. Nhận realtime DealCard khi nhà máy confirm
6. Xem danh sách Deal của mình
7. Xem Ledger / số dư

### 2B. Những luồng cần có / kiểm chứng phía Portal — **đề xuất**

#### 2B.1 Deal Detail rút gọn phía đại lý
**Ý tưởng:** Page `/deals/:id` phía portal — hiển thị read-only:
- Deal number + status + lot_code
- Quantity_kg agreed vs actual_weight_kg thực nhập
- Expected DRC vs actual DRC (live từ QC)
- Timeline: booking → deal → nhập kho lần 1, 2, … → QC → accepted → settled
- Tổng ứng đã nhận + còn phải thu
**Bàn:** Có cho đại lý thấy QC detail từng batch không, hay chỉ avg?

#### 2B.2 Realtime listener event DB → Portal
**Ý tưởng:** Portal subscribe `b2b_chat_messages` (đã có cho chat) + subscribe **`b2b_deals` UPDATE** để:
- Khi `actual_drc` thay đổi → toast "Nhà máy đã QC lô 1, DRC = 58%"
- Khi `status='accepted'` → banner "Deal đã được duyệt, chờ quyết toán"
- Khi `status='settled'` → banner "Đã quyết toán, chờ thanh toán"
**Cần:** Supabase realtime PUBLICATION cho bảng `b2b_deals` (hiện mới có `b2b_chat_messages` — xem memory `b2b_realtime_schema`).
**Bàn:** Hay mình tập trung vào event system message, không subscribe deal?

#### 2B.3 Đại lý acknowledge đã nhận tạm ứng
**Ý tưởng:** Khi advance `paid`, portal hiện card "Nhà máy đã chi X VNĐ" với nút **Tôi đã nhận**. Insert `b2b_advance_receipts` row + update `b2b_advances.confirmed_by_partner_at`.
**Lý do:** Tránh tranh chấp "nhà máy nói đã chi mà đại lý chưa nhận".
**Bàn:** Có cần không, hay chỉ cần ảnh biên nhận upload là đủ?

#### 2B.4 Upload chứng từ từ phía đại lý
**Ý tưởng:** Attachment vào chat có rồi, nhưng thêm loại "document" riêng:
- Giấy tờ xe khi giao hàng
- Hóa đơn tài chính
- Biên bản nhận tiền
Lưu vào `b2b_chat_messages.attachments[]` với `type='document'` metadata.
**Bàn:** Có cần OCR/auto-parse không hay chỉ lưu file?

#### 2B.5 Phản hồi / Dispute DRC variance
**Ý tưởng:** Khi DrcVarianceCard hiện phía đại lý → nút "Chấp nhận" / "Khiếu nại". Tạo `b2b_disputes` row liên kết deal.
**Flow:** nếu dispute → deal tạm hold không accept được, yêu cầu manager resolve.
**Bàn:** Mức độ cần thiết? Có thể xử lý bằng chat thường cũng được.

#### 2B.6 Xem Ledger công khai
**Ý tưởng:** Page ledger phía portal chỉ show entries của partner đó (RLS). Có filter by deal, export Excel.
**Cần RLS:** `b2b_partner_ledger` policy `partner_id = current_user_partner_id`.
**Bàn:** RLS hiện đã có chưa? (memory `supabase_service_role` gợi ý bypass bằng service_role — tức RLS có tồn tại)

#### 2B.7 Deal cancel từ đại lý?
**Ý tưởng:** Cho phép đại lý **đề xuất huỷ** (không phải huỷ trực tiếp) → status thành `cancel_requested`, chờ thu mua duyệt.
**Bàn:** Có cần không? Tranh chấp nhiều hơn hay hữu ích?

---

## 3. LAYER CHUNG (DB / Realtime / Shared contracts)

### 3.1 Message taxonomy trong `b2b_chat_messages`

Hiện đang dùng `message_type` + `metadata` linh hoạt. **Đề xuất chốt schema:**

| message_type | Từ ai | Metadata chính |
|---|---|---|
| `text` | partner / factory | — |
| `booking` | partner | booking card info |
| `deal` | factory | deal card info |
| `system` | system | sub-type trong `metadata.notification_type` |
| `advance_paid` | factory | advance_id, amount |
| `qc_completed` | system | deal_id, actual_drc, qc_status |
| `stock_in_confirmed` | system | deal_id, stock_in_code, total_weight |
| `settlement_approved` | factory | settlement_code, balance_due |
| `payment_confirmed` | factory | payment_id, amount |
| `deal_accepted` | factory | deal_id |
| `deal_cancelled` | factory/partner | reason |

**Bàn:** Split thành nhiều message_type như trên, hay giữ `system` + dùng sub-type trong metadata?

### 3.2 DB Trigger có thể thêm
- Khi `b2b_deals.status` đổi → insert system message tự động (thay vì phụ thuộc TS)
- Khi `b2b_advances.status` → `paid` → insert system message
- Khi `b2b_settlements.status` → `approved`/`paid` → insert system message
**Lợi:** Tránh trường hợp TS code quên gọi `notify*`.
**Rủi:** Logic phân tán, khó debug.
**Bàn:** Giữ ở TS hay đẩy xuống DB?

### 3.3 Realtime channels cần publish
| Bảng | Hiện tại | Cần thêm? |
|---|---|---|
| `b2b_chat_messages` | ✅ publication + REPLICA IDENTITY (memory notes) | — |
| `b2b_deals` | Unknown | ⚠️ Cần nếu muốn portal phản ứng live |
| `b2b_advances` | Unknown | Optional — qua chat message cũng được |
| `b2b_settlements` | Unknown | Optional |
| `b2b_partner_ledger` | Unknown | Optional — refresh on deal update cũng OK |

### 3.4 RLS policies cần kiểm tra
Đại lý chỉ được đọc:
- `b2b_deals WHERE partner_id = auth.current_partner_id()`
- `b2b_advances WHERE partner_id = …`
- `b2b_settlements WHERE partner_id = …`
- `b2b_partner_ledger WHERE partner_id = …`
- `b2b_chat_messages WHERE room_id IN (rooms của partner đó)`

**Cần:** helper function `current_partner_id()` từ JWT của partner portal user.
**Bàn:** Policy hiện tại đã đủ chặt? Cần audit riêng 1 lần không?

---

## 4. Danh sách câu hỏi cần thống nhất trước khi code

1. Internal notification B2B: bell icon có đủ, hay email/zalo bắt buộc?
2. RACI owner cho deal có cần không?
3. Cancel cascade — policy "chặn khi có stock-in" được chưa?
4. Penalty DRC tự động hay để thủ công?
5. Portal có realtime subscribe `b2b_deals` hay chỉ dựa vào chat message?
6. Partner acknowledge advance — bắt buộc hay optional?
7. Message taxonomy — split nhiều type hay gom `system` + metadata?
8. DB trigger auto-insert system message hay giữ TS layer?
9. Dispute flow phía portal có cần không?

---

**File này được tạo để thảo luận — mọi mục đều open cho sửa/xoá. Không phải decision doc.**
