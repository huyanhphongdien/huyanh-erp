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
import BillOfExchangeTab from './components/BillOfExchangeTab'
import LcNegotiationTab from './components/LcNegotiationTab'
import BeneficiaryCertTab from './components/BeneficiaryCertTab'
import NonWoodCertTab from './components/NonWoodCertTab'
import type { COAData, PackingListData, InvoiceData, WeightListData } from '../../services/sales/documentService'
import type { SalesOrder } from '../../services/sales/salesTypes'
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, soDisplayCode } from '../../services/sales/salesTypes'

const { Title, Text, Paragraph } = Typography

// ============================================================================
// COMPANY HEADER (shared)
// ============================================================================

// Letterhead khớp mẫu chứng từ thật (tên tiếng Anh, serif, chữ đen, gạch chân)
const CompanyHeader = () => (
  <div className="doc-company-header" style={{ textAlign: 'center', marginBottom: 18, color: '#000' }}>
    <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: 0.3 }}>HUY ANH RUBBER COMPANY LIMITED</div>
    <div style={{ fontSize: 12.5 }}>Khe Ma, Phong Dien Ward, Hue City, Viet Nam</div>
    <div style={{ fontSize: 12.5 }}>Tel: 054.3774994&nbsp;&nbsp;·&nbsp;&nbsp;Fax: 054.3774994&nbsp;&nbsp;·&nbsp;&nbsp;Tax ID: 3301549896</div>
    <div style={{ borderBottom: '2px solid #000', marginTop: 8 }} />
  </div>
)

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

  const containerColumns: ColumnsType<PackingListData['containers'][0]> = [
    { title: 'Container No.', dataIndex: 'container_no', key: 'container_no', width: 160 },
    { title: 'Seal No.', dataIndex: 'seal_no', key: 'seal_no', width: 140 },
    { title: 'Type', dataIndex: 'container_type', key: 'container_type', width: 80, align: 'center' },
    { title: 'Bales', dataIndex: 'bale_count', key: 'bale_count', width: 80, align: 'right', render: (v: number) => v?.toLocaleString() },
    {
      title: 'Net Weight (KG)', dataIndex: 'net_weight_kg', key: 'net_weight_kg', width: 130, align: 'right',
      render: (v: number) => v?.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
    },
    {
      title: 'Gross Weight (KG)', dataIndex: 'gross_weight_kg', key: 'gross_weight_kg', width: 140, align: 'right',
      render: (v: number) => v?.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
    },
  ]

  return (
    <div className="doc-print-area" id="packing-list-print">
      <CompanyHeader />

      <Title level={3} style={{ textAlign: 'center', marginBottom: 24 }}>
        PACKING LIST
      </Title>

      <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Sales Order">{data.order_code}</Descriptions.Item>
        <Descriptions.Item label="Buyer">{data.buyer_name || data.customer_name}</Descriptions.Item>
        <Descriptions.Item label="Address" span={2}>{data.customer_address}</Descriptions.Item>
        {data.consignee && <Descriptions.Item label="Consignee" span={2}>{data.consignee}</Descriptions.Item>}
        <Descriptions.Item label="Commodity">Natural Rubber {data.grade?.replace(/_/g, ' ')}</Descriptions.Item>
        <Descriptions.Item label="Vessel">{data.vessel_name || 'TBD'}</Descriptions.Item>
        <Descriptions.Item label="Port of Loading">{data.port_of_loading || 'TBD'}</Descriptions.Item>
        <Descriptions.Item label="Port of Destination">{data.port_of_destination || 'TBD'}</Descriptions.Item>
        <Descriptions.Item label="ETD">{data.etd || 'TBD'}</Descriptions.Item>
        <Descriptions.Item label="Total Containers">{data.total_containers}</Descriptions.Item>
      </Descriptions>

      <Title level={5} style={{ marginTop: 16, marginBottom: 8 }}>Container Summary</Title>

      <Table
        dataSource={data.containers}
        columns={containerColumns}
        rowKey="container_no"
        pagination={false}
        size="small"
        bordered
        summary={() => (
          <Table.Summary fixed>
            <Table.Summary.Row style={{ fontWeight: 'bold', background: '#fafafa' }}>
              <Table.Summary.Cell index={0} colSpan={3}>TOTAL</Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right">{data.total_bales?.toLocaleString()}</Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right">{data.total_net_weight?.toLocaleString()}</Table.Summary.Cell>
              <Table.Summary.Cell index={5} align="right">{data.total_gross_weight?.toLocaleString()}</Table.Summary.Cell>
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />

      {/* Bale detail per container */}
      {data.containers.map((c) => (
        c.items && c.items.length > 0 && (
          <div key={c.container_no} style={{ marginTop: 16 }}>
            <Title level={5} style={{ marginBottom: 8 }}>
              Container: {c.container_no} / Seal: {c.seal_no}
            </Title>
            <Table
              dataSource={c.items}
              rowKey={(_, idx) => `${c.container_no}-${idx}`}
              pagination={false}
              size="small"
              bordered
              columns={[
                { title: 'Batch No.', dataIndex: 'batch_no', key: 'batch_no' },
                { title: 'Bale From', dataIndex: 'bale_from', key: 'bale_from', align: 'center' },
                { title: 'Bale To', dataIndex: 'bale_to', key: 'bale_to', align: 'center' },
                { title: 'Bale Count', dataIndex: 'bale_count', key: 'bale_count', align: 'right' },
                {
                  title: 'Weight (KG)', dataIndex: 'weight_kg', key: 'weight_kg', align: 'right',
                  render: (v: number) => v?.toLocaleString(),
                },
              ]}
            />
          </div>
        )
      ))}

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

  const fmtMoney = (v: number) =>
    v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="doc-print-area" id="invoice-print">
      <CompanyHeader />

      <Title level={3} style={{ textAlign: 'center', marginBottom: 24 }}>
        COMMERCIAL INVOICE
      </Title>

      <Row gutter={24} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card size="small" style={{ height: '100%' }}>
            <Text type="secondary">The Buyer:</Text>
            <br />
            <Text strong style={{ fontSize: 15 }}>{data.buyer_name || data.customer.name}</Text>
            <br />
            <Text>{data.buyer_address || data.customer.address}</Text>
            <br />
            <Text>{data.customer.country}</Text>
            {data.consignee && (
              <>
                <Divider style={{ margin: '8px 0' }} />
                <Text type="secondary">Consignee:</Text><br />
                <Text strong>{data.consignee}</Text>
                {data.consignee_address && <><br /><Text>{data.consignee_address}</Text></>}
              </>
            )}
            {data.notify_party && (
              <>
                <Divider style={{ margin: '8px 0' }} />
                <Text type="secondary">Notify Party:</Text><br />
                <Text>{data.notify_party}</Text>
                {data.notify_address && <><br /><Text>{data.notify_address}</Text></>}
              </>
            )}
          </Card>
        </Col>
        <Col span={12}>
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="Invoice No.">{data.invoice_code}</Descriptions.Item>
            <Descriptions.Item label="Date">{data.invoice_date}</Descriptions.Item>
            <Descriptions.Item label="Sales Order">{data.order_code}</Descriptions.Item>
            {data.po_number && <Descriptions.Item label="PO No.">{data.po_number}</Descriptions.Item>}
            <Descriptions.Item label="Incoterm">{data.incoterm}</Descriptions.Item>
            <Descriptions.Item label="Port of Loading">{data.port_of_loading || 'TBD'}</Descriptions.Item>
            <Descriptions.Item label="Port of Discharge">{data.port_of_destination || 'TBD'}</Descriptions.Item>
            {data.vessel_name && (
              <Descriptions.Item label="Vessel">
                {data.vessel_name}{data.voyage_number ? ` / ${data.voyage_number}` : ''}
              </Descriptions.Item>
            )}
            {data.etd && <Descriptions.Item label="ETD">{data.etd}</Descriptions.Item>}
          </Descriptions>
        </Col>
      </Row>

      {/* Item table */}
      <Table
        dataSource={[
          {
            key: '1',
            description: `Natural Rubber ${data.grade?.replace(/_/g, ' ')}`,
            quantity: `${data.quantity_tons} MT`,
            unit_price: `${data.currency} ${fmtMoney(data.unit_price)}/MT`,
            amount: `${data.currency} ${fmtMoney(data.subtotal)}`,
          },
        ]}
        columns={[
          { title: 'Description', dataIndex: 'description', key: 'description', width: '40%' },
          { title: 'Quantity', dataIndex: 'quantity', key: 'quantity', align: 'center' },
          { title: 'Unit Price', dataIndex: 'unit_price', key: 'unit_price', align: 'right' },
          { title: 'Amount', dataIndex: 'amount', key: 'amount', align: 'right' },
        ]}
        pagination={false}
        size="small"
        bordered
      />

      {/* Totals — CIF: TOTAL (trị giá CIF) rồi TRỪ Freight/Insurance -> THE COST (khớp mẫu gốc) */}
      <div style={{ width: 400, marginLeft: 'auto', marginTop: 16 }}>
        <Row justify="space-between" style={{ padding: '4px 8px' }}>
          <Col><Text strong style={{ fontSize: 16 }}>TOTAL:</Text></Col>
          <Col><Text strong style={{ fontSize: 16 }}>{data.currency} {fmtMoney(data.total)}</Text></Col>
        </Row>
        {(data.freight > 0 || data.insurance > 0) && (
          <>
            {data.freight > 0 && (
              <Row justify="space-between" style={{ padding: '4px 8px' }}>
                <Col><Text>Freight Charge:</Text></Col>
                <Col><Text>− {data.currency} {fmtMoney(data.freight)}</Text></Col>
              </Row>
            )}
            {data.insurance > 0 && (
              <Row justify="space-between" style={{ padding: '4px 8px' }}>
                <Col><Text>Insurance:</Text></Col>
                <Col><Text>− {data.currency} {fmtMoney(data.insurance)}</Text></Col>
              </Row>
            )}
            <Divider style={{ margin: '4px 0' }} />
            <Row justify="space-between" style={{ padding: '4px 8px' }}>
              <Col><Text strong>THE COST:</Text></Col>
              <Col><Text strong>{data.currency} {fmtMoney(data.the_cost)}</Text></Col>
            </Row>
          </>
        )}
      </div>

      {/* Payment & Banking */}
      <Divider />

      <Row gutter={24}>
        <Col span={12}>
          <Title level={5}>Payment Terms</Title>
          <Paragraph>{data.payment_terms}</Paragraph>
          {data.lc_number && <Paragraph>L/C Number: {data.lc_number}</Paragraph>}
          {data.bl_number && <Paragraph>B/L Number: {data.bl_number}</Paragraph>}
        </Col>
        <Col span={12}>
          <Title level={5}>Bank Details</Title>
          <Paragraph>
            Beneficiary: {data.bank_info.account_name}
            <br />
            Bank: {data.bank_info.name}
            <br />
            {data.bank_info.address && <>Bank Address: {data.bank_info.address}<br /></>}
            Account: {data.bank_info.account}
            <br />
            SWIFT: {data.bank_info.swift}
          </Paragraph>
        </Col>
      </Row>

      {data.shipping_marks && (
        <>
          <Divider />
          <Title level={5}>Shipping Marks</Title>
          <Paragraph style={{ whiteSpace: 'pre-line' }}>{data.shipping_marks}</Paragraph>
        </>
      )}

      <div style={{ marginTop: 48, display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ textAlign: 'center', width: 250 }}>
          <Divider style={{ borderColor: '#000', marginBottom: 4 }} />
          <Text strong>Accountant</Text>
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

  // Load order
  useEffect(() => {
    if (!orderId) return
    setLoading(true)
    salesOrderService
      .getById(orderId)
      .then((data) => setOrder(data))
      .catch(() => message.error('Không thể tải đơn hàng'))
      .finally(() => setLoading(false))
  }, [orderId])

  // Generate COA
  const generateCOA = useCallback(async () => {
    if (!orderId) return
    setCOALoading(true)
    try {
      const data = await documentService.getCOAData(orderId)
      setCOAData(data)
      await documentService.markGenerated(orderId, 'coa')
      setOrder((prev) => prev ? { ...prev, coa_generated: true } : prev)
      message.success('COA generated successfully')
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Failed to generate COA')
    } finally {
      setCOALoading(false)
    }
  }, [orderId])

  // Generate Packing List
  const generatePacking = useCallback(async () => {
    if (!orderId) return
    setPackingLoading(true)
    try {
      const data = await documentService.getPackingListData(orderId)
      setPackingData(data)
      await documentService.markGenerated(orderId, 'packing_list')
      setOrder((prev) => prev ? { ...prev, packing_list_generated: true } : prev)
      message.success('Packing List generated successfully')
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Failed to generate Packing List')
    } finally {
      setPackingLoading(false)
    }
  }, [orderId])

  // Generate Weight List
  const generateWeight = useCallback(async () => {
    if (!orderId) return
    setWeightLoading(true)
    try {
      const data = await documentService.getWeightListData(orderId)
      setWeightData(data)
      message.success('Weight List generated successfully')
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Failed to generate Weight List')
    } finally {
      setWeightLoading(false)
    }
  }, [orderId])

  // Generate Invoice
  const generateInvoice = useCallback(async () => {
    if (!orderId) return
    setInvoiceLoading(true)
    try {
      const data = await documentService.getInvoiceData(orderId)
      setInvoiceData(data)
      await documentService.markGenerated(orderId, 'invoice')
      setOrder((prev) => prev ? { ...prev, invoice_generated: true } : prev)
      message.success('Invoice generated successfully')
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Failed to generate Invoice')
    } finally {
      setInvoiceLoading(false)
    }
  }, [orderId])

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
              children: <BillOfExchangeTab orderId={orderId!} reloadKey={negVersion} />,
            },
            {
              key: 'dnck',
              label: (
                <span>
                  <DollarOutlined /> Đơn chiết khấu
                </span>
              ),
              children: <LcNegotiationTab orderId={orderId!} order={order} onSaved={() => setNegVersion((v) => v + 1)} />,
            },
            {
              key: 'bencert',
              label: (
                <span>
                  <SafetyCertificateOutlined /> Beneficiary Cert
                </span>
              ),
              children: <BeneficiaryCertTab orderId={orderId!} />,
            },
            {
              key: 'nonwood',
              label: (
                <span>
                  <SafetyCertificateOutlined /> Non-Wood Cert
                </span>
              ),
              children: <NonWoodCertTab orderId={orderId!} />,
            },
          ]}
        />
      </Card>
    </div>
  )
}

export default ExportDocumentsPage
