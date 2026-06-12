// ============================================================================
// FILE: src/services/logistics/fleetService.ts
// MODULE: Vận tải / Đội xe — danh mục Tài xế + Phương tiện (đầu kéo/rơ-moóc/xe khác)
// BẢNG: fleet_drivers, fleet_vehicles
// Đặc thù: đầu kéo gắn 1 tài xế cố định (default_driver_id); rơ-moóc đổi liên tục.
// ============================================================================

import { supabase } from '../../lib/supabase'

export type VehicleKind = 'tractor' | 'trailer' | 'other'

export const VEHICLE_KIND_LABELS: Record<VehicleKind, string> = {
  tractor: 'Đầu kéo',
  trailer: 'Rơ-moóc',
  other: 'Xe khác',
}

export interface FleetDriver {
  id: string
  code: string | null
  full_name: string
  phone: string | null
  id_no: string | null
  license_no: string | null
  license_class: string | null
  dob: string | null
  address: string | null
  note: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface FleetVehicle {
  id: string
  plate: string
  kind: VehicleKind
  internal_code: string | null
  brand: string | null
  year_made: number | null
  capacity_kg: number | null
  capacity_note: string | null
  chassis_no: string | null
  engine_no: string | null
  color: string | null
  default_driver_id: string | null
  inspection_expiry: string | null
  transit_expiry: string | null
  transit_note: string | null
  badge_expiry: string | null
  cavet_expiry: string | null
  border_gate: string | null
  purpose: string | null
  note: string | null
  active: boolean
  created_at: string
  updated_at: string
  // resolved (join)
  default_driver?: Pick<FleetDriver, 'id' | 'full_name' | 'phone' | 'license_no'> | null
}

export type DriverInput = Partial<Omit<FleetDriver, 'id' | 'created_at' | 'updated_at'>> & { full_name: string }
export type VehicleInput = Partial<Omit<FleetVehicle, 'id' | 'created_at' | 'updated_at' | 'default_driver'>> & { plate: string; kind: VehicleKind }

const VEHICLE_SELECT = `
  *,
  default_driver:fleet_drivers!default_driver_id(id, full_name, phone, license_no)
`

// ============================================================================
// TÀI XẾ
// ============================================================================

async function listDrivers(params: { active?: boolean; search?: string } = {}): Promise<FleetDriver[]> {
  let q = supabase.from('fleet_drivers').select('*').order('full_name', { ascending: true })
  if (params.active !== undefined) q = q.eq('active', params.active)
  if (params.search) q = q.or(`full_name.ilike.%${params.search}%,phone.ilike.%${params.search}%,license_no.ilike.%${params.search}%`)
  const { data, error } = await q
  if (error) throw error
  return (data || []) as FleetDriver[]
}

async function createDriver(input: DriverInput): Promise<FleetDriver> {
  const { data, error } = await supabase.from('fleet_drivers').insert(cleanDriver(input)).select('*').single()
  if (error) throw error
  return data as FleetDriver
}

async function updateDriver(id: string, patch: Partial<DriverInput>): Promise<FleetDriver> {
  const { data, error } = await supabase.from('fleet_drivers').update(cleanDriver(patch)).eq('id', id).select('*').single()
  if (error) throw error
  return data as FleetDriver
}

async function removeDriver(id: string): Promise<void> {
  const { error } = await supabase.from('fleet_drivers').delete().eq('id', id)
  if (error) throw error
}

function cleanDriver(d: Partial<DriverInput>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const k of ['code', 'full_name', 'phone', 'id_no', 'license_no', 'license_class', 'dob', 'address', 'note', 'active'] as const) {
    if (d[k] !== undefined) out[k] = d[k] === '' ? null : d[k]
  }
  return out
}

// ============================================================================
// PHƯƠNG TIỆN
// ============================================================================

