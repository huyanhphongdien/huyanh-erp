// ============================================================================
// DRAFT CONTRACT PREVIEW — Card xem trước HĐ SC/PI cho đơn nháp chưa submit
// File: src/pages/sales/components/DraftContractPreview.tsx
//
// Render trong Tab Hợp đồng khi:
//   - order.status === 'draft'  AND
//   - sales_order_contracts chưa có row (chưa "Trình Kiểm tra")
//
// Cho Sale xem live preview SC/PI + tải file .docx mock (bank default) ngay
// từ Detail page, không cần bấm "Sửa" để mở Compose Studio.
//
// Mirror PreviewSC/PreviewPI trong SalesOrderCreatePage.tsx (kept tách bạch
// vì code path khác: form-live state vs saved record).
// ============================================================================
import { useMemo, useState } from 'react'
import { Card, Tabs, Tag, Alert, Button, Space, Divider, message } from 'antd'
import { FileWordOutlined, DownloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { SalesOrder } from '../../../services/sales/salesTypes'
import {
  type ContractFormData,
  DEFAULT_BANK,
  deriveKind,
  downloadContract,
  amountToWords,
} from '../../../services/sales/contractGeneratorService'

// ─────────────────────────────────────────────────────────────────────────────
// Mapper: SalesOrder (saved record) → Partial<ContractFormData>
// Mirror logic ở SalesOrderCreatePage.tsx:183-274 nhưng nguồn là DB record.
// Một số field hợp đồng không có trên sales_orders (partial/trans/arbitration/
// extra_terms) → fill default chuẩn của Huy Anh.
// ─────────────────────────────────────────────────────────────────────────────
function salesOrderToContractData(order: SalesOrder): Partial<ContractFormData> {
  const customer = order.customer as
    | (NonNullable<SalesOrder['customer']> & { address?: string; phone?: string })
    | undefined

  const items = order.items || []
  const firstItem = items[0]
  const allGrades = items
    .filter((i) => i.grade && i.quantity_tons > 0)
    .map((i) => i.grade)

  const incoterm = (order.incoterm || 'FOB').toUpperCase()
  const isFOB = ['FOB', 'EXW'].includes(incoterm)

  const itemsTotalTons = items.reduce((s, i) => s + (Number(i.quantity_tons) || 0), 0) || (order.quantity_tons || 0)
  const itemsTotalUSD = order.total_value_usd
    || items.reduce((s, i) => s + (Number(i.total_value_usd) || (Number(i.quantity_tons) || 0) * (Number(i.unit_price) || 0)), 0)
    || (order.quantity_tons || 0) * (order.unit_price || 0)
  const itemsTotalBales = order.total_bales
    || items.reduce((s, i) => s + (Number(i.total_bales) || 0), 0)
  const itemsTotalContainers = order.container_count
    || items.reduce((s, i) => s + (Number(i.container_count) || 0), 0)

  // packing_desc — mirror logic CreatePage
  const packing_desc = (() => {
    const note = firstItem?.packing_note || order.packing_note
    if (note) return note
    const kg = firstItem?.bale_weight_kg || order.bale_weight_kg || 35
    const pt = firstItem?.packing_type || order.packing_type || 'loose_bale'
    const map: Record<string, string> = {
      loose_bale: 'Loose bales packing',
      sw_pallet: 'SW Pallet packing',
      wooden_pallet: 'Wooden pallets (fumigated)',
      plastic_pallet: 'Plastic pallets',
      metal_box: 'Metal box packing',
    }
    return `${kg} kg/bale, ${map[pt] || 'Loose bales packing'}`
  })()

  const pt = firstItem?.packing_type || order.packing_type || ''
  const pallets_total = ['wooden_pallet', 'sw_pallet', 'plastic_pallet'].includes(pt) && itemsTotalBales > 0
    ? String(Math.ceil(itemsTotalBales / 36))
    : ''

  // payment — priority: textarea note → first item.payment_terms → order.payment_terms → default
  const payment = (() => {
    const note = order.payment_terms_note?.trim()
    if (note) return note
    const itemPayment = firstItem?.payment_terms?.trim()
    if (itemPayment) return itemPayment
    return order.payment_terms || 'LC at sight'
  })()

  return {
    contract_no: order.contract_no || order.code || '',
    contract_date: order.contract_date
      ? dayjs(order.contract_date).format('DD MMM YYYY')
      : (order.order_date ? dayjs(order.order_date).format('DD MMM YYYY') : ''),
    buyer_name: customer?.name || '',
    buyer_address: customer?.address || '',
    buyer_phone: customer?.phone || '',
    grade: allGrades.length ? allGrades.join(' + ') : (order.grade || ''),
    quantity: itemsTotalTons ? itemsTotalTons.toFixed(2) : '',
    unit_price: firstItem?.unit_price
      ? firstItem.unit_price.toLocaleString('en-US')
      : (order.unit_price ? order.unit_price.toLocaleString('en-US') : ''),
    amount: itemsTotalUSD
      ? itemsTotalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '',
    amount_words: itemsTotalUSD ? amountToWords(itemsTotalUSD) : '',
    incoterm,
    pol: order.port_of_loading || '',
    pod: isFOB ? '' : (order.port_of_destination || ''),
    packing_type: pt,
    packing_desc,
    bales_total: itemsTotalBales ? itemsTotalBales.toLocaleString('en-US') : '',
    pallets_total,
    containers: String(itemsTotalContainers || ''),
    cont_type: order.container_type === '40ft' ? '40HC' : '20DC',
    shipment_time: order.shipment_time || '',
    // Field hợp đồng default (không lưu trên sales_orders)
    partial: 'Not Allowed',
    trans: 'Allowed',
    payment,
    payment_extra: '',
    claims_days: '20',
    arbitration: 'SICOM Singapore',
    freight_mark: isFOB ? 'freight Collect' : 'freight prepaid',
    extra_terms: '',
    ...DEFAULT_BANK,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview SC/PI HTML — mirror SalesOrderCreatePage.tsx:1011-1124
// ─────────────────────────────────────────────────────────────────────────────
function PreviewSC({ d }: { d: Partial<ContractFormData> }) {
  return (
    <div style={{ fontFamily: 'Georgia, serif', fontSize: 11, lineHeight: 1.5, color: '#333' }}>
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
        SALES CONTRACT
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span>No.: <strong>{d.contract_no || '—'}</strong></span>
        <span>Date: <strong>{d.contract_date || '—'}</strong></span>
      </div>
      <div style={{ marginBottom: 6 }}><strong>THE SELLER:</strong> HUY ANH RUBBER COMPANY LIMITED</div>
      <div style={{ marginBottom: 6 }}><strong>THE BUYER:</strong> {d.buyer_name || '—'}</div>
      <div style={{ marginBottom: 10, color: '#666' }}>ADDRESS: {d.buyer_address || '—'}</div>
      <div style={{ background: '#f5f5f5', padding: 6, marginBottom: 8, fontSize: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ccc' }}>
              <th style={{ textAlign: 'left' }}>COMMODITY</th>
              <th style={{ textAlign: 'right' }}>QTY (MTs)</th>
              <th style={{ textAlign: 'right' }}>{d.incoterm} {d.pod ? `– ${d.pod}` : d.pol} (USD/MT)</th>
              <th style={{ textAlign: 'right' }}>AMOUNT (USD)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>NATURAL RUBBER {d.grade || '—'}</td>
              <td style={{ textAlign: 'right' }}>{d.quantity || '—'}</td>
              <td style={{ textAlign: 'right' }}>{d.unit_price || '—'}</td>
              <td style={{ textAlign: 'right' }}>{d.amount || '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ marginBottom: 4 }}><strong>Packing:</strong> {d.bales_total} bales / {d.containers} x {d.cont_type}</div>
      <div style={{ marginBottom: 4 }}><strong>Shipment:</strong></div>
      <div style={{ paddingLeft: 12, marginBottom: 4 }}>- Port of loading: {d.pol || '—'}</div>
      {d.pod && <div style={{ paddingLeft: 12, marginBottom: 4 }}>- Port of discharge: {d.pod}</div>}
      <div style={{ paddingLeft: 12, marginBottom: 4 }}>- Time of shipment: {d.shipment_time || '—'}</div>
      <div style={{ paddingLeft: 12, marginBottom: 8 }}>- Partial: {d.partial} / Transshipment: {d.trans}</div>
      <div style={{ marginBottom: 4 }}><strong>Term of payment:</strong> {d.payment || '—'}</div>
      <Divider style={{ margin: '8px 0', borderColor: '#e0e0e0' }} />
      <div style={{ background: '#fff7e6', padding: 6, marginBottom: 6, fontSize: 10, color: '#d48806' }}>
        <strong>Ben's Bank detail (do Phú LV nhập khi review):</strong><br />
        ACCOUNT NAME: {d.bank_account_name}<br />
        ACCOUNT NO: {d.bank_account_no}<br />
        BANK: {d.bank_full_name}<br />
        SWIFT: {d.bank_swift}
      </div>
      <div style={{ marginBottom: 4 }}><strong>Documents:</strong> 3/3 Original B/L marked {d.freight_mark}, Commercial Invoice, Packing List, C/O, Test Cert, Phytosanitary{d.pod ? ', Insurance Cert' : ''}</div>
      <div style={{ marginBottom: 4 }}><strong>Claims:</strong> within {d.claims_days} days of receipt</div>
      <div style={{ marginBottom: 4 }}><strong>Arbitration:</strong> {d.arbitration}</div>
    </div>
  )
}

function PreviewPI({ d }: { d: Partial<ContractFormData> }) {
  return (
    <div style={{ fontFamily: 'Georgia, serif', fontSize: 11, lineHeight: 1.5, color: '#333' }}>
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
        PROFORMA INVOICE
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span>No: <strong>{d.contract_no || '—'}/PR.CI</strong></span>
        <span>Date: <strong>{d.contract_date || '—'}</strong></span>
      </div>
      <div style={{ marginBottom: 6 }}><strong>THE SELLER:</strong> HUY ANH RUBBER COMPANY LIMITED</div>
      <div style={{ marginBottom: 6 }}><strong>THE BUYER:</strong> {d.buyer_name || '—'}</div>
      <div style={{ marginBottom: 10, color: '#666' }}>ADDRESS: {d.buyer_address || '—'}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8, fontSize: 10 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ccc' }}>
            <th style={{ textAlign: 'left' }}># Cont</th>
            <th style={{ textAlign: 'left' }}>Description of Goods</th>
            <th style={{ textAlign: 'right' }}>Qty (MTs)</th>
            <th style={{ textAlign: 'right' }}>Unit Price (USD/MT)</th>
            <th style={{ textAlign: 'right' }}>Total (USD)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{d.containers} x {d.cont_type}</td>
            <td>NATURAL RUBBER {d.grade || '—'} ({d.packing_desc || '—'})</td>
            <td style={{ textAlign: 'right' }}>{d.quantity || '—'}</td>
            <td style={{ textAlign: 'right' }}>{d.unit_price || '—'}</td>
            <td style={{ textAlign: 'right' }}>{d.amount || '—'}</td>
          </tr>
        </tbody>
      </table>
      <div style={{ marginBottom: 6, fontStyle: 'italic', color: '#888' }}>
        Words: {d.amount_words || <span style={{ color: '#aaa' }}>(sẽ tự sinh khi có giá trị USD)</span>}
      </div>
      <div style={{ marginBottom: 4 }}><strong>Payment:</strong> {d.payment || '—'}</div>
      <div style={{ background: '#fff7e6', padding: 6, marginTop: 6, fontSize: 10, color: '#d48806' }}>
        <strong>Ben's Bank detail (Phú LV nhập):</strong><br />
        ACCOUNT: {d.bank_account_name} — {d.bank_account_no}<br />
        SWIFT: {d.bank_swift}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Component chính
// ─────────────────────────────────────────────────────────────────────────────
interface Props {
  order: SalesOrder
}

export default function DraftContractPreview({ order }: Props) {
  const [previewTab, setPreviewTab] = useState<'SC' | 'PI'>('SC')
  const [docLoading, setDocLoading] = useState<'SC' | 'PI' | 'BOTH' | null>(null)

  const data = useMemo(() => salesOrderToContractData(order), [order])
  const kindLabel = deriveKind(data.incoterm || 'FOB', 'SC')

  const handleDownload = async (type: 'SC' | 'PI' | 'BOTH') => {
    if (!data.contract_no) {
      message.error('Đơn chưa có Số hợp đồng — cần "Sửa" để bổ sung trước khi xuất .docx')
      return
    }
    if (!data.buyer_name) {
      message.error('Đơn chưa có khách hàng')
      return
    }
    setDocLoading(type)
    try {
      if (type === 'BOTH') {
        await downloadContract(deriveKind(data.incoterm || 'FOB', 'SC'), data, `${data.contract_no}_SC.docx`)
        await downloadContract(deriveKind(data.incoterm || 'FOB', 'PI'), data, `${data.contract_no}_PI.docx`)
        message.success(`Đã sinh SC + PI cho ${data.contract_no}`)
      } else {
        const kind = deriveKind(data.incoterm || 'FOB', type)
        await downloadContract(kind, data, `${data.contract_no}_${type}.docx`)
        message.success(`Đã tải ${type} mock`)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      message.error(`Tải thất bại: ${msg}`)
    } finally {
      setDocLoading(null)
    }
  }

  return (
    <Card
      size="small"
      style={{ marginBottom: 12, borderRadius: 12 }}
      title={
        <Space size={6}>
          <FileWordOutlined style={{ color: '#1B4D3E' }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Xem trước HĐ (Live Preview)</span>
          <Tag color={kindLabel === 'SC_CIF' ? 'blue' : 'green'} style={{ fontSize: 10 }}>
            {kindLabel.replace('_', ' ')}
          </Tag>
          <Tag color="orange" style={{ fontSize: 10 }}>Nháp — chưa trình</Tag>
        </Space>
      }
      extra={
        <Tabs
          size="small"
          activeKey={previewTab}
          onChange={(k) => setPreviewTab(k as 'SC' | 'PI')}
          items={[
            { key: 'SC', label: 'SC' },
            { key: 'PI', label: 'PI' },
          ]}
          tabBarStyle={{ marginBottom: 0 }}
        />
      }
    >
      <div style={{
        maxHeight: 420,
        overflowY: 'auto',
        background: '#fff',
        padding: 12,
        border: '1px solid #f0f0f0',
        borderRadius: 6,
      }}>
        {previewTab === 'SC' ? <PreviewSC d={data} /> : <PreviewPI d={data} />}
      </div>

      <Alert
        type="warning"
        showIcon
        style={{ marginTop: 12, fontSize: 12 }}
        message="⚠ Bản preview — bank info chưa được duyệt"
        description={
          <span style={{ fontSize: 11 }}>
            File tải về dùng bank <strong>DEFAULT (Vietin Hue)</strong> để preview.
            <strong> KHÔNG gửi cho khách</strong> — bấm "Sửa" rồi "Trình Kiểm tra (Phú LV)"
            → Phú LV duyệt + nhập bank đúng → lúc đó mới tải bản chính thức gửi KH.
          </span>
        }
      />

      <Space.Compact block style={{ marginTop: 12 }}>
        <Button
          icon={<DownloadOutlined />}
          loading={docLoading === 'SC'}
          onClick={() => handleDownload('SC')}
          style={{ flex: 1 }}
        >
          Preview SC
        </Button>
        <Button
          icon={<DownloadOutlined />}
          loading={docLoading === 'PI'}
          onClick={() => handleDownload('PI')}
          style={{ flex: 1 }}
        >
          Preview PI
        </Button>
        <Button
          type="primary"
          icon={<DownloadOutlined />}
          loading={docLoading === 'BOTH'}
          onClick={() => handleDownload('BOTH')}
          style={{ flex: 1.2, background: '#1B4D3E' }}
        >
          Preview SC + PI
        </Button>
      </Space.Compact>
    </Card>
  )
}
