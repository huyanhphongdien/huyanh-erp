// ============================================================================
// MATERIAL DETAIL PAGE
// File: src/features/purchasing/pages/MaterialDetailPage.tsx
// Huy Anh ERP System - Module Quản lý đơn hàng
// Phase 2E: Material UI
// ============================================================================
// FIX: Thay is_active bằng status để khớp database schema
// NEW: Thêm tab Biến thể (Material Variants)
// ============================================================================

import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { 
  ArrowLeft,
  Edit,
  Package,
  Layers,
  Tag,
  Building2,
  Scale,
  AlertTriangle,
  Power,
  PowerOff,
  RefreshCw,
  Plus,
  Trash2,
  Star,
  StarOff,
  Phone,
  Mail,
  DollarSign,
  Clock,
  Calendar,
  FileText,
  Boxes
} from 'lucide-react'
import { 
  materialService, 
  type Material,
  type MaterialSupplier,
  type MaterialSupplierFormData
} from '../../../services/materialService'
import { supplierService, type Supplier } from '../../../services/supplierService'
import MaterialForm from './components/materials/MaterialForm'
import MaterialVariants from './components/materials/MaterialVariants'

// Tabs - Thêm 'variants'
type TabType = 'info' | 'variants' | 'suppliers' | 'history'

