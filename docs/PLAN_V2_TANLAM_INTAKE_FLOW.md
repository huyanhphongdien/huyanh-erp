# Plan V2 — Áp dụng quy chế thưởng mủ nước + nghiệp vụ Tân Lâm

**Date**: 2026-05-26
**Mục đích**: phân tích ĐẦY ĐỦ từ schema thực tế ERP + 76 phiếu Excel TL, lên plan có thể execute từng bước không sai.
**Trạng thái**: ✅ **Decisions LOCKED** (user confirm 2026-05-26). Bắt đầu Sprint 1.

---

## 🔒 Decisions ĐÃ CHỐT (lock-in)

| D | Decision | Impact |
|---|---|---|
| **D1** | `drc_percent` lưu **percent (39.2)** | Công thức `dry_weight_kg = net × drc / 100` đúng |
| **D2** | Bonus tính **KL KHÔ** (`dry_weight_kg`) | Update `compute_monthly_bonus()` SUM dry_weight_kg |
| **D3** | Weighbridge **reuse `qc_actual_drc`** | Đổi nghĩa: "DRC đo tại cân lần 2" |
| **D5** | `pnk_number` **int sequential per (facility_id, năm)** | Trigger advisory_lock |
| **D7** | DROP VIEW CASCADE **OK** (đang test, dev mode) | Recreate sạch + RLS |
| **D8** | Workflow ĐNTT/BGĐ duyệt: **post go-live** | Out of scope Sprint 1-5 |
| **Proxy partner** | Đại lý đầu mối là `partner_type='dealer'` + flag `is_payment_proxy=true` | KHÔNG tạo type mới |
| **Import data** | **YES** import 76 phiếu Excel vào DB | Sprint 4, script Python |

---

## 🚜 Quy trình thực tế TL — Mủ nước (CRITICAL FOR UX)

User confirm 2026-05-26:

```
Step 1: Vào cân (gross)         ──→ Lưu gross_weight (xe + mủ)
                                    Operator click "Cân lần 1"
        ↓ Đại lý đến nhà máy
Step 2: Lấy mẫu mủ              ──→ Lấy ~50ml mẫu từ thùng xe
                                    (manual, không digital)
        ↓ Mẫu đem đi đo
Step 3: Đốt mẫu / Đo metrolac    ──→ Đốt mẫu (~20-30 phút) HOẶC
                                    Đo metrolac → ĐỐT số đọc
                                    (operator giữ giấy)
        ↓ Trong lúc đốt: xe vẫn ở nhà máy
Step 4: Xã mủ vào bể chứa        ──→ Xả mủ xuống bể tank nhà máy
                                    (manual, không digital)
        ↓ Xe trống
Step 5: Cân lần 2 (tare)        ──→ Cân xe rỗng (còn dính ít mủ)
                                    INPUT đồng thời:
                                      • ĐỐT (số đo từ Step 3)
                                      • DRC % (tự tính hoặc nhập tay)
                                    Auto tính:
                                      • Net = gross − tare
                                      • Dry = net × drc / 100
Step 6: Hoàn tất                  ──→ status='completed'
                                    Bridge tự tạo rubber_intake_batches
                                    + tính bonus (sau Sprint 1.3)
```

### Hệ luỵ thiết kế UX

- **Form cân TL có gap 20-30 phút** giữa Step 1 (gross) và Step 5 (tare + DRC).
- Operator có thể đóng/mở app nhiều lần trong gap → **state phải persist** ở `weighbridge_tickets` status='weighing_tare'.
- Card "Đo DRC" hiển thị khi ticket status='weighing_tare' (sau gross, trước tare).
- 2 input cùng card: ĐỐT (NumberInput) + DRC (auto-suggest từ ĐỐT, override OK).
- Click "Cân lần 2" → request weight từ scale + save ĐỐT/DRC cùng lúc.
- Click "Hoàn tất" → status='completed' → trigger bridge.

Khác với pattern cũ (DRC nhập ở QC riêng sau khi mủ vào bể): TL **chốt DRC ngay tại cân**.

---

## Phần A — Phân tích sâu

### A.1 Schema thực tế ERP hiện có

Đã probe trực tiếp PostgREST (`https://dygveetaatqllhjusyzz.supabase.co/rest/v1/`):

#### A.1.1 `rubber_intake_batches` — 40 cột ĐÃ CÓ

