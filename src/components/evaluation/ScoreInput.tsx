// ============================================================================
// PHASE 4.3.2: SCORE INPUT COMPONENT
// File: src/components/evaluation/ScoreInput.tsx
// Huy Anh ERP System
// ============================================================================

import React, { useState, useCallback } from 'react';
import { calculateRating } from '../../types/evaluation.types';

// ============================================================================
// TYPES
// ============================================================================

interface ScoreInputProps {
  value: number | null | undefined;
  onChange: (score: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  showSlider?: boolean;
  showRating?: boolean;
  disabled?: boolean;
  error?: string;
  label?: string;
  required?: boolean;
  className?: string;
}

// ============================================================================
// RATING COLORS
// ============================================================================

const getRatingColor = (score: number | null): string => {
  if (score === null || score === undefined) return 'gray';
  if (score >= 90) return 'emerald';
  if (score >= 80) return 'blue';
  if (score >= 70) return 'cyan';
  if (score >= 60) return 'amber';
  return 'red';
};

const getSliderBackground = (score: number, min: number, max: number): string => {
  const percentage = ((score - min) / (max - min)) * 100;
  const color = getRatingColor(score);
  
  const colorMap: Record<string, string> = {
    emerald: '#10b981',
    blue: '#3b82f6',
    cyan: '#06b6d4',
    amber: '#f59e0b',
    red: '#ef4444',
    gray: '#9ca3af',
  };

  return `linear-gradient(to right, ${colorMap[color]} 0%, ${colorMap[color]} ${percentage}%, #e5e7eb ${percentage}%, #e5e7eb 100%)`;
};

// ============================================================================
// COMPONENT
// ============================================================================

export const ScoreInput: React.FC<ScoreInputProps> = ({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  showSlider = true,
  showRating = true,
  disabled = false,
  error,
  label,
  required = false,
  className = '',
}) => {
  const [isFocused, setIsFocused] = useState(false);
  
  const currentScore = value ?? 0;
  const rating = value !== null && value !== undefined ? calculateRating(value) : null;
  const color = getRatingColor(value ?? null);

  // Handle input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    
    if (inputValue === '') {
      onChange(null);
      return;
    }
    
    const numValue = parseInt(inputValue, 10);
    if (!isNaN(numValue)) {
      const clampedValue = Math.min(Math.max(numValue, min), max);
      onChange(clampedValue);
    }
  }, [onChange, min, max]);

  // Handle slider change
  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const numValue = parseInt(e.target.value, 10);
    onChange(numValue);
  }, [onChange]);

  // Color classes based on score
  const colorClasses: Record<string, {
    border: string;
    ring: string;
    text: string;
    bg: string;
  }> = {
    emerald: {
      border: 'border-emerald-500',
      ring: 'ring-emerald-200',
      text: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    blue: {
      border: 'border-blue-500',
      ring: 'ring-blue-200',
      text: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    cyan: {
      border: 'border-cyan-500',
      ring: 'ring-cyan-200',
      text: 'text-cyan-600',
      bg: 'bg-cyan-50',
    },
    amber: {
      border: 'border-amber-500',
      ring: 'ring-amber-200',
      text: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    red: {
      border: 'border-red-500',
      ring: 'ring-red-200',
      text: 'text-red-600',
      bg: 'bg-red-50',
    },
    gray: {
      border: 'border-gray-300',
      ring: 'ring-gray-200',
      text: 'text-gray-600',
      bg: 'bg-gray-50',
    },
  };

  const currentColors = colorClasses[color] || colorClasses.gray;

  return (
    <div className={`w-full ${className}`}>
      {/* Label */}
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div className="space-y-3">
        {/* Number Input + Rating Display */}
        <div className="flex items-center gap-3">
          {/* Number Input */}
          <div className="relative">
            <input
              type="number"
              value={value ?? ''}
              onChange={handleInputChange}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              min={min}
              max={max}
              step={step}
              disabled={disabled}
              className={`
                w-24 px-3 py-2 text-center text-lg font-semibold rounded-lg
                border-2 transition-all duration-200
                ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}
                ${error ? 'border-red-500 ring-2 ring-red-200' : ''}
                ${!error && isFocused ? `${currentColors.border} ring-2 ${currentColors.ring}` : ''}
                ${!error && !isFocused ? 'border-gray-300 hover:border-gray-400' : ''}
                ${currentColors.text}
                focus:outline-none
              `}
              placeholder="--"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
              /{max}
            </span>
          </div>

          {/* Rating Badge */}
          {showRating && rating && (
            <div className={`
              px-3 py-2 rounded-lg font-medium text-sm
              ${currentColors.bg} ${currentColors.text}
            `}>
              {rating}
            </div>
          )}
        </div>

        {/* Slider */}
        {showSlider && (
          <div className="relative">
            <input
              type="range"
              value={currentScore}
              onChange={handleSliderChange}
              min={min}
              max={max}
              step={step}
              disabled={disabled}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed"
              style={{
                background: getSliderBackground(currentScore, min, max),
              }}
            />
            {/* Score markers */}
            <div className="flex justify-between mt-1 text-xs text-gray-400">
              <span>{min}</span>
              <span>60</span>
              <span>70</span>
              <span>80</span>
              <span>90</span>
              <span>{max}</span>
            </div>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}

      {/* Score guide */}
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <span className="text-emerald-600">90-100: Xuất sắc</span>
        <span className="text-blue-600">80-89: Tốt</span>
        <span className="text-cyan-600">70-79: Khá</span>
        <span className="text-amber-600">60-69: Trung bình</span>
        <span className="text-red-600">0-59: Yếu</span>
      </div>
    </div>
  );
};

// ============================================================================
// SIMPLE SCORE INPUT - Phiên bản đơn giản hơn
// ============================================================================

interface SimpleScoreInputProps {
  value: number | null | undefined;
  onChange: (score: number | null) => void;
  disabled?: boolean;
  className?: string;
}

export const SimpleScoreInput: React.FC<SimpleScoreInputProps> = ({
  value,
  onChange,
  disabled = false,
  className = '',
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    if (inputValue === '') {
      onChange(null);
      return;
    }
    const numValue = parseInt(inputValue, 10);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
      onChange(numValue);
    }
  };

  return (
    <input
      type="number"
      value={value ?? ''}
      onChange={handleChange}
      min={0}
      max={100}
      disabled={disabled}
      className={`
        w-20 px-2 py-1 text-center border border-gray-300 rounded
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
        disabled:bg-gray-100 disabled:cursor-not-allowed
        ${className}
      `}
      placeholder="--"
    />
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

export default ScoreInput;