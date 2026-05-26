-- ============================================================================
-- B2B Bonus Statistics Views — Thống kê đa chiều theo quy chế docx
-- Date: 2026-05-26
-- ============================================================================
--
-- Mục đích: Bổ sung 10+ view thống kê phục vụ các đối tượng:
--   - BGĐ        : financial summary, năm/quý
--   - Sales/Ops  : tier distribution, top partners, near-next-tier, dưới ngưỡng
--   - Kế toán    : lịch chi thưởng theo quy chế (15/[tháng đầu quý kế])
--   - Đại lý     : self-view bonus history + progress
--   - Compliance : audit trail, lifecycle metrics
--
-- Phụ thuộc: b2b_bonus_system.sql (b2b_bonus_rules, b2b_monthly_bonuses).
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- VIEW 1: v_b2b_bonus_monthly_summary
-- Tổng hợp 1 tháng × 1 loại mủ: tổng SL, tổng bonus, breakdown theo status
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.v_b2b_bonus_monthly_summary
WITH (security_invoker = true) AS
SELECT
  year,
  month,
  rubber_type,
  COUNT(*) FILTER (WHERE status <> 'cancelled')                    AS bonus_count,
  COUNT(DISTINCT partner_id) FILTER (WHERE status <> 'cancelled')  AS partner_count,
  SUM(volume_tons) FILTER (WHERE status <> 'cancelled')            AS total_volume_tons,
  SUM(total_bonus_vnd) FILTER (WHERE status <> 'cancelled')        AS total_bonus_vnd,
  SUM(total_bonus_vnd) FILTER (WHERE status = 'draft')             AS draft_bonus_vnd,
  SUM(total_bonus_vnd) FILTER (WHERE status = 'pending_approval')  AS pending_bonus_vnd,
  SUM(total_bonus_vnd) FILTER (WHERE status = 'approved')          AS approved_bonus_vnd,
  SUM(total_bonus_vnd) FILTER (WHERE status = 'paid')              AS paid_bonus_vnd,
  COUNT(*) FILTER (WHERE status = 'paid')                          AS paid_count,
  COUNT(*) FILTER (WHERE status = 'pending_approval')              AS pending_count
FROM public.b2b_monthly_bonuses
GROUP BY year, month, rubber_type;

COMMENT ON VIEW public.v_b2b_bonus_monthly_summary IS
  'Tổng hợp bonus theo (năm, tháng, loại mủ). Breakdown theo status.';

-- ════════════════════════════════════════════════════════════════════════════
-- VIEW 2: v_b2b_bonus_quarterly_summary
-- Quy chế chi theo quý → view này quan trọng cho BGĐ & kế toán
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.v_b2b_bonus_quarterly_summary
WITH (security_invoker = true) AS
SELECT
  year,
  CEIL(month / 3.0)::int                                            AS quarter,
  rubber_type,
  COUNT(*) FILTER (WHERE status <> 'cancelled')                    AS bonus_count,
  COUNT(DISTINCT partner_id) FILTER (WHERE status <> 'cancelled')  AS partner_count,
  SUM(volume_tons) FILTER (WHERE status <> 'cancelled')            AS total_volume_tons,
  SUM(total_bonus_vnd) FILTER (WHERE status <> 'cancelled')        AS total_bonus_vnd,
  SUM(total_bonus_vnd) FILTER (WHERE status = 'paid')              AS paid_bonus_vnd,
  SUM(total_bonus_vnd) FILTER (WHERE status IN ('approved','pending_approval','draft'))
                                                                    AS unpaid_bonus_vnd,
  -- Deadline chi thưởng theo quy chế (trước 15 tháng đầu quý kế)
  make_date(
    CASE WHEN CEIL(month / 3.0)::int = 4 THEN year + 1 ELSE year END,
    CASE WHEN CEIL(month / 3.0)::int = 4 THEN 1 ELSE CEIL(month / 3.0)::int * 3 + 1 END,
    15
  ) AS payment_deadline,
  -- Số ngày còn lại đến deadline (âm = đã quá hạn)
  (make_date(
    CASE WHEN CEIL(month / 3.0)::int = 4 THEN year + 1 ELSE year END,
    CASE WHEN CEIL(month / 3.0)::int = 4 THEN 1 ELSE CEIL(month / 3.0)::int * 3 + 1 END,
    15
  ) - CURRENT_DATE) AS days_until_deadline
