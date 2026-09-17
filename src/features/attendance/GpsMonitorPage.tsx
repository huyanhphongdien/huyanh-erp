// ============================================================================
// GPS MONITOR PAGE — Giám sát GPS chấm công
// File: src/features/attendance/GpsMonitorPage.tsx
// ============================================================================
// Luật 16/09/2026: điện thoại/tablet phải có toạ độ trong bán kính nhà máy (3 km),
// máy tính bỏ qua. Trang này để HCNS/BGĐ theo dõi luật chạy thế nào ở từng điểm
// (Phong Điền, Tân Lâm, Lào): ai chấm ở đâu, bằng thiết bị gì, ai bị chặn và vì sao.
// Nguồn: attendance (lượt thành công) + attendance_gps_rejections (lượt bị chặn).
// ============================================================================

import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  MapPin, Smartphone, Monitor, Tablet, ShieldCheck, ShieldOff, RefreshCw,
  ExternalLink, Loader2, AlertTriangle, HelpCircle,
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import { attendanceService } from '../../services/attendanceService'
import type { GPSConfig, GPSLocation } from '../../services/attendanceService'

// ============================================================================
// TYPES
// ============================================================================

type RangeDays = 7 | 14 | 30

interface EmpLite {
  code: string | null
  full_name: string
  department?: { name: string } | null
}

interface CheckInRow {
  id: string
  date: string
  check_in_time: string | null
  check_in_lat: number | null
  check_in_lng: number | null
  check_in_device: string | null
  check_in_ip: string | null
  is_gps_verified: boolean
  employee: EmpLite | null
}

interface RejectionRow {
  id: string
  attempted_at: string
  lat: number | null
  lng: number | null
  accuracy_m: number | null
  distance_m: number | null
  nearest_name: string | null
  radius_m: number | null
  device: string | null
  ip: string | null
  reason: string
  employee: EmpLite | null
}

type DeviceKind = 'mobile' | 'tablet' | 'desktop' | 'unknown'

// ============================================================================
// HELPERS
// ============================================================================

const vnDate = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' })

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function fmtDist(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '—'
  return m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

/** "<loại>|<userAgent>" → loại. Dòng trước 16/09/2026 không có device → unknown. */
function deviceKind(device: string | null): DeviceKind {
  const k = (device || '').split('|')[0]
  return k === 'mobile' || k === 'tablet' || k === 'desktop' ? k : 'unknown'
}

const DEVICE_LABEL: Record<DeviceKind, string> = {
  mobile: 'Điện thoại', tablet: 'Tablet', desktop: 'Máy tính', unknown: 'Chưa rõ (bản cũ)',
}

function DeviceIcon({ kind, size = 14 }: { kind: DeviceKind; size?: number }) {
  if (kind === 'mobile') return <Smartphone size={size} />
  if (kind === 'tablet') return <Tablet size={size} />
  if (kind === 'desktop') return <Monitor size={size} />
  return <HelpCircle size={size} />
}

function nearestOf(lat: number, lng: number, cfg: GPSConfig | null | undefined): { loc: GPSLocation; dist: number } | null {
  if (!cfg?.locations?.length) return null
  let best: { loc: GPSLocation; dist: number } | null = null
  for (const loc of cfg.locations) {
    const d = haversine(lat, lng, loc.latitude, loc.longitude)
    if (!best || d < best.dist) best = { loc, dist: d }
  }
  return best
}

const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`

// ── Sắp xếp cột (bấm tiêu đề) ──
type SortDir = 'asc' | 'desc'
interface SortState<K extends string> { key: K; dir: SortDir }
type SortVal = string | number | null | undefined

/** Cột số/thời gian mặc định giảm dần (mới nhất / xa nhất trước), cột chữ tăng dần. */
const DESC_FIRST = new Set(['time', 'distance'])

function toggleSort<K extends string>(s: SortState<K>, key: K): SortState<K> {
  if (s.key === key) return { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
  return { key, dir: DESC_FIRST.has(key) ? 'desc' : 'asc' }
}

function sortRows<T>(rows: T[], get: (r: T) => SortVal, dir: SortDir): T[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const va = get(a), vb = get(b)
    // null/rỗng luôn xuống cuối, bất kể chiều
    if (va == null || va === '') return vb == null || vb === '' ? 0 : 1
    if (vb == null || vb === '') return -1
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sign
    return String(va).localeCompare(String(vb), 'vi', { numeric: true, sensitivity: 'base' }) * sign
  })
}

function SortTh<K extends string>({ label, k, sort, onSort, align = 'left', className = '' }: {
  label: React.ReactNode; k: K; sort: SortState<K>; onSort: (k: K) => void; align?: 'left' | 'right'; className?: string
}) {
  const active = sort.key === k
  return (
    <th
      onClick={() => onSort(k)}
      title="Bấm để sắp xếp"
      className={`${align === 'right' ? 'text-right' : 'text-left'} px-3 py-2 cursor-pointer select-none whitespace-nowrap hover:text-gray-900 ${active ? 'text-gray-900' : ''} ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={`text-[10px] ${active ? 'text-emerald-700' : 'text-gray-300'}`}>{active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </span>
    </th>
  )
}

