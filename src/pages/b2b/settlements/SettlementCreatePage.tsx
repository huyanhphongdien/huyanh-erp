import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Card,
  Steps,
  Form,
  Select,
  Input,
  InputNumber,
  Button,
  Space,
  Typography,
  Row,
  Col,
  Divider,
  Tag,
  Descriptions,
  DatePicker,
  Result,
  message,
  Breadcrumb,
  Checkbox,
  List,
} from 'antd'
import {
  ArrowLeftOutlined,
  UserOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  DollarOutlined,
} from '@ant-design/icons'
import {
  settlementService,
  SettlementCreateData,
  SettlementType,
  SETTLEMENT_TYPE_LABELS,
} from '../../../services/b2b/settlementService'
import { advanceService, Advance } from '../../../services/b2b/advanceService'
import SettlementItemsTable from '../../../components/b2b/SettlementItemsTable'
import type { SettlementItemRow } from '../../../components/b2b/SettlementItemsTable'
import { supabase } from '../../../lib/supabase'
import dayjs from 'dayjs'

const { Title, Text } = Typography

const TIER_COLORS: Record<string, string> = {
  diamond: 'purple',
  gold: 'gold',
  silver: 'default',
  bronze: 'orange',
  new: 'cyan',
}

const PRODUCT_OPTIONS = [
  { value: 'SVR 10', label: 'SVR 10' },
  { value: 'SVR 20', label: 'SVR 20' },
  { value: 'SVR CV50', label: 'SVR CV50' },
  { value: 'Mủ nước', label: 'Mủ nước' },
  { value: 'Mủ tạp', label: 'Mủ tạp' },
  { value: 'Mủ đông', label: 'Mủ đông' },
  { value: 'Khac', label: 'Khac' },
]

const SETTLEMENT_TYPE_OPTIONS = [
  { value: 'purchase', label: 'Mua hàng' },
  { value: 'sale', label: 'Bán hàng' },
  { value: 'processing', label: 'Gia công' },
]

interface Partner {
  id: string
  code: string
  name: string
  tier: string
  phone: string | null
}

const formatCurrency = (value: number | undefined | null): string => {
  if (value == null) return '0'
  return new Intl.NumberFormat('vi-VN').format(value)
}

