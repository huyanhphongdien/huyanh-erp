// ============================================================================
// DEMAND CREATE PAGE — Tao Nhu cau mua moi
// File: src/pages/b2b/demands/DemandCreatePage.tsx
// ============================================================================

import { useState, useEffect } from 'react'
import PartnerMatchSuggestions from '../../../components/b2b/PartnerMatchSuggestions'
import { useNavigate } from 'react-router-dom'
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
  Descriptions,
  Tag,
  DatePicker,
  Radio,
  Result,
  message,
  Breadcrumb,
  Alert,
} from 'antd'
import {
  ArrowLeftOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons'
import {
  demandService,
  DemandCreateData,
  DemandType,
  DEMAND_TYPE_LABELS,
  DEMAND_TYPE_COLORS,
  PRODUCT_TYPE_OPTIONS,
  PRODUCT_TYPE_NAMES,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
  REGION_OPTIONS,
} from '../../../services/b2b/demandService'
import { supabase } from '../../../lib/supabase'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { TextArea } = Input

// ============================================
// TYPES
// ============================================

interface Warehouse {
  id: string
  name: string
  code: string
}

// ============================================
// STEP 1: THONG TIN CHUNG
// ============================================

interface Step1Props {
  form: ReturnType<typeof Form.useForm>[0]
  onNext: () => void
}

const Step1GeneralInfo = ({ form, onNext }: Step1Props) => {
  const demandType = Form.useWatch('demand_type', form)

  const handleNext = async () => {
    try {
      await form.validateFields([
        'demand_type',
        'product_type',
        'quantity_tons',
        'priority',
      ])
      onNext()
    } catch {
      // validation error
    }
  }

  return (
    <div>
      <Title level={5}>Thông tin chung</Title>
      <Text type="secondary">Nhập thông tin cơ bản về nhu cầu mua</Text>

      <Form
        form={form}
        layout="vertical"
        style={{ marginTop: 24 }}
        initialValues={{
          demand_type: 'purchase',
          priority: 'normal',
        }}
      >
        <Form.Item
          name="demand_type"
          label="Loại nhu cầu"
          rules={[{ required: true, message: 'Vui lòng chọn loại nhu cầu' }]}
        >
          <Radio.Group buttonStyle="solid" size="large">
            <Radio.Button value="purchase">
              <Tag color="orange" style={{ margin: 0, border: 'none', background: 'transparent', color: 'inherit' }}>
                Mua đứt
              </Tag>
            </Radio.Button>
            <Radio.Button value="processing">
              <Tag color="purple" style={{ margin: 0, border: 'none', background: 'transparent', color: 'inherit' }}>
                Gia công
              </Tag>
            </Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Row gutter={24}>
          <Col xs={24} md={12}>
            <Form.Item
              name="product_type"
              label="Loại sản phẩm"
              rules={[{ required: true, message: 'Vui lòng chọn loại sản phẩm' }]}
            >
              <Select placeholder="Chọn loại sản phẩm" options={PRODUCT_TYPE_OPTIONS} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
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
                min={0.1}
                step={1}
                precision={1}
                placeholder="Nhập số lượng (tấn)"
                addonAfter="tấn"
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={24}>
          <Col xs={24} md={12}>
            <Form.Item name="drc_min" label="DRC tối thiểu (%)">
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                max={100}
                step={0.5}
                placeholder="VD: 55"
                addonAfter="%"
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="drc_max" label="DRC tối đa (%)">
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                max={100}
                step={0.5}
                placeholder="VD: 65"
                addonAfter="%"
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={24}>
          <Col xs={24} md={12}>
            <Form.Item name="price_min" label="Giá tối thiểu (đ/kg)">
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                step={100}
                placeholder="VD: 25,000"
                formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(value) => value!.replace(/\$\s?|(,*)/g, '') as any}
                addonAfter="đ/kg"
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="price_max" label="Giá tối đa (đ/kg)">
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                step={100}
                placeholder="VD: 35,000"
                formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(value) => value!.replace(/\$\s?|(,*)/g, '') as any}
                addonAfter="đ/kg"
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={24}>
          <Col xs={24} md={8}>
            <Form.Item name="deadline" label="Hạn chót">
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder="Chọn ngày" />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="delivery_range" label="Thời gian giao hàng">
              <DatePicker.RangePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              name="priority"
              label="Mức ưu tiên"
              rules={[{ required: true, message: 'Vui lòng chọn mức ưu tiên' }]}
            >
              <Select
                options={[
                  { value: 'low', label: 'Thấp' },
                  { value: 'normal', label: 'Bình thường' },
                  { value: 'high', label: 'Cao' },
                  { value: 'urgent', label: 'Khẩn cấp' },
                ]}
              />
            </Form.Item>
          </Col>
        </Row>

        {/* Processing-specific fields */}
        {demandType === 'processing' && (
          <>
            <Divider>Thông tin gia công</Divider>
            <Row gutter={24}>
              <Col xs={24} md={8}>
                <Form.Item name="processing_fee_per_ton" label="Phí gia công (đ/tấn)">
                  <InputNumber
                    style={{ width: '100%' }}
                    min={0}
                    formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={(value) => value!.replace(/\$\s?|(,*)/g, '') as any}
                    placeholder="Nhập phí gia công"
                    addonAfter="đ/tấn"
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="expected_output_rate" label="Tỷ lệ thu hồi dự kiến (%)">
                  <InputNumber
                    style={{ width: '100%' }}
                    min={0}
                    max={100}
                    step={0.5}
                    placeholder="VD: 85"
                    addonAfter="%"
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="target_grade" label="Hạng mục tiêu">
                  <Input placeholder="VD: SVR 10, SVR 20" />
                </Form.Item>
              </Col>
            </Row>
          </>
        )}
      </Form>

      {/* Auto-matching suggestions */}
      <div style={{ marginTop: 16 }}>
        <PartnerMatchSuggestions
          criteria={{
            product_type: form.getFieldValue('product_type'),
            min_drc: form.getFieldValue('drc_min'),
            quantity_tons: form.getFieldValue('quantity_tons'),
          }}
        />
      </div>

      <Divider />

      <div style={{ textAlign: 'right' }}>
        <Button type="primary" onClick={handleNext} size="large">
          Tiếp theo
        </Button>
      </div>
    </div>
  )
}

