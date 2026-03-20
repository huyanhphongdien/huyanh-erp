# HUY ANH RUBBER ERP v8 - PHAN TICH TOAN DIEN DU AN

**Du an:** Huy Anh Rubber ERP v8
**Cong ty:** Cong ty TNHH MTV Cao su Huy Anh Phong Dien
**Ngay phan tich:** 20/03/2026
**Phien ban:** v8 (monorepo)

---

## 1. TONG QUAN DU AN

### 1.1 Muc dich
He thong ERP quan ly toan dien nha may che bien cao su thien nhien, bao gom:
- **Quan ly nhan su (HRM):** Phong ban, nhan vien, hop dong, cham cong, luong, danh gia
- **Quan ly cong viec & Du an:** Task management, project management voi Gantt chart
- **Mua hang (Purchasing):** NCC, don hang, hoa don, cong no
- **B2B Thu mua mu:** Chat real-time voi dai ly, booking, deals, tam ung, quyet toan
- **Kho thanh pham (WMS):** Nhap/xuat kho, ton kho, QC, san xuat, phoi tron
- **Tram can xe:** App doc lap ket noi can dien tu + camera IP
- **Thu mua mu (Rubber):** Thu mua mu Viet + Lao, ly lich mu, quyet toan

### 1.2 Kien truc 3 Apps

```
+---------------------------+     +---------------------------+     +---------------------------+
|    ERP CHINH (Main)       |     |    B2B PARTNER PORTAL     |     |    TRAM CAN XE            |
|    huyanhrubber.vn        |     |    b2b.huyanhrubber.vn    |     |    can.huyanhrubber.vn     |
|                           |     |                           |     |                           |
|  - HR, Tasks, Projects    |     |  - Chat voi nha may       |     |  - Can xe mu cao su       |
|  - B2B (phia nha may)     |     |  - Gui/nhan booking       |     |  - Web Serial API         |
|  - WMS (Kho, SX, QC)      |     |  - Theo doi deals         |     |  - Camera Dahua (3 cam)   |
|  - Purchasing             |     |  - Xem cong no            |     |  - In phieu (A4/80mm)     |
|  - Rubber (thu mua)       |     |  - Nhan quyet toan        |     |  - QR Code                |
+-------------|-------------+     +-------------|-------------+     +-------------|-------------+
              |                                 |                                 |
              +------- Supabase (PostgreSQL) ----+--- Auth + Storage + Realtime ---+
```

### 1.3 Tech Stack

| Thanh phan | Cong nghe | Phien ban |
|------------|-----------|-----------|
| Frontend Framework | React | 18.3.1 |
| Build Tool | Vite | 7.3.1 |
| Language | TypeScript | 5.8.3 |
| UI Library (ERP + Can) | Ant Design | 6.3.2 |
| UI Library (Custom) | Tailwind CSS | 3.4.17 |
| State Management | Zustand | 5.0.10 |
| Server State | TanStack React Query | 5.90.17 |
| Forms | React Hook Form + Zod | 7.71.1 / 4.3.5 |
| Routing | React Router DOM | 7.12.0 |
| Charts | Recharts | 3.7.0 |
| Icons | Lucide React + Ant Design Icons | 0.562.0 / 6.1.0 |
| Backend / Database | Supabase (PostgreSQL) | 2.98.0 |
| Auth | Supabase Auth | Built-in |
| File Storage | Supabase Storage | Built-in |
| Realtime | Supabase Realtime | Built-in |
| PDF Export | jsPDF + jspdf-autotable | 4.0.0 / 5.0.7 |
| Excel Export | ExcelJS + XLSX | 4.4.0 / 0.18.5 |
| Deploy | Vercel | 3 domains |

---

## 2. KIEN TRUC HE THONG

### 2.1 Cau truc thu muc

