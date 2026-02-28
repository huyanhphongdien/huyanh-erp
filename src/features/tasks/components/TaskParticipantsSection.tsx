// ============================================================================
// TASK PARTICIPANTS SECTION
// File: src/features/tasks/components/TaskParticipantsSection.tsx
// Huy Anh ERP System
// ============================================================================
// Component hiển thị danh sách người tham gia trong chi tiết công việc
// Hỗ trợ:
// - Hiển thị danh sách người tham gia (active, pending)
// - Thêm người tham gia (modal)
// - Xóa người tham gia (cho manager)
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  Users,
  UserPlus,
  X,
  Search,
  Check,
  Clock,
  Building2,
  AlertCircle,
  Loader2,
  XCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { useAuthStore } from '../../../stores/authStore'
import {
  taskParticipantService,
  type TaskParticipant,
  type AvailableEmployee,
} from '../../../services/taskParticipantService'

// ============================================================================
// TYPES
// ============================================================================

interface TaskParticipantsSectionProps {
  taskId: string
  taskAssigneeId?: string | null
  onParticipantChange?: () => void
}

// ============================================================================
// STATUS CONFIG - Match enum assignment_status
// ============================================================================

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  accepted: {
    label: 'Đang tham gia',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    icon: <Check className="w-3 h-3" />,
  },
  pending: {
    label: 'Chờ xác nhận',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-100',
    icon: <Clock className="w-3 h-3" />,
  },
  declined: {
    label: 'Đã từ chối',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    icon: <XCircle className="w-3 h-3" />,
  },
  completed: {
    label: 'Hoàn thành',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    icon: <Check className="w-3 h-3" />,
  },
}

// ============================================================================
// PARTICIPANT BADGE COMPONENT
// ============================================================================

const ParticipantBadge: React.FC<{
  participant: TaskParticipant
  canRemove: boolean
  onRemove: () => void
  isRemoving: boolean
}> = ({ participant, canRemove, onRemove, isRemoving }) => {
  const statusConfig = STATUS_CONFIG[participant.status] || STATUS_CONFIG.accepted

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
        participant.status === 'accepted' || participant.status === 'completed'
          ? 'bg-white border-gray-200 hover:border-gray-300'
          : participant.status === 'pending'
          ? 'bg-yellow-50 border-yellow-200'
          : 'bg-gray-50 border-gray-200 opacity-60'
      }`}
    >
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${
          participant.status === 'accepted' || participant.status === 'completed' ? 'bg-blue-500' : 'bg-gray-400'
        }`}
      >
        {participant.employee_name?.charAt(0)?.toUpperCase() || '?'}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 text-sm truncate">
            {participant.employee_name}
          </span>
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}
          >
            {statusConfig.icon}
            {statusConfig.label}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
          {participant.employee_department_name && (
            <span className="flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {participant.employee_department_name}
            </span>
          )}
          {participant.employee_position_name && (
            <span>• {participant.employee_position_name}</span>
          )}
        </div>
      </div>

      {/* Remove button */}
      {canRemove && participant.status !== 'declined' && (
        <button
          onClick={onRemove}
          disabled={isRemoving}
          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
          title="Xóa khỏi công việc"
        >
          {isRemoving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <X className="w-4 h-4" />
          )}
        </button>
      )}
    </div>
  )
}

// ============================================================================
// ADD PARTICIPANT MODAL
// ============================================================================

const AddParticipantModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  taskId: string
  requesterId: string
  onSuccess: () => void
}> = ({ isOpen, onClose, taskId, requesterId, onSuccess }) => {
  const [employees, setEmployees] = useState<AvailableEmployee[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([])
  const [invitationNote, setInvitationNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addType, setAddType] = useState<'direct' | 'request' | null>(null)

  // Load available employees
  useEffect(() => {
    if (!isOpen) return

    const loadEmployees = async () => {
      setLoading(true)
      setError(null)

      const { data, error: loadError } = await taskParticipantService.getAvailableEmployees(
        taskId,
        requesterId
      )

      if (loadError) {
        setError(loadError.message)
      } else {
        setEmployees(data)

        // Check add type for first employee (to show proper UI)
        if (data.length > 0) {
          const result = await taskParticipantService.checkCanAddParticipant(
            requesterId,
            data[0].id,
            taskId
          )
          setAddType(result.add_type)
        }
      }

      setLoading(false)
    }

    loadEmployees()
  }, [isOpen, taskId, requesterId])

  // Filter employees by search
  const filteredEmployees = employees.filter(
    (e) =>
      e.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.department_name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Toggle employee selection
  const toggleEmployee = (employeeId: string) => {
    setSelectedEmployees((prev) =>
      prev.includes(employeeId)
        ? prev.filter((id) => id !== employeeId)
        : [...prev, employeeId]
    )
  }

  // Handle submit
  const handleSubmit = async () => {
    if (selectedEmployees.length === 0) return

    setSubmitting(true)
    setError(null)

    let successCount = 0
    const errorMessages: string[] = []

    for (const employeeId of selectedEmployees) {
      const result = await taskParticipantService.addParticipant({
        task_id: taskId,
        employee_id: employeeId,
        invited_by: requesterId,
        invitation_note: invitationNote || undefined,
      })

      if (result.success) {
        successCount++
      } else {
        errorMessages.push(result.error || 'Lỗi không xác định')
      }
    }

    setSubmitting(false)

    if (successCount > 0) {
      onSuccess()
      onClose()
      setSelectedEmployees([])
      setInvitationNote('')
    }

    if (errorMessages.length > 0) {
      setError(errorMessages.join(', '))
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20">
        <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />

        <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {addType === 'request' ? 'Yêu cầu thêm người tham gia' : 'Thêm người tham gia'}
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {addType === 'request'
                  ? 'Gửi yêu cầu cho đồng nghiệp tham gia công việc'
                  : 'Chọn nhân viên để thêm vào công việc'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Tìm kiếm nhân viên..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Loading */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : employees.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>Không có nhân viên nào có thể thêm</p>
              </div>
            ) : (
              <>
                {/* Employee list */}
                <div className="space-y-2 mb-4">
                  {filteredEmployees.map((employee) => (
                    <label
                      key={employee.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedEmployees.includes(employee.id)
                          ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-200'
                          : 'bg-white border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedEmployees.includes(employee.id)}
                        onChange={() => toggleEmployee(employee.id)}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-medium">
                        {employee.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900">{employee.full_name}</div>
                        <div className="text-xs text-gray-500 flex items-center gap-2">
                          <span>{employee.code}</span>
                          <span>•</span>
                          <span>{employee.department_name}</span>
                          {employee.position_name && (
                            <>
                              <span>•</span>
                              <span>{employee.position_name}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Invitation note (for request type) */}
                {addType === 'request' && selectedEmployees.length > 0 && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Lý do yêu cầu <span className="text-gray-400">(tùy chọn)</span>
                    </label>
                    <textarea
                      value={invitationNote}
                      onChange={(e) => setInvitationNote(e.target.value)}
                      placeholder="Nêu lý do bạn muốn mời người này tham gia..."
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>
                )}

                {/* Info banner */}
                {addType === 'request' && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
                    <div className="flex items-start gap-2">
                      <Clock className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <p>
                        Yêu cầu sẽ được gửi đến người được chọn. Họ cần chấp nhận để tham gia công
                        việc.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t bg-gray-50 rounded-b-xl flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Đã chọn: <strong>{selectedEmployees.length}</strong> người
            </span>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || selectedEmployees.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <UserPlus className="w-4 h-4" />
                )}
                {addType === 'request' ? 'Gửi yêu cầu' : 'Thêm ngay'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const TaskParticipantsSection: React.FC<TaskParticipantsSectionProps> = ({
  taskId,
  taskAssigneeId,
  onParticipantChange,
}) => {
  const { user } = useAuthStore()
  const [participants, setParticipants] = useState<TaskParticipant[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  // Check if current user can manage participants
  const canManage = user?.role === 'admin' || user?.role === 'manager'

  // Check if current user is assignee or can add
  const isAssignee = user?.employee_id === taskAssigneeId
  const canAdd = isAssignee || canManage

  // Load participants
  const loadParticipants = useCallback(async () => {
    setLoading(true)
    const { data } = await taskParticipantService.getParticipants(taskId)
    setParticipants(data)
    setLoading(false)
  }, [taskId])

  useEffect(() => {
    loadParticipants()
  }, [loadParticipants])

  // Handle remove participant - FIX: removeParticipant chỉ nhận 1 tham số
  const handleRemove = async (assignmentId: string) => {
    if (!confirm('Bạn có chắc muốn xóa người này khỏi công việc?')) return

    setRemovingId(assignmentId)
    const result = await taskParticipantService.removeParticipant(assignmentId)

    if (result.success) {
      await loadParticipants()
      onParticipantChange?.()
    } else {
      alert(result.error || 'Không thể xóa người tham gia')
    }

    setRemovingId(null)
  }

  // Count by status
  const activeCount = participants.filter((p) => p.status === 'accepted' || p.status === 'completed').length
  const pendingCount = participants.filter((p) => p.status === 'pending').length

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Users className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Người tham gia</h3>
            <p className="text-sm text-gray-500">
              {activeCount > 0 ? `${activeCount} người đang tham gia` : 'Chưa có người tham gia'}
              {pendingCount > 0 && (
                <span className="text-yellow-600"> • {pendingCount} đang chờ</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canAdd && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowAddModal(true)
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Thêm
            </button>
          )}
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </div>

      {/* Content */}
      {expanded && (
        <div className="px-6 pb-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : participants.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <Users className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p className="text-gray-500 text-sm">Chưa có người tham gia</p>
              {canAdd && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  + Thêm người tham gia
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {participants.map((participant) => (
                <ParticipantBadge
                  key={participant.id}
                  participant={participant}
                  canRemove={canManage}
                  onRemove={() => handleRemove(participant.id)}
                  isRemoving={removingId === participant.id}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Modal */}
      <AddParticipantModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        taskId={taskId}
        requesterId={user?.employee_id || ''}
        onSuccess={() => {
          loadParticipants()
          onParticipantChange?.()
        }}
      />
    </div>
  )
}

export default TaskParticipantsSection