// ============================================================================
// KHO NGUYÊN LIỆU MỦ — Chi tiết lô (GĐ1)
// File: src/pages/wms/raw/RawBatchDetailPage.tsx
// Route: /wms/nvl/lo/:batchId
// Lúc nhập · hiện tại · chênh lệch (ướt / khô) · sổ kho khô của lô
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, Card, Col, Descriptions, Empty, Row, Space, Spin, Statistic, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ArrowLeftOutlined, PrinterOutlined, ReloadOutlined } from '@ant-design/icons'
import { rawStockService, RAW_TXN_LABELS, type RawBatchBalance, type RawLedgerRow } from '../../../services/wms/rawStockService'
import { rawSettingsService } from '../../../services/wms/rawSettingsService'
import { RAW_LOT_SOURCE_LABELS, RAW_RUBBER_GROUP_LABELS, RAW_SETTINGS_DEFAULT, type RawSettings } from '../../../services/wms/raw.types'

const { Title, Text } = Typography

const fmtKg = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: digits, minimumFractionDigits: digits })
const fmtPct = (n: number | null | undefined, digits = 1) => (n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: digits, minimumFractionDigits: digits }) + ' %')
const fmtSigned = (n: number, digits = 0) => (n > 0 ? '+' : '') + fmtKg(n, digits)
const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('vi-VN') : '—')

