# Báo cáo thu mua mủ hằng ngày — Triển khai

Edge function `daily-rubber-report` gửi mail BGĐ lúc **21:00 giờ VN mỗi ngày**.

**Kỳ báo cáo = [21:00 hôm qua → 21:00 hôm nay).**
Phiếu cân **hoàn tất sau 21:00 KHÔNG bị bỏ sót** — tự động gom vào **báo cáo ngày mai**.

> **Mốc phân kỳ là GIỜ HOÀN TẤT PHIẾU (`completed_at`), không phải giờ tạo phiếu.**
> Nếu cắt theo `created_at` sẽ có **khe chết**: xe vào cân 20:45, cân xong 21:20 →
> hôm nay loại (lúc 21:00 phiếu chưa `completed`), mai cũng loại (`created_at` ngoài cửa sổ).
> Phiếu cũ / backfill không có `completed_at` → fallback về `created_at`.

**Lịch sử:** 18:00 (miss phiếu buổi tối) → 00:01 hôm sau (trọn ngày, nhưng BGĐ phải chờ qua đêm)
→ **21:00 cùng ngày** (bản hiện tại: BGĐ xem ngay trong ngày, phần đuôi tối gom sang mai).

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
→ Gửi **kỳ 21:00→21:00 vừa đóng gần nhất**. Gọi lúc 10:00 sáng ⇒ ra kỳ của **hôm qua**
(kỳ hôm nay chưa đóng) — đúng như thiết kế, không bao giờ gửi kỳ dở dang.
Trả về JSON `{ success, sent_to, subject, stats }`.
> ⚠ Để test riêng cho minhld (khỏi gửi BGĐ), tạm sửa `REPORT_RECIPIENTS` trong code về `[{ minhld }]` rồi deploy lại.
> Body `{"range":"today"}` → xem nhanh HÔM NAY 00:00 → giờ gọi (không phải kỳ chuẩn).

## 3. Đổi lịch cron sang 21:00 VN (pg_cron — chạy 1 lần ở Supabase SQL Editor)
21:00 VN = **14:00 UTC** → cron `0 14 * * *`.

### Cách A (khuyên dùng) — giữ nguyên key của job cũ, khỏi phải dán lại
```sql
do $$
declare cmd text;
begin
  -- Mượn lại command của job cũ (đã chứa sẵn SERVICE_ROLE_KEY) → không phải lộ key lần nữa.
  select command into cmd from cron.job
   where jobname like 'daily-rubber-report%' and command ilike '%daily-rubber-report%'
   order by jobname limit 1;
  if cmd is null then
    raise exception 'Không thấy job cũ. Xem: select jobname from cron.job; rồi dùng Cách B.';
  end if;

  perform cron.unschedule(jobid) from cron.job where jobname like 'daily-rubber-report%';
  perform cron.schedule('daily-rubber-report-2100', '0 14 * * *', cmd);
end $$;

-- Phải thấy ĐÚNG 1 dòng: daily-rubber-report-2100 | 0 14 * * * | t
select jobname, schedule, active from cron.job where jobname like 'daily-rubber-report%';
```
> Body của job cũ là `{"range":"prevday"}` — code mới map nó về đúng kỳ 21:00→21:00, nên
> giữ nguyên command vẫn chạy đúng.

### Cách B — tạo mới hoàn toàn (phải thay `<SERVICE_ROLE_KEY>`)
```sql
-- Huỷ MỌI job cũ (18:00 / 00:05 / 00:01). No-op nếu không tồn tại.
select cron.unschedule(jobid) from cron.job
where jobname in (
  'daily-rubber-report-1800',
  'daily-rubber-report-0005',
  'daily-rubber-report-0001',
  'daily-rubber-report-2100'   -- cho phép chạy lại khối này nhiều lần
);

-- Lên lịch mới: 21:00 VN mỗi ngày, kỳ [21:00 hôm qua → 21:00 hôm nay)
select cron.schedule(
  'daily-rubber-report-2100',
  '0 14 * * *',
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

-- Kiểm lại: phải thấy ĐÚNG 1 dòng, schedule = '0 14 * * *'
select jobname, schedule, active from cron.job where jobname like 'daily-rubber-report%';
```

> **Bắt buộc huỷ job cũ.** Nếu để nguyên job 00:01 thì mỗi đêm nó vẫn bắn thêm 1 mail nữa
> (body `{"range":"prevday"}` của code mới được map về kỳ 21:00→21:00, nên nội dung không sai,
> nhưng BGĐ sẽ nhận **2 mail/ngày** — 1 lúc 21:00 và 1 lúc 00:01 trùng nội dung).

## Ghi chú
- Cửa sổ dữ liệu = **[21:00 hôm qua, 21:00 hôm nay)** giờ VN, cận trên `lt` (không `lte`)
  nên 2 kỳ liền nhau **không đếm trùng** phiếu nằm đúng mốc 21:00. So sánh vs kỳ liền trước.
- Cron lệch vài giây (bắn lúc 20:59:57) vẫn ra đúng kỳ hôm nay — hàm có **GRACE 15 phút**
  snap về mốc 21:00, tránh gửi lại nguyên báo cáo hôm qua.
- KL khô = KL tươi × DRC (`qc_actual_drc`), **chỉ quy đổi cho phiếu có DRC thực** (mủ nước đã đốt).
  Mủ tạp chưa đo DRC → không quy đổi khô. Phiếu mủ nước thiếu DRC → hiện cảnh báo cuối mail.
- **Lũy kế tháng** tính theo **tháng dương lịch** (00:00 ngày 01 → hết kỳ), để khớp trang
  Thống kê mủ trên phần mềm. Riêng ngày 01, số ngày có thể lớn hơn số lũy kế tháng vì kỳ
  ngày 01 gồm cả 21:00–24:00 của ngày cuối tháng trước (phần đó thuộc tháng trước).
- Không có phiếu nào → mail vẫn gửi, ghi "Không có phiếu cân NHẬP hoàn tất trong kỳ…".
