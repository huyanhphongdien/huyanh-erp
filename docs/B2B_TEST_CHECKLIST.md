# B2B Test Guide — Markdown Checklist
> Auto-generated từ `docs/B2B_TEST_GUIDE.docx` ngày 2026-05-03 để dễ check off scenario.
> Source docx vẫn là canonical — chỉ regen file này khi docx update.

---
HƯỚNG DẪN TEST B2B — UX-BASED

Công ty Cao su Huy Anh — ERP huyanhrubber.vn + Partner Portal b2b.huyanhrubber.vn

Phiên bản: 5.0 (replaces tất cả test guide cũ)  ·  Cập nhật theo UX live deploy

Tài liệu này thay thế các file cũ

Các file đã xóa khỏi repo:

B2B_INTAKE_V4_TEST_GUIDE.docx · B2B_INTAKE_V4_E2E_GUIDE.docx

B2B_UI_TEST_PLAN_ERP_PORTAL.docx · B2B_14_TEST_END_TO_END.docx

B2B_TEST_GUIDE.md · B2B_TEST_PLAN_SPRINT_1_4.md · B2B_RLS_TEST_CHECKLIST.md

B2B_PORTAL_AUDIT_AND_TEST_GUIDE.md · B2B_FULL_FLOW_TEST.md · B2B_E2E_TEST_PLAN_FULL.md

File này là source duy nhất cho B2B test.

1. Môi trường test

### Tài khoản
| Vai trò | URL login | Mục đích |
| --- | --- | --- |
| Kế toán/BGĐ ERP | huyanhrubber.vn | Tạo deal/duyệt/quyết toán/wizard intake |
| QC ERP | huyanhrubber.vn | Đo DRC sample + actual |
| Đại lý Partner | b2b.huyanhrubber.vn | Xem demand · gửi báo giá · raise dispute |
| Scale Operator | can.huyanhrubber.vn (PIN login) | Cân xe weighbridge |
| Admin | huyanhrubber.vn | Bảng giá ngày · cấu hình |
### Browser setup (BẮT BUỘC 2 tab song song)
Tab A (ERP nhà máy): Chrome/Edge thường, login huyanhrubber.vn

Tab B (Portal đại lý): Firefox HOẶC Chrome ẩn danh, login b2b.huyanhrubber.vn

Sắp 2 cửa sổ cạnh nhau — verify realtime sync

Mở DevTools (F12) Console + Network — xem lỗi RLS/CHECK ngay

### Dữ liệu test cần có sẵn
Ít nhất 2 đại lý: 1 tier bronze, 1 tier silver/gold (cho test tier advance)

1 hộ nông dân test với CCCD hợp lệ 12 số (vd 079123456789)

Daily price hôm nay cho 3 loại mủ (mu_tap, mu_nuoc, mu_dong)

1-2 deal standard cũ (test regression không bị break)

1 facility + 1 warehouse NVL active

### SQL queries bookmark (mở Supabase SQL Editor)
-- Deal phân loại theo flow
SELECT purchase_type, status, COUNT(*) FROM b2b.deals GROUP BY 1,2;

-- Multi-lot tickets
SELECT t.code, t.has_items, COUNT(i.id) AS items FROM weighbridge_tickets t
LEFT JOIN weighbridge_ticket_items i ON i.ticket_id=t.id GROUP BY t.id;

-- Auto disputes (variance > 3%)
SELECT dispute_number, deal_id, expected_drc, actual_drc, status
FROM b2b.drc_disputes WHERE reason LIKE 'Auto-raised%' ORDER BY created_at DESC LIMIT 10;

-- Daily price coverage
SELECT product_code, base_price_per_kg, effective_from FROM b2b.daily_price_list
WHERE effective_to IS NULL ORDER BY product_code;

-- Partner ledger running balance
SELECT entry_type, amount, running_balance FROM b2b.partner_ledger
WHERE partner_id=<id> ORDER BY created_at;
2. Sơ đồ menu B2B trên ERP

Sidebar trái → cụm "B2B THU MUA" có 12 menu items:

