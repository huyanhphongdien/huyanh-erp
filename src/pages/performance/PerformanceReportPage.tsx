// ============================================================================
// PERFORMANCE REPORT PAGE
// File: src/pages/performance/PerformanceReportPage.tsx
// Báo cáo hiệu suất — Cá nhân / Phòng ban / Tổng hợp
// Export: PDF (window.print) + Excel (CSV download)
// ============================================================================

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import {
  performanceDashboardService,
  EmployeePerformance,
  DepartmentPerformance,
  calculateDashboardGrade,
} from '../../services/performanceService'

const PRIMARY = '#1B4D3E'

const GRADE_COLORS: Record<string, string> = {
  A: '#16a34a', B: '#2563eb', C: '#f59e0b', D: '#ef4444', F: '#7f1d1d',
}
const GRADE_BG: Record<string, string> = {
  A: '#dcfce7', B: '#dbeafe', C: '#fef3c7', D: '#fee2e2', F: '#fecaca',
}

// ============================================================================
// CSV EXPORT UTILITY
// ============================================================================

const exportToCSV = (data: Record<string, any>[], filename: string) => {
  if (!data || data.length === 0) return
  const headers = Object.keys(data[0]).join(',')
  const rows = data.map(row => Object.values(row).map(v => `"${v}"`).join(','))
  const csv = [headers, ...rows].join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${filename}.csv`
  link.click()
}

// ============================================================================
// TYPES
// ============================================================================

type ReportType = 'individual' | 'department' | 'company'
type PeriodType = 'month' | 'quarter' | 'year'

interface EmployeeOption {
  id: string
  full_name: string
  department_name: string
}

interface IndividualReport {
  employee: EmployeeOption
  performance: EmployeePerformance
  tasks: Array<{
    code: string
    name: string
    score: number
    completed_date: string
    on_time: boolean
  }>
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function PerformanceReportPage() {
  const now = new Date()

  // Period
  const [periodType, setPeriodType] = useState<PeriodType>('month')
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedQuarter, setSelectedQuarter] = useState(Math.ceil((now.getMonth() + 1) / 3))
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())

  // Report type
  const [reportType, setReportType] = useState<ReportType>('individual')

  // Data
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([])
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [selectedDept, setSelectedDept] = useState('')

  // Results
  const [individualReport, setIndividualReport] = useState<IndividualReport | null>(null)
  const [deptReport, setDeptReport] = useState<EmployeePerformance[]>([])
  const [companyRankings, setCompanyRankings] = useState<EmployeePerformance[]>([])
  const [deptComparison, setDeptComparison] = useState<DepartmentPerformance[]>([])
  const [loading, setLoading] = useState(false)

  // Computed period params
  const periodParams = useMemo(() => {
    if (periodType === 'month') {
      return { month: selectedMonth, year: selectedYear }
    }
    if (periodType === 'quarter') {
      // Use the last month of the quarter
      return { month: selectedQuarter * 3, year: selectedYear }
    }
    // year — use December
    return { month: 12, year: selectedYear }
  }, [periodType, selectedMonth, selectedQuarter, selectedYear])

  const periodLabel = useMemo(() => {
    if (periodType === 'month') return `Tháng ${selectedMonth}/${selectedYear}`
    if (periodType === 'quarter') return `Quý ${selectedQuarter}/${selectedYear}`
    return `Năm ${selectedYear}`
  }, [periodType, selectedMonth, selectedQuarter, selectedYear])

  // Load employees & departments
  useEffect(() => {
    async function load() {
      const [{ data: emps }, { data: depts }] = await Promise.all([
        supabase
          .from('employees')
          .select('id, full_name, department:departments!employees_department_id_fkey(name)')
          .eq('status', 'active')
          .order('full_name'),
        supabase.from('departments').select('id, name').order('name'),
      ])
      setEmployees(
        (emps || []).map((e: any) => ({
          id: e.id,
          full_name: e.full_name,
          department_name: (Array.isArray(e.department) ? e.department[0]?.name : e.department?.name) || '',
        }))
      )
      setDepartments(depts || [])
    }
    load()
  }, [])

  // Load individual report
  useEffect(() => {
    if (reportType !== 'individual' || !selectedEmployee) {
      setIndividualReport(null)
      return
    }
    async function load() {
      setLoading(true)
      try {
        const detail = await performanceDashboardService.getEmployeeDetail(selectedEmployee, periodParams)
        if (detail) {
          const emp = employees.find(e => e.id === selectedEmployee)
          setIndividualReport({
            employee: emp || { id: selectedEmployee, full_name: '', department_name: '' },
            performance: detail.performance,
            tasks: detail.tasks,
          })
        } else {
          setIndividualReport(null)
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [reportType, selectedEmployee, periodParams, employees])

  // Load department report
  useEffect(() => {
    if (reportType !== 'department') {
      setDeptReport([])
      return
    }
    async function load() {
      setLoading(true)
      try {
        const data = await performanceDashboardService.getEmployeeRanking({
          department_id: selectedDept || undefined,
          month: periodParams.month,
          year: periodParams.year,
          limit: 500,
        })
        setDeptReport(data)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [reportType, selectedDept, periodParams])

  // Load company report
  useEffect(() => {
    if (reportType !== 'company') {
      setCompanyRankings([])
      setDeptComparison([])
      return
    }
    async function load() {
      setLoading(true)
      try {
        const [rankings, depts] = await Promise.all([
          performanceDashboardService.getEmployeeRanking({
            month: periodParams.month,
            year: periodParams.year,
            limit: 500,
          }),
          performanceDashboardService.getDepartmentComparison(periodParams),
        ])
        setCompanyRankings(rankings)
        setDeptComparison(depts)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [reportType, periodParams])

  // Grade distribution for company report
  const gradeDistribution = useMemo(() => {
    const dist = { A: 0, B: 0, C: 0, D: 0, F: 0 }
    companyRankings.forEach(emp => {
      const g = calculateDashboardGrade(emp.final_score)
      dist[g]++
    })
    return dist
  }, [companyRankings])

  const top10 = useMemo(() => companyRankings.slice(0, 10), [companyRankings])

  // Export individual PDF
  const handlePrintPDF = () => {
    window.print()
  }

  // Export individual CSV
  const handleExportIndividualCSV = () => {
    if (!individualReport) return
    const p = individualReport.performance
    const data = individualReport.tasks.map(t => ({
      'Mã CV': t.code,
      'Tên CV': t.name,
      'Điểm': t.score,
      'Ngày hoàn thành': t.completed_date ? new Date(t.completed_date).toLocaleDateString('vi-VN') : '',
      'Đúng hạn': t.on_time ? 'Có' : 'Không',
    }))
    exportToCSV(data, `hieu-suat-${p.employee_name}-${periodLabel}`)
  }

  // Export department CSV
  const handleExportDeptCSV = () => {
    const data = deptReport.map(emp => ({
      'Nhân viên': emp.employee_name,
      'Phòng ban': emp.department_name,
      'Điểm TB': emp.final_score,
      'Task hoàn thành': emp.completed_tasks,
      'Đúng hạn (%)': emp.on_time_rate,
      'Hạng': emp.grade,
    }))
    exportToCSV(data, `bao-cao-phong-ban-${periodLabel}`)
  }

  // Export company CSV
  const handleExportCompanyCSV = () => {
    const data = companyRankings.map(emp => ({
      'Nhân viên': emp.employee_name,
      'Phòng ban': emp.department_name,
      'Điểm TB': emp.final_score,
      'Task hoàn thành': emp.completed_tasks,
      'Đúng hạn (%)': emp.on_time_rate,
      'Hạng': emp.grade,
    }))
    exportToCSV(data, `bao-cao-tong-hop-${periodLabel}`)
  }

  // Dept summary row
  const deptSummary = useMemo(() => {
    if (deptReport.length === 0) return null
    const totalTasks = deptReport.reduce((s, e) => s + e.completed_tasks, 0)
    const avgScore = Math.round(deptReport.reduce((s, e) => s + e.final_score, 0) / deptReport.length)
    const avgOnTime = Math.round(deptReport.reduce((s, e) => s + e.on_time_rate, 0) / deptReport.length)
    return { totalTasks, avgScore, avgOnTime, grade: calculateDashboardGrade(avgScore) }
  }, [deptReport])

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }} className="print-report">
      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-report, .print-report * { visibility: visible; }
          .print-report { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }} className="no-print">
        <h1 style={{ fontSize: 24, fontWeight: 700, color: PRIMARY, margin: 0 }}>
          Báo cáo hiệu suất
        </h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Period type */}
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #d1d5db' }}>
            {(['month', 'quarter', 'year'] as PeriodType[]).map(pt => (
              <button
                key={pt}
                onClick={() => setPeriodType(pt)}
                style={{
                  padding: '6px 14px', fontSize: 13, border: 'none', cursor: 'pointer',
                  background: periodType === pt ? PRIMARY : 'white',
                  color: periodType === pt ? 'white' : '#374151',
                  fontWeight: periodType === pt ? 600 : 400,
                }}
              >
                {pt === 'month' ? 'Tháng' : pt === 'quarter' ? 'Quý' : 'Năm'}
              </button>
            ))}
          </div>
          {periodType === 'month' && (
            <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} style={selectStyle}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
          )}
          {periodType === 'quarter' && (
            <select value={selectedQuarter} onChange={e => setSelectedQuarter(Number(e.target.value))} style={selectStyle}>
              {[1, 2, 3, 4].map(q => (
                <option key={q} value={q}>Quý {q}</option>
              ))}
            </select>
          )}
          <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} style={selectStyle}>
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Report type selector */}
      <div style={{ marginBottom: 24, display: 'flex', gap: 8 }} className="no-print">
        {([
          { value: 'individual', label: 'Cá nhân' },
          { value: 'department', label: 'Phòng ban' },
          { value: 'company', label: 'Tổng hợp' },
        ] as { value: ReportType; label: string }[]).map(opt => (
          <button
            key={opt.value}
            onClick={() => setReportType(opt.value)}
            style={{
              padding: '8px 20px', borderRadius: 8, fontSize: 14, fontWeight: 500,
              border: reportType === opt.value ? `2px solid ${PRIMARY}` : '1px solid #d1d5db',
              background: reportType === opt.value ? '#f0fdf4' : 'white',
              color: reportType === opt.value ? PRIMARY : '#374151',
              cursor: 'pointer',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ============================================================ */}
      {/* INDIVIDUAL REPORT */}
      {/* ============================================================ */}
      {reportType === 'individual' && (
        <div>
          <div style={{ marginBottom: 16 }} className="no-print">
            <select
              value={selectedEmployee}
              onChange={e => setSelectedEmployee(e.target.value)}
              style={{ ...selectStyle, minWidth: 300 }}
            >
              <option value="">-- Chọn nhân viên --</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.full_name} — {emp.department_name}</option>
              ))}
            </select>
          </div>

          {loading && <LoadingIndicator />}

          {individualReport && !loading && (
            <>
              {/* Preview card */}
              <div style={{ ...cardStyle, marginBottom: 20 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: PRIMARY, marginTop: 0, marginBottom: 16 }}>
                  Báo cáo hiệu suất cá nhân — {periodLabel}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
                  <InfoItem label="Nhân viên" value={individualReport.performance.employee_name} />
                  <InfoItem label="Phòng ban" value={individualReport.performance.department_name} />
                  <InfoItem label="Kỳ đánh giá" value={periodLabel} />
                  <InfoItem label="Điểm tổng" value={String(individualReport.performance.final_score)} color={GRADE_COLORS[individualReport.performance.grade]} />
                  <InfoItem label="Xếp hạng" value={individualReport.performance.grade} color={GRADE_COLORS[individualReport.performance.grade]} />
                  <InfoItem label="Task hoàn thành" value={`${individualReport.performance.completed_tasks}/${individualReport.performance.total_tasks}`} />
                  <InfoItem label="Đúng hạn" value={`${individualReport.performance.on_time_rate}%`} color={individualReport.performance.on_time_rate >= 80 ? '#16a34a' : '#f59e0b'} />
                </div>
              </div>

              {/* Task list */}
              <div style={{ ...cardStyle, marginBottom: 20 }}>
                <h3 style={sectionTitleStyle}>Danh sách công việc</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr style={theadRowStyle}>
                        <th style={thStyle}>#</th>
                        <th style={{ ...thStyle, textAlign: 'left' }}>Mã CV</th>
                        <th style={{ ...thStyle, textAlign: 'left' }}>Tên công việc</th>
                        <th style={thStyle}>Điểm</th>
                        <th style={thStyle}>Hoàn thành</th>
                        <th style={thStyle}>Đúng hạn</th>
                      </tr>
                    </thead>
                    <tbody>
                      {individualReport.tasks.length === 0 && (
                        <tr><td colSpan={6} style={emptyStyle}>Chưa có dữ liệu</td></tr>
                      )}
                      {individualReport.tasks.map((t, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>{i + 1}</td>
                          <td style={tdStyle}>{t.code}</td>
                          <td style={tdStyle}>{t.name}</td>
                          <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600 }}>{t.score}</td>
                          <td style={{ ...tdStyle, textAlign: 'center', fontSize: 12 }}>
                            {t.completed_date ? new Date(t.completed_date).toLocaleDateString('vi-VN') : '—'}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                              background: t.on_time ? '#dcfce7' : '#fee2e2',
                              color: t.on_time ? '#16a34a' : '#ef4444',
                            }}>
                              {t.on_time ? 'Đúng hạn' : 'Trễ hạn'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Export buttons */}
              <div style={{ display: 'flex', gap: 12 }} className="no-print">
                <button onClick={handlePrintPDF} style={btnPrimary}>Xuất PDF</button>
                <button onClick={handleExportIndividualCSV} style={btnSecondary}>Xuất Excel</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* DEPARTMENT REPORT */}
      {/* ============================================================ */}
      {reportType === 'department' && (
        <div>
          <div style={{ marginBottom: 16 }} className="no-print">
            <select
              value={selectedDept}
              onChange={e => setSelectedDept(e.target.value)}
              style={{ ...selectStyle, minWidth: 250 }}
            >
              <option value="">Tất cả phòng ban</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {loading && <LoadingIndicator />}

          {!loading && (
            <div style={{ ...cardStyle, marginBottom: 20 }}>
              <h3 style={sectionTitleStyle}>
                Báo cáo phòng ban — {periodLabel}
                {selectedDept && departments.find(d => d.id === selectedDept)
                  ? ` — ${departments.find(d => d.id === selectedDept)!.name}`
                  : ' — Tất cả'}
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr style={theadRowStyle}>
                      <th style={thStyle}>#</th>
                      <th style={{ ...thStyle, textAlign: 'left' }}>Nhân viên</th>
                      <th style={{ ...thStyle, textAlign: 'left' }}>Phòng ban</th>
                      <th style={thStyle}>Điểm TB</th>
                      <th style={thStyle}>Task</th>
                      <th style={thStyle}>Đúng hạn</th>
                      <th style={thStyle}>Hạng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deptReport.length === 0 && (
                      <tr><td colSpan={7} style={emptyStyle}>Chưa có dữ liệu cho kỳ này</td></tr>
                    )}
                    {deptReport.map((emp, i) => (
                      <tr key={emp.employee_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>{i + 1}</td>
                        <td style={tdStyle}>{emp.employee_name}</td>
                        <td style={{ ...tdStyle, color: '#6b7280' }}>{emp.department_name}</td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600 }}>{emp.final_score}</td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>{emp.completed_tasks}</td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>{emp.on_time_rate}%</td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <GradeBadge grade={emp.grade} />
                        </td>
                      </tr>
                    ))}
                    {/* Summary row */}
                    {deptSummary && (
                      <tr style={{ borderTop: '2px solid #e5e7eb', background: '#f9fafb' }}>
                        <td colSpan={3} style={{ ...tdStyle, fontWeight: 700, color: PRIMARY }}>Tổng kết</td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: PRIMARY }}>{deptSummary.avgScore}</td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700 }}>{deptSummary.totalTasks}</td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700 }}>{deptSummary.avgOnTime}%</td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <GradeBadge grade={deptSummary.grade} />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 16 }} className="no-print">
                <button onClick={handleExportDeptCSV} style={btnSecondary}>Xuất Excel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* COMPANY REPORT */}
      {/* ============================================================ */}
      {reportType === 'company' && (
        <div>
          {loading && <LoadingIndicator />}

          {!loading && (
            <>
              {/* Department summary */}
              <div style={{ ...cardStyle, marginBottom: 20 }}>
                <h3 style={sectionTitleStyle}>Tổng hợp theo phòng ban — {periodLabel}</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr style={theadRowStyle}>
                        <th style={{ ...thStyle, textAlign: 'left' }}>Phòng ban</th>
                        <th style={thStyle}>Số NV</th>
                        <th style={thStyle}>Điểm TB</th>
                        <th style={thStyle}>Tổng Task</th>
                        <th style={thStyle}>Đúng hạn</th>
                        <th style={thStyle}>Hạng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deptComparison.length === 0 && (
                        <tr><td colSpan={6} style={emptyStyle}>Chưa có dữ liệu</td></tr>
                      )}
                      {deptComparison.map(dept => (
                        <tr key={dept.department_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={tdStyle}>{dept.department_name}</td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>{dept.employee_count}</td>
                          <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600 }}>{dept.avg_score}</td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>{dept.total_tasks}</td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>{dept.on_time_rate}%</td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            <GradeBadge grade={dept.grade} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Top 10 + Grade distribution side by side */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginBottom: 20 }}>
                {/* Top 10 employees */}
                <div style={cardStyle}>
                  <h3 style={sectionTitleStyle}>Top 10 nhân viên</h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={tableStyle}>
                      <thead>
                        <tr style={theadRowStyle}>
                          <th style={thStyle}>#</th>
                          <th style={{ ...thStyle, textAlign: 'left' }}>Nhân viên</th>
                          <th style={thStyle}>Điểm</th>
                          <th style={thStyle}>Hạng</th>
                        </tr>
                      </thead>
                      <tbody>
                        {top10.map((emp, i) => (
                          <tr key={emp.employee_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600, color: i < 3 ? PRIMARY : '#6b7280' }}>{i + 1}</td>
                            <td style={tdStyle}>
                              <div>{emp.employee_name}</div>
                              <div style={{ fontSize: 11, color: '#9ca3af' }}>{emp.department_name}</div>
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600 }}>{emp.final_score}</td>
                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                              <GradeBadge grade={emp.grade} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Grade distribution */}
                <div style={cardStyle}>
                  <h3 style={sectionTitleStyle}>Phân bố xếp hạng</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '8px 0' }}>
                    {([
                      { key: 'A', label: 'Hạng A (90+)', color: '#16a34a' },
                      { key: 'B', label: 'Hạng B (75-89)', color: '#2563eb' },
                      { key: 'C', label: 'Hạng C (60-74)', color: '#f59e0b' },
                      { key: 'D', label: 'Hạng D (40-59)', color: '#ef4444' },
                      { key: 'F', label: 'Hạng F (<40)', color: '#7f1d1d' },
                    ] as const).map(g => {
                      const count = gradeDistribution[g.key]
                      const total = companyRankings.length || 1
                      return (
                        <div key={g.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ width: 110, fontSize: 13, color: '#374151', flexShrink: 0 }}>{g.label}</span>
                          <div style={{ flex: 1, height: 24, background: '#f3f4f6', borderRadius: 6, overflow: 'hidden' }}>
                            <div style={{
                              width: `${(count / total) * 100}%`,
                              height: '100%', background: g.color, borderRadius: 6,
                              transition: 'width 0.5s ease', minWidth: count > 0 ? 8 : 0,
                            }} />
                          </div>
                          <span style={{ width: 48, fontSize: 13, fontWeight: 600, color: g.color, textAlign: 'right' }}>
                            {count} NV
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="no-print">
                <button onClick={handleExportCompanyCSV} style={btnSecondary}>Xuất Excel</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function GradeBadge({ grade }: { grade: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 28, height: 24, borderRadius: 6, fontSize: 12, fontWeight: 700,
      color: GRADE_COLORS[grade] || '#374151',
      background: GRADE_BG[grade] || '#f3f4f6',
    }}>
      {grade}
    </span>
  )
}

function InfoItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || '#1f2937' }}>{value}</div>
    </div>
  )
}

function LoadingIndicator() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <div style={{
        width: 36, height: 36, border: '4px solid #e5e7eb',
        borderTopColor: PRIMARY, borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ============================================================================
// STYLES
// ============================================================================

const selectStyle: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 8, border: '1px solid #d1d5db',
  fontSize: 13, background: 'white', cursor: 'pointer',
}

const cardStyle: React.CSSProperties = {
  background: 'white', borderRadius: 12, padding: '20px 24px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #f3f4f6',
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 15, fontWeight: 600, color: '#1f2937', margin: '0 0 16px 0',
}

const tableStyle: React.CSSProperties = {
  width: '100%', borderCollapse: 'collapse', fontSize: 13,
}

const theadRowStyle: React.CSSProperties = {
  background: '#f9fafb', borderBottom: '2px solid #e5e7eb',
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'center', fontWeight: 600,
  color: '#374151', fontSize: 12, whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px', color: '#1f2937', whiteSpace: 'nowrap',
}

const emptyStyle: React.CSSProperties = {
  padding: '32px 16px', textAlign: 'center', color: '#9ca3af',
}

const btnPrimary: React.CSSProperties = {
  padding: '8px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600,
  background: PRIMARY, color: 'white', border: 'none', cursor: 'pointer',
}

const btnSecondary: React.CSSProperties = {
  padding: '8px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600,
  background: 'white', color: PRIMARY, border: `1px solid ${PRIMARY}`, cursor: 'pointer',
}
