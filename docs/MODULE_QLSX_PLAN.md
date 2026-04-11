# MODULE QUẢN LÝ SẢN XUẤT (QLSX)
## Tách riêng từ KE_HOACH_MODULE_QUAN_LY_SAN_XUAT.md — chỉ phần MỚI

> **Ngày:** 11/04/2026
> **Truy cập:** Chỉ minhld@huyanhrubber.com
> **Lưu ý:** Các phần đã có trong WMS (production_orders, BOM, stages, facilities, dashboard) được GIỮ NGUYÊN, module này chỉ BỔ SUNG thêm.

---

## 1. ĐÃ CÓ (KHÔNG LÀM LẠI)

| Tính năng | File hiện có | Trạng thái |
|---|---|---|
| production_orders CRUD | `productionService.ts` + 8 pages | ✅ Đầy đủ |
| Dây chuyền SX (facilities) | `ProductionFacilitiesPage.tsx` | ✅ Có |
| BOM / Công thức | `ProductionSpecsPage.tsx` | ✅ Có |
| Stage tracking | `ProductionStagePage.tsx` | ✅ Có |
| Production Dashboard | `ProductionDashboardPage.tsx` | ✅ Có |
| Deal → Production link | `DealProductionTab.tsx` | ✅ Có |

---

## 2. CẦN BỔ SUNG (MODULE QLSX MỚI)

### Phase SX-1: Quy trình 10 bước SVR + Downtime + Báo cáo ca (1 tuần)

| # | Tính năng | Mô tả | DB table |
|---|---|---|---|
| SX-1.1 | **10 bước SVR chuẩn** | Template 10 công đoạn chế biến SVR (Tiếp nhận → Đóng gói), mỗi bước có thông số kỹ thuật riêng | `production_logs` (mới) |
| SX-1.2 | **Ghi nhận thông số theo bước** | Mỗi bước: operator, thời gian, params (pH, nhiệt độ, DRC, số bành...) | `production_logs.parameters` (JSONB) |
| SX-1.3 | **Downtime / Sự cố** | Ghi dừng máy: lý do (cơ khí/điện/NVL/chất lượng/bảo trì), thời gian, ai báo | `production_downtimes` (mới) |
| SX-1.4 | **Báo cáo ca** | Cuối ca: tổng output, downtime, headcount, QC pass rate, ghi chú | `shift_reports` (mới) |
| SX-1.5 | **Auto tính tiêu hao NVL** | LSX hoàn tất → tính NVL thực tế vs định mức → cảnh báo variance > 5% | Mở rộng `production_orders` |
| SX-1.6 | **Auto nhập kho TP** | LSX hoàn tất → tự tạo phiếu nhập kho thành phẩm (source_type='production') | Link `stock_in_orders` |

**UI mới:**
- `ProductionStepTracker.tsx` — Timeline 10 bước dọc, click từng bước nhập thông số
- `DowntimeLogPage.tsx` — Ghi sự cố, Pareto chart lý do dừng máy
- `ShiftReportPage.tsx` — Form báo cáo ca, auto-fill từ logs

### Phase SX-2: Giám sát Realtime + OEE (1 tuần)

| # | Tính năng | Mô tả |
|---|---|---|
| SX-2.1 | **Live Board** | Full-screen cho TV nhà máy: DS lệnh SX đang chạy, progress %, bước hiện tại |
| SX-2.2 | **Supabase Realtime** | Subscribe production_orders + production_logs → auto update live board |
| SX-2.3 | **OEE Dashboard** | OEE = Availability × Performance × Quality, trend theo tuần/tháng |
| SX-2.4 | **Cảnh báo realtime** | Variance NVL > 5%, Downtime > 60 phút, Bước quá thời gian chuẩn |

**UI mới:**
- `ProductionLiveBoard.tsx` — Dashboard realtime full-screen
- `OEEDashboard.tsx` — Biểu đồ OEE, Pareto, trend

### Phase SX-3: SOP Số hóa (1 tuần)

| # | Tính năng | Mô tả | DB table |
|---|---|---|---|
| SX-3.1 | **SOP Documents** | CRUD quy trình chuẩn (15 SOP ban đầu), version control | `sop_documents` (mới) |
| SX-3.2 | **SOP Steps** | Mỗi SOP có nhiều bước, rich text + upload ảnh/video + PPE | `sop_steps` (mới) |
| SX-3.3 | **SOP Checklist** | Checklist trước/trong/sau mỗi quy trình | `sop_checklists` (mới) |
| SX-3.4 | **SOP Version** | Lưu lịch sử thay đổi, snapshot JSONB | `sop_versions` (mới) |
| SX-3.5 | **SOP Approval** | Draft → Pending Review → Approved → Active | Workflow |