FROM public.b2b_monthly_bonuses
GROUP BY year, CEIL(month / 3.0)::int, rubber_type;

COMMENT ON VIEW public.v_b2b_bonus_quarterly_summary IS
  'Tổng hợp bonus theo quý + deadline chi thưởng theo quy chế (15/[tháng đầu quý kế]).';

-- ════════════════════════════════════════════════════════════════════════════
-- VIEW 3: v_b2b_bonus_yearly_summary
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.v_b2b_bonus_yearly_summary
WITH (security_invoker = true) AS
SELECT
  year,
  rubber_type,
  COUNT(*) FILTER (WHERE status <> 'cancelled')                    AS bonus_count,
  COUNT(DISTINCT partner_id) FILTER (WHERE status <> 'cancelled')  AS partner_count,
  SUM(volume_tons) FILTER (WHERE status <> 'cancelled')            AS total_volume_tons,
  SUM(total_bonus_vnd) FILTER (WHERE status <> 'cancelled')        AS total_bonus_vnd,
  SUM(total_bonus_vnd) FILTER (WHERE status = 'paid')              AS paid_bonus_vnd,
  AVG(total_bonus_vnd) FILTER (WHERE status <> 'cancelled' AND total_bonus_vnd > 0)
                                                                    AS avg_bonus_per_partner_month
FROM public.b2b_monthly_bonuses
GROUP BY year, rubber_type;

COMMENT ON VIEW public.v_b2b_bonus_yearly_summary IS
  'Tổng hợp bonus cả năm theo loại mủ.';

-- ════════════════════════════════════════════════════════════════════════════
-- VIEW 4: v_b2b_bonus_tier_distribution
-- Phân bổ số lượng đại lý theo tier × tháng × loại mủ
-- (Ai đạt Kim Cương / Tier 4 nhiều nhất?)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.v_b2b_bonus_tier_distribution
WITH (security_invoker = true) AS
SELECT
  year,
  month,
  CEIL(month / 3.0)::int AS quarter,
  rubber_type,
  COALESCE(tier_applied, 'Chưa đạt ngưỡng')         AS tier_label,
  COUNT(DISTINCT partner_id)                         AS partner_count,
  SUM(volume_tons)                                   AS total_volume_tons,
  SUM(total_bonus_vnd)                               AS total_bonus_vnd
FROM public.b2b_monthly_bonuses
WHERE status <> 'cancelled'
GROUP BY year, month, rubber_type, COALESCE(tier_applied, 'Chưa đạt ngưỡng');

COMMENT ON VIEW public.v_b2b_bonus_tier_distribution IS
  'Số đại lý đạt mỗi tier theo tháng × loại mủ (kể cả "Chưa đạt ngưỡng").';

-- ════════════════════════════════════════════════════════════════════════════
-- VIEW 5: v_b2b_bonus_top_partners
-- Xếp hạng đại lý theo tổng bonus (theo năm hiện tại + năm trước)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.v_b2b_bonus_top_partners
WITH (security_invoker = true) AS
SELECT
  year,
  partner_id,
  bp_id,
  rubber_type,
  COUNT(*) FILTER (WHERE status <> 'cancelled')           AS months_with_bonus,
  SUM(volume_tons) FILTER (WHERE status <> 'cancelled')   AS total_volume_tons,
  SUM(total_bonus_vnd) FILTER (WHERE status <> 'cancelled') AS total_bonus_vnd,
  SUM(total_bonus_vnd) FILTER (WHERE status = 'paid')     AS paid_bonus_vnd,
  MAX(volume_tons)                                         AS best_month_volume_tons,
  MAX(total_bonus_vnd)                                     AS best_month_bonus_vnd,
  -- Mức tier cao nhất từng đạt
  (
    SELECT tier_applied FROM public.b2b_monthly_bonuses x
    WHERE x.partner_id = b.partner_id AND x.rubber_type = b.rubber_type AND x.year = b.year
      AND x.tier_applied IS NOT NULL AND x.status <> 'cancelled'
    ORDER BY x.bonus_per_ton DESC NULLS LAST LIMIT 1
  ) AS best_tier
