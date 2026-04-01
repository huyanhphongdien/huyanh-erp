# HƯỚNG DẪN TÍNH ĐIỂM CÔNG VIỆC V3

> **Cập nhật:** 01/04/2026
> **Áp dụng:** Từ tháng 4/2026
> **Hệ thống:** Huy Anh ERP v8

---

## 1. PHÂN LOẠI CÔNG VIỆC

Hệ thống **tự động phân loại** — không ai cần chọn loại.

| Loại | Cách nhận biết | Ví dụ thực tế |
|------|---------------|---------------|
| **QL giao** | TP/PP tạo và giao cho NV | "Bảo trì lò sấy số 3", "Sửa điện nhà máy" |
| **Dự án** | Task thuộc 1 dự án | "Lắp đặt dây chuyền — Phase 2" |
| **Lặp lại** | Cron tạo tự động mỗi ngày | "Trực ca Điện-Nước 01/04", "Công việc KT hàng ngày" |
| **Tự giao** | NV tự tạo cho mình | "Dọn dẹp kho", "Học phần mềm mới" |

---

## 2. QUY TRÌNH HOÀN THÀNH

### 2.1 QL giao (Quản lý giao việc)

```
TP/PP tạo CV → giao cho NV (bắt buộc chọn người phụ trách)
  → NV thực hiện: tick checklist + upload bằng chứng (nếu yêu cầu)
  → NV bấm "Hoàn thành" → popup tự chấm sao (1-5★) + ghi chú
  → Gửi TP/PP duyệt (trang Phê duyệt công việc)
  → TP/PP chấm sao (1-5★) + ghi chú
  → Hệ thống tính: final_score = NV × 40% + QL × 60%
```

### 2.2 Dự án

```
Task tạo trong dự án → giao cho NV
  → NV thực hiện: tick checklist + BẮT BUỘC upload ảnh minh chứng
  → NV bấm "Hoàn thành":
    ⚠️ Chưa có ảnh → "Bắt buộc phải có ít nhất 1 ảnh minh chứng"
    ✅ Có ảnh → popup tự chấm sao
  → TỰ ĐỘNG DUYỆT: final_score = NV × 90%
  → Lưu ý: task dự án có thể dài ngày, tính vào tháng hoàn thành
```

### 2.3 Lặp lại — Có popup (task từ mẫu)

```
Cron tạo task hàng ngày (từ template)
  → NV tick checklist
  → NV bấm "Hoàn thành" → popup tự chấm sao
  → TỰ ĐỘNG DUYỆT: final_score = NV × 80%
```

### 2.4 Lặp lại — Auto (KT hàng ngày, không popup)

```
Cron tạo 20 bước checklist mỗi sáng
  → NV tick hết 20 bước
  → TỰ ĐỘNG hoàn thành + 80 điểm (KHÔNG popup, KHÔNG cần ảnh)
```

### 2.5 Tự giao

```
NV tự tạo CV cho mình (bấm "Làm mới" → chế độ tự giao)
  → NV thực hiện: tick checklist
  → NV bấm "Hoàn thành" → popup tự chấm sao
  → TỰ ĐỘNG DUYỆT: final_score = NV × 70%
```

---

## 3. BẢNG TỔNG HỢP

| Loại | Source | Ai duyệt | Công thức | Weight | Cần ảnh |
|------|--------|----------|-----------|--------|---------|
| **QL giao** | assigned | TP/PP | NV×40% + QL×60% | **1.0** | Tùy checklist |
| **Dự án** | project | Auto | NV×90% | **1.0** | **Bắt buộc** |
| **Lặp lại** (popup) | recurring | Auto | NV×80% | **0.5** | Không |
| **Lặp lại** (KT auto) | recurring | Auto | 80đ cố định | **0.5** | Không |
| **Tự giao** | self | Auto | NV×70% | **0.3** | Tùy checklist |

---

## 4. THANG ĐIỂM SAO

Khi NV hoặc QL chấm sao:

| Sao | Điểm gốc | Ý nghĩa |
|-----|----------|---------|
| ⭐ | 20 | Chưa tốt — không đạt yêu cầu |
| ⭐⭐ | 40 | Cần cải thiện — còn nhiều thiếu sót |
| ⭐⭐⭐ | 60 | Trung bình — hoàn thành cơ bản |
| ⭐⭐⭐⭐ | 80 | Tốt — hoàn thành tốt yêu cầu |
| ⭐⭐⭐⭐⭐ | 100 | Xuất sắc — vượt kỳ vọng |

