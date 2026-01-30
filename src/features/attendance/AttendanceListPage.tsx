import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { attendanceService } from '../../services'
import { Card, Select, DataTable, Pagination } from '../../components/ui'
import { CheckInOutWidget } from './CheckInOutWidget'
import type { Attendance } from '../../types'
 
export function AttendanceListPage() {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0])
 
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['attendance', page, statusFilter, dateFilter],
    queryFn: () => attendanceService.getAll({ 
      page, 
      pageSize: 10, 
      status: statusFilter || undefined,
      from_date: dateFilter,
      to_date: dateFilter
    })
  })
 
  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '-'
    return new Date(timeStr).toLocaleTimeString('vi-VN', { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }
 
  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  }
 
  const columns = [
    {
      key: 'employee',
      title: 'Nhân viên',
      render: (item: Attendance) => (
        <div>
          <div className="font-medium">{item.employee?.full_name}</div>
          <div className="text-sm text-gray-500">{item.employee?.code}</div>
        </div>
      )
    },
    {
      key: 'department',
      title: 'Phòng ban',
      render: (item: Attendance) => item.employee?.department?.name || '-'
    },
    {
      key: 'check_in',
      title: 'Check-in',
      render: (item: Attendance) => formatTime(item.check_in_time ?? undefined)
    },
    {
      key: 'check_out',
      title: 'Check-out',
      render: (item: Attendance) => formatTime(item.check_out_time ?? undefined)
    },
    {
      key: 'working_time',
      title: 'Thời gian làm',
      render: (item: Attendance) => formatMinutes(item.working_minutes ?? 0)
    },
    {
      key: 'overtime',
      title: 'Tăng ca',
      render: (item: Attendance) => (item.overtime_minutes ?? 0) > 0 
        ? formatMinutes(item.overtime_minutes ?? 0) 
        : '-'
    },
    {
      key: 'status',
      title: 'Trạng thái',
      render: (item: Attendance) => {
        const statusColors: Record<string, string> = {
          present: 'bg-green-100 text-green-800',
          absent: 'bg-red-100 text-red-800',
          late: 'bg-yellow-100 text-yellow-800',
          early_leave: 'bg-orange-100 text-orange-800',
          on_leave: 'bg-blue-100 text-blue-800',
          holiday: 'bg-purple-100 text-purple-800'
        }
        const statusLabels: Record<string, string> = {
          present: 'Đi làm',
          absent: 'Vắng',
          late: 'Đi trễ',
          early_leave: 'Về sớm',
          on_leave: 'Nghỉ phép',
          holiday: 'Ngày lễ'
        }
        return (
          <span className={`px-2 py-1 rounded-full text-xs ${statusColors[item.status]}`}>
            {statusLabels[item.status]}
          </span>
        )
      }
    }
  ]
 
  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Chấm công</h1>
      </div>
 
      {/* Widget Check-in/out cho user hiện tại */}
      <div className="mb-6">
        <CheckInOutWidget onCheckInOut={refetch} />
      </div>
 
      <Card>
        <div className="p-4 border-b flex gap-4">
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => { setDateFilter(e.target.value); setPage(1) }}
            className="border rounded px-3 py-2"
          />
          
          <Select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            options={[
              { value: '', label: 'Tất cả trạng thái' },
              { value: 'present', label: 'Đi làm' },
              { value: 'late', label: 'Đi trễ' },
              { value: 'early_leave', label: 'Về sớm' },
              { value: 'absent', label: 'Vắng' },
              { value: 'on_leave', label: 'Nghỉ phép' }
            ]}
            className="w-48"
          />
        </div>
 
        <DataTable
          columns={columns}
          data={data?.data || []}
          isLoading={isLoading}
          emptyMessage="Không có dữ liệu chấm công"
        />
 
        {data && data.totalPages > 1 && (
          <div className="p-4 border-t">
            <Pagination
              currentPage={page}
              totalPages={data.totalPages}
              onPageChange={setPage}
            />
          </div>
        )}
      </Card>
    </div>
  )
}
