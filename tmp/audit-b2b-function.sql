-- ============================================================================
-- Tạo RPC function `audit_b2b_schema()` — chỉ cần chạy 1 lần
-- Sau đó tôi call REST: POST /rest/v1/rpc/audit_b2b_schema → trả JSON đầy đủ
-- Function read-only, không sửa data/schema
-- ============================================================================

CREATE OR REPLACE FUNCTION public.audit_b2b_schema()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(

    -- Q1: schema b2b objects
    'b2b_objects', (
      SELECT jsonb_agg(jsonb_build_object(
        'name', c.relname,
        'kind', CASE c.relkind
          WHEN 'r' THEN 'TABLE'
          WHEN 'v' THEN 'VIEW'
          WHEN 'm' THEN 'MATERIALIZED VIEW'
          WHEN 'f' THEN 'FOREIGN TABLE'
          ELSE c.relkind::text
        END
      ) ORDER BY c.relname)
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'b2b' AND c.relkind IN ('r','v','m','f')
    ),

    -- Q2: public B2B-related objects
    'public_objects', (
      SELECT jsonb_agg(jsonb_build_object(
        'name', c.relname,
        'kind', CASE c.relkind
          WHEN 'r' THEN 'TABLE'
          WHEN 'v' THEN 'VIEW'
          WHEN 'm' THEN 'MATERIALIZED VIEW'
          ELSE c.relkind::text
        END
      ) ORDER BY c.relname)
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND (c.relname LIKE 'b2b_%' OR c.relname IN ('deals','rubber_intake_batches','supplier_offers','partners','demands'))
        AND c.relkind IN ('r','v','m')
    ),

    -- Q3: view definitions (public.b2b_*)
    'view_definitions', (
      SELECT jsonb_object_agg(
        table_name,
        pg_get_viewdef(format('public.%I', table_name)::regclass, true)
      )
      FROM information_schema.views
      WHERE table_schema = 'public' AND table_name LIKE 'b2b_%'
    ),

    -- Q4: FK constraints
    'fk_constraints', (
      SELECT jsonb_agg(jsonb_build_object(
        'source_table', tc.table_schema || '.' || tc.table_name,
        'source_col', kcu.column_name,
        'target_table', ccu.table_schema || '.' || ccu.table_name,
        'target_col', ccu.column_name,
        'constraint', tc.constraint_name
      ) ORDER BY tc.table_schema, tc.table_name, kcu.column_name)
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND (
          tc.table_name IN ('deals','b2b_deals','supplier_offers','b2b_demand_offers',
                            'partners','b2b_partners','rubber_intake_batches','b2b_demands',
                            'demands','b2b_chat_rooms','chat_rooms','b2b_chat_messages',
                            'chat_messages','b2b_advances','advances','b2b_settlements','settlements')
          OR ccu.table_name IN ('deals','b2b_deals','supplier_offers','b2b_demand_offers',
                                'partners','b2b_partners','rubber_intake_batches','b2b_demands','demands')
        )
    ),

    -- Q5: CHECK constraints (status enums)
    'check_constraints', (
      SELECT jsonb_agg(jsonb_build_object(
        'table', con.conrelid::regclass::text,
        'name', con.conname,
        'def', pg_get_constraintdef(con.oid, true)
      ) ORDER BY con.conrelid::regclass::text, con.conname)
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE con.contype = 'c'
        AND (n.nspname = 'b2b'
             OR (n.nspname = 'public' AND c.relname IN (
               'deals','b2b_deals','supplier_offers','b2b_demand_offers',
               'b2b_demands','demands','b2b_advances','b2b_settlements'
             )))
    ),

    -- Q6: realtime publication
    'realtime_publication', (
      SELECT jsonb_agg(jsonb_build_object('schema', schemaname, 'table', tablename) ORDER BY schemaname, tablename)
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND (schemaname IN ('b2b','public'))
    )

  ) INTO result;

  RETURN result;
END;
$$;

-- Cấp quyền cho service_role và authenticated user gọi function
GRANT EXECUTE ON FUNCTION public.audit_b2b_schema() TO service_role, authenticated, anon;
