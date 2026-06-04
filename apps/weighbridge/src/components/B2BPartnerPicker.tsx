// ============================================================================
// B2B PARTNER PICKER — tìm đối tác (đại lý B2B + NCC) thông minh
// File: apps/weighbridge/src/components/B2BPartnerPicker.tsx
//
// • Tìm KHÔNG phân biệt dấu (gõ "Huong" ra "Hường") — cache toàn bộ partner/NCC
//   rồi lọc client-side bằng chuẩn hóa bỏ dấu. Không cần migration DB.
// • Vẫn tra CCCD/MST/alias qua bp_search_keys (số → không vướng dấu).
// • List kết quả giàu: avatar, nhãn Đại lý/NCC, hạng (tiếng Việt), bonus,
//   hoạt động cân gần đây, footer đếm kết quả (theo mock).
// ============================================================================

import { useState, useEffect, useMemo } from 'react'
import { AutoComplete, Button, Tag, Input } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { supabase } from '@erp/lib/supabase'

interface PartnerOption {
  id: string
  code: string          // HAC-13 sau Phase 7 sync
  name: string
  tier?: string
  phone?: string | null
  kind?: 'partner' | 'supplier'   // partner = b2b_partners (có bonus) · supplier = NCC (không)
}

interface Props {
  value?: string | null
  /** opt.kind cho biết là 'partner' (đại lý B2B) hay 'supplier' (NCC) */
  onChange: (id: string | null, opt?: PartnerOption) => void
  placeholder?: string
  disabled?: boolean
  /** Gộp tìm cả NCC (rubber_suppliers) chung 1 ô — kết quả có nhãn phân biệt */
  includeSuppliers?: boolean
}

const TIER_COLORS: Record<string, string> = {
  diamond: 'purple', gold: 'gold', silver: 'default', bronze: 'orange', new: 'cyan',
}
const TIER_VN: Record<string, string> = {
  diamond: 'Kim cương', gold: 'Vàng', silver: 'Bạc', bronze: 'Đồng', new: 'Mới',
}
const AVATAR_COLORS = ['#1B4D3E', '#b45309', '#6d28d9', '#0e7490', '#be123c', '#15803d', '#2563eb']

