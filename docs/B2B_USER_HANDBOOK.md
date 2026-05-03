# Module B2B THU MUA — Sổ tay Người dùng

> **Mục đích module:** Hỗ trợ Huy Anh Rubber **mua mủ cao su từ đại lý + hộ nông dân** một cách có hệ thống.
> **Đối tượng:** Nhân viên thu mua, QC, BGĐ, Kế toán, Admin.
> **Phiên bản:** Sau Sprint Intake v4 + Sprint F (2026-05-04).

---

## I. TỔNG QUAN

### 1. Hai phía của module

```
┌───────────────── ERP NHÀ MÁY ────────────────┐    ┌──────────── PARTNER PORTAL ───────────┐
│  huyanhrubber.vn                              │    │  b2b.huyanhrubber.vn                  │
│  Người dùng: NV Thu mua, QC, BGĐ, Kế toán    │ ⇄  │  Người dùng: Đại lý                   │
│  Quyền: cao (tạo deal, duyệt, quyết toán)    │    │  Quyền: thấp (gửi báo giá, ack, raise)│
└───────────────────────────────────────────────┘    └────────────────────────────────────────┘
```

Tài liệu này tập trung **phần ERP**. Portal có docs riêng.

### 2. 4 luồng mua mủ (theo `purchase_type`)

| Loại | Code | Đặc trưng | Khi dùng |
|---|---|---|---|
| 📦 **Standard** | `standard` | QC sample → BGĐ duyệt → Cân → Thanh toán sau | Đại lý đã có trong hệ thống, lượng lớn, không gấp |
| 🅰️ **Outright (Mua đứt)** | `outright` | Bypass QC + BGĐ, kế toán cáp DRC, **chi tiền tại cân** | Đại lý quen biết (đặc biệt Lào), giao dịch nhanh |
| 🅲 **Walk-in (Hộ nông dân)** | `farmer_walkin` | CCCD lookup, dùng giá ngày, **chi tiền ngay** | Khách lẻ chưa có hồ sơ, mua tại chỗ |
| 🅱️ **DRC-after-production** | `drc_after_production` | Sample DRC trước, sản xuất pooled, **DRC thật chốt sau** | Đại lý lớn (gold/silver) chấp nhận chia sẻ rủi ro DRC |

### 3. 6 trạng thái Deal

```
pending  →  processing  →  accepted  →  settled
   ↓             ↓              ↓
cancelled    cancelled      (locked, không sửa được)
```

Sau `accepted` các trường khoá: `quantity_kg`, `unit_price`, `expected_drc`, `partner_id`, `actual_drc`*.

`*` Riêng `purchase_type='drc_after_production'`: cho phép set `actual_drc` **1 lần** (NULL → value), sau đó khoá.

---

## II. SIDEBAR — 12 menu items

```
B2B THU MUA (chỉ 4 email được phép)
├─ 📊 Dashboard
├─ 💬 Chat Đại lý       (badge unread)
├─ 📋 Nhu cầu mua
├─ 👥 Đại lý
├─ 🤝 Deals
├─ ⏱️  Đấu giá
├─ 📦 Lý lịch mủ
├─ 📒 Công nợ
├─ 💵 Quyết toán
├─ ⚠️  Khiếu nại DRC
├─ 📈 Phân tích B2B
└─ 📑 Báo cáo công nợ
```

**Quyền truy cập:** Chỉ 4 email được phép (memory `b2bPurchaserEmails`):
- `khuyennt@huyanhrubber.com`
- `duyhh@huyanhrubber.com`
- `minhld@huyanhrubber.com`
- `trunglxh@huyanhrubber.com`

**Không có ở sidebar nhưng truy cập qua URL trực tiếp:**
- `/b2b/intake/outright` — Wizard mua đứt
- `/b2b/intake/walkin` — Wizard walk-in
- `/b2b/intake/production` — Wizard DRC-after
- `/b2b/settings/daily-prices` — Admin giá ngày
- `/b2b/pickup-locations` — Admin địa điểm

---

## III. HƯỚNG DẪN TỪNG MENU

### 1. 📊 Dashboard — `/b2b`

