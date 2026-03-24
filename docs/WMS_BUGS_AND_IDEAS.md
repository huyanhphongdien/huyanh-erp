# WMS — BUGS, ISSUES & Ý TƯỞNG MỚI

**Ngày phân tích:** 24/03/2026
**Nguồn:** Phân tích sâu toàn bộ codebase WMS (46 pages, 23 services, 9 components)

---

## 1. BUGS & ISSUES PHÁT HIỆN TỪ CODE

### Mức độ CAO

| # | Vấn đề | File | Mô tả chi tiết |
|---|--------|------|-----------------|
| 1 | **Không có transaction** | `stockInService.ts` | Confirm stock-in update nhiều bảng (stock_levels, inventory_transactions, batch status) không atomic. Nếu 1 query fail giữa chừng → DB inconsistent |
| 2 | **Missing DB indexes** | Database | `stock_batches(status, warehouse_id)` — picking queries scan toàn bộ bảng. Với 10k+ batches sẽ rất chậm |
| 3 | **Race condition actual_weight** | `dealWmsService.ts` | ✅ ĐÃ FIX — 2 hàm ghi `actual_weight_kg` cùng lúc |

### Mức độ TRUNG BÌNH

| # | Vấn đề | File | Mô tả chi tiết |
|---|--------|------|-----------------|
| 4 | **N+1 queries** | `inventoryService.ts` | `getStockSummary` join material + warehouse cho từng row → chậm với 1000+ materials |
| 5 | **TODO cost_price** | `inventoryService.ts` | Comment TODO: chưa implement cost tracking → không tính được giá trị tồn kho thực |
| 6 | **Picking không optimize** | `pickingService.ts` | FIFO picking chọn lô cũ nhất nhưng không xét vị trí → nhân viên đi lòng vòng kho |
| 7 | **Hardcoded thresholds** | Nhiều files | `5%` weight loss, `60` ngày storage, `33.33` kg/bành, `7` ngày expiry warning — không cấu hình được |
| 8 | **CV60 classification** | `rubberGradeService.ts` | `classifyByDRC()` chỉ phân loại theo DRC, nhưng SVR CV60 cần PRI (Plasticity Retention Index) |
| 9 | **Code generation trùng** | 5+ services | Mỗi service có `generateCode()` riêng — logic giống nhau nhưng copy-paste |
| 10 | **Batch SELECT trùng** | Nhiều services | Cùng 1 SELECT string cho stock_batches bị copy khắp nơi |

### Mức độ THẤP

| # | Vấn đề | File | Mô tả chi tiết |
|---|--------|------|-----------------|
| 11 | **Alert dismissed không lưu DB** | `alertService.ts` | Dismiss alert chỉ ở UI (state) → reload trang alert hiện lại |
| 12 | **DRCChart orphaned** | `components/wms/DRCChart.tsx` | File tồn tại nhưng không được import ở đâu |
| 13 | **LocationPicker no capacity check** | `LocationPicker.tsx` | Cho phép chọn vị trí đã đầy, không validate capacity |
| 14 | **Contamination no photo** | QC pages | Ghi nhận tạp chất nhưng không upload ảnh chứng cứ |
| 15 | **StockCheck random sequence** | `stockCheckService.ts` | Mã kiểm kê random, không sequential |
| 16 | **stockInService notes dùng UUID** | `stockInService.ts` | Ghi chú `Nhập kho từ phiếu ${order.id}` thay vì `${order.code}` |
| 17 | **No polling/realtime** | `AlertListPage.tsx` | Chỉ refresh khi bấm nút, không auto-refresh |
| 18 | **Supabase errors chỉ console.log** | Nhiều services | Lỗi Supabase không hiện cho user, chỉ log console |

---

## 2. TOP 10 Ý TƯỞNG MỚI

### Ý tưởng 1: COA (Certificate of Analysis) — 🔴 Rất cao

**Vấn đề hiện tại:** Xuất khẩu cao su cần COA đi kèm — hiện tạo thủ công bằng Word/Excel.

**Giải pháp:**
- Auto generate COA PDF từ QC results + rubber_grade_standards
- Template quản lý (header công ty, format theo buyer)
- Gắn COA vào stock-out order
- Multi-language (Tiếng Việt + English)

