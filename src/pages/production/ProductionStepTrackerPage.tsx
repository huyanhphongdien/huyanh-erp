// ============================================================================
// PRODUCTION STEP TRACKER — Operator View (10 bước SVR)
// File: src/pages/production/ProductionStepTrackerPage.tsx
// Touch-friendly, timeline dọc, form thông số theo bước
// ============================================================================

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Card, Button, Typography, Tag, Input, InputNumber, Select, Space, Spin, Empty,
  message, Descriptions, Modal, Timeline,
} from 'antd'
import {
  ArrowLeftOutlined, CheckCircleOutlined, ClockCircleOutlined,
  PlayCircleOutlined, ExclamationCircleOutlined, StopOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import {
  productionStepService,
  SVR_STEP_TEMPLATES,
  type ProductionStepLog,
} from '../../services/production/productionStepService'
import { downtimeService, REASON_CATEGORIES } from '../../services/production/downtimeService'

const { Title, Text } = Typography
const { TextArea } = Input

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <ClockCircleOutlined style={{ color: '#d9d9d9' }} />,
  in_progress: <PlayCircleOutlined style={{ color: '#fa8c16' }} />,
  completed: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
  skipped: <StopOutlined style={{ color: '#999' }} />,
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'default',
  in_progress: 'processing',
  completed: 'success',
  skipped: 'default',
}