```
huyanh-erp-8/
├── src/                              <- ERP chinh
│   ├── App.tsx                       <- 120+ routes
│   ├── components/                   <- 81 components (.tsx)
│   │   ├── b2b/          (22 files)  <- B2B chat, deals, modals
│   │   ├── chat/          (2 files)  <- BookingCard, VoiceRecorder
│   │   ├── common/        (5 files)  <- Sidebar, MainLayout, Header
│   │   ├── dashboard/     (1 file)   <- KPICard
│   │   ├── evaluation/    (9 files)  <- Approval, Rating, Score
│   │   ├── project/      (11 files)  <- Gantt, Kanban, Heatmap
│   │   ├── ui/           (15 files)  <- Button, Card, Modal, Table...
│   │   ├── wms/           (8 files)  <- DRC, Grade, Weight, Camera
│   │   └── layout/        (1 file)   <- NotificationDropdown
│   ├── features/                     <- Feature-based pages
│   │   ├── attendance/     (6 files)
│   │   ├── auth/           (4 files)
│   │   ├── contracts/      (3 files)
│   │   ├── dashboard/      (3 files)
│   │   ├── departments/    (2 files)
│   │   ├── employees/      (3 files)
│   │   ├── leave-requests/ (3 files)
│   │   ├── overtime/       (3 files)
│   │   ├── payroll/        (2 files)
│   │   ├── payslips/       (2 files)
│   │   ├── performance-*/  (4 files)
│   │   ├── purchasing/    (35 files)  <- PO, Supplier, Materials
│   │   ├── reports/        (4 files)
│   │   ├── salary-grades/  (2 files)
│   │   ├── shift-*/        (8 files)
│   │   └── tasks/          (4 files)
│   ├── pages/              91 pages (.tsx)
│   │   ├── b2b/           (16 files)  <- Dashboard, Chat, Deals, Ledger, Settlements
│   │   ├── evaluations/    (4 files)
│   │   ├── projects/      (11 files)
│   │   ├── rubber/         (7 files)  <- VN batches, Lao, Profiles
│   │   ├── settings/       (1 file)
│   │   └── wms/           (36 files)  <- Stock, QC, Production, Blending, Reports
│   ├── services/          124 files (.ts)
│   │   ├── b2b/          (17 files)   <- Chat, Deal, Ledger, Settlement, DRC
│   │   ├── project/       (17 files)  <- Project, Gantt, Milestone, Resource
│   │   ├── rubber/        (10 files)  <- Intake, Profile, Export, Settlement
│   │   ├── wms/           (23 files)  <- Stock, QC, Production, Blending
│   │   └── (root)         (57 files)  <- HR, Task, Purchasing, etc.
│   ├── stores/             (3 files)  <- authStore, evaluationStore, partnerAuthStore
│   └── types/             (10 files)  <- B2B, Task, PO, WMS types
├── apps/
│   └── weighbridge/                   <- App Tram Can (standalone)
│       └── src/
│           ├── App.tsx                <- 4 routes
│           ├── pages/     (4 files)   <- Login, Home, Weighing, Print
│           ├── components/(2 files)   <- CameraPanel, ScaleSettings
│           └── stores/                <- authStore (PIN-based)
├── docs/                              <- Tai lieu & specs
│   ├── migrations/        (6 SQL files)
│   └── *.md              (12 files)   <- Specs, guides, roadmaps
└── package.json
```

### 2.2 Kien truc Frontend

```
                    +-------------------+
                    |    BrowserRouter   |
                    +--------+----------+
                             |
                    +--------v----------+
                    |   AuthInitializer  |
                    +--------+----------+
                             |
              +--------------+--------------+
              |                             |
     +--------v--------+          +--------v--------+
     |   PublicRoute    |          |  ProtectedRoute  |
     |  (/login)        |          |  (/ + all routes) |
     +-----------------+          +--------+---------+
                                           |
                                  +--------v--------+
                                  |   MainLayout     |
                                  | (Sidebar+Content)|
                                  +--------+---------+
                                           |
                          +----------------+----------------+
                          |        |        |        |      |
                        /b2b    /wms    /rubber  /projects  /purchasing  ...
```

### 2.3 Backend (Supabase)

```
+-----------------------------------------------------------------+
|                     SUPABASE PROJECT                              |
|                                                                   |
|  +------------------+  +------------------+  +-----------------+ |
|  |  PostgreSQL DB   |  |  Auth (GoTrue)   |  |  Storage        | |
|  |  - public schema |  |  - Email/Pass    |  |  - Avatars      | |
|  |  - b2b schema    |  |  - Row-level     |  |  - Attachments  | |
|  |  - 50+ tables    |  |    security      |  |  - Weighbridge  | |
|  +------------------+  +------------------+  |    images       | |
|                                               +-----------------+ |
|  +------------------+  +------------------+                      |
|  |  Realtime        |  |  Edge Functions  |                      |
|  |  - Chat messages |  |  - (reserved)    |                      |
|  |  - Notifications |  |                  |                      |
|  +------------------+  +------------------+                      |
+-----------------------------------------------------------------+
```

---

## 3. MODULE B2B THU MUA (Phase E0 - E5 + Phase 4-6)

### 3.1 Tong quan

Module B2B phuc vu quy trinh thu mua mu cao su tu dai ly/nong dan, bao gom chat real-time, booking, deals, tam ung, cong no va quyet toan.

### 3.2 Cac Phase da hoan thanh

| Phase | Ten | Mo ta | Status |
|-------|-----|-------|--------|
| E0 | Chat Infrastructure | Supabase Realtime, schema b2b, chat_rooms, chat_messages | ✅ 100% |
| E1 | Tao & Gui Booking | BookingFormModal 2 chieu, BookingCard trong chat, 5 loai mu | ✅ 100% |
| E2 | Thuong luong & Xac nhan | Counter-offer, ConfirmDealModal + tam ung, DealCard | ✅ 100% |
| E3 | Tao Deal chinh thuc | Deal CRUD, status flow, AddAdvanceModal, RecordDeliveryModal | ✅ 100% |
| E4 | Deal <-> WMS Integration | stock_in lien ket deal_id, QC -> update DRC, chat notification | ✅ 100% |
| E5 | Cong no & Quyet toan | Ledger, Settlement pages, auto-settlement service, DRC variance | ⚠️ 75% |
| Phase 4 | Nhu cau mua (Demands) | DemandListPage, DemandCreatePage, DemandDetailPage | ✅ 100% |
| Phase 5 | Partners Management | PartnerListPage, PartnerDetailPage, tier system | ✅ 100% |
| Phase 6 | Deal -> San xuat | DealProductionTab, traceability, dealProductionService | ⚠️ Partial |

### 3.3 Luong du lieu B2B end-to-end

