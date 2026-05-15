// ============================================================================
// SALES ORDER DETAIL PANEL — Slide-in panel v4
// File: src/pages/sales/components/SalesOrderDetailPanel.tsx
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Drawer, Tabs, Tag, Space, Button, Spin, message, Popconfirm, Tooltip, Dropdown, Modal, Input } from 'antd'
import type { MenuProps } from 'antd'
import {
  LockOutlined,
  UnlockOutlined,
  FileTextOutlined,
  ToolOutlined,
  CarOutlined,
  DollarOutlined,
  FolderOpenOutlined,
  CloseOutlined,
  CopyOutlined,
  MessageOutlined,
  FolderOutlined,
  StopOutlined,
  PrinterOutlined,
  DownOutlined,
  ThunderboltOutlined,
  ShareAltOutlined,
} from '@ant-design/icons'
import { salesOrderService } from '../../../services/sales/salesOrderService'
import { salesContractWorkflowService } from '../../../services/sales/salesContractWorkflowService'
import type { SalesOrder } from '../../../services/sales/salesTypes'
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '../../../services/sales/salesTypes'
import {
  getSalesRole,
  getVisibleTabs,
  isTabEditable,
  type SalesRole,
  type SalesOrderStatus,
} from '../../../services/sales/salesPermissionService'
import { useAuthStore } from '../../../stores/authStore'
import ContractTab from './ContractTab'
import ProductionTab from './ProductionTab'
import ShippingTab from './ShippingTab'
import FinanceTabV4 from './FinanceTabV4'
import DocumentChecklistTab from './DocumentChecklistTab'
import StageOwnershipCard from './StageOwnershipCard'
import HandoffTimeline from './HandoffTimeline'
import OrderProgressDashboard from './OrderProgressDashboard'
import SalesOrderChat from './SalesOrderChat'
import StagePill from '../../../components/common/StagePill'
import {
  SALES_STAGES,
  SALES_STAGE_SHORT,
  SALES_STAGE_EMOJI,
  statusToStage,
  type SalesStage,
} from '../../../services/sales/salesStages'

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  orderId: string | null
  open: boolean
  onClose: () => void
  onOrderUpdated?: () => void
  /** Render content trực tiếp (không Drawer) cho Split View. Default = false. */
  inline?: boolean
}

