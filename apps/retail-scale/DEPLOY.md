# Deploy app Cân mủ lẻ (`apps/retail-scale`)

App con độc lập với ERP chính (huyanhrubber.vn) và với app cân xe (`apps/weighbridge`).
Cùng 1 codebase, deploy nhiều instance lên nhiều subdomain, chỉ khác env `VITE_FACILITY_CODE`.

| Subdomain | `VITE_FACILITY_CODE` | Nhà máy |
|---|---|---|
| `canle.huyanhrubber.vn` | `PD` | Phong Điền (HQ) |
| `canle-tl.huyanhrubber.vn` | `TL` | Nhà máy Quảng Trị |
| `canle-lao.huyanhrubber.vn` | `LAO` | Lào (Savannakhet) |

Tất cả dùng chung 1 Supabase DB với ERP.

> **KHÔNG BAO GIỜ** deploy lên Netlify site `huyanh-rubber` — đó là website công ty
> (huyanhrubber.com.vn), khác hẳn dự án này.

---

## 0. Migration — ĐÃ CHẠY trên production (2026-08-21)

| Thứ tự | File | Không chạy thì gãy ở đâu |
|---|---|---|
| 1 | `docs/migrations/retail_scale_p1_ticket_type.sql` | Lưu phiếu → lỗi 23514 (CHECK `ticket_type`) |
| 2 | `docs/migrations/retail_scale_p2_lot_columns.sql` | Lưu chi tiết bao → lỗi cột `gross_kg` không tồn tại |
| 3 | `docs/migrations/retail_scale_p3_daily_price_anon.sql` | Ô "giá ngày" luôn rỗng, im lặng không báo lỗi |

Mỗi file idempotent và có khối VERIFY tự ném lỗi nếu chưa ăn.

Kiểm bất cứ lúc nào:

```powershell
powershell -File docs\retail_scale_preflight.ps1     # DB đã sẵn sàng chưa
powershell -File docs\retail_scale_smoke_test.ps1    # tạo/xoá 1 phiếu thử bằng anon key
```

Môi trường mới (staging, DB khác) thì chạy: `powershell -File docs\retail_scale_run_migrations.ps1`

---

## 1. Chạy local

```bash
cd apps/retail-scale
copy .env.example .env        # rồi điền VITE_SUPABASE_ANON_KEY
npm install
npm run dev                   # http://localhost:5175
```

- Cổng 5175 (ERP 5173, app cân xe 5174) → chạy song song 3 app không đụng nhau.
- **Bắt buộc Chrome hoặc Edge** (Web Serial API). Firefox/Safari không đọc được đầu cân.
- Repo **không dùng npm workspaces** → app con có `node_modules` riêng, phải `npm install`
  trong đúng thư mục này.

---

## 2. Deploy Vercel

1. Tạo **project Vercel MỚI** (đừng tái dùng project của app cân xe).
2. Settings → General → **Root Directory = `apps/retail-scale`**
3. Settings → General → bật **“Include source files outside of the Root Directory in the Build Step”**
   — bắt buộc, vì alias `@erp` trỏ ra `../../src`. Thiếu bước này build báo
   `Failed to resolve import @erp/...`.
4. Settings → Environment Variables:
   ```
   VITE_FACILITY_CODE=PD          (hoặc TL / LAO)
   VITE_SUPABASE_URL=https://dygveetaatqllhjusyzz.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   ```
5. Deploy. Lặp lại cho từng nhà máy, chỉ đổi `VITE_FACILITY_CODE`.

### Vì sao build được dù root repo không `npm install`

Vite phân giải bare-import theo thư mục **chứa file import**. File nằm ở `../../src` (alias
`@erp`) sẽ đi tìm `node_modules` ở gốc repo — nơi Vercel không hề cài gì khi Root Directory là
`apps/retail-scale` — và Vite **không** fallback. Cách né: liệt kê package vào `resolve.dedupe`
trong `vite.config.ts`, khi đó Vite phân giải từ thư mục app con.

**Hệ quả:** thêm bất kỳ dependency mới nào mà file trong `../../src` cũng import thì phải thêm
tên nó vào `dedupe`, nếu không build trên Vercel sẽ đỏ dù local vẫn xanh.

Muốn thử trước kịch bản Vercel ngay trên máy: đổi tên `node_modules` ở gốc repo thành
`node_modules.bak` rồi chạy `npm run build` trong `apps/retail-scale`. Xanh là yên tâm.

---

## 3. Máy trạm tại điểm cân

- **Đầu cân**: cắm cáp RS232/USB → mở app → Cài đặt → *Kết nối cổng COM* → chọn cổng.
  App tự dò thông số và nhớ lại (localStorage `rs_scale_config`, **riêng** với app cân xe).
- **Máy in nhiệt 80mm**: đặt làm máy in mặc định. Trong hộp thoại in đặt **Lề = Không** và bỏ
  tick **Đầu trang và chân trang**.
  Khổ giấy trong driver: đặt **custom rộng 72mm, chiều dài TỐI ĐA** mà driver cho phép
  (Xprinter/Gprinter thường tới vài nghìn mm). **Đừng chọn 72 × 297mm** — app tự đo chiều
  cao thật của phiếu rồi khai vào `@page` lúc in, nhưng nếu form vật lý của driver ngắn hơn
  thì Chrome vẫn ngắt trang và máy cắt ngang giữa phiếu nhiều bao.
- Một máy tính chỉ mở được **1 cổng COM tại một thời điểm**. Nếu máy đó đang chạy app cân xe
  thì không mở đồng thời 2 tab cùng đọc cân.

---

## 4. Kiểm tra sau deploy

1. Đăng nhập PIN (bảng `scale_operators`).
2. Cài đặt → thấy đúng tên nhà máy theo `VITE_FACILITY_CODE`.
3. Cân thử 1 phiếu 2 bao, đơn giá bất kỳ → Lưu → phiếu 80mm hiện ra, có QR.
4. Mở ERP → **Mủ / Đề nghị thanh toán / Tạo mới** → chọn đúng nhà máy → phiếu vừa cân phải
   hiện với badge **Mủ lẻ** và nhãn giá **Giá tại cân** (không phải “⚠ Chưa có giá”).
5. Xoá phiếu thử: huỷ trong app (nút Huỷ) — phiếu chuyển trạng thái *Đã huỷ*, không mất dấu vết.

## 5. Lỗi hay gặp

| Triệu chứng | Nguyên nhân |
|---|---|
| Màn hình trắng ngay khi mở | Thiếu `.env` — `src/lib/supabase.ts` throw lúc import |
| Lưu phiếu báo lỗi 23514 | Chưa chạy migration p1 |
| Lưu phiếu báo thiếu cột `gross_kg` | Chưa chạy migration p2 |
| Ô giá ngày luôn trống | Chưa chạy migration p3, **hoặc** kế toán chưa đặt giá cho `mu_tap` |
| Build Vercel: `Failed to resolve @erp/...` | Chưa bật “Include source files outside of the Root Directory” |
| Build Vercel: `Failed to resolve <package>` | Package đó chưa có trong `resolve.dedupe` hoặc chưa có trong `package.json` |
| Không thấy nút Kết nối cổng COM ăn | Không phải Chrome/Edge, hoặc trang không chạy trên HTTPS/localhost |
