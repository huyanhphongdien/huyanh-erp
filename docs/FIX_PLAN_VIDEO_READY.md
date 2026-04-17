# 🎯 Plan Fix — Chuẩn hệ thống trước khi quay video

> Session trước (16-17/04/2026) đã ship F1-F3 multi-facility + Pattern C xuất kho.
> Còn lại các bug UX cần fix để quy trình CHUẨN, sẵn sàng quay 3 video tutorial.

---

## TỔNG QUAN: 8 việc cần fix

| # | Issue | Priority | Effort | Ảnh hưởng video |
|---|---|---|---|---|
| **1** | Phiếu xuất SL hiện "kiện" thay vì "bành" | 🔴 HIGH | 30p | Video 2 |
| **2** | "Người lấy/tạo" hiện UUID thay vì tên | 🔴 HIGH | 30p | Video 2 |
| **3** | Kho xuất hiện KHO-A thay vì KHO-B (batch ở B) | 🟡 MED | 15p | Video 2 |
| **4** | Print phiếu cân OUT: verify "Xe ra (Xuất)" | 🟡 MED | 5p | Video 2 |
| **5** | Auto-confirm phiếu xuất: giữ hay bỏ? | 🟡 MED | 30p | Video 2 |
| **6** | Quy cách RSS_3: kiện vs bành — chuẩn hóa material | 🟠 DESIGN | 30p | Tất cả |
| **7** | Cleanup data test + seed data chuẩn | 🟢 LOW | 15p | Tất cả |
| **8** | Test end-to-end 3 flow (nhập/xuất/chuyển) | 🟢 LOW | 30p | Tất cả |

**Tổng estimate: ~3h**

---

## CHI TIẾT TỪNG ISSUE

### Issue 1: Phiếu xuất SL hiện "kiện" thay vì "bành" 🔴

**Hiện trạng:**
- processContainerShipment pick batch theo KG ✅
- Nhưng qty = weight / wpu_kho = 20160 / 111.11 = 181.44 KIỆN
- SO yêu cầu 576 BÀNH × 35 kg

**Root cause:** Kho tracking unit = "kiện" (111 kg), SO ship unit = "bành" (35 kg).

**Fix options:**
- **A.** processContainerShipment set `total_quantity` = container.bale_count (576) thay vì sum(detail.qty)
- **B.** Đổi material RSS_3 unit sang "bành" (ảnh hưởng toàn bộ kho)
- **C.** Thêm field `shipping_unit` + `shipping_qty` trên phiếu xuất (song song với unit kho)

**Recommend:** Option A (nhanh, đúng cho video). Detail vẫn ghi kiện (trừ kho chính xác), header hiện bành (khách hàng thấy đúng).

**Files:**
- `src/services/wms/stockOutService.ts` → processContainerShipment recalculate totals
- Hoặc: recalculate khi render (StockOutDetailPage)

---

### Issue 2: "Người lấy/tạo" hiện UUID 🔴

**Hiện trạng:**
- `picked_by` = scale_operators.id (UUID `29cc2439...`)
- `created_by` = scale_operators.id
- StockOutDetailPage render UUID slice thay vì lookup tên

**Root cause:** scale_operators không phải employees. Không join được qua FK (đã drop).

**Fix:**
- Lookup `scale_operators.name` theo ID khi render
- Hoặc: processContainerShipment save `picked_by_name` text field (denormalize)
- Hoặc: dùng `notes` field ghi "Picked by: Nhân viên cân 1"

**Recommend:** processContainerShipment → detail.notes = `"Container {no} — Cân bởi {operator.name}"`
Plus StockOutDetailPage: hiện notes thay UUID khi picked_by không match employees.

**Files:**
- `src/services/wms/stockOutService.ts` → processContainerShipment notes
- `apps/weighbridge/src/pages/WeighingPage.tsx` → pass operator.name vào params
- `src/pages/wms/stock-out/StockOutDetailPage.tsx` → render fallback

---

### Issue 3: Kho xuất hiện KHO-A thay vì KHO-B 🟡

**Hiện trạng:**
- processContainerShipment nhận `warehouse_id` từ WeighingPage (pick first TP warehouse = KHO-A)
- Nhưng batch nằm ở KHO-B
- Phiếu xuất header ghi "KHO-A" → sai

**Fix:**
- processContainerShipment: set warehouse_id = batch[0].warehouse_id (kho thực tế của batch đầu tiên picked)
- Hoặc: nếu multi-warehouse → log warning

**Files:**
- `src/services/wms/stockOutService.ts` → processContainerShipment sau khi pick → update warehouse_id

---

### Issue 4: Print phiếu cân OUT — verify 🟡

**Hiện trạng:**
- Commit `1a395cd1` đã fix: OUT → "Loại: Xe ra (Xuất)" thay "Mủ: Mủ đông"
- CHƯA verify trên prod (user chưa test print page mới)

**Fix:** Verify only — hard refresh print page, check hiển thị.

**Files:**
- `apps/weighbridge/src/pages/PrintPage.tsx` (đã fix)
- Cũng check print A4 layout (line 282-286 "Loại mủ" → cần ẩn cho OUT)

---

### Issue 5: Auto-confirm phiếu xuất — quyết định 🟡

