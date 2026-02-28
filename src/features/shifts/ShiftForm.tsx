// ============================================================
// SHIFT FORM - Form tạo/sửa ca làm việc (RESPONSIVE)
// File: src/features/shifts/ShiftForm.tsx
// ============================================================

import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { shiftService } from '../../services';
import { Save, X, AlertCircle } from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

interface Shift {
  id: string;
  code: string;
  name: string;
  shift_category: 'short' | 'long' | 'admin';
  start_time: string;
  end_time: string;
  crosses_midnight: boolean;
  standard_hours: number;
  break_minutes: number;
  late_threshold_minutes: number;
  early_leave_threshold_minutes: number;
  is_active: boolean;
}

interface ShiftFormProps {
  initialData?: Shift | null;
  onSuccess: () => void;
  onCancel: () => void;
}

interface FormData {
  code: string;
  name: string;
  shift_category: 'short' | 'long' | 'admin';
  start_time: string;
  end_time: string;
  crosses_midnight: boolean;
  standard_hours: number;
  break_minutes: number;
  late_threshold_minutes: number;
  early_leave_threshold_minutes: number;
  is_active: boolean;
}

// ============================================================
// COMPONENT
// ============================================================

export function ShiftForm({ initialData, onSuccess, onCancel }: ShiftFormProps) {
  const isEdit = !!initialData;

  const [form, setForm] = useState<FormData>({
    code: '',
    name: '',
    shift_category: 'short',
    start_time: '06:00',
    end_time: '14:00',
    crosses_midnight: false,
    standard_hours: 7,
    break_minutes: 60,
    late_threshold_minutes: 15,
    early_leave_threshold_minutes: 15,
    is_active: true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState('');

  // Populate form on edit
  useEffect(() => {
    if (initialData) {
      setForm({
        code: initialData.code,
        name: initialData.name,
        shift_category: initialData.shift_category,
        start_time: initialData.start_time?.substring(0, 5) || '06:00',
        end_time: initialData.end_time?.substring(0, 5) || '14:00',
        crosses_midnight: initialData.crosses_midnight,
        standard_hours: initialData.standard_hours,
        break_minutes: initialData.break_minutes,
        late_threshold_minutes: initialData.late_threshold_minutes,
        early_leave_threshold_minutes: initialData.early_leave_threshold_minutes,
        is_active: initialData.is_active,
      });
    }
  }, [initialData]);

  // Auto-calculate standard hours when times change
  useEffect(() => {
    if (form.start_time && form.end_time) {
      const [sH, sM] = form.start_time.split(':').map(Number);
      const [eH, eM] = form.end_time.split(':').map(Number);
      
      let startMins = sH * 60 + sM;
      let endMins = eH * 60 + eM;
      
      if (form.crosses_midnight && endMins <= startMins) {
        endMins += 24 * 60;
      }
      
      const totalMins = endMins - startMins;
      const workMins = totalMins - form.break_minutes;
      const hours = Math.max(0, Math.round(workMins / 60 * 10) / 10);
      
      setForm(prev => ({ ...prev, standard_hours: hours }));
    }
  }, [form.start_time, form.end_time, form.break_minutes, form.crosses_midnight]);

  // Auto-detect crosses_midnight
  useEffect(() => {
    if (form.start_time && form.end_time) {
      const [sH] = form.start_time.split(':').map(Number);
      const [eH] = form.end_time.split(':').map(Number);
      
      const shouldCross = eH < sH || (eH === sH && form.end_time < form.start_time);
      if (shouldCross !== form.crosses_midnight) {
        setForm(prev => ({ ...prev, crosses_midnight: shouldCross }));
      }
    }
  }, [form.start_time, form.end_time]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: any) => shiftService.create(data),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setApiError(err.message || 'Lỗi tạo ca'),
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => shiftService.update(initialData!.id, data),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setApiError(err.message || 'Lỗi cập nhật ca'),
  });

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  // Validation
  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    
    if (!form.code.trim()) errs.code = 'Mã ca là bắt buộc';
    if (!form.name.trim()) errs.name = 'Tên ca là bắt buộc';
    if (!form.start_time) errs.start_time = 'Giờ bắt đầu là bắt buộc';
    if (!form.end_time) errs.end_time = 'Giờ kết thúc là bắt buộc';
    if (form.standard_hours <= 0) errs.standard_hours = 'Giờ chuẩn phải > 0';
    if (form.break_minutes < 0) errs.break_minutes = 'Thời gian nghỉ không hợp lệ';
    
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError('');
    
    if (!validate()) return;

    if (!isEdit || form.code !== initialData?.code) {
      const exists = await shiftService.checkCodeExists(form.code, initialData?.id);
      if (exists) {
        setErrors({ code: 'Mã ca đã tồn tại' });
        return;
      }
    }

    const payload = {
      ...form,
      start_time: form.start_time + ':00',
      end_time: form.end_time + ':00',
    };

    if (isEdit) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  // Update field helper
  const updateField = (field: keyof FormData, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: '' }));
    setApiError('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
      {/* API Error */}
      {apiError && (
        <div className="flex items-start sm:items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5 sm:mt-0" />
          <span>{apiError}</span>
        </div>
      )}

      {/* Row 1: Code + Name */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Mã ca <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.code}
            onChange={e => updateField('code', e.target.value.toUpperCase())}
            placeholder="VD: SHORT_1"
            disabled={isEdit}
            className={`w-full px-3 py-2 sm:py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 ${
              errors.code ? 'border-red-300 bg-red-50' : 'border-gray-300'
            } ${isEdit ? 'bg-gray-100 cursor-not-allowed' : ''}`}
          />
          {errors.code && <p className="text-xs text-red-600 mt-1">{errors.code}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tên ca <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={e => updateField('name', e.target.value)}
            placeholder="VD: Ca 1 (Ngắn)"
            className={`w-full px-3 py-2 sm:py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 ${
              errors.name ? 'border-red-300 bg-red-50' : 'border-gray-300'
            }`}
          />
          {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
        </div>
      </div>

      {/* Row 2: Category */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">
          Loại ca <span className="text-red-500">*</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'short', label: 'Ca ngắn (8h)', shortLabel: 'Ngắn 8h', color: 'blue' },
            { value: 'long', label: 'Ca dài (12h)', shortLabel: 'Dài 12h', color: 'purple' },
            { value: 'admin', label: 'Hành chính', shortLabel: 'HC', color: 'green' },
          ].map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => updateField('shift_category', opt.value)}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                form.shift_category === opt.value
                  ? `bg-${opt.color}-100 text-${opt.color}-700 ring-2 ring-${opt.color}-500`
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span className="sm:hidden">{opt.shortLabel}</span>
              <span className="hidden sm:inline">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Row 3: Start/End time */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Giờ bắt đầu <span className="text-red-500">*</span>
          </label>
          <input
            type="time"
            value={form.start_time}
            onChange={e => updateField('start_time', e.target.value)}
            className={`w-full px-3 py-2 sm:py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 ${
              errors.start_time ? 'border-red-300' : 'border-gray-300'
            }`}
          />
          {errors.start_time && <p className="text-xs text-red-600 mt-1">{errors.start_time}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Giờ kết thúc <span className="text-red-500">*</span>
          </label>
          <input
            type="time"
            value={form.end_time}
            onChange={e => updateField('end_time', e.target.value)}
            className={`w-full px-3 py-2 sm:py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 ${
              errors.end_time ? 'border-red-300' : 'border-gray-300'
            }`}
          />
          {errors.end_time && <p className="text-xs text-red-600 mt-1">{errors.end_time}</p>}
        </div>

        <div className="col-span-2 sm:col-span-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Giờ chuẩn (tự tính)
          </label>
          <div className="px-3 py-2 sm:py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 font-medium text-blue-700">
            {form.standard_hours}h
            {form.crosses_midnight && (
              <span className="ml-2 text-xs text-indigo-500 font-normal">🌙 Qua đêm</span>
            )}
          </div>
        </div>
      </div>

      {/* Row 4: Break + Thresholds */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nghỉ giải lao (phút)
          </label>
          <input
            type="number"
            min="0"
            max="120"
            value={form.break_minutes}
            onChange={e => updateField('break_minutes', parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 sm:py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Ngưỡng trễ (phút)
          </label>
          <input
            type="number"
            min="0"
            max="60"
            value={form.late_threshold_minutes}
            onChange={e => updateField('late_threshold_minutes', parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 sm:py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-[10px] sm:text-xs text-gray-400 mt-1">Trễ &gt; {form.late_threshold_minutes} phút mới tính</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Ngưỡng về sớm (phút)
          </label>
          <input
            type="number"
            min="0"
            max="60"
            value={form.early_leave_threshold_minutes}
            onChange={e => updateField('early_leave_threshold_minutes', parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 sm:py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-[10px] sm:text-xs text-gray-400 mt-1">Về sớm &gt; {form.early_leave_threshold_minutes} phút mới tính</p>
        </div>
      </div>

      {/* Row 5: Active toggle */}
      <div className="flex items-center gap-3">
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={e => updateField('is_active', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
        <span className="text-sm text-gray-700">
          {form.is_active ? 'Đang hoạt động' : 'Đã tắt'}
        </span>
      </div>

      {/* Actions */}
      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {isSubmitting ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Save size={16} />
          )}
          {isEdit ? 'Cập nhật' : 'Tạo mới'}
        </button>
      </div>
    </form>
  );
}

export default ShiftForm;