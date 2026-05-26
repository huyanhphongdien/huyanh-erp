# Deploy app cân (Weighbridge)

App cân là **sub-app riêng**, deploy độc lập với ERP chính (huyanhrubber.vn).
Cùng 1 codebase ở `apps/weighbridge/`, deploy 3 instance lên 3 subdomain với
env `VITE_FACILITY_CODE` khác nhau.

## Cấu hình 3 subdomain

| Subdomain | VITE_FACILITY_CODE | Mục đích |
|---|---|---|
| `can.huyanhrubber.vn` | `PD` | Phong Điền (HQ) |
| `can-tl.huyanhrubber.vn` | `TL` | Tân Lâm |
| `can-lao.huyanhrubber.vn` | `LAO` | Lào (Savannakhet) |

Tất cả dùng chung 1 Supabase DB.

## Cách 1 — Vercel Dashboard (Khuyên dùng)

1. Vào https://vercel.com → Login
2. Tìm project `huyanh-weighbridge-pd` (hoặc tên tương tự cho từng subdomain)
3. Settings → General → Root Directory = `apps/weighbridge`
4. Settings → Environment Variables → đảm bảo có:
   ```
   VITE_FACILITY_CODE=PD  (hoặc TL, LAO)
   VITE_SUPABASE_URL=https://dygveetaatqllhjusyzz.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   ```
5. Deployments → "Redeploy" trên build mới nhất

Lặp lại cho 3 project (PD/TL/LAO) — chỉ khác env `VITE_FACILITY_CODE`.

## Cách 2 — Vercel CLI

```bash
# Cài Vercel CLI (1 lần)
npm i -g vercel

# Login (1 lần)
vercel login

# Deploy từ thư mục apps/weighbridge
cd apps/weighbridge

# Pull config từ Vercel (lần đầu)
vercel link

# Deploy production
vercel --prod
```

Nếu có 3 project riêng, làm 3 lần với 3 lần `vercel link` đến project khác nhau.

## Verify sau deploy

1. Mở subdomain (vd `can-tl.huyanhrubber.vn`)
2. Login → Vào Cài đặt → Bảng quy đổi DRC từ Metrolac (ĐỐT)
3. Phải thấy **55 dòng** trong bảng (nếu chưa thấy → migration `sprint1_07_drc_lookup_table.sql` chưa chạy)
4. Test nhập 1 phiếu cân mới:
   - Vào Cân lần 1 (Gross)
   - Card "Đo DRC tại cân (Tân Lâm)" hiện
   - Gõ ĐỐT = 230 → DRC tự fill **42.4%** (lấy từ bảng tra, không phải công thức cũ)
   - Cân lần 2 (Tare) → lưu đầy đủ
5. Bấm "In phiếu" → A4 hoặc A5 → kiểm tra layout mới (header xanh, NET 26px lớn)

## Troubleshooting

- **Build error "cannot resolve @erp"**: Vercel chưa nhận `vite.config.ts` aliases.
  Đảm bảo Root Directory ở Vercel = `apps/weighbridge` chứ không phải `apps/weighbridge/src`.
- **App load nhưng không thấy facility name**: thiếu env `VITE_FACILITY_CODE`. Set
  trong Vercel Settings → Environment Variables.
- **Camera proxy offline**: `camera-proxy.cjs` cần chạy trên máy trạm cân (Windows).
  Chạy file `camera-proxy.exe` mỗi lần khởi động máy.
