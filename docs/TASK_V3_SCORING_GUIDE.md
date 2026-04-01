# HƯỚNG DẪN TÍNH ĐIỂM CÔNG VIỆC V3

> **Cập nhật:** 01/04/2026
> **Áp dụng:** Từ tháng 4/2026

---

## 1. PHÂN LOẠI CÔNG VIỆC

Hệ thống tự động phân loại công việc dựa trên **cách tạo**. Nhân viên và quản lý không cần chọn loại — hệ thống tự biết.

### 5 loại công việc

| Loại | Khi nào | Ví dụ |
|------|---------|-------|
| **QL giao** | Trưởng/Phó phòng tạo và giao cho NV | "Bảo trì lò sấy số 3" |
| **Dự án** | Task thuộc dự án | "Lắp đặt dây chuyền mới — Phase 2" |
| **Lặp lại** | Hệ thống tự tạo từ lịch (cron) | "Công việc Kế toán hàng ngày — 01/04" |
| **Tự giao** | NV tự tạo cho mình | "Dọn dẹp kho phụ tùng" |
| **KT hàng ngày** | Cron tạo cho Phòng Kế toán | "Công việc Kế toán — 01/04/2026" |

---

## 2. CÁCH TÍNH ĐIỂM TỪNG TASK

### 2.1 Thang điểm sao (khi NV tự đánh giá)

| Số sao | Điểm | Ý nghĩa |
|--------|------|---------|
| ⭐ | 20 | Chưa tốt |
| ⭐⭐ | 40 | Cần cải thiện |
| ⭐⭐⭐ | 60 | Trung bình |
| ⭐⭐⭐⭐ | 80 | Tốt |
| ⭐⭐⭐⭐⭐ | 100 | Xuất sắc |

### 2.2 Công thức điểm cuối cùng (final_score)

| Loại | Công thức | Giải thích |
|------|-----------|-----------|
| **QL giao** | `NV × 40% + QL × 60%` | NV tự chấm chiếm 40%, Quản lý chấm chiếm 60% |
| **Dự án** | `NV × 80%` | Auto-approve, bắt buộc có ảnh minh chứng |
| **Lặp lại** (có popup) | `NV × 80%` | NV tự chấm, hệ số 80% |
| **Lặp lại** (auto) | `80 điểm cố định` | Tick hết checklist → auto 80 điểm |
| **Tự giao** | `NV × 70%` | NV tự chấm, hệ số 70% (thấp hơn vì tự giao) |

### 2.3 Ví dụ tính điểm

**NV chấm 4 sao (80 điểm):**

| Loại | Công thức | Kết quả |
|------|-----------|---------|
| QL giao (QL chấm 5 sao = 100đ) | 80×0.4 + 100×0.6 | **92 điểm** |
| QL giao (QL chấm 4 sao = 80đ) | 80×0.4 + 80×0.6 | **80 điểm** |
| QL giao (QL chấm 3 sao = 60đ) | 80×0.4 + 60×0.6 | **68 điểm** |
| Lặp lại (popup) | 80×0.8 | **64 điểm** |
| Tự giao | 80×0.7 | **56 điểm** |
| Lặp lại (auto, KT) | cố định | **80 điểm** |

→ **Cùng 4 sao nhưng điểm khác nhau** tùy loại công việc. QL giao có điểm cao nhất vì QL đánh giá khách quan hơn.

---

## 3. TRỌNG SỐ (WEIGHT) — QUAN TRỌNG NHẤT

Không phải task nào cũng có giá trị như nhau. Task quan trọng có trọng số cao hơn khi tính điểm tháng.

| Loại | Trọng số | Lý do |
|------|----------|-------|
| **QL giao** | **1.0** | Công việc chính, được phân công |
| **Dự án** | **1.0** | Công việc quan trọng, có kế hoạch |
| **Lặp lại** | **0.5** | Công việc routine, ít thử thách |
| **Tự giao** | **0.3** | Tự tạo, có thể chọn việc dễ |

### Ý nghĩa trọng số

- **Weight 1.0**: Đây là task "thật sự" — QL giao, có deadline, có đánh giá 2 chiều
- **Weight 0.5**: Task lặp đi lặp lại mỗi ngày — cần làm nhưng không phải thử thách mới
- **Weight 0.3**: NV tự chọn việc cho mình — có thể bias chọn việc dễ để tăng điểm

→ **Tránh tình trạng**: NV chỉ tự giao 10 việc dễ, chấm 5 sao hết → điểm cao mà thực tế không tốt.

---

## 4. ĐIỂM THÁNG (WEIGHTED AVERAGE)

```
                Σ (final_score × weight)
Điểm tháng = ─────────────────────────────
                     Σ weight
```

### Ví dụ thực tế

**NV Nguyễn Văn A — Tháng 4/2026:**