FROM public.b2b_monthly_bonuses b
GROUP BY year, partner_id, bp_id, rubber_type;

COMMENT ON VIEW public.v_b2b_bonus_top_partners IS
  'Xếp hạng đại lý theo tổng bonus (1 năm × 1 loại mủ). Best tier + best month.';

-- ════════════════════════════════════════════════════════════════════════════
-- VIEW 6: v_b2b_bonus_partner_trend_12m
-- Lịch sử 12 tháng gần nhất per partner (cho B2B Portal partner history page)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.v_b2b_bonus_partner_trend_12m
WITH (security_invoker = true) AS
SELECT
  b.partner_id,
  b.bp_id,
  b.rubber_type,
  b.year,
  b.month,
  b.volume_tons,
  b.tier_applied,
  b.bonus_per_ton,
  b.total_bonus_vnd,
  b.status,
  b.paid_at,
  -- So sánh với tháng trước (cùng partner, cùng loại mủ)
  LAG(b.volume_tons) OVER (
    PARTITION BY b.partner_id, b.rubber_type
    ORDER BY b.year, b.month
  ) AS prev_month_volume_tons,
  LAG(b.tier_applied) OVER (
    PARTITION BY b.partner_id, b.rubber_type
    ORDER BY b.year, b.month
  ) AS prev_month_tier,
  -- % thay đổi sản lượng so với tháng trước
  CASE
    WHEN LAG(b.volume_tons) OVER (PARTITION BY b.partner_id, b.rubber_type ORDER BY b.year, b.month) > 0
    THEN ROUND(
      100.0 * (b.volume_tons - LAG(b.volume_tons) OVER (PARTITION BY b.partner_id, b.rubber_type ORDER BY b.year, b.month))
      / NULLIF(LAG(b.volume_tons) OVER (PARTITION BY b.partner_id, b.rubber_type ORDER BY b.year, b.month), 0),
      1
    )
    ELSE NULL
  END AS pct_volume_change
FROM public.b2b_monthly_bonuses b
WHERE make_date(b.year, b.month, 1) >= (CURRENT_DATE - interval '12 months')::date
  AND b.status <> 'cancelled';

COMMENT ON VIEW public.v_b2b_bonus_partner_trend_12m IS
  'Lịch sử 12 tháng + so sánh tháng trước (% thay đổi). Cho partner history page.';

-- ════════════════════════════════════════════════════════════════════════════
-- VIEW 7: v_b2b_bonus_payment_schedule
-- Lịch chốt + chi thưởng theo từng quý (deadline 15/[tháng đầu quý kế])
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.v_b2b_bonus_payment_schedule
WITH (security_invoker = true) AS
WITH quarters AS (
  SELECT * FROM v_b2b_bonus_quarterly_summary
)
SELECT
  year,
  quarter,
  rubber_type,
  -- Ngày chốt quý (cuối tháng cuối quý)
  CASE quarter
    WHEN 1 THEN make_date(year, 3, 31)
    WHEN 2 THEN make_date(year, 6, 30)
    WHEN 3 THEN make_date(year, 9, 30)
    WHEN 4 THEN make_date(year, 12, 31)
  END AS quarter_closing_date,
  payment_deadline,
  days_until_deadline,
  CASE
    WHEN days_until_deadline < 0 THEN 'overdue'
    WHEN days_until_deadline = 0 THEN 'due_today'
    WHEN days_until_deadline <= 7 THEN 'due_soon'
    ELSE 'on_track'
  END                                            AS urgency,
  bonus_count,
  partner_count,
  total_bonus_vnd,
  paid_bonus_vnd,
  unpaid_bonus_vnd,
  CASE
    WHEN total_bonus_vnd > 0
    THEN ROUND(100.0 * paid_bonus_vnd / total_bonus_vnd, 1)
    ELSE 0
  END                                            AS pct_paid
