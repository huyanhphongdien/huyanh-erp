// ============================================================================
// TASK CREATE PAGE - FIXED v6 (WITH PERMISSION FILTERING)
// File: src/features/tasks/TaskCreatePage.tsx
// Huy Anh ERP System
// ============================================================================
// CẬP NHẬT v6:
// - MANAGER (Trưởng phòng/Phó phòng level 4,5): 
//   + Chỉ thấy phòng ban của mình
//   + Chỉ phân công được nhân viên trong phòng ban
// - EXECUTIVE (level 1,2,3) + ADMIN: Thấy tất cả
// - Hỗ trợ mode=self: Nhân viên tạo công việc cá nhân
// ============================================================================

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle, User, AlertCircle, Shield } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { TaskForm, type TaskFormData } from './components/TaskForm';
import { isExecutive, isManagerLevel, isEmployeeLevel } from './utils/taskPermissions';

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

  // ========== PERMISSION CHECK ==========
  const userLevel = user?.position_level || 6;
  const isAdmin = user?.role === 'admin';
  const isUserExecutive = isExecutive(userLevel);
  const isUserManager = isManagerLevel(userLevel) && !isUserExecutive;
  const isUserEmployee = isEmployeeLevel(userLevel);

  // State
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // ========== LOAD DATA WITH PERMISSION FILTERING ==========
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // ============================================================
        // PHÂN QUYỀN KHI LOAD DATA
        // ============================================================
        
        // 1. DEPARTMENTS
        if (isAdmin || isUserExecutive) {
          // ADMIN & EXECUTIVE: Thấy tất cả phòng ban
          const { data: deptData, error: deptError } = await supabase
            .from('departments')
            .select('id, name')
            .eq('status', 'active')
            .order('name');
          
          if (deptError) console.warn('Departments query error:', deptError);
          setDepartments(deptData || []);
        } else if (isUserManager && user?.department_id) {
          // MANAGER: Chỉ thấy phòng ban của mình
          const { data: deptData, error: deptError } = await supabase
            .from('departments')
            .select('id, name')
            .eq('id', user.department_id)
            .single();
          
          if (deptError) {
            console.warn('Department query error:', deptError);
            // Fallback: dùng thông tin từ authStore
            if (user.department_name) {
              setDepartments([{ id: user.department_id, name: user.department_name }]);
            }
          } else {
            setDepartments(deptData ? [deptData] : []);
          }
        } else {
          // EMPLOYEE hoặc không có department: không load departments
          setDepartments([]);
        }

        // 2. EMPLOYEES
        if (isAdmin || isUserExecutive) {
          // ADMIN & EXECUTIVE: Thấy tất cả nhân viên
          const { data: empData, error: empError } = await supabase
            .from('employees')
            .select('id, full_name, department_id')
            .eq('status', 'active')
            .order('full_name');
          
          if (empError) console.warn('Employees query error:', empError);
          setEmployees(empData || []);
        } else if (isUserManager && user?.department_id) {
          // MANAGER: Chỉ thấy nhân viên trong phòng ban của mình
          const { data: empData, error: empError } = await supabase
            .from('employees')
            .select('id, full_name, department_id')
            .eq('department_id', user.department_id)
            .eq('status', 'active')
            .order('full_name');
          
          if (empError) console.warn('Employees query error:', empError);
          setEmployees(empData || []);
        } else {
          // EMPLOYEE: không load employees (sẽ dùng selfMode)
          setEmployees([]);
        }

      } catch (err) {
        console.error('Error loading data:', err);
        setError('Không thể tải dữ liệu. Vui lòng thử lại.');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [isAdmin, isUserExecutive, isUserManager, user?.department_id, user?.department_name]);

  // ========== INITIAL VALUES FOR FORM ==========
  const initialFormData = useMemo(() => {
    if (isSelfMode && user) {
      // Self mode: tự giao cho mình
      return {
        department_id: user.department_id || '',
        assignee_id: user.employee_id || '',
      };
    }
    
    if (isUserManager && user?.department_id) {
      // Manager mode: auto-set phòng ban
      return {
        department_id: user.department_id,
        assignee_id: '',
      };
    }
    
    return undefined;
  }, [isSelfMode, isUserManager, user]);

  // ========== CHECK IF DEPARTMENT IS LOCKED ==========
  // Manager không được đổi phòng ban
  const isDepartmentLocked = isUserManager && !isAdmin && !isUserExecutive;

  // Handle form submit
  const handleSubmit = async (formData: TaskFormData) => {
    setError(null);
    setIsSubmitting(true);

    try {
      // ========== TRANSFORM FORM DATA TO DATABASE FORMAT ==========
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

      // ========== XỬ LÝ THEO MODE ==========
      if (isSelfMode) {
        // Công việc cá nhân: người tạo = người phụ trách = người giao
        dbData.assignee_id = user?.employee_id || null;
        dbData.assigner_id = user?.employee_id || null;
        dbData.department_id = user?.department_id || null;
        dbData.is_self_assigned = true;
      } else {
        // Công việc bình thường
        // MANAGER: force department_id là phòng ban của họ
        if (isDepartmentLocked && user?.department_id) {
          dbData.department_id = user.department_id;
        } else {
          dbData.department_id = formData.department_id || null;
        }
        
        dbData.assignee_id = formData.assignee_id || null;
        dbData.assigner_id = user?.employee_id || null;
        dbData.is_self_assigned = false;
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

      {/* Manager Mode Notice - Phòng ban bị khóa */}
      {!isSelfMode && isDepartmentLocked && user && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-blue-800">Phân công trong phòng ban</p>
              <p className="text-sm text-blue-600 mt-1">
                Bạn chỉ có thể phân công công việc cho nhân viên trong phòng <strong>{user.department_name}</strong>
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
          // ========== PROPS CHO PERMISSION ==========
          isSelfMode={isSelfMode}
          isDepartmentLocked={isDepartmentLocked}
          initialData={initialFormData}
          currentUser={user}
        />
      )}
    </div>
  );
};

export default TaskCreatePage;