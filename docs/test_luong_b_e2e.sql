-- ============================================================================
-- TEST E2E LUỒNG B — Bộc phát (đại lý đến → Cân → PCG → ĐNTT)
-- Date: 2026-05-30
-- ============================================================================
-- Chạy lần lượt từng SECTION trên Supabase SQL Editor.
-- Mỗi section là 1 query SELECT độc lập → xem kết quả → so với kỳ vọng.
-- KHÔNG tạo dữ liệu mới. CHỈ ĐỌC để verify seed + resolver logic.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 1: SANITY COUNTS — verify seed data đúng số lượng
-- ════════════════════════════════════════════════════════════════════════════
-- Kỳ vọng:
--   partners = 20 (5 proxy + 15 seller)
--   tickets = 55 (5/ngày × 11 ngày)
--   intakes = 55 (bridge tạo đủ 1-1 với tickets)
--   pcg = 1 (PCG-2026-0001 với 8 dealer_lines)
--   banks = 14 (5 proxy + 9 seller có TK riêng)
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT count(*) FROM b2b.partners p
     JOIN public.bp_search_keys k ON k.bp_id=p.bp_id
     WHERE k.key_type='ALIAS' AND k.key_value LIKE 'TLM-%') AS partners,
  (SELECT count(*) FROM b2b.partners WHERE is_payment_proxy=true AND is_demo=true) AS proxies,
  (SELECT count(*) FROM b2b.partners WHERE payment_proxy_partner_id IS NOT NULL AND is_demo=true) AS proxy_linked,
  (SELECT count(*) FROM public.weighbridge_tickets WHERE notes='SEED-TLM-E2E-2026-05') AS tickets,
  (SELECT count(*) FROM public.rubber_intake_batches rib
     WHERE rib.weighbridge_ticket_id IN (
       SELECT id FROM public.weighbridge_tickets WHERE notes='SEED-TLM-E2E-2026-05'
     )) AS intakes,
  (SELECT count(*) FROM public.b2b_price_lock_tickets WHERE note='SEED-TLM-E2E-2026-05') AS pcg,
  (SELECT jsonb_array_length(dealer_lines) FROM public.b2b_price_lock_tickets
     WHERE note='SEED-TLM-E2E-2026-05' LIMIT 1) AS pcg_dealer_lines_count,
  (SELECT count(*) FROM public.b2b_partner_banks pb
     JOIN b2b.partners p ON p.id=pb.partner_id
     JOIN public.bp_search_keys k ON k.bp_id=p.bp_id
     WHERE k.key_type='ALIAS' AND k.key_value LIKE 'TLM-%') AS banks;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 2: TICKETS THEO ĐẠI LÝ — kiểm tra phân bổ phiếu cân
-- ════════════════════════════════════════════════════════════════════════════
-- Kỳ vọng: 15 đại lý, mỗi đại lý 3-4 phiếu, tổng 55.
-- Cycle: 10 đại lý đầu được 4 phiếu, 5 đại lý cuối được 3 phiếu.
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  k.key_value AS alias,
  p.name AS dealer,
  count(t.id) AS ticket_count,
  round(sum(t.net_weight)::numeric, 0) AS total_net_kg,
  round(sum(t.net_weight * t.qc_actual_drc / 100)::numeric, 0) AS total_dry_kg,
  round(avg(t.qc_actual_drc)::numeric, 1) AS avg_drc
FROM b2b.partners p
JOIN public.bp_search_keys k ON k.bp_id=p.bp_id AND k.key_type='ALIAS' AND k.key_value LIKE 'TLM-%'
LEFT JOIN public.weighbridge_tickets t ON t.partner_id = p.id AND t.notes='SEED-TLM-E2E-2026-05'
GROUP BY k.key_value, p.name
ORDER BY ticket_count DESC, alias;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 3: BRIDGE COVERAGE — phiếu cân nào CHƯA có intake batch?
-- ════════════════════════════════════════════════════════════════════════════
-- Kỳ vọng: 0 dòng (bridge đã tạo đủ cho 55 phiếu).
-- Nếu có dòng → bridge bị miss → cần check trigger/migration.
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  t.code,
  t.vehicle_plate,
  t.partner_id IS NOT NULL AS has_partner,
  t.supplier_id IS NOT NULL AS has_supplier,
  t.deal_id IS NOT NULL AS has_deal,
  t.status,
  t.rubber_type,
  t.net_weight
