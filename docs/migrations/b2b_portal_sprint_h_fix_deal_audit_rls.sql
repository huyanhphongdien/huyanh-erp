-- ============================================================================
-- B2B Portal Sprint H — Fix NEW-BUG-G: deal_audit_log RLS blocks trigger
-- Date: 2026-04-21
-- ============================================================================
-- Bug: b2b.deal_audit_log có RLS enabled nhưng ZERO policies → mọi INSERT
--      bị reject. Trigger trg_deal_audit trên b2b.deals gọi log_deal_changes
--      → INSERT audit log → RLS block → create/update deal fail.
--
-- Reproduce: ERP ConfirmDealModal "Tạo Deal" → toast error
--   "new row violates row-level security policy for table deal_audit_log"
--
-- Fix: Chuyển b2b.log_deal_changes() sang SECURITY DEFINER. Trigger function
--      chạy quyền owner của function (không phải caller) → bypass RLS on
--      deal_audit_log. Set search_path để tránh DEFINER function hijacking.
--
-- RLS giữ nguyên enabled trên deal_audit_log (security posture OK) —
-- chỉ trigger function được quyền write. Người dùng trực tiếp vẫn không
-- INSERT được.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════
-- Lấy function definition hiện tại + re-create với SECURITY DEFINER
-- ═══════════════════════════════════════════════════════════════

-- Step 1: Check function source (manual verify)
-- SELECT pg_get_functiondef(oid) FROM pg_proc
-- WHERE proname = 'log_deal_changes' AND pronamespace = 'b2b'::regnamespace;

-- Step 2: ALTER để add SECURITY DEFINER + search_path
ALTER FUNCTION b2b.log_deal_changes() SECURITY DEFINER SET search_path = b2b, public, pg_temp;

-- ═══════════════════════════════════════════════════════════════
-- Verify
-- ═══════════════════════════════════════════════════════════════

-- Check function giờ là SECURITY DEFINER
SELECT
  proname,
  prosecdef AS is_security_definer,
  proconfig AS config_settings
FROM pg_proc
WHERE proname = 'log_deal_changes'
  AND pronamespace = 'b2b'::regnamespace;
-- Expected: is_security_definer = true, config_settings contains 'search_path=...'
