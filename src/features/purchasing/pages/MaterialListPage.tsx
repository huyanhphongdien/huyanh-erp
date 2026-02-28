// ============================================================================
// MATERIAL LIST PAGE
// File: src/features/purchasing/pages/MaterialListPage.tsx
// Huy Anh ERP System - Module Quản lý đơn hàng
// Phase 2E: Material UI
// ============================================================================
// FIX: Thay is_active/isActive bằng status để khớp database schema
// FIX: Thêm null check cho current_stock và min_stock
// ============================================================================

import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Search, 
  Plus, 
  Eye,
  Pencil, 
  Trash2, 
  Filter,
  ChevronLeft,
  ChevronRight,
  Package,
  RefreshCw,
  Power,
  PowerOff,
  AlertTriangle,
  X,
  Building2,
  Layers,
  Tag,
  Boxes
} from 'lucide-react'
import { 
  materialService, 
  type Material,
  type MaterialPaginationParams
} from '../../../services/materialService'
import { materialCategoryService, type MaterialCategory } from '../../../services/materialCategoryService'
import { materialTypeService, type MaterialType } from '../../../services/materialTypeService'
import MaterialForm from './components/materials/MaterialForm'

const MaterialListPage: React.FC = () => {
  const navigate = useNavigate()

  // State
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [filterType, setFilterType] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterLowStock, setFilterLowStock] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 15

  // Dropdown data
  const [categories, setCategories] = useState<MaterialCategory[]>([])
  const [types, setTypes] = useState<MaterialType[]>([])

  // Modal state
  const [showForm, setShowForm] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<Material | null>(null)

  // Stats
  const [stats, setStats] = useState<{
    total: number
    active: number
    lowStock: number
  }>({ total: 0, active: 0, lowStock: 0 })

  // Fetch categories for filter
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const data = await materialCategoryService.getAllActive()
        setCategories(data)
      } catch (error) {
        console.error('Error fetching categories:', error)
      }
    }
    fetchCategories()
  }, [])

  // Fetch types when category changes
  useEffect(() => {
    const fetchTypes = async () => {
      if (filterCategory) {
        try {
          const data = await materialTypeService.getByCategory(filterCategory)
          setTypes(data)
        } catch (error) {
          console.error('Error fetching types:', error)
        }
      } else {
        setTypes([])
        setFilterType('')
      }
    }
    fetchTypes()
  }, [filterCategory])

  // Fetch materials
  const fetchMaterials = async () => {
    try {
      setLoading(true)
      const params: MaterialPaginationParams = {
        page,
        pageSize,
        search: search || undefined,
        categoryId: filterCategory || undefined,
        typeId: filterType || undefined,
        status: filterStatus === 'all' ? undefined : filterStatus as 'active' | 'inactive',
        lowStock: filterLowStock || undefined
      }
      const result = await materialService.getAll(params)
      setMaterials(result.data)
      setTotalPages(result.totalPages)
      setTotal(result.total)
    } catch (error) {
      console.error('Error fetching materials:', error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch stats
  const fetchStats = async () => {
    try {
      const data = await materialService.getStats()
      setStats({
        total: data.total || 0,
        active: data.active || 0,
        lowStock: data.lowStock || 0
      })
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }

  useEffect(() => {
    fetchMaterials()
  }, [page, search, filterCategory, filterType, filterStatus, filterLowStock])

  useEffect(() => {
    fetchStats()
  }, [])

  // Handlers
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setPage(1)
  }

  const handleFilterCategory = (categoryId: string) => {
    setFilterCategory(categoryId)
    setFilterType('')
    setPage(1)
  }

  const handleFilterType = (typeId: string) => {
    setFilterType(typeId)
    setPage(1)
  }

  const handleCreate = () => {
    setEditingMaterial(null)
    setShowForm(true)
  }

  const handleEdit = (material: Material) => {
    setEditingMaterial(material)
    setShowForm(true)
  }

  const handleView = (material: Material) => {
    navigate(`/purchasing/materials/${material.id}`)
  }

  const handleFormSuccess = () => {
    setShowForm(false)
    setEditingMaterial(null)
    fetchMaterials()
    fetchStats()
  }

  const handleToggleActive = async (material: Material) => {
    try {
      if (material.status === 'active') {
        await materialService.deactivate(material.id)
      } else {
        await materialService.activate(material.id)
      }
      fetchMaterials()
      fetchStats()
    } catch (error: any) {
      alert(error.message || 'Có lỗi xảy ra')
    }
  }

  const handleDelete = async (material: Material) => {
    try {
      await materialService.delete(material.id)
      setShowDeleteConfirm(null)
      fetchMaterials()
      fetchStats()
    } catch (error: any) {
      alert(error.message || 'Có lỗi xảy ra khi xóa')
    }
  }

  const clearFilters = () => {
    setSearch('')
    setFilterCategory('')
    setFilterType('')
    setFilterStatus('all')
    setFilterLowStock(false)
    setPage(1)
  }

  const hasFilters = search || filterCategory || filterType || filterStatus !== 'all' || filterLowStock

  // Format currency
  const formatCurrency = (value?: number | null) => {
    if (value == null) return '-'
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(value)
  }

  // Helper: Get stock value safely - FIX: chỉ dùng current_stock
  const getStock = (material: Material): number => {
    return material.current_stock ?? 0
  }

  const getMinStock = (material: Material): number => {
    return material.min_stock ?? 0
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Danh mục vật tư</h1>
          <p className="text-gray-600 mt-1">Quản lý vật tư, nguyên liệu</p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Thêm vật tư
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Package className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Tổng vật tư</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 rounded-lg">
              <Power className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Đang hoạt động</p>
              <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-100 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Tồn kho thấp</p>
              <p className="text-2xl font-bold text-red-600">{stats.lowStock}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Tìm theo mã hoặc tên vật tư..."
                value={search}
                onChange={handleSearch}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Filter by Category */}
          <div className="w-48">
            <select
              value={filterCategory}
              onChange={(e) => handleFilterCategory(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Tất cả nhóm</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Filter by Type */}
          <div className="w-48">
            <select
              value={filterType}
              onChange={(e) => handleFilterType(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              disabled={!filterCategory}
            >
              <option value="">Tất cả loại</option>
              {types.map(type => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>

          {/* Filter by Status */}
          <div className="w-40">
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value)
                setPage(1)
              }}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Tất cả</option>
              <option value="active">Đang hoạt động</option>
              <option value="inactive">Ngưng hoạt động</option>
            </select>
          </div>

          {/* Low Stock Toggle */}
          <button
            onClick={() => {
              setFilterLowStock(!filterLowStock)
              setPage(1)
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
              filterLowStock 
                ? 'bg-red-50 border-red-300 text-red-700' 
                : 'hover:bg-gray-50'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            Tồn kho thấp
          </button>

          {/* Refresh */}
          <button
            onClick={() => {
              fetchMaterials()
              fetchStats()
            }}
            className="p-2 border rounded-lg hover:bg-gray-50 transition-colors"
            title="Làm mới"
          >
            <RefreshCw className="w-5 h-5 text-gray-600" />
          </button>

          {/* Clear Filters */}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
              Xóa bộ lọc
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Mã</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Tên vật tư</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Nhóm / Loại</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">ĐVT</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Tồn kho</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Giá gần nhất</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Trạng thái</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <div className="flex justify-center">
                      <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                    <p className="mt-2 text-gray-500">Đang tải...</p>
                  </td>
                </tr>
              ) : materials.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <Package className="w-12 h-12 text-gray-300 mx-auto" />
                    <p className="mt-2 text-gray-500">Không có vật tư nào</p>
                    <button
                      onClick={handleCreate}
                      className="mt-3 text-blue-600 hover:underline"
                    >
                      + Thêm vật tư mới
                    </button>
                  </td>
                </tr>
              ) : (
                materials.map(material => {
                  const stockValue = getStock(material)
                  const minStockValue = getMinStock(material)
                  const isLowStock = stockValue < minStockValue
                  
                  return (
                    <tr key={material.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm font-medium text-blue-600">
                          {material.code}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-900">{material.name}</p>
                            {(material as any).has_variants && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded bg-purple-100 text-purple-700" title="Có biến thể">
                                <Boxes className="w-3 h-3" />
                                Biến thể
                              </span>
                            )}
                          </div>
                          {material.specifications && (
                            <p className="text-xs text-gray-500 truncate max-w-xs">
                              {material.specifications}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {material.category && (
                            <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                              <Layers className="w-3 h-3" />
                              {material.category.name}
                            </span>
                          )}
                          {material.type && (
                            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                              <Tag className="w-3 h-3" />
                              {material.type.name}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">
                          {material.unit?.symbol || material.unit?.name || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className={`font-medium ${isLowStock ? 'text-red-600' : 'text-gray-900'}`}>
                          {stockValue.toLocaleString()}
                          {isLowStock && (
                            <AlertTriangle className="w-4 h-4 inline ml-1" />
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
                          Tối thiểu: {minStockValue.toLocaleString()}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm text-gray-900">
                          {formatCurrency(material.last_purchase_price)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {material.status === 'active' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                            <Power className="w-3 h-3" />
                            Hoạt động
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                            <PowerOff className="w-3 h-3" />
                            Ngưng
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-1">
                          <button
                            onClick={() => handleView(material)}
                            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Xem chi tiết"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEdit(material)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Sửa"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleActive(material)}
                            className={`p-2 rounded-lg transition-colors ${
                              material.status === 'active'
                                ? 'text-orange-600 hover:bg-orange-50' 
                                : 'text-green-600 hover:bg-green-50'
                            }`}
                            title={material.status === 'active' ? 'Ngưng hoạt động' : 'Kích hoạt'}
                          >
                            {material.status === 'active' ? (
                              <PowerOff className="w-4 h-4" />
                            ) : (
                              <Power className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(material)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <div className="text-sm text-gray-600">
              Hiển thị {materials.length} / {total} vật tư
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 border rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600">
                Trang {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 border rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Material Form Modal */}
      {showForm && (
        <MaterialForm
          material={editingMaterial}
          onClose={() => {
            setShowForm(false)
            setEditingMaterial(null)
          }}
          onSuccess={handleFormSuccess}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Xác nhận xóa
            </h3>
            <p className="text-gray-600 mb-6">
              Bạn có chắc muốn xóa vật tư <strong>"{showDeleteConfirm.name}"</strong> ({showDeleteConfirm.code})?
              <br />
              <span className="text-sm text-red-600 mt-2 block">
                Lưu ý: Không thể xóa vật tư đang được sử dụng trong đơn hàng.
              </span>
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MaterialListPage