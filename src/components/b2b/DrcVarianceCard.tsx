// ============================================================================
// DRC VARIANCE CARD — Hiển thị chênh lệch DRC dự kiến vs thực tế
// File: src/components/b2b/DrcVarianceCard.tsx
// ============================================================================

import { useMemo } from 'react'
import { Row, Col, Card, Statistic, Alert } from 'antd'
import { ArrowUpOutlined, ArrowDownOutlined, MinusOutlined } from '@ant-design/icons'
import { Deal } from '../../services/b2b/dealService'
import { drcVarianceService, DrcVariance } from '../../services/b2b/drcVarianceService'

// ============================================
// HELPERS
// ============================================

const formatVnd = (value: number | null): string => {
  if (value === null || value === undefined) return '-'
  return value.toLocaleString('vi-VN')
}

const getDrcDiffIcon = (variance: DrcVariance) => {
  if (variance.drc_diff === null) return undefined
  if (variance.status === 'higher') return <ArrowUpOutlined />
  if (variance.status === 'lower') return <ArrowDownOutlined />
  return <MinusOutlined />
}

const getDrcDiffColor = (variance: DrcVariance): string => {
  if (variance.drc_diff === null) return '#999'
  if (variance.status === 'higher') return '#52c41a'
  if (variance.status === 'lower') return '#cf1322'
  return '#666'
}

const getValueDiffColor = (valueDiff: number | null): string => {
  if (valueDiff === null) return '#999'
  if (valueDiff > 0) return '#52c41a'
  if (valueDiff < 0) return '#cf1322'
  return '#666'
}

const getValueDiffIcon = (valueDiff: number | null) => {
  if (valueDiff === null) return undefined
  if (valueDiff > 0) return <ArrowUpOutlined />
  if (valueDiff < 0) return <ArrowDownOutlined />
  return <MinusOutlined />
}

// ============================================
// COMPONENT
// ============================================

interface DrcVarianceCardProps {
  deal: Deal
}

const DrcVarianceCard = ({ deal }: DrcVarianceCardProps) => {
  const variance = useMemo(() => drcVarianceService.calculateVariance(deal), [deal])

  // Determine alert level based on DRC difference percentage
  const alertInfo = useMemo(() => {
    if (variance.drc_diff_percent === null) return null
    const absDiffPercent = Math.abs(variance.drc_diff_percent)
    if (absDiffPercent > 10) {
      return {
        type: 'error' as const,
        message: `DRC chênh lệch lớn: ${variance.drc_diff_percent! > 0 ? '+' : ''}${variance.drc_diff_percent!.toFixed(1)}% so với dự kiến. Cần kiểm tra lại chất lượng.`,
      }
    }
    if (absDiffPercent > 5) {
      return {
        type: 'warning' as const,
        message: `DRC chênh lệch đáng chú ý: ${variance.drc_diff_percent! > 0 ? '+' : ''}${variance.drc_diff_percent!.toFixed(1)}% so với dự kiến.`,
      }
    }
    return null
  }, [variance])

  return (
    <Card
      size="small"
      title="Phân tích chênh lệch DRC"
      style={{
        marginBottom: 24,
        borderRadius: 8,
        borderTop: '3px solid #1B4D3E',
      }}
      headStyle={{
        background: '#f6ffed',
        borderBottom: '1px solid #e8e8e8',
        color: '#1B4D3E',
        fontWeight: 600,
      }}
    >
      {/* Row 1: DRC Values */}
      <Row gutter={24} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={8}>
          <Statistic
            title="DRC dự kiến"
            value={variance.expected_drc ?? '-'}
            suffix={variance.expected_drc !== null ? '%' : ''}
            valueStyle={{ color: '#666', fontSize: 20 }}
          />
        </Col>
        <Col xs={24} sm={8}>
          <Statistic
            title="DRC thực tế (QC)"
            value={variance.actual_drc ?? '-'}
            suffix={variance.actual_drc !== null ? '%' : ''}
            valueStyle={{
              color: variance.actual_drc !== null ? '#1B4D3E' : '#999',
              fontSize: 20,
              fontWeight: 700,
            }}
          />
        </Col>
        <Col xs={24} sm={8}>
          <Statistic
            title="Chênh lệch DRC"
            value={variance.drc_diff !== null ? Math.abs(variance.drc_diff).toFixed(1) : '-'}
            suffix={variance.drc_diff !== null ? '%' : ''}
            prefix={getDrcDiffIcon(variance)}
            valueStyle={{
              color: getDrcDiffColor(variance),
              fontSize: 20,
              fontWeight: 700,
            }}
          />
        </Col>
      </Row>

      {/* Row 2: Value Impact */}
      <Row gutter={24}>
        <Col xs={24} sm={8}>
          <Statistic
            title="Giá trị dự kiến"
            value={variance.expected_value !== null ? formatVnd(variance.expected_value) : '-'}
            suffix={variance.expected_value !== null ? 'VND' : ''}
            valueStyle={{ color: '#666', fontSize: 18 }}
          />
        </Col>
        <Col xs={24} sm={8}>
          <Statistic
            title="Giá trị thực tế"
            value={variance.actual_value !== null ? formatVnd(variance.actual_value) : '-'}
            suffix={variance.actual_value !== null ? 'VND' : ''}
            valueStyle={{
              color: variance.actual_value !== null ? '#1B4D3E' : '#999',
              fontSize: 18,
              fontWeight: 700,
            }}
          />
        </Col>
        <Col xs={24} sm={8}>
          <Statistic
            title="Chênh lệch giá trị"
            value={variance.value_diff !== null ? formatVnd(Math.abs(variance.value_diff)) : '-'}
            suffix={variance.value_diff !== null ? 'VND' : ''}
            prefix={getValueDiffIcon(variance.value_diff)}
            valueStyle={{
              color: getValueDiffColor(variance.value_diff),
              fontSize: 18,
              fontWeight: 700,
            }}
          />
        </Col>
      </Row>

      {/* Alert for significant DRC difference */}
      {alertInfo && (
        <Alert
          type={alertInfo.type}
          message={alertInfo.message}
          showIcon
          style={{ marginTop: 16, borderRadius: 6 }}
        />
      )}
    </Card>
  )
}

export default DrcVarianceCard
