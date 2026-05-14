// ============================================================================
// SALES DASHBOARD PAGE — Bento overview (v2)
// File: src/pages/sales/SalesDashboardPage.tsx
//
// Layout: 5 KPI hero + AI summary + 3 bento rows (pipeline/SLA, action/top-cust/
// workflow, activity/LC). Sticky quick actions footer.
// Mock dựa trên docs/SALES_OVERVIEW_DASHBOARD_MOCKUP.html.
// ============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Tag, Button, Spin, message } from 'antd'
import {
  ArrowUpRight, ArrowDownRight, AlertTriangle, CheckCircle, Trophy,
  ShoppingCart, FileText, Activity, CreditCard, TrendingUp, Calendar,
  Sparkles, Plus, ListChecks, Edit3, Search,
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import { salesDashboardService } from '../../services/sales/salesDashboardService'
import { salesContractWorkflowService } from '../../services/sales/salesContractWorkflowService'
import { getSalesRole, SALES_ROLE_LABELS } from '../../services/sales/salesPermissionService'
import type { TopCustomer, PipelineStage } from '../../services/sales/salesDashboardService'

const PRIMARY = '#1B4D3E'

// ─── Format helpers ─────────────────────────────────────────────────
const fmtUSD = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`
  return `$${Math.round(v)}`
}
const daysFromNow = (d: string) => {
  const ms = new Date(d).getTime() - Date.now()
  return Math.round(ms / 86400000)
}

const FLAG: Record<string, string> = {
  IN: '🇮🇳', PH: '🇵🇭', ID: '🇮🇩', KR: '🇰🇷', SG: '🇸🇬', FR: '🇫🇷',
  AE: '🇦🇪', TW: '🇹🇼', TR: '🇹🇷', ES: '🇪🇸', BD: '🇧🇩', CN: '🇨🇳', LK: '🇱🇰',
}

const STAGE_META: Record<string, { icon: string; color: string; bg: string }> = {
  draft:      { icon: '📝', color: '#8c8c8c', bg: '#f5f5f5' },
  confirmed:  { icon: '✓',  color: '#1677ff', bg: '#e6f4ff' },
  producing:  { icon: '🏭', color: '#fa8c16', bg: '#fff7e6' },
  ready:      { icon: '📦', color: '#06b6d4', bg: '#e0f7fa' },
  packing:    { icon: '🚚', color: '#531dab', bg: '#f9f0ff' },
  shipped:    { icon: '🚢', color: '#6366f1', bg: '#eef2ff' },
  delivered:  { icon: '✅', color: '#389e0d', bg: '#f6ffed' },
  paid:       { icon: '💰', color: '#1B4D3E', bg: '#d9f7e8' },
}

const WORKFLOW_META: Record<string, { label: string; color: string }> = {
  drafting:  { label: 'Nháp (Sale)', color: '#1677ff' },
  reviewing: { label: 'Chờ Kiểm tra', color: '#531dab' },
  rejected:  { label: 'Bị trả lại', color: '#cf1322' },
  approved:  { label: 'Đã duyệt, chờ ký', color: '#fa8c16' },
  signed:    { label: 'Đã ký', color: '#389e0d' },
  archived:  { label: 'Lưu trữ', color: '#bfbfbf' },
}

// ============================================================================
// TYPES
// ============================================================================

interface SlaItem {
  id: string; contract_no: string; customer: string; country: string | null
  grade: string; quantity_tons: number; total_value_usd: number
  delivery_date: string; status: string; daysOver: number
}
interface ActivityItem {
  id: string; actor: string; action: string; target: string
  detail?: string; created_at: string; type: 'sign' | 'approve' | 'reject' | 'submit' | 'archive'
}
interface LcItem {
  id: string; contract_no: string; customer: string; bank_name: string
  lc_amount: number; lc_expiry_date: string; daysLeft: number
}

interface CalendarEvent {
  date: string         // 'YYYY-MM-DD'
  count: number        // số đơn ETD ngày này
  urgent: boolean      // có đơn quá hạn / SLA đỏ
  topLabel?: string    // VD "Apollo 10 cont"
}
interface CashflowBar {
  label: string
  value: number
  future: boolean      // true = dự kiến (chưa chốt)
}

interface DashboardData {
  kpis: Awaited<ReturnType<typeof salesDashboardService.getKPIs>> | null
  pipeline: PipelineStage[]
  topCustomers: TopCustomer[]
  slaRisk: SlaItem[]
  workflowCounts: Record<string, number>
  activityFeed: ActivityItem[]
  lcNearExpiry: LcItem[]
  calendar: CalendarEvent[]
  cashflow: CashflowBar[]
  cycleTimeAvgDays: number
  myPendingReview: number
  myPendingSign: number
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function SalesDashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const role = getSalesRole(user)

  const [period, setPeriod] = useState<'month' | 'quarter' | 'year'>('month')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DashboardData>({
    kpis: null,
    pipeline: [],
    topCustomers: [],
    slaRisk: [],
    workflowCounts: {},
    activityFeed: [],
    lcNearExpiry: [],
    calendar: [],
    cashflow: [],
    cycleTimeAvgDays: 0,
    myPendingReview: 0,
    myPendingSign: 0,
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const empId = await salesContractWorkflowService.getCurrentEmployeeId()
      const isReviewer = salesContractWorkflowService.isAllowedReviewer(user?.email)
      const isSigner = salesContractWorkflowService.isAllowedSigner(user?.email)

      const [kpis, pipeline, topCustomers, slaRisk, workflowCounts, activityFeed, lcNearExpiry,
             calendar, cashflow, cycleTimeAvgDays, reviewList, signList] =
        await Promise.all([
          salesDashboardService.getKPIs(period),
          salesDashboardService.getPipeline(),
          salesDashboardService.getTopCustomers(5),
          fetchSlaAtRisk(),
          fetchWorkflowCounts(),
          fetchActivityFeed(),
          fetchLcNearExpiry(),
          fetchCalendar(),
          fetchCashflow(),
          fetchCycleTime(),
          isReviewer ? salesContractWorkflowService.listForReview(empId, true) : Promise.resolve([]),
          isSigner ? salesContractWorkflowService.listForSigning() : Promise.resolve([]),
        ])

      setData({
        kpis,
        pipeline,
        topCustomers,
        slaRisk,
        workflowCounts,
        activityFeed,
        lcNearExpiry,
        calendar,
        cashflow,
        cycleTimeAvgDays,
        myPendingReview: reviewList.length,
        myPendingSign: signList.length,
      })
    } catch (e) {
      console.error('Dashboard load error', e)
      message.error('Không tải được dashboard')
    } finally {
      setLoading(false)
    }
  }, [period, user])

  useEffect(() => { void loadData() }, [loadData])

  const aiSummary = useMemo(() => {
    if (!data.kpis) return null
    const k = data.kpis
    const trend = k.ordersLastPeriod > 0
      ? Math.round(((k.ordersThisPeriod - k.ordersLastPeriod) / k.ordersLastPeriod) * 100)
      : 0
    return { k, trend, trendText: trend > 0 ? `tăng ${trend}%` : trend < 0 ? `giảm ${Math.abs(trend)}%` : 'giữ nguyên' }
  }, [data])

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" tip="Đang tải dashboard..." />
      </div>
    )
  }

  const k = data.kpis
  const periodLabel = period === 'month' ? 'Tháng này' : period === 'quarter' ? 'Quý này' : 'Năm nay'
  const totalWorkflow = Object.values(data.workflowCounts).reduce((a, b) => a + b, 0)

  return (
    <div style={{ padding: '20px 24px 48px', maxWidth: 1600, margin: '0 auto', background: '#f5f6f8' }}>

      {/* ═══ TOPBAR ═══ */}
      <div style={topbar}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: PRIMARY }}>
            📊 Tổng quan Đơn hàng bán
          </div>
          <div style={{ fontSize: 11, color: '#8c8c8c' }}>
            Bento dashboard · Auto-refresh khi quay lại trang
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={seg}>
            {(['month', 'quarter', 'year'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{ ...segBtn, ...(period === p ? segActive : {}) }}
              >
                {p === 'month' ? 'Tháng này' : p === 'quarter' ? 'Quý này' : 'Năm nay'}
              </button>
            ))}
          </div>
          <Tag color={role === 'admin' ? 'green' : 'blue'} style={{ padding: '4px 10px' }}>
            {role ? SALES_ROLE_LABELS[role] : '—'} · {user?.email}
          </Tag>
        </div>
      </div>

      {/* ═══ AI SUMMARY BANNER ═══ */}
      {aiSummary && (
        <div style={aiBanner}>
          <div style={aiIcon}><Sparkles size={20} /></div>
          <div style={{ flex: 1 }}>
            <div style={aiLabel}>AI Summary · {periodLabel}</div>
            <div style={aiText}>
              <strong style={{ color: '#FFD700' }}>{aiSummary.k.ordersThisPeriod} đơn</strong> đang ghi nhận,
              tổng <strong style={{ color: '#FFD700' }}>{fmtUSD(aiSummary.k.revenueThisPeriod)}</strong>.
              {data.slaRisk.length > 0 && (
                <> <strong style={{ color: '#ff7875' }}>⚠ {data.slaRisk.length} đơn quá hạn giao</strong>:{' '}
                  {data.slaRisk.slice(0, 3).map((s) => (
                    <strong key={s.id}>{s.contract_no} </strong>
                  ))}.</>
              )}
              {aiSummary.trend !== 0 && (
                <> <strong style={{ color: '#FFD700' }}>📈 So với kỳ trước: {aiSummary.trendText}</strong>.</>
              )}
              {data.lcNearExpiry.length > 0 && (
                <> <strong>{data.lcNearExpiry.length} L/C sắp hết hạn ≤30 ngày</strong>.</>
              )}
            </div>
            <div style={aiActions}>
              {data.slaRisk.length > 0 && (
                <span style={aiAction} onClick={() => navigate('/sales/orders')}>→ Xem đơn quá hạn</span>
              )}
              {data.lcNearExpiry.length > 0 && (
                <span style={aiAction} onClick={() => navigate('/sales/cash-flow')}>→ Xem L/C</span>
              )}
              <span style={aiAction} onClick={() => loadData()}>↻ Refresh</span>
            </div>
          </div>
        </div>
      )}

      {/* ═══ HERO KPI ROW ═══ */}
      {k && aiSummary && (
        <div style={kpiRow}>
          <KpiCard label="Đang xử lý" value={k.processingOrders}
                   sub={`đơn · ${fmtUSD(k.revenueThisPeriod)} pipeline`}
                   trend={aiSummary.trend} trendLabel="so với kỳ trước" />
          <KpiCard label="SLA at risk" value={data.slaRisk.length} sub="đơn quá hạn giao"
                   trendLabel={data.slaRisk.length > 0 ? 'Cần xử lý' : 'Trong tầm kiểm soát'}
                   accent={data.slaRisk.length > 0 ? 'alert' : 'success'} />
          <KpiCard label="Cần action của bạn" value={data.myPendingReview + data.myPendingSign}
                   sub={`${data.myPendingReview} duyệt + ${data.myPendingSign} ký`}
                   trendLabel="→ Xem queue" accent="warn" />
          <KpiCard label="Đã ký kỳ này" value={data.workflowCounts.signed || 0}
                   sub="đơn HĐ workflow signed"
                   trendLabel="đã hoàn tất" accent="success" />
          <KpiCard label="L/C theo dõi" value={data.lcNearExpiry.length}
                   sub={data.lcNearExpiry.filter(l => l.daysLeft <= 7).length + ' hết hạn ≤7d'}
                   trendLabel={data.lcNearExpiry.length > 0 ? `${data.lcNearExpiry[0].bank_name || ''}` : '—'} />
        </div>
      )}

      {/* ═══ BENTO ROW 1: Pipeline + SLA ═══ */}
      <div style={{ ...bento, gridTemplateColumns: '2fr 1fr' }}>

        <Widget icon={<ShoppingCart size={14} />} title="Pipeline theo giai đoạn"
                action={<span style={widgetLink} onClick={() => navigate('/sales/kanban')}>Xem Kanban →</span>}>
          {data.pipeline.length === 0 ? (
            <div style={emptyStyle}>Chưa có đơn hàng</div>
          ) : data.pipeline.filter(s => s.count > 0).map((stage) => {
            const meta = STAGE_META[stage.status] || STAGE_META.draft
            const maxValue = Math.max(...data.pipeline.map(p => p.value_usd), 1)
            const widthPct = (stage.value_usd / maxValue) * 100
            return (
              <div key={stage.status} style={stageRow}>
                <div style={{ ...stageIcon, background: meta.bg, color: meta.color }}>{meta.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{stage.label}</div>
                  <div style={barWrap}>
                    <div style={{ ...bar, width: `${widthPct}%`, background: meta.color }} />
                  </div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 100, flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{stage.count} đơn</div>
                  <div style={{ fontSize: 11, color: '#8c8c8c' }}>{fmtUSD(stage.value_usd)}</div>
                </div>
              </div>
            )
          })}
        </Widget>

        <Widget icon={<AlertTriangle size={14} />} title="SLA at risk" iconColor="red"
                sub={`${data.slaRisk.length} đơn`}>
          {data.slaRisk.length === 0 ? (
            <div style={emptyStyle}>Không có đơn quá hạn 🎉</div>
          ) : data.slaRisk.slice(0, 5).map((sla) => (
            <div key={sla.id}
                 style={{ ...slaItemStyle,
                          background: sla.daysOver > 3 ? '#fff1f0' : '#fff7e6',
                          borderColor: sla.daysOver > 3 ? '#ffccc7' : '#ffd591' }}
                 onClick={() => navigate(`/sales/orders/${sla.id}`)}>
              <div style={{ ...slaRing, background: sla.daysOver > 3 ? '#cf1322' : '#d46b08' }}>
                +{sla.daysOver}d
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>
                  {sla.contract_no} {FLAG[sla.country || ''] || ''} {sla.customer.slice(0, 20)}
                </div>
                <div style={{ fontSize: 11, color: '#8c8c8c' }}>
                  {sla.grade} · {sla.quantity_tons}MT · {fmtUSD(sla.total_value_usd)}
                </div>
              </div>
            </div>
          ))}
        </Widget>
      </div>

      {/* ═══ BENTO ROW 2: Action + Calendar + Top customers ═══ */}
      <div style={{ ...bento, gridTemplateColumns: '1fr 1fr 1fr' }}>

        <Widget icon={<CheckCircle size={14} />} title="Cần action của bạn" iconColor="purple"
                sub={`${data.myPendingReview + data.myPendingSign} mục`}>
          {data.myPendingReview > 0 && (
            <ActionGroup title="📋 Cần duyệt" count={data.myPendingReview}
              ctaLabel="Mở queue Kiểm tra"
              onClick={() => navigate('/sales/contracts/review')} />
          )}
          {data.myPendingSign > 0 && (
            <ActionGroup title="✍️ Cần ký" count={data.myPendingSign} countColor="yellow"
              ctaLabel="Mở queue Ký"
              onClick={() => navigate('/sales/contracts/sign')} />
          )}
          {data.lcNearExpiry.filter(l => l.daysLeft <= 7).length > 0 && (
            <ActionGroup title="💰 LC sắp hết hạn ≤7d"
              count={data.lcNearExpiry.filter(l => l.daysLeft <= 7).length} countColor="red"
              ctaLabel="Xem L/C"
              onClick={() => navigate('/sales/cash-flow')} />
          )}
          {data.myPendingReview === 0 && data.myPendingSign === 0 && data.lcNearExpiry.filter(l => l.daysLeft <= 7).length === 0 && (
            <div style={emptyStyle}>Không có việc cần làm 🎉</div>
          )}
        </Widget>

        <Widget icon={<Calendar size={14} />} title="Lịch giao 14 ngày tới" iconColor="blue"
                sub={`${data.calendar.reduce((s, e) => s + e.count, 0)} ETD`}>
          <CalendarWidget events={data.calendar} onClickDay={(d) =>
            navigate(`/sales/orders?etd=${d}`)} />
        </Widget>

        <Widget icon={<Trophy size={14} />} title={`Top KH ${periodLabel.toLowerCase()}`}
                iconColor="green" sub="USD">
          {data.topCustomers.length === 0 ? (
            <div style={emptyStyle}>Chưa có data</div>
          ) : data.topCustomers.map((c) => {
            const max = data.topCustomers[0]?.total_revenue || 1
            const pct = (c.total_revenue / max) * 100
            return (
              <div key={c.customer_id} style={custRow}>
                <span style={{ fontSize: 18 }}>{FLAG[c.country || ''] || '🌐'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{c.name}</div>
                  <div style={custBarWrap}>
                    <div style={{ ...custBar, width: `${pct}%` }} />
                  </div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, minWidth: 70, textAlign: 'right' }}>
                  {fmtUSD(c.total_revenue)}
                </div>
              </div>
            )
          })}
        </Widget>
      </div>

      {/* ═══ BENTO ROW 3: Workflow Donut + Activity ═══ */}
      <div style={{ ...bento, gridTemplateColumns: '1fr 1fr' }}>

        <Widget icon={<FileText size={14} />} title="Workflow HĐ — trạng thái" iconColor="purple"
                sub={`${totalWorkflow} HĐ active`}>
          {totalWorkflow === 0 ? (
            <div style={emptyStyle}>Chưa có HĐ workflow</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <DonutChart counts={data.workflowCounts} total={totalWorkflow} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11 }}>
                  {Object.entries(WORKFLOW_META).map(([status, meta]) => {
                    const count = data.workflowCounts[status] || 0
                    if (count === 0) return null
                    return (
                      <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 4, background: meta.color, flexShrink: 0 }} />
                        <span style={{ color: '#8c8c8c', flex: 1 }}>{meta.label}</span>
                        <span style={{ fontWeight: 700 }}>{count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
              {data.cycleTimeAvgDays > 0 && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #f0f0f0', fontSize: 11, color: '#8c8c8c' }}>
                  ⚡ <strong>Cycle time avg:</strong> Sale → Ký = <strong>{data.cycleTimeAvgDays.toFixed(1)} ngày</strong>
                </div>
              )}
            </>
          )}
        </Widget>

        <Widget icon={<Activity size={14} />} title="Hoạt động gần đây" iconColor="blue"
                action={<span style={widgetLink}>Xem tất cả →</span>}>
          {data.activityFeed.length === 0 ? (
            <div style={emptyStyle}>Chưa có hoạt động</div>
          ) : data.activityFeed.slice(0, 6).map((a) => (
            <div key={a.id} style={feedItem}>
              <div style={{ ...feedDot, ...feedDotColor(a.type) }}>{feedDotIcon(a.type)}</div>
              <div style={{ flex: 1, fontSize: 12 }}>
                <span style={{ fontWeight: 600 }}>{a.actor}</span>{' '}
                <span style={{ color: '#8c8c8c' }}>{a.action}</span>{' '}
                <span style={{ fontWeight: 600, color: PRIMARY }}>{a.target}</span>
                {a.detail && <span style={{ color: '#8c8c8c' }}> · {a.detail}</span>}
                <div style={{ fontSize: 10, color: '#bfbfbf', marginTop: 2 }}>
                  {timeAgo(a.created_at)}
                </div>
              </div>
            </div>
          ))}
        </Widget>
      </div>

      {/* ═══ BENTO ROW 4: LC + Cashflow ═══ */}
      <div style={{ ...bento, gridTemplateColumns: '1fr 1fr' }}>

        <Widget icon={<CreditCard size={14} />} title="L/C theo dõi" iconColor="yellow"
                sub={`${data.lcNearExpiry.length} LC ≤30d`}>
          {data.lcNearExpiry.length === 0 ? (
            <div style={emptyStyle}>Không có L/C sắp hết hạn</div>
          ) : (
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e8e8e8' }}>
                  <th style={th}>HĐ</th>
                  <th style={th}>KH</th>
                  <th style={th}>Bank</th>
                  <th style={{ ...th, textAlign: 'right' }}>Giá trị</th>
                  <th style={{ ...th, textAlign: 'right' }}>Còn lại</th>
                </tr>
              </thead>
              <tbody>
                {data.lcNearExpiry.slice(0, 5).map((lc) => (
                  <tr key={lc.id} style={{ borderBottom: '1px solid #f5f5f5' }}
                      onClick={() => navigate(`/sales/orders/${lc.id}`)}>
                    <td style={td}><strong>{lc.contract_no}</strong></td>
                    <td style={td}>{lc.customer.slice(0, 12)}</td>
                    <td style={td}>{lc.bank_name}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmtUSD(lc.lc_amount)}</td>
                    <td style={{ ...td, textAlign: 'right',
                                 color: lc.daysLeft <= 7 ? '#cf1322' : lc.daysLeft <= 14 ? '#d46b08' : '#8c8c8c',
                                 fontWeight: 600 }}>
                      {lc.daysLeft}d {lc.daysLeft <= 7 ? '🔴' : lc.daysLeft <= 14 ? '⚠' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Widget>

        <Widget icon={<TrendingUp size={14} />} title="Cash flow dự kiến" iconColor="green"
                sub="7 tuần tới">
          <CashflowWidget bars={data.cashflow} />
        </Widget>
      </div>

      {/* ═══ FOOTER NOTE ═══ */}
      <div style={{
        marginTop: 16, padding: '12px 16px', background: '#fafafa',
        borderRadius: 8, fontSize: 11, color: '#8c8c8c', textAlign: 'center',
      }}>
        💡 Bento dashboard auto-refresh khi quay lại trang. AI summary tính từ real
        data Supabase. Widget có thể tùy chỉnh sau (drag-to-rearrange, hide theo role).
      </div>

      {/* ═══ QUICK ACTIONS STICKY ═══ */}
      <div style={quickActions}>
        <span style={qaTitle}>⚡ Quick actions</span>
        <Button type="primary" icon={<Plus size={14} />} onClick={() => navigate('/sales/orders/new')}
                style={{ background: PRIMARY }}>
          Tạo đơn mới
        </Button>
        {salesContractWorkflowService.isAllowedReviewer(user?.email) && (
          <Button icon={<ListChecks size={14} />} onClick={() => navigate('/sales/contracts/review')}>
            Queue Kiểm tra {data.myPendingReview > 0 && (
              <Tag color="purple" style={{ marginLeft: 4 }}>{data.myPendingReview}</Tag>
            )}
          </Button>
        )}
        {salesContractWorkflowService.isAllowedSigner(user?.email) && (
          <Button icon={<Edit3 size={14} />} onClick={() => navigate('/sales/contracts/sign')}>
            Queue Ký {data.myPendingSign > 0 && (
              <Tag color="orange" style={{ marginLeft: 4 }}>{data.myPendingSign}</Tag>
            )}
          </Button>
        )}
        <Button icon={<TrendingUp size={14} />} onClick={() => navigate('/sales/kanban')}>
          Xem Kanban
        </Button>
        <Button icon={<Search size={14} />} style={{ marginLeft: 'auto' }} disabled>
          Tìm nhanh (Ctrl+K — coming soon)
        </Button>
      </div>
    </div>
  )
}

// ─── Sub components ─────────────────────────────────────────────────

function KpiCard({ label, value, sub, trend, trendLabel, accent }: {
  label: string; value: number | string; sub?: string;
  trend?: number; trendLabel?: string;
  accent?: 'alert' | 'success' | 'warn'
}) {
  const accentBar = accent === 'alert' ? '#cf1322'
    : accent === 'success' ? '#389e0d'
    : accent === 'warn' ? '#fa8c16'
    : PRIMARY
  return (
    <div style={kpiStyle}>
      <div style={{ ...kpiAccent, background: accentBar }} />
      <div style={kpiLabel}>{label}</div>
      <div style={{ ...kpiValue, color: accent === 'alert' ? '#cf1322' : 'rgba(0,0,0,0.88)' }}>{value}</div>
      {sub && <div style={{ ...kpiSub, color: accent === 'alert' ? '#cf1322' : '#8c8c8c' }}>{sub}</div>}
      {(trend !== undefined && trend !== 0) && (
        <div style={{ ...kpiTrend, color: trend > 0 ? '#389e0d' : '#cf1322' }}>
          {trend > 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
          {Math.abs(trend)}% {trendLabel}
        </div>
      )}
      {(trend === undefined || trend === 0) && trendLabel && (
        <div style={{ ...kpiTrend, color: '#8c8c8c' }}>→ {trendLabel}</div>
      )}
    </div>
  )
}

function Widget({ icon, title, sub, action, iconColor, children }: {
  icon: React.ReactNode; title: string; sub?: string; action?: React.ReactNode;
  iconColor?: 'red' | 'yellow' | 'green' | 'blue' | 'purple'; children: React.ReactNode
}) {
  const colors = {
    red:    { bg: '#fff1f0', fg: '#cf1322' },
    yellow: { bg: '#fff7e6', fg: '#d46b08' },
    green:  { bg: '#f6ffed', fg: '#389e0d' },
    blue:   { bg: '#e6f4ff', fg: '#1677ff' },
    purple: { bg: '#f9f0ff', fg: '#531dab' },
  }
  const c = iconColor ? colors[iconColor] : { bg: '#f0f9f4', fg: PRIMARY }
  return (
    <div style={widget}>
      <div style={widgetHeader}>
        <div style={{ ...widgetIcon, background: c.bg, color: c.fg }}>{icon}</div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: '#8c8c8c', marginLeft: 'auto' }}>{sub}</div>}
        {action && <div style={{ marginLeft: sub ? 8 : 'auto' }}>{action}</div>}
      </div>
      {children}
    </div>
  )
}

// ─── Calendar widget (7x3 = 21 days, current + next 14) ────────────
function CalendarWidget({ events, onClickDay }: {
  events: CalendarEvent[]
  onClickDay: (date: string) => void
}) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // Start from Monday of current week
  const start = new Date(today)
  const dayOfWeek = (start.getDay() + 6) % 7 // 0 = Monday
  start.setDate(start.getDate() - dayOfWeek)

  const days: { date: string; day: number; isToday: boolean; isPast: boolean; event?: CalendarEvent }[] = []
  for (let i = 0; i < 21; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const dateStr = d.toISOString().split('T')[0]
    const event = events.find(e => e.date === dateStr)
    days.push({
      date: dateStr,
      day: d.getDate(),
      isToday: d.getTime() === today.getTime(),
      isPast: d.getTime() < today.getTime(),
      event,
    })
  }

  const headers = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
  return (
    <div>
      <div style={calWrap}>
        {headers.map((h) => (
          <div key={h} style={calHead}>{h}</div>
        ))}
        {days.map((d) => {
          let cellStyle: React.CSSProperties = { ...calCell }
          if (d.isPast && !d.event) cellStyle = { ...cellStyle, color: '#bfbfbf', cursor: 'default' }
          if (d.event) {
            cellStyle = { ...cellStyle, background: '#f0f9f4', color: PRIMARY, fontWeight: 600 }
            if (d.event.urgent) {
              cellStyle = { ...cellStyle, background: '#fff1f0', color: '#cf1322' }
            }
          }
          if (d.isToday) {
            cellStyle = { ...cellStyle, background: PRIMARY, color: '#fff', fontWeight: 700 }
          }
          return (
            <div
              key={d.date}
              style={cellStyle}
              onClick={() => d.event && onClickDay(d.date)}
              title={d.event ? `${d.event.count} đơn ETD${d.event.topLabel ? ' · ' + d.event.topLabel : ''}` : ''}
            >
              {d.day}
              {d.event && <div style={{ width: 4, height: 4, borderRadius: 2, background: 'currentColor', marginTop: 2 }} />}
            </div>
          )
        })}
      </div>
      {events.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 11, color: '#8c8c8c', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {events.slice(0, 2).map((e) => (
            <span key={e.date}>📍 {new Date(e.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} {e.topLabel || `${e.count} đơn`}</span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Cashflow widget (7 vertical bars) ─────────────────────────────
function CashflowWidget({ bars }: { bars: CashflowBar[] }) {
  const max = Math.max(...bars.map(b => b.value), 1)
  const totalConfirmed = bars.filter(b => !b.future).reduce((s, b) => s + b.value, 0)
  const totalFuture = bars.filter(b => b.future).reduce((s, b) => s + b.value, 0)
  return (
    <div>
      <div style={cfBars}>
        {bars.map((b, i) => {
          const height = max > 0 ? (b.value / max) * 100 : 4
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div
                style={{
                  width: '100%',
                  height: `${Math.max(height, 4)}%`,
                  borderRadius: '4px 4px 0 0',
                  minHeight: 4,
                  background: b.future
                    ? 'linear-gradient(180deg, #ffd591, #d46b08)'
                    : 'linear-gradient(180deg, #2E7D5B, #1B4D3E)',
                  transition: '0.3s',
                  cursor: 'pointer',
                }}
                title={`${b.label}: ${fmtUSD(b.value)}${b.future ? ' (dự kiến)' : ''}`}
              />
              <div style={{ fontSize: 10, color: '#8c8c8c' }}>{b.label}</div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11, color: '#8c8c8c',
                    borderTop: '1px solid #f0f0f0', paddingTop: 10 }}>
        <div>
          <strong style={{ color: '#389e0d', fontSize: 14 }}>{fmtUSD(totalConfirmed)}</strong>
          <div>Đã chốt</div>
        </div>
        <div>
          <strong style={{ color: '#d46b08', fontSize: 14 }}>{fmtUSD(totalFuture)}</strong>
          <div>Dự kiến</div>
        </div>
      </div>
    </div>
  )
}

// ─── Donut chart (SVG) ─────────────────────────────────────────────
function DonutChart({ counts, total }: { counts: Record<string, number>; total: number }) {
  const C = 88 // circumference baseline (2πr ≈ 87.96 for r=14)
  let offset = 0
  const segments: { status: string; len: number; off: number; color: string }[] = []
  for (const [status, meta] of Object.entries(WORKFLOW_META)) {
    const count = counts[status] || 0
    if (count === 0) continue
    const len = (count / total) * C
    segments.push({ status, len, off: -offset, color: meta.color })
    offset += len
  }
  return (
    <div style={{ position: 'relative', width: 100, height: 100, flexShrink: 0 }}>
      <svg viewBox="0 0 36 36" width="100" height="100" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="18" cy="18" r="14" fill="none" stroke="#f0f0f0" strokeWidth="4" />
        {segments.map((s) => (
          <circle
            key={s.status}
            cx="18" cy="18" r="14"
            fill="none"
            stroke={s.color}
            strokeWidth="4"
            strokeDasharray={`${s.len} ${C}`}
            strokeDashoffset={s.off}
          />
        ))}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex',
                    flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{total}</div>
        <div style={{ fontSize: 10, color: '#8c8c8c' }}>HĐ active</div>
      </div>
    </div>
  )
}

function ActionGroup({ title, count, ctaLabel, onClick, countColor }: {
  title: string; count: number; ctaLabel: string; onClick: () => void;
  countColor?: 'red' | 'yellow'
}) {
  const badgeColor = countColor === 'red' ? '#cf1322'
    : countColor === 'yellow' ? '#fa8c16'
    : PRIMARY
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: '#8c8c8c',
                    marginBottom: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
        <span>{title}</span>
        <span style={{ background: badgeColor, color: '#fff', padding: '1px 6px',
                       borderRadius: 8, fontSize: 10, fontWeight: 700 }}>{count}</span>
      </div>
      <Button size="small" type="primary" onClick={onClick}
              style={{ background: PRIMARY, width: '100%' }}>{ctaLabel}</Button>
    </div>
  )
}

// ─── Data fetchers ──────────────────────────────────────────────────

async function fetchSlaAtRisk(): Promise<SlaItem[]> {
  const now = new Date()
  const { data } = await supabase
    .from('sales_orders')
    .select('id, contract_no, grade, quantity_tons, total_value_usd, delivery_date, status, customer:sales_customers!customer_id(name, country)')
    .not('delivery_date', 'is', null)
    .in('status', ['draft', 'confirmed', 'producing', 'ready', 'packing'])
    .lt('delivery_date', now.toISOString().split('T')[0])
    .order('delivery_date', { ascending: true })
    .limit(10)
  return ((data as any[]) || []).map((o) => ({
    id: o.id,
    contract_no: o.contract_no || '—',
    customer: o.customer?.name || '—',
    country: o.customer?.country || null,
    grade: o.grade || '—',
    quantity_tons: o.quantity_tons || 0,
    total_value_usd: o.total_value_usd || 0,
    delivery_date: o.delivery_date,
    status: o.status,
    daysOver: -daysFromNow(o.delivery_date),
  }))
}

async function fetchWorkflowCounts(): Promise<Record<string, number>> {
  const { data } = await supabase
    .from('sales_order_contracts')
    .select('status')
  const counts: Record<string, number> = {}
  for (const r of (data as { status: string }[]) || []) {
    counts[r.status] = (counts[r.status] || 0) + 1
  }
  return counts
}

async function fetchActivityFeed(): Promise<ActivityItem[]> {
  const { data } = await supabase
    .from('sales_order_contracts')
    .select(`
      id, status, revision_no, submitted_at, reviewed_at, signed_at, rejected_at, rejected_reason,
      form_data,
      created_by_employee:employees!sales_order_contracts_created_by_fkey(full_name),
      reviewer_employee:employees!sales_order_contracts_reviewer_id_fkey(full_name),
      signer_employee:employees!sales_order_contracts_signer_id_fkey(full_name)
    `)
    .order('updated_at', { ascending: false })
    .limit(8)

  const items: ActivityItem[] = []
  for (const r of (data as any[]) || []) {
    const contractNo = r.form_data?.contract_no || '—'
    if (r.signed_at) {
      items.push({
        id: `${r.id}-signed`, actor: r.signer_employee?.full_name || 'Trình ký',
        action: 'đã ký HĐ', target: contractNo, detail: `rev #${r.revision_no}`,
        created_at: r.signed_at, type: 'sign',
      })
    } else if (r.rejected_at) {
      items.push({
        id: `${r.id}-rejected`, actor: r.reviewer_employee?.full_name || 'Kiểm tra',
        action: 'trả lại HĐ', target: contractNo,
        detail: r.rejected_reason ? `"${r.rejected_reason.slice(0, 40)}"` : '',
        created_at: r.rejected_at, type: 'reject',
      })
    } else if (r.reviewed_at) {
      items.push({
        id: `${r.id}-approved`, actor: r.reviewer_employee?.full_name || 'Kiểm tra',
        action: 'duyệt HĐ', target: contractNo, detail: `rev #${r.revision_no}`,
        created_at: r.reviewed_at, type: 'approve',
      })
    } else if (r.submitted_at) {
      items.push({
        id: `${r.id}-submitted`, actor: r.created_by_employee?.full_name || 'Sale',
        action: 'trình HĐ', target: contractNo, detail: `rev #${r.revision_no}`,
        created_at: r.submitted_at, type: 'submit',
      })
    }
  }
  return items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

