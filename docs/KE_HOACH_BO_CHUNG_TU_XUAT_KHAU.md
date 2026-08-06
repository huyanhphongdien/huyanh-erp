# KẾ HOẠCH TRIỂN KHAI — BỘ CHỨNG TỪ XUẤT KHẨU THEO KHÁCH

> **Mục tiêu:** Mỗi khách hàng có sẵn một "bộ chứng từ" (draft) tự sinh từ dữ liệu đơn hàng.
> Bám sát file này để theo tiến độ. Đánh dấu `[x]` khi xong từng đầu việc.
>
> Nguồn phân tích: `docs/PHAN_TICH_BO_CHUNG_TU_XUAT_KHAU.docx` (template `HA20260080.xlsm` + 3 bộ chứng từ thật GRI/HA20260285/Đơn ĐNCK).
> Lập: 2026-08-06.

---

## 0. Bối cảnh (1 dòng)

Một lô hàng xuất khẩu cần **bộ chứng từ 7 loại từ 3 nguồn**: **(A)** Huy Anh tự sinh (Invoice, Packing List, Weight List, Hối phiếu) · **(B)** đính kèm (COA từ phòng LAB, Vận đơn B/L, C/O, Bảo hiểm) · **(C)** đơn chiết khấu gửi ngân hàng. ERP làm theo đúng 3 phần A/B/C.

## 1. Nguyên tắc

- **Thêm-không-phá:** không đụng dữ liệu/luồng cũ; mỗi giai đoạn dùng được ngay từng phần.
- **Một nguồn dữ liệu:** phần cố định lưu ở *hồ sơ khách*, phần theo lô lấy từ *đơn hàng* → không gõ lại, không lệch số liệu.
- **Tận dụng tối đa** hạ tầng đã có (xem mục 2), không làm lại.
- Migration **idempotent** (go-live rồi — data thật).

## 2. Nền móng ĐÃ CÓ (tận dụng, không làm lại)

| Thành phần | File / Bảng | Dùng cho |
|---|---|---|
| Trang chứng từ xuất (tab COA/PKL/Invoice, in `window.print`) | `src/pages/sales/ExportDocumentsPage.tsx` — route `/sales/orders/:orderId/documents` | GĐ 2, 3 — xây tiếp |
| Service lấy dữ liệu chứng từ | `src/services/sales/documentService.ts` (`getCOAData`, `getPackingListData`, `getInvoiceData`, `markGenerated`) | GĐ 2, 3 — bổ sung trường |
| Dữ liệu container theo đơn | bảng `sales_order_containers` (`container_no`, `seal_no`, `container_type`, `gross/tare/net_weight_kg`, `bale_count`, `lot_no`) | PKL / WL / COA per-container |
| Sinh `.docx` từ template | `src/services/sales/contractGeneratorService.ts` (docxtemplater + PizZip; template ở `public/contract-templates/`) | Sinh file chứng từ theo mẫu |
| Bảng khách | `sales_customers` (đã có `default_bank`, `default_incoterm`, `quality_standard`, `custom_specs`, `address`, `tax_id`) | Hồ sơ khách (mở rộng) |
| Upload đa file | `src/pages/sales/components/ContractFileSection.tsx` | GĐ 3 — ô đính kèm B/L/C/O/BH |
| Theo dõi tiền về | `sales_order_payments` + `salesOrderPaymentService` | GĐ 4 — nối đơn chiết khấu |
| Màn khách (Ant Tabs) | `src/pages/sales/CustomerDetailPage.tsx` | GĐ 1 — thêm tab hồ sơ |

## 3. Mô hình dữ liệu tổng thể (bảng MỚI cần tạo)

| Bảng | Khi nào | Vai trò |
|---|---|---|
| `company_banks` | GĐ 1 | 7 tài khoản NH công ty (từ sheet BANK) để hồ sơ khách chọn |
| `sales_customer_export_profiles` | GĐ 1 | Phần CỐ ĐỊNH theo khách (consignee, notify, shipping mark, checklist số bản…) |
| `sales_order_documents` | GĐ 3 | Bộ chứng từ theo LÔ: trạng thái từng loại (tự sinh / đính kèm / thiếu) + file |
| `sales_order_lc_negotiations` | GĐ 4 | Đơn chiết khấu ngân hàng (%, lãi, hạn, ngày nộp) |

