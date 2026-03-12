// ============================================================================
// FILE: src/services/wms/rubberSupplierService.ts
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P3.5 — Bước 3.5.2
// MÔ TẢ: Quản lý NCC mủ — CRUD, thống kê, top suppliers
// BẢNG: rubber_suppliers
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export interface RubberSupplier {
  id: string
  code: string
  name: string
  supplier_type: 'tieu_dien' | 'dai_ly' | 'nong_truong' | 'cong_ty'
  phone?: string
  cccd?: string
  tax_code?: string
  address?: string
  // Vùng trồng
  province: string
  district?: string
  commune?: string
  // Thông tin vườn
  plantation_area_ha?: number
  rubber_variety?: string
  tree_age_years?: number
  tapping_system?: string
  // EUDR
  geo_latitude?: number
  geo_longitude?: number
  eudr_compliant?: boolean
  eudr_cert_expiry?: string
  // Thanh toán
  payment_method?: 'cash' | 'transfer' | 'debt'
  bank_name?: string
  bank_account?: string
  bank_holder?: string
  // Thống kê
  quality_rating: number
  avg_drc?: number
  total_weight_kg: number
  total_transactions: number
  // Meta
  notes?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface RubberSupplierFormData {
  name: string
  supplier_type: 'tieu_dien' | 'dai_ly' | 'nong_truong' | 'cong_ty'
  phone?: string
  cccd?: string
  tax_code?: string
  address?: string
  province: string
  district?: string
  commune?: string
  plantation_area_ha?: number | null
  rubber_variety?: string
  tree_age_years?: number | null
  tapping_system?: string
  geo_latitude?: number | null
  geo_longitude?: number | null
  eudr_compliant?: boolean
  eudr_cert_expiry?: string | null
  payment_method?: 'cash' | 'transfer' | 'debt'
  bank_name?: string
  bank_account?: string
  bank_holder?: string
  quality_rating?: number
  notes?: string
}

export interface RubberSupplierFilter {
  page?: number
  pageSize?: number
  search?: string
  supplier_type?: string
  province?: string
  is_active?: boolean
  sort_by?: 'name' | 'quality_rating' | 'total_weight_kg' | 'avg_drc' | 'created_at'
  sort_order?: 'asc' | 'desc'
}

export interface RubberSupplierStats {
  total_weight_kg: number
  total_transactions: number
  avg_drc: number
  monthly_weight: { month: string; weight: number }[]
  monthly_drc: { month: string; avg_drc: number }[]
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SUPPLIER_SELECT = `
  id, code, name, supplier_type, phone, cccd, tax_code, address,
  province, district, commune,
  plantation_area_ha, rubber_variety, tree_age_years, tapping_system,
  geo_latitude, geo_longitude, eudr_compliant, eudr_cert_expiry,
  payment_method, bank_name, bank_account, bank_holder,
  quality_rating, avg_drc, total_weight_kg, total_transactions,
  notes, is_active, created_at, updated_at
`

const SUPPLIER_LIST_SELECT = `
  id, code, name, supplier_type, phone, province, district,
  payment_method, quality_rating, avg_drc, total_weight_kg, total_transactions,
  is_active, created_at
`

// ============================================================================
// HELPERS
// ============================================================================

async function generateCode(): Promise<string> {
  const { data, error } = await supabase
    .from('rubber_suppliers')
    .select('code')
    .like('code', 'MU-%')
    .order('code', { ascending: false })
    .limit(1)

  if (error) throw error

  let seq = 1
  if (data && data.length > 0) {
    const lastCode = data[0].code
    const lastSeq = parseInt(lastCode.replace('MU-', ''), 10)
    if (!isNaN(lastSeq)) seq = lastSeq + 1
  }

  return `MU-${String(seq).padStart(3, '0')}`
}

// ============================================================================
// SERVICE
// ============================================================================

export const rubberSupplierService = {
  generateCode,

  // --------------------------------------------------------------------------
  // GET ALL — DS NCC mủ, phân trang, filter
  // --------------------------------------------------------------------------
  async getAll(params: RubberSupplierFilter = {}) {
    const {
      page = 1,
      pageSize = 20,
      search,
      supplier_type,
      province,
      is_active,
      sort_by = 'name',
      sort_order = 'asc',
    } = params

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('rubber_suppliers')
      .select(SUPPLIER_LIST_SELECT, { count: 'exact' })

    // Filters
    if (supplier_type) query = query.eq('supplier_type', supplier_type)
    if (province) query = query.eq('province', province)
    if (is_active !== undefined) query = query.eq('is_active', is_active)
    if (search) {
      query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%,phone.ilike.%${search}%,province.ilike.%${search}%`)
    }

    // Sort
    const ascending = sort_order === 'asc'
    query = query.order(sort_by, { ascending })

    // Paginate
    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) throw error

    return {
      data: (data || []) as RubberSupplier[],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    }
  },

  // --------------------------------------------------------------------------
  // GET ALL ACTIVE — Compact list cho dropdown
  // --------------------------------------------------------------------------
  async getAllActive() {
    const { data, error } = await supabase
      .from('rubber_suppliers')
      .select('id, code, name, supplier_type, phone, province, payment_method, avg_drc, quality_rating')
      .eq('is_active', true)
      .order('name')

    if (error) throw error
    return data || []
  },

  // --------------------------------------------------------------------------
  // GET BY ID — Chi tiết 1 NCC
  // --------------------------------------------------------------------------
  async getById(id: string): Promise<RubberSupplier | null> {
    const { data, error } = await supabase
      .from('rubber_suppliers')
      .select(SUPPLIER_SELECT)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data as RubberSupplier
  },

  // --------------------------------------------------------------------------
  // CREATE
  // --------------------------------------------------------------------------
  async create(formData: RubberSupplierFormData): Promise<RubberSupplier> {
    const code = await generateCode()

    const insertData = {
      code,
      name: formData.name,
      supplier_type: formData.supplier_type,
      phone: formData.phone || null,
      cccd: formData.cccd || null,
      tax_code: formData.tax_code || null,
      address: formData.address || null,
      province: formData.province,
      district: formData.district || null,
      commune: formData.commune || null,
      plantation_area_ha: formData.plantation_area_ha || null,
      rubber_variety: formData.rubber_variety || null,
      tree_age_years: formData.tree_age_years || null,
      tapping_system: formData.tapping_system || null,
      geo_latitude: formData.geo_latitude || null,
      geo_longitude: formData.geo_longitude || null,
      eudr_compliant: formData.eudr_compliant || false,
      eudr_cert_expiry: formData.eudr_cert_expiry || null,
      payment_method: formData.payment_method || 'cash',
      bank_name: formData.bank_name || null,
      bank_account: formData.bank_account || null,
      bank_holder: formData.bank_holder || null,
      quality_rating: formData.quality_rating || 3,
      notes: formData.notes || null,
      is_active: true,
    }

    const { data, error } = await supabase
      .from('rubber_suppliers')
      .insert(insertData)
      .select(SUPPLIER_SELECT)
      .single()

    if (error) throw error
    return data as RubberSupplier
  },

  // --------------------------------------------------------------------------
  // UPDATE
  // --------------------------------------------------------------------------
  async update(id: string, formData: Partial<RubberSupplierFormData>): Promise<RubberSupplier> {
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() }

    // Map form fields
    const fields = [
      'name', 'supplier_type', 'phone', 'cccd', 'tax_code', 'address',
      'province', 'district', 'commune',
      'plantation_area_ha', 'rubber_variety', 'tree_age_years', 'tapping_system',
      'geo_latitude', 'geo_longitude', 'eudr_compliant', 'eudr_cert_expiry',
      'payment_method', 'bank_name', 'bank_account', 'bank_holder',
      'quality_rating', 'notes',
    ]

    for (const field of fields) {
      if (field in formData) {
        updateData[field] = (formData as any)[field] ?? null
      }
    }

    const { data, error } = await supabase
      .from('rubber_suppliers')
      .update(updateData)
      .eq('id', id)
      .select(SUPPLIER_SELECT)
      .single()

    if (error) throw error
    return data as RubberSupplier
  },

  // --------------------------------------------------------------------------
  // TOGGLE ACTIVE
  // --------------------------------------------------------------------------
  async toggleActive(id: string): Promise<RubberSupplier> {
    // Get current state
    const current = await rubberSupplierService.getById(id)
    if (!current) throw new Error('Không tìm thấy NCC mủ')

    const { data, error } = await supabase
      .from('rubber_suppliers')
      .update({ is_active: !current.is_active, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(SUPPLIER_SELECT)
      .single()

    if (error) throw error
    return data as RubberSupplier
  },

  // --------------------------------------------------------------------------
  // GET STATS — Thống kê chi tiết 1 NCC
  // --------------------------------------------------------------------------
  async getStats(supplierId: string): Promise<RubberSupplierStats> {
    // Lấy tổng hợp
    const { data: tickets, error } = await supabase
      .from('rubber_intake_tickets')
      .select('net_weight_kg, drc_value, created_at')
      .eq('rubber_supplier_id', supplierId)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: true })

    if (error) throw error

    const records = tickets || []

    // Tổng
    const total_weight_kg = records.reduce((sum, t) => sum + (t.net_weight_kg || 0), 0)
    const total_transactions = records.length
    const drc_values = records.filter(t => t.drc_value).map(t => t.drc_value!)
    const avg_drc = drc_values.length > 0
      ? drc_values.reduce((a, b) => a + b, 0) / drc_values.length
      : 0

    // Theo tháng (6 tháng gần nhất)
    const monthMap: Record<string, { weight: number; drcs: number[]; }> = {}
    for (const t of records) {
      const month = t.created_at.substring(0, 7) // YYYY-MM
      if (!monthMap[month]) monthMap[month] = { weight: 0, drcs: [] }
      monthMap[month].weight += t.net_weight_kg || 0
      if (t.drc_value) monthMap[month].drcs.push(t.drc_value)
    }

    const months = Object.keys(monthMap).sort().slice(-6)
    const monthly_weight = months.map(m => ({ month: m, weight: monthMap[m].weight }))
    const monthly_drc = months.map(m => ({
      month: m,
      avg_drc: monthMap[m].drcs.length > 0
        ? monthMap[m].drcs.reduce((a, b) => a + b, 0) / monthMap[m].drcs.length
        : 0,
    }))

    return { total_weight_kg, total_transactions, avg_drc, monthly_weight, monthly_drc }
  },

  // --------------------------------------------------------------------------
  // GET TOP SUPPLIERS — Top NCC theo KL hoặc chất lượng
  // --------------------------------------------------------------------------
  async getTopSuppliers(limit: number = 10, sortBy: 'total_weight_kg' | 'quality_rating' | 'avg_drc' = 'total_weight_kg') {
    const { data, error } = await supabase
      .from('rubber_suppliers')
      .select('id, code, name, supplier_type, province, quality_rating, avg_drc, total_weight_kg, total_transactions')
      .eq('is_active', true)
      .order(sortBy, { ascending: false })
      .limit(limit)

    if (error) throw error
    return data || []
  },

  // --------------------------------------------------------------------------
  // GET DEBT SUMMARY — Tổng nợ theo NCC
  // --------------------------------------------------------------------------
  async getDebtSummary(supplierId?: string) {
    let query = supabase
      .from('rubber_intake_tickets')
      .select(`
        rubber_supplier_id,
        final_amount,
        paid_amount,
        rubber_supplier:rubber_suppliers(id, code, name, phone, supplier_type)
      `)
      .in('payment_status', ['debt', 'debt_partial'])
      .eq('status', 'confirmed')

    if (supplierId) {
      query = query.eq('rubber_supplier_id', supplierId)
    }

    const { data, error } = await query

    if (error) throw error

    // Group by supplier
    const supplierDebt: Record<string, {
      supplier: any
      total_debt: number
      total_paid: number
      remaining: number
      ticket_count: number
    }> = {}

    for (const ticket of (data || [])) {
      const sid = ticket.rubber_supplier_id
      if (!supplierDebt[sid]) {
        supplierDebt[sid] = {
          supplier: Array.isArray(ticket.rubber_supplier) ? ticket.rubber_supplier[0] : ticket.rubber_supplier,
          total_debt: 0,
          total_paid: 0,
          remaining: 0,
          ticket_count: 0,
        }
      }
      supplierDebt[sid].total_debt += ticket.final_amount || 0
      supplierDebt[sid].total_paid += ticket.paid_amount || 0
      supplierDebt[sid].remaining += (ticket.final_amount || 0) - (ticket.paid_amount || 0)
      supplierDebt[sid].ticket_count += 1
    }

    return Object.values(supplierDebt).sort((a, b) => b.remaining - a.remaining)
  },

  // --------------------------------------------------------------------------
  // GET PROVINCES — Danh sách tỉnh (cho filter)
  // --------------------------------------------------------------------------
  async getProvinces(): Promise<string[]> {
    const { data, error } = await supabase
      .from('rubber_suppliers')
      .select('province')
      .eq('is_active', true)
      .order('province')

    if (error) throw error

    const unique = [...new Set((data || []).map(d => d.province).filter(Boolean))]
    return unique
  },
}

export default rubberSupplierService