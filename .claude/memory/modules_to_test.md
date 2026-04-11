---
name: Modules cần test sau khi nâng cấp AdvancedDataTable
description: 5 module list pages đã rewrite sang AdvancedDataTable + inline detail cần test toàn bộ
type: project
originSessionId: b320c014-dbf8-4431-8671-b3b7b32e51f5
---
5 module đã nâng cấp giao diện (2026-04-10), cần test lại:

1. **B2B Deals** `/b2b/deals` — 8 tabs inline (Thông tin, Nhập kho, QC, Sản xuất, Tạm ứng, Xử lý mủ, Biên bản, Hợp đồng)
2. **Mua hàng PO** `/purchasing/orders` — KPI inline (total, VAT, invoice%, payment%)
3. **Nhập kho** `/wms/stock-in` — KPI inline (weight, items, grade)
4. **Quyết toán** `/b2b/settlements` — KPI inline (total, advanced, balance, aging)
5. **Lý lịch mủ** `/rubber/intake` — KPI inline (gross, net, DRC, unit_price)

Tất cả dùng AdvancedDataTable component với:
- Filter row per column
- Sort click header
- Date range picker
- Xuất Excel (exceljs)
- Floating 👁 → inline expand
- Không navigate sang trang detail

**Also pending**: Full B2B Deal workflow test (48 checklist items) — see docs/B2B_DEAL_WORKFLOW.md

**Why:** Rewrite giảm 1914 dòng code → 409 dòng. Cần verify không có regression bugs.

**How to apply:** Dành 1 session test riêng, đi qua từng module, click mỗi filter/sort/expand/export. Check docs/B2B_DEAL_WORKFLOW.md cho luồng deal đầy đủ.
