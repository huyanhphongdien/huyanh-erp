-- ============================================================================
-- CÔNG NỢ THEO TUỔI, HAI TẦNG (LÔ + ĐƠN) — ĐỢT 8, P8
-- Ngày: 2026-08-27 · Chạy SAU sales_lots_p7_summary_fix.sql
--
-- QUYẾT ĐỊNH CHỦ DOANH NGHIỆP:
--   (1) Mẫu số phải thu = TRỊ GIÁ HỢP ĐỒNG (sales_orders.total_value_usd).
--   (2) Phải có người thực sự nhập thanh toán KÈM SỐ LÔ.
--
-- HOÀ GIẢI "HĐ vs LÔ" MÀ KHÔNG PRORATA:
--   Prorata bị cấm vì nó NHÂN trị giá HĐ với một tỉ lệ để bịa số cho từng lô.
--   Ở đây dùng PHÉP TRỪ, và phần dư KHÔNG gán cho lô nào — nó là một dòng riêng
--   (row_kind='residual'). Đẳng thức luôn đúng, sai số 0:
--       Σ value_usd (các lô)  +  residual  ≡  total_value_usd
--   Đo 27/08/2026: 4.967.705,40 + 721.581,00 = 5.689.286,40 (9 đơn có lô).
--   residual > 0 = "Chưa chốt lô"; residual < 0 = "Giao vượt HĐ" (CÓ THẬT: 2 đơn,
--   −234.057,60 — HĐ 342,72 tấn nhưng lô cân thật 403,20 tấn). KHÔNG Math.max(0,...).
--
-- MỐC TÍNH TUỔI — CHỖ DUY NHẤT:
--   Bảng sales_order_lots RỖNG NGÀY (delivered_at 0/20, invoice_no 0/20, etd 4/20,
--   created_at cả 20 lô = 2026-08-26 = ngày backfill). Mốc thật nằm ở lệnh điều động.
--   Đo 27/08/2026: 137/212 container "đã giao" thì 137/137 có dispatch_date — 0 ngoại lệ.
--   → 18/20 lô có mốc = 4.275.209,40 / 4.967.705,40 = 86,1% trị giá lô.
--   Cùng tập đó ở cấp đơn chỉ 11/89 đơn có delivery_date. Tuổi cấp LÔ tin hơn cấp ĐƠN.
--
-- ĐỊNH NGHĨA "CONTAINER ĐÃ GIAO" — NƠI THỨ BA:
--   status IN ('shipped','delivered') OR EXISTS(dispatch_order_lines.actual_weight_kg)
--   Y HỆT dispatchService.ts:497-560 và sales_lots_p5_progress_union.sql.
--   ⚠ Sửa một nơi phải sửa CẢ BA.
--
-- LÔ CHƯA ĐI TRỌN → MỐC PHẢI ĐỨNG YÊN:
--   Lô 'full'    → anchor = last_dispatch_date  (ngày lô đi xong, chốt được)
--   Lô 'partial' → anchor = FIRST_dispatch_date (đơn điệu: tuổi chỉ TĂNG)
--   Dùng max cho lô partial thì mốc trượt về sau mỗi lần cont còn lại đi → nợ TRẺ RA.
--   Đúng loại bẫy "số động" của sales_order_containers.net_weight_kg.
--   Đo hôm nay: 6 lô partial, first vs last chỉ lệch 0–2 ngày, KHÔNG lô nào đổi bucket.
--
-- KHÔNG CÓ NGÀY ĐẾN HẠN Ở BẤT KỲ ĐÂU:
--   payment_terms 13/89 đơn · fin_receivables 0 dòng · sales_invoices 0 dòng.
--   → bucket này là "TUỔI KỂ TỪ NGÀY GIAO", KHÔNG phải "quá hạn". Đặt tên đúng.
--
-- Idempotent (CREATE OR REPLACE). KHÔNG có BEGIN/COMMIT (chạy qua RPC agent_sql).
-- ============================================================================

