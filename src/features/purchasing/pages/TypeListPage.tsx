// src/features/purchasing/pages/TypeListPage.tsx
// Trang quản lý Loại vật tư (Material Types) - Cấp 2
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Tag,
  Filter,
} from 'lucide-react'

// ✅ Import default — đảm bảo lấy đúng object service
import materialTypeService, { type MaterialType } from '../../../services/materialTypeService'
import materialCategoryService, { type MaterialCategory } from '../../../services/materialCategoryService'

import TypeForm from './components/materials/TypeForm'

export default function TypeListPage() {
  // ============================================
  // STATE
  // ============================================
  const [types, setTypes] = useState<MaterialType[]>([])
  const [categories, setCategories] = useState<MaterialCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Pagination
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)

  // Filters
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<boolean | 'all'>('all')

  // Modal
  const [showForm, setShowForm] = useState(false)
  const [editingType, setEditingType] = useState<MaterialType | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<MaterialType | null>(null)

  // Material counts
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({})

  // ============================================
  // FETCH DATA
  // ============================================

  const fetchCategories = useCallback(async () => {
    try {
      const data = await materialCategoryService.getAllActive()
      setCategories(data)
    } catch (err) {
      console.error('Error fetching categories:', err)
    }
  }, [])

  const fetchTypes = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await materialTypeService.getAll({
        page,
        pageSize,
        search: search.trim() || undefined,
        category_id: categoryFilter || undefined,
        is_active: statusFilter,
      })

      setTypes(response.data)
      setTotal(response.total)
      setTotalPages(response.totalPages)

      // Đếm vật tư cho từng loại
      const counts: Record<string, number> = {}
      for (const type of response.data) {
        counts[type.id] = await materialTypeService.countMaterials(type.id)
      }
      setTypeCounts(counts)
    } catch (err) {
      console.error('Error fetching types:', err)
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, search, categoryFilter, statusFilter])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  useEffect(() => {
    fetchTypes()
  }, [fetchTypes])

  // Reset page khi filter thay đổi
  useEffect(() => {
    setPage(1)
  }, [search, categoryFilter, statusFilter])

  // Auto ẩn thông báo
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(null), 3000)
      return () => clearTimeout(t)
    }
  }, [success])

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(null), 5000)
      return () => clearTimeout(t)
    }
  }, [error])

  // ============================================
  // HANDLERS
  // ============================================

  const handleCreate = () => {
    setEditingType(null)
    setShowForm(true)
  }

  const handleEdit = (type: MaterialType) => {
    setEditingType(type)
    setShowForm(true)
  }

  const handleDelete = async (type: MaterialType) => {
    try {
      await materialTypeService.delete(type.id)
      setSuccess(`Đã xóa loại "${type.name}"`)
      setDeleteConfirm(null)
      fetchTypes()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xóa loại')
    }
  }

  const handleToggleActive = async (type: MaterialType) => {
    try {
      await materialTypeService.toggleActive(type.id, !type.is_active)
      setSuccess(`Đã ${type.is_active ? 'vô hiệu hóa' : 'kích hoạt'} loại "${type.name}"`)
      fetchTypes()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cập nhật trạng thái')
    }
  }

  const handleFormSuccess = () => {
    setShowForm(false)
    setEditingType(null)
    setSuccess(editingType ? 'Cập nhật thành công!' : 'Tạo mới thành công!')
    fetchTypes()
  }

  // Helper: tìm category info
  const getCategoryInfo = (categoryId: string) => {
    return categories.find((c) => c.id === categoryId) || null
  }

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Loại vật tư</h1>
          <p className="text-sm text-gray-500 mt-1">
            Quản lý danh mục loại vật tư (cấp 2, thuộc nhóm)
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Thêm loại
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Tìm theo mã hoặc tên..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Category Filter */}
          <div className="w-56">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none"
              >
                <option value="">Tất cả nhóm</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Status Filter */}
          <div className="w-44">
            <select
              value={statusFilter === 'all' ? 'all' : statusFilter ? 'true' : 'false'}
              onChange={(e) => {
                if (e.target.value === 'all') setStatusFilter('all')
                else setStatusFilter(e.target.value === 'true')
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="true">Đang hoạt động</option>
              <option value="false">Đã vô hiệu</option>
            </select>
          </div>

          {/* Refresh */}
          <button
            onClick={fetchTypes}
            disabled={loading}
            className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Loại vật tư
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mã
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nhóm
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Số vật tư
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Thứ tự
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Trạng thái
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Đang tải...
                  </td>
                </tr>
              ) : types.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    {search || categoryFilter || statusFilter !== 'all'
                      ? 'Không tìm thấy loại vật tư phù hợp'
                      : 'Chưa có loại vật tư nào'}
                  </td>
                </tr>
              ) : (
                types.map((type) => {
                  const catInfo = getCategoryInfo(type.category_id)
                  return (
                    <tr key={type.id} className="hover:bg-gray-50">
                      {/* Tên + mô tả */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-500">
                            <Tag className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">{type.name}</div>
                            {type.description && (
                              <div className="text-sm text-gray-500 truncate max-w-xs">
                                {type.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Mã */}
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {type.code}
                        </span>
                      </td>

                      {/* Nhóm */}
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">
                          {type.category_name || catInfo?.name || 'N/A'}
                        </span>
                      </td>

                      {/* Số vật tư */}
                      <td className="px-4 py-3 text-center text-sm text-gray-600">
                        {typeCounts[type.id] ?? 0}
                      </td>

                      {/* Thứ tự */}
                      <td className="px-4 py-3 text-center text-sm text-gray-600">
                        {type.sort_order}
                      </td>

                      {/* Trạng thái */}
                      <td className="px-4 py-3 text-center">
                        {type.is_active ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Hoạt động
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            Vô hiệu
                          </span>
                        )}
                      </td>

                      {/* Thao tác */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleToggleActive(type)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                            title={type.is_active ? 'Vô hiệu hóa' : 'Kích hoạt'}
                          >
                            {type.is_active ? (
                              <ToggleRight className="w-5 h-5 text-green-600" />
                            ) : (
                              <ToggleLeft className="w-5 h-5" />
                            )}
                          </button>
                          <button
                            onClick={() => handleEdit(type)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                            title="Chỉnh sửa"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(type)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                            title="Xóa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Hiển thị {(page - 1) * pageSize + 1} -{' '}
              {Math.min(page * pageSize, total)} / {total} loại
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-2 text-sm">
                Trang {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <TypeForm
          type={editingType}
          categories={categories}
          defaultCategoryId={categoryFilter}
          onClose={() => {
            setShowForm(false)
            setEditingType(null)
          }}
          onSuccess={handleFormSuccess}
        />
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/50"
              onClick={() => setDeleteConfirm(null)}
            />
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Xác nhận xóa
              </h3>
              <p className="text-gray-600 mb-6">
                Bạn có chắc muốn xóa loại{' '}
                <strong>"{deleteConfirm.name}"</strong>?
                <br />
                <span className="text-sm text-gray-500">
                  Loại sẽ bị vô hiệu hóa và không thể sử dụng để tạo vật tư
                  mới.
                </span>
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Hủy
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700"
                >
                  Xóa
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}