// ── Helpers ──────────────────────────────────────────────────────────────────
/** Bỏ dấu tiếng Việt + lowercase để so khớp không phân biệt dấu */
function noAccent(s: string): string {
  // NFD tách tone mark khỏi â/ă/ê/ô… nhưng KHÔNG tách móc của ư/ơ (precomposed)
  // → phải map tay ư→u, ơ→o, đ→d.
  return (s || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[ơƠ]/g, 'o')
    .replace(/[ưƯ]/g, 'u')
    .toLowerCase().trim()
}
function initials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
function colorFor(s: string): string {
  let h = 0
  for (const c of s || '') h = (h * 31 + c.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
function recencyLabel(iso?: string | null): string | null {
  if (!iso) return null
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (diff <= 0) return 'Hôm nay'
  if (diff === 1) return 'Hôm qua'
  if (diff < 30) return `${diff} ngày trước`
  if (diff < 365) return `${Math.floor(diff / 30)} tháng trước`
  return `${Math.floor(diff / 365)} năm trước`
}

// ── Cache toàn bộ partner/NCC (per-session, TTL 2 phút) ──────────────────────
let PARTNER_CACHE: PartnerOption[] | null = null
let SUPPLIER_CACHE: PartnerOption[] | null = null
let cacheAt = 0
let cacheLoading: Promise<void> | null = null

async function ensureCache(includeSuppliers: boolean) {
  const fresh = Date.now() - cacheAt < 120_000
  if (PARTNER_CACHE && fresh && (!includeSuppliers || SUPPLIER_CACHE)) return
  if (!cacheLoading) {
    cacheLoading = (async () => {
      const { data: ps } = await supabase
        .from('b2b_partners').select('id, code, name, tier, phone').limit(5000)
      PARTNER_CACHE = ((ps ?? []) as PartnerOption[]).map((p) => ({ ...p, kind: 'partner' as const }))
      const { data: ss } = await supabase
        .from('rubber_suppliers').select('id, code, name, phone').limit(5000)
      SUPPLIER_CACHE = ((ss ?? []) as PartnerOption[]).map((s) => ({ ...s, kind: 'supplier' as const }))
      cacheAt = Date.now()
    })().finally(() => { cacheLoading = null })
  }
  await cacheLoading
}

export default function B2BPartnerPicker({ value, onChange, placeholder, disabled, includeSuppliers }: Props) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<PartnerOption[]>([])
  const [selected, setSelected] = useState<PartnerOption | null>(null)
  const [loading, setLoading] = useState(false)
  const [recentMap, setRecentMap] = useState<Record<string, string>>({})  // id -> last weigh ISO

  // Load selected khi prop value đổi
  useEffect(() => {
    if (!value) { setSelected(null); return }
    if (selected?.id === value) return
    ;(async () => {
      const { data } = await supabase
        .from('b2b_partners').select('id, code, name, tier, phone').eq('id', value).maybeSingle()
      if (data) { setSelected({ ...(data as PartnerOption), kind: 'partner' }); return }
      if (includeSuppliers) {
        const { data: s } = await supabase
          .from('rubber_suppliers').select('id, code, name, phone').eq('id', value).maybeSingle()
        if (s) setSelected({ ...(s as PartnerOption), kind: 'supplier' })
      }
    })()
  }, [value, selected?.id, includeSuppliers])

  // Search — debounced, không phân biệt dấu (client-side trên cache) + CCCD/MST (DB)
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setOptions([]); return }
    let cancelled = false
    setLoading(true)
    const handle = setTimeout(async () => {
      await ensureCache(!!includeSuppliers)
      if (cancelled) return

      const nq = noAccent(q)
      const digits = q.replace(/[\s-]/g, '')
      const pool = [...(PARTNER_CACHE || []), ...(includeSuppliers ? (SUPPLIER_CACHE || []) : [])]

      const merged: Record<string, PartnerOption> = {}
      for (const p of pool) {
        const hitName = noAccent(p.name).includes(nq)
        const hitCode = !!p.code && p.code.toLowerCase().includes(q.toLowerCase())
        const hitPhone = digits.length >= 3 && !!p.phone && p.phone.replace(/[\s-]/g, '').includes(digits)
        if (hitName || hitCode || hitPhone) merged[p.id] = p
      }

      // CCCD / MST / alias (số hoặc tên cũ) — tra bp_search_keys (chỉ partner)
      const { data: aliasRows } = await supabase
        .from('bp_search_keys')
        .select('bp_id, key_value, key_type')
        .ilike('key_value', `%${q}%`)
        .in('key_type', ['ALIAS', 'TAX_CODE', 'CCCD'])
        .limit(10)
      const bpIds = (aliasRows ?? []).map((r: { bp_id: string }) => r.bp_id)
      if (bpIds.length > 0) {
        const { data: byBp } = await supabase
          .from('b2b_partners').select('id, code, name, tier, phone, bp_id').in('bp_id', bpIds).limit(10)
        for (const p of (byBp ?? []) as PartnerOption[]) {
          if (!merged[p.id]) merged[p.id] = { ...p, kind: 'partner' }
        }
      }

      const result = Object.values(merged).slice(0, 20)
      if (cancelled) return
      setOptions(result)
      setLoading(false)

      // Hoạt động cân gần đây (best-effort) — 1 query cho các partner trong kết quả
      const partnerIds = result.filter((p) => p.kind !== 'supplier').map((p) => p.id)
      const supplierIds = result.filter((p) => p.kind === 'supplier').map((p) => p.id)
      const map: Record<string, string> = {}
      try {
        if (partnerIds.length) {
          const { data } = await supabase
            .from('weighbridge_tickets').select('partner_id, created_at')
            .in('partner_id', partnerIds).order('created_at', { ascending: false }).limit(500)
          for (const r of (data ?? []) as any[]) if (r.partner_id && !map[r.partner_id]) map[r.partner_id] = r.created_at
        }
        if (supplierIds.length) {
          const { data } = await supabase
            .from('weighbridge_tickets').select('supplier_id, created_at')
            .in('supplier_id', supplierIds).order('created_at', { ascending: false }).limit(500)
          for (const r of (data ?? []) as any[]) if (r.supplier_id && !map[r.supplier_id]) map[r.supplier_id] = r.created_at
        }
      } catch { /* non-blocking */ }
      if (!cancelled) setRecentMap(map)
    }, 200)
    return () => { cancelled = true; clearTimeout(handle) }
  }, [query, includeSuppliers])

  const autocompleteOptions = useMemo(
    () => options.map((p) => {
      const isSup = p.kind === 'supplier'
      const recent = recencyLabel(recentMap[p.id])
      return {
        value: p.id,
        label: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '3px 0' }}>
            {/* Avatar */}
            <div style={{
              width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
              background: colorFor(p.name), color: '#fff', fontSize: 12, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {initials(p.name)}
            </div>
            {/* Tên + meta */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.name}
                <Tag color={isSup ? 'blue' : 'green'} style={{ marginLeft: 6, fontSize: 10, lineHeight: '16px' }}>
                  {isSup ? 'NCC' : 'Đại lý'}
                </Tag>
                {!isSup && p.tier && (
                  <Tag color={TIER_COLORS[p.tier] ?? 'default'} style={{ marginLeft: 2, fontSize: 10, lineHeight: '16px' }}>
                    {TIER_VN[p.tier] ?? p.tier}
                  </Tag>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.phone ? <span style={{ fontFamily: 'monospace' }}>📞 {p.phone}</span> : null}
                {p.phone && p.code ? '  ·  ' : ''}
                {p.code ? <span style={{ fontFamily: 'monospace' }}>{p.code}</span> : null}
              </div>
            </div>
            {/* Bonus / hoạt động */}
            <div style={{ textAlign: 'right', flexShrink: 0, fontSize: 11, lineHeight: 1.3 }}>
              {isSup ? (
                <span style={{ color: '#d97706' }}>Không tính bonus</span>
              ) : recent ? (
                <span style={{ color: '#64748b' }}>Cân gần nhất<br /><b style={{ color: '#15803d' }}>{recent}</b></span>
              ) : (
                <span style={{ color: '#cbd5e1' }}>Chưa cân lần nào</span>
              )}
            </div>
          </div>
        ),
        partner: p,
      }
    }),
    [options, recentMap],
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
    const isSup = selected.kind === 'supplier'
    return (
      <div style={{ width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
        <div style={{
          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
          background: colorFor(selected.name), color: '#fff', fontSize: 12, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {initials(selected.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selected.name}
            <Tag color={isSup ? 'blue' : 'green'} style={{ marginLeft: 8, fontSize: 10 }}>
              {isSup ? 'NCC' : 'Đại lý'}
            </Tag>
            {!isSup && selected.tier && (
              <Tag color={TIER_COLORS[selected.tier] ?? 'default'} style={{ marginLeft: 2, fontSize: 10 }}>
                {TIER_VN[selected.tier] ?? selected.tier}
              </Tag>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#888', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selected.code}{selected.phone ? `  ·  ${selected.phone}` : ''}
          </div>
        </div>
        {!disabled && (
          <Button type="link" size="small" danger onClick={handleClear} style={{ flexShrink: 0, padding: '0 8px' }}>Xoá</Button>
        )}
      </div>
    )
  }

  const partnerCount = options.filter((p) => p.kind !== 'supplier').length
  const supplierCount = options.filter((p) => p.kind === 'supplier').length

  return (
    <>
      <AutoComplete
        value={query}
        onChange={setQuery}
        onSelect={handleSelect}
        options={autocompleteOptions}
        disabled={disabled}
        style={{ width: '100%' }}
        popupMatchSelectWidth
        notFoundContent={
          query.trim().length >= 2 && !loading
            ? <div style={{ padding: 10, fontSize: 12, color: '#888' }}>
                Không tìm thấy. Đại lý/NCC mới phải được tạo ở ERP (1 đầu mối — tránh trùng), rồi mới cân được.
              </div>
            : null
        }
        dropdownRender={(menu) => (
          <div>
            {menu}
            {options.length > 0 && (
              <div style={{ borderTop: '1px solid #f0f0f0', padding: '6px 10px', fontSize: 11, color: '#64748b', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <span>
                  <b>{options.length}</b> kết quả
                  {partnerCount > 0 && <> · 🟢 {partnerCount} đại lý</>}
                  {supplierCount > 0 && <> · 🔵 {supplierCount} NCC</>}
                </span>
                <span style={{ color: '#94a3b8' }}>Enter để lấy</span>
              </div>
            )}
          </div>
        )}
      >
        <Input
          prefix={<SearchOutlined />}
          placeholder={placeholder ?? 'Tìm: tên (có/không dấu), SĐT, CCCD, MST, HAC-13, mã cũ...'}
          allowClear
        />
      </AutoComplete>

      {/* Chips gợi ý tiêu chí tìm (theo mock) */}
      <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {['Tên', 'SĐT', 'CCCD', 'Mã HAC-13', 'MST', 'Mã cũ'].map((k) => (
          <Tag key={k} style={{ margin: 0, fontSize: 10, lineHeight: '18px', color: '#64748b', background: '#f8fafc', borderColor: '#e2e8f0' }}>
            {k}
          </Tag>
        ))}
      </div>
    </>
  )
}