| Nhóm | Cột |
|---|---|
| Định danh | `id`, `lot_code`, `invoice_no`, `created_at`, `updated_at` |
| Nguồn | `source_type` (`vietnam` / `lao_direct` / `lao_agent`), `facility_id`, `b2b_partner_id`, `supplier_id`, `deal_id`, `weighbridge_ticket_id`, `stock_in_id` |
| Loại mủ | `raw_rubber_type` (5 loại detailed), `rubber_type` (2 loại bonus), `product_code` |
| Cân | `gross_weight_kg`, `net_weight_kg`, `drc_percent` |
| Giá VN (tươi) | `settled_qty_ton`, `settled_price_per_ton` |
| Giá Lào | `purchase_qty_kg`, `unit_price`, `price_currency`, `exchange_rate`, `total_amount_vnd` |
| Tổng | `total_amount` |
| Vận chuyển | `vehicle_plate`, `vehicle_label`, `location_name`, `buyer_name`, `intake_date` |
| Status | `status`, `payment_status`, `paid_amount`, `notes` |
| EUDR | `rubber_region`, `rubber_region_lat`, `rubber_region_lng`, `deforestation_risk_assessment`, `eudr_statement_ref` |
| Ảnh | `weighbridge_image_urls` (text[]) |

**Thiếu vs Excel TL**:
- `field_dot_reading` — số ĐỐT đo metrolac
- `planned_drc_percent` — DRC dự kiến lúc chốt giá
- `dry_weight_kg` — KL khô quy đổi (cần GENERATED)
- `consolidation_code` — mã LLM gộp xe (TMMN-07 XE 1)
- `pnk_number` — số phiếu nhập kho sequential (1-76)

#### A.1.2 `weighbridge_tickets` — Gap LỚN

| Có sẵn | Thiếu |
|---|---|
| `id`, `code` (CX-YYYYMMDD-XXX), `vehicle_plate`, `driver_name`, `driver_phone` | ⚠️ `drc_percent` (CHỈ có `qc_actual_drc` — pattern khác!) |
| `ticket_type` (in/out), `gross_weight`, `tare_weight`, `net_weight` | `field_dot_reading` |
| `gross_weighed_at`, `tare_weighed_at`, `completed_at` | `planned_drc_percent` |
| `partner_id`, `deal_id`, `supplier_name` | `total_amount`, `price_currency`, `exchange_rate` |
| `rubber_type` (5 loại detailed) | `raw_rubber_type` (column name khác intake) |
| `qc_actual_drc`, `qc_status`, `qc_notes`, `qc_checked_by` | `source_type` |
| `facility_id` (multi-NM) | `consolidation_code` |
| `sales_order_id`, `container_id`, `transfer_id` (out flow) | `unit_price` đã có nhưng chưa expose UI nhập |

**Mismatch điểm**: weighbridge_tickets dùng `qc_actual_drc` (sau QC tại nhà máy) ≠ `drc_percent` ở intake (DRC chung). Cần làm rõ pattern.

#### A.1.3 `b2b_partners` (view) — 35 cột

Đã có: phone, email, address, tax_code, national_id, bank_account/name/branch, tier, status, partner_type, country/province/district/ward, supplier_name_code, legal_representative.

**View KHÔNG expose** (mặc dù base table `b2b.partners` đã ADD):
- `bp_id` (HAC-13 link)
- `is_demo`

→ **BUG nhỏ**: migration trước (`b2b_demo_flag_and_facility_backfill.sql`) đã ADD cột vào `b2b.partners` nhưng KHÔNG `CREATE OR REPLACE VIEW b2b_partners`. View vẫn cũ → frontend không thấy `is_demo`. **Cần fix view trong migration kế tiếp**.

**Thiếu vs nghiệp vụ Tân Lâm**:
- `payment_proxy_partner_id` — đại lý đầu mối nhận tiền hộ (10+ partners ↘ 1 proxy)
- `contact_alias_name` — tên người ra mặt khi khác chủ TK ("vợ của", "chồng của")
- `is_payment_proxy` — flag đại lý này có nhận tiền hộ ai không

#### A.1.4 `b2b_deals` — 60 cột

Pricing fields đã có đầy đủ:
- `unit_price`, `final_price`, `currency`, `exchange_rate`, `total_amount`, `total_value_vnd`
- `quantity_kg`, `actual_weight_kg`, `delivered_weight_kg`, `finished_product_kg`
- `expected_drc`, `actual_drc`, `sample_drc`, `expected_output_rate`
- `processing_fee_per_ton`, `transport_fee`, `transport_by`

Có `lot_code` (single text), `lot_description`. Không có array.

**→ b2b_deals đã đủ cho deal-based**. Phí 7 loại của Excel có thể lưu trong JSONB phụ hoặc bảng riêng `b2b_deal_fees` (sau go-live).

#### A.1.5 `b2b_bonus_rules` — 12 cột (đã setup)

Có `rubber_type` (tap/nuoc), `tier_label`, `threshold_min_tons`, `threshold_max_tons`, `bonus_per_ton_vnd`, `effective_from/to`, `sort_order`.

**Vấn đề logic bonus**: Function `compute_monthly_bonus()` hiện `SUM(net_weight_kg)` (KL TƯƠI).

---

### A.2 Pattern thực tế từ 76 phiếu Excel

#### A.2.1 Hệ thống mã hàng có 2 LỚP