**Mục đích:** Tổng quan thu mua thời gian thực.

**6 KPI cards:**
- Đại lý active
- Deals đang xử lý
- Booking chờ duyệt
- Tin nhắn chưa đọc
- Sản lượng tháng (tấn)
- Doanh thu tháng (đ)

**Biểu đồ:**
- Line chart 6 tháng: toggle giữa "Sản lượng" / "Doanh thu"
- Pie chart: Cơ cấu sản phẩm (Mủ tạp / Mủ nước / Mủ đông)

**Section danh sách:**
- Booking chờ duyệt (kèm nút Confirm nhanh)
- Tin nhắn chưa đọc gần nhất
- Top 5 đại lý theo doanh số
- Activity timeline (các sự kiện mới nhất)

**Tự động:** Refresh 30s/lần.

---

### 2. 💬 Chat Đại lý — `/b2b/chat`

**Mục đích:** Trao đổi với đại lý theo style Zalo (split-screen).

**Layout:**
- **Trái:** danh sách phòng chat (avatar, tier, tên, preview message, badge unread)
- **Phải:** room đang mở (tin nhắn, input, attachment)

**Filter chips:**
- Tất cả / Chưa đọc

**Loại tin nhắn nhận được:**
- 📷 Hình ảnh
- 📎 File (PDF, Excel)
- 🎤 Voice note
- 📋 Booking (Phiếu chốt mủ từ đại lý)
- 💰 Quotation (Báo giá)

**Action quan trọng từ chat:**
- Nhận booking → click "Tạo Deal" → mở `ConfirmDealModal` (xác định partner, qty, price, target_facility)
- Khi deal accepted/settled → DealCard tự update real-time

**Realtime:** Tự động đánh dấu đã đọc sau 1 giây mở phòng. Không cần F5.

---

### 3. 📋 Nhu cầu mua — `/b2b/demands`

**Mục đích:** Phát đơn nhu cầu mua từ nhà máy → đại lý nhận, gửi báo giá → chốt deal (Pull flow).

#### Danh sách
- KPI: Tổng / Đang mở / Đã chốt / Đã đóng
- Cột: Mã nhu cầu, Loại sản phẩm, KL (tấn), Ưu tiên, Trạng thái, Hạn chót (đỏ nếu đã quá hạn), Ngày tạo
- Nút **+ Tạo nhu cầu**

#### Tạo nhu cầu (`/b2b/demands/new`) — Wizard 4 bước
1. **Loại + sản phẩm** — radio Mua đứt/Gia công, product_type, qty, priority
2. **Spec** — đơn giá min-max, DRC kỳ vọng %, ghi chú
3. **Logistics** — pickup location, deadline
4. **Preview + Đăng** — confirm publish

#### Chi tiết nhu cầu (`/b2b/demands/:id`)
3 tabs:
- **Info** — full spec
- **Báo giá** — bảng các offer từ đại lý (Partner, Giá đề xuất, KL, Trạng thái) → Accept = tạo Deal mới; Reject = từ chối với lý do
- **Deals đã tạo** — link tới các deal phát sinh

**Workflow:** Tạo → Đại lý gửi offer → Click "Chốt offer" → Deal auto-create → tiếp flow Standard.

---

### 4. 👥 Đại lý — `/b2b/partners`

#### Danh sách (Card grid 12/page)
- Avatar 56px, tên, mã, **tier** (💎 diamond / 🥇 gold / 🥈 silver / 🥉 bronze / 🆕 new)
- 2 ô stat: số deals + tổng KL
- 3 nút action: 💬 Chat / 🛒 Deals / 💰 Công nợ
- Filter: search + tier segmented

#### Chi tiết đại lý (`/b2b/partners/:id`)
4 tabs:
- **Info** — đầy đủ thông tin (CCCD/MST, địa chỉ, sđt, email, ngày đăng ký) + sidebar stats
- **Chat** — CTA mở chat
- **Deals** — bảng các deal của đại lý
- **Công nợ** — placeholder Phase E5 (advance/paid/remaining/lịch sử)