FROM quarters;

COMMENT ON VIEW public.v_b2b_bonus_payment_schedule IS
  'Lịch chốt quý + deadline chi thưởng + tỷ lệ đã chi. Cho kế toán quản lý lịch chi.';

-- ════════════════════════════════════════════════════════════════════════════
-- VIEW 8: v_b2b_bonus_near_next_tier
-- Đại lý sắp đạt ngưỡng kế tiếp THÁNG HIỆN TẠI (motivation / follow-up)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.v_b2b_bonus_near_next_tier
WITH (security_invoker = true) AS
SELECT
  partner_id,
  rubber_type,
  total_volume_kg,
  volume_tons,
  current_tier,
  current_bonus_per_ton,
  estimated_bonus_vnd,
  next_tier,
  next_threshold_tons,
  tons_to_next_tier,
  -- Mức bonus nếu đạt next tier (volume_tons + tons_to_next_tier) × next bonus rate
  CASE
    WHEN next_tier IS NOT NULL THEN
      ROUND(
        (next_threshold_tons + 0.001) *
        COALESCE((
          SELECT bonus_per_ton_vnd FROM public.b2b_bonus_rules
          WHERE tier_label = next_tier AND rubber_type = v.rubber_type
            AND effective_from <= CURRENT_DATE
            AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
          LIMIT 1
        ), 0)
      )
    ELSE NULL
  END AS bonus_if_reach_next_tier,
  -- Tiền bonus tăng thêm nếu lên tier
  CASE
    WHEN next_tier IS NOT NULL THEN
      ROUND(
        (next_threshold_tons + 0.001) *
        COALESCE((
          SELECT bonus_per_ton_vnd FROM public.b2b_bonus_rules
          WHERE tier_label = next_tier AND rubber_type = v.rubber_type
            AND effective_from <= CURRENT_DATE
            AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
          LIMIT 1
        ), 0)
      ) - estimated_bonus_vnd
    ELSE NULL
  END AS bonus_gain_if_reach_next
FROM public.v_b2b_partner_bonus_progress v
WHERE next_tier IS NOT NULL
ORDER BY tons_to_next_tier ASC;

COMMENT ON VIEW public.v_b2b_bonus_near_next_tier IS
  'Đại lý sắp đạt tier kế tiếp tháng hiện tại + ước tính bonus nếu lên tier. Cho Sales follow-up.';

-- ════════════════════════════════════════════════════════════════════════════
-- VIEW 9: v_b2b_bonus_below_threshold
-- Đại lý CÓ nhập hàng nhưng dưới ngưỡng tối thiểu (chưa được thưởng)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.v_b2b_bonus_below_threshold
WITH (security_invoker = true) AS
SELECT
  b.year,
  b.month,
  b.partner_id,
  b.bp_id,
  b.rubber_type,
  b.volume_tons,
  (
    SELECT MIN(threshold_min_tons)
    FROM public.b2b_bonus_rules
    WHERE rubber_type = b.rubber_type
      AND effective_from <= make_date(b.year, b.month, 1)
      AND (effective_to IS NULL OR effective_to >= make_date(b.year, b.month, 1))
  )                                              AS min_threshold_to_get_bonus,
  (
    SELECT MIN(threshold_min_tons) - b.volume_tons + 0.001
    FROM public.b2b_bonus_rules
    WHERE rubber_type = b.rubber_type
      AND effective_from <= make_date(b.year, b.month, 1)
      AND (effective_to IS NULL OR effective_to >= make_date(b.year, b.month, 1))
  )                                              AS tons_needed_for_first_tier
FROM public.b2b_monthly_bonuses b
WHERE b.matched_rule_id IS NULL
  AND b.volume_tons > 0
  AND b.status <> 'cancelled';

COMMENT ON VIEW public.v_b2b_bonus_below_threshold IS
  'Đại lý có nhập hàng nhưng dưới ngưỡng tối thiểu (chưa thưởng). Cần Sales hỗ trợ tăng SL.';

