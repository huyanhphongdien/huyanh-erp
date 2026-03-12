// ============================================================================
// DEAL CREATE PAGE — Tạo Deal mới với Ant Steps wizard
// File: src/pages/b2b/deals/DealCreatePage.tsx
// Phase: E2.3.1, E2.3.2, E2.3.3, E2.3.4, E2.3.6, E2.3.7
// ============================================================================

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
  Avatar,
  Descriptions,
  Result,
  message,
  Breadcrumb,
} from 'antd'
import {
  ArrowLeftOutlined,
  UserOutlined,
  ShoppingOutlined,
  CheckCircleOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import {
  dealService,
  DealCreateData,
  DealType,
  DEAL_TYPE_LABELS,
} from '../../../services/b2b/dealService'
import { supabase } from '../../../lib/supabase'

const { Title, Text } = Typography
const { TextArea } = Input
const { Option } = Select

// ============================================
// TYPES
// ============================================

interface Partner {
  id: string
  code: string
  name: string
  tier: string
  phone: string | null
  email: string | null
}

// ============================================
// CONSTANTS
// ============================================

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
  { value: 'SVR CV60', label: 'SVR CV60' },
  { value: 'SVR 3L', label: 'SVR 3L' },
  { value: 'Mủ nước', label: 'Mủ nước' },
  { value: 'Mủ tạp', label: 'Mủ tạp' },
  { value: 'Mủ đông', label: 'Mủ đông' },
  { value: 'Khác', label: 'Khác' },
]

const DEAL_TYPE_OPTIONS: { value: DealType; label: string }[] = [
  { value: 'purchase', label: 'Mua hàng' },
  { value: 'sale', label: 'Bán hàng' },
  { value: 'processing', label: 'Gia công' },
  { value: 'consignment', label: 'Ký gửi' },
]

const DELIVERY_TERMS = [
  { value: 'EXW', label: 'EXW - Giao tại xưởng' },
  { value: 'FOB', label: 'FOB - Giao lên tàu' },
  { value: 'CIF', label: 'CIF - Tiền hàng, bảo hiểm, cước' },
  { value: 'DDP', label: 'DDP - Giao tận nơi' },
]

// ============================================
// STEP 1: PARTNER SELECT (E2.3.2)
// ============================================

interface PartnerSelectStepProps {
  partners: Partner[]
  loading: boolean
  selectedPartner: Partner | null
  onSelect: (partner: Partner) => void
  onNext: () => void
}

const PartnerSelectStep = ({
  partners,
  loading,
  selectedPartner,
  onSelect,
  onNext,
}: PartnerSelectStepProps) => {
  const [searchText, setSearchText] = useState('')

  const filteredPartners = partners.filter(
    (p) =>
      p.name.toLowerCase().includes(searchText.toLowerCase()) ||
      p.code.toLowerCase().includes(searchText.toLowerCase())
  )

  return (
    <div>
      <Title level={5}>Chọn Đại lý</Title>
      <Text type="secondary">Tìm và chọn đại lý để tạo giao dịch</Text>

      <div style={{ marginTop: 24 }}>
        <Input.Search
          placeholder="Tìm theo tên hoặc mã đại lý..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ marginBottom: 16, maxWidth: 400 }}
          allowClear
        />

        <Row gutter={[16, 16]}>
          {filteredPartners.map((partner) => (
            <Col xs={24} sm={12} md={8} key={partner.id}>
              <Card
                hoverable
                onClick={() => onSelect(partner)}
                style={{
                  borderColor: selectedPartner?.id === partner.id ? '#1B4D3E' : undefined,
                  borderWidth: selectedPartner?.id === partner.id ? 2 : 1,
                }}
              >
                <Space>
                  <Avatar
                    size={48}
                    style={{
                      backgroundColor: selectedPartner?.id === partner.id ? '#1B4D3E' : '#87d068',
                    }}
                  >
                    {partner.name.charAt(0)}
                  </Avatar>
                  <div>
                    <Text strong>{partner.name}</Text>
                    <br />
                    <Space size={4}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {partner.code}
                      </Text>
                      <Tag color={TIER_COLORS[partner.tier]} style={{ fontSize: 10 }}>
                        {partner.tier.toUpperCase()}
                      </Tag>
                    </Space>
                  </div>
                </Space>
                {selectedPartner?.id === partner.id && (
                  <CheckCircleOutlined
                    style={{
                      position: 'absolute',
                      top: 12,
                      right: 12,
                      color: '#52c41a',
                      fontSize: 20,
                    }}
                  />
                )}
              </Card>
            </Col>
          ))}
        </Row>

        {filteredPartners.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Text type="secondary">Không tìm thấy đại lý</Text>
          </div>
        )}
      </div>

      <Divider />

      <div style={{ textAlign: 'right' }}>
        <Button
          type="primary"
          onClick={onNext}
          disabled={!selectedPartner}
          size="large"
        >
          Tiếp theo
        </Button>
      </div>
    </div>
  )
}