---

## 5. VÍ DỤ TÍNH ĐIỂM CHI TIẾT

### Ví dụ 1: NV Nguyễn Văn A — QL giao

**Task:** "Bảo trì lò sấy số 3"
- NV tự chấm: ⭐⭐⭐⭐ = **80 điểm**
- QL chấm: ⭐⭐⭐⭐⭐ = **100 điểm**

```
final_score = 80 × 40% + 100 × 60%
            = 32 + 60
            = 92 điểm
```

**Task:** "Sửa điện cổng bảo vệ"
- NV tự chấm: ⭐⭐⭐⭐⭐ = **100 điểm**
- QL chấm: ⭐⭐⭐ = **60 điểm** (NV tự chấm cao nhưng QL thấy chưa tốt)

```
final_score = 100 × 40% + 60 × 60%
            = 40 + 36
            = 76 điểm
```

→ QL chấm thấp → kéo điểm xuống dù NV tự chấm cao. **Công bằng**.

---

### Ví dụ 2: NV Lê Văn B — Dự án

**Task:** "Lắp đặt dây chuyền mới — Phase 2" (task dài, tạo tháng 2, hoàn thành tháng 4)
- BẮT BUỘC có ảnh minh chứng (ảnh lắp đặt, video test)
- NV tự chấm: ⭐⭐⭐⭐ = **80 điểm**

```
final_score = 80 × 90%
            = 72 điểm
→ Tính vào hiệu suất THÁNG 4 (tháng hoàn thành)
→ Weight 1.0 (quan trọng)
```

---

### Ví dụ 3: NV Võ Văn C — Lặp lại (trực ca)

**Task:** "Trực ca Điện-Nước 01/04/2026"
- NV tự chấm: ⭐⭐⭐⭐⭐ = **100 điểm**

```
final_score = 100 × 80% (lặp lại = 80%)
            = 80 điểm
→ Weight 0.5 (routine, ít thử thách)
```

---

### Ví dụ 4: NV Kế toán — Auto

**Task:** "Công việc Kế toán hàng ngày — 01/04/2026" (20 bước checklist)
- Tick hết 20 bước → auto hoàn thành

```
final_score = 80 điểm (cố định)
→ Weight 0.5
→ KHÔNG popup, KHÔNG cần ảnh
```

---

### Ví dụ 5: NV Trần Thị D — Tự giao

**Task:** "Dọn dẹp kho phụ tùng" (NV tự tạo cho mình)
- NV tự chấm: ⭐⭐⭐⭐⭐ = **100 điểm**

```
final_score = 100 × 70%
            = 70 điểm
→ Weight 0.3 (tự giao, ít giá trị nhất)
```

→ Dù chấm 5 sao, điểm chỉ 70 vì hệ số 70%. Tự giao có weight thấp nhất.

---

## 6. TÍNH ĐIỂM THÁNG — VÍ DỤ ĐẦY ĐỦ

### NV Nguyễn Văn A — Tháng 4/2026

| # | Công việc | Loại | NV★ | QL★ | Final Score | Weight | Score × Weight |
|---|-----------|------|-----|-----|-------------|--------|----------------|
| 1 | Bảo trì lò sấy | QL giao | 4★=80 | 5★=100 | 92 | 1.0 | 92.0 |
| 2 | Sửa điện cổng | QL giao | 5★=100 | 3★=60 | 76 | 1.0 | 76.0 |
| 3 | Lắp đặt dây chuyền | Dự án | 4★=80 | auto(×90%) | 72 | 1.0 | 72.0 |
| 4 | Trực ca 01/04 | Lặp lại | 5★=100 | auto | 80 | 0.5 | 40.0 |
| 5 | Trực ca 02/04 | Lặp lại | 4★=80 | auto | 64 | 0.5 | 32.0 |
| 6 | Trực ca 03/04 | Lặp lại | 5★=100 | auto | 80 | 0.5 | 40.0 |
| 7 | Dọn dẹp kho | Tự giao | 5★=100 | auto | 70 | 0.3 | 21.0 |

```
Tổng Score × Weight = 92 + 76 + 72 + 40 + 32 + 40 + 21 = 373.0
Tổng Weight = 1.0 + 1.0 + 1.0 + 0.5 + 0.5 + 0.5 + 0.3 = 4.8

Điểm tháng = 373.0 / 4.8 = 77.7 điểm → Hạng B (Tốt)
```

