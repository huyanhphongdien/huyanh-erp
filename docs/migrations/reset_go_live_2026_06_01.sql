-- ============================================================================
-- RESET DATA TRƯỚC GO-LIVE — Xóa hết Đại lý + Phiếu cân (demo data)
-- File: docs/migrations/reset_go_live_2026_06_01.sql
-- Date: 2026-05-28   |   Go-live: 2026-06-01
-- ============================================================================
--
-- MỤC ĐÍCH: Xóa SẠCH dữ liệu demo để test lại từ đầu trước go-live.
--   - Tất cả ĐẠI LÝ B2B (b2b.partners) + toàn bộ data phụ thuộc
--   - Tất cả PHIẾU CÂN (weighbridge_tickets) + NHẬP MỦ (rubber_intake_batches),
--     cả B2B lẫn non-B2B (Lào, NCC Việt)
--   - Tài khoản LOGIN đại lý (partner_users + auth.users tương ứng)
--
-- GIỮ LẠI (KHÔNG xóa):
--   - public.business_partners (HAC-13 master — dùng chung KH/NCC/B2B)
--   - employees + auth.users của nhân viên
--   - facilities, drc_lookup, daily_price_list, b2b_bonus_rules (config/quy chế)
--
-- ⚠️ KHÔNG HOÀN TÁC ĐƯỢC. Khuyến nghị: tạo snapshot/backup Supabase trước khi chạy.
--   (Dashboard → Database → Backups → hoặc pg_dump)
--
-- CÁCH CHẠY:
--   1. Chạy PHẦN A trước (chỉ SELECT, không xóa gì) → xem "bán kính ảnh hưởng"
--   2. Đọc kỹ output: bảng nào sẽ bị TRUNCATE CASCADE, số dòng hiện tại
--   3. Nếu OK → chạy PHẦN B (transaction xóa thật)
--   4. Chạy PHẦN C để verify mọi thứ = 0
-- ============================================================================


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ PHẦN A — CHẨN ĐOÁN (chạy trước, KHÔNG xóa gì)                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- A1. Số dòng hiện tại của các bảng gốc sẽ bị xóa
SELECT 'b2b.partners'              AS tbl, COUNT(*) AS rows FROM b2b.partners
UNION ALL SELECT 'weighbridge_tickets',     COUNT(*) FROM public.weighbridge_tickets
UNION ALL SELECT 'rubber_intake_batches',   COUNT(*) FROM public.rubber_intake_batches;

-- A2. BÁN KÍNH ẢNH HƯỞNG: tất cả bảng sẽ bị TRUNCATE CASCADE kéo theo
--     (đệ quy theo FK trỏ về 3 bảng gốc). ĐỌC KỸ danh sách này.
WITH RECURSIVE roots(oid) AS (
  SELECT c.oid
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE (n.nspname='b2b'    AND c.relname='partners')
     OR (n.nspname='public' AND c.relname IN ('weighbridge_tickets','rubber_intake_batches','rubber_intake_tickets'))
),
fk_tree(child_oid, parent_oid, depth) AS (
  SELECT con.conrelid, con.confrelid, 1
  FROM pg_constraint con
  WHERE con.contype='f' AND con.confrelid IN (SELECT oid FROM roots)
  UNION
  SELECT con.conrelid, con.confrelid, ft.depth+1
  FROM pg_constraint con
  JOIN fk_tree ft ON con.confrelid = ft.child_oid
  WHERE con.contype='f' AND ft.depth < 10
)
SELECT DISTINCT
  (SELECT nspname FROM pg_namespace WHERE oid = c.relnamespace) AS schema,
  c.relname AS table_affected_by_cascade
FROM fk_tree ft
JOIN pg_class c ON c.oid = ft.child_oid
ORDER BY 1, 2;

-- A3. Số tài khoản login đại lý sẽ bị xóa (partner_users + auth.users)
--     Link đến auth qua cột auth_user_id.
SELECT COUNT(*) AS partner_login_accounts
FROM public.partner_users
WHERE auth_user_id IS NOT NULL;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ PHẦN B — XÓA THẬT (chỉ chạy sau khi đã review PHẦN A)                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- B1. Xóa auth.users của đại lý TRƯỚC (capture từ partner_users trước khi mất)
--     Chỉ xóa user là login đại lý — KHÔNG đụng auth.users của nhân viên.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_pu regclass := to_regclass('public.partner_users');
  v_deleted INT := 0;