async function listVehicles(params: { kind?: VehicleKind; active?: boolean; search?: string } = {}): Promise<FleetVehicle[]> {
  let q = supabase.from('fleet_vehicles').select(VEHICLE_SELECT).order('kind', { ascending: true }).order('plate', { ascending: true })
  if (params.kind) q = q.eq('kind', params.kind)
  if (params.active !== undefined) q = q.eq('active', params.active)
  if (params.search) q = q.or(`plate.ilike.%${params.search}%,internal_code.ilike.%${params.search}%,brand.ilike.%${params.search}%`)
  const { data, error } = await q
  if (error) throw error
  return (data || []).map(normalizeVehicle)
}

async function createVehicle(input: VehicleInput): Promise<FleetVehicle> {
  const { data, error } = await supabase.from('fleet_vehicles').insert(cleanVehicle(input)).select(VEHICLE_SELECT).single()
  if (error) throw error
  return normalizeVehicle(data)
}

async function updateVehicle(id: string, patch: Partial<VehicleInput>): Promise<FleetVehicle> {
  const { data, error } = await supabase.from('fleet_vehicles').update(cleanVehicle(patch)).eq('id', id).select(VEHICLE_SELECT).single()
  if (error) throw error
  return normalizeVehicle(data)
}

async function removeVehicle(id: string): Promise<void> {
  const { error } = await supabase.from('fleet_vehicles').delete().eq('id', id)
  if (error) throw error
}

function cleanVehicle(v: Partial<VehicleInput>): Record<string, any> {
  const out: Record<string, any> = {}
  const keys = ['plate', 'kind', 'internal_code', 'brand', 'year_made', 'capacity_kg', 'capacity_note',
    'chassis_no', 'engine_no', 'color', 'default_driver_id', 'inspection_expiry', 'transit_expiry',
    'transit_note', 'badge_expiry', 'cavet_expiry', 'border_gate', 'purpose', 'note', 'active'] as const
  for (const k of keys) {
    if (v[k] !== undefined) out[k] = v[k] === '' ? null : v[k]
  }
  // Rơ-moóc/xe khác KHÔNG gắn tài xế cố định
  if (out.kind && out.kind !== 'tractor') out.default_driver_id = null
  return out
}

function normalizeVehicle(row: any): FleetVehicle {
  return {
    ...row,
    capacity_kg: row.capacity_kg != null ? Number(row.capacity_kg) : null,
    default_driver: Array.isArray(row.default_driver) ? row.default_driver[0] || null : row.default_driver,
  } as FleetVehicle
}

// ============================================================================
// CẢNH BÁO HẾT HẠN (đăng kiểm / phù hiệu)
// ============================================================================

export interface ExpiryWarning {
  vehicle: FleetVehicle
  field: 'inspection_expiry' | 'badge_expiry'
  label: string
  date: string
  days_left: number   // âm = đã quá hạn
}

/** Liệt kê phương tiện sắp/đã hết hạn đăng kiểm hoặc phù hiệu trong `days` ngày tới. */
async function listExpiringSoon(days = 30): Promise<ExpiryWarning[]> {
  const vehicles = await listVehicles({ active: true })
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const warnings: ExpiryWarning[] = []

  const check = (v: FleetVehicle, field: 'inspection_expiry' | 'badge_expiry', label: string) => {
    const raw = v[field]
    if (!raw) return
    const d = new Date(raw + 'T00:00:00')
    if (isNaN(d.getTime())) return
    const daysLeft = Math.round((d.getTime() - today.getTime()) / 86400000)
    if (daysLeft <= days) {
      warnings.push({ vehicle: v, field, label, date: raw, days_left: daysLeft })
    }
  }

  for (const v of vehicles) {
    check(v, 'inspection_expiry', 'Đăng kiểm')
    check(v, 'badge_expiry', 'Phù hiệu')
  }
  return warnings.sort((a, b) => a.days_left - b.days_left)
}

// ============================================================================
// EXPORT
// ============================================================================

export const fleetService = {
  // drivers
  listDrivers,
  createDriver,
  updateDriver,
  removeDriver,
  // vehicles
  listVehicles,
  createVehicle,
  updateVehicle,
  removeVehicle,
  // warnings
  listExpiringSoon,
}

export default fleetService