| Menu | Path URL | Mục đích |
| --- | --- | --- |
| Dashboard | /b2b | Tổng quan B2B |
| Chat Đại lý | /b2b/chat | Chat realtime + booking |
| Nhu cầu mua | /b2b/demands | Tạo NCM + nhận báo giá |
| Đại lý | /b2b/partners | Quản lý đối tác |
| Deals | /b2b/deals | Lifecycle deal (xem chi tiết) |
| Đấu giá | /b2b/auctions | Tổ chức đấu giá |
| Lý lịch mủ | /b2b/rubber-intake | Lịch sử nhập mủ |
| Công nợ | /b2b/ledger | Sổ ledger partner |
| Quyết toán | /b2b/settlements | Quyết toán + thanh toán |
| Khiếu nại DRC | /b2b/disputes | Resolve dispute |
| Phân tích B2B | /b2b/analytics | Charts + KPI |
| Báo cáo công nợ | /b2b/reports | Reports |
### NEW: 3 wizard intake (KHÔNG ở sidebar, truy cập URL trực tiếp):
🅰️ Outright (Mua đứt) → /b2b/intake/outright

🅱️ DRC-after (Chạy đầu ra) → /b2b/intake/production

🅲 Walk-in (Hộ nông dân) → /b2b/intake/walkin

🛠️ Daily Price (Admin) → /b2b/settings/daily-prices

3. Sơ đồ menu Partner Portal

| Menu | Path URL | Mục đích |
| --- | --- | --- |
| Trang chủ | /partner/home | Dashboard partner |
| Cơ hội | /partner/opportunities | Demands + Auctions (tab open/submitted/won/closed) |
| Đơn hàng | /partner/orders | Theo dõi deal đang xử lý |
| Tài chính | /partner/finance | Ledger + Settlements + Payments |
| Chat | /partner/chat | Booking + chat factory |
| Thông báo | /partner/notifications | Notifications |
| Hồ sơ | /partner/profile | Profile partner |
## Scenario 1 — 📦 Standard flow — Chat booking → Deal → Settlement
| Thời gian: 45 phút | Người test: Đại lý + Kế toán + QC + BGĐ | Browser: 2 tab (ERP + Portal) song song |
| --- | --- | --- |
Mục đích: verify luồng standard cũ vẫn chạy đúng (regression). Đại lý tự initiate booking trong chat.

### Prerequisites
1 đại lý tier silver, login Portal sẵn

1 chat room đã tồn tại giữa partner + factory (hoặc tạo mới ở step 1)

### Các bước thực hiện
- [ ] 1. [PORTAL] Đại lý → Sidebar "Chat" → chọn factory → mở room. Click icon clip 📎 → "Tạo booking"
→ Kỳ vọng: Modal "Gửi báo giá" mở. Form: product_type (mu_tap/mu_nuoc/...), quantity_kg, offered_price_vnd_per_kg.

- [ ] 2. [PORTAL] Điền product_type=mu_tap, qty=5000kg, price=12000 → click "Gửi báo giá"
→ Kỳ vọng: Message booking xuất hiện trong chat. Status=pending_review.

- [ ] 3. [ERP] Factory → Sidebar "Chat Đại lý" (badge số mới +1) → vào room
→ Kỳ vọng: Card booking hiện trong chat với 2 nút: "Tạo Deal" + "Từ chối".

- [ ] 4. [ERP] Click "Tạo Deal" → Modal ConfirmDealModal → confirm
→ Kỳ vọng: Deal mới tạo status=pending. Chat: card đổi sang "Đã tạo deal #DLxxxxx".

- [ ] 5. [ERP] Sidebar → "Deals" → mở deal vừa tạo → URL /b2b/deals/<id>
→ Kỳ vọng: DealDetailPage hiện 6 tabs: Thông tin · Nhập kho · QC · Giao hàng · Tạm ứng · Hợp đồng. Header có 4 buttons.

- [ ] 6. [ERP] Header → click "Bắt đầu xử lý" (Popconfirm)
→ Kỳ vọng: Status pending → processing. Notification realtime cho partner.

- [ ] 7. [PORTAL] Đại lý → "Đơn hàng" → tab "Đang xử lý" → thấy deal mới
→ Kỳ vọng: Deal hiện trong list. Click vào → OrderDetailPage timeline.

- [ ] 8. [ERP] QC role: Tab "QC" → Nhập DRC sample 35% → Save
→ Kỳ vọng: qc_status update. Sample DRC lưu.

- [ ] 9. [ERP] BGĐ role: Header "Duyệt Deal" → Modal nhập "Giá chốt" 12000 → confirm
→ Kỳ vọng: Status processing → accepted. final_price set. Sprint J unlock cân + advance.

### 10. [SCALE] Scale operator → can.huyanhrubber.vn → chọn deal trong dropdown (không có badge — purchase_type=standard)
→ Kỳ vọng: Deal hiện list (status=accepted).

