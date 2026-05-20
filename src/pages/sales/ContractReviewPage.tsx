// ============================================================================
// CONTRACT REVIEW PAGE (Phú LV — Kiểm tra)
// File: src/pages/sales/ContractReviewPage.tsx
//
// URL: /sales/contracts/review
//
// Mục đích: Phú LV (Kiểm tra) nhận queue HĐ Sale trình → mở review → nhập
// bank info nhận tiền → duyệt (status='approved' để trình Trung/Huy ký)
// hoặc trả lại Sale (status='rejected' với reason).
// ============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Table,
  Tag,
  Button,
  Drawer,
  Space,
  Typography,
  Descriptions,
  Form,
  Input,
  Row,
  Col,
  message,
  Modal,
  Empty,
  Breadcrumb,
  Alert,
  Divider,
  Select,
} from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  EyeOutlined,
  ReloadOutlined,
  HomeOutlined,
  BankOutlined,
  FileWordOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '../../stores/authStore'
import {
  salesContractWorkflowService,
  type SalesOrderContract,
} from '../../services/sales/salesContractWorkflowService'
import {
  downloadContract,
  deriveKind,
  type ContractFormData,
} from '../../services/sales/contractGeneratorService'
import { BANK_PRESETS, getBankPreset } from '../../config/sales.config'

const { Title, Text } = Typography
const { TextArea } = Input

// ============================================================================
// REJECT_REASONS — Common lý do từ chối HĐ (Phú LV chọn nhanh + textarea detail)
// Phú LV pick 1+ category để Sale biết RÕ phải sửa gì.
// ============================================================================

const REJECT_REASONS = [
  { value: 'price',       icon: '💰', label: 'Giá đơn / Đơn giá sai',          color: 'red' },
  { value: 'buyer',       icon: '🏢', label: 'Tên / Địa chỉ KH sai',           color: 'orange' },
  { value: 'incoterm',    icon: '🚢', label: 'Incoterm / Port (POL/POD) sai',  color: 'orange' },
  { value: 'packing',     icon: '📦', label: 'Đóng gói / Số lượng / Bales',    color: 'gold' },
  { value: 'payment',     icon: '💳', label: 'Điều khoản thanh toán sai',      color: 'purple' },
  { value: 'shipment',    icon: '📅', label: 'Thời gian giao hàng sai',        color: 'cyan' },
  { value: 'terms',       icon: '📝', label: 'Điều khoản kèm theo sai',        color: 'blue' },
  { value: 'contract_no', icon: '🔢', label: 'Số HĐ / Ngày HĐ sai',            color: 'magenta' },
  { value: 'other',       icon: '❓', label: 'Khác (ghi chi tiết bên dưới)',   color: 'default' },
]

