# Phân tích Excel "Báo cáo khối lượng hằng ngày mủ nước Tân Lâm"

**File**: `docs/du lieu tho/BÁO CÁO KHỐI LƯỢNG HẰNG NGÀY MỦ NƯỚC TÂN LÂM.xlsx`
**Date**: 2026-05-26
**Tổng quan data**: 76 phiếu mua × 14 ngày × 24 đại lý trong tháng 5/2026 tại HAQT (Tân Lâm).

---

## 1. Cấu trúc nghiệp vụ thực tế HAQT

6 sheets trong Excel = 6 mắt xích nghiệp vụ:

| Sheet | Vai trò | Người dùng |
|---|---|---|
| `pcg 06` | **Phiếu chốt giá** — thoả thuận giá trước khi cân | Thu mua |
| `LLM` | **Lý lịch mủ** — gộp xe chở mủ (2 rơ mooc/lô) | Thu mua + Bảo vệ |
| `KL- NGUYÊN LIỆU MỦ NƯỚC 2026` | **Bảng công nợ chính** — 76 dòng cân + tính tiền | Kế toán |
| `DS TÀI KHOẢN KH` | Danh sách STK đại lý + STK trung gian | Kế toán |
| `PNK & TT` | Phiếu nhập kho + xác nhận thanh toán (liên 2 giao khách) | Thủ kho + Kế toán |
| `ĐNTT` | Đề nghị thanh toán BGĐ duyệt | Khuyennt@ (HCTH) |

```
PCG ──→ WEIGHBRIDGE ──→ LLM ──→ KL_TONGHOP ──→ PNK & TT ──→ ĐNTT ──→ BGĐ duyệt ──→ Chi tiền
chốt    cân tươi/tare   gộp     bảng cộng       liên 2 khách   gom phiếu                qua TK
giá     ĐỐT đo DRC      xe      công nợ tháng                   nhiều                    đại lý hoặc
                                                                phiếu                    trung gian
```

---

## 2. Phát hiện key từ data thực

### 2.1 Mã hàng / Lot code pattern

Format: `TMMN-{lot_seq}-{vehicle_seq}` hoặc `TMMN-{lot_seq}` (1 xe)

```
TMMN-01-01    ← Lô 01, xe 01
TMMN-01-02    ← Lô 01, xe 02 (cùng lô, 2 xe khác đại lý)
TMMN-02-01    ← Lô 02, xe 01
TMMN-03       ← Lô 03 (1 xe, không có suffix)
TMMN-04-01    ← Lô 04, xe 01 (4 đại lý cùng đi 1 chuyến)
TMMN-04-02    ← Lô 04, xe 02
...
TMMN-07       ← Lô 07
```

- **Bảng LLM (cột 17)** có mã chi tiết hơn: `"TMMN-02 XE 1 (19/05)"` — gộp ngày + xe
- 1 lô (TMMN-XX) có thể chứa **nhiều đại lý cùng đi 1 chuyến** (vd TMMN-04-01 có 4 đại lý: LÊ VĂN THẠO, HOÀNG THỊ THU, TRẦN THỊ YẾN, NGUYỄN THỊ HƯƠNG)

### 2.2 ĐỐT — chỉ số gốc của DRC

Cột "ĐỐT" trên bảng KL: số đo metrolac/lactometer field test, dao động **180–241**.

Công thức xấp xỉ HAQT đang dùng:
```
DRC ≈ ĐỐT × 0.002 − 0.034
```

Verify với data:
| ĐỐT | DRC ghi | DRC tính | Match |
|---|---|---|---|
| 213 | 0.392 | 0.392 | ✓ |
| 215 | 0.396 | 0.396 | ✓ |
| 188 | 0.345 | 0.342 | ≈ |
| 200 | 0.368 | 0.366 | ≈ |
| 231 | 0.426 | 0.428 | ≈ |
| 241 | 0.444 | 0.448 | ≈ |

→ Vì sai số nhỏ, hiển nhiên có làm tròn hoặc lookup table cụ thể. **Phải lưu ĐỐT để audit**, không chỉ DRC suy ra.

