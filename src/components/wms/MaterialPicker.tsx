// ============================================================================
// MaterialPicker — Select vật liệu dùng chung, shared React Query cache
// File: src/components/wms/MaterialPicker.tsx
// Pattern: mirror WarehousePicker — internal fetch via useQuery, filter by type.
// ============================================================================

import { useMemo } from 'react'
import { Select } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

interface MaterialOption {
  id: string
  sku: string
  name: string
  unit?: string
  type?: string
  weight_per_unit?: number | null
}

export interface MaterialPickerProps {
  value?: string
  onChange: (id: string) => void
  /** Filter theo type: 'raw' | 'finished' | undefined (tất cả) */
  materialType?: 'raw' | 'finished'
  size?: 'small' | 'middle' | 'large'
  style?: React.CSSProperties
  placeholder?: string
  disabled?: boolean
  allowClear?: boolean
  /** Show search (default true) */
  showSearch?: boolean
}

const MATERIALS_QUERY_KEY = ['wms-materials-active'] as const

function useActiveMaterials() {
  return useQuery<MaterialOption[]>({
    queryKey: MATERIALS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materials')
        .select('id, sku, name, unit, type, weight_per_unit')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data || []
    },
    staleTime: 5 * 60 * 1000,
  })
}

const MaterialPicker = ({
  value,
  onChange,
  materialType,
  size = 'middle',
  style,
  placeholder,
  disabled = false,
  allowClear = false,
  showSearch = true,
}: MaterialPickerProps) => {
  const { data: materials = [], isLoading } = useActiveMaterials()

  const filtered = useMemo(() => {
    if (!materialType) return materials
    return materials.filter(m => m.type === materialType)
  }, [materials, materialType])

  const typeLabel = materialType === 'raw' ? 'NVL' : materialType === 'finished' ? 'TP' : ''
  const defaultPlaceholder = typeLabel ? `Chọn vật liệu ${typeLabel}` : 'Chọn vật liệu'

  return (
    <Select
      value={value || undefined}
      onChange={onChange}
      loading={isLoading}
      disabled={disabled}
      size={size}
      style={{ width: '100%', ...style }}
      placeholder={placeholder ?? defaultPlaceholder}
      allowClear={allowClear}
      showSearch={showSearch}
      optionFilterProp="label"
      notFoundContent={filtered.length === 0 && !isLoading ? 'Không có vật liệu nào' : undefined}
      options={filtered.map(m => ({
        value: m.id,
        label: `${m.sku} — ${m.name}`,
      }))}
    />
  )
}

export { useActiveMaterials, MATERIALS_QUERY_KEY }
export default MaterialPicker
