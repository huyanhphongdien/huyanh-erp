// ============================================================================
// FILE: src/pages/projects/ProjectRiskPage.tsx
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PHASE: PM7 — Bước 7.3 + 7.4 + 7.5
// MÔ TẢ: Risk register (bảng + matrix 5x5) + Issue tracker
//         Forms tạo/sửa risk & issue, resolve, escalate
// DESIGN: Industrial Rubber Theme, mobile-first
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  Plus, ShieldAlert, AlertTriangle, Bug, ChevronDown, ChevronUp,
  Loader2, X, Save, Edit3, Trash2, ArrowUpCircle, CheckCircle2,
  User, Calendar, Filter, BarChart3, Zap, Shield, Target,
} from 'lucide-react'
import { riskService } from '../../services/project/riskService'
import { issueService } from '../../services/project/issueService'
import { supabase } from '../../lib/supabase'
import { sendNotificationEmail } from '../../services/emailService'
import type {
  ProjectRisk, RiskCreateData, RiskUpdateData, RiskMatrixCell, RiskStats, RiskCategory, RiskStatus,
} from '../../services/project/riskService'
import type {
  ProjectIssue, IssueCreateData, IssueUpdateData, IssueStats, IssueSeverity, IssueStatus,
} from '../../services/project/issueService'

// ============================================================================
// CONSTANTS
// ============================================================================

const RISK_STATUS_CFG: Record<RiskStatus, { label: string; color: string; bg: string }> = {
  identified:  { label: 'Đã nhận diện', color: 'text-blue-700',    bg: 'bg-blue-50' },
  analyzing:   { label: 'Đang phân tích', color: 'text-amber-700', bg: 'bg-amber-50' },
  mitigating:  { label: 'Đang xử lý',  color: 'text-orange-700',  bg: 'bg-orange-50' },
  resolved:    { label: 'Đã giải quyết', color: 'text-emerald-700',bg: 'bg-emerald-50' },
  accepted:    { label: 'Chấp nhận',    color: 'text-gray-600',    bg: 'bg-gray-100' },
  closed:      { label: 'Đã đóng',      color: 'text-gray-500',    bg: 'bg-gray-50' },
}

const CATEGORY_CFG: Record<RiskCategory, { label: string; icon: React.ReactNode }> = {
  technical:  { label: 'Kỹ thuật',    icon: <Zap className="w-3 h-3" /> },
  schedule:   { label: 'Tiến độ',     icon: <Calendar className="w-3 h-3" /> },
  resource:   { label: 'Nguồn lực',   icon: <User className="w-3 h-3" /> },
  external:   { label: 'Bên ngoài',   icon: <Shield className="w-3 h-3" /> },
  financial:  { label: 'Tài chính',   icon: <BarChart3 className="w-3 h-3" /> },
}

const SEVERITY_CFG: Record<IssueSeverity, { label: string; color: string; bg: string }> = {
  critical: { label: 'Nghiêm trọng', color: 'text-red-700',    bg: 'bg-red-50' },
  high:     { label: 'Cao',          color: 'text-orange-700',  bg: 'bg-orange-50' },
  medium:   { label: 'Trung bình',   color: 'text-amber-700',  bg: 'bg-amber-50' },
  low:      { label: 'Thấp',         color: 'text-gray-600',    bg: 'bg-gray-100' },
}

const ISSUE_STATUS_CFG: Record<IssueStatus, { label: string; color: string; bg: string }> = {
  open:        { label: 'Mở',          color: 'text-blue-700',    bg: 'bg-blue-50' },
  in_progress: { label: 'Đang xử lý', color: 'text-amber-700',  bg: 'bg-amber-50' },
  resolved:    { label: 'Đã giải quyết',color: 'text-emerald-700',bg: 'bg-emerald-50' },
  closed:      { label: 'Đã đóng',     color: 'text-gray-500',    bg: 'bg-gray-50' },
  escalated:   { label: 'Leo thang',   color: 'text-red-700',     bg: 'bg-red-50' },
}

/** Zone color for risk matrix */
function getZoneColor(score: number): string {
  if (score >= 16) return 'bg-red-500 text-white'
  if (score >= 10) return 'bg-orange-400 text-white'
  if (score >= 5) return 'bg-amber-300 text-amber-900'
  return 'bg-emerald-200 text-emerald-900'
}

