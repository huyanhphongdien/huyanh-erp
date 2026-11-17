import React, { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Package, AlertTriangle, Boxes, Loader2 } from 'lucide-react'
import { App as AntdApp } from 'antd'
import {
  materialVariantService,
  variantAttributeService,
  MaterialVariant,
  VariantAttribute,
  VariantAttributeValue
} from '../../../../../services/materialVariantService'
import VariantForm from './VariantForm'
import PageState from '../../../../../components/common/PageState'
import { fmtVnd as formatCurrency, fmtDate, fmtNum } from '../../../../../utils/format'
import { dichLoiHeThong } from '../../../../../utils/dichLoiHeThong'
// formatCurrency = fmtVnd (utils/format) — bản Intl tự viết cũ đã xoá

interface MaterialVariantsProps {
  materialId: string
  materialName: string
  unitSymbol?: string
  canEdit?: boolean
  onVariantsChange?: () => void
}

const MaterialVariants: React.FC<MaterialVariantsProps> = ({
  materialId,
  materialName,
  unitSymbol = '',
  canEdit = true,
  onVariantsChange
}) => {
  const { message, modal } = AntdApp.useApp()
  const [variants, setVariants] = useState<MaterialVariant[]>([])
  const [attributes, setAttributes] = useState<(VariantAttribute & { values: VariantAttributeValue[] })[]>([])
  const [loading, setLoading] = useState(true)
  // Lỗi tải — trước đây nuốt im rồi hiện "Chưa có biến thể nào" (trống GIẢ)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingVariant, setEditingVariant] = useState<MaterialVariant | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [materialId])

  const loadData = async () => {
    try {
      setLoading(true)
      setLoadError(null)
      const [variantsData, attributesData] = await Promise.all([
        materialVariantService.getByMaterial(materialId),
        variantAttributeService.getWithValues(true)
      ])
      setVariants(variantsData)
      setAttributes(attributesData)
    } catch (error) {
      console.error('Error loading variants:', error)
      setLoadError(error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = (variant: MaterialVariant) => {
    modal.confirm({
      title: `Xóa biến thể "${variant.variant_name}"?`,
      content: 'Biến thể sẽ chuyển sang "Ngừng kinh doanh" và không dùng được cho đơn mới.',
      okText: 'Xóa biến thể',
      okButtonProps: { danger: true },
      cancelText: 'Không',
      onOk: async () => {
        try {
          setDeletingId(variant.id)
          await materialVariantService.delete(variant.id)
          await loadData()
          onVariantsChange?.()
        } catch (error) {
          console.error('Error deleting variant:', error)
          message.error(dichLoiHeThong(error, 'Không thể xóa biến thể'))
        } finally {
          setDeletingId(null)
        }
      },
    })
  }

  const handleFormSuccess = () => {
    setShowForm(false)
    setEditingVariant(null)
    loadData()
    onVariantsChange?.()
  }

  const isLowStock = (variant: MaterialVariant) => variant.stock_quantity <= variant.min_stock

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-800',
      discontinued: 'bg-red-100 text-red-800'
    }
    const labels: Record<string, string> = {
      active: 'Hoạt động',
      inactive: 'Tạm ngưng',
      discontinued: 'Ngừng kinh doanh'
    }
    return (
      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${styles[status] || styles.inactive}`}>
        {labels[status] || status}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    )
  }

  // Lỗi tải xét TRƯỚC trống
  if (loadError) {
    return <PageState error={loadError} onRetry={loadData} />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Boxes className="w-5 h-5 text-gray-500" />
          <h3 className="text-lg font-semibold text-gray-900">Biến thể sản phẩm</h3>
          <span className="px-2 py-0.5 text-sm bg-gray-100 text-gray-600 rounded-full">{variants.length} biến thể</span>
        </div>
        {canEdit && (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" />Thêm biến thể
          </button>
        )}
      </div>

      {variants.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
          <Package className="w-12 h-12 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-500 mb-2">Chưa có biến thể nào</p>
          <p className="text-sm text-gray-400 mb-4">Thêm các biến thể để quản lý tồn kho và giá theo từng loại</p>
          {canEdit && (
            <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Plus className="w-4 h-4" />Thêm biến thể đầu tiên
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Biến thể</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tồn kho</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Giá tham khảo</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Giá mua gần nhất</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
                {canEdit && <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Thao tác</th>}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {variants.map((variant) => (
                <tr key={variant.id} className={`hover:bg-gray-50 ${isLowStock(variant) ? 'bg-red-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {isLowStock(variant) && <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                      <div>
                        <p className="font-medium text-gray-900">{variant.variant_name}</p>
                        {variant.attributes && Array.isArray(variant.attributes) && variant.attributes.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {variant.attributes.map((attr: any, idx: number) => (
                              <span key={idx} className="inline-flex px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                                {attr.attribute_name}: {attr.display_value || attr.value}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><span className="text-sm text-gray-500 font-mono">{variant.sku || '-'}</span></td>
                  <td className="px-4 py-3 text-right">
                    <div className={`text-sm font-medium ${isLowStock(variant) ? 'text-red-600' : 'text-gray-900'}`}>
                      {fmtNum(variant.stock_quantity, 3)} {unitSymbol}
                    </div>
                    <div className="text-xs text-gray-400">Tối thiểu: {fmtNum(variant.min_stock, 3)}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {variant.reference_price ? <span className="text-sm text-gray-900">{formatCurrency(variant.reference_price)}</span> : <span className="text-sm text-gray-400">-</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {variant.last_purchase_price ? (
                      <div>
                        <span className="text-sm font-medium text-green-600">{formatCurrency(variant.last_purchase_price)}</span>
                        {variant.last_purchase_date && <div className="text-xs text-gray-400">{fmtDate(variant.last_purchase_date)}</div>}
                      </div>
                    ) : <span className="text-sm text-gray-400">-</span>}
                  </td>
                  <td className="px-4 py-3 text-center">{getStatusBadge(variant.status)}</td>
                  {canEdit && (
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setEditingVariant(variant)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Sửa">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(variant)} disabled={deletingId === variant.id} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50" title="Xóa">
                          {deletingId === variant.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <span className="text-gray-500">Tổng tồn kho: <span className="font-medium text-gray-900 ml-1">{fmtNum(variants.reduce((sum, v) => sum + v.stock_quantity, 0), 3)} {unitSymbol}</span></span>
                {variants.some(isLowStock) && (
                  <span className="flex items-center gap-1 text-red-600">
                    <AlertTriangle className="w-4 h-4" />{variants.filter(isLowStock).length} biến thể tồn kho thấp
                  </span>
                )}
              </div>
              {variants.filter(v => v.reference_price).length > 0 && (
                <div className="text-gray-500">
                  Giá từ: <span className="font-medium text-gray-900 ml-1">{formatCurrency(Math.min(...variants.filter(v => v.reference_price).map(v => v.reference_price!)))}</span>
                  {' - '}<span className="font-medium text-gray-900">{formatCurrency(Math.max(...variants.filter(v => v.reference_price).map(v => v.reference_price!)))}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {(showForm || editingVariant) && (
        <VariantForm
          materialId={materialId}
          materialName={materialName}
          variant={editingVariant}
          attributes={attributes}
          onClose={() => { setShowForm(false); setEditingVariant(null) }}
          onSuccess={handleFormSuccess}
        />
      )}
    </div>
  )
}

export default MaterialVariants