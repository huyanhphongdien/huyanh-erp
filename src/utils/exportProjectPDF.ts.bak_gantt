// ============================================================================
// FILE: src/utils/exportProjectPDF.ts
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PHASE: PM9 — Bước 9.7: Export PDF — Status Report A4 1 page
// ============================================================================
// Layout:
//   Header: Logo + Tên DA + Kỳ báo cáo | RAG indicator (lớn, góc phải)
//   Section 1: Thông tin chung (PM, Timeline, Budget)
//   Section 2: Tiến độ Phases (mini progress bars)
//   Section 3: Milestones (table: tên, due, status)
//   Section 4: Top 3 Risks (score, owner)
//   Section 5: Open Issues count by severity
//   Footer: Ngày xuất, Người lập
// Method: Generate HTML → open print window (no external PDF lib needed)
// ============================================================================

// ============================================================================
// TYPES (mirrors ProjectReportPage data)
// ============================================================================

export interface PDFReportData {
  project: {
    code: string
    name: string
    description?: string
    status: string
    progress_pct: number
    planned_start?: string
    planned_end?: string
    actual_start?: string
    budget_planned: number
    budget_actual: number
    owner_name?: string
    department_name?: string
    category_name?: string
  }
  health: 'green' | 'amber' | 'red'
  health_label: string
  planned_progress: number
  period_label: string
  phases: Array<{
    name: string
    status: string
    progress_pct: number
    planned_start?: string
    planned_end?: string
    color?: string
  }>
  milestones: Array<{
    name: string
    due_date?: string
    completed_date?: string
    status: string
    phase_name?: string
  }>
  risks: Array<{
    code: string
    title: string
    score: number
    owner_name?: string
  }>
  issues_by_severity: {
    critical: number
    high: number
    medium: number
    low: number
  }
  task_stats: {
    total: number
    completed: number
    in_progress: number
    overdue: number
  }
  exported_by: string
}

// ============================================================================
// HELPERS
// ============================================================================

const HEALTH_COLORS = {
  green: { bg: '#16A34A', light: '#F0FDF4', label: 'ON TRACK' },
  amber: { bg: '#EA580C', light: '#FFF7ED', label: 'AT RISK' },
  red:   { bg: '#DC2626', light: '#FEF2F2', label: 'BEHIND' },
}

const STATUS_VI: Record<string, string> = {
  draft: 'Nháp', planning: 'Lên KH', approved: 'Đã duyệt',
  in_progress: 'Đang chạy', on_hold: 'Tạm dừng', completed: 'Xong', cancelled: 'Hủy',
  pending: 'Chờ', approaching: 'Sắp tới', overdue: 'Trễ',
}

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtCurrency(n: number): string {
  if (!n) return '0'
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} tỷ`
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} tr`
  return n.toLocaleString('vi-VN')
}

function progressBar(pct: number, color: string, height = 8): string {
  return `
    <div style="height:${height}px;background:#e5e7eb;border-radius:${height}px;overflow:hidden;width:100%">
      <div style="height:100%;width:${Math.min(100, pct)}%;background:${color};border-radius:${height}px"></div>
    </div>`
}

// ============================================================================
// MAIN EXPORT FUNCTION
// ============================================================================

