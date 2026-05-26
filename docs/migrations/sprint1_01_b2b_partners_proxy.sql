-- ============================================================================
-- Sprint 1.1 — Partner proxy account + contact alias
-- Date: 2026-05-26
-- Decision: proxy partner_type='dealer' + flag is_payment_proxy=true
-- ============================================================================
--
-- Mục đích: hỗ trợ pattern "đại lý đầu mối thu hộ tiền" tại Tân Lâm.
--   Vd: Trần Thị Mỹ Hoà nhận tiền chuyển khoản hộ cho cả Nguyễn Thị Hiền và
--   Nguyễn Thị Hương → Hoà có flag is_payment_proxy=true, còn Hiền/Hương
--   có payment_proxy_partner_id = Hoà.id.
--
-- Bonus: contact_alias_name lưu tên "X (Y)" — Y là người ra mặt tại nhà máy
-- (vợ/chồng/người thân) khác chủ TK ngân hàng.
--
-- KHÔNG tạo partner_type='proxy' mới — vẫn dùng 'dealer' để giữ data model.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='b2b' AND table_name='partners') THEN
    RAISE NOTICE 'SKIP: b2b.partners không tồn tại';
    RETURN;
  END IF;

  -- Cột 1: payment_proxy_partner_id — FK self-ref. CHỐNG self-loop bằng CHECK.
  EXECUTE 'ALTER TABLE b2b.partners ADD COLUMN IF NOT EXISTS payment_proxy_partner_id uuid REFERENCES b2b.partners(id) ON DELETE SET NULL';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_b2b_partners_proxy ON b2b.partners(payment_proxy_partner_id) WHERE payment_proxy_partner_id IS NOT NULL';

  -- CHECK: không self-ref (A không thể là proxy của chính A)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='b2b' AND table_name='partners' AND constraint_name='b2b_partners_no_self_proxy'
  ) THEN
    EXECUTE 'ALTER TABLE b2b.partners ADD CONSTRAINT b2b_partners_no_self_proxy CHECK (id <> payment_proxy_partner_id)';
  END IF;

  EXECUTE $cm$
    COMMENT ON COLUMN b2b.partners.payment_proxy_partner_id IS
      'Đại lý đầu mối nhận tiền chuyển khoản hộ (vd: Mỹ Hoà nhận cho Hiền + Hương). NULL = trả trực tiếp về bank_account của partner này.'
  $cm$;

  -- Cột 2: contact_alias_name — tên người ra mặt
  EXECUTE 'ALTER TABLE b2b.partners ADD COLUMN IF NOT EXISTS contact_alias_name text';
  EXECUTE $cm$
    COMMENT ON COLUMN b2b.partners.contact_alias_name IS
      'Tên người liên hệ thực tế tại nhà máy nếu khác chủ TK ngân hàng. Vd partner "Dương Bá Lê", alias "Hoàng Thị Chính" (vợ ra mặt giao mủ).'
  $cm$;

  -- Cột 3: is_payment_proxy — flag partner này có nhận tiền hộ ai không
  EXECUTE 'ALTER TABLE b2b.partners ADD COLUMN IF NOT EXISTS is_payment_proxy boolean NOT NULL DEFAULT false';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_b2b_partners_is_payment_proxy ON b2b.partners(is_payment_proxy) WHERE is_payment_proxy = true';
  EXECUTE $cm$
    COMMENT ON COLUMN b2b.partners.is_payment_proxy IS
      'TRUE = partner này nhận tiền hộ cho các đại lý khác (đại lý đầu mối). UI hiển thị badge "🏦 Đầu mối thu hộ".'
  $cm$;

  RAISE NOTICE 'Sprint 1.1 PASS — 3 cột proxy/alias đã thêm vào b2b.partners';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- TRIGGER: tự đánh dấu is_payment_proxy = true khi có partner khác link tới
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION b2b.trg_auto_mark_payment_proxy()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Khi 1 partner ADD/UPDATE payment_proxy_partner_id → mark target as is_payment_proxy
  IF NEW.payment_proxy_partner_id IS NOT NULL THEN
    UPDATE b2b.partners
    SET is_payment_proxy = true
    WHERE id = NEW.payment_proxy_partner_id
      AND (is_payment_proxy IS NULL OR is_payment_proxy = false);
  END IF;
  -- Khi DELETE proxy link → check còn ai link không, nếu không thì un-mark
  IF TG_OP = 'UPDATE' AND OLD.payment_proxy_partner_id IS NOT NULL
     AND (NEW.payment_proxy_partner_id IS NULL OR NEW.payment_proxy_partner_id <> OLD.payment_proxy_partner_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM b2b.partners
      WHERE payment_proxy_partner_id = OLD.payment_proxy_partner_id AND id <> NEW.id
    ) THEN
      UPDATE b2b.partners SET is_payment_proxy = false WHERE id = OLD.payment_proxy_partner_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_b2b_partners_auto_proxy ON b2b.partners;
CREATE TRIGGER trg_b2b_partners_auto_proxy
  AFTER INSERT OR UPDATE OF payment_proxy_partner_id ON b2b.partners
  FOR EACH ROW EXECUTE FUNCTION b2b.trg_auto_mark_payment_proxy();

COMMENT ON FUNCTION b2b.trg_auto_mark_payment_proxy() IS
  'Auto-set b2b.partners.is_payment_proxy=true khi có partner khác link tới. Un-set nếu không còn ai link.';

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_cols int;
BEGIN
  SELECT count(*) INTO v_cols FROM information_schema.columns
  WHERE table_schema='b2b' AND table_name='partners'
    AND column_name IN ('payment_proxy_partner_id', 'contact_alias_name', 'is_payment_proxy');
  IF v_cols <> 3 THEN
    RAISE EXCEPTION 'Sprint 1.1 FAIL: chỉ có %/3 cột proxy', v_cols;
  END IF;
  RAISE NOTICE 'VERIFY PASS — 3 cột + trigger auto-mark sẵn sàng';
END $$;

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS trg_b2b_partners_auto_proxy ON b2b.partners;
-- DROP FUNCTION IF EXISTS b2b.trg_auto_mark_payment_proxy();
-- ALTER TABLE b2b.partners DROP CONSTRAINT IF EXISTS b2b_partners_no_self_proxy;
-- ALTER TABLE b2b.partners DROP COLUMN IF EXISTS is_payment_proxy;
-- ALTER TABLE b2b.partners DROP COLUMN IF EXISTS contact_alias_name;
-- ALTER TABLE b2b.partners DROP COLUMN IF EXISTS payment_proxy_partner_id;
