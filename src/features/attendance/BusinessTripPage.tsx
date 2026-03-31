// ============================================================================
// BUSINESS TRIP PAGE — Đơn công tác
// File: src/features/attendance/BusinessTripPage.tsx
// ============================================================================
// TP/PP gán nhân viên đi công tác → tự động tạo attendance business_trip
// NV xem danh sách công tác của mình
// ============================================================================

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Briefcase, Plus, MapPin, Calendar, Users, Loader2,
  ChevronDown, ChevronUp, X, AlertTriangle, CheckCircle,
  Trash2, User, FileText,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'

// ============================================================================
// TYPES
// ============================================================================

interface BusinessTrip {
  id: string
  employee_id: string
  request_number: string
  start_date: string
  end_date: string
  total_days: number
  trip_destination: string
  trip_purpose: string
  trip_with: string
  reason: string
  status: string
  created_by: string
  created_at: string
  employee?: { id: string; code: string; full_name: string }
  creator?: { id: string; full_name: string }
}

interface Employee {
  id: string
  code: string
  full_name: string
  department_id: string
}

// ============================================================================
// SERVICE
// ============================================================================

const BUSINESS_TRIP_SELECT = `
  *,
  employee:employees!leave_requests_employee_id_fkey(id, code, full_name),
  creator:employees!leave_requests_approved_by_fkey(id, full_name)
`

async function getBusinessTripTypeId(): Promise<string | null> {
  const { data } = await supabase
    .from('leave_types')
    .select('id')
    .eq('code', 'BUSINESS_TRIP')
    .maybeSingle()
  return data?.id || null
}

async function fetchBusinessTrips(
  employeeId: string,
  isManager: boolean,
  departmentId: string | null
): Promise<BusinessTrip[]> {
  const typeId = await getBusinessTripTypeId()
  if (!typeId) return []

  let query = supabase
    .from('leave_requests')
    .select(BUSINESS_TRIP_SELECT)
    .eq('leave_type_id', typeId)
    .in('status', ['approved', 'pending'])
    .order('created_at', { ascending: false })

  if (!isManager) {
    // NV chỉ xem của mình
    query = query.eq('employee_id', employeeId)
  } else if (departmentId) {
    // Manager: xem NV trong phòng
    const { data: deptEmps } = await supabase
      .from('employees')
      .select('id')
      .eq('department_id', departmentId)
      .eq('status', 'active')
    if (deptEmps && deptEmps.length > 0) {
      query = query.in('employee_id', deptEmps.map(e => e.id))
    }
  }

  const { data, error } = await query
  if (error) {
    console.error('[BusinessTrip] fetch error:', error)
    return []
  }
  return (data || []) as any
}

async function createBusinessTrip(params: {
  employee_id: string
  start_date: string
  end_date: string
  total_days: number
  trip_destination: string
  trip_purpose: string
  trip_with: string
  reason: string
  created_by: string
}): Promise<void> {
  const typeId = await getBusinessTripTypeId()
  if (!typeId) throw new Error('Loại phép "Công tác" chưa được cấu hình')

  // Tạo mã đơn
  const year = new Date().getFullYear()
  const { data: last } = await supabase
    .from('leave_requests')
    .select('request_number')
    .ilike('request_number', `CT${year}%`)
    .order('request_number', { ascending: false })
    .limit(1)
  const num = last && last.length > 0 ? parseInt(last[0].request_number.slice(-4)) + 1 : 1
  const requestNumber = `CT${year}-${String(num).padStart(4, '0')}`

  // Tạo đơn — TP/PP tạo = auto approved
  const { error: insertError } = await supabase
    .from('leave_requests')
    .insert({
      employee_id: params.employee_id,
      leave_type_id: typeId,
      request_number: requestNumber,
      start_date: params.start_date,
      end_date: params.end_date,
      total_days: params.total_days,
      trip_destination: params.trip_destination,
      trip_purpose: params.trip_purpose,
      trip_with: params.trip_with,
      reason: params.reason || `Công tác: ${params.trip_destination}`,
      status: 'approved',
      approved_by: params.created_by,
      approved_at: new Date().toISOString(),
    })
  if (insertError) throw insertError

  // Tạo attendance records
  const start = new Date(params.start_date + 'T00:00:00+07:00')
  const end = new Date(params.end_date + 'T00:00:00+07:00')

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0]

    // Kiểm tra đã có attendance chưa
    const { data: existing } = await supabase
      .from('attendance')
      .select('id')
      .eq('employee_id', params.employee_id)
      .eq('date', dateStr)
      .maybeSingle()

    if (existing) continue

    await supabase.from('attendance').insert({
      employee_id: params.employee_id,
      date: dateStr,
      status: 'business_trip',
      work_units: 1.0,
      working_minutes: 480,
      notes: `Công tác: ${params.trip_destination} — ${params.trip_purpose || ''}`.trim(),
      check_in_time: dateStr + 'T08:00:00+07:00',
      check_out_time: dateStr + 'T17:00:00+07:00',
    })
  }
}

