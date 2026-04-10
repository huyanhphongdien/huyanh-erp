# KẾ HOẠCH TRIỂN KHAI ERP VÀO VẬN HÀNH
## Huy Anh Rubber — Tháng 4/2026

---

## 1. HIỆN TRẠNG

### Hệ thống đã có
- 16 module ERP đầy đủ: Nhân sự, Chấm công, Nghỉ phép, Tăng ca, Lương, Đánh giá, Công việc, Dự án, Mua hàng, Kho/WMS, Sản xuất, QC, Lý lịch mủ, Bán hàng/Xuất khẩu, B2B Portal, Dashboard
- 3 website: huyanhrubber.vn (ERP), b2b.huyanhrubber.vn (Portal đại lý), huyanhrubber.com.vn (Trang công ty)
- Database Supabase, hosting Vercel, tự động deploy từ GitHub

### Vấn đề cần giải quyết
- Nhân viên nhà máy **chưa quen dùng** — quá nhiều menu, không biết bấm đâu
- Công nhân chỉ có điện thoại, chữ nhỏ, thao tác web phức tạp
- Không có tài liệu hướng dẫn
- Chưa có lý do đủ hấp dẫn để nhân viên **tự muốn** mở ERP mỗi ngày
- Một số quy trình vẫn dùng sổ tay / giấy / Zalo thay vì ERP

### Mục tiêu
> Trong 6 tuần, mỗi nhân viên dùng ERP **ít nhất 1 lần/ngày** cho công việc hàng ngày của họ, mà **không cần** ai nhắc.

---

## 2. NGUYÊN TẮC

### 2.1 Mỗi người chỉ thấy ĐÚNG thứ của mình
Ai mở ERP cũng thấy 16 module, 50+ menu → hoảng. Cần phân theo vai trò:

| Vai trò | Thấy khi mở ERP | Không cần thấy |
|---|---|---|
| Công nhân sản xuất | Check-in, Xem công, Xin nghỉ phép, Sản lượng ca | Kế toán, Mua hàng, B2B, Dự án, Sales |
| Tổ trưởng sản xuất | Lịch ca, Phân công, Duyệt phép, Sản lượng | Sales, AR Aging, Cash flow, Đại lý |
| Nhân viên Sale | Đơn hàng, Khách hàng, Shipment, Công nợ | Chấm công người khác, QC, Phối trộn |
| Kế toán | Công nợ, Thanh toán, Lương, Cash flow | QC, Phối trộn, Yard map, Sản xuất |
| Trưởng phòng | Dashboard phòng, Duyệt phép/OT, Task, Báo cáo | Chi tiết nhập kho, Cân xe |
| Giám đốc | Executive dashboard, Tổng quan 1 trang | Mọi thứ chi tiết |

### 2.2 Việc hàng ngày phải NHANH nhất
5 thao tác chiếm 80% thời gian:

| Thao tác | Hiện tại | Mục tiêu |
|---|---|---|
| Check-in | Mở web → login → tìm nút | Quét QR ở cổng, 1 chạm xong |
| Xem công | Mở web → menu → chọn tháng → tìm tên | Mở app → thấy ngay |
| Xin nghỉ phép | Mở web → Nghỉ phép → Tạo đơn → điền 5 field | Chat Zalo: "Xin nghỉ ngày mai" → Done |
| Duyệt phép/OT | Mở web → Phê duyệt → duyệt từng đơn | Notification → bấm Duyệt trên điện thoại |
| Ghi sản lượng | Mở web → Sản xuất → tìm lệnh → nhập số | Quét QR lệnh SX → nhập kg → Xong |

### 2.3 Không ÉP dùng — làm họ MUỐN dùng

| ❌ Cách sai | ✅ Cách đúng |
|---|---|
| "Bắt buộc dùng ERP từ hôm nay" | "Check-in trên app nhanh hơn, không cần xếp hàng ký sổ" |
| "Ai không nhập liệu bị phạt" | "Nhập xong thấy ngay lương tạm tính, công tháng, phép còn lại" |
| "Đọc hướng dẫn 20 trang" | Video 30 giây per tính năng, gửi qua Zalo nhóm |
| Training 1 buổi 50 người | Train 3 "champion" per phòng, họ dạy lại |

---

## 3. PHASE CHI TIẾT

### Phase 0: Trang chủ cá nhân (MyHomePage)
**Thời gian:** Tuần 1 (5 ngày)
**Mục tiêu:** Mỗi NV mở ERP lên thấy NGAY thứ mình cần