#### Đại lý chờ duyệt (`/b2b/partners/requests`) — Admin only
- Bảng đại lý đăng ký từ portal đang chờ
- Action: ✅ Approve / ❌ Reject (modal nhập lý do)
- Approve → status='active' + verified_at; Reject → status='rejected'

---

### 5. 🤝 Deals — `/b2b/deals`

#### Danh sách
- **Status tabs**: All / Pending / Processing / Accepted / Settled / Cancelled (kèm số đếm)
- Cột: Mã, Đại lý (name/code/tier), Sản phẩm, KL, Đơn giá, Tổng giá trị, DRC dự kiến/thực tế
- Filter row + Export Excel

#### Tạo deal mới (`/b2b/deals/new`)
- Manual entry (chuyển sang flow standard); thường được Auto-create từ chat hoặc demand

#### Chi tiết deal (`/b2b/deals/:id`) — **6-7 tabs**
- **Info** — mã, status, partner, SKU, qty, đơn giá, giá chốt, expected DRC, vùng mủ, mã lô...
- **Nhập kho (WMS)** — link tới phiếu nhập kho
- **QC** — đo DRC (sample + actual), kết luận pass/warning/failed
- **Tạm ứng (Advances)** — bảng các lần ứng tiền + nút "+ Tạm ứng"
- **Giao hàng** — vehicle, driver, GPS tracking
- **Hợp đồng** — upload + lịch sử
- **Sản xuất** — *chỉ hiện cho deal `purchase_type='drc_after_production'`* — timeline production progress

#### Action buttons (theo status + role)
- Status `pending`/`processing` → Bắt đầu xử lý
- Status processing → Duyệt Deal (Modal nhập "Giá chốt") → status='accepted'
- Cancel anytime trước accepted
- Status accepted → Quyết toán → Settlement auto-create
- Print phiếu

**Quy tắc:** Khi đã `accepted`, các field core **bị khoá** (trigger `enforce_deal_lock`).

---

### 6. ⏱️ Đấu giá — `/b2b/auctions`

**Mục đích:** Phát phiên đấu giá lô mủ tồn → đại lý bid → chọn người thắng.

**Danh sách:**
- KPI: Phiên active / Tổng bid / Đã trao
- Cột: Mã + tiêu đề, Sản phẩm + grade + KL, Giá khởi điểm/hiện tại + bước nhảy, Khoảng thời gian + extension count, Trạng thái, Số bid, Người thắng
- Status: Draft / Upcoming / Active / Extended / Ended / Awarded / Cancelled

**Detail (`/b2b/auctions/:id`):**
- Lịch sử bid
- Chọn người thắng → close auction → trao lô mủ

---

### 7. 📦 Lý lịch mủ — `/b2b/rubber-intake`

**Mục đích:** Theo dõi từng lô mủ NHẬP về: nguồn gốc, qty, DRC, deal liên kết.

**Layout:** Grid card (không bảng).
- Mỗi card: mã lô + sản phẩm + Invoice #; ngày + nguồn (Việt/Lào/Walk-in) + địa điểm; partner/supplier với tier; **3 ô metric**: KL (tấn), DRC %, Giá trị; link tới deal nếu có; vehicle plate
- Filter status + date + product

**Detail (`/b2b/rubber-intake/:id`):** lịch sử biến động + log + ảnh.

---

### 8. 📒 Công nợ — `/b2b/ledger`

#### Tổng quan (`/b2b/ledger`)
- KPI: Tổng tạm ứng / Đã trả / Còn nợ / Avg ngày quá hạn
- Bảng: Đại lý, Tổng ứng, Đã trả, Còn nợ, GD gần nhất
- Search + nút "Xem chi tiết"

#### Sổ cái đại lý (`/b2b/ledger/:partnerId`)
- **LedgerBalanceCard**: balance hiện tại + 3 chỉ số (advances, paid, outstanding)
- Filter: loại bút toán + range ngày
- Bảng: Ngày, Loại, Mô tả, Nợ, Có, **Số dư running** (auto-compute via trigger)
- Nút **+ Tạo bút toán** → modal (Loại Nợ/Có, Số tiền, Mô tả, Ngày)

