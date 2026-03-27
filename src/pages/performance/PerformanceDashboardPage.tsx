// ============================================================================
// PERFORMANCE DASHBOARD PAGE
// File: src/pages/performance/PerformanceDashboardPage.tsx
// Huy Anh ERP System
// ============================================================================

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import {
  performanceDashboardService,
  PerformanceKPIs,
  EmployeePerformance,
  DepartmentPerformance,
  MonthlyTrend,
} from '../../services/performanceService';

// ============================================================================
// CONSTANTS
// ============================================================================

const GRADE_COLORS: Record<string, string> = {
  A: '#16a34a',
  B: '#2563eb',
  C: '#f59e0b',
  D: '#ef4444',
  F: '#7f1d1d',
};

const GRADE_BG: Record<string, string> = {
  A: '#dcfce7',
  B: '#dbeafe',
  C: '#fef3c7',
  D: '#fee2e2',
  F: '#fecaca',
};

const PRIMARY = '#1B4D3E';

// ============================================================================
// SVG CHART COMPONENTS
// ============================================================================

function GradeDistributionBar({ distribution }: { distribution: PerformanceKPIs['grade_distribution'] }) {
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  if (total === 0) {
    return <div style={{ color: '#9ca3af', fontSize: 14, padding: '24px 0', textAlign: 'center' }}>Chưa có dữ liệu</div>;
  }

  const grades: Array<{ key: string; label: string; count: number; color: string }> = [
    { key: 'A', label: 'Hạng A (90+)', count: distribution.A, color: '#16a34a' },
    { key: 'B', label: 'Hạng B (75-89)', count: distribution.B, color: '#2563eb' },
    { key: 'C', label: 'Hạng C (60-74)', count: distribution.C, color: '#f59e0b' },
    { key: 'D', label: 'Hạng D (40-59)', count: distribution.D, color: '#ef4444' },
    { key: 'F', label: 'Hạng F (<40)', count: distribution.F, color: '#7f1d1d' },
  ];

  const maxCount = Math.max(...grades.map(g => g.count), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {grades.map(g => (
        <div key={g.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 110, fontSize: 13, color: '#374151', flexShrink: 0 }}>{g.label}</span>
          <div style={{ flex: 1, height: 22, background: '#f3f4f6', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
            <div
              style={{
                width: `${(g.count / maxCount) * 100}%`,
                height: '100%',
                background: g.color,
                borderRadius: 6,
                transition: 'width 0.5s ease',
                minWidth: g.count > 0 ? 8 : 0,
              }}
            />
          </div>
          <span style={{ width: 48, fontSize: 13, fontWeight: 600, color: g.color, textAlign: 'right' }}>
            {g.count} NV
          </span>
        </div>
      ))}
    </div>
  );
}

function TrendChart({ data }: { data: MonthlyTrend[] }) {
  if (!data || data.length === 0) {
    return <div style={{ color: '#9ca3af', fontSize: 14, padding: '40px 0', textAlign: 'center' }}>Chưa có dữ liệu</div>;
  }

  const width = 560;
  const height = 220;
  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 40;

  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;

  const maxScore = Math.max(...data.map(d => d.avg_score), 100);
  const maxCompleted = Math.max(...data.map(d => d.completed), 1);

  const barWidth = Math.min(30, chartW / data.length / 2);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      {/* Grid lines */}
      {[0, 25, 50, 75, 100].map(v => {
        const y = paddingTop + chartH - (v / maxScore) * chartH;
        return (
          <g key={v}>
            <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="#e5e7eb" strokeWidth={1} />
            <text x={paddingLeft - 6} y={y + 4} textAnchor="end" fontSize={10} fill="#9ca3af">{v}</text>
          </g>
        );
      })}

      {/* Bars (completed count) */}
      {data.map((d, i) => {
        const x = paddingLeft + (i / (data.length - 1 || 1)) * chartW;
        const barH = (d.completed / maxCompleted) * chartH * 0.6;
        return (
          <rect
            key={`bar-${i}`}
            x={x - barWidth / 2}
            y={paddingTop + chartH - barH}
            width={barWidth}
            height={barH}
            fill={PRIMARY}
            opacity={0.2}
            rx={3}
          />
        );
      })}

      {/* Score line */}
      {data.length > 1 && (
        <polyline
          points={data.map((d, i) => {
            const x = paddingLeft + (i / (data.length - 1)) * chartW;
            const y = paddingTop + chartH - (d.avg_score / maxScore) * chartH;
            return `${x},${y}`;
          }).join(' ')}
          fill="none"
          stroke={PRIMARY}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Score dots + labels */}
      {data.map((d, i) => {
        const x = paddingLeft + (i / (data.length - 1 || 1)) * chartW;
        const y = paddingTop + chartH - (d.avg_score / maxScore) * chartH;
        return (
          <g key={`dot-${i}`}>
            <circle cx={x} cy={y} r={4} fill={PRIMARY} stroke="white" strokeWidth={2} />
            {d.avg_score > 0 && (
              <text x={x} y={y - 10} textAnchor="middle" fontSize={10} fontWeight={600} fill={PRIMARY}>
                {d.avg_score}
              </text>
            )}
          </g>
        );
      })}

      {/* X-axis labels */}
      {data.map((d, i) => {
        const x = paddingLeft + (i / (data.length - 1 || 1)) * chartW;
        return (
          <text key={`label-${i}`} x={x} y={height - 8} textAnchor="middle" fontSize={10} fill="#6b7280">
            {d.month.split('/')[0]}/{d.month.split('/')[1]?.slice(2)}
          </text>
        );
      })}

      {/* Legend */}
      <rect x={paddingLeft} y={height - 22} width={10} height={10} fill={PRIMARY} opacity={0.2} rx={2} />
      <text x={paddingLeft + 14} y={height - 13} fontSize={9} fill="#6b7280">Hoàn thành</text>
      <line x1={paddingLeft + 70} y1={height - 17} x2={paddingLeft + 85} y2={height - 17} stroke={PRIMARY} strokeWidth={2} />
      <text x={paddingLeft + 89} y={height - 13} fontSize={9} fill="#6b7280">Điểm TB</text>
    </svg>
  );
}

function DepartmentBarChart({ data }: { data: DepartmentPerformance[] }) {
  if (!data || data.length === 0) {
    return <div style={{ color: '#9ca3af', fontSize: 14, padding: '24px 0', textAlign: 'center' }}>Chưa có dữ liệu</div>;
  }

  const maxScore = Math.max(...data.map(d => d.avg_score), 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {data.map(dept => (
        <div key={dept.department_id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 130, fontSize: 13, color: '#374151', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {dept.department_name}
          </span>
          <div style={{ flex: 1, height: 24, background: '#f3f4f6', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
            <div
              style={{
                width: `${(dept.avg_score / maxScore) * 100}%`,
                height: '100%',
                background: GRADE_COLORS[dept.grade] || PRIMARY,
                borderRadius: 6,
                transition: 'width 0.5s ease',
                minWidth: dept.avg_score > 0 ? 8 : 0,
              }}
            />
            <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, fontWeight: 600, color: '#374151' }}>
              {dept.avg_score} đ
            </span>
          </div>
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 22, borderRadius: 4, fontSize: 12, fontWeight: 700,
              color: GRADE_COLORS[dept.grade], background: GRADE_BG[dept.grade],
            }}
          >
            {dept.grade}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function PerformanceDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  // Period selector
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  // Department filter
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedDept, setSelectedDept] = useState<string>('');

  // Data
  const [kpis, setKpis] = useState<PerformanceKPIs | null>(null);
  const [rankings, setRankings] = useState<EmployeePerformance[]>([]);
  const [deptComparison, setDeptComparison] = useState<DepartmentPerformance[]>([]);
  const [trend, setTrend] = useState<MonthlyTrend[]>([]);
  const [loading, setLoading] = useState(true);

  // Permissions
  const isAdmin = user?.role === 'admin';
  const userLevel = user?.position_level || 7;
  const isExecutive = userLevel <= 3;
  const isManager = userLevel <= 4;

  // Redirect regular employees to their own profile
  useEffect(() => {
    if (!isAdmin && !isExecutive && !isManager && user?.employee_id) {
      navigate(`/performance/${user.employee_id}`, { replace: true });
    }
  }, [isAdmin, isExecutive, isManager, user?.employee_id, navigate]);

  // Load departments
  useEffect(() => {
    async function loadDepts() {
      const { data } = await supabase
        .from('departments')
        .select('id, name')
        .order('name');
      setDepartments(data || []);
    }
    loadDepts();
  }, []);

  // Filter department for managers
  const effectiveDeptFilter = useMemo(() => {
    if (isAdmin || isExecutive) return selectedDept || undefined;
    if (isManager && user?.department_id) return user.department_id;
    return undefined;
  }, [isAdmin, isExecutive, isManager, selectedDept, user?.department_id]);

  // Load data
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const period = { month: selectedMonth, year: selectedYear };

        const [kpiData, rankingData, deptData, trendData] = await Promise.all([
          performanceDashboardService.getKPIs(period),
          performanceDashboardService.getEmployeeRanking({
            department_id: effectiveDeptFilter,
            month: selectedMonth,
            year: selectedYear,
          }),
          performanceDashboardService.getDepartmentComparison(period),
          performanceDashboardService.getMonthlyTrend(6),
        ]);

        setKpis(kpiData);
        setRankings(rankingData);
        setDeptComparison(deptData);
        setTrend(trendData);
      } catch (err) {
        console.error('Error loading performance data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [selectedMonth, selectedYear, effectiveDeptFilter]);

  // Grade color for avg score
  const avgGradeColor = useMemo(() => {
    if (!kpis) return '#374151';
    if (kpis.avg_score >= 90) return GRADE_COLORS.A;
    if (kpis.avg_score >= 75) return GRADE_COLORS.B;
    if (kpis.avg_score >= 60) return GRADE_COLORS.C;
    if (kpis.avg_score >= 40) return GRADE_COLORS.D;
    return GRADE_COLORS.F;
  }, [kpis]);

  // Month options
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <div style={{
          width: 40, height: 40, border: '4px solid #e5e7eb',
          borderTopColor: PRIMARY, borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: PRIMARY, margin: 0 }}>
          Hiệu suất nhân viên
        </h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Department filter (admin/executive only) */}
          {(isAdmin || isExecutive) && (
            <select
              value={selectedDept}
              onChange={e => setSelectedDept(e.target.value)}
              style={{
                padding: '6px 12px', borderRadius: 8, border: '1px solid #d1d5db',
                fontSize: 13, background: 'white', cursor: 'pointer',
              }}
            >
              <option value="">Tất cả phòng ban</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(Number(e.target.value))}
            style={{
              padding: '6px 12px', borderRadius: 8, border: '1px solid #d1d5db',
              fontSize: 13, background: 'white', cursor: 'pointer',
            }}
          >
            {monthOptions.map(m => (
              <option key={m} value={m}>Tháng {m}</option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            style={{
              padding: '6px 12px', borderRadius: 8, border: '1px solid #d1d5db',
              fontSize: 13, background: 'white', cursor: 'pointer',
            }}
          >
            {yearOptions.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        {/* NV duoc danh gia */}
        <div style={cardStyle}>
          <div style={cardLabelStyle}>NV được đánh giá</div>
          <div style={{ ...cardValueStyle, color: PRIMARY }}>{kpis?.total_evaluated || 0}</div>
        </div>
        {/* Diem TB */}
        <div style={cardStyle}>
          <div style={cardLabelStyle}>Điểm trung bình</div>
          <div style={{ ...cardValueStyle, color: avgGradeColor }}>{kpis?.avg_score || 0}</div>
        </div>
        {/* Task hoan thanh */}
        <div style={cardStyle}>
          <div style={cardLabelStyle}>Task hoàn thành</div>
          <div style={{ ...cardValueStyle, color: '#2563eb' }}>{kpis?.total_completed || 0}</div>
        </div>
        {/* Dung han */}
        <div style={cardStyle}>
          <div style={cardLabelStyle}>Đúng hạn</div>
          <div style={{ ...cardValueStyle, color: '#16a34a' }}>{kpis?.on_time_rate || 0}%</div>
        </div>
        {/* Qua han */}
        <div style={cardStyle}>
          <div style={cardLabelStyle}>Quá hạn</div>
          <div style={{ ...cardValueStyle, color: (kpis?.overdue_count || 0) > 0 ? '#ef4444' : '#16a34a' }}>
            {kpis?.overdue_count || 0}
          </div>
        </div>
      </div>

      {/* Grade Distribution + Trend */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 24 }}>
        {/* Grade distribution */}
        <div style={sectionCardStyle}>
          <h3 style={sectionTitleStyle}>Phân bố xếp hạng</h3>
          {kpis && <GradeDistributionBar distribution={kpis.grade_distribution} />}
        </div>

        {/* Trend 6 months */}
        <div style={sectionCardStyle}>
          <h3 style={sectionTitleStyle}>Xu hướng 6 tháng</h3>
          <TrendChart data={trend} />
        </div>
      </div>

      {/* Employee Ranking Table */}
      <div style={{ ...sectionCardStyle, marginBottom: 24 }}>
        <h3 style={sectionTitleStyle}>Bảng xếp hạng nhân viên</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                <th style={thStyle}>#</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Nhân viên</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Phòng ban</th>
                <th style={thStyle}>Task</th>
                <th style={thStyle}>Hoàn thành</th>
                <th style={thStyle}>Đúng hạn</th>
                <th style={thStyle}>Điểm TB</th>
                <th style={thStyle}>Hạng</th>
              </tr>
            </thead>
            <tbody>
              {rankings.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: '32px 16px', textAlign: 'center', color: '#9ca3af' }}>
                    Chưa có dữ liệu cho kỳ này
                  </td>
                </tr>
              )}
              {rankings.map((emp, idx) => (
                <tr
                  key={emp.employee_id}
                  onClick={() => navigate(`/performance/${emp.employee_id}`)}
                  style={{
                    borderBottom: '1px solid #f3f4f6',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f0fdf4')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600, color: idx < 3 ? PRIMARY : '#6b7280' }}>
                    {idx + 1}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', background: PRIMARY,
                        color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 600, flexShrink: 0,
                        overflow: 'hidden',
                      }}>
                        {emp.avatar_url ? (
                          <img src={emp.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          emp.employee_name?.charAt(0)?.toUpperCase() || '?'
                        )}
                      </div>
                      <span style={{ fontWeight: 500 }}>{emp.employee_name}</span>
                    </div>
                  </td>
                  <td style={{ ...tdStyle, color: '#6b7280' }}>{emp.department_name}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{emp.total_tasks}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{emp.completed_tasks}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    {/* On-time progress bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                      <div style={{ width: 60, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{
                          width: `${emp.on_time_rate}%`, height: '100%',
                          background: emp.on_time_rate >= 80 ? '#16a34a' : emp.on_time_rate >= 50 ? '#f59e0b' : '#ef4444',
                          borderRadius: 3, transition: 'width 0.3s',
                        }} />
                      </div>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>{emp.on_time_rate}%</span>
                    </div>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600 }}>{emp.final_score}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 28, height: 24, borderRadius: 6, fontSize: 12, fontWeight: 700,
                      color: GRADE_COLORS[emp.grade], background: GRADE_BG[emp.grade],
                    }}>
                      {emp.grade}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Department Comparison */}
      {(isAdmin || isExecutive) && (
        <div style={sectionCardStyle}>
          <h3 style={sectionTitleStyle}>So sánh phòng ban</h3>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              {/* Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Phòng ban</th>
                    <th style={thStyle}>NV</th>
                    <th style={thStyle}>Điểm TB</th>
                    <th style={thStyle}>Task</th>
                    <th style={thStyle}>Hạng</th>
                  </tr>
                </thead>
                <tbody>
                  {deptComparison.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: '24px 16px', textAlign: 'center', color: '#9ca3af' }}>
                        Chưa có dữ liệu
                      </td>
                    </tr>
                  )}
                  {deptComparison.map(dept => (
                    <tr key={dept.department_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={tdStyle}>{dept.department_name}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>{dept.employee_count}</td>
                      <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600 }}>{dept.avg_score}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>{dept.total_tasks}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 28, height: 24, borderRadius: 6, fontSize: 12, fontWeight: 700,
                          color: GRADE_COLORS[dept.grade], background: GRADE_BG[dept.grade],
                        }}>
                          {dept.grade}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Bar Chart */}
              <DepartmentBarChart data={deptComparison} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const cardStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: 12,
  padding: '20px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  border: '1px solid #f3f4f6',
  textAlign: 'center',
};

const cardLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#6b7280',
  marginBottom: 8,
  fontWeight: 500,
};

const cardValueStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  lineHeight: 1.2,
};

const sectionCardStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: 12,
  padding: '20px 24px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  border: '1px solid #f3f4f6',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: '#1f2937',
  marginBottom: 16,
  margin: '0 0 16px 0',
};

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'center',
  fontWeight: 600,
  color: '#374151',
  fontSize: 12,
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  color: '#1f2937',
  whiteSpace: 'nowrap',
};