```
Dai ly gui Booking (qua Chat/Portal)
    |
    v
Nha may xac nhan / thuong luong gia
    |
    v
Tao Deal chinh thuc (+ tam ung lan 1)
    |
    v
Dai ly giao mu -> Tram can (weighbridge)
    |
    v
Nhap kho (Stock-In) lien ket deal_id
    |
    v
QC kiem tra DRC thuc te
    |
    v
Tinh gia tri thuc (actual_weight x actual_drc x unit_price)
    |
    v
Quyet toan (Settlement) = Gia tri thuc - Tong tam ung
    |
    v
Thanh toan so du con lai
```

### 3.4 Components B2B (22 files)

| File | Chuc nang |
|------|-----------|
| BookingFormModal.tsx | Form tao phieu chot mu (2 chieu) |
| ConfirmDealModal.tsx | Xac nhan deal + tam ung + vung thu mua |
| DealCard.tsx | Hien thi deal trong chat |
| AddAdvanceModal.tsx | Modal ung them tien |
| RecordDeliveryModal.tsx | Ghi nhan giao hang |
| ChatInput.tsx | Chat input + attachments |
| ChatMessageBubble.tsx | Bong bong tin nhan |
| ChatRoomCard.tsx | Preview phong chat |
| ChatRoomHeader.tsx | Header phong chat |
| ChatAttachmentUpload.tsx | Upload file |
| ChatAttachmentMenu.tsx | Menu chon loai file |
| EmojiPickerPopover.tsx | Chon emoji |
| VoiceRecorder.tsx | Ghi am giong noi |
| DealWmsTab.tsx | Tab nhap kho trong DealDetail |
| DealQcTab.tsx | Tab QC trong DealDetail |
| DealAdvancesTab.tsx | Tab tam ung trong DealDetail |
| DealProductionTab.tsx | Tab san xuat trong DealDetail |
| DrcVarianceCard.tsx | Card phan tich chenh lech DRC |
| ApprovalTimeline.tsx | Timeline duyet quyet toan |
| LedgerBalanceCard.tsx | Card so du cong no |
| PaymentForm.tsx | Form thanh toan |
| SettlementItemsTable.tsx | Bang chi tiet quyet toan |

### 3.5 Services B2B (17 files)

| File | Chuc nang |
|------|-----------|
| chatMessageService.ts | CRUD tin nhan + booking qua chat |
| chatRoomService.ts | CRUD phong chat |
| chatAttachmentService.ts | Upload/download file |
| dealConfirmService.ts | Xac nhan deal (6 buoc) |
| dealChatActionsService.ts | Ung them + giao hang tu chat |
| dealService.ts | Deal CRUD + status transitions |
| dealWmsService.ts | Cau noi Deal <-> WMS (9 methods) |
| dealProductionService.ts | Lien ket Deal -> San xuat |
| advanceService.ts | CRUD tam ung |
| ledgerService.ts | So cong no |
| settlementService.ts | Quyet toan CRUD |
| autoSettlementService.ts | Tu dong tao quyet toan |
| drcVarianceService.ts | Phan tich chenh lech DRC |
| paymentService.ts | Ghi nhan thanh toan |
| partnerService.ts | Quan ly dai ly |
| demandService.ts | Nhu cau mua CRUD |
| b2bDashboardService.ts | Dashboard B2B |

### 3.6 Cach tao Deal (3 cach)

| Cach | Mo ta | Tu |
|------|-------|----|
| 1. Tu Chat | Gui Booking -> Xac nhan -> Tao Deal | B2BChatRoomPage |
| 2. Tu Demand | Tao nhu cau mua -> Convert thanh Deal | DemandDetailPage |
| 3. Thu cong | Tao Deal truc tiep | DealCreatePage |

---

## 4. MODULE WMS / KHO (P1 - P10) - HOAN THANH 100%

### 4.1 Tong quan Phases

| Phase | Ten | Chi tiet | Status |
|-------|-----|----------|--------|
| P1 | Database + Types | Schema, types, base services | ✅ |
| P2 | Danh muc | Materials, Warehouses, Locations | ✅ |
| P3 | Nhap kho (Stock-In) | Tao phieu nhap, confirm, QR scan phieu can | ✅ |
| P4 | Xuat kho (Stock-Out) | Tao phieu xuat, Picking List, confirm | ✅ |
| P5 | Ton kho & Canh bao | Inventory dashboard, alerts, stock check | ✅ |
| P6 | QC / DRC Tracking | QC dashboard, recheck, standards config, batch history | ✅ |
| P7 | Tram can (Weighbridge) | Tich hop vao ERP, danh sach phieu can, chi tiet | ✅ |
| P8 | Lenh san xuat & BOM | Production orders, 5 cong doan, facilities, specs | ✅ |
| P9 | Phoi tron (Blending) | Blend orders, goi y tron DRC, simulate | ✅ |
| P10 | Bao cao | Dashboard WMS, stock movement, supplier quality, inventory value | ✅ |

### 4.2 Pages WMS (36 files)

