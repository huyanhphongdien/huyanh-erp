// ============================================================================
// VỐN VAY — TỔNG QUAN (Đợt 1): KPI + đèn nhảy nhóm + lịch đến hạn
// File: src/pages/finance/FinanceLoanDashboard.tsx
// ============================================================================
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Row, Col, Statistic, Table, Button, Typography, Empty, Spin, Alert } from 'antd'
import { ReloadOutlined, BankOutlined, WarningFilled, RightOutlined } from '@ant-design/icons'
import FinanceLendingTabs from './FinanceLendingTabs'
import { loanService, CIC_BG, type FinLoanComputed } from '../../services/finance/loanService'
import { depositService, ALERT_LABEL, ALERT_COLOR, type FinDepositComputed } from '../../services/finance/depositService'
import { fmtVnd, fmtVndNum, fmtTy, fmtDate } from '../../utils/format'
import PageState from '../../components/common/PageState'
import { pill, hanText, CicPill } from './finUi'

const { Title, Text } = Typography

export default function FinanceLoanDashboard() {
  const navigate = useNavigate()
  const [loans, setLoans] = useState<FinLoanComputed[]>([])
  const [deposits, setDeposits] = useState<FinDepositComputed[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<unknown>(null)

  const load = useCallback(async () => {
    setLoading(true); setLoadError(null)
    try {
      const [l, d] = await Promise.all([loanService.list(), depositService.list()])
      setLoans(l); setDeposits(d)
    } catch (e) { setLoadError(e) }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const k = useMemo(() => {
    const active = loans.filter((l) => l.cic !== 'paid')
    const sum = (arr: FinLoanComputed[]) => arr.reduce((s, l) => s + l.remaining, 0)
    const due7 = active.filter((l) => l.overdue_days >= -7)        // trong 7 ngày tới + đã quá hạn
    const due30 = active.filter((l) => l.overdue_days >= -30)
    const danger = active.filter((l) => l.cic === 'orange' || l.cic === 'red')
    const red = active.filter((l) => l.cic === 'red')
    // gom dư nợ theo ngân hàng
    const byBank = new Map<string, { bank: string; remaining: number; count: number; due7: number }>()
    for (const l of active) {
      const cur = byBank.get(l.bank) || { bank: l.bank, remaining: 0, count: 0, due7: 0 }
      cur.remaining += l.remaining; cur.count++
      if (l.overdue_days >= -7) cur.due7 += l.remaining
      byBank.set(l.bank, cur)
    }
    return {
      totalActive: sum(active), totalDue7: sum(due7), totalDue30: sum(due30),
      dangerCount: danger.length, redCount: red.length,
      danger: danger.sort((a, b) => b.overdue_days - a.overdue_days),
      banks: [...byBank.values()].sort((a, b) => b.remaining - a.remaining),
      upcoming: active.filter((l) => l.overdue_days >= -30 && l.cic !== 'red')
        .sort((a, b) => b.overdue_days - a.overdue_days).slice(0, 12),
    }
  }, [loans])

  const dep = useMemo(() => {
    const active = deposits.filter((d) => d.status !== 'closed')
    const sum = (arr: FinDepositComputed[]) => arr.reduce((s, d) => s + (d.amount || 0), 0)
    const urgent = active.filter((d) => d.alert === 'due' || d.alert === 'overdue')
      .sort((a, b) => (a.days_to_maturity ?? 9999) - (b.days_to_maturity ?? 9999))
    return {
      total: sum(active),
      secure: sum(active.filter((d) => d.purpose === 'dam_bao_vay')),
      urgentCount: urgent.length,
      urgentOverdue: urgent.some((d) => d.alert === 'overdue'),
      nearCount: active.filter((d) => d.alert === 'soon' || d.alert === 'due' || d.alert === 'overdue').length,
      urgent,
    }
  }, [deposits])

  const cicTag = (l: FinLoanComputed) => <CicPill loan={l} />

  if (loading) return <div style={{ padding: 60, textAlign: 'center' }}><Spin size="large" /></div>
  // Lỗi tải: KHÔNG được rơi xuống "Không có khoản nào sát mốc nhảy nhóm 👍" (báo an toàn giả)
  if (loadError) return <div style={{ padding: '20px 24px' }}><FinanceLendingTabs /><PageState error={loadError} onRetry={load} /></div>

  return (
    <div style={{ padding: '20px 24px' }}>
      <FinanceLendingTabs />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Title level={3} style={{ margin: 0 }}><BankOutlined /> Vốn vay ngân hàng — Tổng quan</Title>
        <div>
          <Button icon={<ReloadOutlined />} onClick={load} style={{ marginRight: 8 }}>Làm mới</Button>
          <Button type="primary" onClick={() => navigate('/finance/loans')}>Quản lý khoản vay <RightOutlined /></Button>
        </div>
      </div>

      {/* KPI */}
      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="Tổng dư nợ" value={fmtTy(k.totalActive)} valueStyle={{ color: '#1B4D3E', fontWeight: 800 }} />
            <Text type="secondary" style={{ fontSize: 12 }}>{fmtVnd(k.totalActive)}</Text></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="Đến hạn ≤ 7 ngày" value={fmtTy(k.totalDue7)} valueStyle={{ color: '#ca8a04', fontWeight: 800 }} />
            <Text type="secondary" style={{ fontSize: 12 }}>gồm cả đã quá hạn</Text></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="Đến hạn ≤ 30 ngày" value={fmtTy(k.totalDue30)} valueStyle={{ color: '#ea580c', fontWeight: 800 }} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" style={{ background: k.dangerCount ? '#fef2f2' : undefined }}>
            <Statistic title="Khoản nguy cơ nhảy nhóm" value={k.dangerCount} valueStyle={{ color: k.dangerCount ? '#dc2626' : '#16a34a', fontWeight: 800 }} suffix="khoản" />
            <Text type="secondary" style={{ fontSize: 12 }}>{k.redCount} đã ≥10 ngày (🔴)</Text>
          </Card>
        </Col>
      </Row>

      {/* PANEL ĐỎ — nguy cơ nhảy nhóm */}
      <Card size="small" style={{ marginTop: 16, borderColor: k.dangerCount ? '#fecaca' : undefined }}
        title={<span style={{ color: '#dc2626', fontWeight: 700 }}><WarningFilled /> Nguy cơ nhảy nhóm — xử lý GẤP</span>}>
        {k.danger.length === 0
          ? <Alert type="success" showIcon message="Không có khoản nào sát/quá mốc nhảy nhóm. 👍" />
          : (
            <Table rowKey="id" size="small" pagination={false} dataSource={k.danger}
              onRow={(r) => ({ onClick: () => navigate(`/finance/loans?focus=${r.id}`), style: { cursor: 'pointer', background: CIC_BG[r.cic] } })}
              columns={[
                { title: 'Ngân hàng', dataIndex: 'bank', render: (v, r) => <span><b>{v}</b>{r.loan_no ? <Text type="secondary"> · {r.loan_no}</Text> : ''}</span> },
                { title: 'Còn lại', dataIndex: 'remaining', align: 'right', render: (v) => <b style={{ color: '#92400E' }}>{fmtVndNum(v)}</b> },
                { title: 'Đến hạn', dataIndex: 'due_date', align: 'center', render: (v) => fmtDate(v) },
                { title: 'Mốc nhảy nhóm', dataIndex: 'jump_date', align: 'center', render: (v) => <Text type="danger">{fmtDate(v)}</Text> },
                { title: 'Trạng thái', key: 'cic', render: (_, r) => cicTag(r) },
              ]} />
          )}
      </Card>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {/* Theo ngân hàng */}
        <Col xs={24} md={10}>
          <Card size="small" title="🏦 Dư nợ theo ngân hàng">
            {k.banks.length === 0 ? <Empty description="Chưa có khoản vay" />
              : <Table rowKey="bank" size="small" pagination={false} dataSource={k.banks}
                  columns={[
                    { title: 'Ngân hàng', dataIndex: 'bank', render: (v, r) => <span><b>{v}</b> <Text type="secondary">({r.count})</Text></span> },
                    { title: 'Dư nợ', dataIndex: 'remaining', align: 'right', render: (v) => fmtVndNum(v) },
                    { title: 'Đến hạn ≤7 ngày', dataIndex: 'due7', align: 'right', render: (v) => v ? <Text type="warning">{fmtVndNum(v)}</Text> : '—' },
                  ]} />}
          </Card>
        </Col>
        {/* Sắp đến hạn */}
        <Col xs={24} md={14}>
          <Card size="small" title="📅 Sắp đến hạn (30 ngày tới)">
            {k.upcoming.length === 0 ? <Empty description="Không có khoản sắp đến hạn" />
              : <Table rowKey="id" size="small" pagination={false} dataSource={k.upcoming}
                  onRow={(r) => ({ onClick: () => navigate(`/finance/loans?focus=${r.id}`), style: { cursor: 'pointer' } })}
                  columns={[
                    { title: 'Ngân hàng', dataIndex: 'bank', render: (v) => <b>{v}</b> },
                    { title: 'Còn lại', dataIndex: 'remaining', align: 'right', render: (v) => fmtVndNum(v) },
                    { title: 'Đến hạn', dataIndex: 'due_date', align: 'center', render: (v, r) => <span>{fmtDate(v)} <Text type="secondary" style={{ fontSize: 11 }}>({hanText(-r.overdue_days)})</Text></span> },
                    { title: '', key: 'cic', align: 'center', render: (_, r) => cicTag(r) },
                  ]} />}
          </Card>
        </Col>
      </Row>

      {/* ── TIỀN GỬI (HĐTG) ── */}
      <div style={{ marginTop: 22, marginBottom: 8, fontWeight: 700, color: '#1B4D3E', fontSize: 16 }}>
        💰 Tiền gửi (HĐTG)
        <Button type="link" size="small" onClick={() => navigate('/finance/deposits')}>Quản lý <RightOutlined /></Button>
      </div>
      <Row gutter={[12, 12]}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Tổng tiền gửi" value={fmtTy(dep.total)} valueStyle={{ color: '#1B4D3E', fontWeight: 800 }} /><Text type="secondary" style={{ fontSize: 12 }}>{fmtVnd(dep.total)}</Text></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Đảm bảo khoản vay" value={fmtTy(dep.secure)} valueStyle={{ color: '#1677ff', fontWeight: 800 }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small" style={{ background: dep.urgentCount ? '#fff7ed' : undefined }}><Statistic title="Cần tái tục gấp" value={dep.urgentCount} suffix="HĐ" valueStyle={{ color: !dep.urgentCount ? ALERT_COLOR.ok : dep.urgentOverdue ? ALERT_COLOR.overdue : ALERT_COLOR.due, fontWeight: 800 }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="Sắp đáo hạn ≤30 ngày" value={dep.nearCount} suffix="HĐ" valueStyle={{ color: '#ca8a04', fontWeight: 800 }} /></Card></Col>
      </Row>
      {dep.urgent.length > 0 && (
        <Card size="small" style={{ marginTop: 12, borderColor: '#fed7aa' }}
          title={<span style={{ color: '#ea580c', fontWeight: 700 }}><WarningFilled /> HĐTG cần tái tục gấp — quên là bị tất toán ép</span>}
          extra={<Button size="small" onClick={() => navigate('/finance/deposits')}>Xem tất cả <RightOutlined /></Button>}>
          <Table rowKey="id" size="small" pagination={false} dataSource={dep.urgent.slice(0, 8)}
            onRow={(r) => ({ onClick: () => navigate(`/finance/deposits?focus=${r.id}`), style: { cursor: 'pointer' } })}
            columns={[
              { title: 'Ngân hàng', dataIndex: 'bank', render: (v, r) => <span><b>{v}</b>{r.holder ? <Text type="secondary"> · {r.holder}</Text> : ''}</span> },
              { title: 'Số tiền', dataIndex: 'amount', align: 'right', render: (v) => <b>{fmtVndNum(v)}</b> },
              { title: 'Đáo hạn', dataIndex: 'effective_maturity', align: 'center', render: (v, r) => <span>{fmtDate(v)} <Text type="secondary" style={{ fontSize: 11 }}>({hanText(r.days_to_maturity ?? 0)})</Text></span> },
              { title: '', key: 'al', align: 'center', render: (_, r) => pill(ALERT_COLOR[r.alert], ALERT_LABEL[r.alert]) },
            ]} />
        </Card>
      )}
    </div>
  )
}