FROM public.weighbridge_tickets t
LEFT JOIN public.rubber_intake_batches rib ON rib.weighbridge_ticket_id = t.id
WHERE t.notes='SEED-TLM-E2E-2026-05'
  AND rib.id IS NULL
ORDER BY t.created_at;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 4: PCG MATCH SIMULATION — mô phỏng resolvePcgForTickets
-- ════════════════════════════════════════════════════════════════════════════
-- Cho mỗi phiếu cân bộc phát, tìm PCG khớp theo:
--   - facility_id
--   - ngày cân ∈ [weigh_from, weigh_to]
--   - dealer_lines có partner_id khớp & price_per_ton > 0
--   - status='locked' (lúc seed) hoặc 'used' (sau khi ai đó test ĐNTT)
--
-- Kỳ vọng: 8 đại lý trong PCG được match (DBL, LVT, NTH, NTT, NTHG, HNT,
-- NTHTAM, TTY) = ~31 tickets. 7 đại lý không trong PCG = ~24 tickets không match.
-- ════════════════════════════════════════════════════════════════════════════
WITH ticket_partners AS (
  SELECT
    t.id AS ticket_id,
    t.code,
    t.created_at::date AS weigh_date,
    t.partner_id,
    t.facility_id,
    p.name AS dealer_name,
    k.key_value AS alias,
    t.net_weight,
    t.qc_actual_drc,
    round((t.net_weight * t.qc_actual_drc / 100)::numeric, 2) AS dry_kg
  FROM public.weighbridge_tickets t
  JOIN b2b.partners p ON p.id = t.partner_id
  JOIN public.bp_search_keys k ON k.bp_id=p.bp_id AND k.key_type='ALIAS' AND k.key_value LIKE 'TLM-%'
  WHERE t.notes='SEED-TLM-E2E-2026-05'
    AND t.deal_id IS NULL
    AND t.supplier_id IS NULL
),
pcg_dealer_map AS (
  SELECT
    pcg.id AS pcg_id,
    pcg.code AS pcg_code,
    pcg.facility_id,
    pcg.weigh_from,
    pcg.weigh_to,
    pcg.lock_date,
    pcg.status,
    (line->>'partner_id')::uuid AS partner_id,
    (line->>'price_per_ton')::numeric AS price_per_ton
  FROM public.b2b_price_lock_tickets pcg
  CROSS JOIN LATERAL jsonb_array_elements(pcg.dealer_lines) AS line
  WHERE pcg.note='SEED-TLM-E2E-2026-05'
    AND pcg.status IN ('locked','used')
)
SELECT
  tp.alias,
  tp.dealer_name,
  tp.weigh_date,
  tp.code AS ticket_code,
  tp.dry_kg,
  pdm.pcg_code,
  pdm.price_per_ton AS pcg_price_per_ton,
  CASE WHEN pdm.price_per_ton IS NOT NULL
       THEN round((tp.dry_kg * pdm.price_per_ton / 1000)::numeric, 0)
       ELSE NULL
  END AS expected_amount_vnd,
  CASE
    WHEN pdm.pcg_id IS NULL THEN '❌ CHƯA CHỐT GIÁ'
    ELSE '✅ MATCH ' || pdm.pcg_code
  END AS resolver_result
FROM ticket_partners tp
LEFT JOIN pcg_dealer_map pdm
  ON pdm.facility_id = tp.facility_id
 AND pdm.partner_id  = tp.partner_id
 AND tp.weigh_date BETWEEN COALESCE(pdm.weigh_from, pdm.lock_date)
                       AND COALESCE(pdm.weigh_to,   pdm.lock_date)
