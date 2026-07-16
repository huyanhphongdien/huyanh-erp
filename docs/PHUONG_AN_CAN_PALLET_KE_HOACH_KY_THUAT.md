# KẾ HOẠCH KỸ THUẬT — Phương án cân mủ pallet Tân Lâm → Phong Điền

> Bản kỹ thuật đi kèm `docs/PHUONG_AN_CAN_MU_TANLAM_PHONGDIEN.docx` (13/07/2026).
> Mục tiêu: chi tiết đủ để duyệt trước khi code Đợt 1. Trạng thái tính đến **2026-07-15: chưa triển khai gì**.
> Cơ sở: khảo sát code thật (5 subsystem: phiếu cân, chuyển kho liên NM, tồn kho, CỔNG/facility, convention migration).

---

## PHẦN 0 — Hiện trạng kiến trúc (đã xác minh)

| Thành phần | Sự thật cần nhớ |
|---|---|
| **App cân** `apps/weighbridge` | Sub-app riêng, chạy **anon key**, deploy mỗi NM 1 subdomain qua `VITE_FACILITY_CODE` (PD/TL/LAO). Import ERP qua alias `@erp` = `../../src`. |
| **Bảng `weighbridge_tickets`** | **KHÔNG có `CREATE TABLE` trong repo — chỉ tồn tại trên PROD.** Mọi migration chỉ `ALTER`. **Chưa có cột pallet nào.** |
| **NET tính Ở TẦNG APP** | `weighbridgeService` tính `net = Math.abs(gross − tare)`, **không phải DB trigger**. 2 luồng ngược: NHẬP (L1=gross → L2=tare) vs XUẤT/CỔNG (L1=tare → L2=gross). |
| **`deduction_kg`** | Đã tồn tại nhưng **UI nhập đã bị gỡ** (chết). Chỉ ảnh hưởng cột phụ `actual_net_weight`, KHÔNG trừ vào `net_weight`. |
| **Module Chuyển kho liên NM** | Bảng `inter_facility_transfers` (+ `_items`), **prod-only**. State machine draft→in_transit→arrived→received. `confirmShipped` **trừ tồn NM gửi**, `confirmReceived` **cộng tồn NM nhận** + tính hao hụt `loss_pct` (ngưỡng **0.5%**), vượt → BGD duyệt. `loss_kg/loss_pct` là **cột GENERATED** của DB. |
| **3 hệ tồn kho song song** | (A) `stock_batches`+`stock_levels` (tồn thật, TP); (B) `rubber_intake_batches` (sổ **thu mua** — mủ nước TL cân xong đổ vào ĐÂY qua trigger `bridge_weighbridge_to_intake`, **KHÔNG** vào stock_batches); (C) transfer. |
| **Phiếu CỔNG (gate)** | `handleCreate` **return sớm** → không lưu loại mủ/lô/đại lý (gốc **D.1**). Chỉ hiện ở PD (`code==='PD'`). |
| **Có sẵn để tái dùng** | Auto-match biển số cho **lệnh điều động** (`WeighingPage` ~L275-290); query biển số + cửa sổ thời gian (`checkPlateDupToday` ~L371-385); gợi ý tare lịch sử (`getRecentByPlate`/`getSuggestedTare`). |
| **Convention** | Migration chạy TAY, idempotent (`ADD COLUMN IF NOT EXISTS`, dò-động `pg_constraint` để nới CHECK, kết bằng `NOTIFY pgrst,'reload schema'` + `DO $$ VERIFY`). Bảng mới → khuôn `drc_lookup` (RLS **anon SELECT** cho app cân). Menu = `Sidebar.tsx` (`navigation.ts` chết). |

---

## PHẦN 0.5 — Kết quả INSPECT PROD (2026-07-15, 483 phiếu cân thật)

| Chỉ số | Giá trị | Ý nghĩa |
|---|---|---|
| `inter_facility_transfers` | **0 dòng** | Module chuyển kho liên NM **CHƯA HỀ ĐƯỢC DÙNG** |
| `weighbridge_tickets.transfer_id` NOT NULL | **0** | Không phiếu cân nào nối transfer → xác nhận module chết |
| `source_type='transfer'` | 79 | ⚠️ Gây hiểu nhầm — code set `source_type='transfer'` cho MỌI phiếu 'out' (WeighingPage L564), KHÔNG phải do nối transfer |
| TL cân XUẤT (completed) | 19 (~6 tuần) | Lưu lượng THẤP (~3 chuyến/tuần), 1 xe chính `75H-03885` |
| Loại mủ TL xuất | mu_tap, mu_nuoc, mu_to, mu_rss3 | **Mủ thô/sơ chế**, KHÔNG phải thành phẩm SVR có batch kho |
| PD phiếu CỔNG (gate) | **81** | Mủ TL về đang chui qua CỔNG, ghi tay |
| `rubber_intake_batches`/`stock_batches` | 0 (anon RLS chặn) | Chưa xác nhận được bằng anon — cần service key |