function getZoneBorder(score: number): string {
  if (score >= 16) return 'border-red-300'
  if (score >= 10) return 'border-orange-300'
  if (score >= 5) return 'border-amber-200'
  return 'border-emerald-200'
}

// ============================================================================
// RISK MATRIX COMPONENT (Bước 7.3)
// ============================================================================

const RiskMatrix: React.FC<{ cells: RiskMatrixCell[]; onCellClick?: (cell: RiskMatrixCell) => void }> = ({ cells, onCellClick }) => {
  const impactLabels = ['Rất thấp', 'Thấp', 'Trung bình', 'Cao', 'Rất cao']
  const probLabels = ['Rất thấp', 'Thấp', 'Trung bình', 'Cao', 'Rất cao']

  const getCell = (p: number, i: number) => cells.find(c => c.probability === p && c.impact === i)

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[320px]">
        {/* Header: Impact labels */}
        <div className="flex">
          <div className="w-20 flex-shrink-0" />
          {impactLabels.map((label, idx) => (
            <div key={idx} className="flex-1 text-center text-[10px] font-medium text-gray-500 pb-1">
              {label}
            </div>
          ))}
        </div>

        {/* Rows: Probability 5→1 (top=high) */}
        {[5, 4, 3, 2, 1].map(p => (
          <div key={p} className="flex">
            {/* Y-axis label */}
            <div className="w-20 flex-shrink-0 flex items-center justify-end pr-2">
              <span className="text-[10px] text-gray-500">{probLabels[p - 1]}</span>
            </div>
            {/* Cells */}
            {[1, 2, 3, 4, 5].map(i => {
              const cell = getCell(p, i)
              const score = p * i
              const count = cell?.count || 0
              return (
                <div key={i} className="flex-1 p-0.5">
                  <button
                    onClick={() => cell && count > 0 && onCellClick?.(cell)}
                    className={`w-full aspect-square rounded-md flex flex-col items-center justify-center transition-all
                      ${getZoneColor(score)} ${count > 0 ? 'cursor-pointer hover:scale-105 ring-1 ring-white/30' : 'opacity-70'}
                    `}
                    title={count > 0 ? cell!.risks.map(r => `${r.code}: ${r.title}`).join('\n') : `Score: ${score}`}
                  >
                    <span className="text-[10px] font-bold">{score}</span>
                    {count > 0 && (
                      <span className="text-[9px] font-medium mt-0.5 bg-white/30 px-1 rounded-full">{count}</span>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        ))}

        {/* Axis labels */}
        <div className="flex mt-1">
          <div className="w-20 flex-shrink-0 text-right pr-2">
            <span className="text-[9px] text-gray-400 italic">Xác suất →</span>
          </div>
          <div className="flex-1 text-center">
            <span className="text-[9px] text-gray-400 italic">← Tác động →</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// PROPS & MAIN COMPONENT
// ============================================================================

interface ProjectRiskPageProps {
  projectId: string
  members?: { employee_id: string; full_name: string }[]
}

const ProjectRiskPage: React.FC<ProjectRiskPageProps> = ({ projectId, members = [] }) => {
  // Tab: risks | issues
  const [activeTab, setActiveTab] = useState<'risks' | 'issues'>('risks')

  // All employees (for assignee dropdown - fallback when no project members)
  const [allEmployees, setAllEmployees] = useState<{ employee_id: string; full_name: string; position?: string }[]>([])

  useEffect(() => {
    const loadEmployees = async () => {
      const { data } = await supabase
        .from('employees')
        .select('id, full_name, position:positions!position_id(name)')
        .eq('status', 'active')
        .order('full_name')
      if (data) {
        setAllEmployees(data.map((e: any) => ({
          employee_id: e.id,
          full_name: e.full_name,
          position: e.position?.name || '',
        })))
      }
    }
    loadEmployees()
  }, [])

  // Data
  const [risks, setRisks] = useState<ProjectRisk[]>([])
  const [issues, setIssues] = useState<ProjectIssue[]>([])
  const [matrixCells, setMatrixCells] = useState<RiskMatrixCell[]>([])
  const [riskStats, setRiskStats] = useState<RiskStats | null>(null)
  const [issueStats, setIssueStats] = useState<IssueStats | null>(null)
  const [loading, setLoading] = useState(true)

  // Modals
  const [showRiskForm, setShowRiskForm] = useState(false)
  const [editingRisk, setEditingRisk] = useState<ProjectRisk | null>(null)
  const [showIssueForm, setShowIssueForm] = useState(false)
  const [editingIssue, setEditingIssue] = useState<ProjectIssue | null>(null)
  const [resolveIssueId, setResolveIssueId] = useState<string | null>(null)

  // ========================================================================
  // LOAD DATA
  // ========================================================================

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [risksData, issuesData, matrixData, rStats, iStats] = await Promise.all([
        riskService.getByProject(projectId, { sort_by: 'risk_score', sort_order: 'desc' }),
        issueService.getByProject(projectId, { sort_by: 'created_at', sort_order: 'desc' }),
        riskService.getRiskMatrix(projectId),
        riskService.getStats(projectId),
        issueService.getStats(projectId),
      ])
      setRisks(risksData)
      setIssues(issuesData)
      setMatrixCells(matrixData)
      setRiskStats(rStats)
      setIssueStats(iStats)
    } catch (err) {
      console.error('[ProjectRiskPage] Load error:', err)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { loadData() }, [loadData])

  // ========================================================================
  // HANDLERS
  // ========================================================================

  const handleDeleteRisk = async (id: string) => {
    if (!confirm('Xóa rủi ro này?')) return
    await riskService.delete(id)
    await loadData()
  }

  const handleRiskStatusChange = async (id: string, status: RiskStatus) => {
    await riskService.updateStatus(id, status)
    await loadData()
  }

  const handleDeleteIssue = async (id: string) => {
    if (!confirm('Xóa vấn đề này?')) return
    await issueService.delete(id)
    await loadData()
  }

  const handleEscalate = async (id: string) => {
    if (!confirm('Leo thang vấn đề này?')) return
    await issueService.escalate(id)
    await loadData()
  }

  const handleIssueStatusChange = async (id: string, status: IssueStatus) => {
    await issueService.update(id, { status })
    await loadData()
  }

  // ========================================================================
  // STAT CARDS
  // ========================================================================

  const RiskStatCards = () => {
    if (!riskStats) return null
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <div className="bg-white rounded-lg border border-gray-200 px-3 py-2">
          <div className="text-lg font-bold text-gray-900">{riskStats.total}</div>
          <div className="text-[11px] text-gray-500">Tổng rủi ro</div>
        </div>
        <div className="bg-white rounded-lg border border-red-200 px-3 py-2">
          <div className="text-lg font-bold text-red-600">{riskStats.by_zone.critical}</div>
          <div className="text-[11px] text-red-500">Nghiêm trọng</div>
        </div>
        <div className="bg-white rounded-lg border border-orange-200 px-3 py-2">
          <div className="text-lg font-bold text-orange-600">{riskStats.by_zone.high}</div>
          <div className="text-[11px] text-orange-500">Cao</div>
        </div>
        <div className="bg-white rounded-lg border border-amber-200 px-3 py-2">
          <div className="text-lg font-bold text-amber-600">{riskStats.by_status.mitigating}</div>
          <div className="text-[11px] text-amber-500">Đang xử lý</div>
        </div>
      </div>
    )
  }

  const IssueStatCards = () => {
    if (!issueStats) return null
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <div className="bg-white rounded-lg border border-gray-200 px-3 py-2">
          <div className="text-lg font-bold text-gray-900">{issueStats.total}</div>
          <div className="text-[11px] text-gray-500">Tổng vấn đề</div>
        </div>
        <div className="bg-white rounded-lg border border-blue-200 px-3 py-2">
          <div className="text-lg font-bold text-blue-600">{issueStats.open}</div>
          <div className="text-[11px] text-blue-500">Đang mở</div>
        </div>
        <div className="bg-white rounded-lg border border-red-200 px-3 py-2">
          <div className="text-lg font-bold text-red-600">{issueStats.escalated}</div>
          <div className="text-[11px] text-red-500">Leo thang</div>
        </div>
        <div className="bg-white rounded-lg border border-amber-200 px-3 py-2">
          <div className="text-lg font-bold text-amber-600">{issueStats.overdue}</div>
          <div className="text-[11px] text-amber-500">Quá hạn</div>
        </div>
      </div>
    )
  }

  // ========================================================================
  // RISK REGISTER TABLE
  // ========================================================================

  const RiskRegister = () => (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-bold text-gray-800 flex items-center gap-1.5">
          <ShieldAlert className="w-4 h-4 text-[#1B4D3E]" />
          Risk Register
        </h3>
        <button
          onClick={() => { setEditingRisk(null); setShowRiskForm(true) }}
          className="flex items-center gap-1 px-3 py-1.5 text-[12px] text-white bg-[#1B4D3E] rounded-lg hover:bg-[#153F33] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Thêm rủi ro
        </button>
      </div>

      {risks.length === 0 ? (
        <div className="text-center py-8 text-[13px] text-gray-400">Chưa có rủi ro nào được ghi nhận</div>
      ) : (
        <div className="space-y-2">
          {/* Desktop table */}
          <div className="hidden sm:block bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase px-3 py-2 w-16">Mã</th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase px-3 py-2">Tên</th>
                  <th className="text-center text-[11px] font-semibold text-gray-500 uppercase px-3 py-2 w-20">P×I</th>
                  <th className="text-center text-[11px] font-semibold text-gray-500 uppercase px-3 py-2 w-16">Score</th>
                  <th className="text-center text-[11px] font-semibold text-gray-500 uppercase px-3 py-2 w-28">Trạng thái</th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase px-3 py-2 w-28">Owner</th>
                  <th className="text-center text-[11px] font-semibold text-gray-500 uppercase px-3 py-2 w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {risks.map(risk => {
                  const zoneCls = getZoneColor(risk.risk_score)
                  const stCfg = RISK_STATUS_CFG[risk.status]
                  return (
                    <tr key={risk.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-[12px] font-mono text-gray-600">{risk.code}</td>
                      <td className="px-3 py-2">
                        <div className="text-[13px] font-medium text-gray-900">{risk.title}</div>
                        {risk.category && (
                          <span className="text-[10px] text-gray-500">
                            {CATEGORY_CFG[risk.category]?.label || risk.category}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center text-[12px] text-gray-600">{risk.probability}×{risk.impact}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-md text-[12px] font-bold ${zoneCls}`}>
                          {risk.risk_score}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${stCfg.color} ${stCfg.bg}`}>
                          {stCfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[12px] text-gray-600">{risk.owner?.full_name || '—'}</td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => { setEditingRisk(risk); setShowRiskForm(true) }}
                            className="p-1 text-gray-400 hover:text-blue-600 rounded" title="Sửa">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDeleteRisk(risk.id)}
                            className="p-1 text-gray-400 hover:text-red-600 rounded" title="Xóa">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-2">
            {risks.map(risk => {
              const stCfg = RISK_STATUS_CFG[risk.status]
              return (
                <div key={risk.id} className={`bg-white rounded-lg border p-3 ${getZoneBorder(risk.risk_score)}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] font-mono text-gray-500">{risk.code}</span>
                        <span className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${getZoneColor(risk.risk_score)}`}>
                          {risk.risk_score}
                        </span>
                      </div>
                      <div className="text-[13px] font-medium text-gray-900">{risk.title}</div>
                    </div>
                    <button onClick={() => { setEditingRisk(risk); setShowRiskForm(true) }}
                      className="p-1.5 text-gray-400 hover:text-[#1B4D3E]">
                      <Edit3 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${stCfg.color} ${stCfg.bg}`}>{stCfg.label}</span>
                    {risk.category && <span className="text-[10px] text-gray-500">{CATEGORY_CFG[risk.category]?.label}</span>}
                    {risk.owner && <span className="text-[10px] text-gray-500">👤 {risk.owner.full_name}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )

  // ========================================================================
  // ISSUE TRACKER TABLE
  // ========================================================================

  const IssueTracker = () => (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-bold text-gray-800 flex items-center gap-1.5">
          <Bug className="w-4 h-4 text-orange-600" />
          Issue Tracker
        </h3>
        <button
          onClick={() => { setEditingIssue(null); setShowIssueForm(true) }}
          className="flex items-center gap-1 px-3 py-1.5 text-[12px] text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Báo cáo vấn đề
        </button>
      </div>

      {issues.length === 0 ? (
        <div className="text-center py-8 text-[13px] text-gray-400">Chưa có vấn đề nào</div>
      ) : (
        <div className="space-y-2">
          {issues.map(issue => {
            const sevCfg = SEVERITY_CFG[issue.severity]
            const stCfg = ISSUE_STATUS_CFG[issue.status]
            const isOverdue = issue.due_date && new Date(issue.due_date) < new Date() && !['resolved', 'closed'].includes(issue.status)

            return (
              <div key={issue.id} className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-mono text-gray-500">{issue.code}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${sevCfg.color} ${sevCfg.bg}`}>{sevCfg.label}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${stCfg.color} ${stCfg.bg}`}>{stCfg.label}</span>
                    </div>
                    <div className="text-[13px] font-medium text-gray-900">{issue.title}</div>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[11px] text-gray-500">
                      {issue.assignee && <span>👤 {issue.assignee.full_name}</span>}
                      {issue.due_date && (
                        <span className={isOverdue ? 'text-red-600 font-medium' : ''}>
                          📅 {new Date(issue.due_date).toLocaleDateString('vi-VN')}
                          {isOverdue && ' ⚠'}
                        </span>
                      )}
                    </div>
                    {issue.resolution && (
                      <div className="mt-2 p-2 bg-emerald-50 rounded text-[11px] text-emerald-700">
                        <strong>Giải pháp:</strong> {issue.resolution}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 ml-2">
                    {!['resolved', 'closed'].includes(issue.status) && (
                      <>
                        <button onClick={() => setResolveIssueId(issue.id)}
                          className="p-1.5 text-emerald-500 hover:bg-emerald-50 rounded" title="Giải quyết">
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleEscalate(issue.id)}
                          className="p-1.5 text-red-400 hover:bg-red-50 rounded" title="Leo thang">
                          <ArrowUpCircle className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    <button onClick={() => { setEditingIssue(issue); setShowIssueForm(true) }}
                      className="p-1.5 text-gray-400 hover:bg-gray-100 rounded" title="Sửa">
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDeleteIssue(issue.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded" title="Xóa">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  // ========================================================================
  // RISK FORM MODAL
  // ========================================================================

  const RiskFormModal = () => {
    const isEdit = !!editingRisk
    const [form, setForm] = useState({
      title: editingRisk?.title || '',
      description: editingRisk?.description || '',
      probability: editingRisk?.probability || 3,
      impact: editingRisk?.impact || 3,
      category: editingRisk?.category || '' as string,
      mitigation_plan: editingRisk?.mitigation_plan || '',
      contingency_plan: editingRisk?.contingency_plan || '',
      owner_id: editingRisk?.owner_id || '',
      status: editingRisk?.status || 'identified' as RiskStatus,
    })
    const [saving, setSaving] = useState(false)

    const score = form.probability * form.impact

    const handleSave = async () => {
      if (!form.title.trim()) return
      setSaving(true)
      try {
        if (isEdit) {
          await riskService.update(editingRisk!.id, {
            title: form.title,
            description: form.description || undefined,
            probability: form.probability,
            impact: form.impact,
            category: (form.category || undefined) as RiskCategory | undefined,
            status: form.status,
            mitigation_plan: form.mitigation_plan || undefined,
            contingency_plan: form.contingency_plan || undefined,
            owner_id: form.owner_id || null,
          })
        } else {
          await riskService.create({
            project_id: projectId,
            title: form.title,
            description: form.description || undefined,
            probability: form.probability,
            impact: form.impact,
            category: (form.category || undefined) as RiskCategory | undefined,
            mitigation_plan: form.mitigation_plan || undefined,
            contingency_plan: form.contingency_plan || undefined,
            owner_id: form.owner_id || undefined,
          })
        }
        setShowRiskForm(false)
        setEditingRisk(null)
        await loadData()
      } catch (err) {
        console.error('Save risk failed:', err)
      } finally {
        setSaving(false)
      }
    }

    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setShowRiskForm(false)}>
        <div className="bg-white w-full sm:max-w-lg sm:rounded-xl rounded-t-xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between z-10">
            <h3 className="text-[15px] font-bold text-gray-900">{isEdit ? 'Sửa rủi ro' : 'Thêm rủi ro'}</h3>
            <button onClick={() => setShowRiskForm(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
          </div>

          <div className="p-4 space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-gray-600 mb-1">Tên rủi ro *</label>
              <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2.5 text-[15px] border border-gray-300 rounded-lg focus:border-[#1B4D3E] focus:ring-1 focus:ring-[#1B4D3E] outline-none" autoFocus />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-gray-600 mb-1">Mô tả</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2} className="w-full px-3 py-2.5 text-[15px] border border-gray-300 rounded-lg focus:border-[#1B4D3E] outline-none resize-none" />
            </div>

            {/* Probability × Impact slider */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1">Xác suất: {form.probability}/5</label>
                <input type="range" min={1} max={5} value={form.probability}
                  onChange={e => setForm(f => ({ ...f, probability: Number(e.target.value) }))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none accent-[#1B4D3E]" />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1">Tác động: {form.impact}/5</label>
                <input type="range" min={1} max={5} value={form.impact}
                  onChange={e => setForm(f => ({ ...f, impact: Number(e.target.value) }))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none accent-[#1B4D3E]" />
              </div>
            </div>

            {/* Score preview */}
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-gray-500">Risk Score:</span>
              <span className={`w-10 h-10 rounded-lg flex items-center justify-center text-[16px] font-bold ${getZoneColor(score)}`}>
                {score}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1">Danh mục</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2.5 text-[15px] border border-gray-300 rounded-lg bg-white outline-none">
                  <option value="">— Chọn —</option>
                  {Object.entries(CATEGORY_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1">Người chịu trách nhiệm</label>
                <select value={form.owner_id} onChange={e => setForm(f => ({ ...f, owner_id: e.target.value }))}
                  className="w-full px-3 py-2.5 text-[15px] border border-gray-300 rounded-lg bg-white outline-none">
                  <option value="">— Chọn —</option>
                  {members.length > 0 && (
                    <optgroup label="Thành viên dự án">
                      {members.map(m => <option key={m.employee_id} value={m.employee_id}>{m.full_name}</option>)}
                    </optgroup>
                  )}
                  <optgroup label={members.length > 0 ? 'Nhân viên khác' : 'Tất cả nhân viên'}>
                    {allEmployees
                      .filter(e => !members.some(m => m.employee_id === e.employee_id))
                      .map(e => (
                        <option key={e.employee_id} value={e.employee_id}>
                          {e.full_name}{e.position ? ` — ${e.position}` : ''}
                        </option>
                      ))}
                  </optgroup>
                </select>
              </div>
            </div>

            {isEdit && (
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1">Trạng thái</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as RiskStatus }))}
                  className="w-full px-3 py-2.5 text-[15px] border border-gray-300 rounded-lg bg-white outline-none">
                  {Object.entries(RISK_STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="block text-[12px] font-medium text-gray-600 mb-1">Kế hoạch ứng phó</label>
              <textarea value={form.mitigation_plan} onChange={e => setForm(f => ({ ...f, mitigation_plan: e.target.value }))}
                rows={2} className="w-full px-3 py-2.5 text-[15px] border border-gray-300 rounded-lg outline-none resize-none" />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-gray-600 mb-1">Phương án dự phòng</label>
              <textarea value={form.contingency_plan} onChange={e => setForm(f => ({ ...f, contingency_plan: e.target.value }))}
                rows={2} className="w-full px-3 py-2.5 text-[15px] border border-gray-300 rounded-lg outline-none resize-none" />
            </div>
          </div>

          <div className="sticky bottom-0 bg-white border-t px-4 py-3 flex gap-2">
            <button onClick={() => setShowRiskForm(false)} className="flex-1 py-2.5 text-[14px] text-gray-600 bg-gray-100 rounded-lg">Hủy</button>
            <button onClick={handleSave} disabled={!form.title.trim() || saving}
              className="flex-1 py-2.5 text-[14px] text-white bg-[#1B4D3E] rounded-lg disabled:opacity-50 flex items-center justify-center gap-1.5">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isEdit ? 'Cập nhật' : 'Tạo mới'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ========================================================================
  // ISSUE FORM MODAL
  // ========================================================================

  const IssueFormModal = () => {
    const isEdit = !!editingIssue
    const [form, setForm] = useState({
      title: editingIssue?.title || '',
      description: editingIssue?.description || '',
      severity: editingIssue?.severity || 'medium' as IssueSeverity,
      assignee_id: editingIssue?.assignee_id || '',
      due_date: editingIssue?.due_date || '',
    })
    const [saving, setSaving] = useState(false)

    const handleSave = async () => {
      if (!form.title.trim()) return
      setSaving(true)
      try {
        if (isEdit) {
          await issueService.update(editingIssue!.id, {
            title: form.title,
            description: form.description || undefined,
            severity: form.severity,
            assignee_id: form.assignee_id || null,
            due_date: form.due_date || null,
          })
        } else {
          await issueService.create({
            project_id: projectId,
            title: form.title,
            description: form.description || undefined,
            severity: form.severity,
            assignee_id: form.assignee_id || undefined,
            due_date: form.due_date || undefined,
          })

          // Gửi email thông báo cho người xử lý
          if (form.assignee_id) {
            try {
              // Lấy tên dự án
              const { data: proj } = await supabase
                .from('projects')
                .select('name')
                .eq('id', projectId)
                .single()

              await sendNotificationEmail({
                recipient_id: form.assignee_id,
                notification_type: 'task_assigned',
                additional_data: {
                  task_name: `[Vấn đề] ${form.title}`,
                  task_code: `DA-${proj?.name || projectId}`,
                  assigner_name: 'Hệ thống quản lý dự án',
                  description: `${form.description || ''}\n\nMức độ: ${SEVERITY_CFG[form.severity as IssueSeverity]?.label || form.severity}${form.due_date ? `\nHạn xử lý: ${new Date(form.due_date).toLocaleDateString('vi-VN')}` : ''}`,
                  priority: form.severity === 'critical' ? 'critical' : form.severity === 'high' ? 'high' : 'medium',
                  due_date: form.due_date || undefined,
                },
              })
            } catch (emailErr) {
              console.error('Send issue email failed:', emailErr)
              // Non-blocking: issue vẫn tạo thành công
            }
          }
        }
        setShowIssueForm(false)
        setEditingIssue(null)
        await loadData()
      } catch (err) {
        console.error('Save issue failed:', err)
      } finally {
        setSaving(false)
      }
    }

    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setShowIssueForm(false)}>
        <div className="bg-white w-full sm:max-w-lg sm:rounded-xl rounded-t-xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between z-10">
            <h3 className="text-[15px] font-bold text-gray-900">{isEdit ? 'Sửa vấn đề' : 'Báo cáo vấn đề'}</h3>
            <button onClick={() => setShowIssueForm(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
          </div>

          <div className="p-4 space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-gray-600 mb-1">Tên vấn đề *</label>
              <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2.5 text-[15px] border border-gray-300 rounded-lg focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none" autoFocus />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-gray-600 mb-1">Mô tả</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={3} className="w-full px-3 py-2.5 text-[15px] border border-gray-300 rounded-lg outline-none resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1">Mức độ</label>
                <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value as IssueSeverity }))}
                  className="w-full px-3 py-2.5 text-[15px] border border-gray-300 rounded-lg bg-white outline-none">
                  {Object.entries(SEVERITY_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1">Người xử lý</label>
                <select value={form.assignee_id} onChange={e => setForm(f => ({ ...f, assignee_id: e.target.value }))}
                  className="w-full px-3 py-2.5 text-[15px] border border-gray-300 rounded-lg bg-white outline-none">
                  <option value="">— Chọn —</option>
                  {members.length > 0 && (
                    <optgroup label="Thành viên dự án">
                      {members.map(m => <option key={m.employee_id} value={m.employee_id}>{m.full_name}</option>)}
                    </optgroup>
                  )}
                  <optgroup label={members.length > 0 ? 'Nhân viên khác' : 'Tất cả nhân viên'}>
                    {allEmployees
                      .filter(e => !members.some(m => m.employee_id === e.employee_id))
                      .map(e => (
                        <option key={e.employee_id} value={e.employee_id}>
                          {e.full_name}{e.position ? ` — ${e.position}` : ''}
                        </option>
                      ))}
                  </optgroup>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-gray-600 mb-1">Hạn xử lý</label>
              <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                className="w-full px-3 py-2.5 text-[15px] border border-gray-300 rounded-lg outline-none" />
            </div>
          </div>

          <div className="sticky bottom-0 bg-white border-t px-4 py-3 flex gap-2">
            <button onClick={() => setShowIssueForm(false)} className="flex-1 py-2.5 text-[14px] text-gray-600 bg-gray-100 rounded-lg">Hủy</button>
            <button onClick={handleSave} disabled={!form.title.trim() || saving}
              className="flex-1 py-2.5 text-[14px] text-white bg-orange-600 rounded-lg disabled:opacity-50 flex items-center justify-center gap-1.5">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isEdit ? 'Cập nhật' : 'Tạo mới'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ========================================================================
  // RESOLVE MODAL
  // ========================================================================

  const ResolveModal = () => {
    const [resolution, setResolution] = useState('')
    const [saving, setSaving] = useState(false)

    const handleResolve = async () => {
      if (!resolution.trim() || !resolveIssueId) return
      setSaving(true)
      try {
        await issueService.resolve(resolveIssueId, resolution.trim())
        setResolveIssueId(null)
        await loadData()
      } finally {
        setSaving(false)
      }
    }

    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setResolveIssueId(null)}>
        <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-xl" onClick={e => e.stopPropagation()}>
          <div className="px-4 py-3 border-b">
            <h3 className="text-[15px] font-bold text-gray-900">Giải quyết vấn đề</h3>
          </div>
          <div className="p-4">
            <label className="block text-[12px] font-medium text-gray-600 mb-1">Mô tả giải pháp *</label>
            <textarea value={resolution} onChange={e => setResolution(e.target.value)}
              rows={4} placeholder="Nhập giải pháp đã áp dụng..."
              className="w-full px-3 py-2.5 text-[15px] border border-gray-300 rounded-lg focus:border-emerald-500 outline-none resize-none" autoFocus />
          </div>
          <div className="px-4 py-3 border-t flex gap-2">
            <button onClick={() => setResolveIssueId(null)} className="flex-1 py-2.5 text-[14px] text-gray-600 bg-gray-100 rounded-lg">Hủy</button>
            <button onClick={handleResolve} disabled={!resolution.trim() || saving}
              className="flex-1 py-2.5 text-[14px] text-white bg-emerald-600 rounded-lg disabled:opacity-50 flex items-center justify-center gap-1.5">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Đánh dấu đã giải quyết
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ========================================================================
  // MAIN RENDER
  // ========================================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-[#1B4D3E]" />
        <span className="ml-2 text-[14px] text-gray-500">Đang tải...</span>
      </div>
    )
  }

  return (
    <div>
      {/* Tab switcher */}
      <div className="flex items-center gap-1 mb-4 bg-gray-100 rounded-lg p-0.5 w-fit">
        <button
          onClick={() => setActiveTab('risks')}
          className={`flex items-center gap-1.5 px-4 py-2 text-[13px] rounded-md transition-colors
            ${activeTab === 'risks' ? 'bg-white text-[#1B4D3E] font-semibold shadow-sm' : 'text-gray-500 hover:text-gray-700'}
          `}
        >
          <ShieldAlert className="w-4 h-4" />
          Rủi ro
          {riskStats && riskStats.total > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-[#1B4D3E]/10 text-[#1B4D3E] rounded-full">{riskStats.total}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('issues')}
          className={`flex items-center gap-1.5 px-4 py-2 text-[13px] rounded-md transition-colors
            ${activeTab === 'issues' ? 'bg-white text-orange-600 font-semibold shadow-sm' : 'text-gray-500 hover:text-gray-700'}
          `}
        >
          <Bug className="w-4 h-4" />
          Vấn đề
          {issueStats && issueStats.open > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-orange-100 text-orange-600 rounded-full">{issueStats.open}</span>
          )}
        </button>
      </div>

      {/* RISKS TAB */}
      {activeTab === 'risks' && (
        <div>
          <RiskStatCards />

          {/* Risk Matrix */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
            <h3 className="text-[13px] font-bold text-gray-700 mb-3">Ma trận rủi ro</h3>
            <RiskMatrix cells={matrixCells} />
            <div className="flex items-center gap-3 mt-3 text-[10px]">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-200" /> Thấp (1-4)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-300" /> Trung bình (5-9)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-400" /> Cao (10-15)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500" /> Nghiêm trọng (16-25)</span>
            </div>
          </div>

          <RiskRegister />
        </div>
      )}

      {/* ISSUES TAB */}
      {activeTab === 'issues' && (
        <div>
          <IssueStatCards />
          <IssueTracker />
        </div>
      )}

      {/* Modals */}
      {showRiskForm && <RiskFormModal />}
      {showIssueForm && <IssueFormModal />}
      {resolveIssueId && <ResolveModal />}
    </div>
  )
}

export default ProjectRiskPage