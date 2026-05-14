// ============================================================================
// ORDER PROGRESS DASHBOARD — Tiến độ tab content (match mock)
// File: src/pages/sales/components/OrderProgressDashboard.tsx
//
// Replaces the legacy single-card "Đang ở stage" với layout dashboard giống
// SALES_ORDERS_SPLIT_VIEW_MOCKUP.html:
//   - SLA alert banner (nếu overdue/at_risk)
//   - Workflow card (Sale → Kiểm tra → Ký) — 3 actor pull từ sales_order_contracts
//   - Activity timeline (gần đây)
//   - Items table
//   - Grid 3 card: Tài chính · Vận chuyển · Liên kết
// ============================================================================

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Tag, Spin } from 'antd'
import type { SalesOrder } from '../../../services/sales/salesTypes'
import {
  salesContractWorkflowService,
  type SalesOrderContract,
} from '../../../services/sales/salesContractWorkflowService'

const PRIMARY = '#1B4D3E'

const fmtUSD = (v: number | undefined | null) => {
  if (!v) return '—'
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`
  return `$${Math.round(v)}`
}
const fmtFull = (v: number | undefined | null) =>
  v ? '$' + Math.round(v).toLocaleString('en-US') : '—'
const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('vi-VN') : '—'
const fmtDateTime = (d?: string | null) =>
  d ? new Date(d).toLocaleString('vi-VN') : '—'

interface Props {
  order: SalesOrder
  onChanged?: () => void
}

export default function OrderProgressDashboard({ order, onChanged }: Props) {
  const navigate = useNavigate()
  const [contracts, setContracts] = useState<SalesOrderContract[]>([])
  const [loadingContracts, setLoadingContracts] = useState(true)

  useEffect(() => {
    setLoadingContracts(true)
    salesContractWorkflowService
      .listBySalesOrder(order.id)
      .then(setContracts)
      .catch(() => setContracts([]))
      .finally(() => setLoadingContracts(false))
  }, [order.id])

  // Tính SLA + overdue
  let slaOver: number | null = null
  let slaTitle: string | null = null
  if (order.delivery_date) {
    const days = Math.floor((Date.now() - new Date(order.delivery_date).getTime()) / 86400000)
    if (days > 0) {
      slaOver = days
      slaTitle = `Đơn này quá hạn giao (delivery_date ${fmtDate(order.delivery_date)})`
    }
  }

  const latest = contracts[0]
  const orderItems = (order as { items?: unknown[] }).items as Array<{
    grade?: string; quantity_tons?: number; unit_price?: number;
    bale_weight_kg?: number; bales_per_container?: number;
    packing_type?: string; payment_terms?: string
  }> | undefined

  return (
    <div style={{ padding: '12px 4px' }}>

      {/* ═══ 1. SLA ALERT ═══ */}
      {slaOver !== null && (
        <div style={alertBanner}>
          <span style={{ fontSize: 20 }}>⚠</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: '#cf1322', marginBottom: 4 }}>{slaTitle}</div>
            <div style={{ fontSize: 12, color: '#595959' }}>
              Đã quá <strong>{slaOver} ngày</strong>. Đề xuất: liên hệ Logistics + KH để dời ETD; cập nhật shipment plan.
            </div>
          </div>
          <Button size="small" type="primary" danger>→ Xử lý ngay</Button>
        </div>
      )}

      {/* ═══ 2. WORKFLOW CARD + ACTIVITY TIMELINE (2 cols) ═══ */}
      <div style={twoCols}>

        {/* Workflow */}
        <div style={{
          ...card,
          background: 'linear-gradient(135deg, #fff 0%, #f0f9f4 100%)',
          border: '1px solid #d9f4e3',
        }}>
          <div style={cardTitle}>📋 Workflow HĐ</div>
          {loadingContracts ? (
            <Spin size="small" />
          ) : !latest ? (
            <div style={empty}>
              <div style={{ marginBottom: 8 }}>Chưa có HĐ workflow</div>
              <Button size="small" type="primary" onClick={() => navigate(`/sales/orders/${order.id}/edit`)}
                      style={{ background: PRIMARY }}>
                + Tạo HĐ
              </Button>
            </div>
          ) : (
            <>
              <ActorRow
                icon={latest.created_by ? '✓' : '·'}
                done={!!latest.submitted_at}
                title={`Sale${latest.created_by_employee ? ` (${latest.created_by_employee.full_name})` : ''} ${latest.submitted_at ? 'đã lên HĐ' : 'tạo HĐ'}`}
                meta={latest.submitted_at
                  ? `${fmtDateTime(latest.submitted_at)} · rev #${latest.revision_no}`
                  : 'Chưa submit'}
              />

              {latest.status === 'reviewing' && (
                <ActorRow
                  icon="⌛"
                  current
                  title={`${latest.reviewer_employee?.full_name || 'Kiểm tra'} đang duyệt`}
                  meta={`Đã ${humanDuration(latest.submitted_at)} từ lúc trình`}
                  cta="→ Vào duyệt"
                  ctaOnClick={() => navigate('/sales/contracts/review')}
                />
              )}
              {latest.status === 'rejected' && (
                <ActorRow
                  icon="✗"
                  reject
                  title={`${latest.reviewer_employee?.full_name || 'Kiểm tra'} trả lại`}
                  meta={latest.rejected_reason ? `"${latest.rejected_reason}"` : 'Không có lý do'}
                />
              )}
              {(latest.status === 'approved' || latest.status === 'signed' || latest.status === 'archived') && (
                <ActorRow
                  icon="✓"
                  done
                  title={`${latest.reviewer_employee?.full_name || 'Kiểm tra'} duyệt`}
                  meta={fmtDateTime(latest.reviewed_at)}
                />
              )}

              {latest.status === 'approved' && (
                <ActorRow
                  icon="⌛"
                  current
                  title="Mr. Trung / Mr. Huy chờ ký"
                  meta={`Đã duyệt ${humanDuration(latest.reviewed_at)}`}
                  cta="→ Vào trình ký"
                  ctaOnClick={() => navigate('/sales/contracts/sign')}
                />
              )}
              {(latest.status === 'signed' || latest.status === 'archived') && (
                <ActorRow
                  icon="✓"
                  done
                  title={`${latest.signer_employee?.full_name || 'Trình ký'} ký xong`}
                  meta={fmtDateTime(latest.signed_at)}
                />
              )}
              {(latest.status === 'drafting' || latest.status === 'reviewing' || latest.status === 'rejected') && (
                <ActorRow
                  icon="3"
                  pending
                  title="Mr. Trung / Mr. Huy sẽ ký"
                  meta="Sau khi Kiểm tra duyệt"
                />
              )}
            </>
          )}
        </div>

        {/* Activity timeline */}
        <div style={card}>
          <div style={cardTitle}>⏰ Lịch sử gần đây</div>
          {contracts.length === 0 ? (
            <div style={empty}>Chưa có hoạt động</div>
          ) : (
            <div style={{ position: 'relative', paddingLeft: 20 }}>
              <div style={{
                position: 'absolute', left: 7, top: 8, bottom: 8,
                width: 2, background: '#e8e8e8',
              }} />
              {contracts.flatMap(buildTimelineItems).slice(0, 5).map((item, idx) => (
                <div key={idx} style={{ position: 'relative', paddingBottom: 14 }}>
                  <div style={{
                    position: 'absolute', left: -20, top: 4, width: 14, height: 14,
                    borderRadius: 7, background: item.color, border: '2px solid #fff',
                    boxShadow: `0 0 0 2px ${item.color}`,
                  }} />
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{item.title}</div>
                  <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 2 }}>{item.meta}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══ 3. ITEMS TABLE ═══ */}
      {orderItems && orderItems.length > 0 && (
        <>
          <div style={sectionH}>📦 Chi tiết hàng</div>
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead style={{ background: '#fafafa' }}>
                <tr>
                  <th style={{ ...th, paddingLeft: 16 }}>Grade</th>
                  <th style={th}>Tấn</th>
                  <th style={th}>$/MT</th>
                  <th style={th}>Bành</th>
                  <th style={th}>Đóng gói</th>
                  <th style={th}>Thanh toán</th>
                  <th style={{ ...th, textAlign: 'right', paddingRight: 16 }}>Tổng USD</th>
                </tr>
              </thead>
              <tbody>
                {orderItems.map((item, idx) => {
                  const total = (item.quantity_tons || 0) * (item.unit_price || 0)
                  const bales = item.bale_weight_kg
                    ? Math.round((item.quantity_tons || 0) * 1000 / item.bale_weight_kg)
                    : 0
                  return (
                    <tr key={idx} style={{ borderTop: '1px solid #f5f5f5' }}>
                      <td style={{ ...td, paddingLeft: 16 }}><strong>{item.grade || '—'}</strong></td>
                      <td style={td}>{(item.quantity_tons || 0).toFixed(2)}</td>
                      <td style={td}>${(item.unit_price || 0).toLocaleString()}</td>
                      <td style={td}>{bales.toLocaleString()}</td>
                      <td style={td}>{(item.packing_type || '—').replace('_', ' ')}</td>
                      <td style={td}>{item.payment_terms || '—'}</td>
                      <td style={{ ...td, textAlign: 'right', paddingRight: 16 }}>
                        <strong>{fmtFull(total)}</strong>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ 4. FINANCIAL + SHIPPING + LINKS (3 cols) ═══ */}
      <div style={sectionH}>📊 Tổng quan</div>
      <div style={threeCols}>

        <div style={card}>
          <div style={cardTitle}>💰 Tài chính</div>
          <FieldRow label="Giá trị HĐ" value={fmtFull(order.total_value_usd)} />
          <FieldRow
            label="L/C"
            value={
              (order as { lc_number?: string }).lc_number
                ? `${(order as { lc_number?: string }).lc_number} · ${(order as { lc_bank?: string }).lc_bank || '—'}`
                : '—'
            }
          />
          <FieldRow label="Hoa hồng" value={
            (order as { commission_amount?: number }).commission_amount
              ? fmtFull((order as { commission_amount?: number }).commission_amount)
              : '—'
          } />
          <FieldRow label="Đã TT" value={
            (order as { paid_amount?: number }).paid_amount
              ? fmtFull((order as { paid_amount?: number }).paid_amount)
              : '$0'
          } />
          <FieldRow
            label="Còn lại"
            value={fmtFull((order.total_value_usd || 0) - ((order as { paid_amount?: number }).paid_amount || 0))}
            highlight
          />
        </div>

        <div style={card}>
          <div style={cardTitle}>🚢 Vận chuyển</div>
          <FieldRow label="Incoterm" value={(order as { incoterm?: string }).incoterm || '—'} />
          <FieldRow label="POL" value={(order as { port_of_loading?: string }).port_of_loading || '—'} />
          <FieldRow label="POD" value={(order as { port_of_destination?: string }).port_of_destination || '—'} />
          <FieldRow
            label="Container"
            value={`${(order as { container_count?: number }).container_count || 0} × ${(order as { container_type?: string }).container_type || '20DC'}`}
          />
          <FieldRow
            label="Booking"
            value={(order as { booking_reference?: string }).booking_reference || '— chưa book'}
          />
          <FieldRow
            label="ETD / ETA"
            value={`${fmtDate((order as { etd?: string }).etd)} → ${fmtDate((order as { eta?: string }).eta)}`}
          />
        </div>

        <div style={card}>
          <div style={cardTitle}>🔗 Liên kết</div>
          <LinkRow icon="📋" label={`HĐ${latest ? ` rev #${latest.revision_no}` : ''}`}
                   value={latest ? `Status: ${latest.status}` : 'Chưa có'}
                   onClick={latest ? () => navigate('/sales/contracts/review') : undefined} />
          <LinkRow icon="🏭" label="Lệnh SX"
                   value={(order as { production_order_code?: string }).production_order_code || '— chưa lập'} />
          <LinkRow icon="📑" label="COA + PL"
                   value="— chưa lập" />
          <LinkRow icon="🚛" label="Phiếu cân"
                   value={(order as { booking_reference?: string }).booking_reference ? 'Đã cân' : '— chưa cân'} />
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────

function ActorRow({ icon, title, meta, cta, ctaOnClick, done, current, reject, pending }: {
  icon: string; title: string; meta?: string;
  cta?: string; ctaOnClick?: () => void;
  done?: boolean; current?: boolean; reject?: boolean; pending?: boolean;
}) {
  const bg = done ? '#f6ffed' : current ? '#f0f9f4' : reject ? '#fff1f0' : '#fafafa'
  const avBg = done ? '#389e0d' : current ? '#1B4D3E' : reject ? '#cf1322' : '#bfbfbf'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
      borderRadius: 6, marginBottom: 6, background: bg,
      ...(current ? { boxShadow: 'inset 3px 0 0 #1B4D3E' } : {}),
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 14, background: avBg, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 13, flexShrink: 0,
        animation: current ? 'oprogPulse 1.5s infinite' : 'none',
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 12, color: pending ? '#8c8c8c' : '#262626' }}>{title}</div>
        {meta && <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 1 }}>{meta}</div>}
      </div>
      {cta && (
        <Button size="small" type="primary" style={{ background: PRIMARY }} onClick={ctaOnClick}>
          {cta}
        </Button>
      )}
      <style>{`@keyframes oprogPulse {
        0%,100%{box-shadow:0 0 0 0 rgba(27,77,62,0.4);}
        50%{box-shadow:0 0 0 6px rgba(27,77,62,0);}
      }`}</style>
    </div>
  )
}

function FieldRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', padding: '6px 0',
      borderBottom: '1px dashed #f0f0f0', fontSize: 12,
    }}>
      <span style={{ color: '#8c8c8c' }}>{label}</span>
      <span style={{
        fontWeight: 600,
        color: highlight ? PRIMARY : '#262626',
        fontSize: highlight ? 14 : 12,
      }}>{value}</span>
    </div>
  )
}