export default function RawBatchDetailPage() {
  const { batchId } = useParams<{ batchId: string }>()
  const navigate = useNavigate()
  const [batch, setBatch] = useState<RawBatchBalance | null>(null)
  const [ledger, setLedger] = useState<RawLedgerRow[]>([])
  const [settings, setSettings] = useState<RawSettings>(RAW_SETTINGS_DEFAULT)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!batchId) return
    setLoading(true); setError(null)
    try {
      const [b, l] = await Promise.all([rawStockService.getBatch(batchId), rawStockService.getLedger(batchId)])
      setBatch(b); setLedger(l)
      if (b) setSettings(await rawSettingsService.getForFacility(b.facility_id))
    } catch (e: any) {
      setError(e?.message || 'Không tải được lô')
    } finally { setLoading(false) }
  }, [batchId])

  useEffect(() => { load() }, [load])

  const opening = useMemo(() => ledger.find((r) => ['in', 'opening', 'in_transfer'].includes(r.txn_type)) ?? null, [ledger])

  const diff = useMemo(() => {
    if (!batch || !opening) return null
    const wet = batch.wet_kg - opening.wet_kg
    const dry = batch.dry_kg - opening.dry_kg
    return {
      wet, wetPct: opening.wet_kg > 0 ? (100 * wet) / opening.wet_kg : 0,
      dry, dryPct: opening.dry_kg > 0 ? (100 * dry) / opening.dry_kg : 0,
    }
  }, [batch, opening])

  const dryOverThreshold = diff ? Math.abs(diff.dryPct) > settings.nguong_lech_kho_pct : false

  const columns: ColumnsType<RawLedgerRow> = [
    { title: 'Ngày', dataIndex: 'txn_date', key: 'txn_date', width: 110, render: (v) => fmtDate(v) },
    { title: 'Nghiệp vụ', dataIndex: 'txn_type', key: 'txn_type', render: (v: RawLedgerRow['txn_type']) => <Tag color={v.startsWith('out') ? 'orange' : v.endsWith('adjust') ? 'gold' : 'green'}>{RAW_TXN_LABELS[v] ?? v}</Tag> },
    { title: 'Ướt (kg)', dataIndex: 'wet_kg', key: 'wet_kg', align: 'right', render: (v) => fmtSigned(v) },
    { title: 'DRC', dataIndex: 'drc_pct', key: 'drc_pct', align: 'right', render: (v) => fmtPct(v) },
    { title: 'Khô (kg)', dataIndex: 'dry_kg', key: 'dry_kg', align: 'right', render: (v) => <Text strong>{fmtSigned(v)}</Text> },
    { title: 'Ghi chú', dataIndex: 'note', key: 'note', ellipsis: true, render: (v) => v || <Text type="secondary">—</Text> },
  ]

  if (loading) return <div style={{ padding: 48, textAlign: 'center' }}><Spin /></div>
  if (error) return <div style={{ padding: 16 }}><Alert type="error" showIcon message={error} /></div>
  if (!batch) return <div style={{ padding: 16 }}><Empty description="Không tìm thấy lô trong sổ kho khô" /><Button style={{ marginTop: 12 }} onClick={() => navigate('/wms/nvl')}>Về tổng quan</Button></div>

  const qua_tuoi = batch.tuoi_ngay > settings.tuoi_lo_canh_bao_ngay
  const den_han_can_lai = batch.nhom === 'mu_tho' && batch.ngay_tu_lan_do >= settings.chu_ky_can_lai_ngay

  return (
    <div style={{ padding: 16, background: '#f5f5f5', minHeight: '100%' }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Row justify="space-between" align="middle" gutter={[12, 12]}>
          <Col>
            <Space align="center">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/nvl')} />
              <div>
                <Space size={8} wrap>
                  <Title level={3} style={{ margin: 0, fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{batch.batch_no}</Title>
                  <Tag color={batch.dry_kg > 0.005 ? 'green' : 'default'}>{batch.dry_kg > 0.005 ? 'Đang tồn' : 'Đã hết'}</Tag>
                  <Tag>{batch.rubber_type_name}</Tag>
                  <Tag>{RAW_RUBBER_GROUP_LABELS[batch.nhom]}</Tag>
                  {batch.nguon_hang && <Tag>{RAW_LOT_SOURCE_LABELS[batch.nguon_hang]}</Tag>}
                  <Tag color={qua_tuoi ? 'red' : 'default'}>Tuổi {batch.tuoi_ngay} ngày</Tag>
                  {batch.ton_dau_uoc && <Tag color="gold">Tồn đầu ước</Tag>}
                  {batch.qc_status === 'pending' && <Tag color="orange">Chờ QC</Tag>}
                </Space>
                <div><Text type="secondary">{batch.facility_code ? `Nhà máy ${batch.facility_code}` : ''}{batch.supplier_name ? ` · ${batch.supplier_name}` : ''} · nhập {fmtDate(batch.received_date)}</Text></div>
              </div>
            </Space>
          </Col>
          <Col>
            <Space wrap>
              <Button icon={<ReloadOutlined />} onClick={load}>Làm mới</Button>
              <Button icon={<PrinterOutlined />} onClick={() => navigate(`/wms/batch/${batch.batch_id}/label`)}>In tem QR</Button>
              <Button onClick={() => navigate('/wms/nvl/can-lai')}>Cân lại / DRC</Button>
              <Button type="primary" onClick={() => navigate('/wms/nvl/xuat/new')} disabled={batch.dry_kg <= 0.005}>Xuất cho sản xuất</Button>
              {batch.weighbridge_ticket_id && <Button onClick={() => navigate(`/wms/weighbridge/${batch.weighbridge_ticket_id}`)}>Phiếu cân gốc</Button>}
            </Space>
          </Col>
        </Row>

        {den_han_can_lai && <Alert type="warning" showIcon message={`Đã ${batch.ngay_tu_lan_do} ngày kể từ lần đo gần nhất (chu kỳ ${settings.chu_ky_can_lai_ngay} ngày) — cân lại và lấy mẫu DRC.`} action={<Button size="small" onClick={() => navigate('/wms/nvl/can-lai')}>Cân lại</Button>} />}

        <Row gutter={[12, 12]}>
          <Col xs={24} md={8}>
            <Card size="small" title={`Lúc nhập · ${fmtDate(opening?.txn_date)}`}>
              <Row gutter={8}>
                <Col span={8}><Statistic title="Ướt" value={fmtKg(opening?.wet_kg)} suffix="kg" valueStyle={{ fontSize: 18 }} /></Col>
                <Col span={8}><Statistic title="DRC" value={fmtPct(opening?.drc_pct)} valueStyle={{ fontSize: 18 }} /></Col>
                <Col span={8}><Statistic title="Khô" value={fmtKg(opening?.dry_kg)} suffix="kg" valueStyle={{ fontSize: 18, fontWeight: 700, color: '#1B4D3E' }} /></Col>
              </Row>
              <Text type="secondary" style={{ fontSize: 12 }}>{opening ? RAW_TXN_LABELS[opening.txn_type] : 'Chưa có dòng nhập'}{opening?.note ? ` · ${opening.note}` : ''}</Text>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small" title={`Hiện tại · cập nhật ${fmtDate(batch.cap_nhat)}`}>
              <Row gutter={8}>
                <Col span={8}><Statistic title="Ướt" value={fmtKg(batch.wet_kg)} suffix="kg" valueStyle={{ fontSize: 18 }} /></Col>
                <Col span={8}><Statistic title="DRC" value={fmtPct(batch.drc_pct)} valueStyle={{ fontSize: 18 }} /></Col>
                <Col span={8}><Statistic title="Khô" value={fmtKg(batch.dry_kg)} suffix="kg" valueStyle={{ fontSize: 18, fontWeight: 700, color: '#1B4D3E' }} /></Col>
              </Row>
              <Text type="secondary" style={{ fontSize: 12 }}>{batch.ngay_can_lai ? `Cân lại gần nhất ${fmtDate(batch.ngay_can_lai)}` : 'Chưa cân lại lần nào'} · {batch.so_dong_so} dòng sổ</Text>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small" title="Chênh lệch so với lúc nhập" style={{ borderColor: dryOverThreshold ? '#DC2626' : '#2D8B6E', background: dryOverThreshold ? '#FEF2F2' : '#E8F5F0' }}>
              {diff ? (
                <>
                  <Row gutter={8}>
                    <Col span={12}><Statistic title="Ướt" value={`${fmtSigned(diff.wet)} kg`} valueStyle={{ fontSize: 18 }} /><Text type="secondary" style={{ fontSize: 12 }}>{fmtSigned(diff.wetPct, 1)} %</Text></Col>
                    <Col span={12}><Statistic title="Khô" value={`${fmtSigned(diff.dry)} kg`} valueStyle={{ fontSize: 18, color: dryOverThreshold ? '#B91C1C' : '#15803D' }} /><Text type="secondary" style={{ fontSize: 12 }}>{fmtSigned(diff.dryPct, 2)} %</Text></Col>
                  </Row>
                  <Text style={{ fontSize: 12 }}>{dryOverThreshold ? `Khô lệch quá ngưỡng ${settings.nguong_lech_kho_pct} % — phải ghi nguyên nhân` : `Khô trong ngưỡng ±${settings.nguong_lech_kho_pct} % · hao ướt là khô tự nhiên`}</Text>
                </>
              ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa đủ dữ liệu" />}
            </Card>
          </Col>
        </Row>

        <Card size="small" title="Sổ kho khô của lô">
          <Table<RawLedgerRow> rowKey="id" columns={columns} dataSource={ledger} size="small" pagination={false}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={2}><Text strong>Tồn</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right"><Text strong>{fmtKg(batch.wet_kg)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right"><Text strong>{fmtPct(batch.drc_pct)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right"><Text strong>{fmtKg(batch.dry_kg)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={5} />
              </Table.Summary.Row>
            )} />
        </Card>

        <Card size="small" title="Thông tin lô">
          <Descriptions size="small" column={{ xs: 1, md: 2, xl: 3 }} colon={false} labelStyle={{ color: '#6B7280' }}>
            <Descriptions.Item label="Mã lô">{batch.batch_no}</Descriptions.Item>
            <Descriptions.Item label="Nhà máy">{batch.facility_code || '—'}</Descriptions.Item>
            <Descriptions.Item label="Loại hàng">{batch.rubber_type_name} ({batch.rubber_type})</Descriptions.Item>
            <Descriptions.Item label="Nguồn">{batch.nguon_hang ? RAW_LOT_SOURCE_LABELS[batch.nguon_hang] : '—'}</Descriptions.Item>
            <Descriptions.Item label="Nhà cung cấp">{batch.supplier_name || '—'}</Descriptions.Item>
            <Descriptions.Item label="Phiếu cân">{batch.weighbridge_ticket_id ? <a onClick={() => navigate(`/wms/weighbridge/${batch.weighbridge_ticket_id}`)}>mở phiếu{batch.ticket_line_no ? ` · dòng ${batch.ticket_line_no}` : ''}</a> : 'tồn đầu mở sổ'}</Descriptions.Item>
            <Descriptions.Item label="Ngày nhập">{fmtDate(batch.received_date)}</Descriptions.Item>
            <Descriptions.Item label="QC">{batch.qc_status || '—'}</Descriptions.Item>
            <Descriptions.Item label="Trạng thái lô">{batch.batch_status}</Descriptions.Item>
          </Descriptions>
        </Card>
      </Space>
    </div>
  )
}
