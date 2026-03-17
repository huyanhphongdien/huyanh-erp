// src/utils/reportExportUtils.ts
// Phase 6.3: Task Reports - Export Utilities (FIXED VIETNAMESE FONT)
// ============================================================
// Dependencies: npm install exceljs jspdf jspdf-autotable

import ExcelJS from 'exceljs'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

// Import types
import type {
  CompletionByDepartment,
  CompletionByEmployee,
  PerformanceMetrics,
  TopPerformer,
  OverdueTask
} from '../services/taskReportService'

// ============================================================================
// TYPES
// ============================================================================

interface ExportOptions {
  filename?: string
  title?: string
  author?: string
  company?: string
}

// ============================================================================
// VIETNAMESE TEXT HELPER
// ============================================================================

/**
 * Remove Vietnamese diacritics for PDF compatibility
 * This is a workaround since jsPDF doesn't support Vietnamese by default
 */
function removeVietnameseDiacritics(str: string): string {
  if (!str) return ''
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
}

/**
 * Convert Vietnamese text for PDF
 * Option 1: Remove diacritics (simple but loses accent marks)
 * Option 2: Keep original (requires custom font - see setupVietnameseFont)
 */
function convertForPDF(text: string | number | null | undefined): string {
  if (text === null || text === undefined) return 'N/A'
  const str = String(text)
  // Remove diacritics for PDF compatibility
  return removeVietnameseDiacritics(str)
}

// ============================================================================
// EXCEL EXPORT FUNCTIONS (Vietnamese works fine in Excel)
// ============================================================================

export async function exportDepartmentReportToExcel(
  data: CompletionByDepartment[],
  options: ExportOptions = {}
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  
  workbook.creator = options.author || 'Huy Anh ERP'
  workbook.created = new Date()
  workbook.company = options.company || 'Công ty TNHH MTV Huy Anh'

  const worksheet = workbook.addWorksheet('Báo cáo theo phòng ban')

  worksheet.columns = [
    { header: 'Mã PB', key: 'code', width: 12 },
    { header: 'Phòng ban', key: 'name', width: 30 },
    { header: 'Tổng số', key: 'total', width: 12 },
    { header: 'Hoàn thành', key: 'finished', width: 12 },
    { header: 'Đang làm', key: 'in_progress', width: 12 },
    { header: 'Đã hủy', key: 'cancelled', width: 12 },
    { header: 'Quá hạn', key: 'overdue', width: 12 },
    { header: 'Tỷ lệ HT (%)', key: 'completion_rate', width: 15 },
    { header: 'Điểm TB', key: 'avg_score', width: 12 }
  ]

  const headerRow = worksheet.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' }
  }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
  headerRow.height = 25

  data.forEach(dept => {
    worksheet.addRow({
      code: dept.department_code,
      name: dept.department_name,
      total: dept.total_tasks,
      finished: dept.finished_tasks,
      in_progress: dept.in_progress_tasks,
      cancelled: dept.cancelled_tasks,
      overdue: dept.overdue_count,
      completion_rate: dept.completion_rate,
      avg_score: dept.avg_score || 'N/A'
    })
  })

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        }
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
      })
    }
  })

  const buffer = await workbook.xlsx.writeBuffer()
  downloadFile(
    buffer,
    options.filename || `bao-cao-phong-ban-${new Date().getTime()}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
}

export async function exportEmployeeReportToExcel(
  data: CompletionByEmployee[],
  options: ExportOptions = {}
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  
  workbook.creator = options.author || 'Huy Anh ERP'
  workbook.created = new Date()
  workbook.company = options.company || 'Công ty TNHH MTV Huy Anh'

  const worksheet = workbook.addWorksheet('Báo cáo theo nhân viên')

  worksheet.columns = [
    { header: 'Mã NV', key: 'code', width: 12 },
    { header: 'Họ tên', key: 'name', width: 25 },
    { header: 'Phòng ban', key: 'department', width: 20 },
    { header: 'Chức vụ', key: 'position', width: 20 },
    { header: 'Tổng số', key: 'total', width: 12 },
    { header: 'Hoàn thành', key: 'finished', width: 12 },
    { header: 'Tỷ lệ HT (%)', key: 'completion_rate', width: 15 },
    { header: 'Đúng hạn', key: 'on_time', width: 12 },
    { header: 'Quá hạn', key: 'overdue', width: 12 },
    { header: 'Điểm TB', key: 'avg_score', width: 12 }
  ]

  const headerRow = worksheet.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF70AD47' }
  }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
  headerRow.height = 25

  data.forEach(emp => {
    worksheet.addRow({
      code: emp.employee_code,
      name: emp.employee_name,
      department: emp.department_name,
      position: emp.position_name,
      total: emp.total_tasks,
      finished: emp.finished_tasks,
      completion_rate: emp.completion_rate,
      on_time: emp.on_time_count,
      overdue: emp.overdue_count,
      avg_score: emp.avg_score || 'N/A'
    })
  })

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        }
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
      })
    }
  })

  const buffer = await workbook.xlsx.writeBuffer()
  downloadFile(
    buffer,
    options.filename || `bao-cao-nhan-vien-${new Date().getTime()}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
}

