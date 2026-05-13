-- ============================================================================
-- SALES CONTRACT ACCESS LOG — Log upload/view/download hợp đồng đơn hàng bán
-- Ngày: 2026-05-13
-- Mục đích:
--   - Sale upload HĐ (lần đầu, mỗi đơn 1 file)
--   - Chỉ BGĐ (admin + Mr. Trung) + sale-uploader xem được
--   - Không cho xóa; chỉ admin được replace
--   - Log mọi hành động: upload / view / download / replace
-- ============================================================================

-- ── 1. Bảng log truy cập hợp đồng ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_contract_access_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id  UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  document_id     UUID REFERENCES sales_order_documents(id) ON DELETE SET NULL,

  action          TEXT NOT NULL CHECK (action IN ('upload', 'view', 'download', 'replace')),

  user_id         UUID,
  user_email      TEXT,
  user_name       TEXT,
  user_role       TEXT,        -- sale / admin / production / ... (sales role)

  file_name       TEXT,
  file_path       TEXT,        -- storage path tại thời điểm action
  file_size       BIGINT,
  notes           TEXT,

  client_ip       TEXT,
  user_agent      TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scal_order_time
  ON sales_contract_access_log (sales_order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scal_user_time
  ON sales_contract_access_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scal_action
  ON sales_contract_access_log (action, created_at DESC);

COMMENT ON TABLE sales_contract_access_log IS
  'Log mọi hành động truy cập file hợp đồng đơn hàng bán (upload/view/download/replace). Chỉ BGĐ xem.';

-- ── 2. RLS: chỉ user đã đăng nhập mới insert; chỉ BGĐ mới select ──────────
ALTER TABLE sales_contract_access_log ENABLE ROW LEVEL SECURITY;

-- Insert: bất kỳ user đăng nhập (log do app chủ động insert)
DROP POLICY IF EXISTS scal_insert_authenticated ON sales_contract_access_log;
CREATE POLICY scal_insert_authenticated
  ON sales_contract_access_log
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Select: chỉ BGĐ (whitelist email) — guard chính ở app layer, RLS chỉ là lớp 2
DROP POLICY IF EXISTS scal_select_bod ON sales_contract_access_log;
CREATE POLICY scal_select_bod
  ON sales_contract_access_log
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt() ->> 'email' IN (
      'minhld@huyanhrubber.com',
      'thuyht@huyanhrubber.com',
      'huylv@huyanhrubber.com',
      'trunglxh@huyanhrubber.com'
    )
  );

-- ── 3. Storage bucket "sales-contracts" — PRIVATE (không public URL) ──────
-- Lưu ý: cần chạy trên Supabase Dashboard hoặc qua API (storage.buckets không
-- cho INSERT trực tiếp qua SQL trong một số phiên bản). Để đảm bảo:
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sales-contracts',
  'sales-contracts',
  false,  -- KHÔNG public — phải dùng signed URL
  20971520,  -- 20 MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 4. Storage RLS policies cho bucket sales-contracts ────────────────────
-- Upload: bất kỳ user authenticated (app layer kiểm tra role)
DROP POLICY IF EXISTS "sales_contracts_authenticated_insert" ON storage.objects;
CREATE POLICY "sales_contracts_authenticated_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'sales-contracts');

-- Read: cho phép user authenticated tạo signed URL (signed URL không qua RLS,
-- nên cần grant select để createSignedUrl hoạt động). App layer kiểm soát ai
-- được gọi createSignedUrl.
DROP POLICY IF EXISTS "sales_contracts_authenticated_select" ON storage.objects;
CREATE POLICY "sales_contracts_authenticated_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'sales-contracts');

-- KHÔNG có policy delete/update → không ai xóa được qua client.

-- ── 5. Sanity check ───────────────────────────────────────────────────────
-- SELECT count(*) FROM sales_contract_access_log;
-- SELECT id, public FROM storage.buckets WHERE id = 'sales-contracts';