### 2.3 KL khô quy đổi (KL_QK)

```
KL_QK = KL_tươi × DRC
```

Vd: 1700 kg × 0.392 = 666.4 kg → khớp data Excel.

**Tổng kết tháng 5/2026 (76 phiếu)**:
- Tổng KL tươi: ~107,505 kg
- Tổng KL khô (QK): ~38,693 kg
- Tổng tiền: ~2,205M VND

**Đơn giá chia 3 mức**: 55,000đ → 59,500đ → 60,000đ/kg (giá khô) tuỳ ngày + DRC.

### 2.4 Đại lý trung gian thu hộ tiền (CRITICAL)

Sheet `DS TÀI KHOẢN KH` lộ pattern:

```
Đại lý thực (cột trái)           →  TK trung gian nhận tiền (cột phải)
─────────────────────────────────────────────────────────────────────
Nguyễn Văn Linh                   →  3900205172418  AGRIBANK  NGUYỄN THỊ HIỀN
Nguyễn Thị Phượng                 →  3904.205...    AGRIBANK  NGUYỄN THỊ HIỀN
Lê Thị Gấm                        →  3905.205.185   AGRIBANK  LÊ VĂN THẠO
Hoàng Thị Kim Oanh                →  3905205120022  AGRIBANK  NGUYỄN THỊ HƯƠNG
...
```

**3 trung gian chính**: NGUYỄN THỊ HIỀN, LÊ VĂN THẠO, NGUYỄN THỊ HƯƠNG.

Họ là "đại lý đầu mối" — nhận tiền từ HAQT chuyển khoản, rồi tự phân phối lại cho các đại lý nhỏ. Lý do thực tế:
- Giảm phí chuyển khoản (3 lần thay vì 24 lần)
- Tiện cho đại lý không có TK ngân hàng
- Trung gian thường là người uy tín trong vùng

→ **ERP phải hỗ trợ pattern này**: cột `b2b.partners.payment_proxy_partner_id` link đại lý → đại lý đầu mối nhận tiền hộ.

### 2.5 Tên alias liên hệ

Pattern tên đại lý dạng `"X (Y)"`:
- X = chủ TK ngân hàng (chính thức)
- Y = người liên hệ thực tế tại nhà máy (vợ, con, em họ)

Ví dụ:
- `Dương Bá Lê (Hoàng Thị Chính)` — Lê chủ TK, Chính đến cân
- `Hà Ngọc Thành (Hồ Thị Cúc)` — Thành chủ TK, Cúc đến cân
- `Trần Thị Yến (hoàng khánh)` — Yến chủ TK, Khánh đến cân

→ ERP cần field `b2b.partners.contact_alias_name` riêng để track người ra mặt.

### 2.6 Các phí trên Phiếu chốt giá

Sheet `pcg 06` liệt kê đầy đủ các phí HAQT phải tính khi mua mủ:

**Theo TẤN** (per ton):
- Bốc xếp
- Bến bãi
- Thuế Xã/Bản
- Giấy tờ đi đường
- Hoa hồng
- Bo hàng
- Thuê xe vận tải
- Khác

**Theo LÔ** (per lot):
- Bến bãi
- Thuế Xã/Bản
- Giấy tờ đi đường
- Hoa hồng
- Bốc xếp
- Thuê xe vận tải

**Bảng 3 mức giá cao su**: giá sàn / giá trung / giá cao (vd 59M / 59.5M / 60M VNĐ/tấn) — chia ngạch theo DRC.

**Loại tiền**: VND / KIP / THB (HAQT giáp biên giới Lào). Tỷ giá ghi tay trên phiếu.

### 2.7 Hình thức mua

Phiếu chốt giá có 4 checkbox:
- ☐ Cụm/Đấu giá
- ☑ Đại lý
- ☐ Hộ ND (Hộ Nông Dân)
- ☐ Công ty

Mapping với `b2b.partners.partner_type` hiện có:
| Excel | partner_type |
|---|---|
| Cụm/Đấu giá | `supplier` (nhóm/cụm) |
| Đại lý | `dealer` |
| Hộ ND | `household` |
| Công ty | `company` |

