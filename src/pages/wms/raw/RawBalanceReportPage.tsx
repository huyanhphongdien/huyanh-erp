// ============================================================================
// KHO NGUYÊN LIỆU MỦ — Cân đối kg khô & hao hụt (GĐ3)
// File: src/pages/wms/raw/RawBalanceReportPage.tsx · Route: /wms/nvl/can-doi
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Col, DatePicker, Row, Space, Statistic, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ArrowLeftOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import FacilityPicker from '../../../components/wms/FacilityPicker'
import { rawReportService, type CanDoiNvlTp, type RawBalanceRow, type WetLossByAge } from '../../../services/wms/rawReportService'
import { rawRecheckService, type DryVariance } from '../../../services/wms/rawRecheckService'
import { rawSettingsService } from '../../../services/wms/rawSettingsService'
import { RAW_RUBBER_GROUP_LABELS, RAW_RUBBER_TYPE_LABELS, RAW_SETTINGS_DEFAULT, type RawRubberType, type RawSettings } from '../../../services/wms/raw.types'
import { useActiveFacilities } from '../../../hooks/useActiveFacilities'

const { Title, Text } = Typography
const fmtKg = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: d }))
const fmtSigned = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? '—' : (n > 0 ? '+' : '') + fmtKg(n, d))

export default function RawBalanceReportPage() {
  const navigate = useNavigate()
  const { data: facilities } = useActiveFacilities()
  const [facilityId, setFacilityId] = useState<string | undefined>(undefined)
  const [facilityInit, setFacilityInit] = useState(false)
  const [month, setMonth] = useState(dayjs())
  const [rows, setRows] = useState<RawBalanceRow[]>([])
  const [loss, setLoss] = useState<WetLossByAge[]>([])
  const [variance, setVariance] = useState<DryVariance[]>([])
  const [canDoi, setCanDoi] = useState<CanDoiNvlTp[]>([])
  const [settings, setSettings] = useState<RawSettings>(RAW_SETTINGS_DEFAULT)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (facilityInit || !facilities?.length) return
    const pd = facilities.find((f) => f.code.toUpperCase() === 'PD')
    setFacilityId((pd ?? facilities[0]).id)
    setFacilityInit(true)
  }, [facilities, facilityInit])

  const load = useCallback(async () => {
    if (!facilityId) return
    setLoading(true); setError(null)
    try {
      const [b, l, v, s, cd] = await Promise.all([
        rawReportService.balanceMonth(facilityId, month.format('YYYY-MM-01')),
        rawReportService.wetLossByAge(facilityId),
        rawRecheckService.listVariance(facilityId),
        rawSettingsService.getForFacility(facilityId),
        rawReportService.canDoiNvlTp(facilityId, month.format('YYYY-MM-01'), month.endOf('month').format('YYYY-MM-DD')).catch(() => [] as CanDoiNvlTp[]),
      ])
      setRows(b); setLoss(l); setVariance(v); setSettings(s); setCanDoi(cd)
    } catch (e: any) { setError(e?.message || 'Không tải được báo cáo') }
    finally { setLoading(false) }
  }, [facilityId, month])

  useEffect(() => { load() }, [load])

  const facilityCode = facilities?.find((f) => f.id === facilityId)?.code ?? ''
  const sum = (k: keyof RawBalanceRow) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0)
  const coKiemKe = rows.some((r) => r.kiem_ke_kho !== null)
  const tongKiemKe = rows.reduce((s, r) => s + (r.kiem_ke_kho ?? 0), 0)
  const tongCuoi = sum('ton_cuoi_kho')
  const lechTong = coKiemKe && tongCuoi > 0 ? (100 * (tongKiemKe - tongCuoi)) / tongCuoi : null

  const exportCsv = () => {
    const csv = rawReportService.toCsv(rows, month.format('MM/YYYY'), facilityCode)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `can-doi-kho-nvl-${facilityCode}-${month.format('YYYY-MM')}.csv`
    a.click(); URL.revokeObjectURL(a.href)
  }

  const num = (k: keyof RawBalanceRow, strong = false, signed = false): ColumnsType<RawBalanceRow>[number] => ({
    title: '', dataIndex: k as string, key: k as string, align: 'right',
    render: (v: number | null) => (strong ? <Text strong>{signed ? fmtSigned(v) : fmtKg(v)}</Text> : signed ? fmtSigned(v) : fmtKg(v)),
  })
  const columns: ColumnsType<RawBalanceRow> = [
    { title: 'Loại hàng', dataIndex: 'rubber_type_name', key: 'rubber_type_name', render: (v, r) => <Space size={6}><Text strong>{v}</Text><Tag>{RAW_RUBBER_GROUP_LABELS[r.nhom]}</Tag></Space> },
    { ...num('ton_dau_kho'), title: 'Tồn đầu' },
    { ...num('mo_so_kho'), title: 'Mở sổ' },
    { ...num('nhap_kho'), title: 'Nhập' },
    { ...num('xuat_sx_kho'), title: 'Xuất SX' },
    { ...num('xuat_khac_kho'), title: 'Xuất khác' },
    { ...num('dieu_chinh_kho', false, true), title: 'Điều chỉnh' },
    { ...num('ton_cuoi_kho', true), title: 'Tồn cuối sổ' },
    { ...num('kiem_ke_kho'), title: 'Kiểm kê' },
    { title: 'Chênh', dataIndex: 'chenh_kho', key: 'chenh_kho', align: 'right', render: (v: number | null, r) => v === null ? '—' : <Text strong type={Math.abs(r.chenh_pct ?? 0) > settings.nguong_lech_kho_pct ? 'danger' : 'success'}>{fmtSigned(v)}</Text> },
    { title: '%', dataIndex: 'chenh_pct', key: 'chenh_pct', align: 'right', render: (v: number | null) => v === null ? '—' : <Text type={Math.abs(v) > settings.nguong_lech_kho_pct ? 'danger' : 'success'}>{fmtSigned(v, 2)} %</Text> },
    { title: 'Lô cuối', dataIndex: 'so_lo_cuoi', key: 'so_lo_cuoi', align: 'right' },
  ]

  const lossColumns: ColumnsType<WetLossByAge> = [
    { title: 'Loại', dataIndex: 'rubber_type', key: 'rubber_type', render: (v: RawRubberType) => RAW_RUBBER_TYPE_LABELS[v] ?? v },
    { title: 'Tuổi lô (ngày)', dataIndex: 'nhom_tuoi', key: 'nhom_tuoi' },
    { title: 'Số lần cân lại', dataIndex: 'so_lan', key: 'so_lan', align: 'right' },
    { title: 'Hao ướt', dataIndex: 'hao_uot_pct', key: 'hao_uot_pct', align: 'right', render: (v) => v === null ? '—' : fmtSigned(v, 2) + ' %' },
    { title: 'DRC tăng', dataIndex: 'drc_tang_diem', key: 'drc_tang_diem', align: 'right', render: (v) => v === null ? '—' : fmtSigned(v, 2) + ' điểm' },
    { title: 'Khô lệch', dataIndex: 'kho_lech_pct', key: 'kho_lech_pct', align: 'right', render: (v) => v === null ? '—' : <Text type={Math.abs(v) > settings.nguong_lech_kho_pct ? 'danger' : 'success'}>{fmtSigned(v, 2)} %</Text> },
  ]

  const varColumns: ColumnsType<DryVariance> = [
    { title: 'Ngày', dataIndex: 'txn_date', key: 'txn_date', render: (v) => dayjs(v).format('DD/MM') },
    { title: 'Lô', dataIndex: 'batch_no', key: 'batch_no', render: (v, r) => <a onClick={() => navigate(`/wms/nvl/lo/${r.batch_id}`)}><Text code>{v}</Text></a> },
    { title: 'Loại', dataIndex: 'rubber_type_name', key: 'rubber_type_name' },
    { title: 'Chênh khô', dataIndex: 'chenh_kho_kg', key: 'chenh_kho_kg', align: 'right', render: (v) => <Text strong type="danger">{fmtSigned(v)}</Text> },
    { title: 'Lệch', dataIndex: 'lech_kho_pct', key: 'lech_kho_pct', align: 'right', render: (v) => <Text type="danger">{fmtSigned(v, 2)} %</Text> },
    { title: 'Khi', dataIndex: 'txn_type', key: 'txn_type', render: (v) => (v === 'recheck_adjust' ? 'Cân lại' : 'Kiểm kê') },
    { title: 'Lý do', dataIndex: 'ly_do', key: 'ly_do', render: (v) => v || <Tag color="red">Chưa ghi</Tag> },
  ]

  return (
    <div style={{ padding: 16, background: '#f5f5f5', minHeight: '100%' }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Row justify="space-between" align="middle" gutter={[12, 12]}>
          <Col>
            <Space align="center">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/nvl')} />
              <div>
                <Title level={3} style={{ margin: 0 }}>Cân đối kg khô &amp; hao hụt</Title>
                <Text type="secondary">Tồn đầu + mở sổ + nhập − xuất ± điều chỉnh = tồn cuối sổ · so với kiểm kê đã duyệt trong tháng · ngưỡng {settings.nguong_lech_kho_pct} %</Text>
              </div>
            </Space>
          </Col>
          <Col>
            <Space wrap>
              <FacilityPicker value={facilityId} onChange={setFacilityId} allowAll={false} style={{ minWidth: 180 }} />
              <DatePicker picker="month" value={month} onChange={(d) => d && setMonth(d)} format="MM/YYYY" allowClear={false} />
              <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Làm mới</Button>
              <Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={rows.length === 0}>Xuất CSV</Button>
            </Space>
          </Col>
        </Row>
        {error && <Alert type="error" showIcon message={error} description="Kiểm tra đã chạy migration wms_nvl_p3_kiem_ke_can_doi.sql chưa." />}

        <Row gutter={[12, 12]}>
          <Col xs={12} md={6}><Card size="small"><Statistic title="Nhập khô trong tháng" value={fmtKg(sum('nhap_kho') + sum('mo_so_kho'))} suffix="kg" valueStyle={{ fontSize: 20, fontWeight: 700 }} /><Text type="secondary" style={{ fontSize: 12 }}>mở sổ {fmtKg(sum('mo_so_kho'))} · phiếu cân {fmtKg(sum('nhap_kho'))}</Text></Card></Col>
          <Col xs={12} md={6}><Card size="small"><Statistic title="Xuất khô" value={fmtKg(sum('xuat_sx_kho') + sum('xuat_khac_kho'))} suffix="kg" valueStyle={{ fontSize: 20, fontWeight: 700 }} /><Text type="secondary" style={{ fontSize: 12 }}>sản xuất {fmtKg(sum('xuat_sx_kho'))} · bán / chuyển {fmtKg(sum('xuat_khac_kho'))}</Text></Card></Col>
          <Col xs={12} md={6}><Card size="small"><Statistic title="Tồn cuối sổ" value={fmtKg(tongCuoi)} suffix="kg khô" valueStyle={{ fontSize: 20, fontWeight: 700, color: '#1B4D3E' }} /><Text type="secondary" style={{ fontSize: 12 }}>{fmtKg(sum('ton_cuoi_uot'))} kg ướt · {sum('so_lo_cuoi')} lô</Text></Card></Col>
          <Col xs={12} md={6}><Card size="small"><Statistic title="Lệch sổ so với kiểm kê" value={lechTong === null ? '—' : fmtSigned(lechTong, 2)} suffix={lechTong === null ? '' : '%'} valueStyle={{ fontSize: 20, fontWeight: 700, color: lechTong !== null && Math.abs(lechTong) > settings.nguong_lech_kho_pct ? '#B91C1C' : '#15803D' }} /><Text type="secondary" style={{ fontSize: 12 }}>{coKiemKe ? `kiểm kê ${fmtKg(tongKiemKe)} kg khô` : 'chưa có kiểm kê duyệt trong tháng'}</Text></Card></Col>
        </Row>

        <Card size="small" title={`Cân đối kg khô theo loại · ${month.format('MM/YYYY')} · ${facilityCode}`} bodyStyle={{ padding: 0 }}>
          <Table<RawBalanceRow> rowKey="rubber_type" columns={columns} dataSource={rows} size="small" loading={loading} pagination={false} scroll={{ x: 1100 }}
            locale={{ emptyText: 'Chưa có phát sinh trong tháng' }}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}><Text strong>Tổng</Text></Table.Summary.Cell>
                {(['ton_dau_kho', 'mo_so_kho', 'nhap_kho', 'xuat_sx_kho', 'xuat_khac_kho', 'dieu_chinh_kho', 'ton_cuoi_kho'] as const).map((k, i) => (
                  <Table.Summary.Cell key={k} index={i + 1} align="right"><Text strong>{k === 'dieu_chinh_kho' ? fmtSigned(sum(k)) : fmtKg(sum(k))}</Text></Table.Summary.Cell>
                ))}
                <Table.Summary.Cell index={8} align="right"><Text strong>{coKiemKe ? fmtKg(tongKiemKe) : '—'}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={9} align="right"><Text strong>{coKiemKe ? fmtSigned(tongKiemKe - tongCuoi) : '—'}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={10} align="right"><Text strong>{lechTong === null ? '—' : fmtSigned(lechTong, 2) + ' %'}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={11} align="right"><Text strong>{sum('so_lo_cuoi')}</Text></Table.Summary.Cell>
              </Table.Summary.Row>
            )} />
        </Card>

        <Card size="small" title={`Cân đối NVL khô → thành phẩm theo ngày · ${month.format('MM/YYYY')}`} extra={<Text type="secondary">NVL khô xuất SX + chèn tiêu hao = TP đạt + LOI/DKL + hao hụt</Text>} bodyStyle={{ padding: 0 }}>
          <Table<CanDoiNvlTp> rowKey="ngay" size="small" loading={loading} pagination={{ pageSize: 10, showSizeChanger: false }} scroll={{ x: 760 }} dataSource={canDoi}
            locale={{ emptyText: 'Chưa có ngày nào có cả xuất NVL và sổ ca đã nhận' }}
            columns={[
              { title: 'Ngày', dataIndex: 'ngay', key: 'ngay', render: (v) => dayjs(v).format('DD/MM') },
              { title: 'NVL khô xuất SX', dataIndex: 'nvl_kho_xuat_sx_kg', key: 'a', align: 'right', render: (v) => fmtKg(v) },
              { title: 'Chèn tiêu hao', dataIndex: 'chen_tieu_hao_kg', key: 'b', align: 'right', render: (v) => fmtKg(v) },
              { title: 'TP đạt (kg)', dataIndex: 'tp_dat_kg', key: 'c', align: 'right', render: (v) => <Text strong>{fmtKg(v)}</Text> },
              { title: 'LOI / DKL', dataIndex: 'loi_dkl_kg', key: 'd', align: 'right', render: (v) => fmtKg(v) },
              { title: 'Hao hụt', dataIndex: 'hao_hut_kg', key: 'e', align: 'right', render: (v: number) => <Text type={Math.abs(v) > 0 ? (v < 0 ? 'danger' : undefined) : 'secondary'}>{fmtSigned(v)}</Text> },
              { title: 'Hiệu suất', dataIndex: 'hieu_suat_pct', key: 'f', align: 'right', render: (v: number | null) => (v === null ? '—' : <Tag color={v >= 95 ? 'green' : v >= 85 ? 'gold' : 'red'}>{v} %</Tag>) },
            ]} />
        </Card>

        <Row gutter={[12, 12]}>
          <Col xs={24} xl={12}>
            <Card size="small" title="Chuẩn hao ướt theo tuổi lô · mủ thô · 180 ngày" extra={<Text type="secondary">từ các lần cân lại</Text>}>
              <Table<WetLossByAge> rowKey={(r) => `${r.rubber_type}|${r.nhom_tuoi}`} columns={lossColumns} dataSource={loss} size="small" pagination={false} loading={loading}
                locale={{ emptyText: 'Chưa có lần cân lại nào — chuẩn hao sẽ hình thành sau vài tuần' }} />
              <Text type="secondary" style={{ fontSize: 12 }}>Ướt giảm và DRC tăng là khô tự nhiên; chỉ cột "khô lệch" mới là thất thoát hoặc DRC đầu vào sai.</Text>
            </Card>
          </Col>
          <Col xs={24} xl={12}>
            <Card size="small" title={<Space>Lô lệch khô quá ngưỡng · 90 ngày<Tag color={variance.length ? 'red' : 'default'}>{variance.length}</Tag></Space>}>
              <Table<DryVariance> rowKey="ledger_id" columns={varColumns} dataSource={variance} size="small" pagination={{ pageSize: 8, showSizeChanger: false }} loading={loading} locale={{ emptyText: 'Không có' }} />
            </Card>
          </Col>
        </Row>
      </Space>
    </div>
  )
}
