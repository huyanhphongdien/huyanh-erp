-- ============================================================
-- SALES CONTRACT WORKFLOW — Migration
-- Ngày: 2026-05-14
-- Mục đích: workflow ký HĐ bán = Sale (lên) → Kiểm tra (duyệt) → Trung/Huy (ký)
-- ============================================================

-- 1. Bảng draft hợp đồng (mỗi sales_order có thể có nhiều revision)
CREATE TABLE IF NOT EXISTS sales_order_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  revision_no INT NOT NULL,

  status TEXT NOT NULL DEFAULT 'drafting'
    CHECK (status IN ('drafting','reviewing','rejected','approved','signed','archived')),

  -- File .docx được sinh từ template (lưu trong bucket sales-contracts/)
  sc_file_url TEXT,
  pi_file_url TEXT,

  -- File PDF đã ký + đóng dấu (Trung/Huy scan upload)
  signed_pdf_url TEXT,

  -- Snapshot form data tại thời điểm sinh HĐ — đủ để regenerate nếu cần
  form_data JSONB NOT NULL,

  -- Author / workflow actors
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  submitted_at TIMESTAMPTZ,  -- Sale submit để review

  reviewer_id UUID REFERENCES employees(id),  -- chỉ định khi submit
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,

  signer_id UUID REFERENCES employees(id),    -- Trung hoặc Huy
  signed_at TIMESTAMPTZ,

  rejected_at TIMESTAMPTZ,
  rejected_reason TEXT,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(sales_order_id, revision_no)
);

CREATE INDEX IF NOT EXISTS idx_soc_sales_order ON sales_order_contracts(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_soc_status ON sales_order_contracts(status);
CREATE INDEX IF NOT EXISTS idx_soc_reviewer ON sales_order_contracts(reviewer_id) WHERE status = 'reviewing';
CREATE INDEX IF NOT EXISTS idx_soc_signer ON sales_order_contracts(signer_id) WHERE status = 'approved';

-- 2. Trigger tự increment revision_no
CREATE OR REPLACE FUNCTION fn_soc_set_revision_no()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.revision_no IS NULL THEN
    SELECT COALESCE(MAX(revision_no), 0) + 1
      INTO NEW.revision_no
      FROM sales_order_contracts
     WHERE sales_order_id = NEW.sales_order_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_soc_set_revision_no ON sales_order_contracts;
CREATE TRIGGER trg_soc_set_revision_no
  BEFORE INSERT ON sales_order_contracts
  FOR EACH ROW EXECUTE FUNCTION fn_soc_set_revision_no();

-- 3. Trigger update updated_at
CREATE OR REPLACE FUNCTION fn_soc_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_soc_touch_updated_at ON sales_order_contracts;
CREATE TRIGGER trg_soc_touch_updated_at
  BEFORE UPDATE ON sales_order_contracts
  FOR EACH ROW EXECUTE FUNCTION fn_soc_touch_updated_at();

-- 4. Workflow guard: chuyển status phải hợp lệ
CREATE OR REPLACE FUNCTION fn_soc_status_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  -- Hợp lệ:
  -- drafting   → reviewing
  -- reviewing  → approved | rejected | drafting (Sale rút lại)
  -- rejected   → drafting (Sale sửa)
  -- approved   → signed | reviewing (mở lại review)
  -- signed     → archived
  -- archived   → (terminal)
  IF NOT (
    (OLD.status = 'drafting'  AND NEW.status = 'reviewing') OR
    (OLD.status = 'reviewing' AND NEW.status IN ('approved','rejected','drafting')) OR
    (OLD.status = 'rejected'  AND NEW.status = 'drafting') OR
    (OLD.status = 'approved'  AND NEW.status IN ('signed','reviewing')) OR
    (OLD.status = 'signed'    AND NEW.status = 'archived')
  ) THEN
    RAISE EXCEPTION 'Không thể chuyển status từ % → %', OLD.status, NEW.status;
  END IF;

  -- Bắt buộc field tương ứng
  IF NEW.status = 'reviewing'  AND NEW.reviewer_id IS NULL THEN
    RAISE EXCEPTION 'reviewer_id là bắt buộc khi submit review';
  END IF;
  IF NEW.status = 'approved' AND NEW.reviewed_at IS NULL THEN
    NEW.reviewed_at = NOW();
  END IF;
  IF NEW.status = 'rejected' THEN
    IF NEW.rejected_reason IS NULL OR TRIM(NEW.rejected_reason) = '' THEN
      RAISE EXCEPTION 'rejected_reason là bắt buộc khi reject';
    END IF;
    NEW.rejected_at = NOW();
  END IF;
  IF NEW.status = 'signed' THEN
    IF NEW.signer_id IS NULL THEN
      RAISE EXCEPTION 'signer_id là bắt buộc khi ký';
    END IF;
    IF NEW.signed_pdf_url IS NULL THEN
      RAISE EXCEPTION 'signed_pdf_url là bắt buộc khi ký';
    END IF;
    NEW.signed_at = COALESCE(NEW.signed_at, NOW());
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_soc_status_guard ON sales_order_contracts;
CREATE TRIGGER trg_soc_status_guard
  BEFORE UPDATE ON sales_order_contracts
  FOR EACH ROW EXECUTE FUNCTION fn_soc_status_guard();

-- 5. RLS — staff đọc tất cả; chỉ created_by + reviewer + signer được modify
ALTER TABLE sales_order_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS soc_select_staff ON sales_order_contracts;
CREATE POLICY soc_select_staff ON sales_order_contracts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM employees e WHERE e.user_id = auth.uid())
  );

DROP POLICY IF EXISTS soc_insert_sale ON sales_order_contracts;
CREATE POLICY soc_insert_sale ON sales_order_contracts
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM employees e WHERE e.user_id = auth.uid() AND e.id = created_by)
  );

DROP POLICY IF EXISTS soc_update_actors ON sales_order_contracts;
CREATE POLICY soc_update_actors ON sales_order_contracts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM employees e
       WHERE e.user_id = auth.uid()
         AND e.id IN (created_by, reviewer_id, signer_id)
    )
  );

-- 6. Storage bucket cho file HĐ (manual: chạy trong Supabase Dashboard nếu chưa có)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('sales-contracts','sales-contracts', false) ON CONFLICT DO NOTHING;

-- 7. Verify
SELECT
  column_name, data_type
FROM information_schema.columns
WHERE table_name = 'sales_order_contracts'
ORDER BY ordinal_position;