```
Lô tháng:     TMMN-07          ← Lô số 7 trong tháng 5
  ├─ Xe 1:    TMMN-07-01       ← Xe vận chuyển #1 (đi ngày 22/05)
  │   ├─ Phiếu cân 39: Oanh
  │   ├─ Phiếu cân 40: Gấm
  │   ├─ Phiếu cân 41: Thanh
  │   ├─ Phiếu cân 42: Thạo
  │   ├─ ... 9 đại lý ghép 1 xe
  ├─ Xe 2:    TMMN-07-02       ← Xe #2 (23/05) — 9 đại lý khác
  ├─ Xe 3:    TMMN-07-03       ← Xe #3 (24/05)
  ├─ Xe 4:    TMMN-07-04       ← Xe #4 (25/05)
  └─ Xe 5:    TMMN-07-05       ← Xe #5 (26/05)

LLM (cột 17): "TMMN-06 (đưa mủ nước về nhà máy)" ← Mã LLM giao kho ≠ Mã lô
```

**Insight**: `lot_code` = TMMN-XX-YY (lô-xe) ≠ LLM = TMMN-NN (giao kho).

Có 2 grouping độc lập:
- **Lô vận chuyển** (TMMN-07-01 ÷ TMMN-07-05): nhóm đại lý ghép xe theo ngày → 1 lô = 1 chuyến xe
- **LLM giao kho** (TMMN-06): nhóm lô vận chuyển khi đưa vào lưu kho → 1 LLM có thể chứa nhiều lô xe

→ ERP cần 2 fields: `lot_code` (đã có) + `consolidation_code` (LLM mới)

#### A.2.2 ĐỐT → DRC: pattern linear nhưng có sai lệch

Test data từ 76 phiếu (regression):

```
ĐỐT × 0.002 − 0.034 ≈ DRC  (sai lệch tối đa ±0.005)

Verify một số:
  ĐỐT 213 → 0.392 (predict 0.392) ✓
  ĐỐT 188 → 0.345 (predict 0.342) ≈
  ĐỐT 231 → 0.426 (predict 0.428) ≈
  ĐỐT 241 → 0.444 (predict 0.448) ≈
```

**Insight**: HAQT đang dùng công thức xấp xỉ này. Sai lệch nhỏ có thể do:
1. Round to 0.001
2. Lookup table thực tế khác công thức
3. Hoặc user nhập DRC tay sau khi đo ĐỐT (có thể override)

→ ERP phải **lưu cả ĐỐT lẫn DRC riêng**. Không tự sinh DRC từ ĐỐT (vì có exception). Form cân có thể auto-suggest DRC từ ĐỐT (× 0.002 − 0.034), nhưng user override OK.

#### A.2.3 DRC: lưu fraction (0.392) hay percent (39.2)?

Excel lưu `0.392`. Tôi cần verify ERP đang lưu cách nào — quan trọng vì GENERATED column `dry_weight_kg` phụ thuộc.

**Test cần làm**: query 1 row rubber_intake_batches có drc_percent thật và kiểm tra giá trị. Nếu > 1 → percent (39.2), nếu < 1 → fraction (0.392).

Migration mới đã viết `net_weight_kg × drc_percent / 100` → assume **percent**. Nếu DB lưu fraction → công thức sai 100×.

→ **MUST VERIFY trước khi chạy migration**.

#### A.2.4 Tên đại lý parse pattern "X (Y)"

15/24 đại lý có ngoặc trong Excel:

```
"Dương Bá Lê (Hoàng Thị Chính)"   → name="Dương Bá Lê",     alias="Hoàng Thị Chính" — vợ
"Hà Ngọc Thành (Hồ Thị Cúc)"      → name="Hà Ngọc Thành",   alias="Hồ Thị Cúc" — vợ
"Nguyễn Thị Thanh (Hiệu)"         → name="Nguyễn Thị Thanh", alias="Hiệu" — chồng
"Trần Thị Yến (hoàng khánh)"      → name="Trần Thị Yến",    alias="hoàng khánh"
"NGUYỄN THỊ HƯƠNG (Trân Thị Mỹ Hoà)" → name="NGUYỄN THỊ HƯƠNG", alias="Trần Thị Mỹ Hoà"
"NGUYỄN THỊ HIỀN (ĐÔNG HÀ)"       → name="NGUYỄN THỊ HIỀN",  alias="ĐÔNG HÀ" — đây là tên địa danh, không phải người
```

**Insight**: cấu trúc không hoàn toàn đồng nhất:
- Đa số: X = chủ TK ngân hàng, Y = vợ/chồng/người ra mặt
- Đặc biệt: "NGUYỄN THỊ HIỀN (ĐÔNG HÀ)" — Đông Hà là tên địa danh (huyện) để phân biệt nhiều Hiền

→ Khi import data Excel: parse regex `^(.+?)\s*\((.+?)\)\s*$`, hỏi user xác nhận từng cặp.

