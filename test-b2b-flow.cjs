const{createClient}=require('@supabase/supabase-js')
const s=createClient('https://dygveetaatqllhjusyzz.supabase.co','sb_publishable_TmhOgRteyuVScb3v114oNw_UrZ_OKKQ')

async function test() {
  console.log('=== SIMULATE FULL B2B FLOW ===\n')
  const ts = Date.now().toString(36)

  const dealId = '8aa074ad-e4a7-491f-9ca5-b534bcfa1214'
  const partnerId = '11111111-aaaa-1111-1111-000000000006'

  const {data: deal} = await s.from('b2b_deals').select('*').eq('id', dealId).single()
  if (!deal) { console.log('Deal not found!'); return }
  console.log('Deal:', deal.deal_number, deal.product_name, deal.quantity_kg+'kg', deal.unit_price+'d/kg', 'price_unit:', deal.price_unit)

  // Step 1: Weighbridge
  console.log('\n--- Step 1: Weighbridge ---')
  const {data: ticket, error: tErr} = await s.from('weighbridge_tickets').insert({
    code: `CX-TEST-${ts}`, vehicle_plate: `75C-T${ts}`, driver_name: 'Test Driver',
    ticket_type: 'in', status: 'completed', gross_weight: 12500, tare_weight: 3200, net_weight: 9300,
    deal_id: dealId, partner_id: partnerId, rubber_type: 'mu_nuoc', supplier_name: 'Test NCC',
    gross_weighed_at: new Date().toISOString(), tare_weighed_at: new Date().toISOString(), completed_at: new Date().toISOString(),
  }).select('id,code').single()
  if(tErr) { console.log('ERR:', tErr.message); return }
  console.log('OK:', ticket.code, 'NET=9,300kg')

  // Step 2: Stock-In
  console.log('\n--- Step 2: Stock-In ---')
  const {data: wh} = await s.from('warehouses').select('id').limit(1).single()
  const {data: si, error: siErr} = await s.from('stock_in_orders').insert({
    code: `NK-TEST-${ts}`, type: 'raw', warehouse_id: wh.id, source_type: 'purchase',
    deal_id: dealId, status: 'confirmed', total_quantity: 1, total_weight: 9300, confirmed_at: new Date().toISOString(),
  }).select('id,code').single()
  if(siErr) { console.log('ERR:', siErr.message); return }
  console.log('OK:', si.code, '9,300kg')

  // Step 3: Batch + Detail
  console.log('\n--- Step 3: Batch ---')
  const {data: mat} = await s.from('materials').select('id').limit(1).single()
  const {data: batch, error: bErr} = await s.from('stock_batches').insert({
    batch_no: `LOT-TEST-${ts}`, material_id: mat?.id, warehouse_id: wh.id,
    initial_quantity: 1, quantity_remaining: 1, initial_weight: 9300, current_weight: 9300,
    initial_drc: 31.5, latest_drc: 31.5, qc_status: 'pending', status: 'active', rubber_type: 'mu_nuoc',
  }).select('id,batch_no').single()
  if(bErr) { console.log('ERR:', bErr.message); return }
  await s.from('stock_in_details').insert({ stock_in_id: si.id, material_id: mat?.id, batch_id: batch.id, quantity: 1, weight: 9300, drc_value: 31.5 })
  console.log('OK:', batch.batch_no)

  // Step 4: Deal totals
  console.log('\n--- Step 4: Update Deal ---')
  await s.from('b2b_deals').update({ stock_in_count: 1, actual_weight_kg: 9300, updated_at: new Date().toISOString() }).eq('id', dealId)
  console.log('OK: stock_in_count=1, weight=9300')

  // Step 5: QC
  console.log('\n--- Step 5: QC ---')
  await s.from('batch_qc_results').insert({ batch_id: batch.id, drc_value: 33.2, result: 'passed', test_type: 'recheck', tested_at: new Date().toISOString() })
  await s.from('stock_batches').update({ latest_drc: 33.2, qc_status: 'passed' }).eq('id', batch.id)
  const finalValue = Math.round(9300 * 35000) // wet price: weight x price
  await s.from('b2b_deals').update({ actual_drc: 33.2, final_value: finalValue, qc_status: 'passed', updated_at: new Date().toISOString() }).eq('id', dealId)
  console.log('OK: DRC=33.2%, final_value=' + finalValue.toLocaleString())

  // Step 6: Advance
  console.log('\n--- Step 6: Advance 100M ---')
  const advAmt = 100000000
  const {data: adv, error: aErr} = await s.from('b2b_advances').insert({
    deal_id: dealId, partner_id: partnerId, advance_number: `TU-TEST-${ts}`,
    amount: advAmt, amount_vnd: advAmt, currency: 'VND', payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'bank_transfer', status: 'paid', paid_at: new Date().toISOString(),
  }).select('id,advance_number').single()
  if(aErr) { console.log('ERR:', aErr.message); return }
  const today = new Date().toISOString().split('T')[0]
  const month = new Date().getMonth() + 1
  const year = new Date().getFullYear()
  await s.from('b2b_partner_ledger').insert({
    partner_id: partnerId, entry_type: 'advance', reference_type: 'advance', reference_id: adv.id,
    description: 'Tam ung ' + adv.advance_number, debit: 0, credit: advAmt, entry_date: today, period_month: month, period_year: year,
  })
  console.log('OK: CREDIT', advAmt.toLocaleString())

  // Step 7: Settlement
  console.log('\n--- Step 7: Settlement ---')
  const balance = finalValue - advAmt
  // Check settlement table structure
  const {data: stl, error: sErr} = await s.from('b2b_settlements').insert({
    code: `QT-TEST-${ts}`, deal_id: dealId, partner_id: partnerId, settlement_type: 'purchase',
    status: 'approved', total_advance: advAmt, approved_at: new Date().toISOString(),
    created_by: '81fb3546-db87-4d0d-a94b-dea5aef4563e',
  }).select('id,code').single()
  if(sErr) { console.log('ERR:', sErr.message); return }
  await s.from('b2b_partner_ledger').insert({
    partner_id: partnerId, entry_type: 'settlement', reference_type: 'settlement', reference_id: stl.id,
    description: 'Quyet toan ' + stl.code, debit: finalValue, credit: 0, entry_date: today, period_month: month, period_year: year,
  })
  console.log('OK: DEBIT', finalValue.toLocaleString(), '| Balance:', balance.toLocaleString())

  // Step 8: Payment
  console.log('\n--- Step 8: Payment ---')
  await s.from('b2b_settlements').update({ status: 'paid', paid_at: new Date().toISOString(), payment_method: 'bank_transfer', bank_reference: 'CK-TEST-001' }).eq('id', stl.id)
  await s.from('b2b_partner_ledger').insert({
    partner_id: partnerId, entry_type: 'payment', reference_type: 'settlement', reference_id: stl.id,
    description: 'Thanh toan ' + stl.code, debit: 0, credit: balance, entry_date: today, period_month: month, period_year: year,
  })
  console.log('OK: CREDIT', balance.toLocaleString())

  // Step 9: Deal settled
  await s.from('b2b_deals').update({ status: 'settled' }).eq('id', dealId)
  console.log('\nDeal -> settled')

  // VERIFY
  console.log('\n========== VERIFY ==========')
  const {data: entries} = await s.from('b2b_partner_ledger').select('entry_type,debit,credit,description').eq('partner_id', partnerId).order('created_at')
  let tD = 0, tC = 0
  if(entries) {
    entries.forEach(l => {
      tD += l.debit || 0
      tC += l.credit || 0
      const d = (l.debit||0).toLocaleString().padStart(15)
      const c = (l.credit||0).toLocaleString().padStart(15)
      console.log(l.entry_type.padEnd(12), 'D:'+d, 'C:'+c, '|', (l.description||'').substring(0,50))
    })
    console.log('-'.repeat(80))
    console.log('TOTAL'.padEnd(12), 'D:'+tD.toLocaleString().padStart(15), 'C:'+tC.toLocaleString().padStart(15))
    const bal = tD - tC
    console.log('\nBALANCE:', bal.toLocaleString(), 'VND')
    console.log(bal === 0 ? '\n✅ CONG NO CAN BANG = 0' : '\n⚠️ CONG NO KHONG CAN BANG: ' + bal.toLocaleString())
  }
  console.log('\n=== DONE ===')
}
test()
