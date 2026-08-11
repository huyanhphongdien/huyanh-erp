-- ============================================================================
-- Thêm địa chỉ + SWIFT cho Ngân hàng nhờ thu / phát hành trên Đơn chiết khấu.
-- Mẫu Hối phiếu D/P (BOE) khớp file thật cần 3 dòng: tên NH nhờ thu + địa chỉ
-- + SWIFT. Trước đây chỉ có tên (issuing_bank); SWIFT phải nhét chung tên.
-- Idempotent (ADD COLUMN IF NOT EXISTS). Áp qua agent_sql 2026-08-11.
-- ============================================================================
alter table sales_order_lc_negotiations
  add column if not exists issuing_bank_address text,
  add column if not exists issuing_bank_swift   text;

comment on column sales_order_lc_negotiations.issuing_bank_address is
  'Địa chỉ NH nhờ thu (D/P) / NH phát hành (L/C) — lên Hối phiếu (BOE), dòng "Bank address".';
comment on column sales_order_lc_negotiations.issuing_bank_swift is
  'SWIFT NH nhờ thu / phát hành — lên Hối phiếu (BOE), dòng "Swift code".';