**Phân tích:**
- 3 task quan trọng (QL giao + Dự án, weight 1.0) chiếm 240/373 = **64.3%** tổng điểm
- 3 task routine (Lặp lại, weight 0.5) chiếm 112/373 = **30.0%**
- 1 task tự giao (weight 0.3) chiếm 21/373 = **5.6%**

→ **Task QL giao quyết định hạng** — đúng mục đích thiết kế.

---

### So sánh: Nếu NV chỉ tự giao (gaming the system)

| # | Công việc | Loại | NV★ | Final Score | Weight | Score × Weight |
|---|-----------|------|-----|-------------|--------|----------------|
| 1 | Dọn dẹp kho | Tự giao | 5★=100 | 70 | 0.3 | 21.0 |
| 2 | Sắp xếp tài liệu | Tự giao | 5★=100 | 70 | 0.3 | 21.0 |
| 3 | Lau chùi máy | Tự giao | 5★=100 | 70 | 0.3 | 21.0 |
| 4 | Kiểm tra đèn | Tự giao | 5★=100 | 70 | 0.3 | 21.0 |
| 5 | Ghi chép sổ | Tự giao | 5★=100 | 70 | 0.3 | 21.0 |

```
Tổng Score × Weight = 105
Tổng Weight = 1.5

Điểm tháng = 105 / 1.5 = 70.0 điểm → Hạng C (Trung bình)
```

→ **5 task × 5 sao = vẫn chỉ Hạng C**. Không thể gian lận lên Hạng A/B.

---

### So sánh: NV chăm chỉ làm task QL giao

| # | Công việc | Loại | NV★ | QL★ | Final Score | Weight | Score × Weight |
|---|-----------|------|-----|-----|-------------|--------|----------------|
| 1 | Bảo trì máy | QL giao | 4★ | 5★ | 92 | 1.0 | 92.0 |
| 2 | Sửa chữa | QL giao | 4★ | 4★ | 80 | 1.0 | 80.0 |
| 3 | Lắp đặt | QL giao | 5★ | 4★ | 88 | 1.0 | 88.0 |

```
Điểm = (92 + 80 + 88) / 3.0 = 86.7 → Hạng B
```

→ **3 task QL giao tốt = Hạng B**, tốt hơn 5 task tự giao 5 sao (Hạng C).

---

## 7. XẾP HẠNG & ẢNH HƯỞNG LƯƠNG

| Hạng | Điểm | Đánh giá | Hệ số lương | Thưởng hiệu suất |
|------|------|---------|-------------|-------------------|
| **A** | 90 – 100 | Xuất sắc | × 1.00 (đủ lương) | 100% mức thưởng |
| **B** | 75 – 89 | Tốt | × 1.00 (đủ lương) | 50% mức thưởng |
| **C** | 60 – 74 | Trung bình | × 0.95 (trừ 5%) | Không thưởng |
| **D** | 40 – 59 | Cần cải thiện | × 0.90 (trừ 10%) | Không thưởng |
| **F** | < 40 | Không đạt | × 0.85 (trừ 15%) | Không thưởng |

**Hạng A và B:** Đủ lương + có thưởng → **khuyến khích nhân viên tốt**
**Hạng C trở xuống:** Trừ lương + không thưởng → **cảnh báo nhân viên kém**

---

## 8. MỐC THỜI GIAN

- **Task tạo tháng 3, hoàn thành tháng 5** → tính vào hiệu suất **tháng 5**
- **Task KT hàng ngày** → tính vào hiệu suất tháng hiện tại
- **Task lặp lại** → tính vào ngày hoàn thành
- **Điểm tháng** = chỉ tính task có `completed_date` trong tháng đó

---

## 9. TÓM TẮT 1 DÒNG CHO TỪNG LOẠI

```
QL giao:   2 người chấm, weight cao nhất (1.0) → quyết định hạng
Dự án:     Tự duyệt (×90%) + BẮT BUỘC ảnh, weight cao (1.0) → quan trọng
Lặp lại:   Tự duyệt, weight trung bình (0.5) → routine
Tự giao:   Tự duyệt, weight thấp nhất (0.3) → không thể gian lận
```

---

> Hướng dẫn tính điểm Task V3 — Huy Anh ERP
> Công ty TNHH MTV Cao su Huy Anh Phong Điền
> Cập nhật: 01/04/2026
