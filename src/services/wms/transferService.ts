// ============================================================================
// TRANSFER SERVICE — Inter-facility transfer (F3)
// File: src/services/wms/transferService.ts
//
// Quản lý phiếu chuyển kho liên nhà máy (TL/LAO → PD).
// State machine: draft → picking → picked → in_transit → arrived → received
// (cancelled/rejected từ bất cứ state nào trước received)
// ============================================================================

import { supabase } from '../../lib/supabase'
import type { Material, StockBatch } from './wms.types'

// ============================================================================
// TYPES
// ============================================================================

export type TransferStatus =
  | 'draft'
  | 'picking'
  | 'picked'
  | 'in_transit'
  | 'arrived'
  | 'received'
  | 'cancelled'
  | 'rejected'

export interface TransferFacility {
  id: string
  code: string
  name: string
  country?: string
}

export interface TransferWarehouse {
  id: string
  code: string
  name: string
  facility_id?: string | null
}

export interface InterFacilityTransfer {
  id: string
  code: string

  from_facility_id: string
  from_warehouse_id: string
  from_facility?: TransferFacility
  from_warehouse?: TransferWarehouse

  to_facility_id: string
  to_warehouse_id: string
  to_facility?: TransferFacility
  to_warehouse?: TransferWarehouse

  status: TransferStatus

  vehicle_plate?: string | null
  driver_name?: string | null
  driver_phone?: string | null

  weighbridge_out_id?: string | null
  weighbridge_in_id?: string | null

  weight_out_kg?: number | null
  weight_in_kg?: number | null
  loss_kg?: number | null      // computed
  loss_pct?: number | null     // computed (%, e.g. 0.42 = 0.42%)

  loss_threshold_pct: number   // mặc định 0.5
  needs_approval: boolean
  approved_by?: string | null
  approved_at?: string | null
  approval_note?: string | null

  stock_out_order_id?: string | null
  stock_in_order_id?: string | null

  notes?: string | null
  created_by?: string | null
  created_at: string
  updated_at: string
  picked_at?: string | null
  shipped_at?: string | null
  arrived_at?: string | null
  received_at?: string | null
  cancelled_at?: string | null

  items?: TransferItem[]
}

export interface TransferItem {
  id: string
  transfer_id: string
  material_id: string
  material?: Material
  source_batch_id?: string | null
  source_batch?: StockBatch

  quantity_planned?: number | null
  weight_planned_kg?: number | null

  destination_batch_id?: string | null
  quantity_received?: number | null
  weight_received_kg?: number | null

  notes?: string | null
  created_at: string
}

export interface CreateTransferInput {
  from_facility_id: string
  from_warehouse_id: string
  to_facility_id: string
  to_warehouse_id: string
  vehicle_plate?: string
  driver_name?: string
  driver_phone?: string
  loss_threshold_pct?: number
  notes?: string
  items: Array<{
    material_id: string
    source_batch_id?: string | null
    quantity_planned: number
    weight_planned_kg: number
    notes?: string
  }>
}

const SELECT_FULL = `
  *,
  from_facility:facilities!from_facility_id(id, code, name, country),
  from_warehouse:warehouses!from_warehouse_id(id, code, name, facility_id),
  to_facility:facilities!to_facility_id(id, code, name, country),
  to_warehouse:warehouses!to_warehouse_id(id, code, name, facility_id),
  items:inter_facility_transfer_items(
    *,
    material:materials(id, sku, name, unit, weight_per_unit),
    source_batch:stock_batches!source_batch_id(id, batch_no, quantity_remaining, current_weight, latest_drc, rubber_grade)
  )
`

const SELECT_LIST = `
  id, code, status,
  from_facility_id, to_facility_id,
  from_warehouse_id, to_warehouse_id,
  vehicle_plate, driver_name,
  weight_out_kg, weight_in_kg, loss_kg, loss_pct,
  needs_approval, approved_at,
  shipped_at, arrived_at, received_at,
  created_at, updated_at,
  from_facility:facilities!from_facility_id(id, code, name),
  to_facility:facilities!to_facility_id(id, code, name),
  from_warehouse:warehouses!from_warehouse_id(id, code, name),
  to_warehouse:warehouses!to_warehouse_id(id, code, name)
`

// ============================================================================
// CODE GENERATION — TR-YYYYMMDD-NNN
// ============================================================================

