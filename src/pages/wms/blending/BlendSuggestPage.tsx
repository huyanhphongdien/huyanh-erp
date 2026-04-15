// ============================================================================
// BLEND SUGGEST PAGE — Gợi ý phối trộn
// File: src/pages/wms/blending/BlendSuggestPage.tsx
// Module: Kho Thành Phẩm (WMS) - Huy Anh Rubber ERP
// ============================================================================

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Row,
  Col,
  Select,
  InputNumber,
  Alert,
  Spin,
  Empty,
} from 'antd'
import {
  ArrowLeftOutlined,
  BulbOutlined,
  ExperimentOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import blendingService from '../../../services/wms/blendingService'
import GradeBadge from '../../../components/wms/GradeBadge'
import type { StockBatch } from '../../../services/wms/wms.types'

const { Title, Text } = Typography

// ============================================================================
// COMPONENT
// ============================================================================

const BlendSuggestPage = () => {
  const navigate = useNavigate()

  // Selection state
  const [batchesNeedingBlend, setBatchesNeedingBlend] = useState<StockBatch[]>([])
  const [selectedBatchId, setSelectedBatchId] = useState<string>('')
  const [targetDrc, setTargetDrc] = useState<number | null>(60)

  // Results
  const [suggestions, setSuggestions] = useState<Array<{
    partner_batch_id: string
    partner_batch_no: string
    partner_drc: number
    suggested_ratio: number
    expected_result_drc: number
  }>>([])

  // Loading
  const [loadingBatches, setLoadingBatches] = useState(true)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load batches needing blend
  useEffect(() => {
    const load = async () => {
      setLoadingBatches(true)
      try {
        const batches = await blendingService.getBatchesNeedingBlend()
        setBatchesNeedingBlend(batches)
      } catch (err: any) {
        console.error(err)
        setError(err.message || 'Không thể tải danh sách lô')
      } finally {
        setLoadingBatches(false)
      }
    }
    load()
  }, [])

  const handleSearch = async () => {
    if (!selectedBatchId || !targetDrc) return
    setLoadingSuggestions(true)
    setError(null)
    setSuggestions([])
    try {
      const results = await blendingService.getSuggestedBlends(selectedBatchId, targetDrc)
      setSuggestions(results)
    } catch (err: any) {
      setError(err.message || 'Không thể tìm gợi ý')
    } finally {
      setLoadingSuggestions(false)
    }
  }

  const selectedBatch = batchesNeedingBlend.find(b => b.id === selectedBatchId)

  // Suggestion columns
  const suggestionColumns = [
    {
      title: 'Lô đối tác',
      dataIndex: 'partner_batch_no',
      key: 'partner_batch_no',
      render: (v: string) => (
        <Text strong style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{v}</Text>
      ),
    },
    {
      title: 'DRC %',
      dataIndex: 'partner_drc',
      key: 'partner_drc',
      align: 'right' as const,
      render: (v: number) => (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace", color: '#1B4D3E' }}>{v}%</Text>
      ),
    },
    {
      title: 'Tỉ lệ gợi ý (%)',
      dataIndex: 'suggested_ratio',
      key: 'suggested_ratio',
      align: 'right' as const,
      render: (v: number) => (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace", color: '#E8A838' }}>{v}%</Text>
      ),
    },
    {
      title: 'DRC kết quả dự kiến',
      dataIndex: 'expected_result_drc',
      key: 'expected_result_drc',
      align: 'right' as const,
      render: (v: number) => (
        <Text strong style={{ fontFamily: "'JetBrains Mono', monospace", color: '#1B4D3E' }}>{v}%</Text>
      ),
    },
    {
      title: '',
      key: 'action',
      width: 220,
      render: (_: any, r: any) => (
        <Button
          type="primary"
          size="small"
          icon={<ExperimentOutlined />}
          onClick={() => {
            const params = new URLSearchParams()
            params.set('batch_id', selectedBatchId)
            params.set('partner_batch_id', r.partner_batch_id)
            params.set('ratio', String(r.suggested_ratio))
            if (targetDrc) params.set('drc', String(targetDrc))
            if (selectedBatch?.rubber_grade) params.set('grade', selectedBatch.rubber_grade)
            navigate(`/wms/blending/new?${params.toString()}`)
          }}
          style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
        >
          Tạo lệnh trộn từ gợi ý
        </Button>
      ),
    },
  ]

  // Batch select options
  const batchOptions = batchesNeedingBlend.map(b => ({
    value: b.id,
    label: `${b.batch_no} — DRC: ${b.latest_drc || b.initial_drc || '?'}% — ${b.quantity_remaining.toLocaleString()} kg`,
  }))

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/blending')}>Quay lại</Button>
      </Space>
      <Title level={4} style={{ color: '#1B4D3E', marginBottom: 24 }}>
        <BulbOutlined style={{ marginRight: 8 }} />
        Gợi ý phối trộn
      </Title>

      {/* Error */}
      {error && (
        <Alert type="error" message={error} closable onClose={() => setError(null)} style={{ marginBottom: 16, borderRadius: 8 }} showIcon />
      )}

      {/* Selection card */}
      <Card style={{ borderRadius: 12, marginBottom: 24 }}>
        <Row gutter={16} align="bottom">
          <Col span={10}>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>Chọn lô cần phối trộn</Text>
            <Select
              value={selectedBatchId || undefined}
              onChange={setSelectedBatchId}
              placeholder="Chọn lô..."
              style={{ width: '100%' }}
              showSearch
              optionFilterProp="label"
              loading={loadingBatches}
              options={batchOptions}
              size="large"
            />
          </Col>
          <Col span={6}>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>DRC mục tiêu (%)</Text>
            <InputNumber
              value={targetDrc}
              onChange={v => setTargetDrc(v)}
              min={0}
              max={100}
              step={0.5}
              style={{ width: '100%' }}
              size="large"
            />
          </Col>
          <Col span={4}>
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={handleSearch}
              loading={loadingSuggestions}
              disabled={!selectedBatchId || !targetDrc}
              size="large"
              style={{ background: '#1B4D3E', borderColor: '#1B4D3E', width: '100%' }}
            >
              Tìm
            </Button>
          </Col>
        </Row>

        {/* Selected batch info */}
        {selectedBatch && (
          <Alert
            type="info"
            style={{ marginTop: 16, borderRadius: 8 }}
            message={
              <Space>
                <Text>Lo:</Text>
                <Text strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>{selectedBatch.batch_no}</Text>
                <Text style={{ marginLeft: 8 }}>Grade:</Text>
                <GradeBadge grade={selectedBatch.rubber_grade} size="small" />
                <Text style={{ marginLeft: 8 }}>DRC:</Text>
                <Text strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {selectedBatch.latest_drc || selectedBatch.initial_drc || '?'}%
                </Text>
                <Text style={{ marginLeft: 8 }}>Còn lại:</Text>
                <Text strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {selectedBatch.quantity_remaining.toLocaleString()} kg
                </Text>
                <Text style={{ marginLeft: 8 }}>QC:</Text>
                <Tag color={selectedBatch.qc_status === 'needs_blend' ? 'warning' : 'default'}>
                  {selectedBatch.qc_status}
                </Tag>
              </Space>
            }
            showIcon
          />
        )}
      </Card>

      {/* Results */}
      {loadingSuggestions ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>
      ) : suggestions.length > 0 ? (
        <Card
          title={`Gợi ý phối trộn (${suggestions.length} kết quả)`}
          style={{ borderRadius: 12 }}
          styles={{ body: { padding: 0 } }}
        >
          <Table
            dataSource={suggestions}
            columns={suggestionColumns}
            rowKey="partner_batch_id"
            size="small"
            pagination={{ pageSize: 10, showSizeChanger: false }}
          />
        </Card>
      ) : selectedBatchId && !loadingSuggestions ? (
        <Card style={{ borderRadius: 12 }}>
          <Empty description="Không tìm thấy gợi ý phối trộn phù hợp. Thử thay đổi DRC mục tiêu." />
        </Card>
      ) : null}
    </div>
  )
}

export default BlendSuggestPage
