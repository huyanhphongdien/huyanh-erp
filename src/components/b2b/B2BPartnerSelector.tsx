// ============================================================================
// B2B PARTNER SELECTOR — Autocomplete chọn đại lý (HAC-13 / alias / tên)
// File: src/components/b2b/B2BPartnerSelector.tsx
// ============================================================================

import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface PartnerOption {
  id: string
  code: string                              // HAC-13
  name: string
  tier?: string
  legacy_aliases?: string[]
}

interface Props {
  value?: string | null                     // partner_id
  onChange: (partnerId: string | null, partner?: PartnerOption) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function B2BPartnerSelector({
  value,
  onChange,
  placeholder = 'Tìm đại lý: HAC-13, mã alias (DEMO-XXX, TEHG01...), hoặc tên...',
  disabled,
  className,
}: Props) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<PartnerOption[]>([])
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<PartnerOption | null>(null)
  const [loading, setLoading] = useState(false)

  // Khi prop value đổi → tải selected từ DB
  useEffect(() => {
    if (!value) {
      setSelected(null)
      return
    }
    if (selected?.id === value) return
    ;(async () => {
      const { data } = await supabase
        .from('b2b_partners')
        .select('id, code, name, tier')
        .eq('id', value)
        .maybeSingle()
      if (data) setSelected(data as PartnerOption)
    })()
  }, [value, selected?.id])

  // Search khi query đổi
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setOptions([])
      return
    }
    let cancelled = false
    setLoading(true)

    const run = async () => {
      const q = query.trim()
      const normalized = q.replace(/[\s-]/g, '')

      // 1. Match HAC-13 chính xác
      const isHac13 = /^\d{13}$/.test(normalized)
      let directRows: PartnerOption[] = []
      if (isHac13) {
        const { data } = await supabase
          .from('b2b_partners')
          .select('id, code, name, tier')
          .eq('code', normalized)
          .limit(5)
        directRows = (data ?? []) as PartnerOption[]
      }

      // 2. ILIKE search trên name + code
      const { data: ilikeRows } = await supabase
        .from('b2b_partners')
        .select('id, code, name, tier')
        .or(`name.ilike.%${q}%,code.ilike.%${q}%`)
        .limit(15)

      // 3. Match qua bp_search_keys ALIAS
      const { data: aliasRows } = await supabase
        .from('bp_search_keys')
        .select('key_value, bp_id')
        .eq('key_type', 'ALIAS')
        .ilike('key_value', `%${q}%`)
        .limit(10)
      const aliasBpIds = (aliasRows ?? []).map((r: { bp_id: string }) => r.bp_id)
      let aliasPartners: PartnerOption[] = []
      if (aliasBpIds.length > 0) {
        const { data: pByBp } = await supabase
          .from('b2b_partners')
          .select('id, code, name, tier, bp_id')
          .in('bp_id', aliasBpIds)
          .limit(10)
        aliasPartners = (pByBp ?? []) as PartnerOption[]
      }

      // Merge unique by id
      const merged: Record<string, PartnerOption> = {}
      for (const list of [directRows, ilikeRows ?? [], aliasPartners]) {
        for (const r of list as PartnerOption[]) {
          if (!merged[r.id]) merged[r.id] = r
        }
      }

      if (!cancelled) {
        setOptions(Object.values(merged).slice(0, 15))
        setLoading(false)
      }
    }

    const handle = setTimeout(run, 250) // debounce
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [query, open])

  const handleSelect = (opt: PartnerOption) => {
    setSelected(opt)
    setQuery('')
    setOpen(false)
    onChange(opt.id, opt)
  }

  const handleClear = () => {
    setSelected(null)
    setQuery('')
    onChange(null)
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      {selected ? (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border rounded-md bg-emerald-50 border-emerald-200">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-900 truncate">{selected.name}</div>
            <div className="text-xs text-slate-600 font-mono">
              {selected.code} {selected.tier && <span className="ml-1 text-emerald-700">· {selected.tier}</span>}
            </div>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="text-xs text-slate-500 hover:text-rose-600"
            >
              Xoá
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 200)}
              placeholder={placeholder}
              disabled={disabled}
              className="w-full pl-9 pr-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>
          {open && (options.length > 0 || loading) && (
            <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg max-h-64 overflow-y-auto">
              {loading && <div className="px-3 py-2 text-xs text-slate-500">Đang tìm…</div>}
              {options.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onMouseDown={() => handleSelect(opt)}
                  className="w-full text-left px-3 py-2 hover:bg-emerald-50 border-b last:border-b-0"
                >
                  <div className="text-sm font-medium text-slate-900">{opt.name}</div>
                  <div className="text-xs text-slate-500 font-mono">
                    {opt.code}
                    {opt.tier && <span className="ml-2 text-emerald-700">· {opt.tier}</span>}
                  </div>
                </button>
              ))}
              {!loading && options.length === 0 && (
                <div className="px-3 py-2 text-xs text-slate-500">Không tìm thấy đại lý.</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default B2BPartnerSelector
