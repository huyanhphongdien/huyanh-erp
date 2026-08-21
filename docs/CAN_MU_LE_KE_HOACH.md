# App con "Cân mủ lẻ" — thiết kế & trạng thái

> Cập nhật: 2026-08-21 · Trạng thái: **code xong · migration ĐÃ CHẠY · smoke test PASS · chờ build + pilot**
> Phạm vi: hộ tiểu điền / khách vãng lai chở **mủ tạp** tới bán trực tiếp tại nhà máy,
> cân trên **cân bàn/cân sàn RS232**, **không bắt buộc CCCD**, in **phiếu nhiệt 80mm**,
> chi tiền qua **Đề nghị thanh toán** như các luồng mua mủ khác. **Không** gắn dữ liệu EUDR.

---

## 1. Kiến trúc đã chốt

### 1.1 App con `apps/retail-scale/`

| Hạng mục | Giá trị |
|---|---|
| Alias | `@` → `./src`, `@erp` → `../../src` (dùng lại service ERP) |
| Dev port | `5175` (ERP 5173, cân xe 5174) |
| Env | `VITE_FACILITY_CODE`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| Deploy | Vercel project riêng, Root Directory = `apps/retail-scale` |
| Subdomain | `canle.huyanhrubber.vn` (PD) · `canle-tl` · `canle-lao` |
| Đăng nhập | PIN qua `scale_operators` (dùng chung app cân xe), key `rs_operator` |

Chi tiết deploy: [apps/retail-scale/DEPLOY.md](../apps/retail-scale/DEPLOY.md).

### 1.2 Mô hình dữ liệu — không có bảng phiếu mới

```
weighbridge_tickets   ticket_type='retail'  status='completed'  has_items=false
   └── weighbridge_ticket_lots   (mỗi bao = 1 dòng: gross_kg, tare_kg, net_kg)
```

**Vì sao dùng lại `weighbridge_tickets`:** `payment_requests` là cửa chi tiền duy nhất của hệ
thống và nó khoá vào `weighbridge_tickets.id`. Đi theo bảng có sẵn ⇒ nhánh chi tiền chạy được
mà gần như không phải viết downstream mới.

**Vì sao từng bao ghi vào `weighbridge_ticket_lots` chứ không phải `weighbridge_ticket_items`:**
`ticket_items` có 3 thứ chặn cứng nghiệp vụ mủ lẻ, mỗi thứ đủ để loại —

1. `chk_exactly_one_source` bắt buộc đúng 1 trong `deal_id`/`partner_id`/`supplier_id` → khách
   vãng lai không có master data ⇒ INSERT bị từ chối;
2. trigger `allocate_ticket_item_weights()` **ghi đè** `actual_qty_kg` theo tỷ lệ prorata ⇒ xoá
   mất số cân thật của từng bao;
3. RLS chỉ mở cho `authenticated` ⇒ app cân (anon key) bị chặn.

`weighbridge_ticket_lots` không dính cả 3, lại là bảng **app cân xe đang dùng thật** để tách lô.

**Ba ràng buộc không được đổi** (mỗi cái có trigger hoặc luồng tiền phía sau):

- `has_items = false` → trigger phân bổ không chạy.
- `net_weight` = Σ `net_kg` các bao — Đề nghị thanh toán đọc `net_weight` của header, không
  cộng từ bảng con.
- Phải ghi đủ `facility_id` + `rubber_type` + `price_unit` + `unit_price`, nếu không phiếu
  không bao giờ gom được vào Đề nghị thanh toán.

### 1.3 Khách lẻ lưu ở đâu

- **Khách vãng lai** (mặc định): chỉ ghi tên + SĐT lên phiếu (`supplier_name`, `driver_phone`).
  Đề nghị thanh toán lấy đúng tên đó làm người nhận tiền — đã có tiền lệ 2 phiếu nhập tay ở
  Phong Điền. Không tạo master data.
- **Khách quen**: chọn từ danh bạ đối tác ERP → gắn `partner_id` ⇒ chứng từ chi tự có số tài
  khoản ngân hàng, và có sổ công nợ.
- App **không tạo đối tác mới**: role `anon` không có quyền INSERT vào `b2b.partners`, và mở
  cho bàn cân tạo đối tác thì danh bạ ngập rác trùng tên trong một tuần. Ai cần theo dõi công
  nợ thì kế toán tạo trên ERP.

### 1.4 Giá & công thức tiền

- **Mủ tạp = giá theo kg TƯƠI** (`price_unit='wet'`, không nhân DRC). Quy tắc gốc của hệ thống:
  `mu_nuoc` → giá khô, mọi loại còn lại → giá tươi.
- Nguồn giá gợi ý: bảng giá ngày ERP → giá gõ gần nhất trên máy đó → để trống.
  *(Bảng `b2b.daily_price_list` hiện đang rỗng — app vẫn chạy bình thường, thao tác viên nhập giá.)*
- Giá cuối cùng ghi vào `weighbridge_tickets.unit_price`; kế toán thấy lại đúng số đó ở Đề nghị
  thanh toán với nhãn **Giá tại cân**, không phải gõ lại.
