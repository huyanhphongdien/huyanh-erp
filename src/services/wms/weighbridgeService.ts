// ============================================================================
// FILE: src/services/wms/weighbridgeService.ts
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P7 — Trạm cân xe
// MÔ TẢ: CRUD phiếu cân, tạo mã tự động, cân Gross/Tare, tính Net,
//         liên kết phiếu nhập/xuất, gợi ý tare, autocomplete biển số
// BẢNG: weighbridge_tickets, weighbridge_images
// ============================================================================

import { supabase } from '../../lib/supabase'
import type {
  WeighbridgeTicket,
  WeighbridgeStatus,
  TicketType,
  WMSPaginationParams,
  PaginatedResponse,
} from './wms.types'

// ============================================================================
// CONSTANTS
// ============================================================================

const TICKET_SELECT = `
  *,
  images:weighbridge_images(*)
`

const TICKET_LIST_SELECT = `
  id, code, vehicle_plate, driver_name, ticket_type,
  gross_weight, tare_weight, net_weight,
  reference_type, reference_id,
  status, notes, created_by,
  gross_weighed_at, tare_weighed_at,
  completed_at, created_at, updated_at
`

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Tự sinh mã phiếu cân: CX-YYYYMMDD-XXX
 * VD: CX-20260225-001, CX-20260225-002
 */
async function generateCode(): Promise<string> {
  const now = new Date()
  const yyyy = String(now.getFullYear())
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const prefix = `CX-${yyyy}${mm}${dd}-`

  const { data, error } = await supabase
    .from('weighbridge_tickets')
    .select('code')
    .like('code', `${prefix}%`)
    .order('code', { ascending: false })
    .limit(1)

  if (error) throw error

  let nextNum = 1
  if (data && data.length > 0) {
    const lastCode = data[0].code
    const lastNum = parseInt(lastCode.split('-').pop() || '0', 10)
    nextNum = lastNum + 1
  }

  return `${prefix}${String(nextNum).padStart(3, '0')}`
}

// ============================================================================
// CREATE
// ============================================================================

export interface CreateTicketData {
  vehicle_plate: string
  driver_name?: string
  ticket_type: TicketType
  reference_type?: string
  reference_id?: string
  notes?: string
}

/**
 * Tạo phiếu cân mới — status = 'weighing_gross'
 */
async function create(data: CreateTicketData, userId?: string): Promise<WeighbridgeTicket> {
  const code = await generateCode()

  const { data: ticket, error } = await supabase
    .from('weighbridge_tickets')
    .insert({
      code,
      vehicle_plate: data.vehicle_plate.toUpperCase().trim(),
      driver_name: data.driver_name?.trim() || null,
      ticket_type: data.ticket_type,
      reference_type: data.reference_type || null,
      reference_id: data.reference_id || null,
      notes: data.notes || null,
      status: 'weighing_gross' as WeighbridgeStatus,
      created_by: userId || null,
    })
    .select(TICKET_SELECT)
    .single()

  if (error) throw error
  return ticket
}

// ============================================================================
// UPDATE WEIGHTS
// ============================================================================

/**
 * Cập nhật Gross weight (cân lần 1)
 * → status chuyển sang 'weighing_tare'
 */
async function updateGrossWeight(
  id: string,
  weight: number,
  userId?: string
): Promise<WeighbridgeTicket> {
  const { data, error } = await supabase
    .from('weighbridge_tickets')
    .update({
      gross_weight: weight,
      gross_weighed_at: new Date().toISOString(),
      gross_weighed_by: userId || null,
      status: 'weighing_tare' as WeighbridgeStatus,
    })
    .eq('id', id)
    .eq('status', 'weighing_gross')
    .select(TICKET_SELECT)
    .single()

  if (error) throw error
  return data
}

/**
 * Cập nhật Tare weight (cân lần 2) + tính Net
 * → KHÔNG chuyển status (chờ complete)
 */