**Bằng chứng D.1:** phiếu CỔNG PĐ gõ tay `"MU TO TMMN-11-02"`, `"MU TAP HAQT-05 XE 1"`, `"Thành phẩm RSS3 đại lý Thành Quảng Tri"` — lẫn với hàng cổng thật (THAN DA/VIEN NEN/CUI). **Bằng chứng pallet:** `CX-TL-20260713-007` notes = `"Trên xe có 12 balet,(9 balet nhựa,3 balet sắt..."`. **Biển số:** cùng xe ghi cả `75H-03885` lẫn `75H03885`.

---

## PHẦN 1 — 🔑 QUYẾT ĐỊNH KIẾN TRÚC

### QĐ-1 (QUAN TRỌNG NHẤT): Luồng TL→PĐ đi qua đâu? → **CHỐT: Hướng A (nhẹ, độc lập)**
Inspect prod cho thấy: module transfer **0 sử dụng** + thiết kế cho **thành phẩm có `stock_batches`**, trong khi TL thực tế chỉ chuyển **mủ thô/sơ chế** (mu_tap/nuoc/to/rss3, chưa có batch). Ép qua transfer (B/C) là gượng ép và operator đã né rồi.

| Hướng | Đánh giá sau inspect |
|---|---|
| **✅ A. Nhẹ, độc lập** | TL phiếu 'out' ↔ PĐ phiếu nhận, ghép **theo biển số** (đúng docx). Đối chiếu (Đợt 4) + nối tồn (Đợt 5) dựng trên **cặp phiếu cân** + `rubber_intake_batches`. **Hợp thực tế nhất, đơn giản nhất.** |
| ❌ B. Dựa transfer | Bắt tạo phiếu chuyển trước — operator đã chứng minh không làm (0 phiếu). |
| ❌ C. Lai (mượn transfer ngầm) | Transfer gắn `source_batch_id` (thành phẩm) — mủ thô TL không có batch → không khớp. |

