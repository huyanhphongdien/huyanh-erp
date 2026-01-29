// ============================================================================
// PROGRESS INPUT COMPONENT
// File: src/components/tasks/ProgressInput.tsx
// Huy Anh ERP System
// ============================================================================
// Component cho phép nhập/cập nhật tiến độ công việc
// Hỗ trợ: Slider, Input number, Quick buttons
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export interface ProgressInputProps {
  /** Giá trị tiến độ hiện tại (0-100) */
  value: number;
  /** Callback khi giá trị thay đổi */
  onChange: (value: number) => void;
  /** Callback khi submit (Enter hoặc blur) */
  onSubmit?: (value: number) => void;
  /** Disabled state */
  disabled?: boolean;
  /** Hiển thị quick buttons */
  showQuickButtons?: boolean;
  /** Hiển thị slider */
  showSlider?: boolean;
  /** Hiển thị input number */
  showInput?: boolean;
  /** Label */
  label?: string;
  /** Hint text */
  hint?: string;
  /** Kích thước */
  size?: 'sm' | 'md' | 'lg';
  /** Class CSS bổ sung */
  className?: string;
  /** Cho phép nhập giá trị > 100 */
  allowOverflow?: boolean;
  /** Step cho slider và buttons */
  step?: number;
}

export interface ProgressUpdateFormProps {
  /** Task ID */
  taskId: string;
  /** Tiến độ hiện tại */
  currentProgress: number;
  /** Callback khi cập nhật thành công */
  onSuccess?: (newProgress: number) => void;
  /** Callback khi có lỗi */
  onError?: (error: string) => void;
  /** Callback khi cancel */
  onCancel?: () => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const QUICK_VALUES = [0, 25, 50, 75, 100];

const SIZE_CLASSES = {
  sm: {
    input: 'w-16 px-2 py-1 text-sm',
    slider: 'h-1.5',
    button: 'px-2 py-1 text-xs',
    label: 'text-sm',
  },
  md: {
    input: 'w-20 px-3 py-2 text-base',
    slider: 'h-2',
    button: 'px-3 py-1.5 text-sm',
    label: 'text-base',
  },
  lg: {
    input: 'w-24 px-4 py-2.5 text-lg',
    slider: 'h-3',
    button: 'px-4 py-2 text-base',
    label: 'text-lg',
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getProgressColor(value: number): string {
  if (value >= 100) return 'text-green-600';
  if (value >= 70) return 'text-blue-600';
  if (value >= 40) return 'text-yellow-600';
  return 'text-gray-600';
}

function getSliderBackground(value: number): string {
  const percent = Math.min(100, Math.max(0, value));
  
  let color = '#6B7280'; // gray
  if (percent >= 100) color = '#10B981'; // green
  else if (percent >= 70) color = '#3B82F6'; // blue
  else if (percent >= 40) color = '#F59E0B'; // yellow
  
  return `linear-gradient(to right, ${color} 0%, ${color} ${percent}%, #E5E7EB ${percent}%, #E5E7EB 100%)`;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ProgressInput: React.FC<ProgressInputProps> = ({
  value,
  onChange,
  onSubmit,
  disabled = false,
  showQuickButtons = true,
  showSlider = true,
  showInput = true,
  label,
  hint,
  size = 'md',
  className = '',
  allowOverflow = false,
  step = 5,
}) => {
  const [localValue, setLocalValue] = useState(value);
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;

  // Sync with external value
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Handle value change
  const handleChange = useCallback((newValue: number) => {
    const maxValue = allowOverflow ? 200 : 100;
    const clampedValue = Math.min(maxValue, Math.max(0, newValue));
    setLocalValue(clampedValue);
    onChange(clampedValue);
  }, [onChange, allowOverflow]);

  // Handle submit
  const handleSubmit = useCallback(() => {
    if (onSubmit) {
      onSubmit(localValue);
    }
  }, [onSubmit, localValue]);

  // Handle key press
  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  }, [handleSubmit]);

  // Increment/Decrement
  const increment = useCallback(() => {
    handleChange(localValue + step);
  }, [localValue, step, handleChange]);

  const decrement = useCallback(() => {
    handleChange(localValue - step);
  }, [localValue, step, handleChange]);

  return (
    <div className={`w-full ${className}`}>
      {/* Label */}
      {label && (
        <label className={`block font-medium text-gray-700 mb-2 ${sizeClass.label}`}>
          {label}
        </label>
      )}

      {/* Quick Buttons */}
      {showQuickButtons && (
        <div className="flex flex-wrap gap-2 mb-3">
          {QUICK_VALUES.map((quickValue) => (
            <button
              key={quickValue}
              type="button"
              onClick={() => handleChange(quickValue)}
              disabled={disabled}
              className={`
                ${sizeClass.button}
                rounded-lg font-medium transition-colors
                ${localValue === quickValue
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              {quickValue}%
            </button>
          ))}
        </div>
      )}

      {/* Slider */}
      {showSlider && (
        <div className="mb-3">
          <input
            type="range"
            min="0"
            max={allowOverflow ? 200 : 100}
            step={step}
            value={localValue}
            onChange={(e) => handleChange(Number(e.target.value))}
            onMouseUp={handleSubmit}
            onTouchEnd={handleSubmit}
            disabled={disabled}
            className={`
              w-full ${sizeClass.slider} rounded-lg appearance-none cursor-pointer
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
            style={{ background: getSliderBackground(localValue) }}
          />
        </div>
      )}

      {/* Input with controls */}
      {showInput && (
        <div className="flex items-center gap-2">
          {/* Decrement button */}
          <button
            type="button"
            onClick={decrement}
            disabled={disabled || localValue <= 0}
            className="p-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            −
          </button>

          {/* Number input */}
          <div className="relative">
            <input
              type="number"
              min="0"
              max={allowOverflow ? 200 : 100}
              step={step}
              value={localValue}
              onChange={(e) => handleChange(Number(e.target.value))}
              onBlur={handleSubmit}
              onKeyPress={handleKeyPress}
              disabled={disabled}
              className={`
                ${sizeClass.input}
                border border-gray-300 rounded-lg text-center
                focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                disabled:bg-gray-100 disabled:cursor-not-allowed
                ${getProgressColor(localValue)}
                font-semibold
              `}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              %
            </span>
          </div>

          {/* Increment button */}
          <button
            type="button"
            onClick={increment}
            disabled={disabled || localValue >= (allowOverflow ? 200 : 100)}
            className="p-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            +
          </button>
        </div>
      )}

      {/* Hint */}
      {hint && (
        <p className="mt-2 text-sm text-gray-500">{hint}</p>
      )}

      {/* Progress indicator text */}
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className={`font-medium ${getProgressColor(localValue)}`}>
          {localValue >= 100 ? 'Hoàn thành' : 
           localValue >= 70 ? 'Gần hoàn thành' : 
           localValue >= 40 ? 'Đang tiến hành' : 
           localValue > 0 ? 'Mới bắt đầu' : 'Chưa bắt đầu'}
        </span>
        <span className="text-gray-400">
          {localValue}/100
        </span>
      </div>
    </div>
  );
};

// ============================================================================
// COMPACT INPUT VARIANT
// ============================================================================

export const CompactProgressInput: React.FC<{
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
}> = ({ value, onChange, disabled = false, className = '' }) => {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <input
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="flex-1 h-2 rounded-lg appearance-none cursor-pointer"
        style={{ background: getSliderBackground(value) }}
      />
      <span className={`w-12 text-right text-sm font-semibold ${getProgressColor(value)}`}>
        {value}%
      </span>
    </div>
  );
};

// ============================================================================
// INLINE EDIT VARIANT
// ============================================================================

export const InlineProgressEdit: React.FC<{
  value: number;
  onSave: (value: number) => Promise<void>;
  disabled?: boolean;
  className?: string;
}> = ({ value, onSave, disabled = false, className = '' }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  const handleSave = async () => {
    if (editValue === value) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(editValue);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save progress:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <button
        onClick={() => !disabled && setIsEditing(true)}
        disabled={disabled}
        className={`
          flex items-center gap-2 px-2 py-1 rounded-lg
          hover:bg-gray-100 transition-colors
          disabled:cursor-not-allowed
          ${className}
        `}
      >
        <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${value >= 100 ? 'bg-green-500' : 'bg-blue-500'}`}
            style={{ width: `${Math.min(100, value)}%` }}
          />
        </div>
        <span className={`text-sm font-medium ${getProgressColor(value)}`}>
          {value}%
        </span>
        {!disabled && <span className="text-gray-400 text-xs">✎</span>}
      </button>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <input
        type="number"
        min="0"
        max="100"
        value={editValue}
        onChange={(e) => setEditValue(Number(e.target.value))}
        onKeyPress={(e) => e.key === 'Enter' && handleSave()}
        disabled={isSaving}
        autoFocus
        className="w-16 px-2 py-1 text-sm border border-blue-500 rounded focus:ring-2 focus:ring-blue-200"
      />
      <button
        onClick={handleSave}
        disabled={isSaving}
        className="p-1 text-green-600 hover:bg-green-50 rounded"
      >
        {isSaving ? '...' : '✓'}
      </button>
      <button
        onClick={handleCancel}
        disabled={isSaving}
        className="p-1 text-gray-400 hover:bg-gray-100 rounded"
      >
        ✕
      </button>
    </div>
  );
};

// ============================================================================
// PROGRESS UPDATE FORM
// ============================================================================

export const ProgressUpdateForm: React.FC<ProgressUpdateFormProps> = ({
  taskId,
  currentProgress,
  onSuccess,
  onError,
  onCancel,
}) => {
  const [progress, setProgress] = useState(currentProgress);
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (progress === currentProgress && !note) {
      onCancel?.();
      return;
    }

    setIsSubmitting(true);
    try {
      // TODO: Call API to update progress
      // await progressService.updateProgress(taskId, progress, note);
      
      console.log('Updating progress:', { taskId, progress, note });
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      onSuccess?.(progress);
    } catch (error: any) {
      onError?.(error.message || 'Không thể cập nhật tiến độ');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <ProgressInput
        value={progress}
        onChange={setProgress}
        label="Tiến độ công việc"
        hint="Kéo slider hoặc nhập trực tiếp phần trăm hoàn thành"
        disabled={isSubmitting}
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Ghi chú cập nhật (tùy chọn)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={isSubmitting}
          rows={3}
          placeholder="Mô tả công việc đã làm được..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Đang lưu...' : 'Cập nhật'}
        </button>
      </div>
    </form>
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

export default ProgressInput;