```
/wms                           <- InventoryDashboard (tong quan ton kho)
/wms/materials                 <- Danh muc vat lieu
/wms/warehouses                <- Danh sach kho
/wms/warehouses/:id/locations  <- Vi tri trong kho

/wms/stock-in                  <- Danh sach phieu nhap
/wms/stock-in/new              <- Tao phieu nhap moi
/wms/stock-in/:id              <- Chi tiet phieu nhap

/wms/stock-out                 <- Danh sach phieu xuat
/wms/stock-out/new             <- Tao phieu xuat moi
/wms/stock-out/:id             <- Chi tiet phieu xuat
/wms/stock-out/:id/pick        <- Picking List

/wms/inventory/:materialId    <- Chi tiet ton kho theo vat lieu
/wms/alerts                    <- Canh bao ton kho
/wms/stock-check               <- Kiem ke

/wms/qc                        <- QC Dashboard
/wms/qc/recheck                <- QC Recheck (kiem tra lai DRC)
/wms/qc/standards              <- Cau hinh tieu chuan QC
/wms/qc/batch/:batchId         <- Lich su QC theo lo

/wms/weighbridge               <- Man hinh can (embedded)
/wms/weighbridge/list           <- Danh sach phieu can
/wms/weighbridge/:id            <- Chi tiet phieu can

/wms/production                <- Danh sach lenh san xuat
/wms/production/dashboard      <- Dashboard san xuat
/wms/production/new            <- Tao lenh san xuat
/wms/production/:id            <- Chi tiet lenh SX
/wms/production/:id/stage/:n   <- Cong doan san xuat
/wms/production/:id/output     <- San pham dau ra
/wms/production/facilities     <- Quan ly day chuyen
/wms/production/specs          <- Cong thuc BOM

/wms/blending                  <- Danh sach phoi tron
/wms/blending/new              <- Tao lenh phoi tron
/wms/blending/suggest          <- Goi y phoi tron (simulator)
/wms/blending/:id              <- Chi tiet phoi tron

/wms/reports                   <- Dashboard bao cao WMS
/wms/reports/stock-movement    <- Bao cao xuat nhap ton
/wms/reports/supplier-quality  <- Bao cao chat luong NCC
/wms/reports/inventory-value   <- Bao cao gia tri ton kho
```

### 4.3 Services WMS (23 files)

| Service | Chuc nang |
|---------|-----------|
| stockInService.ts | Nhap kho CRUD + confirm + link deal |
| stockOutService.ts | Xuat kho CRUD + confirm |
| pickingService.ts | Picking list logic |
| inventoryService.ts | Ton kho + dashboard data |
| alertService.ts | Canh bao ton kho |
| stockCheckService.ts | Kiem ke |
| batchService.ts | Quan ly lo hang |
| qcService.ts | QC + DRC tracking |
| weighbridgeService.ts | Phieu can CRUD |
| weighbridgeImageService.ts | Quan ly anh camera |
| productionService.ts | Lenh san xuat + tracking |
| blendingService.ts | Phoi tron + simulator |
| wmsMaterialService.ts | Danh muc vat lieu WMS |
| materialCategoryService.ts | Nhom vat lieu |
| warehouseService.ts | Quan ly kho |
| warehouseLocationService.ts | Vi tri kho |
| rubberGradeService.ts | Grade SVR |
| weightTrackingService.ts | Theo doi trong luong |
| rawMaterialReceivingService.ts | Nhan NVL |
| traceabilityService.ts | Truy xuat nguon goc |
| wmsReportService.ts | Bao cao WMS |
| wms.types.ts | TypeScript types |
| index.ts | Barrel exports |

### 4.4 Quy trinh san xuat (5 cong doan)

```
+----------+     +----------+     +----------+     +----------+     +----------+
|  1. RUA  | --> |  2. CAN  | --> |  3. SAY  | --> |  4. EP   | --> |  5. QC   |
| (Washing)|     | (Creeping)|    | (Drying) |     | (Pressing)|    | (Quality)|
|          |     |          |     |          |     |          |     |          |
| 3h       |     | 4h       |     | 10 ngay  |     | 3h       |     | DRC,     |
| nuoc 1.5x|     |          |     | 65*C     |     |          |     | Grade    |
+----------+     +----------+     +----------+     +----------+     +----------+
```

---

## 5. APP TRAM CAN (can.huyanhrubber.vn)

### 5.1 Tong quan

App doc lap chay tren trinh duyet tai tram can, chuyen can mu cao su.

### 5.2 Dac diem

| Tinh nang | Chi tiet |
|-----------|----------|
| Dang nhap | PIN-based (scale_operators table) |
| Ket noi can | Web Serial API - Dau can Keli XK3118T1-A3 |
| Camera | Dahua IP cameras (3 cam) qua proxy |
| Auto-capture | Tu dong chup anh khi ghi can |
| In phieu | 3 format: A4, 80mm thermal, 58mm thermal |
| QR Code | Tren phieu can, dung de scan khi nhap kho |
| Deal link | Auto-fill tu Deal B2B |
| Realtime | ERP thay phieu can ngay lap tuc |

### 5.3 Routes (4 pages)

| Route | Page | Chuc nang |
|-------|------|-----------|
| /login | LoginPage | Dang nhap bang PIN |
| / | HomePage | Dashboard + DS phieu hom nay |
| /weigh | WeighingPage | Man hinh can chinh |
| /weigh/:ticketId | WeighingPage | Can lan 2 (tru bi) |
| /print/:ticketId | PrintPage | In phieu can |

### 5.4 Tech Stack (Weighbridge)

| Thanh phan | Cong nghe |
|------------|-----------|
| Framework | React 18 + Vite 7 |
| UI | Ant Design 6 |
| Language | TypeScript 5.8 |
| Backend | Supabase (cung project) |
| State | Zustand 5 |
| Date | Day.js |