-- ════════════════════════════════════════════════════════════════════════════
-- VIEW 10: v_b2b_bonus_pending_actions
-- Các action cần làm — cho ADMIN DASHBOARD (1-stop overview)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.v_b2b_bonus_pending_actions
WITH (security_invoker = true) AS
SELECT
  'pending_approval' AS action_type,
  COUNT(*)           AS count,
  SUM(total_bonus_vnd) AS amount_vnd,
  'BGĐ duyệt phiếu thưởng đang chờ' AS description
FROM public.b2b_monthly_bonuses
WHERE status = 'pending_approval'

UNION ALL

SELECT
  'approved_unpaid' AS action_type,
  COUNT(*)          AS count,
  SUM(total_bonus_vnd) AS amount_vnd,
  'Đã duyệt, kế toán cần chi (chưa tạo phiếu chi quý)' AS description
FROM public.b2b_monthly_bonuses
WHERE status = 'approved' AND paid_settlement_id IS NULL

UNION ALL

SELECT
  'overdue_payment' AS action_type,
  COUNT(*)          AS count,
  SUM(total_bonus_vnd) AS amount_vnd,
  'Quá hạn chi theo quy chế (15/[tháng đầu quý kế])' AS description
FROM public.b2b_monthly_bonuses b
WHERE status = 'approved'
  AND paid_at IS NULL
  AND make_date(
        CASE WHEN CEIL(b.month / 3.0)::int = 4 THEN b.year + 1 ELSE b.year END,
        CASE WHEN CEIL(b.month / 3.0)::int = 4 THEN 1 ELSE CEIL(b.month / 3.0)::int * 3 + 1 END,
        15
      ) < CURRENT_DATE

UNION ALL

SELECT
  'current_month_draft' AS action_type,
  COUNT(*)              AS count,
  SUM(total_bonus_vnd) AS amount_vnd,
  'Bonus draft tháng hiện tại (chờ tính lại + submit)' AS description
FROM public.b2b_monthly_bonuses
WHERE status = 'draft'
  AND year = extract(year FROM CURRENT_DATE)::int
  AND month = extract(month FROM CURRENT_DATE)::int;

COMMENT ON VIEW public.v_b2b_bonus_pending_actions IS
  'Các action cần làm — đếm phiếu pending + amount. Cho admin dashboard.';

