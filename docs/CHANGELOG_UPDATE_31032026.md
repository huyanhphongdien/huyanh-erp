# NHẬT KÝ CẬP NHẬT HỆ THỐNG — 31/03/2026

> **Phiên bản:** ERP v8.3
> **Thời gian:** 16/03/2026 → 31/03/2026 (16 ngày)
> **Người thực hiện:** Lê Duy Minh — IT System — Phó phòng QLSX

---

## TỔNG QUAN

### Thống kê code

| Metric | Trước | Sau | Thay đổi |
|--------|-------|-----|---------|
| Pages (.tsx) | 91 | **118** | +27 trang |
| Components (.tsx) | 81 | **96** | +15 component |
| Services (.ts) | 124 | **142** | +18 service |
| SQL Migrations | 8 | **14** | +6 file |
| Edge Functions | 2 | **4** | +2 function |
| Tổng commits | 59 | **~130** | +71 commits |
| Apps | 3 | 3 | Không đổi |

### 3 Apps

| App | Domain | Trạng thái |
|-----|--------|-----------|
| ERP chính | huyanhrubber.vn | ✅ Production |
| B2B Portal | b2b.huyanhrubber.vn | ✅ Production |
| Trạm cân | can.huyanhrubber.vn | ✅ Production |

---

## 1. MODULE ĐƠN HÀNG BÁN (SALES ORDER) — MỚI HOÀN TOÀN

### 1.1 Trang mới (8 trang)

| Trang | Route | Mô tả |
|-------|-------|-------|
| Dashboard bán hàng | `/sales/dashboard` | KPIs, pipeline, charts |
| Danh sách khách hàng | `/sales/customers` | 25 KH thật, CRUD |
| Chi tiết khách hàng | `/sales/customers/:id` | 4 tabs |
| Danh sách đơn hàng | `/sales/orders` | 9 tabs trạng thái |
| Tạo đơn hàng | `/sales/orders/new` | 4 bước wizard |
| Chi tiết đơn hàng | `/sales/orders/:id` | 6 tabs phân quyền |
| Đóng gói container | `/sales/orders/:id/packing` | Seal + bales |
| Chứng từ xuất khẩu | `/sales/orders/:id/documents` | COA + PL + Invoice |
| **Theo dõi lô hàng** | `/sales/shipments` | **Thay thế Excel** |
| **Dashboard BGĐ** | `/executive` | **Tổng quan điều hành** |

### 1.2 Service mới (8 service)

| Service | Chức năng |
|---------|----------|
| salesOrderService | CRUD đơn hàng + status workflow |
| salesCustomerService | CRUD khách hàng |
| salesProductionService | Liên kết SX + NVL check |
| containerService | Container + seal + bale |
| documentService | COA + PL + Invoice data |
| salesDashboardService | KPIs + charts |
| **salesPermissionService** | **Phân quyền 4 bộ phận** |
| **salesAlertService** | **7 cảnh báo tự động** |

### 1.3 Phân quyền 4 bộ phận

```
BP Sale:       Tạo/sửa đơn + KH + specs + giá
BP Sản xuất:   Tab SX (NVL, LSX, tiến độ)
BP Logistics:  Tab Đóng gói + COA + PL + booking + B/L + DHL
BP Kế toán:    Tab Tài chính + Invoice + L/C + chiết khấu + hoa hồng
Admin:         Full quyền tất cả
```

### 1.4 Tab Tài chính (MỚI — chỉ Kế toán)

- Thanh toán: phương thức (DP/LC/TT), L/C, ngân hàng, ngày TT
- Chiết khấu: số tiền, ngày CK, ngày trình BTC
- Hoa hồng: mức USD/MT, tổng, broker
- Giá: so sánh giá chốt vs giá hợp đồng

### 1.5 Cảnh báo tự động (4 loại)

| Cảnh báo | Mức | Điều kiện |
|---------|-----|----------|
| L/C sắp hết hạn | 🔴 | < 7 ngày |
| Đơn sắp tới hạn giao | 🔴/🟡 | < 7 ngày / quá hạn |
| Chưa thanh toán | 🔴 | > 30 ngày sau xuất |
| Đơn nháp lâu | 🟡 | > 3 ngày chưa xác nhận |

### 1.6 Dữ liệu thực

- 25 khách hàng thật (JK, ATC, PIX, Tower Global, IE Synergy...)
- 10 sản phẩm (SVR3L/5/10/20/CV60, RSS1/3, SBR1502, Compound)
- 13 phương thức thanh toán (DP, LC, TT, phức hợp...)
- 6 ngân hàng (AGRI, VTB, TP, EXIM, BIDV, VCB)