#### Thiết kế màn hình

```
┌─────────────────────────────────────┐
│  Xin chào, Xuân Quang 👋            │
│  Phòng QLSX · Ca sáng hôm nay       │
│                                     │
│  ┌──────────┐  ┌──────────┐        │
│  │ CÔNG T4  │  │ PHÉP CÒN │        │
│  │  18/22   │  │  8 ngày  │        │
│  │  ngày    │  │          │        │
│  └──────────┘  └──────────┘        │
│                                     │
│  [ ✅ Check-in ]  [ 📋 Xin phép ]  │
│                                     │
│  📌 Việc cần làm hôm nay:          │
│  • Kiểm tra lô SVR10 #2026-042     │
│  • Duyệt phiếu nhập kho #NK-156    │
│                                     │
│  💬 Hỏi AI: "Tháng này tôi trễ    │
│     mấy lần?"                       │
└─────────────────────────────────────┘
```

#### Kỹ thuật
- Tạo `src/features/home/MyHomePage.tsx`
- Gom data từ: `monthlyTimesheetService` (công), `leaveRequestService` (phép), `myTasksService` (task), `attendanceService` (check-in status)
- Route: `/` — thay thế Dashboard hiện tại làm trang mặc định
- Sidebar ẩn bớt menu theo `user.role` / `user.position.level`

#### Đo lường thành công
- [ ] 80% NV đăng nhập ít nhất 1 lần/ngày trong tuần đầu
- [ ] NV tự xem được công tháng mà không cần hỏi HR

---

### Phase 1: QR Check-in
**Thời gian:** Tuần 2 (5 ngày)
**Mục tiêu:** Thay thế sổ chấm công / GPS check-in bằng quét QR

#### Cách hoạt động
1. In **QR code cố định** dán ở cổng nhà máy (QR chứa mã location + secret key)
2. NV mở ERP trên điện thoại → bấm "Check-in" → camera quét QR → ✅ Done
3. Hệ thống ghi: employee_id + timestamp + location_verified = true

#### Ưu điểm so với GPS
- Không cần internet mạnh (QR = offline verify)
- Chính xác 100% (phải đứng ở cổng mới quét được)
- Nhanh: 3 giây thay vì chờ GPS lock 10-30 giây
- Không bị sai vị trí (GPS sai ±50m, nhà máy nhỏ dễ false positive)

#### Kỹ thuật
- Tạo `src/features/attendance/QRCheckInPage.tsx`
- Dùng thư viện `html5-qrcode` (free, nhẹ)
- QR payload: `HUYANH_CHECKIN:{location_id}:{daily_rotating_secret}`
- Backend validate secret + ghi attendance record

#### Đo lường thành công
- [ ] 90% NV check-in bằng QR thay GPS/sổ tay sau 1 tuần
- [ ] Thời gian check-in trung bình < 5 giây

---

### Phase 2: Zalo Bot Integration
**Thời gian:** Tuần 3-4 (10 ngày)
**Mục tiêu:** NV tương tác ERP qua Zalo — app họ đã dùng mỗi ngày

#### Các lệnh Zalo bot

| NV nhắn | Bot trả lời |
|---|---|
| "xem công" | "Tháng 4/2026: 18 công, trễ 2 lần, vắng 0. Phép còn: 8 ngày" |
| "xin nghỉ 15/4" | "Tạo đơn nghỉ phép 15/04 (Thứ Ba)? Phép còn 8 ngày. Reply OK để gửi" |
| "ok" | "✅ Đã gửi đơn nghỉ phép cho anh Minh duyệt" |
| "công việc" | "Bạn có 3 task: 1) Kiểm tra lô #042 (hạn 12/4) 2) Duyệt NK-156 3) Báo cáo tuần" |
| "ai chưa checkin" (quản lý) | "5 NV chưa check-in hôm nay: Quang, Linh, Hải, Lụa, Yến" |

#### Thông báo tự động qua Zalo

| Sự kiện | Ai nhận | Nội dung |
|---|---|---|
| 10h sáng, NV chưa check-in | Quản lý phòng | "5 NV phòng QLSX chưa check-in: [danh sách]" |
| Đơn nghỉ phép mới | Người duyệt | "Xuân Quang xin nghỉ 15/4. [Duyệt] [Từ chối]" |
| Task quá hạn | Người được giao | "Task 'Kiểm tra lô #042' đã quá hạn 1 ngày" |
| OT request | Người duyệt | "Hải Âu xin tăng ca 2h ngày 10/4. [Duyệt]" |
| Phép được duyệt | NV | "✅ Đơn nghỉ 15/4 đã được duyệt bởi anh Minh" |