**Dữ liệu đã có:** batch_qc_results (DRC, moisture, dirt, ash, nitrogen, volatile, PRI, Mooney, color), rubber_grade_standards (TCVN 3769:2016)

---

### Ý tưởng 2: Cost Tracking & Giá vốn — 🔴 Rất cao

**Vấn đề hiện tại:** `inventoryService.ts` có TODO comment "cost_price missing". Không tính được giá vốn sản xuất, không biết lãi/lỗ theo grade.

**Giải pháp:**
- Thêm `cost_per_kg` vào stock_batches (từ deal.unit_price hoặc nhập tay)
- Tính COGS: NVL cost + processing cost + overhead
- Giá trị tồn kho = sum(quantity × cost_per_kg)
- Profit margin per grade = selling_price - COGS

**Dữ liệu cần thêm:** `materials.cost_price`, `stock_batches.cost_per_unit`, `production_orders.total_cost`

---

### Ý tưởng 3: Forecast tồn kho — 🟡 Cao

**Vấn đề hiện tại:** Không biết khi nào hết SVR10, cần mua thêm bao nhiêu NVL.

**Giải pháp:**
- Dự đoán tồn kho 7/14/30 ngày dựa trên tốc độ xuất
- Cảnh báo "SVR 10 sẽ hết trong 5 ngày" → tự gợi ý mua NVL
- Chart dự đoán (actual line + forecast dotted line)
- Tích hợp vào Dashboard

**Dữ liệu đã có:** inventory_transactions (lịch sử in/out), stock_levels (tồn hiện tại)

---

### Ý tưởng 4: Supplier Scoring Dashboard — 🟡 Cao

**Vấn đề hiện tại:** Có `SupplierQualityReportPage` nhưng chỉ hiện avg_drc + pass_rate. Không có scoring tổng hợp.

**Giải pháp:**
- Scorecard mỗi đại lý: DRC consistency (std dev), pass rate, on-time %, quantity accuracy
- Ranking board (top 10 đại lý tốt nhất)
- Trend chart (chất lượng đại lý X đang tốt lên hay xấu đi?)
- Auto suggest: "Nên mua thêm từ đại lý A, giảm mua từ đại lý B"

**Dữ liệu đã có:** stock_batches.supplier_name/region/supplier_reported_drc, batch_qc_results

---

### Ý tưởng 5: Mobile QC App — 🟡 Cao

**Vấn đề hiện tại:** Nhân viên QC phải vào PC để nhập kết quả. Không tiện khi ở bãi mủ.

**Giải pháp:**
- PWA hoặc responsive page tối ưu cho tablet/phone
- Quét QR lô → mở form nhập DRC nhanh
- Chụp ảnh mẫu (camera phone)
- Offline capable (sync khi có mạng)
- Có thể tách app riêng như trạm cân (qc.huyanhrubber.vn)

---

### Ý tưởng 6: Batch Split/Merge — 🟡 Cao

**Vấn đề hiện tại:** Khi chia lô ra 2 bãi khác nhau hoặc gộp 2 lô cùng DRC → không có chức năng. Phải tạo phiếu xuất + nhập mới.

**Giải pháp:**
- Split: LOT-001 (10T) → LOT-001-A (6T) + LOT-001-B (4T)
- Merge: LOT-001 + LOT-002 (cùng DRC ±2%) → LOT-003
- Giữ traceability (parent_batch_id đã có trong schema)
- Audit trail: ai tách/gộp, lúc nào, lý do

---

### Ý tưởng 7: Container Manifest (Xuất khẩu) — 🟡 Cao

**Vấn đề hiện tại:** stock_out_orders có `container_type, container_id, bale_count` nhưng không quản lý chi tiết bành nào vào container nào.

**Giải pháp:**
- Packing list: danh sách bành trong 1 container
- Container manifest: weight per container, seal number
- Auto calculate: 1 container 20ft ≈ 20T ≈ 600 bành SVR
- Print shipping documents (Bill of Lading data)
- COA gắn theo container

---

### Ý tưởng 8: DRC Prediction — 🟢 Trung bình

**Vấn đề hiện tại:** DRC thay đổi theo thời gian lưu kho (mủ khô dần). Hiện chỉ ghi nhận, không dự đoán.

**Giải pháp:**
- Model: DRC = f(initial_drc, storage_days, rubber_type, season)
- Chart: actual DRC + predicted DRC line
- Alert: "Lô X sẽ xuống dưới SVR 10 threshold trong 7 ngày → cần blend hoặc bán"
- Giúp quyết định: bán ngay hay lưu thêm?

