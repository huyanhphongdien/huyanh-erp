// ============================================================================
// PHASE 4.3.2: SELF EVALUATION FORM COMPONENT
// File: src/components/evaluation/SelfEvaluationForm.tsx
// Huy Anh ERP System
// ============================================================================

import React, { useState, useEffect } from 'react';
import {
  type CreateSelfEvaluationInput,
  type UpdateSelfEvaluationInput,
  type TaskSelfEvaluation,
  type QualityAssessment,
  calculateRating,
} from '../../types/evaluation.types';
import { ScoreInput } from './ScoreInput';
import { RatingBadge, ProgressRing } from './RatingBadge';

// ============================================================================
// TYPES
// ============================================================================

interface TaskInfo {
  id: string;
  code?: string;
  name?: string;
  title?: string;
  due_date?: string;
  department?: { name: string };
}

interface SelfEvaluationFormProps {
  // Mode
  mode: 'create' | 'edit';
  
  // Data
  task?: TaskInfo;
  initialData?: TaskSelfEvaluation;
  employeeId: string;
  
  // Callbacks
  onSubmit: (data: CreateSelfEvaluationInput | UpdateSelfEvaluationInput) => Promise<void>;
  onCancel: () => void;
  
  // State
  isLoading?: boolean;
  error?: string;
}

