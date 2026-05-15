// ============================================================================
// ORDER FILES WIDGET — 6 folder grid trong tab Tiến độ
// File: src/pages/sales/components/OrderFilesWidget.tsx
//
// Hợp đồng folder split 3 sub-folders (theo workflow ký):
//   📤 HĐ gửi KH       (sent_to_customer) — drafts gửi khách duyệt
//   ✍️ HĐ HA đã ký      (ha_signed)        — HA ký 1 bên, sau Trung/Huy xác nhận
//   ✅ HĐ FINAL         (final_signed)     — KH ký lại 2 bên (PHÁP LÝ)
//
// 5 folder còn lại (Vận chuyển, Chứng từ, Tài chính, Phiếu cân, Khác) giữ flat.
// ============================================================================

import { useEffect, useState } from 'react'
import { Spin } from 'antd'
import { supabase } from '../../../lib/supabase'

const PRIMARY = '#1B4D3E'

interface FolderConfig {
  doc_type: string
  icon: string
  name: string
  bg: string
  color: string
  tabKey: string
}

const FOLDERS: FolderConfig[] = [
  { doc_type: 'contract',    icon: '📋', name: 'Hợp đồng',     bg: '#f6ffed', color: '#389e0d', tabKey: 'contract' },
  { doc_type: 'shipping',    icon: '🚢', name: 'Vận chuyển',   bg: '#e6f4ff', color: '#1677ff', tabKey: 'shipping' },
  { doc_type: 'cert',        icon: '📑', name: 'Chứng từ',     bg: '#f9f0ff', color: '#531dab', tabKey: 'cert' },
  { doc_type: 'finance',     icon: '💰', name: 'Tài chính',    bg: '#fff7e6', color: '#d46b08', tabKey: 'finance' },
  { doc_type: 'weighbridge', icon: '🚛', name: 'Phiếu cân',    bg: '#e0f7fa', color: '#06b6d4', tabKey: 'weighbridge' },
  { doc_type: 'other',       icon: '📦', name: 'Khác',         bg: '#f5f5f5', color: '#595959', tabKey: 'other' },
]

interface FolderStat {
  doc_type: string
  count: number
  sample_names: string[]
}

interface SubFolderStat {
  doc_sub_type: string  // 'sent_to_customer' | 'ha_signed' | 'final_signed'
  count: number
  sample_names: string[]
}

interface Props {
  salesOrderId: string
  onNavigateTab?: (tabKey: string) => void
}

