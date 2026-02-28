import React, { useState, useEffect } from 'react'
import { X, Save, Package, AlertCircle } from 'lucide-react'
import { 
  unitService, 
  Unit, 
  UnitFormData, 
  UNIT_TYPES 
} from '../../../../../services/unitService'

interface UnitFormProps {
  unit?: Unit | null
  onClose: () => void
  onSuccess: () => void
}

const UnitForm: React.FC<UnitFormProps> = ({ unit, onClose, onSuccess }) => {
  const isEditing = !!unit

  // Form state
  const [formData, setFormData] = useState<UnitFormData>({
    code: '',
    name: '',
    symbol: '',
    unit_type: 'piece',
    sort_order: 0,
    is_active: true
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)

  // Load data when editing
  useEffect(() => {
    if (unit) {
      setFormData({
        code: unit.code,
        name: unit.name,
        symbol: unit.symbol || '',
        unit_type: unit.unit_type,
        sort_order: unit.sort_order,
        is_active: unit.is_active
      })
    }
  }, [unit])

  // Validate code uniqueness (debounced)
  useEffect(() => {
    if (!formData.code || formData.code.length < 1) {
      setCodeError(null)
      return
    }

    const timer = setTimeout(async () => {
      try {
        const exists = await unitService.checkCodeExists(
          formData.code, 
          unit?.id
        )
        if (exists) {
          setCodeError(`Mã "${formData.code}" đã tồn tại`)
        } else {
          setCodeError(null)
        }
      } catch (err) {
        console.error('Error checking code:', err)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [formData.code, unit?.id])

  // Handle input change
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' 
        ? (e.target as HTMLInputElement).checked 
        : type === 'number'
          ? parseInt(value) || 0
          : value
    }))
  }

  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate
    if (!formData.code.trim()) {
      setError('Vui lòng nhập mã đơn vị')
      return
    }
    if (!formData.name.trim()) {
      setError('Vui lòng nhập tên đơn vị')
      return
    }
    if (codeError) {
      setError(codeError)
      return
    }

    try {
      setLoading(true)
      setError(null)

      if (isEditing && unit) {
        await unitService.update(unit.id, formData)
      } else {
        await unitService.create(formData)
      }

      onSuccess()
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              {isEditing ? 'Sửa đơn vị tính' : 'Thêm đơn vị tính'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Code */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mã đơn vị <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="code"
              value={formData.code}
              onChange={handleChange}
              placeholder="VD: kg, tan, m3..."
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                codeError ? 'border-red-300 bg-red-50' : ''
              }`}
              disabled={loading}
            />
            {codeError && (
              <p className="mt-1 text-sm text-red-600">{codeError}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Mã sẽ được chuyển sang chữ thường
            </p>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tên đơn vị <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="VD: Kilogram, Tấn, Mét khối..."
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={loading}
            />
          </div>

          {/* Symbol */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ký hiệu
            </label>
            <input
              type="text"
              name="symbol"
              value={formData.symbol}
              onChange={handleChange}
              placeholder="VD: kg, T, m³, L..."
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={loading}
            />
            <p className="mt-1 text-xs text-gray-500">
              Ký hiệu hiển thị trên báo cáo (có thể dùng ký tự đặc biệt như ², ³)
            </p>
          </div>

          {/* Unit Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Loại đơn vị
            </label>
            <select
              name="unit_type"
              value={formData.unit_type}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={loading}
            >
              {UNIT_TYPES.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Order */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Thứ tự sắp xếp
            </label>
            <input
              type="number"
              name="sort_order"
              value={formData.sort_order}
              onChange={handleChange}
              min={0}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={loading}
            />
            <p className="mt-1 text-xs text-gray-500">
              Số nhỏ hơn sẽ hiển thị trước trong dropdown
            </p>
          </div>

          {/* Is Active */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              name="is_active"
              id="is_active"
              checked={formData.is_active}
              onChange={handleChange}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              disabled={loading}
            />
            <label htmlFor="is_active" className="text-sm text-gray-700">
              Đang hoạt động
            </label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
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
              disabled={loading || !!codeError}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
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

export default UnitForm