**6 loại entry_type (theo DB):**
- `settlement_receivable` — Quyết toán phải thu
- `advance_paid` — Tạm ứng đã chi
- `payment_paid` — Thanh toán cuối kỳ
- `processing_fee` — Phí gia công
- `adjustment_debit` / `adjustment_credit` — Điều chỉnh thủ công

---

### 9. 💵 Quyết toán — `/b2b/settlements`

#### Danh sách
- **Status tabs**: All / Draft / Pending Approval / Approved / Partial Paid / Paid / Cancelled / Rejected
- Cột: Mã, Đại lý, Loại, Tổng giá trị, Đã ứng, Còn nợ, Trạng thái, Ngày
- Inline detail expandable: gross/advanced/remaining + aging days

#### Tạo phiếu quyết toán (`/b2b/settlements/new`) — Wizard 4 bước
1. Chọn partner + settlement_type (Purchase/Sale/Processing)
2. Tích chọn deals + tích advances chưa link
3. Bảng items (component `SettlementItemsTable`, sửa được)
4. Summary (gross + advances + remaining) → submit (status='draft')

#### Chi tiết (`/b2b/settlements/:id`)
2 tabs:
- **Info** — bảng items + thông số tổng
- **Lịch sử** — ApprovalTimeline

**Action buttons (theo status + role):**
- Draft → Submit for Approval → status='pending_approval'
- Pending → Approve (modal notes) / Reject (modal lý do)
- Approved → Mark Paid (modal: ngày + payment_method bank/cash/check)
- Paid → Print

**Khi mark paid:** `paid_at` + `paid_by` set; trigger `on_settlement_paid` tự sinh ledger entry `payment_paid`.

---

### 10. ⚠️ Khiếu nại DRC — `/b2b/disputes`

**Mục đích:** Đại lý raise dispute khi DRC thực tế khác sample > ngưỡng.

**Danh sách:**
- Filter: search + status (Open / Investigating / Resolved / Rejected)
- Bảng: Mã DIS, Status, Đại lý, Deal #, Expected vs Actual DRC, Lý do, Ngày tạo

**Workflow (B7):**
1. Partner raise dispute từ portal → status='open'
2. Factory click row → `DisputeDetailDrawer` mở
3. Submit for investigation → status='investigating'
4. **Approve** variance: status='resolved' + adjust DRC + ledger adjustment_debit/credit phát sinh
5. **Reject**: status='rejected' với lý do

**Auto-raise dispute (Sprint Intake v4 P14):**
- Trigger `trg_drc_variance_dispute` tự fire khi UPDATE actual_drc với variance > 3%
- Reason: `Auto-raised: DRC variance X.XX% > 3% threshold`
- Đặc biệt áp dụng cho `purchase_type='drc_after_production'`

---

### 11. 📈 Phân tích B2B — `/b2b/analytics`

**Mục đích:** BGĐ xem phân tích cao cấp.

**3 phần:**
- **Top đại lý theo doanh số** — Rank, name/tier, doanh thu, KL, deal count, avg DRC
- **Funnel conversion** — 4 cột bar: Demands → Offers → Deals → Settlements (số + % conversion)
- **Settlement aging** — bảng Mã QT, Đại lý, Số tiền, Status, Ngày outstanding (color-coded)

Year selector ở top. Click partner → drill xuống PartnerDetailPage.

---

### 12. 📑 Báo cáo công nợ — `/b2b/reports`

**Mục đích:** Aging report cho kế toán.

**Layout:**
- Year + Month selector
- Summary: Total advances / Total paid / Outstanding / Overdue %
- **Bảng aging:** Đại lý + tier, 0-30d, 31-60d, 61-90d, >90d (color-coded), Total balance
- Export Excel

---

## IV. 4 WIZARD INTAKE (URL trực tiếp)

### 1. 🅰️ Mua đứt — `/b2b/intake/outright`

**Khi dùng:** Đại lý quen, đặc biệt từ Lào, kế toán cáp DRC bằng kinh nghiệm, chi tiền ngay tại cân.

