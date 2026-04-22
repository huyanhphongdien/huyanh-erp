# B2B Portal — UI × DB Test Playbook

**Date:** 2026-04-21
**Mục đích:** Walkthrough UI từng page kết hợp verify DB để tìm bugs ngoài 6 đã list
**Test subject:** Partner `truonghv` với test data đã inject từ E2E Flow 1

**Flow:**
1. Tôi cho bạn command (UI action + expected)
2. Bạn thao tác → gửi screenshot
3. Tôi query DB verify
4. Ghi nhận bug nếu có

---

## PHASE 1 — Home Page

### 1.1 Login + Home first load
**Action:** Mở `http://localhost:5174/partner/login` → login `truonghv@gmail.com` → **hard refresh (Ctrl+Shift+R)** nếu cần
**Expected UI:**
- Sidebar 5 items (Trang chủ / Cơ hội / Đơn hàng / Tài chính / Chat)
- Banner Silver
- KPI strip: `Deals đang chạy` · `Khối lượng tháng` · `Giá trị tháng` · `DRC TB`
- Balance card
- Recent deals (1 deal DL2604-7B5P với timeline)

**Screenshot:** full Home

### 1.2 Quan sát KPI values
**Action:** Ghi lại 4 con số + balance
**Expected theo test data:**
- Deals đang chạy: **1** (DL2604-7B5P status=settled, không phải processing. Có thể = 0 nếu filter chỉ processing)
- Khối lượng tháng: `1.6K T` (từ actual_weight_kg)
- Giá trị tháng: ⚠️ Có thể `0 đ` vì `final_value` NULL (BUG-5)
- DRC trung bình: `52.0%`
- Số dư: tùy cách compute (ledger aggregate vs running_balance)

**Bug check:** nếu "Giá trị tháng" = 0 → confirm BUG-5

---

## PHASE 2 — Đơn hàng (Orders)

### 2.1 List page
**Action:** Click menu **Đơn hàng**
**Expected:**
- Header "Đơn hàng · 3 đơn" (tổng 3 deals truonghv)
- Search box
- Filter chips: `Tất cả (3)` `Đang xử lý (?)` `Chờ QC (?)` `Đã duyệt (?)` `Hoàn tất (1)`
- 3 deal cards

**Screenshot:** full list

### 2.2 Deal DL2604-7B5P timeline
**Action:** Quan sát timeline dưới card DL2604-7B5P
**Expected stages:**
- Chốt ✅ (deal existed)
- Nhập kho ✅ (stock_in_count = 1)
- QC ✅ (qc_status = passed)
- Duyệt ✅ (status transitions passed accepted)
- Quyết toán ✅ (settlement exists with status approved)
- Thanh toán ✅ (settlement status=paid… actually BUG-4 thiếu paid_at nên có thể chưa "paid")

**Check console:** Any errors?

### 2.3 Deal detail 6 tabs
**Action:** Click DL2604-7B5P → vào detail
**Expected:** 6 tabs: Tổng quan / Giao hàng / Nhập kho / QC / Quyết toán / Lịch sử

**Sub-action:** Click từng tab, quan sát content:

**Tab Tổng quan:**
- Tiến trình card với stages timeline đầy đủ
- Thông tin deal card: Sản phẩm Mủ tạp, Số lượng 1600T, Đơn giá 19.000 đ, DRC dự kiến 50%, DRC thực tế 52%, Khối lượng thực tế 1600T
- **Giá trị thực tế:** nếu NULL → bug, nếu 30.4B → OK (có thể compute khác)

**Tab Giao hàng:**
- Info giao hàng, nhà máy đích
- "Thông tin xe và ngày giao sẽ được cập nhật"

**Tab Nhập kho:**
- 1 row NK-TEST-E2E-001 với 1600T, 40 bành, status confirmed

**Tab QC:**
- Card kết quả QC: Pill "Passed" (xanh)
- DRC dự kiến 50% · DRC thực tế 52% (+2%) → không hiện button "Khiếu nại DRC" (vì variance ≤ 2%? hoặc cut-off khác)
- Chi tiết lô: "Chưa có dữ liệu lô"

**Tab Quyết toán:**
- 1 row TEST-QT-E2E-001 với gross 30.4B, remaining 30.39B, status approved (không phải paid vì BUG-4)

**Tab Lịch sử:**
- Lot code, Vùng mủ, Source region (có thể empty)

**Screenshot từng tab** để tôi audit.

---

## PHASE 3 — Tài chính (Finance)

### 3.1 Tab Tổng quan
**Action:** Menu Tài chính (default tab=overview)
**Expected 4 stat cards:**
- Số dư hiện tại: tùy → nên = balance (30.4B - 10M - 30.39B = 0) hoặc running_balance cuối = 0 (BUG-3)
- Tạm ứng đã nhận: 10M
- Đã thanh toán: có thể = gross 30.4B nếu status=paid, hoặc 0 nếu chưa paid
- Chờ thanh toán: remaining từ settlements approved = 30.39B

**Aging bar:**
- Tất cả entries < 30 ngày (vừa tạo) → "Hiện tại" 100%
- **Kiểm tra visual**