**UI mới:**
- `SOPListPage.tsx` — DS SOP, filter category/department/status
- `SOPEditorPage.tsx` — Rich editor bước + upload media + checklist builder
- `SOPViewerPage.tsx` — Read-only đẹp, in PDF

### Phase SX-4: Huấn luyện SOP (3 ngày)

| # | Tính năng | Mô tả | DB table |
|---|---|---|---|
| SX-4.1 | **Giao SOP cho NV** | Manager giao SOP cho phòng ban/cá nhân, có due date | `sop_training_assignments` (mới) |
| SX-4.2 | **NV đọc + xác nhận** | NV mở SOP → đánh dấu "Đã đọc" → quiz đơn giản (optional) | |
| SX-4.3 | **Báo cáo tuân thủ** | % NV hoàn thành theo phòng ban, overdue alerts | |

### Phase SX-5: Biển hiệu an toàn (3 ngày)

| # | Tính năng | Mô tả | DB table |
|---|---|---|---|
| SX-5.1 | **CRUD Biển hiệu** | Quản lý biển báo TCVN 8092: cấm, bắt buộc, cảnh báo, thông tin, PCCC | `safety_signs` (mới) |
| SX-5.2 | **Vị trí + Khu vực** | Map biển theo khu vực nhà máy (Kho NL, Khu sấy, Khu hóa chất...) | |
| SX-5.3 | **Lịch kiểm tra** | next_inspection_date, condition tracking, inspection history | `safety_sign_inspections` (mới) |

### Phase SX-6: Dashboard tổng hợp QLSX (3 ngày)

| # | Tính năng |
|---|---|
| SX-6.1 | **KPI Cards**: Sản lượng hôm nay, OEE, Downtime %, QC pass rate |
| SX-6.2 | **Biểu đồ sản lượng**: Theo ngày/tuần/tháng, so sánh kế hoạch vs thực tế |
| SX-6.3 | **Pareto downtime**: Top 5 lý do dừng máy |
| SX-6.4 | **Variance NVL**: Tiêu hao thực tế vs định mức BOM |
| SX-6.5 | **Export Excel**: Báo cáo sản xuất tổng hợp theo tháng |

---

## 3. TIMELINE

```
Tuần 1:  Phase SX-1 (10 bước SVR + Downtime + Báo cáo ca)
Tuần 2:  Phase SX-2 (Live Board + OEE + Realtime)
Tuần 3:  Phase SX-3 (SOP số hóa)
Tuần 4:  Phase SX-4 + SX-5 (Huấn luyện + Biển hiệu)
Tuần 5:  Phase SX-6 (Dashboard + Export)
```

---

## 4. DATABASE TABLES MỚI CẦN TẠO

```sql
-- SX-1: Production tracking
production_logs
production_downtimes
shift_reports

-- SX-3: SOP
sop_documents
sop_steps
sop_checklists
sop_versions

-- SX-4: Training
sop_training_assignments

-- SX-5: Safety
safety_signs
safety_sign_inspections
```

**Tổng: 10 tables mới**

---

## 5. SIDEBAR MENU

```
QUẢN LÝ SẢN XUẤT (chỉ minhld@)
├── 📋 Lệnh sản xuất        ← link /wms/production (có sẵn)
├── 📊 Dashboard SX          ← link /wms/production/dashboard (có sẵn)
├── 🏭 Live Board            ← MỚI /production/live
├── ⏱️ Báo cáo ca            ← MỚI /production/shift-reports
├── 🔧 Downtime / Sự cố     ← MỚI /production/downtimes
├── 📈 OEE                   ← MỚI /production/oee
├── 📖 SOP                   ← MỚI /production/sop
├── 🎓 Huấn luyện            ← MỚI /production/training
├── ⚠️ Biển hiệu AT          ← MỚI /production/safety-signs
└── ⚙️ Dây chuyền            ← link /wms/production/facilities (có sẵn)
```

---

*Tài liệu tạo: 11/04/2026*
*Trạng thái: DRAFT*
