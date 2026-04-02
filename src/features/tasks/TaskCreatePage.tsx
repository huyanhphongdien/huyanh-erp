// ============================================================================
// TASK CREATE PAGE - FIXED v6 (WITH PERMISSION FILTERING) + RESPONSIVE
// File: src/features/tasks/TaskCreatePage.tsx
// Huy Anh ERP System
// ============================================================================
// CẬP NHẬT RESPONSIVE:
// - Padding responsive p-4 md:p-6
// - Header font size responsive
// - Notice cards: icon + text layout mobile-friendly
// - Form wrapper responsive
// ============================================================================

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle, User, AlertCircle, Shield, FileText, Sparkles, Plus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { TaskForm, type TaskFormData } from './components/TaskForm';
import { isExecutive, isManagerLevel, isEmployeeLevel } from './utils/taskPermissions';
import { taskTemplateService, TaskTemplate, TEMPLATE_CATEGORIES } from '../../services/taskTemplateService';
import { taskChecklistService } from '../../services/taskChecklistService';

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
  const isSelfMode = searchParams.get('mode') === 'self';
  const templateIdFromUrl = searchParams.get('template_id');

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
  const [pendingEvalCount, setPendingEvalCount] = useState(0);

  // Template & Checklist state
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null);
  const [checklistItems, setChecklistItems] = useState<Array<{ title: string; requires_evidence?: boolean }>>([]);
  const [newChecklistItem, setNewChecklistItem] = useState('');

  // ========== CHECK PENDING EVALUATIONS ==========
  useEffect(() => {
    const checkPending = async () => {
      if (!user?.employee_id) return;
      const { count } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('assignee_id', user.employee_id)
        .eq('status', 'finished')
        .in('evaluation_status', ['none', 'pending_self_eval']);
      setPendingEvalCount(count || 0);
    };
    checkPending();
  }, [user]);

  // ========== LOAD TEMPLATES ==========
  useEffect(() => {
    taskTemplateService.getAll(true).then(data => {
      setTemplates(data);
      // Auto-select template from URL param
      if (templateIdFromUrl && data.length > 0) {
        const tmpl = data.find(t => t.id === templateIdFromUrl);
        if (tmpl) handleSelectTemplate(tmpl);
      }
    }).catch(() => {});
  }, [templateIdFromUrl]);

  // Handle template selection
  const handleSelectTemplate = (template: TaskTemplate) => {
    setSelectedTemplate(template);
    const items = typeof template.checklist_items === 'string'
      ? JSON.parse(template.checklist_items)
      : template.checklist_items;
    setChecklistItems((items || []).map((i: any) => ({ title: i.title, requires_evidence: i.requires_evidence || false })));
  };

  const handleClearTemplate = () => {
    setSelectedTemplate(null);
    setChecklistItems([]);
  };

  const handleAddChecklistItem = () => {
    if (!newChecklistItem.trim()) return;
    setChecklistItems(prev => [...prev, { title: newChecklistItem.trim(), requires_evidence: false }]);
    setNewChecklistItem('');
  };

  const handleRemoveChecklistItem = (index: number) => {
    setChecklistItems(prev => prev.filter((_, i) => i !== index));
  };

  // ========== LOAD DATA WITH PERMISSION FILTERING ==========
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // 1. DEPARTMENTS
        if (isAdmin || isUserExecutive) {
          const { data: deptData, error: deptError } = await supabase
            .from('departments')
            .select('id, name')
            .eq('status', 'active')
            .order('name');
          
          if (deptError) console.warn('Departments query error:', deptError);
          setDepartments(deptData || []);
        } else if (isUserManager && user?.department_id) {
          const { data: deptData, error: deptError } = await supabase
            .from('departments')
            .select('id, name')
            .eq('id', user.department_id)
            .single();
          
          if (deptError) {
            console.warn('Department query error:', deptError);
            if (user.department_name) {
              setDepartments([{ id: user.department_id, name: user.department_name }]);
            }
          } else {
            setDepartments(deptData ? [deptData] : []);
          }
        } else {
          setDepartments([]);
        }

        // 2. EMPLOYEES
        // Emails cấp cao — không cho phép giao task cho họ
        const VIP_EMAILS = ['huylv@huyanhrubber.com', 'thuyht@huyanhrubber.com', 'trunglxh@huyanhrubber.com']

        if (isAdmin || isUserExecutive) {
          const { data: empData, error: empError } = await supabase
            .from('employees')
            .select('id, full_name, department_id, email')
            .eq('status', 'active')
            .order('full_name');

          if (empError) console.warn('Employees query error:', empError);
          setEmployees((empData || []).filter(e => !VIP_EMAILS.includes(e.email?.toLowerCase())));
        } else if (isUserManager && user?.department_id) {
          const { data: empData, error: empError } = await supabase
            .from('employees')
            .select('id, full_name, department_id, email')
            .eq('department_id', user.department_id)
            .eq('status', 'active')
            .order('full_name');

          if (empError) console.warn('Employees query error:', empError);
          setEmployees((empData || []).filter(e => !VIP_EMAILS.includes(e.email?.toLowerCase())));
        } else {
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
    const base: Record<string, any> = {};

    if (isSelfMode && user) {
      base.department_id = user.department_id || '';
      base.assignee_id = user.employee_id || '';
    } else if (isUserManager && user?.department_id) {
      base.department_id = user.department_id;
      base.assignee_id = '';
    }

    // Fill from selected template
    if (selectedTemplate) {
      base.name = selectedTemplate.name;
      base.description = selectedTemplate.description || '';
      base.priority = selectedTemplate.default_priority || 'medium';
      if (selectedTemplate.default_duration_days) {
        const due = new Date(Date.now() + selectedTemplate.default_duration_days * 86400000);
        base.due_date = due.toISOString().split('T')[0];
      }
      if (selectedTemplate.department_id && !base.department_id) {
        base.department_id = selectedTemplate.department_id;
      }
    }

    return Object.keys(base).length > 0 ? base : undefined;
  }, [isSelfMode, isUserManager, user, selectedTemplate]);

  const isDepartmentLocked = isUserManager && !isAdmin && !isUserExecutive;

  // Handle form submit
  const handleSubmit = async (formData: TaskFormData) => {
    if (pendingEvalCount > 3 && isSelfMode) {
      setError('Bạn có quá nhiều công việc chưa đánh giá. Vui lòng đánh giá trước.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
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

      if (isSelfMode) {
        dbData.assignee_id = user?.employee_id || null;
        dbData.assigner_id = user?.employee_id || null;
        dbData.department_id = user?.department_id || null;
        dbData.is_self_assigned = true;
        (dbData as any).task_source = 'self';
      } else {
        if (isDepartmentLocked && user?.department_id) {
          dbData.department_id = user.department_id;
        } else {
          dbData.department_id = formData.department_id || null;
        }
        
        dbData.assignee_id = formData.assignee_id || null;
        dbData.assigner_id = user?.employee_id || null;
        // ★ Nếu giao cho chính mình → tự giao
        const isSelfAssign = formData.assignee_id === user?.employee_id;
        dbData.is_self_assigned = isSelfAssign;
        (dbData as any).task_source = (formData as any).project_id ? 'project' : isSelfAssign ? 'self' : 'assigned';
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

      // Create checklist items if any
      if (checklistItems.length > 0) {
        try {
          await taskChecklistService.createBulk(data.id, checklistItems);
        } catch (err) {
          console.error('Checklist creation error:', err);
        }
      }

      setSuccess(true);

      // ★ Thông báo cho NV được giao
      if (data.assignee_id && data.assignee_id !== user?.employee_id) {
        import('../../services/notificationHelper').then(({ notify }) => {
          notify({
            recipientId: data.assignee_id,
            senderId: user?.employee_id || undefined,
            module: 'task',
            type: 'task_assigned',
            title: `Bạn được giao: ${data.name}`,
            message: `${user?.full_name || 'Quản lý'} đã giao công việc cho bạn`,
            referenceUrl: `/tasks/${data.id}`,
          })
        })
      }

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

  const handleCancel = () => {
    navigate('/tasks');
  };

  // Success state
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] px-4">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 text-center">
          {isSelfMode ? 'Tạo công việc cá nhân thành công!' : 'Tạo công việc thành công!'}
        </h2>
        <p className="text-gray-500">Đang chuyển hướng...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <button
          onClick={handleCancel}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-3 sm:mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm sm:text-base">Quay lại danh sách</span>
        </button>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
          {isSelfMode ? 'Tạo công việc cá nhân' : 'Tạo công việc mới'}
        </h1>
        <p className="text-sm sm:text-base text-gray-500 mt-1">
          {isSelfMode 
            ? 'Tạo công việc và tự giao cho chính bạn' 
            : 'Điền thông tin để tạo công việc mới'}
        </p>
      </div>

      {/* Self Mode Notice */}
      {isSelfMode && user && (
        <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-start gap-2 sm:gap-3">
            <User className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-medium text-green-800 text-sm sm:text-base">Công việc cá nhân</p>
              <p className="text-xs sm:text-sm text-green-600 mt-1">
                Người phụ trách: <strong>{user.full_name}</strong>
                {user.department_name && (
                  <>
                    <br className="sm:hidden" />
                    <span className="hidden sm:inline ml-2">•</span>
                    <span className="sm:ml-1"> Phòng ban: <strong>{user.department_name}</strong></span>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Manager Mode Notice */}
      {!isSelfMode && isDepartmentLocked && user && (
        <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-2 sm:gap-3">
            <Shield className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-medium text-blue-800 text-sm sm:text-base">Phân công trong phòng ban</p>
              <p className="text-xs sm:text-sm text-blue-600 mt-1">
                Bạn chỉ có thể phân công công việc cho nhân viên trong phòng <strong>{user.department_name}</strong>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Template Selector — hiện cả giao việc lẫn tự giao */}
      {templates.length > 0 && (
        <div className="mb-4 sm:mb-6">
          {selectedTemplate ? (
            <div className="p-3 sm:p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm font-semibold text-emerald-800">
                    Đang dùng mẫu: {selectedTemplate.name}
                  </span>
                  <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-700">
                    {(TEMPLATE_CATEGORIES as any)[selectedTemplate.category]?.label || selectedTemplate.category}
                  </span>
                </div>
                <button
                  onClick={handleClearTemplate}
                  className="text-emerald-500 hover:text-emerald-700 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-emerald-600">
                Đã điền sẵn: tên, mô tả, ưu tiên, thời gian{checklistItems.length > 0 ? `, ${checklistItems.length} bước checklist` : ''}. Bạn có thể chỉnh sửa bên dưới.
              </p>
            </div>
          ) : (
            <div className="p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-blue-800">Tạo nhanh từ mẫu</span>
                <span className="text-xs text-blue-500">(tùy chọn)</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {templates.slice(0, 8).map(t => (
                  <button
                    key={t.id}
                    onClick={() => handleSelectTemplate(t)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium bg-white border border-blue-200 rounded-lg hover:bg-blue-100 hover:border-blue-300 transition-colors"
                  >
                    <span>{t.name}</span>
                    {(typeof t.checklist_items === 'string' ? JSON.parse(t.checklist_items) : t.checklist_items)?.length > 0 && (
                      <span className="text-[10px] text-blue-400">
                        ({(typeof t.checklist_items === 'string' ? JSON.parse(t.checklist_items) : t.checklist_items).length} bước)
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pending Evaluation Warning */}
      {pendingEvalCount > 3 && (
        <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-2 sm:gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-red-800 text-sm sm:text-base">
                Bạn có {pendingEvalCount} công việc chưa đánh giá
              </p>
              <p className="text-xs sm:text-sm text-red-600 mt-1">
                Vui lòng đánh giá trước khi tạo công việc mới.
              </p>
              <button
                onClick={() => navigate('/my-tasks?tab=awaiting_eval')}
                className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Đánh giá ngay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span className="text-sm sm:text-base">{error}</span>
        </div>
      )}

      {/* Loading state */}
      {isLoading ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sm:p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-500">Đang tải dữ liệu...</p>
        </div>
      ) : (
        <TaskForm
          key={selectedTemplate?.id || 'no-template'}
          mode="create"
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          departments={departments}
          employees={employees}
          isLoading={isSubmitting}
          isSelfMode={isSelfMode}
          isDepartmentLocked={isDepartmentLocked}
          initialData={initialFormData}
          currentUser={user}
        >
          {/* ★ Checklist Editor — bên trong form, trước nút Tạo */}
          <div className="px-4 sm:px-6 py-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-semibold text-gray-700">Checklist ({checklistItems.length} bước)</span>
              </div>
            </div>
            {checklistItems.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {checklistItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
                    <span className="text-xs text-gray-400 w-5">{idx + 1}.</span>
                    <span className="text-sm text-gray-700 flex-1">{item.title}</span>
                    {item.requires_evidence && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded font-medium">📷</span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setChecklistItems(prev => prev.map((it, i) => i === idx ? { ...it, requires_evidence: !it.requires_evidence } : it))
                      }}
                      title={item.requires_evidence ? 'Bỏ yêu cầu bằng chứng' : 'Yêu cầu bằng chứng (ảnh/PDF)'}
                      className={`text-xs p-0.5 rounded ${item.requires_evidence ? 'text-orange-500' : 'text-gray-300 hover:text-orange-400'}`}
                    >
                      📷
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveChecklistItem(idx)}
                      className="text-gray-400 hover:text-red-500 p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={newChecklistItem}
                onChange={e => setNewChecklistItem(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddChecklistItem(); } }}
                placeholder="Thêm bước mới..."
                className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={handleAddChecklistItem}
                disabled={!newChecklistItem.trim()}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
                Thêm
              </button>
            </div>
          </div>
        </TaskForm>
      )}
    </div>
  );
};

export default TaskCreatePage;