# Hướng dẫn cài đặt Trạm Cân - can.huyanhrubber.vn

## Tổng quan

App Trạm Cân là ứng dụng web chạy tại **https://can.huyanhrubber.vn**, dùng chung database Supabase với ERP chính. Nhân viên cân đăng nhập bằng PIN 4 số, tạo phiếu cân, ghi trọng lượng từ đầu cân Keli, và chụp ảnh từ camera Dahua.

## Yêu cầu phần cứng

| Thiết bị | Mô tả | Kết nối |
|----------|-------|---------|
| Máy tính | Windows 10+ hoặc Linux | — |
| Đầu cân Keli D2008FA | Bất kỳ model Keli nào | USB-RS232 (cổng COM) |
| Camera Dahua (x3) | Trước xe, Sau xe, Trên cao | Mạng LAN (Ethernet) |
| Máy in (tùy chọn) | In phiếu cân | USB hoặc mạng |

## Yêu cầu phần mềm

- **Trình duyệt**: Google Chrome 89+ hoặc Microsoft Edge 89+ (bắt buộc — cần Web Serial API)
- **Node.js**: v18+ (để chạy camera proxy)
- **Driver USB-RS232**: Cài driver cho cáp USB-to-Serial (CH340, PL2303, FTDI...)

---

## Bước 1: Cài đặt Camera Proxy

Camera Dahua dùng Digest Authentication, trình duyệt không gọi trực tiếp được. Cần chạy một proxy nhỏ trên máy trạm cân.

### 1.1 Cài Node.js

Tải và cài từ: https://nodejs.org/ (chọn bản LTS)

### 1.2 Tải file proxy

Tạo thư mục `C:\TramCan\` và copy file `camera-proxy.cjs` vào:

```
C:\TramCan\camera-proxy.cjs
```

File này nằm trong repo tại: `apps/weighbridge/camera-proxy.cjs`

### 1.3 Chạy proxy

Mở **Command Prompt** hoặc **PowerShell**:

```bash
cd C:\TramCan
node camera-proxy.cjs
```

Kết quả:
```
📷 Camera Proxy chạy tại http://localhost:3456
   Health: http://localhost:3456/health
