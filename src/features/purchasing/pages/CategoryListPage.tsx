// src/features/purchasing/pages/materials/CategoryListPage.tsx
// Trang quản lý Nhóm vật tư (Material Categories)
// FIX: Đã bỏ code/icon/color/sort_order (không có trong DB hiện tại)
//      Thêm cột type (raw/finished) từ WMS
import { useState, useEffect, useCallback } from 'react'
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  ToggleLeft, 
  ToggleRight,
  Package,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  RefreshCw
} from 'lucide-react'
import { 
  materialCategoryService, 
  MaterialCategory
} from '../../../services/materialCategoryService'
import CategoryForm from './components/materials/CategoryForm'

export default function CategoryListPage() {
  // State
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
  const [statusFilter, setStatusFilter] = useState<boolean | 'all'>('all')
  
  // Modal
  const [showForm, setShowForm] = useState(false)
  const [editingCategory, setEditingCategory] = useState<MaterialCategory | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<MaterialCategory | null>(null)
  
  // Counts cache
  const [categoryCounts, setCategoryCounts] = useState<Record<string, { types: number; materials: number }>>({})

  // ============================================
  // FETCH DATA
  // ============================================

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await materialCategoryService.getAll({
        page,
        pageSize,
        search: search.trim() || undefined,
        is_active: statusFilter
      })
      
      setCategories(response.data)
      setTotal(response.total)
      setTotalPages(response.totalPages)

      // Fetch counts for each category
      const counts: Record<string, { types: number; materials: number }> = {}
      for (const cat of response.data) {
        const [types, materials] = await Promise.all([
          materialCategoryService.getTypeCount(cat.id),
          materialCategoryService.getMaterialCount(cat.id)
        ])
        counts[cat.id] = { types, materials }
      }
      setCategoryCounts(counts)
      
    } catch (err) {
      console.error('Error fetching categories:', err)
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, search, statusFilter])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [search, statusFilter])

  // Auto hide messages
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [success])

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [error])

  // ============================================
  // HANDLERS
  // ============================================

  const handleCreate = () => {
    setEditingCategory(null)
    setShowForm(true)
  }

  const handleEdit = (category: MaterialCategory) => {
    setEditingCategory(category)
    setShowForm(true)
  }

  const handleDelete = async (category: MaterialCategory) => {
    try {
      await materialCategoryService.delete(category.id)
      setSuccess(`Đã xóa nhóm "${category.name}"`)
      setDeleteConfirm(null)
      fetchCategories()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xóa nhóm')
    }
  }

  const handleToggleActive = async (category: MaterialCategory) => {
    try {
      await materialCategoryService.toggleActive(category.id, category.is_active)
      setSuccess(`Đã ${category.is_active ? 'vô hiệu hóa' : 'kích hoạt'} nhóm "${category.name}"`)
      fetchCategories()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cập nhật trạng thái')
    }
  }

  const handleFormSuccess = () => {
    setShowForm(false)
    setEditingCategory(null)
    setSuccess(editingCategory ? 'Cập nhật thành công!' : 'Tạo mới thành công!')
    fetchCategories()
  }

  // ============================================
  // RENDER HELPERS
  // ============================================

  const getTypeBadge = (type?: string) => {
    switch (type) {
      case 'raw':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
            Nguyên liệu
          </span>
        )
      case 'finished':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            Thành phẩm
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
            Chưa phân loại
          </span>
        )
    }
  }

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nhóm vật tư</h1>
          <p className="text-sm text-gray-500 mt-1">
            Quản lý danh mục nhóm vật tư (cấp 1)
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Thêm nhóm
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
                placeholder="Tìm theo tên nhóm..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Status Filter */}
          <div className="w-48">
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
            onClick={fetchCategories}
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
                  Nhóm vật tư
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Phân loại
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Số loại
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Số vật tư
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
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Đang tải...
                  </td>
                </tr>
              ) : categories.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    {search || statusFilter !== 'all' 
                      ? 'Không tìm thấy nhóm vật tư phù hợp'
                      : 'Chưa có nhóm vật tư nào'}
                  </td>
                </tr>
              ) : (
                categories.map((category) => (
                  <tr key={category.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-gray-500">
                          <Package className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{category.name}</div>
                          {category.description && (
                            <div className="text-sm text-gray-500 truncate max-w-xs">
                              {category.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {getTypeBadge(category.type)}
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-600">
                      {categoryCounts[category.id]?.types || 0}
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-600">
                      {categoryCounts[category.id]?.materials || 0}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {category.is_active ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Hoạt động
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          Vô hiệu
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleToggleActive(category)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title={category.is_active ? 'Vô hiệu hóa' : 'Kích hoạt'}
                        >
                          {category.is_active ? (
                            <ToggleRight className="w-5 h-5 text-green-600" />
                          ) : (
                            <ToggleLeft className="w-5 h-5" />
                          )}
                        </button>
                        <button
                          onClick={() => handleEdit(category)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title="Chỉnh sửa"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(category)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                          title="Xóa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Hiển thị {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, total)} / {total} nhóm
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-2 text-sm">
                Trang {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
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
        <CategoryForm
          category={editingCategory}
          onClose={() => {
            setShowForm(false)
            setEditingCategory(null)
          }}
          onSuccess={handleFormSuccess}
        />
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setDeleteConfirm(null)} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Xác nhận xóa
              </h3>
              <p className="text-gray-600 mb-6">
                Bạn có chắc muốn xóa nhóm <strong>"{deleteConfirm.name}"</strong>?
                <br />
                <span className="text-sm text-gray-500">
                  Nhóm sẽ bị vô hiệu hóa và không thể sử dụng để tạo vật tư mới.
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