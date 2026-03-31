# PHÂN TÍCH LỖI HỆ THỐNG CHẤM CÔNG

> **Ngày:** 31/03/2026
> **Mức độ:** NGHIÊM TRỌNG — ảnh hưởng tính lương
> **Cần fix trước khi:** Chốt công tháng 3/2026

---

## 1. CÁC LỖI PHÁT HIỆN

### Lỗi 1: 116 records working_minutes = 0 dù đã checkout 🔴

```
Ví dụ:
  2026-03-01 | Check-in: 06:06 | Check-out: 18:00 | working_minutes: 0
  → Làm 12h nhưng hệ thống ghi 0h → MẤT 1.5 CÔNG

Nguyên nhân: Auto-checkout (pg_cron) update check_out_time
  nhưng KHÔNG tính working_minutes
```

### Lỗi 2: 112 records late > 480 phút (bất thường) 🔴

```
Ví dụ:
  2026-03-30 | Check-in: 06:56 | Ca: 07:00-17:00 | late: 1,436 phút
  → Check in TRƯỚC ca 4 phút nhưng bị tính trễ 24h

Nguyên nhân: Cross-midnight logic tính sai cho ca ngày
  hoặc shift detection gán nhầm ca hôm trước
```

### Lỗi 3: 39 records chưa checkout tháng 3 🟡

```
NV quên check-out → working_minutes = 0 → mất công
Cần: Auto-checkout xử lý đúng (tính working_minutes khi auto)
```

### Lỗi 4: Chưa có cột "công" (work_units) 🟡

```
Hiện tại: chỉ có working_minutes (phút)
Chưa có: work_units (công)
  Ca 8h = 1.0 công
  Ca 12h ngày/đêm = 1.5 công
```

---

## 2. QUY TẮC TÍNH CÔNG HUY ANH

| Ca | Giờ | Nghỉ | Thực làm | Công |
|----|-----|------|---------|------|
| SHORT_1 (Ca 1 ngắn) | 06:00-14:00 | 1h | 7h | **1.0** |
| SHORT_2 (Ca 2 ngắn) | 14:00-22:00 | 1h | 7h | **1.0** |
| SHORT_3 (Ca 3 ngắn) | 22:00-06:00 | 1h | 7h | **1.0** |
| ADMIN_PROD (HC SX) | 07:00-17:00 | 1h | 9h | **1.0** |
| ADMIN_OFFICE (HC VP) | 08:00-17:00 | 1h | 8h | **1.0** |
| **LONG_DAY (Ngày dài)** | 06:00-18:00 | 1h | 11h | **1.5** |
| **LONG_NIGHT (Đêm dài)** | 18:00-06:00 | 1h | 11h | **1.5** |

**Quy tắc:**
- Tất cả ca ≤ 8h thực làm = **1.0 công**
- Ca ngày dài + Ca đêm dài (12h) = **1.5 công**
- Công = work_units từ shift, KHÔNG tính theo working_minutes / 480

---

## 3. SQL CẦN CHẠY

```sql
-- 1. Thêm cột work_units cho shifts
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS work_units NUMERIC(3,1) DEFAULT 1.0;

-- 2. Thêm cột work_units cho attendance
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS work_units NUMERIC(3,1) DEFAULT 0;

-- 3. Set công cho từng ca
UPDATE shifts SET work_units = 1.5 WHERE code IN ('LONG_DAY', 'LONG_NIGHT');
UPDATE shifts SET work_units = 1.0 WHERE code NOT IN ('LONG_DAY', 'LONG_NIGHT');

-- 4. Backfill work_units cho attendance có checkout
UPDATE attendance a
SET work_units = COALESCE(
  (SELECT s.work_units FROM shifts s WHERE s.id = a.shift_id),
  1.0
)
WHERE a.check_out_time IS NOT NULL
  AND a.status IN ('present', 'late', 'early_leave', 'late_and_early');

-- 5. Fix working_minutes = 0 cho records có checkout
UPDATE attendance
SET working_minutes = GREATEST(0,
  EXTRACT(EPOCH FROM (check_out_time::timestamp - check_in_time::timestamp)) / 60 - 60
)
WHERE check_out_time IS NOT NULL
  AND working_minutes = 0;

-- 6. Fix late > 480 phút (bất thường)
-- Cần kiểm tra từng record thủ công hoặc reset về 0
UPDATE attendance
SET late_minutes = 0, status = 'present'
WHERE late_minutes > 480
  AND check_in_time IS NOT NULL;

-- 7. Verify
SELECT
  COUNT(*) AS total,
  COUNT(CASE WHEN work_units > 0 THEN 1 END) AS has_units,
  COUNT(CASE WHEN working_minutes = 0 AND check_out_time IS NOT NULL THEN 1 END) AS zero_minutes,
  COUNT(CASE WHEN late_minutes > 480 THEN 1 END) AS bad_late
FROM attendance
WHERE date >= '2026-03-01';
```

---

## 4. CODE CẦN SỬA

### 4.1 Checkout logic — Thêm work_units

File: `src/services/attendanceService.ts` — hàm `checkOut()`

```typescript
// Sau khi tính workingMinutes (line ~692), thêm:
let workUnits = 1.0
if (openRecord.shift) {
  // Lấy work_units từ shift
  workUnits = openRecord.shift.work_units || 1.0
}

// Trong update (line ~758), thêm:
work_units: workUnits,
```

### 4.2 Auto-checkout (pg_cron) — Tính working_minutes

Kiểm tra function auto_checkout trong database — đảm bảo nó tính `working_minutes` khi auto checkout, không chỉ set `check_out_time`.

### 4.3 Check-in logic — Fix late calculation

File: `src/services/attendanceService.ts` — hàm check-in

```typescript
// Đảm bảo: nếu check_in TRƯỚC shift_start → late = 0 (present)
// Hiện tại đúng (diffMinutes < 0 → không late)
// Nhưng cần kiểm tra cross-midnight cases
```

### 4.4 Chấm công tháng — Hiện cột "Công"

File: Trang chấm công tháng — thêm cột tổng công:
```
Tổng công = SUM(work_units) cho tháng đó
```

---

## 5. ẢNH HƯỞNG

| Nếu không fix | Hậu quả |
|--------------|---------|
| working_minutes = 0 | NV mất công → thiếu lương |
| late 1,436 phút | NV bị đánh giá "trễ" nặng → ảnh hưởng hiệu suất |
| Chưa có work_units | Không tính được lương theo công |
| Auto-checkout sai | 116 records sai → ~30% data tháng 3 |

---

## 6. KẾ HOẠCH FIX

| Bước | Việc | Effort | Rủi ro |
|------|------|--------|--------|
| 1 | Chạy SQL fix (mục 3 ở trên) | 10 phút | Thấp — chỉ thêm cột + fix data |
| 2 | Sửa checkOut() thêm work_units | 30 phút | Thấp |
| 3 | Sửa auto-checkout tính working_minutes | 1 giờ | Trung bình — cần test kỹ |
| 4 | Sửa trang chấm công tháng hiện "Công" | 1 giờ | Thấp |
| 5 | Test toàn bộ + verify data tháng 3 | 30 phút | — |

**Tổng: ~3 giờ**

---

> Phân tích lỗi chấm công — Huy Anh Rubber ERP v8
> 31/03/2026
