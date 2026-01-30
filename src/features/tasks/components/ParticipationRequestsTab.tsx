// ============================================================================
// PARTICIPATION REQUESTS TAB
// File: src/features/tasks/components/ParticipationRequestsTab.tsx
// Huy Anh ERP System
// ============================================================================
// Component hiển thị danh sách yêu cầu tham gia công việc từ đồng nghiệp
// Cho phép nhân viên chấp nhận hoặc từ chối yêu cầu
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  Building2,
  Calendar,
  Flag,
  MessageSquare,
  Loader2,
  UserPlus,
  AlertCircle,
} from 'lucide-react'
import { useAuthStore } from '../../../stores/authStore'
import {
  taskParticipantService,
  type PendingRequest,
} from '../../../services/taskParticipantService'

// ============================================================================
// TYPES
// ============================================================================

interface ParticipationRequestsTabProps {
  onCountChange?: (count: number) => void
}

// ============================================================================
// PRIORITY CONFIG
// ============================================================================

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  low: { label: 'Thấp', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  medium: { label: 'Trung bình', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  high: { label: 'Cao', color: 'text-orange-600', bgColor: 'bg-orange-100' },
  urgent: { label: 'Khẩn cấp', color: 'text-red-600', bgColor: 'bg-red-100' },
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function _formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getTimeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Vừa xong'
  if (diffMins < 60) return `${diffMins} phút trước`
  if (diffHours < 24) return `${diffHours} giờ trước`
  if (diffDays < 7) return `${diffDays} ngày trước`
  return formatDate(dateStr)
}

// ============================================================================
// REQUEST CARD COMPONENT
// ============================================================================

const RequestCard: React.FC<{
  request: PendingRequest
  onAccept: () => void
  onReject: () => void
  onView: () => void
  isProcessing: boolean
}> = ({ request, onAccept, onReject, onView, isProcessing }) => {
  const priorityConfig = PRIORITY_CONFIG[request.task_priority] || PRIORITY_CONFIG.medium

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-indigo-50">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-gray-500">{request.task_code}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${priorityConfig.bgColor} ${priorityConfig.color}`}>
                <Flag className="w-3 h-3 inline mr-1" />
                {priorityConfig.label}
              </span>
            </div>
            <h3 className="font-semibold text-gray-900 mt-1 truncate">{request.task_name}</h3>
          </div>
          <div className="text-right text-xs text-gray-500">
            <Clock className="w-3.5 h-3.5 inline mr-1" />
            {getTimeAgo(request.requested_at)}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-3">
        {/* Inviter info */}
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-medium">
            {request.inviter_name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-500">Yêu cầu từ</p>
            <p className="font-medium text-gray-900">{request.inviter_name}</p>
            {request.inviter_department_name && (
              <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                <Building2 className="w-3 h-3" />
                {request.inviter_department_name}
              </p>
            )}
          </div>
        </div>

        {/* Invitation note */}
        {request.invitation_note && (
          <div className="p-3 bg-yellow-50 border border-yellow-100 rounded-lg">
            <div className="flex items-start gap-2">
              <MessageSquare className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-yellow-700 mb-1">Lời nhắn:</p>
                <p className="text-sm text-yellow-800">{request.invitation_note}</p>
              </div>
            </div>
          </div>
        )}

        {/* Task info */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-gray-600">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span>Hạn: {formatDate(request.task_due_date)}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <div className="w-4 h-4 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-blue-500" style={{ opacity: request.task_progress / 100 || 0.2 }} />
            </div>
            <span>Tiến độ: {request.task_progress || 0}%</span>
          </div>
        </div>

        {/* Task description preview */}
        {request.task_description && (
          <p className="text-sm text-gray-600 line-clamp-2">{request.task_description}</p>
        )}
      </div>

      {/* Actions */}
      <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center gap-2">
        <button
          onClick={onView}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Eye className="w-4 h-4" />
          Xem chi tiết
        </button>
        <div className="flex-1" />
        <button
          onClick={onReject}
          disabled={isProcessing}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
        >
          {isProcessing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <XCircle className="w-4 h-4" />
          )}
          Từ chối
        </button>
        <button
          onClick={onAccept}
          disabled={isProcessing}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          {isProcessing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle className="w-4 h-4" />
          )}
          Chấp nhận
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const ParticipationRequestsTab: React.FC<ParticipationRequestsTabProps> = ({ onCountChange }) => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [requests, setRequests] = useState<PendingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load requests
  const loadRequests = useCallback(async () => {
    if (!user?.employee_id) return

    setLoading(true)
    setError(null)

    const { data, error: loadError } = await taskParticipantService.getPendingRequests(
      user.employee_id
    )

    if (loadError) {
      setError(loadError.message)
    } else {
      setRequests(data)
      onCountChange?.(data.length)
    }

    setLoading(false)
  }, [user?.employee_id, onCountChange])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  // Handle accept
  const handleAccept = async (requestId: string) => {
    setProcessingId(requestId)

    const result = await taskParticipantService.acceptRequest(requestId)

    if (result.success) {
      await loadRequests()
    } else {
      alert(result.error || 'Không thể chấp nhận yêu cầu')
    }

    setProcessingId(null)
  }

  // Handle reject
  const handleReject = async (requestId: string) => {
    const reason = prompt('Lý do từ chối (tùy chọn):')
    if (reason === null) return // User cancelled

    setProcessingId(requestId)

    const result = await taskParticipantService.rejectRequest(requestId, reason || undefined)

    if (result.success) {
      await loadRequests()
    } else {
      alert(result.error || 'Không thể từ chối yêu cầu')
    }

    setProcessingId(null)
  }

  // Handle view task
  const handleView = (taskId: string) => {
    navigate(`/tasks/${taskId}`)
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex items-center gap-3 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Đang tải...</span>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <AlertCircle className="w-12 h-12 text-red-400 mb-3" />
        <p className="text-red-600 mb-3">{error}</p>
        <button
          onClick={loadRequests}
          className="text-blue-600 hover:underline"
        >
          Thử lại
        </button>
      </div>
    )
  }

  // Empty state
  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <UserPlus className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Không có yêu cầu nào</h3>
        <p className="text-gray-500 text-center max-w-sm">
          Khi đồng nghiệp mời bạn tham gia công việc, yêu cầu sẽ hiển thị ở đây
        </p>
      </div>
    )
  }

  // Request list
  return (
    <div className="space-y-4">
      {/* Header info */}
      <div className="flex items-center justify-between px-1">
        <p className="text-sm text-gray-600">
          Bạn có <strong className="text-purple-600">{requests.length}</strong> yêu cầu tham gia công việc
        </p>
        <button
          onClick={loadRequests}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          Làm mới
        </button>
      </div>

      {/* Request cards */}
      <div className="grid gap-4">
        {requests.map((request) => (
          <RequestCard
            key={request.id}
            request={request}
            onAccept={() => handleAccept(request.id)}
            onReject={() => handleReject(request.id)}
            onView={() => handleView(request.task_id)}
            isProcessing={processingId === request.id}
          />
        ))}
      </div>
    </div>
  )
}

export default ParticipationRequestsTab