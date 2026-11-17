-- ============================================================================
-- sales_family_parties_p1b_sort_key.sql — khoá sắp số HĐ bỏ đuôi '-D<n>' của đơn mua tiếp
-- Owner chốt kiểu số đợt '<số HĐ gốc>-D<n>' (17/11/2026). Biểu thức cũ lấy mọi chữ số rồi cắt 4 số cuối nên
-- 'HA20260302-D3' ra 3023 và xếp lạc khỏi HĐ 302; bỏ đuôi -D trước thì đợt mang khoá 302, đứng liền gốc
-- (getList thêm khoá phụ continuation_seq NULLS FIRST). 17/11: 0/163 số có đuôi -D → 0 khoá đổi.
-- Tách riêng khỏi p1 vì SET EXPRESSION (PG ≥ 17) viết lại bảng; lỗi ở đây không kéo đổ p1.
-- Rollback: sales_contract_no_sort_key.sql:30-41 (biểu thức cũ).
-- Chạy qua agent_sql: KHÔNG BEGIN/COMMIT.
-- ============================================================================
ALTER TABLE public.sales_orders ALTER COLUMN contract_no_sort_key SET EXPRESSION AS (
  CASE
    WHEN contract_no IS NULL THEN NULL::integer
    WHEN regexp_replace(regexp_replace(contract_no::text, '-D[0-9]+$', '', 'i'), '\D', '', 'g') = '' THEN NULL::integer
    ELSE NULLIF(right(regexp_replace(regexp_replace(contract_no::text, '-D[0-9]+$', '', 'i'), '\D', '', 'g'), 4), '')::integer
  END
);
NOTIFY pgrst, 'reload schema';
