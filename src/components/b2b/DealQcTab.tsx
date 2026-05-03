// ============================================================================
// DEAL QC TAB — Tab QC trong DealDetailPage
// File: src/components/b2b/DealQcTab.tsx
// Phase: 4.5
// ============================================================================

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Table,
  Tag,
  Spin,
  Empty,
  Button,
  Typography,
  Modal,
  Form,
  InputNumber,
  Input,
  Select,
  message,
  Tooltip,
  Alert,
} from 'antd'
import { ExperimentOutlined, EditOutlined, CheckOutlined } from '@ant-design/icons'
import {
  dealWmsService,
  DealBatchSummary,
} from '../../services/b2b/dealWmsService'
import { Deal, dealService } from '../../services/b2b/dealService'
import { useAuthStore } from '../../stores/authStore'
import DrcVarianceCard from './DrcVarianceCard'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

const { Text } = Typography
const { TextArea } = Input

// ============================================
// HELPERS
// ============================================

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '-'
  return format(new Date(dateStr), 'dd/MM/yyyy', { locale: vi })
}

const QC_STATUS_COLORS: Record<string, string> = {
  passed: 'green',
  warning: 'orange',
  failed: 'red',
  pending: 'default',
}

const QC_STATUS_LABELS: Record<string, string> = {
  passed: 'Đạt',
  warning: 'Cảnh báo',
  failed: 'Không đạt',
  pending: 'Chờ kiểm tra',
}

// ============================================
// COMPONENT
// ============================================

interface DealQcTabProps {
  dealId: string
  deal: Deal
}