async function updateTareWeight(
  id: string,
  weight: number,
  userId?: string
): Promise<WeighbridgeTicket> {
  // Lấy gross trước để tính net
  const { data: ticket, error: fetchError } = await supabase
    .from('weighbridge_tickets')
    .select('gross_weight')
    .eq('id', id)
    .single()

  if (fetchError) throw fetchError
  if (!ticket?.gross_weight) throw new Error('Chưa có Gross weight')

  const netWeight = Math.abs(ticket.gross_weight - weight)

  const { data, error } = await supabase
    .from('weighbridge_tickets')
    .update({
      tare_weight: weight,
      net_weight: netWeight,
      tare_weighed_at: new Date().toISOString(),
      tare_weighed_by: userId || null,
    })
    .eq('id', id)
    .eq('status', 'weighing_tare')
    .select(TICKET_SELECT)
    .single()

  if (error) throw error
  return data
}

// ============================================================================
// STATUS TRANSITIONS
// ============================================================================

/**
 * Hoàn tất phiếu cân → status = 'completed'
 */
async function complete(id: string): Promise<WeighbridgeTicket> {
  const { data, error } = await supabase
    .from('weighbridge_tickets')
    .update({
      status: 'completed' as WeighbridgeStatus,
      completed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .in('status', ['weighing_tare'])
    .select(TICKET_SELECT)
    .single()

  if (error) throw error
  return data
}

/**
 * Hủy phiếu cân → status = 'cancelled'
 */
async function cancel(id: string, reason?: string): Promise<WeighbridgeTicket> {
  const updates: Record<string, unknown> = {
    status: 'cancelled' as WeighbridgeStatus,
  }
  if (reason) {
    updates.notes = reason
  }

  const { data, error } = await supabase
    .from('weighbridge_tickets')
    .update(updates)
    .eq('id', id)
    .in('status', ['weighing_gross', 'weighing_tare'])
    .select(TICKET_SELECT)
    .single()

  if (error) throw error
  return data
}

// ============================================================================
// READ
// ============================================================================

/**
 * Danh sách phiếu cân — phân trang, filter
 */
async function getAll(params: WMSPaginationParams & {
  ticket_type?: TicketType
  vehicle_plate?: string
}): Promise<PaginatedResponse<WeighbridgeTicket>> {
  const { page = 1, pageSize = 20, search, status, from_date, to_date, ticket_type, vehicle_plate } = params
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('weighbridge_tickets')
    .select(TICKET_LIST_SELECT, { count: 'exact' })

  if (status) query = query.eq('status', status)
  if (ticket_type) query = query.eq('ticket_type', ticket_type)
  if (vehicle_plate) query = query.ilike('vehicle_plate', `%${vehicle_plate}%`)
  if (from_date) query = query.gte('created_at', from_date)
  if (to_date) query = query.lte('created_at', to_date + 'T23:59:59.999Z')

  if (search) {
    query = query.or(`code.ilike.%${search}%,vehicle_plate.ilike.%${search}%,driver_name.ilike.%${search}%`)
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw error

  const total = count || 0
  return {
    data: data || [],
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

/**
 * Chi tiết phiếu cân — join images
 */
async function getById(id: string): Promise<WeighbridgeTicket | null> {
  const { data, error } = await supabase
    .from('weighbridge_tickets')
    .select(TICKET_SELECT)
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return data
}

// ============================================================================
// LINK REFERENCE
// ============================================================================

/**
 * Liên kết phiếu cân ↔ phiếu nhập/xuất/PO
 */
async function linkToReference(
  id: string,
  referenceType: string,
  referenceId: string
): Promise<WeighbridgeTicket> {
  const { data, error } = await supabase
    .from('weighbridge_tickets')
    .update({
      reference_type: referenceType,
      reference_id: referenceId,
    })
    .eq('id', id)
    .select(TICKET_SELECT)
    .single()

  if (error) throw error
  return data
}

/**
 * Xóa liên kết
 */
async function unlinkReference(id: string): Promise<WeighbridgeTicket> {
  const { data, error } = await supabase
    .from('weighbridge_tickets')
    .update({
      reference_type: null,
      reference_id: null,
    })
    .eq('id', id)
    .select(TICKET_SELECT)
    .single()

  if (error) throw error
  return data
}

// ============================================================================
// SMART FEATURES
// ============================================================================

/**
 * Lịch sử cân gần nhất theo biển số → gợi ý Tare weight
 */
async function getRecentByPlate(plate: string, limit = 5): Promise<WeighbridgeTicket[]> {
  const { data, error } = await supabase
    .from('weighbridge_tickets')
    .select(TICKET_LIST_SELECT)
    .ilike('vehicle_plate', plate.trim())
    .eq('status', 'completed')
    .not('tare_weight', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}

/**
 * Gợi ý Tare weight trung bình cho biển số
 */
async function getSuggestedTare(plate: string): Promise<{
  avgTare: number | null
  lastTare: number | null
  count: number
}> {
  const recents = await getRecentByPlate(plate, 10)
  
  if (recents.length === 0) {
    return { avgTare: null, lastTare: null, count: 0 }
  }

  const tares = recents.filter(t => t.tare_weight != null).map(t => t.tare_weight!)
  const avgTare = tares.length > 0 
    ? Math.round(tares.reduce((a, b) => a + b, 0) / tares.length) 
    : null

  return {
    avgTare,
    lastTare: recents[0]?.tare_weight || null,
    count: recents.length,
  }
}

/**
 * Autocomplete biển số từ lịch sử cân
 */
async function getPlateHistory(search?: string, limit = 20): Promise<string[]> {
  let query = supabase
    .from('weighbridge_tickets')
    .select('vehicle_plate')
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(200)

  if (search && search.length >= 2) {
    query = query.ilike('vehicle_plate', `%${search}%`)
  }

  const { data, error } = await query

  if (error) throw error

  // Deduplicate + limit
  const unique = [...new Set((data || []).map(d => d.vehicle_plate))]
  return unique.slice(0, limit)
}

/**
 * Thống kê nhanh — dùng cho header dashboard
 */
async function getStats(fromDate?: string, toDate?: string): Promise<{
  totalTickets: number
  completedToday: number
  inProgress: number
  totalNetWeight: number
}> {
  const today = new Date().toISOString().split('T')[0]

  // Đang cân (chưa hoàn tất)
  const { count: inProgress } = await supabase
    .from('weighbridge_tickets')
    .select('id', { count: 'exact', head: true })
    .in('status', ['weighing_gross', 'weighing_tare'])

  // Hoàn tất hôm nay
  const { data: todayData, count: completedToday } = await supabase
    .from('weighbridge_tickets')
    .select('net_weight', { count: 'exact' })
    .eq('status', 'completed')
    .gte('completed_at', `${today}T00:00:00.000Z`)
    .lte('completed_at', `${today}T23:59:59.999Z`)

  // Tổng net weight hôm nay
  const totalNetWeight = (todayData || [])
    .reduce((sum, t) => sum + (t.net_weight || 0), 0)

  // Tổng phiếu (theo range nếu có)
  let totalQuery = supabase
    .from('weighbridge_tickets')
    .select('id', { count: 'exact', head: true })
  
  if (fromDate) totalQuery = totalQuery.gte('created_at', fromDate)
  if (toDate) totalQuery = totalQuery.lte('created_at', toDate + 'T23:59:59.999Z')

  const { count: totalTickets } = await totalQuery

  return {
    totalTickets: totalTickets || 0,
    completedToday: completedToday || 0,
    inProgress: inProgress || 0,
    totalNetWeight: Math.round(totalNetWeight * 100) / 100,
  }
}

/**
 * Lấy phiếu cân theo reference — kiểm tra phiếu nhập/xuất đã có cân chưa
 */
async function getByReference(
  referenceType: string,
  referenceId: string
): Promise<WeighbridgeTicket | null> {
  const { data, error } = await supabase
    .from('weighbridge_tickets')
    .select(TICKET_SELECT)
    .eq('reference_type', referenceType)
    .eq('reference_id', referenceId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}

/**
 * Cập nhật ghi chú
 */
async function updateNotes(id: string, notes: string): Promise<WeighbridgeTicket> {
  const { data, error } = await supabase
    .from('weighbridge_tickets')
    .update({ notes })
    .eq('id', id)
    .select(TICKET_SELECT)
    .single()

  if (error) throw error
  return data
}

// ============================================================================
// EXPORT
// ============================================================================

export const weighbridgeService = {
  generateCode,
  create,
  updateGrossWeight,
  updateTareWeight,
  complete,
  cancel,
  getAll,
  getById,
  linkToReference,
  unlinkReference,
  getRecentByPlate,
  getSuggestedTare,
  getPlateHistory,
  getStats,
  getByReference,
  updateNotes,
}

export default weighbridgeService