#### A.2.5 Pattern proxy account — Year 2026 NHIỀU TRUNG GIAN

Sheet `DS TÀI KHOẢN KH` row 23-40 (mục NĂM 2026):

```
Đại lý mua mủ                     Nhận tiền chuyển khoản
─────────────────────────────────────────────────────────
1. Dương Bá Lê                  ─→ DƯƠNG BÁ LÊ (chính chủ)
2. Hồ Thị Cúc (vợ Hà Ngọc Thành)─→ HỒ THỊ CÚC (chính chủ — Cúc là proxy của Thành)
3. Nguyễn Thị Thanh (chồng Hiệu)─→ NGUYỄN THỊ THANH (chính chủ)
4. Nguyễn Thị Hồng              ─→ NGUYỄN THỊ HỒNG
5. Trần Thị Mỹ Hoà (Hiền)       ─→ TRẦN THỊ MỸ HOÀ (proxy của Hiền)
6. Lê Văn Thạo                  ─→ LÊ VĂN THẠO
7. Lý Thị Kiều (Hoàng Thị Thu)  ─→ LÝ THỊ KIỀU (proxy của Thu)
8. Hoàng Khánh (Trần Thị Yến)   ─→ HOÀNG KHÁNH (proxy của Yến)
9. Trần Thị Mỹ Hoà (Hương)      ─→ TRẦN THỊ MỸ HOÀ (proxy của Hương) ⚠️ DUPLICATE
10. Nguyễn Thị Oanh             ─→ NGUYỄN THỊ OANH
11. Nguyễn Hồng Nhung           ─→ NGUYỄN HỒNG NHUNG (proxy của Hiền Đông Hà)
```

**Insights**:
- KHÔNG chỉ 3 trung gian (Hiền/Thạo/Hương) như giả thiết ban đầu — có **nhiều proxy hơn**
- 1 proxy có thể đại diện cho **nhiều đại lý** (Trần Thị Mỹ Hoà nhận tiền cho cả Hiền lẫn Hương)
- Mỗi proxy là 1 partner riêng trong DB, có STK riêng
- Chu trình: A (mua mủ) → đăng ký B làm proxy → tiền HAQT chi cho B → B tự đưa lại A

→ Model:
```
b2b.partners {
  id, name, bank_account,
  payment_proxy_partner_id  -- FK self-ref, nullable
  is_payment_proxy          -- flag (Hoà, Thạo, Nhung... = true)
}
```

→ Query: WHERE A.payment_proxy_partner_id IS NOT NULL → tiền chi cho A.proxy.bank_account, không phải A.bank_account.

#### A.2.6 Giá leo dần theo ngày

| Ngày | Đơn giá range (đ/kg KHÔ) |
|---|---|
| 10-12/05 | 55,000 |
| 14/05 | 56,000 |
| 16/05 | 57,000 |
| 17-19/05 | 58,000 |
| 20/05 | 58,500 - 59,500 |
| 21/05 | 59,000 - 59,500 |
| 22-25/05 | 59,000 - 60,000 |
| 26/05 | 59,000 - 60,000 |

Trên cùng 1 ngày, nhiều đại lý có giá khác nhau. Có thể tier theo DRC:
- Mủ DRC cao 0.40+ → 60,000 đ
- DRC trung bình 0.35-0.40 → 59,500 đ
- DRC thấp 0.32-0.34 → 59,000 đ

→ Phiếu chốt giá (PCG) sheet `pcg 06` có 3 mức giá khớp pattern này.

**Đơn vị giá**: Excel ghi đ/kg **KHÔ** (KL_QK), không phải kg tươi.

#### A.2.7 Workflow phiếu — 6 mắt xích

```
1. Đại lý đến (ngày D-1 hoặc sáng D)
   ↓
2. Phiếu chốt giá (PCG-06 sheet) — Thu mua + đại lý ký thoả thuận:
   - Mã PCG: TMMN-XX
   - KL dự kiến, DRC dự kiến, đơn giá (3 mức)
   - Ngày chốt, ngày cân (range)
   - Phí phải chi (theo tấn + theo lô)
   ↓
3. Đến nhà máy → Cân:
   - Tạo weighbridge_ticket (gross)
   - Cân tare
   - Đo ĐỐT → tính DRC
   - Hoàn tất
   ↓
4. (Optional) Gộp xe → 1 LLM (Lý lịch mủ):
   - Mã LLM: TMMN-NN
   - QC, KT, Thu mua, Bảo vệ ký
   ↓
5. Tạo PNK & TT (liên 2 giao khách):
   - Số phiếu sequential per năm
   - Xác nhận KL + DRC + tổng tiền
   - Đại lý ký
   ↓
6. Đề nghị thanh toán (ĐNTT) gộp nhiều phiếu:
   - Người đề nghị (HCTH — Khuyennt)
   - BGĐ duyệt → KTT chi → chuyển khoản theo proxy account
```

