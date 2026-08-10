// ============================================================================
// EXPORT DOCUMENTS PAGE — COA, Packing List, Commercial Invoice
// File: src/pages/sales/ExportDocumentsPage.tsx
// Module Bán hàng quốc tế — Huy Anh Rubber ERP
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card,
  Tabs,
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Row,
  Col,
  Spin,
  Breadcrumb,
  message,
  Divider,
  Descriptions,
  Result,
  Segmented,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  PrinterOutlined,
  FileTextOutlined,
  FileDoneOutlined,
  FileWordOutlined,
  SafetyCertificateOutlined,
  ContainerOutlined,
  DollarOutlined,
} from '@ant-design/icons'
import { salesOrderService } from '../../services/sales/salesOrderService'
import { documentService } from '../../services/sales/documentService'
import { invoiceDoc, packingListDoc, weightListDoc, saveDocx } from '../../services/sales/docxExport'
import { amountToWords } from '../../services/sales/contractGeneratorService'
import BillOfExchangeTab from './components/BillOfExchangeTab'
import LcNegotiationTab from './components/LcNegotiationTab'
import BeneficiaryCertTab from './components/BeneficiaryCertTab'
import NonWoodCertTab from './components/NonWoodCertTab'
import DocLetterhead from './components/DocLetterhead'
import type { COAData, PackingListData, InvoiceData, WeightListData } from '../../services/sales/documentService'
import type { SalesOrder } from '../../services/sales/salesTypes'
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, soDisplayCode } from '../../services/sales/salesTypes'

const { Title, Text, Paragraph } = Typography

// ============================================================================
// COMPANY HEADER (shared)
// ============================================================================

// Letterhead khớp HỆT mẫu chứng từ thật (LOGO trái + info phải) — dùng chung DocLetterhead
const CompanyHeader = DocLetterhead