type RejSortKey = 'time' | 'employee' | 'dept' | 'reason' | 'distance' | 'device' | 'ip'
type RowSortKey = 'time' | 'employee' | 'dept' | 'device' | 'loc' | 'distance' | 'ip'

/** Điện thoại không có tiêu đề cột để bấm → chọn cách xếp bằng ô chọn (ẩn từ sm trở lên). */
function SortSelect<K extends string>({ value, options, onChange }: {
  value: SortState<K>
  options: { key: K; dir: SortDir; label: string }[]
  onChange: (s: SortState<K>) => void
}) {
  const cur = `${value.key}:${value.dir}`
  const known = options.some(o => `${o.key}:${o.dir}` === cur)
  return (
    <select
      value={known ? cur : '__custom'}
      onChange={e => {
        const [k, d] = e.target.value.split(':') as [K, SortDir]
        if (k && d) onChange({ key: k, dir: d })
      }}
      className="sm:hidden text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white text-gray-700 max-w-full"
      aria-label="Sắp xếp"
    >
      {!known && <option value="__custom">Đang xếp theo cột…</option>}
      {options.map(o => (
        <option key={`${o.key}:${o.dir}`} value={`${o.key}:${o.dir}`}>{o.label}</option>
      ))}
    </select>
  )
}

const REJ_SORT_OPTIONS: { key: RejSortKey; dir: SortDir; label: string }[] = [
  { key: 'time', dir: 'desc', label: 'Mới nhất trước' },
  { key: 'time', dir: 'asc', label: 'Cũ nhất trước' },
  { key: 'distance', dir: 'desc', label: 'Xa nhà máy nhất' },
  { key: 'employee', dir: 'asc', label: 'Tên A → Z' },
  { key: 'dept', dir: 'asc', label: 'Theo phòng' },
  { key: 'reason', dir: 'asc', label: 'Theo lý do' },
]
const ROW_SORT_OPTIONS: { key: RowSortKey; dir: SortDir; label: string }[] = [
  { key: 'time', dir: 'desc', label: 'Mới nhất trước' },
  { key: 'time', dir: 'asc', label: 'Cũ nhất trước' },
  { key: 'distance', dir: 'desc', label: 'Xa nhà máy nhất' },
  { key: 'employee', dir: 'asc', label: 'Tên A → Z' },
  { key: 'dept', dir: 'asc', label: 'Theo phòng' },
  { key: 'loc', dir: 'asc', label: 'Theo điểm' },
  { key: 'device', dir: 'asc', label: 'Theo thiết bị' },
]

/** Nhãn nhân viên + phòng, dùng chung cho bảng và thẻ điện thoại. */
function EmpCell({ e }: { e: EmpLite | null }) {
  return (
    <>
      <div className="font-medium text-gray-900">{e?.full_name || '—'}</div>
      <div className="text-xs text-gray-500">{e?.department?.name || ''}</div>
    </>
  )
}

