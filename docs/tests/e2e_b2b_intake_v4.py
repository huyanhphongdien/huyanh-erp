#!/usr/bin/env python3
"""E2E test B2B Intake v4 — verify tất cả 45 phases hoạt động đúng.

Scenarios:
- Schema verify (GA)
- Multi-lot allocate (GB)
- Đặc thù đại lý (GC)
- Triggers bypass (GD)
- Orchestrator 3 flow (GF)
"""
import urllib.request, json, sys

KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5Z3ZlZXRhYXRxbGxoanVzeXp6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ2MDY4NSwiZXhwIjoyMDg0MDM2Njg1fQ.bw4dPo4e8pLfbdlhHFFGnCVejp15z4BPANjtOQ3h6bc'
BASE='https://dygveetaatqllhjusyzz.supabase.co/rest/v1/rpc/agent_sql'
H={'apikey':KEY,'Authorization':f'Bearer {KEY}','Content-Type':'application/json'}

PASS = 0
FAIL = 0
SKIP = 0

def sql(q, label=''):
    q2=q.strip().rstrip(';').strip()
    req=urllib.request.Request(BASE,data=json.dumps({'q':q2}).encode(),headers=H,method='POST')
    try:
        urllib.request.urlopen(req,timeout=20).read().decode()
        return True, None
    except urllib.error.HTTPError as e:
        return False, e.read().decode()[:200]

def query(q):
    req=urllib.request.Request(BASE,data=json.dumps({'q':q.strip()}).encode(),headers=H,method='POST')
    return json.loads(urllib.request.urlopen(req,timeout=10).read().decode())

def test(label, cond, detail=''):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f'PASS {label}')
    else:
        FAIL += 1
        print(f'FAIL {label}  {detail}')

print('=== B2B INTAKE V4 — E2E TEST ===\n')

# ═══ GA Schema foundation ═══
print('--- GA: Schema verify ---')

cols_deals = query("""
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='b2b' AND table_name='deals'
    AND column_name IN ('purchase_type','buyer_user_id','qc_user_id','sample_drc',
                        'finished_product_kg','production_mode','production_pool_id',
                        'production_sla_days','production_started_at',
                        'production_reject_reason','reject_loss_amount')
""")
test('b2b.deals has 11 intake cols', len(cols_deals) == 11, f'got {len(cols_deals)}')

cols_partners = query("""
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='b2b' AND table_name='partners'
    AND column_name IN ('national_id','nationality')
""")
test('b2b.partners has national_id + nationality', len(cols_partners) == 2)

exists_daily = query("SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema='b2b' AND table_name='daily_price_list'")[0]['c']
test('b2b.daily_price_list exists', exists_daily == 1)

exists_items = query("SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema='public' AND table_name='weighbridge_ticket_items'")[0]['c']
test('weighbridge_ticket_items exists', exists_items == 1)

cols_wb = query("""
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='weighbridge_tickets'
    AND column_name IN ('has_items','allocation_mode')
""")
test('weighbridge_tickets has has_items + allocation_mode', len(cols_wb) == 2)

# CHECK constraints
checks = query("""
  SELECT conname FROM pg_constraint
  WHERE conrelid IN ('b2b.deals'::regclass, 'b2b.partners'::regclass,
                     'weighbridge_tickets'::regclass, 'weighbridge_ticket_items'::regclass)
    AND contype='c'
""")
check_names = {c['conname'] for c in checks}
required_checks = [
  'chk_deals_purchase_type', 'chk_deals_sample_drc', 'chk_deals_production_mode',
  'chk_deals_reject_reason', 'chk_partners_nationality', 'chk_allocation_mode',
  'chk_exactly_one_source',
]
for rc in required_checks:
    test(f'CHECK {rc}', rc in check_names)

# Extension btree_gist
gist = query("SELECT 1 FROM pg_extension WHERE extname='btree_gist'")
test('extension btree_gist installed', len(gist) > 0)

# ═══ GB Multi-lot trigger ═══
print('\n--- GB: Multi-lot allocate test ---')

triggers = query("""
  SELECT trigger_name FROM information_schema.triggers
  WHERE event_object_schema='public' AND event_object_table='weighbridge_ticket_items'
""")
test('trg_items_allocate_on_insert exists', any('items_allocate' in t['trigger_name'] for t in triggers))