BEGIN
  IF v_pu IS NULL THEN v_pu := to_regclass('b2b.partner_users'); END IF;
  IF v_pu IS NOT NULL THEN
    EXECUTE format(
      'DELETE FROM auth.users WHERE id IN (SELECT auth_user_id FROM %s WHERE auth_user_id IS NOT NULL)',
      v_pu
    );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RAISE NOTICE 'Đã xóa % auth.users (login đại lý)', v_deleted;
  ELSE
    RAISE NOTICE 'Không tìm thấy bảng partner_users — bỏ qua xóa auth.users';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- B2. TRUNCATE CASCADE các bảng GỐC. CASCADE tự xóa toàn bộ bảng con theo FK.
--     Tự dò schema (b2b. hoặc public.), chỉ truncate BASE TABLE (bỏ qua VIEW).
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_candidates text[] := ARRAY[
    -- Phiếu cân + nhập mủ (cả B2B lẫn non-B2B)
    'public.rubber_intake_batches',
    'public.rubber_intake_tickets',
    'public.weighbridge_tickets',
    'wms.weighbridge_tickets',
    -- Đề nghị thanh toán (gom phiếu cân) — xóa cả đầu phiếu cho sạch, CASCADE
    -- kéo payment_request_lines. (2026-06-02)
    'public.payment_requests',
    -- Đại lý B2B (root — CASCADE kéo deals/demands/chat/settlements/advances/
    -- ledger/monthly_bonuses/assignments/auctions/partner_users...)
    'b2b.partners',
    -- Login đại lý (nếu không bị cascade từ partners)
    'public.partner_users',
    'b2b.partner_users'
  ];
  v_name text;
  v_reg  regclass;
BEGIN
  FOREACH v_name IN ARRAY v_candidates LOOP
    v_reg := to_regclass(v_name);
    IF v_reg IS NOT NULL THEN
      -- chỉ TRUNCATE base table (relkind='r'), bỏ qua view (relkind='v')
      IF EXISTS (SELECT 1 FROM pg_class WHERE oid = v_reg AND relkind = 'r') THEN
        EXECUTE format('TRUNCATE TABLE %s RESTART IDENTITY CASCADE', v_reg);
        RAISE NOTICE 'TRUNCATE % CASCADE ✓', v_reg;
      END IF;
    END IF;
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- B3. Verify trong transaction trước khi COMMIT
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_partners INT;
  v_weigh    INT;
  v_intake   INT;
  v_payreq   INT;
BEGIN
  SELECT COUNT(*) INTO v_partners FROM b2b.partners;
  SELECT COUNT(*) INTO v_weigh    FROM public.weighbridge_tickets;
  SELECT COUNT(*) INTO v_intake   FROM public.rubber_intake_batches;
  SELECT COUNT(*) INTO v_payreq   FROM public.payment_requests;
  RAISE NOTICE '═══ Sau khi xóa (trong transaction) ═══';
  RAISE NOTICE '  b2b.partners: %', v_partners;
  RAISE NOTICE '  weighbridge_tickets: %', v_weigh;
  RAISE NOTICE '  rubber_intake_batches: %', v_intake;
  RAISE NOTICE '  payment_requests: %', v_payreq;
  IF v_partners > 0 OR v_weigh > 0 OR v_intake > 0 OR v_payreq > 0 THEN
    RAISE EXCEPTION 'Vẫn còn dòng chưa xóa — ROLLBACK để kiểm tra lại';
  END IF;
  RAISE NOTICE '  ✓ Tất cả = 0. Sẵn sàng COMMIT.';
END $$;

COMMIT;
-- Nếu muốn HỦY thay vì commit: thay COMMIT bằng ROLLBACK;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ PHẦN C — VERIFY SAU COMMIT (chạy lại để chắc chắn)                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
SELECT 'b2b.partners'            AS tbl, COUNT(*) AS rows FROM b2b.partners
UNION ALL SELECT 'weighbridge_tickets',   COUNT(*) FROM public.weighbridge_tickets
UNION ALL SELECT 'rubber_intake_batches', COUNT(*) FROM public.rubber_intake_batches
UNION ALL SELECT 'b2b_deals',             COUNT(*) FROM public.b2b_deals
UNION ALL SELECT 'b2b_demands',           COUNT(*) FROM public.b2b_demands
UNION ALL SELECT 'b2b_chat_rooms',        COUNT(*) FROM public.b2b_chat_rooms
UNION ALL SELECT 'b2b_settlements',       COUNT(*) FROM public.b2b_settlements
UNION ALL SELECT 'b2b_advances',          COUNT(*) FROM public.b2b_advances
UNION ALL SELECT 'b2b_partner_ledger',    COUNT(*) FROM public.b2b_partner_ledger;