### 1.7 SQL Migration

File: `docs/migrations/sales_order_v2.sql`
- 16 cột mới cho `sales_orders`
- 4 cột mới cho `sales_customers`
- 4 sản phẩm mới
- 25 khách hàng import

---

## 2. HỆ THỐNG CÔNG VIỆC V3 — NÂNG CẤP LỚN

### 2.1 Đánh giá bắt buộc

| Trước (V2) | Sau (V3) |
|------------|---------|
| Form 7 trường, có nút "Bỏ qua" | **1-5 sao + ghi chú ≥10 ký tự, KHÔNG skip** |
| ~30% task có đánh giá | **100%** bắt buộc |
| NV thoải mái bỏ qua | **> 3 task chưa đánh giá → chặn tạo mới** |

### 2.2 Tự động duyệt (Auto-approve)

| Loại task | Trước | Sau |
|-----------|-------|-----|
| Quản lý giao | Manager duyệt | Manager duyệt (giữ nguyên) |
| Tự giao | Manager duyệt | **Auto approve, điểm = NV × 70%** |
| Lặp lại (recurring) | Manager duyệt | **Auto approve, điểm = NV × 80%** |
| Dự án | PM duyệt | PM duyệt (giữ nguyên) |

### 2.3 Trọng số (Weight) khi tính hiệu suất

| Loại task | Weight | Lý do |
|-----------|--------|-------|
| Quản lý giao + Dự án | 1.0 | Công việc chính |
| Lặp lại (recurring) | 0.5 | Routine hàng ngày |
| Tự giao | 0.3 | Cá nhân |

### 2.4 Xếp hạng A/B/C/D/F

| Hạng | Điểm | Đánh giá |
|------|------|---------|
| A | 90-100 | Xuất sắc |
| B | 75-89 | Tốt |
| C | 60-74 | Trung bình |
| D | 40-59 | Cần cải thiện |
| F | < 40 | Không đạt |

### 2.5 Bằng chứng checklist (📷)

- Mẫu công việc: đánh dấu bước cần bằng chứng
- NV tick bước có 📷 → bắt buộc upload ảnh/file trước
- File lưu Supabase Storage `task-evidence`
- Hiện link xem bằng chứng đã upload

### 2.6 Nguồn task tự động (task_source)

| Ngữ cảnh | task_source | Hệ thống tự biết |
|-----------|-------------|-----------------|
| Edge Function tạo | `recurring` | ✅ |
| NV bấm "Tự giao" | `self` | ✅ |
| Task thuộc dự án | `project` | ✅ |
| Manager tạo | `assigned` | ✅ |

### 2.7 Mẫu công việc — Toggle "Lặp lại"

- Switch "Công việc lặp lại" khi tạo/sửa mẫu
- Mẫu đánh dấu lặp lại → task tạo từ mẫu này weight = 0.5

### 2.8 SQL Migration

File: `docs/migrations/task_v3.sql`
- `self_score`, `manager_score`, `final_score`, `task_source`, `evidence_count` cho tasks
- `requires_evidence`, `evidence_url`, `evidence_note` cho checklist items
- `is_routine` cho templates
- `deadline`, `auto_approved` cho approvals
- Bảng `performance_salary_config` (xếp hạng A-F)
- Storage bucket `task-evidence`

---

## 3. TÍNH NĂNG KHÁC ĐÃ CẬP NHẬT

### 3.1 B2B — Fix 12 bugs nghiêm trọng

| Bug | Mức | Fix |
|-----|-----|-----|
| advanceService không tạo ledger entry | CRITICAL | Đã fix |
| updateDealActualDrc bỏ qua price_unit | CRITICAL | Đã fix |
| settlementService.markAsPaid bỏ qua total_paid_post | HIGH | Đã fix |
| cancelSettlement không kiểm tra status | HIGH | Đã fix |
| approveAdvance/markPaid không validate status | HIGH | Đã fix |
| 2 functions cùng ghi actual_weight_kg (race condition) | HIGH | Đã fix |
| Ledger entries thiếu period_month/year | MEDIUM | Đã fix |
| DRC recalc sai khi batch depleted | MEDIUM | Đã fix |
| + 4 bugs khác | LOW-MEDIUM | Đã fix |

### 3.2 B2B — Fix logic gia công (processing deals)

