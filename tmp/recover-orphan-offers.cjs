const https = require('https')

const SR = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5Z3ZlZXRhYXRxbGxoanVzeXp6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ2MDY4NSwiZXhwIjoyMDg0MDM2Njg1fQ.bw4dPo4e8pLfbdlhHFFGnCVejp15z4BPANjtOQ3h6bc'
const HOST = 'dygveetaatqllhjusyzz.supabase.co'

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const r = https.request({
      host: HOST, path, method,
      headers: {
        apikey: SR,
        Authorization: `Bearer ${SR}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
    }, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`${res.statusCode}: ${data}`))
        else { try { resolve(JSON.parse(data)) } catch { resolve(data) } }
      })
    })
    r.on('error', reject)
    if (body) r.write(JSON.stringify(body))
    r.end()
  })
}

const DEMAND_ID = 'fae94e7e-0698-4290-96ed-4294d0db529d'
const PARTNER_ID = '11111111-aaaa-1111-1111-000000000008'
const PARTNER_CODE = 'TEMY01'

const OFFERS = [
  {
    id: '347466ec-56f6-45a2-beae-1daa006ff479',
    qty_kg: 5000000,
    price: 33000,
    drc: 30,
    region: 'Đồng Nai',
    delivery: '2026-04-13',
  },
  {
    id: '02cdc628-ac17-4338-8e90-37f4a1791d1a',
    qty_kg: 9000000,
    price: 35000,
    drc: 89,
    region: 'Lào',
    delivery: '2026-04-10',
  },
]

function genDealNumber() {
  const d = new Date()
  return `DL${d.getFullYear().toString().slice(-2)}${(d.getMonth() + 1).toString().padStart(2, '0')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
}

function genLotCode(idx) {
  const d = new Date()
  const seq = (idx + 1).toString().padStart(3, '0')
  return `${PARTNER_CODE}-${d.getFullYear().toString().slice(-2)}${(d.getMonth() + 1).toString().padStart(2, '0')}-${seq}`
}

async function main() {
  // 1. Fetch demand to get product_name, demand_type
  const demand = (await req('GET', `/rest/v1/b2b_demands?select=*&id=eq.${DEMAND_ID}`))[0]
  if (!demand) throw new Error('Demand not found')
  console.log(`Demand: ${demand.code}  type=${demand.demand_type}  product=${demand.product_name}  target=${demand.quantity_kg} kg`)

  let totalFilled = 0
  const created = []

  for (let i = 0; i < OFFERS.length; i++) {
    const offer = OFFERS[i]
    const dealNumber = genDealNumber()
    const lotCode = genLotCode(i)
    const totalValueVnd = offer.qty_kg * offer.price

    console.log(`\n── Offer ${i + 1} (${offer.id.slice(0, 8)}) ──`)
    console.log(`  qty=${offer.qty_kg} kg, price=${offer.price}đ/kg, drc=${offer.drc}%, region=${offer.region}`)
    console.log(`  dealNumber=${dealNumber}  lotCode=${lotCode}  total=${totalValueVnd}đ`)

    // 2. INSERT b2b_deals
    // NOTE: KHÔNG set offer_id vì FK của deals.offer_id trỏ tới b2b.supplier_offers
    // (bảng khác, đang rỗng) chứ không phải public.b2b_demand_offers nơi chứa offers.
    // Liên kết 1 chiều qua offer.deal_id sau khi tạo deal.
    const dealRows = await req('POST', '/rest/v1/b2b_deals', {
      deal_number: dealNumber,
      partner_id: PARTNER_ID,
      deal_type: demand.demand_type === 'purchase' ? 'purchase' : 'processing',
      product_name: demand.product_name,
      quantity_kg: offer.qty_kg,
      unit_price: offer.price,
      total_value_vnd: totalValueVnd,
      status: 'processing',
      demand_id: DEMAND_ID,
      processing_fee_per_ton: demand.processing_fee_per_ton || null,
      expected_output_rate: demand.expected_output_rate || null,
      notes: `Recovered from accepted offer ${offer.id.slice(0, 8)} for ${demand.code}`,
      lot_code: lotCode,
      source_region: offer.region,
      expected_drc: offer.drc,
    })
    const deal = dealRows[0]
    console.log(`  ✓ deal id=${deal.id}`)

    // 3. INSERT rubber_intake_batches
    const qtyTon = offer.qty_kg / 1000
    const pricePerTon = offer.price * 1000
    const totalAmount = qtyTon * pricePerTon
    let intakeId = null
    try {
      const intakeRows = await req('POST', '/rest/v1/rubber_intake_batches', {
        deal_id: deal.id,
        b2b_partner_id: PARTNER_ID,
        lot_code: lotCode,
        source_type: offer.region.toLowerCase().includes('lào') ? 'lao_direct' : 'vietnam',
        product_code: 'MU_TAP',
        intake_date: offer.delivery,
        net_weight_kg: offer.qty_kg,
        gross_weight_kg: offer.qty_kg,
        drc_percent: offer.drc,
        settled_qty_ton: qtyTon,
        settled_price_per_ton: pricePerTon,
        total_amount: totalAmount,
        location_name: offer.region,
        notes: `Recovered from offer ${offer.id.slice(0, 8)}`,
        status: 'draft',
      })
      intakeId = intakeRows[0]?.id
      console.log(`  ✓ rubber_intake id=${intakeId}`)
    } catch (e) {
      console.error(`  ✗ rubber_intake failed: ${e.message.slice(0, 200)}`)
    }

    // 4. UPDATE deal SET rubber_intake_id
    if (intakeId) {
      await req('PATCH', `/rest/v1/b2b_deals?id=eq.${deal.id}`, { rubber_intake_id: intakeId })
      console.log(`  ✓ deal.rubber_intake_id linked`)
    }

    // 5. UPDATE offer SET deal_id
    await req('PATCH', `/rest/v1/b2b_demand_offers?id=eq.${offer.id}`, { deal_id: deal.id })
    console.log(`  ✓ offer.deal_id linked`)

    totalFilled += offer.qty_kg
    created.push({ offer_id: offer.id, deal_id: deal.id, intake_id: intakeId, deal_number: dealNumber })
  }

  // 6. UPDATE demand quantity_filled_kg
  const newStatus = totalFilled >= demand.quantity_kg ? 'filled' : 'partially_filled'
  await req('PATCH', `/rest/v1/b2b_demands?id=eq.${DEMAND_ID}`, {
    quantity_filled_kg: totalFilled,
    status: newStatus,
  })
  console.log(`\n✓ demand.quantity_filled_kg = ${totalFilled} (status=${newStatus})`)

  console.log('\n=== SUMMARY ===')
  console.log(JSON.stringify(created, null, 2))
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
