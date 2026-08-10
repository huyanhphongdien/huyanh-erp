// ============================================================================
// BILL OF EXCHANGE TAB — Hối phiếu (GĐ 4)
// File: src/pages/sales/components/BillOfExchangeTab.tsx
//
// Sinh Hối phiếu từ dữ liệu Hóa đơn + Đơn chiết khấu (số L/C, ngân hàng phát hành,
// kỳ hạn). Tự nạp khi mount (để "In tất cả" luôn sẵn). In→PDF + Tải Word.
// ============================================================================

import { useState, useEffect } from 'react'
import { Spin, Button, Space, Typography, Result, message } from 'antd'
import { PrinterOutlined, FileWordOutlined, FileDoneOutlined } from '@ant-design/icons'
import { documentService, type InvoiceData } from '../../../services/sales/documentService'
import { lcNegotiationService, type LcNegotiation } from '../../../services/sales/lcNegotiationService'
import { amountToWords } from '../../../services/sales/contractGeneratorService'
import { boeDoc, saveDocx, parseBankSwift } from '../../../services/sales/docxExport'

const { Title } = Typography

const fmtMoney = (v: number) =>
  (v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Suy kỳ hạn (số ngày) từ text payment terms, vd "LC 90 days from B/L date" -> 90
const parseTenorDays = (paymentTerms?: string): number | null => {
  if (!paymentTerms) return null
  const m = paymentTerms.match(/(\d+)\s*day/i)
  return m ? Number(m[1]) : null
}

export default function BillOfExchangeTab({ orderId, reloadKey, lotNo = 0 }: { orderId: string; reloadKey?: number; lotNo?: number }) {
  const [inv, setInv] = useState<InvoiceData | null>(null)
  const [neg, setNeg] = useState<LcNegotiation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [i, n] = await Promise.all([
          documentService.getInvoiceData(orderId, lotNo),
          lcNegotiationService.getByOrder(orderId, lotNo),
        ])
        if (cancelled) return
        setInv(i)
        setNeg(n)
      } catch (e: any) {
        if (!cancelled) { setError(true); message.error(e?.message || 'Lỗi tải Hối phiếu') }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [orderId, reloadKey, lotNo])   // reloadKey bump khi ĐNCK lưu → BOE nạp lại số L/C/tenor/NH mới

  if (loading) return <Spin tip="Loading..." />
  if (error || !inv) {
    return <Result icon={<FileDoneOutlined />} title="Bill of Exchange" subTitle="Chưa tải được dữ liệu" />
  }

  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  // Ngày lập Hối phiếu = ngày B/L (theo chuẩn); thiếu → ngày hóa đơn → hôm nay
  const drawSrc = inv.bl_date || inv.invoice_date
  const drawDate = drawSrc
    ? new Date(drawSrc).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : today
  // tenor: null = chưa rõ (để trống), 0 = AT SIGHT, N = usance. KHÔNG default 90.
  const tenorDays = neg?.term_days ?? parseTenorDays(inv.payment_terms)
  const issuingBank = neg?.issuing_bank || inv.consignee || ''
  const lcNo = neg?.lc_number || inv.lc_number || ''
  const lcDate = neg?.lc_date ? new Date(neg.lc_date).toLocaleDateString('en-GB') : ''
  // Số tiền draw = THE COST (CIF − cước − BH) nếu có tách cước/BH; không thì = trị giá Invoice. Khớp mẫu gốc.
  const drawAmount = (inv.freight > 0 || inv.insurance > 0) ? inv.the_cost : inv.total
  const words = amountToWords(drawAmount)
  // Phương thức: L/C (drawn under NH phát hành + L/C) vs D/P·D/A (drawn ON người mua, không L/C)
  const method = neg?.method || 'lc'
  const isDP = method !== 'lc'
  const drawnOn = inv.buyer_name || inv.customer.name || ''
  // D/P = at sight (0); D/A = usance (term_days); L/C giữ tenor suy từ payment terms
  const effTenor = isDP ? (method === 'da' ? (neg?.term_days ?? null) : 0) : tenorDays

  const bank = parseBankSwift(issuingBank)
  const invDate = inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString('en-GB') : ''
  const kv = (label: string, value: React.ReactNode, boldV = false) => (
    <tr>
      <td style={{ padding: '4px 6px 4px 0', width: '37%', verticalAlign: 'top' }}>{label}</td>
      <td style={{ padding: '4px 4px', verticalAlign: 'top', width: 12 }}>:</td>
      <td style={{ padding: '4px 6px', fontWeight: boldV ? 700 : 500 }}>{value}</td>
    </tr>
  )

  return (
    <div className="doc-print-area" id="boe-print" style={{ color: '#000', fontSize: 13 }}>
      <Title level={3} style={{ textAlign: 'center', marginBottom: 12 }}>BILL OF EXCHANGE</Title>

      <div>Hue City, {drawDate}</div>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>FOR: USD {fmtMoney(drawAmount)}</div>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        {effTenor == null
          ? 'AT ______ DAYS FROM BILL OF LADING DATE'
          : effTenor === 0
            ? 'AT SIGHT'
            : `AT ${effTenor} DAYS FROM BILL OF LADING DATE   -   ${drawDate}`}
      </div>
      <div style={{ fontStyle: 'italic', marginBottom: 14 }}>
        of this First Bill of Exchange (Second of the same tenor and date being unpaid)
      </div>

      <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
        <tbody>
          {kv('Pay To The Order Of', inv.bank_info.name)}
          {kv('The Sum Of SAY (US DOLLARS)', <span style={{ textTransform: 'uppercase' }}>{words}</span>)}
          {kv('Value received as per our Invoice(s) No(s)', `${inv.invoice_code}       Date: ${invDate}`)}
          {isDP ? (
            <>
              {kv('Drawn on', drawnOn)}
              {bank.swift && kv('Swift code', bank.swift)}
              {kv('TO', bank.name, true)}
            </>
          ) : (
            <>
              {kv('Drawn under', bank.name)}
              {bank.swift && kv('Swift code', bank.swift)}
              {kv('L/C NUMBER', `${lcNo}${lcDate ? `        L/C DATE: ${lcDate}` : ''}`)}
              {kv('TO', bank.name, true)}
            </>
          )}
        </tbody>
      </table>

      <div style={{ marginTop: 40, textAlign: 'center' }}>
        <div style={{ fontWeight: 700 }}>HUY ANH RUBBER COMPANY LIMITED</div>
        <div style={{ height: 56 }} />
        <div style={{ fontWeight: 700 }}>PHÓ GIÁM ĐỐC</div>
        <div style={{ fontWeight: 700 }}>Lê Xuân Hồng Trung</div>
      </div>

      <div className="no-print" style={{ marginTop: 24, textAlign: 'center' }}>
        <Space>
          <Button type="primary" icon={<PrinterOutlined />} size="large" onClick={() => window.print()}>
            In / Lưu PDF
          </Button>
          <Button icon={<FileWordOutlined />} size="large"
            onClick={() => saveDocx(boeDoc({
              amount: drawAmount, ourBank: inv.bank_info.name, issuingBank,
              invoiceRef: inv.invoice_code, invoiceDate: inv.invoice_date,
              tenorDays: effTenor, lcNumber: lcNo, lcDate, today: drawDate,
              method: (method as 'lc' | 'dp' | 'da'), drawnOn,
            }), `${inv.invoice_code}_BOE`).catch(() => message.error('Lỗi xuất Word'))}>
            Tải Word (.docx)
          </Button>
        </Space>
      </div>
    </div>
  )
}
