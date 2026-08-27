# Huy Anh ERP System

## Project Overview
HRM & Task Management System for Huy Anh Rubber (Cao su Huy Anh).
Full-stack React + Supabase ERP covering: attendance, payroll, production, inventory, B2B portal, sales, accounting.

## Tech Stack
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + Ant Design (some pages)
- **Backend:** Supabase (PostgreSQL + Auth + Storage + RLS)
- **State:** Zustand (authStore, themeStore) + TanStack Query (server state)
- **Routing:** React Router v6 (lazy-loaded pages)
- **Deploy:** Vercel (auto-deploy from GitHub `main` branch)

## Architecture
```
src/
  features/        # Feature modules (attendance/, production/, sales/...)
  pages/           # Route pages (wms/, b2b/, hr/...)
  services/        # Supabase service layers (*.ts)
  components/      # Shared components (common/, layout/)
  stores/          # Zustand stores
  lib/             # supabase.ts client init
  App.tsx          # Router definition
docs/              # Mockups, migration SQL, specs
apps/weighbridge/  # Sub-app: truck weighbridge (2-pass weighing, cameras)
apps/retail-scale/ # Sub-app: "Cân mủ lẻ" — smallholder walk-in purchase (bench scale, 1-pass)
```

Sub-apps have their OWN `node_modules` (no npm workspaces) and their own Vercel project.
They import ERP services via the `@erp` alias → `../../src`; dependency flow is one-way
(sub-app → ERP, never the reverse).

## Key Conventions
- Vietnamese UI labels, Vietnamese comments where helpful
- Service files: `src/services/<domain>Service.ts` — all Supabase queries go here, never in components
- Pages: `src/features/<module>/<PageName>.tsx` or `src/pages/<module>/<PageName>.tsx`
- Lazy imports in App.tsx for code splitting
- Tailwind utility classes preferred over inline styles (except legacy pages)
- TanStack Query keys: `['entity-name', ...params]`; `staleTime: 5 * 60 * 1000` for heavy queries
- Supabase joins: use `!fk_name` syntax for explicit FK references

## Deploy Targets (CRITICAL)
- **huyanhrubber.vn** = ERP (this project) → Vercel, auto-deploy from GitHub `main`
- **huyanhrubber.com.vn** = Company website (DIFFERENT project) → Netlify site `huyanh-rubber`
- **b2b.huyanhrubber.vn** = B2B Partner Portal → Vercel, repo `huyanh-b2b-portal`
- **can{,-tl,-lao}.huyanhrubber.vn** = App cân xe → Vercel, Root Dir `apps/weighbridge`
- **canle{,-tl,-lao}.huyanhrubber.vn** = App Cân mủ lẻ → Vercel, Root Dir `apps/retail-scale`
  (bật "Include source files outside of the Root Directory" — alias `@erp` trỏ ra `../../src`)
- **NEVER** deploy this ERP project to Netlify `huyanh-rubber` site — that's the company website

## Database
- Supabase project linked via `npx supabase` CLI
- Migrations in `docs/migrations/` (manual SQL, run via Supabase dashboard or CLI)
- RLS enabled on most tables — use service role key for admin operations
- Key tables: employees, attendance, shifts, departments, positions, leave_requests, b2b_demand_offers, b2b_chat_messages

## Lô hàng bán & thanh toán theo lô
1 hợp đồng có nhiều lô; khách trả tiền **theo từng lô**, mỗi lô một lần chuyển tiền + chứng từ riêng.
- **Lô = `sales_order_lots`**, khoá nhận dạng `(sales_order_id, lot_no)` — đúng khoá mà
  `sales_order_containers.lot_no` và `sales_order_payments.lot_no` đã dùng sẵn.
  Cố ý KHÔNG thêm `lot_id` vào 2 bảng đó (2 nguồn sự thật sẽ lệch nhau).
- **`value_usd` = trị giá lô đã CHỐT** — mẫu số để kết luận "đã thu đủ chưa". Sửa tay được,
  vì số trên chứng từ phát cho khách mới là số đúng.
- ⚠ **Không bao giờ chia prorata** `total_value_usd × net_lô / Σnet`. Đó là bug đã gỡ 26/08/2026:
  lệch 7/20 lô, nặng nhất HA20260059 lô 1 ($473.760 prorata vs $50.820 Invoice), và mẫu số còn
  cộng cả container chưa gán lô. Công thức đúng = `net_lô/1000 × unit_price` (số trên Commercial
  Invoice), và tốt nhất là đọc thẳng `sales_order_lots.value_usd`.
- ⚠ `sales_order_containers.net_weight_kg` là số **động** (`containerService._recalcContainerTotals`
  ghi đè mỗi lần gán cont) → tính trị giá lô sống sẽ đổi sau khi đã phát hoá đơn. Phải chốt vào
  `value_usd`.
- Views: `v_sales_order_lot_payments` (1 dòng = 1 lô + tiền), `v_sales_order_lot_summary`
  (cuộn lên mức hợp đồng, có `unassigned_paid_usd` = tiền thu chưa gắn lô).
- Service: `src/services/sales/salesLotService.ts`; tính tiền theo lô ở
  `salesOrderPaymentService.getLotBreakdown` / `getLotPaymentForOrders`.
