// ============================================================================
// PHASE 4.3.2: STATUS BADGE COMPONENT
// File: src/components/evaluation/StatusBadge.tsx
// Huy Anh ERP System
// ============================================================================

import React from 'react';
import type {
  SelfEvaluationStatus,
  ApprovalAction,
} from '../../types/evaluation.types';
import {
  SELF_EVALUATION_STATUS_LABELS,
  APPROVAL_ACTION_LABELS,
} from '../../types/evaluation.types';

// ============================================================================
// TYPES
// ============================================================================

export type BadgeVariant = 'solid' | 'outline' | 'subtle';

export interface EvaluationStatusBadgeProps {
  status: SelfEvaluationStatus | string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  variant?: BadgeVariant;
  showIcon?: boolean;
  className?: string;
}

export interface ApprovalActionBadgeProps {
  action: ApprovalAction | string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  variant?: BadgeVariant;
  showIcon?: boolean;
  className?: string;
}

// ============================================================================
// STYLES CONFIG
// ============================================================================

// Self-Evaluation Status Styles
const EVALUATION_STATUS_STYLES: Record<string, {
  solid: string;
  outline: string;
  subtle: string;
  icon: string;
}> = {
  'pending': {
    solid: 'bg-yellow-500 text-white border-yellow-500',
    outline: 'bg-transparent text-yellow-600 border-yellow-500',
    subtle: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    icon: '⏳',
  },
  'approved': {
    solid: 'bg-green-500 text-white border-green-500',
    outline: 'bg-transparent text-green-600 border-green-500',
    subtle: 'bg-green-50 text-green-700 border-green-200',
    icon: '✓',
  },
  'rejected': {
    solid: 'bg-red-500 text-white border-red-500',
    outline: 'bg-transparent text-red-600 border-red-500',
    subtle: 'bg-red-50 text-red-700 border-red-200',
    icon: '✕',
  },
  'revision_requested': {
    solid: 'bg-orange-500 text-white border-orange-500',
    outline: 'bg-transparent text-orange-600 border-orange-500',
    subtle: 'bg-orange-50 text-orange-700 border-orange-200',
    icon: '↻',
  },
  'default': {
    solid: 'bg-gray-500 text-white border-gray-500',
    outline: 'bg-transparent text-gray-600 border-gray-500',
    subtle: 'bg-gray-50 text-gray-700 border-gray-200',
    icon: '•',
  },
};

// Approval Action Styles
const APPROVAL_ACTION_STYLES: Record<string, {
  solid: string;
  outline: string;
  subtle: string;
  icon: string;
}> = {
  'approve': {
    solid: 'bg-green-500 text-white border-green-500',
    outline: 'bg-transparent text-green-600 border-green-500',
    subtle: 'bg-green-50 text-green-700 border-green-200',
    icon: '✓',
  },
  'reject': {
    solid: 'bg-red-500 text-white border-red-500',
    outline: 'bg-transparent text-red-600 border-red-500',
    subtle: 'bg-red-50 text-red-700 border-red-200',
    icon: '✕',
  },
  'request_info': {
    solid: 'bg-orange-500 text-white border-orange-500',
    outline: 'bg-transparent text-orange-600 border-orange-500',
    subtle: 'bg-orange-50 text-orange-700 border-orange-200',
    icon: '?',
  },
  'default': {
    solid: 'bg-gray-500 text-white border-gray-500',
    outline: 'bg-transparent text-gray-600 border-gray-500',
    subtle: 'bg-gray-50 text-gray-700 border-gray-200',
    icon: '•',
  },
};

// Size Styles
const SIZE_STYLES = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
  lg: 'px-3 py-1.5 text-base',
};

// ============================================================================
// EVALUATION STATUS BADGE
// ============================================================================

export const EvaluationStatusBadge: React.FC<EvaluationStatusBadgeProps> = ({
  status,
  size = 'md',
  variant = 'subtle',
  showIcon = true,
  className = '',
}) => {
  if (!status) {
    return (
      <span className={`
        inline-flex items-center gap-1 rounded-full border font-medium
        ${SIZE_STYLES[size]}
        ${EVALUATION_STATUS_STYLES.default[variant]}
        ${className}
      `}>
        {showIcon && <span>{EVALUATION_STATUS_STYLES.default.icon}</span>}
        <span>Không xác định</span>
      </span>
    );
  }

  const style = EVALUATION_STATUS_STYLES[status] || EVALUATION_STATUS_STYLES.default;
  const label = SELF_EVALUATION_STATUS_LABELS[status as SelfEvaluationStatus] || status;

  return (
    <span className={`
      inline-flex items-center gap-1 rounded-full border font-medium
      ${SIZE_STYLES[size]}
      ${style[variant]}
      ${className}
    `}>
      {showIcon && <span>{style.icon}</span>}
      <span>{label}</span>
    </span>
  );
};

// ============================================================================
// APPROVAL ACTION BADGE
// ============================================================================

