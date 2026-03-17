// ============================================================================
// QC INPUT FORM — Ant Design + Full SVR QC
// File: src/components/wms/QCInputForm.tsx
// Mo ta: Input DRC + chi tieu SVR day du, auto-validate, DRC Gauge, QC Badge
// Rewrite: Tailwind -> Ant Design v6
// ============================================================================

import React, { useState, useEffect, useMemo } from 'react'
import {
  InputNumber,
  Tag,
  Collapse,
  Typography,
  Space,
  Spin,
  Row,
  Col,
  Input,
  Alert,
} from 'antd'
import {
  ExperimentOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons'
import { supabase } from '../../lib/supabase'
import { rubberGradeService } from '../../services/wms/rubberGradeService'
import GradeBadge from './GradeBadge'

const { Text } = Typography

// ============================================================================
// TYPES (giu nguyen interface de backward-compatible)
// ============================================================================

export interface QCStandard {
  drc_standard: number | null
  drc_min: number | null
  drc_max: number | null
  drc_warning_low: number | null
  drc_warning_high: number | null
  recheck_interval_days?: number
  recheck_shortened_days?: number
}

export type QCResultType = 'passed' | 'warning' | 'failed'

export interface QCEvaluation {
  result: QCResultType
  message: string
  next_recheck_days?: number
}

export interface QCFormData {
  drc_value: number
  pri_value?: number
  mooney_value?: number
  ash_content?: number
  nitrogen_content?: number
  qc_result: QCResultType
  qc_message: string
  notes?: string
  // Rubber SVR additions
  moisture_content?: number
  volatile_matter?: number
  dirt_content?: number
  metal_content?: number
  color_lovibond?: number
}

export interface QCInputFormProps {
  material_id: string
  onChange?: (data: QCFormData | null) => void
  standard?: QCStandard | null
  initialDRC?: number
  label?: string
  required?: boolean
  showNotes?: boolean
  showAdvanced?: boolean
  compact?: boolean
  disabled?: boolean
  className?: string
}

// ============================================================================
// DEFAULT STANDARD
// ============================================================================

const DEFAULT_STANDARD: QCStandard = {
  drc_standard: 60,
  drc_min: 58,
  drc_max: 62,
  drc_warning_low: 59,
  drc_warning_high: 61,
  recheck_interval_days: 14,
  recheck_shortened_days: 7,
}

// ============================================================================
// HELPERS
// ============================================================================

function evaluateDRC(drc: number, std: QCStandard): QCEvaluation {
  const drcMin = std.drc_min ?? 58
  const drcMax = std.drc_max ?? 62
  const warnLow = std.drc_warning_low ?? 59
  const warnHigh = std.drc_warning_high ?? 61
  const recheckNormal = std.recheck_interval_days ?? 14
  const recheckShort = std.recheck_shortened_days ?? 7

  if (drc < drcMin || drc > drcMax) {
    return { result: 'failed', message: `Ngoài khoảng ${drcMin}–${drcMax}%`, next_recheck_days: recheckShort }
  }
  if (drc < warnLow || drc > warnHigh) {
    return { result: 'warning', message: `Gần biên (cảnh báo ${warnLow}–${warnHigh}%)`, next_recheck_days: recheckShort }
  }
  return { result: 'passed', message: 'Trong khoảng chuẩn', next_recheck_days: recheckNormal }
}

// ============================================================================
// QC BADGE — Ant Design Tag
// ============================================================================

export const QCBadge: React.FC<{
  result: QCResultType | string | undefined | null
  message?: string
  size?: 'sm' | 'md'
}> = ({ result, message, size = 'sm' }) => {
  if (!result) return null

  const config: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    passed: { color: 'success', icon: <CheckCircleOutlined />, label: 'Đạt' },
    warning: { color: 'warning', icon: <ExclamationCircleOutlined />, label: 'Cảnh báo' },
    failed: { color: 'error', icon: <CloseCircleOutlined />, label: 'Không đạt' },
    pending: { color: 'default', icon: <ClockCircleOutlined />, label: 'Chờ' },
    needs_blend: { color: 'purple', icon: <ExperimentOutlined />, label: 'Cần blend' },
  }

  const c = config[result] || config.pending

  return (
    <Tag
      color={c.color}
      icon={c.icon}
      style={{
        fontSize: size === 'sm' ? 12 : 14,
        margin: 0,
        borderRadius: 4,
      }}
    >
      {c.label}
      {message && <span style={{ fontWeight: 400, marginLeft: 4 }}>· {message}</span>}
    </Tag>
  )
}