export async function exportTopPerformersToExcel(
  data: TopPerformer[],
  options: ExportOptions = {}
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  
  workbook.creator = options.author || 'Huy Anh ERP'
  workbook.created = new Date()
  workbook.company = options.company || 'Công ty TNHH MTV Huy Anh'

  const worksheet = workbook.addWorksheet('Top Performers')

  worksheet.columns = [
    { header: 'Hạng', key: 'rank', width: 10 },
    { header: 'Mã NV', key: 'code', width: 12 },
    { header: 'Họ tên', key: 'name', width: 25 },
    { header: 'Phòng ban', key: 'department', width: 20 },
    { header: 'Chức vụ', key: 'position', width: 20 },
    { header: 'Hoàn thành', key: 'finished', width: 12 },
    { header: 'Tỷ lệ HT (%)', key: 'completion_rate', width: 15 },
    { header: 'Đúng hạn (%)', key: 'on_time_rate', width: 15 },
    { header: 'Điểm TB', key: 'avg_score', width: 12 }
  ]

  const headerRow = worksheet.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFC000' }
  }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
  headerRow.height = 25

  data.forEach((performer, index) => {
    const row = worksheet.addRow({
      rank: index + 1,
      code: performer.employee_code,
      name: performer.employee_name,
      department: performer.department_name,
      position: performer.position_name,
      finished: performer.finished_tasks,
      completion_rate: performer.completion_rate,
      on_time_rate: performer.on_time_rate,
      avg_score: performer.avg_score
    })

    if (index < 3) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: index === 0 ? 'FFFFD966' : index === 1 ? 'FFD9D9D9' : 'FFFFC58C' }
      }
      row.font = { bold: true }
    }
  })

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        }
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
      })
    }
  })

  const buffer = await workbook.xlsx.writeBuffer()
  downloadFile(
    buffer,
    options.filename || `top-performers-${new Date().getTime()}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
}

// ============================================================================
// PDF EXPORT FUNCTIONS (with Vietnamese text conversion)
// ============================================================================

export function exportDepartmentReportToPDF(
  data: CompletionByDepartment[],
  options: ExportOptions = {}
): void {
  const doc = new jsPDF('landscape')

  // Title and metadata (converted for PDF)
  doc.setFontSize(18)
  doc.text(convertForPDF(options.title || 'BAO CAO HOAN THANH THEO PHONG BAN'), 14, 15)

  doc.setFontSize(10)
  doc.text(`Ngay xuat: ${new Date().toLocaleDateString('vi-VN')}`, 14, 22)
  if (options.company) {
    doc.text(convertForPDF(options.company), 14, 27)
  }

  // Prepare table data with Vietnamese conversion
  const tableData = data.map((dept: CompletionByDepartment) => [
    convertForPDF(dept.department_code),
    convertForPDF(dept.department_name),
    String(dept.total_tasks),
    String(dept.finished_tasks),
    String(dept.in_progress_tasks),
    String(dept.cancelled_tasks),
    String(dept.overdue_count),
    `${dept.completion_rate.toFixed(1)}%`,
    dept.avg_score ? dept.avg_score.toFixed(1) : 'N/A'
  ])

  autoTable(doc, {
    head: [[
      'Ma PB',
      'Phòng ban',
      'Tổng số',
      'Hoàn thành',
      'Đang làm',
      'Đã hủy',
      'Quá hạn',
      'Tỷ lệ HT',
      'Diem TB'
    ]],
    body: tableData,
    startY: 35,
    theme: 'grid',
    headStyles: {
      fillColor: [68, 114, 196],
      fontSize: 10,
      fontStyle: 'bold',
      halign: 'center'
    },
    bodyStyles: {
      fontSize: 9,
      halign: 'center'
    },
    columnStyles: {
      1: { halign: 'left', cellWidth: 50 }
    }
  })

  doc.save(options.filename || `bao-cao-phong-ban-${new Date().getTime()}.pdf`)
}

export function exportPerformanceMetricsToPDF(
  metrics: PerformanceMetrics,
  options: ExportOptions = {}
): void {
  const doc = new jsPDF()

  doc.setFontSize(18)
  doc.text(convertForPDF(options.title || 'BAO CAO PHAN TICH HIEU SUAT'), 14, 15)

  doc.setFontSize(10)
  doc.text(`Ngay xuat: ${new Date().toLocaleDateString('vi-VN')}`, 14, 22)
  if (options.company) {
    doc.text(convertForPDF(options.company), 14, 27)
  }

  const yPosition = 40

  const metricsData = [
    ['Tổng số công việc', String(metrics.total_tasks)],
    ['Công việc hoàn thành', String(metrics.finished_tasks)],
    ['Tỷ lệ hoàn thành', `${metrics.completion_rate}%`],
    ['Hoàn thành đúng hạn', `${metrics.on_time_count} (${metrics.on_time_rate}%)`],
    ['Công việc quá hạn', `${metrics.overdue_count} (${metrics.overdue_rate}%)`],
    ['Điểm trung bình', metrics.avg_score ? metrics.avg_score.toFixed(1) : 'N/A'],
    ['Thời gian hoàn thành TB', metrics.avg_completion_days ? `${metrics.avg_completion_days} ngay` : 'N/A']
  ]

  autoTable(doc, {
    body: metricsData,
    startY: yPosition,
    theme: 'grid',
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 80 },
      1: { halign: 'right', cellWidth: 50 }
    }
  })

  doc.save(options.filename || `bao-cao-hieu-suat-${new Date().getTime()}.pdf`)
}

export function exportOverdueTasksToPDF(
  data: OverdueTask[],
  options: ExportOptions = {}
): void {
  const doc = new jsPDF('landscape')

  doc.setFontSize(18)
  doc.text(convertForPDF(options.title || 'DANH SACH CONG VIEC QUA HAN'), 14, 15)

  doc.setFontSize(10)
  doc.text(`Ngay xuat: ${new Date().toLocaleDateString('vi-VN')}`, 14, 22)
  doc.text(`Tong so: ${data.length} cong viec`, 14, 27)

  const tableData = data.map((task: OverdueTask) => [
    convertForPDF(task.task_code),
    convertForPDF(task.task_name.substring(0, 40) + (task.task_name.length > 40 ? '...' : '')),
    convertForPDF(task.assignee_name),
    convertForPDF(task.department_name),
    new Date(task.due_date).toLocaleDateString('vi-VN'),
    `${task.days_overdue} ngay`,
    convertForPDF(getPriorityLabel(task.priority))
  ])

  autoTable(doc, {
    head: [[
      'Ma CV',
      'Công việc',
      'Nhân viên',
      'Phòng ban',
      'Han HT',
      'Quá hạn',
      'Ưu tiên'
    ]],
    body: tableData,
    startY: 35,
    theme: 'grid',
    headStyles: {
      fillColor: [239, 68, 68],
      fontSize: 10,
      fontStyle: 'bold',
      halign: 'center'
    },
    bodyStyles: {
      fontSize: 9
    },
    columnStyles: {
      1: { halign: 'left', cellWidth: 60 }
    }
  })

  doc.save(options.filename || `cong-viec-qua-han-${new Date().getTime()}.pdf`)
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function downloadFile(data: ArrayBuffer | Blob, filename: string, mimeType: string): void {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

function getPriorityLabel(priority: string): string {
  const labels: Record<string, string> = {
    urgent: 'Khẩn cấp',
    high: 'Cao',
    medium: 'Trung bình',
    low: 'Thap'
  }
  return labels[priority] || priority
}

// ============================================================================
// EXPORT ALL
// ============================================================================

export const reportExportUtils = {
  exportDepartmentReportToExcel,
  exportEmployeeReportToExcel,
  exportTopPerformersToExcel,
  exportDepartmentReportToPDF,
  exportPerformanceMetricsToPDF,
  exportOverdueTasksToPDF
}

export default reportExportUtils