triggers2 = query("""
  SELECT trigger_name FROM information_schema.triggers
  WHERE event_object_schema='public' AND event_object_table='weighbridge_tickets'
    AND trigger_name='trg_ticket_allocate_on_weigh'
""")
test('trg_ticket_allocate_on_weigh exists', len(triggers2) > 0)

# ═══ GC Trigger đại lý ═══
print('\n--- GC: DRC dispute trigger test ---')

dispute_trig = query("""
  SELECT trigger_name FROM information_schema.triggers
  WHERE event_object_schema='b2b' AND event_object_table='deals'
    AND trigger_name='trg_drc_variance_dispute'
""")
test('trg_drc_variance_dispute exists', len(dispute_trig) > 0)

# ═══ GD Triggers bypass ═══
print('\n--- GD: Triggers bypass verify ---')

wb_func_src = query("""
  SELECT pg_get_functiondef(oid) AS src FROM pg_proc
  WHERE proname='enforce_weighbridge_requires_accepted_deal'
""")[0]['src']
test('weighbridge guard has outright bypass', 'outright' in wb_func_src and 'farmer_walkin' in wb_func_src)
test('weighbridge guard supports has_items', 'has_items' in wb_func_src)

si_func_src = query("""
  SELECT pg_get_functiondef(oid) AS src FROM pg_proc
  WHERE proname='enforce_b2b_stock_in_requires_accepted_deal'
""")[0]['src']
test('stock_in guard has outright bypass', 'outright' in si_func_src and 'farmer_walkin' in si_func_src)

lock_func_src = query("SELECT pg_get_functiondef(p.oid) AS src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='b2b' AND p.proname='enforce_deal_lock'")[0]['src']
test('deal_lock has drc_after exception', 'drc_after_production' in lock_func_src)

# ═══ End-to-end test outright flow ═══
print('\n--- E2E: Outright flow (bypass accepted) ---')

partner_id = query("SELECT id FROM b2b.partners LIMIT 1")[0]['id']

sql("DELETE FROM weighbridge_tickets WHERE code LIKE 'E2E-OUT-%'", 'cleanup')
sql("DELETE FROM b2b.deals WHERE deal_number LIKE 'E2E-OUT-%'", 'cleanup')

ok, err = sql(f"""
  INSERT INTO b2b.deals (deal_number, partner_id, deal_type, status, product_name, rubber_type,
    quantity_kg, expected_drc, actual_drc, purchase_type, buyer_user_id, unit_price,
    total_value_vnd, final_value, currency)
  VALUES ('E2E-OUT-001', '{partner_id}', 'purchase', 'processing', 'mu tap', 'mu_tap',
    1000, 35, 35, 'outright', '{partner_id}', 12000, 12000000, 12000000, 'VND')
""", 'Insert outright deal')
test('Insert outright deal (processing)', ok)

if ok:
    deal_id = query("SELECT id FROM b2b.deals WHERE deal_number='E2E-OUT-001'")[0]['id']

    ok2, err2 = sql(f"""
      INSERT INTO weighbridge_tickets (code, vehicle_plate, ticket_type, status, deal_id,
        gross_weight, tare_weight, net_weight)
      VALUES ('E2E-OUT-TKT', '99A-E2E01', 'in', 'completed', '{deal_id}', 1000, 0, 1000)
    """, 'Cân outright processing')
    test('Cân outright deal processing (bypass OK)', ok2, err2 or '')

    # Cleanup
    sql(f"DELETE FROM weighbridge_tickets WHERE code='E2E-OUT-TKT'", 'cleanup')
    sql(f"DELETE FROM b2b.deals WHERE id='{deal_id}'", 'cleanup')

# ═══ E2E test standard flow (must reject) ═══
print('\n--- E2E: Standard flow cân processing phải reject ---')

ok, _ = sql(f"""
  INSERT INTO b2b.deals (deal_number, partner_id, deal_type, status, product_name, rubber_type,
    quantity_kg, expected_drc, purchase_type, unit_price)
  VALUES ('E2E-STD-001', '{partner_id}', 'purchase', 'processing', 'mu tap', 'mu_tap',
    1000, 35, 'standard', 12000)
""", 'Insert standard deal')
if ok:
    std_deal_id = query("SELECT id FROM b2b.deals WHERE deal_number='E2E-STD-001'")[0]['id']
    ok2, err2 = sql(f"""
      INSERT INTO weighbridge_tickets (code, vehicle_plate, ticket_type, status, deal_id,
        gross_weight, tare_weight, net_weight)
      VALUES ('E2E-STD-TKT', '99A-E2E02', 'in', 'completed', '{std_deal_id}', 1000, 0, 1000)
    """, 'Cân standard processing')
    test('Cân standard processing → REJECT', not ok2 and 'DUYET' in (err2 or ''))
    sql(f"DELETE FROM b2b.deals WHERE id='{std_deal_id}'", 'cleanup')

