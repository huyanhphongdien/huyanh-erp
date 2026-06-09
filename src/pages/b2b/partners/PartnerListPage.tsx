// ============================================================================
// PARTNER LIST PAGE — Danh sách Đại lý với Card Grid
// File: src/pages/b2b/partners/PartnerListPage.tsx
// Phase: E4.2.1, E4.2.2, E4.2.3, E4.2.4, E4.2.5
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOpenChatTab } from '../../../hooks/useB2BTabs'
import { B2BSectionTabs, PARTNER_TABS } from '../../../components/b2b/B2BSectionTabs'
import {
  Card,
  Row,
  Col,
  Input,
  Select,
  Segmented,
  Avatar,
  Tag,
  Badge,
  Button,
  Space,
  Typography,
  Tooltip,
  Spin,
  Empty,
  Pagination,
  Statistic,
  Table,
  Modal,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  SearchOutlined,
  MessageOutlined,
  ShoppingOutlined,
  DollarOutlined,
  UserOutlined,
  ReloadOutlined,
  PlusOutlined,
  FilterOutlined,
  EditOutlined,
  KeyOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons'
import {
  partnerService,
  Partner,
  PartnerTier,
  PartnerListParams,
  TIER_LABELS,
  TIER_COLORS,
  TIER_ICONS,
  PARTNER_TYPE_LABELS,
  PARTNER_STATUS_LABELS,
  PARTNER_STATUS_COLORS,
} from '../../../services/b2b/partnerService'
import { chatRoomService } from '../../../services/b2b/chatRoomService'
import { useAuthStore } from '../../../stores/authStore'
import { supabase } from '../../../lib/supabase'
import PartnerCreateModal from './PartnerCreateModal'
import PartnerEditModal from './PartnerEditModal'

const { Title, Text } = Typography

// ============================================
// CONSTANTS
// ============================================

const TIER_OPTIONS = [
  { label: 'Tất cả', value: 'all' },
  { label: '💎 Kim cương', value: 'diamond' },
  { label: '🥇 Vàng', value: 'gold' },
  { label: '🥈 Bạc', value: 'silver' },
  { label: '🥉 Đồng', value: 'bronze' },
  { label: '🆕 Mới', value: 'new' },
]

// Nhãn loại đối tác — gộp cả type của partnerService (dealer/supplier/both) lẫn
// create service (household/processor) để bảng hiển thị đủ.
const PARTNER_TYPE_LABEL_ALL: Record<string, string> = {
  household: 'Hộ ND', dealer: 'Đại lý', supplier: 'NCC', processor: 'Gia công', both: 'ĐL & NCC',
}

// ============================================
// PARTNER CARD COMPONENT (E4.2.1)
// ============================================

interface PartnerCardProps {
  partner: Partner
  onView: () => void
  onChat: () => void
  onDeals: () => void
}

const PartnerCard = ({ partner, onView, onChat, onDeals }: PartnerCardProps) => {
  const hasUnread = (partner.unread_count || 0) > 0
  const hasDealsProcessing = (partner.deals_processing || 0) > 0

  return (
    <Card
      hoverable
      style={{ borderRadius: 12, height: '100%' }}
      bodyStyle={{ padding: 20 }}
      onClick={onView}
      actions={[
        <Tooltip title="Mở Chat" key="chat">
          <Badge count={partner.unread_count} size="small">
            <Button
              type="text"
              icon={<MessageOutlined />}
              onClick={(e) => {
                e.stopPropagation()
                onChat()
              }}
            />
          </Badge>
        </Tooltip>,
        <Tooltip title="Giao dịch" key="deals">
          <Badge count={partner.deals_processing} size="small" color="blue">
            <Button
              type="text"
              icon={<ShoppingOutlined />}
              onClick={(e) => {
                e.stopPropagation()
                onDeals()
              }}
            />
          </Badge>
        </Tooltip>,
        <Tooltip title="Công nợ" key="debt">
          <Button
            type="text"
            icon={<DollarOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              // Navigate to ledger
            }}
          />
        </Tooltip>,
      ]}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 16 }}>
        <Badge dot={hasUnread} offset={[-5, 5]}>
          <Avatar
            size={56}
            style={{
              backgroundColor: hasUnread ? '#1677ff' : '#1B4D3E',
              fontSize: 22,
            }}
          >
            {partner.name.charAt(0).toUpperCase()}
          </Avatar>
        </Badge>
        <div style={{ marginLeft: 12, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text strong style={{ fontSize: 16 }}>{partner.name}</Text>
          </div>
          <Space size={4} style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>{partner.code}</Text>
            <Tag color={TIER_COLORS[partner.tier]} style={{ fontSize: 10, margin: 0 }}>
              {TIER_ICONS[partner.tier]} {TIER_LABELS[partner.tier]}
            </Tag>
          </Space>
        </div>
      </div>

      {/* Stats */}
      <Row gutter={8}>
        <Col span={12}>
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <Text type="secondary" style={{ fontSize: 11 }}>Deals</Text>
            <br />
            <Text strong style={{ fontSize: 16, color: '#1B4D3E' }}>
              {partner.deals_count || 0}
            </Text>
          </div>
        </Col>
        <Col span={12}>
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <Text type="secondary" style={{ fontSize: 11 }}>Sản lượng</Text>
            <br />
            <Text strong style={{ fontSize: 16, color: '#1B4D3E' }}>
              {partner.total_quantity?.toFixed(1) || 0} <Text type="secondary" style={{ fontSize: 11 }}>tấn</Text>
            </Text>
          </div>
        </Col>
      </Row>

      {/* Contact */}
      {partner.phone && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            📞 {partner.phone}
          </Text>
        </div>
      )}
    </Card>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

const PartnerListPage = () => {
  const navigate = useNavigate()
  const openChatTab = useOpenChatTab()
  const { user } = useAuthStore()

  // State
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [searchText, setSearchText] = useState('')
  const [tierFilter, setTierFilter] = useState<string>('all')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 })
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editPartner, setEditPartner] = useState<Partner | null>(null)
  // Cấp tài khoản đăng nhập B2B
  const [accountIds, setAccountIds] = useState<Set<string>>(new Set())
  const [provisioning, setProvisioning] = useState<string | null>(null)  // partner id hoặc 'bulk'
  const [cred, setCred] = useState<{ name: string; phone: string; password: string } | null>(null)
  const [bulkText, setBulkText] = useState<string | null>(null)
  // Chỉ admin được tạo / sửa đại lý (1 đầu mối, tránh trùng)
  const isAdmin = user?.role === 'admin'

  /** Cấp 1 tài khoản — gọi edge function create-partner-auth. Trả creds hoặc null nếu lỗi. */
  async function provisionOne(p: Partner): Promise<{ email: string; password: string } | null> {
    const { data, error } = await supabase.functions.invoke('create-partner-auth', { body: { partner_id: p.id } })
    if (error) {
      // FunctionsHttpError: lý do thật nằm trong body response (error.context), không phải error.message
      let msg = error.message
      try {
        const ctx = (error as any).context
        const body = ctx && typeof ctx.json === 'function' ? await ctx.json() : null
        if (body?.error) msg = body.error
      } catch { /* ignore */ }
      throw new Error(msg)
    }
    if (!data?.ok) throw new Error(data?.error || 'Tạo tài khoản thất bại')
    setAccountIds(prev => new Set(prev).add(p.id))
    return { email: data.email, password: data.temp_password }
  }

  async function handleProvision(p: Partner) {
    if (!p.phone) { message.warning(`${p.name} chưa có SĐT — bổ sung SĐT trước khi cấp tài khoản`); return }
    setProvisioning(p.id)
    try {
      const r = await provisionOne(p)
      if (r) setCred({ name: p.name, phone: p.phone || '', password: r.password })
      message.success(`Đã cấp tài khoản cho ${p.name}`)
    } catch (e: any) {
      message.error('Cấp tài khoản thất bại: ' + (e?.message || e))
    } finally { setProvisioning(null) }
  }

  async function handleProvisionAll() {
    const targets = partners.filter(p => !accountIds.has(p.id) && p.phone)
    const noPhone = partners.filter(p => !accountIds.has(p.id) && !p.phone)
    if (targets.length === 0) {
      message.info(noPhone.length ? `Các đại lý chưa có TK đều thiếu SĐT (${noPhone.length}) — bổ sung SĐT trước` : 'Mọi đại lý (trang này) đã có tài khoản')
      return
    }
    if (!window.confirm(`Cấp tài khoản cho ${targets.length} đại lý chưa có account (trang này)?` + (noPhone.length ? `\n${noPhone.length} đại lý thiếu SĐT sẽ bỏ qua.` : ''))) return
    setProvisioning('bulk')
    const lines: string[] = []
    let ok = 0
    for (const p of targets) {
      try {
        const r = await provisionOne(p)
        if (r) { lines.push(`${p.name}\n  SĐT đăng nhập: ${p.phone || ''}\n  Mật khẩu tạm: ${r.password}`); ok++ }
      } catch (e: any) { lines.push(`${p.name} — LỖI: ${e?.message || e}`) }
    }
    for (const p of noPhone) lines.push(`${p.name} — BỎ QUA (thiếu SĐT)`)
    setProvisioning(null)
    setBulkText(lines.join('\n\n'))
    message.success(`Đã cấp ${ok}/${targets.length} tài khoản`)
  }

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchPartners = useCallback(async () => {
    try {
      setLoading(true)

      const params: PartnerListParams = {
        page: pagination.current,
        pageSize: pagination.pageSize,
        search: searchText || undefined,
        tier: tierFilter !== 'all' ? (tierFilter as PartnerTier) : undefined,
      }

      // Get partners with stats
      const response = await partnerService.getPartners(params)
      
      // Get stats for each partner (parallel)
      const partnersWithStats = await Promise.all(
        response.data.map(async (partner) => {
          try {
            const stats = await partnerService.getPartnerStats(partner.id)
            return {
              ...partner,
              unread_count: stats.unreadMessages,
              deals_count: stats.totalDeals,
              deals_processing: stats.dealsProcessing,
              total_quantity: stats.totalQuantity,
              total_value: stats.totalValue,
            }
          } catch {
            return partner
          }
        })
      )

      setPartners(partnersWithStats)
      setTotal(response.total)

      // Đại lý nào đã có tài khoản đăng nhập (b2b_partner_users)
      const ids = partnersWithStats.map(p => p.id)
      if (ids.length) {
        const { data: pu } = await supabase.from('b2b_partner_users').select('partner_id').in('partner_id', ids)
        setAccountIds(new Set((pu || []).map((x: any) => x.partner_id)))
      } else {
        setAccountIds(new Set())
      }
    } catch (error) {
      console.error('Error fetching partners:', error)
      message.error('Không thể tải danh sách đại lý')
    } finally {
      setLoading(false)
    }
  }, [pagination, searchText, tierFilter])

  useEffect(() => {
    fetchPartners()
  }, [fetchPartners])

  // ============================================
  // HANDLERS
  // ============================================

  const handleSearch = (value: string) => {
    setSearchText(value)
    setPagination(prev => ({ ...prev, current: 1 }))
  }

  const handleTierChange = (value: string) => {
    setTierFilter(value)
    setPagination(prev => ({ ...prev, current: 1 }))
  }

  const handlePageChange = (page: number, pageSize: number) => {
    setPagination({ current: page, pageSize })
  }

  const handleViewPartner = (partner: Partner) => {
    navigate(`/b2b/partners/${partner.id}`)
  }

  const handleOpenChat = async (partner: Partner) => {
    if (!user?.id) {
      message.warning('Vui lòng đăng nhập lại')
      return
    }
    try {
      // sprint1_08: tạo/mở room riêng cho cặp (NV đang login × đại lý này)
      const room = await chatRoomService.getOrCreate(partner.id, user.id, {
        room_type: 'general',
        room_name: partner.name,
      })
      openChatTab({ id: room.id, partner_name: partner.name })
    } catch (error: any) {
      console.error('handleOpenChat error:', error)
      message.error('Không thể mở chat: ' + (error?.message || ''))
    }
  }

  const handleViewDeals = (partner: Partner) => {
    navigate(`/b2b/deals?partner_id=${partner.id}`)
  }

  const handleRefresh = () => {
    fetchPartners()
  }

  // ============================================
  // RENDER
  // ============================================

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={3} style={{ margin: 0 }}>Quản lý Đại lý</Title>
            <Text type="secondary">Danh sách đối tác B2B</Text>
          </Col>
          <Col>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
                Làm mới
              </Button>
              {isAdmin && (
                <Button icon={<KeyOutlined />} loading={provisioning === 'bulk'} onClick={handleProvisionAll}>
                  Cấp TK hàng loạt
                </Button>
              )}
              {isAdmin && (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowCreateModal(true)}>
                  Thêm Đại lý
                </Button>
              )}
            </Space>
          </Col>
        </Row>
      </div>

      {/* B2B Section tabs */}
      <B2BSectionTabs tabs={PARTNER_TABS} active="partner-list" />

      {/* Filters (E4.2.5) */}
      <Card style={{ marginBottom: 24, borderRadius: 12 }}>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Input
              size="large"
              placeholder="Tìm: tên · mã (8999…) · SĐT · CCCD..."
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
              value={searchText}
              onChange={(e) => handleSearch(e.target.value)}
              allowClear
              style={{ maxWidth: 480 }}
            />
          </Col>
          <Col>
            <Space>
              <FilterOutlined style={{ color: '#bfbfbf' }} />
              <Segmented
                options={TIER_OPTIONS}
                value={tierFilter}
                onChange={(val) => handleTierChange(val as string)}
              />
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Bảng đại lý — dễ quan sát, quét nhanh */}
      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
        <Table<Partner>
          rowKey="id"
          loading={loading}
          dataSource={partners}
          size="middle"
          scroll={{ x: 900 }}
          onRow={(record) => ({
            onClick: () => handleViewPartner(record),
            style: { cursor: 'pointer' },
          })}
          locale={{ emptyText: searchText || tierFilter !== 'all' ? 'Không tìm thấy đại lý phù hợp' : 'Chưa có đại lý nào' }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total,
            onChange: handlePageChange,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (t) => `Tổng ${t} đại lý`,
            pageSizeOptions: ['20', '50', '100'],
          }}
          columns={[
            {
              title: 'Mã', dataIndex: 'code', key: 'code', width: 150,
              render: (code: string) => <Text strong style={{ fontFamily: 'monospace', fontSize: 13 }}>{code}</Text>,
            },
            {
              title: 'Tên đại lý', dataIndex: 'name', key: 'name',
              render: (name: string, r: Partner) => (
                <Space>
                  <Avatar size="small" icon={<UserOutlined />} style={{ background: TIER_COLORS[r.tier] }} />
                  <span style={{ fontWeight: 600 }}>{name}</span>
                </Space>
              ),
            },
            {
              title: 'SĐT', dataIndex: 'phone', key: 'phone', width: 140,
              render: (p: string | null) => p
                ? <Text copyable={{ text: p }} style={{ fontFamily: 'monospace' }}>{p}</Text>
                : <Text type="secondary">—</Text>,
            },
            {
              title: 'Loại', dataIndex: 'partner_type', key: 'partner_type', width: 110,
              render: (t: string) => <Tag>{PARTNER_TYPE_LABEL_ALL[t] || t}</Tag>,
            },
            {
              title: 'Hạng', dataIndex: 'tier', key: 'tier', width: 130,
              render: (tier: PartnerTier) => <Tag color={TIER_COLORS[tier]}>{TIER_ICONS[tier]} {TIER_LABELS[tier]}</Tag>,
            },
            {
              title: 'Deals', dataIndex: 'deals_count', key: 'deals_count', width: 90, align: 'center',
              render: (n: number, r: Partner) => (
                <Space size={4}>
                  <span>{n || 0}</span>
                  {(r.deals_processing || 0) > 0 && <Badge count={r.deals_processing} size="small" color="blue" />}
                </Space>
              ),
            },
            {
              title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 120,
              render: (s: string) => <Tag color={PARTNER_STATUS_COLORS[s as keyof typeof PARTNER_STATUS_COLORS]}>{PARTNER_STATUS_LABELS[s as keyof typeof PARTNER_STATUS_LABELS] || s}</Tag>,
            },
            {
              title: '', key: 'actions', width: 140, align: 'right', fixed: 'right',
              render: (_: unknown, r: Partner) => (
                <Space size={2} onClick={(e) => e.stopPropagation()}>
                  <Tooltip title="Chat">
                    <Badge count={r.unread_count} size="small">
                      <Button type="text" size="small" icon={<MessageOutlined />} onClick={() => handleOpenChat(r)} />
                    </Badge>
                  </Tooltip>
                  <Tooltip title="Giao dịch">
                    <Button type="text" size="small" icon={<ShoppingOutlined />} onClick={() => handleViewDeals(r)} />
                  </Tooltip>
                  {isAdmin && (
                    <Tooltip title="Sửa / bổ sung thông tin">
                      <Button type="text" size="small" icon={<EditOutlined />} onClick={() => setEditPartner(r)} />
                    </Tooltip>
                  )}
                  {isAdmin && (
                    accountIds.has(r.id) ? (
                      <Tooltip title="Đã có tài khoản đăng nhập B2B">
                        <CheckCircleOutlined style={{ color: '#16a34a', padding: '0 4px' }} />
                      </Tooltip>
                    ) : (
                      <Tooltip title={r.phone ? 'Cấp tài khoản đăng nhập B2B' : 'Chưa có SĐT — bổ sung trước khi cấp'}>
                        <Button type="text" size="small" icon={<KeyOutlined />} disabled={!r.phone}
                          loading={provisioning === r.id} onClick={() => handleProvision(r)} />
                      </Tooltip>
                    )
                  )}
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <PartnerCreateModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={fetchPartners}
      />

      <PartnerEditModal
        open={!!editPartner}
        partner={editPartner}
        onClose={() => setEditPartner(null)}
        onSaved={fetchPartners}
      />

      {/* Credentials — 1 đại lý */}
      <Modal
        open={!!cred}
        onCancel={() => setCred(null)}
        title="Tài khoản đăng nhập B2B đã cấp"
        footer={[
          <Button key="copy" type="primary" onClick={() => {
            navigator.clipboard.writeText(
              `HUY ANH — Cổng Đại lý\n` +
              `Kính gửi anh/chị ${cred?.name},\n` +
              `Huy Anh gửi anh/chị tài khoản truy cập Cổng Đại lý:\n` +
              `• Trang đăng nhập: https://b2b.huyanhrubber.vn\n` +
              `• Đăng nhập bằng Số điện thoại: ${cred?.phone}\n` +
              `• Mật khẩu tạm: ${cred?.password}\n` +
              `(Lần đầu đăng nhập hệ thống sẽ yêu cầu đổi mật khẩu mới.)`
            )
            message.success('Đã copy — gửi Zalo cho đại lý')
          }}>Copy gửi Zalo</Button>,
          <Button key="close" onClick={() => setCred(null)}>Đóng</Button>,
        ]}
      >
        {cred && (
          <div style={{ fontSize: 14, lineHeight: 2 }}>
            <div><Text type="secondary">Đại lý:</Text> <Text strong>{cred.name}</Text></div>
            <div><Text type="secondary">Trang đăng nhập:</Text> <Text strong copyable>https://b2b.huyanhrubber.vn</Text></div>
            <div><Text type="secondary">Đăng nhập bằng SĐT:</Text> <Text strong copyable style={{ fontFamily: 'monospace' }}>{cred.phone}</Text></div>
            <div><Text type="secondary">Mật khẩu tạm:</Text> <Text strong copyable style={{ fontFamily: 'monospace' }}>{cred.password}</Text></div>
            <div style={{ marginTop: 8, color: '#b45309', fontSize: 12 }}>Đăng nhập lần đầu sẽ <b>buộc đổi mật khẩu</b>.</div>
          </div>
        )}
      </Modal>

      {/* Credentials — hàng loạt */}
      <Modal
        open={!!bulkText}
        onCancel={() => setBulkText(null)}
        title="Tài khoản đã cấp (hàng loạt)"
        width={560}
        footer={[
          <Button key="copy" type="primary" onClick={() => {
            navigator.clipboard.writeText(`HUY ANH — Cổng Đại lý: https://b2b.huyanhrubber.vn\nĐăng nhập bằng SĐT + mật khẩu tạm dưới đây (lần đầu sẽ yêu cầu đổi mật khẩu).\n\n${bulkText}`)
            message.success('Đã copy toàn bộ')
          }}>Copy tất cả</Button>,
          <Button key="close" onClick={() => setBulkText(null)}>Đóng</Button>,
        ]}
      >
        <Input.TextArea value={bulkText || ''} readOnly autoSize={{ minRows: 8, maxRows: 18 }} style={{ fontFamily: 'monospace', fontSize: 12 }} />
      </Modal>
    </div>
  )
}

export default PartnerListPage