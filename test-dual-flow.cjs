const{createClient}=require('@supabase/supabase-js')
const s=createClient('https://dygveetaatqllhjusyzz.supabase.co','sb_publishable_TmhOgRteyuVScb3v114oNw_UrZ_OKKQ')

async function test() {
  const ts = Date.now().toString(36)
  const employeeId = '81fb3546-db87-4d0d-a94b-dea5aef4563e'
  const partnerId = '11111111-aaaa-1111-1111-000000000007' // Nguyễn Văn Tính (Mạnh Quân) - Diamond
  const partnerName = 'Nguyễn Văn Tính (Mạnh Quân)'

  const {data: wh} = await s.from('warehouses').select('id').eq('code','KHO-NVL').single()
  const {data: whTP} = await s.from('warehouses').select('id').eq('code','KHO-A').single()
  const {data: mat} = await s.from('materials').select('id').limit(1).single()
  if (!wh||!mat) { console.log('Missing warehouse/material!'); return }

  const today = new Date().toISOString().split('T')[0]
  const month = new Date().getMonth() + 1
  const year = new Date().getFullYear()

  // ================================================================
  console.log('╔══════════════════════════════════════════════════╗')
  console.log('║  LUỒNG 1: MUA MỦ ĐỨT — ' + partnerName.padEnd(24) + '║')
  console.log('╚══════════════════════════════════════════════════╝\n')

  // 1.1 Deal mua mủ
  const {data: d1} = await s.from('b2b_deals').insert({
    deal_number: `DL-MUA-${ts}`.substring(0,20), partner_id: partnerId, deal_type: 'purchase',
    product_name: 'Mủ nước', rubber_type: 'mu_nuoc', quantity_kg: 30000,
    unit_price: 28000, total_value_vnd: 840000000, status: 'processing',
    expected_drc: 32, price_unit: 'wet', source_region: 'Quảng Trị',
  }).select('id,deal_number').single()
  console.log('1. Deal:', d1.deal_number, '| 30T mủ nước | 28k/kg | DRC 32% | Giá ướt')

  // 1.2 Cân xe
  const {data: t1} = await s.from('weighbridge_tickets').insert({
    code: `CX-M-${ts}`, vehicle_plate: `76H-MQ${ts.substring(0,3)}`, driver_name: 'Lê Văn Xe',
    ticket_type: 'in', status: 'completed', gross_weight: 38000, tare_weight: 8000, net_weight: 30000,
    deal_id: d1.id, partner_id: partnerId, rubber_type: 'mu_nuoc', supplier_name: partnerName,
    gross_weighed_at: new Date().toISOString(), tare_weighed_at: new Date().toISOString(), completed_at: new Date().toISOString(),
  }).select('id,code').single()
  console.log('2. Cân xe:', t1.code, '| NET 30,000 kg')

  // 1.3 Nhập kho + batch
  const {data: si1} = await s.from('stock_in_orders').insert({
    code: `NK-M-${ts}`, type: 'raw', warehouse_id: wh.id, source_type: 'purchase',
    deal_id: d1.id, status: 'confirmed', total_quantity: 1, total_weight: 30000, confirmed_at: new Date().toISOString(),
  }).select('id,code').single()
  const {data: b1} = await s.from('stock_batches').insert({
    batch_no: `LOT-M-${ts}`, material_id: mat.id, warehouse_id: wh.id,
    initial_quantity: 1, quantity_remaining: 1, initial_weight: 30000, current_weight: 30000,
    initial_drc: 32, latest_drc: 32, qc_status: 'pending', status: 'active', rubber_type: 'mu_nuoc',
    supplier_name: partnerName, supplier_region: 'Quảng Trị',
  }).select('id,batch_no').single()
  await s.from('stock_in_details').insert({ stock_in_id: si1.id, material_id: mat.id, batch_id: b1.id, quantity: 1, weight: 30000, drc_value: 32 })
  await s.from('b2b_deals').update({ stock_in_count: 1, actual_weight_kg: 30000 }).eq('id', d1.id)
  console.log('3. Nhập kho:', si1.code, '| Batch:', b1.batch_no)

  // 1.4 QC
  await s.from('batch_qc_results').insert({ batch_id: b1.id, drc_value: 33.8, result: 'passed', test_type: 'initial', tested_at: new Date().toISOString() })
  await s.from('stock_batches').update({ latest_drc: 33.8, qc_status: 'passed' }).eq('id', b1.id)
  const fv1 = Math.round(30000 * 28000) // wet: weight × price
  await s.from('b2b_deals').update({ actual_drc: 33.8, final_value: fv1, qc_status: 'passed' }).eq('id', d1.id)
  console.log('4. QC: DRC 33.8% (kỳ vọng 32%) | Đạt | Giá trị:', fv1.toLocaleString())

  // 1.5 Tạm ứng 200M
  const adv1Amt = 200000000
  const {data: adv1} = await s.from('b2b_advances').insert({
    deal_id: d1.id, partner_id: partnerId, advance_number: `TU-M-${ts}`,
    amount: adv1Amt, amount_vnd: adv1Amt, currency: 'VND', payment_date: today,
    payment_method: 'bank_transfer', status: 'paid', paid_at: new Date().toISOString(),
  }).select('id,advance_number').single()
  await s.from('b2b_partner_ledger').insert({
    partner_id: partnerId, entry_type: 'advance', reference_type: 'advance', reference_id: adv1.id,
    description: `Tạm ứng ${adv1.advance_number} — ${d1.deal_number}`, debit: 0, credit: adv1Amt,
    entry_date: today, period_month: month, period_year: year,
  })
  console.log('5. Tạm ứng:', adv1Amt.toLocaleString(), 'VNĐ')

  // 1.6 Quyết toán
  const bal1 = fv1 - adv1Amt
  const {data: stl1} = await s.from('b2b_settlements').insert({
    code: `QT-M-${ts}`, deal_id: d1.id, partner_id: partnerId, settlement_type: 'purchase',
    status: 'approved', total_advance: adv1Amt, approved_at: new Date().toISOString(), created_by: employeeId,
  }).select('id,code').single()
  await s.from('b2b_partner_ledger').insert({
    partner_id: partnerId, entry_type: 'settlement', reference_type: 'settlement', reference_id: stl1.id,
    description: `Quyết toán ${stl1.code}`, debit: fv1, credit: 0,
    entry_date: today, period_month: month, period_year: year,
  })
  console.log('6. Quyết toán:', stl1.code, '| Gross:', fv1.toLocaleString(), '| Còn:', bal1.toLocaleString())

  // 1.7 Thanh toán
  await s.from('b2b_settlements').update({ status: 'paid', paid_at: new Date().toISOString(), payment_method: 'bank_transfer' }).eq('id', stl1.id)
  await s.from('b2b_partner_ledger').insert({
    partner_id: partnerId, entry_type: 'payment', reference_type: 'settlement', reference_id: stl1.id,
    description: `Thanh toán ${stl1.code}`, debit: 0, credit: bal1,
    entry_date: today, period_month: month, period_year: year,
  })
  await s.from('b2b_deals').update({ status: 'settled' }).eq('id', d1.id)
  console.log('7. Thanh toán:', bal1.toLocaleString(), '→ Deal settled')

  // ================================================================
  console.log('\n╔══════════════════════════════════════════════════╗')
  console.log('║  LUỒNG 2: GIA CÔNG — ' + partnerName.padEnd(28) + '║')
  console.log('╚══════════════════════════════════════════════════╝\n')

  // 2.1 Deal gia công
  const {data: d2} = await s.from('b2b_deals').insert({
    deal_number: `DL-GC2-${ts}`.substring(0,20), partner_id: partnerId, deal_type: 'processing',
    product_name: 'Mủ đông (gia công)', rubber_type: 'mu_dong', quantity_kg: 15000,
    unit_price: 0, total_value_vnd: 0, status: 'processing',
    expected_drc: 50, price_unit: 'wet',
    processing_fee_per_ton: 3000000, expected_output_rate: 78,
    source_region: 'Bình Phước',
  }).select('id,deal_number').single()
  console.log('1. Deal:', d2.deal_number, '| 15T mủ đông | Phí 3M/T | Thu hồi 78%')

  // 2.2 Cân xe
  const {data: t2} = await s.from('weighbridge_tickets').insert({
    code: `CX-G-${ts}`, vehicle_plate: `93H-GC${ts.substring(0,3)}`, driver_name: 'Phạm Văn Giao',
    ticket_type: 'in', status: 'completed', gross_weight: 20000, tare_weight: 5000, net_weight: 15000,
    deal_id: d2.id, partner_id: partnerId, rubber_type: 'mu_dong', supplier_name: partnerName,
    gross_weighed_at: new Date().toISOString(), tare_weighed_at: new Date().toISOString(), completed_at: new Date().toISOString(),
  }).select('id,code').single()
  console.log('2. Cân xe:', t2.code, '| NET 15,000 kg')

  // 2.3 Nhập kho + batch
  const {data: si2} = await s.from('stock_in_orders').insert({
    code: `NK-G-${ts}`, type: 'raw', warehouse_id: wh.id, source_type: 'purchase',
    deal_id: d2.id, status: 'confirmed', total_quantity: 1, total_weight: 15000, confirmed_at: new Date().toISOString(),
  }).select('id,code').single()
  const {data: b2} = await s.from('stock_batches').insert({
    batch_no: `NVL-G-${ts}`, material_id: mat.id, warehouse_id: wh.id,
    initial_quantity: 1, quantity_remaining: 1, initial_weight: 15000, current_weight: 15000,
    initial_drc: 50, latest_drc: 50, qc_status: 'pending', status: 'active', rubber_type: 'mu_dong',
    supplier_name: partnerName, supplier_region: 'Bình Phước',
  }).select('id,batch_no').single()
  await s.from('stock_in_details').insert({ stock_in_id: si2.id, material_id: mat.id, batch_id: b2.id, quantity: 1, weight: 15000, drc_value: 50 })
  await s.from('b2b_deals').update({ stock_in_count: 1, actual_weight_kg: 15000 }).eq('id', d2.id)
  console.log('3. Nhập kho:', si2.code, '| Batch:', b2.batch_no)

  // 2.4 QC NVL
  await s.from('batch_qc_results').insert({ batch_id: b2.id, drc_value: 48.5, result: 'passed', test_type: 'initial', tested_at: new Date().toISOString() })
  await s.from('stock_batches').update({ latest_drc: 48.5, qc_status: 'passed' }).eq('id', b2.id)
  await s.from('b2b_deals').update({ actual_drc: 48.5, qc_status: 'passed' }).eq('id', d2.id)
  console.log('4. QC NVL: DRC 48.5% | Đạt')

  // 2.5 Sản xuất (5 stages)
  const {data: facility} = await s.from('production_facilities').select('id').limit(1).single()
  const outputTarget = Math.round(15000 * 0.78)
  const {data: po} = await s.from('production_orders').insert({
    code: `LSX-G-${ts}`, product_type: 'SVR_5', target_quantity: outputTarget,
    target_grade: 'SVR_5', target_drc_min: 55, target_drc_max: 60,
    status: 'completed', stage_current: 5, facility_id: facility?.id,
    actual_start_date: today, actual_end_date: today, expected_grade: 'SVR_5',
    actual_quantity: 11700, yield_percent: 78, final_grade: 'SVR_5', final_drc: 96,
  }).select('id,code').single()
  await s.from('production_order_items').insert({
    production_order_id: po.id, source_batch_id: b2.id,
    required_quantity: 15000, allocated_quantity: 15000, actual_input_quantity: 15000,
    drc_at_intake: 48.5,
  })
  const stages = ['Rửa','Tán/Kéo','Sấy','Ép','Đóng gói']
  for (let i = 0; i < 5; i++) {
    await s.from('production_stage_progress').insert({
      production_order_id: po.id, stage_number: i+1, stage_name: stages[i],
      status: 'completed', started_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      qc_checkpoint_passed: true,
    })
  }
  console.log('5. SX:', po.code, '| 5 công đoạn → 11,700 kg SVR 5 | Yield 78%')

  // 2.6 Lô thành phẩm
  const outputKg = 11700
  const {data: bTP} = await s.from('stock_batches').insert({
    batch_no: `TP-G-${ts}`, material_id: mat.id, warehouse_id: whTP?.id || wh.id,
    initial_quantity: 1, quantity_remaining: 1, initial_weight: outputKg, current_weight: outputKg,
    initial_drc: 96, latest_drc: 96, qc_status: 'passed', status: 'active',
    rubber_grade: 'SVR_5', production_order_id: po.id,
  }).select('id,batch_no').single()
  await s.from('production_output_batches').insert({
    production_order_id: po.id, stock_batch_id: bTP.id,
    output_batch_no: bTP.batch_no, material_id: mat.id,
    quantity_produced: outputKg, bale_count: 234,
    final_grade: 'SVR_5', final_drc: 96, status: 'created',
    warehouse_id: whTP?.id || wh.id,
  })
  await s.from('stock_batches').update({ status: 'depleted', quantity_remaining: 0, current_weight: 0 }).eq('id', b2.id)
  console.log('6. TP:', bTP.batch_no, '| SVR 5 | 11,700 kg | 234 bành')

  // 2.7 Xuất kho trả
  await s.from('stock_out_orders').insert({
    code: `XK-G-${ts}`, warehouse_id: whTP?.id || wh.id,
    reason: 'sale', status: 'confirmed', customer_name: partnerName + ' (trả gia công)',
    total_quantity: 1, total_weight: outputKg, svr_grade: 'SVR_5', bale_count: 234,
    confirmed_at: new Date().toISOString(),
  })
  console.log('7. Xuất kho:', outputKg.toLocaleString(), 'kg → trả', partnerName)

  // 2.8 Quyết toán phí gia công
  const fee = (15000 / 1000) * 3000000 // 15T × 3M
  const {data: stl2, error: stl2Err} = await s.from('b2b_settlements').insert({
    code: `QT-G-${ts}`, deal_id: d2.id, partner_id: partnerId, settlement_type: 'processing',
    status: 'approved', total_advance: 0, approved_at: new Date().toISOString(),
    created_by: employeeId,
  }).select('id,code').single()
  if (stl2Err) { console.log('Settlement ERR:', stl2Err.message); return }
  await s.from('b2b_partner_ledger').insert({
    partner_id: partnerId, entry_type: 'settlement', reference_type: 'settlement', reference_id: stl2.id,
    description: `Phí gia công ${d2.deal_number} — 15T × 3M/T`, debit: fee, credit: 0,
    entry_date: today, period_month: month, period_year: year,
  })
  await s.from('b2b_partner_ledger').insert({
    partner_id: partnerId, entry_type: 'payment', reference_type: 'settlement', reference_id: stl2.id,
    description: `Thanh toán phí GC ${stl2.code}`, debit: 0, credit: fee,
    entry_date: today, period_month: month, period_year: year,
  })
  await s.from('b2b_deals').update({ status: 'settled', final_value: fee }).eq('id', d2.id)
  console.log('8. Phí GC:', fee.toLocaleString(), 'VNĐ → Thanh toán → Settled')

  // ================================================================
  console.log('\n╔══════════════════════════════════════════════════╗')
  console.log('║                    VERIFY                        ║')
  console.log('╚══════════════════════════════════════════════════╝\n')

  // Ledger balance for this partner
  const {data: ledger} = await s.from('b2b_partner_ledger').select('entry_type,debit,credit,description').eq('partner_id', partnerId)
  let tD = 0, tC = 0
  if (ledger && ledger.length > 0) {
    console.log('SỔ CÁI — ' + partnerName)
    console.log('-'.repeat(90))
    ledger.forEach(l => {
      tD += l.debit || 0
      tC += l.credit || 0
      const d = (l.debit||0).toLocaleString().padStart(15)
      const c = (l.credit||0).toLocaleString().padStart(15)
      console.log(l.entry_type.padEnd(12), 'D:'+d, 'C:'+c, '|', (l.description||'').substring(0,55))
    })
    console.log('-'.repeat(90))
    console.log('TOTAL'.padEnd(12), 'D:'+tD.toLocaleString().padStart(15), 'C:'+tC.toLocaleString().padStart(15))
    console.log('\nBALANCE:', (tD - tC).toLocaleString(), 'VNĐ')
    console.log(tD - tC === 0 ? '\n✅ CÔNG NỢ CÂN BẰNG = 0' : '\n⚠️ KHÔNG CÂN BẰNG: ' + (tD-tC).toLocaleString())
  } else {
    console.log('⚠️ Không có dữ liệu ledger (có thể RLS chặn)')
  }

  // Summary
  console.log('\n╔══════════════════════════════════════════════════╗')
  console.log('║                   TÓM TẮT                       ║')
  console.log('╚══════════════════════════════════════════════════╝')
  console.log('')
  console.log('LUỒNG 1 — MUA MỦ ĐỨT:')
  console.log('  Mua 30T mủ nước × 28k/kg = ' + fv1.toLocaleString() + ' VNĐ')
  console.log('  Tạm ứng: ' + adv1Amt.toLocaleString() + ' | Còn: ' + bal1.toLocaleString())
  console.log('  → Thanh toán → Balance = 0')
  console.log('')
  console.log('LUỒNG 2 — GIA CÔNG:')
  console.log('  Nhận 15T mủ đông → SX → 11,700 kg SVR 5 (Yield 78%)')
  console.log('  Phí gia công: ' + fee.toLocaleString() + ' VNĐ (15T × 3M/T)')
  console.log('  → Thanh toán → Balance = 0')
  console.log('')
  console.log('=== HOÀN TẤT CẢ 2 LUỒNG ===')
}
test()
