-- ============================================================================
-- Sửa cước + bảo hiểm đơn HA20260075 (ASIMCO) — 2 số cuối còn dính data GRI.
-- Áp qua agent_sql 2026-08-11. Idempotent (UPDATE theo id).
--
-- Công thức Huy Anh:
--   Bảo hiểm = trị giá CIF × 1,1 (giá trị BH 110%) × 0,04% (phí) × 1,1 (VAT 10%)
--   Cước     = $5 × số container (đơn giá cước — sửa nếu tuyến khác)
--
-- HA20260075: total = 895.104 USD · 20 cont
--   Bảo hiểm = 895104 × 1,1 × 0,04% × 1,1 = 433,23
--   Cước     = 5 × 20 = 100
--   => THE COST (dòng FOB Invoice) = 895104 − 100 − 433,23 = 894.570,77
--   (Hối phiếu D/P vẫn draw TỔNG CIF 895.104, không trừ cước/BH.)
-- ============================================================================
update sales_orders
set insurance_amount = 433.23,   -- was 105.80 (GRI leftover)
    freight_amount   = 100       -- was 6250   (GRI leftover)
where id = '24084216-3615-4d92-8ff3-2d5d619057a7';
