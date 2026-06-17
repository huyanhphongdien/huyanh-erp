# Báo cáo thu mua mủ hằng ngày — Triển khai

Edge function `daily-rubber-report` gửi mail BGĐ lúc **~00:01 giờ VN (đầu ngày)**, tổng hợp
**TRỌN NGÀY HÔM TRƯỚC** (số liệu 00:00–24:00). Bố cục khớp `MAIL_BAO_CAO_THU_MUA_MOCK.html`.

> **Vì sao chạy đầu ngày, không phải 18:00?** Bản cũ chạy 18:00 chỉ gom được 00:00–18:00 nên
> **miss các phiếu cân buổi tối**. Chạy ngay sau nửa đêm + chế độ `prevday` đảm bảo gom đủ cả
> ngày vừa kết thúc. VD: báo cáo NGÀY 17 = trọn ngày 17, gửi lúc ~00:01 ngày 18.

**Người nhận (đã chốt):** Lê Văn Huy (huylv), Anh Trung (trunglxh), Hồ Thị Thủy (thuyht), Lê Duy Minh (minhld).

## 1. Deploy function
```bash
npx supabase functions deploy daily-rubber-report --no-verify-jwt
```
> Dùng chung env đã có với các function mail khác: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
> `AZURE_CLIENT_SECRET` (hoặc `MICROSOFT_CLIENT_SECRET`), `EMAIL_FROM`. Không cần set lại.

## 2. Gọi thủ công (test)
```bash
curl -X POST "https://dygveetaatqllhjusyzz.supabase.co/functions/v1/daily-rubber-report" \
  -H "Content-Type: application/json" -d "{}"
```
→ Mặc định gửi **trọn NGÀY HÔM TRƯỚC** cho người nhận ở trên. Trả về JSON `{ success, sent_to, subject, stats }`.
> ⚠ Để test riêng cho minhld (khỏi gửi BGĐ), tạm sửa `REPORT_RECIPIENTS` trong code về `[{ minhld }]` rồi deploy lại.
> Tùy chọn body `{"range":"today"}` → xem nhanh số liệu HÔM NAY tới giờ gọi (chưa trọn ngày).

## 3. Lên lịch tự động 00:01 VN (pg_cron — chạy 1 lần ở Supabase SQL Editor)
00:01 VN = **17:01 UTC** (hôm trước) → cron `1 17 * * *`. Thay `<SERVICE_ROLE_KEY>` bằng key thật.
```sql
-- Huỷ mọi job cũ NẾU tồn tại (no-op nếu không có → tránh lỗi rollback cả khối)
select cron.unschedule(jobid) from cron.job
where jobname in ('daily-rubber-report-1800','daily-rubber-report-0005');

-- Lên lịch mới: 00:01 VN, báo cáo TRỌN NGÀY HÔM TRƯỚC (prevday)
select cron.schedule(
  'daily-rubber-report-0001',
  '1 17 * * *',
  $$
  select net.http_post(
    url     := 'https://dygveetaatqllhjusyzz.supabase.co/functions/v1/daily-rubber-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{"range":"prevday"}'::jsonb
  );
  $$
);
```
Kiểm lịch: `select jobname, schedule, active from cron.job where jobname like 'daily-rubber-report%';`
Đổi giờ/huỷ: `select cron.unschedule('daily-rubber-report-0001');` rồi schedule lại.
> Body gửi `{"range":"prevday"}` để chắc chắn trọn ngày kể cả trước khi deploy bản code mới.

## Ghi chú
- Cửa sổ dữ liệu mặc định = **TRỌN NGÀY HÔM TRƯỚC** [hôm qua 00:00, hôm nay 00:00) giờ VN. So sánh vs ngày trước đó.
- KL khô = KL tươi × DRC (qc_actual_drc trên phiếu). Phiếu thiếu DRC → tạm tính theo DRC TB cùng loại + cảnh báo.
- Không có phiếu nào → mail vẫn gửi, ghi "Không có phiếu cân NHẬP hoàn tất".
