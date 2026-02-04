// ============================================================================
// MY TASKS PAGE - WITH EXTENSION REQUEST + RESPONSIVE
// File: src/pages/evaluations/MyTasksPage.tsx
// ============================================================================
// RESPONSIVE UPDATE:
// - Stats grid: 2 cols mobile, 3 cols tablet, 6 cols desktop
// - Table: hidden on mobile, card view instead
// - Tabs: horizontal scroll on mobile
// - Action buttons: compact on mobile
// - Modals: mobile-friendly sizing
// - Quick filters: scroll on mobile
// ============================================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Eye,
  RefreshCw,
  Search,
  Clock,
  CheckCircle,
  FileText,
  Award,
  AlertCircle,
  Calendar,
  Building2,
  Edit3,
  X,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  Flame,
  CalendarDays,
  ArrowUpDown,
  ExternalLink,
  TrendingUp,
  Filter,
  Loader2,
  Check,
  UserPlus,
  CalendarPlus,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { myTasksService, type MyTask } from '../../services/myTasksService';
import { supabase } from '../../lib/supabase';
import ParticipationRequestsTab from '../../features/tasks/components/ParticipationRequestsTab';
import { taskParticipantService } from '../../services/taskParticipantService';
import { ExtensionRequestModal } from '../../features/tasks/components/ExtensionRequestModal';

// ============================================================================
// TYPES
// ============================================================================

type TabKey = 'in_progress' | 'awaiting_eval' | 'pending_approval' | 'approved' | 'participation_requests';
type SortField = 'code' | 'name' | 'priority' | 'due_date' | 'progress' | 'status';
type SortOrder = 'asc' | 'desc';
type QuickFilter = 'all' | 'overdue' | 'today' | 'high_priority' | 'this_week';

interface TabConfig {
  key: TabKey;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
}

interface ApprovalInfo {
  task_id: string;
  score: number | null;
  rating: string | null;
  comments: string | null;
  approval_date: string | null;
  approver_name?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TABS: TabConfig[] = [
  {
    key: 'in_progress',
    label: 'Đang làm',
    shortLabel: 'Đang làm',
    icon: <Clock className="w-4 h-4" />,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-500',
  },
  {
    key: 'awaiting_eval',
    label: 'Chờ tự đánh giá',
    shortLabel: 'Chờ ĐG',
    icon: <FileText className="w-4 h-4" />,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-500',
  },
  {
    key: 'pending_approval',
    label: 'Chờ phê duyệt',
    shortLabel: 'Chờ duyệt',
    icon: <AlertCircle className="w-4 h-4" />,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-500',
  },
  {
    key: 'approved',
    label: 'Đã duyệt',
    shortLabel: 'Đã duyệt',
    icon: <CheckCircle className="w-4 h-4" />,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-500',
  },
  {
    key: 'participation_requests',
    label: 'Yêu cầu tham gia',
    shortLabel: 'Tham gia',
    icon: <UserPlus className="w-4 h-4" />,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-500',
  },
];

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string; sortOrder: number }> = {
  urgent: { label: 'Khẩn cấp', color: 'text-red-700', bg: 'bg-red-100', sortOrder: 1 },
  high: { label: 'Cao', color: 'text-orange-700', bg: 'bg-orange-100', sortOrder: 2 },
  medium: { label: 'Trung bình', color: 'text-blue-700', bg: 'bg-blue-100', sortOrder: 3 },
  low: { label: 'Thấp', color: 'text-gray-600', bg: 'bg-gray-100', sortOrder: 4 },
};

const RATING_CONFIG: Record<string, { label: string; color: string }> = {
  excellent: { label: 'Xuất sắc', color: 'text-emerald-600' },
  good: { label: 'Tốt', color: 'text-blue-600' },
  average: { label: 'Khá', color: 'text-yellow-600' },
  below_average: { label: 'Trung bình', color: 'text-orange-600' },
};

