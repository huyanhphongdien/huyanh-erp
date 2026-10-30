// ============================================================================
// KHO NGUYÊN LIỆU MỦ — Kiểm kê: danh sách + tạo phiếu (GĐ3)
// File: src/pages/wms/raw/RawStocktakeListPage.tsx · Route: /wms/nvl/kiem-ke
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Col, DatePicker, Input, Modal, Row, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ArrowLeftOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import FacilityPicker from '../../../components/wms/FacilityPicker'
import { rawStocktakeService, RAW_STOCKTAKE_STATUS_COLORS, RAW_STOCKTAKE_STATUS_LABELS, type RawStocktake } from '../../../services/wms/rawStocktakeService'
import { useActiveFacilities } from '../../../hooks/useActiveFacilities'
import { useRawRole } from '../../../hooks/useRawRole'

const { Title, Text } = Typography
const fmtKg = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: 0 }))
const fmtSigned = (n: number | null | undefined) => (n === null || n === undefined ? '—' : (n > 0 ? '+' : '') + fmtKg(n))

export default function RawStocktakeListPage() {
  const navigate = useNavigate()
  const rawRole = useRawRole()
  const { data: facilities } = useActiveFacilities()
  const [facilityId, setFacilityId] = useState<string | undefined>(undefined)
  const [facilityInit, setFacilityInit] = useState(false)
  const [rows, setRows] = useState<RawStocktake[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [ngay, setNgay] = useState(dayjs())
  const [note, setNote] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (facilityInit || !facilities?.length) return
    const pd = facilities.find((f) => f.code.toUpperCase() === 'PD')
    if (pd) setFacilityId(pd.id)
    setFacilityInit(true)
  }, [facilities, facilityInit])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setRows(await rawStocktakeService.list(facilityId)) }
    catch (e: any) { setError(e?.message || 'Không tải được danh sách kiểm kê') }
    finally { setLoading(false) }
  }, [facilityId])

  useEffect(() => { load() }, [load])

  const create = async () => {
    if (!facilityId) { message.warning('Chọn nhà máy'); return }
    setCreating(true)
    try {
      const id = await rawStocktakeService.create(facilityId, ngay.format('YYYY-MM-DD'), note.trim() || null)
      message.success('Đã tạo phiếu kiểm kê, chụp sổ mọi lô còn hàng')
      setOpen(false); navigate(`/wms/nvl/kiem-ke/${id}`)
    } catch (e: any) { message.error(e?.message || 'Không tạo được') }
    finally { setCreating(false) }
  }

  const columns: ColumnsType<RawStocktake> = [
    { title: 'Phiếu', dataIndex: 'code', key: 'code', render: (v, r) => <a onClick={() => navigate(`/wms/nvl/kiem-ke/${r.id}`)}><Text code strong>{v}</Text></a> },
    { title: 'Ngày kiểm kê', dataIndex: 'ngay_kiem_ke', key: 'ngay_kiem_ke', render: (v) => dayjs(v).format('DD/MM/YYYY') },
    { title: 'Lô', dataIndex: 'so_lo', key: 'so_lo', align: 'right', render: (v, r) => r.so_lo_chua_dem > 0 ? <span>{v} <Text type="warning">({r.so_lo_chua_dem} chưa đếm)</Text></span> : v },
    { title: 'Sổ khô (kg)', dataIndex: 'book_dry_kg', key: 'book_dry_kg', align: 'right', render: (v) => fmtKg(v) },
    { title: 'Đếm khô (kg)', dataIndex: 'counted_dry_kg', key: 'counted_dry_kg', align: 'right', render: (v) => fmtKg(v) },
    { title: 'Chênh khô', dataIndex: 'chenh_kho_kg', key: 'chenh_kho_kg', align: 'right', render: (v, r) => <Text strong type={r.so_lo_lech > 0 ? 'danger' : undefined}>{fmtSigned(v)}</Text> },
    { title: 'Lô lệch', dataIndex: 'so_lo_lech', key: 'so_lo_lech', align: 'right', render: (v) => v > 0 ? <Tag color="red">{v}</Tag> : <Text type="secondary">0</Text> },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (v: RawStocktake['status'], r) => <Space direction="vertical" size={0}><Tag color={RAW_STOCKTAKE_STATUS_COLORS[v]}>{RAW_STOCKTAKE_STATUS_LABELS[v]}</Tag>{r.approved_name && <Text type="secondary" style={{ fontSize: 11 }}>{r.approved_name}</Text>}</Space> },
  ]

  return (
    <div style={{ padding: 16, background: '#f5f5f5', minHeight: '100%' }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Row justify="space-between" align="middle" gutter={[12, 12]}>
          <Col>
            <Space align="center">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/nvl')} />
              <div>
                <Title level={3} style={{ margin: 0 }}>Kiểm kê kho nguyên liệu</Title>
                <Text type="secondary">Tạo phiếu = chụp sổ mọi lô còn hàng · thủ kho đếm từng lô · BGĐ duyệt thì ghi điều chỉnh vào sổ và khóa kỳ</Text>
              </div>
            </Space>
          </Col>
          <Col>
            <Space wrap>
              <FacilityPicker value={facilityId} onChange={setFacilityId} allowAll={false} style={{ minWidth: 180 }} />
              <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Làm mới</Button>
              <Button type="primary" icon={<PlusOutlined />} disabled={!rawRole.perms.receive} onClick={() => setOpen(true)}>Tạo phiếu kiểm kê</Button>
            </Space>
          </Col>
        </Row>
        {error && <Alert type="error" showIcon message={error} description="Kiểm tra đã chạy migration wms_nvl_p3_kiem_ke_can_doi.sql chưa." />}
        <Card size="small" bodyStyle={{ padding: 0 }}>
          <Table<RawStocktake> rowKey="id" columns={columns} dataSource={rows} size="small" loading={loading} pagination={{ pageSize: 20, showSizeChanger: false }} />
        </Card>
      </Space>
      <Modal open={open} title="Tạo phiếu kiểm kê" onCancel={() => setOpen(false)} onOk={create} okText="Tạo" cancelText="Hủy" confirmLoading={creating}>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Text type="secondary">Phiếu sẽ chụp số sổ của mọi lô còn hàng tại {facilities?.find((f) => f.id === facilityId)?.code ?? 'nhà máy'}. Một nhà máy chỉ mở một phiếu tại một thời điểm.</Text>
          <div><Text>Ngày kiểm kê</Text><DatePicker value={ngay} onChange={(d) => d && setNgay(d)} format="DD/MM/YYYY" style={{ width: '100%' }} /></div>
          <div><Text>Ghi chú</Text><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Kiểm kê cuối tháng…" /></div>
        </Space>
      </Modal>
    </div>
  )
}
