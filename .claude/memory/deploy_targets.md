---
name: Deploy targets for huyanh-erp-8
description: How and where to deploy the ERP project, and which sites NOT to touch
type: project
---

ERP project (`d:\Projects\huyanh-erp-8`) deploy như sau:

- **huyanhrubber.vn = ERP** → host trên **Vercel**, team `huy-anhs-projects-c8adbd95`, project `huyanh-erp`. Auto-deploy từ GitHub repo `huyanhphongdien/huyanh-erp` (branch `main`). Dashboard: https://vercel.com/huy-anhs-projects-c8adbd95/huyanh-erp/deployments. **Cách deploy: chỉ cần `git push origin main`** — Vercel webhook tự build. KHÔNG dùng `netlify deploy` cho ERP.
- **huyanhrubber.com.vn = trang web công ty** (corporate website) → host trên Netlify, site `huyanh-rubber` (id `c1c91099-6c9f-4618-a4af-b6d966065998`). **TUYỆT ĐỐI KHÔNG deploy ERP build lên site này.**
- Vercel CLI account `stresshuyanh` (team `stresshuyanhs-projects`) KHÔNG có quyền vào team `huy-anhs-projects-c8adbd95`, nên không trigger redeploy thủ công được từ CLI hiện tại — phải qua GitHub push hoặc dashboard.

**Why:** Ngày 2026-04-09 đã lỡ chạy `netlify deploy --prod --site=c1c91099-...` (site huyanh-rubber) cho ERP build, ghi đè trang công ty huyanhrubber.com.vn. Phải rollback bằng `netlify api restoreSiteDeploy` về deploy `69cd28402f02d586f61c95e0` (2026-04-01). Nguyên nhân nhầm: tưởng huyanhrubber.com.vn là ERP, thực ra ERP nằm ở huyanhrubber.vn trên Vercel chứ không phải Netlify.

**How to apply:**
- Khi user nói "deploy ERP" / "deploy lên huyanhrubber.vn": chỉ cần `git push origin main`, KHÔNG chạy netlify CLI. Sau đó hướng dẫn user check Vercel dashboard.
- Trước khi chạy bất cứ `netlify deploy` nào trong project này, dừng lại và hỏi user — nhiều khả năng là sai tool.
- Nếu user nói "deploy trang công ty": đó là Netlify site `huyanh-rubber`, nhưng project này KHÔNG phải repo của trang công ty — repo trang công ty ở chỗ khác (cần hỏi user).
