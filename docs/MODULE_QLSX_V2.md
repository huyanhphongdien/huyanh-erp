# MODULE QUẢN LÝ SẢN XUẤT (MES) — V2
## Huy Anh Rubber ERP — Thiết kế chuyên nghiệp theo chuẩn MES

> **Ngày:** 11/04/2026  
> **Truy cập:** Chỉ minhld@huyanhrubber.com  
> **Tham khảo:** Tulip MES, MachineMetrics, MESX (VN), Hưng Thịnh Rubber, Việt Trung, VRG, TCVN 3769  
> **Phiên bản:** 2.0 (cập nhật từ MODULE_QLSX_PLAN.md + nghiên cứu ngành)

---

## 1. KIẾN TRÚC MES

```
┌─────────────────────────────────────────────────────────────┐
│                    MES HUY ANH RUBBER                       │
├─────────────┬──────────────────┬────────────────────────────┤
│   PLAN      │     EXECUTE      │        ANALYZE             │
│   (Lập KH)  │   (Thực thi)     │      (Phân tích)           │
│             │                  │                            │
│ Lệnh SX    │ Live Board (TV)  │ OEE Dashboard              │
│ BOM/Recipe  │ 10-Step Tracker  │ Downtime Pareto            │
│ NVL Check   │ Operator Log     │ Yield Analysis             │
│ Scheduling  │ QC Inline        │ NVL Variance               │
│ (có sẵn)    │ Downtime Record  │ Shift Reports              │
│             │ Shift Handover   │ Traceability               │
│             │                  │ SOP Compliance             │
├─────────────┴──────────────────┴────────────────────────────┤
│                    FOUNDATION                                │
│  WMS (có sẵn) │ QC (có sẵn) │ B2B (có sẵn) │ HR (có sẵn)  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. QUY TRÌNH 10 CÔNG ĐOẠN SVR

### 2.1 Sơ đồ theo loại nguyên liệu

```
MỦ NƯỚC (Latex → SVR 3L, CV50/60)     MỦ TẠP (đông/chén/dây → SVR 10, 20)
         │                                        │
         ▼                                        ▼
┌─────────────────┐                    ┌─────────────────┐
│ 1. TIẾP NHẬN    │                    │ 1. TIẾP NHẬN    │
│ Xe bồn + NH₃    │                    │ Cân + phân loại │
│ Cân Gross/Tare  │                    │ Nhặt rác        │
│ Lấy mẫu DRC    │                    │ Lấy mẫu DRC    │
└────────┬────────┘                    └────────┬────────┘
         │                                      │
         ▼                                      ▼
┌─────────────────┐                    ┌─────────────────┐
│ 2. XỬ LÝ SƠ BỘ │                    │ 2. Ủ MỦ         │
│ Rây 40 mesh     │                    │ ≥10 ngày        │
│ Hồ khuấy       │                    │ Tưới 2 lần/ngày │
└────────┬────────┘                    └────────┬────────┘
         │                                      │
         ▼                                      │
┌─────────────────┐                              │
│ 3. PHA TRỘN     │◄─────────────────────────────┘
│ DRC → 20-30%    │
│ Na₂S₂O₅ 0.1-0.6│
│ kg/tấn          │
└────────┬────────┘
         ▼
┌───────────────────────────────────────────────────┐
│ 4. ĐÁNH ĐÔNG                                      │
│ Acid Formic/Acetic 0.3-5%  │  pH 5-5.5            │
│ Thời gian: 8-24 giờ        │  Mương đánh đông     │
└────────────────────┬──────────────────────────────┘
                     ▼
              ┌─────────────┐
              │ 5. CÁN KÉO  │  Nhiều cấp máy cán
              │ Tấm ≤ 8mm   │  Crusher rollers
              └──────┬──────┘
                     ▼
              ┌─────────────┐
              │ 6. BĂM CỐM  │  Băm hạt + rửa 3 hồ
              │ Sàng rung    │  Phễu hút + chắt nước
              └──────┬──────┘
                     ▼
              ┌─────────────┐
              │ 7. SẤY       │  100-120°C
              │ 2 ngăn       │  3-4 giờ
              └──────┬──────┘
                     ▼
              ┌─────────────┐
              │ 8. ÉP BÀNH  │  33.33 hoặc 35 kg
              │ Làm nguội   │  670×330×170mm
              └──────┬──────┘
                     ▼
              ┌─────────────┐
              │ 9. QC        │  TCVN 3769
              │ DRC, PRI,    │  Mooney, tro, N₂
              │ bay hơi      │  Lovibond (3L)
              └──────┬──────┘
                     ▼
              ┌─────────────┐
              │10. ĐÓNG GÓI │  Bao PE + nhãn
              │   NHẬP KHO  │  Pallet → WMS
              └─────────────┘