ORDER BY tp.weigh_date, tp.alias;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 5: TÓM TẮT PCG MATCH RATE
-- ════════════════════════════════════════════════════════════════════════════
-- Kỳ vọng: ~31 matched, ~24 unmatched (do PCG chỉ cover 8/15 đại lý).
-- ════════════════════════════════════════════════════════════════════════════
WITH ticket_partners AS (
  SELECT t.id, t.partner_id, t.facility_id, t.created_at::date AS weigh_date
  FROM public.weighbridge_tickets t
  WHERE t.notes='SEED-TLM-E2E-2026-05'
    AND t.deal_id IS NULL AND t.supplier_id IS NULL
),
pcg_dealer_map AS (
  SELECT pcg.id, pcg.facility_id, pcg.weigh_from, pcg.weigh_to, pcg.lock_date,
         (line->>'partner_id')::uuid AS partner_id
  FROM public.b2b_price_lock_tickets pcg
  CROSS JOIN LATERAL jsonb_array_elements(pcg.dealer_lines) AS line
  WHERE pcg.note='SEED-TLM-E2E-2026-05' AND pcg.status IN ('locked','used')
)
SELECT
  CASE WHEN pdm.id IS NULL THEN '❌ Chưa chốt giá' ELSE '✅ Match PCG' END AS resolver_status,
  count(*) AS ticket_count,
  round((count(*) * 100.0 / sum(count(*)) OVER ())::numeric, 1) AS percent
FROM ticket_partners tp
LEFT JOIN pcg_dealer_map pdm
  ON pdm.facility_id=tp.facility_id
 AND pdm.partner_id=tp.partner_id
 AND tp.weigh_date BETWEEN COALESCE(pdm.weigh_from, pdm.lock_date)
                       AND COALESCE(pdm.weigh_to,   pdm.lock_date)
GROUP BY 1;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 6: BANK RESOLVE — mô phỏng getEffectiveBank per partner
-- ════════════════════════════════════════════════════════════════════════════
-- Cho mỗi đại lý seller, hiện TK hiệu lực (own bank hoặc proxy bank).
-- Kỳ vọng:
--   9 sellers có own bank → via='self'
--   5 sellers via proxy (NTH→NHN, NTHG→TMH, HNT→HTC, LTG→NVQ, NTHADOI→NNH)
--   1 seller (NTHX) không có bank lẫn proxy → null (kế toán nhập tay)
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  k.key_value AS seller_alias,
  p.name AS seller,
  proxy_k.key_value AS proxy_alias,
  proxy_p.name AS proxy_name,
  CASE
    WHEN p.payment_proxy_partner_id IS NOT NULL THEN 'proxy'
    WHEN own_bank.bank_account IS NOT NULL THEN 'self'
    ELSE 'NONE — kế toán nhập tay'
  END AS bank_via,
  COALESCE(proxy_bank.bank_account, own_bank.bank_account) AS effective_account,
  COALESCE(proxy_bank.bank_holder, own_bank.bank_holder) AS effective_holder,
  COALESCE(proxy_bank.bank_name, own_bank.bank_name) AS effective_bank_name
FROM b2b.partners p
JOIN public.bp_search_keys k ON k.bp_id=p.bp_id AND k.key_type='ALIAS' AND k.key_value LIKE 'TLM-%'
LEFT JOIN public.b2b_partner_banks own_bank
  ON own_bank.partner_id = p.id AND own_bank.is_default = true AND own_bank.is_active = true
LEFT JOIN b2b.partners proxy_p ON proxy_p.id = p.payment_proxy_partner_id
LEFT JOIN public.bp_search_keys proxy_k
  ON proxy_k.bp_id = proxy_p.bp_id AND proxy_k.key_type='ALIAS'
LEFT JOIN public.b2b_partner_banks proxy_bank
  ON proxy_bank.partner_id = proxy_p.id AND proxy_bank.is_default = true AND proxy_bank.is_active = true
