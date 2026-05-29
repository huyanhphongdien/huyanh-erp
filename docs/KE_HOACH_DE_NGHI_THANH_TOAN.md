# KẾ HOẠCH: Đề nghị thanh toán mua mủ (tự sinh từ phiếu cân)

> Ngày lập: 2026-05-29 · Phạm vi: ERP (huyanhrubber.vn) · Module: WMS / Nhập kho mủ
> Trạng thái: ĐÃ CHỐT THIẾT KẾ — chờ code Đợt 1.

## 1. Mục tiêu
Cuối ngày, nhân viên thu mua **tổng hợp các phiếu cân** (mua mủ trực tiếp tại nhà máy) thành **1 phiếu "ĐỀ NGHỊ THANH TOÁN"** gửi BGĐ/Kế toán để chi tiền cho người bán. Hiện làm tay trên Excel — mục tiêu cho ERP **tự sinh từ dữ liệu cân**.

Mẫu giấy hiện hành: `docs/du lieu tho/BÁO CÁO KHỐI LƯỢNG HẰNG NGÀY MỦ NƯỚC TÂN LÂM.xlsx` (+ ảnh mẫu Đề nghị thanh toán TMMN-08-02).

## 2. Chuỗi chứng từ thực tế (Tân Lâm / HAQT)
1. **Phiếu chốt giá (PCG)** — mã `TMMN-NN`: chốt đơn giá (giá sàn 59–60tr/tấn) + các phí (bốc xếp/bến bãi/thuế xã/hoa hồng) + loại tiền (VNĐ/KIP/THB) + hình thức mua (Đại lý/Hộ ND/Công ty). → nơi ra **đơn giá**.
2. **Cân** tại nhà máy → khối lượng (`weighbridge_tickets`).
3. **Lý lịch mủ (LLM)** — mã `TMMN-NN-NN`: xe/rơ-mooc, KL, ngày nhập, ký QC/Kế toán/Thu mua/Bảo vệ.
4. **Đề nghị thanh toán** — cuối ngày gom theo người bán: KL × đơn giá = thành tiền, trả theo tài khoản.

> Trong ERP: dòng đề nghị = phiếu cân (`weighbridge_tickets`: KL `actual_net_weight`, `unit_price` kế thừa từ PCG).

## 3. Quyết định đã chốt
| # | Quyết định |
|---|---|
| 1 | **Tài khoản người nhận: gõ tay mỗi dòng** (tên/STK/ngân hàng/ghi chú). KHÔNG làm bảng `supplier_payment_accounts` ở đợt 1. Default lấy từ NCC nếu có, sửa được. (Lý do thực tế: thường trả vào TK người thân — con/vợ/chồng — kèm ghi chú quan hệ.) |
| 2 | **Phí xử lý riêng** — đề nghị thanh toán CHỈ liệt kê KL × đơn giá. Không cộng/trừ phí vào thành tiền. |
| 3 | **Đa tiền tệ: đợt 1 chỉ VNĐ**, chừa cột `currency` + `exchange_rate` cho Lào (KIP/THB) sau. |
| 4 | **Vị trí: WMS / Nhập kho mủ**, nguồn từ phiếu cân Tân Lâm. |
| 5 | **Linh hoạt lô-trong-deal / lô-ngoài-deal**: đề nghị thanh toán gom CẢ HAI (nguồn = phiếu cân). Đường chi cho lô-có-deal = **PA1**: đề nghị thanh toán là **cửa chi DUY NHẤT** (cả deal lẫn lẻ); quyết toán B2B = đối soát, không tự chi. (xem §4.1) |

## 4.1 Linh hoạt lô-trong-deal / lô-ngoài-deal (QUAN TRỌNG)
Lúc cân (`WeighingPage`), mỗi phiếu chọn **nguồn**:
- **Deal**: `weighbridge_tickets.deal_id` + `partner_id` (đại lý B2B). Walk-in/hộ ND cũng tạo deal `purchase_type='farmer_walkin'`.
- **Supplier (mua lẻ)**: `supplier_id`, KHÔNG có `deal_id`.

Đề nghị thanh toán gom theo **NM + ngày + loại mủ** từ `weighbridge_tickets` → **bao gồm cả 2 loại**. Mỗi dòng:
- Hiển thị nguồn: `Deal {số} · {đại lý}` hoặc `Mua lẻ · {NCC}`.
- Prefill payee: deal → tên đại lý/partner; supplier → tên NCC; **gõ đè được** (thực tế trả vào TK người thân).
- Đơn giá: `ticket.unit_price` (kế thừa từ deal/PCG).

### ⚠️ Quyết định cần chốt — đường chi tiền cho lô-CÓ-deal (tránh trả trùng)
Lô có deal hiện có 2 đường tiền tiềm năng: (A) **Đề nghị thanh toán** (tài liệu này), (B) **Quyết toán B2B** (settlement → ledger `payment_paid`). Nếu cả 2 cùng chi → **trả trùng**. Phải chọn:
- **PA1 (khuyến nghị):** Đề nghị thanh toán = **đường chi tiền DUY NHẤT** cho mua mủ (cả deal lẫn lẻ). Quyết toán/settlement chỉ để **chốt giá trị/đối soát**, không tự sinh chi. → 1 cửa chi, đúng thực tế Tân Lâm.
- **PA2:** Lô-có-deal chi qua **quyết toán B2B** (như hiện tại); đề nghị thanh toán **chỉ gom lô-không-deal** (mua lẻ). Hệ thống tự loại lô-có-deal khỏi đề nghị (hoặc cảnh báo). → tách 2 luồng.