-- ════════════════════════════════════════════════════════════════════════════
-- VIEW 11: v_b2b_bonus_admin_dashboard
-- Tổng quan 1-row cho dashboard (tháng hiện tại + quý hiện tại + năm)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.v_b2b_bonus_admin_dashboard
WITH (security_invoker = true) AS
WITH current_period AS (
  SELECT
    extract(year FROM CURRENT_DATE)::int       AS yr,
    extract(month FROM CURRENT_DATE)::int      AS mo,
    CEIL(extract(month FROM CURRENT_DATE) / 3.0)::int AS qtr
)
SELECT
  cp.yr   AS year,
  cp.mo   AS month,
  cp.qtr  AS quarter,
  -- Tháng hiện tại
  (SELECT COUNT(*) FROM public.b2b_monthly_bonuses
     WHERE year=cp.yr AND month=cp.mo AND status<>'cancelled')                        AS month_bonus_count,
  (SELECT COALESCE(SUM(total_bonus_vnd),0) FROM public.b2b_monthly_bonuses
     WHERE year=cp.yr AND month=cp.mo AND status<>'cancelled')                        AS month_total_bonus_vnd,
  (SELECT COALESCE(SUM(volume_tons),0) FROM public.b2b_monthly_bonuses
     WHERE year=cp.yr AND month=cp.mo AND status<>'cancelled')                        AS month_total_volume_tons,
  -- Quý hiện tại
  (SELECT COUNT(*) FROM public.b2b_monthly_bonuses
     WHERE year=cp.yr AND CEIL(month/3.0)::int=cp.qtr AND status<>'cancelled')        AS quarter_bonus_count,
  (SELECT COALESCE(SUM(total_bonus_vnd),0) FROM public.b2b_monthly_bonuses
     WHERE year=cp.yr AND CEIL(month/3.0)::int=cp.qtr AND status<>'cancelled')        AS quarter_total_bonus_vnd,
  (SELECT COALESCE(SUM(total_bonus_vnd),0) FROM public.b2b_monthly_bonuses
     WHERE year=cp.yr AND CEIL(month/3.0)::int=cp.qtr AND status='paid')              AS quarter_paid_bonus_vnd,
  -- Năm hiện tại
  (SELECT COUNT(DISTINCT partner_id) FROM public.b2b_monthly_bonuses
     WHERE year=cp.yr AND status<>'cancelled' AND total_bonus_vnd>0)                  AS year_partners_with_bonus,
  (SELECT COALESCE(SUM(total_bonus_vnd),0) FROM public.b2b_monthly_bonuses
     WHERE year=cp.yr AND status<>'cancelled')                                        AS year_total_bonus_vnd,
  (SELECT COALESCE(SUM(total_bonus_vnd),0) FROM public.b2b_monthly_bonuses
     WHERE year=cp.yr AND status='paid')                                              AS year_paid_bonus_vnd,
  -- Pending counts
  (SELECT COUNT(*) FROM public.b2b_monthly_bonuses WHERE status='pending_approval')   AS pending_approval_count,
  (SELECT COUNT(*) FROM public.b2b_monthly_bonuses
     WHERE status='approved' AND paid_settlement_id IS NULL)                          AS approved_unpaid_count,
  -- Breakdown theo loại mủ trong năm
  (SELECT COALESCE(SUM(total_bonus_vnd),0) FROM public.b2b_monthly_bonuses
     WHERE year=cp.yr AND rubber_type='tap' AND status<>'cancelled')                  AS year_tap_bonus_vnd,
  (SELECT COALESCE(SUM(total_bonus_vnd),0) FROM public.b2b_monthly_bonuses
     WHERE year=cp.yr AND rubber_type='nuoc' AND status<>'cancelled')                 AS year_nuoc_bonus_vnd
FROM current_period cp;

COMMENT ON VIEW public.v_b2b_bonus_admin_dashboard IS
  '1-row dashboard: tháng/quý/năm hiện tại + pending actions. Cho admin home.';

-- ════════════════════════════════════════════════════════════════════════════
-- VIEW 12: v_b2b_bonus_rules_active
-- Helper: rules đang còn hiệu lực + ngưỡng formatted cho UI
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.v_b2b_bonus_rules_active
WITH (security_invoker = true) AS
SELECT
  r.*,
  CASE
    WHEN threshold_max_tons IS NULL THEN '> ' || threshold_min_tons || 'T'
    ELSE '> ' || threshold_min_tons || 'T (≤ ' || threshold_max_tons || 'T)'
  END                                                  AS threshold_label,
  CASE
    WHEN bonus_per_ton_vnd >= 1000000 THEN
      ROUND(bonus_per_ton_vnd / 1000000, 1) || ' triệu/T'
    WHEN bonus_per_ton_vnd >= 1000 THEN
      ROUND(bonus_per_ton_vnd / 1000)::text || 'k/T'
    ELSE bonus_per_ton_vnd::text || 'đ/T'
  END                                                  AS bonus_label,
  CASE rubber_type WHEN 'tap' THEN 'Mủ tạp' WHEN 'nuoc' THEN 'Mủ nước' END AS rubber_type_label
FROM public.b2b_bonus_rules r
WHERE effective_from <= CURRENT_DATE
  AND (effective_to IS NULL OR effective_to >= CURRENT_DATE);

COMMENT ON VIEW public.v_b2b_bonus_rules_active IS
  'Rules đang hiệu lực + label đẹp cho UI. Dùng ở admin BonusRulesPage + partner home.';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP CUỐI: NOTIFY + GRANT + SMOKE