ERP hiện cover được 3-4 (cân + intake). Thiếu **1-2 (PCG)** và **5-6 (PNK & TT, ĐNTT)**.

---

### A.3 Mapping CHI TIẾT Excel → ERP

| Excel column | ERP column hiện có | Match? | Ghi chú |
|---|---|---|---|
| Mã hàng (TMMN-07-01) | `rubber_intake_batches.lot_code` | ✓ | Đã có |
| Ngày mua | `intake_date` | ✓ | Đã có |
| Số phiếu (sequential) | ❌ | ✗ | **CẦN THÊM** `pnk_number` |
| Khách hàng tên chính | `b2b_partners.name` | ✓ | Đã có |
| Khách hàng (alias trong ngoặc) | ❌ | ✗ | **CẦN THÊM** `contact_alias_name` |
| Loại hàng (Mủ nước) | `raw_rubber_type='mu_nuoc'` | ✓ | Đã có |
| KL tươi (kg) | `net_weight_kg` | ✓ | Đã có (verify đúng nghĩa) |
| ĐỐT | ❌ | ✗ | **CẦN THÊM** `field_dot_reading` |
| DRC (0.392) | `drc_percent` | ⚠️ | **VERIFY**: fraction hay percent? |
| KL QK (kg) | ❌ | ✗ | **CẦN THÊM** `dry_weight_kg` GENERATED |
| Đơn giá (đ/kg KHÔ) | `settled_price_per_ton` | ⚠️ | Convert đ/kg × 1000 = đ/tấn. Nhưng đơn vị tính ở Excel là **/kg khô**, cần lưu ý |
| Thành tiền | `total_amount` | ✓ | Đã có |
| Thanh toán (ngày) | `paid_amount` + `payment_status` | ⚠️ | Cần định nghĩa rõ status flow |
| STK | `b2b_partners.bank_account` (qua join) | ✓ | Đã có |
| NH | `b2b_partners.bank_name` | ✓ | Đã có |
| Tên người nhận (proxy) | ❌ | ✗ | **CẦN THÊM** `payment_proxy_partner_id` FK |
| LLM (TMMN-NN XE Y) | ❌ | ✗ | **CẦN THÊM** `consolidation_code` |

**TỔNG GAP**: 7 fields cần thêm. Trong đó:
- 5 fields cho `rubber_intake_batches`: `field_dot_reading`, `dry_weight_kg`, `consolidation_code`, `pnk_number`, `planned_drc_percent`
- 2 fields cho `b2b.partners`: `payment_proxy_partner_id`, `contact_alias_name`, `is_payment_proxy`

---

### A.4 Decision Matrix

#### D1: DRC lưu fraction (0.392) hay percent (39.2)?
**Action cần làm**: query 1 row thực tế. **Risk nếu sai**: dry_weight_kg sai 100x.

**Proposed**: Migration TEST trước — `SELECT drc_percent FROM rubber_intake_batches WHERE drc_percent IS NOT NULL LIMIT 5`. Sau khi xác nhận, công thức GENERATED:
- Nếu percent: `net_weight_kg × drc_percent / 100`
- Nếu fraction: `net_weight_kg × drc_percent`

#### D2: Bonus tính KL TƯƠI hay KL KHÔ?
**Tính theo Excel T5/2026** (data thật, ~112T tươi, 41T khô):
- KL tươi → mọi đại lý đều < 20T → 0 bonus (vì cá nhân top chỉ 19.5T)
- KL khô → còn ít hơn → 0 bonus

→ Cả 2 cách T5 đều 0 bonus (vì quy chế mủ nước áp T6+).

**Khác biệt sau khi vào mùa cao điểm** (T7-T10):
- Nếu 1 đại lý 1 tháng giao 60T tươi với DRC 0.35 → khô = 21T
- Theo TƯƠI: vượt Kim Cương (>60T) → 400k × 60T = **24M VND/tháng**
- Theo KHÔ: chỉ đạt Đồng (>20T) → 100k × 21T = **2.1M VND/tháng**

→ **Quyết định LỚN**: chênh lệch 10x.

**Đề xuất**: 
- **KL KHÔ** = đúng bản chất "sản lượng cao su thực", công bằng theo chất lượng
- Hoặc thêm flag `bonus_unit` ('wet' / 'dry') trên `b2b_bonus_rules` để mỗi quy chế tự định nghĩa

→ **MUST CONFIRM với BGĐ/Thu mua** trước khi sửa formula.

#### D3: Thêm `drc_percent` vào weighbridge_tickets hay reuse `qc_actual_drc`?
**Phân tích**: 
- `qc_actual_drc` hiện có — đặt sau QC, có thể chỉ dùng cho mủ thành phẩm xuất kho
- DRC mủ nước nguyên liệu đo ngay tại cân — không qua QC formal

