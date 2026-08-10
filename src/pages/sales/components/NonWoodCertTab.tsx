// ============================================================================
// NON-WOOD PACKING CERTIFICATE TAB (GĐ5) — người bán tự khai không dùng bao bì gỗ
// File: src/pages/sales/components/NonWoodCertTab.tsx
// ============================================================================

import { useState, useEffect, type ReactNode } from 'react'
import { Spin, Button, Space, Typography, Result, message } from 'antd'
import { PrinterOutlined, FileWordOutlined, FileProtectOutlined } from '@ant-design/icons'
import { documentService, type NonWoodCertData } from '../../../services/sales/documentService'
import { nonWoodCertDoc, saveDocx } from '../../../services/sales/docxExport'
import DocLetterhead from './DocLetterhead'

const { Title, Text } = Typography
const fmtD = (s?: string) => (s ? new Date(s).toLocaleDateString('en-GB') : '')
const fmtKg = (v: number) => `${(v || 0).toFixed(2)} KGS`   // KHÔNG dấu phẩy — khớp bản Word

export default function NonWoodCertTab({ orderId, lotNo = 0 }: { orderId: string; lotNo?: number }) {
  const [d, setD] = useState<NonWoodCertData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const r = await documentService.getNonWoodCertData(orderId, lotNo)
        if (!cancelled) setD(r)
      } catch (e: any) {
        if (!cancelled) { setError(true); message.error(e?.message || 'Lỗi tải Non-Wood Certificate') }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [orderId, lotNo])

  if (loading) return <Spin tip="Loading..." />
  if (error || !d) return <Result icon={<FileProtectOutlined />} title="Non-Wood Packing Certificate" subTitle="Chưa tải được dữ liệu" />

  const row = (k: string, v: ReactNode) => (
    <tr>
      <td style={{ padding: '5px 8px', width: '34%', verticalAlign: 'top', color: '#444' }}>{k}</td>
      <td style={{ padding: '5px 8px', fontWeight: 500 }}>: {v}</td>
    </tr>
  )

  return (
    <div className="doc-print-area">
      <DocLetterhead />
      <Title level={3} style={{ textAlign: 'center', marginBottom: 4 }}>CERTIFICATE OF NON-WOOD PACKING MATERIAL</Title>
      <div style={{ textAlign: 'right', marginBottom: 16 }}>
        <div>No: {d.cert_no}</div>
        <div>Date: {fmtD(d.date)}</div>
      </div>

      <div style={{ marginBottom: 6 }}>
        <Text strong>THE SELLER: </Text>HUY ANH RUBBER COMPANY LIMITED
        <br /><Text>ADDRESS: KHE MA, PHONG DIEN WARD, HUE CITY, VIETNAM</Text>
      </div>
      <div style={{ marginBottom: 10 }}>
        <Text strong>THE BUYER: </Text>{d.buyer_name}
        <br /><Text>ADDRESS: {d.buyer_address}</Text>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <tbody>
          {row('COMMODITY', d.commodity)}
          {row('COUNTRY OF ORIGIN', d.country_of_origin)}
          {d.packing_desc ? row('PACKING', d.packing_desc) : null}
          {d.total_packing ? row('TOTAL', d.total_packing) : null}
          {row('NET WEIGHT', fmtKg(d.net_weight_kg))}
          {row('GROSS WEIGHT', fmtKg(d.gross_weight_kg))}
          {row('VESSEL', d.vessel || '—')}
          {row('PORT OF LOADING', d.port_of_loading || '—')}
          {row('PORT OF DISCHARGE', d.port_of_destination || '—')}
          {row('BILL OF LADING NUMBER', d.bl_number || '—')}
          {row('CONTRACT NO.', d.contract_no)}
          {row('INVOICE NO.', d.invoice_no)}
        </tbody>
      </table>

      <p style={{ marginTop: 16 }}>
        WE, <b>HUY ANH RUBBER COMPANY LIMITED</b> CERTIFY THAT {d.quantity_tons.toFixed(2).replace(/\.00$/, '')} MT OF NATURAL RUBBER {d.grade_label},
        NO WOODEN PACKING MATERIAL USED IN THE WHOLE OF SHIPMENT OF GOODS.
      </p>

      <div style={{ marginTop: 40, textAlign: 'right' }}>
        <Text strong>HUY ANH RUBBER COMPANY LIMITED</Text>
        <div style={{ height: 56 }} />
        <Text strong>PHÓ GIÁM ĐỐC</Text>
        <div><Text strong>Lê Xuân Hồng Trung</Text></div>
      </div>

      <div className="no-print" style={{ marginTop: 24, textAlign: 'center' }}>
        <Space>
          <Button type="primary" icon={<PrinterOutlined />} size="large" onClick={() => window.print()}>
            In / Lưu PDF
          </Button>
          <Button icon={<FileWordOutlined />} size="large"
            onClick={() => saveDocx(nonWoodCertDoc(d), `${d.cert_no.replace(/\//g, '-')}_NW`).catch(() => message.error('Lỗi xuất Word'))}>
            Tải Word (.docx)
          </Button>
        </Space>
      </div>
    </div>
  )
}