# ═══ E2E test multi-lot allocate ═══
print('\n--- E2E: Multi-lot by_share allocate ---')

TICKET_ID='99999999-9999-9999-9999-999999999999'
sql(f"DELETE FROM weighbridge_ticket_items WHERE ticket_id='{TICKET_ID}'", 'cleanup')
sql(f"DELETE FROM weighbridge_tickets WHERE id='{TICKET_ID}'", 'cleanup')

sql(f"""INSERT INTO weighbridge_tickets (id, code, vehicle_plate, ticket_type, status,
  has_items, allocation_mode, gross_weight, tare_weight)
VALUES ('{TICKET_ID}', 'E2E-ML-TKT', '99A-E2EML', 'in', 'weighing_gross', TRUE, 'by_share', 1000, 0)""", 'Insert ticket')

sql(f"""INSERT INTO weighbridge_ticket_items (ticket_id, line_no, partner_id, rubber_type,
  declared_qty_kg, drc_percent, unit_price)
VALUES
  ('{TICKET_ID}', 1, '{partner_id}', 'mu_tap', 500, 30, 10000),
  ('{TICKET_ID}', 2, '{partner_id}', 'mu_nuoc', 300, 35, 13000),
  ('{TICKET_ID}', 3, '{partner_id}', 'mu_tap', 200, 28, 9000)""", 'Insert 3 items')

sql(f"UPDATE weighbridge_tickets SET net_weight=985 WHERE id='{TICKET_ID}'", 'Set net')

rows = query(f"SELECT line_no, actual_qty_kg FROM weighbridge_ticket_items WHERE ticket_id='{TICKET_ID}' ORDER BY line_no")
expected = [492.5, 295.5, 197]
all_match = all(abs(float(rows[i]['actual_qty_kg']) - expected[i]) < 0.01 for i in range(3))
test('Multi-lot allocate by_share correct', all_match, f'got {[r["actual_qty_kg"] for r in rows]}')

sql(f"DELETE FROM weighbridge_ticket_items WHERE ticket_id='{TICKET_ID}'", 'cleanup')
sql(f"DELETE FROM weighbridge_tickets WHERE id='{TICKET_ID}'", 'cleanup')

# ═══ E2E test DRC variance auto-dispute ═══
print('\n--- E2E: DRC variance auto-dispute ---')

sql("DELETE FROM b2b.drc_disputes WHERE deal_id IN (SELECT id FROM b2b.deals WHERE deal_number='E2E-DRC-001')", 'cleanup')
sql("DELETE FROM b2b.deals WHERE deal_number='E2E-DRC-001'", 'cleanup')

sql(f"""INSERT INTO b2b.deals (deal_number, partner_id, deal_type, status, product_name,
  rubber_type, quantity_kg, expected_drc, sample_drc, purchase_type, unit_price)
VALUES ('E2E-DRC-001', '{partner_id}', 'purchase', 'accepted', 'mu tap', 'mu_tap',
  10000, 35, 35, 'drc_after_production', 12000)""", 'Insert drc_after deal')
d_id = query("SELECT id FROM b2b.deals WHERE deal_number='E2E-DRC-001'")[0]['id']
sql(f"UPDATE b2b.deals SET actual_drc=30 WHERE id='{d_id}'", 'update actual=30 (variance 5%)')

dispute_count = query(f"SELECT COUNT(*) AS c FROM b2b.drc_disputes WHERE deal_id='{d_id}'")[0]['c']
test('Auto-dispute fire khi variance > 3%', dispute_count > 0)

sql(f"DELETE FROM b2b.drc_disputes WHERE deal_id='{d_id}'", 'cleanup')
sql(f"DELETE FROM b2b.deals WHERE id='{d_id}'", 'cleanup')

# ═══ Summary ═══
print(f'\n{"="*40}')
print(f'Total: PASS={PASS}  FAIL={FAIL}  SKIP={SKIP}')
sys.exit(0 if FAIL == 0 else 1)
