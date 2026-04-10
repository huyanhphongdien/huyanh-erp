// ============================================================================
// PARTNER REQUESTS PAGE — Duyệt đại lý đăng ký mới
// File: src/pages/b2b/partners/PartnerRequestsPage.tsx
// Admin xem danh sách đại lý pending → duyệt / từ chối
// ============================================================================

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Card, Table, Tag, Button, Space, Typography, Empty, Modal, Input, message, Descriptions, Spin,
} from 'antd'
import {
  CheckCircleOutlined, CloseCircleOutlined, ArrowLeftOutlined,
  UserOutlined, PhoneOutlined, BankOutlined, EnvironmentOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../stores/authStore'

const { Title, Text } = Typography
const { TextArea } = Input

export default function PartnerRequestsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [detailPartner, setDetailPartner] = useState<any>(null)

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

  const approveMutation = useMutation({
    mutationFn: async (partnerId: string) => {
      const { error } = await supabase
        .from('b2b_partners')
        .update({
          status: 'active',
          is_active: true,
          verified_at: new Date().toISOString(),
          verified_by: user?.employee_id || null,
        })
        .eq('id', partnerId)
      if (error) throw error
    },
    onSuccess: () => {
      message.success('Đã duyệt đại lý')
      queryClient.invalidateQueries({ queryKey: ['partner-requests'] })
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
      render: (_: any, r: any) => (
        <div style={{ fontSize: 12 }}>
          {r.phone && <div><PhoneOutlined /> {r.phone}</div>}
          {r.email && <div>{r.email}</div>}
        </div>
      ),
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/b2b/partners')} />
        <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>
          <UserOutlined /> Đại lý chờ duyệt
          {requests.length > 0 && <Tag color="red" style={{ marginLeft: 8 }}>{requests.length}</Tag>}
        </Title>
      </div>

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