-- ─── 1) ĐỒNG HỒ GIAO HÀNG CẤP LÔ ────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_sales_order_lot_delivery_clock AS
-- ⚠ KHÔNG gõ lại luật "đã giao" ở đây. Nó là view riêng
-- (sales_lots_p8_one_delivery_definition.sql) mà cả TypeScript lẫn view tiến độ lô
-- cùng đọc. Chép lại lần thứ ba là lại có ba con số cho một câu hỏi.
WITH cont AS (
  SELECT
    container_id AS id, sales_order_id, lot_no,
    (delivery_state = 'delivered') AS delivered,
    dispatch_date
  FROM public.v_sales_order_container_delivery
)
SELECT
  sales_order_id,
  lot_no,
  count(*)::int                                              AS container_count,
  (count(*) FILTER (WHERE delivered))::int                   AS containers_delivered,
  min(dispatch_date) FILTER (WHERE delivered)                AS first_dispatch_date,
  max(dispatch_date) FILTER (WHERE delivered)                AS last_dispatch_date,
  CASE
    WHEN count(*) FILTER (WHERE delivered) = 0        THEN NULL::date
    WHEN count(*) FILTER (WHERE delivered) = count(*) THEN max(dispatch_date) FILTER (WHERE delivered)
    ELSE                                                   min(dispatch_date) FILTER (WHERE delivered)
  END                                                        AS anchor_date,
  CASE
    WHEN count(*) FILTER (WHERE delivered) = 0        THEN 'none'
    WHEN count(*) FILTER (WHERE delivered) < count(*) THEN 'partial'
    ELSE 'full'
  END                                                        AS delivery_state
FROM cont
WHERE lot_no IS NOT NULL
GROUP BY sales_order_id, lot_no;

ALTER VIEW public.v_sales_order_lot_delivery_clock SET (security_invoker = on);
GRANT SELECT ON public.v_sales_order_lot_delivery_clock TO authenticated;

