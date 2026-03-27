# KẾ HOẠCH NÂNG CẤP HỆ THỐNG CÔNG VIỆC & HIỆU SUẤT

> **Phiên bản:** 1.0 — Ngày: 27/03/2026
> **Mục tiêu:** Giảm thao tác NV, tự động hóa đánh giá, tạo dashboard hiệu suất

---

## TỔNG QUAN VẤN ĐỀ

### Hiện trạng

```
NV nhận task → Kéo slider progress → Tick checklist → Bấm hoàn thành
→ Điền form đánh giá phức tạp → Chờ manager duyệt (hay quên)
→ KHÔNG CÓ nơi xem hiệu suất tổng hợp
```

### Mục tiêu

```
NV nhận task → Tick checklist → Chấm sao (1 click) → XONG
Manager: Duyệt nhanh hàng loạt + Xem dashboard hiệu suất
BGĐ: Xem báo cáo hiệu suất toàn công ty
```

---

## 6 PHASE

| Phase | Nội dung | Effort | Ưu tiên |
|-------|----------|--------|---------|
| **P1** | Tự động hóa luồng task | 1 ngày | CAO |
| **P2** | Đánh giá nhanh (1-5 sao) | 1 ngày | CAO |
| **P3** | Duyệt nhanh hàng loạt | 0.5 ngày | CAO |
| **P4** | Dashboard hiệu suất | 1.5 ngày | CAO |
| **P5** | Báo cáo + Export | 1 ngày | TRUNG BÌNH |
| **P6** | Liên kết chấm công | 1 ngày | TRUNG BÌNH |

---

## PHASE 1: TỰ ĐỘNG HÓA LUỒNG TASK

### 1.1 Checklist → Progress → Auto complete

```
Checklist 0/5  → Progress 0%   → Status: Đang làm
Checklist 3/5  → Progress 60%  → Status: Đang làm
Checklist 5/5  → Progress 100% → Status: TỰ ĐỘNG hoàn thành
                                → TỰ ĐỘNG mở popup đánh giá nhanh
```

**Sửa:**
- `TaskViewPage.tsx`: Khi checklist 100% → auto set status='finished' + hiện popup đánh giá
- `taskService.ts`: Bỏ slider progress thủ công (chỉ giữ cho task không có checklist)
- Nếu task không có checklist → NV bấm "Hoàn thành" thủ công (giữ nguyên)

### 1.2 Auto-start khi nhận task

```
Task giao → Status tự động "Đang làm" (không qua "Nháp")
```

**Sửa:**
- `taskService.create()`: Nếu có assignee → status = 'in_progress', progress = 1
- Bỏ trạng thái "Nháp" cho task có người phụ trách

### 1.3 Deadline nhắc nhở thông minh

```
Trước 1 ngày → Notification vàng "Sắp đến hạn"
Đúng ngày    → Notification cam "Hôm nay là hạn chót"
Quá hạn      → Notification đỏ + Email cho NV + CC Manager
```

**Đã có:** Edge Function `task-reminders` (cần bật pg_cron)

---

## PHASE 2: ĐÁNH GIÁ NHANH (1-5 SAO)

### 2.1 Popup đánh giá nhanh cho NV

Khi task hoàn thành (checklist 100% hoặc bấm nút) → hiện popup:

```
┌─────────────────────────────────────┐
│  ⭐ Tự đánh giá công việc           │
│                                     │
│  CV-0238: Bảo trì lò sấy           │
│                                     │
│  Bạn tự chấm:  ☆ ☆ ☆ ☆ ☆          │
│                 1  2  3  4  5       │
│                                     │
│  Ghi chú (tùy chọn):               │
│  ┌──────────────────────────────┐   │
│  │                              │   │
│  └──────────────────────────────┘   │
│                                     │
│         [Bỏ qua]    [Gửi ⭐]       │
└─────────────────────────────────────┘
```

**Logic:**
- 1 sao = 20 điểm, 2 sao = 40, 3 sao = 60, 4 sao = 80, 5 sao = 100
- "Bỏ qua" → evaluation_status = 'skipped', score = 60 (mặc định trung bình)
- "Gửi" → evaluation_status = 'pending_approval', score = sao × 20
- Tự động gửi notification cho Manager

### 2.2 Sửa form đánh giá cũ

- Giữ form chi tiết cũ cho trường hợp cần đánh giá kỹ
- Popup nhanh là mặc định → nếu muốn chi tiết hơn → mở form đầy đủ

---

## PHASE 3: DUYỆT NHANH HÀNG LOẠT

### 3.1 Trang duyệt hàng loạt

```
/tasks/approve-batch

┌─────────────────────────────────────────────────┐
│  Phê duyệt công việc (12 chờ duyệt)            │
│                                                 │
│  ☑ Chọn tất cả    [Duyệt đã chọn ✓]           │
│                                                 │
│  ☐ CV-0238 Bảo trì lò sấy    Hoài  ⭐⭐⭐⭐  │
│  ☐ CV-0242 Trực điện ca 1     Hòa   ⭐⭐⭐⭐⭐│
│  ☐ CV-0244 Theo ca SX         Nhân  ⭐⭐⭐    │
│                                                 │
│  Manager chấm: ☆☆☆☆☆ (áp dụng cho đã chọn)  │
│  Ghi chú: [________________]                   │
│                                                 │
│  [Duyệt tất cả ✓]                              │
└─────────────────────────────────────────────────┘
```

**Tính năng:**
- Checkbox chọn nhiều task
- 1 click duyệt hàng loạt
- Manager chấm sao → áp dụng cho tất cả (hoặc từng cái)
- Score cuối = (NV tự chấm + Manager chấm) / 2

### 3.2 Duyệt từ Notification

