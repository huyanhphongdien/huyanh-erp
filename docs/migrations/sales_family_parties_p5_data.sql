-- ============================================================================
-- sales_family_parties_p5_data.sql — nối dữ liệu cũ theo mặc định owner duyệt 17/11/2026
-- Chỉ NỐI họ HĐ và GÁN NGƯỜI NHẬN; không đổi người mua, số HĐ, tấn, tiền, ngày HĐ. Khoá kép (code + contract_no),
-- điều kiện IS NULL → chạy lại vô hại. Trigger trg_so_family_guard kiểm cùng người mua / đồng tiền và cấp continuation_seq.
-- KHÔNG làm (chờ Sale): HA20260307 có phải đợt của HA20260306; HA20260303 (YOUPU, Thượng Hải); HA20260310; giá $2.480 của HA20260301.
-- Chạy qua agent_sql: KHÔNG BEGIN/COMMIT.
-- ============================================================================

-- 1) HA20260301 (SO-2026-0156, "GIẢ LẬP" nhưng hàng thật đã xuất) = đợt 2 của HĐ HA20260302; giữ số, chứng từ in như cũ
UPDATE public.sales_orders c SET parent_order_id = p.id, docs_cite_root = false, updated_at = now()
FROM public.sales_orders p
WHERE c.code = 'SO-2026-0156' AND c.contract_no = 'HA20260301'
  AND p.code = 'SO-2026-0166' AND p.contract_no = 'HA20260302'
  AND c.parent_order_id IS NULL;

-- 2) ATC: '…/OCT - LOT 4' = đợt 2 của HĐ dài hạn '…/OCT' (cùng người mua, cùng ngày HĐ khung 04/02/2025); giữ số
UPDATE public.sales_orders c SET parent_order_id = p.id, docs_cite_root = false, updated_at = now()
FROM public.sales_orders p
WHERE c.code = 'SO-2026-0058' AND c.contract_no = 'LTC2024/PD-ATC-SEZ/OCT - LOT 4'
  AND p.code = 'SO-2026-0013' AND p.contract_no = 'LTC2024/PD-ATC-SEZ/OCT'
  AND c.parent_order_id IS NULL;

-- 3) Người nhận: 8 đơn Harmonytide đi Thanh Đảo giao QINGDAO JINTONG (owner: Jintong là người nhận của bên trung gian Harmonytide)
UPDATE public.sales_orders o SET ship_to_customer_id = '8b1f1f9b-fc03-4a52-851a-2fc14cb67015', updated_at = now()
WHERE o.customer_id = '9052fa03-39f0-495b-9ab9-ea341e94d74c'
  AND o.contract_no = ANY (ARRAY['HA20260301','HA20260302','HA20260304','HA20260305','HA20260306','HA20260307','HA20260308','HA20260309'])
  AND o.port_of_destination ILIKE 'QINGDAO%'
  AND o.ship_to_customer_id IS NULL;

-- Kiểm:
-- SELECT code, contract_no, continuation_seq, docs_cite_root, ship_to_customer_id FROM sales_orders
--   WHERE customer_id = '9052fa03-39f0-495b-9ab9-ea341e94d74c' OR code IN ('SO-2026-0013','SO-2026-0058') ORDER BY contract_no_sort_key, continuation_seq NULLS FIRST;
-- SELECT row_kind, contract_value_usd, row_outstanding_usd FROM v_ar_aging_rows WHERE contract_no = 'HA20260301';  -- vẫn 499968
-- SELECT * FROM v_sales_order_family_drift;  -- 0 dòng