export default function ProductionStepTrackerPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  const [activeStep, setActiveStep] = useState<number | null>(null)
  const [paramValues, setParamValues] = useState<Record<string, any>>({})
  const [notes, setNotes] = useState('')
  const [showDowntimeModal, setShowDowntimeModal] = useState(false)
  const [downtimeCategory, setDowntimeCategory] = useState('mechanical')
  const [downtimeDetail, setDowntimeDetail] = useState('')

  // Fetch production order info
  const { data: order } = useQuery({
    queryKey: ['production-order', orderId],
    queryFn: async () => {
      const { data } = await supabase
        .from('production_orders')
        .select('*, product:materials(name)')
        .eq('id', orderId!)
        .single()
      return data ? { ...data, product: Array.isArray(data.product) ? data.product[0] : data.product } : null
    },
    enabled: !!orderId,
  })

  // Fetch steps
  const { data: steps = [], isLoading } = useQuery({
    queryKey: ['production-steps', orderId],
    queryFn: () => productionStepService.getByOrder(orderId!),
    enabled: !!orderId,
  })

  // Init steps if empty (run once after first load)
  const [stepsInited, setStepsInited] = useState(false)
  useEffect(() => {
    if (orderId && !isLoading && steps.length === 0 && !stepsInited) {
      setStepsInited(true)
      productionStepService.initSteps(orderId).then(() => {
        queryClient.invalidateQueries({ queryKey: ['production-steps', orderId] })
      })
    }
  }, [orderId, isLoading, steps.length, stepsInited])

  // Auto-select current active step
  useEffect(() => {
    const inProgress = steps.find(s => s.status === 'in_progress')
    const firstPending = steps.find(s => s.status === 'pending')
    setActiveStep(inProgress?.step_number || firstPending?.step_number || null)
  }, [steps])

  // Start step
  const startMutation = useMutation({
    mutationFn: async (stepNumber: number) => {
      await productionStepService.startStep(orderId!, stepNumber, user?.employee_id || '')
    },
    onSuccess: () => {
      message.success('Đã bắt đầu bước')
      queryClient.invalidateQueries({ queryKey: ['production-steps', orderId] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  // Complete step
  const completeMutation = useMutation({
    mutationFn: async (stepNumber: number) => {
      await productionStepService.completeStep(orderId!, stepNumber, paramValues, notes)
    },
    onSuccess: () => {
      message.success('Đã hoàn tất bước')
      setParamValues({})
      setNotes('')
      queryClient.invalidateQueries({ queryKey: ['production-steps', orderId] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  // Record downtime
  const downtimeMutation = useMutation({
    mutationFn: async () => {
      await downtimeService.create({
        production_order_id: orderId,
        reason_category: downtimeCategory,
        reason_detail: downtimeDetail || undefined,
        reported_by: user?.employee_id,
      })
    },
    onSuccess: () => {
      message.success('Đã ghi sự cố')
      setShowDowntimeModal(false)
      setDowntimeDetail('')
    },
    onError: (e: Error) => message.error(e.message),
  })

  if (isLoading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>

  const currentStep = activeStep ? steps.find(s => s.step_number === activeStep) : null
  const template = activeStep ? SVR_STEP_TEMPLATES.find(t => t.step_number === activeStep) : null
  const completedCount = steps.filter(s => s.status === 'completed').length
  const progress = steps.length > 0 ? Math.round(completedCount / steps.length * 100) : 0

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} />
        <div style={{ flex: 1 }}>
          <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>
            {order?.order_code || 'Lệnh SX'}
          </Title>
          <Text type="secondary">
            {order?.product?.name || '—'} • {progress}% ({completedCount}/10)
          </Text>
        </div>
        <Tag color={progress === 100 ? 'success' : 'processing'} style={{ fontSize: 14, padding: '4px 12px' }}>
          {progress}%
        </Tag>
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        {/* Timeline bên trái */}
        <div style={{ width: 220, flexShrink: 0 }}>
          <Card size="small" style={{ borderRadius: 12 }} styles={{ body: { padding: 12 } }}>
            {steps.map((step) => (
              <div
                key={step.step_number}
                onClick={() => setActiveStep(step.step_number)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 8px', borderRadius: 8, cursor: 'pointer',
                  background: activeStep === step.step_number ? '#f0fdf4' : 'transparent',
                  border: activeStep === step.step_number ? '1px solid #bbf7d0' : '1px solid transparent',
                  marginBottom: 4,
                }}
              >
                {STATUS_ICON[step.status]}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text strong style={{ fontSize: 12, display: 'block' }}>{step.step_number}. {step.step_name}</Text>
                  {step.duration_minutes != null && (
                    <Text type="secondary" style={{ fontSize: 10 }}>{step.duration_minutes} phút</Text>
                  )}
                </div>
                <Tag color={STATUS_COLOR[step.status]} style={{ fontSize: 10 }}>
                  {step.status === 'pending' ? 'Chờ' : step.status === 'in_progress' ? 'Đang' : step.status === 'completed' ? '✓' : '—'}
                </Tag>
              </div>
            ))}
          </Card>
        </div>

        {/* Form chi tiết bên phải */}
        <div style={{ flex: 1 }}>
          {currentStep && template ? (
            <Card
              size="small"
              style={{ borderRadius: 12 }}
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {STATUS_ICON[currentStep.status]}
                  <span>Bước {template.step_number}: {template.step_name}</span>
                  <Tag color={STATUS_COLOR[currentStep.status]}>{currentStep.status}</Tag>
                </div>
              }
            >
              {/* Timer */}
              {currentStep.started_at && !currentStep.completed_at && (
                <div style={{ padding: '8px 12px', background: '#fff7e6', borderRadius: 8, marginBottom: 12, textAlign: 'center' }}>
                  <ClockCircleOutlined style={{ color: '#fa8c16', marginRight: 4 }} />
                  <Text strong style={{ color: '#fa8c16' }}>
                    Bắt đầu: {new Date(currentStep.started_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                    {' • '}Dự kiến: {template.estimated_minutes} phút
                  </Text>
                </div>
              )}

              {/* Parameter fields */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                {template.param_fields.map(field => (
                  <div key={field.key}>
                    <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                      {field.label} {field.unit && <Text type="secondary">({field.unit})</Text>}
                    </Text>
                    {field.type === 'select' ? (
                      <Select
                        value={paramValues[field.key] || (currentStep.parameters as any)?.[field.key]}
                        onChange={v => setParamValues(prev => ({ ...prev, [field.key]: v }))}
                        style={{ width: '100%' }}
                        size="large"
                        options={(field.options || []).map(o => ({ value: o, label: o }))}
                        disabled={currentStep.status === 'completed'}
                      />
                    ) : field.type === 'number' ? (
                      <InputNumber
                        value={paramValues[field.key] ?? (currentStep.parameters as any)?.[field.key]}
                        onChange={v => setParamValues(prev => ({ ...prev, [field.key]: v }))}
                        style={{ width: '100%' }}
                        size="large"
                        disabled={currentStep.status === 'completed'}
                      />
                    ) : (
                      <Input
                        value={paramValues[field.key] ?? (currentStep.parameters as any)?.[field.key] ?? ''}
                        onChange={e => setParamValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                        size="large"
                        disabled={currentStep.status === 'completed'}
                      />
                    )}
                  </div>
                ))}

                <div>
                  <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Ghi chú</Text>
                  <TextArea
                    value={notes || currentStep.notes || ''}
                    onChange={e => setNotes(e.target.value)}
                    rows={2}
                    disabled={currentStep.status === 'completed'}
                  />
                </div>
              </div>

              {/* Action buttons — Touch-friendly (≥44px) */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {currentStep.status === 'pending' && (
                  <Button
                    type="primary"
                    size="large"
                    icon={<PlayCircleOutlined />}
                    onClick={() => startMutation.mutate(currentStep.step_number)}
                    loading={startMutation.isPending}
                    style={{ background: '#1B4D3E', flex: 1, minHeight: 48 }}
                  >
                    Bắt đầu bước này
                  </Button>
                )}

                {currentStep.status === 'in_progress' && (
                  <>
                    <Button
                      type="primary"
                      size="large"
                      icon={<CheckCircleOutlined />}
                      onClick={() => completeMutation.mutate(currentStep.step_number)}
                      loading={completeMutation.isPending}
                      style={{ background: '#52c41a', borderColor: '#52c41a', flex: 1, minHeight: 48 }}
                    >
                      ✅ Hoàn tất bước
                    </Button>
                    <Button
                      size="large"
                      danger
                      icon={<ExclamationCircleOutlined />}
                      onClick={() => setShowDowntimeModal(true)}
                      style={{ minHeight: 48 }}
                    >
                      🔧 Sự cố
                    </Button>
                  </>
                )}

                {currentStep.status === 'completed' && (
                  <div style={{ padding: '12px 16px', background: '#f6ffed', borderRadius: 8, width: '100%', textAlign: 'center' }}>
                    <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 18, marginRight: 8 }} />
                    <Text strong style={{ color: '#52c41a' }}>
                      Hoàn tất — {currentStep.duration_minutes} phút
                    </Text>
                  </div>
                )}
              </div>

              {/* Completed parameters display */}
              {currentStep.status === 'completed' && Object.keys(currentStep.parameters || {}).length > 0 && (
                <Descriptions size="small" column={2} style={{ marginTop: 12 }} bordered>
                  {Object.entries(currentStep.parameters).map(([key, val]) => {
                    const fieldDef = template.param_fields.find(f => f.key === key)
                    return (
                      <Descriptions.Item key={key} label={fieldDef?.label || key}>
                        {String(val)} {fieldDef?.unit || ''}
                      </Descriptions.Item>
                    )
                  })}
                </Descriptions>
              )}
            </Card>
          ) : (
            <Empty description="Chọn bước bên trái để xem chi tiết" />
          )}
        </div>
      </div>

      {/* Downtime Modal */}
      <Modal
        open={showDowntimeModal}
        title="🔧 Ghi sự cố / Dừng máy"
        okText="Ghi nhận"
        cancelText="Hủy"
        onOk={() => downtimeMutation.mutate()}
        onCancel={() => setShowDowntimeModal(false)}
        confirmLoading={downtimeMutation.isPending}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>Loại sự cố</Text>
            <Select
              value={downtimeCategory}
              onChange={setDowntimeCategory}
              style={{ width: '100%' }}
              size="large"
              options={Object.entries(REASON_CATEGORIES).map(([v, l]) => ({ value: v, label: l }))}
            />
          </div>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>Chi tiết</Text>
            <TextArea
              value={downtimeDetail}
              onChange={e => setDowntimeDetail(e.target.value)}
              rows={3}
              placeholder="Mô tả sự cố..."
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
