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
ALTER TABLE public.sales_order_contracts
  ADD COLUMN IF NOT EXISTS flow_type TEXT NOT NULL DEFAULT 'compose'
    CHECK (flow_type IN ('compose', 'upload')),
  ADD COLUMN IF NOT EXISTS sale_upload_url TEXT,
  ADD COLUMN IF NOT EXISTS reviewer_filled_url TEXT;

COMMENT ON COLUMN public.sales_order_contracts.flow_type IS
  'compose = render từ template (flow cũ); upload = Sale upload file .docx tự sửa, Phú fill 2 ô highlight rồi reupload';
COMMENT ON COLUMN public.sales_order_contracts.sale_upload_url IS
  'URL file .docx Sale upload (flow upload). Phú download file này để mở Word fill 2 chỗ highlight vàng';
COMMENT ON COLUMN public.sales_order_contracts.reviewer_filled_url IS
  'URL file .docx Phú đã fill (số HĐ + bank). Trung/Huy download file này để in ký';

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
  AND column_name IN ('flow_type', 'sale_upload_url', 'reviewer_filled_url')
ORDER BY column_name;
-- Expected: 3 rows

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
-- ALTER TABLE public.sales_order_contracts
--   DROP COLUMN IF EXISTS flow_type,
--   DROP COLUMN IF EXISTS sale_upload_url,
--   DROP COLUMN IF EXISTS reviewer_filled_url;
-- DROP INDEX IF EXISTS idx_soc_flow_type;
-- NOTIFY pgrst, 'reload schema';