export function exportStatusReportPDF(data: PDFReportData): void {
  const hc = HEALTH_COLORS[data.health]
  const budgetPct = data.project.budget_planned > 0
    ? Math.round((data.project.budget_actual / data.project.budget_planned) * 100)
    : 0
  const budgetOver = data.project.budget_actual > data.project.budget_planned

  const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>Status Report — ${data.project.code}</title>
<style>
  @page { size: A4; margin: 15mm 18mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; font-size: 10px; color: #1a1a1a; line-height: 1.4; }

  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 10px; border-bottom: 3px solid #1B4D3E; margin-bottom: 12px; }
  .header-left h1 { font-size: 16px; color: #1B4D3E; margin-bottom: 2px; }
  .header-left .code { font-size: 11px; color: #6B7280; font-family: 'JetBrains Mono', monospace; }
  .header-left .period { font-size: 10px; color: #9CA3AF; margin-top: 4px; }
  .rag { width: 90px; height: 90px; border-radius: 50%; background: ${hc.bg}; display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; }
  .rag-pct { font-size: 22px; font-weight: 800; font-family: 'JetBrains Mono', monospace; }
  .rag-label { font-size: 8px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-top: 1px; }

  .section { margin-bottom: 10px; }
  .section-title { font-size: 11px; font-weight: 700; color: #1B4D3E; border-bottom: 1.5px solid #1B4D3E; padding-bottom: 3px; margin-bottom: 6px; }

  .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
  .info-item { background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 6px 8px; }
  .info-label { font-size: 8px; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.5px; }
  .info-value { font-size: 11px; font-weight: 600; color: #374151; margin-top: 1px; }

  .progress-row { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
  .progress-name { width: 140px; font-size: 10px; font-weight: 500; color: #374151; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .progress-bar-wrap { flex: 1; }
  .progress-pct { width: 36px; text-align: right; font-size: 10px; font-weight: 700; font-family: 'JetBrains Mono', monospace; color: #374151; }
  .progress-status { width: 50px; text-align: center; font-size: 8px; color: #6B7280; }

  table { width: 100%; border-collapse: collapse; font-size: 9px; }
  th { background: #F3F4F6; font-weight: 600; padding: 4px 6px; text-align: left; border: 1px solid #E5E7EB; }
  td { padding: 4px 6px; border: 1px solid #E5E7EB; }
  .overdue { color: #DC2626; font-weight: 600; }
  .completed { color: #16A34A; }

  .risk-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
  .risk-score { width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: white; font-size: 11px; font-weight: 800; }
  .risk-info { flex: 1; }
  .risk-title { font-size: 10px; font-weight: 500; }
  .risk-owner { font-size: 8px; color: #9CA3AF; }

  .issue-grid { display: flex; gap: 6px; }
  .issue-box { flex: 1; border-radius: 6px; padding: 8px; text-align: center; }
  .issue-count { font-size: 18px; font-weight: 800; font-family: 'JetBrains Mono', monospace; }
  .issue-label { font-size: 8px; margin-top: 2px; }

  .footer { margin-top: 10px; padding-top: 8px; border-top: 1px solid #E5E7EB; display: flex; justify-content: space-between; font-size: 8px; color: #9CA3AF; }

  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
</style>
</head>
<body>

<!-- ===== HEADER ===== -->
<div class="header">
  <div class="header-left">
    <div class="code">${data.project.code}</div>
    <h1>${data.project.name}</h1>
    <div class="period">${data.period_label} · ${data.project.department_name || ''} · PM: ${data.project.owner_name || '—'}</div>
  </div>
  <div class="rag">
    <div class="rag-pct">${data.project.progress_pct}%</div>
    <div class="rag-label">${hc.label}</div>
  </div>
</div>

<!-- ===== SECTION 1: THÔNG TIN CHUNG ===== -->
<div class="section">
  <div class="section-title">1. Thông tin chung</div>
  <div class="info-grid">
    <div class="info-item">
      <div class="info-label">Thời gian</div>
      <div class="info-value">${fmtDate(data.project.planned_start)} → ${fmtDate(data.project.planned_end)}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Tiến độ thực tế / Kế hoạch</div>
      <div class="info-value" style="color:${hc.bg}">${data.project.progress_pct}% / ${data.planned_progress}%</div>
    </div>
    <div class="info-item">
      <div class="info-label">Ngân sách</div>
      <div class="info-value" style="${budgetOver ? 'color:#DC2626' : ''}">${fmtCurrency(data.project.budget_actual)} / ${fmtCurrency(data.project.budget_planned)} (${budgetPct}%)</div>
    </div>
    <div class="info-item">
      <div class="info-label">Tasks hoàn thành</div>
      <div class="info-value">${data.task_stats.completed} / ${data.task_stats.total}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Tasks quá hạn</div>
      <div class="info-value" style="${data.task_stats.overdue > 0 ? 'color:#DC2626' : ''}">${data.task_stats.overdue}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Trạng thái</div>
      <div class="info-value">${STATUS_VI[data.project.status] || data.project.status}</div>
    </div>
  </div>
</div>

<!-- ===== SECTION 2: TIẾN ĐỘ PHASES ===== -->
<div class="section">
  <div class="section-title">2. Tiến độ theo Phase</div>
  ${data.phases.map(ph => `
    <div class="progress-row">
      <div class="progress-name">${ph.name}</div>
      <div class="progress-bar-wrap">${progressBar(ph.progress_pct, ph.color || '#6B7280', 6)}</div>
      <div class="progress-pct">${ph.progress_pct}%</div>
      <div class="progress-status">${STATUS_VI[ph.status] || ph.status}</div>
    </div>
  `).join('')}
</div>

<div class="two-col">

<!-- ===== SECTION 3: MILESTONES ===== -->
<div class="section">
  <div class="section-title">3. Milestones</div>
  <table>
    <thead><tr><th>Milestone</th><th>Hạn</th><th>Trạng thái</th></tr></thead>
    <tbody>
    ${data.milestones.slice(0, 8).map(ms => {
      const isOverdue = ms.status === 'overdue' || (ms.due_date && new Date(ms.due_date) < new Date() && ms.status !== 'completed')
      const cls = ms.status === 'completed' ? 'completed' : isOverdue ? 'overdue' : ''
      return `<tr><td>${ms.name}</td><td class="${cls}">${fmtDate(ms.due_date)}</td><td class="${cls}">${ms.completed_date ? '✓ ' + fmtDate(ms.completed_date) : (STATUS_VI[ms.status] || ms.status)}</td></tr>`
    }).join('')}
    </tbody>
  </table>
</div>

<!-- ===== SECTION 4: TOP RISKS ===== -->
<div class="section">
  <div class="section-title">4. Top rủi ro</div>
  ${data.risks.length === 0 ? '<div style="color:#9CA3AF;font-size:9px">Không có rủi ro đang mở</div>' : ''}
  ${data.risks.slice(0, 3).map(r => `
    <div class="risk-row">
      <div class="risk-score" style="background:${r.score >= 12 ? '#DC2626' : r.score >= 6 ? '#EA580C' : '#EAB308'}">${r.score}</div>
      <div class="risk-info">
        <div class="risk-title">${r.title}</div>
        <div class="risk-owner">${r.code} · ${r.owner_name || 'Chưa gán'}</div>
      </div>
    </div>
  `).join('')}
</div>

</div>

<!-- ===== SECTION 5: OPEN ISSUES BY SEVERITY ===== -->
<div class="section">
  <div class="section-title">5. Vấn đề đang mở</div>
  <div class="issue-grid">
    <div class="issue-box" style="background:#FEF2F2;color:#DC2626">
      <div class="issue-count">${data.issues_by_severity.critical}</div>
      <div class="issue-label">Nghiêm trọng</div>
    </div>
    <div class="issue-box" style="background:#FFF7ED;color:#EA580C">
      <div class="issue-count">${data.issues_by_severity.high}</div>
      <div class="issue-label">Cao</div>
    </div>
    <div class="issue-box" style="background:#FEFCE8;color:#CA8A04">
      <div class="issue-count">${data.issues_by_severity.medium}</div>
      <div class="issue-label">Trung bình</div>
    </div>
    <div class="issue-box" style="background:#EFF6FF;color:#2563EB">
      <div class="issue-count">${data.issues_by_severity.low}</div>
      <div class="issue-label">Thấp</div>
    </div>
  </div>
</div>

<!-- ===== FOOTER ===== -->
<div class="footer">
  <span>Công ty TNHH Cao su Huy Anh — Huy Anh Rubber ERP</span>
  <span>Người lập: ${data.exported_by} · Ngày: ${new Date().toLocaleDateString('vi-VN')} ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
</div>

</body>
</html>`

  // Open print window
  const win = window.open('', '_blank')
  if (!win) {
    alert('Không thể mở cửa sổ in. Vui lòng cho phép popup.')
    return
  }
  win.document.write(html)
  win.document.close()
  setTimeout(() => {
    win.print()
    // Don't auto-close — user might want to save as PDF
  }, 400)
}

// ============================================================================
// PORTFOLIO EXPORT (CSV/Excel-friendly)
// ============================================================================

export function exportPortfolioCSV(items: Array<{
  code: string; name: string; pm_name?: string; department_name?: string;
  status: string; progress_pct: number; health: string;
  budget_planned: number; budget_actual: number;
  risk_count: number; open_issues: number;
  next_milestone?: string; next_milestone_date?: string;
}>, periodLabel: string): void {
  let csv = `Báo cáo tổng hợp dự án — ${periodLabel}\n\n`
  csv += 'Mã DA,Tên DA,PM,Phòng ban,Trạng thái,Tiến độ %,Sức khỏe,NS Dự toán,NS Thực tế,Rủi ro,Vấn đề,Milestone tới,Hạn milestone\n'

  items.forEach(item => {
    csv += [
      item.code,
      `"${item.name}"`,
      `"${item.pm_name || ''}"`,
      `"${item.department_name || ''}"`,
      STATUS_VI[item.status] || item.status,
      item.progress_pct,
      HEALTH_COLORS[item.health as keyof typeof HEALTH_COLORS]?.label || item.health,
      item.budget_planned,
      item.budget_actual,
      item.risk_count,
      item.open_issues,
      `"${item.next_milestone || ''}"`,
      item.next_milestone_date || '',
    ].join(',') + '\n'
  })

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `portfolio-report-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default exportStatusReportPDF