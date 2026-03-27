// ============================================================================
// EMPLOYEE PERFORMANCE DETAIL PAGE
// File: src/pages/performance/EmployeePerformancePage.tsx
// Huy Anh ERP System
// ============================================================================

import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  performanceDashboardService,
  EmployeeDetail,
} from '../../services/performanceService';

// ============================================================================
// CONSTANTS
// ============================================================================

const GRADE_COLORS: Record<string, string> = {
  A: '#16a34a', B: '#2563eb', C: '#f59e0b', D: '#ef4444', F: '#7f1d1d',
};

const GRADE_BG: Record<string, string> = {
  A: '#dcfce7', B: '#dbeafe', C: '#fef3c7', D: '#fee2e2', F: '#fecaca',
};

const PRIMARY = '#1B4D3E';

// ============================================================================
// SVG TREND CHART
// ============================================================================

function ScoreTrendChart({ data }: { data: Array<{ month: string; score: number }> }) {
  if (!data || data.length === 0) {
    return <div style={{ color: '#9ca3af', fontSize: 14, padding: '40px 0', textAlign: 'center' }}>Chưa có dữ liệu</div>;
  }

  const width = 500;
  const height = 200;
  const pL = 40, pR = 20, pT = 20, pB = 36;
  const cW = width - pL - pR;
  const cH = height - pT - pB;
  const maxScore = 100;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      {/* Grid */}
      {[0, 25, 50, 75, 100].map(v => {
        const y = pT + cH - (v / maxScore) * cH;
        return (
          <g key={v}>
            <line x1={pL} y1={y} x2={width - pR} y2={y} stroke="#e5e7eb" strokeWidth={1} />
            <text x={pL - 6} y={y + 4} textAnchor="end" fontSize={10} fill="#9ca3af">{v}</text>
          </g>
        );
      })}

      {/* Area fill */}
      {data.length > 1 && (
        <polygon
          points={[
            ...data.map((d, i) => {
              const x = pL + (i / (data.length - 1)) * cW;
              const y = pT + cH - (d.score / maxScore) * cH;
              return `${x},${y}`;
            }),
            `${pL + cW},${pT + cH}`,
            `${pL},${pT + cH}`,
          ].join(' ')}
          fill={PRIMARY}
          opacity={0.08}
        />
      )}

      {/* Line */}
      {data.length > 1 && (
        <polyline
          points={data.map((d, i) => {
            const x = pL + (i / (data.length - 1)) * cW;
            const y = pT + cH - (d.score / maxScore) * cH;
            return `${x},${y}`;
          }).join(' ')}
          fill="none"
          stroke={PRIMARY}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Dots + labels */}
      {data.map((d, i) => {
        const x = pL + (i / (data.length - 1 || 1)) * cW;
        const y = pT + cH - (d.score / maxScore) * cH;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={5} fill="white" stroke={PRIMARY} strokeWidth={2.5} />
            {d.score > 0 && (
              <text x={x} y={y - 12} textAnchor="middle" fontSize={11} fontWeight={600} fill={PRIMARY}>
                {d.score}
              </text>
            )}
            <text x={x} y={height - 8} textAnchor="middle" fontSize={10} fill="#6b7280">
              {d.month.split('/')[0]}/{d.month.split('/')[1]?.slice(2)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function EmployeePerformancePage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const navigate = useNavigate();

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [detail, setDetail] = useState<EmployeeDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!employeeId) return;
      setLoading(true);
      try {
        const data = await performanceDashboardService.getEmployeeDetail(
          employeeId,
          { month: selectedMonth, year: selectedYear }
        );
        setDetail(data);
      } catch (err) {
        console.error('Error loading employee detail:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [employeeId, selectedMonth, selectedYear]);

  const perf = detail?.performance;

  const gradeColor = useMemo(() => {
    if (!perf) return '#374151';
    return GRADE_COLORS[perf.grade] || '#374151';
  }, [perf]);

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

  if (!detail || !perf) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <p style={{ color: '#9ca3af', fontSize: 16 }}>Không tìm thấy dữ liệu nhân viên</p>
        <button
          onClick={() => navigate('/performance')}
          style={{
            marginTop: 16, padding: '8px 20px', background: PRIMARY, color: 'white',
            border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14,
          }}
        >
          Quay lại
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: 1000, margin: '0 auto' }}>
      {/* Back button */}
      <button
        onClick={() => navigate('/performance')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 14px', background: 'white', border: '1px solid #d1d5db',
          borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#374151',
          marginBottom: 20,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
        </svg>
        Quay lại
      </button>

      {/* Header */}
      <div style={{
        background: 'white', borderRadius: 12, padding: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #f3f4f6',
        marginBottom: 24,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Avatar */}
          <div style={{
            width: 56, height: 56, borderRadius: '50%', background: PRIMARY,
            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 700, overflow: 'hidden', flexShrink: 0,
          }}>
            {perf.avatar_url ? (
              <img src={perf.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              perf.employee_name?.charAt(0)?.toUpperCase() || '?'
            )}
          </div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1f2937', margin: 0 }}>
              {perf.employee_name}
            </h2>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
              {perf.department_name}
            </div>
          </div>
          {/* Grade badge */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 40, height: 36, borderRadius: 8, fontSize: 18, fontWeight: 800,
            color: gradeColor, background: GRADE_BG[perf.grade],
            marginLeft: 8,
          }}>
            {perf.grade}
          </span>
        </div>
        {/* Period selector */}
        <div style={{ display: 'flex', gap: 8 }}>
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

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={kpiCardStyle}>
          <div style={kpiLabelStyle}>Điểm TB</div>
          <div style={{ ...kpiValueStyle, color: gradeColor }}>{perf.final_score}</div>
          <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
            Tự: {perf.avg_self_score} | QL: {perf.avg_manager_score}
          </div>
        </div>
        <div style={kpiCardStyle}>
          <div style={kpiLabelStyle}>Task</div>
          <div style={{ ...kpiValueStyle, color: '#2563eb' }}>{perf.total_tasks}</div>
        </div>
        <div style={kpiCardStyle}>
          <div style={kpiLabelStyle}>Đúng hạn</div>
          <div style={{ ...kpiValueStyle, color: '#16a34a' }}>{perf.on_time_rate}%</div>
          <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
            {perf.on_time_count}/{perf.completed_tasks}
          </div>
        </div>
        <div style={kpiCardStyle}>
          <div style={kpiLabelStyle}>Hạng</div>
          <div style={{ ...kpiValueStyle, color: gradeColor }}>{perf.grade}</div>
        </div>
      </div>

      {/* Score trend */}
      <div style={{ ...sectionStyle, marginBottom: 24 }}>
        <h3 style={sectionTitleStyle}>Xu hướng điểm 6 tháng</h3>
        <ScoreTrendChart data={detail.trend} />
      </div>

      {/* Task history */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Lịch sử công việc</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                <th style={thStyle}>Mã</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Tên công việc</th>
                <th style={thStyle}>Điểm</th>
                <th style={thStyle}>Ngày hoàn thành</th>
                <th style={thStyle}>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {detail.tasks.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '24px 16px', textAlign: 'center', color: '#9ca3af' }}>
                    Chưa có dữ liệu
                  </td>
                </tr>
              )}
              {detail.tasks.map((task, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ ...tdStyle, textAlign: 'center', fontFamily: 'monospace', color: '#6b7280' }}>
                    {task.code}
                  </td>
                  <td style={tdStyle}>{task.name}</td>
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600 }}>{task.score}</td>
                  <td style={{ ...tdStyle, textAlign: 'center', color: '#6b7280' }}>
                    {task.completed_date
                      ? new Date(task.completed_date).toLocaleDateString('vi-VN')
                      : '-'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 10px', borderRadius: 12,
                      fontSize: 11, fontWeight: 600,
                      color: task.on_time ? '#16a34a' : '#ef4444',
                      background: task.on_time ? '#dcfce7' : '#fee2e2',
                    }}>
                      {task.on_time ? 'Đúng hạn' : 'Trễ hạn'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const kpiCardStyle: React.CSSProperties = {
  background: 'white', borderRadius: 12, padding: '18px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #f3f4f6',
  textAlign: 'center',
};

const kpiLabelStyle: React.CSSProperties = {
  fontSize: 12, color: '#6b7280', marginBottom: 6, fontWeight: 500,
};

const kpiValueStyle: React.CSSProperties = {
  fontSize: 26, fontWeight: 700, lineHeight: 1.2,
};

const sectionStyle: React.CSSProperties = {
  background: 'white', borderRadius: 12, padding: '20px 24px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #f3f4f6',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 15, fontWeight: 600, color: '#1f2937', margin: '0 0 16px 0',
};

const thStyle: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'center', fontWeight: 600,
  color: '#374151', fontSize: 12, whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px', color: '#1f2937', whiteSpace: 'nowrap',
};
