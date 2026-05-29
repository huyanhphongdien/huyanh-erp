// ============================================================================
// DEAL LIFECYCLE ACTIONS — 3 button contextual cho flow "Chạy đầu ra"
// File: src/components/b2b/DealLifecycleActions.tsx
//
// Render 1 button + modal tương ứng theo state hiện tại của deal:
//   - has stock_in + !sample_drc + status=processing → "Nhập sample DRC"
//   - status=accepted + has advance + !production_started_at → "Bắt đầu sản xuất"
//   - production_started_at + !finished_product_kg → "Hoàn tất sản xuất"
//
// Đặt trong tab "Sản xuất" của DealDetailPage (chỉ hiển thị cho
// purchase_type='drc_after_production'). Sau mỗi action thành công →
// gọi onRefresh để parent re-fetch + re-render timeline.
// ============================================================================

import { useState } from 'react'
import { Button, Modal, InputNumber, Form, message, Space, Alert } from 'antd'
import {
  ExperimentOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons'
import {
  setSampleDrc,
  startProduction,
  finishProduction,
} from '../../services/b2b/dealLifecycleService'

interface DealLifecycleActionsProps {
  deal: {
    id: string
    deal_number: string
    status: string
    purchase_type: string | null
    stock_in_count?: number | null
    sample_drc?: number | null
    actual_drc?: number | null
    quantity_kg: number
    unit_price: number | null
    production_started_at?: string | null
    finished_product_kg?: number | null
  }
  hasAdvancePaid: boolean  // tính ở parent: advances some(status in [ack/paid])
  onRefresh?: () => void
}

export default function DealLifecycleActions({
  deal,
  hasAdvancePaid,
  onRefresh,
}: DealLifecycleActionsProps) {
  const [openSample, setOpenSample] = useState(false)
  const [openStart, setOpenStart] = useState(false)
  const [openFinish, setOpenFinish] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [sampleForm] = Form.useForm<{ sample_drc: number }>()
  const [finishForm] = Form.useForm<{ finished_product_kg: number }>()

  // Eligibility checks
  if (deal.purchase_type !== 'drc_after_production') return null

  const hasStockIn = (deal.stock_in_count ?? 0) > 0
  const hasSampleDrc = (deal.sample_drc ?? 0) > 0
  const isAccepted = deal.status === 'accepted' || deal.status === 'settled'
  const hasProductionStart = !!deal.production_started_at
  const hasFinishedProduct = (deal.finished_product_kg ?? 0) > 0

  // Determine which action is "current"
  const showSampleBtn = hasStockIn && !hasSampleDrc && deal.status === 'processing'
  const showStartBtn = isAccepted && hasAdvancePaid && !hasProductionStart && hasSampleDrc
  const showFinishBtn = hasProductionStart && !hasFinishedProduct

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleSampleDrc = async () => {
    const vals = await sampleForm.validateFields()
    setSubmitting(true)
    try {
      await setSampleDrc({ deal_id: deal.id, sample_drc: vals.sample_drc })
      message.success(`Đã ghi sample DRC = ${vals.sample_drc}%`)
      setOpenSample(false)
      sampleForm.resetFields()
      onRefresh?.()
    } catch (e: unknown) {
      message.error(`Lỗi: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleStartProduction = async () => {
    setSubmitting(true)
    try {
      await startProduction(deal.id)
      message.success(`Đã bắt đầu sản xuất Deal ${deal.deal_number}`)
      setOpenStart(false)
      onRefresh?.()
    } catch (e: unknown) {
      message.error(`Lỗi: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleFinishProduction = async () => {
    const vals = await finishForm.validateFields()
    setSubmitting(true)
    try {
      const res = await finishProduction({
        deal_id: deal.id,
        finished_product_kg: vals.finished_product_kg,
      })
      const drcStr = res.actual_drc.toFixed(2)
      const grossStr = res.final_gross_vnd.toLocaleString('vi-VN')
      message.success(`SX xong: actual DRC=${drcStr}%, giá cuối=${grossStr}đ`)
      setOpenFinish(false)
      finishForm.resetFields()
      onRefresh?.()
    } catch (e: unknown) {
      message.error(`Lỗi: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSubmitting(false)
    }
  }

  // Nếu không có action nào active → hiển thị empty (timeline tự thể hiện đầy đủ)
  if (!showSampleBtn && !showStartBtn && !showFinishBtn) return null

  // ── Render ──────────────────────────────────────────────────────────────
  // Final gross preview cho modal finish
  const previewFinalGross = (finishedKg: number) => {
    if (!finishedKg || !deal.unit_price || !deal.quantity_kg) return null
    const actualDrc = (finishedKg / deal.quantity_kg) * 100
    const finalGross = Math.round(deal.quantity_kg * (actualDrc / 100) * deal.unit_price)
    const sampleVariance = deal.sample_drc
      ? Math.abs(actualDrc - deal.sample_drc).toFixed(2)
      : null
    return { actualDrc, finalGross, sampleVariance }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        {showSampleBtn && (
          <Button
            type="primary"
            icon={<ExperimentOutlined />}
            onClick={() => setOpenSample(true)}
            style={{ background: '#0ea5e9', borderColor: '#0ea5e9' }}
          >
            Nhập sample DRC
          </Button>
        )}
        {showStartBtn && (
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={() => setOpenStart(true)}
            style={{ background: '#d97706', borderColor: '#d97706' }}
          >
            Bắt đầu sản xuất
          </Button>
        )}
        {showFinishBtn && (
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            onClick={() => setOpenFinish(true)}
            style={{ background: '#16a34a', borderColor: '#16a34a' }}
          >
            Hoàn tất sản xuất + QC final
          </Button>
        )}
      </div>

      {/* ───── Modal 1: Sample DRC ───── */}
      <Modal
        open={openSample}
        title="🧪 Nhập sample DRC (QC sau nhập kho)"
        onCancel={() => setOpenSample(false)}
        onOk={handleSampleDrc}
        okText="Lưu sample DRC"
        confirmLoading={submitting}
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          message="QC lấy mẫu mủ ngay sau khi nhập kho, đo DRC sample để BGĐ có cơ sở duyệt Deal."
          style={{ marginBottom: 16 }}
        />
        <Form form={sampleForm} layout="vertical" preserve={false}>
          <Form.Item
            label="Sample DRC (%)"
            name="sample_drc"
            rules={[
              { required: true, message: 'Nhập sample DRC' },
              { type: 'number', min: 0.01, max: 100, message: 'DRC ∈ (0, 100]' },
            ]}
            tooltip="VD: 35.5 cho mủ tạp, 60+ cho mủ nước. QC đo từ mẫu lấy ngẫu nhiên."
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0.01}
              max={100}
              step={0.1}
              precision={2}
              addonAfter="%"
              autoFocus
              placeholder="VD: 35.5"
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* ───── Modal 2: Start production ───── */}
      <Modal
        open={openStart}
        title="🏭 Bắt đầu sản xuất"
        onCancel={() => setOpenStart(false)}
        onOk={handleStartProduction}
        okText="Bắt đầu SX"
        confirmLoading={submitting}
        destroyOnClose
      >
        <Alert
          type="warning"
          showIcon
          message="Xác nhận bắt đầu sản xuất"
          description={
            <Space direction="vertical" size={4}>
              <span>Deal: <strong>{deal.deal_number}</strong></span>
              <span>NL đầu vào: <strong>{deal.quantity_kg.toLocaleString('vi-VN')} kg</strong> (mủ tươi)</span>
              <span>Sample DRC đã chốt: <strong>{deal.sample_drc}%</strong></span>
              <span>Sau khi bấm: <code>production_started_at</code> = NOW(). Khi xong SX → bấm "Hoàn tất" để nhập KL thành phẩm.</span>
            </Space>
          }
        />
      </Modal>

      {/* ───── Modal 3: Finish production + QC final ───── */}
      <Modal
        open={openFinish}
        title="✅ Hoàn tất sản xuất + QC final"
        onCancel={() => setOpenFinish(false)}
        onOk={handleFinishProduction}
        okText="Chốt KL thành phẩm + Auto-compute giá cuối"
        confirmLoading={submitting}
        destroyOnClose
        width={560}
      >
        <Alert
          type="info"
          showIcon
          message={
            <Space direction="vertical" size={4}>
              <span><strong>Deal:</strong> {deal.deal_number}</span>
              <span><strong>NL đầu vào:</strong> {deal.quantity_kg.toLocaleString('vi-VN')} kg</span>
              <span><strong>Đơn giá:</strong> {(deal.unit_price ?? 0).toLocaleString('vi-VN')} đ/kg</span>
              <span><strong>Sample DRC (QC trước SX):</strong> {deal.sample_drc}%</span>
            </Space>
          }
          style={{ marginBottom: 16 }}
        />
        <Form form={finishForm} layout="vertical" preserve={false}>
          <Form.Item
            label="Khối lượng thành phẩm thực tế (kg)"
            name="finished_product_kg"
            rules={[
              { required: true, message: 'Nhập KL thành phẩm' },
              { type: 'number', min: 0.01, message: 'KL phải > 0' },
            ]}
            tooltip="Đo TP sau khi SX xong. ERP tự compute actual DRC = finished / NL × 100, giá cuối = NL × actual_drc × đơn giá."
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0.01}
              step={1}
              precision={2}
              addonAfter="kg"
              autoFocus
              placeholder="VD: 35000"
            />
          </Form.Item>
          <Form.Item shouldUpdate noStyle>
            {() => {
              const finishedKg = finishForm.getFieldValue('finished_product_kg')
              const preview = previewFinalGross(finishedKg)
              if (!preview) return null
              const isVariant = preview.sampleVariance && parseFloat(preview.sampleVariance) > 3
              return (
                <Alert
                  type={isVariant ? 'warning' : 'success'}
                  showIcon
                  message="Preview giá cuối"
                  description={
                    <Space direction="vertical" size={2}>
                      <span>Actual DRC: <strong>{preview.actualDrc.toFixed(2)}%</strong></span>
                      {preview.sampleVariance && (
                        <span>
                          Variance vs Sample: <strong>{preview.sampleVariance}%</strong>
                          {isVariant && ' ⚠️ > 3%'}
                        </span>
                      )}
                      <span>
                        Giá cuối: <strong style={{ color: '#16a34a' }}>
                          {preview.finalGross.toLocaleString('vi-VN')} đ
                        </strong>
                      </span>
                    </Space>
                  }
                />
              )
            }}
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
