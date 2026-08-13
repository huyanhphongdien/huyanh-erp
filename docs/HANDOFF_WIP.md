# BÀN GIAO TRẠNG THÁI ĐANG LÀM (WIP) — cập nhật 2026-08-11

> File này git-đồng bộ → mở trên máy khác bằng `git pull` rồi đọc. Ghi lại **việc đang dở + quyết định còn treo + quy tắc nghiệp vụ đã chốt** trong phiên làm việc.
> Bản memory local (máy này): `C:\Users\Admin\.claude\projects\d--Projects-huyanh-erp-9\memory\` — muốn mang memory sang máy khác thì copy nguyên thư mục đó.

Nhánh: `main` (mọi commit dưới đây ĐÃ push → Vercel auto-deploy `huyanhrubber.vn`).

---

## 1. ĐÃ XONG + DEPLOY trong phiên này

### A. Đồng nhất 2 dạng xem Đơn hàng bán (full-page vs Bảng/Split)
Cả `SalesOrderDetailPage.tsx` (trang) lẫn `SalesOrderDetailPanel.tsx` (Split/Drawer) giờ dùng **chung component** cho mọi tab → user không hoang mang.
- Đợt 1 Finance `FinanceTabV4` — 99a222d5
- Đợt 2 Shipping `ShippingTab` (superset: +Hải quan +Chi tiết Commercial Invoice) — af523b8a
- Đợt 4 Info `OrderInfoTab` (superset) + `QualityTab` chung + History (full-page thêm, admin) + Documents readonly — f9deac4a
- Đợt 3 Production `ProductionTab` (bản gọn) + trang riêng **`/sales/orders/:id/production`** (luồng MTO đầy đủ) + Packing `PackingTabPanel` (CRUD ở `/packing`) — eadd30df
- Đã xóa code chết (renderInfoTab/QualityTab/ProductionTab/PackingTab inline) + import thừa.

### B. Bộ chứng từ xuất khẩu — Hối phiếu (BOE) D/P + đơn ASIMCO HA20260075
- **Phân biệt BOE L/C vs D/P** (7721981b, 8d494fca): **L/C draw = THE COST** (CIF − cước − BH); **D/P draw = TỔNG CIF** (trị giá Invoice, không trừ). D/P có khối `The collecting bank's name / Bank address / Swift code` (NH người mua) + `TO = NGƯỜI MUA`. Code: `boeDoc` nhánh isDP (`docxExport.ts`) + `BillOfExchangeTab.tsx`. Số tiền draw NHẤT QUÁN ở BOE + `buildDnckDataDP` + `LcNegotiationTab.draftValue`.
- Thêm 2 cột `issuing_bank_address` + `issuing_bank_swift` vào `sales_order_lc_negotiations` (nhập ở tab Đơn chiết khấu → lên cả BOE + ĐNCK).
- **HA20260075 (ASIMCO NVH, China, D/P, CIF Shanghai, 403,2t, $895.104)** — id đơn `24084216-3615-4d92-8ff3-2d5d619057a7`:
  - Dọn data lẫn từ đơn mẫu GRI (332b4c92): invoice_no→HA20260075/CI, shipping_marks→null, consignee→ASIMCO, default_payment_method→dp, xóa NH Hatton.
  - Điền NH nhờ thu thật: **INDUSTRIAL AND COMMERCIAL BANK OF CHINA, XUANCHENG BR · SWIFT ICBKCNBJAHI** (+ địa chỉ) — lấy từ file `docs/du lieu tho/bo chung tu/ASIMCO 75 LOT 1.xlsm`.
  - Cước/BH sửa đúng công thức (017b6dda): cước **$100** (20×$5), BH **$433,23** → THE COST 894.570,77.
  - **Nhập LÔ 1 (5 cont) từ draft B/L SITC + tờ khai HQ** (chưa commit code, chỉ là data DB):
    - B/L số `SITGDASH078032`, tàu `YOUCAN V.2625N`, tờ khai HQ `308843870550` ngày 12/08/2026.
    - 5 container thật lô 1: SITU2675952/SITB157499 · CAAU2808527/SITB157500 · CAAU2728695/SITB157493 · SEKU1763783/SITB157496 · HPCU2851638/SITB157497 (gross 20.336, net 20.160, tare 176, 16 pallet mỗi cont).

### C. Bảo hiểm/cước — nút "Tính tự động" (bbad246f)
Tab Vận chuyển → mục Cước/Bảo hiểm có nút **"Tính tự động"**: **Bảo hiểm = trị giá CIF × 1,1 × 0,04% × 1,1** · **Cước = $5 × số cont**. Điền xong nhắc "kiểm tra lại". `ShippingTab.tsx`.

### D. Thu tiền THEO LÔ (9cad6a22 + 22546697 + aef51b78) — feature MỚI
- Migration: `sales_order_payments.lot_no INT NULL` (NULL = cả đơn).
- `salesOrderPaymentService.getLotBreakdown(đơn)` = trị giá lô (chia theo net) + đã thu/lô + trạng thái/lô; `getLotPaymentForOrders(ids)` batch cho Kanban.
- UI: QuickPayModal + PaymentHistorySection có **ô chọn Lô**; KanbanCard badge **"💵 x/y lô đã thu"**.
- `payment_status` cấp ĐƠN giữ nguyên (chỉ 'paid' khi thu đủ cả đơn). Ca gốc: đơn **HA20260059** (id `7f7d7b38-45e0-439f-8c6f-e8b06222eb44`) lô 2 đã trả/lô 1 chưa — 2 lô mỗi lô ~$50.820.

