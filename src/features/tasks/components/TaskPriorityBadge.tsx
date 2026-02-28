// ============================================================================
// TASK PRIORITY BADGE COMPONENT
// File: src/features/tasks/components/TaskPriorityBadge.tsx
// Huy Anh ERP System
// ============================================================================

import React from 'react';

// ============================================================================
// TYPES
// ============================================================================

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface TaskPriorityBadgeProps {
  priority: TaskPriority | string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  showLabel?: boolean;
  className?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PRIORITY_CONFIG: Record<string, {
  label: string;
  icon: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
}> = {
  low: {
    label: 'Thấp',
    icon: '↓',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-700',
    borderColor: 'border-gray-300',
  },
  medium: {
    label: 'Trung bình',
    icon: '→',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-300',
  },
  high: {
    label: 'Cao',
    icon: '↑',
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-700',
    borderColor: 'border-orange-300',
  },
  urgent: {
    label: 'Khẩn cấp',
    icon: '⚡',
    bgColor: 'bg-red-100',
    textColor: 'text-red-700',
    borderColor: 'border-red-300',
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

export const TaskPriorityBadge: React.FC<TaskPriorityBadgeProps> = ({
  priority,
  size = 'md',
  showIcon = true,
  showLabel = true,
  className = '',
}) => {
  const config = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium;
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;

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
      {showLabel && <span>{config.label}</span>}
    </span>
  );
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function getPriorityLabel(priority: string): string {
  return PRIORITY_CONFIG[priority]?.label || priority;
}

export function getPriorityColor(priority: string): string {
  return PRIORITY_CONFIG[priority]?.textColor || 'text-gray-600';
}

export function getPriorityBgColor(priority: string): string {
  return PRIORITY_CONFIG[priority]?.bgColor || 'bg-gray-100';
}

export function getPriorityIcon(priority: string): string {
  return PRIORITY_CONFIG[priority]?.icon || '•';
}

export function sortByPriority(a: string, b: string): number {
  const order: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  return (order[a] ?? 99) - (order[b] ?? 99);
}

export default TaskPriorityBadge;