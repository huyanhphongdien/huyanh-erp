// ============================================================================
// ASSIGNMENT ROLE BADGE COMPONENT
// File: src/features/tasks/components/AssignmentRoleBadge.tsx
// Huy Anh ERP System
// ============================================================================

import React from 'react';

// ============================================================================
// TYPES
// ============================================================================

export type AssignmentRole = 'assignee' | 'reviewer' | 'observer' | 'creator' | 'approver';

export interface AssignmentRoleBadgeProps {
  role: AssignmentRole | string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ROLE_CONFIG: Record<string, {
  label: string;
  icon: string;
  bgColor: string;
  textColor: string;
}> = {
  assignee: {
    label: 'Thực hiện',
    icon: '👤',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-700',
  },
  reviewer: {
    label: 'Kiểm tra',
    icon: '👁️',
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-700',
  },
  observer: {
    label: 'Theo dõi',
    icon: '👀',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-700',
  },
  creator: {
    label: 'Tạo',
    icon: '✏️',
    bgColor: 'bg-green-100',
    textColor: 'text-green-700',
  },
  approver: {
    label: 'Phê duyệt',
    icon: '✓',
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-700',
  },
};

const SIZE_CLASSES: Record<string, string> = {
  sm: 'px-1.5 py-0.5 text-xs',
  md: 'px-2 py-1 text-sm',
  lg: 'px-3 py-1.5 text-base',
};

// ============================================================================
// COMPONENT
// ============================================================================

export const AssignmentRoleBadge: React.FC<AssignmentRoleBadgeProps> = ({
  role,
  size = 'sm',
  showIcon = true,
  className = '',
}) => {
  const config = ROLE_CONFIG[role] || {
    label: role,
    icon: '•',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-600',
  };
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.sm;

  return (
    <span
      className={`
        inline-flex items-center gap-1
        font-medium rounded-full
        ${config.bgColor}
        ${config.textColor}
        ${sizeClass}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
    >
      {showIcon && <span>{config.icon}</span>}
      <span>{config.label}</span>
    </span>
  );
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function getRoleLabel(role: string): string {
  return ROLE_CONFIG[role]?.label || role;
}

export function getRoleIcon(role: string): string {
  return ROLE_CONFIG[role]?.icon || '•';
}

export function getAllRoles(): { value: AssignmentRole; label: string }[] {
  return Object.entries(ROLE_CONFIG).map(([value, config]) => ({
    value: value as AssignmentRole,
    label: config.label,
  }));
}

export default AssignmentRoleBadge;