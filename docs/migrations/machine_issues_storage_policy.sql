-- =====================================================================
-- Policy cho bucket machine-issues (ảnh báo hỏng máy)
-- CHẠY TRONG SUPABASE DASHBOARD → SQL Editor (ở đó có quyền owner storage.objects;
-- RPC agent_sql KHÔNG chạy được vì không phải owner).
--
-- Bucket đã tạo sẵn (public=true, trần 20MB). Chỉ còn thêm policy cho phép
-- công nhân (anon, chưa đăng nhập) UPLOAD ảnh khi báo hỏng.
-- =====================================================================

-- Cho phép anon + authenticated GHI ảnh vào bucket machine-issues
DROP POLICY IF EXISTS missue_insert ON storage.objects;
CREATE POLICY missue_insert ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'machine-issues');

-- Bucket public nên đọc đã mở; thêm policy đọc rõ ràng cho chắc
DROP POLICY IF EXISTS missue_select ON storage.objects;
CREATE POLICY missue_select ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'machine-issues');

-- Sau khi chạy: ảnh trong form báo hỏng /m/tb/:code sẽ upload được.
-- (Chưa chạy cũng không sao — phiếu vẫn gửi, chỉ thiếu ảnh.)