Cần verify enum hiện có khớp không, hoặc thêm enum mới.

---

## 3. Gap đầy đủ vs hệ thống ERP/Cân hiện tại

### 3.1 Schema gap

| # | Field/Bảng cần có | Mô tả | Ưu tiên |
|---|---|---|---|
| 1 | `rubber_intake_batches.field_dot_reading` | Số ĐỐT — input gốc DRC | 🔴 Cao |
| 2 | `rubber_intake_batches.planned_drc_percent` | DRC dự kiến lúc chốt giá | 🟡 Trung |
| 3 | `rubber_intake_batches.dry_weight_kg` GENERATED | KL khô = tươi × DRC/100 | 🔴 Cao |
| 4 | `rubber_intake_batches.consolidation_code` | Mã LLM gộp xe (TMMN-07 XE 1) | 🟡 Trung |
| 5 | `b2b.partners.payment_proxy_partner_id` | Đại lý đầu mối nhận tiền hộ | 🔴 Cao |
| 6 | `b2b.partners.contact_alias_name` | Tên người liên hệ khác chủ TK | 🟡 Trung |
| 7 | `b2b_deal_fees` table mới | 7 loại phí × per_ton/per_lot | 🟢 Thấp (sau go-live) |
| 8 | `b2b_price_lock_tickets` table mới | Phiếu chốt giá có 3 mức + DRC dự kiến | 🟢 Thấp |
| 9 | `currency_exchange_rates` | Tỷ giá KIP/THB/VND theo ngày | 🟡 Trung |
| 10 | `b2b.partners.purchase_method` (enum) | Cụm/Đại lý/Hộ ND/Công ty | 🟢 Map vào partner_type |

→ **Migration đã tạo cho 6 field ưu tiên Cao/Trung**: [docs/migrations/b2b_intake_field_data_tanlam.sql](migrations/b2b_intake_field_data_tanlam.sql)

### 3.2 UI gap (apps/weighbridge)

| # | Cần thêm vào form cân | Vị trí | Effort |
|---|---|---|---|
| 1 | Input "ĐỐT" (number, 150-250) | Card thông tin DRC trên WeighingPage | 30ph |
| 2 | Input "DRC dự kiến" % | Card thông tin DRC (auto-fill từ deal nếu có) | 15ph |
| 3 | Auto tính KL khô khi user nhập DRC | Sidebar "Tính toán" | 10ph (dropped vì đã có GENERATED column) |
| 4 | Select loại tiền VND/KIP/THB | Card pricing | 20ph |
| 5 | Input tỷ giá nếu chọn KIP/THB | Card pricing | 20ph |
| 6 | Field "Mã LLM gộp xe" (consolidation_code) | Phần ghi chú/metadata | 15ph |
| 7 | Hiển thị tên alias liên hệ khi pick partner | Card thông tin đại lý | 10ph |

### 3.3 UI gap (ERP)

| # | Cần thêm vào ERP | Page | Effort |
|---|---|---|---|
| 1 | Cột "ĐỐT" + "KL khô" trong [Lý lịch mủ](/b2b/rubber-intake) | B2BRubberIntakePage | 30ph |
| 2 | Filter theo consolidation_code (LLM gộp xe) | B2BRubberIntakePage | 20ph |
| 3 | Group view: 1 row per LLM (dùng v_intake_consolidation) | B2BRubberIntakePage tab mới | 1h |
| 4 | Field "Đại lý đầu mối thu hộ" trong [PartnerDetailPage](/b2b/partners/:id) | PartnerDetailPage | 30ph |
| 5 | Field "Tên liên hệ" trong PartnerDetailPage | PartnerDetailPage | 10ph |
| 6 | Báo cáo công nợ tháng theo đại lý đầu mối + chi tiết breakdown | new page /b2b/payment-routing | 2h |
| 7 | Page sinh ĐNTT (Đề nghị thanh toán) tự động từ phiếu cân chưa TT | new page /b2b/payment-requests | 3h (sau go-live) |

### 3.4 Business logic gap