### E. Sửa lẻ
- Guide `public/huong-dan-nhap-lieu-bo-chung-tu.html`: nhiều lần cập nhật (PHỤ LỤC 3 ASIMCO sạch, công thức BH, văn phong trung tính, ngày 11/08).
- Phiếu cân **CX-PD-20260812-001** (Phong Điền): đổi đại lý Nguyễn Thị Lệ → **Nguyễn Thị Hương** (id partner `7dc0dce1-6ebd-45ad-bda2-269408c0dc7e`). Chỉ sửa DB, không code.

---

## 2. 🔴 CÒN TREO — quyết định / việc chưa xong

### HA20260075 (ASIMCO) — sau khi nhập lô 1
1. **ETD lệch:** DB đang **16/08/2026**, tờ khai HQ ghi **18/08/2026** ("ngày hàng đi dự kiến"). CHƯA đổi — chờ user chốt.
2. **Ngày B/L (on-board):** draft B/L chưa có ngày "SHIPPED ON BOARD"; DB để 16/08 tạm — chờ B/L final (~18/08) rồi cập nhật `bl_date`.
3. **Số vận đơn trên tờ khai = `122600045799937`** (KHÁC số B/L SITC SITGDASH078032). Là số EDI/HQ, chưa lưu ở đâu — hỏi user có cần lưu không.
4. **Container:** mới nhập LÔ 1 (5/20 cont). Lô 2–4 (15 cont còn lại) **chưa gán lô + chưa có số cont/seal** — chờ các draft B/L lô sau.
5. Trạng thái 5 cont lô 1 vẫn `planning` (chưa đẩy sang sealed dù đã lên B/L) — cân nhắc.

### Khác
6. **Phiếu cân CX-PD-20260812-001:** ô Tài xế = "chi le" (chị Lệ) — có thể cũng nhập nhầm theo đại lý cũ. Chờ user xác nhận tên tài xế thật.
7. **HA20260059:** lô 2 "đã trả tiền" nhưng **CHƯA ghi phiếu thu** (0 payment). Kế toán cần vào tab Tài chính / Công nợ / Kanban → "Ghi nhận đã thu" → **chọn Lô 2** → nhập số/ngày thật.
8. **AR aging theo lô:** trang `/sales/ar-aging` hiện chỉ per-đơn (QuickPay đã hỗ trợ lô). Nếu cần **bảng aging tách dòng từng lô** = 1 đợt nhỏ nữa (chưa làm).
9. **L/C `onPctChange`** (LcNegotiationTab): tự tính "Số tiền TL" theo `% × tổng CIF` thay vì `% × THE COST` — lệch nhẹ cho đơn L/C tách cước/BH. Bug PRE-EXISTING, đã flag, CHƯA sửa (ngoài phạm vi phiên này).
10. **D/A draw amount:** hiện D/P và D/A đều draw TỔNG CIF. Nếu có đơn D/P/D/A muốn draw THE COST → cần thêm tùy chọn.

---

## 3. QUY TẮC NGHIỆP VỤ ĐÃ CHỐT (nhớ khi làm tiếp)
- **BOE:** L/C draw = THE COST (FOB) · D/P/D/A draw = TỔNG CIF (trị giá Invoice).
- **Bảo hiểm = trị giá CIF × 1,1 (giá trị BH 110%) × 0,04% (phí) × 1,1 (VAT 10%)** · **Cước = $5 × số cont** (đơn giá cước có thể khác tuyến → sửa lại).
- **Thu tiền theo lô:** `lot_no` trên payment (NULL=cả đơn); trạng thái lô = SUM tiền gắn lô vs trị giá lô; payment_status cấp đơn KHÔNG đổi nghĩa.
- **Trị giá lô** = `total_value_usd × (net lô / tổng net container)` — khớp cách chia của `documentService`.
- **Cut-over / an toàn:** đã go-live 2026-06-02, data THẬT. Migration phải idempotent. KHÔNG `git add -A` (repo có file thô nhạy cảm). KHÔNG xoay/commit service_role key. User KHÔNG tự chạy SQL — apply qua `scratchpad/db.py` (RPC agent_sql, key từ .env.local).

---

## 4. TIẾP TỤC TRÊN MÁY KHÁC
1. `git pull` (mọi code + migration + guide + file này đã ở repo).
2. Migration đã áp prod rồi (idempotent) — không cần chạy lại, trừ khi DB máy khác trỏ instance khác.
3. Memory chi tiết ở thư mục `.claude/.../memory/` (máy này). Các memory chính liên quan: `project_order_ha20260075_asimco`, `project_invoice_data_entry_gaps`, `project_sales_ar_tracking`, `project_export_docs_system`, `project_so_lot_delivery_tracking`, `project_sales_order_revamp`.
4. Việc nên làm tiếp ưu tiên: chốt ETD đơn 75 (mục 2.1), ghi thu lô 2 đơn 59 (2.7), nhập lô 2–4 đơn 75 khi có B/L (2.4).