> **ĐÃ CHỐT: PA1** — Đề nghị thanh toán là cửa chi tiền DUY NHẤT cho mua mủ (cả deal lẫn lẻ). Quyết toán/settlement chỉ chốt giá trị/đối soát, KHÔNG tự sinh chi.
> → Filter phiếu cân: gom mọi ticket `completed` + `payment_request_id IS NULL` (không lọc theo deal). Đợt 2: payment ledger chỉ sinh từ đề nghị thanh toán.

## 4. Nguồn dữ liệu (đã có sẵn)
- `weighbridge_tickets`: `code` (số phiếu), `completed_at` (ngày), `facility_id`, `supplier_id/supplier_name`, `rubber_type`, `unit_price`, `price_unit`, `actual_net_weight`, `estimated_value`, `qc_status/status`.
- `rubber_suppliers`: `bank_holder`, `bank_account`, `bank_name`, `payment_method` → prefill payee (gõ đè được).

---

## 5. ĐỢT 1 — Tạo + In (chưa workflow)

### 5.1 DB — migration `docs/migrations/wms_payment_request.sql`
```sql
-- Bảng đầu phiếu
CREATE TABLE public.payment_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text UNIQUE NOT NULL,          -- default TMMN-{YYMM}-{seq}, sửa được
  facility_id   uuid,                           -- nhà máy (Tân Lâm…)
  request_date  date NOT NULL,
  rubber_type   text,                           -- 'mu_nuoc'…
  reason        text,                           -- "Đề nghị thanh toán tiền mua Mủ Nước…"
  payment_method text DEFAULT 'bank_company'    -- bank_company | fund | cash
                 CHECK (payment_method IN ('bank_company','fund','cash')),
  department    text DEFAULT 'HCTH',
  requested_by  uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  currency      text NOT NULL DEFAULT 'VND',    -- chừa cho KIP/THB
  exchange_rate numeric NOT NULL DEFAULT 1,
  status        text NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','pending_approval','approved','paid','cancelled')),
  total_weight_kg numeric NOT NULL DEFAULT 0,
  total_amount    numeric NOT NULL DEFAULT 0,
  approved_by   uuid REFERENCES public.employees(id) ON DELETE SET NULL,  -- Đợt 2
  approved_at   timestamptz,
  paid_at       timestamptz,
  notes         text,
  created_by    uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Bảng dòng
CREATE TABLE public.payment_request_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    uuid NOT NULL REFERENCES public.payment_requests(id) ON DELETE CASCADE,
  ticket_id     uuid,                           -- nguồn: weighbridge_tickets
  line_no       int NOT NULL DEFAULT 0,
  content       text,                           -- "Thanh toán tiền mua mủ nước số phiếu N"
  unit          text NOT NULL DEFAULT 'kg',
  weight_kg     numeric NOT NULL DEFAULT 0,
  unit_price    numeric NOT NULL DEFAULT 0,
  amount        numeric NOT NULL DEFAULT 0,     -- weight_kg × unit_price (app tính)
  payee_name    text,                           -- gõ tay (default từ supplier)
  payee_account text,                           -- STK, gõ tay
  payee_bank    text,                           -- ngân hàng, gõ tay
  payee_note    text                            -- ghi chú quan hệ ("vợ của…")
);

-- Chống trả trùng: 1 phiếu cân chỉ vào 1 đề nghị
ALTER TABLE public.weighbridge_tickets
  ADD COLUMN IF NOT EXISTS payment_request_id uuid;

CREATE INDEX IF NOT EXISTS idx_pr_facility_date ON public.payment_requests(facility_id, request_date);
CREATE INDEX IF NOT EXISTS idx_prl_request ON public.payment_request_lines(request_id);
CREATE INDEX IF NOT EXISTS idx_wt_payment_request ON public.weighbridge_tickets(payment_request_id)
  WHERE payment_request_id IS NOT NULL;

-- RLS: authenticated RW (siết theo role ở Đợt 2). GRANT + ENABLE RLS + policy.
```
> Sinh `code`: app-side `TMMN-{YYMM}-{seq}` (seq = số đề nghị trong tháng + 1), cho **sửa tay**.

### 5.2 Service `src/services/b2b/paymentRequestService.ts`
- `listAvailableTickets({ facility_id, date, rubber_type })` → phiếu cân đã hoàn tất, `payment_request_id IS NULL`, đúng filter; prefill payee từ `rubber_suppliers`.
- `create({ header, lines[] })` → insert `payment_requests` + `payment_request_lines`; UPDATE `weighbridge_tickets.payment_request_id`; tính `total_weight_kg`, `total_amount`. (Transaction/RPC để an toàn — hoặc insert tuần tự + rollback nếu lỗi.)
- `list({ facility_id?, date_from?, date_to?, status?, page })`, `getById(id)`, `cancel(id)` (gỡ `payment_request_id` khỏi ticket khi huỷ).