// ============================================
// STEP 2: CHI TIET & XAC NHAN
// ============================================

interface Step2Props {
  form: ReturnType<typeof Form.useForm>[0]
  warehouses: Warehouse[]
  onBack: () => void
  onSaveDraft: () => void
  onPublish: () => void
  submitting: boolean
}

const Step2DetailsConfirm = ({
  form,
  warehouses,
  onBack,
  onSaveDraft,
  onPublish,
  submitting,
}: Step2Props) => {
  const values = form.getFieldsValue(true)
  const productName = PRODUCT_TYPE_NAMES[values.product_type] || values.product_type || '-'

  return (
    <div>
      <Title level={5}>Chi tiết & Xác nhận</Title>
      <Text type="secondary">Thêm thông tin bổ sung và xem lại trước khi lưu</Text>

      <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
        <Row gutter={24}>
          <Col xs={24} md={12}>
            <Form.Item name="preferred_regions" label="Vùng ưu tiên">
              <Select
                mode="tags"
                placeholder="Chọn hoặc nhập vùng ưu tiên"
                options={REGION_OPTIONS.map(r => ({ value: r, label: r }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="warehouse_id" label="Kho nhận hàng">
              <Select
                placeholder="Chọn kho"
                allowClear
                options={warehouses.map(w => ({
                  value: w.id,
                  label: `${w.code} - ${w.name}`,
                }))}
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="notes" label="Ghi chú">
          <TextArea rows={3} placeholder="Ghi chú thêm cho đại lý..." />
        </Form.Item>

        <Form.Item name="internal_notes" label="Ghi chú nội bộ - đại lý không thấy">
          <TextArea
            rows={2}
            placeholder="Ghi chú nội bộ chỉ hiển thị trong ERP..."
            style={{ borderColor: '#faad14' }}
          />
        </Form.Item>

        <Alert
          message="Ghi chú nội bộ sẽ không hiển thị cho đại lý trên Portal"
          type="warning"
          showIcon
          style={{ marginBottom: 24 }}
        />
      </Form>

      {/* Summary Card */}
      <Card title="Tóm tắt nhu cầu" style={{ marginBottom: 24, borderRadius: 12 }}>
        <Descriptions bordered column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label="Loại nhu cầu">
            <Tag color={DEMAND_TYPE_COLORS[values.demand_type as DemandType]}>
              {DEMAND_TYPE_LABELS[values.demand_type as DemandType]}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Sản phẩm">
            {productName}
          </Descriptions.Item>
          <Descriptions.Item label="Số lượng">
            <Text strong>
              {values.quantity_tons ? `${values.quantity_tons} tấn (${Math.round(values.quantity_tons * 1000).toLocaleString()} kg)` : '-'}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="Ưu tiên">
            <Tag color={PRIORITY_COLORS[values.priority] || 'default'}>
              {PRIORITY_LABELS[values.priority] || values.priority}
            </Tag>
          </Descriptions.Item>
          {(values.drc_min || values.drc_max) && (
            <Descriptions.Item label="DRC yêu cầu">
              {values.drc_min && values.drc_max
                ? `${values.drc_min}% - ${values.drc_max}%`
                : values.drc_min
                  ? `>= ${values.drc_min}%`
                  : `<= ${values.drc_max}%`}
            </Descriptions.Item>
          )}
          {(values.price_min || values.price_max) && (
            <Descriptions.Item label="Khoảng giá">
              {values.price_min && values.price_max
                ? `${values.price_min.toLocaleString()} - ${values.price_max.toLocaleString()} đ/kg`
                : values.price_min
                  ? `>= ${values.price_min.toLocaleString()} đ/kg`
                  : `<= ${values.price_max.toLocaleString()} đ/kg`}
            </Descriptions.Item>
          )}
          {values.deadline && (
            <Descriptions.Item label="Hạn chót">
              {dayjs(values.deadline).format('DD/MM/YYYY')}
            </Descriptions.Item>
          )}
          {values.delivery_range && values.delivery_range.length === 2 && (
            <Descriptions.Item label="Thời gian giao">
              {dayjs(values.delivery_range[0]).format('DD/MM/YYYY')} - {dayjs(values.delivery_range[1]).format('DD/MM/YYYY')}
            </Descriptions.Item>
          )}
          {values.demand_type === 'processing' && values.processing_fee_per_ton && (
            <Descriptions.Item label="Phí gia công">
              {values.processing_fee_per_ton.toLocaleString()} đ/tấn
            </Descriptions.Item>
          )}
          {values.demand_type === 'processing' && values.expected_output_rate && (
            <Descriptions.Item label="Tỷ lệ thu hồi">
              {values.expected_output_rate}%
            </Descriptions.Item>
          )}
          {values.demand_type === 'processing' && values.target_grade && (
            <Descriptions.Item label="Hạng mục tiêu">
              {values.target_grade}
            </Descriptions.Item>
          )}
          {values.preferred_regions && values.preferred_regions.length > 0 && (
            <Descriptions.Item label="Vùng ưu tiên" span={2}>
              <Space wrap>
                {values.preferred_regions.map((r: string) => (
                  <Tag key={r}>{r}</Tag>
                ))}
              </Space>
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
        <Button onClick={onBack} size="large" disabled={submitting}>
          Quay lại
        </Button>
        <Space>
          <Button onClick={onSaveDraft} size="large" loading={submitting}>
            Lưu nháp
          </Button>
          <Button
            type="primary"
            onClick={onPublish}
            size="large"
            loading={submitting}
            style={{ backgroundColor: '#1B4D3E', borderColor: '#1B4D3E' }}
          >
            Đăng ngay
          </Button>
        </Space>
      </div>
    </div>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

const DemandCreatePage = () => {
  const navigate = useNavigate()
  const [form] = Form.useForm()

  // State
  const [currentStep, setCurrentStep] = useState(0)
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [createdDemand, setCreatedDemand] = useState<{ id: string; code: string } | null>(null)

  // ============================================
  // DATA FETCHING
  // ============================================

  useEffect(() => {
    const fetchWarehouses = async () => {
      try {
        // Nhu cầu mua = nhập NVL cao su → chỉ cho phép 3 kho NVL (type='raw')
        // KHO-NVL · KHO-LAO-NVL · KHO-TL-NVL
        const { data, error } = await supabase
          .from('warehouses')
          .select('id, name, code')
          .eq('is_active', true)
          .eq('type', 'raw')
          .order('code')

        if (error) throw error
        setWarehouses(data || [])
      } catch (error) {
        console.error('Error fetching warehouses:', error)
      }
    }

    fetchWarehouses()
  }, [])

  // ============================================
  // HANDLERS
  // ============================================

  const buildCreateData = (): DemandCreateData => {
    const values = form.getFieldsValue(true)
    const productName = PRODUCT_TYPE_NAMES[values.product_type] || values.product_type

    const data: DemandCreateData = {
      demand_type: values.demand_type,
      product_type: values.product_type,
      product_name: productName,
      quantity_kg: Math.round((values.quantity_tons || 0) * 1000),
      drc_min: values.drc_min || null,
      drc_max: values.drc_max || null,
      price_min: values.price_min || null,
      price_max: values.price_max || null,
      preferred_regions: values.preferred_regions || null,
      deadline: values.deadline ? dayjs(values.deadline).format('YYYY-MM-DD') : null,
      delivery_from: values.delivery_range?.[0] ? dayjs(values.delivery_range[0]).format('YYYY-MM-DD') : null,
      delivery_to: values.delivery_range?.[1] ? dayjs(values.delivery_range[1]).format('YYYY-MM-DD') : null,
      warehouse_id: values.warehouse_id || null,
      processing_fee_per_ton: values.processing_fee_per_ton || null,
      expected_output_rate: values.expected_output_rate || null,
      target_grade: values.target_grade || null,
      notes: values.notes || null,
      internal_notes: values.internal_notes || null,
      priority: values.priority || 'normal',
    }

    return data
  }

  const handleSaveDraft = async () => {
    try {
      setSubmitting(true)
      const data = buildCreateData()
      const demand = await demandService.create(data)
      setCreatedDemand({ id: demand.id, code: demand.code })
      setCurrentStep(2)
      message.success('Đã lưu nháp nhu cầu!')
    } catch (error) {
      console.error('Error creating demand:', error)
      message.error('Không thể tạo nhu cầu')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePublish = async () => {
    try {
      setSubmitting(true)
      const data = buildCreateData()
      const demand = await demandService.create(data)

      // Immediately publish
      await demandService.publish(demand.id)

      setCreatedDemand({ id: demand.id, code: demand.code })
      setCurrentStep(2)
      message.success('Đã tạo và đăng nhu cầu!')
    } catch (error) {
      console.error('Error creating and publishing demand:', error)
      message.error('Không thể tạo nhu cầu')
    } finally {
      setSubmitting(false)
    }
  }

  // ============================================
  // RENDER
  // ============================================

  const steps = [
    { title: 'Thông tin chung', icon: <FileTextOutlined /> },
    { title: 'Chi tiết & Xác nhận', icon: <CheckCircleOutlined /> },
  ]

  return (
    <div style={{ padding: 24 }}>
      {/* Breadcrumb */}
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <a onClick={() => navigate('/b2b')}>B2B</a> },
          { title: <a onClick={() => navigate('/b2b/demands')}>Nhu cầu mua</a> },
          { title: 'Tạo mới' },
        ]}
      />

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Space>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/b2b/demands')}
          />
          <Title level={3} style={{ margin: 0 }}>
            Tạo nhu cầu mua mới
          </Title>
        </Space>
      </div>

      {/* Steps */}
      <Card style={{ borderRadius: 12 }}>
        {currentStep < 2 && (
          <Steps
            current={currentStep}
            items={steps}
            style={{ marginBottom: 32 }}
          />
        )}

        {/* Step Content */}
        {currentStep === 0 && (
          <Step1GeneralInfo
            form={form}
            onNext={() => setCurrentStep(1)}
          />
        )}

        {currentStep === 1 && (
          <Step2DetailsConfirm
            form={form}
            warehouses={warehouses}
            onBack={() => setCurrentStep(0)}
            onSaveDraft={handleSaveDraft}
            onPublish={handlePublish}
            submitting={submitting}
          />
        )}

        {currentStep === 2 && createdDemand && (
          <Result
            status="success"
            title="Tạo nhu cầu thành công!"
            subTitle={`Mã nhu cầu: ${createdDemand.code}`}
            extra={[
              <Button
                type="primary"
                key="view"
                onClick={() => navigate(`/b2b/demands/${createdDemand.id}`)}
                style={{ backgroundColor: '#1B4D3E', borderColor: '#1B4D3E' }}
              >
                Xem chi tiết
              </Button>,
              <Button key="list" onClick={() => navigate('/b2b/demands')}>
                Danh sách nhu cầu
              </Button>,
              <Button
                key="new"
                onClick={() => {
                  setCurrentStep(0)
                  setCreatedDemand(null)
                  form.resetFields()
                }}
              >
                Tạo nhu cầu khác
              </Button>,
            ]}
          />
        )}
      </Card>
    </div>
  )
}

export default DemandCreatePage
