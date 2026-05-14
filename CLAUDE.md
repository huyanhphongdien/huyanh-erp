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
apps/weighbridge/  # Sub-app for weighbridge scale integration
```

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
- **NEVER** deploy this ERP project to Netlify `huyanh-rubber` site — that's the company website

## Database
- Supabase project linked via `npx supabase` CLI
- Migrations in `docs/migrations/` (manual SQL, run via Supabase dashboard or CLI)
- RLS enabled on most tables — use service role key for admin operations
- Key tables: employees, attendance, shifts, departments, positions, leave_requests, b2b_demand_offers, b2b_chat_messages

## Sales Contract Workflow
- Tab Hợp đồng bán: 3 actor
  - **Sale** lên HĐ (form Compose Studio, KHÔNG nhập bank)
  - **Phú LV** (phulv@huyanhrubber.com) = "Kiểm tra" → duyệt + nhập bank info
  - **Trung hoặc Huy** ký HĐ (upload PDF đã ký + đóng dấu)
- Bank info (5 field: account name/no/full_name/address/swift) chỉ Phú LV được nhập
- Migration: `docs/migrations/sales_contract_workflow.sql`
- Service: `src/services/sales/contractGeneratorService.ts`
- Templates: `public/contract-templates/template_{SC,PI}_{CIF,FOB}.docx`

## Git
- Single branch: `main`
- Push = auto-deploy to Vercel (huyanhrubber.vn)
- Commit messages: English, imperative, descriptive
- Co-author tag: `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`
