// ============================================================================
// PRODUCTION STAGE PAGE — Ant Design
// File: src/pages/wms/production/ProductionStagePage.tsx
// Route: /wms/production/:id/stage/:stageNumber
// Module: Kho Thành Phẩm (WMS) - Huy Anh Rubber ERP
// ============================================================================

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Button,
  Space,
  Typography,
  Row,
  Col,
  Tag,
  Alert,
  Spin,
  Empty,
  Descriptions,
  Checkbox,
  Statistic,
  message,
} from 'antd'
import {
  ArrowLeftOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  ExperimentOutlined,
} from '@ant-design/icons'
import { supabase } from '../../../lib/supabase'
import productionService from '../../../services/wms/productionService'
import type { ProductionOrder, ProductionStageProgress } from '../../../services/wms/wms.types'
import {
  STAGE_NAMES,
  STAGE_DESCRIPTIONS,
  PRODUCTION_STATUS_LABELS,
  PRODUCTION_STATUS_COLORS,
} from '../../../services/wms/wms.types'

const { Title, Text } = Typography

// ============================================================================
// COMPONENT
// ============================================================================

const ProductionStagePage = () => {
  const { id, stageNumber: stageNumStr } = useParams<{ id: string; stageNumber: string }>()
  const navigate = useNavigate()
  const stageNumber = parseInt(stageNumStr || '1', 10)

  const [order, setOrder] = useState<ProductionOrder | null>(null)
  const [stage, setStage] = useState<ProductionStageProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [operators, setOperators] = useState<{ id: string; full_name: string }[]>([])

  // Form state
  const [inputQty, setInputQty] = useState<number | null>(null)
  const [outputQty, setOutputQty] = useState<number | null>(null)
  const [inputDrc, setInputDrc] = useState<number | null>(null)
  const [outputDrc, setOutputDrc] = useState<number | null>(null)
  const [temperature, setTemperature] = useState<number | null>(null)
  const [humidity, setHumidity] = useState<number | null>(null)
  const [durationDays, setDurationDays] = useState<number | null>(null)
  const [operatorId, setOperatorId] = useState<string>('')
  const [qcPassed, setQcPassed] = useState(false)
  const [qcNotes, setQcNotes] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!id) return
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const orderData = await productionService.getById(id)
        setOrder(orderData)

        if (orderData?.stages) {
          const s = orderData.stages.find(st => st.stage_number === stageNumber)
          setStage(s || null)
          if (s) {
            setInputQty(s.input_quantity ?? null)
            setOutputQty(s.output_quantity ?? null)
            setInputDrc(s.input_drc ?? null)
            setOutputDrc(s.output_drc ?? null)
            setTemperature(s.temperature_avg ?? null)
            setHumidity(s.humidity_avg ?? null)
            setOperatorId(s.operator_id || '')
            setQcPassed(s.qc_checkpoint_passed || false)
            setQcNotes(s.qc_notes || '')
            setNotes(s.notes || '')
          }
        }

        const { data: emps } = await supabase
          .from('employees')
          .select('id, full_name')
          .eq('is_active', true)
          .order('full_name')
        if (emps) setOperators(emps)
      } catch (err: any) {
        setError(err.message || 'Không thể tải du lieu')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id, stageNumber])

  const handleCompleteStage = async () => {
    if (!id) return
    setActionLoading(true)
    setError(null)
    try {
      await productionService.completeStage(id, stageNumber, {
        input_quantity: inputQty ?? undefined,
        output_quantity: outputQty ?? undefined,
        input_drc: inputDrc ?? undefined,
        output_drc: outputDrc ?? undefined,
        temperature_avg: temperature ?? undefined,
        humidity_avg: humidity ?? undefined,
        operator_id: operatorId || undefined,
        qc_checkpoint_passed: qcPassed,
        qc_notes: qcNotes || undefined,
        notes: notes || undefined,
      })
      message.success(`Hoàn thành cong doan ${stageNumber}: ${STAGE_NAMES[stageNumber]}`)
      navigate(`/wms/production/${id}`)
    } catch (err: any) {
      setError(err.message || 'Không thể hoàn thành cong doan')
    } finally {
      setActionLoading(false)
    }
  }

  // Calculations
  const weightLoss = inputQty != null && outputQty != null
    ? Math.round((inputQty - outputQty) * 100) / 100
    : null
  const drcChange = inputDrc != null && outputDrc != null
    ? Math.round((outputDrc - inputDrc) * 100) / 100
    : null

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center', paddingTop: 100 }}><Spin size="large" /></div>
  }

  if (!order || !stage) {
    return (
      <div style={{ padding: 24 }}>
        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} showIcon />}
        <Empty description="Không tìm thấy cong doan" />
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button onClick={() => navigate(`/wms/production/${id}`)}>Quay lại</Button>
        </div>
      </div>
    )
  }

  const isDrying = stageNumber === 3
  const isCompleted = stage.status === 'completed'

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      {/* Back */}
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/wms/production/${id}`)}>
          Quay lại
        </Button>
      </Space>

      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>
            <ExperimentOutlined style={{ marginRight: 8 }} />
            Công đoạn {stageNumber}: {STAGE_NAMES[stageNumber]}
          </Title>
          <Text type="secondary">{STAGE_DESCRIPTIONS[stageNumber]}</Text>
          <div style={{ marginTop: 4 }}>
            <Text style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>
              {order.code}
            </Text>
            <Tag color={PRODUCTION_STATUS_COLORS[order.status]} style={{ marginLeft: 8 }}>
              {PRODUCTION_STATUS_LABELS[order.status]}
            </Tag>
          </div>
        </Col>
      </Row>

      {error && (
        <Alert type="error" message={error} closable onClose={() => setError(null)} style={{ marginBottom: 16, borderRadius: 8 }} showIcon />
      )}

      {isCompleted && (
        <Alert type="success" message="Công đoạn nay da hoan thanh" showIcon style={{ marginBottom: 16, borderRadius: 8 }} />
      )}

      {/* Stage info */}
      <Card style={{ borderRadius: 12, marginBottom: 16 }}>
        <Descriptions size="small" column={3}>
          <Descriptions.Item label="Bắt đầu">
            {stage.started_at ? new Date(stage.started_at).toLocaleString('vi-VN') : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Hoàn thành">
            {stage.completed_at ? new Date(stage.completed_at).toLocaleString('vi-VN') : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Thời gian">
            {stage.duration_hours != null ? `${stage.duration_hours} gio` : '—'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Form */}
      <Card style={{ borderRadius: 12, marginBottom: 16 }}>
        <Row gutter={24}>
          <Col span={12}>
            <div style={{ marginBottom: 16 }}>
              <Text strong>Luong vao (kg)</Text>
              <InputNumber
                value={inputQty}
                onChange={setInputQty}
                min={0}
                placeholder="0"
                style={{ width: '100%', marginTop: 4 }}
                size="large"
                disabled={isCompleted}
              />
            </div>
          </Col>
          <Col span={12}>
            <div style={{ marginBottom: 16 }}>
              <Text strong>Luong ra (kg)</Text>
              <InputNumber
                value={outputQty}
                onChange={setOutputQty}
                min={0}
                placeholder="0"
                style={{ width: '100%', marginTop: 4 }}
                size="large"
                disabled={isCompleted}
              />
            </div>
          </Col>
        </Row>

        <Row gutter={24}>
          <Col span={12}>
            <div style={{ marginBottom: 16 }}>
              <Text strong>DRC vao (%)</Text>
              <InputNumber
                value={inputDrc}
                onChange={setInputDrc}
                min={0} max={100} step={0.1}
                placeholder="0.0"
                style={{ width: '100%', marginTop: 4 }}
                disabled={isCompleted}
              />
            </div>
          </Col>
          <Col span={12}>
            <div style={{ marginBottom: 16 }}>
              <Text strong>DRC ra (%)</Text>
              <InputNumber
                value={outputDrc}
                onChange={setOutputDrc}
                min={0} max={100} step={0.1}
                placeholder="0.0"
                style={{ width: '100%', marginTop: 4 }}
                disabled={isCompleted}
              />
            </div>
          </Col>
        </Row>

        {/* Drying-specific fields */}
        {isDrying && (
          <Row gutter={24}>
            <Col span={8}>
              <div style={{ marginBottom: 16 }}>
                <Text strong>Nhiet do TB (°C)</Text>
                <InputNumber
                  value={temperature}
                  onChange={setTemperature}
                  min={0} max={200} step={0.1}
                  placeholder="110"
                  style={{ width: '100%', marginTop: 4 }}
                  disabled={isCompleted}
                />
              </div>
            </Col>
            <Col span={8}>
              <div style={{ marginBottom: 16 }}>
                <Text strong>Do am TB (%)</Text>
                <InputNumber
                  value={humidity}
                  onChange={setHumidity}
                  min={0} max={100} step={0.1}
                  placeholder="60"
                  style={{ width: '100%', marginTop: 4 }}
                  disabled={isCompleted}
                />
              </div>
            </Col>
            <Col span={8}>
              <div style={{ marginBottom: 16 }}>
                <Text strong>So ngay say</Text>
                <InputNumber
                  value={durationDays}
                  onChange={setDurationDays}
                  min={0} step={0.5}
                  placeholder="3"
                  style={{ width: '100%', marginTop: 4 }}
                  disabled={isCompleted}
                />
              </div>
            </Col>
          </Row>
        )}

        <div style={{ marginBottom: 16 }}>
          <Text strong>Nguoi thao tac</Text>
          <Select
            value={operatorId || undefined}
            onChange={setOperatorId}
            placeholder="Chọn người thao tác"
            style={{ width: '100%', marginTop: 4 }}
            allowClear
            showSearch
            optionFilterProp="label"
            disabled={isCompleted}
            options={operators.map(o => ({ value: o.id, label: o.full_name }))}
          />
        </div>

        {/* QC Checkpoint */}
        <Card size="small" style={{ marginBottom: 16, background: '#fafafa', borderRadius: 8 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Checkbox checked={qcPassed} onChange={e => setQcPassed(e.target.checked)} disabled={isCompleted}>
              <Text strong>QC checkpoint dat</Text>
            </Checkbox>
            <Input.TextArea
              value={qcNotes}
              onChange={e => setQcNotes(e.target.value)}
              placeholder="Ghi chú QC..."
              rows={2}
              disabled={isCompleted}
            />
          </Space>
        </Card>

        <div style={{ marginBottom: 16 }}>
          <Text strong>Ghi chú</Text>
          <Input.TextArea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Ghi chú cong doan..."
            rows={2}
            style={{ marginTop: 4 }}
            disabled={isCompleted}
          />
        </div>
      </Card>

      {/* Calculated values */}
      {(weightLoss != null || drcChange != null) && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          {weightLoss != null && (
            <Col span={12}>
              <Card bodyStyle={{ padding: 12 }}>
                <Statistic
                  title="Hao hut (kg)"
                  value={weightLoss}
                  valueStyle={{
                    fontSize: 20,
                    fontFamily: "'JetBrains Mono'",
                    color: weightLoss > 0 ? '#DC2626' : '#16A34A',
                  }}
                />
              </Card>
            </Col>
          )}
          {drcChange != null && (
            <Col span={12}>
              <Card bodyStyle={{ padding: 12 }}>
                <Statistic
                  title="Thay doi DRC (%)"
                  value={drcChange > 0 ? `+${drcChange}` : String(drcChange)}
                  valueStyle={{
                    fontSize: 20,
                    fontFamily: "'JetBrains Mono'",
                    color: drcChange > 0 ? '#16A34A' : '#DC2626',
                  }}
                />
              </Card>
            </Col>
          )}
        </Row>
      )}

      {/* Actions */}
      {!isCompleted && (
        <Space>
          <Button size="large" onClick={() => navigate(`/wms/production/${id}`)} icon={<ArrowLeftOutlined />}>
            Quay lại
          </Button>
          <Button
            type="primary"
            size="large"
            onClick={handleCompleteStage}
            loading={actionLoading}
            icon={<CheckCircleOutlined />}
            style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
          >
            Hoàn thành cong doan
          </Button>
        </Space>
      )}
    </div>
  )
}

export default ProductionStagePage