- Làm tròn: thành tiền chính xác tới **đồng**, số in cho khách làm tròn tới **nghìn** — đúng
  quy tắc `roundThousand` của kế toán.

---

## 2. Đã làm

### Migrations — ✅ ĐÃ CHẠY trên production 2026-08-21

| File | Nội dung |
|---|---|
| [retail_scale_p1_ticket_type.sql](migrations/retail_scale_p1_ticket_type.sql) | Nới CHECK `ticket_type` + `'retail'`, `source_type` + `'retail'`, index tra phiếu lẻ |
| [retail_scale_p2_lot_columns.sql](migrations/retail_scale_p2_lot_columns.sql) | Thêm `gross_kg`, `tare_kg`, `container_count`, `container_type` vào `weighbridge_ticket_lots` |
| [retail_scale_p3_daily_price_anon.sql](migrations/retail_scale_p3_daily_price_anon.sql) | Cho `anon` đọc bảng giá ngày (RLS đang chặn, app đọc ra rỗng mà không báo lỗi) |

Script kèm theo:

- [`docs/retail_scale_run_migrations.ps1`](retail_scale_run_migrations.ps1) — chạy cả 3 file (idempotent).
- [`docs/retail_scale_preflight.ps1`](retail_scale_preflight.ps1) — kiểm DB đã sẵn sàng chưa.
- [`docs/retail_scale_smoke_test.ps1`](retail_scale_smoke_test.ps1) — tạo 1 phiếu thử + 2 bao **bằng
  anon key** (đúng quyền app thật), kiểm phiếu có lọt vào queue Đề nghị thanh toán và có bị
  lẫn vào app cân xe không, rồi tự xoá. Chạy sau mỗi lần đụng vào RLS/schema.

### Sửa trong ERP chính

| File | Thay đổi |
|---|---|
| `src/services/wms/wms.types.ts` | `TicketType` thêm `'retail'`; thêm `TICKET_TYPE_LABELS` + `ticketTypeLabel()` dùng chung |
| `src/services/wms/paymentRequestService.ts` | Gom cả phiếu `retail`; nguồn giá mới `price_source='retail'` đọc `unit_price` của phiếu |
| `src/services/b2b/dailyPriceListService.ts` | **Sửa bug có sẵn**: bảng đúng là view `b2b_daily_price_list`, không phải `daily_price_list` |
| `src/pages/wms/rubber-intake/PaymentRequestCreatePage.tsx` | Badge **Mủ lẻ** + **Giá tại cân**; chống crash khi gặp giá trị lạ |
| `src/pages/wms/weighbridge/*.tsx` | Bỏ suy nhị phân in/out — phiếu gate/fetch/retail hiện đúng tên |
| `src/hooks/useKeliScale.ts` | Thêm tuỳ chọn `storageNamespace` + `useFacilityDefaults` (mặc định giữ nguyên hành vi cũ) |

### App con

`App.tsx` · `ScaleProvider` (1 instance đầu cân duy nhất) · `useStableWeight` (chốt số) ·
`retailTicketService` / `retailPriceService` / `retailCustomerService` · `lib/retail.ts`
(công thức tiền, đọc số bằng chữ) · 5 trang (Login, Home, Weigh, Print, Settings) ·
`RetailTicketSheet` (phiếu 80mm + A5).

**Bốn chỗ làm tốt hơn app cân xe:**

- *Chốt số trước khi ghi cân*: app cân xe lấy thẳng số tại thời điểm bấm nút, và cờ `stable`
  của đầu cân hiện tại luôn `true` nên vô nghĩa. Ở đây số phải đứng yên trong ±0.2 kg liên tục
  ≥800 ms mới cho bấm — bao mủ 20–60 kg đặt lên nhấc xuống liên tục, bấm trúng lúc số nhảy là
  sai tiền thật. Thêm cảnh báo khi cân chưa về 0 giữa 2 bao (chồng bao = tính tiền gấp đôi).
- *Một instance đầu cân*: app cân xe gọi hook ở 3 trang → 3 watchdog tranh cổng COM.
- *Chiều cao phiếu in đo động*: CSS **không có** `@page { size: <width> auto }` (viết vậy là
  cú pháp sai, Chrome vứt cả dòng). App đo chiều cao thật của phiếu rồi bơm vào `@page` ngay
  trước khi in, nên phiếu 30 bao không bị cắt ngang.
- *Rollback thật khi lưu hỏng*: supabase-js không throw khi DELETE lỗi. Nếu bỏ qua kết quả,
  app sẽ báo "đã huỷ phiếu" trong khi phiếu vẫn nằm trong queue chi tiền → bấm Lưu lại là
  **chi hai lần**. Ở đây kiểm cả lỗi lẫn số dòng, không xoá được thì hạ `status='cancelled'`,
  vẫn không được thì báo rõ mã phiếu để kế toán loại ra.

---

## 3. Chưa làm / cố ý bỏ