async function fetchCalendar(): Promise<CalendarEvent[]> {
  const now = new Date()
  const limit = new Date(now)
  limit.setDate(limit.getDate() + 14)
  const { data } = await supabase
    .from('sales_orders')
    .select('etd, delivery_date, contract_no, customer:sales_customers!customer_id(short_name, name)')
    .or(`etd.gte.${now.toISOString().split('T')[0]},delivery_date.gte.${now.toISOString().split('T')[0]}`)
    .lte('etd', limit.toISOString().split('T')[0])
    .neq('status', 'cancelled')
    .order('etd', { ascending: true })

  const byDate: Record<string, { count: number; urgent: boolean; topLabel?: string }> = {}
  for (const o of (data as any[]) || []) {
    const d = o.etd || o.delivery_date
    if (!d) continue
    if (!byDate[d]) byDate[d] = { count: 0, urgent: false }
    byDate[d].count++
    if (!byDate[d].topLabel) {
      const name = o.customer?.short_name || o.customer?.name?.split(' ')[0] || o.contract_no
      byDate[d].topLabel = byDate[d].count > 1 ? `${name} +${byDate[d].count - 1}` : name
    }
  }
  return Object.entries(byDate).map(([date, info]) => ({ date, ...info }))
}

async function fetchCycleTime(): Promise<number> {
  const { data } = await supabase
    .from('sales_order_contracts')
    .select('submitted_at, signed_at')
    .eq('status', 'signed')
    .not('submitted_at', 'is', null)
    .not('signed_at', 'is', null)
    .limit(30)
  const rows = (data as { submitted_at: string; signed_at: string }[]) || []
  if (rows.length === 0) return 0
  const totalMs = rows.reduce((s, r) => s + (new Date(r.signed_at).getTime() - new Date(r.submitted_at).getTime()), 0)
  return totalMs / rows.length / 86400000
}

