# Báo cáo thu mua mủ hằng ngày — Triển khai

Edge function `daily-rubber-report` gửi mail BGĐ lúc **12:30 giờ VN** (số liệu phiếu cân
NHẬP hoàn tất từ 00:00 → 12:30 hôm nay), bố cục khớp `MAIL_BAO_CAO_THU_MUA_MOCK.html`.

## 1. Deploy function
```bash
npx supabase functions deploy daily-rubber-report --no-verify-jwt
```
> Dùng chung env đã có với các function mail khác: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
> `AZURE_CLIENT_SECRET` (hoặc `MICROSOFT_CLIENT_SECRET`), `EMAIL_FROM`. Không cần set lại.

## 2. Test gửi thử (đang ở chế độ TEST — chỉ gửi minhld)
```bash
curl -X POST "https://dygveetaatqllhjusyzz.supabase.co/functions/v1/daily-rubber-report" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" -d "{}"
```
→ Kiểm hộp thư **minhld@huyanhrubber.com**. Trả về JSON `{ success, sent_to, subject, stats }`.

## 3. Lên lịch tự động 12:30 VN (pg_cron — chạy 1 lần ở Supabase SQL Editor)
12:30 VN = **05:30 UTC** → cron `30 5 * * *`. Thay `<SERVICE_ROLE_KEY>` bằng key thật.
```sql
select cron.schedule(
  'daily-rubber-report-1230',
  '30 5 * * *',
  $$
  select net.http_post(
    url     := 'https://dygveetaatqllhjusyzz.supabase.co/functions/v1/daily-rubber-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);
```
Kiểm lịch: `select jobname, schedule, active from cron.job where jobname='daily-rubber-report-1230';`
Đổi giờ/huỷ: `select cron.unschedule('daily-rubber-report-1230');` rồi schedule lại.

## 4. Khi test OK → chuyển sang gửi BGĐ đầy đủ
Sửa `supabase/functions/daily-rubber-report/index.ts`:
- Bỏ comment block `BGD_FULL` (huylv, thuyht, minhld).
- Đổi `const REPORT_RECIPIENTS = [...minhld...]` → `const REPORT_RECIPIENTS = BGD_FULL`.
- Deploy lại (bước 1).

## Ghi chú
- Cửa sổ dữ liệu = 00:00 → thời điểm chạy (giờ VN). So sánh vs cùng khung hôm qua.
- KL khô = KL tươi × DRC (qc_actual_drc trên phiếu). Phiếu thiếu DRC → tạm tính theo DRC TB cùng loại + cảnh báo.
- Không có phiếu nào → mail vẫn gửi, ghi "Chưa có phiếu cân NHẬP hoàn tất".