// ============================================
// STEP 2: DEAL INFO (E2.3.3, E2.3.4)
// ============================================

interface DealInfoStepProps {
  form: ReturnType<typeof Form.useForm>[0]
  selectedPartner: Partner | null
  onBack: () => void
  onNext: () => void
}

const DealInfoStep = ({ form, selectedPartner, onBack, onNext }: DealInfoStepProps) => {
  const [totalValue, setTotalValue] = useState(0)

  const handleValuesChange = () => {
    const quantity = form.getFieldValue('quantity_tons') || 0
    const price = form.getFieldValue('unit_price') || 0
    const total = quantity * 1000 * price // kg * price
    setTotalValue(total)
    form.setFieldValue('total_value_vnd', total)
  }

  const handleNext = async () => {
    try {
      await form.validateFields()
      onNext()
    } catch (error) {
      // Validation error
    }
  }

  return (
    <div>
      <Title level={5}>Thông tin giao dịch</Title>
      <Text type="secondary">Nhập thông tin chi tiết về giao dịch</Text>

      {selectedPartner && (
        <Card size="small" style={{ marginTop: 16, marginBottom: 24, backgroundColor: '#f6ffed' }}>
          <Space>
            <Avatar style={{ backgroundColor: '#1B4D3E' }}>
              {selectedPartner.name.charAt(0)}
            </Avatar>
            <div>
              <Text strong>{selectedPartner.name}</Text>
              <br />
              <Space size={4}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {selectedPartner.code}
                </Text>
                <Tag color={TIER_COLORS[selectedPartner.tier]}>
                  {selectedPartner.tier.toUpperCase()}
                </Tag>
              </Space>
            </div>
          </Space>
        </Card>
      )}

      <Form
        form={form}
        layout="vertical"
        onValuesChange={handleValuesChange}
        initialValues={{
          deal_type: 'purchase',
          currency: 'VND',
        }}
      >
        <Row gutter={24}>
          <Col xs={24} md={12}>
            <Form.Item
              name="deal_type"
              label="Loại giao dịch"
              rules={[{ required: true, message: 'Vui lòng chọn loại giao dịch' }]}
            >
              <Select placeholder="Chọn loại giao dịch">
                {DEAL_TYPE_OPTIONS.map((opt) => (
                  <Option key={opt.value} value={opt.value}>
                    {opt.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="product_name"
              label="Sản phẩm"
              rules={[{ required: true, message: 'Vui lòng chọn sản phẩm' }]}
            >
              <Select placeholder="Chọn sản phẩm" showSearch>
                {PRODUCT_OPTIONS.map((opt) => (
                  <Option key={opt.value} value={opt.value}>
                    {opt.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={24}>
          <Col xs={24} md={8}>
            <Form.Item
              name="quantity_tons"
              label="Số lượng (tấn)"
              rules={[
                { required: true, message: 'Vui lòng nhập số lượng' },
                { type: 'number', min: 0.1, message: 'Số lượng phải lớn hơn 0' },
              ]}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                step={0.1}
                placeholder="Nhập số lượng"
                suffix="tấn"
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              name="unit_price"
              label="Đơn giá (đ/kg)"
              rules={[
                { required: true, message: 'Vui lòng nhập đơn giá' },
                { type: 'number', min: 1, message: 'Đơn giá phải lớn hơn 0' },
              ]}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(value) => value!.replace(/\$\s?|(,*)/g, '') as any}
                placeholder="Nhập đơn giá"
                suffix="đ/kg"
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="total_value_vnd" label="Thành tiền">
              <div
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#f6ffed',
                  borderRadius: 6,
                  border: '1px solid #b7eb8f',
                }}
              >
                <Text strong style={{ color: '#1B4D3E', fontSize: 18 }}>
                  {totalValue.toLocaleString()} VNĐ
                </Text>
              </div>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={24}>
          <Col xs={24} md={12}>
            <Form.Item name="delivery_terms" label="Điều kiện giao hàng">
              <Select placeholder="Chọn điều kiện giao hàng" allowClear>
                {DELIVERY_TERMS.map((opt) => (
                  <Option key={opt.value} value={opt.value}>
                    {opt.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="processing_fee_per_ton" label="Phí gia công (đ/tấn)">
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(value) => value!.replace(/\$\s?|(,*)/g, '') as any}
                placeholder="Nếu có"
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="notes" label="Ghi chú">
          <TextArea rows={3} placeholder="Ghi chú thêm về giao dịch..." />
        </Form.Item>
      </Form>

      <Divider />

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button onClick={onBack} size="large">
          Quay lại
        </Button>
        <Button type="primary" onClick={handleNext} size="large">
          Tiếp theo
        </Button>
      </div>
    </div>
  )
}

// ============================================
// STEP 3: CONFIRM
// ============================================

interface ConfirmStepProps {
  form: ReturnType<typeof Form.useForm>[0]
  selectedPartner: Partner | null
  onBack: () => void
  onSubmit: () => void
  loading: boolean
}

const ConfirmStep = ({ form, selectedPartner, onBack, onSubmit, loading }: ConfirmStepProps) => {
  const values = form.getFieldsValue() as Record<string, any>

  return (
    <div>
      <Title level={5}>Xác nhận thông tin</Title>
      <Text type="secondary">Kiểm tra lại thông tin trước khi tạo giao dịch</Text>

      <Card style={{ marginTop: 24 }}>
        <Descriptions bordered column={{ xs: 1, sm: 2 }}>
          <Descriptions.Item label="Đại lý" span={2}>
            <Space>
              <Avatar style={{ backgroundColor: '#1B4D3E' }}>
                {selectedPartner?.name.charAt(0)}
              </Avatar>
              <div>
                <Text strong>{selectedPartner?.name}</Text>
                <br />
                <Text type="secondary">{selectedPartner?.code}</Text>
              </div>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="Loại giao dịch">
            {values.deal_type && DEAL_TYPE_LABELS[values.deal_type as DealType]}
          </Descriptions.Item>
          <Descriptions.Item label="Sản phẩm">{values.product_name}</Descriptions.Item>
          <Descriptions.Item label="Số lượng">
            <Text strong>{values.quantity_tons} tấn</Text>
          </Descriptions.Item>
          <Descriptions.Item label="Đơn giá">
            {values.unit_price?.toLocaleString()} đ/kg
          </Descriptions.Item>
          <Descriptions.Item label="Thành tiền" span={2}>
            <Text strong style={{ color: '#1B4D3E', fontSize: 20 }}>
              {values.total_value_vnd?.toLocaleString()} VNĐ
            </Text>
          </Descriptions.Item>
          {values.delivery_terms && (
            <Descriptions.Item label="Điều kiện giao hàng">
              {values.delivery_terms}
            </Descriptions.Item>
          )}
          {values.processing_fee_per_ton && (
            <Descriptions.Item label="Phí gia công">
              {values.processing_fee_per_ton.toLocaleString()} đ/tấn
            </Descriptions.Item>
          )}
          {values.notes && (
            <Descriptions.Item label="Ghi chú" span={2}>
              {values.notes}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Divider />

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button onClick={onBack} size="large" disabled={loading}>
          Quay lại
        </Button>
        <Button type="primary" onClick={onSubmit} size="large" loading={loading}>
          Tạo Giao dịch
        </Button>
      </div>
    </div>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

const DealCreatePage = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [form] = Form.useForm()

  // State
  const [currentStep, setCurrentStep] = useState(0)
  const [partners, setPartners] = useState<Partner[]>([])
  const [loadingPartners, setLoadingPartners] = useState(true)
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [createdDeal, setCreatedDeal] = useState<{ id: string; deal_number: string } | null>(null)

  // ============================================
  // DATA FETCHING
  // ============================================

  useEffect(() => {
    const fetchPartners = async () => {
      try {
        setLoadingPartners(true)
        const { data, error } = await supabase
          .from('b2b_partners')
          .select('id, code, name, tier, phone, email')
          .eq('status', 'verified')
          .eq('is_active', true)
          .order('name')

        if (error) throw error
        setPartners(data || [])

        // Pre-select partner from URL params (E2.3.6)
        const partnerId = searchParams.get('partner_id')
        if (partnerId) {
          const partner = data?.find((p: any) => p.id === partnerId)
          if (partner) {
            setSelectedPartner(partner)
            setCurrentStep(1)
          }
        }
      } catch (error) {
        console.error('Error fetching partners:', error)
        message.error('Không thể tải danh sách đại lý')
      } finally {
        setLoadingPartners(false)
      }
    }

    fetchPartners()
  }, [searchParams])

  // ============================================
  // HANDLERS
  // ============================================

  const handleSubmit = async () => {
    if (!selectedPartner) return

    try {
      setSubmitting(true)
      const values = form.getFieldsValue()

      const dealData: DealCreateData = {
        partner_id: selectedPartner.id,
        deal_type: values.deal_type,
        product_name: values.product_name,
        quantity_kg: values.quantity_tons * 1000,
        unit_price: values.unit_price,
        total_value_vnd: values.total_value_vnd,
        delivery_terms: values.delivery_terms,
        processing_fee_per_ton: values.processing_fee_per_ton,
        notes: values.notes,
      }

      const deal = await dealService.createDeal(dealData)
      setCreatedDeal({ id: deal.id, deal_number: deal.deal_number })
      setCurrentStep(3)
      message.success('Tạo giao dịch thành công!')
    } catch (error) {
      console.error('Error creating deal:', error)
      message.error('Không thể tạo giao dịch')
    } finally {
      setSubmitting(false)
    }
  }

  // ============================================
  // RENDER
  // ============================================

  const steps = [
    { title: 'Chọn đại lý', icon: <TeamOutlined /> },
    { title: 'Thông tin', icon: <ShoppingOutlined /> },
    { title: 'Xác nhận', icon: <CheckCircleOutlined /> },
  ]

  return (
    <div style={{ padding: 24 }}>
      {/* Breadcrumb */}
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <a onClick={() => navigate('/b2b')}>B2B</a> },
          { title: <a onClick={() => navigate('/b2b/deals')}>Giao dịch</a> },
          { title: 'Tạo mới' },
        ]}
      />

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Space>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/b2b/deals')}
          />
          <Title level={3} style={{ margin: 0 }}>
            Tạo Giao dịch mới
          </Title>
        </Space>
      </div>

      {/* Steps */}
      <Card style={{ borderRadius: 12 }}>
        {currentStep < 3 && (
          <Steps
            current={currentStep}
            items={steps}
            style={{ marginBottom: 32 }}
          />
        )}

        {/* Step Content */}
        {currentStep === 0 && (
          <PartnerSelectStep
            partners={partners}
            loading={loadingPartners}
            selectedPartner={selectedPartner}
            onSelect={setSelectedPartner}
            onNext={() => setCurrentStep(1)}
          />
        )}

        {currentStep === 1 && (
          <DealInfoStep
            form={form}
            selectedPartner={selectedPartner}
            onBack={() => setCurrentStep(0)}
            onNext={() => setCurrentStep(2)}
          />
        )}

        {currentStep === 2 && (
          <ConfirmStep
            form={form}
            selectedPartner={selectedPartner}
            onBack={() => setCurrentStep(1)}
            onSubmit={handleSubmit}
            loading={submitting}
          />
        )}

        {currentStep === 3 && createdDeal && (
          <Result
            status="success"
            title="Tạo giao dịch thành công!"
            subTitle={`Mã giao dịch: ${createdDeal.deal_number}`}
            extra={[
              <Button
                type="primary"
                key="view"
                onClick={() => navigate(`/b2b/deals/${createdDeal.id}`)}
              >
                Xem chi tiết
              </Button>,
              <Button key="list" onClick={() => navigate('/b2b/deals')}>
                Danh sách giao dịch
              </Button>,
              <Button key="new" onClick={() => {
                setCurrentStep(0)
                setSelectedPartner(null)
                setCreatedDeal(null)
                form.resetFields()
              }}>
                Tạo giao dịch khác
              </Button>,
            ]}
          />
        )}
      </Card>
    </div>
  )
}

export default DealCreatePage