```

### 2.2 Thông số kỹ thuật từng bước (form nhập liệu)

| Bước | Tên | Thông số cần ghi | Thiết bị | Thời gian |
|------|-----|-------------------|----------|-----------|
| 1 | Tiếp nhận NL | `gross_weight_kg`, `tare_weight_kg`, `net_weight_kg`, `drc_sample`, `vehicle_plate`, `driver`, `supplier` | Trạm cân Keli | 30-60 phút |
| 2 | Xử lý / Ủ mủ | `lot_count`, `soak_start_date`, `soak_days`, `spray_count`, `mesh_size` | Kho NL, rây | 10-15 ngày (tạp) |
| 3 | Pha trộn | `drc_before`, `drc_target`, `na2s2o5_kg`, `water_added_liters`, `mix_duration_min` | Hồ khuấy | 30-60 phút |
| 4 | Đánh đông | `acid_type` (formic/acetic), `acid_concentration_%`, `acid_volume_liters`, `ph_value`, `coagulation_hours` | Mương | 8-24 giờ |
| 5 | Cán kéo | `pass_count`, `final_thickness_mm`, `machine_id` | Máy cán Crusher | 2-4 giờ |
| 6 | Băm cốm | `crumb_size`, `wash_count`, `vibration_ok` | Máy băm, sàng rung | 1-2 giờ |
| 7 | Sấy | `temperature_c`, `duration_hours`, `dryer_zone` (1/2), `moisture_check` | Lò sấy | 3-4 giờ |
| 8 | Ép bành | `bale_weight_kg`, `bale_count`, `bale_dimensions`, `cooling_ok` | Máy ép thủy lực | 30 phút/lô |
| 9 | QC kiểm nghiệm | `drc_%`, `pri`, `mooney_ml`, `ash_%`, `volatile_%`, `nitrogen_%`, `lovibond` (3L), `dirt_%` | Phòng lab | 4-24 giờ |
| 10 | Đóng gói & Nhập kho | `package_type` (PE), `label_grade`, `pallet_id`, `pallet_count`, `total_weight_kg`, `stock_in_id` | Đóng gói | 1-2 giờ |

### 2.3 Sản phẩm đầu ra

| Loại SVR | Nguyên liệu | DRC chuẩn | Bành (kg) | Chỉ tiêu QC (TCVN 3769) |
|----------|-------------|-----------|-----------|--------------------------|
| SVR 3L | Mủ nước | 60-62% | 33.33 | Po ≤0.03, PRI ≥60, Lovibond ≤4.0 |
| SVR CV50/60 | Latex + phụ gia | 60%+ | 33.33 | Mooney ổn định 50/60 |
| SVR 10 | Mủ tạp | 57-63% | 33.33/35 | Po ≤0.10, PRI ≥50, Mooney 50-70 |
| SVR 20 | Mủ tạp pha trộn | 55-60% | 33.33/35 | Po ≤0.20, PRI ≥40, Mooney 50-70 |

---

## 3. THIẾT KẾ UX — 3 MÀN HÌNH CHÍNH

### 3.1 OPERATOR VIEW (Công nhân vận hành)

> Nguyên tắc: nút lớn ≥44px, font to, dùng được bằng găng tay, minimal training

```
┌─────────────────────────────────────────────────────────┐
│ 🏭 LSX-20260411-001 • SVR 10 • Ca 1 Tổ A    ⏱️ 02:15  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ● Tiếp nhận  ✅                                        │
│  ● Ủ mủ       ✅                                        │
│  ● Pha trộn   ✅                                        │
│  ● Đánh đông  🔄 ĐANG LÀM ← bước hiện tại             │
│  ○ Cán kéo    ⏳                                        │
│  ○ Băm cốm    ⏳                                        │
│  ○ Sấy        ⏳                                        │
│  ○ Ép bành    ⏳                                        │
│  ○ QC         ⏳                                        │
│  ○ Đóng gói   ⏳                                        │
│                                                         │
│  ┌──────────────────────────────────────────────┐       │
│  │ BƯỚC 4: ĐÁNH ĐÔNG                           │       │
│  │                                              │       │
│  │ Acid:     [Formic ▼]                         │       │
│  │ Nồng độ:  [2.5  ] %                         │       │
│  │ pH:       [5.2  ]                            │       │
│  │ Bắt đầu:  08:30  Dự kiến: 16:30 (8h)       │       │
│  └──────────────────────────────────────────────┘       │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ ✅ HOÀN TẤT  │  │ 🔧 SỰ CỐ   │  │ 📝 GHI CHÚ  │  │
│  │   BƯỚC NÀY   │  │  DỪNG MÁY   │  │              │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**UX highlights:**
- Timeline dọc bên trái — xanh (done), vàng (đang), xám (chờ)
- Form thông số thay đổi theo từng bước (bước 4 = acid/pH, bước 7 = nhiệt độ)
- 3 nút chính lớn: Hoàn tất / Sự cố / Ghi chú
- Timer tự chạy từ khi bắt đầu bước
- Touch-friendly cho tablet tại xưởng

