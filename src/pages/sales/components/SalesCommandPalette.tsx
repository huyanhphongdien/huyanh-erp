// ============================================================================
// SALES COMMAND PALETTE (Cmd+K)
// File: src/pages/sales/components/SalesCommandPalette.tsx
//
// Mount trong SalesOrderListPage + SalesDashboardPage. Bắt phím Ctrl+K (Cmd+K trên Mac) →
// mở modal search/action. Filter orders + customers + global actions.
// ⚠ Tab ERP giữ sống bằng display:none (không unmount) → nhiều bản palette cùng nghe window.
//   Chỉ bản có khối NEO đang hiện (nằm trong tab đang mở) mới phản ứng — xem isOnScreen().
//
// Keyboard: ↑↓ chuyển, Enter mở, Esc đóng.
// ============================================================================

import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SalesOrder } from '../../../services/sales/salesTypes'
import { countryFlag, soDisplayCode } from '../../../services/sales/salesTypes'
import { fmtMoney, orderTotalInCurrency } from '../../../services/sales/salesMoney'
import { fmtNum } from '../../../utils/format'

const PRIMARY = '#1B4D3E'
const PRIMARY_BG = '#f0f9f4'

// (Bảng COUNTRY_FLAGS 16 nước cũ đã gỡ — countryFlag() sinh cờ từ mọi mã ISO-2, audit 17/11/2026)

interface PaletteItem {
  id: string
  group: string
  icon: string
  title: string
  meta?: string
  shortcut?: string
  action: () => void
}

interface Props {
  orders: SalesOrder[]
  onOpenOrder?: (orderId: string) => void
}

