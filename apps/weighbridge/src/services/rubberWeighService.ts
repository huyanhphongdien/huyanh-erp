import { supabase } from '@erp/lib/supabase'

// ============================================================================
// Rubber-specific weighing calculations and auto-actions
// ============================================================================

export interface RubberWeighData {
  deal_id?: string
  partner_id?: string
  supplier_id?: string
  supplier_name?: string
  rubber_type?: string
  rubber_grade?: string
  expected_drc?: number
  unit_price?: number
  price_unit?: 'wet' | 'dry'
  vehicle_type?: string
  destination?: string
  deduction_kg?: number
}

export interface WeightCalculation {
  net_weight: number
  deduction_kg: number
  actual_net_weight: number
  dry_weight_estimate: number | null
  estimated_value: number | null
}

/** Calculate weights and estimated value */
export function calculateWeights(
  gross: number,
  tare: number,
  opts: {
    deduction_kg?: number
    expected_drc?: number
    unit_price?: number
    price_unit?: 'wet' | 'dry'
  },
): WeightCalculation {
  const net_weight = Math.abs(gross - tare)
  const deduction_kg = opts.deduction_kg || 0
  const actual_net_weight = net_weight - deduction_kg

  let dry_weight_estimate: number | null = null
  let estimated_value: number | null = null

  if (opts.expected_drc && opts.expected_drc > 0) {
    dry_weight_estimate = Math.round(actual_net_weight * (opts.expected_drc / 100) * 100) / 100
  }

  if (opts.unit_price && opts.unit_price > 0) {
    if (opts.price_unit === 'dry' && dry_weight_estimate != null) {
      estimated_value = Math.round(dry_weight_estimate * opts.unit_price)
    } else {
      estimated_value = Math.round(actual_net_weight * opts.unit_price)
    }
  }

  return { net_weight, deduction_kg, actual_net_weight, dry_weight_estimate, estimated_value }
}

/** Save rubber-specific fields to weighbridge_tickets after creation */
export async function saveRubberFields(ticketId: string, data: RubberWeighData) {
  const updateData: Record<string, unknown> = {}

  if (data.deal_id) updateData.deal_id = data.deal_id
  if (data.partner_id) updateData.partner_id = data.partner_id
  if (data.supplier_id) updateData.supplier_id = data.supplier_id
  if (data.supplier_name) updateData.supplier_name = data.supplier_name
  if (data.rubber_type) updateData.rubber_type = data.rubber_type
  if (data.rubber_grade) updateData.rubber_grade = data.rubber_grade
  if (data.expected_drc != null) updateData.expected_drc = data.expected_drc
  if (data.unit_price != null) updateData.unit_price = data.unit_price
  if (data.price_unit) updateData.price_unit = data.price_unit
  if (data.vehicle_type) updateData.vehicle_type = data.vehicle_type
  if (data.destination) updateData.destination = data.destination
  if (data.deduction_kg != null) updateData.deduction_kg = data.deduction_kg

  if (Object.keys(updateData).length === 0) return

  const { error } = await supabase
    .from('weighbridge_tickets')
    .update(updateData)
    .eq('id', ticketId)

  if (error) console.error('saveRubberFields error:', error)
}

/** Save calculated values after weighing complete */
export async function saveCalculatedValues(
  ticketId: string,
  calc: WeightCalculation,
) {
  const { error } = await supabase
    .from('weighbridge_tickets')
    .update({
      deduction_kg: calc.deduction_kg,
      actual_net_weight: calc.actual_net_weight,
      estimated_value: calc.estimated_value,
    })
    .eq('id', ticketId)

  if (error) console.error('saveCalculatedValues error:', error)
}

/** Get rubber suppliers for dropdown */
export async function getRubberSuppliers() {
  const { data, error } = await supabase
    .from('rubber_suppliers')
    .select('id, code, name, phone, address, supplier_type')
    .order('name')

  if (error) return []
  return data || []
}
