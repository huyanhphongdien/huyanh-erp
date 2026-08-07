-- ============================================================================
-- FIX: CHECK constraint doc_type của sales_order_documents CHẶN các loại chứng từ
-- mà code (STANDARD_DOCUMENTS) dùng (bl, coa, co, insurance...) → initChecklist luôn
-- fail → tab Chứng từ hiện 0/0. Nới constraint cho khớp danh mục chuẩn.
-- File: docs/migrations/sales_order_documents_doctype_fix.sql  (2026-08-07)
-- ============================================================================

ALTER TABLE public.sales_order_documents DROP CONSTRAINT IF EXISTS sales_order_documents_doc_type_check;
ALTER TABLE public.sales_order_documents ADD CONSTRAINT sales_order_documents_doc_type_check
  CHECK (doc_type IN (
    -- nhóm cũ (giữ nguyên)
    'contract','shipping','cert','finance','weighbridge','other',
    -- danh mục chuẩn của checklist (STANDARD_DOCUMENTS)
    'bl','commercial_invoice','packing_list','coa','co','form_ae',
    'phytosanitary','fumigation','lc_copy','insurance','weight_note'
  ));
