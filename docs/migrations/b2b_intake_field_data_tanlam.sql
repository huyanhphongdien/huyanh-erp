-- ============================================================================
-- B2B INTAKE — Bổ sung field data theo nghiệp vụ Tân Lâm (HAQT)
-- Date: 2026-05-26
-- ============================================================================
--
-- Mục đích: bổ sung các trường thiếu so với file Excel "BÁO CÁO KHỐI LƯỢNG
-- HẰNG NGÀY MỦ NƯỚC TÂN LÂM.xlsx" để áp dụng được tại trạm cân TL từ 1/6/2026.
--
-- Bổ sung Phase 1:
--   1. field_dot_reading   — số ĐỐT (metrolac field test) — input gốc của DRC
--   2. planned_drc_percent — DRC dự kiến lúc chốt giá (vs DRC thực tế)
--   3. dry_weight_kg       — KL khô quy đổi (GENERATED, tự tính từ net × drc/100)
--   4. consolidation_code  — mã LLM gộp nhiều phiếu cân (vd "TMMN-07 XE 1 (19/05)")
--   5. b2b.partners.payment_proxy_partner_id — đại lý đầu mối nhận tiền hộ
--      (theo pattern Tân Lâm: 3 trung gian Hiền/Thạo/Hương phân phối)
--   6. b2b.partners.contact_alias_name — tên người liên hệ thực tế khác chủ tài khoản
--      (vd "Dương Bá Lê (Hoàng Thị Chính)" — Lê là chủ TK, Chính là người mua tại nhà)
--
-- KHÔNG ĐỘNG schema cũ — chỉ ADD COLUMN.
--
-- Phụ thuộc: b2b_bonus_system.sql, b2b_demo_flag_and_facility_backfill.sql
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: ADD COLUMNS rubber_intake_batches
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='rubber_intake_batches'
  ) THEN
    RAISE NOTICE 'SKIP: rubber_intake_batches không tồn tại';
    RETURN;
  END IF;

  -- ĐỐT (metrolac field reading) — input gốc của DRC
  -- Range typical: 150-250 (đo trên latex density meter)
  -- Công thức xấp xỉ HAQT: DRC ≈ ĐỐT × 0.002 - 0.034 (vd ĐỐT 213 → 0.392)
  EXECUTE 'ALTER TABLE public.rubber_intake_batches ADD COLUMN IF NOT EXISTS field_dot_reading int';
  EXECUTE $cm$
    COMMENT ON COLUMN public.rubber_intake_batches.field_dot_reading IS
      'Số ĐỐT trên metrolac/lactometer field test — input gốc tính DRC. Range typical 150-250.'
  $cm$;

  -- DRC dự kiến lúc chốt giá (vs drc_percent là DRC thực tế đo tại nhà máy)
  EXECUTE 'ALTER TABLE public.rubber_intake_batches ADD COLUMN IF NOT EXISTS planned_drc_percent numeric(5,2)';
  EXECUTE $cm$
    COMMENT ON COLUMN public.rubber_intake_batches.planned_drc_percent IS
      'DRC dự kiến (%) lúc chốt giá với đại lý — vd 38.5. drc_percent là DRC thực tế sau khi đo.'
  $cm$;

  -- KL khô quy đổi: GENERATED column = net_weight_kg × drc_percent / 100
  -- Dùng để tính bonus / giá / báo cáo theo "sản lượng cao su thực"
  -- Chỉ generate nếu cả 2 input có giá trị
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='rubber_intake_batches' AND column_name='dry_weight_kg'
  ) THEN
    EXECUTE $g$
      ALTER TABLE public.rubber_intake_batches
      ADD COLUMN dry_weight_kg numeric(12,3)
      GENERATED ALWAYS AS (
        CASE
          WHEN net_weight_kg IS NULL OR drc_percent IS NULL THEN NULL
          ELSE ROUND((net_weight_kg * drc_percent / 100)::numeric, 3)
        END
      ) STORED
    $g$;
    EXECUTE $cm$
      COMMENT ON COLUMN public.rubber_intake_batches.dry_weight_kg IS
        'KL khô quy đổi (kg) = net_weight_kg × drc_percent / 100. GENERATED, không INSERT/UPDATE trực tiếp.'
    $cm$;
  END IF;

  -- consolidation_code — mã LLM gộp nhiều phiếu cân lại
  -- Vd "TMMN-07 XE 1 (19/05)" — 4 phiếu cân khác đại lý cùng đi chung 1 chuyến xe
  EXECUTE 'ALTER TABLE public.rubber_intake_batches ADD COLUMN IF NOT EXISTS consolidation_code text';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_rubber_intake_batches_consolidation_code ON public.rubber_intake_batches(consolidation_code) WHERE consolidation_code IS NOT NULL';
  EXECUTE $cm$
    COMMENT ON COLUMN public.rubber_intake_batches.consolidation_code IS
      'Mã LLM (Lý Lịch Mủ) gộp nhiều phiếu cân vào 1 chuyến vận chuyển. Vd "TMMN-07 XE 1 (19/05)".'
  $cm$;

  RAISE NOTICE 'STEP 1: 4 columns added vào rubber_intake_batches (field_dot_reading, planned_drc_percent, dry_weight_kg GENERATED, consolidation_code).';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: ADD COLUMNS b2b.partners — payment proxy + contact alias
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='b2b' AND table_name='partners'
  ) THEN
    RAISE NOTICE 'SKIP: b2b.partners không tồn tại';
    RETURN;
  END IF;

  -- payment_proxy_partner_id — đại lý đầu mối nhận tiền hộ
  -- Pattern Tân Lâm: tiền chuyển vào 1 trong 3 trung gian (Hiền, Thạo, Hương) → trung gian phân phối
  -- Nếu NULL → chuyển trực tiếp về STK của partner.bank_account
  EXECUTE 'ALTER TABLE b2b.partners ADD COLUMN IF NOT EXISTS payment_proxy_partner_id uuid REFERENCES b2b.partners(id) ON DELETE SET NULL';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_b2b_partners_payment_proxy ON b2b.partners(payment_proxy_partner_id) WHERE payment_proxy_partner_id IS NOT NULL';
  EXECUTE $cm$
    COMMENT ON COLUMN b2b.partners.payment_proxy_partner_id IS
      'Đại lý đầu mối nhận tiền chuyển khoản hộ. Pattern TL: 3 trung gian Hiền/Thạo/Hương phân phối tiền lại cho các đại lý nhỏ. NULL = trả trực tiếp.'
  $cm$;

  -- contact_alias_name — tên người liên hệ khác chủ TK
  -- Vd partner "Dương Bá Lê" có alias "(Hoàng Thị Chính)" là người ra trực tiếp giao mủ
  EXECUTE 'ALTER TABLE b2b.partners ADD COLUMN IF NOT EXISTS contact_alias_name text';
  EXECUTE $cm$
    COMMENT ON COLUMN b2b.partners.contact_alias_name IS
      'Tên người liên hệ thực tế tại nhà máy (khi khác chủ TK). Vd partner "Dương Bá Lê", contact_alias_name "Hoàng Thị Chính".'
  $cm$;

  RAISE NOTICE 'STEP 2: 2 columns added vào b2b.partners (payment_proxy_partner_id, contact_alias_name).';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: VIEW v_intake_consolidation — gộp các phiếu cân theo consolidation_code
