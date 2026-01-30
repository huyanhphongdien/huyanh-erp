import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { attendanceService } from '../../services'
import { useAuthStore } from '../../stores/authStore'
import { Card, Button } from '../../components/ui'
 
interface Props {
  onCheckInOut?: () => void
}
 
export function CheckInOutWidget({ onCheckInOut }: Props) {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const employeeId = user?.employee_id
 
  const { data: todayAttendance, isLoading } = useQuery({
    queryKey: ['today-attendance', employeeId],
    queryFn: () => employeeId ? attendanceService.getTodayAttendance(employeeId) : null,
    enabled: !!employeeId
  })
 
  const checkInMutation = useMutation({
    mutationFn: () => attendanceService.checkIn(employeeId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['today-attendance'] })
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      onCheckInOut?.()
    }
  })
 
  const checkOutMutation = useMutation({
    mutationFn: () => attendanceService.checkOut(employeeId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['today-attendance'] })
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      onCheckInOut?.()
    }
  })
 
  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '--:--'
    return new Date(timeStr).toLocaleTimeString('vi-VN', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    })
  }
 
  const now = new Date()
  const currentTime = now.toLocaleTimeString('vi-VN', { 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit'
  })
  const currentDate = now.toLocaleDateString('vi-VN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
 
  if (isLoading) {
    return <Card className="p-6">Đang tải...</Card>
  }
 
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold mb-1">Chấm công hôm nay</h3>
          <p className="text-gray-500">{currentDate}</p>
          <p className="text-2xl font-bold text-primary mt-2">{currentTime}</p>
        </div>
 
        <div className="flex items-center gap-8">
          {/* Check-in info */}
          <div className="text-center">
            <p className="text-sm text-gray-500 mb-1">Check-in</p>
            <p className="text-xl font-semibold">
              {formatTime(todayAttendance?.check_in_time)}
            </p>
          </div>
 
          {/* Check-out info */}
          <div className="text-center">
            <p className="text-sm text-gray-500 mb-1">Check-out</p>
            <p className="text-xl font-semibold">
              {formatTime(todayAttendance?.check_out_time)}
            </p>
          </div>
 
          {/* Action buttons */}
          <div className="flex gap-2">
            {!todayAttendance ? (
              <Button 
                size="lg"
                onClick={() => checkInMutation.mutate()}
                isLoading={checkInMutation.isPending}
              >
                🕐 Check-in
              </Button>
            ) : !todayAttendance.check_out_time ? (
              <Button 
                size="lg"
                variant="secondary"
                onClick={() => checkOutMutation.mutate()}
                isLoading={checkOutMutation.isPending}
              >
                🕐 Check-out
              </Button>
            ) : (
              <div className="text-center">
                <span className="text-green-600 font-medium">✓ Đã hoàn thành</span>
                <p className="text-sm text-gray-500">
                  Làm việc: {Math.floor((todayAttendance.working_minutes ?? 0) / 60)}h {(todayAttendance.working_minutes ?? 0) % 60}m
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
 
      {/* Status badge */}
      {todayAttendance?.status === 'late' && (
        <div className="mt-4 p-2 bg-yellow-50 text-yellow-800 rounded text-sm">
          ⚠️ Bạn đã check-in trễ hôm nay
        </div>
      )}
    </Card>
  )
}