---

### Ý tưởng 9: Equipment/Facility Tracking — 🟢 Trung bình

**Vấn đề hiện tại:** `production_facilities` chỉ có name + max_batch_size. Không theo dõi downtime, bảo trì.

**Giải pháp:**
- Lịch bảo trì (scheduled maintenance)
- Ghi nhận downtime (lò sấy hỏng từ 8h-14h)
- Tính OEE (Overall Equipment Effectiveness)
- Link task module: "Bảo trì lò sấy" → task tự động

---

### Ý tưởng 10: Alert Thresholds UI — 🟢 Trung bình

**Vấn đề hiện tại:** Ngưỡng cảnh báo hardcode trong code:
```typescript
// alertService.ts
const WEIGHT_LOSS_THRESHOLD = 0.05  // 5% — không đổi được
const STORAGE_DAYS_THRESHOLD = 60   // 60 ngày — không đổi được
const EXPIRY_WARNING_DAYS = 7       // 7 ngày — không đổi được
```

**Giải pháp:**
- Trang Settings: UI cấu hình ngưỡng cho từng loại cảnh báo
- Lưu vào DB (table `wms_settings`)
- Cho phép set ngưỡng theo loại mủ (mủ nước hao hụt nhanh hơn mủ đông)
- Role-based: chỉ admin/manager mới đổi được

---

## 3. ĐÁNH GIÁ TỔNG THỂ

| Dimension | Điểm | Ghi chú |
|-----------|------|---------|
| Core WMS | 8/10 | Nhập/xuất/tồn kho hoàn chỉnh |
| Rubber-specific | 6/10 | DRC tốt, supplier/cost yếu |
| Reporting | 5/10 | Dashboard cơ bản, thiếu export |
| Mobile | 2/10 | Desktop only |
| Code Quality | 7/10 | Clean architecture, cần refactor |
| Integration | 7/10 | B2B/Production tốt, weighbridge limited |
| **Tổng** | **6.5/10** | |

---

## 4. TRẠNG THÁI THEO DÕI

| # | Item | Loại | Trạng thái | Ghi chú |
|---|------|------|-----------|---------|
| B1 | No transaction | Bug | ⬜ Chưa fix | Cần Supabase RPC |
| B2 | Missing indexes | Bug | ✅ Đã fix | P7 — wms_indexes.sql |
| B3 | Race condition | Bug | ✅ Đã fix | dealWmsService |
| B4 | N+1 queries | Issue | ⬜ Chưa fix | inventoryService |
| B5 | TODO cost_price | Issue | ✅ Đã fix | P8 — costTrackingService |
| B6 | Picking không optimize | Issue | ⬜ Chưa fix | Phase B |
| B7 | Hardcoded thresholds | Issue | ✅ Đã fix | P7 — alertService getAlertConfig() |
| B8 | CV60 classification | Issue | ⬜ Chưa fix | Cần PRI data |
| B9-18 | Các issue nhỏ | Issue | 🔶 Một phần | B11, B13, B16 đã fix |
| I1 | COA Generation | Ý tưởng | ⬜ Chưa làm | 🔴 Rất cao |
| I2 | Cost Tracking | Ý tưởng | ✅ Đã làm | P8 — costTrackingService |
| I3 | Forecast | Ý tưởng | ⬜ Chưa làm | 🟡 Cao |
| I4 | Supplier Scoring | Ý tưởng | ⬜ Chưa làm | 🟡 Cao |
| I5 | Mobile QC | Ý tưởng | ⬜ Chưa làm | 🟡 Cao |
| I6 | Batch Split/Merge | Ý tưởng | ⬜ Chưa làm | 🟡 Cao |
| I7 | Container Manifest | Ý tưởng | ⬜ Chưa làm | 🟡 Cao |
| I8 | DRC Prediction | Ý tưởng | ⬜ Chưa làm | 🟢 TB |
| I9 | Equipment Tracking | Ý tưởng | ⬜ Chưa làm | 🟢 TB |
| I10 | Alert Thresholds UI | Ý tưởng | ⬜ Chưa làm | 🟢 TB |

---

*Phân tích bởi Claude Code — 24/03/2026*
*Huy Anh Rubber ERP v8*
