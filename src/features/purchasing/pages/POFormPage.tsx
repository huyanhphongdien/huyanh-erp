// ============================================================================
// PO FORM PAGE (CREATE / EDIT) - Refactored with shared components
// File: src/features/purchasing/pages/POFormPage.tsx
// ============================================================================

import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Loader2, AlertCircle, X, FileText, ChevronDown, ChevronUp } from 'lucide-react'
import {
  purchaseOrderService,
  type POFormData,
  type POItemFormData,
  PO_STATUS_LABELS,
  formatCurrency,
} from '../../../services/purchaseOrderService'
import { departmentService } from '../../../services/departmentService'
import { employeeService } from '../../../services/employeeService'
import { supplierService } from '../../../services/supplierService'
import { materialService } from '../../../services/materialService'
import { useAuthStore } from '../../../stores/authStore'

// Components
import { OrderHeader } from './components/orders/OrderHeader'
import { OrderItemsTable, type FormItem, createEmptyItem, generateTempId, recalcItem } from './components/orders/OrderItemsTable'
import { SupplierSummary } from './components/orders/SupplierGroupView'
import { OrderSummary } from './components/orders/OrderSummary'

// ===== TYPES (for dropdowns) =====

interface Department { id: string; code: string; name: string }
interface Employee { id: string; code: string; full_name: string; department_id?: string | null }
interface Supplier { id: string; code: string; name: string; short_name?: string }
interface Material {
  id: string; code: string; name: string; unit_name?: string; specifications?: string
  last_purchase_price?: number; reference_price?: number
  unit?: { id: string; code: string; name: string; symbol?: string }
}

// ===== MAIN COMPONENT =====

function POFormPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { user } = useAuthStore()
  const isEditMode = Boolean(id)

  // State
  const [loading, setLoading] = useState(isEditMode)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState<POFormData>({
    order_date: new Date().toISOString().split('T')[0],
    project_name: '',
    project_code: '',
    expected_delivery_date: '',
    delivery_address: '',
    delivery_notes: '',
    requester_id: user?.employee_id || '',
    department_id: user?.department_id || '',
    notes: '',
    internal_notes: '',
  })

  const [items, setItems] = useState<FormItem[]>([createEmptyItem()])
  const [existingOrderId, setExistingOrderId] = useState<string | null>(null)
  const [orderCode, setOrderCode] = useState('')

  // Dropdowns
  const [departments, setDepartments] = useState<Department[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [materials, setMaterials] = useState<Material[]>([])

  // Notes section
  const [showNotes, setShowNotes] = useState(false)
  const [defaultShowDelivery, setDefaultShowDelivery] = useState(false)

  // ===== LOAD DROPDOWN DATA =====
  useEffect(() => {
    const loadDropdowns = async () => {
      try {
        const depts = await departmentService.getAllActive()
        setDepartments(depts)

        const { data: emps } = await employeeService.getAll({ page: 1, pageSize: 200, status: 'active' })
        setEmployees(emps || [])

        const { data: sups } = await supplierService.getAll({ page: 1, pageSize: 200, status: 'active' })
        setSuppliers(sups || [])

        const { data: mats } = await materialService.getAll({ page: 1, pageSize: 500, status: 'active' })
        setMaterials(mats || [])
      } catch (err) {
        console.error('Lỗi tải dữ liệu dropdown:', err)
      }
    }
    loadDropdowns()
  }, [])

  // ===== LOAD ORDER (edit mode) =====
  useEffect(() => {
    if (!id) return
    const loadOrder = async () => {
      setLoading(true)
      try {
        const order = await purchaseOrderService.getById(id)
        if (!order) { setError('Không tìm thấy đơn hàng'); return }

        if (!['draft', 'rejected'].includes(order.status)) {
          setError(`Không thể sửa đơn hàng ở trạng thái "${PO_STATUS_LABELS[order.status]}"`)
          return
        }

        setOrderCode(order.order_code)
        setExistingOrderId(order.id)
        setFormData({
          order_date: order.order_date,
          project_name: order.project_name || '',
          project_code: order.project_code || '',
          expected_delivery_date: order.expected_delivery_date || '',
          delivery_address: order.delivery_address || '',
          delivery_notes: order.delivery_notes || '',
          requester_id: order.requester_id || '',
          department_id: order.department_id || '',
          notes: order.notes || '',
          internal_notes: order.internal_notes || '',
        })

        const dbItems = await purchaseOrderService.getItems(id)
        if (dbItems.length > 0) {
          setItems(
            dbItems.map((item: any) => ({
              _tempId: generateTempId(),
              id: item.id,
              material_id: item.material_id || undefined,
              supplier_id: item.supplier_id,
              material_code: item.material_code || '',
              material_name: item.material_name,
              specifications: item.specifications || '',
              unit: item.unit,
              quantity: item.quantity,
              unit_price: item.unit_price,
              vat_rate: item.vat_rate,
              amount: item.amount,
              vat_amount: item.vat_amount,
              total_amount: item.total_amount,
              notes: item.notes || '',
              supplier_name: item.supplier?.name,
              supplier_code: item.supplier?.code,
            }))
          )
        }

        if (order.expected_delivery_date || order.delivery_address) setDefaultShowDelivery(true)
        if (order.notes || order.internal_notes) setShowNotes(true)
      } catch (err: any) {
        setError(err.message || 'Lỗi tải đơn hàng')
      } finally {
        setLoading(false)
      }
    }
    loadOrder()
  }, [id])

  // ===== COMPUTED =====
  const validItems = items.filter((i) => i.material_name && i.supplier_id && i.quantity > 0 && i.unit_price > 0)
  const totals = {
    total_amount: validItems.reduce((s, i) => s + i.amount, 0),
    vat_amount: validItems.reduce((s, i) => s + i.vat_amount, 0),
    grand_total: validItems.reduce((s, i) => s + i.total_amount, 0),
  }
  const supplierCount = new Set(validItems.map((i) => i.supplier_id)).size

  // ===== VALIDATION =====
  const validateForm = (): string | null => {
    if (!formData.order_date) return 'Vui lòng chọn ngày đơn hàng'
    const hasValid = items.some((i) => i.material_name && i.supplier_id && i.quantity > 0 && i.unit_price > 0 && i.unit)
    if (!hasValid) return 'Cần ít nhất 1 dòng vật tư hợp lệ (tên, NCC, SL, đơn giá, ĐVT)'
    const missing = items.filter((i) => i.material_name && !i.supplier_id)
    if (missing.length > 0) return 'Vui lòng chọn NCC cho tất cả vật tư'
    return null
  }

  // ===== SAVE =====
  const handleSave = async () => {
    const validationError = validateForm()
    if (validationError) { setError(validationError); return }

    setSaving(true)
    setError(null)

    try {
      const userId = user?.employee_id
      if (!userId) throw new Error('Không xác định được người dùng')

      let orderId: string

      if (isEditMode && existingOrderId) {
        await purchaseOrderService.update(existingOrderId, formData, userId)
        orderId = existingOrderId
        await purchaseOrderService.removeAllItems(orderId)
      } else {
        const newOrder = await purchaseOrderService.create(formData, userId)
        orderId = newOrder.id
      }

      const itemsToSave: POItemFormData[] = items
        .filter((i) => i.material_name && i.supplier_id && i.quantity > 0 && i.unit_price > 0)
        .map((item, idx) => ({
          material_id: item.material_id,
          supplier_id: item.supplier_id,
          material_code: item.material_code,
          material_name: item.material_name,
          specifications: item.specifications,
          unit: item.unit,
          quantity: item.quantity,
          unit_price: item.unit_price,
          vat_rate: item.vat_rate,
          notes: item.notes,
          sort_order: idx + 1,
        }))

      if (itemsToSave.length > 0) {
        await purchaseOrderService.addItems(orderId, itemsToSave)
      }

      navigate(`/purchasing/orders/${orderId}`, {
        state: { message: isEditMode ? 'Cập nhật đơn hàng thành công!' : 'Tạo đơn hàng thành công!' },
      })
    } catch (err: any) {
      setError(err.message || 'Lỗi lưu đơn hàng')
    } finally {
      setSaving(false)
    }
  }

  // ===== LOADING =====
  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    )
  }

  // ===== RENDER =====
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/purchasing/orders')} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isEditMode ? `Sửa đơn hàng ${orderCode}` : 'Tạo đơn hàng mới'}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {isEditMode ? 'Chỉnh sửa thông tin và chi tiết đơn hàng' : 'Nhập thông tin và thêm vật tư cần mua'}
            </p>
          </div>
        </div>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Đang lưu...</> : <><Save className="w-4 h-4" /> Lưu đơn hàng</>}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Section 1 & 2: Header + Delivery */}
      <OrderHeader
        formData={formData}
        departments={departments}
        employees={employees}
        onChange={(field, value) => setFormData((prev) => ({ ...prev, [field]: value }))}
        defaultShowDelivery={defaultShowDelivery}
      />

      {/* Section 3: Items Table */}
      <OrderItemsTable
        items={items}
        suppliers={suppliers}
        materials={materials}
        onChange={setItems}
        onMaterialCreated={(mat) => setMaterials((prev) => [mat, ...prev])}
      />

      {/* Section 4: Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SupplierSummary items={items} suppliers={suppliers} />
        <OrderSummary
          totalAmount={totals.total_amount}
          vatAmount={totals.vat_amount}
          grandTotal={totals.grand_total}
          validItemCount={validItems.length}
          supplierCount={supplierCount}
        />
      </div>

      {/* Section 5: Notes */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <button type="button" onClick={() => setShowNotes(!showNotes)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors rounded-t-xl">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-gray-400" /> Ghi chú
          </h2>
          {showNotes ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </button>
        {showNotes && (
          <div className="px-5 pb-5 border-t border-gray-100">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú (cho NCC)</label>
                <textarea value={formData.notes} onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))} rows={3} placeholder="Ghi chú gửi kèm cho nhà cung cấp..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú nội bộ</label>
                <textarea value={formData.internal_notes} onChange={(e) => setFormData((p) => ({ ...p, internal_notes: e.target.value }))} rows={3} placeholder="Ghi chú nội bộ, chỉ hiển thị trong hệ thống..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Actions */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 sticky bottom-4">
        <button onClick={() => navigate('/purchasing/orders')} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
          Hủy bỏ
        </button>
        <div className="flex items-center gap-3">
          <div className="text-right mr-4">
            <p className="text-xs text-gray-400">Tổng cộng</p>
            <p className="text-lg font-bold text-blue-600">{formatCurrency(totals.grand_total)}</p>
          </div>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm font-medium">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Đang lưu...</> : <><Save className="w-4 h-4" /> {isEditMode ? 'Cập nhật đơn hàng' : 'Tạo đơn hàng'}</>}
          </button>
        </div>
      </div>
    </div>
  )
}

export default POFormPage