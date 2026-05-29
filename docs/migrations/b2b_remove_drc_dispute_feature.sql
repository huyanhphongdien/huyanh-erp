-- ============================================================================
-- Migration: REMOVE DRC dispute (Khiếu nại DRC) feature — DB side
-- File: docs/migrations/b2b_remove_drc_dispute_feature.sql
-- Date: 2026-05-29
--
-- Bối cảnh: tính năng Khiếu nại DRC đã được gỡ khỏi frontend (ERP + portal).
-- Phần DB còn lại GÂY RỦI RO nếu không gỡ:
--   1. Trigger "P16 auto_raise_drc_dispute" trên b2b.deals: khi actual_drc lệch
--      sample > 3% (lúc SX xong) sẽ TỰ tạo row b2b.drc_disputes (status 'open').
--   2. Cơ chế khoá quyết toán theo dispute (locked_by_dispute / trigger lock):
--      settlement bị chặn/khoá khi deal có dispute đang mở.
--   → Nếu chỉ gỡ UI: dispute vẫn tự sinh, quyết toán vẫn bị khoá, NHƯNG không còn
--     UI để giải quyết → phiếu quyết toán KẸT VĨNH VIỄN.
--
-- Migration này gỡ phần DB đó. Các object dispute được tạo trực tiếp trên prod
-- (KHÔNG có trong repo) nên tên chính xác không chắc chắn → dùng cách quét động
-- theo pattern thay vì hardcode tên. Chạy 1 lần trên Supabase (SQL Editor).
--
-- AN TOÀN: idempotent (chạy lại nhiều lần không lỗi). KHÔNG xoá dữ liệu lịch sử
-- (bảng b2b.drc_disputes) trừ khi bỏ comment phần OPTIONAL ở cuối.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 0) DISCOVERY — in ra các object dispute hiện có (để đối chiếu/log)
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  RAISE NOTICE '--- Triggers liên quan dispute/auto_raise ---';
  FOR r IN
    SELECT n.nspname, c.relname AS tbl, tg.tgname, p.proname AS fn
    FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = tg.tgfoid
    WHERE NOT tg.tgisinternal
      AND n.nspname IN ('b2b', 'public')
      AND (p.proname ILIKE '%dispute%' OR p.proname ILIKE '%auto_raise%')
  LOOP
    RAISE NOTICE 'TRIGGER %.%.% -> %()', r.nspname, r.tbl, r.tgname, r.fn;
  END LOOP;

  RAISE NOTICE '--- Functions liên quan dispute/auto_raise ---';
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('b2b', 'public')
      AND (p.proname ILIKE '%dispute%' OR p.proname ILIKE '%auto_raise%')
  LOOP
    RAISE NOTICE 'FUNCTION %.%(%)', r.nspname, r.proname, r.args;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 1) DROP triggers liên quan dispute / auto_raise trên mọi bảng b2b/public
--    (gồm trigger P16 auto_raise_drc_dispute trên b2b.deals + trigger khoá
--     settlement-by-dispute nếu tên function chứa 'dispute')
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname, c.relname AS tbl, tg.tgname
    FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = tg.tgfoid
    WHERE NOT tg.tgisinternal
      AND n.nspname IN ('b2b', 'public')
      AND (p.proname ILIKE '%dispute%' OR p.proname ILIKE '%auto_raise%')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I.%I', r.tgname, r.nspname, r.tbl);
    RAISE NOTICE 'Dropped trigger % on %.%', r.tgname, r.nspname, r.tbl;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) DROP functions dispute (auto_raise_drc_dispute, partner_raise_drc_dispute,
--    resolve/withdraw/mark_investigating, settlement-lock-by-dispute, ...)
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('b2b', 'public')
      AND (p.proname ILIKE '%drc_dispute%'
           OR p.proname ILIKE '%auto_raise%'
           OR p.proname = 'partner_raise_drc_dispute')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %I.%I(%s) CASCADE', r.nspname, r.proname, r.args);
    RAISE NOTICE 'Dropped function %.%(%)', r.nspname, r.proname, r.args;
  END LOOP;
END $$;

-- Phòng khi RPC nằm ngoài pattern trên — drop tường minh (no-op nếu không có):
DROP FUNCTION IF EXISTS public.partner_raise_drc_dispute(uuid, text, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.partner_raise_drc_dispute(uuid, text) CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Gỡ cờ khoá settlement-by-dispute (nếu còn sót row nào đang bị khoá)
--    An toàn: chỉ UPDATE nếu cột tồn tại.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'b2b' AND table_name = 'settlements'
      AND column_name = 'locked_by_dispute'
  ) THEN
    EXECUTE 'UPDATE b2b.settlements SET locked_by_dispute = false, locked_dispute_id = NULL
             WHERE locked_by_dispute IS TRUE';
    RAISE NOTICE 'Cleared locked_by_dispute flags on b2b.settlements';
  END IF;
END $$;

-- ============================================================================
-- OPTIONAL (destructive) — chỉ bỏ comment nếu muốn xoá hẳn cột/bảng lịch sử.
-- LƯU Ý: nếu public.b2b_settlements / public.b2b_drc_disputes là VIEW phụ thuộc
-- các cột/bảng này, phải DROP/CREATE lại view tương ứng. Kiểm tra trước khi chạy.
-- ============================================================================
-- -- 4a) Bỏ cột khoá khỏi b2b.settlements (drop view phụ thuộc trước nếu cần)
-- ALTER TABLE b2b.settlements DROP COLUMN IF EXISTS locked_by_dispute;
-- ALTER TABLE b2b.settlements DROP COLUMN IF EXISTS locked_dispute_id;
--
-- -- 4b) Bỏ cột FK dispute_id khỏi b2b.notifications (nếu có)
-- ALTER TABLE b2b.notifications DROP COLUMN IF EXISTS dispute_id;
--
-- -- 4c) Xoá hẳn bảng dispute (MẤT toàn bộ lịch sử khiếu nại)
-- DROP VIEW  IF EXISTS public.b2b_drc_disputes;
-- DROP TABLE IF EXISTS b2b.drc_disputes CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- 5) VERIFY — chạy lại discovery, kỳ vọng KHÔNG còn trigger/function dispute
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE cnt INT;
BEGIN
  SELECT count(*) INTO cnt
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('b2b', 'public')
    AND (p.proname ILIKE '%dispute%' OR p.proname ILIKE '%auto_raise%');
  RAISE NOTICE 'Còn % function dispute/auto_raise (kỳ vọng 0)', cnt;
END $$;