### 3.2 SUPERVISOR VIEW — Live Board (TV nhà máy)

> Full-screen, auto-refresh 5-10s, treo TV 55" tại xưởng

```
┌─────────────────────────────────────────────────────────────────┐
│ 🏭 BẢNG GIÁM SÁT SẢN XUẤT — HUY ANH          Ca 1 Tổ A       │
│ 11/04/2026 10:42:15                  OEE: 87% ████████░ 🟢     │
├──────────────────┬──────────────────┬───────────────────────────┤
│                  │                  │                           │
│  LSX-001         │  LSX-002         │  LSX-003                  │
│  SVR 10 — 25 tấn │  SVR 3L — 15 tấn │  SVR 20 — 30 tấn         │
│                  │                  │                           │
│  ████████████░░  │  ██████████░░░░  │  ░░░░░░░░░░░░░░          │
│  80% (8/10)      │  60% (6/10)      │  0% (planned)            │
│                  │                  │                           │
│  B8: Ép bành     │  B6: Băm cốm     │  Chờ NVL                 │
│  🟢 Đúng tiến độ │  🟡 Chậm 30 phút │  ⏳ 14:00 bắt đầu        │
│  NV: Nguyễn A    │  NV: Trần B      │                           │
│                  │                  │                           │
├──────────────────┴──────────────────┴───────────────────────────┤
│                                                                 │
│  SẢN LƯỢNG HÔM NAY          DOWNTIME              QC           │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐│
│  │   45.2 / 50 tấn  │  │   35 phút (1.2%) │  │ Pass: 97.5%   ││
│  │   ████████░░ 90%  │  │   🔧 Cơ khí: 20p │  │ 39/40 bành    ││
│  │   ↑ 8% vs hôm qua│  │   ⚡ Điện: 15p   │  │               ││
│  └──────────────────┘  └──────────────────┘  └────────────────┘│
│                                                                 │
│  ⚠️ CẢNH BÁO: LSX-002 chậm 30p tại bước Băm cốm              │
│  ⚠️ NVL Acid Formic còn 120kg (dùng ~50kg/ngày → 2.4 ngày)    │
└─────────────────────────────────────────────────────────────────┘
```

**UX highlights:**
- Nền tối (dark theme) cho TV nhà máy — dễ đọc dưới ánh sáng xưởng
- Progress bar lớn, font 24px+
- Color coding: 🟢 Đúng tiến độ, 🟡 Chậm, 🔴 Dừng, ⏳ Chờ
- Cảnh báo chạy dưới (ticker)
- Auto-refresh Supabase Realtime (WebSocket, không polling)

### 3.3 DIRECTOR VIEW — OEE Dashboard

