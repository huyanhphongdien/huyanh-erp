-- =====================================================================
-- device_tokens: cho phép 1 nhân viên có NHIỀU thiết bị
--
-- Trước: UNIQUE (employee_id, platform) → mỗi NV chỉ giữ 1 máy Android.
-- Máy thứ 2 đăng nhập cùng tài khoản là ĐÁ VĂNG token máy thứ nhất
-- (phát hiện khi test: máy ảo và điện thoại giành nhau slot, tin đẩy
-- bay nhầm máy). Thực tế thợ có thể dùng điện thoại + máy bảng, và
-- khi test thì cần nhiều máy cùng lúc.
--
-- Sau: UNIQUE (token) → mỗi THIẾT BỊ một dòng. Token chết sẽ được
-- machine-issue-notify tự xoá khi FCM trả UNREGISTERED.
-- =====================================================================

-- Dọn token trùng (giữ bản mới nhất) trước khi tạo ràng buộc
DELETE FROM public.device_tokens a
USING public.device_tokens b
WHERE a.token = b.token AND a.updated_at < b.updated_at;

ALTER TABLE public.device_tokens
  DROP CONSTRAINT IF EXISTS device_tokens_employee_id_platform_key;

ALTER TABLE public.device_tokens
  ADD CONSTRAINT device_tokens_token_key UNIQUE (token);
