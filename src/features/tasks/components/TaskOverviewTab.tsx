// ============================================================================
// TASK OVERVIEW TAB - FIXED VERSION
// File: src/features/tasks/components/TaskOverviewTab.tsx
// Huy Anh ERP System - Task Dashboard / Statistics
// ============================================================================
// FIXED: Cập nhật CHART_COLORS khớp với database constraints
// Database: draft, in_progress, paused, finished, cancelled
// ============================================================================

import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Calendar,
  FileText,
  CheckCircle,
  Clock,
  AlertTriangle,
  Award,
  TrendingUp,
  Building2,
  RefreshCw,
  ChevronDown,
  Filter,
} from 'lucide-react';
import {
  taskStatsService,
  OverviewStats,
  DepartmentTaskStats,
  StatsFilter,
} from '../../../services/taskStatsService';
import { departmentService } from '../../../services/departmentService';

// ============================================================================
// TYPES
// ============================================================================

interface TaskOverviewTabProps {
  userDepartmentId?: string;
  canViewAllDepartments?: boolean;
}

interface Department {
  id: string;
  name: string;
}

// ============================================================================
// CONSTANTS - ✅ FIXED: Khớp với database constraint
// ============================================================================

// ✅ FIXED: Dùng 'finished' và 'paused' thay vì 'completed' và 'on_hold'
const CHART_COLORS = {
  finished: '#22c55e',    // ✅ Fixed: green (thay vì 'completed')
  in_progress: '#3b82f6', // blue
  draft: '#f59e0b',       // ✅ Fixed: amber (thay vì 'pending')
  paused: '#8b5cf6',      // ✅ Fixed: purple (thay vì 'on_hold')
  cancelled: '#ef4444',   // red
  overdue: '#dc2626',
};

const PIE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444'];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getMonthRange(monthsAgo: number = 0): { from: string; to: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() - monthsAgo;
  
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  
  return {
    from: firstDay.toISOString().split('T')[0],
    to: lastDay.toISOString().split('T')[0],
  };
}

function getQuarterRange(): { from: string; to: string } {
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3);
  const year = now.getFullYear();
  
  const firstMonth = quarter * 3;
  const firstDay = new Date(year, firstMonth, 1);
  const lastDay = new Date(year, firstMonth + 3, 0);
  
  return {
    from: firstDay.toISOString().split('T')[0],
    to: lastDay.toISOString().split('T')[0],
  };
}

function getYearRange(): { from: string; to: string } {
  const year = new Date().getFullYear();
  return {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
  };
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('vi-VN');
}

function getRatingLabel(score: number): { label: string; color: string } {
  if (score >= 90) return { label: 'Xuất sắc', color: 'text-emerald-600' };
  if (score >= 70) return { label: 'Tốt', color: 'text-blue-600' };
  if (score >= 50) return { label: 'Khá', color: 'text-yellow-600' };
  return { label: 'Cần cải thiện', color: 'text-red-600' };
}

// ============================================================================
// SUB COMPONENTS
// ============================================================================

