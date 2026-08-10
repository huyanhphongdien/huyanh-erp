-- ============================================================================
-- Đơn ĐNCK Vietinbank (BM08A) — field nhập riêng cho form (không có sẵn trong ERP)
-- Lưu JSONB trên negotiation: STT đơn, hãng tàu (tên đầy đủ), NH nhận chứng từ
-- (địa chỉ), bên đề nghị (địa chỉ), số tiền bằng chữ, giá trị nghĩa vụ bảo đảm…
-- Idempotent.
-- ============================================================================
alter table public.sales_order_lc_negotiations add column if not exists dnck_fields jsonb;
comment on column public.sales_order_lc_negotiations.dnck_fields is 'Field nhập riêng cho đơn ĐNCK Vietinbank (form_seq, shipping_line, recv_bank_*, applicant_*, amount_words, secured_amount_vnd…)';
