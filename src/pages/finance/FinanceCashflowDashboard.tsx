// ============================================================================
// TÀI CHÍNH — DASHBOARD DÒNG TIỀN TỔNG (Đợt 6) — audit toàn bộ
// File: src/pages/finance/FinanceCashflowDashboard.tsx
// Gộp: tồn quỹ + tiền VÀO (phải thu) vs tiền RA (gốc + lãi + phải nộp) theo tuần.
// ============================================================================
import { useEffect, useState, useCallback, useMemo } from 'react'
import { Card, Row, Col, Statistic, Table, Typography, Button, Space, message, Alert, Tag, InputNumber, Tooltip } from 'antd'
import { ReloadOutlined, RiseOutlined, FallOutlined, BankOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { loanService } from '../../services/finance/loanService'
import { interestService } from '../../services/finance/interestService'
import { receivableService } from '../../services/finance/receivableService'
import { cashService } from '../../services/finance/cashService'
import { creditLineService } from '../../services/finance/creditLineService'
import { depositService } from '../../services/finance/depositService'
import { collateralService } from '../../services/finance/collateralService'

const { Title, Text } = Typography
const fmtVnd = (n?: number | null) => (Math.round(n || 0)).toLocaleString('vi-VN')
const fmtTy = (n: number) => `${((n || 0) / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`
const fmtUsd = (n?: number | null) => '$' + Math.round(n || 0).toLocaleString('en-US')
const WEEKS = 6

interface Bucket { start: Date; end: Date; label: string; inV: number; outP: number; outI: number; outPay: number }

export default function FinanceCashflowDashboard() {
  const [loading, setLoading] = useState(true)
  const [usdRate, setUsdRate] = useState(25400)
  const [raw, setRaw] = useState<any>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [loans, ints, ars, bals, pays, lines, deps, cols] = await Promise.all([
        loanService.list(), interestService.listAll(), receivableService.list(),
        cashService.listBalances(), cashService.listPayables(), creditLineService.listComputed(),
        depositService.list(), collateralService.list(),
      ])
      setRaw({ loans, ints, ars, bals, pays, lines, deps, cols })
    } catch (e: any) { message.error('Lỗi tải: ' + (e?.message || e)) }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const d = useMemo(() => {
    if (!raw) return null
    const { loans, ints, ars, bals, pays, lines, deps, cols } = raw
    const toVnd = (amt: number, ccy: string) => (ccy === 'USD' ? amt * usdRate : amt)

    // Thẻ sức khỏe
    const cashVnd = bals.reduce((s: number, b: any) => s + (Number(b.vnd) || 0), 0)
    const cashUsd = bals.reduce((s: number, b: any) => s + (Number(b.usd) || 0), 0)
    const cashTotalVnd = cashVnd + cashUsd * usdRate
    const arOpen = ars.filter((r: any) => r.alert !== 'received')
    const arUsd = arOpen.filter((r: any) => r.currency === 'USD').reduce((s: number, r: any) => s + r.remaining, 0)
    const arVnd = arOpen.filter((r: any) => r.currency !== 'USD').reduce((s: number, r: any) => s + r.remaining, 0)
    const arTotalVnd = arUsd * usdRate + arVnd
    const loanRemaining = loans.filter((l: any) => l.status === 'active').reduce((s: number, l: any) => s + l.remaining, 0)
    const roomTotal = lines.reduce((s: number, l: any) => s + l.room, 0)
    const depositTotal = deps.filter((x: any) => x.status !== 'closed').reduce((s: number, x: any) => s + (Number(x.amount) || 0), 0)
    const collateralTotal = cols.filter((c: any) => c.status !== 'released').reduce((s: number, c: any) => s + (Number(c.secured_value) || 0), 0)

    // Tuần (cửa sổ 7 ngày từ hôm nay)
    const t0 = new Date(); t0.setHours(0, 0, 0, 0)
    const buckets: Bucket[] = Array.from({ length: WEEKS }, (_, i) => {
      const start = new Date(t0.getTime() + i * 7 * 86400000)
      const end = new Date(t0.getTime() + (i + 1) * 7 * 86400000)
      return { start, end, label: `${dayjs(start).format('DD/MM')}–${dayjs(new Date(end.getTime() - 1)).format('DD/MM')}`, inV: 0, outP: 0, outI: 0, outPay: 0 }
    })
    const horizon = buckets[WEEKS - 1].end
    const idxOf = (dateStr?: string | null): number => {
      if (!dateStr) return -1
      const dt = new Date(dateStr + 'T00:00:00'); dt.setHours(0, 0, 0, 0)
      if (dt < t0) return 0                 // quá hạn → dồn vào tuần này
      if (dt >= horizon) return -1
      return Math.floor((dt.getTime() - t0.getTime()) / (7 * 86400000))
    }

    // Tiền VÀO — phải thu
    arOpen.forEach((r: any) => { const i = idxOf(r.effective_due); if (i >= 0) buckets[i].inV += toVnd(r.remaining, r.currency) })
    // Tiền RA — gốc khoản vay đến hạn
    loans.filter((l: any) => l.status === 'active' && l.remaining > 0).forEach((l: any) => { const i = idxOf(l.due_date); if (i >= 0) buckets[i].outP += l.remaining })
    // Tiền RA — lãi đến kỳ
    ints.filter((p: any) => p.status === 'pending').forEach((p: any) => { const i = idxOf(p.due_date); if (i >= 0) buckets[i].outI += (Number(p.interest_amount) || 0) })
    // Tiền RA — phải nộp định kỳ (theo kỳ tới)
    pays.filter((p: any) => p.active && p.amount_est).forEach((p: any) => { const i = idxOf(p.next_due); if (i >= 0) buckets[i].outPay += (Number(p.amount_est) || 0) })

    // Tồn dự kiến chạy dồn
    let running = cashTotalVnd
    const rows = buckets.map((b) => {
      const out = b.outP + b.outI + b.outPay
      const net = b.inV - out
      running += net
      return { ...b, out, net, running }
    })
    const shortfall = rows.filter((r) => r.running < 0)

    return {
      cashVnd, cashUsd, cashTotalVnd, arUsd, arVnd, arTotalVnd, arCount: arOpen.length,
      loanRemaining, roomTotal, depositTotal, collateralTotal, rows, shortfall, asOf: bals.map((b: any) => b.as_of_date).filter(Boolean).sort().slice(-1)[0],
    }
  }, [raw, usdRate])

  const cfCols = [
    { title: 'Tuần', dataIndex: 'label', width: 110, render: (v: string, _r: any, i: number) => <span>{v}{i === 0 ? <Tag color="blue" style={{ marginLeft: 4 }}>tuần này</Tag> : null}</span> },
    { title: '⬆ Tiền vào', dataIndex: 'inV', align: 'right' as const, render: (v: number) => v ? <b style={{ color: '#16a34a' }}>{fmtVnd(v)}</b> : <Text type="secondary">—</Text> },
    { title: 'Gốc vay', dataIndex: 'outP', align: 'right' as const, render: (v: number) => v ? fmtVnd(v) : '—' },
    { title: 'Lãi', dataIndex: 'outI', align: 'right' as const, render: (v: number) => v ? fmtVnd(v) : '—' },
    { title: 'Phải nộp', dataIndex: 'outPay', align: 'right' as const, render: (v: number) => v ? fmtVnd(v) : '—' },
    { title: '⬇ Tổng ra', dataIndex: 'out', align: 'right' as const, render: (v: number) => v ? <b style={{ color: '#dc2626' }}>{fmtVnd(v)}</b> : <Text type="secondary">—</Text> },
    { title: 'Net', dataIndex: 'net', align: 'right' as const, render: (v: number) => <b style={{ color: v >= 0 ? '#16a34a' : '#dc2626' }}>{v >= 0 ? '+' : ''}{fmtVnd(v)}</b> },
    { title: 'Tồn dự kiến', dataIndex: 'running', align: 'right' as const, render: (v: number) => <b style={{ color: v < 0 ? '#dc2626' : '#1E3A5F' }}>{fmtVnd(v)}</b> },
  ]

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1500, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <Title level={3} style={{ margin: 0 }}><RiseOutlined /> Dòng tiền tổng hợp</Title>
        <Space>
          <Tooltip title="Tỷ giá quy đổi USD → VNĐ (cho phải thu)"><span style={{ fontSize: 12, color: '#64748b' }}>USD≈</span></Tooltip>
          <InputNumber size="small" value={usdRate} min={1000} step={100} onChange={(v) => setUsdRate(Number(v) || 25400)} style={{ width: 100 }} />
          <Button icon={<ReloadOutlined />} onClick={load} />
        </Space>
      </div>

      {!d ? <Card loading /> : <>
        {/* Thẻ sức khỏe */}
        <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
          <Col xs={12} md={8} lg={4}><Card size="small"><Statistic title={<span><BankOutlined /> Tồn quỹ</span>} value={fmtTy(d.cashTotalVnd)} valueStyle={{ color: '#1E3A5F', fontWeight: 800, fontSize: 19 }} />
            <Text type="secondary" style={{ fontSize: 11 }}>{fmtVnd(d.cashVnd)}đ + {fmtUsd(d.cashUsd)}</Text></Card></Col>
          <Col xs={12} md={8} lg={4}><Card size="small"><Statistic title="⬆ Phải thu" value={fmtTy(d.arTotalVnd)} valueStyle={{ color: '#16a34a', fontWeight: 800, fontSize: 19 }} />
            <Text type="secondary" style={{ fontSize: 11 }}>{fmtUsd(d.arUsd)} · {d.arCount} khoản</Text></Card></Col>
          <Col xs={12} md={8} lg={4}><Card size="small"><Statistic title="⬇ Dư nợ vay" value={fmtTy(d.loanRemaining)} valueStyle={{ color: '#dc2626', fontWeight: 800, fontSize: 19 }} /></Card></Col>
          <Col xs={12} md={8} lg={4}><Card size="small"><Statistic title="Room hạn mức" value={fmtTy(d.roomTotal)} valueStyle={{ color: d.roomTotal < 0 ? '#dc2626' : '#16a34a', fontWeight: 800, fontSize: 19 }} /></Card></Col>
          <Col xs={12} md={8} lg={4}><Card size="small"><Statistic title="🔒 Tiền gửi" value={fmtTy(d.depositTotal)} valueStyle={{ color: '#1677ff', fontWeight: 800, fontSize: 19 }} /></Card></Col>
          <Col xs={12} md={8} lg={4}><Card size="small"><Statistic title="🏛 Tài sản ĐB" value={fmtTy(d.collateralTotal)} valueStyle={{ color: '#7c3aed', fontWeight: 800, fontSize: 19 }} /></Card></Col>
        </Row>

        {d.shortfall.length > 0 && (
          <Alert type="warning" showIcon style={{ marginBottom: 12 }} icon={<FallOutlined />}
            message={<span><b>Cảnh báo thiếu hụt dòng tiền</b> — tồn dự kiến âm ở {d.shortfall.length} tuần (sớm nhất {d.shortfall[0].label}). Cần thu hồi công nợ / giãn chi / dùng room hạn mức.</span>} />
        )}

        {/* Bảng dòng tiền theo tuần */}
        <Card size="small" title={<span>Dự báo dòng tiền {WEEKS} tuần tới {d.asOf ? <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>· tồn quỹ cập nhật {dayjs(d.asOf).format('DD/MM/YYYY')}</Text> : null}</span>}
          styles={{ body: { padding: 0 } }}>
          <Table rowKey="label" size="small" columns={cfCols as any} dataSource={d.rows} pagination={false}
            loading={loading}
            summary={(data: readonly any[]) => {
              const sIn = data.reduce((s, r) => s + r.inV, 0), sOut = data.reduce((s, r) => s + r.out, 0)
              return (
                <Table.Summary.Row style={{ background: '#f8fafc', fontWeight: 800 }}>
                  <Table.Summary.Cell index={0}>TỔNG {WEEKS} tuần</Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right"><span style={{ color: '#16a34a' }}>{fmtVnd(sIn)}</span></Table.Summary.Cell>
                  <Table.Summary.Cell index={2} colSpan={3} />
                  <Table.Summary.Cell index={5} align="right"><span style={{ color: '#dc2626' }}>{fmtVnd(sOut)}</span></Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="right"><span style={{ color: sIn - sOut >= 0 ? '#16a34a' : '#dc2626' }}>{sIn - sOut >= 0 ? '+' : ''}{fmtVnd(sIn - sOut)}</span></Table.Summary.Cell>
                  <Table.Summary.Cell index={7} />
                </Table.Summary.Row>)
            }} />
          <div style={{ padding: '8px 12px', fontSize: 11, color: '#94a3b8' }}>
            Tiền vào = phải thu đến hạn (USD quy đổi ≈ {fmtVnd(usdRate)}đ). Tiền ra = gốc vay đến hạn + lãi đến kỳ + phải nộp định kỳ.
            Khoản quá hạn dồn vào "tuần này". Tồn dự kiến = tồn quỹ hiện tại cộng dồn Net.
          </div>
        </Card>
      </>}
    </div>
  )
}