async function generateCode(): Promise<string> {
  const now = new Date()
  const yyyymmdd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const prefix = `TR-${yyyymmdd}-`

  const { data, error } = await supabase
    .from('inter_facility_transfers')
    .select('code')
    .like('code', `${prefix}%`)
    .order('code', { ascending: false })
    .limit(1)

  if (error) throw error

  let next = 1
  if (data && data.length > 0) {
    const last = data[0].code
    const lastNum = parseInt(last.split('-').pop() || '0', 10)
    next = lastNum + 1
  }
  return `${prefix}${String(next).padStart(3, '0')}`
}

// ============================================================================
// CREATE
// ============================================================================

async function create(input: CreateTransferInput, userId?: string): Promise<InterFacilityTransfer> {
  if (input.from_facility_id === input.to_facility_id) {
    throw new Error('Không thể chuyển trong cùng 1 nhà máy')
  }
  if (!input.items || input.items.length === 0) {
    throw new Error('Phiếu chuyển phải có ít nhất 1 mặt hàng')
  }

  const code = await generateCode()

  const { data: transfer, error: errT } = await supabase
    .from('inter_facility_transfers')
    .insert({
      code,
      from_facility_id: input.from_facility_id,
      from_warehouse_id: input.from_warehouse_id,
      to_facility_id: input.to_facility_id,
      to_warehouse_id: input.to_warehouse_id,
      vehicle_plate: input.vehicle_plate?.toUpperCase().trim() || null,
      driver_name: input.driver_name?.trim() || null,
      driver_phone: input.driver_phone?.trim() || null,
      loss_threshold_pct: input.loss_threshold_pct ?? 0.5,
      notes: input.notes || null,
      status: 'draft' as TransferStatus,
      created_by: userId || null,
    })
    .select('id, code')
    .single()

  if (errT) throw errT

  const itemRows = input.items.map((it) => ({
    transfer_id: transfer.id,
    material_id: it.material_id,
    source_batch_id: it.source_batch_id || null,
    quantity_planned: it.quantity_planned,
    weight_planned_kg: it.weight_planned_kg,
    notes: it.notes || null,
  }))

  const { error: errI } = await supabase
    .from('inter_facility_transfer_items')
    .insert(itemRows)

  if (errI) {
    // rollback transfer if items insert fail
    await supabase.from('inter_facility_transfers').delete().eq('id', transfer.id)
    throw errI
  }

  return getById(transfer.id) as Promise<InterFacilityTransfer>
}

// ============================================================================
// READ
// ============================================================================

async function getById(id: string): Promise<InterFacilityTransfer | null> {
  const { data, error } = await supabase
    .from('inter_facility_transfers')
    .select(SELECT_FULL)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return data as unknown as InterFacilityTransfer | null
}

