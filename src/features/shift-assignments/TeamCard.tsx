// ============================================================================
// TEAM CARD - Card hiển thị thông tin 1 đội ca
// File: src/features/shift-teams/TeamCard.tsx
// ============================================================================

import { useState } from 'react'
import {
  Users, UserMinus, ArrowRightLeft, MoreVertical,
  ChevronDown, ChevronUp, Loader2
} from 'lucide-react'
import type { ShiftTeam, ShiftTeamMember } from '../../services/shiftTeamService'

interface TeamCardProps {
  team: ShiftTeam
  members: ShiftTeamMember[]
  otherTeams: ShiftTeam[]
  isLoading?: boolean
  onRemoveMember: (memberId: string, employeeName: string) => void
  onTransferMember: (employeeId: string, fromTeamId: string, toTeamId: string, employeeName: string) => void
}

export default function TeamCard({
  team,
  members,
  otherTeams,
  isLoading,
  onRemoveMember,
  onTransferMember
}: TeamCardProps) {
  const [expanded, setExpanded] = useState(true)
  const [actionMenuId, setActionMenuId] = useState<string | null>(null)

  const borderColor = team.code?.includes('A') ? '#3B82F6' : team.code?.includes('B') ? '#F59E0B' : '#6B7280'

  return (
    <div
      className="bg-white rounded-xl border-2 overflow-hidden"
      style={{ borderColor }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 active:bg-gray-50"
        style={{ backgroundColor: `${borderColor}10` }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg"
            style={{ backgroundColor: borderColor }}
          >
            {team.code.replace('TEAM_', '')}
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-gray-900 text-[15px]">{team.name}</h3>
            <p className="text-xs text-gray-500">
              {members.length} thành viên
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-white"
            style={{ backgroundColor: borderColor }}
          >
            <Users size={12} />
            {members.length}
          </span>
          {expanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </div>
      </button>

      {/* Member List */}
      {expanded && (
        <div className="divide-y divide-gray-100">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          ) : members.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <Users size={24} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">Chưa có thành viên</p>
            </div>
          ) : (
            members.map((member) => {
              const emp = member.employee as any
              const empName = emp?.full_name || 'N/A'
              const empCode = emp?.code || ''
              const posName = Array.isArray(emp?.position) ? emp.position[0]?.name : emp?.position?.name

              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between px-4 py-3 relative"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600 flex-shrink-0">
                      {empName.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{empName}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {empCode}{posName ? ` · ${posName}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Action Menu Toggle */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setActionMenuId(actionMenuId === member.id ? null : member.id)
                    }}
                    className="w-9 h-9 flex items-center justify-center rounded-lg active:bg-gray-100 flex-shrink-0"
                  >
                    <MoreVertical size={16} className="text-gray-400" />
                  </button>

                  {/* Dropdown Actions */}
                  {actionMenuId === member.id && (
                    <>
                      {/* Backdrop */}
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setActionMenuId(null)}
                      />
                      <div className="absolute right-4 top-12 z-20 bg-white rounded-lg shadow-lg border py-1 min-w-[180px]">
                        {/* Transfer to other teams */}
                        {otherTeams.map((targetTeam) => (
                          <button
                            key={targetTeam.id}
                            onClick={() => {
                              onTransferMember(
                                member.employee_id,
                                team.id,
                                targetTeam.id,
                                empName
                              )
                              setActionMenuId(null)
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 active:bg-gray-50 min-h-[44px]"
                          >
                            <ArrowRightLeft size={14} className="text-blue-500" />
                            <span>Chuyển sang {targetTeam.name}</span>
                          </button>
                        ))}

                        <div className="border-t my-1" />

                        {/* Remove */}
                        <button
                          onClick={() => {
                            onRemoveMember(member.id, empName)
                            setActionMenuId(null)
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-600 active:bg-red-50 min-h-[44px]"
                        >
                          <UserMinus size={14} />
                          <span>Xóa khỏi đội</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}