```
┌──────────────────────────────────────────────────────────────┐
│ 📊 DASHBOARD SẢN XUẤT                    [Tuần ▼] [T4/2026] │
├──────────┬──────────┬──────────┬──────────┬─────────────────┤
│ OEE      │Sản lượng │ Downtime │ QC Pass  │ NVL Variance    │
│ 87.3%    │ 312 tấn  │ 4.2%    │ 97.8%    │ +2.1%           │
│ ↑2.1%    │ ↑5% vs T3│ ↓0.8%   │ ↑0.3%   │ OK (<5%)        │
│ 🟢       │ 🟢       │ 🟢      │ 🟢      │ 🟢              │
├──────────┴──────────┴──────────┴──────────┴─────────────────┤
│                                                              │
│  [OEE Trend 30 ngày]     │  [Downtime Pareto]               │
│  ─────────────────────   │  ████████ Cơ khí (45%)           │
│  90│     ╱──╲             │  ████     Điện (22%)             │
│  85│   ╱    ╲──╱          │  ███      NVL thiếu (18%)       │
│  80│  ╱                   │  ██       Chất lượng (10%)       │
│  75│╱                     │  █        Khác (5%)              │
│    └────────────────      │                                  │
│     W1  W2  W3  W4        │                                  │
│                                                              │
│  [Sản lượng theo SP]      │  [Tiêu hao NVL vs Định mức]    │
│  SVR 10:  180T  ████████  │  Acid Formic:  +1.8% 🟢         │
│  SVR 3L:   85T  ████      │  Na₂S₂O₅:     +3.2% 🟢         │
│  SVR 20:   47T  ██        │  Bao PE:       -0.5% 🟢         │
│                           │  Nước:         +6.1% 🟡 ⚠       │
└───────────────────────────┴──────────────────────────────────┘
```

---

## 4. DATABASE — 10 TABLES MỚI

### 4.1 Production tracking

```sql
-- Nhật ký 10 công đoạn
CREATE TABLE production_step_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id UUID NOT NULL REFERENCES production_orders(id),
  step_number INT NOT NULL CHECK (step_number BETWEEN 1 AND 10),
  step_name VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','completed','skipped')),
  operator_id UUID REFERENCES employees(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_minutes INT,              -- auto = completed - started
  parameters JSONB NOT NULL DEFAULT '{}',
  -- Ví dụ parameters bước 4:
  -- {"acid_type":"formic","concentration":2.5,"ph":5.2,"volume_liters":150}
  -- Ví dụ bước 7:
  -- {"temperature_c":115,"duration_hours":3.5,"dryer_zone":1}
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(production_order_id, step_number)
);

-- Sự cố / dừng máy
CREATE TABLE production_downtimes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id UUID REFERENCES production_orders(id),
  line_id UUID REFERENCES production_lines(id),
  reason_category VARCHAR(30) NOT NULL
    CHECK (reason_category IN (
      'mechanical','electrical','material_shortage',
      'quality_issue','planned_maintenance','operator','other'
    )),
  reason_detail TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_minutes INT,              -- auto = ended - started
  impact_level VARCHAR(10) DEFAULT 'medium'
    CHECK (impact_level IN ('low','medium','high','critical')),
  resolution TEXT,
  reported_by UUID REFERENCES employees(id),
  resolved_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Báo cáo ca
CREATE TABLE shift_production_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE NOT NULL,
  shift VARCHAR(10) NOT NULL CHECK (shift IN ('1','2','3')),
  team VARCHAR(10) CHECK (team IN ('A','B','C')),
  line_id UUID REFERENCES production_lines(id),
  -- Sản lượng
  planned_output_kg DECIMAL(15,2) DEFAULT 0,
  actual_output_kg DECIMAL(15,2) DEFAULT 0,
  yield_percent DECIMAL(5,2),        -- actual/planned × 100
  -- Thời gian
  total_run_minutes INT DEFAULT 0,
  total_downtime_minutes INT DEFAULT 0,
  -- Chất lượng
  total_bales INT DEFAULT 0,
  passed_bales INT DEFAULT 0,
  rejected_bales INT DEFAULT 0,
  qc_pass_rate DECIMAL(5,2),         -- passed/total × 100
  -- OEE
  oee_availability DECIMAL(5,2),
  oee_performance DECIMAL(5,2),
  oee_quality DECIMAL(5,2),
  oee_overall DECIMAL(5,2),          -- A × P × Q
  -- Nhân sự
  headcount INT,
  -- Ghi chú
  handover_notes TEXT,               -- bàn giao ca sau
  incidents TEXT,                     -- sự cố đặc biệt
  reported_by UUID REFERENCES employees(id),
  approved_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(report_date, shift, line_id)
);
```

