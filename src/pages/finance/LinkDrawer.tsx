// ============================================================================
// VỐN VAY — Drawer LIÊN KẾT: Khoản vay ↔ HĐTG đảm bảo (xem cả 2 chiều)
// File: src/pages/finance/LinkDrawer.tsx
// Mở từ trang Khoản vay (click ô "Đảm bảo bởi") HOẶC trang Tiền gửi (click ô
// "Đảm bảo cho") — luôn hiển thị: khoản vay + mọi HĐTG đang chống lưng nó.
// ============================================================================
import { Drawer, Card, Table, Progress, Typography, Empty, Button } from 'antd'
import { BankOutlined, SafetyCertificateOutlined, RightOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { CIC_LABEL, CIC_COLOR, type FinLoanComputed } from '../../services/finance/loanService'
import { ALERT_LABEL, ALERT_COLOR, type FinDepositComputed } from '../../services/finance/depositService'

const { Text } = Typography
const fmtVnd = (n?: number | null) => (n || 0).toLocaleString('vi-VN')
const fmtTy = (n: number) => `${((n || 0) / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`
const fDate = (s?: string | null) => (s ? dayjs(s).format('DD/MM/YYYY') : '—')
const pill = (bg: string, txt: string) => (
  <span style={{ display: 'inline-block', background: bg, color: '#fff', fontWeight: 700, fontSize: 12, padding: '2px 9px', borderRadius: 5, whiteSpace: 'nowrap' }}>{txt}</span>
)

export default function LinkDrawer({
  loan, deposits, open, onClose, highlightDepositId,
}: {
  loan: FinLoanComputed | null
  deposits: FinDepositComputed[]
  open: boolean
  onClose: () => void
  highlightDepositId?: string | null
}) {
  const navigate = useNavigate()
  const secured = loan ? deposits.filter((d) => d.secured_loan_id === loan.id && d.status !== 'closed') : []
  const total = secured.reduce((s, d) => s + (d.amount || 0), 0)
  const coverage = loan && loan.remaining > 0 ? Math.round((total / loan.remaining) * 100) : 0

  return (
    <Drawer open={open} onClose={onClose} width={640}
      title={<span><span style={{ color: '#1B4D3E' }}>🔗 Liên kết</span> Khoản vay ↔ Tiền gửi đảm bảo</span>}>
      {!loan ? <Empty /> : (
        <>
          {/* Khoản vay */}
          <Card size="small" style={{ borderColor: '#cde8d8' }}
            title={<span style={{ color: '#1B4D3E' }}><BankOutlined /> Khoản vay</span>}
            extra={<Button size="small" type="link" onClick={() => { onClose(); navigate(`/finance/loans?focus=${loan.id}`) }}>Mở <RightOutlined /></Button>}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{loan.bank} {loan.loan_no ? <Text type="secondary">· {loan.loan_no}</Text> : ''}</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  Số vay <b>{fmtVnd(loan.principal)}</b> · Còn lại <b style={{ color: '#92400E' }}>{fmtVnd(loan.remaining)}</b>
                </div>
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>Đến hạn {fDate(loan.due_date)} ({loan.overdue_days >= 0 ? `quá ${loan.overdue_days}d` : `còn ${-loan.overdue_days}d`})</div>
              </div>
              {pill(CIC_COLOR[loan.cic], CIC_LABEL[loan.cic])}
            </div>
          </Card>

          {/* Tỷ lệ đảm bảo */}
          <Card size="small" style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text strong>Tổng tiền gửi đảm bảo: <span style={{ color: '#1677ff' }}>{fmtTy(total)}</span></Text>
              <Text type="secondary">{secured.length} HĐTG</Text>
            </div>
            <Progress percent={Math.min(coverage, 100)} status={coverage >= 100 ? 'success' : 'active'}
              format={() => `${coverage}% còn nợ`} strokeColor={coverage >= 100 ? '#16a34a' : '#1677ff'} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {coverage >= 100 ? 'Tiền gửi đủ phủ dư nợ.' : 'Tiền gửi đảm bảo CHƯA phủ hết dư nợ còn lại.'}
            </Text>
          </Card>

          {/* Danh sách HĐTG đảm bảo */}
          <div style={{ fontWeight: 700, color: '#1B4D3E', margin: '16px 0 8px' }}>
            <SafetyCertificateOutlined /> Hợp đồng tiền gửi đang chống lưng ({secured.length})
          </div>
          {secured.length === 0
            ? <Empty description="Chưa có HĐTG nào nối với khoản vay này" />
            : <Table rowKey="id" size="small" pagination={false} dataSource={secured}
                rowClassName={(r) => (r.id === highlightDepositId ? 'ant-table-row-selected' : '')}
                onRow={(r) => ({ style: { background: r.id === highlightDepositId ? '#fffbe6' : undefined } })}
                columns={[
                  { title: 'Ngân hàng', dataIndex: 'bank', render: (v: string, r: FinDepositComputed) => <span><b>{v}</b>{r.holder ? <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.holder}</div> : null}</span> },
                  { title: 'Số tiền', dataIndex: 'amount', align: 'right' as const, render: (v: number) => <b>{fmtVnd(v)}</b> },
                  { title: 'Đáo hạn', dataIndex: 'effective_maturity', align: 'center' as const, render: (v: string) => fDate(v) },
                  { title: 'Trạng thái', key: 'al', align: 'center' as const, render: (_: any, r: FinDepositComputed) => pill(ALERT_COLOR[r.alert], ALERT_LABEL[r.alert]) },
                ] as any} />}
          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <Button size="small" onClick={() => { onClose(); navigate('/finance/deposits') }}>Sang trang Tiền gửi <RightOutlined /></Button>
          </div>
        </>
      )}
    </Drawer>
  )
}