// FIXED: Match database schema - use 'solutions' not 'solutions_applied', add 'achievements'
interface FormData {
  completion_percentage: number;
  quality_assessment: QualityAssessment | '';
  self_score: number | null;
  achievements: string;
  difficulties: string;
  solutions: string;  // FIXED: was solutions_applied
  recommendations: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// FIXED: Use database values (excellent, good, average, below_average)
const QUALITY_OPTIONS: { value: QualityAssessment; label: string; description: string }[] = [
  { value: 'excellent', label: 'Xuất sắc', description: 'Vượt xa kỳ vọng, chất lượng cao nhất' },
  { value: 'good', label: 'Tốt', description: 'Đáp ứng tốt yêu cầu, chất lượng cao' },
  { value: 'average', label: 'Trung bình', description: 'Đáp ứng yêu cầu cơ bản' },
  { value: 'below_average', label: 'Cần cải thiện', description: 'Chưa đáp ứng yêu cầu, cần cải thiện nhiều' },
];

// ============================================================================
// COMPONENT
// ============================================================================

export const SelfEvaluationForm: React.FC<SelfEvaluationFormProps> = ({
  mode,
  task,
  initialData,
  employeeId,
  onSubmit,
  onCancel,
  isLoading = false,
  error,
}) => {
  // Form state - FIXED: match database schema
  const [formData, setFormData] = useState<FormData>({
    completion_percentage: 100,
    quality_assessment: '',
    self_score: null,
    achievements: '',
    difficulties: '',
    solutions: '',  // FIXED: was solutions_applied
    recommendations: '',
  });

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize form with existing data - FIXED: use correct field names
  useEffect(() => {
    if (initialData && mode === 'edit') {
      setFormData({
        completion_percentage: initialData.completion_percentage || 100,
        quality_assessment: (initialData.quality_assessment as QualityAssessment) || '',
        self_score: initialData.self_score,
        achievements: initialData.achievements || '',
        difficulties: initialData.difficulties || '',
        solutions: initialData.solutions || '',  // FIXED: was solutions_applied
        recommendations: initialData.recommendations || '',
      });
    }
  }, [initialData, mode]);

  // Calculate rating from score
  const calculatedRating = formData.self_score !== null 
    ? calculateRating(formData.self_score) 
    : null;

  // Handle field change
  const handleChange = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear validation error when field changes
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  // Validate form
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (formData.completion_percentage < 0 || formData.completion_percentage > 100) {
      errors.completion_percentage = 'Tỷ lệ hoàn thành phải từ 0 đến 100%';
    }

    if (!formData.quality_assessment) {
      errors.quality_assessment = 'Vui lòng chọn đánh giá chất lượng';
    }

    if (formData.self_score === null) {
      errors.self_score = 'Vui lòng nhập điểm tự đánh giá';
    } else if (formData.self_score < 0 || formData.self_score > 100) {
      errors.self_score = 'Điểm phải từ 0 đến 100';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle submit - FIXED: use correct field names
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const submitData: CreateSelfEvaluationInput | UpdateSelfEvaluationInput = {
        ...(mode === 'create' && task ? { task_id: task.id, employee_id: employeeId } : {}),
        completion_percentage: formData.completion_percentage,
        quality_assessment: formData.quality_assessment as QualityAssessment,
        self_score: formData.self_score!,
        achievements: formData.achievements || undefined,
        difficulties: formData.difficulties || undefined,
        solutions: formData.solutions || undefined,  // FIXED: was solutions_applied
        recommendations: formData.recommendations || undefined,
      };

      await onSubmit(submitData);
    } catch (err) {
      console.error('Submit error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const loading = isLoading || isSubmitting;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Task Info Header */}
      {task && (
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <h3 className="font-medium text-gray-900 mb-2">
            Thông tin công việc
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Mã công việc:</span>
              <span className="ml-2 font-medium">{task.code || '—'}</span>
            </div>
            <div>
              <span className="text-gray-500">Phòng ban:</span>
              <span className="ml-2">{task.department?.name || '—'}</span>
            </div>
            <div className="col-span-2">
              <span className="text-gray-500">Tên công việc:</span>
              <span className="ml-2 font-medium">{task.title || task.name || '—'}</span>
            </div>
            {task.due_date && (
              <div>
                <span className="text-gray-500">Hạn hoàn thành:</span>
                <span className="ml-2">
                  {new Date(task.due_date).toLocaleDateString('vi-VN')}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Completion Percentage */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Tỷ lệ hoàn thành công việc <span className="text-red-500">*</span>
        </label>
        <div className="flex items-center gap-4">
          <ProgressRing 
            percentage={formData.completion_percentage} 
            size={64} 
            strokeWidth={6}
          />
          <div className="flex-1">
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={formData.completion_percentage}
              onChange={(e) => handleChange('completion_percentage', parseInt(e.target.value))}
              disabled={loading}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
        </div>
        {validationErrors.completion_percentage && (
          <p className="mt-1 text-sm text-red-600">{validationErrors.completion_percentage}</p>
        )}
      </div>

      {/* Quality Assessment */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Đánh giá chất lượng công việc <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {QUALITY_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`
                relative flex flex-col p-3 border-2 rounded-lg cursor-pointer transition-all
                ${formData.quality_assessment === option.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
                }
                ${loading ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              <input
                type="radio"
                name="quality_assessment"
                value={option.value}
                checked={formData.quality_assessment === option.value}
                onChange={(e) => handleChange('quality_assessment', e.target.value)}
                disabled={loading}
                className="sr-only"
              />
              <span className="font-medium text-gray-900">{option.label}</span>
              <span className="text-xs text-gray-500 mt-1">{option.description}</span>
              {formData.quality_assessment === option.value && (
                <span className="absolute top-2 right-2 text-blue-500">✓</span>
              )}
            </label>
          ))}
        </div>
        {validationErrors.quality_assessment && (
          <p className="mt-1 text-sm text-red-600">{validationErrors.quality_assessment}</p>
        )}
      </div>

      {/* Self Score */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Điểm tự đánh giá <span className="text-red-500">*</span>
        </label>
        <ScoreInput
          value={formData.self_score}
          onChange={(score) => handleChange('self_score', score)}
          showSlider
          showRating
          disabled={loading}
          error={validationErrors.self_score}
        />
      </div>

      {/* Calculated Rating Display */}
      {calculatedRating && (
        <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
          <span className="text-sm text-gray-600">Xếp loại tự động:</span>
          <RatingBadge rating={calculatedRating} size="lg" showIcon />
        </div>
      )}

      {/* Achievements - NEW FIELD */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Kết quả đạt được
        </label>
        <textarea
          value={formData.achievements}
          onChange={(e) => handleChange('achievements', e.target.value)}
          disabled={loading}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
          placeholder="Mô tả các kết quả, thành tựu đạt được trong quá trình thực hiện..."
        />
      </div>

      {/* Difficulties */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Khó khăn gặp phải
        </label>
        <textarea
          value={formData.difficulties}
          onChange={(e) => handleChange('difficulties', e.target.value)}
          disabled={loading}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
          placeholder="Mô tả các khó khăn, thách thức gặp phải trong quá trình thực hiện..."
        />
      </div>

      {/* Solutions - FIXED: was solutions_applied */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Giải pháp đã áp dụng
        </label>
        <textarea
          value={formData.solutions}
          onChange={(e) => handleChange('solutions', e.target.value)}
          disabled={loading}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
          placeholder="Các giải pháp, cách tiếp cận đã sử dụng để giải quyết vấn đề..."
        />
      </div>

      {/* Recommendations */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Đề xuất, kiến nghị
        </label>
        <textarea
          value={formData.recommendations}
          onChange={(e) => handleChange('recommendations', e.target.value)}
          disabled={loading}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
          placeholder="Đề xuất cải tiến, kiến nghị cho các công việc tương tự trong tương lai..."
        />
      </div>

      {/* Form Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          {loading && (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
          {mode === 'create' ? 'Gửi đánh giá' : 'Cập nhật'}
        </button>
      </div>
    </form>
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

export default SelfEvaluationForm;