- Notification "3 task chờ duyệt" → click → mở trang duyệt batch
- Hoặc duyệt nhanh ngay trong notification dropdown

---

## PHASE 4: DASHBOARD HIỆU SUẤT

### 4.1 Trang `/performance`

```
HIỆU SUẤT NHÂN VIÊN                    [Tháng 3/2026 ▼]

┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│  42  │ │ 87.6 │ │  38  │ │  92% │ │  3   │
│NV    │ │Điểm  │ │Hoàn  │ │Đúng  │ │Quá   │
│đánh  │ │TB    │ │thành │ │hạn   │ │hạn   │
│giá   │ │      │ │      │ │      │ │      │
└──────┘ └──────┘ └──────┘ └──────┘ └──────┘

┌─ BẢNG XẾP HẠNG ────────────────────────────┐
│ #  Nhân viên      Phòng    Điểm  Task  Hạng│
│ 1  Nguyễn M.Thắng  HC     95.2   12    A   │
│ 2  Lê Văn Hòa      CĐ     92.0   8     A   │
│ 3  Võ Văn Hoài     CĐ     87.6   10    B   │
│ 4  Trần Thị Bé     QC     85.0   6     B   │
│ ...                                         │
└─────────────────────────────────────────────┘

┌─ SO SÁNH PHÒNG BAN ──────┐  ┌─ TREND 6 THÁNG ────────┐
│ Phòng     Điểm TB  Task  │  │ ▁▃▅▇█▇  (bar chart)    │
│ Cơ Điện   89.8     18    │  │ T10 T11 T12 T1 T2 T3   │
│ QC        85.2     12    │  │                          │
│ HC        82.0     15    │  │ Điểm TB toàn công ty    │
│ Kho       78.5     8     │  │ 85.2 → 87.6 (+2.8%)    │
└──────────────────────────┘  └──────────────────────────┘
```

### 4.2 Phân quyền xem

| Vai trò | Xem được |
|---------|----------|
| Nhân viên | Chỉ hiệu suất bản thân |
| Trưởng/Phó phòng | Nhân viên phòng mình |
| BGĐ / Admin | Tất cả nhân viên, tất cả phòng ban |

### 4.3 Điểm hiệu suất tính như thế nào

```
Điểm task = (NV tự chấm × 40% + Manager chấm × 60%)

Điểm tháng = Trung bình điểm tất cả task hoàn thành trong tháng
             × Hệ số đúng hạn

Hệ số đúng hạn:
- 100% đúng hạn → ×1.0
- 80% đúng hạn  → ×0.95
- 60% đúng hạn  → ×0.9
- <50% đúng hạn → ×0.85

Xếp hạng:
- A (90-100): Xuất sắc
- B (75-89):  Tốt
- C (60-74):  Trung bình
- D (40-59):  Cần cải thiện
- F (<40):    Không đạt
```

---

## PHASE 5: BÁO CÁO + EXPORT

### 5.1 Báo cáo hiệu suất

- Báo cáo tháng/quý cho từng NV
- Báo cáo phòng ban cho Trưởng phòng
- Báo cáo tổng hợp cho BGĐ
- So sánh tháng này vs tháng trước

### 5.2 Export

- PDF: Bảng đánh giá cá nhân (in ký)
- Excel: Bảng tổng hợp phòng ban
- Nút "Xuất báo cáo" trên trang /performance

---

## PHASE 6: LIÊN KẾT CHẤM CÔNG

### 6.1 Chấm công → Hiệu suất

```
Hiệu suất tổng = Điểm task (70%) + Điểm chấm công (30%)

Điểm chấm công:
- Đi làm đủ ngày:        100 điểm
- Nghỉ không phép:       -10 điểm/ngày
- Đi trễ:                -5 điểm/lần
- Tăng ca (approved):    +5 điểm/lần (tối đa +20)
```

### 6.2 Nghỉ phép → Deadline task

- Khi NV đăng ký nghỉ phép → Cảnh báo nếu có task sắp hạn
- Tự động suggest gia hạn deadline cho task trong ngày nghỉ
- Manager thấy cảnh báo khi duyệt đơn nghỉ

---

## TIMELINE

```
Ngày 1:  Phase 1 (Auto luồng) + Phase 2 (Đánh giá nhanh)
Ngày 2:  Phase 3 (Duyệt batch) + Phase 4 (Dashboard)
Ngày 3:  Phase 4 tiếp + Phase 5 (Báo cáo)
Ngày 4:  Phase 6 (Chấm công) + Test + Deploy
```

---

## FILES CẦN TẠO/SỬA

### Tạo mới
| File | Phase | Mô tả |
|------|-------|-------|
| `src/pages/performance/PerformanceDashboardPage.tsx` | P4 | Dashboard hiệu suất |
| `src/pages/performance/EmployeePerformancePage.tsx` | P4 | Chi tiết NV |
| `src/pages/tasks/BatchApprovePage.tsx` | P3 | Duyệt hàng loạt |
| `src/components/tasks/QuickEvalModal.tsx` | P2 | Popup đánh giá nhanh |
| `src/services/performanceService.ts` | P4 | Tính toán hiệu suất |
| `src/pages/performance/PerformanceReportPage.tsx` | P5 | Báo cáo xuất |

### Sửa
| File | Phase | Thay đổi |
|------|-------|----------|
| `TaskViewPage.tsx` | P1 | Auto complete + popup eval |
| `taskService.ts` | P1 | Auto-start, bỏ manual progress |
| `MyTasksPage.tsx` | P2 | Hiện popup khi task xong |
| `Sidebar.tsx` | P4 | Thêm menu "Hiệu suất" |
| `App.tsx` | P4 | Thêm routes |

---

> Kế hoạch nâng cấp Công việc & Hiệu suất v1.0
> Huy Anh Rubber ERP v8
