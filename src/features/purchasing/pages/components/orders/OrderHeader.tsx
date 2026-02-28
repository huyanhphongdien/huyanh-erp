// ============================================================================
// ORDER HEADER - Form thông tin chung
// File: src/features/purchasing/pages/components/orders/OrderHeader.tsx
// ============================================================================

import { useState } from 'react'
import { FileText, MapPin, ChevronDown, ChevronUp } from 'lucide-react'
import type { POFormData } from '../../../../../services/purchaseOrderService'

// ===== TYPES =====

interface Department {
  id: string
  code: string
  name: string
}

interface Employee {
  id: string
  code: string
  full_name: string
  department_id?: string | null
}

interface OrderHeaderProps {
  formData: POFormData
  departments: Department[]
  employees: Employee[]
  onChange: (field: keyof POFormData, value: string) => void
  /** Mặc định mở section Giao hàng */
  defaultShowDelivery?: boolean
}

// ===== COMPONENT =====

export function OrderHeader({
  formData,
  departments,
  employees,
  onChange,
  defaultShowDelivery = false,
}: OrderHeaderProps) {
  const [showInfo, setShowInfo] = useState(true)
  const [showDelivery, setShowDelivery] = useState(defaultShowDelivery)

  return (
    <>
      {/* ===== SECTION 1: THÔNG TIN CHUNG ===== */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <button
          type="button"
          onClick={() => setShowInfo(!showInfo)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors rounded-t-xl"
        >
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-500" />
            Thông tin chung
          </h2>
          {showInfo ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </button>

        {showInfo && (
          <div className="px-5 pb-5 border-t border-gray-100">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              {/* Ngày đơn hàng */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ngày đơn hàng <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formData.order_date}
                  onChange={(e) => onChange('order_date', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>

              {/* Tên dự án */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tên dự án / Công trình
                </label>
                <input
                  type="text"
                  value={formData.project_name}
                  onChange={(e) => onChange('project_name', e.target.value)}
                  placeholder="VD: Nhà xưởng mới, Bảo trì Q1..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>

              {/* Mã dự án */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mã dự án
                </label>
                <input
                  type="text"
                  value={formData.project_code}
                  onChange={(e) => onChange('project_code', e.target.value)}
                  placeholder="VD: DA-2026-001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>

              {/* Phòng ban */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phòng ban yêu cầu
                </label>
                <select
                  value={formData.department_id}
                  onChange={(e) => onChange('department_id', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">Chọn phòng ban</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Người yêu cầu */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Người yêu cầu
                </label>
                <select
                  value={formData.requester_id}
                  onChange={(e) => onChange('requester_id', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">Chọn nhân viên</option>
                  {employees
                    .filter((e) => !formData.department_id || e.department_id === formData.department_id)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.full_name} ({e.code})
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== SECTION 2: GIAO HÀNG ===== */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <button
          type="button"
          onClick={() => setShowDelivery(!showDelivery)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors rounded-t-xl"
        >
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-green-500" />
            Giao hàng
          </h2>
          {showDelivery ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </button>

        {showDelivery && (
          <div className="px-5 pb-5 border-t border-gray-100">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ngày giao dự kiến
                </label>
                <input
                  type="date"
                  value={formData.expected_delivery_date}
                  onChange={(e) => onChange('expected_delivery_date', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Địa chỉ giao hàng
                </label>
                <input
                  type="text"
                  value={formData.delivery_address}
                  onChange={(e) => onChange('delivery_address', e.target.value)}
                  placeholder="Địa chỉ nhận hàng..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ghi chú giao hàng
                </label>
                <textarea
                  value={formData.delivery_notes}
                  onChange={(e) => onChange('delivery_notes', e.target.value)}
                  rows={2}
                  placeholder="VD: Giao vào buổi sáng, liên hệ trước 30 phút..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default OrderHeader