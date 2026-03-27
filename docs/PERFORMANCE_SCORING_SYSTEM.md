# HỆ THỐNG ĐÁNH GIÁ & HIỆU SUẤT NHÂN VIÊN

> **Phiên bản:** 2.0 — Ngày: 27/03/2026
> **So sánh:** Hệ thống cũ vs Hệ thống mới

---

## 1. SO SÁNH TỔNG QUAN

| | Hệ thống CŨ | Hệ thống MỚI |
|--|-------------|---------------|
| **Luồng đánh giá** | 6 bước thủ công | 2 bước (tick + sao) |
| **Progress task** | Kéo slider thủ công | Tự động từ checklist |
| **Tự đánh giá NV** | Form phức tạp nhiều trường | 1-5 sao + ghi chú |
| **Manager duyệt** | Từng task một | Hàng loạt (batch) |
| **Dashboard hiệu suất** | Không có | Có (xếp hạng, trend, phòng ban) |
| **Báo cáo** | Không có | PDF + Excel export |
| **Chấm công liên kết** | Không | Có (30% tổng điểm) |
| **Thông báo** | Không | Bell notification + email |
| **Kanban** | Không | Có (kéo thả 4 cột) |
| **Comments** | Không | Có (bình luận trong task) |

---

## 2. LUỒNG MỚI

```
┌─────────────────────────────────────────────────────────┐
│                    LUỒNG TASK MỚI                        │
│                                                         │
│  Nhận task ──→ Tick checklist ──→ Auto hoàn thành       │
│  (tự động      (thao tác duy     (khi 100%)            │
│   "Đang làm")  nhất của NV)                             │
│                      │                                   │
│                      ▼                                   │
│              Popup đánh giá nhanh                        │
│              ⭐⭐⭐⭐☆ (1-5 sao)                      │
│              + Ghi chú (tùy chọn)                       │
│                      │                                   │
│                      ▼                                   │
│              Notification → Manager                      │
│                      │                                   │
│                      ▼                                   │
│              Manager duyệt nhanh                         │
│              (hàng loạt hoặc từng cái)                  │
│              ⭐⭐⭐⭐⭐ Manager chấm                   │
│                      │                                   │
│                      ▼                                   │
│              Tính điểm tổng hợp                          │
│              → Hiện trên Dashboard                       │
└─────────────────────────────────────────────────────────┘
```

---

## 3. CÁCH TÍNH ĐIỂM

### 3.1 Điểm từng Task

```
Điểm Task = (NV tự chấm × 40%) + (Manager chấm × 60%)
```

| NV tự chấm (sao) | Điểm quy đổi |
|-------------------|---------------|
| ⭐ (1 sao) | 20 điểm |
| ⭐⭐ (2 sao) | 40 điểm |
| ⭐⭐⭐ (3 sao) | 60 điểm |
| ⭐⭐⭐⭐ (4 sao) | 80 điểm |
| ⭐⭐⭐⭐⭐ (5 sao) | 100 điểm |
| Bỏ qua | 60 điểm (mặc định) |

**Ví dụ:**
```
NV tự chấm: 4 sao = 80 điểm
Manager chấm: 4 sao = 80 điểm
Điểm task = 80 × 0.4 + 80 × 0.6 = 32 + 48 = 80 điểm
```

### 3.2 Điểm Công việc tháng

```
Điểm Công việc = Trung bình (Điểm tất cả Task hoàn thành trong tháng)
```

**Bao gồm cả:**
- Công việc thường (phòng ban giao)
- Công việc dự án (project task)
- Công việc tự động (recurring)

**Ví dụ:**
```
Tháng 3/2026 — Võ Văn Hoài:
  Task 1: Bảo trì lò sấy       → 85 điểm
  Task 2: Trực ca điện          → 90 điểm
  Task 3: Kiểm tra thiết bị    → 75 điểm
  Task 4: Báo cáo tuần (DA)    → 80 điểm

Điểm công việc = (85 + 90 + 75 + 80) / 4 = 82.5 điểm
```

### 3.3 Hệ số đúng hạn

```
Tỷ lệ đúng hạn = (Số task xong đúng hạn / Tổng task) × 100%
```

| Tỷ lệ đúng hạn | Nhận xét |
|-----------------|----------|
| 90-100% | Xuất sắc |
| 75-89% | Tốt |
| 60-74% | Trung bình |
| < 60% | Cần cải thiện |

### 3.4 Điểm Chấm công

```
Điểm chấm công = 100 (cơ bản)
  - 10 điểm × số ngày nghỉ không phép
  - 5 điểm × số lần đi trễ
  + 5 điểm × số lần tăng ca (tối đa +20)

Điểm chấm công = max(0, min(100, điểm tính))
```

**Ví dụ:**
```
Tháng 3/2026 — Võ Văn Hoài:
  Nghỉ không phép: 1 ngày  → -10
  Đi trễ: 2 lần            → -10
  Tăng ca (approved): 3 lần → +15

Điểm chấm công = 100 - 10 - 10 + 15 = 95 điểm
```