```

### 1.4 Kiểm tra proxy

Mở trình duyệt, truy cập:
```
http://localhost:3456/health
```
Phải thấy: `{"status":"ok",...}`

### 1.5 (Tùy chọn) Chạy proxy tự động khi khởi động Windows

Tạo file `C:\TramCan\start-proxy.bat`:
```bat
@echo off
cd /d C:\TramCan
node camera-proxy.cjs
```

Nhấn `Win + R` → gõ `shell:startup` → Enter → Copy shortcut của `start-proxy.bat` vào thư mục Startup.

---

## Bước 2: Cấu hình Camera Dahua

### 2.1 Kiểm tra IP camera

Đảm bảo 3 camera Dahua cùng mạng LAN với máy trạm cân:

| Camera | Vị trí | IP mặc định |
|--------|--------|-------------|
| Camera 1 | Trước xe | 192.168.1.176 |
| Camera 2 | Sau xe | 192.168.1.177 |
| Camera 3 | Trên cao | 192.168.1.180 |

### 2.2 Kiểm tra cổng HTTP

Vào web interface camera (mở trình duyệt → nhập IP camera), vào **Cài đặt → Mạng → Cổng** → xem **Cổng HTTP** (thường là **80**).

### 2.3 Test snapshot

Mở trình duyệt, truy cập (thay IP và password):
```
http://localhost:3456/snapshot?ip=192.168.1.176&port=80&channel=1&user=admin&pass=YOUR_PASSWORD
```

Phải thấy hình ảnh từ camera.

### 2.4 Cấu hình trong App

1. Mở https://can.huyanhrubber.vn
2. Đăng nhập → vào phiếu cân
3. Nhấn **⚙️** (bánh răng) ở phần Camera
4. Nhập IP, Port (80), Username (admin), Password cho từng camera
5. Nhấn **Lưu**

Cấu hình camera được lưu trong localStorage của trình duyệt (mỗi máy tính cấu hình 1 lần).

---

## Bước 3: Kết nối Đầu cân Keli

### 3.1 Cắm cáp USB-RS232

1. Cắm cáp USB-to-RS232 vào máy tính
2. Nối đầu RS232 vào cổng COM của đầu cân Keli D2008FA
3. Kiểm tra trong **Device Manager** → **Ports (COM & LPT)** → thấy COM port (ví dụ: COM3)

### 3.2 Cấu hình đầu cân trong App

1. Mở https://can.huyanhrubber.vn
2. Vào phiếu cân → nhấn nút **⚙️ Cài đặt cân** (hoặc icon cân)
3. Chọn:
   - **Baud Rate**: 9600 (mặc định, hoặc theo cấu hình đầu cân)
   - Data Bits: 8, Stop Bits: 1, Parity: None
4. Nhấn **Kết nối**
5. Trình duyệt sẽ hiện popup chọn cổng COM → chọn đúng cổng
6. Nếu thành công, trạng thái hiện **"Cân online"** (xanh lá)

### 3.3 Các baud rate hỗ trợ

| Baud Rate | Ghi chú |
|-----------|---------|
| 1200 | Chậm, ít dùng |
| 2400 | — |
| 4800 | — |
| **9600** | **Mặc định** |
| 19200 | — |
| 38400 | — |
| 57600 | — |
| 115200 | Nhanh nhất |

### 3.4 Cân thủ công (không có đầu cân)

Nếu chưa kết nối đầu cân, app sẽ hiện ô nhập **"Nhập trọng lượng thủ công (kg)"** → nhập số → nhấn **GHI CÂN**.

---

## Bước 4: Đăng nhập và Sử dụng

### 4.1 Truy cập

Mở Chrome → vào **https://can.huyanhrubber.vn**

### 4.2 Đăng nhập

- Chọn tên nhân viên cân từ dropdown
- Nhập PIN 4 số
- Nhấn **Đăng nhập**

Tài khoản mặc định:

| Tên | PIN |
|-----|-----|
| Nhân viên cân 1 | 1234 |
| Nhân viên cân 2 | 5678 |

### 4.3 Tạo phiếu cân mới

1. Nhấn **"Tạo phiếu cân mới"** (hoặc phím tắt **F2**)
2. Chọn nguồn mủ:
   - **Theo Deal**: chọn Deal B2B đang active
   - **Theo NCC**: chọn nhà cung cấp trực tiếp
3. Nhập **biển số xe**, tên tài xế
4. Chọn loại mủ, DRC kỳ vọng, đơn giá, vị trí đổ
5. Nhấn **Tạo phiếu & Bắt đầu cân**

### 4.4 Ghi cân

1. **CÂN LẦN 1 (GROSS)**: Xe đầy hàng lên bàn cân → nhấn **GHI CÂN LẦN 1 (F5)**
   - Camera tự động chụp 3 ảnh + lưu vào database
2. **CÂN LẦN 2 (TARE)**: Xe rỗng lên bàn cân → nhấn **GHI CÂN LẦN 2 (F5)**
   - Camera tự động chụp thêm 3 ảnh
3. **NET = GROSS - TARE** (tự động tính)
4. Nhấn **HOÀN TẤT (F8)**

### 4.5 Phím tắt

| Phím | Chức năng |
|------|-----------|
| **F2** | Tạo phiếu mới |
| **F5** | Ghi cân |
| **F8** | Hoàn tất phiếu |
| **F9** | In phiếu |
| **F12** | Chụp tất cả camera |
| **Esc** | Quay lại |

### 4.6 In phiếu

- Nhấn **F9** hoặc nút **In** trên phiếu
- Chọn cỡ giấy: **A4**, **80mm**, **58mm** (máy in nhiệt)
- Phiếu có mã QR để quét kiểm tra thông tin

---

## Bước 5: Quản lý tài khoản nhân viên cân

Thêm/sửa tài khoản trong **Supabase Dashboard → Table Editor → scale_operators**:

| Cột | Mô tả |
|-----|-------|
| name | Tên nhân viên |
| pin_code | Mã PIN 4 số |
| station | Trạm cân (Trạm 1, Trạm 2...) |
| is_active | true/false |

---

## Khắc phục sự cố

### Camera không chụp được

1. Kiểm tra proxy đang chạy: `http://localhost:3456/health`
2. Test snapshot trực tiếp: `http://localhost:3456/snapshot?ip=...&port=80&channel=1&user=admin&pass=...`
3. Kiểm tra IP camera có ping được không: `ping 192.168.1.176`
4. Kiểm tra port HTTP camera đúng (thường 80, không phải 37777)
5. Kiểm tra password camera đúng (lỗi 401 = sai password)

### Đầu cân không kết nối

1. Kiểm tra cáp USB-RS232 trong Device Manager → thấy COM port
2. Đảm bảo baud rate khớp giữa app và đầu cân
3. Thử đổi baud rate (9600 → 19200 → 4800)
4. Đóng các phần mềm khác đang dùng COM port
5. Dùng Chrome/Edge (Firefox, Safari không hỗ trợ Web Serial API)

### Lỗi "row-level security policy"

Chạy SQL trong Supabase:
```sql
CREATE POLICY "Allow all access to weighbridge_tickets"
  ON weighbridge_tickets FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to weighbridge_images"
  ON weighbridge_images FOR ALL
  USING (true) WITH CHECK (true);
```

### Lỗi 404 khi refresh trang

Đảm bảo file `vercel.json` tồn tại trong `apps/weighbridge/`:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

---

## Kiến trúc hệ thống

```
┌─────────────────────────────────────────────────────┐
│                    CLOUD                             │
│                                                     │
│  can.huyanhrubber.vn ──► Vercel (Static React App)  │
│  Supabase ──► Database + Storage (ảnh camera)       │
│                                                     │
└─────────────────────────────────────────────────────┘
                          │
                     Internet
                          │
┌─────────────────────────────────────────────────────┐
│                MÁY TRẠM CÂN (LAN)                  │
│                                                     │
│  Chrome ──► can.huyanhrubber.vn                     │
│                                                     │
│  localhost:3456 ──► Camera Proxy (Node.js)           │
│       │                                             │
│       ├──► Camera Dahua 1 (192.168.1.176:80)        │
│       ├──► Camera Dahua 2 (192.168.1.177:80)        │
│       └──► Camera Dahua 3 (192.168.1.180:80)        │
│                                                     │
│  COM Port ──► Đầu cân Keli D2008FA (USB-RS232)     │
│                                                     │
└─────────────────────────────────────────────────────┘
```