**4 bước:**
1. **Đại lý + DRC cáp** — Chọn partner (hoặc nhập mới), nationality VN/LAO, product, DRC %, đơn giá
2. **Cân xe** — vehicle plate, driver, NET kg, facility, warehouse
3. **Xem lại** — card "Tổng chi: X VNĐ"
4. **Chi tiền + In phiếu** — confirm → tạo Deal status='settled' (bypass QC + BGĐ) + Advance ngay → in phiếu

**Bypass triggers:** Sprint J P19-P21 cho phép outright bypass `enforce_weighbridge_requires_accepted_deal` và `enforce_b2b_stock_in_requires_accepted_deal`.

### 2. 🅲 Walk-in hộ nông dân — `/b2b/intake/walkin`

**Khi dùng:** Khách lẻ chưa có hồ sơ, dùng giá ngày, chi tiền ngay.

**Pre-condition:** Admin phải đã set giá hôm nay ở `/b2b/settings/daily-prices`.

**4 bước:**
1. **CCCD lookup** — nhập 12 số → auto check existing partner; nếu mới → quick-create form (họ tên, sđt, địa chỉ)
2. **QC + Cân** — chọn rubber type → load giá ngày tự động → DRC đo, NET, vehicle, warehouse
3. **Pricing** — công thức `qty × DRC × giá = X VNĐ` (giá ướt) hoặc `qty × giá` (giá khô)
4. **Chi tiền + In phiếu**

**CHECK constraint Sprint F:** `national_id` cho nationality='VN' phải chính xác 12 chữ số. 9-số hoặc chữ → REJECT.

### 3. 🅱️ DRC-after-production — `/b2b/intake/production`

**Khi dùng:** Đại lý gold/silver — sample DRC trước, chạy SX sau, chốt giá theo DRC thật.

**4 bước:**
1. **Đại lý + sample QC** — partner tier ≥ silver, sample_drc đo bởi QC, expected price thoả thuận
2. **Cân + Nhập kho** — net, vehicle, facility, warehouse, mode (pooled/isolated), SLA ngày
3. **Review** — số ước tính theo sample DRC
4. **Tạo deal status='accepted'** — chờ BGĐ approve + sản xuất hoàn thành

**Sau khi production xong:** UPDATE actual_drc → trigger `trg_drc_variance_dispute` check variance, nếu > 3% auto-raise dispute. Sau đó settlement auto-create.

### 4. 🛠️ Daily Price Admin — `/b2b/settings/daily-prices`

**Mục đích:** Admin set giá hôm nay cho từng loại mủ — walkin wizard tự load.

**UI:**
- Bảng: Product code, Base price/kg, Effective from, Notes
- Action: 📜 History (modal lịch sử giá), 🗑️ Delete
- Nút "+ Add Price" → modal (product code select, price, notes)

**Logic:** Set giá mới → đóng giá cũ (effective_to=now) + insert giá mới hiệu lực ngay.

---

## V. PHÂN QUYỀN

| Role | Action được phép |
|---|---|
| **Đại lý (portal)** | Gửi booking, gửi offer cho demand, raise dispute, ack advance, xem deal/settlement của mình |
| **NV Thu mua** (4 email) | Tất cả menu B2B, tạo deal/settlement, trao đổi chat |
| **QC** | Tab QC — đo DRC sample + actual |
| **BGĐ** (level 1-3) | Approve deal + final_price; Approve/Reject settlement |
| **Kế toán** (level 1-3 hoặc accounting role) | Mark paid, ledger adjustment, báo cáo công nợ |
| **Admin** | Toàn quyền + duyệt partner request + daily price + pickup locations |

---

## VI. WORKFLOW CHUẨN (Standard Flow)

