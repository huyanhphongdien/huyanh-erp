// src/features/purchasing/pages/components/materials/TypeForm.tsx
// Form modal tạo/sửa Loại vật tư
import { useState, useEffect } from 'react'
import { 
  X, 
  Save, 
  Loader2,
  Tag,
  Eye
} from 'lucide-react'
import { 
  materialTypeService, 
  MaterialType,
  MaterialTypeFormData
} from '../../../../../services/materialTypeService'
import { MaterialCategory } from '../../../../../services/materialCategoryService'

interface TypeFormProps {
  type: MaterialType | null
  categories: MaterialCategory[]
  defaultCategoryId?: string
  onClose: () => void
  onSuccess: () => void
}

export default function TypeForm({ 
  type, 
  categories, 
  defaultCategoryId,
  onClose, 
  onSuccess 
}: TypeFormProps) {
  const isEditing = !!type

  // Form state
  const [formData, setFormData] = useState<MaterialTypeFormData>({
    category_id: '',
    code: '',
    name: '',
    description: '',
    sort_order: 0,
    is_active: true
  })

  // UI state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [previewCode, setPreviewCode] = useState<string>('')

  // Selected category info
  const selectedCategory = categories.find(c => c.id === formData.category_id)

  // Initialize form with existing data
  useEffect(() => {
    if (type) {
      setFormData({
        category_id: type.category_id,
        code: type.code,
        name: type.name,
        description: type.description || '',
        sort_order: type.sort_order,
        is_active: type.is_active
      })
    } else if (defaultCategoryId) {
      setFormData(prev => ({ ...prev, category_id: defaultCategoryId }))
    }
  }, [type, defaultCategoryId])

  // Update preview code when category or code changes
  useEffect(() => {
    if (selectedCategory && formData.code) {
      setPreviewCode(`${selectedCategory.code}-${formData.code}XXX`)
    } else if (selectedCategory) {
      setPreviewCode(`${selectedCategory.code}-???XXX`)
    } else {
      setPreviewCode('???-???XXX')
    }
  }, [selectedCategory, formData.code])

  // Validate code format
  const validateCode = (code: string): boolean => {
    if (!code) {
      setCodeError('Vui lòng nhập mã loại')
      return false
    }
    if (!/^[A-Za-z0-9]{2,10}$/.test(code)) {
      setCodeError('Mã loại phải từ 2-10 ký tự chữ hoặc số')
      return false
    }
    setCodeError(null)
    return true
  }

  // Check code exists (debounced)
  useEffect(() => {
    const checkCode = async () => {
      if (formData.code && formData.code.length >= 2 && formData.category_id) {
        try {
          const exists = await materialTypeService.checkCodeExists(
            formData.code,
            formData.category_id,
            type?.id
          )
          if (exists) {
            setCodeError(`Mã "${formData.code.toUpperCase()}" đã tồn tại trong nhóm này`)
          }
        } catch (err) {
          console.error('Error checking code:', err)
        }
      }
    }

    const timer = setTimeout(checkCode, 500)
    return () => clearTimeout(timer)
  }, [formData.code, formData.category_id, type?.id])

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    
    if (name === 'code') {
      const upperValue = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
      setFormData(prev => ({ ...prev, code: upperValue }))
      validateCode(upperValue)
    } else if (name === 'sort_order') {
      setFormData(prev => ({ ...prev, sort_order: parseInt(value) || 0 }))
    } else {
      setFormData(prev => ({ ...prev, [name]: value }))
    }
  }

  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate
    if (!formData.category_id) {
      setError('Vui lòng chọn nhóm vật tư')
      return
    }
    if (!validateCode(formData.code)) return
    if (!formData.name.trim()) {
      setError('Vui lòng nhập tên loại')
      return
    }

    setLoading(true)
    setError(null)

    try {
      if (isEditing && type) {
        await materialTypeService.update(type.id, formData)
      } else {
        await materialTypeService.create(formData)
      }
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        
        {/* Modal */}
        <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              {isEditing ? 'Chỉnh sửa loại vật tư' : 'Thêm loại vật tư mới'}
            </h2>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div className="px-6 py-4 space-y-4">
              {/* Error message */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}

              {/* Category Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nhóm vật tư <span className="text-red-500">*</span>
                </label>
                <select
                  name="category_id"
                  value={formData.category_id}
                  onChange={handleChange}
                  disabled={isEditing}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    ${isEditing ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                >
                  <option value="">-- Chọn nhóm --</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.code} - {cat.name}
                    </option>
                  ))}
                </select>
                {isEditing && (
                  <p className="mt-1 text-xs text-gray-500">Không thể thay đổi nhóm khi chỉnh sửa</p>
                )}
              </div>

              {/* Code & Name row */}
              <div className="grid grid-cols-3 gap-4">
                {/* Code */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Mã loại <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="code"
                    value={formData.code}
                    onChange={handleChange}
                    placeholder="VD: CS"
                    maxLength={10}
                    disabled={isEditing}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase
                      ${codeError ? 'border-red-500' : 'border-gray-300'}
                      ${isEditing ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  />
                  {codeError && (
                    <p className="mt-1 text-xs text-red-500">{codeError}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">2-10 ký tự</p>
                </div>

                {/* Name */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tên loại <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="VD: Cao su tự nhiên"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                  placeholder="Mô tả ngắn về loại vật tư..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                />
              </div>

              {/* Preview */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Eye className="w-4 h-4 inline mr-1" />
                  Xem trước mã vật tư
                </label>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: selectedCategory?.color || '#6B7280' }}
                  >
                    <Tag className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="font-mono text-lg font-bold text-gray-900">
                      {previewCode}
                    </div>
                    <div className="text-sm text-gray-500">
                      {selectedCategory 
                        ? `${selectedCategory.name} → ${formData.name || 'Tên loại'}`
                        : 'Chọn nhóm để xem preview'}
                    </div>
                  </div>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  XXX = số thứ tự vật tư (tự động tăng)
                </p>
              </div>

              {/* Sort Order & Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Thứ tự hiển thị
                  </label>
                  <input
                    type="number"
                    name="sort_order"
                    value={formData.sort_order}
                    onChange={handleChange}
                    min={0}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">Số nhỏ hiển thị trước</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Trạng thái
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Đang hoạt động</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={loading || !!codeError || !formData.category_id}
                className="flex items-center gap-2 px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Đang lưu...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {isEditing ? 'Cập nhật' : 'Tạo mới'}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}