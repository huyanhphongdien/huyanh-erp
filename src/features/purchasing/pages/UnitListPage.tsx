import React, { useState, useEffect } from 'react'
import { 
  Search, 
  Plus, 
  Pencil, 
  Trash2, 
  Filter,
  ChevronLeft,
  ChevronRight,
  Package,
  Scale,
  Droplets,
  Ruler,
  Square,
  RefreshCw,
  Power,
  PowerOff
} from 'lucide-react'
import { 
  unitService, 
  Unit, 
  UNIT_TYPES,
  getUnitTypeLabel,
  getUnitTypeColor 
} from '../../../services/unitService'
import UnitForm from './components/materials/UnitForm'

// Icon mapping for unit types
const UNIT_TYPE_ICONS: Record<string, React.ElementType> = {
  piece: Package,
  weight: Scale,
  volume: Droplets,
  length: Ruler,
  area: Square
}

const UnitListPage: React.FC = () => {
  // State
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<string>('')
  const [filterActive, setFilterActive] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 15

  // Modal state
  const [showForm, setShowForm] = useState(false)
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<Unit | null>(null)

  // Fetch data
  const fetchUnits = async () => {
    try {
      setLoading(true)
      const result = await unitService.getAll({
        page,
        pageSize,
        search: search || undefined,
        unitType: filterType || undefined,
        isActive: filterActive === 'all' ? undefined : filterActive === 'active'
      })
      setUnits(result.data)
      setTotalPages(result.totalPages)
      setTotal(result.total)
    } catch (error) {
      console.error('Error fetching units:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUnits()
  }, [page, search, filterType, filterActive])

  // Handlers
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setPage(1)
  }

  const handleFilterType = (type: string) => {
    setFilterType(type)
    setPage(1)
  }

  const handleFilterActive = (status: string) => {
    setFilterActive(status)
    setPage(1)
  }

  const handleCreate = () => {
    setEditingUnit(null)
    setShowForm(true)
  }

  const handleEdit = (unit: Unit) => {
    setEditingUnit(unit)
    setShowForm(true)
  }

  const handleFormSuccess = () => {
    setShowForm(false)
    setEditingUnit(null)
    fetchUnits()
  }

  const handleToggleActive = async (unit: Unit) => {
    try {
      if (unit.is_active) {
        await unitService.deactivate(unit.id)
      } else {
        await unitService.activate(unit.id)
      }
      fetchUnits()
    } catch (error: any) {
      alert(error.message || 'Có lỗi xảy ra')
    }
  }

  const handleDelete = async (unit: Unit) => {
    try {
      await unitService.delete(unit.id)
      setShowDeleteConfirm(null)
      fetchUnits()
    } catch (error: any) {
      alert(error.message || 'Có lỗi xảy ra khi xóa')
    }
  }

  // Get icon component for unit type
  const getUnitTypeIcon = (type: string) => {
    const IconComponent = UNIT_TYPE_ICONS[type] || Package
    return IconComponent
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Đơn vị tính</h1>
          <p className="text-gray-600 mt-1">Quản lý đơn vị tính cho vật tư</p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Thêm đơn vị
        </button>
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
                placeholder="Tìm theo mã, tên, ký hiệu..."
                value={search}
                onChange={handleSearch}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Filter by Type */}
          <div className="w-48">
            <select
              value={filterType}
              onChange={(e) => handleFilterType(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Tất cả loại</option>
              {UNIT_TYPES.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Filter by Status */}
          <div className="w-40">
            <select
              value={filterActive}
              onChange={(e) => handleFilterActive(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Tất cả</option>
              <option value="active">Đang hoạt động</option>
              <option value="inactive">Ngưng hoạt động</option>
            </select>
          </div>

          {/* Refresh */}
          <button
            onClick={fetchUnits}
            className="p-2 border rounded-lg hover:bg-gray-50 transition-colors"
            title="Làm mới"
          >
            <RefreshCw className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Quick filter chips */}
        <div className="flex flex-wrap gap-2 mt-4">
          <span className="text-sm text-gray-500 py-1">Lọc nhanh:</span>
          {UNIT_TYPES.map(type => {
            const Icon = UNIT_TYPE_ICONS[type.value] || Package
            return (
              <button
                key={type.value}
                onClick={() => handleFilterType(filterType === type.value ? '' : type.value)}
                className={`flex items-center gap-1.5 px-3 py-1 text-sm rounded-full transition-colors ${
                  filterType === type.value
                    ? type.color
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {type.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Mã</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Tên đơn vị</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Ký hiệu</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Loại</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Thứ tự</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Trạng thái</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="flex justify-center">
                      <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                    <p className="mt-2 text-gray-500">Đang tải...</p>
                  </td>
                </tr>
              ) : units.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <Package className="w-12 h-12 text-gray-300 mx-auto" />
                    <p className="mt-2 text-gray-500">Không có đơn vị nào</p>
                    <button
                      onClick={handleCreate}
                      className="mt-3 text-blue-600 hover:underline"
                    >
                      + Thêm đơn vị mới
                    </button>
                  </td>
                </tr>
              ) : (
                units.map(unit => {
                  const Icon = getUnitTypeIcon(unit.unit_type)
                  return (
                    <tr key={unit.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm font-medium text-gray-900">
                          {unit.code}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-gray-900">{unit.name}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm text-gray-600">
                          {unit.symbol || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${getUnitTypeColor(unit.unit_type)}`}>
                          <Icon className="w-3.5 h-3.5" />
                          {getUnitTypeLabel(unit.unit_type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-gray-600">{unit.sort_order}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {unit.is_active ? (
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
                            onClick={() => handleEdit(unit)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Sửa"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleActive(unit)}
                            className={`p-2 rounded-lg transition-colors ${
                              unit.is_active 
                                ? 'text-orange-600 hover:bg-orange-50' 
                                : 'text-green-600 hover:bg-green-50'
                            }`}
                            title={unit.is_active ? 'Ngưng hoạt động' : 'Kích hoạt'}
                          >
                            {unit.is_active ? (
                              <PowerOff className="w-4 h-4" />
                            ) : (
                              <Power className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(unit)}
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
              Hiển thị {units.length} / {total} đơn vị
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

      {/* Unit Form Modal */}
      {showForm && (
        <UnitForm
          unit={editingUnit}
          onClose={() => {
            setShowForm(false)
            setEditingUnit(null)
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
              Bạn có chắc muốn xóa đơn vị <strong>"{showDeleteConfirm.name}"</strong> ({showDeleteConfirm.code})?
              <br />
              <span className="text-sm text-red-600 mt-2 block">
                Lưu ý: Không thể xóa đơn vị đang được sử dụng bởi vật tư.
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

export default UnitListPage