---

## 6. MODULE NHAN SU (HRM)

### 6.1 Danh sach pages

| Route | Page | Chuc nang |
|-------|------|-----------|
| /departments | DepartmentListPage | Phong ban |
| /positions | PositionListPage | Chuc vu |
| /employees | EmployeeListPage | Nhan vien |
| /contract-types | ContractTypeListPage | Loai hop dong |
| /contracts | ContractListPage | Hop dong lao dong |
| /leave-types | LeaveTypeListPage | Loai nghi phep |
| /leave-requests | LeaveRequestListPage | Don nghi phep |
| /leave-approvals | LeaveApprovalPage | Duyet nghi phep |
| /attendance | AttendanceListPage | Bang cham cong |
| /attendance/monthly | MonthlyTimesheetPage | Cham cong thang |
| /shifts | ShiftListPage | Quan ly ca |
| /shift-assignments | ShiftCalendarPage | Phan ca (calendar) |
| /shift-teams | TeamManagementPage | Doi ca (2 doi x 3 ca) |
| /overtime | OvertimeListPage | Tang ca |
| /overtime/approval | OvertimeApprovalPage | Duyet tang ca |
| /salary-grades | SalaryGradeListPage | Bac luong |
| /payroll-periods | PayrollPeriodListPage | Ky luong |
| /payslips | PayslipListPage | Phieu luong |
| /performance-criteria | PerformanceCriteriaListPage | Tieu chi danh gia |
| /performance-reviews | PerformanceReviewListPage | Danh gia nhan vien |

---

## 7. MODULE QUAN LY CONG VIEC & DU AN

### 7.1 Task Management

| Route | Page | Chuc nang |
|-------|------|-----------|
| /tasks | TaskListPage | Danh sach cong viec |
| /tasks/create | TaskCreatePage | Tao cong viec |
| /tasks/:id | TaskViewPage | Xem chi tiet |
| /tasks/:id/edit | TaskEditPage | Sua cong viec |
| /my-tasks | MyTasksPage | Cong viec cua toi |
| /approvals | ApprovalsPage | Phe duyet |
| /self-evaluation | SelfEvaluationPage | Tu danh gia |
| /reports/tasks | TaskReportsPage | Bao cao cong viec |

### 7.2 Project Management

| Route | Page | Chuc nang |
|-------|------|-----------|
| /projects/list | ProjectListPage | Danh sach du an |
| /projects/new | ProjectCreatePage | Tao du an |
| /projects/:id | ProjectDetailPage | Chi tiet du an |
| /projects/:id/gantt | ProjectGanttPage | Gantt chart du an |
| /projects/gantt | MultiProjectGanttPage | Gantt tong hop |
| /projects/:id/resources | ProjectResourcePage | Nguon luc du an |
| /projects/resources | CapacityPlanningPage | Hoach dinh nguon luc |
| /projects/categories | ProjectCategoryPage | Loai du an |
| /projects/templates | ProjectTemplateList | Templates |

---

## 8. MODULE MUA HANG (Purchasing)

### 8.1 Pages

| Route | Page | Chuc nang |
|-------|------|-----------|
| /purchasing/suppliers | SupplierListPage | NCC |
| /purchasing/suppliers/new | SupplierCreatePage | Tao NCC |
| /purchasing/suppliers/:id | SupplierDetailPage | Chi tiet NCC |
| /purchasing/categories | CategoryListPage | Nhom vat tu |
| /purchasing/types | TypeListPage | Loai vat tu |
| /purchasing/units | UnitListPage | Don vi tinh |
| /purchasing/materials | MaterialListPage | Vat tu |
| /purchasing/materials/:id | MaterialDetailPage | Chi tiet vat tu |
| /purchasing/variant-attributes | VariantAttributeManagement | Thuoc tinh bien the |
| /purchasing/orders | POListPage | Don dat hang |
| /purchasing/orders/new | POFormPage | Tao DDH |
| /purchasing/orders/:id | PODetailPage | Chi tiet DDH |
| /purchasing/invoices/:id | InvoiceDetailPage | Chi tiet hoa don |
| /purchasing/debt | SupplierDebtPage | Cong no NCC |
| /purchasing/payments | PaymentListPage | Lich su thanh toan |
| /purchasing/access | AccessManagementPage | Phan quyen (BGD only) |
| /purchasing/reports | PurchaseReportPage | Bao cao mua hang |

---

## 9. MODULE THU MUA MU (Rubber)

### 9.1 Pages

| Route | Page | Chuc nang |
|-------|------|-----------|
| /rubber/suppliers | RubberSupplierListPage | NCC mu |
| /rubber/suppliers/new | RubberSupplierFormPage | Tao NCC mu |
| /rubber/suppliers/:id | RubberSupplierDetailPage | Chi tiet NCC mu |
| /rubber/intake | RubberIntakeListPage | Danh sach nhap mu |
| /rubber/intake/:id | RubberIntakeDetailPage | Chi tiet nhap mu |
| /rubber/daily-report | RubberDailyReportPage | Bao cao ngay |
| /rubber/debt | RubberDebtPage | Cong no NCC mu |
| /rubber/vn/batches | VnBatchListPage | Lo mu Viet Nam |
| /rubber/lao/transfers | LaoTransferPage | Chuyen tien Lao |
| /rubber/lao/purchases | LaoPurchasePage | Mua mu Lao |
| /rubber/lao/shipments | LaoShipmentPage | Van chuyen Lao |
| /rubber/profiles | RubberProfilePage | Ly lich mu |
| /rubber/settlements | SettlementPage | Quyet toan mu |
| /rubber/dashboard | RubberDashboard | Dashboard thu mua |