const MaterialDetailPage: React.FC = () => {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()

  // State
  const [material, setMaterial] = useState<Material | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('info')

  // Suppliers state
  const [suppliers, setSuppliers] = useState<MaterialSupplier[]>([])
  const [loadingSuppliers, setLoadingSuppliers] = useState(false)
  const [availableSuppliers, setAvailableSuppliers] = useState<Supplier[]>([])
  const [showAddSupplier, setShowAddSupplier] = useState(false)
  const [addSupplierForm, setAddSupplierForm] = useState<Partial<MaterialSupplierFormData>>({
    supplier_id: '',
    unit_price: undefined,
    min_order_qty: undefined,
    lead_time_days: undefined,
    is_preferred: false,
    notes: ''
  })
  const [savingSupplier, setSavingSupplier] = useState(false)

  // Modal state
  const [showEditForm, setShowEditForm] = useState(false)

  // Fetch material
  const fetchMaterial = async () => {
    if (!id) return
    try {
      setLoading(true)
      const data = await materialService.getById(id)
      setMaterial(data)
    } catch (error) {
      console.error('Error fetching material:', error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch suppliers
  const fetchSuppliers = async () => {
    if (!id) return
    try {
      setLoadingSuppliers(true)
      const data = await materialService.getSuppliers(id)
      setSuppliers(data)
    } catch (error) {
      console.error('Error fetching suppliers:', error)
    } finally {
      setLoadingSuppliers(false)
    }
  }

  // Fetch available suppliers for dropdown
  const fetchAvailableSuppliers = async () => {
    try {
      const data = await supplierService.getAllActive()
      setAvailableSuppliers(data)
    } catch (error) {
      console.error('Error fetching available suppliers:', error)
    }
  }

  useEffect(() => {
    fetchMaterial()
    fetchSuppliers()
    fetchAvailableSuppliers()
  }, [id])

  // Handle add supplier
  const handleAddSupplier = async () => {
    if (!id || !addSupplierForm.supplier_id) return

    try {
      setSavingSupplier(true)
      await materialService.addSupplier({
        material_id: id,
        supplier_id: addSupplierForm.supplier_id,
        unit_price: addSupplierForm.unit_price,
        min_order_qty: addSupplierForm.min_order_qty,
        lead_time_days: addSupplierForm.lead_time_days,
        is_preferred: addSupplierForm.is_preferred,
        notes: addSupplierForm.notes
      })
      setShowAddSupplier(false)
      setAddSupplierForm({
        supplier_id: '',
        unit_price: undefined,
        min_order_qty: undefined,
        lead_time_days: undefined,
        is_preferred: false,
        notes: ''
      })
      fetchSuppliers()
      fetchMaterial()
    } catch (error: any) {
      alert(error.message || 'Có lỗi xảy ra')
    } finally {
      setSavingSupplier(false)
    }
  }

  // Handle remove supplier
  const handleRemoveSupplier = async (supplierId: string) => {
    if (!confirm('Bạn có chắc muốn xóa nhà cung cấp này?')) return

    try {
      await materialService.removeSupplier(supplierId)
      fetchSuppliers()
      fetchMaterial()
    } catch (error: any) {
      alert(error.message || 'Có lỗi xảy ra')
    }
  }

  // Handle set preferred supplier
  const handleSetPreferred = async (supplierId: string) => {
    if (!id) return

    try {
      await materialService.setPreferredSupplier(id, supplierId)
      fetchSuppliers()
      fetchMaterial()
    } catch (error: any) {
      alert(error.message || 'Có lỗi xảy ra')
    }
  }

  // Format currency
  const formatCurrency = (value?: number | null) => {
    if (value == null) return '-'
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND'
    }).format(value)
  }

  // Format date
  const formatDate = (date?: string) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString('vi-VN')
  }

  // Helper: Get stock safely
  const getStock = (mat: Material): number => {
    return mat.current_stock ?? 0
  }

  const getMinStock = (mat: Material): number => {
    return mat.min_stock ?? 0
  }

  if (loading) {
    return (
      <div className="p-6 flex justify-center items-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    )
  }

  if (!material) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <Package className="w-12 h-12 text-gray-300 mx-auto" />
          <p className="mt-2 text-gray-500">Không tìm thấy vật tư</p>
          <button
            onClick={() => navigate('/purchasing/materials')}
            className="mt-4 text-blue-600 hover:underline"
          >
            ← Quay lại danh sách
          </button>
        </div>
      </div>
    )
  }

  const stockValue = getStock(material)
  const minStockValue = getMinStock(material)
  const isLowStock = stockValue < minStockValue

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <button
            onClick={() => navigate('/purchasing/materials')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{material.name}</h1>
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
              {isLowStock && (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                  <AlertTriangle className="w-3 h-3" />
                  Tồn kho thấp
                </span>
              )}
              {(material as any).has_variants && (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                  <Boxes className="w-3 h-3" />
                  Có biến thể
                </span>
              )}
            </div>
            <p className="text-gray-500 mt-1">
              <span className="font-mono font-medium text-blue-600">{material.code}</span>
              {material.specifications && (
                <span className="mx-2">•</span>
              )}
              {material.specifications}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowEditForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Edit className="w-4 h-4" />
          Chỉnh sửa
        </button>
      </div>

      {/* Tabs - Thêm tab Biến thể */}
      <div className="border-b">
        <nav className="flex gap-6">
          <button
            onClick={() => setActiveTab('info')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'info'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Thông tin chung
          </button>
          <button
            onClick={() => setActiveTab('variants')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'variants'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Boxes className="w-4 h-4" />
            Biến thể
            {(material as any).has_variants && (
              <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full">
                ✓
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('suppliers')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'suppliers'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Nhà cung cấp ({suppliers.length})
          </button>
        </nav>
      </div>

      {/* Tab Content: Info */}
      {activeTab === 'info' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Info Card */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" />
                Thông tin cơ bản
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Mã vật tư</p>
                  <p className="font-mono font-medium text-blue-600">{material.code}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Tên vật tư</p>
                  <p className="font-medium">{material.name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Nhóm vật tư</p>
                  <p className="flex items-center gap-1">
                    <Layers className="w-4 h-4 text-gray-400" />
                    {material.category?.name || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Loại vật tư</p>
                  <p className="flex items-center gap-1">
                    <Tag className="w-4 h-4 text-gray-400" />
                    {material.type?.name || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Đơn vị tính</p>
                  <p className="flex items-center gap-1">
                    <Scale className="w-4 h-4 text-gray-400" />
                    {material.unit?.name || '-'} ({material.unit?.symbol || ''})
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">NCC ưu tiên</p>
                  <p className="flex items-center gap-1">
                    <Building2 className="w-4 h-4 text-gray-400" />
                    {material.preferred_supplier?.name || '-'}
                  </p>
                </div>
              </div>
              {material.specifications && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm text-gray-500">Quy cách / Thông số</p>
                  <p className="mt-1">{material.specifications}</p>
                </div>
              )}
              {material.description && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm text-gray-500">Mô tả</p>
                  <p className="mt-1">{material.description}</p>
                </div>
              )}
            </div>

            {/* Notes */}
            {material.notes && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  Ghi chú
                </h3>
                <p className="text-gray-600">{material.notes}</p>
              </div>
            )}
          </div>

          {/* Side Info */}
          <div className="space-y-6">
            {/* Stock Card */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Tồn kho</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Hiện tại</span>
                  <span className={`text-xl font-bold ${isLowStock ? 'text-red-600' : 'text-gray-900'}`}>
                    {stockValue.toLocaleString()}
                    {isLowStock && <AlertTriangle className="w-4 h-4 inline ml-1" />}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Tối thiểu</span>
                  <span className="font-medium">{minStockValue.toLocaleString()}</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all ${
                      isLowStock ? 'bg-red-500' : 'bg-green-500'
                    }`}
                    style={{ 
                      width: `${Math.min(100, (stockValue / Math.max(minStockValue, 1)) * 100)}%` 
                    }}
                  />
                </div>
                {(material as any).has_variants && (
                  <p className="text-xs text-gray-500 italic">
                    * Tồn kho tổng hợp từ các biến thể
                  </p>
                )}
              </div>
            </div>

            {/* Price Card */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Giá</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Giá mua gần nhất</span>
                  <span className="font-medium text-blue-600">
                    {formatCurrency(material.last_purchase_price)}
                  </span>
                </div>
                {material.reference_price && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Giá tham khảo</span>
                    <span className="font-medium">
                      {formatCurrency(material.reference_price)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Timestamps */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Thời gian</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Ngày tạo</span>
                  <span>{formatDate(material.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Cập nhật</span>
                  <span>{formatDate(material.updated_at)}</span>
                </div>
                {material.created_by_employee && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Người tạo</span>
                    <span>{material.created_by_employee.full_name}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: Variants - MỚI */}
      {activeTab === 'variants' && (
        <div className="bg-white rounded-lg shadow p-6">
          <MaterialVariants
            materialId={material.id}
            materialName={material.name}
            unitSymbol={material.unit?.symbol}
            canEdit={true}
            onVariantsChange={() => {
              // Refresh material data when variants change (to update total stock)
              fetchMaterial()
            }}
          />
        </div>
      )}

      {/* Tab Content: Suppliers */}
      {activeTab === 'suppliers' && (
        <div className="space-y-4">
          {/* Add Supplier Button */}
          <div className="flex justify-end">
            <button
              onClick={() => setShowAddSupplier(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Thêm nhà cung cấp
            </button>
          </div>

          {/* Add Supplier Form */}
          {showAddSupplier && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-4">Thêm nhà cung cấp</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nhà cung cấp <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={addSupplierForm.supplier_id}
                    onChange={(e) => setAddSupplierForm(prev => ({ ...prev, supplier_id: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Chọn NCC --</option>
                    {availableSuppliers
                      .filter(s => !suppliers.some(ms => ms.supplier_id === s.id))
                      .map(sup => (
                        <option key={sup.id} value={sup.id}>
                          [{sup.code}] {sup.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Đơn giá (VNĐ)
                  </label>
                  <input
                    type="number"
                    value={addSupplierForm.unit_price ?? ''}
                    onChange={(e) => setAddSupplierForm(prev => ({ 
                      ...prev, 
                      unit_price: e.target.value ? parseFloat(e.target.value) : undefined 
                    }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Thời gian giao (ngày)
                  </label>
                  <input
                    type="number"
                    value={addSupplierForm.lead_time_days ?? ''}
                    onChange={(e) => setAddSupplierForm(prev => ({ 
                      ...prev, 
                      lead_time_days: e.target.value ? parseInt(e.target.value) : undefined 
                    }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="flex items-center gap-4 mt-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={addSupplierForm.is_preferred}
                    onChange={(e) => setAddSupplierForm(prev => ({ ...prev, is_preferred: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm">Đặt làm NCC ưu tiên</span>
                </label>
                <div className="flex-1" />
                <button
                  onClick={() => setShowAddSupplier(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Hủy
                </button>
                <button
                  onClick={handleAddSupplier}
                  disabled={!addSupplierForm.supplier_id || savingSupplier}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingSupplier ? 'Đang lưu...' : 'Thêm'}
                </button>
              </div>
            </div>
          )}

          {/* Suppliers List */}
          {loadingSuppliers ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : suppliers.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <Building2 className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="mt-2 text-gray-500">Chưa có nhà cung cấp nào</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Nhà cung cấp</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Đơn giá</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">SL tối thiểu</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Thời gian giao</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Ưu tiên</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {suppliers.map(ms => (
                    <tr key={ms.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-gray-900">
                            {ms.supplier?.name}
                          </p>
                          <p className="text-sm text-gray-500">
                            {ms.supplier?.code}
                            {ms.supplier?.phone && ` • ${ms.supplier.phone}`}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-medium text-blue-600">
                          {formatCurrency(ms.unit_price)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {ms.min_order_qty?.toLocaleString() || '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {ms.lead_time_days ? `${ms.lead_time_days} ngày` : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {ms.is_preferred ? (
                          <Star className="w-5 h-5 text-yellow-500 fill-yellow-500 mx-auto" />
                        ) : (
                          <button
                            onClick={() => handleSetPreferred(ms.supplier_id)}
                            className="p-1 text-gray-400 hover:text-yellow-500 transition-colors"
                            title="Đặt làm ưu tiên"
                          >
                            <StarOff className="w-5 h-5" />
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleRemoveSupplier(ms.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Xóa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Edit Form Modal */}
      {showEditForm && (
        <MaterialForm
          material={material}
          onClose={() => setShowEditForm(false)}
          onSuccess={() => {
            setShowEditForm(false)
            fetchMaterial()
          }}
        />
      )}
    </div>
  )
}

export default MaterialDetailPage