// Stats Card
const StatsCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number | string;
  subValue?: string;
  color: string;
  bgColor: string;
}> = ({ icon, label, value, subValue, color, bgColor }) => (
  <div className={`${bgColor} rounded-xl p-4 border border-gray-100`}>
    <div className="flex items-center gap-3">
      <div className={`p-2.5 rounded-lg bg-white shadow-sm ${color}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-500 truncate">{label}</p>
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
        {subValue && <p className="text-xs text-gray-500">{subValue}</p>}
      </div>
    </div>
  </div>
);

// Quick Date Filter
const QuickDateFilter: React.FC<{
  active: string;
  onSelect: (key: string, range: { from: string; to: string }) => void;
}> = ({ active, onSelect }) => {
  const options = [
    { key: 'this_month', label: 'Tháng này', getRange: () => getMonthRange(0) },
    { key: 'last_month', label: 'Tháng trước', getRange: () => getMonthRange(1) },
    { key: 'this_quarter', label: 'Quý này', getRange: getQuarterRange },
    { key: 'this_year', label: 'Năm nay', getRange: getYearRange },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button
          key={opt.key}
          onClick={() => onSelect(opt.key, opt.getRange())}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
            active === opt.key
              ? 'bg-blue-100 text-blue-700 border border-blue-300'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
};

// Department Table
const DepartmentTable: React.FC<{
  data: DepartmentTaskStats[];
  onDepartmentClick?: (deptId: string) => void;
}> = ({ data, onDepartmentClick }) => {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        Không có dữ liệu
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
              Phòng ban
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
              Tổng
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
              Hoàn thành
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
              Đang làm
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
              Quá hạn
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
              Tỷ lệ HT
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
              Điểm TB
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((dept) => {
            const rating = getRatingLabel(dept.average_score);
            return (
              <tr
                key={dept.department_id}
                className="hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => onDepartmentClick?.(dept.department_id)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-gray-400" />
                    <span className="font-medium text-gray-900">{dept.department_name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-center font-semibold text-gray-700">
                  {dept.total_tasks}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="text-green-600 font-medium">{dept.completed}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="text-blue-600 font-medium">{dept.in_progress}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  {dept.overdue > 0 ? (
                    <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {dept.overdue}
                    </span>
                  ) : (
                    <span className="text-gray-400">0</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          dept.completion_rate >= 80 ? 'bg-green-500' :
                          dept.completion_rate >= 50 ? 'bg-blue-500' :
                          'bg-amber-500'
                        }`}
                        style={{ width: `${dept.completion_rate}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-700 w-10">
                      {dept.completion_rate}%
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  {dept.average_score > 0 ? (
                    <span className={`font-semibold ${rating.color}`}>
                      {dept.average_score}
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        {/* Footer - Tổng */}
        <tfoot className="bg-gray-100 border-t-2 border-gray-300">
          <tr>
            <td className="px-4 py-3 font-bold text-gray-900">Tổng cộng</td>
            <td className="px-4 py-3 text-center font-bold text-gray-900">
              {data.reduce((sum, d) => sum + d.total_tasks, 0)}
            </td>
            <td className="px-4 py-3 text-center font-bold text-green-600">
              {data.reduce((sum, d) => sum + d.completed, 0)}
            </td>
            <td className="px-4 py-3 text-center font-bold text-blue-600">
              {data.reduce((sum, d) => sum + d.in_progress, 0)}
            </td>
            <td className="px-4 py-3 text-center font-bold text-red-600">
              {data.reduce((sum, d) => sum + d.overdue, 0)}
            </td>
            <td className="px-4 py-3 text-center">
              {(() => {
                const total = data.reduce((sum, d) => sum + d.total_tasks, 0);
                const completed = data.reduce((sum, d) => sum + d.completed, 0);
                const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
                return <span className="font-bold text-gray-700">{rate}%</span>;
              })()}
            </td>
            <td className="px-4 py-3 text-center">
              {(() => {
                const scores = data.filter(d => d.average_score > 0).map(d => d.average_score);
                const avg = scores.length > 0 
                  ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) 
                  : 0;
                return avg > 0 ? (
                  <span className="font-bold text-purple-600">{avg}</span>
                ) : (
                  <span className="text-gray-400">-</span>
                );
              })()}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

// Custom Tooltip for Charts
const CustomTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  
  return (
    <div className="bg-white px-3 py-2 shadow-lg rounded-lg border border-gray-200">
      <p className="font-medium text-gray-900 mb-1">{label}</p>
      {payload.map((entry: any, index: number) => (
        <p key={index} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: <span className="font-semibold">{entry.value}</span>
        </p>
      ))}
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const TaskOverviewTab: React.FC<TaskOverviewTabProps> = ({
  userDepartmentId,
  canViewAllDepartments = false,
}) => {
  // State
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [activeQuickFilter, setActiveQuickFilter] = useState('this_month');
  
  // Filter state
  const [filter, setFilter] = useState<StatsFilter>(() => {
    const { from, to } = getMonthRange(0);
    return {
      from_date: from,
      to_date: to,
      department_id: canViewAllDepartments ? 'all' : userDepartmentId,
    };
  });

  // Load departments
  useEffect(() => {
    const loadDepartments = async () => {
      if (!canViewAllDepartments) return;
      
      try {
        const { data } = await departmentService.getAll();
        setDepartments(data || []);
      } catch (error) {
        console.error('Error loading departments:', error);
      }
    };
    loadDepartments();
  }, [canViewAllDepartments]);

  // Load stats
  useEffect(() => {
    const loadStats = async () => {
      setLoading(true);
      try {
        const { data, error } = await taskStatsService.getOverviewStats(filter);
        if (error) throw error;
        setStats(data);
      } catch (error) {
        console.error('Error loading stats:', error);
      } finally {
        setLoading(false);
      }
    };
    loadStats();
  }, [filter]);

  // Handlers
  const handleQuickFilter = (key: string, range: { from: string; to: string }) => {
    setActiveQuickFilter(key);
    setFilter(prev => ({
      ...prev,
      from_date: range.from,
      to_date: range.to,
    }));
  };

  const handleDateChange = (field: 'from_date' | 'to_date', value: string) => {
    setActiveQuickFilter('');
    setFilter(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleDepartmentChange = (deptId: string) => {
    setFilter(prev => ({
      ...prev,
      department_id: deptId,
    }));
  };

  const handleRefresh = () => {
    setFilter(prev => ({ ...prev })); // Trigger re-fetch
  };

  // Chart data
  const barChartData = useMemo(() => {
    if (!stats?.by_department) return [];
    return stats.by_department.map(dept => ({
      name: dept.department_name.length > 10 
        ? dept.department_name.substring(0, 10) + '...' 
        : dept.department_name,
      fullName: dept.department_name,
      'Hoàn thành': dept.completed,
      'Đang làm': dept.in_progress,
      'Chờ xử lý': dept.pending,
      'Quá hạn': dept.overdue,
    }));
  }, [stats]);

  const pieChartData = useMemo(() => {
    if (!stats?.by_status) return [];
    return stats.by_status.filter(s => s.count > 0);
  }, [stats]);

  // Render loading
  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  const rating = stats ? getRatingLabel(stats.average_score) : { label: '-', color: 'text-gray-400' };

  return (
    <div className="space-y-6">
      {/* ========== FILTERS ========== */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Date Range */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-600">Từ:</span>
            <input
              type="date"
              value={filter.from_date}
              onChange={(e) => handleDateChange('from_date', e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-600">Đến:</span>
            <input
              type="date"
              value={filter.to_date}
              onChange={(e) => handleDateChange('to_date', e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Department Filter */}
          {canViewAllDepartments && (
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-gray-400" />
              <select
                value={filter.department_id || 'all'}
                onChange={(e) => handleDepartmentChange(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Tất cả phòng ban</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Làm mới"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Quick Filters */}
        <QuickDateFilter active={activeQuickFilter} onSelect={handleQuickFilter} />
      </div>

      {/* ========== STATS CARDS ========== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatsCard
          icon={<FileText className="w-5 h-5" />}
          label="Tổng công việc"
          value={stats?.total_tasks || 0}
          color="text-gray-700"
          bgColor="bg-gray-50"
        />
        <StatsCard
          icon={<CheckCircle className="w-5 h-5" />}
          label="Hoàn thành"
          value={stats?.completed || 0}
          subValue={`${stats?.completion_rate || 0}%`}
          color="text-green-600"
          bgColor="bg-green-50"
        />
        <StatsCard
          icon={<Clock className="w-5 h-5" />}
          label="Đang làm"
          value={stats?.in_progress || 0}
          color="text-blue-600"
          bgColor="bg-blue-50"
        />
        <StatsCard
          icon={<AlertTriangle className="w-5 h-5" />}
          label="Quá hạn"
          value={stats?.overdue || 0}
          color="text-red-600"
          bgColor="bg-red-50"
        />
        <StatsCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Đã duyệt"
          value={stats?.approved || 0}
          color="text-purple-600"
          bgColor="bg-purple-50"
        />
        <StatsCard
          icon={<Award className="w-5 h-5" />}
          label="Điểm TB"
          value={stats?.average_score || '-'}
          subValue={stats?.average_score ? rating.label : undefined}
          color={stats?.average_score ? rating.color : 'text-gray-400'}
          bgColor="bg-indigo-50"
        />
      </div>

      {/* ========== CHARTS ROW ========== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bar Chart - 2 columns */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Công việc theo phòng ban
          </h3>
          {barChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barChartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fontSize: 12 }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="Hoàn thành" fill={CHART_COLORS.finished} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Đang làm" fill={CHART_COLORS.in_progress} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Quá hạn" fill={CHART_COLORS.overdue} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-gray-500">
              Không có dữ liệu
            </div>
          )}
        </div>

        {/* Pie Chart - 1 column */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Phân bổ trạng thái
          </h3>
          {pieChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="count"
                  nameKey="status"
                  label={(props: any) => 
                    `${props.name} (${(props.percent * 100).toFixed(0)}%)`
                  }
                  labelLine={false}
                >
                  {pieChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color || PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-gray-500">
              Không có dữ liệu
            </div>
          )}
          
          {/* Legend */}
          <div className="flex flex-wrap justify-center gap-3 mt-2">
            {pieChartData.map((entry, index) => (
              <div key={index} className="flex items-center gap-1.5 text-sm">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: entry.color || PIE_COLORS[index % PIE_COLORS.length] }}
                />
                <span className="text-gray-600">{entry.status}: {entry.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ========== DEPARTMENT TABLE ========== */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Chi tiết theo phòng ban
          </h3>
        </div>
        <DepartmentTable 
          data={stats?.by_department || []} 
          onDepartmentClick={(deptId) => {
            if (canViewAllDepartments) {
              handleDepartmentChange(deptId);
            }
          }}
        />
      </div>

      {/* ========== FOOTER INFO ========== */}
      <div className="text-center text-sm text-gray-500">
        Dữ liệu từ {formatDate(filter.from_date)} đến {formatDate(filter.to_date)}
        {filter.department_id && filter.department_id !== 'all' && (
          <span> • Lọc theo phòng ban</span>
        )}
      </div>
    </div>
  );
};

export default TaskOverviewTab;