---

## 10. DAC THU NGANH CAO SU

### 10.1 DRC (Dry Rubber Content) Tracking

DRC la chi so quan trong nhat trong nganh cao su - ty le mu kho trong mu tuoi.

```
DRC Flow:
  Booking (expected_drc: 55%)
      |
      v
  Deal (expected_drc: 55%, unit_price: 35,000 VND/kg kho)
      |
      v
  Can xe (gross - tare = net weight: 5,000 kg uot)
      |
      v
  QC kiem tra (actual_drc: 52%)
      |
      v
  Tinh gia tri:
    Khoi luong kho = 5,000 x 52% = 2,600 kg
    Gia tri = 2,600 x 35,000 = 91,000,000 VND
      |
      v
  So sanh voi du kien:
    Du kien: 5,000 x 55% x 35,000 = 96,250,000 VND
    Chenh lech: -5,250,000 VND (-5.45%)
```

### 10.2 Phan loai SVR (Standard Vietnamese Rubber)

| Grade | DRC Min | Ung dung | Mau sac |
|-------|---------|----------|---------|
| SVR 3L | 60%+ | Xuat khau cao cap | Xanh la |
| SVR 5 | 55%+ | Xuat khau | Xanh nhat |
| SVR 10 | 50%+ | Tieu chuan | Vang |
| SVR 20 | 45%+ | Tieu chuan thap | Do |
| SVR CV60 | 60%+ | Dac biet (do nhat khong doi) | Tim |

### 10.3 Loai mu cao su

| Loai | Ten TV | Mo ta |
|------|--------|-------|
| mu_dong | Mu dong | Mu latex dong tu nhien |
| mu_nuoc | Mu nuoc | Mu latex tuoi |
| mu_tap | Mu tap | Mu tap chat |
| mu_chen | Mu chen | Mu trong chen |
| mu_to | Mu to | Mu can thanh to |
| cup_lump | Mu chen | Cup lump |
| latex | Mu nuoc | Latex dang long |
| sheet | Mu to | Rubber sheet |
| crepe | Mu crepe | Crepe rubber |
| mixed | Hon hop | Mu hon hop |

### 10.4 Cac chi so dac thu

| Chi so | Mo ta | Don vi |
|--------|-------|--------|
| DRC | Ty le mu kho | % |
| TSC | Tong chat ran | % |
| Ash | Ham luong tro | % |
| Volatile | Ham luong bay hoi | % |
| PRI | Chi so duy tri do deo | % |
| P0 | Do deo ban dau | MU |
| Mooney Viscosity | Do nhat Mooney | MU |
| Weight Loss | Hao hut trong luong | % |
| Contamination | Tap chat | clean/suspected/confirmed/cleared |

---

## 11. THONG KE CODE

### 11.1 So luong files

| Loai | So luong |
|------|----------|
| Pages (.tsx) | 91 files |
| Components (.tsx) | 81 files |
| Services (.ts) | 124 files |
| Type definitions (.ts) | 10 files |
| Stores (.ts) | 3 files |
| SQL Migrations (docs) | 6 files |
| Docs (.md) | 12 files |
| **Tong cong (src/)** | **~309 files** |

### 11.2 Phan bo theo module

| Module | Pages | Components | Services |
|--------|-------|------------|----------|
| B2B Thu mua | 16 | 22 | 17 |
| WMS / Kho | 36 | 8 | 23 |
| HR / Nhan su | 20 | - | 15 |
| Projects | 11 | 11 | 17 |
| Purchasing | 17 | 35 (in features) | 10 |
| Tasks / Evaluations | 8 | 9 | 12 |
| Rubber (thu mua) | 7 | - | 10 |
| Common / UI | - | 15 | - |
| App Can Xe | 4 | 2 | (shared) |

### 11.3 Tong routes

| App | So routes |
|-----|-----------|
| ERP Main | ~120 routes |
| Weighbridge | 4 routes |
| **Tong** | **~124 routes** |

---

## 12. DATABASE SCHEMA

### 12.1 Schema `public` (ERP chinh)

