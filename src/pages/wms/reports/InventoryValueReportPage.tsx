// ============================================================================
// INVENTORY VALUE REPORT PAGE
// File: src/pages/wms/reports/InventoryValueReportPage.tsx
// Phase: P10 - Bao cao WMS
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Table, Button, Space, Typography, Row, Col,
  Select, Spin, Empty, Tag,
} from 'antd'
import {
  ArrowLeftOutlined, ReloadOutlined, DatabaseOutlined,
} from '@ant-design/icons'
import wmsReportService from '../../../services/wms/wmsReportService'
import type { InventoryValueReport } from '../../../services/wms/wms.types'
import { RUBBER_GRADE_LABELS } from '../../../services/wms/wms.types'
import type { RubberGrade } from '../../../services/wms/wms.types'
import GradeBadge from '../../../components/wms/GradeBadge'
import { costTrackingService } from '../../../services/wms/costTrackingService'
import type { InventoryValuation } from '../../../services/wms/costTrackingService'
import { supabase } from '../../../lib/supabase'

const { Title, Text } = Typography

const InventoryValueReportPage = () => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<InventoryValueReport[]>([])
  const [valuation, setValuation] = useState<InventoryValuation | null>(null)
  const [warehouseId, setWarehouseId] = useState<string | undefined>()
  const [grade, setGrade] = useState<string | undefined>()
  const [warehouses, setWarehouses] = useState<{ value: string; label: string }[]>([])

  // Load filter options
  useEffect(() => {
    const loadOptions = async () => {
      const { data: whData } = await supabase
        .from('warehouses')
        .select('id, name, code')
        .eq('is_active', true)
        .order('name')
      if (whData) setWarehouses(whData.map((w: any) => ({ value: w.id, label: `${w.name} (${w.code})` })))
    }
    loadOptions()
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [result, valuationResult] = await Promise.all([
        wmsReportService.getInventoryValueReport({
          warehouse_id: warehouseId,
          grade,
        }),
        costTrackingService.getInventoryValuation(warehouseId),
      ])
      setData(result)
      setValuation(valuationResult)
    } catch (err) {
      console.error('Load inventory value report error:', err)
    } finally {
      setLoading(false)
    }
  }, [warehouseId, grade])

  useEffect(() => { loadData() }, [loadData])

  // Summary
  const totalQty = data.reduce((s, r) => s + r.total_quantity_kg, 0)
  const totalDry = data.reduce((s, r) => s + r.total_dry_weight_kg, 0)
  const totalBatches = data.reduce((s, r) => s + r.batch_count, 0)
  const weightedDrc = totalQty > 0
    ? Math.round(data.reduce((s, r) => s + r.avg_drc * r.total_quantity_kg, 0) / totalQty * 100) / 100
    : 0

  const totalValue = valuation?.total_value || 0

  // Map giá vốn theo grade từ valuation
  const gradeCostMap: Record<string, { avg_cost: number; total_value: number }> = {}
  if (valuation) {
    for (const g of valuation.by_grade) {
      gradeCostMap[g.grade] = { avg_cost: g.avg_cost, total_value: g.total_value }
    }
  }

  const numStyle: React.CSSProperties = { fontFamily: "'JetBrains Mono'", fontSize: 13 }

  const gradeOptions = Object.entries(RUBBER_GRADE_LABELS).map(([value, label]) => ({ value, label }))

  const columns = [
    {
      title: 'Vật liệu', key: 'material', width: 200,
      render: (_: unknown, r: InventoryValueReport) => (
        <>
          <Text strong>{r.material_name}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>{r.material_sku}</Text>
        </>
      ),
    },
    {
      title: 'SKU', dataIndex: 'material_sku', key: 'sku', width: 100,
      render: (v: string) => <Text style={{ ...numStyle, fontSize: 11 }}>{v}</Text>,
    },
    {
      title: 'Grade', dataIndex: 'rubber_grade', key: 'grade', width: 100,
      render: (v: string) => <GradeBadge grade={v as RubberGrade} size="small" />,
    },
    {
      title: 'SL (kg)', dataIndex: 'total_quantity_kg', key: 'qty', align: 'right' as const, width: 120,
      sorter: (a: InventoryValueReport, b: InventoryValueReport) => a.total_quantity_kg - b.total_quantity_kg,
      render: (v: number) => <Text style={numStyle}>{v.toLocaleString()}</Text>,
    },
    {
      title: 'DRC TB', dataIndex: 'avg_drc', key: 'drc', align: 'right' as const, width: 90,
      render: (v: number) => <Text style={{ ...numStyle, color: '#1B4D3E' }}>{v}%</Text>,
    },
    {
      title: 'Dry Weight (kg)', dataIndex: 'total_dry_weight_kg', key: 'dry', align: 'right' as const, width: 130,
      render: (v: number) => <Text style={{ ...numStyle, color: '#E8A838' }}>{v.toLocaleString()}</Text>,
    },
    {
      title: 'Số lô', dataIndex: 'batch_count', key: 'batches', align: 'right' as const, width: 80,
      render: (v: number) => <Text style={numStyle}>{v}</Text>,
    },
    {
      title: 'Giá vốn TB (đ/kg)', key: 'cost_per_kg', align: 'right' as const, width: 140,
      render: (_: unknown, r: InventoryValueReport) => {
        const costInfo = gradeCostMap[r.rubber_grade]
        const avgCost = costInfo?.avg_cost || 0
        return avgCost > 0
          ? <Text style={{ ...numStyle, color: '#7C3AED' }}>{avgCost.toLocaleString()}</Text>
          : <Text type="secondary" style={{ fontSize: 11 }}>Chưa có</Text>
      },
    },
    {
      title: 'Giá trị tồn (đ)', key: 'total_cost', align: 'right' as const, width: 150,
      render: (_: unknown, r: InventoryValueReport) => {
        const costInfo = gradeCostMap[r.rubber_grade]
        const value = costInfo?.total_value || 0
        return value > 0
          ? <Text style={{ ...numStyle, color: '#DC2626', fontWeight: 600 }}>{value.toLocaleString()}</Text>
          : <Text type="secondary" style={{ fontSize: 11 }}>—</Text>
      },
    },
    {
      title: 'Kho', key: 'warehouses', width: 200,
      render: (_: unknown, r: InventoryValueReport) => (
        <Space size={4} wrap>
          {r.warehouse_breakdown.map(w => (
            <Tag key={w.warehouse_name} style={{ fontSize: 11, margin: 2 }}>
              {w.warehouse_name}: <span style={{ fontFamily: "'JetBrains Mono'" }}>{w.quantity_kg.toLocaleString()}</span>
            </Tag>
          ))}
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/reports')}>Quay lại</Button>
      </Space>

      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>
            <DatabaseOutlined style={{ marginRight: 8 }} />Tồn kho theo vat lieu
          </Title>
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={loadData}>Làm mới</Button>
        </Col>
      </Row>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select
            placeholder="Kho"
            value={warehouseId}
            onChange={setWarehouseId}
            allowClear
            showSearch
            optionFilterProp="label"
            options={warehouses}
            style={{ width: 200 }}
            size="small"
          />
          <Select
            placeholder="Grade"
            value={grade}
            onChange={setGrade}
            allowClear
            options={gradeOptions}
            style={{ width: 150 }}
            size="small"
          />
        </Space>
      </Card>

      {/* Summary */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6} md={4}>
          <Card styles={{ body: { padding: 12, textAlign: 'center' } }}>
            <Text type="secondary" style={{ fontSize: 11 }}>Tổng SL</Text>
            <div style={{ ...numStyle, fontSize: 18, color: '#1B4D3E', fontWeight: 600 }}>{totalQty.toLocaleString()} kg</div>
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Card styles={{ body: { padding: 12, textAlign: 'center' } }}>
            <Text type="secondary" style={{ fontSize: 11 }}>Dry Weight</Text>
            <div style={{ ...numStyle, fontSize: 18, color: '#E8A838', fontWeight: 600 }}>{totalDry.toLocaleString()} kg</div>
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Card styles={{ body: { padding: 12, textAlign: 'center' } }}>
            <Text type="secondary" style={{ fontSize: 11 }}>DRC TB (weighted)</Text>
            <div style={{ ...numStyle, fontSize: 18, color: '#1B4D3E', fontWeight: 600 }}>{weightedDrc}%</div>
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Card styles={{ body: { padding: 12, textAlign: 'center' } }}>
            <Text type="secondary" style={{ fontSize: 11 }}>Tổng lô</Text>
            <div style={{ ...numStyle, fontSize: 18, color: '#7C3AED', fontWeight: 600 }}>{totalBatches}</div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card styles={{ body: { padding: 12, textAlign: 'center' } }}>
            <Text type="secondary" style={{ fontSize: 11 }}>Giá trị tồn kho</Text>
            <div style={{ ...numStyle, fontSize: 18, color: '#DC2626', fontWeight: 600 }}>
              {totalValue > 0 ? `${totalValue.toLocaleString()} đ` : 'Chưa có dữ liệu'}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Table */}
      <Card>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : data.length === 0 ? (
          <Empty description="Không có dữ liệu tồn kho" />
        ) : (
          <Table
            dataSource={data}
            columns={columns}
            rowKey="material_id"
            size="small"
            pagination={{ showSizeChanger: true, showTotal: (t, r) => `${r[0]}-${r[1]} / ${t}` }}
            scroll={{ x: 1300 }}
          />
        )}
      </Card>
    </div>
  )
}

export default InventoryValueReportPage
