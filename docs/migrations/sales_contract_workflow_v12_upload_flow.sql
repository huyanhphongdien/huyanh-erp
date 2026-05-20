-- ============================================================================
-- SALES CONTRACT WORKFLOW V12 — Upload-based flow song song với compose
-- Date: 2026-05-20
-- ============================================================================
--
-- Bối cảnh: Generate template tự động qua docxtemplater hiện rất khó khăn (Sale
-- phải khai báo nhiều field + dễ render lệch). User muốn thêm flow song song:
--   1. Sale tự sửa file .docx HĐ trên Word, highlight vàng 2 chỗ:
--      (a) số HĐ, (b) bank info — chừa trống chờ Phú LV điền
--   2. Upload .docx lên ERP → status='reviewing', flow_type='upload'
--   3. Phú LV download file → mở Word → điền 2 chỗ highlight → save → upload lại
--   4. ERP lưu thay thế file, status='approved'
--   5. Trung/Huy bấm "Xác nhận đã duyệt" → in + ký + đóng dấu → upload PDF FINAL
--   6. Status='signed'
--
-- Flow compose (cũ) GIỮ NGUYÊN — column mới có default 'compose' để backward compat.
-- ============================================================================

-- Step 1: Add columns vào sales_order_contracts
-- Dùng TEXT[] để hỗ trợ tối đa 10 file/HĐ (HĐ chính + phụ lục + packing list + …)
ALTER TABLE public.sales_order_contracts
  ADD COLUMN IF NOT EXISTS flow_type TEXT NOT NULL DEFAULT 'compose'
    CHECK (flow_type IN ('compose', 'upload')),
  ADD COLUMN IF NOT EXISTS sale_upload_urls TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS reviewer_filled_urls TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

-- Constraint: tối đa 10 file mỗi mảng (tránh spam upload)
ALTER TABLE public.sales_order_contracts
  ADD CONSTRAINT chk_soc_sale_uploads_max
    CHECK (array_length(sale_upload_urls, 1) IS NULL OR array_length(sale_upload_urls, 1) <= 10),
  ADD CONSTRAINT chk_soc_reviewer_filled_max
    CHECK (array_length(reviewer_filled_urls, 1) IS NULL OR array_length(reviewer_filled_urls, 1) <= 10);

COMMENT ON COLUMN public.sales_order_contracts.flow_type IS
  'compose = render từ template (flow cũ, deprecated 2026-05-20); upload = Docs upload .docx tự soạn';
COMMENT ON COLUMN public.sales_order_contracts.sale_upload_urls IS
  'Array tối đa 10 path file Docs upload (.docx). Phú download → fill highlight vàng → reupload';
COMMENT ON COLUMN public.sales_order_contracts.reviewer_filled_urls IS
  'Array path file Phú đã fill. Khi approve(): tự copy hết sang sales_order_documents sub_type=sent_to_customer';

-- Step 2: Index cho query queue theo flow_type
CREATE INDEX IF NOT EXISTS idx_soc_flow_type
  ON public.sales_order_contracts (flow_type, status);

-- Step 3: Notify PostgREST reload schema cache
NOTIFY pgrst, 'reload schema';

-- Step 4: Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'sales_order_contracts'
  AND column_name IN ('flow_type', 'sale_upload_urls', 'reviewer_filled_urls')
ORDER BY column_name;
-- Expected: 3 rows (flow_type=text, sale_upload_urls=ARRAY, reviewer_filled_urls=ARRAY)

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
-- ALTER TABLE public.sales_order_contracts
--   DROP CONSTRAINT IF EXISTS chk_soc_sale_uploads_max,
--   DROP CONSTRAINT IF EXISTS chk_soc_reviewer_filled_max,
--   DROP COLUMN IF EXISTS flow_type,
--   DROP COLUMN IF EXISTS sale_upload_urls,
--   DROP COLUMN IF EXISTS reviewer_filled_urls;
-- DROP INDEX IF EXISTS idx_soc_flow_type;
-- NOTIFY pgrst, 'reload schema';
