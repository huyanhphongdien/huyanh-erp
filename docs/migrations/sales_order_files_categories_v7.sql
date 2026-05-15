-- ============================================================
-- SALES ORDER FILES — V7: Doc type categories (6 folders) + Chat messages
-- Ngày: 2026-05-15
-- Phụ thuộc: sales_order_documents (đã có), sales_contract_files_multi_v4
--
-- Mục đích:
--   1. Mở rộng doc_type cho 6 folder dùng chung: contract, shipping, cert,
--      finance, weighbridge, other
--   2. Tạo bảng sales_order_messages cho chat trao đổi (mô phỏng project_comments)
--   3. RLS + trigger auto system messages khi status đơn thay đổi
-- ============================================================

-- ============================================================
-- 1. DOC_TYPE CATEGORIES (mở rộng sales_order_documents)
-- ============================================================
-- Hiện tại doc_type='contract' duy nhất. Mở rộng cho 5 nhóm mới.
-- Không dùng ENUM (tránh ALTER khó) — dùng VARCHAR + CHECK.

-- Drop old constraint nếu có
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'sales_order_documents'::regclass
      AND contype = 'c'
      AND conname LIKE '%doc_type%'
  ) THEN
    EXECUTE 'ALTER TABLE sales_order_documents DROP CONSTRAINT ' ||
      (SELECT conname FROM pg_constraint
       WHERE conrelid = 'sales_order_documents'::regclass
         AND contype = 'c' AND conname LIKE '%doc_type%' LIMIT 1);
  END IF;
END $$;

ALTER TABLE sales_order_documents
  ADD CONSTRAINT sales_order_documents_doc_type_check
  CHECK (doc_type IN (
    'contract',      -- HĐ (SC, PI, scan đã ký)
    'shipping',      -- B/L, Booking confirmation
    'cert',          -- COA, Phyto, Fumigation, Insurance
    'finance',       -- L/C, Commercial Invoice, Packing List
    'weighbridge',   -- Phiếu cân (link từ WMS)
    'other'          -- Khác
  ));

-- Default doc_type cho row mới
ALTER TABLE sales_order_documents
  ALTER COLUMN doc_type SET DEFAULT 'other';

-- Index để filter theo doc_type nhanh
CREATE INDEX IF NOT EXISTS idx_sod_order_type
  ON sales_order_documents(sales_order_id, doc_type);

-- ============================================================
-- 2. SALES_ORDER_MESSAGES — Chat trao đổi trong đơn
-- ============================================================
CREATE TABLE IF NOT EXISTS sales_order_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,

  -- Nội dung
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'user'
    CHECK (message_type IN ('user', 'system', 'event')),
  -- user = tin chat thông thường
  -- system = tin tự sinh bởi trigger (vd "Sale trình HĐ rev #2")
  -- event = sự kiện khác (vd file upload, status change)

  -- Author (cho user message)
  author_id UUID REFERENCES employees(id),
  author_role TEXT,  -- 'sale' / 'review' / 'sign' / 'logistics' / 'production' / 'admin' / 'system'

  -- Reply threading
  parent_message_id UUID REFERENCES sales_order_messages(id) ON DELETE CASCADE,

  -- Mentions (array of employee.id)
  mentioned_ids UUID[] DEFAULT ARRAY[]::UUID[],

  -- Attach file (link tới sales_order_documents)
  attachment_doc_id UUID REFERENCES sales_order_documents(id) ON DELETE SET NULL,

  -- Pin
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  pinned_at TIMESTAMPTZ,
  pinned_by UUID REFERENCES employees(id),

  -- Edit / Delete
  is_edited BOOLEAN NOT NULL DEFAULT false,
  edited_at TIMESTAMPTZ,
  is_deleted BOOLEAN NOT NULL DEFAULT false,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_som_order ON sales_order_messages(sales_order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_som_parent ON sales_order_messages(parent_message_id);
CREATE INDEX IF NOT EXISTS idx_som_pinned ON sales_order_messages(sales_order_id) WHERE is_pinned = true;
CREATE INDEX IF NOT EXISTS idx_som_author ON sales_order_messages(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_som_mentions ON sales_order_messages USING GIN(mentioned_ids);

-- Trigger touch updated_at
CREATE OR REPLACE FUNCTION fn_som_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_som_touch_updated_at ON sales_order_messages;
CREATE TRIGGER trg_som_touch_updated_at
  BEFORE UPDATE ON sales_order_messages
  FOR EACH ROW EXECUTE FUNCTION fn_som_touch_updated_at();

-- ============================================================
-- 3. RLS — staff đọc tất cả; user chỉ edit tin của mình
-- ============================================================
ALTER TABLE sales_order_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS som_select_staff ON sales_order_messages;
CREATE POLICY som_select_staff ON sales_order_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM employees e WHERE e.user_id = auth.uid())
  );

DROP POLICY IF EXISTS som_insert_authenticated ON sales_order_messages;
CREATE POLICY som_insert_authenticated ON sales_order_messages
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM employees e WHERE e.user_id = auth.uid())
    AND (
      message_type IN ('user', 'event')  -- user message phải có author = mình
      OR message_type = 'system'  -- system message có thể từ trigger
    )
  );

DROP POLICY IF EXISTS som_update_own ON sales_order_messages;
CREATE POLICY som_update_own ON sales_order_messages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.user_id = auth.uid() AND e.id = author_id
    )
  );

-- Admin (Minh/Thúy/Huy/Trung) được pin/delete
DROP POLICY IF EXISTS som_update_admin ON sales_order_messages;
CREATE POLICY som_update_admin ON sales_order_messages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.user_id = auth.uid()
        AND lower(e.email) IN (
          'minhld@huyanhrubber.com', 'thuyht@huyanhrubber.com',
          'huylv@huyanhrubber.com', 'trunglxh@huyanhrubber.com'
        )
    )
  );

