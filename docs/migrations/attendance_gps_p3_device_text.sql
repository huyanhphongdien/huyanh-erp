-- ============================================================================
-- CHẤM CÔNG GPS — ĐỢT 3 (17/09/2026): check_in_device / check_in_ip → text
-- ============================================================================
-- Sự cố sáng 17/09: điện thoại check-in báo "value too long for type character varying(200)".
-- attendance.check_in_device là varchar(200) nhưng client ghi "<loại>|<userAgent>" và UA
-- Android/Chrome dài hơn 190 ký tự → vượt 200. Nới cột sang text (client vẫn cắt ≤ 200).
-- Đã áp production 17/09/2026 08:30. Idempotent (ALTER TYPE text lặp lại vô hại).
-- ============================================================================

ALTER TABLE public.attendance ALTER COLUMN check_in_device TYPE text;

ALTER TABLE public.attendance ALTER COLUMN check_in_ip TYPE text;