### 11. [SCALE] Cân: Gross 7000kg, Tare 2000kg → Net 5000kg → Save ticket
→ Kỳ vọng: Ticket tạo status=completed. Auto-create stock_in_order (nếu flag VITE_AUTO_WEIGHBRIDGE_SYNC=on).

### 12. [ERP] Tab "Tạm ứng" → "Tạo Tạm ứng" → 30,000,000 VND
→ Kỳ vọng: Advance pending. Ledger entry advance_paid debit. Tier silver max 55% → 30M < limit OK.

### 13. [PORTAL] Đại lý → "Tài chính" → tab "Ledger" → thấy advance mới
→ Kỳ vọng: Ledger entry hiện. Click "Xác nhận đã nhận"

### 14. [ERP] Header "Quyết toán" → Modal confirm → Settlement auto-create
→ Kỳ vọng: Settlement: gross = 5000 × 0.35 × 12000 = 21M VND. Remaining = 21M − 30M = −9M (advance vượt).

### 15. [ERP] "Quyết toán" page → mark paid
→ Kỳ vọng: Trigger sync_deal_to_settled fire. Deal → settled. Ledger payment_paid entry. running_balance = 0.

### 16. [SQL] SELECT entry_type, amount, running_balance FROM b2b.partner_ledger WHERE partner_id=<id> ORDER BY created_at
→ Kỳ vọng: Chain advance_paid → settlement_receivable → payment_paid. Cumulative = 0.

### ✅ PASS / ❌ FAIL criteria
### PASS khi:
Status đi đúng 4 stages: pending → processing → accepted → settled

Sprint J reject cân khi pending/processing

Tier advance guard fire (silver 55% max)

Realtime sync ERP ↔ Portal < 2 giây

Running balance cumulative đúng

### FAIL nếu:
Skip stage (deal tự settled)

Cân khi processing pass

Realtime delay > 5 giây

## Scenario 2 — 📋 Nhu cầu mua → Offer → Deal (Pull flow)
| Thời gian: 30 phút | Người test: Kế toán + Đại lý + BGĐ | Browser: 2 tab (ERP + Portal) song song |
| --- | --- | --- |
- [ ] 1. [ERP] Sidebar "Nhu cầu mua" → "Tạo nhu cầu mới"
→ Kỳ vọng: DemandCreatePage 2-step wizard. Step 1: thông tin chung.

- [ ] 2. [ERP] Step 1: product_type=mu_tap, quantity=4200 tấn, deadline=cuối tháng, price_min=14000, price_max=27000
→ Kỳ vọng: Form validate. "Tiếp theo" → Step 2.

- [ ] 3. [ERP] Step 2: chọn "Vùng ưu tiên" (Bình Phước, Đồng Nai), "Kho nhận hàng" (KHO-NVL = Phong Điền)
→ Kỳ vọng: Dropdown kho chỉ hiện 3 kho NVL (KHO-NVL, KHO-LAO-NVL, KHO-TL-NVL).

- [ ] 4. [ERP] Click "Đăng ngay"
→ Kỳ vọng: Demand status=published. Notification cho partners có region match.

- [ ] 5. [PORTAL] Đại lý → "Cơ hội" → tab "Đang mở" → thấy demand mới
→ Kỳ vọng: Card demand hiện. Click → PartnerDemandDetailPage.

- [ ] 6. [PORTAL] Click "Gửi báo giá" → form: offered_price, offered_quantity, offered_drc, source_region
→ Kỳ vọng: Form 1 lô (default). Click "+ Thêm lô" để gửi nhiều lô khác giá.

- [ ] 7. [PORTAL] Điền: 2000kg @ 25000đ/kg DRC 32%, vùng=Bình Phước → "Gửi báo giá"
→ Kỳ vọng: Offer status=pending. Booking message tự push vào chat factory.

- [ ] 8. [ERP] Sidebar "Nhu cầu mua" → click demand → tab "Chào giá"
→ Kỳ vọng: Offer hiện trong list.

- [ ] 9. [ERP] Click "Chốt offer" → confirm → Deal auto-create
→ Kỳ vọng: Offer status=accepted. Deal tạo status=processing. demand.filled_quantity += 2000.

## 10. [ERP] Click vào deal mới → tiếp DealDetailPage → flow tiếp như Scenario 1 (QC → BGĐ → cân → quyết toán)
→ Kỳ vọng: 8-step lifecycle còn lại như standard flow.

