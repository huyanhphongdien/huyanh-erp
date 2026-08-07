// ============================================================================
// CUSTOMER DOC-SET HISTORY TAB — Lịch sử bộ chứng từ theo KHÁCH HÀNG
// File: src/pages/sales/components/CustomerDocSetHistoryTab.tsx
//
// Tổng hợp mọi đơn của 1 khách + tiến độ bộ chứng từ (đủ/thiếu) + trạng thái
// "đã hoàn thiện" (ai đánh dấu, lúc nào). Mở nhanh trang Sinh/Đính kèm chứng từ.
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Table, Tag, Button, Space, Typography, Progress, Tooltip, Switch,
  message, Empty, Spin, Popconfirm, Card, Row, Col, Statistic,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  FolderOpenOutlined, CheckCircleOutlined, FileDoneOutlined,
  ClockCircleOutlined, FileProtectOutlined,
} from '@ant-design/icons'
import { supabase } from '../../../lib/supabase'
import { salesDocumentUploadService } from '../../../services/sales/salesDocumentUploadService'
import { useAuthStore } from '../../../stores/authStore'
import { getSalesRole } from '../../../services/sales/salesPermissionService'
import {
  ORDER_STATUS_LABELS, ORDER_STATUS_COLORS,
  type SalesOrderStatus,
} from '../../../services/sales/salesTypes'

const { Text, Title } = Typography

interface DocStat { total: number; received: number; uploaded: number }
interface OrderRow {
  id: string
  code: string | null
  contract_no: string | null
  order_date: string | null
  status: SalesOrderStatus
  grade: string | null
  quantity_tons: number | null
  total_value_usd: number | null
  doc_set_completed_at: string | null
  doc_set_completed_by: string | null
  stats: DocStat
}

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('vi-VN') : '-'
const fmtDateTime = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString('vi-VN') : '-'
const fmtUSD = (v: number | null | undefined) =>
  v ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v) : '-'