| Việc | Lý do |
|---|---|
| Chi tiền mặt tại cân + sổ quỹ ca | Chốt dùng Đề nghị thanh toán như các luồng khác. Nếu sau này muốn chi ngay tại cân thì **bắt buộc** thêm cột đánh dấu đã chi và đưa vào bộ lọc `listAvailableTickets`, nếu không kế toán vẫn gom được phiếu đó → **chi hai lần** |
| Đưa mủ lẻ vào lý lịch mủ (`rubber_intake_batches`) | Bridge chỉ chạy cho `ticket_type='in'`. Cố ý không nới: bridge nuôi `compute_monthly_bonus` (thưởng đại lý B2B), hộ tiểu điền lọt vào đó là thổi phồng thưởng. Cần thì viết hàm riêng |
| Dữ liệu EUDR | Chốt không cần cho mủ lẻ |
| Ảnh/camera | Khách đi xe máy, không có biển số xe tải để chụp; tránh phải gánh thêm `camera-proxy.exe` |
| Gỡ `/b2b/intake/walkin` | [WalkinWizardPage.tsx](../src/pages/b2b/intake/WalkinWizardPage.tsx) là flow 🅲 dở dang (Select nhà máy/kho rỗng, chưa in, công thức nhân DRC cho cả mủ tạp — sai ~2.5 lần). **Nên gỡ hoặc trỏ sang app mới sau pilot**, tránh 2 đường nhập liệu song song |

---

## 4. Việc còn lại

1. ~~Chạy 3 migration~~ — **xong 2026-08-21**, preflight + smoke test (anon key) đều PASS.
2. ~~Build + typecheck~~ — **xong 2026-08-22** (Node v24.19.0):
   `apps/retail-scale` build xanh (1,43 MB · gzip 450 kB), `npm run typecheck` sạch,
   dev server lên được. Build lại cả `apps/weighbridge` và ERP chính → đều xanh.
3. Tạo Vercel project, Root Directory = `apps/retail-scale`, bật *Include source files
   outside of the Root Directory in the Build Step*.
   ⚠ Máy này **chưa cài git** nên chưa push được — cài Git for Windows rồi push lên `main`
   để Vercel tự deploy.
4. Kế toán đặt giá ngày cho `mu_tap` trong ERP (không bắt buộc — chỉ để đỡ phải gõ giá;
   không đặt thì app nhớ giá gõ gần nhất theo từng máy trạm).
5. Pilot 1 nhà máy, chạy song song sổ tay 3 ngày, đối chiếu tổng kg + tổng tiền.

---

## 4b. Bài học: `npm run build` KHÔNG kiểm kiểu

Script build của cả repo là `vite build` **thuần** — esbuild bóc type đi rồi bundle, không
chạy `tsc`. Build xanh **không** chứng minh code đúng kiểu.

Lần typecheck đầu tiên (`npm run typecheck`) bắt ngay 2 lỗi thật mà build đã cho qua:

1. **`printCss` biến thành `NaN`** — comment trong template literal của `PrintPage.tsx` có
   dấu backtick, làm đóng chuỗi CSS sớm; phần còn lại thành phép nhân hai chuỗi. Cú pháp JS
   hợp lệ nên build xanh, nhưng khi in thì **toàn bộ CSS in biến mất**: in ra cả header, nút
   bấm, nền xám, không có `@page`. Đây đúng là loại lỗi mà review bằng mắt rất khó thấy.
2. **`weighbridgeService.getAll` sai kiểu `facility_id`** (lỗi có sẵn từ trước, chưa ai thấy):
   `WMSPaginationParams.facility_id?: string` giao với `facility_id?: string | null` rút gọn
   thành `string | undefined`, nên mọi caller truyền `facility?.id || null` đều lỗi TS2322.

⇒ Chạy `npm run typecheck` trước mỗi lần deploy, đừng tin mỗi `npm run build`.
Lưu ý: lệnh này còn báo ~17 lỗi **có sẵn** trong ERP (finance, attendance, dispatch) — không
liên quan app mủ lẻ, chỉ cần đọc các dòng có đường dẫn `apps/retail-scale/`.

## 5. Rủi ro còn lại

| Rủi ro | Ghi chú |
|---|---|
| Mất mạng tại điểm cân | App chưa có hàng đợi offline — mất mạng là không lưu được phiếu. Cân nhắc bổ sung nếu điểm cân hay rớt mạng |
| PIN lưu plaintext, `anon` đọc được cả cột `pin_code` | Lỗ hổng **có sẵn** của app cân xe, app mới kế thừa. Chưa vá vì phải sửa đồng thời 2 app (đổi sang RPC `verify_scale_pin`) — nên xử lý riêng một đợt |
| Mã phiếu sinh ở client (`SELECT max` + 1) | Đã tách prefix `ML-` để không đụng `CX-` của cân xe, và có retry khi trùng. Muốn chắc hơn thì chuyển sang sequence phía DB |
| Giá gõ nhầm | Có màn xác nhận trước khi lưu (hiện rõ loại mủ, kg, đơn giá, thành tiền + đọc bằng chữ) |
