-- List 9 FKs blocking phase 3 drop
SELECT
  tc.table_schema || '.' || tc.table_name AS source_table,
  kcu.column_name AS source_col,
  '→' AS arrow,
  ccu.table_schema || '.' || ccu.table_name AS target_table,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_schema = 'b2b'
  AND ccu.table_name IN (
    'supplier_offers','purchase_demands','quotations','demand_invitations',
    'intake_records','intake_sessions','intake_disputes','intake_logs',
    'production_schedules','production_slots','slot_bookings','supervisor_checkins'
  )
ORDER BY ccu.table_name, tc.table_name;
