// ============================================================================
// PROGRESS DISPLAY COMPONENT
// File: src/components/tasks/ProgressDisplay.tsx
// Huy Anh ERP System
// ============================================================================
// Component hiển thị tiến độ công việc dưới dạng progress bar và phần trăm
// ============================================================================

import React from 'react';

// ============================================================================
// TYPES
// ============================================================================

export interface ProgressDisplayProps {
  /** Tiến độ từ 0 đến 100 */
  progress: number;
  /** Kích thước thanh progress */
  size?: 'sm' | 'md' | 'lg';
  /** Hiển thị phần trăm */
  showPercent?: boolean;
  /** Hiển thị label mô tả */
  showLabel?: boolean;
  /** Label tùy chỉnh */
  label?: string;
  /** Màu thanh progress */
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'auto';
  /** Có animation không */
  animated?: boolean;
  /** Class CSS bổ sung */
  className?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const HEIGHT_CLASSES: Record<string, string> = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
};

const TEXT_CLASSES: Record<string, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

const COLOR_CLASSES: Record<string, string> = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Xác định màu tự động dựa trên tiến độ
 */
function getAutoColor(progress: number): string {
  if (progress >= 100) return 'bg-green-500';
  if (progress >= 70) return 'bg-blue-500';
  if (progress >= 40) return 'bg-yellow-500';
  return 'bg-red-500';
}

/**
 * Lấy text mô tả tiến độ
 */
function getProgressLabel(progress: number): string {
  if (progress >= 100) return 'Hoàn thành';
  if (progress >= 70) return 'Gần hoàn thành';
  if (progress >= 40) return 'Đang tiến hành';
  if (progress > 0) return 'Mới bắt đầu';
  return 'Chưa bắt đầu';
}

/**
 * Lấy text color class
 */
function getTextColorClass(progress: number): string {
  if (progress >= 100) return 'text-green-600';
  if (progress >= 70) return 'text-blue-600';
  if (progress >= 40) return 'text-yellow-600';
  return 'text-gray-600';
}

// ============================================================================
// COMPONENT
// ============================================================================

export const ProgressDisplay: React.FC<ProgressDisplayProps> = ({
  progress,
  size = 'md',
  showPercent = true,
  showLabel = false,
  label,
  color = 'auto',
  animated = true,
  className = '',
}) => {
  // Normalize progress to 0-100
  const normalizedProgress = Math.min(100, Math.max(0, progress));
  
  // Get height class
  const heightClass = HEIGHT_CLASSES[size] || HEIGHT_CLASSES.md;
  const textClass = TEXT_CLASSES[size] || TEXT_CLASSES.md;
  
  // Get color
  const colorClass = color === 'auto' 
    ? getAutoColor(normalizedProgress) 
    : COLOR_CLASSES[color] || COLOR_CLASSES.blue;
  
  // Get label
  const displayLabel = label || getProgressLabel(normalizedProgress);
  
  return (
    <div className={`w-full ${className}`}>
      {/* Label row */}
      {(showPercent || showLabel) && (
        <div className="flex items-center justify-between mb-1">
          {showLabel && (
            <span className={`${textClass} font-medium ${getTextColorClass(normalizedProgress)}`}>
              {displayLabel}
            </span>
          )}
          {showPercent && (
            <span className={`${textClass} font-semibold ${getTextColorClass(normalizedProgress)}`}>
              {Math.round(normalizedProgress)}%
            </span>
          )}
        </div>
      )}
      
      {/* Progress bar */}
      <div className={`w-full bg-gray-200 rounded-full overflow-hidden ${heightClass}`}>
        <div
          className={`
            ${heightClass} 
            ${colorClass} 
            rounded-full 
            ${animated ? 'transition-all duration-500 ease-out' : ''}
          `.trim().replace(/\s+/g, ' ')}
          style={{ width: `${normalizedProgress}%` }}
          role="progressbar"
          aria-valuenow={normalizedProgress}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
};

// ============================================================================
// VARIANTS
// ============================================================================

/**
 * Compact progress display - chỉ hiện bar và %
 */
export const CompactProgress: React.FC<{
  progress: number;
  className?: string;
}> = ({ progress, className = '' }) => {
  const normalizedProgress = Math.min(100, Math.max(0, progress));
  
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-2 ${getAutoColor(normalizedProgress)} rounded-full transition-all duration-300`}
          style={{ width: `${normalizedProgress}%` }}
        />
      </div>
      <span className="text-sm font-medium text-gray-600 w-10 text-right">
        {Math.round(normalizedProgress)}%
      </span>
    </div>
  );
};

/**
 * Circular progress display
 */
export const CircularProgress: React.FC<{
  progress: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}> = ({ progress, size = 60, strokeWidth = 6, className = '' }) => {
  const normalizedProgress = Math.min(100, Math.max(0, progress));
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (normalizedProgress / 100) * circumference;
  
  // Determine color based on progress
  const progressColor = normalizedProgress >= 100 
    ? '#10B981' // green
    : normalizedProgress >= 70 
      ? '#3B82F6' // blue
      : normalizedProgress >= 40 
        ? '#F59E0B' // yellow
        : '#6B7280'; // gray
  
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#E5E7EB"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={progressColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500 ease-out"
        />
      </svg>
      {/* Center text */}
      <span className="absolute text-sm font-bold" style={{ color: progressColor }}>
        {Math.round(normalizedProgress)}%
      </span>
    </div>
  );
};

/**
 * Progress with steps indicator
 */
export const StepProgress: React.FC<{
  currentStep: number;
  totalSteps: number;
  labels?: string[];
  className?: string;
}> = ({ currentStep, totalSteps, labels = [], className = '' }) => {
  return (
    <div className={`w-full ${className}`}>
      <div className="flex items-center">
        {Array.from({ length: totalSteps }, (_, index) => {
          const stepNumber = index + 1;
          const isCompleted = stepNumber < currentStep;
          const isCurrent = stepNumber === currentStep;
          
          return (
            <React.Fragment key={stepNumber}>
              {/* Step circle */}
              <div
                className={`
                  flex items-center justify-center 
                  w-8 h-8 rounded-full 
                  text-sm font-medium 
                  transition-colors duration-200
                  ${isCompleted 
                    ? 'bg-green-500 text-white' 
                    : isCurrent 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-gray-200 text-gray-600'
                  }
                `}
              >
                {isCompleted ? '✓' : stepNumber}
              </div>
              
              {/* Connector line */}
              {stepNumber < totalSteps && (
                <div
                  className={`
                    flex-1 h-1 mx-2 
                    transition-colors duration-200
                    ${isCompleted ? 'bg-green-500' : 'bg-gray-200'}
                  `}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
      
      {/* Labels */}
      {labels.length > 0 && (
        <div className="flex justify-between mt-2">
          {labels.slice(0, totalSteps).map((label, index) => (
            <span
              key={index}
              className={`
                text-xs text-center
                ${index + 1 === currentStep ? 'text-blue-600 font-medium' : 'text-gray-500'}
              `}
              style={{ width: `${100 / totalSteps}%` }}
            >
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

// Alias for backward compatibility
export { ProgressDisplay as ProgressStats };

export default ProgressDisplay;