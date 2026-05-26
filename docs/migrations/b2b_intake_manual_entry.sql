-- ============================================================================
-- B2B Intake Manual Entry — Hỗ trợ nhập tay phiếu cân + ảnh + bulk import
-- Date: 2026-05-26
-- ============================================================================
--
-- Mục đích:
--   Bổ sung hạ tầng cho admin nhập tay phiếu cân vào rubber_intake_batches
--   (data nguồn cho bonus calculation), bao gồm:
--     1) Cột weighbridge_image_urls (text[]) lưu URL ảnh phiếu cân
--     2) Supabase Storage bucket 'weighbridge-images' (public-read, auth-write)
--     3) Trigger auto-recompute bonus sau khi insert/update rubber_intake_batches
--        có b2b_partner_id + rubber_type + status confirmed/settled
--
-- Phụ thuộc: b2b_bonus_system.sql (compute_monthly_bonus function)
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: ADD COLUMN weighbridge_image_urls
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='rubber_intake_batches'
  ) THEN
    EXECUTE 'ALTER TABLE public.rubber_intake_batches ADD COLUMN IF NOT EXISTS weighbridge_image_urls text[] NOT NULL DEFAULT ''{}''';
    EXECUTE $cm$
      COMMENT ON COLUMN public.rubber_intake_batches.weighbridge_image_urls IS
        'Mảng URL ảnh phiếu cân (chụp giấy hoặc Excel cũ). Upload qua Supabase Storage bucket weighbridge-images.'
    $cm$;
    RAISE NOTICE 'STEP 1: weighbridge_image_urls added.';
  ELSE
    RAISE NOTICE 'STEP 1 SKIP: rubber_intake_batches không tồn tại.';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: SUPABASE STORAGE BUCKET — weighbridge-images
-- ════════════════════════════════════════════════════════════════════════════
-- Bucket public-read (để partner xem được ảnh khi cần đối soát).
-- Upload chỉ authenticated user (operator/admin).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'weighbridge-images',
  'weighbridge-images',
  true,                                              -- public-read
  10485760,                                          -- 10MB / file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS policies cho storage.objects bucket weighbridge-images
DROP POLICY IF EXISTS weighbridge_images_public_read   ON storage.objects;
DROP POLICY IF EXISTS weighbridge_images_auth_insert   ON storage.objects;
DROP POLICY IF EXISTS weighbridge_images_auth_update   ON storage.objects;
DROP POLICY IF EXISTS weighbridge_images_auth_delete   ON storage.objects;

CREATE POLICY weighbridge_images_public_read
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'weighbridge-images');

CREATE POLICY weighbridge_images_auth_insert
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'weighbridge-images');

CREATE POLICY weighbridge_images_auth_update
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'weighbridge-images')
  WITH CHECK (bucket_id = 'weighbridge-images');

CREATE POLICY weighbridge_images_auth_delete
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'weighbridge-images');

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: TRIGGER auto-recompute bonus khi rubber_intake_batches thay đổi
-- ════════════════════════════════════════════════════════════════════════════
-- Khi insert/update batch có b2b_partner_id + rubber_type + status đủ điều kiện
-- → gọi compute_monthly_bonus cho (partner, year, month, rubber_type) tương ứng.
--
-- Skip nếu bonus đã 'approved' hoặc 'paid' (function tự bảo vệ).

CREATE OR REPLACE FUNCTION public.trg_intake_batch_recompute_bonus()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year  int;
  v_month int;
