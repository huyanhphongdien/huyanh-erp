// ============================================================================
// ADD MEMBER MODAL - Bottom-sheet modal thêm thành viên vào đội
// File: src/features/shift-teams/AddMemberModal.tsx
// ============================================================================

import { useState, useEffect, useMemo } from 'react'
import {
  X, Search, UserPlus, Check, Loader2, Users, AlertCircle
} from 'lucide-react'
import type { ShiftTeam } from '../../services/shiftTeamService'

interface UnassignedEmployee {
  id: string
  code: string
  full_name: string
  department_id: string
}

interface AddMemberModalProps {
  isOpen: boolean
  onClose: () => void
  targetTeam: ShiftTeam | null
  unassignedEmployees: UnassignedEmployee[]
  isLoadingEmployees: boolean
  onAddMembers: (teamId: string, employeeIds: string[]) => Promise<void>
}

export default function AddMemberModal({
  isOpen,
  onClose,
  targetTeam,
  unassignedEmployees,
  isLoadingEmployees,
  onAddMembers
}: AddMemberModalProps) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSearch('')
      setSelected(new Set())
      setError(null)
    }
  }, [isOpen])

  const filteredEmployees = useMemo(() => {
    if (!search.trim()) return unassignedEmployees
    const q = search.toLowerCase()
    return unassignedEmployees.filter(
      e => e.full_name.toLowerCase().includes(q) || e.code.toLowerCase().includes(q)
    )
  }, [unassignedEmployees, search])

  const toggleEmployee = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === filteredEmployees.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filteredEmployees.map(e => e.id)))
    }
  }

  const handleSubmit = async () => {
    if (!targetTeam || selected.size === 0) return
    setIsSubmitting(true)
    setError(null)

    try {
      await onAddMembers(targetTeam.id, Array.from(selected))
      onClose()
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Bottom Sheet / Modal */}
      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl animate-slide-up max-h-[85vh] flex flex-col safe-area-bottom">

        {/* Handle bar (mobile) */}
        <div className="flex justify-center pt-2 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <h3 className="font-semibold text-gray-900 text-[15px]">Thêm thành viên</h3>
            {targetTeam && (
              <p className="text-xs text-gray-500 mt-0.5">
                Vào{' '}
                <span
                  className="font-medium px-1.5 py-0.5 rounded text-white text-[10px]"
                  style={{ backgroundColor: targetTeam.code?.includes('A') ? '#3B82F6' : targetTeam.code?.includes('B') ? '#F59E0B' : '#6B7280' }}
                >
                  {targetTeam.name}
                </span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-lg active:bg-gray-100"
          >
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Tìm nhân viên..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-[15px] border rounded-lg bg-gray-50 
                focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          {/* Select All */}
          {filteredEmployees.length > 0 && (
            <button
              onClick={toggleAll}
              className="flex items-center gap-2 mt-2 text-sm text-blue-600 active:text-blue-800 min-h-[36px]"
            >
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center
                ${selected.size === filteredEmployees.length ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}
              >
                {selected.size === filteredEmployees.length && <Check size={10} className="text-white" />}
              </div>
              <span>
                {selected.size === filteredEmployees.length ? 'Bỏ chọn tất cả' : `Chọn tất cả (${filteredEmployees.length})`}
              </span>
            </button>
          )}
        </div>

        {/* Employee List */}
        <div className="flex-1 overflow-y-auto px-4 py-2 scrollbar-hide" style={{ maxHeight: '40vh' }}>
          {isLoadingEmployees ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-gray-400 mr-2" />
              <span className="text-sm text-gray-500">Đang tải...</span>
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Users size={32} className="text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">
                {search ? 'Không tìm thấy nhân viên' : 'Tất cả nhân viên đã có đội'}
              </p>
            </div>
          ) : (
            filteredEmployees.map((emp) => {
              const isSelected = selected.has(emp.id)
              return (
                <button
                  key={emp.id}
                  onClick={() => toggleEmployee(emp.id)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg mb-1 min-h-[48px]
                    ${isSelected ? 'bg-blue-50 active:bg-blue-100' : 'active:bg-gray-50'}`}
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0
                    ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}
                  >
                    {isSelected && <Check size={12} className="text-white" />}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium text-gray-900 truncate">{emp.full_name}</p>
                    <p className="text-xs text-gray-500">{emp.code}</p>
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-2">
            <div className="flex items-center gap-2 p-2.5 bg-red-50 text-red-700 rounded-lg text-sm">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between pb-safe">
          <span className="text-sm text-gray-600">
            Đã chọn: <strong className="text-blue-600">{selected.size}</strong>
          </span>
          <button
            onClick={handleSubmit}
            disabled={selected.size === 0 || isSubmitting}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg 
              text-sm font-medium active:bg-blue-700 disabled:opacity-40 
              disabled:pointer-events-none min-h-[44px]"
          >
            {isSubmitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <UserPlus size={16} />
            )}
            Thêm {selected.size > 0 ? `(${selected.size})` : ''}
          </button>
        </div>
      </div>

      {/* Animation CSS */}
      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.25s ease-out;
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        .safe-area-bottom { padding-bottom: env(safe-area-inset-bottom, 0px); }
        .pb-safe { padding-bottom: env(safe-area-inset-bottom, 0px); }
      `}</style>
    </div>
  )
}