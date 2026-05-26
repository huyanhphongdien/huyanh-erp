-- ============================================================================
-- HAC-13 Phase 1.1 — Sequences + Functions (lib)
-- Date: 2026-05-26
-- ============================================================================
--
-- Mục đích:
--   Foundation cho hệ thống mã định danh HAC-13 (13 chữ số) theo quy định v10.
--   Format: 8999 (prefix) + T (type 1|2|3) + NNNNNNN (sequence) + C (GS1 mod10).
--
--   - Type 1 = Business Partner trong nước (KH+NCC VN, đại lý B2B VN, hộ NCC mủ VN)
--   - Type 2 = Business Partner nước ngoài (KH+NCC quốc tế)
--   - Type 3 = Nhân viên
--
--   Mỗi type code có sequence độc lập, mỗi type bắt đầu từ 1.
--
-- Quy chiếu:
--   docs/du lieu tho/QuyDinh_MaDinhDanh_v10_CaoSuHuyAnh (3).docx
--   src/lib/hac13.ts (TypeScript twin — phải đồng nhất công thức)
--
-- AN TOÀN:
--   - Function IMMUTABLE / VOLATILE đúng semantic (immutable cho check digit, volatile cho generate).
--   - Sequence consume bởi nextval — rollback transaction VẪN consume → có thể tạo gap; quy định cho phép.
--   - Không cấp execute cho anon — chỉ authenticated (RPC từ frontend đã đăng nhập).
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: CREATE SEQUENCES (mỗi type 1 sequence, max 7 digit)
-- ════════════════════════════════════════════════════════════════════════════

CREATE SEQUENCE IF NOT EXISTS hac13_seq_bp_vn
  MINVALUE 1 MAXVALUE 9999999 START 1 NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS hac13_seq_bp_foreign
  MINVALUE 1 MAXVALUE 9999999 START 1 NO CYCLE;

CREATE SEQUENCE IF NOT EXISTS hac13_seq_employee
  MINVALUE 1 MAXVALUE 9999999 START 1 NO CYCLE;

COMMENT ON SEQUENCE hac13_seq_bp_vn IS
  'HAC-13: sequence cho Business Partner trong nước (type=1). Range 1..9999999, không cycle.';
COMMENT ON SEQUENCE hac13_seq_bp_foreign IS
  'HAC-13: sequence cho Business Partner nước ngoài (type=2). Range 1..9999999, không cycle.';
COMMENT ON SEQUENCE hac13_seq_employee IS
  'HAC-13: sequence cho Nhân viên (type=3). Range 1..9999999, không cycle.';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: CHECK DIGIT FUNCTION (GS1 Modulo 10)
-- ════════════════════════════════════════════════════════════════════════════
-- Vị trí lẻ tính từ phải sang trái: nhân 3; vị trí chẵn: nhân 1.
-- Tổng tất cả tích → check = (10 - sum mod 10) mod 10.
-- IMMUTABLE để Postgres có thể dùng trong CHECK constraint của bảng.

CREATE OR REPLACE FUNCTION hac13_check_digit(p12 text) RETURNS char(1)
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
  s int := 0;
  d int;
  i int;
BEGIN
  IF p12 IS NULL OR length(p12) <> 12 OR p12 !~ '^[0-9]{12}$' THEN
    RAISE EXCEPTION 'hac13_check_digit: input phải là chuỗi 12 chữ số, nhận: %', p12;
  END IF;
  FOR i IN 1..12 LOOP
    d := substr(p12, 13 - i, 1)::int;
    IF i % 2 = 1 THEN
      s := s + d * 3;
    ELSE
      s := s + d;
    END IF;
  END LOOP;
  RETURN ((10 - (s % 10)) % 10)::text;
END;
$$;

COMMENT ON FUNCTION hac13_check_digit(text) IS
  'Tính check digit GS1 Modulo 10 cho 12 chữ số đầu của mã HAC-13.';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: GENERATE HAC-13 FUNCTION
-- ════════════════════════════════════════════════════════════════════════════
-- Sinh 1 mã HAC-13 mới cho type_code cho trước (1, 2, hoặc 3).
-- Consume nextval của sequence tương ứng.

CREATE OR REPLACE FUNCTION generate_hac13(p_type_code int) RETURNS char(13)
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  seq bigint;
  body text;
