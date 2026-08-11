-- ============================================================================
-- Cleanup data lẫn trên đơn HA20260075 (ASIMCO NVH, China, D/P, CIF Shanghai)
-- Đơn từng dùng thực hành nên dính data đơn mẫu GRI (HA20260080).
-- Đã áp trực tiếp lên prod qua agent_sql (2026-08-11); file này = VẾT ghi lại,
-- idempotent (UPDATE theo id), chạy lại an toàn.
--
-- order id  : 24084216-3615-4d92-8ff3-2d5d619057a7  (contract_no HA20260075)
-- customer  : 61ee8e06-f066-4b8a-9142-a2972b22b1ff  (ASIMCO NVH TECHNOLOGIES (ANHUI))
--
-- CÒN TREO: NH nhờ thu (collecting bank) thật của ASIMCO chưa biết -> tạm để
-- trống (issuing_bank = null), user điền khi thực hành. Container 5/20 cont còn
-- giá trị test (contnumber1/seal1) -> user nhập số thật khi đóng hàng.
-- ============================================================================

-- 1) Số hóa đơn dính HA20260080 -> đúng HA20260075; shipping mark "BRIDGE V.377S"
--    (tên tàu đơn GRI) -> trống để dùng mark base trong Hồ sơ khách.
update sales_orders
set invoice_no     = 'HA20260075/CI',
    shipping_marks = null
where id = '24084216-3615-4d92-8ff3-2d5d619057a7';

-- 2) Hồ sơ chứng từ ASIMCO: consignee đang là NH Hatton (của GRI) -> người mua
--    ASIMCO (D/P dùng người mua, không dùng NH); phương thức mặc định L/C -> D/P.
update sales_customer_export_profiles
set consignee_name         = 'ASIMCO NVH TECHNOLOGIES CO., LTD. (ANHUI)',
    default_payment_method = 'dp'
where customer_id = '61ee8e06-f066-4b8a-9142-a2972b22b1ff';

-- 3) Thương lượng D/P: NH nhờ thu đang dính "THE ORDER OF HATTON NATIONAL BANK
--    PLC" (Sri Lanka) -> xóa; user điền NH nhờ thu thật của ASIMCO sau.
--    (method=dp, NH chiết khấu Vietinbank, kỳ hạn 90 / 90% / lãi 5% giữ nguyên.)
update sales_order_lc_negotiations
set issuing_bank = null
where sales_order_id = '24084216-3615-4d92-8ff3-2d5d619057a7';
