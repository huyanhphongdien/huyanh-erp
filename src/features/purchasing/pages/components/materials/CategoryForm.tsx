// src/features/purchasing/pages/components/materials/CategoryForm.tsx
// Form modal tạo/sửa Nhóm vật tư
// FIX: Đã bỏ code/icon/color/sort_order (không có trong DB hiện tại)
//      Thêm field type (raw/finished) từ WMS
import { useState, useEffect } from 'react'
import { 
  X, 
  Save, 
  Loader2,
  Package,
} from 'lucide-react'
import { 
  materialCategoryService, 
  MaterialCategory,
  MaterialCategoryFormData,
} from '../../../../../services/materialCategoryService'

interface CategoryFormProps {
  category: MaterialCategory | null
  onClose: () => void
  onSuccess: () => void
}

export default function CategoryForm({ category, onClose, onSuccess }: CategoryFormProps) {
  const isEditing = !!category

  // Form state
  const [formData, setFormData] = useState<MaterialCategoryFormData>({
    name: '',
    type: undefined,
    description: '',
    is_active: true
  })

  // UI state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)

  // Initialize form with existing data
  useEffect(() => {
    if (category) {
      setFormData({
        name: category.name,
        type: category.type || undefined,
        description: category.description || '',
        is_active: category.is_active
      })
    }
  }, [category])

  // Check name exists (debounced)
  useEffect(() => {
    const checkName = async () => {
      if (formData.name && formData.name.trim().length >= 2) {
        try {
          const exists = await materialCategoryService.checkNameExists(
            formData.name,
            category?.id
          )
          if (exists) {
            setNameError(`Tên "${formData.name}" đã tồn tại`)
          } else {
            setNameError(null)
          }
        } catch (err) {
          console.error('Error checking name:', err)
        }
      } else {
        setNameError(null)
      }
    }

    const timer = setTimeout(checkName, 500)
    return () => clearTimeout(timer)
  }, [formData.name, category?.id])

  // Handle input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value || undefined }))
  }

  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate
    if (!formData.name?.trim()) {
      setError('Vui lòng nhập tên nhóm')
      return
    }

    if (nameError) return

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

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tên nhóm <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="VD: Nguyên liệu, Hóa chất, Phụ tùng..."
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    ${nameError ? 'border-red-500' : 'border-gray-300'}`}
                />
                {nameError && (
                  <p className="mt-1 text-xs text-red-500">{nameError}</p>
                )}
              </div>

              {/* Type (WMS) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phân loại
                </label>
                <select
                  name="type"
                  value={formData.type || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">-- Chưa phân loại --</option>
                  <option value="raw">Nguyên liệu (raw)</option>
                  <option value="finished">Thành phẩm (finished)</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">Phân loại cho module Kho thành phẩm (WMS)</p>
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

              {/* Preview */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Xem trước
                </label>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-gray-500">
                    <Package className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">
                      {formData.name || 'Tên nhóm'}
                    </div>
                    <div className="text-sm text-gray-500">
                      {formData.type === 'raw' ? 'Nguyên liệu' : formData.type === 'finished' ? 'Thành phẩm' : 'Chưa phân loại'}
                    </div>
                  </div>
                </div>
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
                disabled={loading || !!nameError}
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