// ============================================================================
// KHO NGUYÊN LIỆU MỦ — Danh sách lệnh xuất (GĐ2)
// File: src/pages/wms/raw/RawIssueListPage.tsx · Route: /wms/nvl/xuat
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Col, Row, Select, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ArrowLeftOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import FacilityPicker from '../../../components/wms/FacilityPicker'
import { rawIssueService, RAW_ISSUE_PURPOSE_LABELS, RAW_ISSUE_STATUS_COLORS, RAW_ISSUE_STATUS_LABELS, type RawIssueOrder, type RawIssueStatus } from '../../../services/wms/rawIssueService'
import { useActiveFacilities } from '../../../hooks/useActiveFacilities'

const { Title, Text } = Typography
const fmtKg = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: 0 }))
const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—')

export default function RawIssueListPage() {
  const navigate = useNavigate()
  const { data: facilities } = useActiveFacilities()
  const [facilityId, setFacilityId] = useState<string | undefined>(undefined)
  const [facilityInit, setFacilityInit] = useState(false)
  const [status, setStatus] = useState<RawIssueStatus | 'open' | 'all'>('open')
  const [rows, setRows] = useState<RawIssueOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (facilityInit || !facilities?.length) return
    const pd = facilities.find((f) => f.code.toUpperCase() === 'PD')
    if (pd) setFacilityId(pd.id)
    setFacilityInit(true)
  }, [facilities, facilityInit])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setRows(await rawIssueService.list({ facilityId, status: status === 'all' ? null : status })) }
    catch (e: any) { setError(e?.message || 'Không tải được danh sách lệnh xuất') }
    finally { setLoading(false) }
  }, [facilityId, status])

  useEffect(() => { load() }, [load])

  const columns: ColumnsType<RawIssueOrder> = [
    { title: 'Lệnh', dataIndex: 'code', key: 'code', render: (v, r) => <a onClick={() => navigate(`/wms/nvl/xuat/${r.id}`)}><Text code strong>{v}</Text></a> },
    { title: 'Ngày', dataIndex: 'created_at', key: 'created_at', render: (v) => fmtTime(v) },
    { title: 'Mục đích', dataIndex: 'muc_dich', key: 'muc_dich', render: (v: RawIssueOrder['muc_dich']) => RAW_ISSUE_PURPOSE_LABELS[v] },
    { title: 'Lệnh SX', dataIndex: 'production_code', key: 'production_code', render: (v, r) => v ? <span><Text code>{v}</Text>{r.production_grade && <Tag style={{ marginLeft: 6 }}>{r.production_grade}</Tag>}</span> : <Text type="secondary">—</Text> },
    { title: 'Lô', dataIndex: 'so_dong', key: 'so_dong', align: 'right' },
    { title: 'KH khô (kg)', dataIndex: 'planned_dry_kg', key: 'planned_dry_kg', align: 'right', render: (v) => fmtKg(v) },
    { title: 'Cân thực ướt', dataIndex: 'actual_wet_kg', key: 'actual_wet_kg', align: 'right', render: (v, r) => r.so_dong_chua_can > 0 ? <Text type="warning">{r.so_dong_chua_can} dòng chưa cân</Text> : fmtKg(v) },
    { title: 'Trừ sổ khô', dataIndex: 'actual_dry_kg', key: 'actual_dry_kg', align: 'right', render: (v, r) => r.status === 'received' ? <Text strong>{fmtKg(v)}</Text> : <Text type="secondary">—</Text> },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (v: RawIssueStatus) => <Tag color={RAW_ISSUE_STATUS_COLORS[v]}>{RAW_ISSUE_STATUS_LABELS[v]}</Tag> },
  ]

  return (
    <div style={{ padding: 16, background: '#f5f5f5', minHeight: '100%' }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Row justify="space-between" align="middle" gutter={[12, 12]}>
          <Col>
            <Space align="center">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/nvl')} />
              <div>
                <Title level={3} style={{ margin: 0 }}>Xuất kho nguyên liệu</Title>
                <Text type="secondary">Lệnh xuất cho sản xuất · gợi ý FIFO · cân thực tế khi lấy khỏi kho · ba chữ ký, thủ kho nhận mới trừ sổ</Text>
              </div>
            </Space>
          </Col>
          <Col>
            <Space wrap>
              <FacilityPicker value={facilityId} onChange={setFacilityId} allowAll placeholder="Tất cả nhà máy" style={{ minWidth: 180 }} />
              <Select value={status} onChange={setStatus} style={{ minWidth: 170 }}
                options={[{ value: 'open', label: 'Đang xử lý' }, { value: 'received', label: 'Đã trừ sổ' }, { value: 'cancelled', label: 'Đã hủy' }, { value: 'all', label: 'Tất cả' }]} />
              <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Làm mới</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/wms/nvl/xuat/new')}>Tạo lệnh xuất</Button>
            </Space>
          </Col>
        </Row>
        {error && <Alert type="error" showIcon message={error} description="Kiểm tra đã chạy migration wms_nvl_p2_lenh_xuat_can_lai.sql chưa." />}
        <Card size="small" bodyStyle={{ padding: 0 }}>
          <Table<RawIssueOrder> rowKey="id" columns={columns} dataSource={rows} size="small" loading={loading} pagination={{ pageSize: 20, showSizeChanger: false }} />
        </Card>
      </Space>
    </div>
  )
}
