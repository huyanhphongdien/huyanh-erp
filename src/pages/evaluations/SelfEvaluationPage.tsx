// ============================================================================
// SELF EVALUATION PAGE - STANDALONE VERSION
// File: src/pages/evaluations/SelfEvaluationPage.tsx
// Huy Anh ERP System
// ============================================================================
// STANDALONE: Tích hợp Form và List trong cùng file, không cần import external
// ============================================================================

import React, { useState, useEffect } from 'react';
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  RefreshCw,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  X,
  Eye,
  Edit3,
  Trash2,
  Search,
  Filter,
  Calendar,
  Star,
  Target,
  Lightbulb,
  Award,
  Send,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';

// ============================================================================
// TYPES
// ============================================================================

type PageMode = 'list' | 'select-task' | 'create' | 'edit' | 'view';

interface MyTask {
  id: string;
  code?: string;
  name: string;
  title?: string;
  description?: string | null;
  department_id?: string | null;
  status: string;
  priority: string;
  progress: number;
  due_date?: string | null;
  department?: { id: string; name: string } | null;
}

interface SelfEvaluationData {
  id: string;
  task_id: string;
  employee_id: string;
  completion_percentage: number;
  quality_assessment: string;
  self_score: number;
  achievements?: string | null;
  difficulties?: string | null;
  solutions?: string | null;
  recommendations?: string | null;
  status: string;
  submitted_at?: string | null;
  revision_count: number;
  created_at?: string;
  updated_at?: string;
  task?: MyTask | null;
}

interface FormData {
  completion_percentage: number;
  self_score: number;
  quality_assessment: string;
  achievements: string;
  difficulties: string;
  solutions: string;
  recommendations: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending: { label: 'Chờ duyệt', color: 'text-yellow-700', bg: 'bg-yellow-100', icon: <Clock className="w-4 h-4" /> },
  approved: { label: 'Đã duyệt', color: 'text-green-700', bg: 'bg-green-100', icon: <CheckCircle className="w-4 h-4" /> },
  rejected: { label: 'Từ chối', color: 'text-red-700', bg: 'bg-red-100', icon: <XCircle className="w-4 h-4" /> },
  revision_requested: { label: 'Cần sửa', color: 'text-orange-700', bg: 'bg-orange-100', icon: <AlertCircle className="w-4 h-4" /> },
};

const QUALITY_OPTIONS = [
  { value: 'excellent', label: 'Xuất sắc', description: 'Vượt kỳ vọng', color: 'border-emerald-500 bg-emerald-50 text-emerald-700' },
  { value: 'good', label: 'Tốt', description: 'Đạt yêu cầu tốt', color: 'border-blue-500 bg-blue-50 text-blue-700' },
  { value: 'average', label: 'Khá', description: 'Đạt yêu cầu cơ bản', color: 'border-yellow-500 bg-yellow-50 text-yellow-700' },
  { value: 'below_average', label: 'Trung bình', description: 'Cần cải thiện', color: 'border-orange-500 bg-orange-50 text-orange-700' },
];

const QUALITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  excellent: { label: 'Xuất sắc', color: 'text-emerald-700', bg: 'bg-emerald-100' },
  good: { label: 'Tốt', color: 'text-blue-700', bg: 'bg-blue-100' },
  average: { label: 'Khá', color: 'text-yellow-700', bg: 'bg-yellow-100' },
  below_average: { label: 'Trung bình', color: 'text-orange-700', bg: 'bg-orange-100' },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function calculateRating(score: number): string {
  if (score >= 90) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'average';
  return 'below_average';
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getScoreColor(score: number): string {
  if (score >= 90) return 'text-emerald-600';
  if (score >= 70) return 'text-blue-600';
  if (score >= 50) return 'text-yellow-600';
  return 'text-orange-600';
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const SelfEvaluationPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();

  // State
  const [mode, setMode] = useState<PageMode>('list');
  const [evaluations, setEvaluations] = useState<SelfEvaluationData[]>([]);
  const [selectedEvaluation, setSelectedEvaluation] = useState<SelfEvaluationData | null>(null);
  const [selectedTask, setSelectedTask] = useState<MyTask | null>(null);
  const [completedTasks, setCompletedTasks] = useState<MyTask[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<FormData>({
    completion_percentage: 100,
    self_score: 80,
    quality_assessment: 'good',
    achievements: '',
    difficulties: '',
    solutions: '',
    recommendations: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // List filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const employeeId = user?.employee_id;

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Check URL params for task_id
  useEffect(() => {
    const taskIdFromUrl = searchParams.get('task_id');
    
    if (taskIdFromUrl && employeeId) {
      console.log('📝 [SelfEvaluationPage] task_id from URL:', taskIdFromUrl);
      loadTaskById(taskIdFromUrl);
    }
  }, [searchParams, employeeId]);

  // Check location state
  useEffect(() => {
    const state = location.state as { selectedTaskId?: string; selectedTask?: MyTask } | null;
    if (state?.selectedTask) {
      setSelectedTask(state.selectedTask);
      setMode('create');
      resetForm();
    } else if (state?.selectedTaskId && employeeId) {
      loadTaskById(state.selectedTaskId);
    }
  }, [location.state, employeeId]);

  // Load evaluations on mount
  useEffect(() => {
    if (employeeId) {
      loadEvaluations();
    }
  }, [employeeId]);

  // Load completed tasks when select-task mode
  useEffect(() => {
    if (mode === 'select-task' && employeeId) {
      loadCompletedTasks();
    }
  }, [mode, employeeId]);

  // Clear success message
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  const loadTaskById = async (taskId: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select(`
          id, code, name, description, status, priority, progress, due_date, department_id,
          department:departments(id, name)
        `)
        .eq('id', taskId)
        .single();

      if (taskError) throw new Error('Không tìm thấy công việc');

      // Check completed
      const isFinished = task.status === 'finished' || task.status === 'completed' || task.progress >= 100;
      if (!isFinished) {
        setError(`Công việc chưa hoàn thành (tiến độ: ${task.progress}%). Vui lòng hoàn thành trước khi tự đánh giá.`);
        setMode('list');
        return;
      }

      // Check existing evaluation
      const { data: existingEval } = await supabase
        .from('task_self_evaluations')
        .select('id, status')
        .eq('task_id', taskId)
        .eq('employee_id', employeeId)
        .maybeSingle();

      if (existingEval && existingEval.status !== 'revision_requested') {
        setError('Đã có tự đánh giá cho công việc này.');
        setMode('list');
        await loadEvaluations();
        return;
      }

      const taskData: MyTask = {
        ...task,
        department: Array.isArray(task.department) ? task.department[0] : task.department,
      };

      setSelectedTask(taskData);
      setMode('create');
      resetForm();
    } catch (err: any) {
      setError(err.message || 'Không thể tải thông tin công việc');
      setMode('list');
    } finally {
      setIsLoading(false);
    }
  };

  const loadEvaluations = async () => {
    if (!employeeId) return;

    try {
      setIsLoading(true);

      const { data, error: fetchError } = await supabase
        .from('task_self_evaluations')
        .select(`
          *,
          task:tasks(id, code, name, status, progress, department_id,
            department:departments(id, name)
          )
        `)
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      const mappedData = (data || []).map((item: any) => ({
        ...item,
        task: item.task ? {
          ...item.task,
          department: Array.isArray(item.task.department) ? item.task.department[0] : item.task.department,
        } : null,
      }));

      setEvaluations(mappedData);
    } catch (err: any) {
      setError(err.message || 'Không thể tải danh sách tự đánh giá');
    } finally {
      setIsLoading(false);
    }
  };

  const loadCompletedTasks = async () => {
    if (!employeeId) return;

    setTasksLoading(true);
    try {
      const { data: tasks, error: tasksError } = await supabase
        .from('tasks')
        .select(`
          id, code, name, status, priority, progress, due_date, department_id,
          department:departments(id, name)
        `)
        .eq('assignee_id', employeeId)
        .or('status.eq.finished,status.eq.completed,progress.gte.100');

      if (tasksError) throw tasksError;

      const { data: existingEvals } = await supabase
        .from('task_self_evaluations')
        .select('task_id, status')
        .eq('employee_id', employeeId);

      const evalMap = new Map<string, string>();
      existingEvals?.forEach(e => evalMap.set(e.task_id, e.status));

      const availableTasks = tasks?.filter(t => {
        const evalStatus = evalMap.get(t.id);
        return !evalStatus || evalStatus === 'revision_requested';
      }).map(t => ({
        ...t,
        department: Array.isArray(t.department) ? t.department[0] : t.department,
      })) || [];

      setCompletedTasks(availableTasks);
    } catch (err: any) {
      setError(err.message || 'Không thể tải danh sách công việc');
    } finally {
      setTasksLoading(false);
    }
  };

  // ============================================================================
  // FORM HANDLERS
  // ============================================================================

  const resetForm = () => {
    setFormData({
      completion_percentage: 100,
      self_score: 80,
      quality_assessment: 'good',
      achievements: '',
      difficulties: '',
      solutions: '',
      recommendations: '',
    });
    setFormErrors({});
  };

  const initFormFromEvaluation = (evaluation: SelfEvaluationData) => {
    setFormData({
      completion_percentage: evaluation.completion_percentage || 100,
      self_score: evaluation.self_score || 80,
      quality_assessment: evaluation.quality_assessment || 'good',
      achievements: evaluation.achievements || '',
      difficulties: evaluation.difficulties || '',
      solutions: evaluation.solutions || '',
      recommendations: evaluation.recommendations || '',
    });
    setFormErrors({});
  };

  const handleFormChange = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (formData.completion_percentage < 0 || formData.completion_percentage > 100) {
      errors.completion_percentage = 'Tỷ lệ hoàn thành phải từ 0 đến 100';
    }
    if (formData.self_score < 0 || formData.self_score > 100) {
      errors.self_score = 'Điểm tự đánh giá phải từ 0 đến 100';
    }
    if (!formData.quality_assessment) {
      errors.quality_assessment = 'Vui lòng chọn mức đánh giá chất lượng';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async () => {
    if (!selectedTask || !employeeId) return;
    if (!validateForm()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // CHỈ INSERT các columns chắc chắn tồn tại trong database
      // Bỏ: completion_percentage, revision_count, submitted_at (không có trong DB)
      const insertData = {
        task_id: selectedTask.id,
        employee_id: employeeId,
        self_score: formData.self_score,
        quality_assessment: calculateRating(formData.self_score),
        achievements: formData.achievements || null,
        difficulties: formData.difficulties || null,
        solutions: formData.solutions || null,
        recommendations: formData.recommendations || null,
        status: 'pending',
      };

      console.log('📝 [SelfEvaluationPage] Inserting:', insertData);

      const { data, error: insertError } = await supabase
        .from('task_self_evaluations')
        .insert(insertData)
        .select();

      if (insertError) {
        console.error('❌ Insert error:', insertError);
        throw insertError;
      }

      console.log('✅ Inserted:', data);

      // KHÔNG update tasks.evaluation_status vì constraint không cho phép giá trị 'pending_approval'
      // Nếu cần, hãy kiểm tra các giá trị hợp lệ trong database constraint

      setSuccessMessage('Đã gửi tự đánh giá thành công!');
      setSelectedTask(null);
      setMode('list');
      navigate('/evaluations/self-evaluation', { replace: true });
      await loadEvaluations();
    } catch (err: any) {
      console.error('❌ Error:', err);
      setError(err.message || 'Không thể tạo tự đánh giá');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedEvaluation) return;
    if (!validateForm()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Bỏ: completion_percentage, revision_count, submitted_at (không có trong DB)
      const updateData: any = {
        self_score: formData.self_score,
        quality_assessment: calculateRating(formData.self_score),
        achievements: formData.achievements || null,
        difficulties: formData.difficulties || null,
        solutions: formData.solutions || null,
        recommendations: formData.recommendations || null,
      };

      // Nếu đang revision_requested, chuyển về pending
      if (selectedEvaluation.status === 'revision_requested') {
        updateData.status = 'pending';
      }

      console.log('📝 [SelfEvaluationPage] Updating:', updateData);

      const { error: updateError } = await supabase
        .from('task_self_evaluations')
        .update(updateData)
        .eq('id', selectedEvaluation.id);

      if (updateError) {
        console.error('❌ Update error:', updateError);
        throw updateError;
      }

      setSuccessMessage('Đã cập nhật tự đánh giá thành công!');
      setSelectedEvaluation(null);
      setMode('list');
      await loadEvaluations();
    } catch (err: any) {
      console.error('❌ Error:', err);
      setError(err.message || 'Không thể cập nhật tự đánh giá');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (evaluation: SelfEvaluationData) => {
    if (!confirm('Bạn có chắc muốn xóa tự đánh giá này?')) return;

    try {
      const { error: deleteError } = await supabase
        .from('task_self_evaluations')
        .delete()
        .eq('id', evaluation.id);

      if (deleteError) throw deleteError;

      setSuccessMessage('Đã xóa tự đánh giá');
      await loadEvaluations();
    } catch (err: any) {
      setError(err.message || 'Không thể xóa tự đánh giá');
    }
  };

  const handleEdit = (evaluation: SelfEvaluationData) => {
    setSelectedEvaluation(evaluation);
    initFormFromEvaluation(evaluation);
    setMode('edit');
  };

  const handleView = (evaluation: SelfEvaluationData) => {
    setSelectedEvaluation(evaluation);
    setMode('view');
  };

  const handleCancel = () => {
    setMode('list');
    setSelectedEvaluation(null);
    setSelectedTask(null);
    setError(null);
    navigate('/evaluations/self-evaluation', { replace: true });
  };

  const handleStartCreate = () => {
    setMode('select-task');
    setError(null);
  };

  const handleSelectTask = (task: MyTask) => {
    setSelectedTask(task);
    resetForm();
    setMode('create');
  };

  // ============================================================================
  // FILTERED EVALUATIONS
  // ============================================================================

  const filteredEvaluations = evaluations.filter((evaluation) => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const taskName = (evaluation.task?.name || '').toLowerCase();
      const taskCode = (evaluation.task?.code || '').toLowerCase();
      if (!taskName.includes(term) && !taskCode.includes(term)) return false;
    }
    if (statusFilter !== 'all' && evaluation.status !== statusFilter) return false;
    return true;
  });

  // ============================================================================
  // RENDER: SELECT TASK
  // ============================================================================

  const renderSelectTask = () => (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Chọn công việc để đánh giá</h2>
          <p className="text-sm text-gray-500 mt-1">Chọn công việc đã hoàn thành để tự đánh giá</p>
        </div>
        <button onClick={handleCancel} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
          <X className="w-5 h-5" />
        </button>
      </div>

      {tasksLoading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : completedTasks.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Không có công việc nào cần tự đánh giá</p>
          <p className="text-sm text-gray-400 mt-1">Hoàn thành công việc (100%) để có thể tự đánh giá</p>
        </div>
      ) : (
        <div className="space-y-3">
          {completedTasks.map((task) => (
            <button
              key={task.id}
              onClick={() => handleSelectTask(task)}
              className="w-full p-4 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-lg text-left transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-gray-500">{task.code}</span>
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">{task.progress}%</span>
                  </div>
                  <p className="font-medium text-gray-900">{task.name}</p>
                  {task.department?.name && <p className="text-sm text-gray-500">{task.department.name}</p>}
                </div>
                <div className="text-blue-600">→</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // ============================================================================
  // RENDER: FORM
  // ============================================================================

  const renderForm = () => {
    const isEditMode = mode === 'edit';
    const task = isEditMode ? selectedEvaluation?.task : selectedTask;

    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={handleCancel} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-semibold text-gray-900">
            {isEditMode ? 'Chỉnh sửa tự đánh giá' : 'Tạo tự đánh giá mới'}
          </h2>
        </div>

        {/* Task Info */}
        {task && (
          <div className="bg-gray-50 rounded-xl p-4 mb-6 border border-gray-200">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-500">Công việc đang đánh giá</p>
                <p className="font-semibold text-gray-900">
                  {task.code && <span className="text-gray-500 mr-2">{task.code}</span>}
                  {task.name || task.title}
                </p>
                {task.department?.name && <p className="text-sm text-gray-500 mt-1">Phòng: {task.department.name}</p>}
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Form Content */}
        <div className="space-y-6">
          {/* Section 1: Scores */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-600" />
              Kết quả công việc
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Completion */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tỷ lệ hoàn thành (%) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={formData.completion_percentage}
                  onChange={(e) => handleFormChange('completion_percentage', parseInt(e.target.value) || 0)}
                  className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 ${formErrors.completion_percentage ? 'border-red-300' : 'border-gray-300'}`}
                />
                {formErrors.completion_percentage && <p className="text-sm text-red-500 mt-1">{formErrors.completion_percentage}</p>}
                <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                  <div className={`h-2 rounded-full ${formData.completion_percentage >= 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(formData.completion_percentage, 100)}%` }} />
                </div>
              </div>

              {/* Score */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Điểm tự đánh giá (0-100) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={formData.self_score}
                  onChange={(e) => handleFormChange('self_score', parseInt(e.target.value) || 0)}
                  className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 ${formErrors.self_score ? 'border-red-300' : 'border-gray-300'}`}
                />
                {formErrors.self_score && <p className="text-sm text-red-500 mt-1">{formErrors.self_score}</p>}
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={formData.self_score}
                  onChange={(e) => handleFormChange('self_score', parseInt(e.target.value))}
                  className="w-full mt-2"
                />
                <p className={`text-sm font-medium mt-1 ${getScoreColor(formData.self_score)}`}>
                  Xếp loại: {QUALITY_CONFIG[calculateRating(formData.self_score)]?.label}
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Quality */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Award className="w-5 h-5 text-yellow-600" />
              Đánh giá chất lượng <span className="text-red-500">*</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {QUALITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleFormChange('quality_assessment', option.value)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    formData.quality_assessment === option.value
                      ? option.color + ' border-current'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold">{option.label}</span>
                    {formData.quality_assessment === option.value && <CheckCircle className="w-5 h-5" />}
                  </div>
                  <p className="text-sm opacity-75">{option.description}</p>
                </button>
              ))}
            </div>
            {formErrors.quality_assessment && <p className="text-sm text-red-500 mt-2">{formErrors.quality_assessment}</p>}
          </div>

          {/* Section 3: Achievements */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-500" />
              Thành tích đạt được
            </h3>
            <textarea
              value={formData.achievements}
              onChange={(e) => handleFormChange('achievements', e.target.value)}
              rows={3}
              placeholder="Mô tả các thành tích, kết quả nổi bật..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Section 4: Difficulties & Solutions */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-orange-500" />
              Khó khăn & Giải pháp
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Khó khăn gặp phải</label>
                <textarea
                  value={formData.difficulties}
                  onChange={(e) => handleFormChange('difficulties', e.target.value)}
                  rows={3}
                  placeholder="Mô tả các khó khăn, thách thức..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Giải pháp đã áp dụng</label>
                <textarea
                  value={formData.solutions}
                  onChange={(e) => handleFormChange('solutions', e.target.value)}
                  rows={3}
                  placeholder="Mô tả các giải pháp đã áp dụng..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Section 5: Recommendations */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-green-500" />
              Đề xuất & Kiến nghị
            </h3>
            <textarea
              value={formData.recommendations}
              onChange={(e) => handleFormChange('recommendations', e.target.value)}
              rows={3}
              placeholder="Các đề xuất, kiến nghị để cải thiện..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSubmitting}
              className="px-5 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={isEditMode ? handleUpdate : handleCreate}
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {isEditMode ? 'Cập nhật' : 'Gửi đánh giá'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================================
  // RENDER: VIEW
  // ============================================================================

  const renderView = () => {
    if (!selectedEvaluation) return null;

    const statusConfig = STATUS_CONFIG[selectedEvaluation.status] || STATUS_CONFIG.pending;
    const qualityConfig = QUALITY_CONFIG[selectedEvaluation.quality_assessment] || QUALITY_CONFIG.average;

    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Chi tiết tự đánh giá</h2>
          <button onClick={handleCancel} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Task Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-medium text-gray-900 mb-2">Thông tin công việc</h3>
            <p className="text-sm text-gray-600">
              {selectedEvaluation.task?.code} - {selectedEvaluation.task?.name}
            </p>
          </div>

          {/* Scores */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{selectedEvaluation.completion_percentage}%</div>
              <div className="text-sm text-gray-500">Hoàn thành</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className={`text-2xl font-bold ${getScoreColor(selectedEvaluation.self_score)}`}>{selectedEvaluation.self_score}</div>
              <div className="text-sm text-gray-500">Điểm tự ĐG</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <span className={`px-2 py-1 rounded text-sm font-medium ${qualityConfig.bg} ${qualityConfig.color}`}>{qualityConfig.label}</span>
              <div className="text-sm text-gray-500 mt-1">Xếp loại</div>
            </div>
          </div>

          {/* Text fields */}
          {selectedEvaluation.achievements && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-700 mb-2">Thành tích đạt được</h4>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{selectedEvaluation.achievements}</p>
            </div>
          )}
          {selectedEvaluation.difficulties && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-700 mb-2">Khó khăn gặp phải</h4>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{selectedEvaluation.difficulties}</p>
            </div>
          )}
          {selectedEvaluation.solutions && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-700 mb-2">Giải pháp đã áp dụng</h4>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{selectedEvaluation.solutions}</p>
            </div>
          )}
          {selectedEvaluation.recommendations && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-700 mb-2">Đề xuất, kiến nghị</h4>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{selectedEvaluation.recommendations}</p>
            </div>
          )}

          {/* Status */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Trạng thái:</span>
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.color}`}>
              {statusConfig.icon}
              {statusConfig.label}
            </span>
          </div>

          {/* Timestamps */}
          <div className="text-sm text-gray-500 border-t pt-4 mt-4">
            {selectedEvaluation.submitted_at && <p>Ngày gửi: {formatDate(selectedEvaluation.submitted_at)}</p>}
            {selectedEvaluation.revision_count > 0 && <p>Số lần chỉnh sửa: {selectedEvaluation.revision_count}</p>}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t">
            <button onClick={handleCancel} className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Đóng</button>
            {(selectedEvaluation.status === 'pending' || selectedEvaluation.status === 'revision_requested') && (
              <button onClick={() => handleEdit(selectedEvaluation)} className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700">Chỉnh sửa</button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ============================================================================
  // RENDER: LIST
  // ============================================================================

  const renderList = () => (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Tìm kiếm theo tên công việc..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="pl-9 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="all">Tất cả trạng thái</option>
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <option key={key} value={key}>{config.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Empty state */}
      {filteredEvaluations.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">Chưa có tự đánh giá nào</h3>
          <p className="text-sm text-gray-500">
            {searchTerm || statusFilter !== 'all' ? 'Thử thay đổi bộ lọc để xem thêm' : 'Hoàn thành công việc để bắt đầu tự đánh giá'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEvaluations.map((evaluation) => {
            const statusConfig = STATUS_CONFIG[evaluation.status] || STATUS_CONFIG.pending;
            const qualityConfig = QUALITY_CONFIG[evaluation.quality_assessment] || QUALITY_CONFIG.average;
            const canEditDelete = evaluation.status === 'pending' || evaluation.status === 'revision_requested';

            return (
              <div key={evaluation.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {/* Task Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-gray-500">{evaluation.task?.code}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.color}`}>
                        {statusConfig.icon}
                        {statusConfig.label}
                      </span>
                    </div>
                    <h3 className="font-medium text-gray-900 truncate">{evaluation.task?.name}</h3>
                    {evaluation.task?.department?.name && <p className="text-sm text-gray-500">{evaluation.task.department.name}</p>}
                  </div>

                  {/* Scores */}
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-lg font-bold text-blue-600">{evaluation.completion_percentage}%</div>
                      <div className="text-xs text-gray-500">Hoàn thành</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-lg font-bold ${getScoreColor(evaluation.self_score)}`}>{evaluation.self_score}</div>
                      <div className="text-xs text-gray-500">Điểm</div>
                    </div>
                    <div className="text-center">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${qualityConfig.bg} ${qualityConfig.color}`}>{qualityConfig.label}</span>
                    </div>
                  </div>

                  {/* Date */}
                  <div className="text-sm text-gray-500">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      <span>{formatDate(evaluation.submitted_at || evaluation.created_at)}</span>
                    </div>
                    {evaluation.revision_count > 0 && <div className="text-xs text-orange-600 mt-1">Đã sửa {evaluation.revision_count} lần</div>}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleView(evaluation)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Xem chi tiết">
                      <Eye className="w-4 h-4" />
                    </button>
                    {canEditDelete && (
                      <>
                        <button onClick={() => handleEdit(evaluation)} className="p-2 text-gray-500 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg" title="Chỉnh sửa">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(evaluation)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Xóa">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {filteredEvaluations.length > 0 && (
        <div className="text-sm text-gray-500 text-center">
          Hiển thị {filteredEvaluations.length} / {evaluations.length} tự đánh giá
        </div>
      )}
    </div>
  );

  // ============================================================================
  // RENDER: MAIN
  // ============================================================================

  const renderContent = () => {
    switch (mode) {
      case 'select-task': return renderSelectTask();
      case 'create':
      case 'edit': return renderForm();
      case 'view': return renderView();
      default: return renderList();
    }
  };

  // Loading state
  if (isLoading && mode === 'list' && evaluations.length === 0) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex items-center gap-3 text-gray-500">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Đang tải...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tự đánh giá</h1>
          <p className="text-gray-500 mt-1">Quản lý tự đánh giá công việc của bạn</p>
        </div>
        {mode === 'list' && (
          <button onClick={handleStartCreate} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Plus className="w-5 h-5" />
            Tạo tự đánh giá
          </button>
        )}
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-500" />
          <p className="text-green-700">{successMessage}</p>
        </div>
      )}

      {/* Error Message (for list mode) */}
      {error && mode === 'list' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Content */}
      {renderContent()}
    </div>
  );
};

export default SelfEvaluationPage;