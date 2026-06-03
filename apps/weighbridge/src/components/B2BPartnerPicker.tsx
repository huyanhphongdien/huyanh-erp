// ============================================================================
// B2B PARTNER PICKER — AntD autocomplete + Quick-Create modal trigger
// File: apps/weighbridge/src/components/B2BPartnerPicker.tsx
// ============================================================================

import { useState, useEffect, useMemo } from 'react'
import { AutoComplete, Button, Space, Tag, Input } from 'antd'
import { SearchOutlined, UserOutlined } from '@ant-design/icons'
import { supabase } from '@erp/lib/supabase'
import type { CreatedPartner } from '@erp/services/b2b/b2bPartnerCreateService'

interface PartnerOption {
  id: string
  code: string          // HAC-13 sau Phase 7 sync
  name: string
  tier?: string
  phone?: string | null
}

interface Props {
  value?: string | null
  onChange: (partnerId: string | null, partner?: PartnerOption) => void
  placeholder?: string
  disabled?: boolean
}

const TIER_COLORS: Record<string, string> = {
  diamond: 'purple',
  gold:    'gold',
  silver:  'default',
  bronze:  'orange',
  new:     'cyan',
}

export default function B2BPartnerPicker({ value, onChange, placeholder, disabled }: Props) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<PartnerOption[]>([])
  const [selected, setSelected] = useState<PartnerOption | null>(null)
  const [loading, setLoading] = useState(false)

  // Load selected khi prop value đổi
  useEffect(() => {
    if (!value) { setSelected(null); return }
    if (selected?.id === value) return
    ;(async () => {
      const { data } = await supabase
        .from('b2b_partners')
        .select('id, code, name, tier, phone')
        .eq('id', value)
        .maybeSingle()
      if (data) setSelected(data as PartnerOption)
    })()
  }, [value, selected?.id])

  // Search debounced
  useEffect(() => {
    if (query.trim().length < 2) { setOptions([]); return }
    let cancelled = false
    setLoading(true)
    const handle = setTimeout(async () => {
      const q = query.trim()
      const normalized = q.replace(/[\s-]/g, '')
      const isHac13 = /^\d{13}$/.test(normalized)

      let merged: Record<string, PartnerOption> = {}

      // 1. Match HAC-13 exact
      if (isHac13) {
        const { data } = await supabase
          .from('b2b_partners')
          .select('id, code, name, tier, phone')
          .eq('code', normalized)
          .limit(3)
        for (const p of (data ?? []) as PartnerOption[]) merged[p.id] = p
      }

      // 2. ILIKE name/code/phone
      const { data: ilikeRows } = await supabase
        .from('b2b_partners')
        .select('id, code, name, tier, phone')
        .or(`name.ilike.%${q}%,code.ilike.%${q}%,phone.ilike.%${q}%`)
        .limit(15)
      for (const p of (ilikeRows ?? []) as PartnerOption[]) {
        if (!merged[p.id]) merged[p.id] = p
      }

      // 3. bp_search_keys ALIAS / TAX_CODE / CCCD
      const { data: aliasRows } = await supabase
        .from('bp_search_keys')
        .select('bp_id, key_value, key_type')
        .ilike('key_value', `%${q}%`)
        .in('key_type', ['ALIAS', 'TAX_CODE', 'CCCD'])
        .limit(10)
      const bpIds = (aliasRows ?? []).map((r: { bp_id: string }) => r.bp_id)
      if (bpIds.length > 0) {
        const { data: byBp } = await supabase
          .from('b2b_partners')
          .select('id, code, name, tier, phone, bp_id')
          .in('bp_id', bpIds)
          .limit(10)
        for (const p of (byBp ?? []) as PartnerOption[]) {
          if (!merged[p.id]) merged[p.id] = p
        }
      }

      if (!cancelled) {
        setOptions(Object.values(merged).slice(0, 15))
        setLoading(false)
      }
    }, 250)
    return () => { cancelled = true; clearTimeout(handle) }
  }, [query])

  const autocompleteOptions = useMemo(
    () => options.map((p) => ({
      value: p.id,
      label: (
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
          <div style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>
            {p.code}
            {p.tier && (
              <Tag color={TIER_COLORS[p.tier] ?? 'default'} style={{ marginLeft: 6, fontSize: 10 }}>
                {p.tier}
              </Tag>
            )}
            {p.phone && <span style={{ marginLeft: 8 }}>· {p.phone}</span>}
          </div>
        </div>
      ),
      partner: p,
    })),
    [options],
  )

  const handleSelect = (id: string, opt: { partner?: PartnerOption }) => {
    const p = opt.partner
    if (p) {
      setSelected(p)
      setQuery('')
      onChange(id, p)
    }
  }

  const handleClear = () => {
    setSelected(null)
    setQuery('')
    onChange(null)
  }

  if (selected) {
    return (
      <Space style={{ width: '100%', padding: '6px 12px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 4 }}>
        <UserOutlined style={{ color: '#52c41a' }} />
        <Space direction="vertical" size={0} style={{ flex: 1 }}>
          <span style={{ fontWeight: 500 }}>{selected.name}</span>
          <span style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>
            {selected.code}
            {selected.tier && (
              <Tag color={TIER_COLORS[selected.tier] ?? 'default'} style={{ marginLeft: 6, fontSize: 10 }}>
                {selected.tier}
              </Tag>
            )}
          </span>
        </Space>
        {!disabled && (
          <Button type="link" size="small" danger onClick={handleClear}>
            Xoá
          </Button>
        )}
      </Space>
    )
  }

  return (
    <>
      <Space.Compact style={{ width: '100%' }}>
        <AutoComplete
          value={query}
          onChange={setQuery}
          onSelect={handleSelect}
          options={autocompleteOptions}
          disabled={disabled}
          style={{ flex: 1 }}
          notFoundContent={
            query.length >= 2 && !loading
              ? <div style={{ padding: 8, fontSize: 12, color: '#888' }}>
                  Không tìm thấy. Đại lý mới phải được tạo ở ERP (1 đầu mối — tránh trùng), rồi mới cân được.
                </div>
              : null
          }
        >
          <Input
            prefix={<SearchOutlined />}
            placeholder={placeholder ?? 'Tìm: HAC-13, tên, SĐT, CCCD, MST, mã legacy...'}
            allowClear
          />
        </AutoComplete>
      </Space.Compact>

    </>
  )
}
