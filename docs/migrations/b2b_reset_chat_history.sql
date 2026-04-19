-- ============================================================================
-- B2B RESET CHAT HISTORY — SQL script cho Supabase SQL editor
-- Ngày: 2026-04-19
-- Mục đích: Xóa lịch sử chat + deal/dispute cũ để test lại luồng từ đầu.
--
-- ⚠️ CẢNH BÁO: Đây là DESTRUCTIVE operation. Chạy trên production = mất data.
-- Đọc kỹ từng bước. Chạy lẻ từng block, check kết quả trước khi sang block tiếp.
-- Nên chạy ngoài giờ làm việc hoặc trên môi trường staging trước.
-- ============================================================================

-- ============================================================================
-- BƯỚC 0 — BACKUP trước khi xóa (NÊN CHẠY)
-- ============================================================================

-- Tạo schema backup tạm thời + snapshot các bảng sẽ bị xóa
CREATE SCHEMA IF NOT EXISTS b2b_backup_20260419;

CREATE TABLE b2b_backup_20260419.chat_messages AS
  SELECT * FROM b2b.chat_messages;

CREATE TABLE b2b_backup_20260419.chat_rooms AS
  SELECT * FROM b2b.chat_rooms;

CREATE TABLE b2b_backup_20260419.deals AS
  SELECT * FROM b2b.deals;

CREATE TABLE b2b_backup_20260419.advances AS
  SELECT * FROM b2b.advances;

CREATE TABLE b2b_backup_20260419.drc_disputes AS
  SELECT * FROM b2b.drc_disputes;

CREATE TABLE b2b_backup_20260419.partner_ledger AS
  SELECT * FROM b2b.partner_ledger;

-- Check backup thành công
SELECT 'chat_messages' AS tbl, COUNT(*) FROM b2b_backup_20260419.chat_messages
UNION ALL SELECT 'chat_rooms', COUNT(*) FROM b2b_backup_20260419.chat_rooms
UNION ALL SELECT 'deals', COUNT(*) FROM b2b_backup_20260419.deals
UNION ALL SELECT 'advances', COUNT(*) FROM b2b_backup_20260419.advances
UNION ALL SELECT 'drc_disputes', COUNT(*) FROM b2b_backup_20260419.drc_disputes
UNION ALL SELECT 'partner_ledger', COUNT(*) FROM b2b_backup_20260419.partner_ledger;

-- ============================================================================
-- BƯỚC 1 — XEM trước những gì sẽ bị xóa
-- ============================================================================

SELECT 'chat_messages' AS tbl, COUNT(*) AS rows FROM b2b.chat_messages
UNION ALL SELECT 'chat_rooms', COUNT(*) FROM b2b.chat_rooms
UNION ALL SELECT 'deals', COUNT(*) FROM b2b.deals
UNION ALL SELECT 'advances', COUNT(*) FROM b2b.advances
UNION ALL SELECT 'drc_disputes', COUNT(*) FROM b2b.drc_disputes
UNION ALL SELECT 'drc_dispute_history', COUNT(*) FROM b2b.drc_disputes WHERE status IN ('resolved_accepted','resolved_rejected','withdrawn')
UNION ALL SELECT 'partner_ledger', COUNT(*) FROM b2b.partner_ledger
UNION ALL SELECT 'rubber_bookings', COUNT(*) FROM b2b.rubber_bookings
UNION ALL SELECT 'settlements', COUNT(*) FROM b2b.settlements;

-- ============================================================================
-- BƯỚC 2 — XÓA THEO THỨ TỰ PHỤ THUỘC FK
-- ⚠️ Chạy TỪNG block (hoặc từng DELETE). KHÔNG chạy cả BƯỚC 2 cùng lúc
--     nếu chưa chắc chắn.
-- ============================================================================

-- 2.1. Xóa chat messages trước (không có FK ra ngoài)
DELETE FROM b2b.chat_messages;

-- 2.2. Xóa disputes (FK tới deals)
DELETE FROM b2b.drc_disputes;

-- 2.3. Xóa ledger entries liên quan Deal/Advance/Dispute
DELETE FROM b2b.partner_ledger
 WHERE reference_type IN ('advance','dispute','settlement','deal');

-- 2.4. Xóa settlement detail + settlement header
DELETE FROM b2b.settlement_advances;
DELETE FROM b2b.settlements;

-- 2.5. Xóa advances
DELETE FROM b2b.advances;

-- 2.6. Xóa stock_ins liên quan Deal (nếu có)
-- Chỉ xóa stock_ins có deal_id, KHÔNG xóa hết stock_ins toàn kho
DELETE FROM public.stock_ins WHERE deal_id IS NOT NULL;

-- 2.7. Xóa deals
DELETE FROM b2b.deals;

-- 2.8. Xóa rubber bookings (phiếu chốt mủ)
DELETE FROM b2b.rubber_bookings;

-- 2.9. Xóa chat rooms (sau khi messages đã xóa)
DELETE FROM b2b.chat_rooms;

-- ============================================================================
-- BƯỚC 3 — VERIFY đã sạch
-- ============================================================================

SELECT 'chat_messages' AS tbl, COUNT(*) AS rows FROM b2b.chat_messages
UNION ALL SELECT 'chat_rooms', COUNT(*) FROM b2b.chat_rooms
UNION ALL SELECT 'deals', COUNT(*) FROM b2b.deals
UNION ALL SELECT 'advances', COUNT(*) FROM b2b.advances
UNION ALL SELECT 'drc_disputes', COUNT(*) FROM b2b.drc_disputes
UNION ALL SELECT 'partner_ledger', COUNT(*) FROM b2b.partner_ledger
UNION ALL SELECT 'rubber_bookings', COUNT(*) FROM b2b.rubber_bookings
UNION ALL SELECT 'settlements', COUNT(*) FROM b2b.settlements;

-- ============================================================================
-- BƯỚC 4 — (OPTIONAL) XÓA BACKUP sau khi đã test xong + ổn định
-- ⚠️ Chỉ chạy khi đã 100% chắc chắn không cần rollback
-- ============================================================================

-- DROP SCHEMA b2b_backup_20260419 CASCADE;

-- ============================================================================
-- KHÔI PHỤC từ backup nếu cần (gỡ comment + chạy)
-- ============================================================================

-- TRUNCATE b2b.chat_messages; INSERT INTO b2b.chat_messages SELECT * FROM b2b_backup_20260419.chat_messages;
-- TRUNCATE b2b.chat_rooms;    INSERT INTO b2b.chat_rooms    SELECT * FROM b2b_backup_20260419.chat_rooms;
-- TRUNCATE b2b.deals;         INSERT INTO b2b.deals         SELECT * FROM b2b_backup_20260419.deals;
-- TRUNCATE b2b.advances;      INSERT INTO b2b.advances      SELECT * FROM b2b_backup_20260419.advances;
-- TRUNCATE b2b.drc_disputes;  INSERT INTO b2b.drc_disputes  SELECT * FROM b2b_backup_20260419.drc_disputes;
-- TRUNCATE b2b.partner_ledger;INSERT INTO b2b.partner_ledger SELECT * FROM b2b_backup_20260419.partner_ledger;
