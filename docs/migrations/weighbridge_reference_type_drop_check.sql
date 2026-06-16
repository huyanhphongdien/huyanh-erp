-- ============================================================================
-- WEIGHBRIDGE — Bỏ CHECK chặn reference_type='dispatch_order'
-- ============================================================================
-- GỐC LỖI: weighbridge_tickets.reference_type có CHECK constraint KHÔNG cho
-- giá trị 'dispatch_order' → app cân lưu link Lệnh điều động thất bại (best-effort
-- nuốt lỗi) → reload mất lựa chọn → cân XUẤT hoàn tất KHÔNG đồng bộ về lệnh.
--
-- Sửa: bỏ mọi CHECK liên quan reference_type trên weighbridge_tickets. Sau đó
-- app cân lưu + khôi phục link lệnh bình thường → cân xong tự đồng bộ KL về lệnh.
--
-- An toàn: chỉ DROP constraint (không đụng dữ liệu). Idempotent (bỏ nếu còn).
-- Chạy 1 lần trên Supabase SQL Editor.
-- ============================================================================

DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE rel.relname = 'weighbridge_tickets'
      AND n.nspname = 'public'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%reference_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.weighbridge_tickets DROP CONSTRAINT %I', c.conname);
    RAISE NOTICE 'Đã bỏ CHECK: %', c.conname;
  END LOOP;
END $$;

-- Kiểm: thử update 1 phiếu test reference_type='dispatch_order' → không còn lỗi.