### 11. [SQL] Verify trigger sync_demand_filled: SELECT filled_quantity_kg FROM b2b_demands WHERE id=<demand>
→ Kỳ vọng: filled_quantity_kg = 2000. Nếu sum filled ≥ quantity_kg → demand auto closed.

### ✅ PASS / ❌ FAIL criteria
### PASS khi:
Demand publish notification cho partner

Filter region đúng

Multi-lot offer (Thêm lô) work

Trigger sync_demand_filled fire

Demand auto close khi đủ

### FAIL nếu:
Demand không gửi notification

Offer không cascade thành deal

filled_quantity sai

## Scenario 3 — 🅰️ Mua đứt (Outright) — bypass QC + BGĐ
| Thời gian: 15 phút | Người test: Kế toán + Scale Operator | Browser: 2 tab (ERP + Portal) song song |
| --- | --- | --- |
Kịch bản: Đại lý Lào chở 800kg mủ tạp đến cân. Kế toán cáp DRC 48% kinh nghiệm, đơn giá 12,500đ/kg. Chi tiền NGAY tại cân, không qua QC sample + BGĐ.

- [ ] 1. [ERP] Truy cập trực tiếp URL: huyanhrubber.vn/b2b/intake/outright
→ Kỳ vọng: OutrightWizardPage 4-step.

- [ ] 2. [ERP] Step 1 "Đại lý + DRC cáp": Đại lý=Lào ABC, Quốc tịch=🇱🇦 Lào, Loại sản phẩm=Mủ tạp, rubber_type=mu_tap
→ Kỳ vọng: Quốc tịch LAO → batch prefix sẽ thành LAO-. Form validate.

- [ ] 3. [ERP] DRC cáp = 48 (warning nếu < 25 hoặc > 70), Đơn giá = 12500 → Preview "10,000,000 VNĐ × qty"
→ Kỳ vọng: Tổng = qty × price (default 2: DRC bake vào price).

- [ ] 4. [ERP] "Tiếp theo" → Step 2 "Cân xe": Net=800, Biển số=UN-123, Tài xế="Khampheng", Facility=Phong Điền, Kho=KHO-NVL
→ Kỳ vọng: All required validate.

- [ ] 5. [ERP] "Tiếp theo" → Step 3 "Xem lại": card "Tổng chi: 10.000.000 VNĐ"
→ Kỳ vọng: Confirm display.

- [ ] 6. [ERP] Click "Chi tiền + In phiếu" (icon $ xanh)
→ Kỳ vọng: Loading. Step 4 "Hoàn tất" hiện. Deal number DL-OUT-XXXX + Ticket WB-OUT-XXXX.

- [ ] 7. [ERP] Click "In phiếu" → window.print()
→ Kỳ vọng: Print dialog mở.

- [ ] 8. [SQL] SELECT status, purchase_type, buyer_user_id FROM b2b.deals WHERE deal_number = 'DL-OUT-XXX'
→ Kỳ vọng: status=settled (NOT processing/accepted), purchase_type=outright, buyer_user_id=current user.

- [ ] 9. [SCALE] Mở weighbridge app → dropdown deal → tìm DL-OUT-XXX
→ Kỳ vọng: Deal hiện với badge 🅰️. Có cả deals settled (bypass status filter cũ).

### 10. [SQL] SELECT entry_type, amount FROM b2b.partner_ledger WHERE partner_id=<lao_id> ORDER BY created_at DESC LIMIT 3
→ Kỳ vọng: Có entry payment_paid 10M VND (chi tiền trực tiếp, không qua advance).

### ✅ PASS / ❌ FAIL criteria
### PASS khi:
Wizard 4 steps mượt mà

Deal status=settled NGAY (bypass accepted)

Batch prefix LAO- nếu nationality=LAO

Sprint J KHÔNG reject cân outright

buyer_user_id NOT NULL (audit lock)

### FAIL nếu:
Deal status=processing/accepted (sai)

Sprint J reject outright

Batch prefix không đổi khi LAO

## Scenario 4 — 🅲 Walk-in hộ nông dân — CCCD + daily price
| Thời gian: 20 phút | Người test: Kế toán + QC | Browser: 2 tab (ERP + Portal) song song |
| --- | --- | --- |
Kịch bản: Hộ ông Nguyễn Văn A lần đầu đến nhà máy với CCCD 079123456789, chở 500kg mủ nước. QC đo DRC 32% tại cân. Giá ngày = 15,000đ/kg. Chi tiền mặt ngay.

Pre-condition: Admin phải đã set giá hôm nay