const DealQcTab = ({ dealId, deal: initialDeal }: DealQcTabProps) => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [batches, setBatches] = useState<DealBatchSummary[]>([])
  const [deal, setDeal] = useState<Deal>(initialDeal)
  const [editModal, setEditModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()

  // Role check: trưởng/phó phòng QC (Lê Thành Nhân / Trần Thị Lệ Trinh) + admin.
  // authStore.determineUserRole gán 'manager' cho position level ≤5 (phó phòng↑)
  // nên trưởng/phó phòng QC sẽ auto là 'manager'.
  const canEditQc = user?.role === 'admin' || user?.role === 'manager'
  const editorName = user?.full_name || user?.email || 'QC'

  const loadData = async () => {
    try {
      setLoading(true)
      const data = await dealWmsService.getBatchesByDeal(dealId)
      setBatches(data)
    } catch (error) {
      console.error('Load DealQcTab error:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [dealId])

  const openEditModal = () => {
    form.setFieldsValue({
      actual_drc: deal.actual_drc || deal.expected_drc || undefined,
      actual_weight_kg: deal.actual_weight_kg || deal.quantity_kg || undefined,
      qc_status: deal.qc_status && deal.qc_status !== 'pending' ? deal.qc_status : 'passed',
      qc_notes: '',
    })
    setEditModal(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)

      const updated = await dealService.updateDeal(dealId, {
        actual_drc: values.actual_drc,
        actual_weight_kg: values.actual_weight_kg,
        qc_status: values.qc_status,
        notes: values.qc_notes
          ? `[QC ${editorName} @ ${new Date().toLocaleString('vi-VN')}] ${values.qc_notes}`
          : (deal.notes ?? undefined),
      })

      message.success(`Đã cập nhật QC: DRC ${values.actual_drc}%, trạng thái "${values.qc_status}"`)
      setDeal(updated)
      setEditModal(false)
      await loadData()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(err?.message || 'Không thể cập nhật QC')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
  }

  return (
    <div>
      {/* Header: DRC input button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text strong style={{ fontSize: 15 }}>
          <ExperimentOutlined style={{ marginRight: 8 }} /> Kiểm tra chất lượng (QC)
        </Text>
        <Tooltip
          title={
            !canEditQc
              ? 'Chỉ Trưởng/Phó phòng QC (hoặc Admin) mới cập nhật được DRC thực tế'
              : deal.actual_drc
                ? 'Sửa lại DRC thực tế đã nhập'
                : 'Nhập DRC thực tế sau khi đo mẫu — báo BGĐ'
          }
        >
          <Button
            type="primary"
            icon={deal.actual_drc ? <EditOutlined /> : <CheckOutlined />}
            disabled={!canEditQc}
            onClick={openEditModal}
            style={{
              background: canEditQc ? '#B45309' : undefined,
              borderColor: canEditQc ? '#B45309' : undefined,
            }}
          >
            {deal.actual_drc ? 'Sửa DRC thực tế' : 'Nhập DRC thực tế'}
          </Button>
        </Tooltip>
      </div>

      {/* DRC Variance Analysis Card */}
      <DrcVarianceCard deal={deal} />

      {/* QC Status Summary */}
      {deal.qc_status && deal.qc_status !== 'pending' && (
        <div style={{ marginBottom: 16 }}>
          <Text>Trạng thái QC tổng hợp: </Text>
          <Tag color={QC_STATUS_COLORS[deal.qc_status] || 'default'} style={{ fontSize: 14 }}>
            {QC_STATUS_LABELS[deal.qc_status] || deal.qc_status}
          </Tag>
        </div>
      )}

      {/* Batches Table */}
      {batches.length === 0 ? (
        <Empty description="Chưa có batch QC nào" />
      ) : (
        <>
          <Text strong style={{ fontSize: 15, marginBottom: 12, display: 'block' }}>
            <ExperimentOutlined style={{ marginRight: 8 }} />
            Danh sách Batches ({batches.length})
          </Text>
          <Table
            dataSource={batches}
            rowKey="batch_id"
            columns={[
              {
                title: 'Batch',
                dataIndex: 'batch_no',
                render: (v: string) => <Text strong>{v}</Text>,
              },
              {
                title: 'Vật liệu',
                dataIndex: 'material_name',
              },
              {
                title: 'DRC ban đầu',
                dataIndex: 'initial_drc',
                align: 'right' as const,
                render: (v: number | null) => v ? `${v}%` : '-',
              },
              {
                title: 'DRC hiện tại',
                dataIndex: 'latest_drc',
                align: 'right' as const,
                render: (v: number | null) => v ? (
                  <Text strong style={{ color: '#1B4D3E' }}>{v}%</Text>
                ) : '-',
              },
              {
                title: 'Trạng thái QC',
                dataIndex: 'qc_status',
                render: (s: string) => (
                  <Tag color={QC_STATUS_COLORS[s] || 'default'}>
                    {QC_STATUS_LABELS[s] || s}
                  </Tag>
                ),
              },
              {
                title: 'SL còn (kg)',
                dataIndex: 'quantity_remaining',
                align: 'right' as const,
                render: (v: number) => v ? v.toLocaleString() : '-',
              },
              {
                title: 'Ngày nhận',
                dataIndex: 'received_date',
                render: (d: string) => formatDate(d),
              },
              {
                title: '',
                width: 220,
                render: (_: any, record: DealBatchSummary) => {
                  const isPending = !record.qc_status || record.qc_status === 'pending'
                  return (
                    <Button.Group>
                      <Button
                        size="small"
                        type={isPending ? 'primary' : 'default'}
                        icon={<ExperimentOutlined />}
                        onClick={() => navigate(`/wms/qc?tab=quick-scan&batch=${encodeURIComponent(record.batch_no)}`)}
                        style={isPending ? { background: '#B45309', borderColor: '#B45309' } : undefined}
                      >
                        {isPending ? 'Nhập QC' : 'Sửa QC'}
                      </Button>
                      <Button
                        size="small"
                        onClick={() => navigate(`/wms/qc/batch/${record.batch_id}`)}
                      >
                        Lịch sử
                      </Button>
                    </Button.Group>
                  )
                },
              },
            ]}
            size="small"
            pagination={false}
          />
        </>
      )}

      {/* Modal nhập DRC thực tế (QC manager/deputy) */}
      <Modal
        title={
          <span>
            <ExperimentOutlined style={{ marginRight: 8, color: '#B45309' }} />
            {deal.actual_drc ? 'Sửa kết quả QC' : 'Nhập kết quả QC'}
            <Tag color="orange" style={{ marginLeft: 12 }}>{editorName}</Tag>
          </span>
        }
        open={editModal}
        onCancel={() => setEditModal(false)}
        confirmLoading={submitting}
        onOk={handleSubmit}
        okText="Lưu & báo BGĐ"
        cancelText="Huỷ"
        width={560}
      >
        <Alert
          type="info"
          showIcon
          message="QC đo DRC xong → BGĐ duyệt deal"
          description="DRC thực tế đủ để BGĐ quyết định Duyệt hay Huỷ deal. Có thể cập nhật thêm trọng lượng thực nếu đã cân."
          style={{ marginBottom: 16 }}
        />
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="actual_drc"
            label="DRC thực tế (%)"
            rules={[
              { required: true, message: 'Nhập DRC thực tế' },
              { type: 'number', min: 1, max: 100, message: '1 – 100%' },
            ]}
            extra={deal.expected_drc ? `DRC dự kiến: ${deal.expected_drc}%` : undefined}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={1}
              max={100}
              step={0.5}
              size="large"
              suffix="%"
              placeholder="VD: 52"
            />
          </Form.Item>

          <Form.Item
            name="actual_weight_kg"
            label="Trọng lượng thực (kg)"
            rules={[{ type: 'number', min: 0.1, message: 'Không hợp lệ' }]}
            extra={
              deal.quantity_kg
                ? `Số lượng chốt: ${deal.quantity_kg.toLocaleString('vi-VN')} kg`
                : undefined
            }
          >
            <InputNumber<number>
              style={{ width: '100%' }}
              min={0.1}
              step={100}
              size="large"
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(v) => Number(v!.replace(/,/g, '')) || 0}
              placeholder="VD: 1,600,000"
            />
          </Form.Item>

          <Form.Item
            name="qc_status"
            label="Kết luận QC"
            rules={[{ required: true, message: 'Chọn kết luận' }]}
          >
            <Select
              size="large"
              options={[
                { value: 'passed', label: 'Đạt — hàng tốt, đúng DRC cam kết' },
                { value: 'warning', label: 'Cảnh báo — lệch DRC nhưng chấp nhận được' },
                { value: 'failed', label: 'Không đạt — DRC quá thấp / chất lượng kém' },
              ]}
            />
          </Form.Item>

          <Form.Item name="qc_notes" label="Ghi chú QC (tuỳ chọn)">
            <TextArea rows={3} placeholder="Nguồn mủ, điều kiện đo, nhận xét cho BGĐ..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default DealQcTab