### 3.5 Điểm Tổng hợp (Final)

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  Điểm Tổng hợp = Điểm Công việc × 70%         │
│                 + Điểm Chấm công × 30%         │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Ví dụ:**
```
Võ Văn Hoài — Tháng 3/2026:
  Điểm công việc: 82.5
  Điểm chấm công: 95.0

  Điểm tổng hợp = 82.5 × 0.7 + 95.0 × 0.3
                = 57.75 + 28.5
                = 86.25 điểm → Hạng B (Tốt)
```

---

## 4. BẢNG XẾP HẠNG

| Hạng | Điểm | Mô tả | Màu |
|------|------|-------|-----|
| **A** | 90 - 100 | Xuất sắc | 🟢 Xanh lá |
| **B** | 75 - 89 | Tốt | 🔵 Xanh dương |
| **C** | 60 - 74 | Trung bình | 🟠 Cam |
| **D** | 40 - 59 | Cần cải thiện | 🔴 Đỏ |
| **F** | < 40 | Không đạt | ⚫ Đen đỏ |

---

## 5. PHÂN QUYỀN XEM HIỆU SUẤT

| Vai trò | Xem được | Trang |
|---------|----------|-------|
| **Nhân viên** | Chỉ bản thân | /performance/:myId |
| **Trưởng/Phó phòng** | Nhân viên phòng mình | /performance (filter dept) |
| **BGĐ / Admin** | Tất cả nhân viên, tất cả phòng ban | /performance (full) |

---

## 6. CÁC TRANG MỚI

### 6.1 Dashboard Hiệu suất (`/performance`)

```
┌─ KPIs ────────────────────────────────────────────┐
│ NV đánh giá | Điểm TB | Task hoàn thành | Đúng hạn│
└───────────────────────────────────────────────────┘

┌─ Phân bố hạng ──────┐  ┌─ Xu hướng 6 tháng ─────┐
│ A: ███████ 5 NV      │  │ ▁▃▅▇█▇               │
│ B: █████████ 8 NV    │  │ T10 T11 T12 T1 T2 T3 │
│ C: ███ 3 NV          │  └────────────────────────┘
└──────────────────────┘

┌─ Bảng xếp hạng ─────────────────────────────────┐
│ # | Nhân viên | Phòng | Task | Đúng hạn | Điểm  │
│ 1 | Nguyễn A  | QC    | 12   | 92%      | 95 A  │
│ 2 | Trần B    | CĐ    | 8    | 88%      | 87 B  │
└──────────────────────────────────────────────────┘

Toggle: [Chỉ công việc] / [Kết hợp chấm công]
```

### 6.2 Phê duyệt nhanh (`/tasks/approve-batch`)

```
☑ Chọn nhiều task → Manager chấm sao → Duyệt hàng loạt
```

### 6.3 Báo cáo hiệu suất (`/performance/reports`)

```
Loại: Cá nhân | Phòng ban | Tổng hợp
Export: PDF (in) | Excel (CSV)
```

---

## 7. CÔNG THỨC TỔNG HỢP

```
                    ┌──────────────────┐
                    │   ĐIỂM TASK      │
                    │                  │
                    │  NV × 40%        │
                    │  + Manager × 60% │
                    └────────┬─────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
       Task 1: 85       Task 2: 90       Task 3: 75
            │                │                │
            └────────────────┼────────────────┘
                             │
                    ┌────────▼─────────┐
                    │  ĐIỂM CÔNG VIỆC  │
                    │  = AVG(tasks)    │
                    │  = 83.3          │
                    └────────┬─────────┘
                             │ × 70%
                             │
                    ┌────────▼─────────┐
                    │  ĐIỂM TỔNG HỢP  │◄─── Điểm Chấm công × 30%
                    │  = 83.3×0.7      │     = 95 × 0.3 = 28.5
                    │  + 28.5          │
                    │  = 86.8          │
                    │  → Hạng B (Tốt)  │
                    └──────────────────┘
```

---

## 8. TÍNH NĂNG TỰ ĐỘNG

| Tính năng | Cơ chế | Thời điểm |
|-----------|--------|-----------|
| Checklist → Progress | Tick checklist → auto tính % | Real-time |
| Progress 100% → Hoàn thành | Auto đổi status + mở popup | Real-time |
| Subtask → Parent progress | Avg subtasks → parent progress | Real-time |
| Recurring task | Edge Function + pg_cron | 6:00 AM hàng ngày |
| Email nhắc hạn | Edge Function + pg_cron | 8:00 AM hàng ngày |
| Notification bell | Query on-the-fly | Mỗi 60s |

---

## 9. MENU HỆ THỐNG

```
QUẢN LÝ CÔNG VIỆC
├─ Danh sách công việc
├─ Kanban                    ← MỚI
├─ Công việc của tôi         (nâng cấp: calendar + chart)
├─ Phê duyệt
├─ Phê duyệt nhanh          ← MỚI (batch)
├─ Mẫu công việc            (template + recurring)
├─ Hiệu suất                ← MỚI (dashboard)
└─ Báo cáo hiệu suất        ← MỚI (export)
```

---

> Hệ thống Đánh giá & Hiệu suất v2.0
> Huy Anh Rubber ERP v8
> 27/03/2026
