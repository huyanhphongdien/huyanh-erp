-- ============================================================================
-- user_saved_views — Lưu view (filters + columns + sort + density) per user
-- Date: 2026-05-09
-- ============================================================================
--
-- Sử dụng: dùng cho Sales Order list (Mức 4-B) — sau này dùng được cho mọi
-- module có table list (B2B, Tasks, Inventory...).
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_saved_views (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  module       TEXT NOT NULL,    -- 'sales_orders' / 'b2b_deals' / 'tasks' / ...
  name         TEXT NOT NULL,    -- "Đơn quá hạn của tôi"
  is_default   BOOLEAN DEFAULT FALSE,
  filters      JSONB DEFAULT '{}'::jsonb,   -- {searchText, statusTab, customerFilter, gradeFilter, dateRange, overdueEtdOnly}
  columns      JSONB DEFAULT '{}'::jsonb,   -- {hiddenCols: [...]}
  sort         JSONB DEFAULT '{}'::jsonb,   -- {sortBy, sortOrder}
  density      TEXT DEFAULT 'normal',       -- compact/normal/comfortable
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, module, name)
);

CREATE INDEX IF NOT EXISTS idx_user_saved_views_user_module
  ON user_saved_views(user_id, module);

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE user_saved_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users see their own views" ON user_saved_views;
CREATE POLICY "users see their own views" ON user_saved_views
  FOR ALL
  USING (
    user_id IN (SELECT id FROM employees WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    user_id IN (SELECT id FROM employees WHERE auth_user_id = auth.uid())
  );

-- Reload schema cache
NOTIFY pgrst, 'reload schema';

-- ── Verify ───────────────────────────────────────────────────────────────
SELECT 'user_saved_views created' AS status,
       (SELECT COUNT(*) FROM information_schema.columns
        WHERE table_name = 'user_saved_views') AS column_count;