| # | Vấn đề | Quyết định cần |
|---|---|---|
| 1 | Quy chế thưởng tính trên KL nào? | **NEED USER CONFIRM**: KL tươi (`net_weight_kg`) hay KL khô quy đổi (`dry_weight_kg`)? Mặc định hiện tại đang dùng `net_weight_kg`. |
| 2 | KL_QK lưu hay tính on-the-fly? | ✓ Đã dùng GENERATED column (Postgres tự lưu) |
| 3 | Có chấp nhận DRC = NULL không (chưa đo)? | Mặc định hiện cho NULL. Phải set rule: status='confirmed' phải có DRC. |
| 4 | Đại lý đầu mối có cần là partner riêng không? | ✓ Yes — phải có row b2b.partners cho 3 trung gian (Hiền/Thạo/Hương), set `is_payment_proxy=true` |
| 5 | Phí mua hàng tách bảng riêng hay JSON trong b2b_deals? | Sau go-live mới làm — không gấp |
| 6 | Tỷ giá KIP/THB lấy ở đâu? | Manual nhập trên phiếu / hệ thống tỷ giá riêng / API ngân hàng? |

---

## 4. Phase plan (5 ngày tới 1/6)

### Phase 1 — Schema bổ sung ✅ ĐÃ LÀM

File: [b2b_intake_field_data_tanlam.sql](migrations/b2b_intake_field_data_tanlam.sql)

**TODO**: chạy migration trên Supabase SQL Editor → verify 6 cột + 1 view tạo OK.

### Phase 2 — Update apps/weighbridge (1 ngày)

Sửa [WeighingPage.tsx](../apps/weighbridge/src/pages/WeighingPage.tsx):

1. Thêm card "Đo DRC" sau khi cân Tare:
   - Input `dot_reading` (NumberInput, 150-250)
   - Auto suggest DRC từ ĐỐT (công thức × 0.002 − 0.034)
   - Cho phép admin override DRC
   - Auto tính dry_weight_kg hiển thị
2. Thêm card "Chốt giá":
   - DRC dự kiến (kế thừa từ deal nếu có)
   - Select tiền tệ (VND/KIP/THB) + tỷ giá
3. Khi hoàn tất ticket → save vào `weighbridge_tickets`:
   - `field_dot_reading`, `drc_percent` (override hoặc tính)
4. Bridge `bridge_weighbridge_to_intake()` truyền `field_dot_reading` sang `rubber_intake_batches` (cần update function SQL).

### Phase 3 — Update ERP lý lịch mủ (1 ngày)

Sửa [B2BRubberIntakePage.tsx](../src/pages/b2b/rubber-intake/B2BRubberIntakePage.tsx):

1. Thêm tab "Theo LLM" — group rows by `consolidation_code`, query view `v_intake_consolidation`
2. Hiển thị thêm: ĐỐT, KL khô, đại lý đầu mối, alias name
3. Filter theo facility (PD/TL/LAO), partner_type, consolidation_code

### Phase 4 — ERP Partner detail enhancement (0.5 ngày)

Sửa [PartnerDetailPage.tsx](../src/pages/b2b/partners/PartnerDetailPage.tsx):

1. Field "Đại lý đầu mối" (dropdown chọn partner khác) — `payment_proxy_partner_id`
2. Field "Tên liên hệ" — `contact_alias_name`
3. Quy tắc: nếu là proxy (có người khác link tới), hiển thị badge "🏦 Đầu mối thu hộ"

### Phase 5 — Báo cáo công nợ + ĐNTT (sau go-live, ~3 ngày)

- Page `/b2b/payment-routing` — gom các phiếu cân chưa TT theo đại lý đầu mối → kế toán dễ sinh ĐNTT
- Page `/b2b/payment-requests` — workflow ĐNTT (Khuyennt@ tạo → BGĐ duyệt → KTT chi)
- Tự sinh nội dung phiếu thanh toán giống Excel ĐNTT sheet
- Mỗi phiếu in được giống "PNK & TT" Liên 2 giao khách

---

## 5. Open questions cho user (cần confirm để đi tiếp)