BEGIN
  IF p_type_code NOT IN (1, 2, 3) THEN
    RAISE EXCEPTION 'generate_hac13: type_code phải là 1, 2 hoặc 3, nhận: %', p_type_code;
  END IF;
  seq := CASE p_type_code
    WHEN 1 THEN nextval('hac13_seq_bp_vn')
    WHEN 2 THEN nextval('hac13_seq_bp_foreign')
    WHEN 3 THEN nextval('hac13_seq_employee')
  END;
  IF seq > 9999999 THEN
    RAISE EXCEPTION 'generate_hac13: sequence cho type % đã cạn (>9999999)', p_type_code;
  END IF;
  body := '8999' || p_type_code::text || lpad(seq::text, 7, '0');
  RETURN body || hac13_check_digit(body);
END;
$$;

COMMENT ON FUNCTION generate_hac13(int) IS
  'Sinh mã HAC-13 mới cho type code 1|2|3. Consume sequence tương ứng + tự tính check digit.';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 4: VALIDATE HAC-13 FUNCTION (helper cho CHECK constraint + RPC)
-- ════════════════════════════════════════════════════════════════════════════
-- Trả về true nếu mã HAC-13 hợp lệ (prefix + type + sequence + check digit).
-- IMMUTABLE → dùng được trong CHECK constraint.

CREATE OR REPLACE FUNCTION is_valid_hac13(p_code text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
BEGIN
  IF p_code IS NULL OR length(p_code) <> 13 OR p_code !~ '^[0-9]{13}$' THEN
    RETURN false;
  END IF;
  IF substr(p_code, 1, 4) <> '8999' THEN
    RETURN false;
  END IF;
  IF substr(p_code, 5, 1) NOT IN ('1', '2', '3') THEN
    RETURN false;
  END IF;
  IF substr(p_code, 6, 7) = '0000000' THEN
    RETURN false;
  END IF;
  RETURN hac13_check_digit(substr(p_code, 1, 12)) = substr(p_code, 13, 1);
END;
$$;

COMMENT ON FUNCTION is_valid_hac13(text) IS
  'Validate mã HAC-13: length 13, all digits, prefix 8999, type 1|2|3, sequence != 0, check digit khớp.';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 5: GRANT EXECUTE permissions (Supabase RPC từ authenticated only)
-- ════════════════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION hac13_check_digit(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION generate_hac13(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION is_valid_hac13(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION hac13_check_digit(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION generate_hac13(int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION is_valid_hac13(text) TO authenticated, service_role, anon;
-- is_valid_hac13 cho phép anon dùng (search public form), không consume sequence.

GRANT USAGE ON SEQUENCE hac13_seq_bp_vn      TO authenticated, service_role;
GRANT USAGE ON SEQUENCE hac13_seq_bp_foreign TO authenticated, service_role;
GRANT USAGE ON SEQUENCE hac13_seq_employee   TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 6: SMOKE TEST (chạy 1 lần, verify công thức khớp ví dụ trong docx)
-- ════════════════════════════════════════════════════════════════════════════
-- Cross-check 3 vector test từ tài liệu v10:
--   8999100012346 (An Xuyên BP-VN, type=1, seq=1234, check=6)
--   8999200000564 (BP nước ngoài, type=2, seq=56,   check=4)
--   8999300000129 (Nhân viên,     type=3, seq=12,   check=9)
DO $$
BEGIN
  IF hac13_check_digit('899910001234') <> '6' THEN
    RAISE EXCEPTION 'SMOKE FAIL: 899910001234 → expect 6, got %', hac13_check_digit('899910001234');
  END IF;
  IF hac13_check_digit('899920000056') <> '4' THEN
    RAISE EXCEPTION 'SMOKE FAIL: 899920000056 → expect 4, got %', hac13_check_digit('899920000056');
  END IF;
  IF hac13_check_digit('899930000012') <> '9' THEN
    RAISE EXCEPTION 'SMOKE FAIL: 899930000012 → expect 9, got %', hac13_check_digit('899930000012');
  END IF;
  IF NOT is_valid_hac13('8999100012346') THEN
    RAISE EXCEPTION 'SMOKE FAIL: is_valid_hac13(8999100012346) phải true';
  END IF;
  IF is_valid_hac13('8999100012345') THEN
    RAISE EXCEPTION 'SMOKE FAIL: is_valid_hac13(8999100012345 — sai check) phải false';
  END IF;
  RAISE NOTICE 'HAC-13 smoke test PASS — công thức check digit khớp docx v10';
END $$;