const SettlementCreatePage: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const prefilledDealId = searchParams.get('deal_id')
  const [currentStep, setCurrentStep] = useState(0)
  const [partners, setPartners] = useState<Partner[]>([])
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null)
  const [deals, setDeals] = useState<any[]>([])
  const [unlinkedAdvances, setUnlinkedAdvances] = useState<Advance[]>([])
  const [selectedAdvanceIds, setSelectedAdvanceIds] = useState<string[]>([])
  const [items, setItems] = useState<SettlementItemRow[]>([])
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [createdId, setCreatedId] = useState<string | null>(null)

  // Fetch partners on mount
  useEffect(() => {
    const fetchPartners = async () => {
      const { data } = await supabase
        .from('b2b_partners')
        .select('id, code, name, tier, phone')
        .eq('is_active', true)
        .order('name')
      if (data) setPartners(data)
    }
    fetchPartners()
  }, [])

  // Prefill từ query param deal_id (nav từ DealCard trong chat)
  useEffect(() => {
    if (!prefilledDealId || partners.length === 0 || selectedPartner) return
    const prefill = async () => {
      const { data: deal } = await supabase
        .from('b2b_deals')
        .select('id, partner_id, product_code, deal_type')
        .eq('id', prefilledDealId)
        .single()
      if (!deal) return
      const partner = partners.find((p) => p.id === deal.partner_id)
      if (partner) {
        setSelectedPartner(partner)
        form.setFieldsValue({
          partner_id: partner.id,
          deal_id: deal.id,
          product_type: deal.product_code || undefined,
          settlement_type: deal.deal_type === 'processing' ? 'processing' : 'purchase',
        })
      }
    }
    prefill()
  }, [prefilledDealId, partners, selectedPartner, form])

  // Fetch deals when partner changes
  useEffect(() => {
    if (!selectedPartner) {
      setDeals([])
      return
    }
    const fetchDeals = async () => {
      const { data } = await supabase
        .from('b2b_deals')
        .select('id, deal_number, product_name')
        .eq('partner_id', selectedPartner.id)
      if (data) setDeals(data)
    }
    fetchDeals()
  }, [selectedPartner])

  // Fetch unlinked advances when partner changes
  useEffect(() => {
    if (!selectedPartner) {
      setUnlinkedAdvances([])
      return
    }
    const fetchAdvances = async () => {
      try {
        const data = await advanceService.getUnlinkedAdvances(selectedPartner.id)
        setUnlinkedAdvances(data)
      } catch {
        setUnlinkedAdvances([])
      }
    }
    fetchAdvances()
  }, [selectedPartner])

  // Auto-calculate finished_kg
  const weighedKg = Form.useWatch('weighed_kg', form)
  const drcPercent = Form.useWatch('drc_percent', form)
  const finishedKg = Form.useWatch('finished_kg', form)
  const approvedPrice = Form.useWatch('approved_price', form)

  useEffect(() => {
    if (weighedKg != null && drcPercent != null) {
      form.setFieldValue('finished_kg', Math.round((weighedKg * drcPercent) / 100 * 100) / 100)
    }
  }, [weighedKg, drcPercent, form])

  const grossAmount = (finishedKg || 0) * (approvedPrice || 0)

  const totalItemsAmount = items.reduce((sum, item) => sum + (item.amount || 0), 0)
  const totalAdvanceAmount = unlinkedAdvances
    .filter((a) => selectedAdvanceIds.includes(a.id))
    .reduce((sum, a) => sum + (a.amount || 0), 0)
  const remaining = grossAmount - totalAdvanceAmount + totalItemsAmount

  const handlePartnerChange = (partnerId: string) => {
    const partner = partners.find((p) => p.id === partnerId) || null
    setSelectedPartner(partner)
    form.setFieldValue('deal_id', undefined)
    setSelectedAdvanceIds([])
  }

  const handleNext = async () => {
    if (currentStep === 0) {
      const values = form.getFieldsValue(['partner_id', 'settlement_type', 'product_type'])
      if (!values.partner_id) {
        message.warning('Vui lòng chọn đối tác')
        return
      }
      if (!values.settlement_type) {
        message.warning('Vui lòng chọn loại quyết toán')
        return
      }
      if (!values.product_type) {
        message.warning('Vui lòng chọn loại sản phẩm')
        return
      }
    }
    if (currentStep === 1) {
      try {
        await form.validateFields(['weighed_kg', 'approved_price'])
      } catch {
        return
      }
    }
    setCurrentStep((prev) => prev + 1)
  }

  const handlePrev = () => {
    setCurrentStep((prev) => prev - 1)
  }

  const handleSubmit = async () => {
    setLoading(true)
    try {
      const values = form.getFieldsValue()
      const data: SettlementCreateData = {
        created_by: 'system',
        partner_id: values.partner_id,
        settlement_type: values.settlement_type,
        product_type: values.product_type,
        deal_id: values.deal_id || undefined,
        weighed_kg: values.weighed_kg,
        drc_percent: values.drc_percent,
        finished_kg: values.finished_kg,
        approved_price: values.approved_price,
        vehicle_plates: values.vehicle_plates,
        driver_name: values.driver_name,
        driver_phone: values.driver_phone,
        weigh_date_start: values.weigh_date_start
          ? values.weigh_date_start.format('YYYY-MM-DD')
          : undefined,
        weigh_date_end: values.weigh_date_end
          ? values.weigh_date_end.format('YYYY-MM-DD')
          : undefined,
        stock_in_date: values.stock_in_date
          ? values.stock_in_date.format('YYYY-MM-DD')
          : undefined,
        items: items.map(item => ({
          item_type: item.item_type,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          amount: item.amount,
          is_credit: item.is_credit,
          notes: item.notes,
          reference_id: null,
          reference_number: null,
          reference_date: null,
        })),
        linked_advances: selectedAdvanceIds
          .map(id => unlinkedAdvances.find(a => a.id === id))
          .filter((a): a is NonNullable<typeof a> => !!a)
          .map((a, idx) => ({
            advance_id: a.id,
            advance_date: a.payment_date,
            amount: a.amount,
            notes: null,
            sort_order: idx,
          })),
      }

      const result = await settlementService.createSettlement(data)
      setCreatedId(result.id)
      setCurrentStep(4)
      message.success('Tao phieu quyet toan thanh cong!')
    } catch (err: any) {
      message.error(err?.message || 'Có lỗi xảy ra khi tạo phiếu quyết toán')
    } finally {
      setLoading(false)
    }
  }

  const toggleAdvance = (advanceId: string) => {
    setSelectedAdvanceIds((prev) =>
      prev.includes(advanceId)
        ? prev.filter((id) => id !== advanceId)
        : [...prev, advanceId]
    )
  }

  const renderStep0 = () => (
    <>
      <Form.Item
        name="partner_id"
        label="Đối tác"
        rules={[{ required: true, message: 'Vui lòng chọn đối tác' }]}
      >
        <Select
          showSearch
          placeholder="Tim va chon doi tac..."
          optionFilterProp="label"
          onChange={handlePartnerChange}
          options={partners.map((p) => ({
            value: p.id,
            label: `${p.name} (${p.code})`,
            partner: p,
          }))}
          optionRender={(option) => {
            const p = (option.data as any).partner as Partner
            return (
              <Space>
                <UserOutlined />
                <span>{p.name}</span>
                <Text type="secondary">({p.code})</Text>
                <Tag color={TIER_COLORS[p.tier] || 'default'}>{p.tier}</Tag>
              </Space>
            )
          }}
        />
      </Form.Item>

      <Form.Item
        name="settlement_type"
        label="Loại quyết toán"
        rules={[{ required: true, message: 'Vui lòng chọn loại quyết toán' }]}
      >
        <Select placeholder="Chọn loại quyết toán" options={SETTLEMENT_TYPE_OPTIONS} />
      </Form.Item>

      <Form.Item
        name="product_type"
        label="Loại sản phẩm"
        rules={[{ required: true, message: 'Vui lòng chọn loại sản phẩm' }]}
      >
        <Select placeholder="Chọn loại sản phẩm" options={PRODUCT_OPTIONS} />
      </Form.Item>

      {selectedPartner && deals.length > 0 && (
        <Form.Item name="deal_id" label="Lien ket deal (tuy chon)">
          <Select
            allowClear
            placeholder="Chon deal lien ket..."
            options={deals.map((d) => ({
              value: d.id,
              label: `${d.deal_number} - ${d.product_name}`,
            }))}
          />
        </Form.Item>
      )}

      {selectedPartner && (
        <Card size="small" style={{ marginTop: 16, background: '#f6ffed' }}>
          <Descriptions column={2} size="small">
            <Descriptions.Item label="Ten">{selectedPartner.name}</Descriptions.Item>
            <Descriptions.Item label="Ma">{selectedPartner.code}</Descriptions.Item>
            <Descriptions.Item label="Hang">
              <Tag color={TIER_COLORS[selectedPartner.tier] || 'default'}>
                {selectedPartner.tier}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="SDT">
              {selectedPartner.phone || 'Chưa cập nhật'}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}
    </>
  )

  const renderStep1 = () => (
    <>
      <Row gutter={16}>
        <Col span={8}>
          <Form.Item
            name="weighed_kg"
            label="KL can (kg)"
            rules={[{ required: true, message: 'Vui lòng nhập khối lượng cân' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              placeholder="Nhap KL can"
              formatter={(value) => (value ? formatCurrency(Number(value)) : '')}
              parser={(value) => Number(value?.replace(/\./g, '').replace(/,/g, '')) as any}
            />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="drc_percent" label="Ham luong DRC (%)">
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              max={100}
              placeholder="Nhap DRC"
            />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="finished_kg" label="KL thanh pham (kg)">
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              placeholder="Tự động tính"
              formatter={(value) => (value ? formatCurrency(Number(value)) : '')}
              parser={(value) => Number(value?.replace(/\./g, '').replace(/,/g, '')) as any}
            />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="approved_price"
            label="Don gia duyet (VND/kg)"
            rules={[{ required: true, message: 'Vui lòng nhập đơn giá' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              placeholder="Nhập đơn giá"
              formatter={(value) => (value ? formatCurrency(Number(value)) : '')}
              parser={(value) => Number(value?.replace(/\./g, '').replace(/,/g, '')) as any}
              suffix="VND"
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <div
            style={{
              background: '#e6f7ff',
              border: '1px solid #91d5ff',
              borderRadius: 8,
              padding: '12px 16px',
              marginTop: 30,
              textAlign: 'center',
            }}
          >
            <Text type="secondary">Thanh tien (tam tinh)</Text>
            <Title level={4} style={{ margin: 0, color: '#1890ff' }}>
              {formatCurrency(grossAmount)} VND
            </Title>
          </div>
        </Col>
      </Row>

      <Divider />

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name="vehicle_plates" label="Biến số xe">
            <Input placeholder="VD: 51C-123.45" />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item name="driver_name" label="Tên tài xế">
            <Input placeholder="Nhập tên tài xế" />
          </Form.Item>
        </Col>
        <Col span={6}>
          <Form.Item name="driver_phone" label="SĐT tài xế">
            <Input placeholder="Nhap SDT" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={8}>
          <Form.Item name="weigh_date_start" label="Ngày bắt đầu cân">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="weigh_date_end" label="Ngày kết thúc cân">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="stock_in_date" label="Ngày nhập kho">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
        </Col>
      </Row>
    </>
  )

  const renderStep2 = () => (
    <>
      <Title level={5}>Hang muc quyet toan</Title>
      <SettlementItemsTable editable items={items} onChange={setItems} />

      <Divider />

      <Title level={5}>Tam ung da chi</Title>
      {unlinkedAdvances.length === 0 ? (
        <Text type="secondary">Không có tạm ứng chưa liên kết cho đối tác này.</Text>
      ) : (
        <List
          bordered
          size="small"
          dataSource={unlinkedAdvances}
          renderItem={(advance) => (
            <List.Item>
              <Checkbox
                checked={selectedAdvanceIds.includes(advance.id)}
                onChange={() => toggleAdvance(advance.id)}
              >
                <Space>
                  <Text strong>{advance.advance_number}</Text>
                  <Text type="secondary">
                    {advance.payment_date ? dayjs(advance.payment_date).format('DD/MM/YYYY') : ''}
                  </Text>
                  <Text style={{ color: '#f5222d' }}>
                    {formatCurrency(advance.amount)} VND
                  </Text>
                </Space>
              </Checkbox>
            </List.Item>
          )}
        />
      )}

      <Divider />

      <Card size="small" style={{ background: '#fffbe6', borderColor: '#ffe58f' }}>
        <Row gutter={16}>
          <Col span={8} style={{ textAlign: 'center' }}>
            <Text type="secondary">Thanh tien</Text>
            <br />
            <Text strong style={{ fontSize: 16 }}>
              {formatCurrency(grossAmount)} VND
            </Text>
          </Col>
          <Col span={8} style={{ textAlign: 'center' }}>
            <Text type="secondary">Tong hang muc</Text>
            <br />
            <Text strong style={{ fontSize: 16, color: totalItemsAmount >= 0 ? '#52c41a' : '#f5222d' }}>
              {totalItemsAmount >= 0 ? '+' : ''}{formatCurrency(totalItemsAmount)} VND
            </Text>
          </Col>
          <Col span={8} style={{ textAlign: 'center' }}>
            <Text type="secondary">Tong tam ung</Text>
            <br />
            <Text strong style={{ fontSize: 16, color: '#f5222d' }}>
              -{formatCurrency(totalAdvanceAmount)} VND
            </Text>
          </Col>
        </Row>
        <Divider style={{ margin: '12px 0' }} />
        <div style={{ textAlign: 'center' }}>
          <Text type="secondary">Con phai tra</Text>
          <Title level={3} style={{ margin: 0, color: remaining >= 0 ? '#52c41a' : '#f5222d' }}>
            {formatCurrency(remaining)} VND
          </Title>
        </div>
      </Card>
    </>
  )

  const renderStep3 = () => {
    const values = form.getFieldsValue()
    const selectedDeal = deals.find((d) => d.id === values.deal_id)
    const typeLabel =
      SETTLEMENT_TYPE_OPTIONS.find((o) => o.value === values.settlement_type)?.label || ''
    const productLabel =
      PRODUCT_OPTIONS.find((o) => o.value === values.product_type)?.label || ''

    return (
      <>
        <Descriptions bordered column={2} size="small" title="Thông tin đối tác">
          <Descriptions.Item label="Đối tác">{selectedPartner?.name}</Descriptions.Item>
          <Descriptions.Item label="Mã đối tác">{selectedPartner?.code}</Descriptions.Item>
          <Descriptions.Item label="Hang">
            <Tag color={TIER_COLORS[selectedPartner?.tier || ''] || 'default'}>
              {selectedPartner?.tier}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Loại quyết toán">{typeLabel}</Descriptions.Item>
          <Descriptions.Item label="Sản phẩm">{productLabel}</Descriptions.Item>
          {selectedDeal && (
            <Descriptions.Item label="Deal liên kết">
              {selectedDeal.deal_number} - {selectedDeal.product_name}
            </Descriptions.Item>
          )}
        </Descriptions>

        <Divider />

        <Descriptions bordered column={2} size="small" title="Thong tin can & DRC">
          <Descriptions.Item label="KL can (kg)">
            {formatCurrency(values.weighed_kg)}
          </Descriptions.Item>
          <Descriptions.Item label="DRC (%)">
            {values.drc_percent ?? 'Chưa nhập'}
          </Descriptions.Item>
          <Descriptions.Item label="KL thanh pham (kg)">
            {formatCurrency(values.finished_kg)}
          </Descriptions.Item>
          <Descriptions.Item label="Don gia (VND/kg)">
            {formatCurrency(values.approved_price)}
          </Descriptions.Item>
          <Descriptions.Item label="Biến số xe">
            {values.vehicle_plates || 'Chưa nhập'}
          </Descriptions.Item>
          <Descriptions.Item label="Tài xế">
            {values.driver_name || 'Chưa nhập'}
            {values.driver_phone ? ` (${values.driver_phone})` : ''}
          </Descriptions.Item>
          <Descriptions.Item label="Ngày cân">
            {values.weigh_date_start
              ? dayjs(values.weigh_date_start).format('DD/MM/YYYY')
              : ''}{' '}
            {values.weigh_date_end
              ? `- ${dayjs(values.weigh_date_end).format('DD/MM/YYYY')}`
              : ''}
          </Descriptions.Item>
          <Descriptions.Item label="Ngày nhập kho">
            {values.stock_in_date
              ? dayjs(values.stock_in_date).format('DD/MM/YYYY')
              : 'Chưa chọn'}
          </Descriptions.Item>
        </Descriptions>

        <Divider />

        <Descriptions bordered column={1} size="small" title="Hạng mục quyết toán">
          {items.length === 0 ? (
            <Descriptions.Item label="Hạng mục">Khong co hang muc</Descriptions.Item>
          ) : (
            items.map((item, idx) => (
              <Descriptions.Item key={idx} label={item.description || `Hang muc ${idx + 1}`}>
                {formatCurrency(item.amount)} VND
              </Descriptions.Item>
            ))
          )}
        </Descriptions>

        {selectedAdvanceIds.length > 0 && (
          <>
            <Divider />
            <Descriptions bordered column={1} size="small" title="Tạm ứng trừ">
              {unlinkedAdvances
                .filter((a) => selectedAdvanceIds.includes(a.id))
                .map((a) => (
                  <Descriptions.Item key={a.id} label={a.advance_number}>
                    -{formatCurrency(a.amount)} VND
                  </Descriptions.Item>
                ))}
            </Descriptions>
          </>
        )}

        <Divider />

        <Card
          size="small"
          style={{ background: '#f6ffed', borderColor: '#b7eb8f', borderRadius: 8 }}
        >
          <Row gutter={16}>
            <Col span={8} style={{ textAlign: 'center' }}>
              <Text type="secondary">Thanh tien</Text>
              <Title level={4} style={{ margin: 0 }}>
                {formatCurrency(grossAmount)} VND
              </Title>
            </Col>
            <Col span={8} style={{ textAlign: 'center' }}>
              <Text type="secondary">Tong tam ung</Text>
              <Title level={4} style={{ margin: 0, color: '#f5222d' }}>
                -{formatCurrency(totalAdvanceAmount)} VND
              </Title>
            </Col>
            <Col span={8} style={{ textAlign: 'center' }}>
              <Text type="secondary">Con phai tra</Text>
              <Title
                level={4}
                style={{ margin: 0, color: remaining >= 0 ? '#52c41a' : '#f5222d' }}
              >
                {formatCurrency(remaining)} VND
              </Title>
            </Col>
          </Row>
        </Card>

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Button
            type="primary"
            size="large"
            icon={<CheckCircleOutlined />}
            loading={loading}
            onClick={handleSubmit}
          >
            Xac nhan tao phieu quyet toan
          </Button>
        </div>
      </>
    )
  }

  const renderSuccess = () => (
    <Result
      status="success"
      title="Tao phieu quyet toan thanh cong!"
      subTitle={`Phieu quyet toan da duoc tao cho doi tac ${selectedPartner?.name}.`}
      extra={[
        <Button
          type="primary"
          key="detail"
          onClick={() => navigate(`/b2b/settlements/${createdId}`)}
        >
          Xem chi tiet
        </Button>,
        <Button key="list" onClick={() => navigate('/b2b/settlements')}>
          Danh sach quyet toan
        </Button>,
        <Button key="new" onClick={() => window.location.reload()}>
          Tao phieu moi
        </Button>,
      ]}
    />
  )

  const steps = [
    { title: 'Chọn đối tác', icon: <UserOutlined /> },
    { title: 'Thong tin can & DRC', icon: <FileTextOutlined /> },
    { title: 'Hang muc & Tam ung', icon: <DollarOutlined /> },
    { title: 'Xác nhận', icon: <CheckCircleOutlined /> },
  ]

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: 'B2B' },
          {
            title: <a onClick={() => navigate('/b2b/settlements')}>Quyet toan</a>,
          },
          { title: 'Tạo mới' },
        ]}
      />

      <Space style={{ marginBottom: 24 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/b2b/settlements')}
        >
          Quay lai
        </Button>
        <Title level={4} style={{ margin: 0 }}>
          Tao phieu quyet toan
        </Title>
      </Space>

      <Card style={{ borderRadius: 12 }}>
        {createdId ? (
          renderSuccess()
        ) : (
          <>
            <Steps
              current={currentStep}
              items={steps}
              style={{ marginBottom: 32 }}
            />

            <Form form={form} layout="vertical">
              <div style={{ display: currentStep === 0 ? 'block' : 'none' }}>
                {renderStep0()}
              </div>
              <div style={{ display: currentStep === 1 ? 'block' : 'none' }}>
                {renderStep1()}
              </div>
              <div style={{ display: currentStep === 2 ? 'block' : 'none' }}>
                {renderStep2()}
              </div>
              <div style={{ display: currentStep === 3 ? 'block' : 'none' }}>
                {renderStep3()}
              </div>
            </Form>

            {currentStep < 3 && (
              <div
                style={{
                  marginTop: 24,
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <Button
                  disabled={currentStep === 0}
                  onClick={handlePrev}
                >
                  Truoc
                </Button>
                <Button type="primary" onClick={handleNext}>
                  Tiep theo
                </Button>
              </div>
            )}

            {currentStep === 3 && (
              <div style={{ marginTop: 24, textAlign: 'left' }}>
                <Button onClick={handlePrev}>Truoc</Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}

export default SettlementCreatePage