async function fetchCashflow(): Promise<CashflowBar[]> {
  // 7 tuần: 4 đã/đang xử lý + 3 dự kiến. Tính từ sales_orders với delivery_date trong window.
  const now = new Date()
  const bars: CashflowBar[] = []
  // Week boundaries: [-4w, -3w], [-3w, -2w], [-2w, -1w], [-1w, now], [now, +1w], [+1w, +2w], [+2w, +3w]
  for (let offset = -4; offset < 3; offset++) {
    const start = new Date(now); start.setDate(start.getDate() + offset * 7)
    const end = new Date(start); end.setDate(end.getDate() + 7)
    const { data } = await supabase
      .from('sales_orders')
      .select('total_value_usd')
      .gte('delivery_date', start.toISOString().split('T')[0])
      .lt('delivery_date', end.toISOString().split('T')[0])
      .neq('status', 'cancelled')
    const sum = ((data as { total_value_usd: number | null }[]) || []).reduce(
      (s, r) => s + (r.total_value_usd || 0), 0,
    )
    bars.push({
      label: offset < 0
        ? `T${-offset}w trước`
        : offset === 0 ? 'Tuần này' : `+${offset}w`,
      value: sum,
      future: offset > 0,
    })
  }
  return bars
}

async function fetchLcNearExpiry(): Promise<LcItem[]> {
  const now = new Date()
  const limit = new Date(now)
  limit.setDate(limit.getDate() + 30)
  const { data } = await supabase
    .from('sales_orders')
    .select('id, contract_no, lc_expiry_date, lc_bank, contract_price, total_value_usd, customer:sales_customers!customer_id(name)')
    .not('lc_expiry_date', 'is', null)
    .gte('lc_expiry_date', now.toISOString().split('T')[0])
    .lte('lc_expiry_date', limit.toISOString().split('T')[0])
    .order('lc_expiry_date', { ascending: true })
  return ((data as any[]) || []).map((o) => ({
    id: o.id, contract_no: o.contract_no || '—',
    customer: o.customer?.name || '—',
    bank_name: o.lc_bank || '—',
    lc_amount: o.total_value_usd || o.contract_price || 0,
    lc_expiry_date: o.lc_expiry_date,
    daysLeft: daysFromNow(o.lc_expiry_date),
  }))
}