-- ════════════════════════════════════════════════════════════════════════════
GRANT SELECT ON
  public.v_b2b_bonus_monthly_summary,
  public.v_b2b_bonus_quarterly_summary,
  public.v_b2b_bonus_yearly_summary,
  public.v_b2b_bonus_tier_distribution,
  public.v_b2b_bonus_top_partners,
  public.v_b2b_bonus_partner_trend_12m,
  public.v_b2b_bonus_payment_schedule,
  public.v_b2b_bonus_near_next_tier,
  public.v_b2b_bonus_below_threshold,
  public.v_b2b_bonus_pending_actions,
  public.v_b2b_bonus_admin_dashboard,
  public.v_b2b_bonus_rules_active
TO authenticated, anon;

NOTIFY pgrst, 'reload schema';

DO $$
DECLARE
  v_dashboard_year int;
BEGIN
  -- Smoke 1: Tất cả view truy vấn được không lỗi
  PERFORM * FROM public.v_b2b_bonus_monthly_summary LIMIT 1;
  PERFORM * FROM public.v_b2b_bonus_quarterly_summary LIMIT 1;
  PERFORM * FROM public.v_b2b_bonus_yearly_summary LIMIT 1;
  PERFORM * FROM public.v_b2b_bonus_tier_distribution LIMIT 1;
  PERFORM * FROM public.v_b2b_bonus_top_partners LIMIT 1;
  PERFORM * FROM public.v_b2b_bonus_partner_trend_12m LIMIT 1;
  PERFORM * FROM public.v_b2b_bonus_payment_schedule LIMIT 1;
  PERFORM * FROM public.v_b2b_bonus_near_next_tier LIMIT 1;
  PERFORM * FROM public.v_b2b_bonus_below_threshold LIMIT 1;
  PERFORM * FROM public.v_b2b_bonus_pending_actions LIMIT 1;
  PERFORM * FROM public.v_b2b_bonus_admin_dashboard LIMIT 1;
  PERFORM * FROM public.v_b2b_bonus_rules_active LIMIT 1;

  -- Smoke 2: rules_active phải có 4 row nếu chạy trong T1-T5/2026 (chỉ tạp), 8 row nếu T6+
  IF (SELECT count(*) FROM public.v_b2b_bonus_rules_active WHERE CURRENT_DATE >= '2026-06-01') < 8 THEN
    -- Sau T6/2026 phải có cả 4 nuoc + 4 tap
    IF CURRENT_DATE >= '2026-06-01' THEN
      RAISE EXCEPTION 'SMOKE FAIL: rules_active phải có 8 row sau T6/2026, hiện: %',
        (SELECT count(*) FROM public.v_b2b_bonus_rules_active);
    END IF;
  END IF;

  -- Smoke 3: admin_dashboard phải trả về 1 row
  SELECT year INTO v_dashboard_year FROM public.v_b2b_bonus_admin_dashboard;
  IF v_dashboard_year IS NULL THEN
    RAISE EXCEPTION 'SMOKE FAIL: admin_dashboard không trả row';
  END IF;

  RAISE NOTICE 'SMOKE PASS — 12 view bonus statistics chạy OK.';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK:
-- ════════════════════════════════════════════════════════════════════════════
-- DROP VIEW IF EXISTS public.v_b2b_bonus_rules_active;
-- DROP VIEW IF EXISTS public.v_b2b_bonus_admin_dashboard;
-- DROP VIEW IF EXISTS public.v_b2b_bonus_pending_actions;
-- DROP VIEW IF EXISTS public.v_b2b_bonus_below_threshold;
-- DROP VIEW IF EXISTS public.v_b2b_bonus_near_next_tier;
-- DROP VIEW IF EXISTS public.v_b2b_bonus_payment_schedule;
-- DROP VIEW IF EXISTS public.v_b2b_bonus_partner_trend_12m;
-- DROP VIEW IF EXISTS public.v_b2b_bonus_top_partners;
-- DROP VIEW IF EXISTS public.v_b2b_bonus_tier_distribution;
-- DROP VIEW IF EXISTS public.v_b2b_bonus_yearly_summary;
-- DROP VIEW IF EXISTS public.v_b2b_bonus_quarterly_summary;
-- DROP VIEW IF EXISTS public.v_b2b_bonus_monthly_summary;
