// ============================================================================
// BENEFICIARY'S CERTIFICATE TAB (GĐ5) — người bán tự khai đã email bộ copy
// File: src/pages/sales/components/BeneficiaryCertTab.tsx
// ============================================================================

import { useState, useEffect, type ReactNode } from 'react'
import { Spin, Button, Space, Typography, Result, message } from 'antd'
import { PrinterOutlined, FileWordOutlined, FileProtectOutlined } from '@ant-design/icons'
import { documentService, type BeneficiaryCertData } from '../../../services/sales/documentService'
import { beneficiaryCertDoc, saveDocx } from '../../../services/sales/docxExport'

const { Title, Text } = Typography
const fmtD = (s?: string) => (s ? new Date(s).toLocaleDateString('en-GB') : '')

export default function BeneficiaryCertTab({ orderId, lotNo = 0 }: { orderId: string; lotNo?: number }) {
  const [d, setD] = useState<BeneficiaryCertData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const r = await documentService.getBeneficiaryCertData(orderId, lotNo)
        if (!cancelled) setD(r)
      } catch (e: any) {
        if (!cancelled) { setError(true); message.error(e?.message || 'Lỗi tải Beneficiary Certificate') }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [orderId, lotNo])

  if (loading) return <Spin tip="Loading..." />
  if (error || !d) return <Result icon={<FileProtectOutlined />} title="Beneficiary's Certificate" subTitle="Chưa tải được dữ liệu" />

  const row = (k: string, v: ReactNode) => (
    <tr>
      <td style={{ padding: '5px 8px', width: '34%', verticalAlign: 'top', color: '#444' }}>{k}</td>
      <td style={{ padding: '5px 8px', fontWeight: 500 }}>: {v}</td>
    </tr>
  )

  return (
    <div className="doc-print-area">
      <Title level={3} style={{ textAlign: 'center', marginBottom: 4 }}>BENEFICIARY'S CERTIFICATE</Title>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <Text>No.: {d.cert_no}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Date: {fmtD(d.date)}</Text>
      </div>

      <div style={{ marginBottom: 10 }}>
        <Text strong>THE BUYER/APPLICANT: </Text>{d.buyer_name}
        <br /><Text>ADDRESS: {d.buyer_address}</Text>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <tbody>
          {row('BILL OF LADING NO.', d.bl_number || '—')}
          {row('SHIPPED ON BOARD', fmtD(d.shipped_on_board) || '—')}
          {row('VESSEL/VOYAGE', d.vessel || '—')}
          {row('PORT OF LOADING', d.port_of_loading || '—')}
          {row('PORT OF DISCHARGE', d.port_of_destination || '—')}
          {row('L/C NO', `${d.lc_number || '—'}${d.lc_date ? `   DATE: ${fmtD(d.lc_date)}` : ''}`)}
          {d.buyer_email ? row('EMAIL ADDRESS', d.buyer_email) : null}
        </tbody>
      </table>

      <p style={{ marginTop: 16 }}>
        We, <b>HUY ANH RUBBER COMPANY LIMITED</b> CERTIFY THAT, a set of copy documents had been emailed
        to the applicant within 03 days from shipment.
      </p>

      <div style={{ marginTop: 40, textAlign: 'right' }}>
        <Text strong>HUY ANH RUBBER COMPANY LIMITED</Text>
        <div style={{ height: 56 }} />
        <Text strong>GENERAL DIRECTOR</Text>
      </div>

      <div className="no-print" style={{ marginTop: 24, textAlign: 'center' }}>
        <Space>
          <Button type="primary" icon={<PrinterOutlined />} size="large" onClick={() => window.print()}>
            In / Lưu PDF
          </Button>
          <Button icon={<FileWordOutlined />} size="large"
            onClick={() => saveDocx(beneficiaryCertDoc(d), `${d.cert_no.replace(/\//g, '-')}_BC`).catch(() => message.error('Lỗi xuất Word'))}>
            Tải Word (.docx)
          </Button>
        </Space>
      </div>
    </div>
  )
}