export default function CustomerDocSetHistoryTab({ customerId }: { customerId: string }) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const role = getSalesRole(user)
  const canMark = role === 'admin' || role === 'accounting' || role === 'sale' || role === 'logistics'

  const [rows, setRows] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [onlyCompleted, setOnlyCompleted] = useState(false)
  const [marking, setMarking] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('sales_orders')
        .select('id, code, contract_no, order_date, status, grade, quantity_tons, total_value_usd, doc_set_completed_at, doc_set_completed_by')
        .eq('customer_id', customerId)
        .order('order_date', { ascending: false })
      if (error) throw error
      const orders = (data || []).filter(
        (o: any) => o.status !== 'draft' && o.status !== 'cancelled',
      )
      const stats = await salesDocumentUploadService.getStatsForOrders(orders.map((o: any) => o.id))
      setRows(orders.map((o: any) => ({
        ...o,
        stats: stats[o.id] || { total: 0, received: 0, uploaded: 0 },
      })))
    } catch (e: any) {
      message.error(e?.message || 'Lỗi tải lịch sử chứng từ')
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => { load() }, [load])

  const handleMark = async (row: OrderRow, completed: boolean) => {
    setMarking(row.id)
    const byName = (user as any)?.full_name || (user as any)?.email || 'N/A'
    const ok = await salesDocumentUploadService.setDocSetCompleted(row.id, completed, byName)
    setMarking(null)
    if (ok) {
      message.success(completed ? 'Đã đánh dấu bộ chứng từ hoàn thiện' : 'Đã bỏ đánh dấu hoàn thiện')
      load()
    } else {
      message.error('Không lưu được trạng thái')
    }
  }

  const shown = onlyCompleted ? rows.filter(r => r.doc_set_completed_at) : rows
  const completedCount = rows.filter(r => r.doc_set_completed_at).length

  const columns: ColumnsType<OrderRow> = [
    {
      title: 'Số HĐ / Mã đơn',
      key: 'code',
      render: (_, r) => (
        <div>
          <Button type="link" style={{ padding: 0, height: 'auto', fontWeight: 600 }}
            onClick={() => navigate(`/sales/orders/${r.id}/documents`)}>
            {r.contract_no || r.code || '—'}
          </Button>
          {r.contract_no && r.code && (
            <div><Text type="secondary" style={{ fontSize: 11 }}>{r.code}</Text></div>
          )}
        </div>
      ),
    },
    {
      title: 'Ngày',
      dataIndex: 'order_date',
      key: 'order_date',
      width: 100,
      render: (d) => fmtDate(d),
    },
    {
      title: 'Grade / KL',
      key: 'grade',
      width: 130,
      render: (_, r) => (
        <Space size={4} wrap>
          {r.grade ? <Tag color="blue" style={{ margin: 0 }}>{r.grade}</Tag> : null}
          {r.quantity_tons != null && <Text style={{ fontSize: 12 }}>{r.quantity_tons.toFixed(1)}t</Text>}
        </Space>
      ),
    },
    {
      title: 'Trạng thái đơn',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (s: SalesOrderStatus) => (
        <Tag color={ORDER_STATUS_COLORS[s]}>{ORDER_STATUS_LABELS[s]}</Tag>
      ),
    },
    {
      title: 'Bộ chứng từ',
      key: 'docs',
      width: 180,
      render: (_, r) => {
        const { total, received } = r.stats
        if (total === 0) return <Tag>Chưa khởi tạo</Tag>
        const pct = Math.round((received / total) * 100)
        return (
          <Tooltip title={`${received}/${total} chứng từ đã nhận`}>
            <div style={{ minWidth: 140 }}>
              <Progress percent={pct} size="small"
                status={pct === 100 ? 'success' : 'active'}
                format={() => `${received}/${total}`} />
            </div>
          </Tooltip>
        )
      },
    },
    {
      title: 'Hoàn thiện',
      key: 'completed',
      width: 200,
      render: (_, r) => {
        if (r.doc_set_completed_at) {
          return (
            <Space direction="vertical" size={0}>
              <Tag icon={<CheckCircleOutlined />} color="success" style={{ margin: 0 }}>Đã hoàn thiện</Tag>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {r.doc_set_completed_by || '?'} · {fmtDateTime(r.doc_set_completed_at)}
              </Text>
              {canMark && (
                <Popconfirm title="Bỏ đánh dấu hoàn thiện?" okText="Bỏ" cancelText="Hủy"
                  onConfirm={() => handleMark(r, false)}>
                  <Button type="link" size="small" danger style={{ padding: 0, height: 'auto' }}
                    loading={marking === r.id}>Bỏ đánh dấu</Button>
                </Popconfirm>
              )}
            </Space>
          )
        }
        return canMark ? (
          <Popconfirm title="Đánh dấu bộ chứng từ đơn này ĐÃ hoàn thiện?"
            okText="Hoàn thiện" cancelText="Hủy" onConfirm={() => handleMark(r, true)}>
            <Button size="small" icon={<FileProtectOutlined />} loading={marking === r.id}>
              Đánh dấu hoàn thiện
            </Button>
          </Popconfirm>
        ) : <Tag icon={<ClockCircleOutlined />}>Đang làm</Tag>
      },
    },
    {
      title: '',
      key: 'action',
      width: 130,
      render: (_, r) => (
        <Button type="primary" size="small" icon={<FolderOpenOutlined />}
          onClick={() => navigate(`/sales/orders/${r.id}/documents`)}
          style={{ background: '#1B4D3E', borderColor: '#1B4D3E', color: '#fff' }}>
          Mở bộ chứng từ
        </Button>
      ),
    },
  ]

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin tip="Đang tải..." /></div>

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small"><Statistic title="Tổng đơn" value={rows.length} prefix={<FileDoneOutlined />} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="Bộ hoàn thiện" value={completedCount} suffix={`/ ${rows.length}`}
              valueStyle={{ color: completedCount > 0 ? '#52c41a' : undefined }}
              prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <Space>
            <Text type="secondary">Chỉ hiện đã hoàn thiện</Text>
            <Switch checked={onlyCompleted} onChange={setOnlyCompleted} />
          </Space>
        </Col>
      </Row>

      <Card size="small" bodyStyle={{ padding: 0 }}>
        <Title level={5} style={{ margin: 0, padding: '12px 16px' }}>
          <FileProtectOutlined /> Lịch sử bộ chứng từ xuất khẩu
        </Title>
        <Table
          rowKey="id"
          dataSource={shown}
          columns={columns}
          size="middle"
          pagination={{ pageSize: 15, hideOnSinglePage: true }}
          locale={{ emptyText: <Empty description="Chưa có bộ chứng từ nào" /> }}
        />
      </Card>

      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
        💡 Mỗi bộ chứng từ gắn với 1 đơn hàng. Bấm <b>"Mở bộ chứng từ"</b> để sinh/đính kèm & tải file.
        Đánh dấu <b>"Hoàn thiện"</b> khi bộ đã đủ để lưu lịch sử (ghi rõ ai làm, lúc nào).
      </Text>
    </div>
  )
}