const TAB_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  contract: { icon: <FileTextOutlined />, label: 'Hợp đồng', color: '#1B4D3E' },
  production: { icon: <ToolOutlined />, label: 'Sản xuất', color: '#1677ff' },
  shipping: { icon: <CarOutlined />, label: 'Vận chuyển', color: '#d48806' },
  // documents: { icon: <FolderOpenOutlined />, label: 'Chứng từ', color: '#722ed1' }, // tạm ẩn
  finance: { icon: <DollarOutlined />, label: 'Tài chính', color: '#cf1322' },
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function SalesOrderDetailPanel({ orderId, open, onClose, onOrderUpdated, inline = false }: Props) {
  const { user } = useAuthStore()
  const salesRole = getSalesRole(user)
  const visibleTabs = getVisibleTabs(salesRole)

  const [order, setOrder] = useState<SalesOrder | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('progress')
  const [lockLoading, setLockLoading] = useState(false)
  /** True = đơn dùng workflow mới (có row sales_order_contracts) → ẩn "Khóa HĐ"
   *  vì workflow tự lock khi status='signed'/'archived'. */
  const [hasWorkflow, setHasWorkflow] = useState<boolean>(false)
  const [cancelling, setCancelling] = useState(false)

  // ── Load order ──
  const loadOrder = useCallback(async () => {
    if (!orderId) return
    setLoading(true)
    try {
      const data = await salesOrderService.getById(orderId)
      setOrder(data)
      // Detect workflow: ẩn Khóa HĐ nếu đơn đã dùng workflow mới
      try {
        const rows = await salesContractWorkflowService.listBySalesOrder(orderId)
        setHasWorkflow(rows.length > 0)
      } catch {
        setHasWorkflow(false)
      }
    } catch {
      message.error('Không thể tải thông tin đơn hàng')
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    if (open && orderId) {
      loadOrder()
      setActiveTab('progress')
    } else {
      setOrder(null)
    }
  }, [open, orderId, loadOrder])

  // ── Lock / Unlock ──
  const handleLock = async () => {
    if (!order || !user) return
    setLockLoading(true)
    try {
      await salesOrderService.lockOrder(order.id, user.id)
      message.success('Đã khóa đơn hàng')
      await loadOrder()
      onOrderUpdated?.()
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setLockLoading(false)
    }
  }

  const handleUnlock = async () => {
    if (!order) return
    setLockLoading(true)
    try {
      await salesOrderService.unlockOrder(order.id)
      message.success('Đã mở khóa đơn hàng')
      await loadOrder()
      onOrderUpdated?.()
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setLockLoading(false)
    }
  }

  // ─── ACTION BUTTON HANDLERS ─────────────────────────────────────────────

  /** Copy URL đơn vào clipboard — dùng cả ở drawer + inline mode. */
  const handleCopyLink = () => {
    if (!order) return
    const url = `${window.location.origin}/sales/orders/${order.id}`
    navigator.clipboard?.writeText(url)
      .then(() => message.success('Đã copy link đơn hàng'))
      .catch(() => message.error('Trình duyệt không hỗ trợ copy'))
  }

  /** In trang detail → cho phép Save as PDF qua dialog in. */
  const handlePrintPDF = () => {
    if (!order) return
    // Inject print stylesheet tạm thời để in gọn (hide chrome)
    const styleId = '_so_print_style'
    let style = document.getElementById(styleId) as HTMLStyleElement | null
    if (!style) {
      style = document.createElement('style')
      style.id = styleId
      style.media = 'print'
      style.textContent = `
        @page { size: A4; margin: 1.5cm; }
        body * { visibility: hidden !important; }
        .so-detail-print-root, .so-detail-print-root * { visibility: visible !important; }
        .so-detail-print-root { position: absolute !important; left: 0; top: 0; width: 100%; }
        .ant-tabs-nav, .ant-drawer-header, .ant-btn, .ant-dropdown, .no-print { display: none !important; }
        .ant-tabs-content-holder { padding: 0 !important; }
      `
      document.head.appendChild(style)
    }
    setTimeout(() => window.print(), 50)
  }

  /** Copy thông tin tóm tắt đơn (cho Sale paste vào email/chat KH). */
  const handleCopyInfo = () => {
    if (!order) return
    const lines = [
      `Đơn hàng: ${order.code}`,
      order.contract_no ? `Số HĐ: ${order.contract_no}` : null,
      order.customer ? `Khách hàng: ${order.customer.name}` : null,
      order.grade ? `Grade: ${order.grade}` : null,
      order.quantity_tons ? `Số lượng: ${order.quantity_tons} MT` : null,
      order.unit_price ? `Đơn giá: $${order.unit_price}/MT` : null,
      order.total_value_usd ? `Tổng: $${order.total_value_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : null,
      (order as { incoterm?: string }).incoterm ? `Incoterm: ${(order as { incoterm?: string }).incoterm}` : null,
      `Trạng thái: ${ORDER_STATUS_LABELS[order.status as SalesOrderStatus] || order.status}`,
      `Link: ${window.location.origin}/sales/orders/${order.id}`,
    ].filter(Boolean).join('\n')
    navigator.clipboard?.writeText(lines)
      .then(() => message.success('Đã copy thông tin đơn — paste vào email/chat'))
      .catch(() => message.error('Trình duyệt không hỗ trợ copy'))
  }

  /** Switch sang tab chat trao đổi. */
  const handleOpenChat = () => {
    setActiveTab('chat')
  }

  /** Switch sang tab Tiến độ (có Files Widget ở đầu). */
  const handleOpenFiles = () => {
    setActiveTab('progress')
    // Scroll xuống Files Widget sau 100ms (đợi tab render)
    setTimeout(() => {
      const filesWidget = document.querySelector('[data-files-widget]')
      filesWidget?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  /** Hủy đơn — chỉ Sale + Admin được làm, đơn status=draft/confirmed/producing.
   *  Update status='cancelled'. */
  const handleCancelOrder = () => {
    if (!order) return
    let reason = ''
    Modal.confirm({
      title: '🚫 Hủy đơn hàng',
      content: (
        <div>
          <p style={{ marginBottom: 12 }}>
            Đơn <strong>{order.code}</strong> sẽ chuyển sang{' '}
            <Tag color="default">Đã hủy</Tag>. Hành động này không undo được.
          </p>
          <Input.TextArea
            rows={3}
            placeholder="Lý do hủy (bắt buộc) — VD: KH cancel, sai thông tin, đổi sang đơn khác..."
            onChange={(e) => { reason = e.target.value }}
          />
        </div>
      ),
      okText: 'Hủy đơn',
      cancelText: 'Quay lại',
      okButtonProps: { danger: true },
      width: 480,
      onOk: async () => {
        if (!reason.trim()) {
          message.error('Cần nhập lý do hủy')
          throw new Error('missing reason')
        }
        setCancelling(true)
        try {
          await salesOrderService.updateFields(order.id, {
            status: 'cancelled',
            notes: `${order.notes || ''}\n[HỦY ĐƠN ${new Date().toLocaleDateString('vi-VN')}] ${reason.trim()}`.trim(),
          })
          message.success(`Đã hủy đơn ${order.code}`)
          await loadOrder()
          onOrderUpdated?.()
        } catch (e: any) {
          message.error(`Hủy đơn thất bại: ${e.message}`)
        } finally {
          setCancelling(false)
        }
      },
    })
  }

  /** Menu items cho dropdown "Hành động". */
  const actionMenuItems: MenuProps['items'] = order ? [
    {
      key: 'copy-info',
      icon: <CopyOutlined />,
      label: 'Copy thông tin đơn',
      onClick: handleCopyInfo,
    },
    {
      key: 'open-chat',
      icon: <MessageOutlined />,
      label: 'Mở chat đơn',
      onClick: handleOpenChat,
    },
    {
      key: 'open-files',
      icon: <FolderOutlined />,
      label: 'Xem tài liệu đính kèm',
      onClick: handleOpenFiles,
    },
    // Divider trước hành động nguy hiểm
    ...((salesRole === 'sale' || salesRole === 'admin') &&
        !['cancelled', 'delivered', 'paid'].includes(order.status)
      ? [
          { type: 'divider' as const },
          {
            key: 'cancel-order',
            icon: <StopOutlined />,
            label: 'Hủy đơn',
            danger: true,
            disabled: cancelling,
            onClick: handleCancelOrder,
          },
        ]
      : []),
  ] : []

  // ── Refresh after save ──
  const handleSaved = () => {
    loadOrder()
    onOrderUpdated?.()
  }

  // ── Tab editable check ──
  const isEditable = (tab: string): boolean => {
    if (!order || !salesRole) return false
    return isTabEditable(salesRole, tab, order.status as SalesOrderStatus, !!order.is_locked)
  }

  // ── Render ──
  if (!open) return null

  const isLocked = !!order?.is_locked
  const canLock = salesRole === 'sale' || salesRole === 'admin'
  const canUnlock = salesRole === 'admin'

  // Tabs core (Tiến độ + Lịch sử) — luôn hiển thị, không filter qua role
  const coreTabItems = order ? [
    {
      key: 'progress',
      label: <span>📈 Tiến độ</span>,
      children: (
        <OrderProgressDashboard order={order} onChanged={handleSaved} onNavigateTab={setActiveTab} />
      ),
    },
    {
      key: 'chat',
      label: <span>💬 Trao đổi</span>,
      children: (
        <SalesOrderChat salesOrderId={order.id} />
      ),
    },
    {
      key: 'progress-legacy',
      label: <span>🏉 Bộ phận / SLA</span>,
      children: (
        <div style={{ padding: '12px 4px' }}>
          <StageOwnershipCard
            orderId={order.id}
            orderCode={order.code}
            currentStage={(order.current_stage as SalesStage) || 'sales'}
            currentOwnerId={order.current_owner_id || null}
            currentOwnerName={order.current_owner?.full_name || null}
            stageStartedAt={order.stage_started_at || null}
            stageSlaHours={order.stage_sla_hours || null}
            onChanged={handleSaved}
          />
        </div>
      ),
    },
    {
      key: 'history',
      label: <span>🕒 Lịch sử</span>,
      children: (
        <HandoffTimeline
          orderId={order.id}
          orderCode={order.code}
          currentStage={(order.current_stage as SalesStage) || 'sales'}
          stageStartedAt={order.stage_started_at || null}
        />
      ),
    },
  ] : []

  const legacyTabItems = visibleTabs
    .filter((t) => TAB_META[t])
    .map((tabKey) => {
      const meta = TAB_META[tabKey]
      const editable = isEditable(tabKey)
      return {
        key: tabKey,
        label: (
          <Space size={4}>
            {meta.icon}
            <span>{meta.label}</span>
            {/* Icon khóa CHỈ hiện cho legacy lock (không có workflow) */}
            {tabKey === 'contract' && isLocked && !hasWorkflow && (
              <LockOutlined style={{ color: '#999', fontSize: 11 }} />
            )}
            {editable && (
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: meta.color, display: 'inline-block',
              }} />
            )}
          </Space>
        ),
        children: renderTabContent(tabKey),
      }
    })

  const tabItems = [...coreTabItems, ...legacyTabItems]

  function renderTabContent(tabKey: string) {
    if (!order) return null
    switch (tabKey) {
      case 'contract':
        return (
          <ContractTab
            order={order}
            salesRole={salesRole}
            editable={isEditable('contract')}
            onSaved={handleSaved}
          />
        )
      case 'production':
        return (
          <ProductionTab
            order={order}
            salesRole={salesRole}
            editable={isEditable('production')}
            onSaved={handleSaved}
          />
        )
      case 'shipping':
        return (
          <ShippingTab
            order={order}
            salesRole={salesRole}
            editable={isEditable('shipping')}
            onSaved={handleSaved}
          />
        )
      case 'documents':
        return (
          <DocumentChecklistTab
            orderId={order.id}
            orderCode={order.code}
          />
        )
      case 'finance':
        return (
          <FinanceTabV4
            order={order}
            salesRole={salesRole}
            editable={isEditable('finance')}
            onSaved={handleSaved}
          />
        )
      default:
        return null
    }
  }

  // Title content shared giữa Drawer mode + inline mode
  const titleContent = order ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ fontWeight: 700, fontSize: 16 }}>{order.code}</span>
      <Tag color={ORDER_STATUS_COLORS[order.status] || 'default'}>
        {ORDER_STATUS_LABELS[order.status] || order.status}
      </Tag>
      {order.current_stage && (
        <StagePill
          stage={order.current_stage as SalesStage}
          stageStartedAt={order.stage_started_at}
          slaHours={order.stage_sla_hours}
          variant="compact"
        />
      )}
      {order.customer && (
        <span style={{ color: '#666', fontSize: 13 }}>{order.customer.name}</span>
      )}
    </div>
  ) : null

  const bodyContent = loading ? (
    <div style={{ textAlign: 'center', padding: 80 }}>
      <Spin size="large" />
    </div>
  ) : order ? (
    <Tabs
      activeKey={activeTab}
      onChange={setActiveTab}
      items={tabItems}
      style={{ padding: '0 16px' }}
      size="small"
    />
  ) : (
    <div style={{ textAlign: 'center', padding: 80, color: '#999' }}>
      Không tìm thấy đơn hàng
    </div>
  )

  // INLINE MODE — Split View (rich header giống mock)
  if (inline) {
    if (!open) return null
    const fmtUSD = (v: number | undefined | null) => {
      if (!v) return '—'
      if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
      if (v >= 1_000) return `$${Math.round(v / 1_000)}K`
      return `$${Math.round(v)}`
    }
    const COUNTRY_FLAGS: Record<string, string> = {
      IN: '🇮🇳', PH: '🇵🇭', ID: '🇮🇩', KR: '🇰🇷', SG: '🇸🇬', FR: '🇫🇷',
      AE: '🇦🇪', TW: '🇹🇼', TR: '🇹🇷', ES: '🇪🇸', BD: '🇧🇩', CN: '🇨🇳',
      LK: '🇱🇰', JP: '🇯🇵', MY: '🇲🇾', VN: '🇻🇳',
    }
    const flag = order?.customer?.country ? COUNTRY_FLAGS[order.customer.country] || '🌐' : '🌐'

    return (
      <div className="so-detail-print-root" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#fff' }}>
        {/* Rich header — bigger code + multiple pills + sub-info line */}
        <div style={{
          padding: '14px 24px 10px', borderBottom: '1px solid #e8e8e8', background: '#fff',
          position: 'sticky', top: 0, zIndex: 5, flexShrink: 0,
        }}>
          {order ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{
                  fontWeight: 700, fontSize: 18, color: '#1B4D3E',
                  fontFamily: 'JetBrains Mono, monospace',
                }}>
                  {order.code}
                </span>
                <Tag color={ORDER_STATUS_COLORS[order.status] || 'default'}>
                  {ORDER_STATUS_LABELS[order.status] || order.status}
                </Tag>
                {order.current_stage && (
                  <StagePill
                    stage={order.current_stage as SalesStage}
                    stageStartedAt={order.stage_started_at}
                    slaHours={order.stage_sla_hours}
                    variant="compact"
                  />
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  {/* "Khóa HĐ" CHỈ hiện cho LEGACY orders (chưa có workflow).
                      Đơn dùng workflow tự lock qua status='signed'/'archived'. */}
                  {!hasWorkflow && (
                    isLocked ? (
                      canUnlock && (
                        <Popconfirm
                          title="Mở khóa đơn hàng?"
                          description="Cho phép Sale sửa lại thông tin hợp đồng"
                          onConfirm={handleUnlock}
                          okText="Mở khóa"
                          cancelText="Hủy"
                        >
                          <Button size="small" icon={<UnlockOutlined />} loading={lockLoading} danger>
                            Mở khóa
                          </Button>
                        </Popconfirm>
                      )
                    ) : (
                      canLock && order.status === 'draft' && (
                        <Popconfirm
                          title="Khóa đơn hàng?"
                          description="Sau khi khóa, Sale không thể sửa thông tin hợp đồng"
                          onConfirm={handleLock}
                          okText="Khóa"
                          cancelText="Hủy"
                        >
                          <Button size="small" icon={<LockOutlined />} loading={lockLoading}
                                  type="primary" style={{ background: '#1B4D3E' }}>
                            Khóa HĐ
                          </Button>
                        </Popconfirm>
                      )
                    )
                  )}
                </div>
              </div>

              {/* Sub-info line: country/buyer/grade/incoterm/$/ETD */}
              <div style={{
                marginTop: 8, display: 'flex', alignItems: 'center', gap: 14,
                fontSize: 12, color: '#8c8c8c', flexWrap: 'wrap',
              }}>
                {order.customer && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {flag} <b style={{ color: '#262626', fontWeight: 600 }}>{order.customer.name}</b>
                  </span>
                )}
                {order.grade && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    📦 <b style={{ color: '#262626', fontWeight: 600 }}>{order.grade}</b>
                    {order.quantity_tons ? ` · ${order.quantity_tons.toFixed(2)}MT` : ''}
                  </span>
                )}
                {(order as { incoterm?: string }).incoterm && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    🚢 <b style={{ color: '#262626', fontWeight: 600 }}>{(order as { incoterm?: string }).incoterm}</b>
                  </span>
                )}
                {order.total_value_usd ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    💰 <b style={{ color: '#1B4D3E', fontWeight: 700 }}>{fmtUSD(order.total_value_usd)}</b>
                  </span>
                ) : null}
                {(order as { etd?: string }).etd && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    📅 ETD <b style={{ color: '#262626', fontWeight: 600 }}>
                      {new Date((order as { etd?: string }).etd!).toLocaleDateString('vi-VN')}
                    </b>
                  </span>
                )}
              </div>

              {/* Action buttons row */}
              <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                <span style={{
                  padding: '3px 10px', background: '#f0f9f4', color: '#1B4D3E',
                  border: '1px solid #d9f4e3', borderRadius: 12,
                  fontSize: 11, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4,
                  fontFamily: 'JetBrains Mono, monospace',
                }}>
                  {order.code} <span style={{ opacity: 0.4, marginLeft: 4 }}>●</span>
                </span>
                <span style={{ color: '#bfbfbf', fontSize: 11 }}>+ Mở tab khác (sắp ra mắt)</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <Tooltip title="Copy URL đơn vào clipboard">
                    <Button size="small" icon={<ShareAltOutlined />} onClick={handleCopyLink}>
                      Copy link
                    </Button>
                  </Tooltip>
                  <Tooltip title="In hoặc Save as PDF (Ctrl+P)">
                    <Button size="small" icon={<PrinterOutlined />} onClick={handlePrintPDF}>
                      Xuất PDF
                    </Button>
                  </Tooltip>
                  <Dropdown menu={{ items: actionMenuItems }} trigger={['click']} placement="bottomRight">
                    <Button size="small" type="primary" icon={<ThunderboltOutlined />}
                            style={{ background: '#1B4D3E' }}>
                      Hành động <DownOutlined style={{ fontSize: 10 }} />
                    </Button>
                  </Dropdown>
                </div>
              </div>
            </>
          ) : (
            <span style={{ color: '#999' }}>Đang tải...</span>
          )}
        </div>

        {/* Pipeline 5-circle visual + alert banner (inline only) */}
        {order && (
          <PipelineHero order={order} />
        )}

        <div style={{ flex: 1, overflow: 'auto' }}>{bodyContent}</div>
      </div>
    )
  }

  // DRAWER MODE — default
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={760}
      destroyOnClose
      closeIcon={<CloseOutlined />}
      styles={{ body: { padding: 0 } }}
      title={
        order ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>{order.code}</span>
            <Tag color={ORDER_STATUS_COLORS[order.status] || 'default'}>
              {ORDER_STATUS_LABELS[order.status] || order.status}
            </Tag>
            {order.current_stage && (
              <StagePill
                stage={order.current_stage as SalesStage}
                stageStartedAt={order.stage_started_at}
                slaHours={order.stage_sla_hours}
                variant="compact"
              />
            )}
            {order.customer && (
              <span style={{ color: '#666', fontSize: 13 }}>
                {order.customer.name}
              </span>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              {/* Copy link — chuẩn hoá với inline mode */}
              <Tooltip title="Copy URL đơn vào clipboard">
                <Button size="small" icon={<ShareAltOutlined />} onClick={handleCopyLink}>
                  Copy link
                </Button>
              </Tooltip>
              {/* Xuất PDF */}
              <Tooltip title="In hoặc Save as PDF">
                <Button size="small" icon={<PrinterOutlined />} onClick={handlePrintPDF}>
                  Xuất PDF
                </Button>
              </Tooltip>
              {/* Hành động dropdown */}
              <Dropdown menu={{ items: actionMenuItems }} trigger={['click']} placement="bottomRight">
                <Button size="small" type="primary" icon={<ThunderboltOutlined />}
                        style={{ background: '#1B4D3E' }}>
                  Hành động <DownOutlined style={{ fontSize: 10 }} />
                </Button>
              </Dropdown>
              {/* Khóa HĐ — chỉ legacy orders */}
              {!hasWorkflow && (
                isLocked ? (
                  canUnlock && (
                    <Popconfirm
                      title="Mở khóa đơn hàng?"
                      description="Cho phép Sale sửa lại thông tin hợp đồng"
                      onConfirm={handleUnlock}
                      okText="Mở khóa"
                      cancelText="Hủy"
                    >
                      <Tooltip title="Mở khóa (Admin)">
                        <Button size="small" icon={<UnlockOutlined />} loading={lockLoading} danger>
                          Mở khóa
                        </Button>
                      </Tooltip>
                    </Popconfirm>
                  )
                ) : (
                  canLock && order.status === 'draft' && (
                    <Popconfirm
                      title="Khóa đơn hàng?"
                      description="Sau khi khóa, Sale không thể sửa thông tin hợp đồng"
                      onConfirm={handleLock}
                      okText="Khóa"
                      cancelText="Hủy"
                    >
                      <Tooltip title="Khóa sau khi xác nhận">
                        <Button size="small" icon={<LockOutlined />} loading={lockLoading}
                                type="primary" style={{ background: '#1B4D3E' }}>
                          Khóa HĐ
                        </Button>
                      </Tooltip>
                    </Popconfirm>
                  )
                )
              )}
            </div>
          </div>
        ) : (
          'Đang tải...'
        )
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin size="large" />
        </div>
      ) : order ? (
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          style={{ padding: '0 16px' }}
          size="small"
        />
      ) : (
        <div style={{ textAlign: 'center', padding: 80, color: '#999' }}>
          Không tìm thấy đơn hàng
        </div>
      )}
    </Drawer>
  )
}

// ============================================================================
// PIPELINE HERO — 7-stage visual ĐỒNG BỘ với SALES_STAGES (Kanban + List)
// ============================================================================

// Pipeline dùng đúng 7 stages của SALES_STAGES — đảm bảo Detail panel,
// Sales Kanban (/sales/kanban) và List view (BỘ PHẬN column) cùng source of truth.
const PIPELINE_STAGES = SALES_STAGES.map((k) => ({
  key: k as SalesStage,
  icon: SALES_STAGE_EMOJI[k],
  label: SALES_STAGE_SHORT[k],
}))

/** Lấy current stage index. Ưu tiên order.current_stage; fallback statusToStage(status). */
function getCurrentStageIdx(order: SalesOrder): number {
  const stage = (order.current_stage as SalesStage | null | undefined)
    || statusToStage(order.status || 'draft')
  const idx = SALES_STAGES.indexOf(stage as SalesStage)
  return idx >= 0 ? idx : 0
}

function PipelineHero({ order }: { order: SalesOrder }) {
  const currentIdx = getCurrentStageIdx(order)
  // SLA elapsed
  let slaText: string | null = null
  let slaColor = '#8c8c8c'
  if (order.stage_started_at && order.stage_sla_hours) {
    const elapsedH = (Date.now() - new Date(order.stage_started_at).getTime()) / 3600000
    const daysElapsed = Math.floor(elapsedH / 24)
    if (elapsedH > order.stage_sla_hours) {
      const overD = Math.ceil((elapsedH - order.stage_sla_hours) / 24)
      slaText = `+${overD}d quá hạn`
      slaColor = '#cf1322'
    } else {
      const leftH = order.stage_sla_hours - elapsedH
      if (leftH < 24) {
        slaText = `Còn ${Math.round(leftH)}h`
        slaColor = '#d46b08'
      } else {
        slaText = `${daysElapsed}d đã giữ`
      }
    }
  }

  return (
    <div style={{ padding: '12px 24px 16px', background: '#fafafa', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
      <div style={{ fontSize: 11, color: '#8c8c8c', fontWeight: 600, marginBottom: 8, letterSpacing: 0.5 }}>
        📍 PIPELINE
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, position: 'relative' }}>
        {PIPELINE_STAGES.map((s, idx) => {
          const done = idx < currentIdx
          const current = idx === currentIdx
          return (
            <div key={s.key} style={{ flex: 1, position: 'relative', textAlign: 'center' }}>
              {/* Connector line */}
              {idx > 0 && (
                <div style={{
                  position: 'absolute',
                  top: 16,
                  left: '-50%',
                  right: '50%',
                  height: 2,
                  background: idx <= currentIdx ? '#389e0d' : '#e8e8e8',
                  zIndex: 0,
                }} />
              )}
              {/* Circle */}
              <div style={{
                width: 32, height: 32, borderRadius: 16,
                background: done ? '#389e0d' : current ? '#1B4D3E' : '#fff',
                border: done || current ? 'none' : '2px solid #d9d9d9',
                color: done || current ? '#fff' : '#bfbfbf',
                margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 14, position: 'relative', zIndex: 1,
                boxShadow: current ? '0 0 0 4px rgba(27,77,62,0.2)' : 'none',
              }}>
                {done ? '✓' : current ? s.icon : idx + 1}
              </div>
              <div style={{
                fontSize: 11, marginTop: 6,
                fontWeight: current ? 700 : 500,
                color: current ? '#1B4D3E' : done ? '#389e0d' : '#bfbfbf',
              }}>
                {s.label}
              </div>
              {current && slaText && (
                <div style={{ fontSize: 10, color: slaColor, fontWeight: 600, marginTop: 2 }}>
                  {slaText}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