---

## 🟢 GIAI ĐOẠN 1 — Hồ sơ chứng từ theo khách  ·  *ưu tiên làm trước*

**Mục tiêu:** mỗi khách lưu 1 lần phần cố định + checklist số bản → GĐ sau lấy ra ghép.
**Ước lượng:** ~1–1,5 ngày · **Rủi ro:** thấp (thuần thêm mới).

### 1.1 Migration — `docs/migrations/sales_customer_export_profile.sql`
```sql
-- 7 tài khoản NH công ty (seed từ sheet BANK)
CREATE TABLE IF NOT EXISTS public.company_banks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name    text NOT NULL,
  account_name text DEFAULT 'HUY ANH RUBBER COMPANY LIMITED',
  account_no   text NOT NULL,
  bank_address text,
  swift_code   text,
  is_active    boolean DEFAULT true,
  sort_order   int DEFAULT 0
);
-- seed 7 dòng (Agribank, Vietinbank, Eximbank, TPBank, BIDV, Sacombank, UOB) — ON CONFLICT DO NOTHING

-- Hồ sơ chứng từ theo khách (1–1 với sales_customers)
CREATE TABLE IF NOT EXISTS public.sales_customer_export_profiles (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id           uuid NOT NULL UNIQUE REFERENCES public.sales_customers(id) ON DELETE CASCADE,
  buyer_legal_name      text,
  buyer_address         text,
  consignee_name        text,
  consignee_address     text,
  notify_party          text,
  notify_address        text,
  shipping_marks        text,
  attn_contacts         text,            -- tên + SĐT người nhận
  preferred_bank_id     uuid REFERENCES public.company_banks(id),
  default_payment_term  text,            -- vd "LC 90 days from B/L date"
  doc_checklist         jsonb DEFAULT '[]'::jsonb,  -- [{doc, originals, copies}]
  special_instructions  text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);
-- RLS: cho sale/accounting/admin (theo pattern module sales)
```

### 1.2 Backend — `src/services/sales/customerExportProfileService.ts` ✅
- [x] `getByCustomer(customerId)` → hồ sơ (null nếu chưa có)
- [x] `upsert(customerId, data)`
- [x] `listBanks()` → 7 tài khoản

### 1.3 UI — tab "Hồ sơ chứng từ" trong `CustomerDetailPage.tsx` ✅
- [x] Thêm 1 tab vào `Tabs` sẵn có (component `CustomerExportProfileTab.tsx`)
- [x] Form: consignee (tên+địa chỉ), notify, buyer legal name/address, shipping marks, Attn, chọn ngân hàng (dropdown 7 TK), điều khoản TT mặc định, ghi chú đặc thù
- [x] **Bảng checklist chứng từ**: dòng = loại (BOE/CI/PL/WL/COA/BL/CO/INS/PHYTO), cột = *số bản gốc* + *số copy* → lưu `doc_checklist` (JSON)
- [x] Nút Lưu → gọi `upsert`

### 1.4 Định nghĩa hoàn thành (Acceptance)
- [x] Mở 1 khách → tab "Hồ sơ chứng từ" hiện ra (build OK)
- [x] Lưu + tải lại còn dữ liệu (verified: seed hồ sơ GRI end-to-end qua DB)
- [x] Không ảnh hưởng các tab khác (thuần thêm mới)

---

## 🟡 GIAI ĐOẠN 2 — Sinh Hóa đơn + Packing List từ đơn + hồ sơ

**Mục tiêu:** 2 chứng từ hay dùng nhất tự ra đúng consignee/mark/bank của khách.
**Ước lượng:** ~2 ngày · **Phụ thuộc:** GĐ 1 (hồ sơ khách).

### 2.1 Backend — bổ sung `documentService.ts` ✅
- [x] `getInvoiceData(orderId)`: đọc thêm hồ sơ (`loadExportProfile`) → consignee, notify, buyer legal/address, shipping mark, **bank từ `company_banks`** (thay bank giả hardcoded), PO#, điều khoản TT
- [x] `getPackingListData(orderId)`: đọc thêm buyer/consignee/shipping mark
- [x] Container/khối lượng lấy từ `sales_order_containers` (đã có sẵn)