export const ApprovalActionBadge: React.FC<ApprovalActionBadgeProps> = ({
  action,
  size = 'md',
  variant = 'subtle',
  showIcon = true,
  className = '',
}) => {
  if (!action) {
    return (
      <span className={`
        inline-flex items-center gap-1 rounded-full border font-medium
        ${SIZE_STYLES[size]}
        ${APPROVAL_ACTION_STYLES.default[variant]}
        ${className}
      `}>
        {showIcon && <span>{APPROVAL_ACTION_STYLES.default.icon}</span>}
        <span>Không xác định</span>
      </span>
    );
  }

  const style = APPROVAL_ACTION_STYLES[action] || APPROVAL_ACTION_STYLES.default;
  const label = APPROVAL_ACTION_LABELS[action as ApprovalAction] || action;

  return (
    <span className={`
      inline-flex items-center gap-1 rounded-full border font-medium
      ${SIZE_STYLES[size]}
      ${style[variant]}
      ${className}
    `}>
      {showIcon && <span>{style.icon}</span>}
      <span>{label}</span>
    </span>
  );
};

// ============================================================================
// GENERIC STATUS BADGE - Có thể dùng cho bất kỳ status nào
// ============================================================================

export type GenericStatusType = 'success' | 'warning' | 'error' | 'info' | 'default';

export interface GenericStatusBadgeProps {
  label: string;
  type?: GenericStatusType;
  size?: 'sm' | 'md' | 'lg';
  variant?: BadgeVariant;
  icon?: string | React.ReactNode;
  className?: string;
}

const GENERIC_STATUS_STYLES: Record<GenericStatusType, {
  solid: string;
  outline: string;
  subtle: string;
}> = {
  success: {
    solid: 'bg-green-500 text-white border-green-500',
    outline: 'bg-transparent text-green-600 border-green-500',
    subtle: 'bg-green-50 text-green-700 border-green-200',
  },
  warning: {
    solid: 'bg-yellow-500 text-white border-yellow-500',
    outline: 'bg-transparent text-yellow-600 border-yellow-500',
    subtle: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  },
  error: {
    solid: 'bg-red-500 text-white border-red-500',
    outline: 'bg-transparent text-red-600 border-red-500',
    subtle: 'bg-red-50 text-red-700 border-red-200',
  },
  info: {
    solid: 'bg-blue-500 text-white border-blue-500',
    outline: 'bg-transparent text-blue-600 border-blue-500',
    subtle: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  default: {
    solid: 'bg-gray-500 text-white border-gray-500',
    outline: 'bg-transparent text-gray-600 border-gray-500',
    subtle: 'bg-gray-50 text-gray-700 border-gray-200',
  },
};

export const GenericStatusBadge: React.FC<GenericStatusBadgeProps> = ({
  label,
  type = 'default',
  size = 'md',
  variant = 'subtle',
  icon,
  className = '',
}) => {
  const style = GENERIC_STATUS_STYLES[type];

  return (
    <span className={`
      inline-flex items-center gap-1 rounded-full border font-medium
      ${SIZE_STYLES[size]}
      ${style[variant]}
      ${className}
    `}>
      {icon && <span>{icon}</span>}
      <span>{label}</span>
    </span>
  );
};

// ============================================================================
// COMPLETION PERCENTAGE BADGE
// ============================================================================

export interface CompletionBadgeProps {
  percentage: number;
  size?: 'sm' | 'md' | 'lg';
  showBar?: boolean;
  className?: string;
}

export const CompletionBadge: React.FC<CompletionBadgeProps> = ({
  percentage,
  size = 'md',
  showBar = false,
  className = '',
}) => {
  // Determine color based on percentage
  let colorClass = 'bg-gray-500';
  let textClass = 'text-gray-700';
  let bgClass = 'bg-gray-100';
  
  if (percentage >= 100) {
    colorClass = 'bg-green-500';
    textClass = 'text-green-700';
    bgClass = 'bg-green-100';
  } else if (percentage >= 75) {
    colorClass = 'bg-blue-500';
    textClass = 'text-blue-700';
    bgClass = 'bg-blue-100';
  } else if (percentage >= 50) {
    colorClass = 'bg-yellow-500';
    textClass = 'text-yellow-700';
    bgClass = 'bg-yellow-100';
  } else if (percentage >= 25) {
    colorClass = 'bg-orange-500';
    textClass = 'text-orange-700';
    bgClass = 'bg-orange-100';
  } else {
    colorClass = 'bg-red-500';
    textClass = 'text-red-700';
    bgClass = 'bg-red-100';
  }

  if (showBar) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className={`h-full ${colorClass} transition-all duration-300`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
        <span className={`${textClass} text-sm font-medium min-w-[40px] text-right`}>
          {percentage}%
        </span>
      </div>
    );
  }

  return (
    <span className={`
      inline-flex items-center gap-1 rounded-full border font-medium
      ${SIZE_STYLES[size]}
      ${bgClass}
      ${textClass}
      border-current border-opacity-30
      ${className}
    `}>
      <span>{percentage}%</span>
    </span>
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

export default EvaluationStatusBadge;