// ============================================================================
// DRC GAUGE — Giu nguyen visual SVG (da on dinh)
// ============================================================================

export const DRCGauge: React.FC<{
  value: number
  standard: QCStandard
  compact?: boolean
}> = ({ value, standard, compact = false }) => {
  const min = standard.drc_min ?? 58
  const max = standard.drc_max ?? 62
  const range = max - min
  const padding = range * 0.5
  const displayMin = min - padding
  const displayMax = max + padding
  const displayRange = displayMax - displayMin

  const getPosition = (v: number) =>
    Math.max(0, Math.min(100, ((v - displayMin) / displayRange) * 100))

  const safeStart = getPosition(min)
  const safeEnd = getPosition(max)
  const markerPos = getPosition(value)
  const warnLow = standard.drc_warning_low != null ? getPosition(standard.drc_warning_low) : safeStart
  const warnHigh = standard.drc_warning_high != null ? getPosition(standard.drc_warning_high) : safeEnd

  const eval_ = evaluateDRC(value, standard)
  const markerColor =
    eval_.result === 'failed' ? '#DC2626' :
    eval_.result === 'warning' ? '#F59E0B' :
    '#16A34A'

  const height = compact ? 16 : 24

  return (
    <div style={{ marginTop: compact ? 4 : 10 }}>
      <div style={{ position: 'relative', height, borderRadius: 12, overflow: 'hidden', background: '#FEE2E2' }}>
        {/* Warning zones */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${warnLow}%`, width: `${Math.max(0, safeStart - warnLow)}%`, background: '#FEF3C7' }} />
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${safeEnd}%`, width: `${Math.max(0, warnHigh - safeEnd)}%`, background: '#FEF3C7' }} />
        {/* Safe zone */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${safeStart}%`, width: `${Math.max(0, safeEnd - safeStart)}%`, background: '#D1FAE5' }} />
        {/* Marker */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${markerPos}%`, transition: 'left 0.5s ease-out' }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, width: 2, background: markerColor }} />
          <div style={{
            position: 'absolute', top: '50%', transform: 'translate(-50%, -50%)',
            width: compact ? 12 : 16, height: compact ? 12 : 16,
            borderRadius: '50%', background: markerColor,
            border: '2px solid white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }} />
          {!compact && (
            <div style={{
              position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)',
              fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {value.toFixed(1)}%
            </div>
          )}
        </div>
      </div>

      {/* Scale labels */}
      {!compact && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace" }}>
          <span>{displayMin.toFixed(0)}</span>
          <span>{min.toFixed(0)}</span>
          <span>{(standard.drc_standard ?? ((min + max) / 2)).toFixed(0)}</span>
          <span>{max.toFixed(0)}</span>
          <span>{displayMax.toFixed(0)}</span>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const QCInputForm: React.FC<QCInputFormProps> = ({
  material_id,
  onChange,
  standard: externalStandard,
  initialDRC,
  label = 'Kiểm tra chất lượng (QC)',
  required = true,
  showNotes = true,
  showAdvanced = true,
  compact = false,
  disabled = false,
}) => {
  // State
  const [loadingStd, setLoadingStd] = useState(false)
  const [fetchedStandard, setFetchedStandard] = useState<QCStandard | null>(null)
  const [drcValue, setDrcValue] = useState<number | null>(initialDRC ?? null)
  const [priValue, setPriValue] = useState<number | null>(null)
  const [mooneyValue, setMooneyValue] = useState<number | null>(null)
  const [ashContent, setAshContent] = useState<number | null>(null)
  const [nitrogenContent, setNitrogenContent] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  // Rubber SVR fields
  const [moistureContent, setMoistureContent] = useState<number | null>(null)
  const [volatileMatter, setVolatileMatter] = useState<number | null>(null)
  const [dirtContent, setDirtContent] = useState<number | null>(null)
  const [metalContent, setMetalContent] = useState<number | null>(null)
  const [colorLovibond, setColorLovibond] = useState<number | null>(null)

  const standard = useMemo<QCStandard>(() => {
    if (externalStandard) return externalStandard
    if (fetchedStandard) return fetchedStandard
    return DEFAULT_STANDARD
  }, [externalStandard, fetchedStandard])

  const isDefaultStandard = !externalStandard && !fetchedStandard

  // Load standard from DB
  useEffect(() => {
    if (externalStandard !== undefined || !material_id) return
    let cancelled = false
    const load = async () => {
      setLoadingStd(true)
      try {
        const { data } = await supabase
          .from('material_qc_standards')
          .select('drc_standard, drc_min, drc_max, drc_warning_low, drc_warning_high, recheck_interval_days, recheck_shortened_days')
          .eq('material_id', material_id)
          .maybeSingle()
        if (!cancelled) setFetchedStandard(data || null)
      } catch (err) {
        console.error('QCInputForm: load standard error', err)
      } finally {
        if (!cancelled) setLoadingStd(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [material_id, externalStandard])

  // Reset form when material changes
  useEffect(() => {
    setDrcValue(initialDRC ?? null)
    setPriValue(null)
    setMooneyValue(null)
    setAshContent(null)
    setNitrogenContent(null)
    setMoistureContent(null)
    setVolatileMatter(null)
    setDirtContent(null)
    setMetalContent(null)
    setColorLovibond(null)
    setNotes('')
  }, [material_id, initialDRC])

  // Evaluation
  const isValidDRC = drcValue !== null && drcValue > 0 && drcValue <= 100
  const evaluation = useMemo<QCEvaluation | null>(() => {
    if (!isValidDRC || !drcValue) return null
    return evaluateDRC(drcValue, standard)
  }, [isValidDRC, drcValue, standard])

  // Auto-classify grade
  const autoGrade = useMemo(() => {
    if (!isValidDRC || !drcValue) return null
    return rubberGradeService.classifyByDRC(drcValue)
  }, [isValidDRC, drcValue])

  // Notify parent
  useEffect(() => {
    if (!onChange) return
    if (!isValidDRC || !evaluation || !drcValue) {
      onChange(null)
      return
    }
    onChange({
      drc_value: drcValue,
      pri_value: priValue ?? undefined,
      mooney_value: mooneyValue ?? undefined,
      ash_content: ashContent ?? undefined,
      nitrogen_content: nitrogenContent ?? undefined,
      qc_result: evaluation.result,
      qc_message: evaluation.message,
      notes: notes || undefined,
      moisture_content: moistureContent ?? undefined,
      volatile_matter: volatileMatter ?? undefined,
      dirt_content: dirtContent ?? undefined,
      metal_content: metalContent ?? undefined,
      color_lovibond: colorLovibond ?? undefined,
    })
  }, [drcValue, priValue, mooneyValue, ashContent, nitrogenContent, moistureContent, volatileMatter, dirtContent, metalContent, colorLovibond, notes, evaluation, isValidDRC])

  // Border status for DRC input
  const inputStatus = useMemo<'' | 'error' | 'warning' | undefined>(() => {
    if (!evaluation) return undefined
    if (evaluation.result === 'failed') return 'error'
    if (evaluation.result === 'warning') return 'warning'
    return undefined
  }, [evaluation])

  // No material
  if (!material_id) {
    return (
      <div style={{ border: '1px dashed #d9d9d9', borderRadius: 8, padding: 24, textAlign: 'center' }}>
        <ExperimentOutlined style={{ fontSize: 24, color: '#d9d9d9' }} />
        <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>Chọn sản phẩm để nhập QC</div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Space>
          <ExperimentOutlined style={{ color: '#1B4D3E' }} />
          <Text strong>{label}</Text>
          {required && <Text type="danger">*</Text>}
        </Space>
        <Space>
          {autoGrade && <GradeBadge grade={autoGrade} size="small" />}
          {evaluation && <QCBadge result={evaluation.result} />}
        </Space>
      </div>

      {/* Loading standard */}
      {loadingStd && (
        <div style={{ marginBottom: 8 }}>
          <Spin size="small" /> <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>Đang tải ngưỡng QC...</Text>
        </div>
      )}

      {/* DRC Input */}
      <InputNumber
        value={drcValue}
        onChange={v => setDrcValue(v)}
        min={0}
        max={100}
        step={0.1}
        placeholder="60.0"
        disabled={disabled}
        status={inputStatus}
        size="large"
        addonAfter="%"
        style={{
          width: '100%',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 22,
          fontWeight: 700,
        }}
      />

      {/* Standard info */}
      {!loadingStd && (
        <div style={{ marginTop: 6 }}>
          <Space size="middle" style={{ fontSize: 11, color: '#888' }}>
            <span>Chuẩn: <strong style={{ color: '#333', fontFamily: "'JetBrains Mono', monospace" }}>{standard.drc_standard ?? '—'}%</strong></span>
            <span>Khoảng: <strong style={{ color: '#333', fontFamily: "'JetBrains Mono', monospace" }}>{standard.drc_min ?? '—'}–{standard.drc_max ?? '—'}%</strong></span>
            {evaluation?.next_recheck_days && (
              <span><ClockCircleOutlined /> Tái kiểm: {evaluation.next_recheck_days} ngày</span>
            )}
          </Space>
          {isDefaultStandard && (
            <div style={{ fontSize: 10, color: '#bbb', marginTop: 2 }}>
              <InfoCircleOutlined /> Dùng ngưỡng mặc định (chưa cấu hình cho SP này)
            </div>
          )}
        </div>
      )}

      {/* DRC Gauge */}
      {isValidDRC && drcValue && !loadingStd && (
        <DRCGauge value={drcValue} standard={standard} compact={compact} />
      )}

      {/* Evaluation result */}
      {isValidDRC && evaluation && !compact && (
        <Alert
          type={evaluation.result === 'failed' ? 'error' : evaluation.result === 'warning' ? 'warning' : 'success'}
          message={evaluation.message}
          showIcon
          style={{ marginTop: 8, borderRadius: 8 }}
          banner
        />
      )}

      {/* Advanced QC inputs */}
      {showAdvanced && (
        <Collapse
          ghost
          style={{ marginTop: 8 }}
          items={[{
            key: 'advanced',
            label: <Text type="secondary" style={{ fontSize: 13 }}>Chỉ tiêu nâng cao (PRI, Mooney, Ash, N₂, Moisture, Volatile, Dirt, Metal, Color)</Text>,
            children: (
              <Row gutter={[12, 12]}>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 11 }}>PRI</Text>
                  <InputNumber value={priValue} onChange={setPriValue} min={0} max={100} step={0.1} placeholder="—" disabled={disabled} style={{ width: '100%' }} />
                </Col>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 11 }}>Mooney</Text>
                  <InputNumber value={mooneyValue} onChange={setMooneyValue} min={0} max={200} step={0.1} placeholder="—" disabled={disabled} style={{ width: '100%' }} />
                </Col>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 11 }}>Ash (%)</Text>
                  <InputNumber value={ashContent} onChange={setAshContent} min={0} max={5} step={0.01} placeholder="—" disabled={disabled} style={{ width: '100%' }} />
                </Col>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 11 }}>N₂ (%)</Text>
                  <InputNumber value={nitrogenContent} onChange={setNitrogenContent} min={0} max={5} step={0.01} placeholder="—" disabled={disabled} style={{ width: '100%' }} />
                </Col>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 11 }}>Moisture (%)</Text>
                  <InputNumber value={moistureContent} onChange={setMoistureContent} min={0} max={5} step={0.01} placeholder="—" disabled={disabled} style={{ width: '100%' }} />
                </Col>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 11 }}>Volatile (%)</Text>
                  <InputNumber value={volatileMatter} onChange={setVolatileMatter} min={0} max={5} step={0.01} placeholder="—" disabled={disabled} style={{ width: '100%' }} />
                </Col>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 11 }}>Dirt (%)</Text>
                  <InputNumber value={dirtContent} onChange={setDirtContent} min={0} max={1} step={0.001} placeholder="—" disabled={disabled} style={{ width: '100%' }} />
                </Col>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 11 }}>Metal (mg/kg)</Text>
                  <InputNumber value={metalContent} onChange={setMetalContent} min={0} max={100} step={0.01} placeholder="—" disabled={disabled} style={{ width: '100%' }} />
                </Col>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 11 }}>Color Lovibond</Text>
                  <InputNumber value={colorLovibond} onChange={setColorLovibond} min={0} max={20} step={0.1} placeholder="—" disabled={disabled} style={{ width: '100%' }} />
                </Col>
              </Row>
            ),
          }]}
        />
      )}

      {/* Notes */}
      {showNotes && (
        <div style={{ marginTop: 8 }}>
          <Text type="secondary" style={{ fontSize: 11 }}>Ghi chú QC</Text>
          <Input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Ghi chú kiểm tra..."
            disabled={disabled}
            style={{ marginTop: 4 }}
          />
        </div>
      )}
    </div>
  )
}

export default QCInputForm