function LinkRow({ icon, label, value, onClick }: { icon: string; label: string; value: string; onClick?: () => void }) {
  return (
    <div
      style={{
        fontSize: 12, padding: '6px 10px', background: '#fafafa', borderRadius: 6,
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
        cursor: onClick ? 'pointer' : 'default',
      }}
      onClick={onClick}
    >
      <span>{icon}</span>
      <span style={{ fontWeight: 600 }}>{label}</span>
      <span style={{ color: onClick ? PRIMARY : '#8c8c8c', marginLeft: 'auto' }}>{value}</span>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────

function humanDuration(s?: string | null): string {
  if (!s) return '—'
  const ms = Date.now() - new Date(s).getTime()
  const h = ms / 3600000
  if (h < 1) return `${Math.round(ms / 60000)} phút`
  if (h < 24) return `${Math.round(h)}h`
  return `${Math.round(h / 24)}d`
}

function buildTimelineItems(c: SalesOrderContract): Array<{
  title: string; meta: string; color: string;
}> {
  const items: Array<{ title: string; meta: string; color: string }> = []
  if (c.signed_at) {
    items.push({
      title: `${c.signer_employee?.full_name || 'Trình ký'} ký HĐ rev #${c.revision_no}`,
      meta: fmtDateTime(c.signed_at), color: '#389e0d',
    })
  }
  if (c.rejected_at) {
    items.push({
      title: `${c.reviewer_employee?.full_name || 'Kiểm tra'} trả lại rev #${c.revision_no}`,
      meta: `${fmtDateTime(c.rejected_at)}${c.rejected_reason ? ` — "${c.rejected_reason}"` : ''}`,
      color: '#cf1322',
    })
  }
  if (c.reviewed_at && !c.rejected_at) {
    items.push({
      title: `${c.reviewer_employee?.full_name || 'Kiểm tra'} duyệt rev #${c.revision_no}`,
      meta: fmtDateTime(c.reviewed_at), color: '#fa8c16',
    })
  }
  if (c.submitted_at) {
    items.push({
      title: `${c.created_by_employee?.full_name || 'Sale'} trình rev #${c.revision_no}`,
      meta: fmtDateTime(c.submitted_at), color: '#1677ff',
    })
  }
  return items.sort((a, b) => b.meta.localeCompare(a.meta))
}

// ─── Inline styles ───────────────────────────────────────────────────

const alertBanner: React.CSSProperties = {
  background: '#fff1f0', border: '1px solid #ffccc7', borderRadius: 10,
  padding: '12px 16px', marginBottom: 16,
  display: 'flex', alignItems: 'flex-start', gap: 12,
}

const twoCols: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16,
}

const threeCols: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16,
}

const card: React.CSSProperties = {
  background: '#fff', borderRadius: 10, border: '1px solid #e8e8e8', padding: 16,
}

const cardTitle: React.CSSProperties = {
  fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8,
  color: '#8c8c8c', fontWeight: 700, marginBottom: 12,
}

const sectionH: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, color: PRIMARY, margin: '20px 0 10px',
}

const th: React.CSSProperties = {
  textAlign: 'left', padding: '8px', fontSize: 10, textTransform: 'uppercase',
  color: '#8c8c8c', fontWeight: 600, letterSpacing: 0.5,
  borderBottom: '1px solid #e8e8e8',
}

const td: React.CSSProperties = { padding: '10px 8px' }

const empty: React.CSSProperties = {
  padding: 20, textAlign: 'center', color: '#bfbfbf', fontSize: 12,
}
