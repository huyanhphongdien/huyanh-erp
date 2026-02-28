// ============================================================================
// PHASE 4.3.2: RATING BADGE COMPONENT
// File: src/components/evaluation/RatingBadge.tsx
// Huy Anh ERP System
// ============================================================================

import React from 'react';
import type { RatingLevel } from '../../types/evaluation.types';

// ============================================================================
// TYPES
// ============================================================================

export interface RatingBadgeProps {
  rating: RatingLevel | string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

// ============================================================================
// STYLES CONFIG
// ============================================================================

const RATING_STYLES: Record<string, {
  bg: string;
  text: string;
  border: string;
  icon: string;
}> = {
  'Xuất sắc': {
    bg: 'bg-green-100',
    text: 'text-green-800',
    border: 'border-green-300',
    icon: '🌟',
  },
  'Tốt': {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    border: 'border-blue-300',
    icon: '👍',
  },
  'Khá': {
    bg: 'bg-cyan-100',
    text: 'text-cyan-800',
    border: 'border-cyan-300',
    icon: '✓',
  },
  'Trung bình': {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    border: 'border-yellow-300',
    icon: '➖',
  },
  'Yếu': {
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-300',
    icon: '⚠',
  },
  'default': {
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    border: 'border-gray-300',
    icon: '•',
  },
};

const SIZE_STYLES = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
  lg: 'px-3 py-1.5 text-base',
};

// ============================================================================
// COMPONENT
// ============================================================================

export const RatingBadge: React.FC<RatingBadgeProps> = ({
  rating,
  size = 'md',
  showIcon = true,
  className = '',
}) => {
  // Handle null/undefined
  if (!rating) {
    return (
      <span className={`
        inline-flex items-center gap-1 rounded-full border font-medium
        ${SIZE_STYLES[size]}
        ${RATING_STYLES.default.bg}
        ${RATING_STYLES.default.text}
        ${RATING_STYLES.default.border}
        ${className}
      `}>
        {showIcon && <span>{RATING_STYLES.default.icon}</span>}
        <span>Chưa có</span>
      </span>
    );
  }

  // Get style for rating
  const style = RATING_STYLES[rating] || RATING_STYLES.default;

  return (
    <span className={`
      inline-flex items-center gap-1 rounded-full border font-medium
      ${SIZE_STYLES[size]}
      ${style.bg}
      ${style.text}
      ${style.border}
      ${className}
    `}>
      {showIcon && <span>{style.icon}</span>}
      <span>{rating}</span>
    </span>
  );
};

// ============================================================================
// SCORE BADGE - Hiển thị điểm số kèm màu
// ============================================================================

export interface ScoreBadgeProps {
  score: number | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export const ScoreBadge: React.FC<ScoreBadgeProps> = ({
  score,
  size = 'md',
  showLabel = false,
  className = '',
}) => {
  if (score === null || score === undefined) {
    return (
      <span className={`
        inline-flex items-center gap-1 rounded-full border font-medium
        ${SIZE_STYLES[size]}
        ${RATING_STYLES.default.bg}
        ${RATING_STYLES.default.text}
        ${RATING_STYLES.default.border}
        ${className}
      `}>
        <span>--</span>
        {showLabel && <span>điểm</span>}
      </span>
    );
  }

  // Determine color based on score
  let style = RATING_STYLES.default;
  if (score >= 90) style = RATING_STYLES['Xuất sắc'];
  else if (score >= 80) style = RATING_STYLES['Tốt'];
  else if (score >= 70) style = RATING_STYLES['Khá'];
  else if (score >= 60) style = RATING_STYLES['Trung bình'];
  else style = RATING_STYLES['Yếu'];

  return (
    <span className={`
      inline-flex items-center gap-1 rounded-full border font-bold
      ${SIZE_STYLES[size]}
      ${style.bg}
      ${style.text}
      ${style.border}
      ${className}
    `}>
      <span>{score}</span>
      {showLabel && <span className="font-normal">điểm</span>}
    </span>
  );
};

// ============================================================================
// RATING WITH SCORE - Hiển thị cả điểm và xếp loại
// ============================================================================

export interface RatingWithScoreProps {
  score: number | null | undefined;
  rating?: RatingLevel | string | null;
  size?: 'sm' | 'md' | 'lg';
  layout?: 'horizontal' | 'vertical';
  className?: string;
}

export const RatingWithScore: React.FC<RatingWithScoreProps> = ({
  score,
  rating,
  size = 'md',
  layout = 'horizontal',
  className = '',
}) => {
  const containerClass = layout === 'horizontal' 
    ? 'flex items-center gap-2' 
    : 'flex flex-col items-start gap-1';

  return (
    <div className={`${containerClass} ${className}`}>
      <ScoreBadge score={score} size={size} showLabel />
      {rating && <RatingBadge rating={rating} size={size} showIcon={false} />}
    </div>
  );
};

// ============================================================================
// PROGRESS RING - Hiển thị % hoàn thành dạng vòng tròn
// ============================================================================

export interface ProgressRingProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  className?: string;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({
  percentage,
  size = 48,
  strokeWidth = 4,
  showLabel = true,
  className = '',
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (Math.min(percentage, 100) / 100) * circumference;

  // Color based on percentage
  let strokeColor = 'stroke-gray-400';
  if (percentage >= 100) {
    strokeColor = 'stroke-green-500';
  } else if (percentage >= 75) {
    strokeColor = 'stroke-blue-500';
  } else if (percentage >= 50) {
    strokeColor = 'stroke-yellow-500';
  } else if (percentage >= 25) {
    strokeColor = 'stroke-orange-500';
  } else {
    strokeColor = 'stroke-red-500';
  }

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-200"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={`${strokeColor} transition-all duration-300`}
        />
      </svg>
      {showLabel && (
        <span className="absolute text-xs font-semibold text-gray-700">
          {percentage}%
        </span>
      )}
    </div>
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

export default RatingBadge;