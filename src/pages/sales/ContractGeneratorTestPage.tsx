// ============================================================================
// CONTRACT GENERATOR TEST PAGE
// File: src/pages/sales/ContractGeneratorTestPage.tsx
//
// Trang test sinh hợp đồng SC + PI từ template .docx.
// URL: /sales/contract-test
//
// Mục đích: verify contractGeneratorService trên localhost trước khi tích hợp
// vào Sales Order Create page chính. Có 4 preset từ mock (Phil/Apollo/Yoong Do/VITRY)
// để load nhanh.
// ============================================================================

import { useState } from 'react'
import {
  Card,
  Form,
  Input,
  Button,
  Row,
  Col,
  Select,
  Space,
  Typography,
  Divider,
  Alert,
  message,
  Tag,
  Breadcrumb,
} from 'antd'
import { FileWordOutlined, DownloadOutlined, CodeOutlined, HomeOutlined } from '@ant-design/icons'
import {
  downloadContract,
  deriveKind,
  type ContractFormData,
  type ContractKind,
} from '../../services/sales/contractGeneratorService'

const { Title, Text } = Typography
const { TextArea } = Input

type Preset = ContractFormData & { _label: string; _incoterm: string }

const PRESETS: Record<string, Preset> = {
  philrubber: {
    _label: 'Phil Rubber (FOB · SVR3L · Manila)',
    _incoterm: 'FOB',
    contract_no: 'HA20260054',
    contract_date: '11 May 2026',
    buyer_name: 'PHILIPPINE RUBBER TRADE SOLUTION CORPORATION',
    buyer_address: 'Unit 1502, Cityland Megaplaza, ADB Avenue, Ortigas, Pasig City, Philippines',
    buyer_phone: '+63 2 8800 1234',
    grade: 'SVR3L',
    quantity: '80.64',
    unit_price: '2,365',
    amount: '190,713.60',
    incoterm: 'FOB',
    pol: 'Da Nang port, Viet Nam',
    pod: '',
    packing_desc: 'SW Pallet (Shrink Wrap), 35 kg/bale',
    bales_total: '2,304',
    pallets_total: '64',
    containers: '4',
    cont_type: '20DC',
    shipment_time: 'June, 2026',
    partial: 'Not Allowed',
    trans: 'Allowed',
    payment: 'T/T 100%',
    payment_extra: '',
    claims_days: '20',
    arbitration: 'SICOM Singapore',
    freight_mark: 'freight prepaid',
  },
  apollo: {
    _label: 'Apollo Tyres (FOB · RSS3 · multi-lot)',
    _incoterm: 'FOB',
    contract_no: 'HA20260051',
    contract_date: '08 May 2026',
    buyer_name: 'APOLLO TYRES LTD',
    buyer_address: '7, INSTITUTIONAL AREA, SECTOR 32, GURGAON, INDIA 122001',
    buyer_phone: '1800 212 7070',
    grade: 'RSS3',
    quantity: '201.6',
    unit_price: '2,350',
    amount: '473,760.00',
    amount_words: 'Four Hundred Seventy-Three Thousand Seven Hundred Sixty US Dollars Only',
    incoterm: 'FOB',
    pol: 'Da Nang port, Viet Nam',
    packing_desc: '35 kg/bale. Loose bales packing',
    bales_total: '5,760',
    containers: '10',
    cont_type: '20DC',
    shipment_time: '+ 1st Lot: Before 15th June, 2026\n+ 2nd Lot: Before 30th June, 2026',
    partial: 'Allowed',
    trans: 'Allowed',
    payment: 'CAD 5 days',
    claims_days: '20',
    arbitration: 'SICOM Singapore',
    freight_mark: 'freight Collect',
  },
  yoongdo: {
    _label: 'Yoong Do Engineering (CIF · SVR3L · Incheon)',
    _incoterm: 'CIF',
    contract_no: 'HA20260053',
    contract_date: '08 May 2026',
    buyer_name: 'YOONG DO ENGINEERING CO.,LTD',
    buyer_address: '295, YANGYEON-RO, NAM-MYEON, YANGJU-SI, GYEONGGI-DO, REPUBLIC OF KOREA',
    buyer_phone: '',
    grade: 'SVR3L',
    quantity: '20.16',
    unit_price: '2,460',
    amount: '49,593.60',
    amount_words: 'Forty-Nine Thousand Five Hundred Ninety-Three US Dollars and Sixty Cents Only',
    incoterm: 'CIF',
    pol: 'Any port, Viet Nam',
    pod: 'Incheon, Korea',
    packing_desc: '35 kg/bale with thick polybag, Wooden pallets',
    bales_total: '576',
    pallets_total: '16',
    containers: '01',
    cont_type: '20DC',
    shipment_time: 'June, 2026',
    partial: 'Not Allowed',
    trans: 'Allowed',
    payment: 'LC at sight',
    payment_extra: 'The L/C draft must be opened within five (5) days from the contract signing date.',
    claims_days: '20',
    arbitration: 'SICOM Singapore',
    freight_mark: 'freight prepaid',
  },
  vitry: {
    _label: 'VITRY SAS (CIF · RSS3 · Le Havre · LCIA)',
    _incoterm: 'CIF',
    contract_no: 'HA20260055',
    contract_date: '12 May 2026',
    buyer_name: 'VITRY SAS',
    buyer_address: '12 Avenue de la République, 75011 Paris, France',
    buyer_phone: '+33 1 4500 1234',
    grade: 'RSS3',
    quantity: '20.16',
    unit_price: '2,410',
    amount: '48,585.60',
    incoterm: 'CIF',
    pol: 'Da Nang port, Viet Nam',
    pod: 'Le Havre, France',
    packing_desc: '35 kg/bale with thick polybag, Wooden pallets',
    bales_total: '576',
    pallets_total: '16',
    containers: '01',
    cont_type: '20DC',
    shipment_time: 'July, 2026',
    partial: 'Not Allowed',
    trans: 'Allowed',
    payment: 'LC at sight',
    payment_extra: '',
    claims_days: '30',
    arbitration: 'LCIA London',
    freight_mark: 'freight prepaid',
  },
}

