# Báo cáo thu mua mủ hằng ngày — Triển khai

Edge function `daily-rubber-report` gửi mail BGĐ lúc **00:30 giờ VN**, tổng hợp **CẢ NGÀY
HÔM TRƯỚC** (VD: 00:30 ngày 06/06 → số liệu trọn ngày 05/06). Bố cục khớp
`MAIL_BAO_CAO_THU_MUA_MOCK.html`.

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

## 3. Lên lịch tự động 00:30 VN (pg_cron — chạy 1 lần ở Supabase SQL Editor)
00:30 VN = **17:30 UTC** (ngày hôm trước) → cron `30 17 * * *`. Thay `<SERVICE_ROLE_KEY>` bằng key thật.
```sql
select cron.schedule(
  'daily-rubber-report-0030',
  '30 17 * * *',
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
Kiểm lịch: `select jobname, schedule, active from cron.job where jobname='daily-rubber-report-0030';`
Đổi giờ/huỷ: `select cron.unschedule('daily-rubber-report-0030');` rồi schedule lại.

## 4. Khi test OK → chuyển sang gửi BGĐ đầy đủ
Sửa `supabase/functions/daily-rubber-report/index.ts`:
- Bỏ comment block `BGD_FULL` (huylv, thuyht, minhld).
- Đổi `const REPORT_RECIPIENTS = [...minhld...]` → `const REPORT_RECIPIENTS = BGD_FULL`.
- Deploy lại (bước 1).

## Ghi chú
- Cửa sổ dữ liệu = **trọn ngày hôm trước** [00:00, 24:00) giờ VN. So sánh vs ngày trước nữa.
- KL khô = KL tươi × DRC (qc_actual_drc trên phiếu). Phiếu thiếu DRC → tạm tính theo DRC TB cùng loại + cảnh báo.
- Không có phiếu nào → mail vẫn gửi, ghi "Chưa có phiếu cân NHẬP hoàn tất".
