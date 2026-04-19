-- ============================================================================
-- FEATURE: EUDR Traceability cho rubber_intake_batches
-- Ngày: 2026-04-19
-- Context: EU Deforestation Regulation 2023/1115 có hiệu lực 30/12/2025.
--          Mọi rubber export vào EU phải có Due Diligence Statement chứng
--          minh không từ đất phá rừng + trace được đến GPS mảnh vườn.
--
-- 5 column:
--   3 field GPS/location: sync từ b2b.deals (đại lý đã chọn trong phiếu
--     chốt qua RubberRegionPicker — không thêm input mới)
--   2 field EUDR đặc thù: admin nhập sau khi verify + submit TRACES EU
-- ============================================================================

-- ============================================
-- BƯỚC 1 — ADD 5 COLUMN
-- ============================================

ALTER TABLE rubber_intake_batches
  ADD COLUMN IF NOT EXISTS rubber_region TEXT,
  ADD COLUMN IF NOT EXISTS rubber_region_lat NUMERIC(9, 6),
  ADD COLUMN IF NOT EXISTS rubber_region_lng NUMERIC(9, 6),
  ADD COLUMN IF NOT EXISTS eudr_statement_ref TEXT,
  ADD COLUMN IF NOT EXISTS deforestation_risk_assessment TEXT;

-- CHECK constraint cho enum risk (NOT VALID để bypass rows cũ có NULL/invalid)
ALTER TABLE rubber_intake_batches
  DROP CONSTRAINT IF EXISTS chk_deforestation_risk;

ALTER TABLE rubber_intake_batches
  ADD CONSTRAINT chk_deforestation_risk
  CHECK (
    deforestation_risk_assessment IS NULL
    OR deforestation_risk_assessment IN ('low', 'medium', 'high', 'verified')
  )
  NOT VALID;

-- ============================================
-- BƯỚC 2 — Index spatial query (nếu sau này cần check GPS overlap với
-- forest maps). BTREE đủ cho bounding-box basic queries.
-- ============================================

CREATE INDEX IF NOT EXISTS idx_intake_gps
  ON rubber_intake_batches (rubber_region_lat, rubber_region_lng)
  WHERE rubber_region_lat IS NOT NULL AND rubber_region_lng IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_intake_risk
  ON rubber_intake_batches (deforestation_risk_assessment)
  WHERE deforestation_risk_assessment IS NOT NULL;

-- ============================================
-- BƯỚC 3 — Comments đánh dấu ý nghĩa
-- ============================================

COMMENT ON COLUMN rubber_intake_batches.rubber_region IS
  'Vùng thu mua (tên). Copy từ b2b.deals.rubber_region lúc tạo intake.';

COMMENT ON COLUMN rubber_intake_batches.rubber_region_lat IS
  'Tọa độ latitude của mảnh vườn. EUDR yêu cầu precision ≥ 6 chữ số thập phân.';

COMMENT ON COLUMN rubber_intake_batches.rubber_region_lng IS
  'Tọa độ longitude của mảnh vườn.';

COMMENT ON COLUMN rubber_intake_batches.eudr_statement_ref IS
  'Mã Due Diligence Statement đăng ký trên EU TRACES NT (vd DDS-VN-2026-XXXXXX). NULL nếu chưa submit hoặc chỉ bán nội địa.';

COMMENT ON COLUMN rubber_intake_batches.deforestation_risk_assessment IS
  'Đánh giá rủi ro phá rừng: low (an toàn), medium (mặc định, chưa verify), high (có dấu hiệu), verified (đã chứng nhận bởi bên thứ 3).';

-- ============================================
-- BƯỚC 4 — Refresh public view (nếu có) để expose 5 column mới
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'rubber_intake_batches') THEN
    DROP VIEW public.rubber_intake_batches CASCADE;
    -- Re-create view SELECT * để tự pick up columns mới
    EXECUTE 'CREATE VIEW public.rubber_intake_batches AS SELECT * FROM rubber_intake_batches';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.rubber_intake_batches TO authenticated';
  END IF;
END $$;

-- ============================================
-- BƯỚC 5 — Verify
-- ============================================

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'rubber_intake_batches'
  AND column_name IN (
    'rubber_region', 'rubber_region_lat', 'rubber_region_lng',
    'eudr_statement_ref', 'deforestation_risk_assessment'
  )
ORDER BY column_name;

-- ============================================
-- ROLLBACK
-- ============================================
-- ALTER TABLE rubber_intake_batches
--   DROP COLUMN IF EXISTS rubber_region,
--   DROP COLUMN IF EXISTS rubber_region_lat,
--   DROP COLUMN IF EXISTS rubber_region_lng,
--   DROP COLUMN IF EXISTS eudr_statement_ref,
--   DROP COLUMN IF EXISTS deforestation_risk_assessment;
