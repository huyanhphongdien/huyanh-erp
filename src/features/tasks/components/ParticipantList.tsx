// ============================================================================
// PARTICIPANT LIST COMPONENT
// File: src/features/tasks/components/ParticipantList.tsx
// Huy Anh ERP System
// ============================================================================

import React from 'react';
import { AssignmentRoleBadge, type AssignmentRole } from './AssignmentRoleBadge';

// ============================================================================
// TYPES
// ============================================================================

export interface Participant {
  id: string;
  employee_id: string;
  employee?: {
    id: string;
    full_name: string;
    email?: string;
    avatar_url?: string;
    position?: { name: string };
    department?: { name: string };
  };
  role: AssignmentRole | string;
  assigned_at?: string;
  assigned_by?: string;
}

export interface ParticipantListProps {
  participants: Participant[];
  onRemove?: (participantId: string) => void;
  onRoleChange?: (participantId: string, newRole: AssignmentRole) => void;
  canEdit?: boolean;
  showRole?: boolean;
  maxVisible?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const ParticipantList: React.FC<ParticipantListProps> = ({
  participants,
  onRemove,
  onRoleChange,
  canEdit = false,
  showRole = true,
  maxVisible = 5,
  size = 'md',
  className = '',
}) => {
  const visibleParticipants = participants.slice(0, maxVisible);
  const hiddenCount = participants.length - maxVisible;

  const avatarSizes = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
  };

  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  const getAvatarColor = (name: string): string => {
    const colors = [
      'bg-blue-500',
      'bg-green-500',
      'bg-purple-500',
      'bg-orange-500',
      'bg-pink-500',
      'bg-teal-500',
      'bg-indigo-500',
    ];
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  if (participants.length === 0) {
    return (
      <div className={`text-gray-400 text-sm ${className}`}>
        Chưa có người tham gia
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {visibleParticipants.map((participant) => (
        <div
          key={participant.id}
          className="flex items-center gap-2 px-2 py-1 bg-gray-50 rounded-lg group"
        >
          {/* Avatar */}
          {participant.employee?.avatar_url ? (
            <img
              src={participant.employee.avatar_url}
              alt={participant.employee.full_name}
              className={`${avatarSizes[size]} rounded-full object-cover`}
            />
          ) : (
            <div
              className={`
                ${avatarSizes[size]} 
                rounded-full flex items-center justify-center 
                text-white font-medium
                ${getAvatarColor(participant.employee?.full_name || 'U')}
              `}
            >
              {getInitials(participant.employee?.full_name || 'U')}
            </div>
          )}

          {/* Info */}
          <div className="flex flex-col">
            <span className="text-sm font-medium text-gray-900">
              {participant.employee?.full_name || 'Không xác định'}
            </span>
            {showRole && (
              <AssignmentRoleBadge role={participant.role} size="sm" showIcon={false} />
            )}
          </div>

          {/* Remove button */}
          {canEdit && onRemove && (
            <button
              onClick={() => onRemove(participant.id)}
              className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-opacity"
              title="Xóa"
            >
              ✕
            </button>
          )}
        </div>
      ))}

      {/* Hidden count */}
      {hiddenCount > 0 && (
        <div
          className={`
            ${avatarSizes[size]}
            rounded-full flex items-center justify-center
            bg-gray-200 text-gray-600 font-medium
            cursor-pointer hover:bg-gray-300
          `}
          title={`+${hiddenCount} người khác`}
        >
          +{hiddenCount}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// COMPACT VARIANT
// ============================================================================

export const ParticipantAvatars: React.FC<{
  participants: Participant[];
  maxVisible?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ participants, maxVisible = 4, size = 'sm', className = '' }) => {
  const visibleParticipants = participants.slice(0, maxVisible);
  const hiddenCount = participants.length - maxVisible;

  const avatarSizes = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
  };

  const getInitials = (name: string): string => {
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  const getAvatarColor = (name: string): string => {
    const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500'];
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  return (
    <div className={`flex -space-x-2 ${className}`}>
      {visibleParticipants.map((p, index) => (
        <div
          key={p.id}
          className={`
            ${avatarSizes[size]}
            rounded-full flex items-center justify-center
            text-white font-medium border-2 border-white
            ${getAvatarColor(p.employee?.full_name || 'U')}
          `}
          style={{ zIndex: visibleParticipants.length - index }}
          title={p.employee?.full_name}
        >
          {p.employee?.avatar_url ? (
            <img
              src={p.employee.avatar_url}
              alt={p.employee.full_name}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            getInitials(p.employee?.full_name || 'U')
          )}
        </div>
      ))}
      {hiddenCount > 0 && (
        <div
          className={`
            ${avatarSizes[size]}
            rounded-full flex items-center justify-center
            bg-gray-300 text-gray-700 font-medium border-2 border-white
          `}
        >
          +{hiddenCount}
        </div>
      )}
    </div>
  );
};

export default ParticipantList;