export default function OrderFilesWidget({ salesOrderId, onNavigateTab }: Props) {
  const [stats, setStats] = useState<Record<string, FolderStat>>({})
  const [contractSub, setContractSub] = useState<Record<string, SubFolderStat>>({})
  const [loading, setLoading] = useState(true)
  const [totalSize, setTotalSize] = useState(0)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const { data } = await supabase
          .from('sales_order_documents')
          .select('doc_type, doc_sub_type, file_name, file_size')
          .eq('sales_order_id', salesOrderId)
          .not('file_url', 'is', null)
        if (!mounted) return
        const map: Record<string, FolderStat> = {}
        const subMap: Record<string, SubFolderStat> = {}
        let total = 0
        type Row = {
          doc_type: string
          doc_sub_type: string | null
          file_name: string | null
          file_size: number | null
        }
        for (const row of (data || []) as Row[]) {
          const t = row.doc_type || 'other'
          if (!map[t]) map[t] = { doc_type: t, count: 0, sample_names: [] }
          map[t].count++
          if (row.file_name && map[t].sample_names.length < 3) {
            map[t].sample_names.push(row.file_name)
          }
          if (row.file_size) total += row.file_size

          // Tách sub-folder cho contract
          if (t === 'contract') {
            // Default file legacy không có sub_type → coi như sent_to_customer
            const sub = row.doc_sub_type || 'sent_to_customer'
            if (!subMap[sub]) subMap[sub] = { doc_sub_type: sub, count: 0, sample_names: [] }
            subMap[sub].count++
            if (row.file_name && subMap[sub].sample_names.length < 3) {
              subMap[sub].sample_names.push(row.file_name)
            }
          }
        }
        setStats(map)
        setContractSub(subMap)
        setTotalSize(total)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    void load()
    return () => { mounted = false }
  }, [salesOrderId])

  const totalCount = Object.values(stats).reduce((s, f) => s + f.count, 0)
  const fmtSize = (b: number) => {
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
    return `${(b / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div style={widget}>
      <div style={widgetHeader}>
        <span style={{ fontSize: 14, fontWeight: 700, color: PRIMARY }}>
          📁 Tài liệu đính kèm
        </span>
        <span style={totalBadge}>
          {loading ? <Spin size="small" /> : `${totalCount} file · ${fmtSize(totalSize)}`}
        </span>
      </div>

      <div style={folderGrid}>
        {FOLDERS.map((f) => {
          const stat = stats[f.doc_type]
          const count = stat?.count || 0
          const samples = stat?.sample_names || []
          const isContract = f.doc_type === 'contract'
          return (
            <div
              key={f.doc_type}
              style={{
                ...folder,
                opacity: loading ? 0.6 : 1,
                // HĐ folder spans 2 columns vì có 2 sub-folder bên dưới
                gridColumn: isContract ? 'span 2' : 'span 1',
              }}
              onClick={() => onNavigateTab?.(f.tabKey)}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = PRIMARY
                e.currentTarget.style.background = '#f0f9f4'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e8e8e8'
                e.currentTarget.style.background = '#fafafa'
              }}
            >
              <div style={folderHead}>
                <div style={{ ...folderIcon, background: f.bg, color: f.color }}>
                  {f.icon}
                </div>
                <span style={folderName}>{f.name}</span>
                <span style={{ ...folderCount, ...(count > 0 ? folderCountHas : {}) }}>
                  {count}
                </span>
              </div>

              {/* HĐ folder: 3 sub-folders theo workflow ký */}
              {isContract ? (
                <div style={subFolderRow}>
                  <ContractSubFolder
                    icon="📤"
                    name="HĐ gửi KH"
                    color="#fa8c16"
                    bg="#fff7e6"
                    stat={contractSub['sent_to_customer']}
                    hint="Drafts gửi KH duyệt"
                  />
                  <ContractSubFolder
                    icon="✍️"
                    name="HĐ HA đã ký"
                    color="#1677ff"
                    bg="#e6f4ff"
                    stat={contractSub['ha_signed']}
                    hint="HA ký 1 bên (chưa final)"
                  />
                  <ContractSubFolder
                    icon="✅"
                    name="HĐ FINAL"
                    color="#389e0d"
                    bg="#f6ffed"
                    stat={contractSub['final_signed']}
                    hint="KH ký lại — 2 bên (pháp lý)"
                  />
                </div>
              ) : (
                <div style={folderFiles}>
                  {samples.length === 0 ? (
                    <span style={{ fontStyle: 'italic' }}>— chưa có file</span>
                  ) : (
                    samples.join(' · ').slice(0, 60) + (samples.join(' · ').length > 60 ? '...' : '')
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Sub-folder card (chỉ dùng trong HĐ folder) ───
function ContractSubFolder({
  icon, name, color, bg, stat, hint,
}: {
  icon: string
  name: string
  color: string
  bg: string
  stat?: SubFolderStat
  hint: string
}) {
  const count = stat?.count || 0
  const samples = stat?.sample_names || []
  return (
    <div style={{
      ...subFolder,
      borderColor: count > 0 ? color : '#e8e8e8',
    }}>
      <div style={subFolderHead}>
        <span style={{
          width: 22, height: 22, borderRadius: 6, background: bg, color,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, flexShrink: 0,
        }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 600, flex: 1 }}>{name}</span>
        <span style={{
          ...folderCount,
          ...(count > 0 ? { background: color, color: '#fff', borderColor: color } : {}),
          fontSize: 10, padding: '0 6px',
        }}>{count}</span>
      </div>
      <div style={{ fontSize: 10, color: '#8c8c8c', marginTop: 4, fontStyle: 'italic' }}>
        {samples.length === 0 ? hint : samples.join(' · ').slice(0, 55) + (samples.join(' · ').length > 55 ? '...' : '')}
      </div>
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────

const widget: React.CSSProperties = {
  background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8',
  padding: 18, marginBottom: 20,
}

const widgetHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
}

const totalBadge: React.CSSProperties = {
  marginLeft: 'auto', padding: '3px 10px',
  background: '#f0f9f4', color: PRIMARY,
  borderRadius: 10, fontSize: 11, fontWeight: 700,
}

const folderGrid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
}

const folder: React.CSSProperties = {
  border: '1px solid #e8e8e8', borderRadius: 10, padding: '12px 14px',
  cursor: 'pointer', transition: 'all 0.15s', background: '#fafafa',
}

const folderHead: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
}

const folderIcon: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 7,
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
  flexShrink: 0,
}

const folderName: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, flex: 1, color: 'rgba(0,0,0,0.88)',
}

const folderCount: React.CSSProperties = {
  background: '#fff', padding: '1px 8px', borderRadius: 8,
  fontSize: 11, fontWeight: 700, color: '#595959',
  border: '1px solid #e8e8e8',
}

const folderCountHas: React.CSSProperties = {
  background: PRIMARY, color: '#fff', borderColor: PRIMARY,
}

const folderFiles: React.CSSProperties = {
  fontSize: 11, color: '#8c8c8c',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}

const subFolderRow: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 6,
}

const subFolder: React.CSSProperties = {
  background: '#fff', border: '1px dashed #d9d9d9', borderRadius: 8,
  padding: '8px 10px',
}

const subFolderHead: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
}