const QUICK_FILTERS: { key: QuickFilter; label: string; icon: React.ReactNode }[] = [
  { key: 'all', label: 'Tất cả', icon: <Filter className="w-3.5 h-3.5" /> },
  { key: 'overdue', label: 'Quá hạn', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  { key: 'today', label: 'Hôm nay', icon: <CalendarDays className="w-3.5 h-3.5" /> },
  { key: 'high_priority', label: 'Ưu tiên cao', icon: <Flame className="w-3.5 h-3.5" /> },
  { key: 'this_week', label: 'Tuần này', icon: <Calendar className="w-3.5 h-3.5" /> },
];

const QUICK_PROGRESS_OPTIONS = [25, 50, 75, 100];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getRatingFromScore(score: number): string {
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
  });
}

function isOverdue(dueDate: string | null | undefined, status: string): boolean {
  if (!dueDate || status === 'finished' || status === 'cancelled') return false;
  const due = new Date(dueDate);
  due.setHours(23, 59, 59, 999);
  return due < new Date();
}

function isToday(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

function isThisWeek(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay() + 1);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return date >= weekStart && date <= weekEnd;
}

function getDaysRemaining(dueDate: string | null | undefined): { text: string; isOverdue: boolean; daysCount: number } {
  if (!dueDate) return { text: '-', isOverdue: false, daysCount: 0 };
  
  const due = new Date(dueDate);
  due.setHours(23, 59, 59, 999);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const diffTime = due.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    return { text: `Quá ${Math.abs(diffDays)} ngày`, isOverdue: true, daysCount: diffDays };
  } else if (diffDays === 0) {
    return { text: 'Hôm nay', isOverdue: false, daysCount: 0 };
  } else if (diffDays === 1) {
    return { text: 'Ngày mai', isOverdue: false, daysCount: 1 };
  } else {
    return { text: `Còn ${diffDays} ngày`, isOverdue: false, daysCount: diffDays };
  }
}

// ============================================================================
// PROGRESS UPDATE MODAL
// ============================================================================