| Bang | Mo ta | Module |
|------|-------|--------|
| employees | Nhan vien | HR |
| departments | Phong ban | HR |
| positions | Chuc vu | HR |
| contracts | Hop dong lao dong | HR |
| contract_types | Loai hop dong | HR |
| leave_types | Loai nghi phep | HR |
| leave_requests | Don nghi phep | HR |
| attendance_records | Cham cong | HR |
| shifts | Ca lam viec | HR |
| shift_assignments | Phan ca | HR |
| shift_teams | Doi ca | HR |
| overtime_requests | Yeu cau tang ca | HR |
| salary_grades | Bac luong | HR |
| payroll_periods | Ky luong | HR |
| payslips | Phieu luong | HR |
| performance_criteria | Tieu chi danh gia | HR |
| performance_reviews | Danh gia | HR |
| tasks | Cong viec | Tasks |
| task_assignments | Phan cong | Tasks |
| task_comments | Binh luan | Tasks |
| task_attachments | Dinh kem | Tasks |
| task_activities | Lich su | Tasks |
| evaluations | Danh gia cong viec | Tasks |
| projects | Du an | Projects |
| project_phases | Giai doan | Projects |
| project_tasks | Cong viec DA | Projects |
| project_milestones | Moc | Projects |
| project_risks | Rui ro | Projects |
| project_documents | Tai lieu | Projects |
| project_categories | Loai DA | Projects |
| project_templates | Templates | Projects |
| suppliers | Nha cung cap | Purchasing |
| material_categories | Nhom vat tu | Purchasing |
| material_types | Loai vat tu | Purchasing |
| materials | Vat tu | Purchasing |
| material_variants | Bien the | Purchasing |
| purchase_orders | Don dat hang | Purchasing |
| purchase_order_items | Chi tiet DDH | Purchasing |
| supplier_invoices | Hoa don | Purchasing |
| invoice_payments | Thanh toan | Purchasing |
| purchase_access | Phan quyen | Purchasing |
| wms_materials | Vat lieu WMS | WMS |
| wms_material_categories | Nhom VL WMS | WMS |
| warehouses | Kho hang | WMS |
| warehouse_locations | Vi tri kho | WMS |
| stock_in_orders | Phieu nhap | WMS |
| stock_in_details | Chi tiet nhap | WMS |
| stock_out_orders | Phieu xuat | WMS |
| stock_out_details | Chi tiet xuat | WMS |
| stock_batches | Lo hang | WMS |
| stock_alerts | Canh bao | WMS |
| weighbridge_tickets | Phieu can | WMS |
| weighbridge_images | Anh can | WMS |
| batch_qc_results | Ket qua QC | WMS |
| qc_standards | Tieu chuan QC | WMS |
| production_orders | Lenh san xuat | WMS/P8 |
| production_stages | Cong doan SX | WMS/P8 |
| production_inputs | NVL dau vao SX | WMS/P8 |
| production_outputs | San pham dau ra | WMS/P8 |
| production_facilities | Day chuyen | WMS/P8 |
| production_material_specs | BOM | WMS/P8 |
| blend_orders | Lenh phoi tron | WMS/P9 |
| blend_items | Chi tiet phoi tron | WMS/P9 |
| rubber_suppliers | NCC mu | Rubber |
| rubber_intakes | Nhap mu | Rubber |
| rubber_intake_batches | Lo nhap mu | Rubber |
| rubber_daily_reports | Bao cao ngay | Rubber |
| scale_operators | NV tram can | Weighbridge |
| notifications | Thong bao | System |

### 12.2 Schema `b2b` (B2B Module)

| Bang | Mo ta |
|------|-------|
| partners | Dai ly / Doi tac |
| partner_users | Nguoi dung dai ly (Portal) |
| chat_rooms | Phong chat |
| chat_messages | Tin nhan |
| chat_participants | Thanh vien phong |
| chat_attachments | File dinh kem |
| deals | Giao dich |
| deal_advances | Tam ung |
| deal_deliveries | Giao hang |
| demands | Nhu cau mua |
| ledger_entries | But toan cong no |
| settlements | Quyet toan |
| settlement_items | Chi tiet quyet toan |
| payments | Thanh toan |
| pickup_locations | Dia diem chot hang |

### 12.3 Quan he chinh

```
                    +----------------+
                    |   employees    |
                    +-------+--------+
                            |
              +-------------+-------------+
              |             |             |
     +--------v----+  +----v------+  +---v----------+
     | departments |  | positions |  | contracts    |
     +-------------+  +-----------+  +--------------+

     +----------+     +--------+     +----------+
     | partners |---->| deals  |---->| stock_in |
     +----------+     +---+----+     +-----+----+
          |               |               |
     +----v-------+  +----v--------+  +---v---------+
     | chat_rooms |  | advances    |  | stock_batch  |
     +----+-------+  +-------------+  +---+----------+
          |                                |
     +----v---------+               +------v--------+
     | chat_messages|               | qc_results    |
     +--------------+               +---------------+

     +----------+     +-----------+     +----------+
     | suppliers|---->| PO orders |---->| invoices |
     +----------+     +-----------+     +-----+----+
                                              |
                                        +-----v----+
                                        | payments |
                                        +----------+

     +------------+     +----------+     +--------+
     | production |---->| stages   |---->| output |
     | orders     |     | (1-5)    |     | (TP)   |
     +------+-----+     +----------+     +--------+
            |
     +------v-----+
     | blend_orders|
     +-------------+
```

---

## 13. TINH NANG NOI BAT

### 13.1 Real-time Chat B2B
- Supabase Realtime subscription cho tin nhan moi
- Gui booking, deal card truc tiep trong chat
- Attachment: hinh anh, file, audio (ghi am)
- Emoji picker
- Badge so tin chua doc tren Sidebar

### 13.2 Auto Settlement
- Tu dong tao quyet toan khi Deal settled
- Gom tat ca stock-in confirmations thuoc Deal
- Tinh: actual_weight x (actual_drc/100) x unit_price = final_value
- Tru tong tam ung da chi

### 13.3 DRC Variance Analysis
- So sanh DRC du kien vs thuc te
- Tinh chenh lech gia tri
- DrcVarianceCard hien thi truc quan
- drcVarianceService xu ly logic