export default function ContractReviewPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<SalesOrderContract[]>([])
  const [reviewerEmpId, setReviewerEmpId] = useState<string | null>(null)

  // Drawer state
  const [active, setActive] = useState<SalesOrderContract | null>(null)
  const [bankForm] = Form.useForm<{
    bank_account_name: string
    bank_account_no: string
    bank_full_name: string
    bank_address: string
    bank_swift: string
    review_notes?: string
  }>()
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [docLoading, setDocLoading] = useState<'SC' | 'PI' | 'BOTH' | null>(null)

  // Reject modal state
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectCategories, setRejectCategories] = useState<string[]>([])
  const [rejectDetail, setRejectDetail] = useState('')

  // Resolve current employee id (để filter queue theo reviewer_id = mình)
  useEffect(() => {
    salesContractWorkflowService.getCurrentEmployeeId().then(setReviewerEmpId)
  }, [])

  const isAllowedReviewer = useMemo(
    () => salesContractWorkflowService.isAllowedReviewer(user?.email),
    [user],
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      // User trong whitelist → xem TẤT CẢ queue (viewAll=true), không filter
      // theo reviewer_id. Người khác (nếu có) chỉ thấy HĐ assigned cho mình.
      const data = await salesContractWorkflowService.listForReview(
        reviewerEmpId,
        isAllowedReviewer,
      )
      setRows(data)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      message.error(`Không tải được queue: ${msg}`)
    } finally {
      setLoading(false)
    }
  }, [reviewerEmpId, isAllowedReviewer])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const openReview = (row: SalesOrderContract) => {
    setActive(row)
    const fd = row.form_data || {}
    bankForm.setFieldsValue({
      bank_account_name: fd.bank_account_name || 'HUY ANH RUBBER COMPANY LIMITED',
      bank_account_no: fd.bank_account_no || '',
      bank_full_name: fd.bank_full_name || '',
      bank_address: fd.bank_address || '',
      bank_swift: fd.bank_swift || '',
      review_notes: '',
    })
  }

  const closeReview = () => {
    setActive(null)
    bankForm.resetFields()
  }

  const buildUpdatedFormData = (): Partial<ContractFormData> => {
    const vals = bankForm.getFieldsValue()
    return {
      ...(active?.form_data || {}),
      bank_account_name: vals.bank_account_name,
      bank_account_no: vals.bank_account_no,
      bank_full_name: vals.bank_full_name,
      bank_address: vals.bank_address,
      bank_swift: vals.bank_swift,
    }
  }

  const handleDownload = async (type: 'SC' | 'PI' | 'BOTH') => {
    if (!active) return
    const updated = buildUpdatedFormData()
    setDocLoading(type)
    try {
      // Truyền sales_order_id để auto-heal buyer_address/phone từ DB
      const orderId = active.sales_order_id
      if (type === 'BOTH') {
        await downloadContract(
          deriveKind(updated.incoterm || 'FOB', 'SC'),
          updated,
          `${updated.contract_no || 'contract'}_SC.docx`,
          orderId,
        )
        await downloadContract(
          deriveKind(updated.incoterm || 'FOB', 'PI'),
          updated,
          `${updated.contract_no || 'contract'}_PI.docx`,
          orderId,
        )
      } else {
        await downloadContract(
          deriveKind(updated.incoterm || 'FOB', type),
          updated,
          `${updated.contract_no || 'contract'}_${type}.docx`,
          orderId,
        )
      }
      message.success('Đã sinh .docx (preview, không lưu lên server)')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      message.error(`Sinh .docx thất bại: ${msg}`)
    } finally {
      setDocLoading(null)
    }
  }

  const handleApprove = async () => {
    if (!active) return
    // Upload flow: KHÔNG validate bank form (Phú đã fill trực tiếp trên .docx).
    // Chỉ yêu cầu Phú đã upload file đã fill (reviewer_filled_url).
    if (active.flow_type === 'upload') {
      if (!active.reviewer_filled_url) {
        message.error('Cần upload file .docx đã fill 2 chỗ highlight trước khi duyệt')
        return
      }
    } else {
      try {
        await bankForm.validateFields([
          'bank_account_name',
          'bank_account_no',
          'bank_full_name',
          'bank_address',
          'bank_swift',
        ])
      } catch {
        message.error('Cần nhập đầy đủ 5 field bank info trước khi duyệt')
        return
      }
    }
    const updated = active.flow_type === 'upload'
      ? (active.form_data || {})  // upload flow: form_data minimal, không merge bank
      : buildUpdatedFormData()
    const notes = bankForm.getFieldValue('review_notes')
    Modal.confirm({
      title: 'Duyệt + Trình ký',
      content: (
        <div>
          <div>
            HĐ <strong>{active.form_data?.contract_no}</strong> sẽ chuyển sang <Tag color="green">approved</Tag>, trình Trung/Huy ký.
          </div>
          <div style={{ marginTop: 8 }}>Bank info đã chọn sẽ được lưu vào form_data và dùng cho file ký.</div>
        </div>
      ),
      okText: 'Duyệt + Trình ký',
      cancelText: 'Quay lại sửa',
      okButtonProps: { type: 'primary', style: { background: '#1B4D3E' } },
      onOk: async () => {
        setApproving(true)
        try {
          await salesContractWorkflowService.approve(active.id, updated, notes)
          message.success(`Đã duyệt HĐ ${active.form_data?.contract_no} → trình ký`)
          closeReview()
          void refresh()
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          message.error(`Duyệt thất bại: ${msg}`)
        } finally {
          setApproving(false)
        }
      },
    })
  }

  /** Mở modal trả lại (Phú LV chọn category + nhập chi tiết). */
  const handleReject = () => {
    if (!active) return
    setRejectCategories([])
    setRejectDetail('')
    setRejectOpen(true)
  }

  /** Submit trả lại sau khi Phú LV chọn xong reason category + detail. */
  const handleRejectSubmit = async () => {
    if (!active) return
    if (rejectCategories.length === 0) {
      message.error('Cần chọn ít nhất 1 lý do từ chối')
      return
    }
    if (!rejectDetail.trim()) {
      message.error('Cần ghi chi tiết để Sale biết phải sửa gì')
      return
    }
    // Build structured reason: "[Category labels] — detail"
    const catLabels = rejectCategories
      .map((c) => REJECT_REASONS.find((r) => r.value === c)?.label || c)
      .join(' · ')
    const fullReason = `[${catLabels}] — ${rejectDetail.trim()}`

    setRejecting(true)
    try {
      await salesContractWorkflowService.reject(active.id, fullReason)
      message.success('Đã trả lại Sale')
      setRejectOpen(false)
      closeReview()
      void refresh()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      message.error(`Trả lại thất bại: ${msg}`)
    } finally {
      setRejecting(false)
    }
  }

  const reviewerLabel = useMemo(() => {
    const email = user?.email?.toLowerCase()
    if (email === 'phulv@huyanhrubber.com') return 'Phú LV (Kế toán — Kiểm tra)'
    if (email === 'minhld@huyanhrubber.com') return 'Minh LD (Admin — Kiểm tra)'
    return user?.email || '—'
  }, [user])

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <Breadcrumb
        items={[
          { href: '/', title: <HomeOutlined /> },
          { title: 'Sales' },
          { title: 'Hợp đồng — Queue Kiểm tra' },
        ]}
        style={{ marginBottom: 16 }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0, color: '#1B4D3E' }}>
          <BankOutlined /> Queue Kiểm tra HĐ
        </Title>
        <Tag color={isAllowedReviewer ? 'green' : 'orange'}>{reviewerLabel}</Tag>
        <Button
          icon={<ReloadOutlined />}
          onClick={refresh}
          loading={loading}
          style={{ marginLeft: 'auto' }}
        >
          Tải lại
        </Button>
      </div>

      {!isAllowedReviewer && (
        <Alert
          type="warning"
          showIcon
          message="Bạn không nằm trong danh sách được phép kiểm tra HĐ."
          description={`Email được phép: ${salesContractWorkflowService.ALLOWED_REVIEWER_EMAILS.join(', ')}. Bạn đang đăng nhập với ${user?.email || '—'}. RLS DB sẽ chặn các action duyệt/trả lại.`}
          style={{ marginBottom: 16 }}
        />
      )}

      <Card>
        <Table
          dataSource={rows}
          rowKey="id"
          loading={loading}
          locale={{
            emptyText: <Empty description="Chưa có HĐ nào chờ kiểm tra" />,
          }}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          columns={[
            {
              title: 'Số HĐ',
              dataIndex: ['form_data', 'contract_no'],
              key: 'contract_no',
              width: 160,
              render: (v: string, r: SalesOrderContract) => (
                <Space direction="vertical" size={2}>
                  <Space size={4}>
                    <Text strong>{v || r.sales_order?.contract_no || '—'}</Text>
                    {r.flow_type === 'upload' && (
                      <Tag color="purple" style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>
                        📎 Upload
                      </Tag>
                    )}
                  </Space>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    rev #{r.revision_no}
                  </Text>
                </Space>
              ),
            },
            {
              title: 'Khách hàng',
              dataIndex: ['form_data', 'buyer_name'],
              key: 'buyer_name',
              ellipsis: true,
              render: (v: string) => v || '—',
            },
            {
              title: 'Grade',
              dataIndex: ['form_data', 'grade'],
              key: 'grade',
              width: 100,
              render: (v: string) => <Tag color="blue">{v || '—'}</Tag>,
            },
            {
              title: 'Tấn / Cont',
              key: 'qty',
              width: 110,
              render: (_: unknown, r: SalesOrderContract) => (
                <Text>
                  {r.form_data?.quantity || '—'} MT
                  <br />
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {r.form_data?.containers} {r.form_data?.cont_type}
                  </Text>
                </Text>
              ),
            },
            {
              title: 'Giá trị USD',
              dataIndex: ['form_data', 'amount'],
              key: 'amount',
              width: 140,
              align: 'right',
              render: (v: string) => <Text strong>${v || '—'}</Text>,
            },
            {
              title: 'Incoterm',
              dataIndex: ['form_data', 'incoterm'],
              key: 'incoterm',
              width: 100,
              render: (v: string) => <Tag>{v || '—'}</Tag>,
            },
            {
              title: 'Người trình',
              key: 'created_by',
              width: 160,
              render: (_: unknown, r: SalesOrderContract) => (
                <Space direction="vertical" size={2}>
                  <Text style={{ fontSize: 12 }}>
                    {r.created_by_employee?.full_name || '—'}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {r.submitted_at
                      ? new Date(r.submitted_at).toLocaleString('vi-VN')
                      : '—'}
                  </Text>
                </Space>
              ),
            },
            {
              title: 'Action',
              key: 'action',
              width: 100,
              fixed: 'right',
              render: (_: unknown, r: SalesOrderContract) => (
                <Button
                  type="primary"
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => openReview(r)}
                  style={{ background: '#1B4D3E' }}
                >
                  Mở
                </Button>
              ),
            },
          ]}
        />
      </Card>

      {/* Drawer Review */}
      <Drawer
        title={
          <Space>
            <BankOutlined />
            <span>Review HĐ {active?.form_data?.contract_no}</span>
            <Tag color="orange">revision #{active?.revision_no}</Tag>
          </Space>
        }
        open={!!active}
        onClose={closeReview}
        width={720}
        extra={
          <Space>
            <Button
              danger
              icon={<CloseCircleOutlined />}
              onClick={handleReject}
              loading={rejecting}
            >
              Trả lại
            </Button>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={handleApprove}
              loading={approving}
              style={{ background: '#1B4D3E' }}
            >
              Duyệt + Trình ký
            </Button>
          </Space>
        }
      >
        {active && active.flow_type === 'upload' && (
          <UploadFlowReview
            contract={active}
            onFilled={(updated) => setActive(updated)}
          />
        )}
        {active && active.flow_type !== 'upload' && (
          <>
            <Alert
              type="info"
              showIcon
              message="Nhập bank info nhận tiền (5 field) → bấm Duyệt"
              description="Sale đã lên xong HĐ. Bank info hiện đang dùng default Vietin Hue. Nếu HĐ này cần bank khác (BIDV/VCB...) hãy sửa cho đúng trước khi duyệt."
              style={{ marginBottom: 16 }}
            />

            {/* Tóm tắt HĐ (read-only) */}
            <Card size="small" style={{ marginBottom: 16 }} title="Tóm tắt HĐ (read-only)">
              <Descriptions size="small" column={2} bordered>
                <Descriptions.Item label="Số HĐ">
                  {active.form_data?.contract_no || '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Ngày HĐ">
                  {active.form_data?.contract_date || '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Buyer" span={2}>
                  <strong>{active.form_data?.buyer_name}</strong>
                  <br />
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {active.form_data?.buyer_address}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="Grade">
                  <Tag color="blue">{active.form_data?.grade}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Incoterm">
                  <Tag>{active.form_data?.incoterm}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Tấn">
                  {active.form_data?.quantity}
                </Descriptions.Item>
                <Descriptions.Item label="Giá USD/MT">
                  {active.form_data?.unit_price}
                </Descriptions.Item>
                <Descriptions.Item label="Tổng USD" span={2}>
                  <strong>${active.form_data?.amount}</strong>
                </Descriptions.Item>
                <Descriptions.Item label="POL">
                  {active.form_data?.pol || '—'}
                </Descriptions.Item>
                <Descriptions.Item label="POD">
                  {active.form_data?.pod || '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Payment" span={2}>
                  {active.form_data?.payment}
                </Descriptions.Item>
                {active.form_data?.extra_terms && (
                  <Descriptions.Item label="📌 Other Conditions" span={2}>
                    <div style={{
                      padding: 8, background: '#e6f4ff', border: '1px solid #91caff',
                      borderRadius: 6, whiteSpace: 'pre-wrap', fontSize: 12, color: '#1677ff',
                    }}>
                      {active.form_data.extra_terms}
                    </div>
                  </Descriptions.Item>
                )}
              </Descriptions>
            </Card>

            <Divider>
              <Tag color="orange">Bank info — bạn nhập</Tag>
            </Divider>

            <Form form={bankForm} layout="vertical" size="middle">
              {/* Quick-pick: chọn 1 ngân hàng → tự fill 5 field */}
              <Form.Item
                label={<><BankOutlined /> <span style={{ marginLeft: 6 }}>Chọn nhanh ngân hàng (auto-fill 5 field)</span></>}
                tooltip="Chọn TK USD nhận tiền của Huy Anh ở bank nào. Sau khi chọn, 5 field bên dưới sẽ tự điền — bạn có thể sửa lại nếu cần."
              >
                <Select
                  placeholder="— Chọn TK ngân hàng để fill nhanh —"
                  showSearch
                  optionFilterProp="label"
                  allowClear
                  onChange={(v: string | undefined) => {
                    const preset = getBankPreset(v || null)
                    if (preset) {
                      bankForm.setFieldsValue({
                        bank_account_name: preset.bank_account_name,
                        bank_account_no: preset.bank_account_no,
                        bank_full_name: preset.bank_full_name,
                        bank_address: preset.bank_address,
                        bank_swift: preset.bank_swift,
                      })
                      message.success(`Đã fill ${preset.label}`)
                    }
                  }}
                  options={BANK_PRESETS.map((b) => ({
                    value: b.value,
                    label: b.label,
                    searchText: `${b.label} ${b.bank_account_no} ${b.bank_swift}`,
                  }))}
                  filterOption={(input, option) => {
                    const o = option as { searchText?: string; label?: string }
                    return ((o?.searchText || o?.label || '') as string)
                      .toLowerCase().includes(input.toLowerCase())
                  }}
                />
              </Form.Item>

              <Row gutter={12}>
                <Col span={14}>
                  <Form.Item
                    label="Account name"
                    name="bank_account_name"
                    rules={[{ required: true, message: 'Nhập tên TK' }]}
                  >
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={10}>
                  <Form.Item
                    label="Account No."
                    name="bank_account_no"
                    rules={[{ required: true, message: 'Nhập số TK' }]}
                  >
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item
                label="Bank full name"
                name="bank_full_name"
                rules={[{ required: true, message: 'Nhập tên đầy đủ ngân hàng' }]}
              >
                <Input />
              </Form.Item>
              <Row gutter={12}>
                <Col span={17}>
                  <Form.Item
                    label="Bank address"
                    name="bank_address"
                    rules={[{ required: true, message: 'Nhập địa chỉ ngân hàng' }]}
                  >
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={7}>
                  <Form.Item
                    label="SWIFT"
                    name="bank_swift"
                    rules={[{ required: true, message: 'Nhập SWIFT code' }]}
                  >
                    <Input />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item label="Ghi chú (tuỳ chọn)" name="review_notes">
                <TextArea rows={2} placeholder="Note nội bộ cho Sale hoặc cho hồ sơ..." />
              </Form.Item>
            </Form>

            <Divider>Preview file .docx (xem trước khi duyệt)</Divider>
            <Space.Compact block style={{ marginBottom: 8 }}>
              <Button
                icon={<DownloadOutlined />}
                loading={docLoading === 'SC'}
                onClick={() => handleDownload('SC')}
                style={{ flex: 1 }}
              >
                Tải SC
              </Button>
              <Button
                icon={<DownloadOutlined />}
                loading={docLoading === 'PI'}
                onClick={() => handleDownload('PI')}
                style={{ flex: 1 }}
              >
                Tải PI
              </Button>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                loading={docLoading === 'BOTH'}
                onClick={() => handleDownload('BOTH')}
                style={{ flex: 1, background: '#1B4D3E' }}
              >
                Tải cả 2
              </Button>
            </Space.Compact>
            <Text type="secondary" style={{ fontSize: 11 }}>
              File .docx được render với bank info bạn vừa nhập. Mở Word để check
              format trước khi duyệt.
            </Text>
          </>
        )}
      </Drawer>

      {/* ═══ Modal trả lại Sale ═══ */}
      <Modal
        title={
          <Space>
            <CloseCircleOutlined style={{ color: '#cf1322' }} />
            <span>Trả lại Sale — {active?.form_data?.contract_no}</span>
          </Space>
        }
        open={rejectOpen}
        onCancel={() => setRejectOpen(false)}
        width={560}
        footer={[
          <Button key="cancel" onClick={() => setRejectOpen(false)}>Huỷ</Button>,
          <Button
            key="submit"
            type="primary"
            danger
            loading={rejecting}
            icon={<CloseCircleOutlined />}
            onClick={handleRejectSubmit}
          >
            Trả lại Sale
          </Button>,
        ]}
        destroyOnClose
      >
        <Alert
          type="warning"
          showIcon
          message="HĐ sẽ chuyển sang trạng thái 'rejected'"
          description="Sale sẽ nhận thông báo + thấy lý do bạn ghi và bấm 'Sửa & Trình lại' để tạo revision mới."
          style={{ marginBottom: 16 }}
        />

        <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600 }}>
          🏷 Lý do (chọn 1 hoặc nhiều) <span style={{ color: '#cf1322' }}>*</span>
        </div>
        <Select
          mode="multiple"
          value={rejectCategories}
          onChange={setRejectCategories}
          placeholder="Chọn lý do — Sale sẽ thấy danh sách này"
          style={{ width: '100%', marginBottom: 16 }}
          options={REJECT_REASONS.map((r) => ({
            value: r.value,
            label: (
              <Space>
                <span>{r.icon}</span>
                <span>{r.label}</span>
              </Space>
            ),
          }))}
          tagRender={({ value, closable, onClose }) => {
            const meta = REJECT_REASONS.find((r) => r.value === value)
            return (
              <Tag
                color={meta?.color}
                closable={closable}
                onClose={onClose}
                style={{ marginRight: 4 }}
              >
                {meta?.icon} {meta?.label}
              </Tag>
            )
          }}
        />

        <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600 }}>
          📝 Chi tiết <span style={{ color: '#cf1322' }}>*</span>
        </div>
        <TextArea
          rows={4}
          value={rejectDetail}
          onChange={(e) => setRejectDetail(e.target.value)}
          placeholder={
            rejectCategories.includes('price')
              ? 'VD: Giá USD 2,435 không khớp với deal đã chốt — KH yêu cầu 2,420'
              : rejectCategories.includes('buyer')
              ? 'VD: Tên cty thiếu "PTE LTD", địa chỉ thiếu Postal Code 049705'
              : rejectCategories.includes('incoterm')
              ? 'VD: KH yêu cầu CIF Colombo nhưng HĐ ghi FOB Da Nang'
              : 'Ghi cụ thể để Sale biết phải sửa field nào, giá trị đúng là gì'
          }
        />
        <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 6 }}>
          Reason sẽ lưu thành: <strong>[{rejectCategories.length > 0
            ? rejectCategories.map(c => REJECT_REASONS.find(r => r.value === c)?.label).join(' · ')
            : '...'}]</strong> — {rejectDetail || '(chi tiết)'}
        </div>
      </Modal>
    </div>
  )
}