### 4.2 SOP (Standard Operating Procedure)

```sql
CREATE TABLE sop_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  category VARCHAR(30) NOT NULL
    CHECK (category IN ('production','quality','safety','maintenance','general')),
  department_id UUID REFERENCES departments(id),
  version INT DEFAULT 1,
  status VARCHAR(20) DEFAULT 'draft'
    CHECK (status IN ('draft','pending_review','approved','active','archived')),
  effective_date DATE,
  review_date DATE,
  approved_by UUID REFERENCES employees(id),
  approved_at TIMESTAMPTZ,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sop_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_id UUID NOT NULL REFERENCES sop_documents(id) ON DELETE CASCADE,
  step_number INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT,                      -- rich text / markdown
  media_urls TEXT[],                 -- ảnh, video minh họa
  ppe_required TEXT[],               -- ['mũ BH','găng tay','kính']
  warning_notes TEXT,
  duration_minutes INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sop_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_id UUID NOT NULL REFERENCES sop_documents(id) ON DELETE CASCADE,
  category VARCHAR(20) DEFAULT 'during'
    CHECK (category IN ('before','during','after')),
  item_text VARCHAR(300) NOT NULL,
  is_required BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0
);

CREATE TABLE sop_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_id UUID NOT NULL REFERENCES sop_documents(id),
  version INT NOT NULL,
  changes_summary TEXT,
  changed_by UUID REFERENCES employees(id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  snapshot JSONB
);

CREATE TABLE sop_training_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_id UUID NOT NULL REFERENCES sop_documents(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  assigned_by UUID REFERENCES employees(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  due_date DATE,
  status VARCHAR(20) DEFAULT 'assigned'
    CHECK (status IN ('assigned','in_progress','completed','overdue')),
  completed_at TIMESTAMPTZ,
  score DECIMAL(5,2),
  UNIQUE(sop_id, employee_id)
);
```

### 4.3 Biển hiệu an toàn

