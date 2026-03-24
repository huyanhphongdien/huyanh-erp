const{createClient}=require('@supabase/supabase-js')
const s=createClient('https://dygveetaatqllhjusyzz.supabase.co','sb_publishable_TmhOgRteyuVScb3v114oNw_UrZ_OKKQ')

async function test() {
  console.log('=== LUỒNG 2: GIA CÔNG (PROCESSING) ===\n')
  const ts = Date.now().toString(36)
  const employeeId = '81fb3546-db87-4d0d-a94b-dea5aef4563e'

  // Dùng partner Nguyễn Thị Lệ
  const partnerId = '11111111-aaaa-1111-1111-000000000006'

  // Get warehouse + material
  const {data: wh} = await s.from('warehouses').select('id,name').eq('code','KHO-NVL').single()
  const {data: whTP} = await s.from('warehouses').select('id,name').eq('code','KHO-A').single()
  const {data: mat} = await s.from('materials').select('id,name').limit(1).single()
  if (!wh || !mat) { console.log('Missing warehouse/material!', wh, mat); return }
  console.log('Kho NVL:', wh.name)
  console.log('Kho TP:', whTP?.name || 'N/A')
  console.log('Vật liệu:', mat.name)

  // ============================================================
  // Step 1: Tạo Deal loại gia công
  // ============================================================
  console.log('\n--- Step 1: Tạo Deal Gia công ---')
  const dealCode = `DL-GC-${ts}`.substring(0, 20)
  const {data: deal, error: dErr} = await s.from('b2b_deals').insert({
    deal_number: dealCode,
    partner_id: partnerId,
    deal_type: 'processing',
    product_name: 'Mủ đông (gia công)',
    rubber_type: 'mu_dong',
    quantity_kg: 20000,
    unit_price: 0, // Gia công không mua
    total_value_vnd: 0,
    status: 'processing',
    expected_drc: 55,
    price_unit: 'wet',
    processing_fee_per_ton: 2500000, // 2.5M/tấn phí gia công
    expected_output_rate: 80, // Tỷ lệ thu hồi 80%
  }).select('id,deal_number').single()
  if (dErr) { console.log('ERR:', dErr.message); return }
  console.log('OK: Deal', deal.deal_number, '| Loại: Gia công | Phí: 2.5M/tấn | Thu hồi: 80%')

  // ============================================================
  // Step 2: Đại lý gửi mủ → Cân xe
  // ============================================================
  console.log('\n--- Step 2: Cân xe (đại lý gửi mủ) ---')
  const {data: ticket, error: tErr} = await s.from('weighbridge_tickets').insert({
    code: `CX-GC-${ts}`, vehicle_plate: `51C-GC${ts.substring(0,4)}`, driver_name: 'Trần Văn Gia Công',
    ticket_type: 'in', status: 'completed', gross_weight: 25000, tare_weight: 5000, net_weight: 20000,
    deal_id: deal.id, partner_id: partnerId, rubber_type: 'mu_dong', supplier_name: 'Nguyễn Thị Lệ',
    gross_weighed_at: new Date().toISOString(), tare_weighed_at: new Date().toISOString(), completed_at: new Date().toISOString(),
  }).select('id,code').single()
  if (tErr) { console.log('ERR:', tErr.message); return }
  console.log('OK:', ticket.code, '| Gross: 25,000 | Tare: 5,000 | NET: 20,000 kg')

  // ============================================================
  // Step 3: Nhập kho NVL
  // ============================================================
  console.log('\n--- Step 3: Nhập kho NVL ---')
  const {data: si, error: siErr} = await s.from('stock_in_orders').insert({
    code: `NK-GC-${ts}`, type: 'raw', warehouse_id: wh.id, source_type: 'purchase',
    deal_id: deal.id, status: 'confirmed', total_quantity: 1, total_weight: 20000,
    confirmed_at: new Date().toISOString(),
  }).select('id,code').single()
  if (siErr) { console.log('ERR:', siErr.message); return }

  // Tạo batch NVL
  const {data: batchNVL, error: bErr} = await s.from('stock_batches').insert({
    batch_no: `NVL-GC-${ts}`, material_id: mat.id, warehouse_id: wh.id,
    initial_quantity: 1, quantity_remaining: 1, initial_weight: 20000, current_weight: 20000,
    initial_drc: 55, latest_drc: 55, qc_status: 'pending', status: 'active', rubber_type: 'mu_dong',
    supplier_name: 'Nguyễn Thị Lệ',
  }).select('id,batch_no').single()
  if (bErr) { console.log('ERR:', bErr.message); return }

  await s.from('stock_in_details').insert({
    stock_in_id: si.id, material_id: mat.id, batch_id: batchNVL.id, quantity: 1, weight: 20000, drc_value: 55,
  })

  // Update Deal
  await s.from('b2b_deals').update({ stock_in_count: 1, actual_weight_kg: 20000, updated_at: new Date().toISOString() }).eq('id', deal.id)
  console.log('OK:', si.code, '| Batch:', batchNVL.batch_no, '| 20,000 kg | DRC: 55%')

  // ============================================================
  // Step 4: QC nguyên liệu
  // ============================================================
  console.log('\n--- Step 4: QC Nguyên liệu ---')
  await s.from('batch_qc_results').insert({
    batch_id: batchNVL.id, drc_value: 54.5, result: 'passed', test_type: 'initial', tested_at: new Date().toISOString(),
  })
  await s.from('stock_batches').update({ latest_drc: 54.5, qc_status: 'passed' }).eq('id', batchNVL.id)
  await s.from('b2b_deals').update({ actual_drc: 54.5, qc_status: 'passed', updated_at: new Date().toISOString() }).eq('id', deal.id)
  console.log('OK: DRC thực tế: 54.5% (kỳ vọng: 55%) | Đạt')

  // ============================================================
  // Step 5: Tạo lệnh sản xuất
  // ============================================================
  console.log('\n--- Step 5: Lệnh sản xuất ---')
  const {data: facility} = await s.from('production_facilities').select('id').limit(1).single()
  const targetOutputKg = 20000 * 0.80 // 80% thu hồi = 16,000 kg
  const {data: po, error: poErr} = await s.from('production_orders').insert({
    code: `LSX-GC-${ts}`, product_type: 'SVR_10', target_quantity: targetOutputKg,
    target_grade: 'SVR_10', target_drc_min: 50, target_drc_max: 55,
    status: 'in_progress', stage_current: 1, stage_status: 'in_progress',
    facility_id: facility?.id,
    scheduled_start_date: new Date().toISOString().split('T')[0],
    actual_start_date: new Date().toISOString().split('T')[0],
    expected_grade: 'SVR_10',
    notes: `Gia công cho đại lý Nguyễn Thị Lệ — Deal ${deal.deal_number}`,
  }).select('id,code').single()
  if (poErr) { console.log('ERR:', poErr.message); return }
  console.log('OK:', po.code, '| Target:', targetOutputKg.toLocaleString(), 'kg | Grade: SVR 10')

  // Link NVL vào lệnh SX
  await s.from('production_order_items').insert({
    production_order_id: po.id, source_batch_id: batchNVL.id,
    required_quantity: 20000, allocated_quantity: 20000,
    drc_at_intake: 54.5, expected_drc_output: 52,
    actual_input_quantity: 20000,
  })
  console.log('OK: NVL linked:', batchNVL.batch_no, '→', po.code)

  // ============================================================
  // Step 6: 5 Công đoạn sản xuất
  // ============================================================
  console.log('\n--- Step 6: 5 Công đoạn SX ---')
  const stages = [
    { name: 'Rửa', input: 20000, output: 19500, drc_in: 54.5, drc_out: 55 },
    { name: 'Tán/Kéo', input: 19500, output: 19000, drc_in: 55, drc_out: 58 },
    { name: 'Sấy', input: 19000, output: 17000, drc_in: 58, drc_out: 92 },
    { name: 'Ép', input: 17000, output: 16200, drc_in: 92, drc_out: 96 },
    { name: 'Đóng gói', input: 16200, output: 16000, drc_in: 96, drc_out: 97 },
  ]
  for (let i = 0; i < stages.length; i++) {
    const st = stages[i]
    await s.from('production_stage_progress').insert({
      production_order_id: po.id, stage_number: i + 1, stage_name: st.name,
      status: 'completed', started_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      input_quantity: st.input, output_quantity: st.output,
      weight_loss_kg: st.input - st.output,
      input_drc: st.drc_in, output_drc: st.drc_out, drc_change: st.drc_out - st.drc_in,
      qc_checkpoint_passed: true,
    })
    const loss = st.input - st.output
    console.log(`  ${i+1}. ${st.name.padEnd(10)} | In: ${st.input.toLocaleString()} → Out: ${st.output.toLocaleString()} | Loss: ${loss.toLocaleString()} kg | DRC: ${st.drc_in}→${st.drc_out}%`)
  }

  // ============================================================
  // Step 7: Tạo lô thành phẩm
  // ============================================================
  console.log('\n--- Step 7: Lô thành phẩm ---')
  const outputKg = 16000
  const {data: batchTP, error: btErr} = await s.from('stock_batches').insert({
    batch_no: `TP-GC-${ts}`, material_id: mat.id, warehouse_id: whTP?.id || wh.id,
    initial_quantity: 1, quantity_remaining: 1, initial_weight: outputKg, current_weight: outputKg,
    initial_drc: 97, latest_drc: 97, qc_status: 'pending', status: 'active',
    rubber_grade: 'SVR_10', rubber_type: 'svr_10',
    production_order_id: po.id,
  }).select('id,batch_no').single()
  if (btErr) { console.log('ERR:', btErr.message); return }

  // Production output batch
  await s.from('production_output_batches').insert({
    production_order_id: po.id, stock_batch_id: batchTP.id,
    output_batch_no: batchTP.batch_no, material_id: mat.id,
    quantity_produced: outputKg, bale_count: 320,
    final_grade: 'SVR_10', final_drc: 97, final_moisture: 0.5,
    status: 'created', warehouse_id: whTP?.id || wh.id,
    input_batches: JSON.stringify([{ batch_id: batchNVL.id, batch_no: batchNVL.batch_no, weight: 20000 }]),
  })

  // Update PO
  await s.from('production_orders').update({
    status: 'completed', actual_quantity: outputKg, yield_percent: (outputKg / 20000 * 100),
    final_grade: 'SVR_10', final_drc: 97,
    actual_end_date: new Date().toISOString().split('T')[0],
  }).eq('id', po.id)

  // NVL batch → depleted
  await s.from('stock_batches').update({ status: 'depleted', quantity_remaining: 0, current_weight: 0 }).eq('id', batchNVL.id)

  const yieldPercent = (outputKg / 20000 * 100).toFixed(1)
  console.log('OK:', batchTP.batch_no, '| SVR 10 |', outputKg.toLocaleString(), 'kg | 320 bành | DRC: 97% | Yield:', yieldPercent + '%')

  // ============================================================
  // Step 8: QC Thành phẩm
  // ============================================================
  console.log('\n--- Step 8: QC Thành phẩm ---')
  const {error: qcErr} = await s.from('production_qc_results').insert({
    output_batch_id: (await s.from('production_output_batches').select('id').eq('production_order_id', po.id).single()).data.id,
    drc_value: 97, moisture_content: 0.48, volatile_matter: 0.18,
    ash_content: 0.45, nitrogen_content: 0.55, dirt_content: 0.015,
    pri_value: 42, color_lovibond: 5.5,
    grade_determined: 'SVR_10', grade_meets_target: true, result: 'passed',
    tested_at: new Date().toISOString(),
  })
  if (qcErr) { console.log('ERR:', qcErr.message); return }
  await s.from('stock_batches').update({ qc_status: 'passed' }).eq('id', batchTP.id)
  console.log('OK: SVR 10 | DRC: 97% | Moisture: 0.48% | Dirt: 0.015% | PRI: 42 | PASSED')

  // ============================================================
  // Step 9: Xuất kho trả hàng cho đại lý
  // ============================================================
  console.log('\n--- Step 9: Xuất kho trả đại lý ---')
  const {data: so, error: soErr} = await s.from('stock_out_orders').insert({
    code: `XK-GC-${ts}`, warehouse_id: whTP?.id || wh.id,
    reason: 'sale', status: 'confirmed',
    customer_name: 'Nguyễn Thị Lệ (trả hàng gia công)',
    total_quantity: 1, total_weight: outputKg,
    svr_grade: 'SVR_10', bale_count: 320,
    confirmed_at: new Date().toISOString(),
    notes: `Trả hàng gia công — Deal ${deal.deal_number}`,
  }).select('id,code').single()
  if (soErr) { console.log('ERR:', soErr.message); return }
  console.log('OK:', so.code, '|', outputKg.toLocaleString(), 'kg SVR 10 | 320 bành | Trả Nguyễn Thị Lệ')

  // ============================================================
  // Step 10: Quyết toán phí gia công
  // ============================================================
  console.log('\n--- Step 10: Quyết toán phí gia công ---')
  const processingFee = (20000 / 1000) * 2500000 // 20 tấn × 2.5M = 50M
  console.log('Tính phí: 20 tấn × 2,500,000 đ/tấn =', processingFee.toLocaleString(), 'VNĐ')

  // Settlement cho phí gia công
  const {data: stl, error: stlErr} = await s.from('b2b_settlements').insert({
    code: `QT-GC-${ts}`, deal_id: deal.id, partner_id: partnerId,
    settlement_type: 'processing',
    status: 'approved', total_advance: 0,
    approved_at: new Date().toISOString(),
    created_by: employeeId,
  }).select('id,code').single()
  if (stlErr) { console.log('ERR:', stlErr.message); return }

  const today = new Date().toISOString().split('T')[0]
  const month = new Date().getMonth() + 1
  const year = new Date().getFullYear()

  // Ledger: Debit (đại lý nợ nhà máy phí gia công)
  await s.from('b2b_partner_ledger').insert({
    partner_id: partnerId, entry_type: 'settlement', reference_type: 'settlement', reference_id: stl.id,
    description: `Phí gia công ${deal.deal_number} — 20T × 2.5M/T`, debit: processingFee, credit: 0,
    entry_date: today, period_month: month, period_year: year,
  })
  console.log('OK: Ledger DEBIT', processingFee.toLocaleString(), 'VNĐ')

  // Payment (đại lý thanh toán phí gia công)
  await s.from('b2b_settlements').update({
    status: 'paid', paid_at: new Date().toISOString(), payment_method: 'bank_transfer',
  }).eq('id', stl.id)

  await s.from('b2b_partner_ledger').insert({
    partner_id: partnerId, entry_type: 'payment', reference_type: 'settlement', reference_id: stl.id,
    description: `Thanh toán phí gia công ${stl.code}`, debit: 0, credit: processingFee,
    entry_date: today, period_month: month, period_year: year,
  })
  console.log('OK: Ledger CREDIT', processingFee.toLocaleString(), 'VNĐ (đại lý thanh toán)')

  // Deal → settled
  await s.from('b2b_deals').update({ status: 'settled', final_value: processingFee }).eq('id', deal.id)
  console.log('Deal →', 'settled')

  // ============================================================
  // VERIFY
  // ============================================================
  console.log('\n========== VERIFY ==========')

  // Check Deal
  const {data: dealFinal} = await s.from('b2b_deals').select('deal_number,status,actual_weight_kg,actual_drc,final_value,stock_in_count,qc_status').eq('id', deal.id).single()
  console.log('\nDeal:', JSON.stringify(dealFinal))

  // Check Production Order
  const {data: poFinal} = await s.from('production_orders').select('code,status,actual_quantity,yield_percent,final_grade,final_drc').eq('id', po.id).single()
  console.log('Production:', JSON.stringify(poFinal))

  // Check batches
  const {data: nvlFinal} = await s.from('stock_batches').select('batch_no,status,current_weight,latest_drc,qc_status').eq('id', batchNVL.id).single()
  const {data: tpFinal} = await s.from('stock_batches').select('batch_no,status,current_weight,latest_drc,qc_status,rubber_grade').eq('id', batchTP.id).single()
  console.log('NVL batch:', JSON.stringify(nvlFinal))
  console.log('TP batch:', JSON.stringify(tpFinal))

  // Check Ledger balance
  const {data: ledger} = await s.from('b2b_partner_ledger').select('entry_type,debit,credit,description').eq('reference_id', stl.id)
  let tD = 0, tC = 0
  if (ledger) {
    ledger.forEach(l => {
      tD += l.debit || 0
      tC += l.credit || 0
      console.log(l.entry_type.padEnd(12), 'D:', (l.debit||0).toLocaleString().padStart(15), 'C:', (l.credit||0).toLocaleString().padStart(15), '|', l.description)
    })
  }
  console.log('-'.repeat(80))
  console.log('BALANCE:', (tD - tC).toLocaleString(), 'VNĐ')
  console.log(tD - tC === 0 ? '\n✅ CÔNG NỢ CÂN BẰNG = 0' : '\n⚠️ KHÔNG CÂN BẰNG')

  // Summary
  console.log('\n========== TÓM TẮT ==========')
  console.log('Đại lý gửi:     20,000 kg mủ đông (DRC 54.5%)')
  console.log('Sản xuất:        5 công đoạn → 16,000 kg SVR 10 (Yield 80%)')
  console.log('Trả đại lý:     16,000 kg SVR 10 (320 bành)')
  console.log('Phí gia công:    50,000,000 VNĐ (20T × 2.5M/T)')
  console.log('Thanh toán:      50,000,000 VNĐ → Balance = 0')
  console.log('\n=== LUỒNG 2 HOÀN TẤT ===')
}
test()