async function deleteBusinessTrip(id: string): Promise<void> {
  // Lấy thông tin đơn trước
  const { data: trip } = await supabase
    .from('leave_requests')
    .select('employee_id, start_date, end_date')
    .eq('id', id)
    .single()

  if (!trip) throw new Error('Không tìm thấy đơn')

  // Xóa attendance business_trip
  await supabase
    .from('attendance')
    .delete()
    .eq('employee_id', trip.employee_id)
    .eq('status', 'business_trip')
    .gte('date', trip.start_date)
    .lte('date', trip.end_date)

  // Xóa đơn
  await supabase.from('leave_requests').delete().eq('id', id)
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function BusinessTripPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  const employeeId = user?.employee_id || ''
  const userLevel = user?.position_level || 7
  const isManager = userLevel <= 5 // TP/PP/BGĐ
  const departmentId = user?.department_id || null

  // State
  const [showForm, setShowForm] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Form state
  const [formEmployeeId, setFormEmployeeId] = useState('')
  const [formStartDate, setFormStartDate] = useState(new Date().toISOString().split('T')[0])
  const [formEndDate, setFormEndDate] = useState(new Date().toISOString().split('T')[0])
  const [formDestination, setFormDestination] = useState('')
  const [formPurpose, setFormPurpose] = useState('')
  const [formWith, setFormWith] = useState('')
  const [formReason, setFormReason] = useState('')

  // Queries
  const { data: trips = [], isLoading } = useQuery({
    queryKey: ['business-trips', employeeId, isManager, departmentId],
    queryFn: () => fetchBusinessTrips(employeeId, isManager, departmentId),
  })

  const { data: employees = [] } = useQuery({
    queryKey: ['dept-employees-for-trip', departmentId],
    queryFn: async () => {
      if (!isManager) return []
      let query = supabase
        .from('employees')
        .select('id, code, full_name, department_id')
        .eq('status', 'active')
        .order('full_name')
      if (departmentId && userLevel > 3) {
        query = query.eq('department_id', departmentId)
      }
      const { data } = await query
      return (data || []) as Employee[]
    },
    enabled: isManager,
  })

  // Mutations
  const createMutation = useMutation({
    mutationFn: createBusinessTrip,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-trips'] })
      queryClient.invalidateQueries({ queryKey: ['monthly-timesheet'] })
      resetForm()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteBusinessTrip,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-trips'] })
      queryClient.invalidateQueries({ queryKey: ['monthly-timesheet'] })
      setDeleteId(null)
    },
  })

  // Helpers
  const totalDays = useMemo(() => {
    if (!formStartDate || !formEndDate) return 0
    const s = new Date(formStartDate)
    const e = new Date(formEndDate)
    return Math.max(0, Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1)
  }, [formStartDate, formEndDate])

  function resetForm() {
    setShowForm(false)
    setFormEmployeeId('')
    setFormStartDate(new Date().toISOString().split('T')[0])
    setFormEndDate(new Date().toISOString().split('T')[0])
    setFormDestination('')
    setFormPurpose('')
    setFormWith('')
    setFormReason('')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formDestination.trim()) return
    const empId = isManager ? formEmployeeId : employeeId
    if (!empId) return

    createMutation.mutate({
      employee_id: empId,
      start_date: formStartDate,
      end_date: formEndDate,
      total_days: totalDays,
      trip_destination: formDestination.trim(),
      trip_purpose: formPurpose.trim(),
      trip_with: formWith.trim(),
      reason: formReason.trim() || `Công tác: ${formDestination.trim()}`,
      created_by: employeeId,
    })
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen bg-[#F7F5F2]">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-sky-600" />
            <h1 className="text-[17px] font-bold text-gray-800">Đơn công tác</h1>
          </div>
          {isManager && (
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-1.5 px-3 py-2 bg-sky-600 text-white rounded-xl text-sm font-semibold active:bg-sky-700 transition-colors"
            >
              {showForm ? <X size={16} /> : <Plus size={16} />}
              {showForm ? 'Đóng' : 'Gán công tác'}
            </button>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">

        {/* ═══════ FORM TẠO ĐƠN ═══════ */}
        {showForm && isManager && (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-sky-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-sky-50 border-b border-sky-200">
              <h2 className="text-sm font-bold text-sky-700 flex items-center gap-1.5">
                <Briefcase size={15} />
                Gán nhân viên đi công tác
              </h2>
            </div>
            <div className="p-4 space-y-4">

              {/* Chọn NV */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                  <User size={14} className="text-gray-400" />
                  Nhân viên <span className="text-red-500">*</span>
                </label>
                <select
                  value={formEmployeeId}
                  onChange={e => setFormEmployeeId(e.target.value)}
                  required
                  className="w-full px-3 py-3 border border-gray-300 rounded-xl text-[15px] bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="">-- Chọn nhân viên --</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.code} - {emp.full_name}</option>
                  ))}
                </select>
              </div>

              {/* Địa điểm */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                  <MapPin size={14} className="text-gray-400" />
                  Địa điểm <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formDestination}
                  onChange={e => setFormDestination(e.target.value)}
                  required
                  placeholder="VD: Hồ Chí Minh, Hà Nội..."
                  className="w-full px-3 py-3 border border-gray-300 rounded-xl text-[15px] focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Mục đích */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                  <FileText size={14} className="text-gray-400" />
                  Mục đích
                </label>
                <input
                  type="text"
                  value={formPurpose}
                  onChange={e => setFormPurpose(e.target.value)}
                  placeholder="VD: Gặp khách hàng, kiểm tra nhà máy..."
                  className="w-full px-3 py-3 border border-gray-300 rounded-xl text-[15px] focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Đi cùng */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                  <Users size={14} className="text-gray-400" />
                  Đi cùng
                </label>
                <input
                  type="text"
                  value={formWith}
                  onChange={e => setFormWith(e.target.value)}
                  placeholder="VD: Trưởng phòng KD, Anh Minh..."
                  className="w-full px-3 py-3 border border-gray-300 rounded-xl text-[15px] focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Ngày */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                    <Calendar size={14} className="text-gray-400" />
                    Từ ngày <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formStartDate}
                    onChange={e => setFormStartDate(e.target.value)}
                    required
                    className="w-full px-3 py-3 border border-gray-300 rounded-xl text-[15px] focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                    <Calendar size={14} className="text-gray-400" />
                    Đến ngày <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formEndDate}
                    onChange={e => setFormEndDate(e.target.value)}
                    required
                    min={formStartDate}
                    className="w-full px-3 py-3 border border-gray-300 rounded-xl text-[15px] focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              {/* Tổng ngày */}
              {totalDays > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-sky-50 rounded-xl">
                  <Calendar size={14} className="text-sky-600" />
                  <span className="text-sm text-sky-700">Tổng: <strong>{totalDays} ngày</strong> công tác</span>
                </div>
              )}

              {/* Ghi chú */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Ghi chú</label>
                <textarea
                  value={formReason}
                  onChange={e => setFormReason(e.target.value)}
                  rows={2}
                  placeholder="Ghi chú thêm (không bắt buộc)..."
                  className="w-full px-3 py-3 border border-gray-300 rounded-xl text-[15px] resize-none focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Error */}
              {createMutation.isError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertTriangle size={16} />
                  {(createMutation.error as Error)?.message || 'Có lỗi xảy ra'}
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 py-3 border-2 border-gray-300 rounded-xl text-sm font-semibold text-gray-700 active:bg-gray-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || !formDestination.trim() || totalDays <= 0 || (!formEmployeeId && isManager)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-sky-600 rounded-xl text-sm font-semibold text-white active:bg-sky-700 disabled:opacity-50"
                >
                  {createMutation.isPending ? (
                    <><Loader2 size={16} className="animate-spin" /> Đang tạo...</>
                  ) : (
                    <><CheckCircle size={16} /> Gán công tác</>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* ═══════ DANH SÁCH ═══════ */}
        {isLoading ? (
          <div className="flex flex-col items-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
            <span className="mt-2 text-sm text-gray-500">Đang tải...</span>
          </div>
        ) : trips.length === 0 ? (
          <div className="text-center py-12">
            <Briefcase className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 text-sm">Chưa có đơn công tác nào</p>
          </div>
        ) : (
          <div className="space-y-2">
            {trips.map(trip => {
              const emp = Array.isArray(trip.employee) ? trip.employee[0] : trip.employee
              const creator = Array.isArray(trip.creator) ? trip.creator[0] : trip.creator
              const isExpanded = expandedId === trip.id
              const startVN = new Date(trip.start_date + 'T00:00:00+07:00').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
              const endVN = new Date(trip.end_date + 'T00:00:00+07:00').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })

              return (
                <div key={trip.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Row chính */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer active:bg-gray-50"
                    onClick={() => setExpandedId(isExpanded ? null : trip.id)}
                  >
                    <div className="w-9 h-9 rounded-lg bg-sky-100 flex items-center justify-center flex-shrink-0">
                      <Briefcase size={16} className="text-sky-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-gray-800 truncate">
                        {emp?.full_name || 'N/A'}
                      </p>
                      <div className="flex items-center gap-2 text-[12px] text-gray-500">
                        <MapPin size={11} />
                        <span className="truncate">{trip.trip_destination}</span>
                        <span className="text-gray-300">|</span>
                        <span>{startVN} → {endVN}</span>
                        <span className="text-sky-600 font-medium">({trip.total_days}d)</span>
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                  </div>

                  {/* Chi tiết mở rộng */}
                  {isExpanded && (
                    <div className="px-4 pb-3 border-t border-gray-100 pt-3 space-y-2">
                      <div className="grid grid-cols-2 gap-3 text-[13px]">
                        <div>
                          <span className="text-gray-400">Mã đơn</span>
                          <p className="font-medium text-gray-700">{trip.request_number}</p>
                        </div>
                        <div>
                          <span className="text-gray-400">Nhân viên</span>
                          <p className="font-medium text-gray-700">{emp?.code} - {emp?.full_name}</p>
                        </div>
                        {trip.trip_purpose && (
                          <div className="col-span-2">
                            <span className="text-gray-400">Mục đích</span>
                            <p className="font-medium text-gray-700">{trip.trip_purpose}</p>
                          </div>
                        )}
                        {trip.trip_with && (
                          <div>
                            <span className="text-gray-400">Đi cùng</span>
                            <p className="font-medium text-gray-700">{trip.trip_with}</p>
                          </div>
                        )}
                        {creator && (
                          <div>
                            <span className="text-gray-400">Người gán</span>
                            <p className="font-medium text-gray-700">{creator.full_name}</p>
                          </div>
                        )}
                      </div>

                      {/* Xóa đơn */}
                      {isManager && (
                        <div className="pt-2 border-t border-gray-100">
                          {deleteId === trip.id ? (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-red-600 flex-1">Xác nhận xóa đơn + attendance?</span>
                              <button
                                onClick={() => deleteMutation.mutate(trip.id)}
                                disabled={deleteMutation.isPending}
                                className="px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg active:bg-red-700 disabled:opacity-50"
                              >
                                {deleteMutation.isPending ? 'Đang xóa...' : 'Xóa'}
                              </button>
                              <button
                                onClick={() => setDeleteId(null)}
                                className="px-3 py-1.5 border border-gray-300 text-xs font-semibold rounded-lg text-gray-600"
                              >
                                Hủy
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteId(trip.id)}
                              className="flex items-center gap-1 text-xs text-red-500 font-medium active:text-red-700"
                            >
                              <Trash2 size={13} /> Xóa đơn công tác
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