```sql
CREATE TABLE safety_signs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(30) UNIQUE NOT NULL,
  type VARCHAR(20) NOT NULL
    CHECK (type IN ('prohibition','mandatory','warning','information','fire')),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  area VARCHAR(50) NOT NULL,
  location_detail TEXT,
  image_url TEXT,
  standard VARCHAR(30),              -- 'TCVN 8092', 'ISO 7010'
  install_date DATE,
  last_inspection_date DATE,
  next_inspection_date DATE,
  condition VARCHAR(20) DEFAULT 'good'
    CHECK (condition IN ('good','faded','damaged','missing','replaced')),
  linked_sop_id UUID REFERENCES sop_documents(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE safety_sign_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sign_id UUID NOT NULL REFERENCES safety_signs(id),
  inspection_date DATE NOT NULL,
  inspector_id UUID REFERENCES employees(id),
  condition VARCHAR(20) NOT NULL,
  photo_url TEXT,
  action_taken TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 5. DANH SÁCH 15 SOP BAN ĐẦU

| Mã | Tên SOP | Phòng ban | Ưu tiên | Liên kết bước SX |
|-----|---------|-----------|---------|-------------------|
| SOP-001 | Tiếp nhận & kiểm tra NL đầu vào | SX + QC | 🔴 Cao | Bước 1 |
| SOP-002 | Vận hành máy cán kéo (Crusher) | Sản xuất | 🔴 Cao | Bước 5 |
| SOP-003 | Vận hành máy băm cốm | Sản xuất | 🔴 Cao | Bước 6 |
| SOP-004 | Vận hành lò sấy (100-120°C) | Sản xuất | 🔴 Cao | Bước 7 |
| SOP-005 | Vận hành máy ép bành | Sản xuất | 🔴 Cao | Bước 8 |
| SOP-006 | Quy trình đánh đông (Acid) | SX + R&D | 🔴 Cao | Bước 4 |
| SOP-007 | Lấy mẫu & kiểm nghiệm QC (TCVN 3769) | QC | 🔴 Cao | Bước 9 |
| SOP-008 | Phối trộn lô (Blending) | SX + QC | 🟡 TB | Bước 3 |
| SOP-009 | Đóng gói, dán nhãn & bao bì | Sản xuất | 🟡 TB | Bước 10 |
| SOP-010 | An toàn lao động & PPE bắt buộc | Tất cả | 🔴 Cao | Tất cả |
| SOP-011 | Vệ sinh CN & xử lý nước thải | SX + HC | 🟡 TB | — |
| SOP-012 | Bảo trì máy móc định kỳ | Cơ Điện | 🔴 Cao | — |
| SOP-013 | Xử lý sự cố & dừng khẩn cấp | Tất cả | 🔴 Cao | — |
| SOP-014 | Lưu trữ & bảo quản NL/TP | Kho | 🟡 TB | — |
| SOP-015 | Ghi chép lô SX & truy xuất nguồn gốc | SX + QC | 🔴 Cao | Bước 1-10 |

---

## 6. PHASES TRIỂN KHAI

### Phase SX-1: 10-Step Tracker + Downtime + Shift Report (1 tuần)

| Bước | Tên | Mô tả |
|------|-----|-------|
| 1.1 | Migration SQL | Tạo 3 tables: production_step_logs, production_downtimes, shift_production_reports |
| 1.2 | productionStepService.ts | CRUD step logs, startStep, completeStep, getStepTemplate (10 bước SVR) |
| 1.3 | downtimeService.ts | Ghi sự cố, kết thúc, tính duration, Pareto data |
| 1.4 | shiftReportService.ts | Tạo báo cáo ca, auto-fill từ logs, OEE calculation |
| 1.5 | UI: ProductionStepTracker.tsx | Timeline 10 bước + form thông số theo bước (Operator View) |
| 1.6 | UI: DowntimeLogPage.tsx | Ghi sự cố, Pareto chart, danh sách downtimes |
| 1.7 | UI: ShiftReportPage.tsx | Form báo cáo ca, KPI cards, bàn giao ca |
| 1.8 | Integration | Link với production_orders hiện có, auto nhập kho TP |
| 1.9 | Test | CRUD steps, downtime, shift report, auto calculations |

### Phase SX-2: Live Board + OEE (1 tuần)

| Bước | Tên | Mô tả |
|------|-----|-------|
| 2.1 | Supabase Realtime | Subscribe production_step_logs + production_downtimes changes |
| 2.2 | UI: ProductionLiveBoard.tsx | Full-screen dark theme cho TV, auto-refresh, 3 cột LSX |
| 2.3 | UI: OEEDashboard.tsx | OEE trend, Pareto, sản lượng theo SP, NVL variance |
| 2.4 | Alert rules | Variance >5% → vàng, >10% → đỏ, Downtime >60min → notify |
| 2.5 | Timer component | Đếm thời gian bước hiện tại, cảnh báo quá thời gian chuẩn |

### Phase SX-3: SOP Số hóa (1 tuần)

| Bước | Tên | Mô tả |
|------|-----|-------|
| 3.1 | Migration SQL | Tạo 4 tables: sop_documents, sop_steps, sop_checklists, sop_versions |
| 3.2 | sopService.ts | CRUD SOP, version control, approval workflow |
| 3.3 | UI: SOPListPage.tsx | AdvancedDataTable, filter category/status, inline detail |
| 3.4 | UI: SOPEditorPage.tsx | Rich editor bước + upload media + checklist builder |
| 3.5 | UI: SOPViewerPage.tsx | Read-only format đẹp, PDF export |
| 3.6 | Seed data | 15 SOP ban đầu với nội dung cơ bản |

### Phase SX-4: Huấn luyện + Biển hiệu (1 tuần)

| Bước | Tên | Mô tả |
|------|-----|-------|
| 4.1 | Migration SQL | sop_training_assignments, safety_signs, safety_sign_inspections |
| 4.2 | trainingService.ts | Giao SOP, tracking đã đọc, quiz, compliance report |
| 4.3 | safetySignService.ts | CRUD biển, inspection history, scheduling |
| 4.4 | UI: SOPTrainingPage.tsx | NV đọc SOP → xác nhận → quiz |
| 4.5 | UI: SafetySignsPage.tsx | AdvancedDataTable biển hiệu, filter khu vực/loại |
| 4.6 | UI: ComplianceReport.tsx | % NV hoàn thành SOP theo phòng ban |

### Phase SX-5: Dashboard tổng hợp + Export (3 ngày)

| Bước | Tên | Mô tả |
|------|-----|-------|
| 5.1 | UI: ProductionMESPage.tsx | Trang tổng hợp MES: KPI + charts + alerts |
| 5.2 | Excel export | Báo cáo sản xuất tháng, OEE, downtime, NVL variance |
| 5.3 | Traceability view | Click bành → LSX → BOM → NVL → Đại lý (chuỗi truy xuất) |

---

## 7. TIMELINE

```
Tuần 1 (14-18/4):   Phase SX-1 — 10-Step + Downtime + Shift Report
Tuần 2 (21-25/4):   Phase SX-2 — Live Board + OEE + Realtime
Tuần 3 (28/4-2/5):  Phase SX-3 — SOP Số hóa
Tuần 4 (5-9/5):     Phase SX-4 — Huấn luyện + Biển hiệu
Tuần 5 (12-14/5):   Phase SX-5 — Dashboard + Export + Traceability
```

---

## 8. SIDEBAR MENU (chỉ minhld@)

```
QUẢN LÝ SẢN XUẤT
├── 📋 Lệnh sản xuất         (có sẵn → /wms/production)
├── 📊 Dashboard SX           (có sẵn → /wms/production/dashboard)
├── 🖥️ Live Board             (MỚI → /production/live)
├── 🔟 Tracking 10 bước       (MỚI → /production/steps)
├── ⏱️ Báo cáo ca             (MỚI → /production/shift-reports)
├── 🔧 Downtime / Sự cố      (MỚI → /production/downtimes)
├── 📈 OEE                    (MỚI → /production/oee)
├── 📖 SOP                    (MỚI → /production/sop)
├── 🎓 Huấn luyện             (MỚI → /production/training)
├── ⚠️ Biển hiệu AT           (MỚI → /production/safety-signs)
├── ⚙️ Dây chuyền             (có sẵn → /wms/production/facilities)
└── 📄 Công thức BOM          (có sẵn → /wms/production/specs)
```

---

## 9. THAM KHẢO

- [Tulip MES — Manufacturing Dashboards](https://tulip.co/blog/6-manufacturing-dashboards-for-visualizing-production/)
- [MachineMetrics — Real-time Production Monitoring](https://www.machinemetrics.com/production-monitoring)
- [UX in Manufacturing — Factory Floor Design (2026)](https://medium.com/@sihambouguern/ux-in-manufacturing-designing-software-that-works-on-the-factory-floor-86ba9f1e0afc)
- [Quy trình SVR — Hưng Thịnh Rubber](https://hungthinhrubber.com/index.php/quy-trinh/)
- [Quy trình SVR 3L — Việt Trung](https://viettrungcorp.com/vi/tin-chuyen-nganh/quy-trinh-che-bien-mu-cao-su-svr3l-188)
- [Chế biến SVR 10/5S — VRG](https://news.vrg.vn/ky-thuat/che-bien-cao-su-svr-10-svr-5s-tu-mu-nuoc/)
- [SYMESTIC — MES Dashboard](https://www.symestic.com/en-us/uses/mes-dashboard)
- [Gartner — MES Reviews 2026](https://www.gartner.com/reviews/market/manufacturing-execution-systems)
- [TCVN 3769 — Tiêu chuẩn cao su SVR](https://toc.123docz.net/document/606940)

---

*Tài liệu tạo: 11/04/2026*  
*Phiên bản: 2.0*  
*Trạng thái: DRAFT — chờ duyệt từ Giám đốc sản xuất*