**Hiện trạng:**
- processContainerShipment auto-confirm khi tất cả containers shipped
- User nói: "các thông số phải chuẩn trước khi người lấy xác nhận" → muốn review trước?

**Options:**
- **A. Giữ auto-confirm** (hiện tại) — nhanh, ít thao tác. Nếu sai → cancel + redo.
- **B. Luôn draft** — cân xong → draft. User vào ERP click "Xác nhận" thủ công.
- **C. Hybrid** — cân xong draft, nhưng nếu tất cả containers OK + trong ngưỡng → auto-confirm. Nếu có anomaly → giữ draft.

**Recommend:** Option A (auto-confirm) cho video đơn giản. Option B cho production real. Implement B nhưng demo A trong video (skip review step).

**Files:**
- `src/services/wms/stockOutService.ts` → processContainerShipment bỏ auto-confirm section
- `src/pages/wms/stock-out/StockOutDetailPage.tsx` → button "Xác nhận" (đã có sẵn)

---

### Issue 6: Quy cách RSS_3 — kiện vs bành 🟠

**Bài toán:**
```
Material TP-RSS3:
  unit = "kiện"
  weight_per_unit = 111.1112 kg/kiện

Sales Order SO-2026-0004:
  unit ship = "bành"
  bale_weight = 35 kg/bành
  total = 576 bành = 20,160 kg

Kho:
  batch qty = 100 kiện = 11,111 kg (mỗi kiện)
```

**Vấn đề:** 2 đơn vị tracking khác nhau cho cùng 1 sản phẩm.

**Options:**
- **A. Đổi material unit sang "bành"** — tất cả kho tracking bành. Batch seed lại qty theo bành.
  - Ưu: nhất quán toàn hệ thống
  - Nhược: ảnh hưởng batch cũ, phải convert qty
- **B. Giữ "kiện" cho kho, convert sang "bành" khi ship** — dual unit
  - Ưu: không ảnh hưởng kho cũ
  - Nhược: phải convert mỗi lần ship, confuse user
- **C. Thêm field `shipping_unit` trên material** — kho dùng `unit`, ship dùng `shipping_unit`
  - Ưu: rõ ràng
  - Nhược: thêm complexity

**Recommend:** Option A — đổi RSS_3 unit sang "bành" (35 kg). Kho + ship cùng unit → không confuse.
Hoặc: hỏi user — thực tế NHÀ MÁY tracking RSS_3 theo kiện hay bành? Nếu thực tế dùng bành → đổi luôn.

**Cần user confirm trước khi code.**

---

### Issue 7: Cleanup data test + seed chuẩn 🟢

- Xóa tất cả phiếu cân test, phiếu xuất test, phiếu chuyển test
- Reset SO-2026-0004 về confirmed
- Seed batch RSS_3 với unit ĐÚNG (sau khi chốt Issue 6)
- Seed batch NVL cho video 1 (nhập kho từ deal)
- Ensure flag VITE_AUTO_WEIGHBRIDGE_SYNC=true (PD)

---

### Issue 8: Test end-to-end 3 flow 🟢

Sau khi fix 1-7, test lại:

**Flow 1 — Nhập NVL:** Cân IN tại PD → auto-tạo phiếu nhập → kho NVL tăng → verify
**Flow 2 — Xuất SO:** Cấp phát → Container → Cân OUT → phiếu xuất đúng SL/KL → verify
**Flow 3 — Chuyển NM:** Tạo transfer TL→PD → cân TL → cân PD → hao hụt → verify

Mỗi flow test 1 lần clean → nếu pass → sẵn sàng quay video.

---

## THỨ TỰ THỰC HIỆN

```
Session mới:
1. Chốt Issue 6 với user (kiện vs bành?) → 5 phút
2. Fix Issue 1 + 6 (unit + SL) → 30 phút
3. Fix Issue 3 (warehouse_id) → 15 phút
4. Fix Issue 2 (UUID → tên) → 30 phút
5. Fix Issue 5 (auto-confirm decision) → 15 phút
6. Verify Issue 4 (print) → 5 phút
7. Issue 7: cleanup + seed → 15 phút
8. Issue 8: test 3 flows → 30 phút
9. Quay video → bắt đầu
```

---

## FILES CHÍNH SẼ SỬA

| File | Issues |
|---|---|
| `src/services/wms/stockOutService.ts` | #1, #2, #3, #5 |
| `apps/weighbridge/src/pages/WeighingPage.tsx` | #2 (pass operator name) |
| `apps/weighbridge/src/pages/PrintPage.tsx` | #4 (verify) |
| `src/pages/wms/stock-out/StockOutDetailPage.tsx` | #2 (render name) |
| DB: materials TP-RSS3 | #6 (unit change?) |
| DB: stock_batches | #6, #7 (re-seed) |

---

## MEMORY NOTES ĐÃ CÓ (cho session mới đọc)

- `multi_facility_status.md` — TL live, F3 shipped
- `schema_gotcha_stock_batches.md` — column names + auto-pick warehouse gotcha
- `weighing_logic_transfer.md` — TL 1 lần, PD 2 lần
- `deploy_targets.md` — Vercel domains
- `warehouse_structure.md` — kho 3 NM