export default function SalesCommandPalette({ orders, onOpenOrder }: Props) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // Khối neo 0×0 luôn render: tab chứa nó đang display:none → không có hộp layout (offsetParent null,
  // getClientRects rỗng) → palette của tab ẩn đứng im, không mở chồng lên palette của tab đang xem.
  const anchorRef = useRef<HTMLSpanElement>(null)

  // Build items based on query
  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase()
    const list: PaletteItem[] = []

    // ACTIONS (luôn hiện)
    const actions: PaletteItem[] = [
      {
        id: 'act-new',
        group: 'Hành động',
        icon: '+',
        title: 'Tạo đơn hàng mới',
        meta: 'Mở form tạo đơn',
        // (bỏ gợi ý phím "Ctrl+N": không có phím tắt nào gắn — trình duyệt dùng Ctrl+N mở cửa sổ mới)
        action: () => navigate('/sales/orders/new'),
      },
      {
        id: 'act-dashboard',
        group: 'Hành động',
        icon: '📊',
        title: 'Mở Tổng quan bán hàng',
        meta: 'Bảng tổng quan đơn hàng',
        action: () => navigate('/sales/dashboard'),
      },
      {
        id: 'act-kanban',
        group: 'Hành động',
        icon: '▦',
        title: 'Xem bảng tiến độ (Kanban)',
        meta: 'Đơn theo bộ phận / công đoạn',
        action: () => navigate('/sales/kanban'),
      },
      {
        id: 'act-customers',
        group: 'Hành động',
        icon: '🏢',
        title: 'Quản lý Khách hàng',
        action: () => navigate('/sales/customers'),
      },
    ]

    // Filter actions by query
    list.push(
      ...actions.filter((a) =>
        !q || a.title.toLowerCase().includes(q) || a.meta?.toLowerCase().includes(q),
      ),
    )

    // ORDERS (filter by query nếu có, không thì top 10)
    const filteredOrders = q
      ? orders.filter(
          (o) =>
            (o.contract_no || '').toLowerCase().includes(q) ||
            (o.code || '').toLowerCase().includes(q) ||
            (o.customer?.name || '').toLowerCase().includes(q) ||
            (o.grade || '').toLowerCase().includes(q),
        )
      : orders.slice(0, 10)

    list.push(
      ...filteredOrders.map<PaletteItem>((o) => ({
        id: `ord-${o.id}`,
        group: 'Đơn hàng',
        icon: countryFlag(o.customer?.country) || '📦',
        title: `${soDisplayCode(o)} · ${o.customer?.name || '—'}`,
        // Tiền theo ĐÚNG đồng tiền của đơn (đơn VNĐ không gắn "$" cho số quy đổi)
        meta: `${o.grade || '—'} · ${fmtNum(o.quantity_tons || 0, 2)} tấn · ${fmtMoney(orderTotalInCurrency(o), o.currency, { compact: true })}`,
        action: () => {
          if (onOpenOrder) onOpenOrder(o.id)
          else navigate(`/sales/orders/${o.id}`)
        },
      })),
    )

    return list
  }, [query, orders, navigate, onOpenOrder])

  // Reset active index when items change
  useEffect(() => {
    setActiveIdx(0)
  }, [query])

  // Focus input on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIdx(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Global Ctrl+K / Cmd+K handler — chỉ bản palette đang HIỆN phản ứng (cả phím tắt lẫn sự kiện mở)
  useEffect(() => {
    const isOnScreen = () => {
      const el = anchorRef.current
      return !!el && (el.offsetParent !== null || el.getClientRects().length > 0)
    }
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (!isOnScreen()) return   // tab đang ẩn: để bản đang hiện (hoặc trình duyệt) xử lý
        e.preventDefault()
        setOpen((o) => !o)
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    // Cũng listen custom event để Cmd+K trigger button (visible) có thể mở
    const openHandler = () => {
      if (isOnScreen()) setOpen(true)
    }
    window.addEventListener('keydown', handler)
    window.addEventListener('sales-cmdk-open', openHandler)
    return () => {
      window.removeEventListener('keydown', handler)
      window.removeEventListener('sales-cmdk-open', openHandler)
    }
  }, [open])

  // ↑↓ Enter inside palette
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = items[activeIdx]
      if (item) {
        item.action()
        setOpen(false)
      }
    }
  }

  // Scroll active item into view
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx, open])

  // Neo luôn là con ĐẦU của fragment ở cả 2 nhánh → React giữ nguyên node, ref không nhảy
  const anchor = <span ref={anchorRef} aria-hidden="true" style={anchorStyle} />

  if (!open) return <>{anchor}</>

  // Group items
  const grouped: Record<string, PaletteItem[]> = {}
  items.forEach((item) => {
    if (!grouped[item.group]) grouped[item.group] = []
    grouped[item.group].push(item)
  })

  let runningIdx = 0

  return (
    <>
    {anchor}
    <div style={overlay} onClick={() => setOpen(false)}>
      <div style={box} onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div style={inputWrap}>
          <span style={{ fontSize: 18 }}>🔍</span>
          <input
            ref={inputRef}
            style={input}
            placeholder="Gõ số HĐ, mã đơn, khách hàng hoặc grade..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span style={kbd}>ESC</span>
        </div>

        <div ref={listRef} style={results}>
          {items.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#bfbfbf', fontSize: 13 }}>
              Không có kết quả cho "{query}"
            </div>
          ) : (
            Object.entries(grouped).map(([group, groupItems]) => (
              <div key={group}>
                <div style={groupTitle}>
                  {group} ({groupItems.length})
                </div>
                {groupItems.map((item) => {
                  const idx = runningIdx++
                  const active = idx === activeIdx
                  return (
                    <div
                      key={item.id}
                      data-idx={idx}
                      style={{
                        ...row,
                        background: active ? PRIMARY_BG : 'transparent',
                        boxShadow: active ? `inset 3px 0 0 ${PRIMARY}` : 'none',
                      }}
                      onClick={() => {
                        item.action()
                        setOpen(false)
                      }}
                      onMouseEnter={() => setActiveIdx(idx)}
                    >
                      <div style={icon}>{item.icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{item.title}</div>
                        {item.meta && (
                          <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 1 }}>
                            {item.meta}
                          </div>
                        )}
                      </div>
                      {item.shortcut && (
                        <span style={{ fontSize: 10, color: '#8c8c8c', fontFamily: 'monospace' }}>
                          {item.shortcut}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div style={footer}>
          <span><span style={kbd}>↑</span><span style={kbd}>↓</span> chuyển</span>
          <span><span style={kbd}>↵</span> mở</span>
          <span style={{ marginLeft: 'auto', color: '#bfbfbf' }}>
            {items.length} kết quả
          </span>
        </div>
      </div>
    </div>
    </>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────

// Neo 0×0 ra khỏi dòng chảy (absolute) → không đẩy layout / gap của trang chứa nó
const anchorStyle: React.CSSProperties = {
  position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none',
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  backdropFilter: 'blur(4px)', zIndex: 100,
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  paddingTop: '12vh',
}

const box: React.CSSProperties = {
  width: 'min(640px, 92vw)', background: '#fff', borderRadius: 14,
  boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden',
  display: 'flex', flexDirection: 'column', maxHeight: '70vh',
}

const inputWrap: React.CSSProperties = {
  padding: '16px 20px', borderBottom: '1px solid #e8e8e8',
  display: 'flex', alignItems: 'center', gap: 12,
}

const input: React.CSSProperties = {
  flex: 1, border: 'none', outline: 'none', fontSize: 15, fontFamily: 'inherit',
  background: 'transparent',
}

const results: React.CSSProperties = {
  overflowY: 'auto', padding: '8px 0', flex: 1,
}

const groupTitle: React.CSSProperties = {
  padding: '10px 20px 6px', fontSize: 10, textTransform: 'uppercase',
  letterSpacing: 0.8, color: '#8c8c8c', fontWeight: 700,
}

const row: React.CSSProperties = {
  padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 10,
  cursor: 'pointer', fontSize: 13, transition: 'background 0.1s',
}

const icon: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 6, background: '#f5f5f5',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
  flexShrink: 0,
}

const footer: React.CSSProperties = {
  padding: '10px 20px', borderTop: '1px solid #e8e8e8',
  display: 'flex', gap: 16, alignItems: 'center', fontSize: 11,
  color: '#8c8c8c', background: '#fafafa',
}

const kbd: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', padding: '1px 6px',
  background: '#fff', border: '1px solid #d9d9d9', borderRadius: 4,
  fontFamily: 'monospace', fontSize: 10, color: '#595959',
  margin: '0 2px', boxShadow: '0 1px 0 #d9d9d9',
}