- [ ] 1. [ERP] URL /b2b/settings/daily-prices → "Set giá mới" → Mủ nước, 15000 đ/kg → Lưu
→ Kỳ vọng: tstzrange auto close giá cũ. Row mới hiệu lực từ NOW.

- [ ] 2. [ERP] URL /b2b/intake/walkin → WalkinWizardPage
→ Kỳ vọng: 4-step wizard.

- [ ] 3. [ERP] Step 1 "Hộ (CCCD)": nhập "079123456789" (12 số)
→ Kỳ vọng: Icon ✓ xanh hiện realtime. Validation pass (mã tỉnh 079 hợp lệ, 001-096).

- [ ] 4. [ERP] Vì CCCD mới → Alert vàng "Hộ mới" → form: Họ tên="Nguyễn Văn A", SĐT="0912345678", Địa chỉ
→ Kỳ vọng: name min 2 chars, phone regex VN.

- [ ] 5. [ERP] "Tiếp theo" → Step 2 "QC + Cân": chọn "Mủ nước" → label "Giá ngày: 15,000 đ/kg" auto-load
→ Kỳ vọng: getCurrentPrice(mu_nuoc) lookup OK. Field unit_price prefill = 15000.

- [ ] 6. [ERP] DRC đo (QC tại cân) = 32, Net = 500, Biển số, Facility, Kho NVL
→ Kỳ vọng: Form validate.

- [ ] 7. [ERP] "Tiếp theo" → Step 3: Card công thức "qty × DRC × giá = 500 × 0.32 × 15000 = 2,400,000 VNĐ"
→ Kỳ vọng: Display rõ.

- [ ] 8. [ERP] "Chi tiền + In phiếu"
→ Kỳ vọng: Step 4 success. Partner code mới "HG-6789" + Tag "Mới tạo" badge.

- [ ] 9. [ERP] Test reuse: lặp lại từ bước 2, nhập CCCD cũ "079123456789"
→ Kỳ vọng: Alert XANH "Đã có trong hệ thống: Nguyễn Văn A (HG-6789)" — KHÔNG tạo duplicate.

### 10. [SQL] SELECT COUNT(*) FROM b2b.partners WHERE national_id='079123456789'
→ Kỳ vọng: COUNT = 1 (UNIQUE index).

### 11. [ERP] Test invalid CCCD: nhập "079123456" (9 số) hoặc "12345" → wizard reject
→ Kỳ vọng: Error rõ "CCCD phải đúng 12 số" hoặc "mã tỉnh ngoài 001-096".

### ✅ PASS / ❌ FAIL criteria
### PASS khi:
CCCD validate realtime

Daily price auto-load khi chọn rubber_type

Reuse partner cho CCCD trùng

UNIQUE national_id không tạo duplicate

Công thức qty × DRC × giá đúng

### FAIL nếu:
Duplicate partner khi CCCD trùng

Daily price không load

CCCD invalid pass qua

## Scenario 5 — 🅱️ DRC-after-production (Đại lý chạy đầu ra)
| Thời gian: 60 phút | Người test: Tất cả 4 role + production hook | Browser: 2 tab (ERP + Portal) song song |
| --- | --- | --- |
Kịch bản: Đại lý gold giao 10 tấn mủ tạp. Sample DRC 35%. BGĐ duyệt → tạm ứng 25M (gold 70% × 42M = 29.4M) → SX 3-7 ngày → TP ra 3.200kg (actual 32%, variance 3% — ngưỡng) → quyết toán.

- [ ] 1. [ERP] URL /b2b/intake/production → ProductionWizardPage
→ Kỳ vọng: 4-step wizard.

- [ ] 2. [ERP] Step 1: Đại lý gold, sample_drc=35, expected_price=12000
→ Kỳ vọng: Form. Warning nếu tier < silver (không block).

- [ ] 3. [ERP] Step 2 "Cân + Nhập kho": Net=10000, biển số, facility, warehouse, mode=pooled (default), SLA=7 ngày
→ Kỳ vọng: Cấu hình production. Isolated chỉ available cho gold+.

- [ ] 4. [ERP] Step 3 "Xem lại": Estimated gross = 10000 × 35% × 12000 = 42M VND. Advance max gold = 29.4M
→ Kỳ vọng: Display ESTIMATED — actual sẽ khác.

- [ ] 5. [ERP] Click "Tạo deal + chờ BGĐ duyệt"
→ Kỳ vọng: Step 4 success. Deal DL-PCB-XXX status=processing (NOT settled). actual_drc=NULL.

