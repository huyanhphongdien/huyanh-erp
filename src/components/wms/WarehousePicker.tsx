// ============================================================================
// WarehousePicker — Select kho dùng chung, filter theo stockType (NVL/TP)
// File: src/components/wms/WarehousePicker.tsx
// Phase B consolidation: thay thế logic trùng ở StockIn/StockOut Create page.
// ============================================================================

import { useMemo } from 'react'
import { Select } from 'antd'
import { useActiveWarehouses } from '../../hooks/useActiveWarehouses'
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
  size?: 'small' | 'middle' | 'large'
  style?: React.CSSProperties
  placeholder?: string
  disabled?: boolean
  /** Gọi khi user click Select lần đầu — tiện chỗ nào muốn lazy load gì đó. */
  onFirstOpen?: () => void
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
  size = 'large',
  style,
  placeholder,
  disabled,
}: WarehousePickerProps) => {
  const { data: warehouses = [], isLoading } = useActiveWarehouses()

  const filtered = useMemo(
    () => filterWarehousesByType(warehouses, stockType),
    [warehouses, stockType],
  )

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
      options={filtered.map(w => ({
        value: w.id,
        label: `${w.code} — ${w.name}`,
      }))}
    />
  )
}

export default WarehousePicker