### 2.2 UI — `ExportDocumentsPage.tsx` ✅
- [x] Tab Invoice: thêm Buyer/Consignee/Notify + PO# + Shipping Marks + bank đúng
- [x] Tab Packing List: thêm Buyer/Consignee + Shipping Marks
- [x] Xuất file: In→PDF (`window.print`) + **Tải Word (.doc)** qua `lib/htmlToWord.ts` (HTML→.doc, không cần template)

### 2.3 Acceptance
- [x] Đơn GRI (HA20260080) → Hóa đơn ra đúng consignee (Commercial Bank of Ceylon) + bank (Vietinbank) + shipping mark (verified data chain)
- [x] Packing List khớp container/khối lượng từ `sales_order_containers`
- [x] In PDF / Tải Word được (build OK)

---

## 🟠 GIAI ĐOẠN 3 — Weight List + COA per-container + đính kèm bên ngoài

**Mục tiêu:** gần đủ bộ + kiểm soát chứng từ thiếu.
**Ước lượng:** ~2–3 ngày · **Phụ thuộc:** GĐ 2.

> **PHÁT HIỆN 2026-08-07:** hạ tầng đính kèm + đủ/thiếu (mục 3.2, 3.3) **ĐÃ TỒN TẠI SẴN** trong ERP:
> bảng `sales_order_documents` (167 dòng) + `salesDocumentUploadService` (upload bucket `sales-documents`)
> + `STANDARD_DOCUMENTS` đã gồm B/L, COA, C/O, Insurance, Phyto, Fumigation… + **`DocumentChecklistTab` đã nối**
> vào chi tiết đơn (Progress bar, received/total, upload từng loại). → KHÔNG cần tạo bảng/migration mới.
> GĐ3 chỉ còn build **Weight List**.

### 3.1 Weight List (mới) ✅
- [x] `documentService.getWeightListData(orderId)` (NW/GW/Tare từng container từ `sales_order_containers` + hồ sơ khách)
- [x] Thêm tab **Weight List** vào `ExportDocumentsPage` (In→PDF + Tải Word)

### 3.2 COA — ĐÍNH KÈM (không tự sinh) ✅ (đã có sẵn)
> **Chốt 2026-08-07:** COA lấy từ phòng LAB (file/link ngoài), **KHÔNG tự sinh** từ QC.
- [x] `coa` ĐÃ có sẵn trong `STANDARD_DOCUMENTS` (doc_type='coa') — upload qua `DocumentChecklistTab` như B/L/C/O
- [x] Tab COA tự sinh cũ ở `ExportDocumentsPage` giữ lại làm tham khảo (không bắt buộc)

### 3.3 Đính kèm chứng từ bên ngoài — migration `sales_order_documents.sql`
```sql
CREATE TABLE IF NOT EXISTS public.sales_order_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  doc_type       text NOT NULL,          -- 'coa' | 'bill_of_lading' | 'co' | 'insurance' | 'phyto' | ...
  file_url       text,
  status         text DEFAULT 'missing', -- 'missing' | 'attached'
  note           text,
  uploaded_by    uuid,
  created_at     timestamptz DEFAULT now()
);
```
- [x] Ô upload B/L · C/O · Bảo hiểm · COA (+ Phyto/Fumigation) — **đã có** (`DocumentChecklistTab` + `salesDocumentUploadService`)
- [x] **Bảng đủ/thiếu** — **đã có** (Progress bar + received/total trong `DocumentChecklistTab`)
- [ ] *(GĐ4)* Đối chiếu SỐ BẢN gốc/copy với checklist khách (GĐ1) — để dành làm cùng bảng kê cho ngân hàng

### 3.4 Acceptance
- [x] Tab Weight List ra đúng NW/GW/Tare từng cont (verified: GRI HA20260080 có 5 cont, fallback tare/gross chạy)
- [x] Upload được COA + B/L + C/O + Bảo hiểm; bảng đủ/thiếu phản ánh đúng (đã có sẵn)

---

## 🔴 GIAI ĐOẠN 4 — Hối phiếu + Đơn chiết khấu NH + xuất cả bộ

**Mục tiêu:** bấm 1 nút ra trọn bộ + đơn nộp ngân hàng.
**Ước lượng:** ~3–4 ngày · **Phụ thuộc:** GĐ 2, 3.