#### Kỹ thuật
- Đăng ký Zalo OA (Official Account) — miễn phí
- Dùng Zalo OA API (webhook + send message)
- Tạo `src/services/zaloBotService.ts` — bridge giữa Zalo webhook và ERP services
- Supabase Edge Function nhận webhook từ Zalo → gọi ERP service → trả kết quả

#### Đo lường thành công
- [ ] 50%+ đơn nghỉ phép được tạo qua Zalo (thay vì web)
- [ ] Quản lý duyệt phép trong < 1 giờ (trước: 1-2 ngày vì không mở web)

---

### Phase 3: Executive Dashboard
**Thời gian:** Tuần 5 (5 ngày)
**Mục tiêu:** Giám đốc mở 1 trang thấy toàn bộ công ty

#### Thiết kế

```
┌─────────────────────────────────────────────────────┐
│  TỔNG QUAN HÔM NAY — 10/04/2026                    │
│                                                     │
│  👥 NHÂN SỰ          📦 SẢN XUẤT        💰 KINH DOANH│
│  42/48 check-in      45 tấn hôm qua    12.5 tỷ T4  │
│  3 NV trễ            2 lô đang QC      ↑8% vs T3   │
│  2 đơn chờ duyệt     TSR tồn: 15 tấn   3 đơn chờ   │
│                                                     │
│  ⚠️ CẢNH BÁO                                       │
│  • Tồn kho TSR thấp — đề xuất mua 30 tấn           │
│  • 2 task dự án ISO quá hạn 3 ngày                  │
│  • Công nợ đại lý Trung: 450 triệu quá hạn 15 ngày │
│                                                     │
│  📊 BIỂU ĐỒ                                        │
│  [Doanh thu 6 tháng] [Sản lượng/tuần] [Tỉ lệ OT]  │
│                                                     │
│  💬 "Hỏi AI: So sánh Q1 năm nay vs năm ngoái"     │
└─────────────────────────────────────────────────────┘
```

#### Kỹ thuật
- Tạo `src/features/executive/ExecutiveDashboardV2.tsx`
- Gom data từ: attendance (check-in count), production (output), sales (revenue), inventory (stock alerts), tasks (overdue), b2b (debt aging)
- Auto-refresh mỗi 5 phút
- Tích hợp AI chatbot (Phase 4)

#### Đo lường thành công
- [ ] Giám đốc mở dashboard mỗi sáng (thay vì hỏi miệng)
- [ ] Quyết định nhanh hơn nhờ data realtime

---

### Phase 4: AI Chatbot
**Thời gian:** Tuần 5-6 (song song với Phase 3)
**Mục tiêu:** Hỏi bất cứ gì về công ty, AI trả lời từ data ERP

#### Kiến trúc

```
User hỏi (text tiếng Việt)
    ↓
Claude API (Sonnet 4.6) + Tool Use
    ↓
Chọn tool phù hợp:
  • query_attendance → monthlyTimesheetService
  • query_tasks → taskService
  • query_sales → salesOrderService
  • query_inventory → inventoryService
  • query_employees → employeeService
  • query_leave → leaveRequestService
    ↓
Trả kết quả bằng tiếng Việt, format đẹp
```

#### Ví dụ hội thoại

```
👤 "Tháng này phòng QLSX ai đi trễ nhiều nhất?"
🤖 "Tháng 4/2026, phòng QLSX có 3 NV đi trễ:
     1. Đặng Thị Lụa — 4 lần (ngày 2, 5, 8, 12)
     2. Đỗ Thị Yến — 3 lần (ngày 1, 7, 11)
     3. Cao Phước Tiền — 2 lần (ngày 3, 9)
     Tổng phòng: 48 NV, tỉ lệ đúng giờ 87%"

👤 "Tồn kho SVR10 còn bao nhiêu?"
🤖 "SVR10 tồn kho: 32.5 tấn (Kho A: 20T, Kho B: 12.5T)
     Trung bình xuất 8 tấn/tuần → đủ dùng ~4 tuần.
     Đề xuất: đặt mua thêm nếu lead time > 2 tuần."

👤 "So sánh doanh thu Q1/2026 vs Q1/2025"
🤖 "Q1/2026: 38.2 tỷ VNĐ (↑12% vs Q1/2025: 34.1 tỷ)
     - T1: 11.5 tỷ (↑8%)
     - T2: 12.8 tỷ (↑15%)
     - T3: 13.9 tỷ (↑13%)
     Tăng trưởng chủ yếu từ thị trường EU (+22%)"
```