- autoSettlementService: tính riêng cho gia công (output value - phí GC)
- dealConfirmService: chặn tạm ứng cho deal gia công
- dealWmsService: không tính final_value cho processing deals
- ConfirmDealModal: ẩn advance, hiện phí GC khi type=processing

### 3.3 WMS — Nâng cấp kho (12 Phases)

| Phase | Tính năng | Status |
|-------|----------|--------|
| 1 | In nhãn QR lô hàng (sau QC) | ✅ |
| 2 | Bản đồ bãi mủ (Yard Map) | ✅ |
| 3 | Dashboard bãi NVL | ✅ |
| 4 | Quick Stock-In từ phiếu cân | ✅ |
| 5 | QC Quick Scan (mobile) | ✅ |
| 6 | Batch Split/Merge | ✅ |
| 7 | Fix bugs & issues | ✅ |
| 8 | Cost tracking & giá vốn | ✅ |
| 10 | Supplier Scoring (A-F) | ✅ |
| 11 | Forecast + Alert Config | ✅ |

### 3.4 Quản lý công việc — Tính năng mới

| Tính năng | Mô tả |
|-----------|-------|
| Kanban Board | Kéo thả task 4 cột |
| Task Comments | Bình luận trong task |
| Subtask Progress | Task cha tự tính % từ con |
| Status History | Timeline ai đổi gì khi nào |
| Dashboard cá nhân | Calendar 7 ngày + chart tuần |
| Notification Bell | Chuông thông báo task |
| Checklist | Tick từng bước + progress auto |
| Template + Recurring | Mẫu + lịch tự động |
| Phê duyệt nhanh | Batch approve nhiều task |
| Dashboard hiệu suất | Xếp hạng + trend + phòng ban |
| Báo cáo hiệu suất | Export PDF/CSV |
| Liên kết chấm công | Chấm công 30% tổng điểm |

### 3.5 App Trạm cân

| Cập nhật | Mô tả |
|---------|-------|
| Camera Dahua | 3 camera IP, proxy .exe |
| Keli Scale | Web Serial API, XK3118T1-A3 |
| In phiếu | A4 + 80mm + 58mm, QR code |
| Tìm kiếm + lọc | Theo ngày, biển số, tài xế |
| Auto capture | Chụp camera khi ghi cân |

### 3.6 Tiếng Việt

- Fix **100+ chỗ** thiếu dấu trên toàn hệ thống
- WMS: 30+ files
- B2B: 15+ files
- Sales: 10+ files
- Task: 5+ files

### 3.7 VIP Exclusion

2 nhân sự cấp cao không ai được giao task:
- `huylv@huyanhrubber.com` — Giám đốc
- `thuyht@huyanhrubber.com` — Trợ lý BGĐ

---

## 4. SQL CẦN CHẠY (nếu chưa)

| File | Mục đích | Đã chạy? |
|------|---------|---------|
| `docs/migrations/phase4_deal_wms.sql` | Deal ↔ WMS | ✅ |
| `docs/migrations/wms_rubber_fields.sql` | Rubber fields | ✅ |
| `docs/migrations/p8_production_orders.sql` | Sản xuất | ✅ |
| `docs/migrations/p9_blending.sql` | Phối trộn | ✅ |
| `docs/migrations/deal_fields_sync.sql` | Deal fields | ✅ |
| `docs/migrations/b2b_demands.sql` | Nhu cầu mua | ✅ |
| `docs/migrations/yard_positions.sql` | Bản đồ bãi | ✅ |
| `docs/migrations/wms_indexes.sql` | Performance indexes | ✅ |
| `docs/migrations/cost_tracking.sql` | Cost tracking | ✅ |
| `docs/migrations/task_checklist.sql` | Task checklist | ✅ |
| `docs/migrations/task_templates_recurring.sql` | Templates | ✅ |
| `docs/migrations/sales_order_module.sql` | Sales tables | ✅ |
| `docs/migrations/sales_order_v2.sql` | Sales V2 update | ✅ |
| **`docs/migrations/task_v3.sql`** | **Task V3** | **❓ Kiểm tra** |

---

## 5. EDGE FUNCTIONS

| Function | Tần suất | Mục đích | Deploy? |
|----------|---------|---------|---------|
| task-recurring-generator | 6:00 AM | Tạo task tự động | ✅ |
| task-reminders | 8:00 AM | Email nhắc nhở | ✅ |
| auto-checkout | Mỗi 30 phút | Chấm công | ✅ (có từ trước) |
| send-email | Theo trigger | Gửi email | ✅ (có từ trước) |