- [ ] 6. [SQL] SELECT status, sample_drc, actual_drc, production_mode, production_sla_days FROM b2b.deals WHERE deal_number=...
→ Kỳ vọng: status=processing, sample_drc=35, actual_drc=NULL, mode=pooled, sla=7.

- [ ] 7. [ERP] BGĐ → Sidebar "Deals" → mở DL-PCB-XXX → header "Duyệt Deal"
→ Kỳ vọng: Modal nhập final_price. Confirm → status=accepted.

- [ ] 8. [ERP] Tab "Tạm ứng" → "Tạo Tạm ứng" 25,000,000 VND (< 29.4M max gold)
→ Kỳ vọng: Advance pending. Ledger entry advance_paid.

- [ ] 9. [ERP] Thử tạo thêm advance 10M (tổng 35M > 29.4M)
→ Kỳ vọng: REJECT: "Vuot han muc tam ung tier GOLD (70%): max=29,400,000. Da ung 25,000,000, muon them 10,000,000 → tong 35M vuot han."

### 10. [PORTAL] Đại lý → "Đơn hàng" → mở deal → tab Info có ProductionProgress component
→ Kỳ vọng: Timeline 10 stages. Current stage = "Bắt đầu sản xuất".

- [ ] 11. [ERP] (Sau SX xong) Gọi API onProductionFinish hoặc SQL: UPDATE b2b.deals SET actual_drc=32, finished_product_kg=3200 WHERE id=<id>
→ Kỳ vọng: Variance = |32-35| = 3% (ngưỡng). Trigger trg_drc_variance_dispute fire? KHÔNG vì 3% không > 3%.

### 12. [SQL] SELECT COUNT(*) FROM b2b.drc_disputes WHERE deal_id=<id> AND reason LIKE 'Auto-raised%'
→ Kỳ vọng: COUNT = 0 (variance exact 3% không trigger).

### 13. [ERP] Test variance > 3%: tạo deal khác sample=35, actual=30 (5% variance)
→ Kỳ vọng: Trigger fire. Dispute mới: reason="Auto-raised: DRC variance 5.00% > 3% threshold", status=open.

### 14. [ERP] BGĐ → Sidebar "Khiếu nại DRC" → mở dispute → resolve với adjustment_amount=500,000
→ Kỳ vọng: Status resolved_accepted. Adjustment ghi nhận.

### 15. [ERP] Header "Quyết toán" deal đầu (variance 3%) → Settlement auto: gross = 10000 × 32% × 12000 = 38.4M
→ Kỳ vọng: Remaining = 38.4M − 25M advance = 13.4M.

### 16. [ERP] Mark paid → deal status=settled. Ledger chain cumulative = 0
→ Kỳ vọng: advance_paid 25M → settlement_receivable 38.4M → payment_paid 13.4M = 0.

### ✅ PASS / ❌ FAIL criteria
### PASS khi:
Sample DRC → BGĐ → actual DRC update 1 lần NULL→value

Tier advance guard fire khi vượt max

Variance EXACT 3% KHÔNG fire dispute (ngưỡng)

Variance > 3% auto fire dispute

Portal timeline update realtime

Settlement đúng công thức actual_drc

### FAIL nếu:
Variance 3% fire dispute (sai)

2nd update actual_drc cho qua

Advance không guard

## Scenario 6 — 🔀 Multi-lot — 1 xe gom 3 partners
| Thời gian: 20 phút | Người test: Scale Operator | Browser: 2 tab (ERP + Portal) song song |
| --- | --- | --- |
Kịch bản: Xe tải gom hàng từ 3 partners (1 đại lý + 2 hộ nông dân walk-in). Declared = [500, 300, 200] kg. Cân Net = 985 kg (hao hụt 1.5%). Mode by_share — auto chia prorata.

- [ ] 1. [SCALE] can.huyanhrubber.vn → tạo ticket mới mode=by_share, tick "Multi-lot (has_items)"
→ Kỳ vọng: Form ticket multi-lot mở. Có button "+ Thêm lô".

- [ ] 2. [SCALE] Insert 3 lô: line 1 partner=Đại lý A, mu_tap, declared=500, drc=30, price=10000
→ Kỳ vọng: Line 1 saved. actual_qty pending vì chưa cân net.

- [ ] 3. [SCALE] Line 2: partner=Hộ B, mu_nuoc, declared=300, drc=35, price=13000
→ Kỳ vọng: Line 2 saved.

- [ ] 4. [SCALE] Line 3: partner=Hộ C, mu_tap, declared=200, drc=28, price=9000
→ Kỳ vọng: Tổng declared = 1000 kg.

