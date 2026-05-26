// ============================================================================
// PARTNER REQUESTS PAGE — Duyệt đại lý đăng ký mới
// File: src/pages/b2b/partners/PartnerRequestsPage.tsx
// Admin xem danh sách đại lý pending → duyệt / từ chối
// ============================================================================

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Card, Table, Tag, Button, Space, Typography, Empty, Modal, Input, message, Descriptions, Spin, Alert,
} from 'antd'
import {
  CheckCircleOutlined, CloseCircleOutlined,
  UserOutlined, PhoneOutlined, BankOutlined, EnvironmentOutlined,
  WarningOutlined, CopyOutlined, KeyOutlined,
} from '@ant-design/icons'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../stores/authStore'
import { B2BSectionTabs, PARTNER_TABS } from '../../../components/b2b/B2BSectionTabs'

const { Title, Text } = Typography
const { TextArea } = Input

export default function PartnerRequestsPage() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [detailPartner, setDetailPartner] = useState<any>(null)
  const [credentialModal, setCredentialModal] = useState<null | {
    partner_name: string; partner_code: string; phone: string; email: string; temp_password: string
  }>(null)

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['partner-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('b2b_partners')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
  })

  // Duplicate detection — fetch active partners có cùng SĐT với requests pending
  const pendingPhones = useMemo(
    () => requests.map((r: any) => r.phone).filter(Boolean),
    [requests],
  )

  const { data: duplicates = [] } = useQuery({
    queryKey: ['partner-requests-duplicates', pendingPhones],
    queryFn: async () => {
      if (pendingPhones.length === 0) return []
      const { data, error } = await supabase
        .from('b2b_partners')
        .select('id, code, name, phone, tier, status')
        .in('phone', pendingPhones)
        .neq('status', 'pending')
      if (error) throw error
      return data || []
    },
    enabled: pendingPhones.length > 0,
  })

  // Map phone → list partner đã tồn tại
  const duplicatesByPhone = useMemo(() => {
    const map: Record<string, any[]> = {}
    for (const p of duplicates) {
      if (!p.phone) continue
      if (!map[p.phone]) map[p.phone] = []
      map[p.phone].push(p)
    }
    return map
  }, [duplicates])

  const approveMutation = useMutation({
    mutationFn: async (partnerId: string) => {
      // Gọi Edge Function tạo auth.users + partner_users + update status
      const { data, error } = await supabase.functions.invoke('create-partner-auth', {
        body: {
          partner_id: partnerId,
          verified_by_employee_id: user?.employee_id || null,
        },
      })
      if (error) throw new Error(error.message || 'Edge function lỗi')
      if (!data?.ok) throw new Error(data?.error || 'Không tạo được tài khoản')
      return data as {
        ok: true; auth_user_id: string; email: string; temp_password: string;
        partner_code: string; partner_name: string; phone: string
      }
    },
    onSuccess: (res) => {
      message.success('Đã duyệt đại lý + tạo tài khoản')
      queryClient.invalidateQueries({ queryKey: ['partner-requests'] })
      setCredentialModal({
        partner_name: res.partner_name,
        partner_code: res.partner_code,
        phone: res.phone,
        email: res.email,
        temp_password: res.temp_password,
      })
    },
    onError: (err: Error) => message.error(err.message),
  })

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase
        .from('b2b_partners')
        .update({
          status: 'rejected',
          rejection_reason: reason,
          verified_at: new Date().toISOString(),
          verified_by: user?.employee_id || null,
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      message.success('Đã từ chối đại lý')
      setRejectId(null)
      setRejectReason('')
      queryClient.invalidateQueries({ queryKey: ['partner-requests'] })
    },
    onError: (err: Error) => message.error(err.message),
  })

  const columns = [
    {
      title: 'Tên đại lý',
      key: 'name',
      render: (_: any, r: any) => (
        <div>
          <Text strong style={{ cursor: 'pointer', color: '#1B4D3E' }} onClick={() => setDetailPartner(r)}>
            {r.name}
          </Text>
          {r.short_name && <div style={{ fontSize: 11, color: '#999' }}>{r.short_name}</div>}
        </div>
      ),
    },
    {
      title: 'Liên hệ',
      key: 'contact',
      render: (_: any, r: any) => {
        const dupes = (r.phone && duplicatesByPhone[r.phone]) || []
        return (
          <div style={{ fontSize: 12 }}>
            {r.phone && <div><PhoneOutlined /> {r.phone}</div>}
            {r.email && <div>{r.email}</div>}
            {dupes.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <Tag color="orange" icon={<WarningOutlined />} style={{ fontSize: 10 }}>
                  SĐT trùng {dupes.length} đại lý cũ
                </Tag>
                {dupes.slice(0, 2).map((d: any) => (
                  <div key={d.id} style={{ fontSize: 10, color: '#d97706' }}>
                    → {d.code} · {d.name} <Tag color="default" style={{ fontSize: 9, margin: 0 }}>{d.status}</Tag>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      },
    },
    {
      title: 'Địa chỉ',
      dataIndex: 'address',
      render: (v: string, r: any) => (
        <div style={{ fontSize: 12, maxWidth: 200 }}>
          {v || '—'}
          {r.province && <div style={{ color: '#999' }}>{r.district}, {r.province}</div>}
        </div>
      ),
    },
    {
      title: 'MST',
      dataIndex: 'tax_code',
      render: (v: string) => v || '—',
    },
    {
      title: 'Ngày đăng ký',
      dataIndex: 'created_at',
      render: (v: string) => v ? new Date(v).toLocaleDateString('vi-VN') : '—',
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 200,
      render: (_: any, r: any) => (
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<CheckCircleOutlined />}
            onClick={() => {
              Modal.confirm({
                title: 'Duyệt đại lý',
                content: `Xác nhận duyệt "${r.name}" thành đại lý chính thức?`,
                okText: 'Duyệt',
                onOk: () => approveMutation.mutateAsync(r.id),
              })
            }}
            style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
          >
            Duyệt
          </Button>
          <Button
            danger
            size="small"
            icon={<CloseCircleOutlined />}
            onClick={() => setRejectId(r.id)}
          >
            Từ chối
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>
          <UserOutlined /> Đại lý chờ duyệt
          {requests.length > 0 && <Tag color="red" style={{ marginLeft: 8 }}>{requests.length}</Tag>}
        </Title>
      </div>

      {/* B2B Section tabs */}
      <B2BSectionTabs tabs={PARTNER_TABS} active="partner-requests" />

      {duplicates.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`${duplicates.length} đại lý đã tồn tại có SĐT trùng với đăng ký mới`}
          description="Kiểm tra cột 'Liên hệ' — nếu thực sự là đại lý cũ đăng ký lại, gọi xác nhận rồi 'Từ chối' (giữ partner cũ). Nếu là chi nhánh / hộ kinh doanh khác → 'Duyệt' bình thường."
          style={{ marginBottom: 12, borderRadius: 8 }}
        />
      )}

      <Card style={{ borderRadius: 12 }}>
        <Table
          dataSource={requests}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 20 }}
          size="small"
          locale={{ emptyText: <Empty description="Không có đại lý chờ duyệt" /> }}
        />
      </Card>

      {/* Reject Modal */}
      <Modal
        open={!!rejectId}
        title="Từ chối đại lý"
        okText="Từ chối"
        cancelText="Hủy"
        okButtonProps={{ danger: true }}
        onOk={() => rejectId && rejectMutation.mutate({ id: rejectId, reason: rejectReason })}
        onCancel={() => { setRejectId(null); setRejectReason('') }}
      >
        <TextArea
          value={rejectReason}
          onChange={e => setRejectReason(e.target.value)}
          rows={3}
          placeholder="Lý do từ chối..."
        />
      </Modal>

      {/* Credential Modal — hiển thị password tạm sau khi duyệt */}
      <Modal
        open={!!credentialModal}
        title={
          <Space>
            <KeyOutlined style={{ color: '#16A34A' }} />
            <span>Tài khoản đại lý đã sẵn sàng</span>
          </Space>
        }
        footer={
          <Button type="primary" onClick={() => setCredentialModal(null)} style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}>
            Đóng
          </Button>
        }
        onCancel={() => setCredentialModal(null)}
        width={560}
        maskClosable={false}
      >
        {credentialModal && (() => {
          const zaloMessage = `Chào ${credentialModal.partner_name},
Tài khoản B2B Portal của bạn đã được duyệt.
Đăng nhập tại: https://b2b.huyanhrubber.vn
Email: ${credentialModal.email}
Mật khẩu tạm: ${credentialModal.temp_password}
(Hệ thống sẽ yêu cầu đổi mật khẩu sau lần đăng nhập đầu tiên)
— Đội Thu mua Huy Anh Rubber`
          return (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Alert
                type="success"
                message="Đã tạo auth.users + link partner_users. Đại lý có thể đăng nhập ngay."
                showIcon
              />
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="Đại lý">{credentialModal.partner_name} ({credentialModal.partner_code})</Descriptions.Item>
                <Descriptions.Item label="SĐT">{credentialModal.phone}</Descriptions.Item>
                <Descriptions.Item label="Email đăng nhập">
                  <Space>
                    <Text code style={{ fontSize: 13 }}>{credentialModal.email}</Text>
                    <Button
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => {
                        navigator.clipboard.writeText(credentialModal.email)
                        message.success('Đã copy email')
                      }}
                    />
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="Mật khẩu tạm">
                  <Space>
                    <Text code style={{ fontSize: 16, fontWeight: 700, color: '#DC2626', letterSpacing: 2 }}>
                      {credentialModal.temp_password}
                    </Text>
                    <Button
                      size="small"
                      type="primary"
                      icon={<CopyOutlined />}
                      onClick={() => {
                        navigator.clipboard.writeText(credentialModal.temp_password)
                        message.success('Đã copy password')
                      }}
                      style={{ background: '#DC2626', borderColor: '#DC2626' }}
                    >
                      Copy
                    </Button>
                  </Space>
                </Descriptions.Item>
              </Descriptions>
              <div>
                <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
                  Tin nhắn gửi đại lý qua Zalo / SMS:
                </Text>
                <Input.TextArea
                  value={zaloMessage}
                  readOnly
                  rows={6}
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                />
                <Button
                  block
                  type="default"
                  icon={<CopyOutlined />}
                  onClick={() => {
                    navigator.clipboard.writeText(zaloMessage)
                    message.success('Đã copy tin nhắn')
                  }}
                  style={{ marginTop: 8 }}
                >
                  Copy tin nhắn
                </Button>
              </div>
              <Alert
                type="warning"
                message="Sau khi đóng modal này, KHÔNG xem lại được mật khẩu tạm. Vui lòng copy + gửi ngay."
                showIcon
              />
            </Space>
          )
        })()}
      </Modal>

      {/* Detail Modal */}
      <Modal
        open={!!detailPartner}
        title={detailPartner?.name || 'Chi tiết đại lý'}
        footer={null}
        onCancel={() => setDetailPartner(null)}
        width={600}
      >
        {detailPartner && (
          <Descriptions column={2} size="small">
            <Descriptions.Item label="Tên">{detailPartner.name}</Descriptions.Item>
            <Descriptions.Item label="Tên ngắn">{detailPartner.short_name || '—'}</Descriptions.Item>
            <Descriptions.Item label="Loại">{detailPartner.partner_type || '—'}</Descriptions.Item>
            <Descriptions.Item label="Quốc gia">{detailPartner.country || 'VN'}</Descriptions.Item>
            <Descriptions.Item label="MST">{detailPartner.tax_code || '—'}</Descriptions.Item>
            <Descriptions.Item label="Người đại diện">{detailPartner.legal_representative || '—'}</Descriptions.Item>
            <Descriptions.Item label="Điện thoại">{detailPartner.phone || '—'}</Descriptions.Item>
            <Descriptions.Item label="Email">{detailPartner.email || '—'}</Descriptions.Item>
            <Descriptions.Item label="Địa chỉ" span={2}>{detailPartner.address || '—'}</Descriptions.Item>
            <Descriptions.Item label="Tỉnh/TP">{detailPartner.province || '—'}</Descriptions.Item>
            <Descriptions.Item label="Quận/Huyện">{detailPartner.district || '—'}</Descriptions.Item>
            <Descriptions.Item label="Ngân hàng">{detailPartner.bank_name || '—'}</Descriptions.Item>
            <Descriptions.Item label="STK">{detailPartner.bank_account || '—'}</Descriptions.Item>
            <Descriptions.Item label="Chi nhánh">{detailPartner.bank_branch || '—'}</Descriptions.Item>
            <Descriptions.Item label="Ghi chú" span={2}>{detailPartner.notes || '—'}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  )
}