### 5.3 UI — WMS / Nhập kho mủ → tab "Đề nghị thanh toán"
- **List** (`/wms/rubber-intake/payment-requests`): bảng (code, ngày, NM, loại mủ, tổng KL, tổng tiền, status) + nút "Tạo đề nghị" + xuất Excel (AdvancedDataTable).
- **Tạo**: filter NM + Ngày + Loại mủ → bảng phiếu cân khả dụng (checkbox, KL, đơn giá, thành tiền) + ô gõ payee (tên/STK/NH/ghi chú) mỗi dòng → header (người đề nghị, bộ phận, lý do, hình thức nhận tiền) → "Tạo".
- **Chi tiết**: hiển thị phiếu + các dòng + nút **In**.

### 5.4 Mẫu in (khớp giấy)
Header logo + **CÔNG TY … HUY ANH PHONG ĐIỀN** + MST → tiêu đề **ĐỀ NGHỊ THANH TOÁN** → Ngày · Số phiếu · Kính gửi BGĐ/KTT · Người đề nghị · Bộ phận · MSNV · Lý do · Hình thức nhận tiền (checkbox) · Tên TK/Số TK/Tại NH → bảng (STT / Nội dung / ĐVT / Số lượng / Đơn giá / Thành tiền / Ghi chú) → **Tổng cộng** → **Bằng chữ** (hàm đọc số→chữ, tái dùng nếu có, không thì viết util) → 4 ô ký: **BGĐ duyệt · Kế toán trưởng · Trưởng bộ phận · Người đề nghị**.

### 5.5 Tiêu chí hoàn thành Đợt 1
- Lọc đúng phiếu cân theo NM/ngày/loại mủ, không hiện phiếu đã thuộc đề nghị khác.
- Tạo đề nghị → tổng KL/tiền đúng; phiếu cân bị "khoá" khỏi đề nghị khác.
- In ra đúng layout mẫu (có số tiền bằng chữ).
- Type-check sạch; migration chạy được trên Supabase.

---

## 6. ĐỢT 2 — Workflow + Ghi sổ + Đa tiền tệ

### 6.1 Workflow duyệt
- `status`: draft → **pending_approval** (NV gửi) → **approved** (BGĐ/KTT duyệt) → **paid** (Kế toán xác nhận đã chi) → cancelled.
- Trang duyệt cho BGĐ/Kế toán (lọc pending_approval); ghi `approved_by/at`.
- Phân quyền (role): NV tạo/gửi; manager/admin duyệt; kế toán đánh dấu chi.

### 6.2 Ghi sổ công nợ khi chi (theo PA1)
- Khi `status → paid`: ghi bút toán ledger **`payment_paid`** (credit) cho từng người bán/NCC → nối vào sổ công nợ.
- **PA1**: đề nghị thanh toán là **NGUỒN DUY NHẤT** sinh `payment_paid`. Quyết toán/settlement **KHÔNG** tự ghi `payment_paid` (chỉ chốt giá trị/đối soát).
  - ⚠️ Phải rà lại đường chi hiện tại của settlement (app ghi `payment_paid` per-đợt) để **gỡ/tắt** nhằm tránh double-write khi chuyển sang PA1.
- Đánh dấu `paid_at`; (tuỳ) liên kết phiếu chi/UNC.

### 6.3 Đa tiền tệ (Lào)
- Dùng `currency` (VND/KIP/THB) + `exchange_rate`. Hiển thị thành tiền theo loại tiền; quy đổi VNĐ để tổng hợp báo cáo.

### 6.4 Tuỳ chọn mở rộng
- Bảng danh bạ TK người bán (`supplier_payment_accounts`) để chọn nhanh thay vì gõ tay (số hoá "DS TÀI KHOẢN KH" + map trả hộ).
- Gộp phí (bốc xếp/bến bãi/thuế xã/hoa hồng) nếu sau này muốn đề nghị thanh toán bao gồm cả phí.
- Báo cáo: tổng chi mua mủ theo ngày/tháng/nhà máy.

---

## 7. Triển khai
- **Migration**: `docs/migrations/wms_payment_request.sql` — chạy trên Supabase (SQL Editor) trước khi dùng.
- **Code**: đẩy lên `main` → Vercel auto-deploy huyanhrubber.vn.
- **Test**: tạo phiếu cân mủ nước Tân Lâm (có supplier + giá) → tạo đề nghị → in → đối chiếu mẫu.

## 8. Phụ thuộc / Lưu ý
- `weighbridge_tickets` phải có `unit_price` + `actual_net_weight` + `supplier_*` khi cân (đã có trong luồng cân hiện tại).
- Hàm đọc số → chữ tiếng Việt: kiểm tra tái dùng (contractGenerator/settlement) trước khi viết mới.
- Đợt 1 KHÔNG đụng tới luồng B2B partner (deal/quyết toán/ledger) — đây là luồng mua trực tiếp NCC.
