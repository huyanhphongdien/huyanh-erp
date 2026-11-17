// ============================================================================
// FacilityPicker — Select nhà máy dùng chung (multi-facility F1)
// File: src/components/wms/FacilityPicker.tsx
// Pattern: mirror WarehousePicker
// ============================================================================

import { useEffect, useRef } from 'react'
import { Select } from 'antd'
import { useActiveFacilities } from '../../hooks/useActiveFacilities'
import { useFacilityFilter } from '../../stores/facilityFilterStore'

export interface FacilityPickerProps {
  /** ID facility đang chọn. undefined = "Tất cả". Bị bỏ qua khi persist=true (đọc store). */
  value?: string
  /** Callback khi đổi (id | undefined). Khi persist=true còn được gọi lúc mount với giá
      trị đã nhớ / mặc định — trang chỉ cần setState từ đây, không phải tự đọc store. */
  onChange?: (id: string | undefined) => void
  /** Cho phép option "Tất cả nhà máy" (default true cho admin/BGD) */
  allowAll?: boolean
  size?: 'small' | 'middle' | 'large'
  style?: React.CSSProperties
  placeholder?: string
  disabled?: boolean
  /** Filter chỉ facilities có thể ship trực tiếp (chỉ PD hiện tại) */
  shippingOnly?: boolean
  /** Nhớ lựa chọn qua màn: đọc/ghi store 'wms-facility-filter' (localStorage) — thủ kho
      TL không phải chọn lại TL ở từng sổ (audit 17/11/2026). */
  persist?: boolean
  /** Chỉ dùng khi persist và allowAll=false: store trống/"Tất cả" thì mặc định nhà máy
      mã này ('PD'…), rồi mới tới phần tử đầu. KHÔNG tự ghi mặc định vào store — store
      chỉ giữ lựa chọn người dùng tự tay chọn. */
  defaultCode?: string
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
  persist = false,
  defaultCode,
}: FacilityPickerProps) => {
  const { data: facilities = [], isLoading } = useActiveFacilities()
  const { currentFacilityId, setCurrentFacilityId } = useFacilityFilter()

  const filtered = shippingOnly
    ? facilities.filter(f => f.can_ship_to_customer)
    : facilities

  // persist: giá trị hiệu lực = lựa chọn đã nhớ trong store; store trống / "Tất cả"
  // (hoặc id không còn hoạt động) mà màn bắt chọn cụ thể → defaultCode → phần tử đầu.
  const storeId = persist && currentFacilityId
    && (filtered.length === 0 || filtered.some(f => f.id === currentFacilityId))
    ? currentFacilityId
    : undefined
  const effectiveValue = persist
    ? storeId ?? (allowAll ? undefined : filtered.find(f => f.code === defaultCode)?.id ?? filtered[0]?.id)
    : value

  // persist: báo giá trị hiệu lực ra ngoài (kể cả lúc mount) để trang đặt query theo nó.
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange })
  useEffect(() => {
    if (persist) onChangeRef.current?.(effectiveValue)
  }, [persist, effectiveValue])

  const options = [
    ...(allowAll ? [{ value: '__all__', label: '🏢 Tất cả nhà máy' }] : []),
    ...filtered.map(f => ({
      value: f.id,
      label: `${COUNTRY_FLAG[f.country || 'VN'] || '🏭'} ${f.name}`,
    })),
  ]

  // persist + danh sách chưa về: hiện placeholder thay vì id thô đọc từ store.
  const selectValue = persist
    ? (effectiveValue && filtered.some(f => f.id === effectiveValue)
      ? effectiveValue
      : (allowAll ? '__all__' : undefined))
    : (value || (allowAll ? '__all__' : undefined))

  return (
    <Select
      value={selectValue}
      onChange={(v) => {
        const id = v === '__all__' ? undefined : v
        if (persist) setCurrentFacilityId(id)
        onChange?.(id)
      }}
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