-- ════════════════════════════════════════════════════════════════════════════
-- Output: 1 row per consolidation_code, aggregate count + KL tươi/khô + giá trị
-- Dùng cho báo cáo Lý lịch mủ + dashboard daily

CREATE OR REPLACE VIEW public.v_intake_consolidation
WITH (security_invoker = true) AS
SELECT
  consolidation_code,
  facility_id,
  MIN(intake_date)                    AS first_intake_date,
  MAX(intake_date)                    AS last_intake_date,
  COUNT(*)                            AS ticket_count,
  COUNT(DISTINCT b2b_partner_id)      AS partner_count,
  SUM(net_weight_kg)                  AS total_net_weight_kg,
  SUM(dry_weight_kg)                  AS total_dry_weight_kg,
  AVG(drc_percent)                    AS avg_drc_percent,
  SUM(total_amount)                   AS total_amount_vnd,
  array_agg(DISTINCT vehicle_plate)   AS vehicle_plates,
  array_agg(id ORDER BY intake_date)  AS batch_ids
FROM public.rubber_intake_batches
WHERE consolidation_code IS NOT NULL
  AND status IN ('confirmed', 'settled')
GROUP BY consolidation_code, facility_id;

COMMENT ON VIEW public.v_intake_consolidation IS
  'Aggregate Lý lịch mủ (LLM) gộp các phiếu cân cùng consolidation_code. Dùng cho báo cáo + dashboard.';

GRANT SELECT ON public.v_intake_consolidation TO authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 4: NOTIFY + VERIFY
-- ════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

DO $$
DECLARE
  v_cols_intake int;
  v_cols_partner int;
BEGIN
  SELECT count(*) INTO v_cols_intake
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='rubber_intake_batches'
    AND column_name IN ('field_dot_reading','planned_drc_percent','dry_weight_kg','consolidation_code');

  SELECT count(*) INTO v_cols_partner
  FROM information_schema.columns
  WHERE table_schema='b2b' AND table_name='partners'
    AND column_name IN ('payment_proxy_partner_id','contact_alias_name');

  IF v_cols_intake < 4 THEN
    RAISE EXCEPTION 'VERIFY FAIL: chỉ có %/4 cột mới trên rubber_intake_batches', v_cols_intake;
  END IF;
  IF v_cols_partner < 2 THEN
    RAISE EXCEPTION 'VERIFY FAIL: chỉ có %/2 cột mới trên b2b.partners', v_cols_partner;
  END IF;

  RAISE NOTICE 'VERIFY PASS — 4 cột intake + 2 cột partner + 1 view sẵn sàng.';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK:
-- ════════════════════════════════════════════════════════════════════════════
-- DROP VIEW IF EXISTS public.v_intake_consolidation;
-- ALTER TABLE b2b.partners DROP COLUMN IF EXISTS contact_alias_name;
-- ALTER TABLE b2b.partners DROP COLUMN IF EXISTS payment_proxy_partner_id;
-- ALTER TABLE public.rubber_intake_batches DROP COLUMN IF EXISTS consolidation_code;
-- ALTER TABLE public.rubber_intake_batches DROP COLUMN IF EXISTS dry_weight_kg;
-- ALTER TABLE public.rubber_intake_batches DROP COLUMN IF EXISTS planned_drc_percent;
-- ALTER TABLE public.rubber_intake_batches DROP COLUMN IF EXISTS field_dot_reading;