---

## 6. MENU HỆ THỐNG SAU CẬP NHẬT

```
TỔNG QUAN
├─ Dashboard
├─ Thông báo

CHẤM CÔNG
├─ Bảng chấm công
├─ Chấm công tháng
├─ Quản lý ca / Phân ca / Đội ca
├─ Đơn nghỉ phép / Duyệt
├─ Tăng ca / Duyệt

QUẢN LÝ CÔNG VIỆC
├─ Danh sách công việc
├─ Kanban                        ← MỚI
├─ Công việc của tôi             (nâng cấp)
├─ Phê duyệt
├─ Phê duyệt nhanh              ← MỚI
├─ Mẫu công việc                (nâng cấp: is_routine + evidence)
├─ Hiệu suất                    ← MỚI (dashboard + xếp hạng)
└─ Báo cáo hiệu suất            ← MỚI (export PDF/CSV)

QUẢN LÝ DỰ ÁN
├─ Danh sách DA / Tạo DA
├─ Gantt tổng hợp / Nguồn lực
├─ Loại dự án / Templates

B2B THU MUA
├─ Dashboard / Chat đại lý
├─ Nhu cầu mua                  ← MỚI
├─ Đại lý / Deals
├─ Công nợ / Quyết toán
├─ Báo cáo công nợ / Địa điểm

ĐƠN HÀNG BÁN                    ← MỚI (toàn bộ)
├─ Tổng quan
├─ Khách hàng
├─ Đơn hàng
├─ Theo dõi lô hàng             ← MỚI (thay Excel)
└─ Điều hành BGĐ                ← MỚI (admin only)

KHO (WMS)
├─ Tồn kho
├─ Bãi NVL                      ← MỚI
├─ Bản đồ bãi                   ← MỚI
├─ Nhập kho / Xuất kho
├─ QC / DRC / QC Recheck
├─ Vật liệu / Kho hàng
├─ Sản xuất / Dashboard SX
├─ Dây chuyền / Công thức BOM
├─ Phối trộn / Gợi ý trộn
├─ Báo cáo WMS
├─ Chấm điểm NCC                ← MỚI
└─ Cài đặt kho                  ← MỚI
```

---

## 7. TÀI LIỆU ĐÃ TẠO

| File | Nội dung |
|------|---------|
| `PROJECT_ANALYSIS.md` | Phân tích tổng quan dự án |
| `SYSTEM_FLOW_ANALYSIS.md` | Luồng tổng thể A-Z |
| `EXCEL_PROBLEMS_ANALYSIS.md` | Phân tích vấn đề Excel |
| `SALES_ORDER_COMPREHENSIVE.md` | Thiết kế Sales đa BP |
| `SALES_ORDER_UPDATE_PLAN.md` | Kế hoạch cập nhật Sales |
| `SALES_ORDER_V2_REBUILD_SPEC.md` | Spec V2 chi tiết |
| `SALES_ORDER_BP_DATA_COLLECTION.md` | Thu thập dữ liệu 4 BP |
| `SALES_ORDER_TEST_BY_DEPARTMENT.md` | Hướng dẫn test từng BP |
| `TASK_SYSTEM_V3_SPEC.md` | Thiết kế Task V3 |
| `TASK_V3_IMPLEMENTATION.md` | Chi tiết triển khai V3 |
| `TASK_PERFORMANCE_UPGRADE_PLAN.md` | Kế hoạch hiệu suất |
| `PERFORMANCE_SCORING_SYSTEM.md` | Công thức tính điểm |
| `TASK_DB_RESTRUCTURE.md` | Phân tích DB task |
| `TASK_MODULE_UPGRADE_PLAN.md` | Kế hoạch nâng cấp task |
| `WMS_UPGRADE_PLAN.md` | Kế hoạch nâng cấp WMS |
| `WMS_BUGS_AND_IDEAS.md` | Bugs + ý tưởng WMS |
| `B2B_FULL_FLOW_TEST.md` | Test luồng B2B E2E |
| `SYSTEM_TESTING_GUIDE.md` | Hướng dẫn test toàn hệ thống |
| `WEIGHBRIDGE_SETUP_GUIDE.md` | Hướng dẫn cài đặt trạm cân |
| `WEIGHBRIDGE_APP_SPEC.md` | Spec app cân xe |

---

> Nhật ký cập nhật — Huy Anh Rubber ERP v8.3
> 16/03/2026 → 31/03/2026
> Người thực hiện: Lê Duy Minh — IT System
