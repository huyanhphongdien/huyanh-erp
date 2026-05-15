// ============================================================================
// ORDER FILES WIDGET — 6 folder grid trong tab Tiến độ
// File: src/pages/sales/components/OrderFilesWidget.tsx
//
// Hiện ngay khi mở đơn (tab Tiến độ default). Click folder → onNavigate
// callback từ parent để switch tab tương ứng.
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
  tabKey: string  // tab key tương ứng để navigate
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

interface Props {
  salesOrderId: string
  /** Callback khi user click folder — parent switch sang tab tương ứng */
  onNavigateTab?: (tabKey: string) => void
}

export default function OrderFilesWidget({ salesOrderId, onNavigateTab }: Props) {
  const [stats, setStats] = useState<Record<string, FolderStat>>({})
  const [loading, setLoading] = useState(true)
  const [totalSize, setTotalSize] = useState(0)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const { data } = await supabase
          .from('sales_order_documents')
          .select('doc_type, file_name, file_size')
          .eq('sales_order_id', salesOrderId)
          .not('file_url', 'is', null)
        if (!mounted) return
        const map: Record<string, FolderStat> = {}
        let total = 0
        for (const row of (data || []) as { doc_type: string; file_name: string | null; file_size: number | null }[]) {
          const t = row.doc_type || 'other'
          if (!map[t]) map[t] = { doc_type: t, count: 0, sample_names: [] }
          map[t].count++
          if (row.file_name && map[t].sample_names.length < 3) {
            map[t].sample_names.push(row.file_name)
          }
          if (row.file_size) total += row.file_size
        }
        setStats(map)
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
        <span style={total}>
          {loading ? <Spin size="small" /> : `${totalCount} file · ${fmtSize(totalSize)}`}
        </span>
      </div>

      <div style={folderGrid}>
        {FOLDERS.map((f) => {
          const stat = stats[f.doc_type]
          const count = stat?.count || 0
          const samples = stat?.sample_names || []
          return (
            <div
              key={f.doc_type}
              style={{
                ...folder,
                opacity: loading ? 0.6 : 1,
              }}
              onClick={() => onNavigateTab?.(f.tabKey)}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = PRIMARY
                e.currentTarget.style.background = '#f0f9f4'
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e8e8e8'
                e.currentTarget.style.background = '#fafafa'
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
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
              <div style={folderFiles}>
                {samples.length === 0 ? (
                  <span style={{ fontStyle: 'italic' }}>— chưa có file</span>
                ) : (
                  samples.join(' · ').slice(0, 60) + (samples.join(' · ').length > 60 ? '...' : '')
                )}
              </div>
            </div>
          )
        })}
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

const total: React.CSSProperties = {
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
