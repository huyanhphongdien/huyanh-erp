const{createClient}=require('@supabase/supabase-js')
const s=createClient('https://dygveetaatqllhjusyzz.supabase.co','sb_publishable_TmhOgRteyuVScb3v114oNw_UrZ_OKKQ')

async function seed() {
  console.log('=== SEED SALES TEST DATA ===\n')

  const customers = [
    { code: 'KH-001', name: 'Michelin Group', short_name: 'Michelin', country: 'FR', contact_person: 'Mr. Pierre Dupont', email: 'purchase@michelin.com', tier: 'strategic', payment_terms: 'lc_at_sight', preferred_grades: ['SVR_3L','SVR_CV60'] },
    { code: 'KH-002', name: 'Bridgestone Corporation', short_name: 'Bridgestone', country: 'JP', contact_person: 'Mr. Yamamoto', email: 'buy@bridgestone.co.jp', tier: 'strategic', payment_terms: 'lc_30_days', preferred_grades: ['SVR_3L','SVR_5'] },
    { code: 'KH-003', name: 'Continental AG', short_name: 'Continental', country: 'DE', contact_person: 'Herr Schmidt', email: 'procurement@continental.de', tier: 'premium', payment_terms: 'tt_30', preferred_grades: ['SVR_10','SVR_20'] },
    { code: 'KH-004', name: 'Hankook Tire', short_name: 'Hankook', country: 'KR', contact_person: 'Mr. Kim', email: 'import@hankook.kr', tier: 'premium', payment_terms: 'lc_60_days', preferred_grades: ['SVR_5','SVR_10'] },
    { code: 'KH-005', name: 'PT Gajah Tunggal', short_name: 'GT Radial', country: 'ID', contact_person: 'Mr. Andi', email: 'purchase@gt-tires.co.id', tier: 'standard', payment_terms: 'tt_advance', preferred_grades: ['SVR_10','SVR_20'] },
  ]

  console.log('[1] Tao 5 khach hang quoc te')
  for (const c of customers) {
    const {error} = await s.from('sales_customers').insert({
      ...c, default_incoterm: 'FOB', default_currency: 'USD', status: 'active', quality_standard: 'ISO_2000',
    })
    if (error && !error.message.includes('duplicate')) console.log('  ERR:', c.code, error.message)
    else console.log('  OK:', c.code, '-', c.name)
  }

  const {data: custs} = await s.from('sales_customers').select('id,code,name').in('code', customers.map(c=>c.code))
  if (!custs || custs.length === 0) { console.log('No customers!'); return }

  const ports = { 'KH-001': 'LE HAVRE, FRANCE', 'KH-002': 'YOKOHAMA, JAPAN', 'KH-003': 'HAMBURG, GERMANY', 'KH-004': 'BUSAN, KOREA', 'KH-005': 'JAKARTA, INDONESIA' }

  const orders = [
    { customer: 'KH-001', grade: 'SVR_3L', qty: 300, price: 1900, status: 'draft', po: 'PO-MICH-2026-001', delivery: '2026-05-01' },
    { customer: 'KH-001', grade: 'SVR_CV60', qty: 100, price: 2100, status: 'confirmed', po: 'PO-MICH-2026-002', delivery: '2026-04-20' },
    { customer: 'KH-002', grade: 'SVR_3L', qty: 500, price: 1850, status: 'confirmed', po: 'PO-BS-2026-Q2-001', delivery: '2026-04-30' },
    { customer: 'KH-002', grade: 'SVR_5', qty: 200, price: 1750, status: 'producing', po: 'PO-BS-2026-Q1-003', delivery: '2026-04-10' },
    { customer: 'KH-003', grade: 'SVR_10', qty: 150, price: 1650, status: 'ready', po: 'PO-CONTI-2026-008', delivery: '2026-04-05' },
    { customer: 'KH-003', grade: 'SVR_20', qty: 400, price: 1450, status: 'packing', po: 'PO-CONTI-2026-009', delivery: '2026-04-15' },
    { customer: 'KH-004', grade: 'SVR_5', qty: 250, price: 1780, status: 'shipped', po: 'HK-2026-VN-005', delivery: '2026-03-25' },
    { customer: 'KH-004', grade: 'SVR_10', qty: 180, price: 1620, status: 'delivered', po: 'HK-2026-VN-004', delivery: '2026-03-15' },
    { customer: 'KH-005', grade: 'SVR_20', qty: 350, price: 1400, status: 'invoiced', po: 'GT-PO-2026-012', delivery: '2026-03-20' },
    { customer: 'KH-005', grade: 'SVR_10', qty: 200, price: 1600, status: 'paid', po: 'GT-PO-2026-010', delivery: '2026-03-01' },
  ]

  console.log('\n[2] Tao 10 don hang o cac trang thai')
  let orderNum = 1
  for (const o of orders) {
    const cust = custs.find(c => c.code === o.customer)
    if (!cust) continue
    const code = 'SO-2026-' + String(orderNum).padStart(4, '0')
    const qtyKg = o.qty * 1000
    const totalUsd = o.qty * o.price
    const totalVnd = totalUsd * 25500
    const totalBales = Math.ceil(qtyKg / 33.33)
    const containers = Math.ceil(o.qty / 20)

    const {error} = await s.from('sales_orders').insert({
      code, customer_id: cust.id, customer_po: o.po,
      grade: o.grade, quantity_tons: o.qty, quantity_kg: qtyKg,
      unit_price: o.price, currency: 'USD', exchange_rate: 25500,
      total_value_usd: totalUsd, total_value_vnd: totalVnd,
      incoterm: 'FOB', port_of_loading: 'HCM',
      port_of_destination: ports[o.customer] || 'TBD',
      packing_type: 'bale', bale_weight_kg: 33.33, total_bales: totalBales,
      container_type: '20ft', container_count: containers,
      order_date: '2026-03-01', delivery_date: o.delivery, etd: o.delivery,
      payment_terms: 'lc_at_sight', status: o.status,
      confirmed_at: o.status === 'draft' ? null : new Date().toISOString(),
      shipped_at: ['shipped','delivered','invoiced','paid'].includes(o.status) ? new Date().toISOString() : null,
    })
    if (error) console.log('  ERR:', code, error.message)
    else console.log('  OK:', code, cust.name, o.grade, o.qty+'T', '$'+o.price, o.status)
    orderNum++
  }

  console.log('\n[3] Tao containers')
  const {data: packOrders} = await s.from('sales_orders').select('id,code,container_count')
    .in('status', ['packing','shipped','delivered','invoiced','paid'])
    .order('code')
  for (const po of (packOrders || [])) {
    const count = Math.min(po.container_count || 5, 8)
    for (let i = 0; i < count; i++) {
      await s.from('sales_order_containers').insert({
        sales_order_id: po.id,
        container_no: 'MSKU' + (3000000 + Math.floor(Math.random()*999999)),
        seal_no: 'HA-' + po.code.replace('SO-','') + '-' + (i+1),
        container_type: '20ft', net_weight_kg: 20000, gross_weight_kg: 22200, tare_weight_kg: 2200,
        bale_count: 600, status: 'sealed',
        packed_at: new Date().toISOString(), sealed_at: new Date().toISOString(),
      })
    }
    console.log('  OK:', po.code, count, 'containers')
  }

  console.log('\n[4] Tao hoa don')
  const {data: invOrders} = await s.from('sales_orders').select('id,code,customer_id,total_value_usd,status')
    .in('status', ['invoiced','paid'])
  let invNum = 1
  for (const io of (invOrders || [])) {
    const sub = io.total_value_usd || 0
    const freight = Math.round(sub * 0.03)
    const ins = Math.round(sub * 0.005)
    const total = sub + freight + ins
    const {error} = await s.from('sales_invoices').insert({
      code: 'INV-2026-' + String(invNum).padStart(4,'0'),
      sales_order_id: io.id, customer_id: io.customer_id,
      subtotal: sub, freight_charge: freight, insurance_charge: ins,
      total_amount: total, currency: 'USD', exchange_rate: 25500,
      total_vnd: total * 25500, payment_terms: 'lc_at_sight',
      invoice_date: new Date().toISOString().split('T')[0], status: 'issued',
      payment_status: io.status === 'paid' ? 'paid' : 'unpaid',
      paid_amount: io.status === 'paid' ? total : 0,
    })
    if (error) console.log('  ERR:', error.message)
    else console.log('  OK: INV-2026-' + String(invNum).padStart(4,'0'), '$' + total.toLocaleString())
    invNum++
  }

  console.log('\n=== DONE: 5 KH + 10 don hang + containers + invoices ===')
}

seed().catch(e => console.error('FATAL:', e.message))