### 3.2 Tab Tạm ứng
**Action:** Click tab "Tạm ứng"
**Expected:** 1 card:
- Badge `TEST-ADV-E2E-001`
- Status pill "Đã chi" màu xanh
- **10.000.000 đ** lớn
- Ngày + "Tiền mặt"
- Purpose: "Test E2E advance"

### 3.3 Tab Quyết toán
**Action:** Click "Quyết toán"
**Expected:** 1 card:
- `TEST-QT-E2E-001`
- Status "Đã duyệt"
- `Gross: 30.4 tỷ đ · Còn lại: 30.39 tỷ đ` (hoặc số chi tiết)
- `1600T · DRC 52% · Duyệt [ngày]`

**Click vào card** → navigate `/partner/finance/settlements/<id>` — xem detail page legacy (có thể error vì service thiếu paid_at?)

### 3.4 Tab Công nợ (QUAN TRỌNG — test BUG-3)
**Action:** Click "Công nợ"
**Expected:** 3 entries
- settlement_receivable 30.4B (+)
- advance_paid 10M (-)
- payment_paid 30.39B (-)
- **Running balance bên phải mỗi row** — đây là bug BUG-3, expected pattern 30.4B → 30.39B → 0 nhưng sẽ thấy 0,0,0

**Screenshot cẩn thận mỗi running_balance để confirm BUG-3**

### 3.5 Tab Thanh toán
**Action:** Click "Thanh toán"
**Expected:** Empty state ("Chưa có thanh toán") vì settlement chưa status=paid (BUG-4)

### 3.6 Tab Khiếu nại DRC
**Action:** Click "Khiếu nại DRC"
**Expected:**
- Button đỏ "Tạo khiếu nại mới" trên cùng
- Empty state dưới

**Sub-action:** Click button → modal mở:
- Dropdown "Deal" → chọn DL2604-7B5P
- Field "Lý do khiếu nại" → gõ "Test dispute từ UI playbook"
- Click "Gửi khiếu nại"
**Expected:** 
- Success toast "Đã gửi khiếu nại"
- Modal close
- List refresh hiện dispute mới

**Tôi verify DB** sau action này.

---

## PHASE 4 — Cơ hội (Opportunities)

### 4.1 Tab Đang mở
**Expected:** Empty (hoặc chỉ hiện nếu có demand published với deadline > now)

### 4.2 Các tab còn lại
**Action:** Click "Đã nộp" / "Trúng thầu" / "Đã đóng"
**Expected với truonghv:** tất cả empty (không có demand offers thật)

---

## PHASE 5 — Chat

### 5.1 Chat list
**Action:** Menu Chat
**Expected:** 1 room với nhà máy, last_message_at (10 messages đã có từ trước)

### 5.2 Bell notification
**Action:** Click bell icon top-right
**Expected dropdown:**
- 360px panel
- Title "Thông báo"
- Empty hoặc 0-2 notifications tùy trước đó
- Scroll, mark all read button

---

## PHASE 6 — Edge cases / Console errors

### 6.1 Mở DevTools Console suốt session
**Kiểm tra:** Có error 4xx/5xx, TypeError, Failed to fetch?

Ghi nhận:
- URL endpoint nào fail
- Component nào throw
- Networking hiccup nào

### 6.2 Network tab (F12)
**Filter:** XHR/Fetch
**Kiểm tra:** Request time >2s (slow query), duplicate requests, stale cache

### 6.3 Responsive
**Action:** DevTools → Toggle device toolbar → 375×812 (iPhone) → resize về 1280 (desktop)
**Expected:** Layout switch mượt, không có element bị overflow

---

## PHASE 7 — Cross-module ERP

### 7.1 ERP xem deal DL2604-7B5P
**Action:** Mở ERP `https://huyanhrubber.vn` → login ERP → B2B > Deals → click DL2604-7B5P
**Expected:**
- Status: settled
- Stock-in tab: 1 phiếu NK-TEST-E2E-001
- Settlement tab: TEST-QT-E2E-001 status approved
- Khiếu nại: nếu bạn đã raise dispute → hiện

**Cross-check:** Data DB giống nhau giữa 2 portal?

---

## 🧪 Execution order

Làm theo thứ tự này để optimize:

1. **Phase 1** Home (2 phút) → screenshot
2. **Phase 2** Orders list + detail 6 tabs (5 phút)
3. **Phase 3** Finance 6 tabs (5 phút) — tab Công nợ + Khiếu nại là quan trọng nhất
4. **Phase 5** Chat + bell (2 phút)
5. **Phase 6** Console check liên tục
6. **Phase 7** ERP cross-check (3 phút)
7. **Phase 4** Opportunities cuối (nhanh, empty)

**Total:** ~20 phút test.

---

## 📝 Bug reporting format

Sau mỗi page, gửi tôi:
```
Page: [tên page]
Expected: [mô tả]
Actual: [thực tế]
Screenshot: [đính kèm]
Console error: [nếu có]
```

Tôi sẽ query DB verify + ghi vào list bugs + cuối session tôi tổng hợp cho Sprint E SQL migration fix all.