// ============================================================================
// UPLOAD FLOW REVIEW — Phú download file Sale upload, fill 2 ô highlight,
// reupload lại. Hiển thị thay cho form bank info trong Drawer review.
// ============================================================================

interface UploadFlowReviewProps {
  contract: SalesOrderContract
  onFilled: (updated: SalesOrderContract) => void
}

function UploadFlowReview({ contract, onFilled }: UploadFlowReviewProps) {
  const [downloading, setDownloading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [file, setFile] = useState<File | null>(null)

  const handleDownload = async () => {
    if (!contract.sale_upload_url) {
      message.error('HĐ này không có file Sale upload')
      return
    }
    setDownloading(true)
    try {
      const url = await salesContractWorkflowService.getDownloadUrl(contract.sale_upload_url)
      window.open(url, '_blank')
    } catch (e: unknown) {
      message.error(`Download thất bại: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setDownloading(false)
    }
  }

  const handleUploadFilled = async () => {
    if (!file) {
      message.error('Chọn file .docx đã fill trước')
      return
    }
    setUploading(true)
    try {
      const updated = await salesContractWorkflowService.uploadFilledByReviewer(contract.id, file)
      message.success(`Đã upload ${file.name} — bấm Duyệt để trình ký`)
      setFile(null)
      onFilled(updated)
    } catch (e: unknown) {
      message.error(`Upload thất bại: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setUploading(false)
    }
  }

  const hasFilled = !!contract.reviewer_filled_url
  const filledName = contract.reviewer_filled_url?.split('/').pop() || ''

  return (
    <>
      <Alert
        type="info"
        showIcon
        message="📎 Upload flow — Sale tự sửa .docx, anh fill 2 chỗ highlight"
        description={
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            <div><strong>Bước 1:</strong> Bấm "Download file Sale upload" → mở bằng Word</div>
            <div><strong>Bước 2:</strong> Fill 2 chỗ <strong>highlight vàng</strong>: số HĐ + bank info</div>
            <div><strong>Bước 3:</strong> Save file → upload lại bằng nút bên dưới</div>
            <div><strong>Bước 4:</strong> Bấm "Duyệt + Trình ký" ở header</div>
          </div>
        }
        style={{ marginBottom: 16 }}
      />

      {/* Step 1 — Download file Sale */}
      <Card size="small" style={{ marginBottom: 12 }} title="① File Sale upload (gốc)">
        <Space>
          <FileWordOutlined style={{ fontSize: 24, color: '#1B4D3E' }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>
              {contract.sale_upload_url?.split('/').pop() || '—'}
            </div>
            <Button
              type="link"
              size="small"
              icon={<DownloadOutlined />}
              loading={downloading}
              onClick={handleDownload}
              style={{ padding: 0 }}
            >
              Download để mở Word fill
            </Button>
          </div>
        </Space>
      </Card>

      {/* Step 2 — Upload file đã fill */}
      <Card size="small" style={{ marginBottom: 12 }} title={
        <Space>
          <span>② File đã fill (anh upload)</span>
          {hasFilled && <Tag color="green">Đã upload</Tag>}
        </Space>
      }>
        {hasFilled && (
          <div style={{ marginBottom: 12, padding: 8, background: '#f6ffed', borderRadius: 6, border: '1px solid #b7eb8f' }}>
            <Space>
              <CheckCircleOutlined style={{ color: '#52c41a' }} />
              <span style={{ fontSize: 12 }}>{filledName}</span>
            </Space>
          </div>
        )}
        <div
          style={{
            border: file ? '2px solid #1B4D3E' : '2px dashed #d9d9d9',
            background: file ? '#f6ffed' : '#fafafa',
            borderRadius: 8,
            padding: 14,
            textAlign: 'center',
            cursor: 'pointer',
          }}
          onClick={() => document.getElementById('reviewer-fill-input')?.click()}
          onDragOver={(e) => { e.preventDefault() }}
          onDrop={(e) => {
            e.preventDefault()
            const f = e.dataTransfer.files[0]
            if (f && f.name.toLowerCase().endsWith('.docx')) setFile(f)
            else message.error('Chỉ nhận file .docx')
          }}
        >
          <input
            id="reviewer-fill-input"
            type="file"
            accept=".docx"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) setFile(f)
            }}
          />
          {file ? (
            <div>
              <FileWordOutlined style={{ fontSize: 24, color: '#1B4D3E' }} />
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}>{file.name}</div>
              <div style={{ fontSize: 10, color: '#666' }}>{(file.size / 1024).toFixed(0)} KB</div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#666' }}>
              Kéo thả .docx đã fill hoặc bấm để chọn
            </div>
          )}
        </div>
        <Button
          type="primary"
          icon={<CheckCircleOutlined />}
          block
          loading={uploading}
          disabled={!file}
          onClick={handleUploadFilled}
          style={{ marginTop: 8, background: '#1B4D3E' }}
        >
          {hasFilled ? 'Upload thay file đã fill' : 'Upload file đã fill'}
        </Button>
      </Card>

      {/* Read-only context: order info */}
      <Card size="small" title="Tóm tắt đơn (read-only)" style={{ marginBottom: 16 }}>
        <Descriptions size="small" column={2} bordered>
          <Descriptions.Item label="Số HĐ (Sale ghi)">
            {contract.form_data?.contract_no || '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Revision">#{contract.revision_no}</Descriptions.Item>
        </Descriptions>
      </Card>
    </>
  )
}