async function getAll(params?: {
  status?: TransferStatus | TransferStatus[]
  from_facility_id?: string
  to_facility_id?: string
  from_date?: string
  to_date?: string
  search?: string
  page?: number
  pageSize?: number
}): Promise<{ data: InterFacilityTransfer[]; total: number }> {
  const { page = 1, pageSize = 50 } = params || {}
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let q = supabase
    .from('inter_facility_transfers')
    .select(SELECT_LIST, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (params?.status) {
    if (Array.isArray(params.status)) q = q.in('status', params.status)
    else q = q.eq('status', params.status)
  }
  if (params?.from_facility_id) q = q.eq('from_facility_id', params.from_facility_id)
  if (params?.to_facility_id) q = q.eq('to_facility_id', params.to_facility_id)
  if (params?.from_date) q = q.gte('created_at', params.from_date)
  if (params?.to_date) q = q.lte('created_at', params.to_date + 'T23:59:59.999Z')
  if (params?.search) {
    q = q.or(`code.ilike.%${params.search}%,vehicle_plate.ilike.%${params.search}%,driver_name.ilike.%${params.search}%`)
  }

  const { data, count, error } = await q
  if (error) throw error
  return { data: (data as unknown as InterFacilityTransfer[]) || [], total: count || 0 }
}

/** Lấy phiếu transfer theo weighbridge ticket (cho sub-app cân auto-link) */
async function getByWeighbridge(ticketId: string, side: 'out' | 'in'): Promise<InterFacilityTransfer | null> {
  const col = side === 'out' ? 'weighbridge_out_id' : 'weighbridge_in_id'
  const { data, error } = await supabase
    .from('inter_facility_transfers')
    .select(SELECT_FULL)
    .eq(col, ticketId)
    .maybeSingle()
  if (error) throw error
  return data as unknown as InterFacilityTransfer | null
}

/** Lấy danh sách transfer đang ở status cần cân tại facility nào đó (cho dropdown ở app cân) */
async function getPendingForWeighOut(fromFacilityId: string): Promise<InterFacilityTransfer[]> {
  const { data, error } = await supabase
    .from('inter_facility_transfers')
    .select(SELECT_LIST)
    .eq('from_facility_id', fromFacilityId)
    .in('status', ['draft', 'picking', 'picked'])
    .is('weighbridge_out_id', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as unknown as InterFacilityTransfer[]) || []
}

async function getPendingForWeighIn(toFacilityId: string): Promise<InterFacilityTransfer[]> {
  const { data, error } = await supabase
    .from('inter_facility_transfers')
    .select(SELECT_LIST)
    .eq('to_facility_id', toFacilityId)
    .in('status', ['in_transit', 'arrived'])
    .is('weighbridge_in_id', null)
    .order('shipped_at', { ascending: true })  // FIFO — xe đến trước cân trước
  if (error) throw error
  return (data as unknown as InterFacilityTransfer[]) || []
}

// ============================================================================
// STATE TRANSITIONS
// ============================================================================

async function startPicking(id: string, userId?: string): Promise<void> {
  const { error } = await supabase
    .from('inter_facility_transfers')
    .update({ status: 'picking' as TransferStatus })
    .eq('id', id)
    .eq('status', 'draft')
  if (error) throw error
  void userId  // reserved for future audit
}

async function markPicked(id: string, userId?: string): Promise<void> {
  const { error } = await supabase
    .from('inter_facility_transfers')
    .update({
      status: 'picked' as TransferStatus,
      picked_at: new Date().toISOString(),
    })
    .eq('id', id)
    .in('status', ['draft', 'picking'])
  if (error) throw error
  void userId
}

/**
 * Khi cân OUT tại NM gửi xong → link ticket + chuyển status in_transit + trừ kho gửi.
 * Tạo stock_out_order với reason='transfer' để có audit trail.
 */
async function confirmShipped(input: {
  transfer_id: string
  weighbridge_ticket_id: string
  weight_out_kg: number
  user_id?: string
}): Promise<void> {
  const t = await getById(input.transfer_id)
  if (!t) throw new Error('Phiếu transfer không tồn tại')
  if (!['draft', 'picking', 'picked'].includes(t.status)) {
    throw new Error(`Không thể cân xuất ở trạng thái ${t.status}`)
  }
  if (!t.items || t.items.length === 0) {
    throw new Error('Phiếu transfer không có items')
  }

  // 1. Tạo stock_out_order ở NM gửi (reason='transfer', auto-confirm)
  const stockOutCode = `XK-TR-${t.code.replace('TR-', '')}`
  const totalQty = t.items.reduce((s, i) => s + (i.quantity_planned || 0), 0)
  const totalWeight = t.items.reduce((s, i) => s + (i.weight_planned_kg || 0), 0)

  const { data: stockOut, error: errSO } = await supabase
    .from('stock_out_orders')
    .insert({
      code: stockOutCode,
      type: 'finished',
      warehouse_id: t.from_warehouse_id,
      reason: 'transfer',
      customer_name: `Transfer to ${t.to_facility?.name || t.to_facility_id.slice(0, 8)}`,
      customer_order_ref: t.code,
      total_quantity: totalQty,
      total_weight: totalWeight,
      weighbridge_ticket_id: input.weighbridge_ticket_id,
      transfer_id: t.id,
      status: 'confirmed',
      notes: `Auto-tạo từ phiếu chuyển ${t.code}`,
      created_by: input.user_id || null,
      confirmed_by: input.user_id || null,
      confirmed_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (errSO) throw errSO

  // 2. Insert stock_out_details + trừ stock_batches/levels (giống stockOutService.confirm)
  for (const item of t.items) {
    const { error: errDetail } = await supabase
      .from('stock_out_details')
      .insert({
        stock_out_id: stockOut.id,
        material_id: item.material_id,
        batch_id: item.source_batch_id || null,
        quantity: item.quantity_planned || 0,
        weight: item.weight_planned_kg || 0,
        picking_status: 'picked',
        picked_at: new Date().toISOString(),
        picked_by: input.user_id || null,
      })
    if (errDetail) throw errDetail

    // Trừ stock_batches.quantity_remaining (theo COUNT)
    if (item.source_batch_id && item.quantity_planned) {
      const { data: batch } = await supabase
        .from('stock_batches')
        .select('quantity_remaining, current_weight')
        .eq('id', item.source_batch_id)
        .single()
      if (batch) {
        const newQty = (batch.quantity_remaining || 0) - item.quantity_planned
        const newWeight = (batch.current_weight || 0) - (item.weight_planned_kg || 0)
        await supabase
          .from('stock_batches')
          .update({
            quantity_remaining: Math.max(0, newQty),
            current_weight: Math.max(0, newWeight),
            status: newQty <= 0 ? 'depleted' : 'active',
          })
          .eq('id', item.source_batch_id)
      }
    }

    // Trừ stock_levels.quantity (theo KG)
    const { data: level } = await supabase
      .from('stock_levels')
      .select('quantity')
      .eq('warehouse_id', t.from_warehouse_id)
      .eq('material_id', item.material_id)
      .maybeSingle()
    if (level) {
      await supabase
        .from('stock_levels')
        .update({ quantity: Math.max(0, (level.quantity || 0) - (item.weight_planned_kg || 0)) })
        .eq('warehouse_id', t.from_warehouse_id)
        .eq('material_id', item.material_id)
    }

    // Inventory transaction log
    await supabase.from('inventory_transactions').insert({
      type: 'out',
      warehouse_id: t.from_warehouse_id,
      material_id: item.material_id,
      batch_id: item.source_batch_id || null,
      quantity: -(item.weight_planned_kg || 0),
      reference_type: 'transfer',
      reference_id: t.id,
      notes: `Chuyển kho: ${t.code}`,
      created_by: null,  // Skip FK strict (audit only)
    })
  }

  // 3. Update transfer
  const { error: errU } = await supabase
    .from('inter_facility_transfers')
    .update({
      status: 'in_transit' as TransferStatus,
      weighbridge_out_id: input.weighbridge_ticket_id,
      weight_out_kg: input.weight_out_kg,
      stock_out_order_id: stockOut.id,
      shipped_at: new Date().toISOString(),
    })
    .eq('id', t.id)
  if (errU) throw errU
}

/** Đánh dấu xe đã đến NM nhận (manual hoặc auto khi tài xế bấm) */
async function markArrived(id: string, _userId?: string): Promise<void> {
  const { error } = await supabase
    .from('inter_facility_transfers')
    .update({
      status: 'arrived' as TransferStatus,
      arrived_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'in_transit')
  if (error) throw error
}

/**
 * Khi cân IN tại NM nhận xong → tính hao hụt + cộng kho nhận (nếu pass threshold).
 * Tạo stock_in_order với source_type='transfer'.
 */
async function confirmReceived(input: {
  transfer_id: string
  weighbridge_ticket_id: string
  weight_in_kg: number
  user_id?: string
}): Promise<{ needs_approval: boolean; loss_pct: number }> {
  const t = await getById(input.transfer_id)
  if (!t) throw new Error('Phiếu transfer không tồn tại')
  if (!['in_transit', 'arrived'].includes(t.status)) {
    throw new Error(`Không thể cân nhận ở trạng thái ${t.status}`)
  }
  if (!t.weight_out_kg) throw new Error('Phiếu chưa có cân xuất')

  const lossKg = t.weight_out_kg - input.weight_in_kg
  const lossPct = (lossKg / t.weight_out_kg) * 100
  const threshold = t.loss_threshold_pct || 0.5
  const needsApproval = lossPct > threshold

  // 1. Update transfer với weight_in + flag
  const { error: errU } = await supabase
    .from('inter_facility_transfers')
    .update({
      weighbridge_in_id: input.weighbridge_ticket_id,
      weight_in_kg: input.weight_in_kg,
      arrived_at: t.arrived_at || new Date().toISOString(),
      needs_approval: needsApproval,
      // Nếu không cần duyệt → auto received luôn
      status: (needsApproval ? 'arrived' : 'received') as TransferStatus,
      received_at: needsApproval ? null : new Date().toISOString(),
    })
    .eq('id', t.id)
  if (errU) throw errU

  // 2. Nếu OK → tạo stock_in_order ngay
  if (!needsApproval) {
    await _createStockInForReceived(t, input.weight_in_kg, input.user_id)
  }

  return { needs_approval: needsApproval, loss_pct: Math.round(lossPct * 1000) / 1000 }
}

/** Approve transfer khi hao hụt vượt threshold */
async function approveReceived(input: {
  transfer_id: string
  approved_by: string
  approval_note?: string
}): Promise<void> {
  const t = await getById(input.transfer_id)
  if (!t) throw new Error('Phiếu transfer không tồn tại')
  if (t.status !== 'arrived' || !t.needs_approval) {
    throw new Error('Phiếu này không cần duyệt')
  }
  if (!t.weight_in_kg) throw new Error('Phiếu chưa có cân nhận')

  const { error } = await supabase
    .from('inter_facility_transfers')
    .update({
      status: 'received' as TransferStatus,
      approved_by: input.approved_by,
      approved_at: new Date().toISOString(),
      approval_note: input.approval_note || null,
      received_at: new Date().toISOString(),
    })
    .eq('id', t.id)
  if (error) throw error

  await _createStockInForReceived(t, t.weight_in_kg, input.approved_by)
}

/** Reject transfer khi hao hụt quá lớn — KHÔNG cộng kho nhận, log để điều tra */
async function rejectReceived(input: {
  transfer_id: string
  rejected_by: string
  reason: string
}): Promise<void> {
  const { error } = await supabase
    .from('inter_facility_transfers')
    .update({
      status: 'rejected' as TransferStatus,
      approval_note: `[REJECTED] ${input.reason}`,
      approved_by: input.rejected_by,
      approved_at: new Date().toISOString(),
    })
    .eq('id', input.transfer_id)
  if (error) throw error
}

/** Cancel — chỉ ở draft/picking, KHÔNG hoàn lại kho (vì chưa trừ) */
async function cancel(id: string, _userId?: string, reason?: string): Promise<void> {
  const { error } = await supabase
    .from('inter_facility_transfers')
    .update({
      status: 'cancelled' as TransferStatus,
      cancelled_at: new Date().toISOString(),
      notes: reason ? `[CANCELLED] ${reason}` : '[CANCELLED]',
    })
    .eq('id', id)
    .in('status', ['draft', 'picking', 'picked'])
  if (error) throw error
}

// ============================================================================
// INTERNAL: tạo stock_in_order khi transfer received (chia tỉ lệ theo cân thực)
// ============================================================================

async function _createStockInForReceived(
  transfer: InterFacilityTransfer,
  weightInKg: number,
  userId?: string,
): Promise<void> {
  if (!transfer.items || transfer.items.length === 0) return

  // Tỷ lệ thực nhận / dự kiến để chia phần weight cho từng item
  const totalPlanned = transfer.items.reduce((s, i) => s + (i.weight_planned_kg || 0), 0)
  const ratio = totalPlanned > 0 ? weightInKg / totalPlanned : 1

  const stockInCode = `NK-TR-${transfer.code.replace('TR-', '')}`
  const totalQtyReceived = transfer.items.reduce((s, i) => s + (i.quantity_planned || 0), 0)

  const { data: stockIn, error: errSI } = await supabase
    .from('stock_in_orders')
    .insert({
      code: stockInCode,
      type: 'finished',
      warehouse_id: transfer.to_warehouse_id,
      source_type: 'transfer',
      transfer_id: transfer.id,
      total_quantity: totalQtyReceived,
      total_weight: weightInKg,
      status: 'confirmed',
      notes: `Auto-tạo từ phiếu chuyển ${transfer.code} (cân nhận ${weightInKg.toLocaleString('vi-VN')} kg)`,
      created_by: userId || null,
      confirmed_by: userId || null,
      confirmed_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (errSI) throw errSI

  for (const item of transfer.items) {
    const itemWeightReceived = Math.round((item.weight_planned_kg || 0) * ratio * 100) / 100
    const itemQtyReceived = item.quantity_planned || 0  // qty không phụ thuộc cân (vì cân là tổng)

    // Tạo batch mới ở NM nhận (nguồn từ batch cũ ở NM gửi)
    // Schema thực: stock_batches dùng parent_batch_id (KHÔNG source_batch_id),
    // batch_type='production' (chưa có 'transfer'), không có cột notes →
    // dùng contamination_notes thay
    const newBatchCode = `${transfer.code}-${item.material_id.slice(0, 6)}`
    const sourceBatch = item.source_batch as any
    const { data: newBatch, error: batchErr } = await supabase
      .from('stock_batches')
      .insert({
        batch_no: newBatchCode,
        material_id: item.material_id,
        warehouse_id: transfer.to_warehouse_id,
        quantity_remaining: itemQtyReceived,
        initial_quantity: itemQtyReceived,
        initial_weight: itemWeightReceived,
        current_weight: itemWeightReceived,
        unit: 'bành',
        status: 'active',
        batch_type: 'production',
        parent_batch_id: item.source_batch_id || null,
        rubber_grade: sourceBatch?.rubber_grade || null,
        rubber_type: sourceBatch?.rubber_grade ? sourceBatch.rubber_grade.toLowerCase() : null,
        latest_drc: sourceBatch?.latest_drc || null,
        qc_status: 'passed',
        received_date: new Date().toISOString().split('T')[0],
        contamination_status: 'clean',
        contamination_notes: `Chuyển từ ${transfer.from_facility?.code || ''} (${transfer.code})`,
      })
      .select('id')
      .single()
    if (batchErr) console.error('[transferService] insert batch failed:', batchErr)

    // Stock-in detail (column là stock_in_id không phải stock_in_order_id)
    await supabase.from('stock_in_details').insert({
      stock_in_id: stockIn.id,
      material_id: item.material_id,
      batch_id: newBatch?.id || null,
      quantity: itemQtyReceived,
      weight: itemWeightReceived,
    })

    // Update transfer item với destination batch + actual received
    await supabase
      .from('inter_facility_transfer_items')
      .update({
        destination_batch_id: newBatch?.id || null,
        quantity_received: itemQtyReceived,
        weight_received_kg: itemWeightReceived,
      })
      .eq('id', item.id)

    // Cộng stock_levels NM nhận
    const { data: level } = await supabase
      .from('stock_levels')
      .select('quantity')
      .eq('warehouse_id', transfer.to_warehouse_id)
      .eq('material_id', item.material_id)
      .maybeSingle()
    if (level) {
      await supabase
        .from('stock_levels')
        .update({ quantity: (level.quantity || 0) + itemWeightReceived })
        .eq('warehouse_id', transfer.to_warehouse_id)
        .eq('material_id', item.material_id)
    } else {
      await supabase.from('stock_levels').insert({
        warehouse_id: transfer.to_warehouse_id,
        material_id: item.material_id,
        quantity: itemWeightReceived,
      })
    }

    // Inventory transaction log
    await supabase.from('inventory_transactions').insert({
      type: 'in',
      warehouse_id: transfer.to_warehouse_id,
      material_id: item.material_id,
      batch_id: newBatch?.id || null,
      quantity: itemWeightReceived,
      reference_type: 'transfer',
      reference_id: transfer.id,
      notes: `Nhận chuyển kho: ${transfer.code}`,
      created_by: null,  // Skip FK strict (audit only)
    })
  }

  // Update transfer với stock_in_order_id
  await supabase
    .from('inter_facility_transfers')
    .update({ stock_in_order_id: stockIn.id })
    .eq('id', transfer.id)
}

// ============================================================================
// STATS — cho dashboard "Đang vận chuyển"
// ============================================================================

async function getInTransitSummary(): Promise<{
  count: number
  total_weight_kg: number
  by_route: Array<{ from_code: string; to_code: string; count: number; weight_kg: number }>
}> {
  const { data, error } = await supabase
    .from('v_transfers_in_transit')
    .select('*')
  if (error) throw error

  const rows = (data || []) as any[]
  const total_weight_kg = rows.reduce((s, r) => s + (r.weight_out_kg || 0), 0)

  const map = new Map<string, { count: number; weight: number; from_code: string; to_code: string }>()
  for (const r of rows) {
    const key = `${r.from_facility_code}→${r.to_facility_code}`
    const ex = map.get(key)
    if (ex) {
      ex.count++
      ex.weight += r.weight_out_kg || 0
    } else {
      map.set(key, {
        count: 1,
        weight: r.weight_out_kg || 0,
        from_code: r.from_facility_code,
        to_code: r.to_facility_code,
      })
    }
  }

  return {
    count: rows.length,
    total_weight_kg: Math.round(total_weight_kg * 100) / 100,
    by_route: Array.from(map.values()).map((v) => ({
      from_code: v.from_code,
      to_code: v.to_code,
      count: v.count,
      weight_kg: Math.round(v.weight * 100) / 100,
    })),
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

const transferService = {
  generateCode,
  create,
  getById,
  getAll,
  getByWeighbridge,
  getPendingForWeighOut,
  getPendingForWeighIn,
  startPicking,
  markPicked,
  confirmShipped,
  markArrived,
  confirmReceived,
  approveReceived,
  rejectReceived,
  cancel,
  getInTransitSummary,
}

export default transferService