#### Kỹ thuật
- Tạo `src/services/aiChatService.ts` — gọi Claude API với tool definitions
- Tạo `src/features/ai-chat/AIChatWidget.tsx` — floating chat widget góc phải
- Claude API key lưu trong Supabase Edge Function (không expose ở frontend)
- Chi phí: ~$10-15/tháng cho 100-200 câu hỏi/ngày

#### Phân quyền
| Role | Được hỏi về |
|---|---|
| Nhân viên | Chỉ data của bản thân (công, phép, task) |
| Trưởng phòng | Data phòng mình (NV, attendance, task phòng) |
| Giám đốc/Admin | Toàn bộ data công ty |

#### Đo lường thành công
- [ ] Giảm 50% câu hỏi "tôi còn bao nhiêu phép?" gửi đến HR
- [ ] Quản lý tự tra cứu thay vì yêu cầu báo cáo

---

### Phase 5: Video Training
**Thời gian:** Tuần 6 (3 ngày)
**Mục tiêu:** Mỗi tính năng có video 30 giây, gửi Zalo nhóm

#### Danh sách video

| # | Video | Thời lượng | Đối tượng | Gửi qua |
|---|---|---|---|---|
| 1 | Cách check-in bằng QR | 30s | Tất cả NV | Zalo nhóm công ty |
| 2 | Cách xem công tháng | 20s | Tất cả NV | Zalo nhóm công ty |
| 3 | Cách xin nghỉ phép | 30s | Tất cả NV | Zalo nhóm công ty |
| 4 | Cách xin nghỉ phép qua Zalo | 20s | Tất cả NV | Zalo nhóm công ty |
| 5 | Cách duyệt đơn nghỉ phép | 20s | Quản lý | Zalo nhóm quản lý |
| 6 | Cách xem tổng quan công ty | 30s | Giám đốc | Gửi trực tiếp |
| 7 | Cách hỏi AI chatbot | 30s | Tất cả | Zalo nhóm công ty |
| 8 | Cách ghi sản lượng (QR) | 30s | Công nhân SX | Zalo nhóm SX |
| 9 | Cách tạo đơn hàng | 40s | Sale | Zalo nhóm Sale |
| 10 | Cách nhập phiếu nhận hàng | 40s | Kho | Zalo nhóm Kho |

#### Cách quay
- Quay bằng điện thoại (screen record)
- Không cần chuyên nghiệp — quan trọng là NGẮN và RÕ
- Mỗi video chỉ hướng dẫn 1 việc duy nhất
- Có phụ đề tiếng Việt (cho NV xem không bật tiếng)

#### Chiến lược phát tán
1. **Tuần 1**: Gửi video 1-4 (check-in + xem công + xin phép) vào Zalo nhóm toàn công ty
2. **Tuần 2**: Gửi video chuyên biệt vào nhóm từng phòng
3. **Hàng tháng**: Khi có tính năng mới → quay video 30s → gửi Zalo

---

## 4. TIMELINE TỔNG HỢP

```
Tuần 1 (14-18/4)    Phase 0: MyHomePage — mỗi NV thấy ngay thứ mình cần
                     ├── Thiết kế + code MyHomePage.tsx
                     ├── Role-based sidebar (ẩn menu không liên quan)
                     └── Deploy + test với 5 NV thí điểm

Tuần 2 (21-25/4)    Phase 1: QR Check-in
                     ├── Code QRCheckInPage.tsx
                     ├── In + dán QR ở cổng nhà máy
                     └── Thí điểm 1 phòng trước

Tuần 3-4 (28/4-9/5) Phase 2: Zalo Bot
                     ├── Đăng ký Zalo OA
                     ├── Code zaloBotService.ts + webhook
                     ├── Implement: xem công, xin phép, thông báo
                     └── Thí điểm phòng HC + QLSX

Tuần 5 (12-16/5)    Phase 3 + 4: Dashboard + AI Chatbot
                     ├── ExecutiveDashboardV2.tsx
                     ├── aiChatService.ts + AIChatWidget.tsx
                     ├── Đăng ký Claude API key
                     └── Test với ban giám đốc

Tuần 6 (19-23/5)    Phase 5: Training + Go-live
                     ├── Quay 10 video training 30s
                     ├── Gửi Zalo nhóm từng phòng
                     ├── Chỉ định 1 "champion" per phòng
                     └── Go-live toàn công ty
```

