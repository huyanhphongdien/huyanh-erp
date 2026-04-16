// ============================================================================
// WarehousePicker — Select kho dùng chung, filter theo stockType (NVL/TP)
// File: src/components/wms/WarehousePicker.tsx
// Phase B consolidation: thay thế logic trùng ở StockIn/StockOut Create page.
// ============================================================================

import { useMemo } from 'react'
import { Select } from 'antd'
import { useActiveWarehouses } from '../../hooks/useActiveWarehouses'
import { useActiveFacilities } from '../../hooks/useActiveFacilities'
import { useFacilityFilter } from '../../stores/facilityFilterStore'
import type { Warehouse } from '../../services/wms'

export type WarehouseStockType = 'raw' | 'finished'

export interface WarehousePickerProps {
  value?: string
  onChange: (id: string) => void
  /**
   * Lọc kho theo loại:
   *  - 'raw'      → kho NVL (type='raw') + mixed
   *  - 'finished' → kho TP (type='finished') + mixed
   *  - undefined  → hiện tất cả
   * Kho type=null hoặc missing cũng được hiện (legacy data).
   */
  stockType?: WarehouseStockType
  /**
   * Lọc kho theo facility (multi-facility F2):
   *  - undefined → hiện tất cả 3 nhà máy
   *  - facility_id cụ thể → chỉ kho của NM đó
   * Auto: nếu không truyền, sẽ đọc currentFacilityId từ facilityFilterStore.
   * Truyền explicit `null` để force "tất cả" bất kể store.
   */
  facilityId?: string | null
  size?: 'small' | 'middle' | 'large'
  style?: React.CSSProperties
  placeholder?: string
  disabled?: boolean
  /** Gọi khi user click Select lần đầu — tiện chỗ nào muốn lazy load gì đó. */
  onFirstOpen?: () => void
  /** Hiện code facility trong label (VD "PD - KHO-A"). Default true khi multi-facility */
  showFacilityInLabel?: boolean
}

const typeLabel = (t?: WarehouseStockType) =>
  t === 'raw' ? 'NVL' : t === 'finished' ? 'TP' : ''

export function filterWarehousesByType(
  warehouses: Warehouse[],
  stockType?: WarehouseStockType,
): Warehouse[] {
  if (!stockType) return warehouses
  return warehouses.filter(w => !w.type || w.type === 'mixed' || w.type === stockType)
}

const WarehousePicker = ({
  value,
  onChange,
  stockType,
  facilityId,
  size = 'large',
  style,
  placeholder,
  disabled,
  showFacilityInLabel,
}: WarehousePickerProps) => {
  const { data: warehouses = [], isLoading } = useActiveWarehouses()
  const { data: facilities = [] } = useActiveFacilities()
  const { currentFacilityId } = useFacilityFilter()

  // Resolve effective facility filter:
  // - facilityId === null → force "tất cả"
  // - facilityId === string → dùng prop
  // - facilityId === undefined → fallback từ store (currentFacilityId)
  const effectiveFacilityId = facilityId === null
    ? undefined
    : facilityId ?? currentFacilityId

  const filtered = useMemo(() => {
    let list = filterWarehousesByType(warehouses, stockType)
    if (effectiveFacilityId) {
      list = list.filter(w => (w as any).facility_id === effectiveFacilityId)
    }
    return list
  }, [warehouses, stockType, effectiveFacilityId])

  // Map facility id → code để render label
  const facilityCode = (id?: string | null) => {
    if (!id) return ''
    return facilities.find(f => f.id === id)?.code || ''
  }

  const showFacility = showFacilityInLabel ?? !effectiveFacilityId
  const label = typeLabel(stockType)
  const defaultPlaceholder = label ? `Chọn kho ${label}` : 'Chọn kho'
  const emptyMsg = label ? `Không có kho ${label} nào` : 'Không có kho nào'

  return (
    <Select
      value={value || undefined}
      onChange={onChange}
      loading={isLoading}
      disabled={disabled}
      size={size}
      style={{ width: '100%', ...style }}
      placeholder={placeholder ?? defaultPlaceholder}
      notFoundContent={filtered.length === 0 && !isLoading ? emptyMsg : undefined}
      options={filtered.map(w => {
        const fcode = showFacility ? facilityCode((w as any).facility_id) : ''
        return {
          value: w.id,
          label: fcode ? `[${fcode}] ${w.code} — ${w.name}` : `${w.code} — ${w.name}`,
        }
      })}
    />
  )
}

export default WarehousePicker
