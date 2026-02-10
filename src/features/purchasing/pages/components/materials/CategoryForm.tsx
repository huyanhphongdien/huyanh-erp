// src/features/purchasing/pages/components/materials/CategoryForm.tsx
// Form modal tạo/sửa Nhóm vật tư
import { useState, useEffect } from 'react'
import { 
  X, 
  Save, 
  Loader2,
  Package,
  Fuel,
  Wrench,
  HardHat,
  FileText,
  Cpu,
  Droplet,
  Building,
  Box,
  Layers,
  Check
} from 'lucide-react'
import { 
  materialCategoryService, 
  MaterialCategory,
  MaterialCategoryFormData,
  CATEGORY_ICONS,
  CATEGORY_COLORS
} from '../../../../../services/materialCategoryService'

// Icon mapping
const IconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Package,
  Fuel,
  Wrench,
  HardHat,
  FileText,
  Cpu,
  Droplet,
  Building,
  Box,
  Layers,
}

interface CategoryFormProps {
  category: MaterialCategory | null
  onClose: () => void
  onSuccess: () => void
}

export default function CategoryForm({ category, onClose, onSuccess }: CategoryFormProps) {
  const isEditing = !!category

  // Form state
  const [formData, setFormData] = useState<MaterialCategoryFormData>({
    code: '',
    name: '',
    description: '',
    icon: 'Package',
    color: '#3B82F6',
    sort_order: 0,
    is_active: true
  })

  // UI state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)

  // Initialize form with existing data
  useEffect(() => {
    if (category) {
      setFormData({
        code: category.code,
        name: category.name,
        description: category.description || '',
        icon: category.icon || 'Package',
        color: category.color || '#3B82F6',
        sort_order: category.sort_order,
        is_active: category.is_active
      })
    }
  }, [category])

  // Validate code format
  const validateCode = (code: string): boolean => {
    if (!code) {
      setCodeError('Vui lòng nhập mã nhóm')
      return false
    }
    if (!/^[A-Za-z]{2,5}$/.test(code)) {
      setCodeError('Mã nhóm phải từ 2-5 ký tự chữ cái')
      return false
    }
    setCodeError(null)
    return true
  }

  // Check code exists (debounced)
  useEffect(() => {
    const checkCode = async () => {
      if (formData.code && formData.code.length >= 2) {
        try {
          const exists = await materialCategoryService.checkCodeExists(
            formData.code,
            category?.id
          )
          if (exists) {
            setCodeError(`Mã "${formData.code.toUpperCase()}" đã tồn tại`)
          }
        } catch (err) {
          console.error('Error checking code:', err)
        }
      }
    }

    const timer = setTimeout(checkCode, 500)
    return () => clearTimeout(timer)
  }, [formData.code, category?.id])

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    
    if (name === 'code') {
      const upperValue = value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5)
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
    if (!validateCode(formData.code)) return
    if (!formData.name.trim()) {
      setError('Vui lòng nhập tên nhóm')
      return
    }

    setLoading(true)
    setError(null)

    try {
      if (isEditing && category) {
        await materialCategoryService.update(category.id, formData)
      } else {
        await materialCategoryService.create(formData)
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
              {isEditing ? 'Chỉnh sửa nhóm vật tư' : 'Thêm nhóm vật tư mới'}
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

              {/* Code & Name row */}
              <div className="grid grid-cols-3 gap-4">
                {/* Code */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Mã nhóm <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="code"
                    value={formData.code}
                    onChange={handleChange}
                    placeholder="VD: NL"
                    maxLength={5}
                    disabled={isEditing} // Không cho sửa mã khi edit
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase
                      ${codeError ? 'border-red-500' : 'border-gray-300'}
                      ${isEditing ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  />
                  {codeError && (
                    <p className="mt-1 text-xs text-red-500">{codeError}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">2-5 ký tự</p>
                </div>

                {/* Name */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tên nhóm <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="VD: Nguyên liệu"
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
                  placeholder="Mô tả ngắn về nhóm vật tư..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                />
              </div>

              {/* Icon Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Biểu tượng
                </label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_ICONS.map((icon) => {
                    const IconComponent = IconMap[icon.value]
                    const isSelected = formData.icon === icon.value
                    return (
                      <button
                        key={icon.value}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, icon: icon.value }))}
                        className={`relative p-3 rounded-lg border-2 transition-all
                          ${isSelected 
                            ? 'border-blue-500 bg-blue-50' 
                            : 'border-gray-200 hover:border-gray-300'}`}
                        title={icon.label}
                      >
                        {IconComponent && <IconComponent className="w-5 h-5 text-gray-700" />}
                        {isSelected && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-white" />
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Color Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Màu sắc
                </label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_COLORS.map((color) => {
                    const isSelected = formData.color === color.value
                    return (
                      <button
                        key={color.value}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, color: color.value }))}
                        className={`relative w-10 h-10 rounded-lg border-2 transition-all
                          ${isSelected 
                            ? 'border-gray-900 scale-110' 
                            : 'border-transparent hover:scale-105'}`}
                        style={{ backgroundColor: color.value }}
                        title={color.label}
                      >
                        {isSelected && (
                          <Check className="w-5 h-5 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Preview */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Xem trước
                </label>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: formData.color }}
                  >
                    {formData.icon && IconMap[formData.icon] && (
                      (() => {
                        const Icon = IconMap[formData.icon]
                        return <Icon className="w-5 h-5 text-white" />
                      })()
                    )}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">
                      {formData.name || 'Tên nhóm'}
                    </div>
                    <div className="text-sm text-gray-500">
                      Mã: {formData.code || '??'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sort Order */}
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

                {/* Active Status */}
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
                disabled={loading || !!codeError}
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