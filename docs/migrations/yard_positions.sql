-- Add yard position columns to stock_batches
ALTER TABLE stock_batches ADD COLUMN IF NOT EXISTS yard_zone VARCHAR(5);
ALTER TABLE stock_batches ADD COLUMN IF NOT EXISTS yard_row INTEGER;
ALTER TABLE stock_batches ADD COLUMN IF NOT EXISTS yard_col INTEGER;

CREATE INDEX IF NOT EXISTS idx_batches_yard ON stock_batches(yard_zone, yard_row, yard_col);