**Đề xuất**: 
- **Reuse `qc_actual_drc`** + đổi nghĩa: "DRC đo tại cân" (cả intake + outgoing đều dùng)
- Hoặc **thêm `drc_percent`** mới, dùng cho intake; `qc_actual_drc` cho output

→ Recommend ADD `drc_percent` mới — không nhầm lẫn, không phá flow hiện có.

#### D4: Thêm `field_dot_reading` vào weighbridge_tickets hay chỉ rubber_intake_batches?
**Phân tích**:
- Đo ĐỐT ngay tại cân → ghi vào ticket logical
- Bridge function copy sang intake (đã có ticket_id link)

**Đề xuất**: Thêm vào **CẢ HAI** (denormalize) để:
- Search/filter trên intake không phải join ticket
- Backwards-compat: nếu intake tạo qua manual entry (không qua cân) vẫn nhập được

#### D5: `pnk_number` format
**Excel format**: 1, 2, 3, ... 76 (integer sequential per năm)

**Đề xuất**: 
- Lưu int `pnk_number int` (auto increment per năm)
- Sinh ra qua trigger BEFORE INSERT: `SELECT COALESCE(MAX(pnk_number), 0) + 1 FROM rubber_intake_batches WHERE EXTRACT(year FROM intake_date) = EXTRACT(year FROM NEW.intake_date) AND facility_id = NEW.facility_id`
- Để display: format `PNK-{year}-{pnk_number:05d}` trên UI (vd `PNK-2026-00076`)

Trigger này cần lock để tránh race condition khi 2 phiếu insert cùng lúc → dùng `pg_advisory_xact_lock(facility_id::int8, year::int8)`.

#### D6: `consolidation_code` text hay FK?
**Excel format**: "TMMN-02 XE 1 (19/05)" — free text

**Đề xuất**: 
- Phase 1: lưu text trên rubber_intake_batches (đủ cho tháng đầu)
- Phase 2 (sau go-live): tạo bảng `b2b_intake_consolidations` với code, date, vehicle_count, total_weight, status → rubber_intake_batches FK vào

#### D7: `b2b_partners` view fix — quan trọng

Đã ADD COLUMN vào `b2b.partners` (`is_demo`, `bp_id`) nhưng view `b2b_partners` không update.

**Đề xuất**: Migration mới `b2b_partners_view_sync.sql`:
```sql
DROP VIEW public.b2b_partners CASCADE;
CREATE VIEW public.b2b_partners
WITH (security_invoker = true) AS
SELECT * FROM b2b.partners;
GRANT SELECT ON public.b2b_partners TO authenticated, anon;
```

Risk: nếu view có downstream (other views, triggers) → CASCADE nguy hiểm. Cần kiểm tra trước.

#### D8: Workflow status mới
Hiện tại:
- `rubber_intake_batches.status`: 'draft' / 'confirmed' / 'settled' / 'cancelled'
- `rubber_intake_batches.payment_status`: text (chưa có CHECK)

**Đề xuất bổ sung**:
- `payment_status` CHECK: `('unpaid', 'requested', 'approved_payment', 'paid', 'partial')`
- Sequence: `unpaid` → khi tạo `b2b_payment_request` → `requested` → khi BGĐ duyệt → `approved_payment` → khi KTT chi → `paid`

(Phase 2, không gấp cho 1/6)

---

### A.5 Risk Matrix

| # | Change | Risk | Severity | Mitigation |
|---|---|---|---|---|
| R1 | ADD COLUMN `field_dot_reading` | None | 🟢 Low | Nullable, default NULL |
| R2 | ADD COLUMN `dry_weight_kg` GENERATED | DRC fraction/percent confusion | 🔴 High | Verify D1 trước, test 5 row |
| R3 | ADD COLUMN `consolidation_code` | None | 🟢 Low | Nullable, index where not null |
| R4 | ADD COLUMN `payment_proxy_partner_id` | Circular self-ref (A→B→A) | 🟡 Medium | CHECK constraint: id ≠ payment_proxy_partner_id. Trigger detect chain dài hơn |
| R5 | ADD COLUMN `contact_alias_name` | None | 🟢 Low | Text nullable |
| R6 | ADD COLUMN `pnk_number` + trigger | Race condition concurrent insert | 🟡 Medium | Advisory lock per (facility, year) |
| R7 | DROP+CREATE VIEW `b2b_partners` | Downstream views break (CASCADE) | 🔴 High | Probe dependencies trước. Mọi RLS có thể bị mất → re-grant + re-policy |
| R8 | Update `compute_monthly_bonus` dùng `dry_weight_kg` | Recompute toàn bộ bonus — break existing | 🔴 High | Add flag `use_dry_weight` vào `b2b_bonus_rules`, function dùng flag |
| R9 | ADD COLUMN `drc_percent` vào weighbridge_tickets | Confuse với `qc_actual_drc` | 🟡 Medium | Comment rõ + docs |
| R10 | Update bridge function copy `field_dot_reading` | Bridge phải re-deploy | 🟢 Low | Idempotent CREATE OR REPLACE |
| R11 | Form cân thêm input ĐỐT | UX change, training operator | 🟡 Medium | Onboard operator + tooltip + auto-calc DRC |
| R12 | View `b2b_partners` mất column nếu RLS | RLS policies cần update | 🔴 High | Test thật trước go-live |

