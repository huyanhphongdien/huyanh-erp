// ============================================================================
// FacilityPicker — Select nhà máy dùng chung (multi-facility F1)
// File: src/components/wms/FacilityPicker.tsx
// Pattern: mirror WarehousePicker
// ============================================================================

import { Select } from 'antd'
import { useActiveFacilities } from '../../hooks/useActiveFacilities'

export interface FacilityPickerProps {
  /** ID facility đang chọn. undefined = "Tất cả" */
  value?: string
  /** Callback khi đổi (id | undefined) */
  onChange: (id: string | undefined) => void
  /** Cho phép option "Tất cả nhà máy" (default true cho admin/BGD) */
  allowAll?: boolean
  size?: 'small' | 'middle' | 'large'
  style?: React.CSSProperties
  placeholder?: string
  disabled?: boolean
  /** Filter chỉ facilities có thể ship trực tiếp (chỉ PD hiện tại) */
  shippingOnly?: boolean
}

const COUNTRY_FLAG: Record<string, string> = {
  VN: '🇻🇳',
  LA: '🇱🇦',
  TH: '🇹🇭',
  KH: '🇰🇭',
}

const FacilityPicker = ({
  value,
  onChange,
  allowAll = true,
  size = 'middle',
  style,
  placeholder = 'Chọn nhà máy',
  disabled = false,
  shippingOnly = false,
}: FacilityPickerProps) => {
  const { data: facilities = [], isLoading } = useActiveFacilities()

  const filtered = shippingOnly
    ? facilities.filter(f => f.can_ship_to_customer)
    : facilities

  const options = [
    ...(allowAll ? [{ value: '__all__', label: '🏢 Tất cả nhà máy' }] : []),
    ...filtered.map(f => ({
      value: f.id,
      label: `${COUNTRY_FLAG[f.country || 'VN'] || '🏭'} ${f.name}`,
    })),
  ]

  return (
    <Select
      value={value || (allowAll ? '__all__' : undefined)}
      onChange={(v) => onChange(v === '__all__' ? undefined : v)}
      loading={isLoading}
      disabled={disabled}
      size={size}
      style={{ width: '100%', ...style }}
      placeholder={placeholder}
      options={options}
    />
  )
}

export default FacilityPicker