```
1. ĐẠI LÝ (Portal)
   └→ Tạo Phiếu chốt mủ (Booking) trong chat → gửi
2. ERP THU MUA
   └→ Nhận chat → click "Tạo Deal" → ConfirmDealModal
   └→ Bắt đầu xử lý → status='processing'
3. QC
   └→ Tab QC → đo DRC sample → Save
4. BGĐ
   └→ Tab Header → Duyệt Deal → modal nhập "Giá chốt" → status='accepted'
5. SCALE OPERATOR (can.huyanhrubber.vn)
   └→ Cân xe (Gross + Tare → Net) → Save ticket
6. ERP THU MUA
   └→ Tab Tạm ứng → Tạo Tạm ứng (e.g. 30M VNĐ)
7. ĐẠI LÝ (Portal)
   └→ "Tài chính" → Ledger → thấy advance + ack
8. ERP THU MUA
   └→ Header "Quyết toán" → Settlement auto-create
9. KẾ TOÁN
   └→ Settlement Detail → Submit for Approval → BGĐ Approve → Mark Paid
10. ERP/PORTAL realtime
    └→ Toast "Đã quyết toán" cho đại lý + ledger payment_paid
```

---

## VII. CÁC LƯU Ý QUAN TRỌNG

### 1. Memory rules
- **Cân + nhập kho CHỈ KHI deal `status='accepted'`** (Standard flow). Outright/walkin được bypass.
- **Tạm ứng cũng chỉ khi accepted.** Trigger fire reject nếu chưa.
- **Khi đã accepted, deal core fields bị khoá.** Sửa lại = Khiếu nại DRC.

### 2. Multi-lot (P10-P12)
1 xe có thể gom 3 đại lý khác nhau → Insert ticket `has_items=true`, mỗi item là 1 deal. Trigger `trg_ticket_allocate_on_weigh` tự chia NET theo `declared_qty_kg` (mode `by_share`).

### 3. Realtime (B8)
5 bảng B2B đã enable Realtime publication: `advances`, `chat_messages`, `deals`, `drc_disputes`, `settlements`. Portal nhận card update không cần F5.

### 4. CCCD format (Sprint F)
DB enforce: VN partner phải 12 chữ số; LAO bất kỳ; NULL OK. Insert qua API trực tiếp giờ cũng REJECT 9 số.

### 5. Số tiền hiển thị
Theo memory: viết đầy đủ "30.400.000.000 đ", **KHÔNG** "30.4B" hay "30.4 tỷ".

### 6. Tăng ca / nghỉ phép liên quan B2B
Không liên quan; B2B độc lập với attendance.

---

## VIII. TROUBLESHOOTING THƯỜNG GẶP

| Triệu chứng | Nguyên nhân | Fix |
|---|---|---|
| DealCard không hiện trong chat sau tạo Deal | message_type CHECK chưa có 'deal' | Apply `b2b_fix_message_type_check.sql` |
| Wizard outright/walkin/production lỗi 404 hoặc column not found | View `public.b2b_*` chưa sync với base sau migration | Apply `b2b_views_resync_intake_v4.sql` (đã làm 2026-05-03) |
| Daily price không hiện trong walkin | Admin chưa set giá hôm nay | `/b2b/settings/daily-prices` → "+ Add Price" |
| 9-số CCCD insert được qua API | Trước Sprint F | Apply `b2b_sprint_f_cccd_format_check.sql` (đã làm 2026-05-04) |
| running_balance trên ledger = 0 | Trigger chưa apply | Sprint E + N migrations |
| 2 deal cùng booking_id | Race condition | UNIQUE INDEX `idx_deals_booking_id_unique` (Sprint 1) |
| Settlement insert lỗi `submitted_at` | TypeScript type sai | Đã fix Sprint 1-4 |

---

## IX. THAM CHIẾU

- **Test SQL:** `docs/B2B_TEST_SQL_PLAN.md`, `docs/b2b_simulate_writes.ps1`
- **Test UI:** `docs/B2B_TEST_GUIDE.docx`, `docs/B2B_TEST_CHECKLIST.md`
- **Migrations folder:** `docs/migrations/b2b_*.sql`
- **Component library:** `src/components/b2b/` (30 components)
- **Service layer:** `src/services/b2b/` (30 services)
- **Routes definition:** `src/App.tsx` line 338-383
- **Sidebar config:** `src/components/common/Sidebar.tsx` line 244-336

---

**Cập nhật:** 2026-05-04 sau khi apply Sprint F + view-resync + 30/30 SQL test PASS.