// ─── Activity feed helpers ──────────────────────────────────────────

function feedDotIcon(type: ActivityItem['type']): string {
  return { sign: '✓', approve: '👍', reject: '✗', submit: '📤', archive: '📁' }[type]
}

function feedDotColor(type: ActivityItem['type']): { background: string; color: string } {
  switch (type) {
    case 'sign':     return { background: '#f6ffed', color: '#389e0d' }
    case 'approve':  return { background: '#fff7e6', color: '#d46b08' }
    case 'reject':   return { background: '#fff1f0', color: '#cf1322' }
    case 'submit':   return { background: '#e6f4ff', color: '#1677ff' }
    case 'archive':  return { background: '#f5f5f5', color: '#8c8c8c' }
  }
}

function timeAgo(s: string): string {
  const diff = (Date.now() - new Date(s).getTime()) / 60000
  if (diff < 1) return 'vừa xong'
  if (diff < 60) return `${Math.round(diff)} phút trước`
  if (diff < 1440) return `${Math.round(diff / 60)} giờ trước`
  if (diff < 10080) return `${Math.round(diff / 1440)} ngày trước`
  return new Date(s).toLocaleDateString('vi-VN')
}

// ─── Inline styles ──────────────────────────────────────────────────

const topbar: React.CSSProperties = {
  background: '#fff', borderRadius: 12, padding: '14px 20px', marginBottom: 16,
  display: 'flex', alignItems: 'center', gap: 16,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)', border: '1px solid #e8e8e8',
}
const seg: React.CSSProperties = {
  display: 'flex', gap: 2, padding: 3, background: '#f0f0f0', borderRadius: 8,
}
const segBtn: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
  border: 'none', background: 'transparent', cursor: 'pointer', color: '#8c8c8c',
}
const segActive: React.CSSProperties = {
  background: '#fff', color: PRIMARY, boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
}
const aiBanner: React.CSSProperties = {
  background: 'linear-gradient(135deg, #1B4D3E 0%, #2E7D5B 100%)',
  color: '#fff', borderRadius: 14, padding: '16px 20px', marginBottom: 16,
  display: 'flex', alignItems: 'flex-start', gap: 14,
  boxShadow: '0 4px 16px rgba(27,77,62,0.15)',
}
const aiIcon: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.15)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}
const aiLabel: React.CSSProperties = {
  fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, opacity: 0.75, marginBottom: 4,
}
const aiText: React.CSSProperties = { fontSize: 13.5, lineHeight: 1.65 }
const aiActions: React.CSSProperties = { display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }
const aiAction: React.CSSProperties = {
  padding: '4px 10px', background: 'rgba(255,255,255,0.18)', borderRadius: 6,
  fontSize: 11, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)',
}
const kpiRow: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16,
}
const kpiStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 12, padding: '14px 16px',
  border: '1px solid #e8e8e8', position: 'relative', overflow: 'hidden',
}
const kpiAccent: React.CSSProperties = {
  position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: PRIMARY,
}
const kpiLabel: React.CSSProperties = {
  fontSize: 11, color: '#8c8c8c', textTransform: 'uppercase', letterSpacing: 0.5,
}
const kpiValue: React.CSSProperties = {
  fontSize: 26, fontWeight: 700, margin: '6px 0 2px', lineHeight: 1.1,
}
const kpiSub: React.CSSProperties = { fontSize: 11, color: '#8c8c8c' }
const kpiTrend: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4,
}
const bento: React.CSSProperties = { display: 'grid', gap: 16, marginBottom: 16 }
const widget: React.CSSProperties = {
  background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8',
  padding: 16, display: 'flex', flexDirection: 'column',
}
const widgetHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
}
const widgetIcon: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 7,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const widgetLink: React.CSSProperties = {
  fontSize: 11, color: PRIMARY, cursor: 'pointer', fontWeight: 500,
}
const stageRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0',
  borderBottom: '1px solid #f5f5f5',
}
const stageIcon: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 6, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
}
const barWrap: React.CSSProperties = {
  background: '#f0f0f0', height: 6, borderRadius: 3, marginTop: 4, overflow: 'hidden',
}
const bar: React.CSSProperties = { height: '100%', borderRadius: 3, transition: 'width 0.3s' }
const slaItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: 10,
  borderRadius: 8, marginBottom: 6, border: '1px solid #f0f0f0', cursor: 'pointer',
}
const slaRing: React.CSSProperties = {
  width: 44, height: 44, borderRadius: 22, display: 'flex',
  alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
  flexShrink: 0, color: '#fff',
}
const custRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0',
  borderBottom: '1px solid #f5f5f5',
}
const custBarWrap: React.CSSProperties = {
  background: '#f0f0f0', height: 4, borderRadius: 2, marginTop: 4, overflow: 'hidden',
}
const custBar: React.CSSProperties = {
  height: '100%', background: 'linear-gradient(90deg, #1B4D3E, #2E7D5B)', borderRadius: 2,
}
const feedItem: React.CSSProperties = {
  display: 'flex', gap: 10, padding: '8px 0',
  borderBottom: '1px solid #f5f5f5', alignItems: 'flex-start',
}
const feedDot: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 14, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
}
const th: React.CSSProperties = {
  textAlign: 'left', padding: '6px 8px', fontSize: 10, textTransform: 'uppercase',
  letterSpacing: 0.5, color: '#8c8c8c', borderBottom: '1px solid #e8e8e8', fontWeight: 600,
}
const td: React.CSSProperties = { padding: 8, cursor: 'pointer' }
const quickActions: React.CSSProperties = {
  position: 'sticky', bottom: 20, background: '#fff', borderRadius: 14,
  padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center',
  boxShadow: '0 8px 24px rgba(0,0,0,0.08)', border: '1px solid #e8e8e8',
  marginTop: 16, zIndex: 10,
}
const qaTitle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#8c8c8c',
  textTransform: 'uppercase', letterSpacing: 1,
}
const emptyStyle: React.CSSProperties = {
  padding: 24, textAlign: 'center', color: '#bfbfbf', fontSize: 12,
}

const calWrap: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4,
}
const calHead: React.CSSProperties = {
  fontSize: 10, textAlign: 'center', color: '#8c8c8c', padding: 4, fontWeight: 600,
}
const calCell: React.CSSProperties = {
  aspectRatio: '1', borderRadius: 6, display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', fontSize: 11, cursor: 'pointer',
  background: '#fafafa', position: 'relative',
}

const cfBars: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-end', gap: 8, height: 120, padding: '8px 0',
}