---

### A.6 Câu hỏi MUST USER CONFIRM trước khi code

1. **DRC trong DB**: lưu fraction (0.392) hay percent (39.2)? 
   → Cần query test trước
2. **Bonus tính KL TƯƠI hay KL KHÔ**? 
   → Decision LỚN, ảnh hưởng 10× số tiền
3. **Đại lý đầu mối (Thạo, Mỹ Hoà, Nhung, ...) có giao mủ riêng không, hay CHỈ nhận tiền hộ?**
   → Quyết định partner_type: 'dealer' vs 'proxy'
4. **PNK number per năm hay per tháng?**
   → Excel scope chưa rõ, default per năm
5. **Có nên import data Excel 76 phiếu vào DB không?**
   → Nếu YES: script Python parse → INSERT (giả lập data thật)
6. **Phiếu chốt giá (PCG) — có cần bảng riêng `b2b_price_lock_tickets` không, hay tận dụng `b2b_deals`?**
   → Quyết định scope phase 2/3
7. **Đa tiền tệ VND/KIP/THB — TL có thực sự dùng KIP không hay chỉ VND?**
   → Decide có cần ADD COLUMN currency vào weighbridge_tickets không
8. **Mã consolidation_code có nên auto-generate (như pnk_number) hay nhập tay?**
   → Tự sinh = đơn giản; tay = flexible

---

## Phần B — Phương án triển khai (4 Sprint trong 5 ngày)

### Sprint 1 (Day 1) — Schema cleanup + verify

**Mục đích**: Fix bugs schema + verify giả định trước khi build features.

**Steps**:

1. **Verify DRC format** (15 phút)
   ```sql
   SELECT id, drc_percent FROM rubber_intake_batches WHERE drc_percent IS NOT NULL LIMIT 10;
   -- Nếu giá trị < 1 → fraction; nếu > 1 → percent
   ```

2. **Migration `b2b_partners_view_sync.sql`** — refresh view (30 phút)
   - Probe downstream dependencies: `SELECT * FROM pg_views WHERE definition LIKE '%b2b_partners%';`
   - DROP VIEW CASCADE (nếu có dependencies → DROP từng cái rồi recreate)
   - CREATE VIEW b2b_partners AS SELECT * FROM b2b.partners
   - Test query frontend (PartnerListPage, PartnerRequestsPage) sau khi sync

3. **Migration `b2b_intake_field_data_v2.sql`** — refactor migration đã viết (1h)
   - Verify công thức DRC dựa trên D1 (fraction/percent)
   - ADD COLUMN với CHECK constraints rõ ràng:
     - `field_dot_reading int CHECK (field_dot_reading BETWEEN 100 AND 350)`
     - `planned_drc_percent numeric(5,2) CHECK (planned_drc_percent BETWEEN 0 AND 60)`
     - `dry_weight_kg numeric(12,3) GENERATED ALWAYS AS (...)`
     - `consolidation_code text` + INDEX
   - ADD vào `weighbridge_tickets`: `field_dot_reading`, `drc_percent` (mới, ≠ qc_actual_drc), `consolidation_code`

4. **Migration `b2b_partners_proxy.sql`** (30 phút)
   - ADD `payment_proxy_partner_id uuid REFERENCES b2b.partners(id)` + CHECK no self-ref
   - ADD `contact_alias_name text`
   - ADD `is_payment_proxy boolean DEFAULT false` (flag proxy)
   - Trigger detect circular chain (optional, vì user ít có chain > 2)

5. **Migration `b2b_pnk_number.sql`** (30 phút)
   - ADD `pnk_number int` vào rubber_intake_batches
   - UNIQUE (facility_id, intake_year, pnk_number)
   - Trigger BEFORE INSERT auto-assign next sequence per (facility, year)

6. **Migration `b2b_bridge_v2.sql`** (30 phút)
   - Update `bridge_weighbridge_to_intake()` function: copy `field_dot_reading`, `drc_percent`, `consolidation_code`

7. **Re-run `b2b_bonus_rules` DECISION** (1h)
   - User confirm bonus_unit
   - Nếu KL KHÔ: ADD COLUMN `b2b_bonus_rules.bonus_unit text DEFAULT 'wet' CHECK IN ('wet','dry')`
   - Update bonus rules có sẵn: SET bonus_unit='dry' cho 'nuoc' (mủ nước), 'wet' cho 'tap' (mủ tạp) (theo quyết định user)
   - Update function `compute_monthly_bonus()` để check `bonus_unit` per rule