-- ============================================================
-- 4. Realtime — Enable replication cho sales_order_messages
-- ============================================================
-- (Chạy trong Supabase Dashboard: Database → Replication → Tables → enable)
-- Hoặc SQL:
-- ALTER PUBLICATION supabase_realtime ADD TABLE sales_order_messages;
-- (Skip nếu publication đã include all hoặc đã add)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE sales_order_messages;
    EXCEPTION WHEN duplicate_object THEN
      -- Already added
      NULL;
    END;
  END IF;
END $$;

-- REPLICA IDENTITY FULL để realtime UPDATE/DELETE event có data đầy đủ
ALTER TABLE sales_order_messages REPLICA IDENTITY FULL;

-- ============================================================
-- 5. SYSTEM MESSAGE TRIGGERS — Auto-post khi status đơn thay đổi
-- ============================================================
-- Khi sales_orders.status thay đổi → post system message
CREATE OR REPLACE FUNCTION fn_som_post_order_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_label TEXT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  v_label := CASE NEW.status
    WHEN 'confirmed'  THEN 'Đơn hàng đã xác nhận — bắt đầu Mua mủ NVL / Sản xuất'
    WHEN 'producing'  THEN 'Đơn đang sản xuất'
    WHEN 'ready'      THEN 'Hàng đã sẵn sàng — chờ đóng cont'
    WHEN 'packing'    THEN 'Đang đóng cont'
    WHEN 'shipped'    THEN 'Đã xuất hàng'
    WHEN 'delivered'  THEN 'Đã giao đến KH'
    WHEN 'invoiced'   THEN 'Đã lập invoice'
    WHEN 'paid'       THEN 'KH đã thanh toán — đơn hoàn tất'
    WHEN 'cancelled'  THEN 'Đơn hàng bị huỷ'
    ELSE 'Status: ' || OLD.status || ' → ' || NEW.status
  END;

  INSERT INTO sales_order_messages (
    sales_order_id, content, message_type, author_role
  ) VALUES (
    NEW.id,
    '📊 ' || v_label,
    'system',
    'system'
  );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_som_post_order_status_change ON sales_orders;
CREATE TRIGGER trg_som_post_order_status_change
  AFTER UPDATE OF status ON sales_orders
  FOR EACH ROW EXECUTE FUNCTION fn_som_post_order_status_change();

-- Khi sales_order_contracts.status thay đổi → post system message
CREATE OR REPLACE FUNCTION fn_som_post_contract_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_msg TEXT;
  v_contract_no TEXT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  v_contract_no := COALESCE(NEW.form_data->>'contract_no', '—');

  v_msg := CASE NEW.status
    WHEN 'reviewing' THEN '📤 Sale đã trình HĐ ' || v_contract_no || ' rev #' || NEW.revision_no || ' cho Kiểm tra'
    WHEN 'approved'  THEN '✅ Kiểm tra đã duyệt HĐ ' || v_contract_no || ' rev #' || NEW.revision_no || ' — chuyển trình ký'
    WHEN 'rejected'  THEN '❌ Kiểm tra trả lại HĐ ' || v_contract_no || ' rev #' || NEW.revision_no ||
                          CASE WHEN NEW.rejected_reason IS NOT NULL
                               THEN ' — "' || NEW.rejected_reason || '"' ELSE '' END
    WHEN 'signed'    THEN '✍️ Đã ký HĐ ' || v_contract_no || ' rev #' || NEW.revision_no
    WHEN 'archived'  THEN '📁 HĐ ' || v_contract_no || ' rev #' || NEW.revision_no || ' đã lưu trữ'
    ELSE 'Contract status: ' || OLD.status || ' → ' || NEW.status
  END;

  INSERT INTO sales_order_messages (
    sales_order_id, content, message_type, author_role
  ) VALUES (
    NEW.sales_order_id,
    v_msg,
    'system',
    'system'
  );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_som_post_contract_status_change ON sales_order_contracts;
CREATE TRIGGER trg_som_post_contract_status_change
  AFTER UPDATE OF status ON sales_order_contracts
  FOR EACH ROW EXECUTE FUNCTION fn_som_post_contract_status_change();

-- Khi 1 contract draft mới được insert (status='reviewing') → post message
CREATE OR REPLACE FUNCTION fn_som_post_contract_new()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_contract_no TEXT;
  v_creator TEXT;
BEGIN
  v_contract_no := COALESCE(NEW.form_data->>'contract_no', '—');
  v_creator := (SELECT full_name FROM employees WHERE id = NEW.created_by);

  IF NEW.status = 'reviewing' THEN
    INSERT INTO sales_order_messages (
      sales_order_id, content, message_type, author_role
    ) VALUES (
      NEW.sales_order_id,
      '🆕 ' || COALESCE(v_creator, 'Sale') || ' tạo HĐ workflow ' || v_contract_no ||
      ' rev #' || NEW.revision_no || ' — đang chờ Kiểm tra',
      'system',
      'system'
    );
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_som_post_contract_new ON sales_order_contracts;
CREATE TRIGGER trg_som_post_contract_new
  AFTER INSERT ON sales_order_contracts
  FOR EACH ROW EXECUTE FUNCTION fn_som_post_contract_new();

-- ============================================================
-- 6. Verify
-- ============================================================
SELECT
  conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'sales_order_documents'::regclass
  AND contype = 'c';

SELECT count(*) AS message_count FROM sales_order_messages;

SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE event_object_table IN ('sales_order_messages', 'sales_orders', 'sales_order_contracts')
  AND trigger_name LIKE '%som%'
ORDER BY trigger_name;
