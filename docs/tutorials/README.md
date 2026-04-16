# 🎥 Kịch bản video hướng dẫn — Huy Anh ERP

3 video tutorial chính cho operator + nhân viên kho. Mỗi file là 1 kịch bản đầy đủ:
phân cảnh, lời thoại, click theo thứ tự, screenshot description, edge case.

| # | File | Thời lượng | Đối tượng |
|---|---|---|---|
| **1** | [01_nhap_kho_NVL_tu_dong.md](01_nhap_kho_NVL_tu_dong.md) | ~6 phút | NV cân + NV kho NVL |
| **2** | [02_xuat_kho_sales_order.md](02_xuat_kho_sales_order.md) | ~7 phút | NV cân PD + NV xuất khẩu |
| **3** | [03_chuyen_kho_lien_nha_may.md](03_chuyen_kho_lien_nha_may.md) | ~8 phút | NV TL/LAO + NV PD + BGD |

## Tools đề xuất quay

| Tool | Khi dùng | Note |
|---|---|---|
| **Loom** (loom.com) | Quick + share link | Free 5 phút/video, có AI auto-edit & caption |
| **OBS Studio** | Pro recording, full control | Free, nặng setup hơn |
| **Tella.tv** | Có template tutorial sẵn | Web-based, có AI cleanup |

Voice-over: **giọng tiếng Việt tự nhiên**. Nếu muốn giọng AI — dùng **ElevenLabs** (có Vietnamese voice) hoặc **HeyGen**.

## Quy ước trong kịch bản

- **`[CLICK X]`** — hành động click chuột
- **`[NHẬP: text]`** — gõ text vào ô input
- **`[ZOOM]`** — zoom màn hình lên 1 vùng để focus
- **`[CALLOUT]`** — vẽ box / mũi tên highlight
- **🎙️ "..."** — lời thoại narrator đọc
- **`(...)`** — note off-camera, không nói

## Pre-recording checklist (chung)

- [ ] DB Supabase clean (xóa data test cũ — Claude làm hộ qua service_role)
- [ ] Browser fullscreen, ẩn bookmark bar (Ctrl+Shift+B)
- [ ] Đã login đủ:
  - ERP: `huyanhrubber.vn` — account Lê Duy Minh
  - Trạm cân TL: `can-tl.huyanhrubber.vn` — operator PIN 1234
  - Trạm cân PD: `can.huyanhrubber.vn` — operator PIN 1234
- [ ] Resolution 1920×1080
- [ ] Tắt thông báo Slack/Email
- [ ] Đặt cursor highlight (Loom có sẵn, OBS cần plugin)
