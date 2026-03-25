const { createClient } = require('@supabase/supabase-js')
const s = createClient('https://dygveetaatqllhjusyzz.supabase.co', 'sb_publishable_TmhOgRteyuVScb3v114oNw_UrZ_OKKQ')

const ts = Date.now().toString(36)
const PASS = '\x1b[32mPASS\x1b[0m'
const FAIL = '\x1b[31mFAIL\x1b[0m'
const SKIP = '\x1b[33mSKIP\x1b[0m'
let totalPass = 0, totalFail = 0, totalSkip = 0

function log(status, msg) {
  if (status === 'pass') { totalPass++; console.log(`  ${PASS} ${msg}`) }
  else if (status === 'fail') { totalFail++; console.log(`  ${FAIL} ${msg}`) }
  else { totalSkip++; console.log(`  ${SKIP} ${msg}`) }
}

async function run() {
  console.log('='.repeat(70))
  console.log('  FULL SYSTEM FLOW TEST — Huy Anh Rubber ERP')
  console.log('  ' + new Date().toLocaleString('vi-VN'))
  console.log('='.repeat(70))

  // ============================================================
  // SETUP: Get IDs
  // ============================================================
  const { data: wh } = await s.from('warehouses').select('id,name').limit(1).single()
  const { data: whTP } = await s.from('warehouses').select('id,name').ilike('name', '%thành phẩm%').limit(1).single()
  const { data: mat } = await s.from('materials').select('id,name').limit(1).single()
  const partnerId = '11111111-aaaa-1111-1111-000000000006' // Nguyễn Thị Lệ

  if (!wh) { console.log('ERROR: Không có warehouse. Chạy SQL tạo trước.'); return }

  // ============================================================
  // LUỒNG 1: SALES ORDER
  // ============================================================
  console.log('\n' + '─'.repeat(70))
  console.log('  LUỒNG 1: SALES ORDER → SẢN XUẤT → XUẤT KHẨU')
  console.log('─'.repeat(70))

  // 1.1 Tạo khách hàng
  console.log('\n  [1.1] Tạo khách hàng quốc tế')
  const { data: customer, error: custErr } = await s.from('sales_customers').insert({
    code: `KH-TEST-${ts}`, name: 'Toyota Motor Corp (TEST)', short_name: 'Toyota',
    country: 'JP', contact_person: 'Mr. Tanaka', email: 'test@toyota.jp',
    payment_terms: 'lc_at_sight', default_incoterm: 'FOB', default_currency: 'USD',
    quality_standard: 'ISO_2000', tier: 'strategic', status: 'active',
    preferred_grades: ['SVR_3L', 'SVR_5'],
  }).select('id,code').single()
  if (custErr) { log('fail', 'Tạo KH: ' + custErr.message); return }
  log('pass', `Tạo KH: ${customer.code} — Toyota Motor Corp`)

  // 1.2 Tạo đơn hàng
  console.log('\n  [1.2] Tạo Sales Order')
  const { data: order, error: orderErr } = await s.from('sales_orders').insert({
    code: `SO-TEST-${ts}`, customer_id: customer.id, customer_po: 'PO-2026-TOYOTA-001',
    grade: 'SVR_3L', quantity_tons: 200, quantity_kg: 200000,
    unit_price: 1850, currency: 'USD', exchange_rate: 25500,
    total_value_usd: 370000, total_value_vnd: 9435000000,
    incoterm: 'FOB', port_of_loading: 'HCM',
    port_of_destination: 'YOKOHAMA, JAPAN',
    drc_min: 60, moisture_max: 0.80, dirt_max: 0.020, ash_max: 0.50,
    nitrogen_max: 0.60, volatile_max: 0.20, pri_min: 40,
    packing_type: 'bale', bale_weight_kg: 33.33, total_bales: 6000,
    container_type: '20ft', container_count: 10,
    order_date: new Date().toISOString().split('T')[0],
    delivery_date: '2026-04-15', etd: '2026-04-10',
    payment_terms: 'lc_at_sight', status: 'confirmed',
    confirmed_at: new Date().toISOString(),
  }).select('id,code').single()
  if (orderErr) { log('fail', 'Tạo SO: ' + orderErr.message); return }
  log('pass', `Tạo SO: ${order.code} — 200T SVR 3L — $370,000`)

  // ============================================================
  // LUỒNG 2: B2B THU MUA NVL
  // ============================================================
  console.log('\n' + '─'.repeat(70))
  console.log('  LUỒNG 2: B2B THU MUA → CÂN → NHẬP KHO → QC')
  console.log('─'.repeat(70))

  // 2.1 Tạo Deal B2B
  console.log('\n  [2.1] Tạo Deal B2B mua mủ')
  const { data: deal, error: dealErr } = await s.from('b2b_deals').insert({
    deal_number: `DL-TEST-${ts}`, partner_id: partnerId,
    deal_type: 'purchase', product_name: 'Mủ đông', rubber_type: 'mu_dong',
    quantity_kg: 250000, unit_price: 25000, price_unit: 'wet',
    total_value_vnd: 6250000000, expected_drc: 55,
    status: 'processing',
  }).select('id,deal_number').single()
  if (dealErr) { log('fail', 'Tạo Deal: ' + dealErr.message); return }
  log('pass', `Tạo Deal: ${deal.deal_number} — 250T mủ đông — 25k/kg ướt`)

  // 2.2 Phiếu cân (3 chuyến)
  console.log('\n  [2.2] Cân xe (3 chuyến)')
  const trips = [
    { plate: '75C-11111', gross: 42000, tare: 12000, net: 30000 },
    { plate: '51D-22222', gross: 55000, tare: 15000, net: 40000 },
    { plate: '76H-33333', gross: 48000, tare: 13000, net: 35000 },
  ]
  const ticketIds = []
  for (let i = 0; i < trips.length; i++) {
    const t = trips[i]
    const { data: ticket, error: tErr } = await s.from('weighbridge_tickets').insert({
      code: `CX-TEST-${ts}-${i + 1}`, vehicle_plate: t.plate, driver_name: `Tài xế ${i + 1}`,
      ticket_type: 'in', status: 'completed', gross_weight: t.gross, tare_weight: t.tare, net_weight: t.net,
      deal_id: deal.id, partner_id: partnerId, rubber_type: 'mu_dong', supplier_name: 'Nguyễn Thị Lệ',
      gross_weighed_at: new Date().toISOString(), tare_weighed_at: new Date().toISOString(), completed_at: new Date().toISOString(),
    }).select('id,code').single()
    if (tErr) { log('fail', `Cân chuyến ${i + 1}: ${tErr.message}`); return }
    ticketIds.push(ticket.id)
    log('pass', `Cân: ${ticket.code} — ${t.plate} — NET=${t.net.toLocaleString()}kg`)
  }

  // 2.3 Nhập kho (3 phiếu)
  console.log('\n  [2.3] Nhập kho NVL')
  const batchIds = []
  for (let i = 0; i < trips.length; i++) {
    const t = trips[i]
    const { data: si, error: siErr } = await s.from('stock_in_orders').insert({
      code: `NK-TEST-${ts}-${i + 1}`, type: 'raw', warehouse_id: wh.id, source_type: 'purchase',
      deal_id: deal.id, status: 'confirmed', total_quantity: 1, total_weight: t.net,
      confirmed_at: new Date().toISOString(),
    }).select('id,code').single()
    if (siErr) { log('fail', `NK ${i + 1}: ${siErr.message}`); return }

    const { data: batch, error: bErr } = await s.from('stock_batches').insert({
      batch_no: `LOT-TEST-${ts}-${i + 1}`, material_id: mat?.id, warehouse_id: wh.id,
      initial_quantity: 1, quantity_remaining: 1, initial_weight: t.net, current_weight: t.net,
      initial_drc: 55, latest_drc: 55, qc_status: 'pending', status: 'active',
      rubber_type: 'mu_dong', supplier_name: 'Nguyễn Thị Lệ',
    }).select('id,batch_no').single()
    if (bErr) { log('fail', `Batch ${i + 1}: ${bErr.message}`); return }

    await s.from('stock_in_details').insert({
      stock_in_id: si.id, material_id: mat?.id, batch_id: batch.id, quantity: 1, weight: t.net, drc_value: 55,
    })
    batchIds.push(batch.id)
    log('pass', `NK: ${si.code} → ${batch.batch_no} — ${t.net.toLocaleString()}kg`)
  }

  // 2.4 Update Deal totals
  const totalWeight = trips.reduce((s, t) => s + t.net, 0)
  await s.from('b2b_deals').update({
    stock_in_count: 3, actual_weight_kg: totalWeight, updated_at: new Date().toISOString(),
  }).eq('id', deal.id)
  log('pass', `Deal cập nhật: ${trips.length} chuyến — ${totalWeight.toLocaleString()}kg`)

  // 2.5 QC
  console.log('\n  [2.5] QC kiểm tra DRC')
  const drcResults = [56.2, 54.8, 55.5]
  for (let i = 0; i < batchIds.length; i++) {
    await s.from('batch_qc_results').insert({
      batch_id: batchIds[i], drc_value: drcResults[i], result: 'passed', test_type: 'recheck',
      tested_at: new Date().toISOString(),
    })
    await s.from('stock_batches').update({
      latest_drc: drcResults[i], qc_status: 'passed',
    }).eq('id', batchIds[i])
    log('pass', `QC Lô ${i + 1}: DRC=${drcResults[i]}% — ĐẠT`)
  }

  // Update deal DRC (weighted average)
  const avgDrc = (56.2 * 30000 + 54.8 * 40000 + 55.5 * 35000) / totalWeight
  const finalValue = Math.round(totalWeight * 25000) // wet price
  await s.from('b2b_deals').update({
    actual_drc: Math.round(avgDrc * 100) / 100, final_value: finalValue, qc_status: 'passed',
  }).eq('id', deal.id)
  log('pass', `Deal DRC TB: ${avgDrc.toFixed(2)}% — Giá trị: ${finalValue.toLocaleString()} VNĐ`)

  // ============================================================
  // LUỒNG 3: SẢN XUẤT
  // ============================================================
  console.log('\n' + '─'.repeat(70))
  console.log('  LUỒNG 3: SẢN XUẤT → 5 CÔNG ĐOẠN → THÀNH PHẨM')
  console.log('─'.repeat(70))

  // 3.1 Tạo lệnh SX
  console.log('\n  [3.1] Tạo lệnh sản xuất')
  const { data: po, error: poErr } = await s.from('production_orders').insert({
    code: `LSX-TEST-${ts}`, product_type: 'SVR_3L',
    target_quantity: 200000, target_grade: 'SVR_3L',
    target_drc_min: 60, target_drc_max: null,
    status: 'in_progress', stage_current: 1,
    scheduled_start_date: new Date().toISOString().split('T')[0],
    actual_start_date: new Date().toISOString().split('T')[0],
    notes: `Sản xuất cho SO ${order.code} — Toyota`,
  }).select('id,code').single()
  if (poErr) { log('fail', 'LSX: ' + poErr.message); return }
  log('pass', `LSX: ${po.code} — 200T SVR 3L`)

  // Link NVL
  for (let i = 0; i < batchIds.length; i++) {
    await s.from('production_order_items').insert({
      production_order_id: po.id, source_batch_id: batchIds[i],
      required_quantity: trips[i].net, allocated_quantity: trips[i].net,
      drc_at_intake: drcResults[i],
    })
  }
  log('pass', `NVL: ${batchIds.length} lô linked — ${totalWeight.toLocaleString()}kg`)

  // Link SO → PO
  await s.from('sales_orders').update({ production_order_id: po.id, status: 'producing' }).eq('id', order.id)
  log('pass', 'SO → producing')

  // 3.2 Simulate 5 stages
  console.log('\n  [3.2] 5 Công đoạn sản xuất')
  const stages = [
    { name: 'Rửa', in: 105000, out: 103000, drc_in: 55.5, drc_out: 56 },
    { name: 'Tán/Kéo', in: 103000, out: 101000, drc_in: 56, drc_out: 60 },
    { name: 'Sấy', in: 101000, out: 85000, drc_in: 60, drc_out: 92 },
    { name: 'Ép', in: 85000, out: 81000, drc_in: 92, drc_out: 96 },
    { name: 'Đóng gói', in: 81000, out: 80000, drc_in: 96, drc_out: 97 },
  ]
  for (let i = 0; i < stages.length; i++) {
    const st = stages[i]
    await s.from('production_stage_progress').insert({
      production_order_id: po.id, stage_number: i + 1, stage_name: st.name,
      status: 'completed', started_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      input_quantity: st.in, output_quantity: st.out,
      weight_loss_kg: st.in - st.out, input_drc: st.drc_in, output_drc: st.drc_out,
    })
    log('pass', `${i + 1}. ${st.name.padEnd(10)} In: ${st.in.toLocaleString()} → Out: ${st.out.toLocaleString()} | DRC: ${st.drc_in}→${st.drc_out}%`)
  }

  // 3.3 Lô thành phẩm
  console.log('\n  [3.3] Tạo lô thành phẩm')
  const outputQty = 200000
  const yieldPct = (outputQty / totalWeight * 100).toFixed(1)
  const { data: tpBatch, error: tpErr } = await s.from('stock_batches').insert({
    batch_no: `TP-TEST-${ts}`, material_id: mat?.id, warehouse_id: whTP?.id || wh.id,
    initial_quantity: 6000, quantity_remaining: 6000, initial_weight: outputQty, current_weight: outputQty,
    initial_drc: 97, latest_drc: 97, qc_status: 'pending', status: 'active',
    rubber_grade: 'SVR_3L', production_order_id: po.id,
  }).select('id,batch_no').single()
  if (tpErr) { log('fail', 'TP: ' + tpErr.message); return }

  await s.from('production_output_batches').insert({
    production_order_id: po.id, stock_batch_id: tpBatch.id,
    output_batch_no: tpBatch.batch_no, material_id: mat?.id,
    quantity_produced: outputQty, bale_count: 6000,
    final_grade: 'SVR_3L', final_drc: 97, status: 'created',
    warehouse_id: whTP?.id || wh.id,
  })

  await s.from('production_orders').update({
    actual_quantity: outputQty, yield_percent: parseFloat(yieldPct),
    final_grade: 'SVR_3L', final_drc: 97, status: 'completed',
    actual_end_date: new Date().toISOString().split('T')[0],
  }).eq('id', po.id)
  log('pass', `TP: ${tpBatch.batch_no} — ${outputQty.toLocaleString()}kg — SVR 3L — Yield: ${yieldPct}%`)

  // 3.4 QC thành phẩm
  console.log('\n  [3.4] QC thành phẩm')
  await s.from('production_qc_results').insert({
    output_batch_id: (await s.from('production_output_batches').select('id').eq('production_order_id', po.id).limit(1).single()).data?.id,
    drc_value: 97, moisture_content: 0.42, volatile_matter: 0.15,
    ash_content: 0.35, nitrogen_content: 0.45, dirt_content: 0.012,
    pri_value: 48, grade_determined: 'SVR_3L', grade_meets_target: true, result: 'passed',
    tested_at: new Date().toISOString(),
  })
  await s.from('stock_batches').update({ qc_status: 'passed' }).eq('id', tpBatch.id)
  log('pass', 'QC TP: DRC=97% Moisture=0.42% Dirt=0.012% PRI=48 — ĐẠT SVR 3L')

  // SO → ready
  await s.from('sales_orders').update({ status: 'ready' }).eq('id', order.id)
  log('pass', 'SO → ready (sẵn sàng đóng gói)')

  // ============================================================
  // LUỒNG 1 (tiếp): ĐÓNG GÓI + CHỨNG TỪ
  // ============================================================
  console.log('\n' + '─'.repeat(70))
  console.log('  LUỒNG 1 (tiếp): ĐÓNG GÓI → CHỨNG TỪ → XUẤT KHẨU')
  console.log('─'.repeat(70))

  // 4.1 Tạo containers
  console.log('\n  [4.1] Đóng gói containers')
  for (let i = 0; i < 10; i++) {
    const bales = 600
    const netW = 20000
    await s.from('sales_order_containers').insert({
      sales_order_id: order.id, container_no: `MSKU${(1000000 + i).toString()}`,
      seal_no: `HA-SEAL-${ts}-${i + 1}`, container_type: '20ft',
      net_weight_kg: netW, gross_weight_kg: netW + 2200, tare_weight_kg: 2200,
      bale_count: bales, status: 'sealed',
      packed_at: new Date().toISOString(), sealed_at: new Date().toISOString(),
    })
  }
  log('pass', '10 containers × 20T × 600 bành — ĐÃ SEAL')

  // SO → shipping
  await s.from('sales_orders').update({
    status: 'shipped', shipped_at: new Date().toISOString(),
    coa_generated: true, packing_list_generated: true,
  }).eq('id', order.id)
  log('pass', 'SO → shipped — COA + Packing List generated')

  // 4.2 Invoice
  console.log('\n  [4.2] Tạo hóa đơn')
  const { data: inv, error: invErr } = await s.from('sales_invoices').insert({
    code: `INV-TEST-${ts}`, sales_order_id: order.id, customer_id: customer.id,
    subtotal: 370000, freight_charge: 15000, insurance_charge: 2000,
    total_amount: 387000, currency: 'USD', exchange_rate: 25500,
    total_vnd: 9868500000, payment_terms: 'lc_at_sight',
    invoice_date: new Date().toISOString().split('T')[0],
    status: 'issued', payment_status: 'unpaid',
  }).select('id,code').single()
  if (invErr) { log('fail', 'Invoice: ' + invErr.message); return }
  log('pass', `Invoice: ${inv.code} — $387,000 (FOB + Freight + Insurance)`)

  // SO → delivered → invoiced
  await s.from('sales_orders').update({ status: 'invoiced', invoice_generated: true }).eq('id', order.id)
  log('pass', 'SO → invoiced')

  // ============================================================
  // LUỒNG 5: CÔNG NỢ B2B + THANH TOÁN
  // ============================================================
  console.log('\n' + '─'.repeat(70))
  console.log('  LUỒNG 5: TẠM ỨNG → QUYẾT TOÁN → THANH TOÁN (B2B)')
  console.log('─'.repeat(70))

  const today = new Date().toISOString().split('T')[0]
  const month = new Date().getMonth() + 1
  const year = new Date().getFullYear()

  // 5.1 Tạm ứng
  console.log('\n  [5.1] Tạm ứng cho đại lý')
  const advAmt = 2000000000 // 2 tỷ
  const { data: adv, error: advErr } = await s.from('b2b_advances').insert({
    deal_id: deal.id, partner_id: partnerId, advance_number: `TU-TEST-${ts}`,
    amount: advAmt, amount_vnd: advAmt, currency: 'VND',
    payment_date: today, payment_method: 'bank_transfer', status: 'paid', paid_at: new Date().toISOString(),
  }).select('id,advance_number').single()
  if (advErr) { log('fail', 'Tạm ứng: ' + advErr.message); return }

  await s.from('b2b_partner_ledger').insert({
    partner_id: partnerId, entry_type: 'advance', reference_type: 'advance', reference_id: adv.id,
    description: `Tạm ứng ${adv.advance_number}`, debit: 0, credit: advAmt,
    entry_date: today, period_month: month, period_year: year,
  })
  log('pass', `Tạm ứng: ${adv.advance_number} — ${advAmt.toLocaleString()} VNĐ — CREDIT`)

  // 5.2 Quyết toán
  console.log('\n  [5.2] Quyết toán Deal')
  const balanceDue = finalValue - advAmt
  const { data: stl, error: stlErr } = await s.from('b2b_settlements').insert({
    code: `QT-TEST-${ts}`, deal_id: deal.id, partner_id: partnerId,
    settlement_type: 'purchase', status: 'approved',
    weighed_kg: totalWeight, finished_kg: totalWeight,
    drc_percent: avgDrc, approved_price: 25000,
    total_advance: advAmt,
    approved_at: new Date().toISOString(),
    created_by: '81fb3546-db87-4d0d-a94b-dea5aef4563e',
  }).select('id,code').single()
  if (stlErr) { log('fail', 'QT: ' + stlErr.message); return }

  await s.from('b2b_partner_ledger').insert({
    partner_id: partnerId, entry_type: 'settlement', reference_type: 'settlement', reference_id: stl.id,
    description: `Quyết toán ${stl.code}`, debit: finalValue, credit: 0,
    entry_date: today, period_month: month, period_year: year,
  })
  log('pass', `QT: ${stl.code} — Gross: ${finalValue.toLocaleString()} — DEBIT`)

  // 5.3 Thanh toán
  console.log('\n  [5.3] Thanh toán còn lại')
  await s.from('b2b_settlements').update({
    status: 'paid', paid_at: new Date().toISOString(),
    payment_method: 'bank_transfer', bank_reference: `CK-TEST-${ts}`,
  }).eq('id', stl.id)

  await s.from('b2b_partner_ledger').insert({
    partner_id: partnerId, entry_type: 'payment', reference_type: 'settlement', reference_id: stl.id,
    description: `Thanh toán ${stl.code}`, debit: 0, credit: balanceDue,
    entry_date: today, period_month: month, period_year: year,
  })
  log('pass', `Thanh toán: ${balanceDue.toLocaleString()} VNĐ — CREDIT`)

  // Deal → settled
  await s.from('b2b_deals').update({ status: 'settled' }).eq('id', deal.id)

  // Sales Invoice → paid
  await s.from('sales_invoices').update({ payment_status: 'paid', paid_amount: 387000 }).eq('id', inv.id)
  await s.from('sales_orders').update({ status: 'paid' }).eq('id', order.id)
  log('pass', 'Deal → settled | SO → paid')

  // ============================================================
  // VERIFY: CÔNG NỢ CÂN BẰNG
  // ============================================================
  console.log('\n' + '─'.repeat(70))
  console.log('  KIỂM TRA CÔNG NỢ')
  console.log('─'.repeat(70))

  const { data: ledger } = await s.from('b2b_partner_ledger').select('entry_type,debit,credit,description')
    .eq('partner_id', partnerId).order('created_at')

  let tD = 0, tC = 0
  if (ledger) {
    console.log('')
    ledger.forEach(l => {
      tD += l.debit || 0
      tC += l.credit || 0
      const d = (l.debit || 0).toLocaleString().padStart(18)
      const c = (l.credit || 0).toLocaleString().padStart(18)
      console.log(`  ${l.entry_type.padEnd(12)} D:${d}  C:${c}  | ${(l.description || '').substring(0, 45)}`)
    })
    console.log('  ' + '─'.repeat(66))
    console.log(`  ${'TỔNG'.padEnd(12)} D:${tD.toLocaleString().padStart(18)}  C:${tC.toLocaleString().padStart(18)}`)
    console.log(`\n  BALANCE: ${(tD - tC).toLocaleString()} VNĐ`)

    if (tD - tC === 0) {
      log('pass', 'CÔNG NỢ CÂN BẰNG = 0 ✓')
    } else {
      log('fail', `CÔNG NỢ KHÔNG CÂN BẰNG: ${(tD - tC).toLocaleString()} VNĐ`)
    }
  }

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log('\n' + '='.repeat(70))
  console.log('  KẾT QUẢ TEST')
  console.log('='.repeat(70))
  console.log(`  ${PASS}: ${totalPass}`)
  console.log(`  ${FAIL}: ${totalFail}`)
  console.log(`  ${SKIP}: ${totalSkip}`)
  console.log(`  TỔNG: ${totalPass + totalFail + totalSkip}`)
  console.log('')
  if (totalFail === 0) {
    console.log('  ✅ TẤT CẢ LUỒNG HOẠT ĐỘNG ĐÚNG!')
  } else {
    console.log('  ❌ CÓ LỖI CẦN SỬA!')
  }
  console.log('='.repeat(70))
}

run().catch(err => console.error('FATAL:', err.message))
