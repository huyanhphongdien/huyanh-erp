// ============================================================================
// TASK CREATE PAGE - FIXED v5
// File: src/features/tasks/TaskCreatePage.tsx
// Huy Anh ERP System
// ============================================================================
// CẬP NHẬT:
// - Hỗ trợ mode=self: Nhân viên tạo công việc cá nhân (tự giao cho mình)
// - Khi mode=self: tự động set assignee_id = user.employee_id
// - Ẩn dropdown "Người phụ trách" khi mode=self
// ============================================================================

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle, User, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { TaskForm, type TaskFormData } from './components/TaskForm';

// ============================================================================
// TYPES
// ============================================================================

interface Department {
  id: string;
  name: string;
}

interface Employee {
  id: string;
  full_name: string;
  department_id: string;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const TaskCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();

  // ========== CHECK MODE ==========
  // mode=self: Nhân viên tạo công việc cá nhân
  const isSelfMode = searchParams.get('mode') === 'self';

  // State
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Load data
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // Load departments
        const { data: deptData, error: deptError } = await supabase
          .from('departments')
          .select('id, name')
          .eq('status', 'active')
          .order('name');
        
        if (deptError) console.warn('Departments query error:', deptError);

        // Load employees
        const { data: empData, error: empError } = await supabase
          .from('employees')
          .select('id, full_name, department_id')
          .eq('status', 'active')
          .order('full_name');
        
        if (empError) console.warn('Employees query error:', empError);

        setDepartments(deptData || []);
        setEmployees(empData || []);
      } catch (err) {
        console.error('Error loading data:', err);
        setError('Không thể tải dữ liệu. Vui lòng thử lại.');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // ========== INITIAL VALUES FOR SELF MODE ==========
  const initialFormData = useMemo(() => {
    if (isSelfMode && user) {
      return {
        department_id: user.department_id || '',
        assignee_id: user.employee_id || '',
      };
    }
    return undefined;
  }, [isSelfMode, user]);

  // Handle form submit
  const handleSubmit = async (formData: TaskFormData) => {
    setError(null);
    setIsSubmitting(true);

    try {
      // ========== TRANSFORM FORM DATA TO DATABASE FORMAT ==========
      // FIX v5:
      // - Hỗ trợ mode=self: tự động set assignee_id, assigner_id, is_self_assigned
      // - Database constraint: status IN ('draft', 'in_progress', 'paused', 'finished', 'cancelled')
      
      const dbData: Record<string, any> = {
        name: formData.name,
        description: formData.description || null,
        priority: formData.priority || 'medium',
        start_date: formData.start_date || null,
        due_date: formData.due_date || null,
        notes: formData.notes || null,
        status: 'draft',
        progress: 0,
        progress_mode: 'manual',
      };

      // ========== XỬ LÝ MODE SELF ==========
      if (isSelfMode) {
        // Công việc cá nhân: người tạo = người phụ trách = người giao
        dbData.assignee_id = user?.employee_id || null;
        dbData.assigner_id = user?.employee_id || null;
        dbData.department_id = user?.department_id || null;
        dbData.is_self_assigned = true;
        
        console.log('📝 Creating SELF-ASSIGNED task:', dbData);
      } else {
        // Công việc bình thường
        dbData.department_id = formData.department_id || null;
        dbData.assignee_id = formData.assignee_id || null;
        dbData.assigner_id = user?.employee_id || null;
        dbData.is_self_assigned = false;
        
        console.log('📝 Creating task:', dbData);
      }

      const { data, error: insertError } = await supabase
        .from('tasks')
        .insert(dbData)
        .select('*')
        .single();

      if (insertError) {
        console.error('❌ Create error:', insertError);
        throw new Error(insertError.message);
      }

      console.log('✅ Task created:', data);
      setSuccess(true);

      // Redirect sau 1.5s
      setTimeout(() => {
        navigate(`/tasks/${data.id}`);
      }, 1500);

    } catch (err: any) {
      console.error('❌ Error creating task:', err);
      setError(err.message || 'Có lỗi xảy ra khi tạo công việc');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    navigate('/tasks');
  };

  // Success state
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          {isSelfMode ? 'Tạo công việc cá nhân thành công!' : 'Tạo công việc thành công!'}
        </h2>
        <p className="text-gray-500">Đang chuyển hướng...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={handleCancel}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại danh sách
        </button>
        <h1 className="text-2xl font-bold text-gray-900">
          {isSelfMode ? 'Tạo công việc cá nhân' : 'Tạo công việc mới'}
        </h1>
        <p className="text-gray-500 mt-1">
          {isSelfMode 
            ? 'Tạo công việc và tự giao cho chính bạn' 
            : 'Điền thông tin để tạo công việc mới'}
        </p>
      </div>

      {/* Self Mode Notice */}
      {isSelfMode && user && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-start gap-3">
            <User className="w-5 h-5 text-green-600 mt-0.5" />
            <div>
              <p className="font-medium text-green-800">Công việc cá nhân</p>
              <p className="text-sm text-green-600 mt-1">
                Người phụ trách: <strong>{user.full_name}</strong>
                {user.department_name && (
                  <span className="ml-2">• Phòng ban: <strong>{user.department_name}</strong></span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading state */}
      {isLoading ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-500">Đang tải dữ liệu...</p>
        </div>
      ) : (
        /* Form */
        <TaskForm
          mode="create"
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          departments={departments}
          employees={employees}
          isLoading={isSubmitting}
          // ========== PROPS MỚI CHO SELF MODE ==========
          isSelfMode={isSelfMode}
          initialData={initialFormData}
          currentUser={user}
        />
      )}
    </div>
  );
};

export default TaskCreatePage;