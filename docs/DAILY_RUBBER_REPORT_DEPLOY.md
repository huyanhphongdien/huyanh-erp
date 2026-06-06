# Báo cáo thu mua mủ hằng ngày — Triển khai

Edge function `daily-rubber-report` gửi mail BGĐ lúc **18:00 giờ VN**, tổng hợp **NGÀY HÔM
NAY** (số liệu 00:00–18:00 cùng ngày). Bố cục khớp `MAIL_BAO_CAO_THU_MUA_MOCK.html`.

**Người nhận (đã chốt):** Lê Văn Huy (huylv), Hồ Thị Thủy (thuyht), Lê Duy Minh (minhld).

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
→ Gửi cho **cả 3 người nhận** ở trên, số liệu HÔM NAY tới giờ gọi. Trả về JSON `{ success, sent_to, subject, stats }`.
> ⚠ Để test riêng cho minhld (khỏi gửi BGĐ), tạm sửa `REPORT_RECIPIENTS` trong code về `[{ minhld }]` rồi deploy lại.
> Tùy chọn body `{"range":"prevday"}` → báo cáo trọn ngày hôm trước thay vì hôm nay.

## 3. Lên lịch tự động 18:00 VN (pg_cron — chạy 1 lần ở Supabase SQL Editor)
18:00 VN = **11:00 UTC** → cron `0 11 * * *`. Thay `<SERVICE_ROLE_KEY>` bằng key thật.
```sql
select cron.schedule(
  'daily-rubber-report-1800',
  '0 11 * * *',
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
Kiểm lịch: `select jobname, schedule, active from cron.job where jobname='daily-rubber-report-1800';`
Đổi giờ/huỷ: `select cron.unschedule('daily-rubber-report-1800');` rồi schedule lại.
> Nếu trước đó đã tạo job cũ tên `daily-rubber-report-0030` thì huỷ: `select cron.unschedule('daily-rubber-report-0030');`

## Ghi chú
- Cửa sổ dữ liệu mặc định = **HÔM NAY** [00:00, giờ chạy) giờ VN (cron 18:00 → 00:00–18:00). So sánh vs cùng khung hôm qua.
- KL khô = KL tươi × DRC (qc_actual_drc trên phiếu). Phiếu thiếu DRC → tạm tính theo DRC TB cùng loại + cảnh báo.
- Không có phiếu nào → mail vẫn gửi, ghi "Không có phiếu cân NHẬP hoàn tất".