- Trang: `/sales/lots` (Sổ lô — dạng xem duy nhất lấy LÔ làm dòng).
- **Ký hiệu dùng chung: "viên lô"** (`src/components/sales/LotChipStrip.tsx`). 1 viên = 1 lô,
  **thân viên = trục GIAO** (nét đứt/xanh dương/xanh lá, tính từ container thật),
  **máng dưới = trục TIỀN**. Thứ tự đó bất biến ở mọi màn, tooltip luôn đọc 📦 trước 💵 sau.
  Từ 27/08/2026 nó THAY hai badge cũ `📦 x/y lô` và `💵 x/y lô đã thu` trên thẻ Kanban và
  cột Lô ở Sổ đơn hàng. Chấm đỏ góc viên = `lot_status` trái chứng cứ giao.
- ⚠ Danh sách trạng thái "container đã giao" tồn tại ở **HAI nơi không gộp được**:
  hằng `DELIVERED_CONTAINER_STATUSES` (dispatchService.ts) và chuỗi gõ cứng trong
  `sales_lots_p5_progress_union.sql`. Sửa một bên mà quên bên kia là tab Đóng gói và
  badge Kanban nói khác nhau.
- Migrations: `docs/migrations/sales_lots_p{1,2,3}_*.sql` — chạy theo thứ tự (đã áp production 26/08/2026).
- ⚠ Migration chạy qua RPC `agent_sql` **không được có `BEGIN`/`COMMIT`** (lỗi 0A000) — đã nằm sẵn
  trong transaction.

## Sales Contract Workflow
- Tab Hợp đồng bán: 3 actor
  - **Sale** lên HĐ (form Compose Studio, KHÔNG nhập bank)
  - **Kiểm tra** = `phulv@huyanhrubber.com` (default) **HOẶC** `minhld@huyanhrubber.com`
    → duyệt + nhập bank info. Cả 2 thấy chung queue, ai vào trước duyệt trước.
  - **Trung hoặc Huy** ký HĐ (upload PDF đã ký + đóng dấu)
- Bank info (5 field: account name/no/full_name/address/swift) chỉ Kiểm tra nhập
- Migration: `docs/migrations/sales_contract_workflow.sql` (V1)
  + `docs/migrations/sales_contract_workflow_v2_reviewers.sql` (mở rộng cho minhld)
  + `docs/migrations/sales_contract_workflow_v3_signers.sql` (Trung/Huy ký)
  + `docs/migrations/sales_contract_files_multi_v4.sql` (multi-file + delete)
  + `docs/migrations/sales_contract_workflow_v5_with_check.sql` (RLS hardening)
  + `docs/migrations/sales_contract_workflow_v6_auto_promote.sql` (HĐ signed → SO confirmed)
- Service: `src/services/sales/contractGeneratorService.ts` (sinh .docx)
  + `src/services/sales/salesContractWorkflowService.ts` (workflow CRUD)
- Page: `/sales/contracts/review` (queue Kiểm tra)
- Templates: `public/contract-templates/template_{SC,PI}_{CIF,FOB}.docx`
- **Cut-over (phương án A)**: HĐ trước 2026-05-14 không động vào, vẫn dùng `ContractFileSection` (upload PDF scan); HĐ mới (có row `sales_order_contracts`) dùng `ContractWorkflowSection`. `ContractTab.tsx` tự detect.

## Cân mủ lẻ (apps/retail-scale)
Hộ tiểu điền / khách vãng lai bán **mủ tạp** tại nhà máy — cân bàn RS232, **cân 1 lần**,
không bắt buộc CCCD, in phiếu nhiệt 80mm. Xem [docs/CAN_MU_LE_KE_HOACH.md](docs/CAN_MU_LE_KE_HOACH.md).
- **Không có bảng phiếu riêng**: phiếu = `weighbridge_tickets` với `ticket_type='retail'`,
  `status='completed'`, `has_items=false`; từng bao = `weighbridge_ticket_lots`.
  - Dùng `weighbridge_ticket_lots` **chứ không phải** `weighbridge_ticket_items`: bảng items có
    `chk_exactly_one_source` (bắt buộc deal/partner/supplier), trigger `allocate_ticket_item_weights()`
    ghi đè khối lượng theo prorata, và không có policy `anon`.
  - `has_items` phải là **false** — bật true là trigger phân bổ xoá mất số cân thật từng bao.
- **Tiền**: không chi tại cân. Phiếu chảy vào Đề nghị thanh toán (`payment_requests`) như mọi
  luồng mua mủ khác; `paymentRequestService.listAvailableTickets` lọc `ticket_type IN ('in','retail')`
  và lấy giá từ `weighbridge_tickets.unit_price` (`price_source='retail'`).
- **Giá mủ tạp = kg TƯƠI** (`price_unit='wet'`, không nhân DRC). Chỉ `mu_nuoc` mới là giá khô.
  ⚠ `src/services/b2b/intakeWalkinService.ts` nhân DRC cho mọi loại mủ — đó là **bug**, đừng bắt chước.
- Migrations: `docs/migrations/retail_scale_p{1,2,3}_*.sql` — chạy theo thứ tự.
  Kiểm tra DB sẵn sàng: `powershell -File docs/retail_scale_preflight.ps1`.
- Phiếu retail **không** sinh `rubber_intake_batches` (bridge chỉ chạy cho `ticket_type='in'`) —
  cố ý, để hộ tiểu điền không lọt vào `compute_monthly_bonus` của đại lý B2B.
- `apps/weighbridge` và `apps/retail-scale` dùng chung hook `src/hooks/useKeliScale.ts` nhưng
  **khác namespace localStorage** (`keli_scale` vs `rs_scale`) — chung key là ghim sai baud cho nhau.

## Git
- Single branch: `main`
- Push = auto-deploy to Vercel (huyanhrubber.vn)
- Commit messages: English, imperative, descriptive
- Co-author tag: `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`
