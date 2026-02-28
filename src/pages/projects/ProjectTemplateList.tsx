// src/pages/projects/ProjectTemplateList.tsx
// PM2 - Bước 2.4: Danh sách Templates dự án
// Card grid — Tên template | Số phases | Mô tả | Actions

import React, { useState, useEffect, useCallback } from 'react'
import {
  Plus, Search, X, ChevronLeft, Loader2, AlertCircle,
  Copy, Eye, Trash2, Layers, Flag, FolderOpen, Settings,
  Calendar, Milestone, ChevronRight, Check,
  Monitor, Factory, Building2, Wrench, TrendingUp, Users,
  Shield, Truck, Leaf, Zap, FlaskConical
} from 'lucide-react'
import {
  projectTemplateService,
  ProjectTemplate,
  TemplateDetail,
  CreateFromTemplateInput,
} from '../../services/project/projectTemplateService'
import { projectCategoryService, ProjectCategory } from '../../services/project/projectCategoryService'

// ============================================
// ICON MAP
// ============================================

const ICON_MAP: Record<string, React.FC<any>> = {
  Monitor, Factory, Building2, Wrench, TrendingUp, Users,
  Shield, Truck, Leaf, Zap, FlaskConical, FolderOpen
}

function CategoryIcon({ name, size = 18 }: { name?: string; size?: number }) {
  const IC = name ? ICON_MAP[name] : FolderOpen
  return IC ? <IC size={size} /> : <FolderOpen size={size} />
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function ProjectTemplateList() {
  const [templates, setTemplates] = useState<ProjectTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Detail sheet
  const [detail, setDetail] = useState<TemplateDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Create from template
  const [createModal, setCreateModal] = useState<ProjectTemplate | null>(null)
  const [categories, setCategories] = useState<ProjectCategory[]>([])
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    category_id: '',
    planned_start: '',
    priority: 'medium',
  })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<ProjectTemplate | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ============================================
  // LOAD DATA
  // ============================================

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await projectTemplateService.getTemplates({ search, pageSize: 50 })
      setTemplates(res.data)
    } catch (err: any) {
      setError(err.message || 'Lỗi tải templates')
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  // Load categories for create modal
  useEffect(() => {
    projectCategoryService.getAllActive().then(setCategories).catch(() => {})
  }, [])

  // ============================================
  // VIEW DETAIL
  // ============================================

  const viewDetail = async (tmpl: ProjectTemplate) => {
    try {
      setLoadingDetail(true)
      const d = await projectTemplateService.getTemplateDetail(tmpl.id)
      setDetail(d)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingDetail(false)
    }
  }

  // ============================================
  // CREATE FROM TEMPLATE
  // ============================================

  const openCreateFromTemplate = (tmpl: ProjectTemplate) => {
    setCreateModal(tmpl)
    setCreateForm({
      name: '',
      description: tmpl.description || '',
      category_id: tmpl.category_id || '',
      planned_start: '',
      priority: tmpl.priority || 'medium',
    })
    setCreateError(null)
  }

  const handleCreateProject = async () => {
    if (!createModal) return
    if (!createForm.name.trim()) {
      setCreateError('Tên dự án không được để trống')
      return
    }

    try {
      setCreating(true)
      setCreateError(null)
      const result = await projectTemplateService.createFromTemplate({
        template_id: createModal.id,
        name: createForm.name.trim(),
        description: createForm.description?.trim(),
        category_id: createForm.category_id || undefined,
        planned_start: createForm.planned_start || undefined,
        priority: createForm.priority,
      })

      // Success — navigate to project detail
      setCreateModal(null)
      // TODO: navigate to /projects/${result.project_id}
      alert(`Tạo dự án thành công! Mã: ${result.code}`)
    } catch (err: any) {
      setCreateError(err.message || 'Lỗi tạo dự án')
    } finally {
      setCreating(false)
    }
  }

  // ============================================
  // DELETE TEMPLATE
  // ============================================

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      setDeleting(true)
      await projectTemplateService.deleteTemplate(deleteTarget.id)
      setDeleteTarget(null)
      loadTemplates()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  // ============================================
  // PRIORITY BADGE
  // ============================================

  const PriorityBadge = ({ priority }: { priority: string }) => {
    const config: Record<string, { label: string; className: string }> = {
      critical: { label: 'Khẩn cấp', className: 'bg-red-100 text-red-700' },
      high: { label: 'Cao', className: 'bg-orange-100 text-orange-700' },
      medium: { label: 'Trung bình', className: 'bg-blue-100 text-blue-700' },
      low: { label: 'Thấp', className: 'bg-gray-100 text-gray-600' },
    }
    const c = config[priority] || config.medium
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.className}`}>
        {c.label}
      </span>
    )
  }

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => window.history.back()}
                className="p-2 -ml-2 text-gray-500 hover:text-gray-700 rounded-lg"
              >
                <ChevronLeft size={22} />
              </button>
              <div>
                <h1 className="text-lg font-bold text-gray-900">Templates dự án</h1>
                <p className="text-sm text-gray-500">{templates.length} mẫu</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="max-w-5xl mx-auto px-4 py-3">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Tìm template..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-8 py-2.5 border border-gray-300 rounded-lg text-[15px]
                       focus:outline-none focus:ring-2 focus:ring-[#2D8B6E]"
            style={{ minHeight: 44 }}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="max-w-5xl mx-auto px-4 pb-2">
          <div className="flex items-center gap-2 px-4 py-3 bg-red-50 text-red-700 rounded-lg text-sm">
            <AlertCircle size={18} />
            {error}
            <button onClick={() => setError(null)} className="ml-auto"><X size={16} /></button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 pb-24">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-[#1B4D3E]" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-20">
            <Layers size={48} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 mb-2">Chưa có template nào</p>
            <p className="text-sm text-gray-400">
              Tạo dự án → Hoàn thành → Đánh dấu làm template
            </p>
          </div>
        ) : (
          /* Card Grid */
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((tmpl) => (
              <div
                key={tmpl.id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden
                           hover:border-[#2D8B6E] hover:shadow-md transition-all group"
              >
                {/* Card Header — Color strip */}
                <div
                  className="h-2"
                  style={{ backgroundColor: tmpl.category_color || '#1B4D3E' }}
                />

                <div className="p-4">
                  {/* Category + Priority */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: (tmpl.category_color || '#1B4D3E') + '18' }}
                      >
                        <CategoryIcon
                          name={tmpl.category_icon || undefined}
                          size={16}
                        />
                      </div>
                      <span className="text-xs text-gray-500">
                        {tmpl.category_name || 'Chưa phân loại'}
                      </span>
                    </div>
                    <PriorityBadge priority={tmpl.priority} />
                  </div>

                  {/* Name */}
                  <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2">
                    {tmpl.name}
                  </h3>
                  {tmpl.description && (
                    <p className="text-sm text-gray-500 mb-3 line-clamp-2">
                      {tmpl.description}
                    </p>
                  )}

                  {/* Badges */}
                  <div className="flex items-center gap-3 mb-4 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <Layers size={14} />
                      {tmpl.phase_count || 0} giai đoạn
                    </span>
                    <span className="flex items-center gap-1">
                      <Flag size={14} />
                      {tmpl.milestone_count || 0} mốc
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => openCreateFromTemplate(tmpl)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-[#1B4D3E] text-white
                                 rounded-lg text-sm font-medium hover:bg-[#163d32] active:scale-[0.97] transition-all"
                      style={{ minHeight: 44 }}
                    >
                      <Copy size={16} />
                      Tạo DA
                    </button>
                    <button
                      onClick={() => viewDetail(tmpl)}
                      className="p-2.5 border border-gray-200 rounded-lg text-gray-500
                                 hover:text-[#2563EB] hover:border-blue-200 hover:bg-blue-50 transition-all"
                      title="Xem chi tiết"
                      style={{ minWidth: 44, minHeight: 44 }}
                    >
                      <Eye size={18} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(tmpl)}
                      className="p-2.5 border border-gray-200 rounded-lg text-gray-500
                                 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-all"
                      title="Xóa"
                      style={{ minWidth: 44, minHeight: 44 }}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ============================================ */}
      {/* DETAIL BOTTOM SHEET                          */}
      {/* ============================================ */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDetail(null)} />
          <div className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl
                          max-h-[85vh] overflow-y-auto z-10">
            <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-lg font-bold text-gray-900">Chi tiết template</h2>
              <button onClick={() => setDetail(null)} className="p-2 -mr-2 text-gray-400">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Header */}
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">{detail.name}</h3>
                <p className="text-sm text-gray-500">{detail.code}</p>
                {detail.description && (
                  <p className="mt-2 text-gray-600">{detail.description}</p>
                )}
              </div>

              {/* Phases */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <Layers size={18} className="text-[#2D8B6E]" />
                  Giai đoạn ({detail.phases.length})
                </h4>
                {detail.phases.length === 0 ? (
                  <p className="text-sm text-gray-400">Chưa có giai đoạn</p>
                ) : (
                  <div className="space-y-2">
                    {detail.phases.map((phase, i) => (
                      <div key={phase.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                          style={{ backgroundColor: phase.color || '#1B4D3E' }}
                        >
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-sm">{phase.name}</p>
                          {phase.description && (
                            <p className="text-xs text-gray-500 truncate">{phase.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Milestones */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <Flag size={18} className="text-[#E8A838]" />
                  Mốc quan trọng ({detail.milestones.length})
                </h4>
                {detail.milestones.length === 0 ? (
                  <p className="text-sm text-gray-400">Chưa có mốc</p>
                ) : (
                  <div className="space-y-2">
                    {detail.milestones.map((ms) => (
                      <div key={ms.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        <div className="w-3 h-3 rounded-full bg-[#E8A838] flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-sm">{ms.name}</p>
                          {ms.description && (
                            <p className="text-xs text-gray-500 truncate">{ms.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Action */}
            <div className="sticky bottom-0 bg-white border-t px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <button
                onClick={() => {
                  setDetail(null)
                  openCreateFromTemplate(detail)
                }}
                className="w-full py-3 bg-[#1B4D3E] text-white rounded-lg font-medium text-[15px]
                           flex items-center justify-center gap-2 hover:bg-[#163d32] active:scale-[0.98]"
                style={{ minHeight: 48 }}
              >
                <Copy size={18} />
                Tạo dự án từ template này
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* CREATE FROM TEMPLATE MODAL                   */}
      {/* ============================================ */}
      {createModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => !creating && setCreateModal(null)} />
          <div className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl
                          max-h-[90vh] overflow-y-auto z-10">
            <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between rounded-t-2xl">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Tạo dự án mới</h2>
                <p className="text-sm text-gray-500">Từ template: {createModal.name}</p>
              </div>
              <button onClick={() => !creating && setCreateModal(null)} className="p-2 -mr-2 text-gray-400">
                <X size={20} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {createError && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 text-red-700 rounded-lg text-sm">
                  <AlertCircle size={16} />
                  {createError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Tên dự án <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="VD: Triển khai ERP Phase 2"
                  className="w-full px-3.5 py-3 border border-gray-300 rounded-lg text-[15px]
                             focus:outline-none focus:ring-2 focus:ring-[#2D8B6E]"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Mô tả</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm(p => ({ ...p, description: e.target.value }))}
                  rows={2}
                  className="w-full px-3.5 py-3 border border-gray-300 rounded-lg text-[15px] resize-none
                             focus:outline-none focus:ring-2 focus:ring-[#2D8B6E]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Loại dự án</label>
                  <select
                    value={createForm.category_id}
                    onChange={(e) => setCreateForm(p => ({ ...p, category_id: e.target.value }))}
                    className="w-full px-3.5 py-3 border border-gray-300 rounded-lg text-[15px]
                               focus:outline-none focus:ring-2 focus:ring-[#2D8B6E] bg-white"
                  >
                    <option value="">Chọn loại</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Ngày bắt đầu</label>
                  <input
                    type="date"
                    value={createForm.planned_start}
                    onChange={(e) => setCreateForm(p => ({ ...p, planned_start: e.target.value }))}
                    className="w-full px-3.5 py-3 border border-gray-300 rounded-lg text-[15px]
                               focus:outline-none focus:ring-2 focus:ring-[#2D8B6E]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Ưu tiên</label>
                <div className="flex gap-2">
                  {[
                    { value: 'low', label: 'Thấp', color: 'bg-gray-100 text-gray-600 border-gray-200' },
                    { value: 'medium', label: 'TB', color: 'bg-blue-100 text-blue-700 border-blue-200' },
                    { value: 'high', label: 'Cao', color: 'bg-orange-100 text-orange-700 border-orange-200' },
                    { value: 'critical', label: 'KC', color: 'bg-red-100 text-red-700 border-red-200' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setCreateForm(p => ({ ...p, priority: opt.value }))}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-medium border-2 transition-all ${
                        createForm.priority === opt.value
                          ? `${opt.color} border-current`
                          : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                      }`}
                      style={{ minHeight: 44 }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Info note */}
              <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-50 text-blue-700 rounded-lg text-sm">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>
                  Sẽ clone {createModal.phase_count || 0} giai đoạn và {createModal.milestone_count || 0} mốc.
                  Thành viên, tasks, rủi ro sẽ không được copy.
                </span>
              </div>
            </div>

            {/* Action Bar */}
            <div className="sticky bottom-0 bg-white border-t px-5 py-4 flex gap-3
                            pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <button
                onClick={() => setCreateModal(null)}
                disabled={creating}
                className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium
                           hover:bg-gray-50 disabled:opacity-50"
                style={{ minHeight: 48 }}
              >
                Hủy
              </button>
              <button
                onClick={handleCreateProject}
                disabled={creating || !createForm.name.trim()}
                className="flex-1 py-3 bg-[#1B4D3E] text-white rounded-lg font-medium
                           hover:bg-[#163d32] active:scale-[0.98] disabled:opacity-50
                           flex items-center justify-center gap-2"
                style={{ minHeight: 48 }}
              >
                {creating ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Đang tạo...
                  </>
                ) : (
                  <>
                    <Check size={18} />
                    Tạo dự án
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* DELETE CONFIRM                               */}
      {/* ============================================ */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => !deleting && setDeleteTarget(null)} />
          <div className="relative mx-4 w-full max-w-sm bg-white rounded-2xl p-6 z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 size={24} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Xóa template?</h3>
                <p className="text-sm text-gray-500">{deleteTarget.name}</p>
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-5">
              Template và các phases/milestones mẫu sẽ bị xóa vĩnh viễn.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium
                           hover:bg-gray-50 disabled:opacity-50"
                style={{ minHeight: 48 }}
              >
                Hủy
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-3 bg-red-600 text-white rounded-lg font-medium
                           hover:bg-red-700 active:scale-[0.98] disabled:opacity-50
                           flex items-center justify-center gap-2"
                style={{ minHeight: 48 }}
              >
                {deleting ? <Loader2 size={18} className="animate-spin" /> : 'Xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}