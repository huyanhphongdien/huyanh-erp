// ============================================================================
// MATERIAL FORM
// File: src/features/purchasing/pages/components/materials/MaterialForm.tsx
// Huy Anh ERP System - Module Quản lý đơn hàng
// Phase 2E: Material UI
// ============================================================================
// UPDATED: Khớp với database schema thực tế
// - last_price -> last_purchase_price
// - Thêm: brand, origin, reference_price
// ============================================================================

import React, { useState, useEffect } from 'react'
import { 
  X, 
  Save, 
  Package, 
  AlertCircle,
  Loader2,
  Layers,
  Tag
} from 'lucide-react'
import { 
  materialService, 
  type Material, 
  type MaterialFormData,
  previewMaterialCode
} from '../../../../../services/materialService'
import { materialCategoryService, type MaterialCategory } from '../../../../../services/materialCategoryService'
import { materialTypeService, type MaterialType } from '../../../../../services/materialTypeService'
import { unitService, type Unit } from '../../../../../services/unitService'
import { supplierService, type Supplier } from '../../../../../services/supplierService'

interface MaterialFormProps {
  material?: Material | null
  onClose: () => void
  onSuccess: () => void
}

const MaterialForm: React.FC<MaterialFormProps> = ({ material, onClose, onSuccess }) => {
  const isEditing = !!material

  // Form state - Khớp với database schema
  const [formData, setFormData] = useState<MaterialFormData>({
    name: '',
    short_name: '',
    category_id: '',
    type_id: '',
    unit_id: '',
    description: '',
    specifications: '',
    brand: '',
    origin: '',
    reference_price: undefined,
    min_stock: 0,
    current_stock: 0,
    last_purchase_price: undefined,  // Database column name
    preferred_supplier_id: '',
    notes: '',
    status: 'active'
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Preview code
  const [previewCode, setPreviewCode] = useState<string>('')
  const [loadingCode, setLoadingCode] = useState(false)

  // Dropdown data
  const [categories, setCategories] = useState<MaterialCategory[]>([])
  const [types, setTypes] = useState<MaterialType[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  // Load dropdown data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [catData, unitData, supData] = await Promise.all([
          materialCategoryService.getAllActive(),
          unitService.getAllActive(),
          supplierService.getAllActive()
        ])
        setCategories(catData)
        setUnits(unitData)
        setSuppliers(supData)
      } catch (err) {
        console.error('Error loading dropdown data:', err)
      }
    }
    fetchData()
  }, [])

  // Load data when editing - Khớp với database schema
  useEffect(() => {
    if (material) {
      setFormData({
        name: material.name,
        short_name: material.short_name || '',
        category_id: material.category_id || '',
        type_id: material.type_id || '',
        unit_id: material.unit_id || '',
        description: material.description || '',
        specifications: material.specifications || '',
        brand: material.brand || '',
        origin: material.origin || '',
        reference_price: material.reference_price,
        min_stock: material.min_stock,
        current_stock: material.current_stock,
        last_purchase_price: material.last_purchase_price,  // Database column name
        preferred_supplier_id: material.preferred_supplier_id || '',
        notes: material.notes || '',
        status: material.status || 'active'
      })
      setPreviewCode(material.code)
    }
  }, [material])

  // Load types when category changes
  useEffect(() => {
    const fetchTypes = async () => {
      if (formData.category_id) {
        try {
          const allTypes = await materialTypeService.getAllActive(formData.category_id)
          const data = allTypes.filter((t: any) => t.category_id === formData.category_id)
          setTypes(data)
          
          if (formData.type_id) {
            const exists = data.some(t => t.id === formData.type_id)
            if (!exists) {
              setFormData(prev => ({ ...prev, type_id: '' }))
            }
          }
        } catch (err) {
          console.error('Error loading types:', err)
        }
      } else {
        setTypes([])
        setFormData(prev => ({ ...prev, type_id: '' }))
      }
    }
    fetchTypes()
  }, [formData.category_id])

  // Preview code when category/type changes
  useEffect(() => {
    if (!isEditing && formData.category_id) {
      const generatePreview = async () => {
        try {
          setLoadingCode(true)
          const code = await previewMaterialCode(
            formData.category_id!, 
            formData.type_id || undefined
          )
          setPreviewCode(code)
        } catch (err) {
          console.error('Error previewing code:', err)
          setPreviewCode('')
        } finally {
          setLoadingCode(false)
        }
      }
      generatePreview()
    }
  }, [isEditing, formData.category_id, formData.type_id])

  // Handle input change
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number'
        ? value === '' ? undefined : parseFloat(value)
        : value
    }))
  }

  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name.trim()) {
      setError('Vui lòng nhập tên vật tư')
      return
    }
    if (!formData.category_id) {
      setError('Vui lòng chọn nhóm vật tư')
      return
    }

    try {
      setLoading(true)
      setError(null)

      if (isEditing && material) {
        await materialService.update(material.id, formData)
      } else {
        await materialService.create(formData)
      }

      onSuccess()
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {isEditing ? 'Sửa vật tư' : 'Thêm vật tư mới'}
              </h2>
              {previewCode && (
                <p className="text-sm text-gray-500 flex items-center gap-1">
                  Mã: <span className="font-mono font-medium text-blue-600">{previewCode}</span>
                  {loadingCode && <Loader2 className="w-3 h-3 animate-spin" />}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Error message */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {/* Section: Thông tin cơ bản */}
            <div className="space-y-4">
              <h3 className="font-medium text-gray-900 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Thông tin cơ bản
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Name */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tên vật tư <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="VD: Xi măng PCB40 Holcim"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={loading}
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nhóm vật tư <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="category_id"
                    value={formData.category_id}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={loading || isEditing}
                  >
                    <option value="">-- Chọn nhóm --</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                  {isEditing && (
                    <p className="text-xs text-gray-500 mt-1">
                      Không thể thay đổi nhóm khi sửa
                    </p>
                  )}
                </div>

                {/* Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Loại vật tư
                  </label>
                  <select
                    name="type_id"
                    value={formData.type_id}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                    disabled={loading || !formData.category_id || isEditing}
                  >
                    <option value="">-- Chọn loại --</option>
                    {types.map(type => (
                      <option key={type.id} value={type.id}>
                        [{type.code}] {type.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Unit */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Đơn vị tính
                  </label>
                  <select
                    name="unit_id"
                    value={formData.unit_id}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={loading}
                  >
                    <option value="">-- Chọn đơn vị --</option>
                    {units.map(unit => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name} ({unit.symbol || unit.code})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Preferred Supplier */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    NCC ưu tiên
                  </label>
                  <select
                    name="preferred_supplier_id"
                    value={formData.preferred_supplier_id}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={loading}
                  >
                    <option value="">-- Chọn NCC --</option>
                    {suppliers.map(sup => (
                      <option key={sup.id} value={sup.id}>
                        [{sup.code}] {sup.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Specifications */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quy cách / Thông số kỹ thuật
                </label>
                <input
                  type="text"
                  name="specifications"
                  value={formData.specifications}
                  onChange={handleChange}
                  placeholder="VD: Bao 50kg, sản xuất tại VN"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={loading}
                />
              </div>

              {/* Brand & Origin */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Thương hiệu
                  </label>
                  <input
                    type="text"
                    name="brand"
                    value={formData.brand}
                    onChange={handleChange}
                    placeholder="VD: Holcim, Hòa Phát..."
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Xuất xứ
                  </label>
                  <input
                    type="text"
                    name="origin"
                    value={formData.origin}
                    onChange={handleChange}
                    placeholder="VD: Việt Nam, Nhật Bản..."
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mô tả
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={2}
                  placeholder="Mô tả chi tiết về vật tư..."
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={loading}
                />
              </div>
            </div>

            {/* Section: Tồn kho & Giá */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="font-medium text-gray-900 flex items-center gap-2">
                <Layers className="w-4 h-4" />
                Tồn kho & Giá
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Min Stock */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tồn kho tối thiểu
                  </label>
                  <input
                    type="number"
                    name="min_stock"
                    value={formData.min_stock}
                    onChange={handleChange}
                    min={0}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={loading}
                  />
                </div>

                {/* Current Stock */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tồn kho hiện tại
                  </label>
                  <input
                    type="number"
                    name="current_stock"
                    value={formData.current_stock}
                    onChange={handleChange}
                    min={0}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={loading}
                  />
                </div>

                {/* Last Purchase Price - Database column name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Giá mua gần nhất (VNĐ)
                  </label>
                  <input
                    type="number"
                    name="last_purchase_price"
                    value={formData.last_purchase_price ?? ''}
                    onChange={handleChange}
                    min={0}
                    placeholder="0"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Reference Price */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Giá tham khảo (VNĐ)
                </label>
                <input
                  type="number"
                  name="reference_price"
                  value={formData.reference_price ?? ''}
                  onChange={handleChange}
                  min={0}
                  placeholder="0"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={loading}
                />
              </div>
            </div>

            {/* Section: Ghi chú */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="font-medium text-gray-900 flex items-center gap-2">
                <Tag className="w-4 h-4" />
                Khác
              </h3>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ghi chú
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={2}
                  placeholder="Ghi chú thêm..."
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={loading}
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Trạng thái
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={loading}
                >
                  <option value="active">Đang hoạt động</option>
                  <option value="inactive">Ngưng hoạt động</option>
                </select>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
              disabled={loading}
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {isEditing ? 'Cập nhật' : 'Thêm mới'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default MaterialForm