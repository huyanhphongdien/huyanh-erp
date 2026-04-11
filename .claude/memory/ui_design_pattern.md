---
name: UI Design Pattern - AdvancedDataTable with inline detail
description: User confirmed preferred UI pattern — professional grid with filter row, inline expandable tabs, floating eye button, no page navigation for detail views
type: feedback
originSessionId: b320c014-dbf8-4431-8671-b3b7b32e51f5
---
Bảng dữ liệu chuyên nghiệp (AdvancedDataTable) là pattern chuẩn cho tất cả list pages.

**Why:** User xác nhận "đúng ý tôi rồi" (2026-04-10) khi thấy Deal list với inline tabs. Không muốn navigate sang trang detail riêng — muốn tất cả hiện ngay trong bảng.

**How to apply:**
- Dùng `AdvancedDataTable` (src/components/common/AdvancedDataTable.tsx) cho mọi list page
- Filter row dưới mỗi header (text input hoặc select dropdown)
- Sort bằng click header
- Date range picker global
- Nút "Xuất Excel" (exceljs, styled header, auto column width)
- Floating 👁 eye button khi hover dòng → click mở inline tabs (KHÔNG navigate)
- `expandedRowRender` hiện tabs chi tiết ngay trong bảng (Ant Design Tabs type="card")
- Row expand thay thế trang detail riêng (/xxx/:id)
- Tabs lazy-load (Suspense) để không load data cho tabs chưa click
- 4 KPI cards ở đầu tab Thông tin (Giá trị, Tạm ứng, Còn nợ, DRC)
- Màu header bảng: #1B4D3E (dark green)
- Zebra striping: #fff / #fafafa
- Hover row: #f0fdf4 (light green)
- Eye button: #1B4D3E circle → #059669 when expanded