const ProgressUpdateModal: React.FC<{
  task: MyTask | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (taskId: string, progress: number) => Promise<void>;
}> = ({ task, isOpen, onClose, onUpdate }) => {
  const [progress, setProgress] = useState(task?.progress || 0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && task) setProgress(task.progress || 0);
  }, [isOpen, task]);

  const handleSave = async () => {
    if (!task) return;
    setSaving(true);
    try {
      await onUpdate(task.id, progress);
      onClose();
    } catch (error) {
      // Silent
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !task) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-end sm:items-center justify-center min-h-screen px-4 pt-4 pb-20 sm:pb-4 text-center">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose} />
        
        <div className="relative inline-block w-full max-w-md p-5 sm:p-6 my-8 text-left bg-white rounded-t-xl sm:rounded-xl shadow-xl transform transition-all">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900">Cập nhật tiến độ</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-500 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 mb-4">
            <p className="text-sm font-medium text-gray-900 line-clamp-2">{task.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">{task.code}</p>
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Tiến độ</span>
              <span className="text-xl sm:text-2xl font-bold text-blue-600">{progress}%</span>
            </div>
            
            <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
              <div
                className={`h-3 rounded-full transition-all duration-300 ${
                  progress >= 100 ? 'bg-green-500' : progress >= 50 ? 'bg-blue-500' : 'bg-yellow-500'
                }`}
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>

            <input
              type="range"
              min="0"
              max="100"
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>

          <div className="mb-5 sm:mb-6">
            <p className="text-sm font-medium text-gray-700 mb-2">Chọn nhanh:</p>
            <div className="grid grid-cols-4 gap-2">
              {QUICK_PROGRESS_OPTIONS.map((qv) => (
                <button
                  key={qv}
                  onClick={() => setProgress(qv)}
                  className={`px-2 sm:px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    progress === qv
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {qv}%
                </button>
              ))}
            </div>
          </div>

          {progress >= 100 && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                <div>
                  <span className="text-sm text-green-700 font-medium">Sẽ đánh dấu hoàn thành</span>
                  <p className="text-xs text-green-600 mt-0.5">Bạn có thể tiến hành tự đánh giá</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Hủy
            </button>
            <button
              onClick={handleSave}
              disabled={saving || progress === task.progress}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Cập nhật
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// SMALL COMPONENTS
// ============================================================================

const StatsCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  bgColor: string;
  isActive?: boolean;
  onClick?: () => void;
}> = ({ icon, label, value, color, bgColor, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full text-left rounded-xl p-3 sm:p-4 border-2 transition-all hover:shadow-md ${bgColor} ${
      isActive ? 'border-current ring-2 ring-offset-1' : 'border-transparent'
    } ${color}`}
  >
    <div className="flex items-center gap-2 sm:gap-3">
      <div className={`p-2 sm:p-2.5 rounded-lg bg-white/80 shadow-sm ${color}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-500 truncate">{label}</p>
        <p className={`text-xl sm:text-2xl font-bold ${color}`}>{value}</p>
      </div>
    </div>
  </button>
);

const ScoreCard: React.FC<{ score: number; label: string }> = ({ score, label }) => {
  const hasData = score > 0;
  const rating = hasData ? getRatingFromScore(score) : 'none';
  const ratingConfig = RATING_CONFIG[rating];
  
  return (
    <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-3 sm:p-4 border border-purple-100">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="p-2 sm:p-2.5 rounded-lg bg-white shadow-sm">
          <Award className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500">Điểm TB</p>
          <div className="flex items-baseline gap-1 sm:gap-2">
            <span className="text-xl sm:text-2xl font-bold text-purple-700">
              {hasData ? score : '-'}
            </span>
            {hasData && (
              <span className={`text-xs sm:text-sm font-medium ${ratingConfig?.color || 'text-gray-600'}`}>
                {label}
              </span>
            )}
            {!hasData && <span className="text-xs sm:text-sm text-gray-400">Chưa có</span>}
          </div>
        </div>
      </div>
    </div>
  );
};

const PriorityBadge: React.FC<{ priority: string }> = ({ priority }) => {
  const config = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${config.bg} ${config.color}`}>
      {priority === 'urgent' && <Flame className="w-3 h-3 mr-1" />}
      {config.label}
    </span>
  );
};

const ProgressBar: React.FC<{ progress: number }> = ({ progress }) => {
  const color = progress >= 100 ? 'bg-green-500' : progress >= 50 ? 'bg-blue-500' : 'bg-amber-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-1.5 ${color} rounded-full transition-all duration-300`} style={{ width: `${Math.min(progress, 100)}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-600 w-8 text-right">{progress}%</span>
    </div>
  );
};

const EmptyState: React.FC<{ icon: React.ReactNode; title: string; description: string }> = ({ icon, title, description }) => (
  <div className="py-12 sm:py-16 text-center px-4">
    <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gray-100 text-gray-400 mb-3 sm:mb-4">
      {icon}
    </div>
    <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1">{title}</h3>
    <p className="text-sm text-gray-500">{description}</p>
  </div>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const MyTasksPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();

  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    const tabParam = searchParams.get('tab');
    return (tabParam as TabKey) || 'in_progress';
  });
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [sortField, setSortField] = useState<SortField>('due_date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [approvalInfoMap, setApprovalInfoMap] = useState<Map<string, ApprovalInfo>>(new Map());

  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<MyTask | null>(null);
  const [participationRequestsCount, setParticipationRequestsCount] = useState(0);
  const [extensionModalOpen, setExtensionModalOpen] = useState(false);
  const [extensionTask, setExtensionTask] = useState<MyTask | null>(null);

  // ============================================================================
  // DATA FETCHING (unchanged logic)
  // ============================================================================

  const fetchTasks = useCallback(async () => {
    if (!user?.employee_id) return;
    try {
      const response = await myTasksService.getMyTasks(user.employee_id);
      setTasks(response.data || []);
    } catch (error) {
      setTasks([]);
    }
  }, [user?.employee_id]);

  const fetchApprovalInfo = useCallback(async () => {
    if (!user?.employee_id) return;
    try {
      const { data: myTasks, error: tasksError } = await supabase
        .from('tasks').select('id').eq('assignee_id', user.employee_id);
      if (tasksError || !myTasks || myTasks.length === 0) return;
      const taskIds = myTasks.map(t => t.id);
      const { data, error } = await supabase
        .from('task_approvals')
        .select(`task_id, approved_score, original_score, rating, comments, action, created_at, approver:employees!task_approvals_approver_id_fkey(full_name)`)
        .in('task_id', taskIds).eq('action', 'approved');
      if (!error && data && data.length > 0) {
        const map = new Map<string, ApprovalInfo>();
        data.forEach((item: any) => {
          map.set(item.task_id, {
            task_id: item.task_id, score: item.approved_score, rating: item.rating,
            comments: item.comments, approval_date: item.created_at, approver_name: item.approver?.full_name,
          });
        });
        setApprovalInfoMap(map);
      }
    } catch (error) { /* Silent */ }
  }, [user?.employee_id]);

  const fetchParticipationRequestsCount = useCallback(async () => {
    if (!user?.employee_id) return;
    try {
      const count = await taskParticipantService.countPendingRequests(user.employee_id);
      setParticipationRequestsCount(count);
    } catch (error) { setParticipationRequestsCount(0); }
  }, [user?.employee_id]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchTasks(), fetchApprovalInfo(), fetchParticipationRequestsCount()]);
      setLoading(false);
    };
    loadData();
  }, [fetchTasks, fetchApprovalInfo, fetchParticipationRequestsCount]);

  useEffect(() => { setSearchParams({ tab: activeTab }); }, [activeTab, setSearchParams]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchTasks(), fetchApprovalInfo(), fetchParticipationRequestsCount()]);
    setRefreshing(false);
  };

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  const stats = useMemo(() => {
    const inProgress = tasks.filter(t => t.status === 'in_progress' && t.evaluation_status !== 'approved').length;
    const awaitingEval = tasks.filter(t => t.status === 'finished' && (!t.evaluation_status || t.evaluation_status === 'none' || t.evaluation_status === 'pending_self_eval')).length;
    const pendingApproval = tasks.filter(t => t.evaluation_status === 'pending_approval').length;
    const approved = tasks.filter(t => t.evaluation_status === 'approved').length;
    const overdue = tasks.filter(t => isOverdue(t.due_date, t.status) && t.evaluation_status !== 'approved').length;
    return { total: tasks.length, inProgress, awaitingEval, pendingApproval, approved, overdue };
  }, [tasks]);

  const evaluationStats = useMemo(() => {
    if (approvalInfoMap.size === 0) return { averageScore: 0, rating: '-' };
    let totalScore = 0; let count = 0;
    approvalInfoMap.forEach((info) => { if (info.score && info.score > 0) { totalScore += info.score; count++; } });
    const avg = count > 0 ? Math.round(totalScore / count) : 0;
    return { averageScore: avg, rating: RATING_CONFIG[getRatingFromScore(avg)]?.label || '-' };
  }, [approvalInfoMap]);

  const tabCounts: Record<TabKey, number> = {
    in_progress: stats.inProgress, awaiting_eval: stats.awaitingEval,
    pending_approval: stats.pendingApproval, approved: stats.approved,
    participation_requests: participationRequestsCount,
  };

  const filteredTasks = useMemo(() => {
    if (activeTab === 'participation_requests') return [];
    let result = tasks.filter(task => {
      switch (activeTab) {
        case 'in_progress': return task.status === 'in_progress' && task.evaluation_status !== 'approved';
        case 'awaiting_eval': return task.status === 'finished' && (!task.evaluation_status || task.evaluation_status === 'none' || task.evaluation_status === 'pending_self_eval');
        case 'pending_approval': return task.evaluation_status === 'pending_approval';
        case 'approved': return task.evaluation_status === 'approved';
        default: return true;
      }
    });
    if (quickFilter !== 'all') {
      result = result.filter(task => {
        switch (quickFilter) {
          case 'overdue': return isOverdue(task.due_date, task.status);
          case 'today': return isToday(task.due_date);
          case 'high_priority': return task.priority === 'high' || task.priority === 'urgent';
          case 'this_week': return isThisWeek(task.due_date);
          default: return true;
        }
      });
    }
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      result = result.filter(task => task.name?.toLowerCase().includes(search) || task.code?.toLowerCase().includes(search));
    }
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'code': comparison = (a.code || '').localeCompare(b.code || ''); break;
        case 'name': comparison = (a.name || '').localeCompare(b.name || ''); break;
        case 'priority': comparison = (PRIORITY_CONFIG[a.priority]?.sortOrder || 99) - (PRIORITY_CONFIG[b.priority]?.sortOrder || 99); break;
        case 'due_date': comparison = (a.due_date ? new Date(a.due_date).getTime() : Infinity) - (b.due_date ? new Date(b.due_date).getTime() : Infinity); break;
        case 'progress': comparison = (a.progress || 0) - (b.progress || 0); break;
        default: comparison = 0;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    return result;
  }, [tasks, activeTab, quickFilter, searchTerm, sortField, sortOrder]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleSort = (field: SortField) => {
    if (sortField === field) { setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc'); }
    else { setSortField(field); setSortOrder('asc'); }
  };

  const handleViewTask = (taskId: string) => navigate(`/tasks/${taskId}`);
  const handleSelfEvaluate = (task: MyTask) => navigate(`/evaluations/self-evaluation?task_id=${task.id}`);
  const handleUpdateProgress = (task: MyTask) => { setSelectedTask(task); setProgressModalOpen(true); };

  const handleProgressUpdate = async (taskId: string, newProgress: number) => {
    let newStatus = 'in_progress';
    if (newProgress >= 100) newStatus = 'finished';
    else if (newProgress === 0) newStatus = 'draft';
    const { error } = await supabase.from('tasks').update({ progress: newProgress, status: newStatus }).eq('id', taskId);
    if (error) throw error;
    await fetchTasks();
  };

  const handleRequestExtension = (task: MyTask) => { setExtensionTask(task); setExtensionModalOpen(true); };
  const handleExtensionSuccess = () => { setExtensionModalOpen(false); setExtensionTask(null); fetchTasks(); };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3 text-gray-500">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Đang tải...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Công việc của tôi</h1>
          <p className="text-sm text-gray-500 mt-0.5 sm:mt-1">Quản lý và theo dõi tiến độ</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 shadow-sm self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4">
        <StatsCard icon={<FileText className="w-4 h-4 sm:w-5 sm:h-5" />} label="Tổng" value={stats.total} color="text-gray-700" bgColor="bg-gray-50" />
        <StatsCard icon={<Clock className="w-4 h-4 sm:w-5 sm:h-5" />} label="Đang làm" value={stats.inProgress} color="text-blue-600" bgColor="bg-blue-50" isActive={activeTab === 'in_progress'} onClick={() => setActiveTab('in_progress')} />
        <StatsCard icon={<Edit3 className="w-4 h-4 sm:w-5 sm:h-5" />} label="Chờ ĐG" value={stats.awaitingEval} color="text-amber-600" bgColor="bg-amber-50" isActive={activeTab === 'awaiting_eval'} onClick={() => setActiveTab('awaiting_eval')} />
        <StatsCard icon={<AlertCircle className="w-4 h-4 sm:w-5 sm:h-5" />} label="Chờ duyệt" value={stats.pendingApproval} color="text-orange-600" bgColor="bg-orange-50" isActive={activeTab === 'pending_approval'} onClick={() => setActiveTab('pending_approval')} />
        <StatsCard icon={<CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />} label="Đã duyệt" value={stats.approved} color="text-green-600" bgColor="bg-green-50" isActive={activeTab === 'approved'} onClick={() => setActiveTab('approved')} />
        <ScoreCard score={evaluationStats.averageScore} label={evaluationStats.rating} />
      </div>

      {/* Overdue Warning */}
      {stats.overdue > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2 bg-red-100 rounded-lg flex-shrink-0">
            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-red-800 font-medium">
              <strong>{stats.overdue}</strong> công việc quá hạn
            </p>
          </div>
          <button
            onClick={() => { setActiveTab('in_progress'); setQuickFilter('overdue'); }}
            className="px-3 py-1.5 bg-red-600 text-white text-xs sm:text-sm font-medium rounded-lg hover:bg-red-700 flex-shrink-0"
          >
            Xem
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Search & Filters */}
        {activeTab !== 'participation_requests' && (
          <div className="p-3 sm:p-4 border-b border-gray-200 space-y-3 sm:space-y-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Tìm mã hoặc tên..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 sm:pl-10 pr-9 py-2 sm:py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Quick filters - scrollable on mobile */}
            <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 -mx-3 px-3 sm:mx-0 sm:px-0 scrollbar-hide">
              <span className="text-xs sm:text-sm text-gray-500 mr-1 whitespace-nowrap flex-shrink-0">Lọc:</span>
              {QUICK_FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setQuickFilter(f.key)}
                  className={`inline-flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                    quickFilter === f.key
                      ? 'bg-blue-100 text-blue-700 border border-blue-300'
                      : 'bg-gray-100 text-gray-600 border border-transparent hover:bg-gray-200'
                  }`}
                >
                  {f.icon}
                  {f.label}
                  {f.key === 'overdue' && stats.overdue > 0 && (
                    <span className="ml-1 px-1 py-0.5 bg-red-500 text-white text-xs rounded-full leading-none">
                      {stats.overdue}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tabs - scrollable on mobile */}
        <div className="flex border-b border-gray-200 overflow-x-auto bg-gray-50 scrollbar-hide">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setQuickFilter('all'); }}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-3 sm:py-3.5 text-xs sm:text-sm font-medium whitespace-nowrap border-b-2 transition-all flex-shrink-0 ${
                activeTab === tab.key
                  ? `${tab.borderColor} ${tab.color} ${tab.bgColor}`
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.shortLabel}</span>
              {tabCounts[tab.key] > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                  activeTab === tab.key ? 'bg-white/80 shadow-sm' : tab.key === 'participation_requests' ? 'bg-purple-500 text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  {tabCounts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {activeTab === 'participation_requests' ? (
          <ParticipationRequestsTab onCountChange={(count) => setParticipationRequestsCount(count)} />
        ) : (
          <>
            {filteredTasks.length === 0 ? (
              <EmptyState
                icon={searchTerm ? <Search className="w-7 h-7 sm:w-8 sm:h-8" /> : <FileText className="w-7 h-7 sm:w-8 sm:h-8" />}
                title={searchTerm ? 'Không tìm thấy' : 'Không có công việc'}
                description={searchTerm ? 'Thử thay đổi từ khóa' : 'Khi có công việc mới sẽ hiển thị ở đây'}
              />
            ) : (
              <>
                {/* ===== DESKTOP TABLE (hidden on mobile) ===== */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="w-8 px-3 py-3"></th>
                        <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase w-28 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('code')}>
                          <div className="flex items-center gap-1">Mã {sortField === 'code' ? (sortOrder === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />) : <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />}</div>
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleSort('name')}>
                          <div className="flex items-center gap-1">Tên {sortField === 'name' ? (sortOrder === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />) : <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />}</div>
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase w-28 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('priority')}>
                          <div className="flex items-center gap-1">Ưu tiên</div>
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase w-32 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('due_date')}>
                          <div className="flex items-center gap-1">Hạn</div>
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase w-32 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('progress')}>
                          <div className="flex items-center gap-1">Tiến độ</div>
                        </th>
                        {activeTab === 'approved' && (
                          <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase w-24">Điểm</th>
                        )}
                        <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase w-44">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredTasks.map((task) => {
                        const taskOverdue = isOverdue(task.due_date, task.status) && task.evaluation_status !== 'approved';
                        const daysInfo = getDaysRemaining(task.due_date);
                        const approvalInfo = approvalInfoMap.get(task.id);
                        const canRequestExtension = activeTab === 'in_progress' && task.status === 'in_progress' && task.due_date;

                        return (
                          <tr key={task.id} className={`hover:bg-gray-50 transition-colors ${taskOverdue ? 'bg-red-50/50' : ''}`}>
                            <td className="px-3 py-3.5">{taskOverdue && <AlertTriangle className="w-4 h-4 text-red-500" />}</td>
                            <td className="px-3 py-3.5"><span className="font-mono text-sm text-gray-600">{task.code}</span></td>
                            <td className="px-3 py-3.5">
                              <button onClick={() => handleViewTask(task.id)} className="font-medium text-gray-900 hover:text-blue-600 text-left truncate max-w-[300px] block" title={task.name}>{task.name}</button>
                              {task.department?.name && <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500"><Building2 className="w-3 h-3" />{task.department.name}</div>}
                            </td>
                            <td className="px-3 py-3.5"><PriorityBadge priority={task.priority} /></td>
                            <td className="px-3 py-3.5">
                              <div className={`text-sm ${taskOverdue ? 'text-red-600 font-medium' : 'text-gray-900'}`}>{formatDate(task.due_date)}</div>
                              <div className={`text-xs ${daysInfo.isOverdue ? 'text-red-500 font-medium' : 'text-gray-500'}`}>{daysInfo.text}</div>
                            </td>
                            <td className="px-3 py-3.5"><ProgressBar progress={task.progress || 0} /></td>
                            {activeTab === 'approved' && (
                              <td className="px-3 py-3.5 text-center">
                                {approvalInfo?.score ? (
                                  <div><span className="text-lg font-bold text-purple-600">{approvalInfo.score}</span>
                                  {approvalInfo.rating && <div className={`text-xs ${RATING_CONFIG[approvalInfo.rating]?.color || ''}`}>{RATING_CONFIG[approvalInfo.rating]?.label}</div>}</div>
                                ) : <span className="text-gray-400">-</span>}
                              </td>
                            )}
                            <td className="px-3 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => handleViewTask(task.id)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Xem"><Eye className="w-4 h-4" /></button>
                                {activeTab === 'in_progress' && (
                                  <button onClick={() => handleUpdateProgress(task)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg"><TrendingUp className="w-3.5 h-3.5" />Cập nhật</button>
                                )}
                                {canRequestExtension && (
                                  <button onClick={() => handleRequestExtension(task)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg"><CalendarPlus className="w-3.5 h-3.5" />Gia hạn</button>
                                )}
                                {activeTab === 'awaiting_eval' && (
                                  <button onClick={() => handleSelfEvaluate(task)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg"><Edit3 className="w-3.5 h-3.5" />Tự ĐG</button>
                                )}
                                {activeTab === 'approved' && (
                                  <button onClick={() => handleViewTask(task.id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg"><ExternalLink className="w-3.5 h-3.5" />Kết quả</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* ===== MOBILE CARD VIEW ===== */}
                <div className="md:hidden divide-y divide-gray-100">
                  {filteredTasks.map((task) => {
                    const taskOverdue = isOverdue(task.due_date, task.status) && task.evaluation_status !== 'approved';
                    const daysInfo = getDaysRemaining(task.due_date);
                    const approvalInfo = approvalInfoMap.get(task.id);
                    const canRequestExtension = activeTab === 'in_progress' && task.status === 'in_progress' && task.due_date;

                    return (
                      <div key={task.id} className={`p-3 sm:p-4 ${taskOverdue ? 'bg-red-50/50' : ''}`}>
                        {/* Top row: name + priority */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0 flex-1">
                            <button onClick={() => handleViewTask(task.id)} className="font-medium text-sm text-gray-900 hover:text-blue-600 text-left line-clamp-2 w-full">{task.name}</button>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="font-mono text-xs text-gray-400">{task.code}</span>
                              {task.department?.name && <span className="text-xs text-gray-400">• {task.department.name}</span>}
                            </div>
                          </div>
                          <PriorityBadge priority={task.priority} />
                        </div>

                        {/* Middle: deadline + progress */}
                        <div className="flex items-center gap-4 mb-3 text-xs">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-gray-400" />
                            <span className={taskOverdue ? 'text-red-600 font-medium' : 'text-gray-600'}>{formatDate(task.due_date)}</span>
                            <span className={`${daysInfo.isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>({daysInfo.text})</span>
                          </div>
                          {activeTab === 'approved' && approvalInfo?.score && (
                            <div className="flex items-center gap-1">
                              <Award className="w-3 h-3 text-purple-500" />
                              <span className="text-purple-600 font-bold">{approvalInfo.score}</span>
                            </div>
                          )}
                        </div>

                        {/* Progress bar */}
                        <div className="mb-3">
                          <ProgressBar progress={task.progress || 0} />
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button onClick={() => handleViewTask(task.id)} className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">
                            <Eye className="w-3.5 h-3.5" />Xem
                          </button>
                          {activeTab === 'in_progress' && (
                            <button onClick={() => handleUpdateProgress(task)} className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg">
                              <TrendingUp className="w-3.5 h-3.5" />Cập nhật
                            </button>
                          )}
                          {canRequestExtension && (
                            <button onClick={() => handleRequestExtension(task)} className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg">
                              <CalendarPlus className="w-3.5 h-3.5" />Gia hạn
                            </button>
                          )}
                          {activeTab === 'awaiting_eval' && (
                            <button onClick={() => handleSelfEvaluate(task)} className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg">
                              <Edit3 className="w-3.5 h-3.5" />Tự đánh giá
                            </button>
                          )}
                          {activeTab === 'approved' && (
                            <button onClick={() => handleViewTask(task.id)} className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg">
                              <ExternalLink className="w-3.5 h-3.5" />Kết quả
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {filteredTasks.length > 0 && (
              <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-t border-gray-200 bg-gray-50 text-xs sm:text-sm text-gray-500">
                <strong>{filteredTasks.length}</strong> công việc
                {searchTerm && ` • "${searchTerm}"`}
                {quickFilter !== 'all' && ` • ${QUICK_FILTERS.find(f => f.key === quickFilter)?.label}`}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      <ProgressUpdateModal
        task={selectedTask}
        isOpen={progressModalOpen}
        onClose={() => { setProgressModalOpen(false); setSelectedTask(null); }}
        onUpdate={handleProgressUpdate}
      />

      {extensionTask && (
        <ExtensionRequestModal
          isOpen={extensionModalOpen}
          onClose={() => { setExtensionModalOpen(false); setExtensionTask(null); }}
          task={{ id: extensionTask.id, name: extensionTask.name, code: extensionTask.code, due_date: extensionTask.due_date || '' }}
          onSuccess={handleExtensionSuccess}
        />
      )}
    </div>
  );
};

export default MyTasksPage;