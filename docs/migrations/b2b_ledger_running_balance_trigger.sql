-- ============================================================================
-- B2B PARTNER LEDGER — Auto-compute running_balance trigger
-- Created: 2026-04-18
-- ============================================================================
--
-- Vấn đề: running_balance trong b2b_partner_ledger KHÔNG được tính tự động.
-- Code TS chỉ đọc, không update. Kết quả: số dư công nợ luôn NULL hoặc stale.
--
-- Giải pháp: Trigger BEFORE INSERT tính running_balance dựa trên entry trước đó
-- (theo entry_date + id để đảm bảo thứ tự).
--
-- Công thức:
--   Với partner_X:
--     previous_balance = SELECT running_balance
--                        FROM b2b_partner_ledger
--                        WHERE partner_id = partner_X
--                        ORDER BY entry_date DESC, created_at DESC
--                        LIMIT 1
--     new_balance = (previous_balance ?? 0) + NEW.debit - NEW.credit
--
-- Quy ước:
--   DEBIT  = Nhà máy NỢ đại lý (công nợ TĂNG) — quyết toán
--   CREDIT = Trả nợ (công nợ GIẢM) — tạm ứng/thanh toán
--   running_balance > 0 → Nhà máy nợ đại lý
--   running_balance < 0 → Đại lý nợ nhà máy
-- ============================================================================

-- 1. FUNCTION — Tính running_balance trước khi insert
CREATE OR REPLACE FUNCTION public.compute_b2b_ledger_running_balance()
RETURNS TRIGGER AS $$
DECLARE
  prev_balance NUMERIC := 0;
BEGIN
  -- Lấy running_balance entry mới nhất của partner này
  -- (không tính chính nó nếu là UPDATE)
  SELECT COALESCE(running_balance, 0)
  INTO prev_balance
  FROM public.b2b_partner_ledger
  WHERE partner_id = NEW.partner_id
    AND (TG_OP = 'INSERT' OR id != NEW.id)
  ORDER BY entry_date DESC, created_at DESC, id DESC
  LIMIT 1;

  -- Tính new balance
  NEW.running_balance := prev_balance + COALESCE(NEW.debit, 0) - COALESCE(NEW.credit, 0);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. TRIGGER — Gắn vào bảng
DROP TRIGGER IF EXISTS trg_b2b_ledger_running_balance ON public.b2b_partner_ledger;
CREATE TRIGGER trg_b2b_ledger_running_balance
  BEFORE INSERT ON public.b2b_partner_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.compute_b2b_ledger_running_balance();

-- 3. BACKFILL — Recompute running_balance cho các entries cũ
-- (chạy 1 lần sau khi tạo trigger)
DO $$
DECLARE
  partner_record RECORD;
  ledger_record RECORD;
  cumulative_balance NUMERIC;
BEGIN
  FOR partner_record IN
    SELECT DISTINCT partner_id FROM public.b2b_partner_ledger
  LOOP
    cumulative_balance := 0;
    FOR ledger_record IN
      SELECT id, debit, credit
      FROM public.b2b_partner_ledger
      WHERE partner_id = partner_record.partner_id
      ORDER BY entry_date ASC, created_at ASC, id ASC
    LOOP
      cumulative_balance := cumulative_balance
        + COALESCE(ledger_record.debit, 0)
        - COALESCE(ledger_record.credit, 0);

      UPDATE public.b2b_partner_ledger
      SET running_balance = cumulative_balance
      WHERE id = ledger_record.id;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Backfill running_balance xong cho tất cả partners';
END $$;

-- ============================================================================
-- VERIFY — Chạy để kiểm tra kết quả
-- ============================================================================
-- SELECT partner_id, COUNT(*) AS entries, MAX(running_balance) AS latest_balance
-- FROM b2b_partner_ledger
-- GROUP BY partner_id
-- ORDER BY latest_balance DESC
-- LIMIT 20;
--
-- -- Test: insert 1 entry và xem running_balance tự động tính
-- INSERT INTO b2b_partner_ledger (partner_id, entry_type, debit, credit, description, entry_date, period_month, period_year)
-- VALUES ('<partner_uuid>', 'adjustment', 0, 1000000, 'Test trigger', CURRENT_DATE, EXTRACT(MONTH FROM NOW()), EXTRACT(YEAR FROM NOW()))
-- RETURNING id, running_balance;
