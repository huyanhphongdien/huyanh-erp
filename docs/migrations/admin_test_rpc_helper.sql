-- ============================================================================
-- ADMIN TEST RPC — Helper để agent chạy SQL qua REST API
-- PASTE vào Supabase Dashboard > SQL Editor và RUN để kích hoạt.
--
-- Upgraded: accept DDL/DML + SELECT/WITH (phân biệt qua prefix).
-- Sau khi audit xong: DROP FUNCTION public.agent_sql(text);
-- ============================================================================

CREATE OR REPLACE FUNCTION public.agent_sql(q text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, b2b, pg_temp
AS $$
DECLARE
  result jsonb;
  q_trim text;
BEGIN
  q_trim := trim(BOTH E' \t\r\n' FROM q);

  -- SELECT / WITH → return rows as JSON
  IF lower(q_trim) LIKE 'select%' OR lower(q_trim) LIKE 'with%' THEN
    EXECUTE 'SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (' || q_trim || ') t'
    INTO result;
    RETURN result;
  END IF;

  -- DDL / DML / DO block → execute + return status
  EXECUTE q_trim;
  RETURN jsonb_build_object('ok', true, 'cmd', left(q_trim, 80));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.agent_sql(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_sql(text) TO service_role;

NOTIFY pgrst, 'reload schema';