export default function ContractGeneratorTestPage() {
  const [data, setData] = useState<ContractFormData>(PRESETS.yoongdo)
  const [loading, setLoading] = useState<ContractKind | null>(null)

  const set = <K extends keyof ContractFormData>(key: K, value: ContractFormData[K]) =>
    setData((d) => ({ ...d, [key]: value }))

  const loadPreset = (name: keyof typeof PRESETS) => {
    setData(PRESETS[name])
    message.success(`Loaded preset: ${PRESETS[name]._label}`)
  }

  const handleDownload = async (type: 'SC' | 'PI') => {
    const kind = deriveKind(data.incoterm, type)
    setLoading(kind)
    try {
      await downloadContract(kind, data, `${data.contract_no}_${type}.docx`)
      message.success(`Đã sinh ${type} (${kind}) — ${data.contract_no}_${type}.docx`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      message.error(`Sinh ${type} thất bại: ${msg}`)
      console.error(e)
    } finally {
      setLoading(null)
    }
  }

  const handleDownloadBoth = async () => {
    setLoading(deriveKind(data.incoterm, 'SC'))
    try {
      await downloadContract(deriveKind(data.incoterm, 'SC'), data, `${data.contract_no}_SC.docx`)
      await downloadContract(deriveKind(data.incoterm, 'PI'), data, `${data.contract_no}_PI.docx`)
      message.success(`Đã sinh cả SC + PI cho ${data.contract_no}`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      message.error(`Sinh thất bại: ${msg}`)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <Breadcrumb
        items={[
          { href: '/', title: <HomeOutlined /> },
          { title: 'Sales' },
          { title: 'Test sinh HĐ' },
        ]}
        style={{ marginBottom: 16 }}
      />

      <Title level={3} style={{ color: '#1B4D3E' }}>
        <FileWordOutlined /> Test sinh hợp đồng (SC + PI) từ template
      </Title>

      <Alert
        type="info"
        showIcon
        message="Trang test isolated — verify service contractGeneratorService trước khi tích hợp Sales Order Create"
        description={
          <>
            Service đọc template từ <code>/public/contract-templates/template_*.docx</code>, render bằng{' '}
            <code>docxtemplater</code>, sinh file <code>.docx</code> tải về máy. Mở file trong Word để check format.
          </>
        }
        style={{ marginBottom: 16 }}
      />

      <Row gutter={16}>
        <Col xs={24} lg={8}>
          <Card title="🎯 Preset" size="small" style={{ marginBottom: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              {(Object.keys(PRESETS) as Array<keyof typeof PRESETS>).map((name) => (
                <Button
                  key={name}
                  block
                  onClick={() => loadPreset(name)}
                  type={data.contract_no === PRESETS[name].contract_no ? 'primary' : 'default'}
                >
                  {PRESETS[name]._label}
                </Button>
              ))}
            </Space>
          </Card>

          <Card title="⚡ Sinh hợp đồng" size="small">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Tag color="blue">
                Template = {deriveKind(data.incoterm, 'SC')} + {deriveKind(data.incoterm, 'PI')}
              </Tag>
              <Button
                block
                type="primary"
                icon={<DownloadOutlined />}
                loading={loading?.startsWith('SC_')}
                onClick={() => handleDownload('SC')}
              >
                Sinh Sales Contract (SC)
              </Button>
              <Button
                block
                type="primary"
                icon={<DownloadOutlined />}
                loading={loading?.startsWith('PI_')}
                onClick={() => handleDownload('PI')}
              >
                Sinh Proforma Invoice (PI)
              </Button>
              <Divider style={{ margin: '8px 0' }} />
              <Button
                block
                type="default"
                icon={<DownloadOutlined />}
                loading={loading !== null}
                onClick={handleDownloadBoth}
                style={{ background: '#1B4D3E', color: '#fff' }}
              >
                Sinh cả SC + PI
              </Button>
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          <Card title="📝 Form data (chỉnh sửa rồi sinh lại để xem khác biệt)" size="small">
            <Form layout="vertical" size="small">
              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item label="Số HĐ">
                    <Input value={data.contract_no} onChange={(e) => set('contract_no', e.target.value)} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Ngày">
                    <Input value={data.contract_date} onChange={(e) => set('contract_date', e.target.value)} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Incoterm (chọn template)">
                    <Select
                      value={data.incoterm}
                      onChange={(v) => set('incoterm', v)}
                      options={[
                        { value: 'FOB', label: 'FOB → template FOB' },
                        { value: 'CIF', label: 'CIF → template CIF' },
                        { value: 'CFR', label: 'CFR → template CIF' },
                        { value: 'CNF', label: 'CNF → template CIF' },
                      ]}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={12}>
                <Col span={16}>
                  <Form.Item label="Buyer (Khách hàng)">
                    <Input value={data.buyer_name} onChange={(e) => set('buyer_name', e.target.value)} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Phone">
                    <Input
                      value={data.buyer_phone}
                      onChange={(e) => set('buyer_phone', e.target.value)}
                      placeholder="(optional)"
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item label="Buyer address">
                <Input value={data.buyer_address} onChange={(e) => set('buyer_address', e.target.value)} />
              </Form.Item>

              <Row gutter={12}>
                <Col span={6}>
                  <Form.Item label="Grade">
                    <Input value={data.grade} onChange={(e) => set('grade', e.target.value)} />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="Quantity (MT)">
                    <Input value={data.quantity} onChange={(e) => set('quantity', e.target.value)} />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="Unit price (USD/MT)">
                    <Input value={data.unit_price} onChange={(e) => set('unit_price', e.target.value)} />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="Amount (USD)">
                    <Input value={data.amount} onChange={(e) => set('amount', e.target.value)} />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item label="Amount in words (PI)">
                <Input
                  value={data.amount_words}
                  onChange={(e) => set('amount_words', e.target.value)}
                  placeholder="Forty-Nine Thousand…Cents Only"
                />
              </Form.Item>

              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item label="Port of Loading">
                    <Input value={data.pol} onChange={(e) => set('pol', e.target.value)} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Port of Discharge (CIF)">
                    <Input
                      value={data.pod}
                      onChange={(e) => set('pod', e.target.value)}
                      placeholder="Incheon, Korea"
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Time of shipment">
                    <Input value={data.shipment_time} onChange={(e) => set('shipment_time', e.target.value)} />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={12}>
                <Col span={6}>
                  <Form.Item label="Containers">
                    <Input value={data.containers} onChange={(e) => set('containers', e.target.value)} />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="Cont. type">
                    <Input value={data.cont_type} onChange={(e) => set('cont_type', e.target.value)} />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="Bales total">
                    <Input
                      value={data.bales_total}
                      onChange={(e) => set('bales_total', e.target.value)}
                    />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="Pallets (CIF)">
                    <Input
                      value={data.pallets_total}
                      onChange={(e) => set('pallets_total', e.target.value)}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item label="Packing description">
                <Input value={data.packing_desc} onChange={(e) => set('packing_desc', e.target.value)} />
              </Form.Item>

              <Row gutter={12}>
                <Col span={6}>
                  <Form.Item label="Partial">
                    <Select
                      value={data.partial}
                      onChange={(v) => set('partial', v)}
                      options={[
                        { value: 'Allowed', label: 'Allowed' },
                        { value: 'Not Allowed', label: 'Not Allowed' },
                      ]}
                    />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="Trans-shipment">
                    <Select
                      value={data.trans}
                      onChange={(v) => set('trans', v)}
                      options={[
                        { value: 'Allowed', label: 'Allowed' },
                        { value: 'Not Allowed', label: 'Not Allowed' },
                      ]}
                    />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="Claims (days)">
                    <Input value={data.claims_days} onChange={(e) => set('claims_days', e.target.value)} />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="Freight mark">
                    <Input value={data.freight_mark} onChange={(e) => set('freight_mark', e.target.value)} />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item label="Payment">
                <Input value={data.payment} onChange={(e) => set('payment', e.target.value)} />
              </Form.Item>

              <Form.Item label="Payment extra (LC details, etc.)">
                <TextArea
                  rows={2}
                  value={data.payment_extra}
                  onChange={(e) => set('payment_extra', e.target.value)}
                />
              </Form.Item>

              <Form.Item label="Arbitration">
                <Input value={data.arbitration} onChange={(e) => set('arbitration', e.target.value)} />
              </Form.Item>
            </Form>
          </Card>

          <Card
            title={<><CodeOutlined /> Form data JSON (copy nếu cần debug)</>}
            size="small"
            style={{ marginTop: 16 }}
          >
            <pre style={{ fontSize: 11, maxHeight: 200, overflow: 'auto', margin: 0 }}>
              {JSON.stringify(data, null, 2)}
            </pre>
          </Card>
        </Col>
      </Row>

      <Card style={{ marginTop: 24 }}>
        <Text type="secondary">
          ✅ Service path: <code>src/services/sales/contractGeneratorService.ts</code> · Templates:{' '}
          <code>public/contract-templates/template_*.docx</code> · Migration:{' '}
          <code>docs/migrations/sales_contract_workflow.sql</code>
        </Text>
      </Card>
    </div>
  )
}
