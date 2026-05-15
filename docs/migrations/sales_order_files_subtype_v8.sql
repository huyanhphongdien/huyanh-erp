-- ============================================================
-- SALES ORDER FILES — V8: doc_sub_type cho folder Hợp đồng
-- Ngày: 2026-05-15
-- Phụ thuộc: sales_order_files_categories_v7.sql (doc_type 6 enums)
--
-- Mục đích:
--   Tách folder "Hợp đồng" thành 2 sub-folder:
--     1. HĐ gửi KH  — drafts (.docx) gửi qua KH duyệt, có thể nhiều revision
--     2. HĐ FINAL   — bản scan PDF ký + đóng dấu 2 bên (terminal)
--
--   Áp dụng cho doc_type='contract' (5 doc_type khác chưa cần sub-type).
-- ============================================================

-- ── Step 1: ADD doc_sub_type column (nullable, không phá file cũ) ──
ALTER TABLE sales_order_documents
  ADD COLUMN IF NOT EXISTS doc_sub_type VARCHAR(40);

-- ── Step 2: CHECK constraint — hợp lệ giá trị ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'sales_order_documents'::regclass
       AND conname = 'sales_order_documents_doc_sub_type_check'
  ) THEN
    ALTER TABLE sales_order_documents
      ADD CONSTRAINT sales_order_documents_doc_sub_type_check
      CHECK (
        doc_sub_type IS NULL
        OR doc_sub_type IN ('sent_to_customer', 'final_signed')
      );
  END IF;
END $$;

COMMENT ON COLUMN sales_order_documents.doc_sub_type IS
  'Sub-type chỉ áp dụng cho doc_type=contract:
   - sent_to_customer: bản gửi KH duyệt (có thể nhiều revision)
   - final_signed: bản scan PDF ký + đóng dấu 2 bên (terminal, 1 file)
   - NULL: file legacy hoặc doc_type khác';

-- ── Step 3: Backfill — file contract cũ đã link tới sales_order_contracts ──
-- Heuristic:
--   - File có path chứa "workflow-signed" → final_signed (Trung/Huy upload PDF ký)
--   - File còn lại (Sale upload, scan) → sent_to_customer
UPDATE sales_order_documents sod
   SET doc_sub_type = 'final_signed'
 WHERE doc_type = 'contract'
   AND doc_sub_type IS NULL
   AND (
     file_url ILIKE '%workflow-signed%'
     OR file_url ILIKE '%signed_pdf%'
     OR file_name ILIKE '%final%signed%'
     OR file_name ILIKE '%signed%both%'
   );

UPDATE sales_order_documents sod
   SET doc_sub_type = 'sent_to_customer'
 WHERE doc_type = 'contract'
   AND doc_sub_type IS NULL;

-- ── Step 4: INDEX cho query nhanh theo sub_type ──
CREATE INDEX IF NOT EXISTS idx_sales_order_documents_doc_sub_type
  ON sales_order_documents (sales_order_id, doc_type, doc_sub_type)
  WHERE doc_type = 'contract';

-- ── Step 5: RLS — chỉ admin/BGĐ xóa được FINAL (bản pháp lý) ──
-- Sale/logistics/accounting có thể xóa drafts gửi KH, nhưng KHÔNG đụng FINAL.
DROP POLICY IF EXISTS "sod_delete_final_admin_only" ON sales_order_documents;
CREATE POLICY "sod_delete_final_admin_only" ON sales_order_documents
  FOR DELETE
  USING (
    -- FINAL → chỉ admin emails được xóa
    CASE
      WHEN doc_type = 'contract' AND doc_sub_type = 'final_signed' THEN
        EXISTS (
          SELECT 1 FROM employees e
           WHERE e.user_id = auth.uid()
             AND LOWER(e.email) IN (
               'minhld@huyanhrubber.com',
               'thuyht@huyanhrubber.com',
               'huylv@huyanhrubber.com',
               'trunglxh@huyanhrubber.com'
             )
        )
      -- Không phải FINAL → policy delete khác xử lý (giữ behavior cũ)
      ELSE TRUE
    END
  );

-- ── Step 6: Verify ──
SELECT
  doc_type,
  doc_sub_type,
  COUNT(*) AS file_count
FROM sales_order_documents
WHERE doc_type = 'contract'
GROUP BY doc_type, doc_sub_type
ORDER BY doc_sub_type NULLS FIRST;

-- ── Step 7: Reload PostgREST schema cache ──
NOTIFY pgrst, 'reload schema';
