-- =====================================================================
-- Sửa phiếu CX-PD-20260719-002 (Nhận mủ NM khác — LDD-2607-031)
-- cho khớp QUY TRÌNH MỚI: ở PĐ cân lần 1 = XE + HÀNG (không phải xe rỗng).
--
-- Hiện trạng: xe VỀ đã đầy mủ, cân được 12.180 kg — nhưng app cũ ghi số này
-- vào ô "xe rỗng" (tare). → Chuyển sang ô "xe có hàng" (gross), để trống ô
-- xe rỗng cho lần cân 2 (sau khi dỡ hết mủ).
--
-- Pallet: đặt 0 — từ 19/07/2026 KHÔNG tính KL pallet vào KL mủ nữa.
--
-- AN TOÀN: chỉ chạy khi phiếu đúng hiện trạng nói trên (gross trống, tare có số).
-- Chạy lại lần 2 sẽ KHÔNG làm gì (idempotent).
-- =====================================================================

-- ---------- PART A — XEM TRƯỚC (chạy riêng, đọc rồi mới chạy PART B) ----------
SELECT code, ticket_type, status,
       gross_weight, gross_weighed_at,
       tare_weight,  tare_weighed_at,
       net_weight,
       pallet_kg_gross, pallet_kg_tare,
       reference_id
FROM   weighbridge_tickets
WHERE  code = 'CX-PD-20260719-002';

-- ---------- PART B — SỬA ----------
BEGIN;

UPDATE weighbridge_tickets
SET    gross_weight     = tare_weight,        -- 12.180 = xe + mủ (lần 1)
       gross_weighed_at = tare_weighed_at,
       gross_weighed_by = tare_weighed_by,
       tare_weight      = NULL,               -- chờ cân lần 2 = xe rỗng
       tare_weighed_at  = NULL,
       tare_weighed_by  = NULL,
       net_weight       = NULL,
       -- pallet không còn tính vào KL mủ
       pallet_plastic_gross = 0, pallet_steel_gross = 0, pallet_kg_gross = 0,
       pallet_plastic_tare  = 0, pallet_steel_tare  = 0, pallet_kg_tare  = 0,
       status           = 'weighing_tare'
WHERE  code        = 'CX-PD-20260719-002'
  AND  ticket_type = 'fetch'
  AND  gross_weight IS NULL          -- chốt an toàn: chưa từng đảo
  AND  tare_weight  IS NOT NULL;

-- Kiểm tra lại trước khi COMMIT: phải thấy gross = 12180, tare = NULL.
SELECT code, status, gross_weight, tare_weight, net_weight,
       pallet_kg_gross, pallet_kg_tare
FROM   weighbridge_tickets
WHERE  code = 'CX-PD-20260719-002';

COMMIT;

-- Sau khi chạy: mở lại phiếu trên app cân → sẽ hiện
--   "Cân lần 1 (Xe + hàng): 12.180" và chờ "Cân lần 2 (Xe rỗng)".
-- Dỡ hết mủ, cân xe rỗng → KL mủ = 12.180 − (xe rỗng).
