import React, { useState, useEffect } from 'react'
import { X, Save, Loader2, Package } from 'lucide-react'
import { 
  materialVariantService, 
  MaterialVariant,
  MaterialVariantFormData,
  VariantAttribute,
  VariantAttributeValue
} from '../../../../../services/materialVariantService'

interface VariantFormProps {
  materialId: string
  materialName: string
  variant?: MaterialVariant | null
  attributes: (VariantAttribute & { values: VariantAttributeValue[] })[]
  onClose: () => void
  onSuccess: () => void
}

const VariantForm: React.FC<VariantFormProps> = ({ materialId, materialName, variant, attributes, onClose, onSuccess }) => {
  const isEditing = !!variant

  const [formData, setFormData] = useState<MaterialVariantFormData>({
    material_id: materialId, variant_name: '', sku: '', reference_price: undefined,
    stock_quantity: 0, min_stock: 0, max_stock: undefined, notes: '', status: 'active', attributes: []
  })

  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (variant) {
      setFormData({
        material_id: variant.material_id, variant_name: variant.variant_name, sku: variant.sku || '',
        reference_price: variant.reference_price, stock_quantity: variant.stock_quantity,
        min_stock: variant.min_stock, max_stock: variant.max_stock, notes: variant.notes || '', status: variant.status
      })
      if (variant.attributes) {
        const attrMap: Record<string, string> = {}
        variant.attributes.forEach((attr: any) => { attrMap[attr.attribute_id] = attr.value_id })
        setSelectedAttributes(attrMap)
      }
    }
  }, [variant])

  useEffect(() => {
    if (!isEditing && Object.keys(selectedAttributes).length > 0) {
      const nameParts: string[] = []
      attributes.forEach(attr => {
        const valueId = selectedAttributes[attr.id]
        if (valueId) {
          const value = attr.values.find(v => v.id === valueId)
          if (value) nameParts.push(value.display_value || value.value)
        }
      })
      if (nameParts.length > 0) setFormData(prev => ({ ...prev, variant_name: nameParts.join(' - ') }))
    }
  }, [selectedAttributes, attributes, isEditing])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({ ...prev, [name]: type === 'number' ? (value === '' ? undefined : Number(value)) : value }))
  }

  const handleAttributeChange = (attributeId: string, valueId: string) => {
    setSelectedAttributes(prev => ({ ...prev, [attributeId]: valueId }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!formData.variant_name.trim()) { setError('Vui lòng nhập tên biến thể'); return }

    try {
      setLoading(true)
      const attributesData = Object.entries(selectedAttributes)
        .filter(([_, valueId]) => valueId)
        .map(([attributeId, valueId]) => ({ attribute_id: attributeId, value_id: valueId }))
      const submitData: MaterialVariantFormData = { ...formData, attributes: attributesData }

      if (isEditing && variant) await materialVariantService.update(variant.id, submitData)
      else await materialVariantService.create(submitData)
      onSuccess()
    } catch (err: any) {
      console.error('Error saving variant:', err)
      setError(err.message || 'Có lỗi xảy ra khi lưu biến thể')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg"><Package className="w-5 h-5 text-blue-600" /></div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{isEditing ? 'Sửa biến thể' : 'Thêm biến thể mới'}</h3>
              <p className="text-sm text-gray-500">{materialName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="p-6 space-y-6">
            {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>}

            {attributes.length > 0 && (
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-gray-700">Thuộc tính biến thể</h4>
                <div className="grid grid-cols-2 gap-4">
                  {attributes.map(attr => (
                    <div key={attr.id}>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        {attr.name}{attr.unit && <span className="text-gray-400 ml-1">({attr.unit})</span>}
                      </label>
                      <select value={selectedAttributes[attr.id] || ''} onChange={(e) => handleAttributeChange(attr.id, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        <option value="">-- Chọn {attr.name.toLowerCase()} --</option>
                        {attr.values.filter(v => v.is_active).map(value => (
                          <option key={value.id} value={value.id}>{value.display_value || value.value}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4">
              <h4 className="text-sm font-medium text-gray-700">Thông tin cơ bản</h4>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Tên biến thể <span className="text-red-500">*</span></label>
                <input type="text" name="variant_name" value={formData.variant_name} onChange={handleChange} placeholder="VD: 100A - 3P"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" required />
                <p className="mt-1 text-xs text-gray-400">Tự động tạo từ thuộc tính hoặc nhập thủ công</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Mã SKU</label>
                <input type="text" name="sku" value={formData.sku || ''} onChange={handleChange} placeholder="VD: MCCB-100A-3P"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-medium text-gray-700">Tồn kho & Giá</h4>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Số lượng tồn</label>
                  <input type="number" name="stock_quantity" value={formData.stock_quantity || 0} onChange={handleChange} min="0" step="0.001"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Tồn tối thiểu</label>
                  <input type="number" name="min_stock" value={formData.min_stock || 0} onChange={handleChange} min="0" step="0.001"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Tồn tối đa</label>
                  <input type="number" name="max_stock" value={formData.max_stock || ''} onChange={handleChange} min="0" step="0.001" placeholder="Không giới hạn"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Giá tham khảo (VNĐ)</label>
                <input type="number" name="reference_price" value={formData.reference_price || ''} onChange={handleChange} min="0" step="1000" placeholder="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Trạng thái</label>
                <select name="status" value={formData.status} onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option value="active">Hoạt động</option>
                  <option value="inactive">Tạm ngưng</option>
                  <option value="discontinued">Ngừng kinh doanh</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Ghi chú</label>
                <textarea name="notes" value={formData.notes || ''} onChange={handleChange} rows={3} placeholder="Ghi chú thêm về biến thể này..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none" />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
            <button type="button" onClick={onClose} disabled={loading} className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">Hủy</button>
            <button type="submit" disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Đang lưu...</> : <><Save className="w-4 h-4" />{isEditing ? 'Cập nhật' : 'Thêm biến thể'}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default VariantForm