function MapLink({ lat, lng, className = '' }: { lat: number | null | undefined; lng: number | null | undefined; className?: string }) {
  if (lat == null || lng == null) return <span className="text-gray-300">—</span>
  return (
    <a href={mapsUrl(Number(lat), Number(lng))} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 text-emerald-700 text-xs ${className}`}>
      Bản đồ <ExternalLink size={12} />
    </a>
  )
}

const REASON_LABEL: Record<string, string> = {
  no_gps: 'Không lấy được toạ độ',
  out_of_range: 'Ngoài phạm vi',
}
function reasonLabel(r: string): string {
  if (REASON_LABEL[r]) return REASON_LABEL[r]
  if (r.startsWith('db:')) return `DB chặn: ${r.slice(3)}`
  return r
}

// ============================================================================
// DATA
// ============================================================================

const EMP_SELECT = 'employee:employees!attendance_employee_id_fkey(code, full_name, department:departments!employees_department_id_fkey(name))'

async function fetchCheckIns(fromDate: string): Promise<CheckInRow[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select(`id, date, check_in_time, check_in_lat, check_in_lng, check_in_device, check_in_ip, is_gps_verified, ${EMP_SELECT}`)
    .gte('date', fromDate)
    .not('check_in_time', 'is', null)
    .order('check_in_time', { ascending: false })
    .limit(4000)
  if (error) throw error
  return (data || []) as unknown as CheckInRow[]
}

async function fetchRejections(fromIso: string): Promise<RejectionRow[]> {
  const { data, error } = await supabase
    .from('attendance_gps_rejections')
    .select('id, attempted_at, lat, lng, accuracy_m, distance_m, nearest_name, radius_m, device, ip, reason, employee:employees!attendance_gps_rejections_employee_id_fkey(code, full_name, department:departments!employees_department_id_fkey(name))')
    .gte('attempted_at', fromIso)
    .order('attempted_at', { ascending: false })
    .limit(1000)
  if (error) throw error
  return (data || []) as unknown as RejectionRow[]
}

// ============================================================================
// PAGE
// ============================================================================

export default function GpsMonitorPage() {
  const { user } = useAuthStore()
  const [range, setRange] = useState<RangeDays>(14)
  const [locFilter, setLocFilter] = useState<string>('all')
  const [rejSort, setRejSort] = useState<SortState<RejSortKey>>({ key: 'time', dir: 'desc' })
  const [rowSort, setRowSort] = useState<SortState<RowSortKey>>({ key: 'time', dir: 'desc' })

  // Cùng ngưỡng với Sidebar (managerOnly): admin hoặc cấp ≤ 5
  const isAdmin = user?.role === 'admin'
  const level = (user as any)?.position_level ?? 7
  const allowed = isAdmin || level <= 5

  const fromDate = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - (range - 1))
    return vnDate(d)
  }, [range])
  const fromIso = useMemo(() => new Date(`${fromDate}T00:00:00+07:00`).toISOString(), [fromDate])

  const cfgQ = useQuery({ queryKey: ['gps-config'], queryFn: () => attendanceService.getGPSConfig(), staleTime: 5 * 60 * 1000 })
  const rowsQ = useQuery({ queryKey: ['gps-monitor-checkins', fromDate], queryFn: () => fetchCheckIns(fromDate), enabled: allowed, staleTime: 60 * 1000 })
  const rejQ = useQuery({ queryKey: ['gps-monitor-rejections', fromIso], queryFn: () => fetchRejections(fromIso), enabled: allowed, staleTime: 60 * 1000 })

  const cfg = cfgQ.data
  const locations = cfg?.locations || []

  // ── Phân loại từng lượt thành công ──
  const classified = useMemo(() => {
    return (rowsQ.data || []).map(r => {
      const kind = deviceKind(r.check_in_device)
      const hasCoords = r.check_in_lat != null && r.check_in_lng != null
      const near = hasCoords ? nearestOf(Number(r.check_in_lat), Number(r.check_in_lng), cfg) : null
      const inRange = !!near && near.dist <= (near.loc.radius_meters || 0)
      const locName = hasCoords ? (inRange ? near!.loc.name : 'Ngoài mọi điểm') : 'Không có toạ độ'
      return { r, kind, hasCoords, near, inRange, locName }
    })
  }, [rowsQ.data, cfg])

  // ── Tổng hợp theo điểm ──
  const summary = useMemo(() => {
    const names = [...locations.map(l => l.name), 'Ngoài mọi điểm', 'Không có toạ độ']
    const init = () => ({ total: 0, mobile: 0, tablet: 0, desktop: 0, unknown: 0, verified: 0, people: new Set<string>() })
    const m = new Map<string, ReturnType<typeof init>>()
    names.forEach(n => m.set(n, init()))
    for (const c of classified) {
      const s = m.get(c.locName) || (m.set(c.locName, init()), m.get(c.locName)!)
      s.total++
      s[c.kind]++
      if (c.r.is_gps_verified) s.verified++
      if (c.r.employee?.code) s.people.add(c.r.employee.code)
    }
    return names.map(n => ({ name: n, ...m.get(n)! }))
  }, [classified, locations])

  const filtered = useMemo(() => {
    const list = locFilter === 'all' ? classified : classified.filter(c => c.locName === locFilter)
    // Chỉ liệt kê những lượt đáng xem: không verify, ngoài điểm, không toạ độ, bản cũ
    const rows = list.filter(c => !c.r.is_gps_verified || !c.inRange)
    const get: Record<RowSortKey, (c: typeof rows[number]) => SortVal> = {
      time: c => c.r.check_in_time,
      employee: c => c.r.employee?.full_name,
      dept: c => c.r.employee?.department?.name,
      device: c => DEVICE_LABEL[c.kind],
      loc: c => c.locName,
      distance: c => c.near?.dist ?? null,
      ip: c => c.r.check_in_ip,
    }
    return sortRows(rows, get[rowSort.key], rowSort.dir).slice(0, 300)
  }, [classified, locFilter, rowSort])

  const rejections = useMemo(() => {
    const list = rejQ.data || []
    const scoped = locFilter === 'all'
      ? list
      : list.filter(x => (x.nearest_name || 'Không có toạ độ') === locFilter || (locFilter === 'Không có toạ độ' && x.lat == null))
    const get: Record<RejSortKey, (x: RejectionRow) => SortVal> = {
      time: x => x.attempted_at,
      employee: x => x.employee?.full_name,
      dept: x => x.employee?.department?.name,
      reason: x => reasonLabel(x.reason),
      distance: x => (x.distance_m == null ? null : Number(x.distance_m)),
      device: x => DEVICE_LABEL[deviceKind(x.device)],
      ip: x => x.ip,
    }
    return sortRows(scoped, get[rejSort.key], rejSort.dir)
  }, [rejQ.data, locFilter, rejSort])

  if (!allowed) {
    return (
      <div className="p-6 text-center text-gray-500">
        <ShieldOff className="mx-auto mb-2" />
        Trang này dành cho quản lý / HCNS.
      </div>
    )
  }

  const loading = rowsQ.isLoading || rejQ.isLoading || cfgQ.isLoading

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <MapPin className="text-emerald-700" size={22} /> Giám sát GPS chấm công
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Điện thoại/tablet phải trong bán kính điểm cho phép; máy tính bỏ qua GPS. Theo dõi từng điểm và các lượt bị chặn.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {([7, 14, 30] as RangeDays[]).map(d => (
            <button
              key={d}
              onClick={() => setRange(d)}
              className={`flex-1 sm:flex-none px-3 py-2 sm:py-1.5 rounded-lg text-sm border min-h-[40px] ${range === d ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
            >
              {d} ngày
            </button>
          ))}
          <button
            onClick={() => { rowsQ.refetch(); rejQ.refetch(); cfgQ.refetch() }}
            className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 min-h-[40px] min-w-[40px] flex items-center justify-center"
            title="Tải lại"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Cấu hình đang áp dụng */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold text-gray-800">Điểm cho phép điểm danh</h2>
          <span className={`text-xs px-2 py-0.5 rounded-full ${cfg?.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
            {cfg?.enabled ? 'Đang ép GPS trên điện thoại' : 'GPS đang TẮT'}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {locations.map(l => (
            <div key={l.name} className="rounded-lg border border-gray-200 p-3 text-sm">
              <div className="font-medium text-gray-900">{l.name}</div>
              <div className="text-gray-500 mt-0.5">
                Bán kính <b>{fmtDist(l.radius_meters)}</b> · {l.latitude.toFixed(4)}, {l.longitude.toFixed(4)}
              </div>
              <a href={mapsUrl(l.latitude, l.longitude)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-700 mt-1 text-xs">
                Xem trên bản đồ <ExternalLink size={12} />
              </a>
            </div>
          ))}
          {locations.length === 0 && <div className="text-sm text-gray-500">Chưa cấu hình điểm nào.</div>}
        </div>
      </div>

      {/* Tổng hợp theo điểm */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold text-gray-800">Lượt điểm danh thành công theo điểm — {range} ngày</h2>
          <span className="text-xs text-gray-500">{classified.length} lượt · từ {fromDate}</span>
        </div>
        {/* Điện thoại: thẻ theo điểm */}
        <div className="sm:hidden divide-y divide-gray-100">
          {summary.map(s => {
            const warn = (s.name === 'Ngoài mọi điểm' || s.name === 'Không có toạ độ') && s.total > 0
            const active = locFilter === s.name
            const pct = s.total > 0 ? Math.round((s.verified / s.total) * 100) : 0
            return (
              <button
                key={s.name}
                onClick={() => setLocFilter(active ? 'all' : s.name)}
                className={`w-full text-left px-4 py-3 ${active ? 'bg-emerald-50' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-gray-900 inline-flex items-center gap-1.5">
                    {warn && <AlertTriangle size={14} className="text-amber-600 shrink-0" />}
                    {s.name}
                  </span>
                  <span className="text-sm text-gray-700 tabular-nums whitespace-nowrap"><b>{s.total}</b> lượt · {s.people.size} người</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700"><Smartphone size={12} /> {s.mobile}</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700"><Tablet size={12} /> {s.tablet}</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700"><Monitor size={12} /> {s.desktop}</span>
                  {s.unknown > 0 && <span className="px-2 py-0.5 rounded-full bg-gray-50 text-gray-400">bản cũ {s.unknown}</span>}
                  <span className="ml-auto inline-flex items-center gap-1 text-emerald-700 font-medium"><ShieldCheck size={12} /> {s.verified} ({pct}%)</span>
                </div>
              </button>
            )
          })}
        </div>
        {/* Máy tính: bảng */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-2">Điểm</th>
                <th className="text-right px-3 py-2">Lượt</th>
                <th className="text-right px-3 py-2">Người</th>
                <th className="text-right px-3 py-2"><span className="inline-flex items-center gap-1"><Smartphone size={13} /> Điện thoại</span></th>
                <th className="text-right px-3 py-2"><span className="inline-flex items-center gap-1"><Tablet size={13} /> Tablet</span></th>
                <th className="text-right px-3 py-2"><span className="inline-flex items-center gap-1"><Monitor size={13} /> Máy tính</span></th>
                <th className="text-right px-3 py-2">Bản cũ</th>
                <th className="text-right px-4 py-2"><span className="inline-flex items-center gap-1"><ShieldCheck size={13} /> GPS xác minh</span></th>
              </tr>
            </thead>
            <tbody>
              {summary.map(s => {
                const warn = (s.name === 'Ngoài mọi điểm' || s.name === 'Không có toạ độ') && s.total > 0
                return (
                  <tr
                    key={s.name}
                    onClick={() => setLocFilter(locFilter === s.name ? 'all' : s.name)}
                    className={`border-t border-gray-100 cursor-pointer ${locFilter === s.name ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}
                  >
                    <td className="px-4 py-2 font-medium text-gray-900 flex items-center gap-2">
                      {warn && <AlertTriangle size={14} className="text-amber-600" />}
                      {s.name}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.total}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.people.size}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.mobile}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.tablet}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.desktop}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-400">{s.unknown}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {s.verified}
                      {s.total > 0 && <span className="text-gray-400 ml-1">({Math.round((s.verified / s.total) * 100)}%)</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 text-xs text-gray-500 border-t border-gray-100">
          Bấm vào một dòng để lọc hai bảng dưới. "Bản cũ" = lượt chấm bằng bản app trước 16/09 (chưa ghi loại thiết bị).
          "Ngoài mọi điểm" chỉ còn có thể là máy tính — điện thoại đã bị chặn từ 16/09.
        </div>
      </div>

      {/* Lượt bị chặn */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <ShieldOff size={16} className="text-red-600" /> Lượt bị chặn ({rejections.length})
            {locFilter !== 'all' && <span className="text-xs font-normal text-gray-500">— lọc: {locFilter}</span>}
          </h2>
          <span className="hidden sm:inline text-xs text-gray-500">Ai cố điểm danh bằng điện thoại ngoài phạm vi / không bật định vị</span>
          <SortSelect value={rejSort} options={REJ_SORT_OPTIONS} onChange={setRejSort} />
        </div>
        {rejQ.isLoading ? (
          <div className="p-6 text-center text-gray-400"><Loader2 className="animate-spin inline mr-2" size={16} />Đang tải…</div>
        ) : rejections.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">Không có lượt bị chặn trong khoảng này.</div>
        ) : (<>
          {/* Điện thoại: thẻ */}
          <div className="sm:hidden divide-y divide-gray-100">
            {rejections.map(x => {
              const kind = deviceKind(x.device)
              return (
                <div key={x.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><EmpCell e={x.employee} /></div>
                    <div className="text-xs text-gray-500 tabular-nums whitespace-nowrap">{fmtTime(x.attempted_at)}</div>
                  </div>
                  <div className="mt-1 text-sm text-red-700">
                    {reasonLabel(x.reason)}
                    {x.distance_m != null && <> · cách {x.nearest_name} <b>{fmtDist(Number(x.distance_m))}</b></>}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1"><DeviceIcon kind={kind} size={12} /> {DEVICE_LABEL[kind]}</span>
                    {x.ip && <span className="tabular-nums">IP {x.ip}</span>}
                    <MapLink lat={x.lat} lng={x.lng} className="ml-auto" />
                  </div>
                </div>
              )
            })}
          </div>
          {/* Máy tính: bảng */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <SortTh label="Lúc" k="time" sort={rejSort} onSort={k => setRejSort(s => toggleSort(s, k))} className="pl-4" />
                  <SortTh label="Nhân viên" k="employee" sort={rejSort} onSort={k => setRejSort(s => toggleSort(s, k))} />
                  <SortTh label="Lý do" k="reason" sort={rejSort} onSort={k => setRejSort(s => toggleSort(s, k))} />
                  <SortTh label="Cách điểm gần nhất" k="distance" sort={rejSort} onSort={k => setRejSort(s => toggleSort(s, k))} align="right" />
                  <SortTh label="Thiết bị" k="device" sort={rejSort} onSort={k => setRejSort(s => toggleSort(s, k))} />
                  <SortTh label="IP" k="ip" sort={rejSort} onSort={k => setRejSort(s => toggleSort(s, k))} />
                  <th className="text-left px-4 py-2">Vị trí</th>
                </tr>
              </thead>
              <tbody>
                {rejections.map(x => {
                  const kind = deviceKind(x.device)
                  return (
                    <tr key={x.id} className="border-t border-gray-100">
                      <td className="px-4 py-2 whitespace-nowrap tabular-nums">{fmtTime(x.attempted_at)}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900">{x.employee?.full_name || '—'}</div>
                        <div className="text-xs text-gray-500">{x.employee?.department?.name || ''}</div>
                      </td>
                      <td className="px-3 py-2 text-red-700">{reasonLabel(x.reason)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                        {x.distance_m != null ? <>{fmtDist(Number(x.distance_m))} <span className="text-gray-400">→ {x.nearest_name}</span></> : '—'}
                      </td>
                      <td className="px-3 py-2"><span className="inline-flex items-center gap-1"><DeviceIcon kind={kind} /> {DEVICE_LABEL[kind]}</span></td>
                      <td className="px-3 py-2 text-xs text-gray-500 tabular-nums">{x.ip || '—'}</td>
                      <td className="px-4 py-2">
                        {x.lat != null && x.lng != null ? (
                          <a href={mapsUrl(Number(x.lat), Number(x.lng))} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-700 text-xs">
                            Bản đồ <ExternalLink size={12} />
                          </a>
                        ) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>)}
      </div>

      {/* Lượt cần xem: thành công nhưng không xác minh / ngoài điểm */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold text-gray-800">Lượt thành công chưa xác minh GPS ({filtered.length})</h2>
          <span className="hidden sm:inline text-xs text-gray-500">Máy tính ngoài nhà máy, không toạ độ, hoặc bản app cũ</span>
          <SortSelect value={rowSort} options={ROW_SORT_OPTIONS} onChange={setRowSort} />
        </div>
        {rowsQ.isLoading ? (
          <div className="p-6 text-center text-gray-400"><Loader2 className="animate-spin inline mr-2" size={16} />Đang tải…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">Mọi lượt trong khoảng này đều đã xác minh vị trí.</div>
        ) : (<>
          {/* Điện thoại: thẻ */}
          <div className="sm:hidden divide-y divide-gray-100">
            {filtered.map(c => (
              <div key={c.r.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><EmpCell e={c.r.employee} /></div>
                  <div className="text-xs text-gray-500 tabular-nums whitespace-nowrap">{fmtTime(c.r.check_in_time)}</div>
                </div>
                <div className={`mt-1 text-sm ${c.inRange ? 'text-gray-800' : 'text-amber-700'}`}>
                  {c.locName}
                  {c.near && <> · cách {c.near.loc.name} <b>{fmtDist(c.near.dist)}</b></>}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1"><DeviceIcon kind={c.kind} size={12} /> {DEVICE_LABEL[c.kind]}</span>
                  {c.r.check_in_ip && <span className="tabular-nums">IP {c.r.check_in_ip}</span>}
                  <MapLink lat={c.hasCoords ? c.r.check_in_lat : null} lng={c.hasCoords ? c.r.check_in_lng : null} className="ml-auto" />
                </div>
              </div>
            ))}
          </div>
          {/* Máy tính: bảng */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <SortTh label="Lúc" k="time" sort={rowSort} onSort={k => setRowSort(s => toggleSort(s, k))} className="pl-4" />
                  <SortTh label="Nhân viên" k="employee" sort={rowSort} onSort={k => setRowSort(s => toggleSort(s, k))} />
                  <SortTh label="Thiết bị" k="device" sort={rowSort} onSort={k => setRowSort(s => toggleSort(s, k))} />
                  <SortTh label="Điểm" k="loc" sort={rowSort} onSort={k => setRowSort(s => toggleSort(s, k))} />
                  <SortTh label="Khoảng cách" k="distance" sort={rowSort} onSort={k => setRowSort(s => toggleSort(s, k))} align="right" />
                  <SortTh label="IP" k="ip" sort={rowSort} onSort={k => setRowSort(s => toggleSort(s, k))} />
                  <th className="text-left px-4 py-2">Vị trí</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.r.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 whitespace-nowrap tabular-nums">{fmtTime(c.r.check_in_time)}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900">{c.r.employee?.full_name || '—'}</div>
                      <div className="text-xs text-gray-500">{c.r.employee?.department?.name || ''}</div>
                    </td>
                    <td className="px-3 py-2"><span className="inline-flex items-center gap-1"><DeviceIcon kind={c.kind} /> {DEVICE_LABEL[c.kind]}</span></td>
                    <td className="px-3 py-2">
                      <span className={c.inRange ? 'text-gray-800' : 'text-amber-700'}>{c.locName}</span>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                      {c.near ? <>{fmtDist(c.near.dist)} <span className="text-gray-400">→ {c.near.loc.name}</span></> : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 tabular-nums">{c.r.check_in_ip || '—'}</td>
                    <td className="px-4 py-2">
                      {c.hasCoords ? (
                        <a href={mapsUrl(Number(c.r.check_in_lat), Number(c.r.check_in_lng))} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-700 text-xs">
                          Bản đồ <ExternalLink size={12} />
                        </a>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>)}
      </div>
    </div>
  )
}