| # | Công việc | Loại | Final Score | Weight | Score × Weight |
|---|-----------|------|-------------|--------|----------------|
| 1 | Bảo trì lò sấy | QL giao | 85 | 1.0 | 85.0 |
| 2 | Xử lý đơn hàng XK | Dự án | 90 | 1.0 | 90.0 |
| 3 | Trực ca điện 01/04 | Lặp lại | 80 | 0.5 | 40.0 |
| 4 | Trực ca điện 02/04 | Lặp lại | 80 | 0.5 | 40.0 |
| 5 | Dọn dẹp kho | Tự giao | 56 | 0.3 | 16.8 |

```
Tổng weight = 1.0 + 1.0 + 0.5 + 0.5 + 0.3 = 3.3
Tổng score  = 85 + 90 + 40 + 40 + 16.8 = 271.8

Điểm tháng = 271.8 / 3.3 = 82.4 điểm → Hạng B
```

**Nếu NV chỉ tự giao 5 việc dễ (5 sao = 70đ mỗi task):**

```
5 task × 70đ × 0.3 = 105
Tổng weight = 5 × 0.3 = 1.5

Điểm = 105 / 1.5 = 70 điểm → Hạng C
```

→ **Chỉ tự giao → không bao giờ đạt Hạng A/B** dù chấm 5 sao.

---

## 5. XẾP HẠNG

| Hạng | Điểm | Đánh giá | Hệ số lương |
|------|------|---------|-------------|
| **A** | 90 – 100 | Xuất sắc | × 1.00 + 100% thưởng |
| **B** | 75 – 89 | Tốt | × 1.00 + 50% thưởng |
| **C** | 60 – 74 | Trung bình | × 0.95 (trừ 5%) |
| **D** | 40 – 59 | Cần cải thiện | × 0.90 (trừ 10%) |
| **F** | < 40 | Không đạt | × 0.85 (trừ 15%) |

---

## 6. QUY TRÌNH HOÀN THÀNH TỪNG LOẠI

### QL giao / Dự án (weight 1.0)
```
QL tạo + giao CV cho NV
  → NV tick checklist + upload bằng chứng
  → NV bấm "Hoàn thành" → popup đánh giá (chọn sao + ghi chú)
  → Gửi QL duyệt (trên trang Phê duyệt)
  → QL chấm sao → final_score = NV×40% + QL×60%
  → Tính vào hiệu suất tháng (weight 1.0)
```

### Lặp lại — có popup (weight 0.5)
```
Cron tạo task hàng ngày
  → NV tick checklist
  → NV bấm "Hoàn thành" → popup đánh giá
  → Tự động duyệt: final_score = NV × 80%
  → Tính vào hiệu suất (weight 0.5)
```

### Lặp lại — auto (KT hàng ngày) (weight 0.5)
```
Cron tạo task 20 bước checklist
  → NV tick hết 20 bước
  → Tự động hoàn thành + 80 điểm (KHÔNG popup)
  → Tính vào hiệu suất (weight 0.5)
```

### Tự giao (weight 0.3)
```
NV tự tạo CV cho mình
  → NV tick checklist
  → NV bấm "Hoàn thành" → popup đánh giá
  → Tự động duyệt: final_score = NV × 70%
  → Tính vào hiệu suất (weight 0.3)
```

---

## 7. TÓM TẮT 1 TRANG

```
┌─────────────────────────────────────────────────────────────────┐
│                   CÁCH TÍNH ĐIỂM V3                             │
│                                                                 │
│  1. Mỗi task hoàn thành → có FINAL_SCORE (0-100)              │
│                                                                 │
│     QL giao:  NV×40% + QL×60%  (2 người chấm)                │
│     Lặp lại: NV×80%           (NV tự chấm, hệ số 80%)        │
│     Tự giao: NV×70%           (NV tự chấm, hệ số 70%)        │
│     KT auto: 80 điểm          (tick xong = 80)                │
│                                                                 │
│  2. Mỗi task có WEIGHT (trọng số)                              │
│                                                                 │
│     QL giao + Dự án: 1.0  (quan trọng nhất)                   │
│     Lặp lại:        0.5  (routine)                             │
│     Tự giao:        0.3  (ít giá trị nhất)                    │
│                                                                 │
│  3. Điểm tháng = Σ(score × weight) / Σ(weight)                │
│                                                                 │
│  4. Xếp hạng: A(90+) B(75-89) C(60-74) D(40-59) F(<40)       │
│                                                                 │
│  → Muốn hạng cao: làm tốt task QL giao (weight 1.0)           │
│  → Chỉ tự giao: max hạng C (weight 0.3 kéo xuống)            │
└─────────────────────────────────────────────────────────────────┘
```

---

> Hướng dẫn tính điểm V3 — Huy Anh ERP
> Công ty TNHH MTV Cao su Huy Anh Phong Điền
> 01/04/2026
