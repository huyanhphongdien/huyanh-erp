-- ============================================================
-- SALES CONTRACT WORKFLOW — V9: Signer confirm + ha_signed sub_type
-- Ngày: 2026-05-15
-- Phụ thuộc:
--   - sales_contract_workflow.sql (V1)
--   - sales_order_files_subtype_v8.sql (V8 — doc_sub_type)
--
-- Mục đích:
--   1. Thêm field signer_confirmed_at + signer_confirmed_by vào
--      sales_order_contracts — track lúc Trung/Huy xác nhận đã duyệt
--   2. Mở rộng doc_sub_type cho phép 'ha_signed':
--        sent_to_customer  → HĐ gửi KH duyệt (drafts)
--        ha_signed         → HĐ Huy Anh ký 1 bên (mới — sau xác nhận + in ký)
--        final_signed      → HĐ FINAL ký 2 bên (KH gửi lại)
-- ============================================================

-- ── Step 1: Thêm columns signer_confirmed_at/by vào sales_order_contracts ──
ALTER TABLE sales_order_contracts
  ADD COLUMN IF NOT EXISTS signer_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signer_confirmed_by UUID REFERENCES employees(id);

COMMENT ON COLUMN sales_order_contracts.signer_confirmed_at IS
  'Lúc Trung/Huy bấm "Xác nhận đã duyệt" — xác nhận thông tin OK, cho phép in HĐ.
   Không đổi status (vẫn approved). Khi có giá trị, UI hiện section upload bản ký.';

COMMENT ON COLUMN sales_order_contracts.signer_confirmed_by IS
  'Employee ID của Trung/Huy bấm xác nhận.';

-- ── Step 2: Mở rộng doc_sub_type constraint cho phép 'ha_signed' ──
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT conname INTO v_constraint_name
    FROM pg_constraint
   WHERE conrelid = 'sales_order_documents'::regclass
     AND conname = 'sales_order_documents_doc_sub_type_check';
  IF v_constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE sales_order_documents DROP CONSTRAINT ' || quote_ident(v_constraint_name);
  END IF;
END $$;

ALTER TABLE sales_order_documents
  ADD CONSTRAINT sales_order_documents_doc_sub_type_check
  CHECK (
    doc_sub_type IS NULL
    OR doc_sub_type IN ('sent_to_customer', 'ha_signed', 'final_signed')
  );

COMMENT ON COLUMN sales_order_documents.doc_sub_type IS
  'Sub-type áp dụng cho doc_type=contract:
   - sent_to_customer: bản gửi KH duyệt (có thể nhiều revision)
   - ha_signed: bản HĐ Huy Anh ký + đóng dấu 1 bên (sau xác nhận, chưa final)
   - final_signed: bản HĐ KH ký lại — có chữ ký 2 bên (TERMINAL pháp lý)
   - NULL: file legacy hoặc doc_type khác';

-- ── Step 3: RLS — chỉ admin/BGĐ xóa được FINAL (bản pháp lý có chữ ký 2 bên) ──
-- Bản ha_signed có thể replace/delete được (chưa pháp lý cuối).
DROP POLICY IF EXISTS "sod_delete_final_admin_only" ON sales_order_documents;
CREATE POLICY "sod_delete_final_admin_only" ON sales_order_documents
  FOR DELETE
  USING (
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
      ELSE TRUE
    END
  );

-- ── Step 4: Index ──
CREATE INDEX IF NOT EXISTS idx_soc_signer_confirmed
  ON sales_order_contracts (signer_confirmed_at)
  WHERE signer_confirmed_at IS NOT NULL;

-- ── Step 5: Verify ──
SELECT
  doc_type,
  doc_sub_type,
  COUNT(*) AS file_count
FROM sales_order_documents
WHERE doc_type = 'contract'
GROUP BY doc_type, doc_sub_type
ORDER BY doc_sub_type NULLS FIRST;

-- ── Step 6: Reload PostgREST schema cache ──
NOTIFY pgrst, 'reload schema';