// ── Ô "DESCRIPTION OF GOODS AND/OR SERVICE" — DÙNG CHUNG Invoice / Packing List (khớp mẫu) ──
type DescLike = {
  quantity_tons: number; grade: string
  proforma_no?: string; proforma_date?: string
  packing_desc?: string; total_packing?: string
  net_weight_kg: number; gross_weight_kg: number
  item_no?: string; lc_number?: string | null; lc_date?: string | null
  hs_code: string; country_of_origin: string
  invoice_extra_lines?: string; shipping_marks?: string
  po_number?: string | null; attn_contacts?: string
}
const fmtDotDate = (s?: string | null) => {
  if (!s) return ''
  const dt = new Date(s); if (isNaN(dt.getTime())) return s
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(dt.getDate())}.${p(dt.getMonth() + 1)}.${dt.getFullYear()}`
}
function buildInvoiceDescNodes(d: DescLike): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const n2kg = (v: number) => (v || 0).toFixed(2)
  const qty = d.quantity_tons.toFixed(2).replace(/\.00$/, '')
  out.push(<div key="c" style={{ fontWeight: 700 }}>{qty} MT -&nbsp; NATURAL RUBBER {(d.grade || '').replace(/_/g, ' ')}.</div>)
  if (d.proforma_no) out.push(<div key="pf">AS PER PROFORMA INVOICE NO.{d.proforma_no}</div>)
  if (d.proforma_date) out.push(<div key="pfd">DATED {fmtDotDate(d.proforma_date)}</div>)
  if (d.packing_desc) out.push(<div key="pk">PACKING: {d.packing_desc}</div>)
  if (d.total_packing) out.push(<div key="tpk">TOTAL PACKING: {d.total_packing}</div>)
  out.push(<div key="nw">NET WEIGHT: {n2kg(d.net_weight_kg)} KGS</div>)
  out.push(<div key="gw">GROSS WEIGHT: {n2kg(d.gross_weight_kg)} KGS</div>)
  if (d.item_no) out.push(<div key="it">ITEM NO.: {d.item_no}</div>)
  if (d.lc_number) out.push(<div key="lc">LC NO: {d.lc_number}{d.lc_date ? `   DATE: ${fmtDotDate(d.lc_date)}` : ''}</div>)
  out.push(<div key="hs">HS CODE: {d.hs_code}</div>)
  out.push(<div key="pr">PRODUCER: HUY ANH RUBBER COMPANY LIMITED</div>)
  out.push(<div key="co">COUNTRY OF ORIGIN: {d.country_of_origin}</div>)
  if (d.invoice_extra_lines) d.invoice_extra_lines.split('\n').filter((l) => l.trim()).forEach((l, i) => out.push(<div key={'ex' + i}>{l.trim()}</div>))
  out.push(<div key="sp1" style={{ height: 8 }} />)
  out.push(<div key="smh" style={{ fontWeight: 700 }}>SHIPPING MARK</div>)
  if (d.shipping_marks) d.shipping_marks.split('\n').forEach((l, i) => out.push(<div key={'sm' + i}>{l}</div>))
  if (d.po_number) out.push(<div key="po">PO NO: {d.po_number}</div>)
  if (d.attn_contacts) { out.push(<div key="attn">Attn:</div>); d.attn_contacts.split('\n').filter((l) => l.trim()).forEach((l, i) => out.push(<div key={'at' + i}>{l.trim()}</div>)) }
  return out
}

// ============================================================================
// COA TAB
// ============================================================================

interface COATabProps {
  data: COAData | null
  loading: boolean
  onGenerate: () => void
}

const COATab = ({ data, loading, onGenerate }: COATabProps) => {
  if (loading) return <Spin tip="Loading..." />
  if (!data) {
    return (
      <Result
        icon={<SafetyCertificateOutlined />}
        title="Certificate of Analysis"
        subTitle="Click button below to generate COA data"
        extra={<Button type="primary" onClick={onGenerate}>Generate COA</Button>}
      />
    )
  }

  // Compute average across batches
  const avg = (field: keyof COAData['batch_results'][0]) => {
    const vals = data.batch_results.map((b) => b[field]).filter((v): v is number => v !== null && v !== undefined)
    if (vals.length === 0) return null
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }

  const avgDrc = avg('drc')
  const avgMoisture = avg('moisture')
  const avgVolatile = avg('volatile')
  const avgAsh = avg('ash')
  const avgNitrogen = avg('nitrogen')
  const avgDirt = avg('dirt')
  const avgPri = avg('pri')
  const avgMooney = avg('mooney')
  const avgColor = avg('color')

  const std = data.grade_standard

  const parameters = [
    { name: 'Dry Rubber Content (DRC)', result: avgDrc, standard: `>= ${std.drc_min}%`, pass: avgDrc !== null && avgDrc >= std.drc_min, unit: '%' },
    { name: 'Moisture Content', result: avgMoisture, standard: `<= ${std.moisture_max}%`, pass: avgMoisture !== null && avgMoisture <= std.moisture_max, unit: '%' },
    { name: 'Volatile Matter', result: avgVolatile, standard: `<= ${std.volatile_max}%`, pass: avgVolatile !== null && avgVolatile <= std.volatile_max, unit: '%' },
    { name: 'Ash Content', result: avgAsh, standard: `<= ${std.ash_max}%`, pass: avgAsh !== null && avgAsh <= std.ash_max, unit: '%' },
    { name: 'Nitrogen Content', result: avgNitrogen, standard: `<= ${std.nitrogen_max}%`, pass: avgNitrogen !== null && avgNitrogen <= std.nitrogen_max, unit: '%' },
    { name: 'Dirt Content', result: avgDirt, standard: `<= ${std.dirt_max}%`, pass: avgDirt !== null && avgDirt <= std.dirt_max, unit: '%' },
    { name: 'Plasticity Retention Index (PRI)', result: avgPri, standard: std.pri_min ? `>= ${std.pri_min}` : 'N/A', pass: std.pri_min === null || (avgPri !== null && avgPri >= std.pri_min), unit: '' },
    { name: 'Mooney Viscosity', result: avgMooney, standard: std.mooney_max ? `<= ${std.mooney_max}` : 'N/A', pass: std.mooney_max === null || (avgMooney !== null && avgMooney <= std.mooney_max), unit: '' },
    { name: 'Color (Lovibond)', result: avgColor, standard: std.color_lovibond_max ? `<= ${std.color_lovibond_max}` : 'N/A', pass: std.color_lovibond_max === null || (avgColor !== null && avgColor <= std.color_lovibond_max), unit: '' },
  ]

  const columns: ColumnsType<typeof parameters[0]> = [
    { title: 'Parameter', dataIndex: 'name', key: 'name', width: 250 },
    {
      title: 'Result', key: 'result', width: 120, align: 'center',
      render: (_, r) => r.result !== null ? `${r.result.toFixed(2)}${r.unit}` : '-',
    },
    { title: 'Standard', dataIndex: 'standard', key: 'standard', width: 150, align: 'center' },
    {
      title: 'Status', key: 'status', width: 100, align: 'center',
      render: (_, r) => {
        if (r.standard === 'N/A') return <Tag>N/A</Tag>
        return r.pass
          ? <Tag color="success" icon={<CheckCircleOutlined />}>PASS</Tag>
          : <Tag color="error">FAIL</Tag>
      },
    },
  ]

  return (
    <div className="doc-print-area" id="coa-print">
      <CompanyHeader />

      <Title level={3} style={{ textAlign: 'center', marginBottom: 24 }}>
        CERTIFICATE OF ANALYSIS
      </Title>

      <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Sales Order">{data.order_code}</Descriptions.Item>
        <Descriptions.Item label="Customer">{data.customer_name}</Descriptions.Item>
        <Descriptions.Item label="Grade">{data.grade?.replace(/_/g, ' ')}</Descriptions.Item>
        <Descriptions.Item label="Quantity">{data.quantity_tons} MT</Descriptions.Item>
        <Descriptions.Item label="Test Date">{data.test_date}</Descriptions.Item>
        <Descriptions.Item label="No. of Batches">{data.batch_results.length}</Descriptions.Item>
      </Descriptions>

      <Title level={5} style={{ marginTop: 16, marginBottom: 8 }}>
        Quality Test Results (Average of {data.batch_results.length} batch{data.batch_results.length > 1 ? 'es' : ''})
      </Title>

      <Table
        dataSource={parameters}
        columns={columns}
        rowKey="name"
        pagination={false}
        size="small"
        bordered
      />

      <Divider />

      <Row justify="space-between" align="middle">
        <Col>
          <Title level={5} style={{ margin: 0 }}>
            Overall Result:{' '}
            <Tag color={data.result === 'PASS' ? 'success' : 'error'} style={{ fontSize: 16, padding: '4px 16px' }}>
              {data.result}
            </Tag>
          </Title>
        </Col>
      </Row>

      {data.batch_results.length > 1 && (
        <>
          <Title level={5} style={{ marginTop: 24, marginBottom: 8 }}>Batch Detail</Title>
          <Table
            dataSource={data.batch_results}
            rowKey="batch_no"
            pagination={false}
            size="small"
            bordered
            columns={[
              { title: 'Batch No.', dataIndex: 'batch_no', key: 'batch_no' },
              { title: 'DRC %', dataIndex: 'drc', key: 'drc', render: (v: number) => v?.toFixed(2) },
              { title: 'Moisture %', dataIndex: 'moisture', key: 'moisture', render: (v: number) => v?.toFixed(2) },
              { title: 'Volatile %', dataIndex: 'volatile', key: 'volatile', render: (v: number) => v?.toFixed(2) },
              { title: 'Ash %', dataIndex: 'ash', key: 'ash', render: (v: number) => v?.toFixed(3) },
              { title: 'Nitrogen %', dataIndex: 'nitrogen', key: 'nitrogen', render: (v: number) => v?.toFixed(3) },
              { title: 'Dirt %', dataIndex: 'dirt', key: 'dirt', render: (v: number) => v?.toFixed(3) },
              { title: 'PRI', dataIndex: 'pri', key: 'pri', render: (v: number | null) => v?.toFixed(0) ?? '-' },
            ]}
          />
        </>
      )}

      <div style={{ marginTop: 48, display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ textAlign: 'center', width: 250 }}>
          <Divider style={{ borderColor: '#000', marginBottom: 4 }} />
          <Text strong>Quality Control Manager</Text>
        </div>
        <div style={{ textAlign: 'center', width: 250 }}>
          <Divider style={{ borderColor: '#000', marginBottom: 4 }} />
          <Text strong>General Director</Text>
        </div>
      </div>

      <div className="no-print" style={{ marginTop: 24, textAlign: 'center' }}>
        <Button type="primary" icon={<PrinterOutlined />} size="large" onClick={() => window.print()}>
          Print COA
        </Button>
      </div>
    </div>
  )
}

// ============================================================================
// PACKING LIST TAB
// ============================================================================

interface PackingListTabProps {
  data: PackingListData | null
  loading: boolean
  onGenerate: () => void
}

const PackingListTab = ({ data, loading, onGenerate }: PackingListTabProps) => {
  if (loading) return <Spin tip="Loading..." />
  if (!data) {
    return (
      <Result
        icon={<ContainerOutlined />}
        title="Packing List"
        subTitle="Click button below to generate Packing List data"
        extra={<Button type="primary" onClick={onGenerate}>Generate Packing List</Button>}
      />
    )
  }

  // Định dạng khớp mẫu PKL
  const bd = '1px solid #000'
  const cell: React.CSSProperties = { border: bd, padding: '3px 6px', fontSize: 12.5, verticalAlign: 'middle' }
  const hcell: React.CSSProperties = { ...cell, fontWeight: 700, textAlign: 'center' }
  const fmtd = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en-GB') : '')
  const kgs = (v: number) => String(Math.round(v || 0))
  const netMts = (data.net_weight_kg / 1000).toFixed(2)
  const grossMts = (data.gross_weight_kg / 1000).toFixed(2)
  const vessel = `${data.vessel_name || ''}${data.voyage_number ? ' ' + data.voyage_number : ''}`.trim() || '—'
  const descNodes = buildInvoiceDescNodes(data)
  // NO restart theo lô
  let no = 0, prevLot: number | null = null

  return (
    <div className="doc-print-area" id="packing-list-print" style={{ color: '#000', fontSize: 12.5 }}>
      <CompanyHeader />

      <Title level={3} style={{ textAlign: 'center', margin: '0 0 6px' }}>PACKING LIST</Title>
      <div style={{ textAlign: 'right', marginBottom: 10 }}>
        <div>No: {data.pkl_no}</div>
        <div>Date: {fmtd(data.date)}</div>
      </div>

      <div style={{ marginBottom: 10, lineHeight: 1.5 }}>
        <div><b>THE SELLER/THE BENEFICIARY: </b>HUY ANH RUBBER COMPANY LIMITED</div>
        <div>ADDRESS: KHE MA, PHONG DIEN WARD, HUE CITY, VIETNAM</div>
        <div style={{ marginTop: 4 }}><b>THE BUYER/THE APPLICANT: </b>{data.buyer_name || data.customer_name}</div>
        <div>ADDRESS: {data.buyer_address || data.customer_address}</div>
      </div>

      {/* Ref invoice 5 cột */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>
          {['COMMERCIAL INVOICE', 'BILL OF LADING NUMBER', 'VESSEL', 'PORT OF LOADING', 'PORT OF DISCHARGE'].map((h) => (
            <th key={h} style={{ ...hcell, fontSize: 11 }}>{h}</th>
          ))}
        </tr></thead>
        <tbody><tr style={{ textAlign: 'center' }}>
          <td style={cell}>{data.invoice_code}</td>
          <td style={cell}>{data.bl_number || '—'}</td>
          <td style={cell}>{vessel}</td>
          <td style={cell}>{data.port_of_loading || '—'}</td>
          <td style={cell}>{data.port_of_destination || '—'}</td>
        </tr></tbody>
      </table>

      {/* Bảng container */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
        <thead><tr>
          {['NO', 'CONTAINER NO', 'SEAL NO', 'NET WEIGHT (KGS)', 'GROSS WEIGHT (KGS)'].map((h) => (
            <th key={h} style={{ ...hcell, fontSize: 11 }}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {data.containers.map((c, i) => {
            const lot = c.lot_no ?? 0
            if (lot !== prevLot) { no = 1; prevLot = lot } else { no += 1 }
            return (
              <tr key={i} style={{ textAlign: 'center' }}>
                <td style={cell}>{no}</td>
                <td style={cell}>{c.container_no}</td>
                <td style={cell}>{c.seal_no}</td>
                <td style={cell}>{kgs(c.net_weight_kg)}</td>
                <td style={cell}>{kgs(c.gross_weight_kg)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Bảng mô tả 3 cột */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, tableLayout: 'fixed' }}>
        <colgroup><col style={{ width: '70%' }} /><col style={{ width: '15%' }} /><col style={{ width: '15%' }} /></colgroup>
        <thead><tr>
          <th style={hcell}>DESCRIPTION OF GOODS AND/OR SERVICE</th>
          <th style={{ ...hcell, fontSize: 11 }}>NET WEIGHT (MTS)</th>
          <th style={{ ...hcell, fontSize: 11 }}>GROSS WEIGHT (MTS)</th>
        </tr></thead>
        <tbody>
          <tr>
            <td style={{ ...cell, verticalAlign: 'top', lineHeight: 1.45 }}>{descNodes}</td>
            <td style={{ ...cell, textAlign: 'center' }}>{netMts}</td>
            <td style={{ ...cell, textAlign: 'center' }}>{grossMts}</td>
          </tr>
          <tr>
            <td style={{ ...cell, textAlign: 'center', fontWeight: 700 }}>TOTAL</td>
            <td style={{ ...cell, textAlign: 'center' }}>{netMts}</td>
            <td style={{ ...cell, textAlign: 'center' }}>{grossMts}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: 40, textAlign: 'right' }}>
        <div style={{ fontWeight: 700 }}>HUY ANH RUBBER COMPANY LIMITED</div>
        <div style={{ height: 64 }} />
        <div style={{ fontWeight: 700 }}>PHÓ GIÁM ĐỐC</div>
        <div style={{ fontWeight: 700 }}>Lê Xuân Hồng Trung</div>
      </div>

      <div className="no-print" style={{ marginTop: 24, textAlign: 'center' }}>
        <Space>
          <Button type="primary" icon={<PrinterOutlined />} size="large" onClick={() => window.print()}>
            In / Lưu PDF
          </Button>
          <Button icon={<FileWordOutlined />} size="large"
            onClick={() => saveDocx(packingListDoc(data), `${data.order_code}_PKL`).catch(() => message.error('Lỗi xuất Word'))}>
            Tải Word (.docx)
          </Button>
        </Space>
      </div>
    </div>
  )
}

// ============================================================================
// WEIGHT LIST TAB
// ============================================================================

interface WeightListTabProps {
  data: WeightListData | null
  loading: boolean
  onGenerate: () => void
}

const WeightListTab = ({ data, loading, onGenerate }: WeightListTabProps) => {
  if (loading) return <Spin tip="Loading..." />
  if (!data) {
    return (
      <Result
        icon={<FileDoneOutlined />}
        title="Weight List"
        subTitle="Click button below to generate Weight List data"
        extra={<Button type="primary" onClick={onGenerate}>Generate Weight List</Button>}
      />
    )
  }
  const fmt = (v: number) => (v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
  return (
    <div className="doc-print-area" id="weight-list-print">
      <CompanyHeader />
      <Title level={3} style={{ textAlign: 'center', marginBottom: 24 }}>WEIGHT LIST</Title>

      <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Sales Order">{data.order_code}</Descriptions.Item>
        <Descriptions.Item label="Buyer">{data.buyer_name}</Descriptions.Item>
        {data.consignee && <Descriptions.Item label="Consignee" span={2}>{data.consignee}</Descriptions.Item>}
        <Descriptions.Item label="Commodity">Natural Rubber {data.grade?.replace(/_/g, ' ')}</Descriptions.Item>
        <Descriptions.Item label="Vessel">{data.vessel_name || 'TBD'}</Descriptions.Item>
        <Descriptions.Item label="B/L No.">{data.bl_number || 'TBD'}</Descriptions.Item>
        <Descriptions.Item label="ETD">{data.etd || 'TBD'}</Descriptions.Item>
        <Descriptions.Item label="Port of Loading">{data.port_of_loading || 'TBD'}</Descriptions.Item>
        <Descriptions.Item label="Port of Destination">{data.port_of_destination || 'TBD'}</Descriptions.Item>
      </Descriptions>

      <Table
        dataSource={data.containers}
        rowKey="container_no"
        pagination={false}
        size="small"
        bordered
        columns={[
          { title: 'Container No.', dataIndex: 'container_no', key: 'c', width: 160 },
          { title: 'Seal No.', dataIndex: 'seal_no', key: 's', width: 140 },
          { title: 'Bales', dataIndex: 'bale_count', key: 'b', align: 'right', render: (v: number) => fmt(v) },
          { title: 'Net Weight (KG)', dataIndex: 'net_weight_kg', key: 'n', align: 'right', render: (v: number) => fmt(v) },
          { title: 'Tare Weight (KG)', dataIndex: 'tare_weight_kg', key: 't', align: 'right', render: (v: number) => fmt(v) },
          { title: 'Gross Weight (KG)', dataIndex: 'gross_weight_kg', key: 'g', align: 'right', render: (v: number) => fmt(v) },
        ]}
        summary={() => (
          <Table.Summary fixed>
            <Table.Summary.Row style={{ fontWeight: 'bold', background: '#fafafa' }}>
              <Table.Summary.Cell index={0} colSpan={2}>TOTAL</Table.Summary.Cell>
              <Table.Summary.Cell index={2} align="right">{fmt(data.total_bales)}</Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right">{fmt(data.total_net)}</Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right">{fmt(data.total_tare)}</Table.Summary.Cell>
              <Table.Summary.Cell index={5} align="right">{fmt(data.total_gross)}</Table.Summary.Cell>
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />

      {data.shipping_marks && (
        <div style={{ marginTop: 16 }}>
          <Title level={5}>Shipping Marks</Title>
          <Paragraph style={{ whiteSpace: 'pre-line' }}>{data.shipping_marks}</Paragraph>
        </div>
      )}

      <div style={{ marginTop: 48, display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ textAlign: 'center', width: 250 }}>
          <Divider style={{ borderColor: '#000', marginBottom: 4 }} />
          <Text strong>Warehouse Manager</Text>
        </div>
        <div style={{ textAlign: 'center', width: 250 }}>
          <Divider style={{ borderColor: '#000', marginBottom: 4 }} />
          <Text strong>General Director</Text>
        </div>
      </div>

      <div className="no-print" style={{ marginTop: 24, textAlign: 'center' }}>
        <Space>
          <Button type="primary" icon={<PrinterOutlined />} size="large" onClick={() => window.print()}>
            In / Lưu PDF
          </Button>
          <Button icon={<FileWordOutlined />} size="large"
            onClick={() => saveDocx(weightListDoc(data), `${data.order_code}_WL`).catch(() => message.error('Lỗi xuất Word'))}>
            Tải Word (.docx)
          </Button>
        </Space>
      </div>
    </div>
  )
}

// ============================================================================
// INVOICE TAB
// ============================================================================

interface InvoiceTabProps {
  data: InvoiceData | null
  loading: boolean
  onGenerate: () => void
}

const InvoiceTab = ({ data, loading, onGenerate }: InvoiceTabProps) => {
  if (loading) return <Spin tip="Loading..." />
  if (!data) {
    return (
      <Result
        icon={<DollarOutlined />}
        title="Commercial Invoice"
        subTitle="Click button below to generate Invoice data"
        extra={<Button type="primary" onClick={onGenerate}>Generate Invoice</Button>}
      />
    )
  }

  // ── Định dạng khớp HỆT mẫu gốc (INV) ──
  const n2 = (v: number) => (v || 0).toFixed(2)
  const qtyFmt = data.quantity_tons.toFixed(2)
  const priceFmt = Number.isInteger(data.unit_price) ? String(data.unit_price) : data.unit_price.toFixed(2)
  const pod = data.port_of_destination || ''
  const fmtd = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en-GB') : '')
  const bd = '1px solid #000'
  const cell: React.CSSProperties = { border: bd, padding: '3px 6px', fontSize: 12.5, verticalAlign: 'middle' }
  const hcell: React.CSSProperties = { ...cell, fontWeight: 700, textAlign: 'center' }

  // Ô mô tả hàng — dùng chung với PKL
  const descLines = buildInvoiceDescNodes(data)

  return (
    <div className="doc-print-area" id="invoice-print" style={{ color: '#000', fontSize: 12.5 }}>
      <CompanyHeader />

      <Title level={3} style={{ textAlign: 'center', margin: '0 0 6px' }}>COMMERCIAL INVOICE</Title>
      <div style={{ textAlign: 'right', marginBottom: 10 }}>
        <div>No: {data.invoice_code}</div>
        <div>Date: {fmtd(data.invoice_date)}</div>
      </div>

      <div style={{ marginBottom: 10, lineHeight: 1.5 }}>
        <div><b>THE SELLER/THE BENEFICIARY: </b>HUY ANH RUBBER COMPANY LIMITED</div>
        <div>ADDRESS: KHE MA, PHONG DIEN WARD, HUE CITY, VIETNAM</div>
        <div style={{ marginTop: 4 }}><b>THE BUYER/THE APPLICANT: </b>{data.buyer_name || data.customer.name}</div>
        <div>ADDRESS: {data.buyer_address || data.customer.address}</div>
      </div>

      {/* Bảng shipment 6 cột */}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>
          {['CONTRACT NO', 'SHIPMENT DATE', 'VESSEL', 'PORT OF LOADING', 'BILL OF LADING NUMBER', 'PORT OF DISCHARGE'].map((h) => (
            <th key={h} style={{ ...hcell, fontSize: 11 }}>{h}</th>
          ))}
        </tr></thead>
        <tbody><tr style={{ textAlign: 'center' }}>
          <td style={cell}>{data.order_code}</td>
          <td style={cell}>{fmtd(data.shipment_date) || '—'}</td>
          <td style={cell}>{`${data.vessel_name || ''}${data.voyage_number ? ' ' + data.voyage_number : ''}`.trim() || '—'}</td>
          <td style={cell}>{data.port_of_loading || '—'}</td>
          <td style={cell}>{data.bl_number || '—'}</td>
          <td style={cell}>{pod || '—'}</td>
        </tr></tbody>
      </table>

      {/* Bảng hàng lớn */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, tableLayout: 'fixed' }}>
        <colgroup><col style={{ width: '52%' }} /><col style={{ width: '12%' }} /><col style={{ width: '18%' }} /><col style={{ width: '18%' }} /></colgroup>
        <thead><tr>
          <th style={hcell}>DESCRIPTION OF GOODS AND/OR SERVICE</th>
          <th style={{ ...hcell, fontSize: 11 }}>QUANTITY OF GOODS (MT)</th>
          <th style={{ ...hcell, fontSize: 11 }}>UNIT PRICE (USD/MT)<div style={{ fontWeight: 400, fontSize: 10 }}>{`${data.incoterm} ${pod}`.trim()}</div></th>
          <th style={{ ...hcell, fontSize: 11 }}>AMOUNT (USD)</th>
        </tr></thead>
        <tbody>
          <tr>
            <td style={{ ...cell, verticalAlign: 'top', lineHeight: 1.45 }}>{descLines}</td>
            <td style={{ ...cell, textAlign: 'center' }}>{qtyFmt}</td>
            <td style={{ ...cell, textAlign: 'center' }}>{priceFmt}</td>
            <td style={{ ...cell, textAlign: 'center' }}>{n2(data.subtotal)}</td>
          </tr>
          <tr>
            <td style={{ ...cell, textAlign: 'center', fontWeight: 700 }}>TOTAL</td>
            <td style={{ ...cell, textAlign: 'center' }}>{qtyFmt}</td>
            <td style={cell} />
            <td style={{ ...cell, textAlign: 'center' }}>{n2(data.subtotal)}</td>
          </tr>
          <tr>
            <td style={{ ...cell, textAlign: 'center' }} colSpan={3}>FREIGHT CHARGES</td>
            <td style={{ ...cell, textAlign: 'center' }}>{n2(data.freight)}</td>
          </tr>
          <tr>
            <td style={{ ...cell, textAlign: 'center' }} colSpan={3}>INSURANCE</td>
            <td style={{ ...cell, textAlign: 'center' }}>{n2(data.insurance)}</td>
          </tr>
          <tr>
            <td style={{ ...cell, textAlign: 'center' }} colSpan={3}>FOB {data.port_of_loading || ''} (COST)</td>
            <td style={{ ...cell, textAlign: 'center' }}>{n2(data.the_cost)}</td>
          </tr>
          <tr>
            <td style={cell}>SAY US DOLLARS:</td>
            <td style={cell} colSpan={3}>{amountToWords(data.total)}</td>
          </tr>
          <tr>
            <td style={cell}>PAYMENT TERM:</td>
            <td style={cell} colSpan={3}>{data.payment_terms}</td>
          </tr>
        </tbody>
      </table>

      {/* Bank + chữ ký */}
      <div style={{ marginTop: 12, lineHeight: 1.5 }}>
        <div style={{ fontWeight: 700 }}>BANK INFORMATION:</div>
        <div>ACCOUNT NAME: {data.bank_info.account_name}</div>
        <div>BANK NAME: {data.bank_info.name}</div>
        <div>ACCOUNT NUMBER: {data.bank_info.account}</div>
        {data.bank_info.address && <div>BANK ADDRESS: {data.bank_info.address}</div>}
        <div>SWIFT CODE: {data.bank_info.swift}</div>
      </div>

      <div style={{ marginTop: 40, textAlign: 'right' }}>
        <div style={{ fontWeight: 700 }}>HUY ANH RUBBER COMPANY LIMITED</div>
        <div style={{ height: 64 }} />
        <div style={{ fontWeight: 700 }}>PHÓ GIÁM ĐỐC</div>
        <div style={{ fontWeight: 700 }}>Lê Xuân Hồng Trung</div>
      </div>

      <div className="no-print" style={{ marginTop: 24, textAlign: 'center' }}>
        <Space>
          <Button type="primary" icon={<PrinterOutlined />} size="large" onClick={() => window.print()}>
            In / Lưu PDF
          </Button>
          <Button icon={<FileWordOutlined />} size="large"
            onClick={() => saveDocx(invoiceDoc(data), `${data.invoice_code}_INV`).catch(() => message.error('Lỗi xuất Word'))}>
            Tải Word (.docx)
          </Button>
        </Space>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

const ExportDocumentsPage = () => {
  const { orderId } = useParams<{ orderId: string }>()
  const navigate = useNavigate()

  const [order, setOrder] = useState<SalesOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('coa')

  // Document data
  const [coaData, setCOAData] = useState<COAData | null>(null)
  const [coaLoading, setCOALoading] = useState(false)
  const [packingData, setPackingData] = useState<PackingListData | null>(null)
  const [packingLoading, setPackingLoading] = useState(false)
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null)
  const [invoiceLoading, setInvoiceLoading] = useState(false)
  const [weightData, setWeightData] = useState<WeightListData | null>(null)
  const [weightLoading, setWeightLoading] = useState(false)
  const [negVersion, setNegVersion] = useState(0)   // bump khi ĐNCK lưu → BOE nạp lại
  // Bộ chứng từ theo LÔ: 0 = cả đơn; >0 = lot_no
  const [lotNo, setLotNo] = useState(0)
  const [lots, setLots] = useState<number[]>([])

  // Load order
  useEffect(() => {
    if (!orderId) return
    setLoading(true)
    salesOrderService
      .getById(orderId)
      .then((data) => setOrder(data))
      .catch(() => message.error('Không thể tải đơn hàng'))
      .finally(() => setLoading(false))
    documentService.listLots(orderId).then(setLots).catch(() => setLots([]))
  }, [orderId])

  // Đổi lô → xoá dữ liệu đã sinh (sinh lại theo lô mới) + báo BOE/ĐNCK nạp lại
  useEffect(() => {
    setCOAData(null); setPackingData(null); setWeightData(null); setInvoiceData(null)
    setNegVersion((v) => v + 1)
  }, [lotNo])

  // Generate COA
  const generateCOA = useCallback(async () => {
    if (!orderId) return
    setCOALoading(true)
    try {
      const data = await documentService.getCOAData(orderId, lotNo)
      setCOAData(data)
      await documentService.markGenerated(orderId, 'coa')
      setOrder((prev) => prev ? { ...prev, coa_generated: true } : prev)
      message.success('COA generated successfully')
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Failed to generate COA')
    } finally {
      setCOALoading(false)
    }
  }, [orderId, lotNo])

  // Generate Packing List
  const generatePacking = useCallback(async () => {
    if (!orderId) return
    setPackingLoading(true)
    try {
      const data = await documentService.getPackingListData(orderId, lotNo)
      setPackingData(data)
      await documentService.markGenerated(orderId, 'packing_list')
      setOrder((prev) => prev ? { ...prev, packing_list_generated: true } : prev)
      message.success('Packing List generated successfully')
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Failed to generate Packing List')
    } finally {
      setPackingLoading(false)
    }
  }, [orderId, lotNo])

  // Generate Weight List
  const generateWeight = useCallback(async () => {
    if (!orderId) return
    setWeightLoading(true)
    try {
      const data = await documentService.getWeightListData(orderId, lotNo)
      setWeightData(data)
      message.success('Weight List generated successfully')
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Failed to generate Weight List')
    } finally {
      setWeightLoading(false)
    }
  }, [orderId, lotNo])

  // Generate Invoice
  const generateInvoice = useCallback(async () => {
    if (!orderId) return
    setInvoiceLoading(true)
    try {
      const data = await documentService.getInvoiceData(orderId, lotNo)
      setInvoiceData(data)
      await documentService.markGenerated(orderId, 'invoice')
      setOrder((prev) => prev ? { ...prev, invoice_generated: true } : prev)
      message.success('Invoice generated successfully')
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Failed to generate Invoice')
    } finally {
      setInvoiceLoading(false)
    }
  }, [orderId, lotNo])

  // Print all
  const printAll = useCallback(async () => {
    if (!orderId) return
    // Generate all if not yet (gồm cả Weight List)
    const promises: Promise<void>[] = []
    // COA không tự sinh (đính kèm từ LAB) → không đưa vào "In tất cả"
    if (!packingData) promises.push(generatePacking())
    if (!weightData) promises.push(generateWeight())
    if (!invoiceData) promises.push(generateInvoice())
    if (promises.length > 0) {
      await Promise.all(promises)
    }
    // Bật class để print CSS hiện MỌI tab pane (mặc định AntD ẩn pane không active).
    // Tab items dùng forceRender nên các pane đã mount sẵn dù chưa bấm vào.
    document.body.classList.add('print-all')
    setTimeout(() => {
      window.print()
      document.body.classList.remove('print-all')
    }, 500)
  }, [orderId, coaData, packingData, weightData, invoiceData, generateCOA, generatePacking, generateWeight, generateInvoice])

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" tip="Loading order..." />
      </div>
    )
  }

  if (!order) {
    return <Result status="404" title="Order not found" />
  }

  const docStatus = (generated: boolean) =>
    generated
      ? <Tag color="success" icon={<CheckCircleOutlined />}>Generated</Tag>
      : <Tag color="default" icon={<ClockCircleOutlined />}>Chưa tạo</Tag>

  return (
    <div style={{ padding: '0 0 24px' }}>
      {/* Print styles */}
      <style>{`
        /* Font/định dạng giống mẫu chứng từ xuất khẩu: Times New Roman + chữ đen (màn hình lẫn in) */
        /* Ép ĐEN mọi phần tử trong chứng từ (kể cả <td> thuần của Hối phiếu/ĐNCK) — tránh antd tô đỏ/xanh */
        .doc-print-area, .doc-print-area * {
          color: #000 !important;
        }
        .doc-print-area, .doc-print-area .ant-typography,
        .doc-print-area .ant-table, .doc-print-area .ant-table-cell,
        .doc-print-area .ant-descriptions-item-label,
        .doc-print-area .ant-descriptions-item-content {
          font-family: 'Times New Roman', Times, serif !important;
        }
        .doc-print-area .ant-table-thead > tr > th {
          background: #f2f2f2 !important; color: #000 !important; font-weight: 700;
        }
        @media print {
          .no-print { display: none !important; }
          .ant-card { box-shadow: none !important; border: none !important; }
          @page { size: A4; margin: 12mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

          /* IN 1 CHỨNG TỪ (mặc định): ẩn TOÀN BỘ trang (menu ☰, header, sidebar...),
             chỉ hiện chứng từ đang mở, KÉO FULL khổ giấy. */
          body:not(.print-all) * { visibility: hidden !important; }
          body:not(.print-all) .doc-print-area,
          body:not(.print-all) .doc-print-area * { visibility: visible !important; }
          body:not(.print-all) .doc-print-area {
            position: absolute !important; left: 0 !important; top: 0 !important;
            width: 100% !important; max-width: 100% !important;
            padding: 0 !important; margin: 0 !important;
          }

          /* IN TẤT CẢ: hiện mọi pane + ẩn chrome + ngắt trang giữa các chứng từ. */
          body.print-all aside, body.print-all .ant-layout-sider, body.print-all .ant-layout-header,
          body.print-all .ant-breadcrumb, body.print-all .doc-status-cards, body.print-all .ant-tabs-nav {
            display: none !important;
          }
          body.print-all .ant-tabs-tabpane { display: block !important; }
          body.print-all .ant-tabs-tabpane .doc-print-area { page-break-after: always; padding: 0 !important; margin: 0 !important; }
        }
      `}</style>

      {/* Breadcrumb */}
      <div className="no-print">
        <Breadcrumb
          style={{ marginBottom: 16 }}
          items={[
            { title: 'Sales' },
            { title: <a onClick={() => navigate('/sales/orders')}>Orders</a> },
            { title: <a onClick={() => navigate(`/sales/orders/${orderId}`)}>{soDisplayCode(order)}</a> },
            { title: 'Export Documents' },
          ]}
        />

        {/* Header */}
        <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
          <Col>
            <Space>
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/sales/orders/${orderId}`)}>
                Back
              </Button>
              <Title level={4} style={{ margin: 0 }}>
                Export Documents - {soDisplayCode(order)}
              </Title>
              <Tag color={ORDER_STATUS_COLORS[order.status]}>
                {ORDER_STATUS_LABELS[order.status]}
              </Tag>
            </Space>
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<PrinterOutlined />}
              size="large"
              onClick={printAll}
            >
              In tất cả
            </Button>
          </Col>
        </Row>

        {/* Document status cards */}
        <Row gutter={16} style={{ marginBottom: 24 }} className="doc-status-cards">
          <Col span={8}>
            <Card size="small" hoverable onClick={() => setActiveTab('coa')}>
              <Space>
                <SafetyCertificateOutlined style={{ fontSize: 24, color: '#1B4D3E' }} />
                <div>
                  <Text strong>COA</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>Đính kèm từ LAB</Text>
                </div>
              </Space>
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" hoverable onClick={() => { setActiveTab('packing'); if (!packingData) generatePacking() }}>
              <Space>
                <ContainerOutlined style={{ fontSize: 24, color: '#1B4D3E' }} />
                <div>
                  <Text strong>Packing List</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>Container & Bale Details</Text>
                </div>
              </Space>
              <div style={{ marginTop: 8 }}>{docStatus(order.packing_list_generated)}</div>
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" hoverable onClick={() => { setActiveTab('invoice'); if (!invoiceData) generateInvoice() }}>
              <Space>
                <DollarOutlined style={{ fontSize: 24, color: '#1B4D3E' }} />
                <div>
                  <Text strong>Commercial Invoice</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>Payment & Banking</Text>
                </div>
              </Space>
              <div style={{ marginTop: 8 }}>{docStatus(order.invoice_generated)}</div>
            </Card>
          </Col>
        </Row>
      </div>

      {/* Chọn LÔ — sinh bộ chứng từ theo từng lô (mỗi lô 1 B/L riêng) */}
      {lots.length > 0 && (
        <Card size="small" style={{ marginBottom: 12 }} className="no-print"
          styles={{ body: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' } }}>
          <Text strong style={{ color: '#1B4D3E' }}>📦 Bộ chứng từ theo lô:</Text>
          <Segmented
            value={lotNo}
            onChange={(v) => setLotNo(Number(v))}
            options={[
              { label: 'Toàn đơn', value: 0 },
              ...lots.map((l) => ({ label: `Lô ${l}`, value: l })),
            ]}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {lotNo ? `Đang sinh riêng cho Lô ${lotNo} (container + B/L + giá trị của lô).` : 'Đang sinh cho cả đơn.'}
          </Text>
        </Card>
      )}

      {/* Tabs */}
      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'coa',
              label: (
                <span>
                  <SafetyCertificateOutlined /> COA
                </span>
              ),
              children: (
                <div style={{ padding: 24, maxWidth: 680, margin: '0 auto' }}>
                  <Result
                    icon={<SafetyCertificateOutlined style={{ color: '#1B4D3E', fontSize: 40 }} />}
                    title="COA — đính kèm từ phòng LAB"
                    subTitle={
                      <span>
                        Certificate of Analysis do phòng thí nghiệm (VILAS 1522) cấp — <b>không tự sinh</b> từ hệ thống.
                        <br />Vui lòng đính kèm file COA ở tab <b>"Chứng từ"</b> → mục Checklist (dòng "Certificate of Analysis (COA)").
                      </span>
                    }
                  />
                </div>
              ),
            },
            {
              key: 'packing',
              forceRender: true,
              label: (
                <span>
                  <ContainerOutlined /> Packing List
                  {order.packing_list_generated && <CheckCircleOutlined style={{ color: '#52c41a', marginLeft: 4 }} />}
                </span>
              ),
              children: <PackingListTab data={packingData} loading={packingLoading} onGenerate={generatePacking} />,
            },
            {
              key: 'weight',
              forceRender: true,
              label: (
                <span>
                  <FileDoneOutlined /> Weight List
                </span>
              ),
              children: <WeightListTab data={weightData} loading={weightLoading} onGenerate={generateWeight} />,
            },
            {
              key: 'invoice',
              forceRender: true,
              label: (
                <span>
                  <DollarOutlined /> Invoice
                  {order.invoice_generated && <CheckCircleOutlined style={{ color: '#52c41a', marginLeft: 4 }} />}
                </span>
              ),
              children: <InvoiceTab data={invoiceData} loading={invoiceLoading} onGenerate={generateInvoice} />,
            },
            {
              key: 'boe',
              label: (
                <span>
                  <FileDoneOutlined /> Hối phiếu
                </span>
              ),
              children: <BillOfExchangeTab orderId={orderId!} reloadKey={negVersion} lotNo={lotNo} />,
            },
            {
              key: 'dnck',
              label: (
                <span>
                  <DollarOutlined /> Đơn chiết khấu
                </span>
              ),
              children: <LcNegotiationTab orderId={orderId!} order={order} lotNo={lotNo} onSaved={() => setNegVersion((v) => v + 1)} />,
            },
            {
              key: 'bencert',
              label: (
                <span>
                  <SafetyCertificateOutlined /> Beneficiary Cert
                </span>
              ),
              children: <BeneficiaryCertTab orderId={orderId!} lotNo={lotNo} />,
            },
            {
              key: 'nonwood',
              label: (
                <span>
                  <SafetyCertificateOutlined /> Non-Wood Cert
                </span>
              ),
              children: <NonWoodCertTab orderId={orderId!} lotNo={lotNo} />,
            },
          ]}
        />
      </Card>
    </div>
  )
}

export default ExportDocumentsPage