WHERE p.is_payment_proxy = false OR p.is_payment_proxy IS NULL  -- chỉ sellers
ORDER BY bank_via DESC, k.key_value;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 7: MÔ PHỎNG 1 NGÀY ĐNTT (26/05/2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Lấy 5 phiếu cân ngày 26/05, hiện đủ thông tin để dựng ĐNTT:
--   - dòng cho mỗi phiếu (price từ PCG)
--   - dòng "Phí áp dụng" (tổng phí PCG theo KL khô)
--   - bank để in ĐNTT
-- ════════════════════════════════════════════════════════════════════════════
WITH day_tickets AS (
  SELECT
    t.id, t.code, t.partner_id, t.facility_id, t.created_at::date AS weigh_date,
    p.name AS dealer_name,
    k.key_value AS alias,
    round((t.net_weight * t.qc_actual_drc / 100)::numeric, 2) AS dry_kg
  FROM public.weighbridge_tickets t
  JOIN b2b.partners p ON p.id=t.partner_id
  JOIN public.bp_search_keys k ON k.bp_id=p.bp_id AND k.key_type='ALIAS'
  WHERE t.notes='SEED-TLM-E2E-2026-05'
    AND t.created_at::date = DATE '2026-05-26'
),
matched AS (
  SELECT
    dt.*,
    (line->>'price_per_ton')::numeric AS price_per_ton,
    pcg.code AS pcg_code,
    pcg.fees AS pcg_fees
  FROM day_tickets dt
  LEFT JOIN public.b2b_price_lock_tickets pcg
    ON pcg.facility_id = dt.facility_id
   AND pcg.status IN ('locked','used')
   AND pcg.note='SEED-TLM-E2E-2026-05'
   AND dt.weigh_date BETWEEN COALESCE(pcg.weigh_from, pcg.lock_date)
                         AND COALESCE(pcg.weigh_to, pcg.lock_date)
  LEFT JOIN LATERAL jsonb_array_elements(pcg.dealer_lines) line
    ON (line->>'partner_id')::uuid = dt.partner_id
)
SELECT
  alias, dealer_name, code AS ticket_code, dry_kg, pcg_code,
  price_per_ton AS pcg_d_per_ton,
  CASE WHEN price_per_ton IS NOT NULL
       THEN round((dry_kg * price_per_ton / 1000)::numeric, -3)  -- làm tròn nghìn
       ELSE NULL
  END AS expected_line_amount_vnd
FROM matched
ORDER BY alias;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 8: PHÍ PCG TỔNG HỢP (cho 1 PCG)
-- ════════════════════════════════════════════════════════════════════════════
-- PCG seed có fees='[]' (rỗng) — không có phí. Nếu anh thêm phí qua UI hoặc
-- update PCG, query này tính tổng phí áp dụng.
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  pcg.code,
  jsonb_array_length(pcg.fees) AS fee_count,
  COALESCE(SUM(CASE WHEN fee->>'basis'='ton' THEN (fee->>'amount')::numeric ELSE 0 END), 0) AS sum_per_ton,
  COALESCE(SUM(CASE WHEN fee->>'basis'='lot' THEN (fee->>'amount')::numeric ELSE 0 END), 0) AS sum_per_lot,
  pcg.fees AS fees_raw
FROM public.b2b_price_lock_tickets pcg
LEFT JOIN LATERAL jsonb_array_elements(pcg.fees) fee ON true
WHERE pcg.note='SEED-TLM-E2E-2026-05'
GROUP BY pcg.id, pcg.code, pcg.fees;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 9: GAPS — phiếu cân không thanh toán được (không có PCG + không có bank)
-- ════════════════════════════════════════════════════════════════════════════
-- Kỳ vọng: tickets của NTHX (3 phiếu) sẽ ở đây — không có PCG match, không có bank.
-- ════════════════════════════════════════════════════════════════════════════
WITH ticket_info AS (
  SELECT
    t.id, t.code, t.partner_id, t.facility_id, t.created_at::date AS weigh_date,
    p.name AS dealer_name, k.key_value AS alias
  FROM public.weighbridge_tickets t
  JOIN b2b.partners p ON p.id=t.partner_id
  JOIN public.bp_search_keys k ON k.bp_id=p.bp_id AND k.key_type='ALIAS'
  WHERE t.notes='SEED-TLM-E2E-2026-05'
    AND t.deal_id IS NULL AND t.supplier_id IS NULL
),
pcg_match AS (
  SELECT DISTINCT ti.id AS ticket_id
  FROM ticket_info ti
  JOIN public.b2b_price_lock_tickets pcg
    ON pcg.facility_id = ti.facility_id
   AND pcg.status IN ('locked','used')
   AND ti.weigh_date BETWEEN COALESCE(pcg.weigh_from, pcg.lock_date)
                         AND COALESCE(pcg.weigh_to, pcg.lock_date)
  CROSS JOIN LATERAL jsonb_array_elements(pcg.dealer_lines) line
  WHERE (line->>'partner_id')::uuid = ti.partner_id
),
bank_resolve AS (
  SELECT ti.id AS ticket_id,
    COALESCE(proxy_b.bank_account, own_b.bank_account) AS bank
  FROM ticket_info ti
  JOIN b2b.partners p ON p.id = ti.partner_id
  LEFT JOIN public.b2b_partner_banks own_b
    ON own_b.partner_id = p.id AND own_b.is_default=true AND own_b.is_active=true
  LEFT JOIN public.b2b_partner_banks proxy_b
    ON proxy_b.partner_id = p.payment_proxy_partner_id AND proxy_b.is_default=true AND proxy_b.is_active=true
)
SELECT
  ti.alias, ti.dealer_name, ti.weigh_date, ti.code AS ticket_code,
  CASE WHEN pm.ticket_id IS NULL THEN '❌' ELSE '✅' END AS has_pcg,
  CASE WHEN br.bank IS NULL THEN '❌' ELSE '✅' END AS has_bank,
  br.bank AS effective_bank
FROM ticket_info ti
LEFT JOIN pcg_match pm ON pm.ticket_id = ti.id
LEFT JOIN bank_resolve br ON br.ticket_id = ti.id
WHERE pm.ticket_id IS NULL OR br.bank IS NULL
ORDER BY ti.alias, ti.weigh_date;


-- ════════════════════════════════════════════════════════════════════════════
-- SECTION 10: TỔNG KẾT E2E READINESS
-- ════════════════════════════════════════════════════════════════════════════
WITH ticket_info AS (
  SELECT t.id, t.partner_id, t.facility_id, t.created_at::date AS weigh_date,
         t.qc_actual_drc, t.net_weight
  FROM public.weighbridge_tickets t
  WHERE t.notes='SEED-TLM-E2E-2026-05'
    AND t.deal_id IS NULL AND t.supplier_id IS NULL
),
status_flags AS (
  SELECT
    ti.id,
    EXISTS (
      SELECT 1 FROM public.rubber_intake_batches WHERE weighbridge_ticket_id = ti.id
    ) AS has_intake,
    EXISTS (
      SELECT 1 FROM public.b2b_price_lock_tickets pcg
      CROSS JOIN LATERAL jsonb_array_elements(pcg.dealer_lines) line
      WHERE pcg.note='SEED-TLM-E2E-2026-05'
        AND pcg.facility_id = ti.facility_id
        AND pcg.status IN ('locked','used')
        AND ti.weigh_date BETWEEN COALESCE(pcg.weigh_from, pcg.lock_date)
                              AND COALESCE(pcg.weigh_to, pcg.lock_date)
        AND (line->>'partner_id')::uuid = ti.partner_id
    ) AS has_pcg_price,
    (
      SELECT (COALESCE(proxy_b.bank_account, own_b.bank_account) IS NOT NULL)
      FROM b2b.partners p
      LEFT JOIN public.b2b_partner_banks own_b ON own_b.partner_id=p.id AND own_b.is_default=true
      LEFT JOIN public.b2b_partner_banks proxy_b ON proxy_b.partner_id=p.payment_proxy_partner_id AND proxy_b.is_default=true
      WHERE p.id = ti.partner_id
    ) AS has_bank,
    (ti.qc_actual_drc > 0) AS has_drc
  FROM ticket_info ti
)
SELECT
  count(*) AS total_tickets,
  sum(has_intake::int) AS with_intake,
  sum(has_pcg_price::int) AS with_pcg_price,
  sum(has_bank::int) AS with_bank,
  sum(has_drc::int) AS with_drc,
  sum((has_intake AND has_pcg_price AND has_bank AND has_drc)::int) AS fully_ready_e2e,
  sum((NOT has_intake)::int) AS missing_intake,
  sum((NOT has_pcg_price)::int) AS missing_pcg,
  sum((NOT has_bank)::int) AS missing_bank,
  sum((NOT has_drc)::int) AS missing_drc
FROM status_flags;

-- ============================================================================
-- KỲ VỌNG SECTION 10:
--   total_tickets = 55
--   with_intake = 55 (bridge OK)
--   with_pcg_price = ~31 (8 dealers in PCG × tickets per dealer)
--   with_bank = ~52 (9 own + 5 proxy = 14 dealers × tickets; 1 dealer NTHX không có)
--   with_drc = 55 (seed set qc_actual_drc cho mọi phiếu)
--   fully_ready_e2e = ~30-31 (tickets có đủ intake+PCG+bank+DRC)
--   missing_pcg = ~24 (7 dealers không trong PCG)
--   missing_bank = ~3 (NTHX 3 tickets)
-- ============================================================================