1. **Quy chế thưởng — KL nào?**
   Hiện tại `compute_monthly_bonus()` SUM `net_weight_kg` (KL tươi). Quy chế chỉ nói "sản lượng tháng".
   - **Option A**: dùng KL TƯƠI — đơn giản, đại lý dễ kiểm tra số kg cân
   - **Option B**: dùng KL KHÔ QUY ĐỔI — đúng "sản lượng cao su thực", công bằng hơn nếu DRC chênh lệch nhiều
   - **Đề xuất**: B (theo Excel HAQT đang tính tiền dựa trên KL khô)

2. **Trung gian Hiền/Thạo/Hương có phải là đại lý không?**
   - Họ có giao mủ riêng không, hay CHỈ nhận tiền hộ?
   - Nếu có giao mủ → tạo b2b.partners + tick `is_payment_proxy=true`
   - Nếu CHỈ trung gian → tạo b2b.partners đặc biệt với `partner_type='proxy'` mới

3. **Số phiếu PNK & TT (71, 72...) — sequence độc lập với mã CX-?**
   - Hiện weighbridge dùng `code = CX-YYYYMMDD-XXX`
   - PNK & TT dùng số sequential per năm
   - → Cần thêm cột `pnk_number` trong `rubber_intake_batches` hoặc `weighbridge_tickets`?

4. **Mã LLM "TMMN-XX" có nên là consolidation_code chính, hay lot_code?**
   - Hiện `lot_code` đã có
   - Đề xuất: `lot_code` = mã 1 phiếu (TMMN-04-02), `consolidation_code` = mã gộp xe (TMMN-04 XE 1)

5. **Import data Excel hiện có (76 phiếu) vào DB hay không?**
   - Nếu YES → script Python parse Excel → INSERT b2b.partners + rubber_intake_batches
   - Tất cả với is_demo=false (data thật sắp đi vào production)
   - Nếu NO → cứ để nhân viên TL nhập tay từ 1/6

---

## 6. Mapping cụ thể Excel → DB

| Excel cell | DB column | Notes |
|---|---|---|
| `KL.B` (Mã hàng) | `rubber_intake_batches.lot_code` | TMMN-XX-YY |
| `KL.C` (Ngày mua) | `intake_date` | |
| `KL.D` (Số phiếu) | (new) `pnk_number` | sequential per năm |
| `KL.E` (Khách hàng) | `b2b_partner_id` | Parse "X (Y)" → name=X, alias=Y |
| `KL.F` (Loại hàng) | `raw_rubber_type` | "Mủ nước" → 'mu_nuoc' |
| `KL.G` (KL tươi) | `net_weight_kg` | |
| `KL.H` (ĐỐT) | `field_dot_reading` | int |
| `KL.I` (DRC) | `drc_percent` | % (×100 nếu đang lưu 0.392) |
| `KL.J` (KL QK) | `dry_weight_kg` (GENERATED) | tự tính |
| `KL.K` (Đơn giá) | `settled_price_per_ton` | đ/kg → đ/tấn ×1000 |
| `KL.L` (Thành tiền) | `total_amount` | |
| `KL.M` (Thanh toán) | `payment_paid_at` | optional |
| `KL.N,O,P` (STK, NH, Tên proxy) | partner.payment_proxy_partner_id | link |
| `KL.Q` (LLM) | `consolidation_code` | TMMN-XX XE Y (DD/MM) |

---

## 7. Files đã tạo / sửa session này

- ✅ `docs/migrations/b2b_intake_field_data_tanlam.sql` — Migration Phase 1
- ✅ `docs/PHAN_TICH_DATA_TANLAM.md` — File này (phân tích + plan)

## 8. Liên hệ + go-live

- **Bộ phận HCTH chính của báo cáo**: Ngô Thị Khuyên (khuyennt@huyanhrubber.com)
- **Bộ phận thu mua TL**: PTM (Phòng Thu Mua)
- **Go-live**: 2026-06-01 (5 ngày nữa)
- **Risk**: nếu Phase 2 (form cân) không kịp 1/6, vẫn có thể launch với form hiện tại và bổ sung ĐỐT/DRC sau (giữ tạm trong notes).