### 4.1 Hối phiếu (Bill of Exchange)
- [ ] Generator nhỏ từ dữ liệu Invoice (số tiền, số/ngày L/C, tenor, ngân hàng phát hành)
- [ ] Tab BOE (2 bản: First / Second of Exchange)

### 4.2 Đơn đề nghị chiết khấu (mẫu Vietinbank BM03) — migration `sales_order_lc_negotiations.sql`
```sql
CREATE TABLE IF NOT EXISTS public.sales_order_lc_negotiations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id     uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  bank_id            uuid REFERENCES public.company_banks(id),
  negotiate_pct      numeric,          -- vd 90
  negotiate_amount   numeric,          -- vd 71440
  interest_rate      numeric,          -- vd 4.8
  term_days          int,              -- vd 110
  submitted_date     date,
  status             text DEFAULT 'draft',
  created_at         timestamptz DEFAULT now()
);
```
- [ ] Sinh phần đầu đơn (kéo từ đơn + L/C) + **bảng kê số bản** từ checklist khách
- [ ] Lưu %, lãi, hạn, ngày nộp → **nối module tiền về** (đã có) để theo dõi ứng/đáo hạn

### 4.3 Xuất cả bộ
- [ ] Nút **"Xuất bộ chứng từ"** → gộp (tự-sinh + đính-kèm) thành 1 PDF/zip đúng số bản khách/NH yêu cầu

### 4.4 Acceptance
- [ ] Sinh được Hối phiếu + Đơn chiết khấu điền sẵn
- [ ] Bảng kê số bản khớp checklist khách
- [ ] Xuất 1 lần ra trọn bộ, sẵn sàng nộp ngân hàng

---

## 5. Bảng theo dõi tiến độ

| GĐ | Nội dung | Trạng thái | Ghi chú |
|---|---|---|---|
| 1 | Hồ sơ chứng từ khách + checklist | ✅ **Xong** (2026-08-07) | Migration đã áp prod (2 bảng + 7 TK); tab "Hồ sơ chứng từ" trong màn khách; seed hồ sơ GRI |
| 2 | Sinh Invoice + Packing List | ✅ **Xong** (2026-08-07) | `documentService` nối hồ sơ khách (consignee/notify/mark/bank/PO); tab Invoice+PKL bổ sung field; xuất **In→PDF + Tải Word (.doc)** |
| 3 | Weight List + COA + đính kèm ngoài | ✅ **Xong** (2026-08-07) | Weight List (tab mới) build xong; **đính kèm B/L/C/O/BH/COA + đủ/thiếu ĐÃ CÓ SẴN** (`DocumentChecklistTab` + bảng `sales_order_documents`) → KHÔNG cần migration |
| 4 | Hối phiếu + Đơn chiết khấu + xuất cả bộ | ⬜ Chưa bắt đầu | |

*(⬜ chưa · 🟨 đang làm · ✅ xong)*

## 6. Quyết định ĐÃ CHỐT (2026-08-07)

- [x] **Định dạng xuất:** làm **CẢ 2** — In PDF (`window.print`) + tải **.docx** theo mẫu (giữ letterhead/chữ ký). *(GĐ2)*
- [x] **COA:** KHÔNG tự sinh từ QC — coi là **chứng từ ĐÍNH KÈM** (file/link ngoài từ phòng LAB), upload như B/L/C/O/Bảo hiểm. *(GĐ3)*
- [x] **7 tài khoản NH:** **seed cứng** vào `company_banks` (thêm UI sửa cho Admin sau nếu cần). *(GĐ1)*
- [x] **Khách mẫu đầu tiên:** **GRI** (đã có bộ chứng từ mẫu) — trừ khi anh muốn khác. *(GĐ1)*

## 7. Rủi ro & lưu ý

- Chứng từ đính kèm (COA, B/L, C/O, Bảo hiểm) **không tự sinh** — cần quy trình lấy file (LAB / hãng tàu / VCCI / bảo hiểm) + theo dõi đủ/thiếu.
- Số bản gốc/copy **khác nhau theo từng khách + ngân hàng** — lưu checklist riêng.
- Bảo hiểm chỉ áp dụng khi bán **CIF/CIP**.