**Output Sprint 1**:
- 5 migration mới
- 0 UI change
- DB ready cho UI build sprint 2

### Sprint 2 (Day 2) — App cân update

**Mục đích**: Form cân nhập ĐỐT + DRC.

**File**: [apps/weighbridge/src/pages/WeighingPage.tsx](apps/weighbridge/src/pages/WeighingPage.tsx) (~1400 dòng)

**Steps**:

1. Đọc full flow WeighingPage để hiểu (1h):
   - Khi nào ticket được create
   - Khi nào tare done → completed
   - Có hook gì sau khi completed

2. Thêm Card "Đo DRC" sau khi tare done, trước "Hoàn tất" (2h):
   - Input `dot_reading` (NumberInput 100-300)
   - Auto-suggest DRC = ĐỐT × 0.002 − 0.034 (user override OK)
   - Input `drc_percent` (manual, decimal)
   - Hiển thị KL khô = net × drc (read-only)

3. Save ĐỐT + DRC vào weighbridge_tickets khi user hoàn tất (30 phút):
   - Update existing `weighbridgeService.complete()` để accept field_dot_reading, drc_percent

4. Test E2E 1 phiếu mới (30 phút)

**Output**: Cân TL có thể nhập ĐỐT + DRC ngay tại trạm.

### Sprint 3 (Day 3) — ERP update

**Files**:
- [src/pages/b2b/rubber-intake/B2BRubberIntakePage.tsx](src/pages/b2b/rubber-intake/B2BRubberIntakePage.tsx) — list view
- [src/pages/b2b/partners/PartnerDetailPage.tsx](src/pages/b2b/partners/PartnerDetailPage.tsx) — partner detail
- [src/pages/b2b/intake-manual/ManualEntryPage.tsx](src/pages/b2b/intake-manual/ManualEntryPage.tsx) — manual entry

**Steps**:

1. B2BRubberIntakePage thêm cột: ĐỐT, DRC%, KL khô (1h)
2. Filter theo facility + raw_rubber_type + consolidation_code (30 phút)
3. Tab "Theo LLM" group by consolidation_code (1h) — dùng view `v_intake_consolidation`
4. PartnerDetailPage thêm field proxy + alias (1h)
5. ManualEntryPage thêm input ĐỐT + DRC dự kiến (30 phút)

**Output**: ERP Admin xem được full data Tân Lâm.

### Sprint 4 (Day 4) — Polish + test

1. Generate file Excel mẫu giống TL (cho training) (1h)
2. Generate ĐNTT export PDF/DOCX (2h)
3. E2E test với 5 phiếu test (1h)
4. Fix bugs (2h)

### Sprint 5 (Day 5) — Backup + buffer

Buffer cho bugs + edge cases trước go-live 1/6.

**Out of scope (post go-live)**:
- Phiếu chốt giá riêng (PCG) — bảng `b2b_price_lock_tickets`
- Bảng phí chi tiết `b2b_deal_fees` (7 loại × per_ton/per_lot)
- Workflow ĐNTT (request → approve → pay)
- Print Layout PNK & TT liên 2
- Import data Excel 76 phiếu (nếu user muốn)

---

## Phần C — Checklist trước khi code

- [ ] **D1**: User confirm DRC fraction/percent (qua query test)
- [ ] **D2**: User confirm bonus tính KL TƯƠI hay KHÔ
- [ ] **D3**: User confirm weighbridge dùng `drc_percent` mới (vs `qc_actual_drc`)
- [ ] **D5**: User confirm pnk_number format (per năm)
- [ ] **D7**: Probe downstream views/triggers của `b2b_partners` trước DROP CASCADE
- [ ] **D8**: User confirm payment_status workflow cần làm Sprint nào
- [ ] Quyết định: import data Excel hay nhập tay từ 1/6?
- [ ] User test login với khuyennt@/duyhh@ thấy menu "Duyệt đăng ký" OK
- [ ] Verify migrations chạy idempotent (test trên staging schema nếu có)

---

## Phần D — Open items KHÔNG đưa vào Sprint 1-5

1. **Real-time scale integration** — nếu TL có cân điện tử Keli, ConnectScale, hoặc tự build
2. **OCR phiếu chốt giá giấy** — scan PCG cũ thành DB
3. **Mobile app riêng cho thu mua TL** — quick capture + chữ ký số đại lý
4. **Báo cáo BI/dashboard tháng** — kết hợp với daily intake card trên B2BDashboardPage
5. **Cảnh báo DRC bất thường** (vd < 0.30 hoặc > 0.50) → notify QC
6. **Lab DRC verification** — đo lại DRC tại lab + compare field
7. **Tỷ giá KIP/THB tự động** — fetch từ NH Nhà nước hoặc Wise