> **Không dựng lại rủi ro trùng lặp (gotcha #12) vì transfer đang chết — không có gì để trùng.** Đợt 4/5 là hệ đối chiếu/tồn ĐẦU TIÊN cho luồng này, không phải bản sao.

### QĐ-2: Danh mục pallet — bảng hay hằng số?
- **Khuyến nghị: bảng nhỏ editable** `pallet_types` theo khuôn `drc_lookup` (RLS anon-read), để định mức (nhựa 10kg / sắt 50kg) sửa được + thêm loại mới, có trang admin trong app cân (`/settings/pallet` như `DrcLookupAdminPage`).
- Phương án gọn hơn: hằng số map trong `wms.types.ts` — chỉ chọn nếu chắc chắn **2 loại cố định vĩnh viễn**.
- **KHÔNG** nhét pallet vào `materials` (pallet là bì/tare, không phải vật tư có giá/tồn).

### QĐ-3: Lưu pallet trên phiếu cân thế nào?
Mỗi phiếu có **2 lần cân**, mỗi lần có số pallet riêng (xe dỡ bớt pallet giữa 2 lần). Đề xuất thêm cột vào `weighbridge_tickets`:
```
pallet_plastic_qty_1 int, pallet_steel_qty_1 int,   -- pallet lần cân 1
pallet_plastic_qty_2 int, pallet_steel_qty_2 int,   -- pallet lần cân 2
pallet_weight_1_kg numeric, pallet_weight_2_kg numeric  -- SNAPSHOT (chốt theo định mức tại thời điểm cân)
```
Lưu **cả số lượng lẫn KL snapshot** để: (a) Đợt 3 (sổ pallet) đếm được theo loại; (b) không lệch nếu định mức đổi về sau. (Cân nhắc `jsonb` nếu muốn linh hoạt nhiều loại pallet — nhưng cột rõ dễ query hơn cho sổ pallet.)

### QĐ-4: Đợt 5 trừ tồn TL ở ledger nào?
Mủ nước TL nằm ở `rubber_intake_batches` (sổ thu mua), **không** ở `stock_batches`. Cần chốt: khi chuyển mủ nước/thô TL→PĐ thì trừ ở đâu, cộng ở PĐ vào đâu (batch mới? intake mới?). → phụ thuộc QĐ-1. **Đợt 5 làm sau cùng, chốt sau.**

---

## PHẦN 2 — ĐỢT 1: Khai pallet mỗi lần cân + công thức KL mủ thuần

**Công thức:** `KL mủ = |(cân_L1 − palletKL_L1) − (cân_L2 − palletKL_L2)|`
với `palletKL = plastic_qty×10 + steel_qty×50` (lấy định mức từ danh mục).

### Migration
1. `docs/migrations/pallet_types_catalog.sql` — (nếu QĐ-2 = bảng) `CREATE TABLE IF NOT EXISTS pallet_types` (code, label, unit_weight_kg, is_active, sort_order) + RLS anon SELECT + seed `('plastic','Pallet nhựa',10)`, `('steel','Pallet sắt',50)` `ON CONFLICT DO NOTHING`. Khuôn = `sprint1_07_drc_lookup_table.sql`.
2. `docs/migrations/weighbridge_pallet_columns.sql` — `ALTER TABLE weighbridge_tickets ADD COLUMN IF NOT EXISTS` 6 cột ở QĐ-3 + `COMMENT` + `NOTIFY pgrst` + `DO $$ VERIFY`. Khuôn = `sales_order_container_lot.sql`.

### Code
| File | Sửa |
|---|---|
| `src/services/wms/wms.types.ts` | Thêm 6 cột pallet vào interface `WeighbridgeTicket`; thêm vào `TICKET_LIST_SELECT`/`TICKET_SELECT`. Thêm type `PalletType`. |
| `apps/weighbridge/src/services/rubberWeighService.ts` | `calculateWeights`: nhận pallet L1/L2, trả `net_mủ` theo công thức trên. |
| `src/services/wms/weighbridgeService.ts` | `updateTareWeight` (NHẬP) **và** `updateOutGrossSecond` (XUẤT/CỔNG): lưu pallet + tính `net_weight` đã trừ pallet. **Sửa cả 2 luồng ngược nhau.** |
| `apps/weighbridge/src/pages/WeighingPage.tsx` | UI khai pallet cạnh panel Live Scale (~L1934-2011): nút `[Nhựa −N+] [Sắt −N+]` cho mỗi lần cân; **lần 2 điền sẵn = lần 1**; nút "chỉ bấm xác nhận" cho case pallet không đổi. |
| " | **Gợi ý pallet**: khi xe lên cân, so `gross/tare` với bì xe lịch sử (`getRecentByPlate`/`getSuggestedTare`) → nếu dư ~X kg thì gợi ý "xe đang chở ~X kg pallet — khai bao nhiêu?". |
| " | **Cảnh báo lệch**: khai pallet ≪ phần dư so với bì lịch sử → cảnh báo **trước khi hoàn tất**. |
| `apps/weighbridge/src/pages/PrintPage.tsx` | In dòng pallet L1/L2 + KL mủ thuần (thay/bổ sung dòng "Tạp chất"). |

**Lưu ý:** `weight_out_kg`/`weight_in_kg` truyền vào `confirmShipped`/`confirmReceived` (nếu dùng transfer) phải là **net đã trừ pallet**.

---

## PHẦN 3 — ĐỢT 2: "ĐI LẤY MỦ TL→PĐ" — cân 2 đầu ở PĐ (CHỐT 2026-07-16)

> **Đổi hướng** so với bản plate-match cũ. Lý do: cân 2 lần **cùng bàn cân PĐ** → hết lệch 0,9%; **kiểm soát pallet tại PĐ**; không phụ thuộc cân TL. Ý user: khai **pallet mang đi ngay trên lệnh điều động** (trước khi cân).

### Luồng
1. Lập **lệnh điều động loại "Đi lấy mủ (NM khác)"** tại PĐ (điểm bốc = Tân Lâm, không cần Đơn hàng bán) → khai **số pallet mang đi** (nhựa/sắt) trên lệnh.
2. **Cân lần 1 tại PĐ** (xe rỗng + pallet): pre-fill pallet = số trên lệnh; operator xác nhận.
3. Xe lên TL, dỡ bớt pallet, lấy mủ, về PĐ.
4. **Cân lần 2 tại PĐ** (xe + hàng): khai **pallet còn lại** (khai tay — QĐ (a)) → **KL mủ thuần** = (gross−pallet_gross)−(tare−pallet_tare).
5. **Pallet để lại TL = pallet đi − pallet về** → Sổ pallet (Đợt 3). Net = **mủ NHẬP về PĐ**.

### Loại phiếu cân thứ 4 (QĐ: KHÔNG nhét vào in/out/gate)
- NHẬP = gross trước (sai thứ tự); XUẤT = đúng thứ tự nhưng là "ra kho"; CỔNG = hàng nội bộ không phải mủ (D.1). → **thêm `ticket_type='fetch'`** (nút "🚚 Nhận mủ NM khác", chỉ PĐ), **cân đảo chiều như OUT** (L1 tare xe rỗng → L2 gross xe+hàng), nhưng **ghi nhận là mủ nhập** + có loại mủ/lô + nguồn.

### Việc cần làm
| Phần | Chi tiết |
|---|---|
| **Migration A** | `dispatch_orders` ADD `pallet_plastic_out`, `pallet_steel_out` (số mang đi) + `pallet_kg_out` snapshot; nới CHECK `trip_type` thêm `'fetch_mu'` (nếu có CHECK) |
| **Migration B** | Nới CHECK `weighbridge_tickets.ticket_type` thêm `'fetch'` (mẫu `weighbridge_ticket_type_gate.sql`) |
| **DispatchCreatePage** + service | Loại chuyến **"Đi lấy mủ (NM khác)"** (`trip_type='fetch_mu'`); ô khai pallet nhựa/sắt (hiện khi loại này); lưu vào lệnh |
| **WeighingPage** (app cân, PĐ) | Nút loại phiếu thứ 4 `fetch`; dùng luồng `updateOutTareFirst/updateOutGrossSecond` (đảo chiều); **bật pallet** (mở rộng `showPallet`); **cân lần 1 pre-fill pallet từ lệnh** (đọc `pallet_plastic_out`/`steel_out` của lệnh đã chọn); picker lệnh loại `fetch_mu`; khai loại mủ + mã lô (như intake); lưu `rubber_type`, `source_type`, `reference_type='dispatch_order'`+`reference_id` |
| **Ghi nhận** | Net = mủ nhập PĐ (rubber_type/lô trên phiếu). **Nối tồn kho** để Đợt 5. Ghép cặp đối chiếu (Đợt 4) qua lệnh điều động. |
| **D.2** | Miễn cảnh báo "bỏ dở >4h" cho phiếu `fetch` (xe đi lâu là bình thường) |

**Ghi chú:** phải cân xe rỗng ở PĐ **trước khi đi** (thêm 1 bước lúc xuất phát); nếu quên → không có "lần 1", phải cân ở TL như cũ.

---

## PHẦN 4 — ĐỢT 3: Sổ pallet (số dư + đi/về theo NM)

- **Nguồn dữ liệu:** cột pallet trên `weighbridge_tickets` (Đợt 1). Mỗi phiếu = pallet đi/về theo NM.
- **Cách làm:** service tổng hợp (không cần bảng ledger mới nếu derive được) `palletLedgerService.getBalanceByFacility({from,to})` — mẫu `getStatsByFacility` (aggregate theo NM). Nếu cần theo dõi tồn pallet chuẩn xác → cân nhắc bảng `pallet_movements` (ledger).
- **Trang:** mẫu `WeighbridgeListPage.tsx` (card theo NM + Table). Route trong `App.tsx` dưới `<Route path="wms">`; menu thêm mục "Sổ pallet" ở `Sidebar.tsx` section KHO (~L400-408).

---

## PHẦN 5 — ĐỢT 4: Trang đối chiếu TL→PĐ (Hướng A)

- **Nguồn:** cặp phiếu cân TL('out') ↔ PĐ('in' nhận) ghép qua `reference_id` (Đợt 2). Service mới `reconcileTlPdService.getReconciliation({from,to})` — mẫu `getStatsByFacility`.
- **Trang:** tab mới trong `WMSReportsTabbedPage.tsx` (`?tab=doi-chieu-tl-pd`) hoặc trang riêng mẫu `WeighbridgeListPage.tsx` (filter ngày + facility qua `facilityService.getAllActive`).
- Hiển thị mỗi cặp: TL xuất (net sạch pallet) / PĐ nhận / chênh / cờ hao hụt / **phiếu TL chưa có cặp PĐ** (mất hàng?) / phiếu bỏ dở.
- **Lưu ý:** sau Đợt 1 số mới sạch pallet; **độ lệch 2 cân ~0,9%** vẫn còn (xem Phần 8) → đặt ngưỡng cảnh báo > 0,9% (không phải 0,5%) cho tới khi kiểm định cân.

---

## PHẦN 6 — ĐỢT 5: Nối tồn kho (Hướng A, làm sau cùng)

- Viết DB function/service **idempotent** (mẫu `bridge_weighbridge_to_intake`) trừ tồn TL / cộng tồn PĐ theo cặp phiếu Đợt 2.
- **Cần service key để inspect trước:** `rubber_intake_batches`/`stock_batches` không đọc được bằng anon (RLS) → phải xác nhận mủ TL đang nằm ledger nào trước khi viết (QĐ-4). Vì mủ TL là mủ thô/sơ chế (không phải batch thành phẩm) → nhiều khả năng trừ/cộng ở `rubber_intake_batches` hoặc `stock_levels` theo material mủ thô.
- ⚠️ Thêm **guard idempotent** (theo `weighbridge_ticket_id`) để tránh trừ/cộng đôi khi gọi lại.

---

## PHẦN 7 — D.1 & D.2

**D.1 — Mủ đi qua phiếu CỔNG mất dữ liệu:** giải quyết chung với Đợt 2 — **chặn dùng gate cho mủ** (validate ở `WeighingPage handleCreate`/service `create`), điều hướng sang "NHẬN TỪ NHÀ MÁY KHÁC". Không cần migration.

**D.2 — Phiếu bỏ dở >4h:** thêm ở `apps/weighbridge/src/pages/HomePage.tsx` section "Phiếu đang cân dở" (~L489-522, đã có list `inProgress`): tính tuổi `now − (tare_weighed_at ?? gross_weighed_at ?? created_at)`, `>4h` → **badge đỏ**. Lọc theo `facility_id` hiện tại. **Không cần migration** (dùng timestamp có sẵn).

---

## PHẦN 8 — Ngoài phần mềm (nhưng quan trọng nhất)

**Kiểm định lại 2 bàn cân TL & PĐ** — hiện lệch **~0,9%** (> ngưỡng hao hụt 0,5%, ≈ 90kg/xe 10 tấn, >2 tấn/tháng). **Không phần mềm nào sửa được 2 cân nói 2 số khác nhau về cùng 1 xe.** Trước khi bật đối chiếu hao hụt (Đợt 4) phải kiểm định, nếu không mọi chuyến báo động giả.

---

## PHẦN 9 — Thứ tự triển khai & rủi ro chung

**Thứ tự:** Đợt 1 → (D.1+D.2 xen kẽ, rẻ) → Đợt 2 → Đợt 3 → Đợt 4 → Đợt 5. Làm **tuần tự**, mỗi Đợt deploy + nghiệm thu rồi mới sang tiếp.

**Rủi ro/nguyên tắc chung:**
1. `weighbridge_tickets` & `inter_facility_transfers` **prod-only** → **inspect prod trước**, migration chỉ `ALTER`/`ADD`, không suy từ repo.
2. Interface TS `WeighbridgeTicket` thiếu cột → **phải cập nhật interface + SELECT** khi thêm cột pallet.
3. App cân **anon** → bảng mới (pallet_types, ledger) phải có **RLS anon SELECT/write**, không thì 401/empty.
4. Mọi migration kết bằng `NOTIFY pgrst,'reload schema'` (thiếu → PGRST204).
5. Nới CHECK enum: **dò động `pg_constraint`**, không hard-code tên.
6. **Go-live: DATA THẬT** (từ 2026-06-02) → migration chỉ ADD, không UPDATE/DELETE data.
7. NET tính ở APP, **2 luồng ngược** (IN vs OUT) → sửa công thức Đợt 1 phải sửa cả 2.
8. Trừ/cộng kho transfer không idempotent → Đợt 5 thêm guard.
9. `navigation.ts` chết → sửa menu ở `Sidebar.tsx`.
10. Timezone: filter ngày đang nối UTC (`Z`) lệch giờ VN (+7) → thống nhất khi làm sổ pallet/đối chiếu.

---

## PHẦN 10 — Checklist bắt đầu Đợt 1 (sau khi chốt QĐ-1..3)

- [ ] Inspect prod: cấu trúc thật `weighbridge_tickets`, luồng mủ TL→PĐ là TP hay mủ thô.
- [ ] Migration `pallet_types_catalog.sql` (QĐ-2) + seed nhựa 10 / sắt 50.
- [ ] Migration `weighbridge_pallet_columns.sql` (6 cột QĐ-3).
- [ ] `wms.types.ts`: interface + SELECT + type PalletType.
- [ ] `rubberWeighService.calculateWeights` + `weighbridgeService` (2 luồng) đổi công thức net.
- [ ] `WeighingPage`: UI nút pallet + pre-fill L2=L1 + gợi ý theo bì lịch sử + cảnh báo lệch.
- [ ] `PrintPage`: in pallet L1/L2 + KL mủ thuần.
- [ ] Nghiệm thu: cân thử 1 xe có pallet dỡ bớt → KL mủ đúng như ví dụ docx (8.690 kg).