-- ─── 2) DÒNG CÔNG NỢ HAI TẦNG ───────────────────────────────────────────────
-- 3 loại dòng, cộng lại LUÔN bằng Σ total_value_usd của phạm vi A/R:
--   'lot'      : 1 dòng = 1 sales_order_lots. Mẫu số = value_usd (số trên Invoice).
--   'residual' : 1 dòng/đơn có lô. Mẫu số = total_value_usd − Σ value_usd.
--                Tử số = tiền đã thu CHƯA gắn lô (kể cả lô ma) — không mất đồng nào.
--   'order'    : 1 dòng/đơn CHƯA có lô. Mẫu số = total_value_usd (100%).
CREATE OR REPLACE VIEW public.v_ar_aging_rows AS
with cont as (
  -- Cùng một nguồn với view đồng hồ ở trên. Không có bản sao nào của luật ở file này.
  select container_id as id, sales_order_id, lot_no,
    (delivery_state = 'delivered') as delivered, dispatch_date
  from public.v_sales_order_container_delivery
), clk as (
  select sales_order_id, lot_no, count(*)::int container_count, count(*) filter (where delivered)::int containers_delivered,
    min(dispatch_date) filter (where delivered) first_dispatch_date, max(dispatch_date) filter (where delivered) last_dispatch_date,
    case when count(*) filter (where delivered) = 0 then null::date
         when count(*) filter (where delivered) = count(*) then max(dispatch_date) filter (where delivered)
         else min(dispatch_date) filter (where delivered) end as anchor_date,
    case when count(*) filter (where delivered) = 0 then 'none' when count(*) filter (where delivered) < count(*) then 'partial' else 'full' end as delivery_state
  from cont where lot_no is not null group by sales_order_id, lot_no
), ord_clk as (
  select sales_order_id, count(*)::int container_count, count(*) filter (where delivered)::int containers_delivered,
    max(dispatch_date) filter (where delivered) last_dispatch_date
  from cont group by sales_order_id
), pay as (
  select sales_order_id, sum(amount) filter (where payment_type is distinct from 'fee_offset') paid_total
  from public.sales_order_payments group by sales_order_id
), lot_pay as (
  select sales_order_id, lot_no, sum(amount) paid
  from public.sales_order_payments
  where lot_no is not null and payment_type is distinct from 'fee_offset'
  group by sales_order_id, lot_no
), ord as (
  select o.id, o.code, o.contract_no, o.status, o.customer_id, coalesce(o.currency,'USD') currency,
    o.delivery_date, o.shipped_at, o.bl_date,
    coalesce(o.total_value_usd, o.quantity_tons * o.unit_price, 0)::numeric contract_value_usd
  from public.sales_orders o
  where o.status in ('confirmed','producing','ready','packing','shipped','delivered','invoiced')
), base as (
  select 'lot'::text row_kind, o.id sales_order_id, o.code order_code, o.contract_no, o.status order_status,
    o.customer_id, o.currency, o.contract_value_usd, l.lot_no, l.lot_label,
    l.value_usd row_value_usd, coalesce(lp.paid,0) row_paid_usd,
    k.anchor_date, case when k.anchor_date is not null then 'lot_dispatch' end anchor_source,
    coalesce(k.delivery_state,'none') delivery_state, coalesce(k.container_count,0) container_count,
    coalesce(k.containers_delivered,0) containers_delivered
  from ord o
  join public.sales_order_lots l on l.sales_order_id = o.id
  left join clk k on k.sales_order_id = l.sales_order_id and k.lot_no = l.lot_no
  left join lot_pay lp on lp.sales_order_id = l.sales_order_id and lp.lot_no = l.lot_no
  union all
  select 'residual', o.id, o.code, o.contract_no, o.status, o.customer_id, o.currency, o.contract_value_usd,
    null::int, null::text,
    o.contract_value_usd - coalesce(sum(l.value_usd),0),
    coalesce(max(p.paid_total),0) - coalesce(sum(lp.paid),0),
    null::date, null::text, 'n/a', 0, 0
  from ord o
  join public.sales_order_lots l on l.sales_order_id = o.id
  left join lot_pay lp on lp.sales_order_id = l.sales_order_id and lp.lot_no = l.lot_no
  left join pay p on p.sales_order_id = o.id
  group by o.id, o.code, o.contract_no, o.status, o.customer_id, o.currency, o.contract_value_usd
  having o.contract_value_usd - coalesce(sum(l.value_usd),0) <> 0
      or coalesce(max(p.paid_total),0) - coalesce(sum(lp.paid),0) <> 0
  union all
  select 'order', o.id, o.code, o.contract_no, o.status, o.customer_id, o.currency, o.contract_value_usd,
    null::int, null::text, o.contract_value_usd, coalesce(p.paid_total,0),
    coalesce(o.delivery_date, oc.last_dispatch_date, o.shipped_at::date, o.bl_date),
    case when o.delivery_date is not null then 'order_delivery_date'
         when oc.last_dispatch_date is not null then 'order_dispatch'
         when o.shipped_at is not null then 'order_shipped_at'
         when o.bl_date is not null then 'order_bl_date' end,
    case when coalesce(oc.container_count,0) = 0 then 'no_container'
         when oc.containers_delivered = 0 then 'none'
         when oc.containers_delivered < oc.container_count then 'partial' else 'full' end,
    coalesce(oc.container_count,0), coalesce(oc.containers_delivered,0)
  from ord o
  left join pay p on p.sales_order_id = o.id
  left join ord_clk oc on oc.sales_order_id = o.id
  where not exists (select 1 from public.sales_order_lots l where l.sales_order_id = o.id)
)
select b.*, round(b.row_value_usd - b.row_paid_usd, 2) row_outstanding_usd,
  case when b.anchor_date is null then null else (current_date - b.anchor_date) end age_days,
  case when b.anchor_date is null then 'no_anchor'
       when current_date - b.anchor_date <= 30 then 'd0_30'
       when current_date - b.anchor_date <= 60 then 'd31_60'
       when current_date - b.anchor_date <= 90 then 'd61_90'
       else 'd90_plus' end aging_bucket
from base b
;

ALTER VIEW public.v_ar_aging_rows SET (security_invoker = on);
GRANT SELECT ON public.v_ar_aging_rows TO authenticated;

-- ─── 3) KIỂM CHỨNG (chạy tay sau khi apply) ─────────────────────────────────
-- Đẳng thức phải đúng tuyệt đối, sai số 0,00:
--   SELECT sum(row_value_usd) FROM v_ar_aging_rows;                       -- 14566681.82
--   SELECT sum(total_value_usd) FROM sales_orders
--     WHERE status IN ('confirmed','producing','ready','packing','shipped','delivered','invoiced');
--   SELECT sum(row_outstanding_usd) FROM v_ar_aging_rows;                 -- 14562265.82
--   SELECT sum(row_outstanding_usd) FROM v_ar_aging_rows
--     WHERE order_status IN ('shipped','delivered','invoiced');           --  9536529.02
--     (khớp ĐÚNG con số trang Công nợ khách đang hiện hôm nay → không ai phải giải thích)
