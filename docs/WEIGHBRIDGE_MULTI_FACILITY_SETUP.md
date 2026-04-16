# Weighbridge Multi-Facility Deploy Guide (F2)

> Mục tiêu: 1 codebase `apps/weighbridge/`, 3 instance Vercel riêng cho **PD**, **TL**, **LAO**.
> Mỗi instance deploy subdomain riêng nhưng dùng chung Supabase.

---

## 1. Kiến trúc

```
apps/weighbridge/          ← single codebase
├── src/
│   └── stores/facilityStore.ts   ← đọc VITE_FACILITY_CODE
└── .env.example                   ← template env

Deploys (Vercel):
├── huyanh-weighbridge       → can.huyanhrubber.vn       (VITE_FACILITY_CODE=PD)
├── huyanh-weighbridge-tl    → can-tl.huyanhrubber.vn    (VITE_FACILITY_CODE=TL)
└── huyanh-weighbridge-lao   → can-lao.huyanhrubber.vn   (VITE_FACILITY_CODE=LAO)
```

Mỗi phiếu cân tạo ra sẽ được đóng dấu `facility_id` vào `weighbridge_tickets.facility_id`,
tự động đi kèm phiếu nhập/xuất kho khi auto-sync.

---

## 2. Prereq

- F1 migration `docs/migrations/multi_facility_foundation.sql` đã chạy (đã có bảng `facilities` + 3 dòng PD/TL/LAO).
- Kho NVL + TP của TL và LAO đã được seed (`KHO-TL-NVL`, `KHO-TL-TP`, `KHO-LAO-NVL`, `KHO-LAO-TP`).
- RLS của `facilities` cho phép authenticated/anon SELECT (public read).

---

## 3. Tạo deploy Tân Lâm (TL)

### 3.1 Vercel project mới

1. Vercel dashboard → **Add New Project** → import repo `huyanh-erp-8` (hoặc fork).
2. **Project name**: `huyanh-weighbridge-tl`
3. **Root Directory**: `apps/weighbridge`
4. **Framework Preset**: Vite
5. **Build Command**: `npm run build`
6. **Output Directory**: `dist`

### 3.2 Environment Variables

| Name | Value | Scope |
|---|---|---|
| `VITE_FACILITY_CODE` | `TL` | Production, Preview, Development |
| `VITE_SUPABASE_URL` | `https://dygveetaatqllhjusyzz.supabase.co` | All |
| `VITE_SUPABASE_ANON_KEY` | (copy từ project chính) | All |

> Feature flags `VITE_WEIGHBRIDGE_AUTOCREATE_STOCKIN` / `..._STOCKOUT` copy từ instance PD nếu muốn bật auto-sync.

### 3.3 Deploy + Domain

1. Click **Deploy**.
2. Sau khi build xong, vào **Settings → Domains** → add `can-tl.huyanhrubber.vn`.
3. Ở GoDaddy/DNS provider, tạo CNAME record `can-tl → cname.vercel-dns.com`.

### 3.4 Verify

- Mở `https://can-tl.huyanhrubber.vn`
- Header phải hiển thị **TRẠM CÂN TÂN LÂM** và badge `🏭 TL`
- Tạo 1 phiếu cân test → check Supabase: `weighbridge_tickets.facility_id` trỏ đúng facility TL.

---

## 4. Deploy Lào (LAO)

Giống TL, chỉ đổi:
- Project name: `huyanh-weighbridge-lao`
- `VITE_FACILITY_CODE=LAO`
- Domain: `can-lao.huyanhrubber.vn`

---

## 5. Troubleshooting

### Không load được facility
- Check Vercel env đã set `VITE_FACILITY_CODE` đúng chưa (không có space/lowercase).
- Check Supabase: `SELECT code FROM facilities WHERE is_active = true;` phải trả về hàng có code trùng.
- Check RLS policy của `facilities` cho role `anon` (weighbridge login dùng operator auth, không phải service_role).

### Ticket vẫn tạo ra với facility_id = NULL
- Hook `useCurrentFacility()` cần load xong trước khi tạo phiếu đầu tiên. Rất hiếm khi xảy ra vì page load async.
- Nếu có lỗi, check console log `Không load được facility`.

### Muốn fallback về PD nếu env không set
- Đã có sẵn ở `facilityStore.ts` → `getFacilityCode()` default `'PD'`. Không cần làm gì.

---

## 6. Rollback

- Xóa Vercel project `huyanh-weighbridge-tl` / `-lao` → không ảnh hưởng instance PD đang chạy.
- Ticket đã tạo với `facility_id` cũ vẫn giữ trong DB, không mất dữ liệu.

---

## 7. Checklist Deploy

- [ ] F1 migration chạy xong (facilities + warehouses seeded)
- [ ] `apps/weighbridge` build local OK với `VITE_FACILITY_CODE=TL npm run build`
- [ ] Vercel project `huyanh-weighbridge-tl` created
- [ ] Env vars set đủ (FACILITY_CODE + SUPABASE)
- [ ] Domain `can-tl.huyanhrubber.vn` mapped + DNS CNAME
- [ ] Smoke test: tạo 1 phiếu cân → verify `facility_id` = TL trong DB
- [ ] (Lặp lại cho LAO)