- [ ] 5. [SCALE] Cân Gross 3000kg, Tare 2015kg → Net 985 kg → Save
→ Kỳ vọng: Trigger trg_ticket_allocate_on_weigh fire. Auto compute actual_qty cho 3 line.

- [ ] 6. [SQL] SELECT line_no, actual_qty_kg, line_amount_vnd FROM weighbridge_ticket_items WHERE ticket_id=<t> ORDER BY line_no
→ Kỳ vọng: line 1: actual=492.5 (985×500/1000), amount=1,477,500. line 2: actual=295.5, amount=1,344,525. line 3: actual=197, amount=496,440. Tổng actual = 985.

- [ ] 7. [SCALE] Test mode=direct: ticket khác có items declared sum ≠ net
→ Kỳ vọng: RAISE EXCEPTION "Mode direct: tong declared phai khop NET".

- [ ] 8. [SQL] Test CHECK chk_exactly_one_source: insert item không có deal/partner/supplier
→ Kỳ vọng: SQL error: 0 source vi phạm CHECK.

### ✅ PASS / ❌ FAIL criteria
### PASS khi:
by_share prorata chia đúng (±0.01 kg)

direct mode reject khi mismatch

line_amount auto = actual × drc × price

CHECK exactly_one_source fire

### FAIL nếu:
Allocate lệch > 1 kg

Direct cho qua mismatch

0 source hoặc 2 source pass

## Scenario 7 — 🛠️ Bảng giá ngày (Admin)
| Thời gian: 10 phút | Người test: Admin/BGĐ | Browser: 2 tab (ERP + Portal) song song |
| --- | --- | --- |
- [ ] 1. [ERP] URL /b2b/settings/daily-prices
→ Kỳ vọng: Page hiện table giá hiện hành + Alert warning nếu thiếu giá hôm nay cho 1+ loại.

- [ ] 2. [ERP] Click "Set giá mới" → Modal
→ Kỳ vọng: Form: product_code (mu_tap/mu_nuoc/...), base_price_per_kg, notes.

- [ ] 3. [ERP] Mủ tạp, 12000 đ/kg, ghi chú "SMR 20 + biên 5%" → Lưu
→ Kỳ vọng: setNewPrice() auto: close giá cũ (effective_to=NOW) + insert mới (effective_from=NOW, effective_to=NULL).

- [ ] 4. [ERP] Click icon "Lịch sử" trên row
→ Kỳ vọng: Modal hiện timeline thay đổi giá. Row hiện hành effective_to=NULL ("Hiệu lực").

- [ ] 5. [ERP] Set giá mới 13000 cho cùng loại → table cập nhật
→ Kỳ vọng: Row cũ chuyển sang lịch sử (effective_to có value). Row mới hiện hành.

- [ ] 6. [SQL] SELECT * FROM b2b.daily_price_list WHERE product_code='mu_tap' ORDER BY effective_from DESC
→ Kỳ vọng: 2 rows. Row 1 effective_to=NULL (current). Row 2 effective_to=<thời điểm set mới>.

- [ ] 7. [ERP] Test thử overlap: chỉnh 2 row cùng thời điểm cho cùng product (qua SQL)
→ Kỳ vọng: EXCLUDE constraint reject: "Đã có giá khả dụng cho mu_tap trong khoảng thời gian này".

### ✅ PASS / ❌ FAIL criteria
### PASS khi:
Modal create work

setNewPrice auto close giá cũ

Lịch sử timeline đúng thứ tự

EXCLUDE chống overlap fire

### FAIL nếu:
Tạo overlap pass

Lịch sử thiếu row

## Scenario 8 — 🔔 Khiếu nại DRC bi-directional
| Thời gian: 15 phút | Người test: Đại lý + BGĐ | Browser: 2 tab (ERP + Portal) song song |
| --- | --- | --- |
- [ ] 1. [PORTAL] Đại lý → "Đơn hàng" → deal có actual_drc ≠ expected_drc → tab "QC" → button "Khiếu nại DRC"
→ Kỳ vọng: RaiseDisputeModal mở. Pre-fill expected_drc, actual_drc. Field "Lý do".

- [ ] 2. [PORTAL] Điền lý do: "DRC actual thấp hơn 5% so với mẫu QC", "Đề xuất: tăng 3% giá" → Submit
→ Kỳ vọng: Dispute status=open. Notification factory.

