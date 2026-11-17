// ============================================================================
// VARIANT ATTRIBUTE MANAGEMENT PAGE
// File: src/features/purchasing/pages/VariantAttributeManagement.tsx
// Huy Anh ERP System - Module Quản lý đơn hàng
// Phase 2: Quản lý thuộc tính biến thể vật tư
// ============================================================================
// Cho phép thêm/sửa/xóa thuộc tính (Dòng điện, Kích thước, Điện áp...)
// và giá trị tương ứng (16A, 20A, Ø21, Ø27...) mà không cần chạy SQL
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  ChevronDown,
  ChevronRight,
  Boxes,
  Tag,
  RefreshCw,
  AlertTriangle,
  Check,
  GripVertical,
  Power,
  PowerOff,
  Search
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'
import {
  variantAttributeService,
  variantAttributeValueService,
  type VariantAttribute,
  type VariantAttributeValue,
  type VariantAttributeFormData,
  type VariantAttributeValueFormData
} from '../../../services/materialVariantService'

// ============================================================================
// TYPES
// ============================================================================

interface AttributeWithValues extends VariantAttribute {
  values: VariantAttributeValue[]
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const VariantAttributeManagement: React.FC = () => {
  const navigate = useNavigate()

  // State
  const [attributes, setAttributes] = useState<AttributeWithValues[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  // Attribute form state
  const [showAttrForm, setShowAttrForm] = useState(false)
  const [editingAttr, setEditingAttr] = useState<VariantAttribute | null>(null)
  const [attrForm, setAttrForm] = useState<VariantAttributeFormData>({
    code: '',
    name: '',
    description: '',
    unit: '',
    sort_order: 0,
    is_active: true
  })

  // Value form state
  const [addingValueForAttrId, setAddingValueForAttrId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState<VariantAttributeValue | null>(null)
  const [valueForm, setValueForm] = useState<{ value: string; display_value: string; sort_order: number }>({
    value: '',
    display_value: '',
    sort_order: 0
  })

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'attribute' | 'value'; id: string; name: string } | null>(null)

  // Error/success
  const [error, setError] = useState<string | null>(null) // lỗi THAO TÁC (tự ẩn sau 5s)
  // Lỗi TẢI — không tự ẩn; danh sách hiện lỗi + Thử lại thay vì "Chưa có thuộc tính nào"
  const [loadError, setLoadError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const fetchAttributes = useCallback(async () => {
    try {
      setLoading(true)
      setLoadError(null)
      const data = await variantAttributeService.getWithValues()
      // Sort values by sort_order
      const sorted = data.map(attr => ({
        ...attr,
        values: (attr.values || []).sort((a, b) => a.sort_order - b.sort_order)
      }))
      setAttributes(sorted)
    } catch (err: any) {
      setLoadError(dichLoiHeThong(err, 'Lỗi tải dữ liệu'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAttributes()
  }, [fetchAttributes])

  // Auto-hide messages
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

  // ============================================================================
  // ATTRIBUTE HANDLERS
  // ============================================================================

  const handleCreateAttr = () => {
    setEditingAttr(null)
    setAttrForm({
      code: '',
      name: '',
      description: '',
      unit: '',
      sort_order: attributes.length,
      is_active: true
    })
    setShowAttrForm(true)
  }

  const handleEditAttr = (attr: VariantAttribute) => {
    setEditingAttr(attr)
    setAttrForm({
      code: attr.code,
      name: attr.name,
      description: attr.description || '',
      unit: attr.unit || '',
      sort_order: attr.sort_order,
      is_active: attr.is_active
    })
    setShowAttrForm(true)
  }

  const handleSaveAttr = async () => {
    try {
      if (!attrForm.code.trim() || !attrForm.name.trim()) {
        setError('Vui lòng nhập mã và tên thuộc tính')
        return
      }

      if (editingAttr) {
        await variantAttributeService.update(editingAttr.id, attrForm)
        setSuccess(`Đã cập nhật thuộc tính "${attrForm.name}"`)
      } else {
        await variantAttributeService.create(attrForm)
        setSuccess(`Đã thêm thuộc tính "${attrForm.name}"`)
      }
      setShowAttrForm(false)
      setEditingAttr(null)
      fetchAttributes()
    } catch (err: any) {
      setError(dichLoiHeThong(err, 'Lỗi lưu thuộc tính'))
    }
  }

  const handleDeleteAttr = async (id: string) => {
    try {
      await variantAttributeService.delete(id)
      setSuccess('Đã xóa thuộc tính')
      setDeleteConfirm(null)
      fetchAttributes()
    } catch (err: any) {
      setError(dichLoiHeThong(err, 'Không thể xóa thuộc tính đang được sử dụng'))
      setDeleteConfirm(null)
    }
  }

  // ============================================================================
  // VALUE HANDLERS
  // ============================================================================

  const handleAddValue = (attrId: string) => {
    const attr = attributes.find(a => a.id === attrId)
    const maxSort = Math.max(0, ...(attr?.values || []).map(v => v.sort_order))
    setAddingValueForAttrId(attrId)
    setEditingValue(null)
    setValueForm({ value: '', display_value: '', sort_order: maxSort + 1 })
    // Expand this attribute
    setExpandedIds(prev => new Set([...prev, attrId]))
  }

  const handleEditValue = (val: VariantAttributeValue) => {
    setEditingValue(val)
    setAddingValueForAttrId(val.attribute_id)
    setValueForm({
      value: val.value,
      display_value: val.display_value || '',
      sort_order: val.sort_order
    })
  }

  const handleSaveValue = async () => {
    try {
      if (!valueForm.value.trim()) {
        setError('Vui lòng nhập giá trị')
        return
      }

      if (editingValue) {
        await variantAttributeValueService.update(editingValue.id, {
          attribute_id: editingValue.attribute_id,
          value: valueForm.value.trim(),
          display_value: valueForm.display_value.trim() || undefined,
          sort_order: valueForm.sort_order
        })
        setSuccess(`Đã cập nhật giá trị "${valueForm.value}"`)
      } else if (addingValueForAttrId) {
        await variantAttributeValueService.create({
          attribute_id: addingValueForAttrId,
          value: valueForm.value.trim(),
          display_value: valueForm.display_value.trim() || undefined,
          sort_order: valueForm.sort_order
        })
        setSuccess(`Đã thêm giá trị "${valueForm.value}"`)
      }
      setAddingValueForAttrId(null)
      setEditingValue(null)
      fetchAttributes()
    } catch (err: any) {
      setError(dichLoiHeThong(err, 'Lỗi lưu giá trị'))
    }
  }

  const handleDeleteValue = async (id: string) => {
    try {
      await variantAttributeValueService.delete(id)
      setSuccess('Đã xóa giá trị')
      setDeleteConfirm(null)
      fetchAttributes()
    } catch (err: any) {
      setError(dichLoiHeThong(err, 'Không thể xóa giá trị đang được sử dụng'))
      setDeleteConfirm(null)
    }
  }

  const handleCancelValueForm = () => {
    setAddingValueForAttrId(null)
    setEditingValue(null)
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const expandAll = () => {
    setExpandedIds(new Set(attributes.map(a => a.id)))
  }

  const collapseAll = () => {
    setExpandedIds(new Set())
  }

  // Filter
  const filteredAttributes = attributes.filter(attr => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      attr.name.toLowerCase().includes(s) ||
      attr.code.toLowerCase().includes(s) ||
      attr.values.some(v => 
        v.value.toLowerCase().includes(s) || 
        (v.display_value || '').toLowerCase().includes(s)
      )
    )
  })

  // Stats
  const totalValues = attributes.reduce((sum, a) => sum + a.values.length, 0)

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/purchasing/materials')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Quản lý thuộc tính biến thể
            </h1>
            <p className="text-gray-500 mt-1">
              Định nghĩa thuộc tính và giá trị cho biến thể vật tư
            </p>
          </div>
        </div>
        <button
          onClick={handleCreateAttr}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Thêm thuộc tính
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-4 bg-green-50 text-green-700 rounded-lg border border-green-200">
          <Check className="w-5 h-5 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Stats & Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Boxes className="w-4 h-4" />
            <span><strong>{attributes.length}</strong> thuộc tính</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Tag className="w-4 h-4" />
            <span><strong>{totalValues}</strong> giá trị</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Tìm thuộc tính..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-56"
            />
          </div>
          <button
            onClick={expandAll}
            className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Mở tất cả
          </button>
          <button
            onClick={collapseAll}
            className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Thu gọn
          </button>
          <button
            onClick={fetchAttributes}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Làm mới"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Hướng dẫn */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>💡 Hướng dẫn:</strong> Thêm thuộc tính mới (VD: Điện áp, Tiết diện, Chiều dài...) 
          rồi định nghĩa các giá trị tương ứng. Khi tạo biến thể cho vật tư, user sẽ chọn từ danh sách này.
        </p>
        <p className="text-xs text-blue-600 mt-1">
          Ví dụ: Thuộc tính "Điện áp" → Giá trị: 220V, 380V, 440V | 
          Thuộc tính "Tiết diện" → Giá trị: 1.5mm², 2.5mm², 4mm², 6mm²
        </p>
      </div>

      {/* Attribute List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : loadError ? (
          // Lỗi tải xét TRƯỚC trống
          <div className="text-center py-12 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle className="w-10 h-10 text-red-400 mx-auto" />
            <p className="mt-2 font-semibold text-red-700">Không tải được dữ liệu</p>
            <p className="text-sm text-red-600">{loadError}</p>
            <button
              onClick={fetchAttributes}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-red-300 text-red-700 bg-white rounded-lg hover:bg-red-100"
            >
              <RefreshCw className="w-4 h-4" /> Thử lại
            </button>
          </div>
        ) : filteredAttributes.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <Boxes className="w-12 h-12 text-gray-300 mx-auto" />
            <p className="mt-3 text-gray-500">
              {search ? 'Không tìm thấy thuộc tính nào' : 'Chưa có thuộc tính nào'}
            </p>
            {!search && (
              <button
                onClick={handleCreateAttr}
                className="mt-3 text-blue-600 hover:underline text-sm"
              >
                + Thêm thuộc tính đầu tiên
              </button>
            )}
          </div>
        ) : (
          filteredAttributes.map(attr => {
            const isExpanded = expandedIds.has(attr.id)
            const isAddingValue = addingValueForAttrId === attr.id && !editingValue

            return (
              <div key={attr.id} className="bg-white rounded-lg shadow overflow-hidden">
                {/* Attribute Header */}
                <div
                  className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => toggleExpand(attr.id)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{attr.name}</h3>
                        {attr.unit && (
                          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                            {attr.unit}
                          </span>
                        )}
                        {!attr.is_active && (
                          <span className="text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded">
                            Ngưng
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-gray-400 font-mono">{attr.code}</span>
                        {attr.description && (
                          <span className="text-xs text-gray-500">• {attr.description}</span>
                        )}
                        <span className="text-xs text-blue-600 font-medium">
                          {attr.values.length} giá trị
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleAddValue(attr.id)}
                      className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="Thêm giá trị"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleEditAttr(attr)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Sửa thuộc tính"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm({ type: 'attribute', id: attr.id, name: attr.name })}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Xóa thuộc tính"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Values List (expandable) */}
                {isExpanded && (
                  <div className="border-t bg-gray-50">
                    {/* Values */}
                    {attr.values.length === 0 && !isAddingValue ? (
                      <div className="px-5 py-4 text-center text-sm text-gray-500">
                        Chưa có giá trị nào.{' '}
                        <button
                          onClick={() => handleAddValue(attr.id)}
                          className="text-blue-600 hover:underline"
                        >
                          Thêm giá trị
                        </button>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-200">
                        {attr.values.map(val => {
                          const isEditingThis = editingValue?.id === val.id

                          if (isEditingThis) {
                            return (
                              <div key={val.id} className="px-5 py-3 bg-blue-50">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 text-center text-xs text-gray-400">
                                    #{valueForm.sort_order}
                                  </div>
                                  <input
                                    type="text"
                                    value={valueForm.value}
                                    onChange={(e) => setValueForm({ ...valueForm, value: e.target.value })}
                                    placeholder="Giá trị *"
                                    className="flex-1 px-3 py-1.5 border rounded text-sm focus:ring-2 focus:ring-blue-500"
                                    autoFocus
                                  />
                                  <input
                                    type="text"
                                    value={valueForm.display_value}
                                    onChange={(e) => setValueForm({ ...valueForm, display_value: e.target.value })}
                                    placeholder="Hiển thị (tùy chọn)"
                                    className="flex-1 px-3 py-1.5 border rounded text-sm focus:ring-2 focus:ring-blue-500"
                                  />
                                  <input
                                    type="number"
                                    value={valueForm.sort_order}
                                    onChange={(e) => setValueForm({ ...valueForm, sort_order: parseInt(e.target.value) || 0 })}
                                    className="w-16 px-2 py-1.5 border rounded text-sm text-center focus:ring-2 focus:ring-blue-500"
                                    title="Thứ tự"
                                  />
                                  <button
                                    onClick={handleSaveValue}
                                    className="p-1.5 text-green-600 hover:bg-green-100 rounded transition-colors"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={handleCancelValueForm}
                                    className="p-1.5 text-gray-500 hover:bg-gray-200 rounded transition-colors"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            )
                          }

                          return (
                            <div key={val.id} className="px-5 py-2.5 flex items-center gap-3 hover:bg-gray-100 transition-colors group">
                              <div className="w-8 text-center text-xs text-gray-400">
                                #{val.sort_order}
                              </div>
                              <div className="flex-1">
                                <span className="text-sm font-medium text-gray-800">{val.value}</span>
                                {val.display_value && val.display_value !== val.value && (
                                  <span className="text-xs text-gray-500 ml-2">
                                    → hiển thị: {val.display_value}
                                  </span>
                                )}
                              </div>
                              {!val.is_active && (
                                <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded">
                                  Ngưng
                                </span>
                              )}
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => handleEditValue(val)}
                                  className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                  title="Sửa"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm({ type: 'value', id: val.id, name: val.display_value || val.value })}
                                  className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="Xóa"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )
                        })}

                        {/* Inline Add Value Form */}
                        {isAddingValue && (
                          <div className="px-5 py-3 bg-green-50">
                            <div className="flex items-center gap-3">
                              <div className="w-8 text-center text-xs text-gray-400">
                                #{valueForm.sort_order}
                              </div>
                              <input
                                type="text"
                                value={valueForm.value}
                                onChange={(e) => setValueForm({ ...valueForm, value: e.target.value })}
                                placeholder="Giá trị * (VD: 220, 380, 1.5...)"
                                className="flex-1 px-3 py-1.5 border rounded text-sm focus:ring-2 focus:ring-blue-500"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveValue()
                                  if (e.key === 'Escape') handleCancelValueForm()
                                }}
                              />
                              <input
                                type="text"
                                value={valueForm.display_value}
                                onChange={(e) => setValueForm({ ...valueForm, display_value: e.target.value })}
                                placeholder="Hiển thị (VD: 220V, 1.5mm²)"
                                className="flex-1 px-3 py-1.5 border rounded text-sm focus:ring-2 focus:ring-blue-500"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveValue()
                                  if (e.key === 'Escape') handleCancelValueForm()
                                }}
                              />
                              <input
                                type="number"
                                value={valueForm.sort_order}
                                onChange={(e) => setValueForm({ ...valueForm, sort_order: parseInt(e.target.value) || 0 })}
                                className="w-16 px-2 py-1.5 border rounded text-sm text-center focus:ring-2 focus:ring-blue-500"
                                title="Thứ tự"
                              />
                              <button
                                onClick={handleSaveValue}
                                className="p-1.5 text-green-600 hover:bg-green-100 rounded transition-colors"
                                title="Lưu"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={handleCancelValueForm}
                                className="p-1.5 text-gray-500 hover:bg-gray-200 rounded transition-colors"
                                title="Hủy"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                            <p className="text-xs text-gray-500 mt-1 ml-11">
                              Nhấn Enter để lưu, Esc để hủy
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Quick Add Value Button */}
                    {!isAddingValue && attr.values.length > 0 && (
                      <div className="px-5 py-2 border-t">
                        <button
                          onClick={() => handleAddValue(attr.id)}
                          className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Thêm giá trị mới
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* ============================================ */}
      {/* ATTRIBUTE FORM MODAL */}
      {/* ============================================ */}
      {showAttrForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingAttr ? 'Sửa thuộc tính' : 'Thêm thuộc tính mới'}
              </h3>
              <button
                onClick={() => setShowAttrForm(false)}
                className="p-1 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Mã thuộc tính *
                  </label>
                  <input
                    type="text"
                    value={attrForm.code}
                    onChange={(e) => setAttrForm({ ...attrForm, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                    placeholder="VD: voltage, section, length"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                    disabled={!!editingAttr}
                  />
                  <p className="text-xs text-gray-500 mt-1">Chỉ chữ thường, số, dấu _</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tên thuộc tính *
                  </label>
                  <input
                    type="text"
                    value={attrForm.name}
                    onChange={(e) => setAttrForm({ ...attrForm, name: e.target.value })}
                    placeholder="VD: Điện áp, Tiết diện, Chiều dài"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Đơn vị
                  </label>
                  <input
                    type="text"
                    value={attrForm.unit || ''}
                    onChange={(e) => setAttrForm({ ...attrForm, unit: e.target.value })}
                    placeholder="VD: V, mm², m, kg"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Thứ tự hiển thị
                  </label>
                  <input
                    type="number"
                    value={attrForm.sort_order}
                    onChange={(e) => setAttrForm({ ...attrForm, sort_order: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mô tả
                </label>
                <input
                  type="text"
                  value={attrForm.description || ''}
                  onChange={(e) => setAttrForm({ ...attrForm, description: e.target.value })}
                  placeholder="VD: Điện áp định mức của thiết bị"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="attr_active"
                  checked={attrForm.is_active}
                  onChange={(e) => setAttrForm({ ...attrForm, is_active: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <label htmlFor="attr_active" className="text-sm text-gray-700">
                  Đang hoạt động
                </label>
              </div>

              {/* Gợi ý */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-600 mb-1">💡 Gợi ý thuộc tính phổ biến:</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { code: 'voltage', name: 'Điện áp', unit: 'V' },
                    { code: 'section', name: 'Tiết diện', unit: 'mm²' },
                    { code: 'length', name: 'Chiều dài', unit: 'm' },
                    { code: 'weight', name: 'Trọng lượng', unit: 'kg' },
                    { code: 'diameter', name: 'Đường kính', unit: 'mm' },
                    { code: 'thickness', name: 'Độ dày', unit: 'mm' },
                    { code: 'capacity', name: 'Công suất', unit: 'W' },
                    { code: 'pressure', name: 'Áp suất', unit: 'bar' },
                  ].map(suggestion => (
                    <button
                      key={suggestion.code}
                      onClick={() => {
                        if (!attrForm.code && !attrForm.name) {
                          setAttrForm({
                            ...attrForm,
                            code: suggestion.code,
                            name: suggestion.name,
                            unit: suggestion.unit
                          })
                        }
                      }}
                      className="text-xs px-2 py-1 bg-white border rounded hover:bg-blue-50 hover:border-blue-300 transition-colors"
                      title={`${suggestion.name} (${suggestion.unit})`}
                    >
                      {suggestion.name} ({suggestion.unit})
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setShowAttrForm(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-100 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleSaveAttr}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Save className="w-4 h-4" />
                {editingAttr ? 'Cập nhật' : 'Thêm mới'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* DELETE CONFIRMATION MODAL */}
      {/* ============================================ */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Xác nhận xóa
            </h3>
            <p className="text-gray-600 mb-1">
              Bạn có chắc muốn xóa {deleteConfirm.type === 'attribute' ? 'thuộc tính' : 'giá trị'}{' '}
              <strong>"{deleteConfirm.name}"</strong>?
            </p>
            {deleteConfirm.type === 'attribute' && (
              <p className="text-sm text-red-600 mb-4">
                ⚠️ Tất cả giá trị của thuộc tính này cũng sẽ bị xóa.
                Không thể xóa nếu đang được sử dụng trong biến thể.
              </p>
            )}
            {deleteConfirm.type === 'value' && (
              <p className="text-sm text-red-600 mb-4">
                ⚠️ Không thể xóa nếu đang được sử dụng trong biến thể vật tư.
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  if (deleteConfirm.type === 'attribute') {
                    handleDeleteAttr(deleteConfirm.id)
                  } else {
                    handleDeleteValue(deleteConfirm.id)
                  }
                }}
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

export default VariantAttributeManagement