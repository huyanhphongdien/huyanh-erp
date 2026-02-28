// src/pages/projects/ProjectCategoryPage.tsx
// PM2 - Bước 2.3: Quản lý danh mục loại dự án
// Pattern: WMS Category Page — Industrial Rubber Theme
// Mobile-first, Desktop responsive

import React, { useState, useEffect, useCallback } from 'react'
import {
  // Icons
  Plus, Search, X, Edit2, Trash2, ToggleLeft, ToggleRight,
  ChevronLeft, Loader2, AlertCircle, Check, FolderOpen,
  Monitor, Factory, Building2, Wrench, TrendingUp, Users,
  Shield, Truck, Leaf, Zap, FlaskConical, Palette
} from 'lucide-react'
import {
  projectCategoryService,
  ProjectCategory,
  ProjectCategoryFormData,
  PROJECT_CATEGORY_ICONS,
  PROJECT_CATEGORY_COLORS,
} from '../../services/project/projectCategoryService'

// ============================================
// ICON MAP — render Lucide icon từ string name
// ============================================

const ICON_MAP: Record<string, React.FC<any>> = {
  Monitor, Factory, Building2, Wrench, TrendingUp, Users,
  Shield, Truck, Leaf, Zap, FlaskConical, FolderOpen
}

function CategoryIcon({ name, size = 20, className = '' }: { name?: string; size?: number; className?: string }) {
  const IconComponent = name ? ICON_MAP[name] : FolderOpen
  if (!IconComponent) return <FolderOpen size={size} className={className} />
  return <IconComponent size={size} className={className} />
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function ProjectCategoryPage() {
  // State
  const [categories, setCategories] = useState<ProjectCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterActive, setFilterActive] = useState<boolean | 'all'>('all')
  
  // Modal state
  const [showForm, setShowForm] = useState(false)
  const [editingCategory, setEditingCategory] = useState<ProjectCategory | null>(null)
  const [formData, setFormData] = useState<ProjectCategoryFormData>({
    name: '',
    description: '',
    color: '#1B4D3E',
    icon: 'FolderOpen',
    is_active: true,
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  
  // Confirm delete
  const [deleteTarget, setDeleteTarget] = useState<ProjectCategory | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ============================================
  // LOAD DATA
  // ============================================

  const loadCategories = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await projectCategoryService.getAllWithCounts()
      
      // Client-side filter
      let filtered = data
      if (search) {
        const s = search.toLowerCase()
        filtered = filtered.filter(c => c.name.toLowerCase().includes(s))
      }
      if (filterActive !== 'all') {
        filtered = filtered.filter(c => c.is_active === filterActive)
      }
      
      setCategories(filtered)
    } catch (err: any) {
      setError(err.message || 'Lỗi tải danh mục')
    } finally {
      setLoading(false)
    }
  }, [search, filterActive])

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  // ============================================
  // FORM HANDLERS
  // ============================================

  const openCreateForm = () => {
    setEditingCategory(null)
    setFormData({
      name: '',
      description: '',
      color: '#1B4D3E',
      icon: 'FolderOpen',
      is_active: true,
    })
    setFormError(null)
    setShowForm(true)
  }

  const openEditForm = (cat: ProjectCategory) => {
    setEditingCategory(cat)
    setFormData({
      name: cat.name,
      description: cat.description || '',
      color: cat.color || '#1B4D3E',
      icon: cat.icon || 'FolderOpen',
      is_active: cat.is_active,
    })
    setFormError(null)
    setShowForm(true)
  }

  const handleSubmit = async () => {
    try {
      setSaving(true)
      setFormError(null)

      if (!formData.name?.trim()) {
        setFormError('Tên loại dự án không được để trống')
        return
      }

      if (editingCategory) {
        await projectCategoryService.update(editingCategory.id, formData)
      } else {
        await projectCategoryService.create(formData)
      }

      setShowForm(false)
      loadCategories()
    } catch (err: any) {
      setFormError(err.message || 'Lỗi lưu danh mục')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (cat: ProjectCategory) => {
    try {
      await projectCategoryService.toggleActive(cat.id)
      loadCategories()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      setDeleting(true)
      await projectCategoryService.delete(deleteTarget.id)
      setDeleteTarget(null)
      loadCategories()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setDeleting(false)
    }
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
                className="p-2 -ml-2 text-gray-500 hover:text-gray-700 active:bg-gray-100 rounded-lg"
              >
                <ChevronLeft size={22} />
              </button>
              <div>
                <h1 className="text-lg font-bold text-gray-900">Loại dự án</h1>
                <p className="text-sm text-gray-500">{categories.length} loại</p>
              </div>
            </div>
            <button
              onClick={openCreateForm}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#1B4D3E] text-white rounded-lg
                         hover:bg-[#163d32] active:scale-[0.97] transition-all text-sm font-medium"
              style={{ minHeight: 44 }}
            >
              <Plus size={18} />
              <span className="hidden sm:inline">Thêm loại</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="max-w-5xl mx-auto px-4 py-3">
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Search */}
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Tìm kiếm..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-8 py-2.5 border border-gray-300 rounded-lg text-[15px]
                         focus:outline-none focus:ring-2 focus:ring-[#2D8B6E] focus:border-transparent"
              style={{ minHeight: 44 }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Active filter */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {[
              { value: 'all' as const, label: 'Tất cả' },
              { value: true as const, label: 'Hoạt động' },
              { value: false as const, label: 'Ẩn' },
            ].map((opt) => (
              <button
                key={String(opt.value)}
                onClick={() => setFilterActive(opt.value)}
                className={`px-3 py-2 text-sm rounded-md transition-all ${
                  filterActive === opt.value
                    ? 'bg-white text-gray-900 shadow-sm font-medium'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                style={{ minHeight: 40 }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="max-w-5xl mx-auto px-4 pb-2">
          <div className="flex items-center gap-2 px-4 py-3 bg-red-50 text-red-700 rounded-lg text-sm">
            <AlertCircle size={18} />
            {error}
            <button onClick={() => setError(null)} className="ml-auto p-1">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 pb-24">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={32} className="animate-spin text-[#1B4D3E]" />
          </div>
        ) : categories.length === 0 ? (
          <div className="text-center py-20">
            <FolderOpen size={48} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">Chưa có loại dự án nào</p>
            <button
              onClick={openCreateForm}
              className="mt-4 px-4 py-2 bg-[#1B4D3E] text-white rounded-lg text-sm"
            >
              Thêm loại dự án đầu tiên
            </button>
          </div>
        ) : (
          /* Category Grid — Mobile cards / Desktop table-like */
          <div className="grid gap-3">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className={`bg-white rounded-xl border transition-all ${
                  cat.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'
                }`}
              >
                <div className="flex items-center gap-4 p-4">
                  {/* Icon + Color Badge */}
                  <div
                    className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: cat.color + '18' }}
                  >
                    <CategoryIcon
                      name={cat.icon || undefined}
                      size={24}
                      className="flex-shrink-0"
                      // @ts-ignore
                      style={{ color: cat.color }}
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-base font-semibold text-gray-900 truncate">
                        {cat.name}
                      </h3>
                      {!cat.is_active && (
                        <span className="flex-shrink-0 px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                          Ẩn
                        </span>
                      )}
                    </div>
                    {cat.description && (
                      <p className="text-sm text-gray-500 truncate">{cat.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      <span
                        className="inline-block w-3 h-3 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="text-xs text-gray-400">
                        {cat.project_count || 0} dự án
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleToggle(cat)}
                      className="p-2.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 active:bg-gray-100"
                      title={cat.is_active ? 'Ẩn' : 'Hiện'}
                      style={{ minWidth: 44, minHeight: 44 }}
                    >
                      {cat.is_active ? <ToggleRight size={20} className="text-[#16A34A]" /> : <ToggleLeft size={20} />}
                    </button>
                    <button
                      onClick={() => openEditForm(cat)}
                      className="p-2.5 rounded-lg text-gray-400 hover:text-[#2563EB] hover:bg-blue-50 active:bg-blue-100"
                      title="Sửa"
                      style={{ minWidth: 44, minHeight: 44 }}
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(cat)}
                      className="p-2.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 active:bg-red-100"
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
      {/* CREATE / EDIT FORM — Bottom Sheet Modal      */}
      {/* ============================================ */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !saving && setShowForm(false)}
          />

          {/* Sheet */}
          <div className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl
                          max-h-[90vh] overflow-y-auto animate-slide-up z-10">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <h2 className="text-lg font-bold text-gray-900">
                {editingCategory ? 'Sửa loại dự án' : 'Thêm loại dự án'}
              </h2>
              <button
                onClick={() => !saving && setShowForm(false)}
                className="p-2 -mr-2 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <div className="px-5 py-4 space-y-5">
              {/* Error */}
              {formError && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 text-red-700 rounded-lg text-sm">
                  <AlertCircle size={16} />
                  {formError}
                </div>
              )}

              {/* Tên */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Tên loại dự án <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="VD: Công nghệ thông tin"
                  className="w-full px-3.5 py-3 border border-gray-300 rounded-lg text-[15px]
                             focus:outline-none focus:ring-2 focus:ring-[#2D8B6E] focus:border-transparent"
                  autoFocus
                />
              </div>

              {/* Mô tả */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Mô tả</label>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Mô tả ngắn..."
                  rows={2}
                  className="w-full px-3.5 py-3 border border-gray-300 rounded-lg text-[15px] resize-none
                             focus:outline-none focus:ring-2 focus:ring-[#2D8B6E] focus:border-transparent"
                />
              </div>

              {/* Chọn Icon */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Biểu tượng</label>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {PROJECT_CATEGORY_ICONS.map((icon) => {
                    const isSelected = formData.icon === icon.value
                    return (
                      <button
                        key={icon.value}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, icon: icon.value }))}
                        className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${
                          isSelected
                            ? 'border-[#1B4D3E] bg-[#1B4D3E]/5'
                            : 'border-gray-200 hover:border-gray-300 active:bg-gray-50'
                        }`}
                        style={{ minHeight: 44 }}
                        title={icon.label}
                      >
                        <CategoryIcon name={icon.value} size={22} className={isSelected ? 'text-[#1B4D3E]' : 'text-gray-500'} />
                        <span className={`text-[10px] leading-tight text-center ${isSelected ? 'text-[#1B4D3E] font-medium' : 'text-gray-400'}`}>
                          {icon.label.split('/')[0].trim()}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Chọn Màu */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Màu hiển thị</label>
                <div className="flex flex-wrap gap-2">
                  {PROJECT_CATEGORY_COLORS.map((color) => {
                    const isSelected = formData.color === color.value
                    return (
                      <button
                        key={color.value}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, color: color.value }))}
                        className={`relative w-10 h-10 rounded-full border-2 transition-all ${
                          isSelected
                            ? 'border-gray-900 scale-110'
                            : 'border-transparent hover:scale-105'
                        }`}
                        style={{ backgroundColor: color.value, minWidth: 44, minHeight: 44 }}
                        title={color.label}
                      >
                        {isSelected && (
                          <Check size={18} className="absolute inset-0 m-auto text-white drop-shadow" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Preview */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Xem trước</label>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: (formData.color || '#1B4D3E') + '18' }}
                  >
                    <CategoryIcon
                      name={formData.icon || undefined}
                      size={22}
                      className="flex-shrink-0"
                      // @ts-ignore
                      style={{ color: formData.color || '#1B4D3E' }}
                    />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {formData.name || 'Tên loại dự án'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formData.description || 'Chưa có mô tả'}
                    </p>
                  </div>
                  <span
                    className="ml-auto w-3 h-3 rounded-full"
                    style={{ backgroundColor: formData.color || '#1B4D3E' }}
                  />
                </div>
              </div>
            </div>

            {/* Sticky Action Bar */}
            <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-4 flex gap-3
                            pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <button
                onClick={() => !saving && setShowForm(false)}
                disabled={saving}
                className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium text-[15px]
                           hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 transition-all"
                style={{ minHeight: 48 }}
              >
                Hủy
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || !formData.name?.trim()}
                className="flex-1 py-3 bg-[#1B4D3E] text-white rounded-lg font-medium text-[15px]
                           hover:bg-[#163d32] active:scale-[0.98] disabled:opacity-50 transition-all
                           flex items-center justify-center gap-2"
                style={{ minHeight: 48 }}
              >
                {saving ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Đang lưu...
                  </>
                ) : (
                  <>
                    <Check size={18} />
                    {editingCategory ? 'Cập nhật' : 'Tạo mới'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* DELETE CONFIRM DIALOG                        */}
      {/* ============================================ */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !deleting && setDeleteTarget(null)}
          />
          <div className="relative mx-4 w-full max-w-sm bg-white rounded-2xl p-6 z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 size={24} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Xóa loại dự án?</h3>
                <p className="text-sm text-gray-500">
                  {deleteTarget.name}
                  {(deleteTarget.project_count || 0) > 0 && (
                    <span className="text-red-600 font-medium">
                      {' '}— đang có {deleteTarget.project_count} dự án
                    </span>
                  )}
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-5">
              Loại dự án sẽ được ẩn đi (soft delete). Bạn có thể bật lại sau.
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
                {deleting ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  'Xóa'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animation CSS */}
      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}