-- ============================================================================
-- FIX: v_b2b_partner_bonus_progress tính theo bonus_unit (dry/wet)
-- File: docs/migrations/b2b_bonus_progress_view_dry_weight.sql
-- Date: 2026-05-29
--
-- VẤN ĐỀ: View progress (tạo ở b2b_bonus_system.sql STEP 7) SUM net_weight_kg
-- (KL ƯỚT) cho MỌI loại mủ. Nhưng compute_monthly_bonus (sprint1_03) tính
-- mủ nước theo KL KHÔ (bonus_unit='dry' → dry_weight_kg = net × DRC/100).
-- → Portal/ERP hiển thị "bonus dự kiến" + "tiến độ" mủ nước CAO HƠN NHIỀU
--   bonus thực sẽ tính/chi. View này đồng bộ lại đúng logic function.
--
-- THAY ĐỔI: chỉ sửa CTE intake_sum để chọn cột KL theo bonus_unit của loại mủ
-- (giống PASS 1+2 của compute_monthly_bonus). Cột output GIỮ NGUYÊN → không vỡ
-- view phụ thuộc v_b2b_bonus_near_next_tier.
--
-- Phụ thuộc: b2b_bonus_system.sql, sprint1_03 (cột bonus_unit),
--            b2b_intake_field_data_tanlam.sql (cột GENERATED dry_weight_kg).
-- AN TOÀN: CREATE OR REPLACE, idempotent.
-- ============================================================================

CREATE OR REPLACE VIEW public.v_b2b_partner_bonus_progress
WITH (security_invoker = true)
AS
WITH current_period AS (
  SELECT
    extract(year FROM CURRENT_DATE)::int AS yr,
    extract(month FROM CURRENT_DATE)::int AS mo,
    date_trunc('month', CURRENT_DATE)::date AS first_day,
    (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date AS last_day
),
intake_sum AS (
  SELECT
    rib.b2b_partner_id AS partner_id,
    rib.rubber_type,
    -- bonus_unit='dry' → KL khô (fallback net nếu dry NULL); else → KL ướt.
    -- Khớp logic compute_monthly_bonus (sprint1_03).
    SUM(
      CASE WHEN bu.bonus_unit = 'dry'
           THEN COALESCE(rib.dry_weight_kg, rib.net_weight_kg)
           ELSE rib.net_weight_kg END
    ) AS total_kg
  FROM public.rubber_intake_batches rib
  CROSS JOIN current_period cp
  LEFT JOIN LATERAL (
    SELECT br.bonus_unit
    FROM public.b2b_bonus_rules br
    WHERE br.rubber_type = rib.rubber_type
      AND br.effective_from <= cp.last_day
      AND (br.effective_to IS NULL OR br.effective_to >= cp.first_day)
    ORDER BY br.effective_from DESC
    LIMIT 1
  ) bu ON true
  WHERE rib.b2b_partner_id IS NOT NULL
    AND rib.rubber_type IS NOT NULL
    AND rib.intake_date BETWEEN cp.first_day AND cp.last_day
    AND rib.status IN ('confirmed','settled')
    AND rib.net_weight_kg IS NOT NULL
  GROUP BY rib.b2b_partner_id, rib.rubber_type
),
matched AS (
  SELECT
    i.partner_id,
    i.rubber_type,
    i.total_kg,
    (i.total_kg / 1000.0) AS volume_tons,
    (
      SELECT row_to_json(r) FROM (
        SELECT br.tier_label, br.bonus_per_ton_vnd
        FROM public.b2b_bonus_rules br, current_period cp
        WHERE br.rubber_type = i.rubber_type
          AND br.effective_from <= cp.last_day
          AND (br.effective_to IS NULL OR br.effective_to >= cp.first_day)
          AND (i.total_kg / 1000.0) > br.threshold_min_tons
          AND (br.threshold_max_tons IS NULL OR (i.total_kg / 1000.0) <= br.threshold_max_tons)
        ORDER BY br.threshold_min_tons DESC LIMIT 1
      ) r
    ) AS current_rule,
    (
      SELECT row_to_json(r) FROM (
        SELECT br.tier_label, br.threshold_min_tons, br.bonus_per_ton_vnd
        FROM public.b2b_bonus_rules br, current_period cp
        WHERE br.rubber_type = i.rubber_type
          AND br.effective_from <= cp.last_day
          AND (br.effective_to IS NULL OR br.effective_to >= cp.first_day)
          AND br.threshold_min_tons >= (i.total_kg / 1000.0)
        ORDER BY br.threshold_min_tons ASC LIMIT 1
      ) r
    ) AS next_rule
  FROM intake_sum i
)
SELECT
  cp.yr  AS year,
  cp.mo  AS month,
  m.partner_id,
  m.rubber_type,
  m.total_kg AS total_volume_kg,
  m.volume_tons,
  (m.current_rule->>'tier_label')                  AS current_tier,
  ((m.current_rule->>'bonus_per_ton_vnd')::numeric) AS current_bonus_per_ton,
  COALESCE((m.current_rule->>'bonus_per_ton_vnd')::numeric * m.volume_tons, 0) AS estimated_bonus_vnd,
  (m.next_rule->>'tier_label')                     AS next_tier,
  ((m.next_rule->>'threshold_min_tons')::numeric)  AS next_threshold_tons,
  GREATEST(0, COALESCE((m.next_rule->>'threshold_min_tons')::numeric, 0) - m.volume_tons + 0.001)
                                                    AS tons_to_next_tier
FROM matched m CROSS JOIN current_period cp;

COMMENT ON VIEW public.v_b2b_partner_bonus_progress IS
  'Progress bonus tháng hiện tại — KL theo bonus_unit (nuoc=dry, tap=wet), đồng bộ compute_monthly_bonus.';

GRANT SELECT ON public.v_b2b_partner_bonus_progress TO authenticated, anon;

NOTIFY pgrst, 'reload schema';

-- ── SMOKE: view truy vấn được + đúng cột ──────────────────────────────────
DO $$
BEGIN
  PERFORM * FROM public.v_b2b_partner_bonus_progress LIMIT 1;
  RAISE NOTICE 'SMOKE PASS — v_b2b_partner_bonus_progress đã dùng dry/wet theo bonus_unit.';
END $$;

-- ROLLBACK: restore view từ b2b_bonus_system.sql STEP 7 (bản SUM net_weight_kg).