BEGIN
  -- Trigger NEW row mới đủ điều kiện
  IF NEW.b2b_partner_id IS NULL OR NEW.rubber_type IS NULL OR NEW.intake_date IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('confirmed', 'settled') THEN
    -- Nếu OLD trước đó đã confirmed → bonus đã tính → bây giờ status đổi xuống
    -- (vd reset về draft) cũng nên recompute để trừ.
    IF TG_OP = 'UPDATE' AND OLD.status IN ('confirmed','settled')
       AND OLD.b2b_partner_id IS NOT NULL AND OLD.rubber_type IS NOT NULL THEN
      v_year  := extract(year FROM OLD.intake_date)::int;
      v_month := extract(month FROM OLD.intake_date)::int;
      PERFORM public.compute_monthly_bonus(OLD.b2b_partner_id, v_year, v_month, OLD.rubber_type);
    END IF;
    RETURN NEW;
  END IF;

  v_year  := extract(year FROM NEW.intake_date)::int;
  v_month := extract(month FROM NEW.intake_date)::int;
  PERFORM public.compute_monthly_bonus(NEW.b2b_partner_id, v_year, v_month, NEW.rubber_type);

  -- Nếu UPDATE: partner cũ khác partner mới, hoặc rubber_type cũ khác mới
  -- → cũng recompute cho bộ cũ để trừ
  IF TG_OP = 'UPDATE' AND OLD.b2b_partner_id IS NOT NULL AND OLD.rubber_type IS NOT NULL
     AND OLD.intake_date IS NOT NULL
     AND (OLD.b2b_partner_id <> NEW.b2b_partner_id
       OR OLD.rubber_type    <> NEW.rubber_type
       OR OLD.intake_date    <> NEW.intake_date) THEN
    PERFORM public.compute_monthly_bonus(
      OLD.b2b_partner_id,
      extract(year FROM OLD.intake_date)::int,
      extract(month FROM OLD.intake_date)::int,
      OLD.rubber_type
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_intake_batch_recompute_bonus ON public.rubber_intake_batches;
CREATE TRIGGER trg_intake_batch_recompute_bonus
AFTER INSERT OR UPDATE OF b2b_partner_id, rubber_type, net_weight_kg, intake_date, status
ON public.rubber_intake_batches
FOR EACH ROW
EXECUTE FUNCTION public.trg_intake_batch_recompute_bonus();

COMMENT ON FUNCTION public.trg_intake_batch_recompute_bonus() IS
  'AFTER INSERT/UPDATE rubber_intake_batches → tự gọi compute_monthly_bonus. Skip bonus đã approved/paid.';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 4: NOTIFY + VERIFY
-- ════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

DO $$
DECLARE
  v_col_exists boolean;
  v_bucket_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='rubber_intake_batches'
      AND column_name='weighbridge_image_urls'
  ) INTO v_col_exists;

  SELECT EXISTS (SELECT 1 FROM storage.buckets WHERE id='weighbridge-images')
    INTO v_bucket_exists;

  IF NOT v_col_exists THEN
    RAISE EXCEPTION 'VERIFY FAIL: weighbridge_image_urls chưa được tạo';
  END IF;
  IF NOT v_bucket_exists THEN
    RAISE EXCEPTION 'VERIFY FAIL: bucket weighbridge-images chưa được tạo';
  END IF;
  RAISE NOTICE 'VERIFY PASS — column + bucket + trigger sẵn sàng cho manual entry.';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK:
-- ════════════════════════════════════════════════════════════════════════════
-- DROP TRIGGER IF EXISTS trg_intake_batch_recompute_bonus ON public.rubber_intake_batches;
-- DROP FUNCTION IF EXISTS public.trg_intake_batch_recompute_bonus();
-- DROP POLICY IF EXISTS weighbridge_images_public_read   ON storage.objects;
-- DROP POLICY IF EXISTS weighbridge_images_auth_insert   ON storage.objects;
-- DROP POLICY IF EXISTS weighbridge_images_auth_update   ON storage.objects;
-- DROP POLICY IF EXISTS weighbridge_images_auth_delete   ON storage.objects;
-- DELETE FROM storage.buckets WHERE id='weighbridge-images';
-- ALTER TABLE public.rubber_intake_batches DROP COLUMN IF EXISTS weighbridge_image_urls;