---

## 5. CHI PHÍ

### Chi phí đang trả (không đổi)
| Hạng mục | Chi phí | Ghi chú |
|---|---|---|
| Claude Max (Claude Code để dev) | $100/tháng | Đang trả rồi — không thay đổi |
| Supabase (database) | $0-25/tháng | Đang dùng — không thay đổi |
| Vercel (hosting 3 site) | $0/tháng | Free tier — không thay đổi |
| Domain huyanhrubber.vn | ~$10/năm | Đang trả rồi |

### Chi phí THÊM MỚI (duy nhất)
| Hạng mục | Chi phí | Ghi chú |
|---|---|---|
| **Claude API** (chatbot + OCR) | **~$10-15/tháng** (~250-350K VNĐ) | Pay-per-use, chỉ tốn khi có người dùng |
| Zalo OA | **$0** | Gói cơ bản miễn phí |
| In QR code | **~200K VNĐ 1 lần** | 5 tấm QR laminate dán ở cổng |
| Phát triển (code) | **$0** | Claude Code làm, đã có trong Claude Max |

### Tổng kết
```
Chi phí hiện tại (không đổi):     ~$100-125/tháng  (đang trả rồi)
Chi phí MỚI thêm duy nhất:       ~$10-15/tháng    (≈ 300K VNĐ — Claude API)
Chi phí 1 lần:                    ~200K VNĐ        (in QR)
```

> So sánh: ERP thương mại (SAP/Oracle/Odoo Enterprise) = $2,500-10,000/tháng cho 50 NV.
> Hệ thống Huy Anh tổng cộng ~$115-140/tháng — rẻ hơn **20-70 lần**.

---

## 6. ĐO LƯỜNG THÀNH CÔNG

### KPI sau 6 tuần

| Chỉ số | Hiện tại | Mục tiêu |
|---|---|---|
| % NV đăng nhập ERP mỗi ngày | ~10% | **80%** |
| Thời gian check-in trung bình | 30-60 giây (GPS) | **< 5 giây** (QR) |
| Đơn nghỉ phép qua ERP (vs giấy) | ~20% | **80%** |
| Thời gian duyệt phép/OT | 1-2 ngày | **< 2 giờ** |
| Câu hỏi HR "còn bao nhiêu phép?" | 10+/tuần | **0** (NV tự xem) |
| Giám đốc xem dashboard | Không bao giờ | **Mỗi sáng** |

### Cách đo
- Supabase log: đếm số lượt login/ngày per employee
- Attendance records: đếm QR vs GPS vs manual
- Leave requests: đếm source (web/zalo/paper)
- AI chat logs: đếm số câu hỏi/ngày

---

## 7. RỦI RO VÀ GIẢI PHÁP

| Rủi ro | Xác suất | Giải pháp |
|---|---|---|
| NV không chịu dùng | Cao | Bắt đầu bằng QR check-in (bắt buộc) + thấy lợi ích ngay (xem công) |
| Quản lý không duyệt trên ERP | Trung bình | Zalo notification push — duyệt 1 chạm, không cần mở web |
| Zalo API thay đổi policy | Thấp | Fallback: push notification qua web (PWA) |
| NV nhập sai data | Trung bình | Validation chặt trên form + AI suggest (auto-fill từ OCR) |
| Server down | Thấp | Vercel + Supabase có SLA 99.9%; QR check-in fallback offline |
| Nhân viên lớn tuổi khó dùng | Cao | Video 30s + champion phòng hỗ trợ 1:1 + UX đơn giản nhất có thể |

---

## 8. NGƯỜI PHỤ TRÁCH

| Vai trò | Người | Trách nhiệm |
|---|---|---|
| **Product Owner** | Giám đốc / Phó phòng | Quyết định ưu tiên, nghiệm thu |
| **Developer** | Claude Code | Code, deploy, test kỹ thuật |
| **Champion phòng HC** | 1 NV phòng HC | Test thí điểm, dạy NV phòng HC |
| **Champion phòng QLSX** | 1 NV phòng QLSX | Test thí điểm, dạy công nhân SX |
| **Champion phòng Kế toán** | 1 NV kế toán | Test thí điểm, dạy NV kế toán |
| **Quay video** | Bất kỳ ai có điện thoại | Screen record 30s per tính năng |

---

*Tài liệu tạo: 10/04/2026*
*Cập nhật lần cuối: 10/04/2026*
*Trạng thái: DRAFT — chờ duyệt từ ban giám đốc*
