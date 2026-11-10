-- ============================================================================
-- Sửa số bành / số container bị thừa do KL bành 33,33 kg (10/11/2026)
--
-- Lỗi: bành = round(kg / 33,33). 33,33 chỉ là cách ghi tròn của 100/3 kg (30 bành/tấn),
-- nên 210 t ra 6.300,63 → 6.301 bành, thừa 1 bành, và ceil(6.301 / 630) = 11 container
-- trong khi thực tế xếp 10 cont × 630 bành (các đơn đã giao đều có đúng 10 container).
-- Code đã sửa ở src/services/sales/baleMath.ts (33,33 → 30 bành/tấn). File này sửa DỮ LIỆU
-- đã lưu: 8 đơn 210 t (HA20260100, 0114, 0119, 0126, 0267, 0303, 0307, 0309), tất cả 6301/11.
--
-- Chạy trên Supabase SQL Editor. Idempotent: chạy lại không đổi gì. Không đụng
-- sales_order_containers (container thật đã tạo) và không đụng đơn đã huỷ.
-- ============================================================================

-- BƯỚC 0 · xem trước (mong đợi 8 dòng, tất cả total_bales 6301 → bales_fix 6300, cont 11 → 10)
SELECT o.contract_no, o.status, i.quantity_tons, i.bale_weight_kg, i.bales_per_container,
       i.total_bales, round(i.quantity_tons * round(1000 / i.bale_weight_kg)) AS bales_fix,
       i.container_count,
       ceil(round(i.quantity_tons * round(1000 / i.bale_weight_kg)) / nullif(i.bales_per_container, 0)) AS cont_fix
  FROM sales_order_items i JOIN sales_orders o ON o.id = i.sales_order_id
 WHERE o.status <> 'cancelled' AND i.bale_weight_kg > 0
   AND abs(1000 / i.bale_weight_kg - round(1000 / i.bale_weight_kg)) < 0.01
   AND i.total_bales <> round(i.quantity_tons * round(1000 / i.bale_weight_kg))
 ORDER BY o.contract_no;

-- BƯỚC 1 · sửa dòng hàng
WITH fix AS (
  SELECT i.id, round(i.quantity_tons * round(1000 / i.bale_weight_kg)) AS bales
    FROM sales_order_items i JOIN sales_orders o ON o.id = i.sales_order_id
   WHERE o.status <> 'cancelled' AND i.bale_weight_kg > 0
     AND abs(1000 / i.bale_weight_kg - round(1000 / i.bale_weight_kg)) < 0.01
     AND i.total_bales <> round(i.quantity_tons * round(1000 / i.bale_weight_kg))
)
UPDATE sales_order_items i
   SET total_bales = f.bales,
       container_count = CASE WHEN i.bales_per_container > 0 THEN ceil(f.bales / i.bales_per_container) ELSE i.container_count END
  FROM fix f
 WHERE f.id = i.id;

-- BƯỚC 2 · đầu đơn = tổng dòng hàng (chỉ các đơn đang lệch với dòng hàng của chính nó)
WITH agg AS (
  SELECT sales_order_id, sum(total_bales) AS bales, sum(container_count) AS conts
    FROM sales_order_items GROUP BY sales_order_id
)
UPDATE sales_orders o
   SET total_bales = a.bales, container_count = a.conts, updated_at = now()
  FROM agg a
 WHERE a.sales_order_id = o.id AND o.status <> 'cancelled'
   AND (o.total_bales IS DISTINCT FROM a.bales OR o.container_count IS DISTINCT FROM a.conts)
   AND o.contract_no IN ('HA20260100','HA20260114','HA20260119','HA20260126','HA20260267','HA20260303','HA20260307','HA20260309');

-- BƯỚC 3 · kiểm tra lại (mong đợi 8 dòng, 6300 bành · 10 cont)
SELECT o.contract_no, o.status, o.total_bales, o.container_count,
       (SELECT count(*) FROM sales_order_containers c WHERE c.sales_order_id = o.id) AS cont_thuc_te
  FROM sales_orders o
 WHERE o.contract_no IN ('HA20260100','HA20260114','HA20260119','HA20260126','HA20260267','HA20260303','HA20260307','HA20260309')
 ORDER BY o.contract_no;