### 13.4 Truy xuat nguon goc (Traceability)
- Deal -> Stock-In NVL -> Production Order -> Stock-In TP
- TraceabilityTree component hien thi cay truy xuat
- traceabilityService truy van data

### 13.5 Web Serial API (Ket noi can)
- Ket noi truc tiep dau can Keli XK3118T1-A3
- Doc du lieu serial qua trinh duyet (Chrome/Edge)
- Hien thi so can real-time
- ScaleSettings cho phep cau hinh baud rate, parity...

### 13.6 Camera IP Integration
- 3 camera Dahua (cam truoc, cam sau, cam tren)
- Ket noi qua proxy server
- Auto-capture khi ghi can
- Luu anh vao Supabase Storage

### 13.7 QR Code tren phieu can
- QR code chua ma phieu can (CX-YYYYMMDD-XXX)
- Dung de scan khi nhap kho (nhanh hon nhap thu cong)
- In kem tren phieu can

### 13.8 Multi-format Printing
- A4 (phieu can day du)
- 80mm thermal (phieu can tom tat)
- 58mm thermal (phieu can mini)
- PDF export

### 13.9 Phan quyen da cap
- Admin: Toan quyen
- Executive (level 1-3): Quan ly cao cap
- Manager: Quan ly phong ban
- Staff: Nhan vien thuong
- B2B Purchaser: Chi dinh theo email (khuyennt@, duyhh@)
- Purchase Access: Phan quyen rieng cho module mua hang
- Scale Operator: Dang nhap bang PIN cho tram can

### 13.10 Export Data
- Excel (ExcelJS): Cham cong thang, bao cao
- PDF (jsPDF): Phieu can, phieu nhap/xuat
- XLSX: Import/export du lieu

### 13.11 Gantt Chart
- Bieu do Gantt cho du an
- Multi-project Gantt (tong hop nhieu DA)
- Dependencies giua cong viec
- Resource allocation + overallocation alerts

### 13.12 Blending Simulator
- Goi y phoi tron lot mu de dat DRC muc tieu
- Tinh toan ty le phoi tron toi uu
- Simulate ket qua truoc khi thuc hien

---

## 14. ROADMAP TIEP THEO

### 14.1 Uu tien cao

| STT | Hang muc | Mo ta | Uoc tinh |
|-----|----------|-------|----------|
| 1 | Phase 5 hoan thien | Settlement approval workflow (Draft->Pending->Approved->Paid) | 1-2 ngay |
| 2 | Phase 6 lien ket | Deal -> Production Order (chon NVL tu stock-in) | 1 ngay |
| 3 | Truy xuat end-to-end | Deal -> Stock-In -> Production -> Thanh pham | 1 ngay |
| 4 | Portal notification | Dai ly thay quyet toan tren Partner Portal | 1 ngay |

### 14.2 Cai thien UX

| STT | Hang muc | Mo ta |
|-----|----------|-------|
| 1 | PDF export | Export Deals, Settlements, Reports ra PDF |
| 2 | Mobile responsive | Toi uu B2B pages cho mobile |
| 3 | Dashboard analytics | Bieu do phan tich xu huong gia, DRC, san luong |
| 4 | Batch operations | Duyet nhieu deal/settlement cung luc |

### 14.3 Tinh nang moi (tuong lai)

| STT | Hang muc | Mo ta |
|-----|----------|-------|
| 1 | B2B Portal hoan thien | App Portal rieng cho dai ly |
| 2 | GPS tracking | Theo doi xe van chuyen |
| 3 | AI DRC prediction | Du doan DRC dua tren lich su |
| 4 | Financial reports | Bao cao tai chinh tong hop |
| 5 | Multi-factory | Ho tro nhieu nha may |
| 6 | Mobile app (React Native) | App mobile cho nhan vien |

---

## 15. TOM TAT

### Du an Huy Anh Rubber ERP v8 da xay dung:

- **7 module chinh:** HR, Tasks, Projects, Purchasing, B2B, WMS, Rubber
- **3 ung dung:** ERP Main, B2B Portal, Tram Can
- **~124 routes** tren tong cong 2 apps
- **~309 files** TypeScript/React (pages + components + services)
- **~70+ bang database** tren 2 schema (public + b2b)
- **Tich hop phan cung:** Can dien tu (Web Serial), Camera IP (Dahua)
- **Real-time:** Chat B2B, notifications, can xe
- **Export:** PDF, Excel, QR Code, in nhiet

### Tinh trang hien tai (20/03/2026):

```
HR Module:          ████████████████████████████████████████████████  100% ✅
Tasks Module:       ████████████████████████████████████████████████  100% ✅
Projects Module:    ████████████████████████████████████████████████  100% ✅
Purchasing Module:  ████████████████████████████████████████████████  100% ✅
WMS Module (P1-10): ████████████████████████████████████████████████  100% ✅
App Can Xe:         ████████████████████████████████████████████████  100% ✅
Rubber Module:      ████████████████████████████████████████████████  100% ✅
B2B Module:         ████████████████████████████████████████░░░░░░░░  80%  ⚠️
B2B Portal:         ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  25%  🔲
```

---

*Tai lieu nay duoc tao tu dong bang phan tich ma nguon.*
*Huy Anh Rubber ERP v8 — Comprehensive Project Analysis*
*Ngay: 20/03/2026*
