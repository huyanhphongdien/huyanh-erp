// ============================================================================
// VỐN VAY — Drawer HẠN MỨC: 1 facility ↔ tiền gửi đảm bảo + khoản vay rút
// File: src/pages/finance/FacilityDrawer.tsx
// ============================================================================
import { Drawer, Card, Table, Progress, Typography, Empty, Row, Col, Statistic, Button } from 'antd'
import { SafetyCertificateOutlined, BankOutlined, RightOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { CIC_LABEL, CIC_COLOR } from '../../services/finance/loanService'
import { ALERT_LABEL, ALERT_COLOR } from '../../services/finance/depositService'
import { LINE_TYPE_LABEL, type FinCreditLineComputed } from '../../services/finance/creditLineService'

const { Text } = Typography
const fmtVnd = (n?: number | null) => (n || 0).toLocaleString('vi-VN')
const fmtTy = (n: number) => `${((n || 0) / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`
const fDate = (s?: string | null) => (s ? dayjs(s).format('DD/MM/YYYY') : '—')
const pill = (bg: string, txt: string) => (
  <span style={{ display: 'inline-block', background: bg, color: '#fff', fontWeight: 700, fontSize: 12, padding: '2px 9px', borderRadius: 5, whiteSpace: 'nowrap' }}>{txt}</span>
)

export default function FacilityDrawer({ line, open, onClose }: {
  line: FinCreditLineComputed | null
  open: boolean
  onClose: () => void
}) {
  const navigate = useNavigate()
  if (!line) return <Drawer open={open} onClose={onClose} width={760}><Empty /></Drawer>

  const limit = Number(line.limit_amount) || 0
  const usedPct = limit > 0 ? Math.round((line.used / limit) * 100) : 0
  const coverPct = line.used > 0 ? Math.round((line.secured / line.used) * 100) : (line.secured > 0 ? 100 : 0)

  return (
    <Drawer open={open} onClose={onClose} width={760}
      title={<span><BankOutlined /> Hạn mức <b style={{ color: '#1B4D3E' }}>{line.bank}</b>{line.contract_no ? <Text type="secondary"> · {line.contract_no}</Text> : ''}</span>}>
      {/* KPI */}
      <Row gutter={[10, 10]}>
        <Col span={8}><Card size="small"><Statistic title="Hạn mức" value={fmtTy(limit)} valueStyle={{ color: '#1B4D3E', fontWeight: 800, fontSize: 20 }} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="Đang vay" value={fmtTy(line.used)} valueStyle={{ color: '#92400E', fontWeight: 800, fontSize: 20 }} /></Card></Col>
        <Col span={8}><Card size="small" style={{ background: line.room < 0 ? '#fef2f2' : '#f0fdf4' }}><Statistic title="Room còn lại" value={fmtTy(line.room)} valueStyle={{ color: line.room < 0 ? '#dc2626' : '#16a34a', fontWeight: 800, fontSize: 20 }} /></Card></Col>
      </Row>

      <Card size="small" style={{ marginTop: 10 }}>
        <Text strong style={{ fontSize: 12 }}>Mức sử dụng hạn mức</Text>
        <Progress percent={Math.min(usedPct, 100)} status={usedPct >= 100 ? 'exception' : 'active'} format={() => `${usedPct}%`} strokeColor={usedPct >= 90 ? '#dc2626' : '#1677ff'} />
        <Text strong style={{ fontSize: 12 }}>Tiền gửi đảm bảo phủ dư nợ ({fmtTy(line.secured)} / {fmtTy(line.used)})</Text>
        <Progress percent={Math.min(coverPct, 100)} status={coverPct >= 100 ? 'success' : 'normal'} format={() => `${coverPct}%`} strokeColor={coverPct >= 100 ? '#16a34a' : '#f59e0b'} />
        {line.line_type ? <Text type="secondary" style={{ fontSize: 12 }}>Loại: {LINE_TYPE_LABEL[line.line_type] || line.line_type} · Hết hạn HĐTD: {fDate(line.to_date)}</Text> : null}
      </Card>

      {/* Tiền gửi đảm bảo */}
      <div style={{ fontWeight: 700, color: '#1677ff', margin: '16px 0 8px' }}>
        <SafetyCertificateOutlined /> Tiền gửi đảm bảo hạn mức ({line.depositCount}) — {fmtTy(line.secured)}
      </div>
      {line.deposits.length === 0 ? <Empty description="Chưa HĐTG nào nối hạn mức này" />
        : <Table rowKey="id" size="small" pagination={false} dataSource={line.deposits}
            columns={[
              { title: 'Ngân hàng', dataIndex: 'bank', render: (v: string, r: any) => <span><b>{v}</b>{r.holder ? <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.holder}</div> : null}</span> },
              { title: 'Số tiền', dataIndex: 'amount', align: 'right' as const, render: (v: number) => <b>{fmtVnd(v)}</b> },
              { title: 'Đáo hạn', dataIndex: 'effective_maturity', align: 'center' as const, render: (v: string) => fDate(v) },
              { title: 'Trạng thái', key: 'al', align: 'center' as const, render: (_: any, r: any) => pill(ALERT_COLOR[r.alert], ALERT_LABEL[r.alert]) },
            ] as any} />}

      {/* Khoản vay rút */}
      <div style={{ fontWeight: 700, color: '#92400E', margin: '16px 0 8px' }}>
        <BankOutlined /> Khoản vay đang rút từ hạn mức ({line.loanCount}) — {fmtTy(line.used)}
      </div>
      {line.loans.length === 0 ? <Empty description="Chưa khoản vay nào thuộc hạn mức này" />
        : <Table rowKey="id" size="small" pagination={false} dataSource={line.loans}
            columns={[
              { title: 'Số khế ước', dataIndex: 'loan_no', render: (v: string | null) => v || '—' },
              { title: 'Còn lại', dataIndex: 'remaining', align: 'right' as const, render: (v: number) => <b style={{ color: '#92400E' }}>{fmtVnd(v)}</b> },
              { title: 'Đến hạn', dataIndex: 'due_date', align: 'center' as const, render: (v: string) => fDate(v) },
              { title: 'Trạng thái', key: 'cic', align: 'center' as const, render: (_: any, r: any) => pill(CIC_COLOR[r.cic], CIC_LABEL[r.cic]) },
            ] as any} />}

      <div style={{ marginTop: 14, textAlign: 'right' }}>
        <Button size="small" style={{ marginRight: 8 }} onClick={() => { onClose(); navigate('/finance/loans') }}>🏦 Khoản vay <RightOutlined /></Button>
        <Button size="small" onClick={() => { onClose(); navigate('/finance/deposits') }}>💰 Tiền gửi <RightOutlined /></Button>
      </div>
    </Drawer>
  )
}