- [ ] 3. [ERP] Sidebar "Khiếu nại DRC" → list dispute → mở dispute
→ Kỳ vọng: DisputeDetailPage hiện đầy đủ thông tin + lịch sử.

- [ ] 4. [ERP] Click "Bắt đầu xử lý" → status=investigating
→ Kỳ vọng: Audit log trigger trg_dispute_audit fire.

- [ ] 5. [ERP] Click "Resolve accepted" → modal nhập adjustment_amount=500000 + resolution_notes
→ Kỳ vọng: Status=resolved_accepted. Settlement adjustment 500K áp dụng.

- [ ] 6. [PORTAL] Đại lý refresh → status pill đổi "Đã giải quyết - Chấp nhận"
→ Kỳ vọng: Realtime sync. resolution_notes hiện.

- [ ] 7. [SQL] SELECT * FROM b2b.drc_disputes WHERE deal_id=<id>; + SELECT * FROM b2b.dispute_audit_log WHERE dispute_id=<>
→ Kỳ vọng: Dispute resolved. Audit log có 3 entries: open → investigating → resolved.

### ✅ PASS / ❌ FAIL criteria
### PASS khi:
Partner raise dispute từ Portal

Factory resolve từ ERP

Realtime sync 2 portal

Audit log đầy đủ

Settlement adjustment apply

### FAIL nếu:
Realtime delay > 5s

Audit log thiếu entries

Checklist tổng hợp

| # | Scenario | Người test | Kết quả ✅/❌ |
| --- | --- | --- | --- |
| 1 | Standard chat → Settlement (CRITICAL) |  |  |
| 2 | Demand → Offer → Deal (CRITICAL) |  |  |
| 3 | 🅰️ Outright Wizard (CRITICAL) |  |  |
| 4 | 🅲 Walk-in Wizard (CRITICAL) |  |  |
| 5 | 🅱️ DRC-after-production (CRITICAL) |  |  |
| 6 | 🔀 Multi-lot Weighbridge (HIGH) |  |  |
| 7 | 🛠️ Daily Price Admin (HIGH) |  |  |
| 8 | 🔔 DRC Dispute cross-portal (MED) |  |  |
Bug report template

ID: BUG-B2B-YYYYMMDD-XXX

## Scenario số + Bước: ___
Browser/App (Chrome/Firefox/Mobile): ___

Side (ERP / Portal / Scale): ___

User role: ___

Expected: ___

Actual: ___

Severity: CRITICAL / HIGH / MED / LOW

Screenshot + console: ___

SQL state: ___

Cleanup sau test

-- Xóa deals test (chỉ prefix DL-OUT-/DL-WI-/DL-PCB-)
DELETE FROM b2b.drc_disputes WHERE deal_id IN (
  SELECT id FROM b2b.deals
  WHERE deal_number LIKE 'DL-OUT-%' OR deal_number LIKE 'DL-WI-%'
     OR deal_number LIKE 'DL-PCB-%'
);
DELETE FROM b2b.partner_ledger WHERE deal_id IN (
  SELECT id FROM b2b.deals
  WHERE deal_number LIKE 'DL-OUT-%' OR deal_number LIKE 'DL-WI-%'
     OR deal_number LIKE 'DL-PCB-%'
);
DELETE FROM weighbridge_ticket_items WHERE ticket_id IN (
  SELECT id FROM weighbridge_tickets
  WHERE code LIKE 'WB-OUT-%' OR code LIKE 'WB-WI-%' OR code LIKE 'WB-PCB-%'
);
DELETE FROM weighbridge_tickets WHERE code LIKE 'WB-OUT-%' OR code LIKE 'WB-WI-%' OR code LIKE 'WB-PCB-%';
DELETE FROM b2b.deals WHERE deal_number LIKE 'DL-OUT-%' OR deal_number LIKE 'DL-WI-%' OR deal_number LIKE 'DL-PCB-%';
-- Household test partners (CCCD)
DELETE FROM b2b.partners WHERE partner_type='household' AND national_id IN ('079123456789');
-- Daily price test
DELETE FROM b2b.daily_price_list WHERE notes LIKE '%TEST%';
Liên hệ

Admin: huyanhphongdien@gmail.com

Repo ERP: github.com/huyanhphongdien/huyanh-erp

Repo Portal: github.com/huyanhphongdien/huyanh-b2b-portal

Supabase: dygveetaatqllhjusyzz

Sơ đồ luồng: docs/B2B_FLOWS_PRESENTATION.html (mở browser)

Roadmap: docs/B2B_INTAKE_ROADMAP.md

