// ============================================================================
// STOCK MOVEMENT REPORT PAGE — XNT (Xuat Nhap Ton)
// File: src/pages/wms/reports/StockMovementReportPage.tsx
// Phase: P10 - Bao cao WMS
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Table, Button, Space, Typography, Row, Col,
  Select, DatePicker, Spin, Empty,
} from 'antd'
import {
  ArrowLeftOutlined, ReloadOutlined, FileTextOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import wmsReportService from '../../../services/wms/wmsReportService'
import type { StockMovementReport } from '../../../services/wms/wms.types'
import { supabase } from '../../../lib/supabase'

const { Title, Text } = Typography
const { RangePicker } = DatePicker

const StockMovementReportPage = () => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<StockMovementReport[]>([])
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(30, 'day'),
    dayjs(),
  ])
  const [materialId, setMaterialId] = useState<string | undefined>()
  const [warehouseId, setWarehouseId] = useState<string | undefined>()
  const [materials, setMaterials] = useState<{ value: string; label: string }[]>([])
  const [warehouses, setWarehouses] = useState<{ value: string; label: string }[]>([])

  // Load filter options
  useEffect(() => {
    const loadOptions = async () => {
      const [matRes, whRes] = await Promise.all([
        supabase.from('materials').select('id, name, sku').eq('is_active', true).order('name'),
        supabase.from('warehouses').select('id, name, code').eq('is_active', true).order('name'),
      ])
      if (matRes.data) setMaterials(matRes.data.map((m: any) => ({ value: m.id, label: `${m.name} (${m.sku})` })))
      if (whRes.data) setWarehouses(whRes.data.map((w: any) => ({ value: w.id, label: `${w.name} (${w.code})` })))
    }
    loadOptions()
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await wmsReportService.getStockMovementReport({
        from_date: dateRange[0].format('YYYY-MM-DD'),
        to_date: dateRange[1].format('YYYY-MM-DD'),
        material_id: materialId,
        warehouse_id: warehouseId,
      })
      setData(result)
    } catch (err) {
      console.error('Load stock movement report error:', err)
    } finally {
      setLoading(false)
    }
  }, [dateRange, materialId, warehouseId])

  useEffect(() => { loadData() }, [loadData])

  // Summary
  const totals = data.reduce(
    (acc, row) => ({
      in_quantity: acc.in_quantity + row.in_quantity,
      out_quantity: acc.out_quantity + row.out_quantity,
      adjust_quantity: acc.adjust_quantity + row.adjust_quantity,
      blend_in_quantity: acc.blend_in_quantity + row.blend_in_quantity,
      blend_out_quantity: acc.blend_out_quantity + row.blend_out_quantity,
    }),
    { in_quantity: 0, out_quantity: 0, adjust_quantity: 0, blend_in_quantity: 0, blend_out_quantity: 0 }
  )

  const numStyle: React.CSSProperties = { fontFamily: "'JetBrains Mono'", fontSize: 13 }

  const columns = [
    {
      title: 'Ngay', dataIndex: 'date', key: 'date', width: 120,
      render: (v: string) => <Text style={numStyle}>{dayjs(v).format('DD/MM/YYYY')}</Text>,
    },
    {
      title: 'Nháp', dataIndex: 'in_quantity', key: 'in', align: 'right' as const, width: 120,
      render: (v: number) => <Text style={{ ...numStyle, color: v > 0 ? '#16A34A' : undefined }}>{v.toLocaleString()}</Text>,
    },
    {
      title: 'Xuất', dataIndex: 'out_quantity', key: 'out', align: 'right' as const, width: 120,
      render: (v: number) => <Text style={{ ...numStyle, color: v > 0 ? '#DC2626' : undefined }}>{v.toLocaleString()}</Text>,
    },
    {
      title: 'Điều chỉnh', dataIndex: 'adjust_quantity', key: 'adjust', align: 'right' as const, width: 120,
      render: (v: number) => <Text style={{ ...numStyle, color: v !== 0 ? '#F59E0B' : undefined }}>{v.toLocaleString()}</Text>,
    },
    {
      title: 'Blend In', dataIndex: 'blend_in_quantity', key: 'blend_in', align: 'right' as const, width: 120,
      render: (v: number) => <Text style={{ ...numStyle, color: v > 0 ? '#2563EB' : undefined }}>{v.toLocaleString()}</Text>,
    },
    {
      title: 'Blend Out', dataIndex: 'blend_out_quantity', key: 'blend_out', align: 'right' as const, width: 120,
      render: (v: number) => <Text style={{ ...numStyle, color: v > 0 ? '#7C3AED' : undefined }}>{v.toLocaleString()}</Text>,
    },
    {
      title: 'Tồn cuối', dataIndex: 'balance', key: 'balance', align: 'right' as const, width: 130,
      render: (v: number) => <Text strong style={{ ...numStyle, color: '#1B4D3E' }}>{v.toLocaleString()}</Text>,
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
            <FileTextOutlined style={{ marginRight: 8 }} />Bao cao XNT — Xuat Nhap Ton
          </Title>
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={loadData}>Làm mới</Button>
        </Col>
      </Row>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <RangePicker
            value={dateRange}
            onChange={(vals) => {
              if (vals && vals[0] && vals[1]) setDateRange([vals[0], vals[1]])
            }}
            format="DD/MM/YYYY"
            size="small"
          />
          <Select
            placeholder="Vật liệu"
            value={materialId}
            onChange={setMaterialId}
            allowClear
            showSearch
            optionFilterProp="label"
            options={materials}
            style={{ width: 220 }}
            size="small"
          />
          <Select
            placeholder="Kho"
            value={warehouseId}
            onChange={setWarehouseId}
            allowClear
            showSearch
            optionFilterProp="label"
            options={warehouses}
            style={{ width: 180 }}
            size="small"
          />
        </Space>
      </Card>

      {/* Table */}
      <Card>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : data.length === 0 ? (
          <Empty description="Không có dữ liệu trong khoảng thời gian này" />
        ) : (
          <>
            <Table
              dataSource={data}
              columns={columns}
              rowKey="date"
              size="small"
              pagination={false}
              scroll={{ x: 800 }}
            />
            {/* Summary row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, padding: '8px 16px', background: '#f5f5f5', borderRadius: 8 }}>
              <Text strong>Tong cong:</Text>
              <Space size="large">
                <Text style={{ ...numStyle, color: '#16A34A' }}>Nhap: {totals.in_quantity.toLocaleString()}</Text>
                <Text style={{ ...numStyle, color: '#DC2626' }}>Xuat: {totals.out_quantity.toLocaleString()}</Text>
                <Text style={{ ...numStyle, color: '#F59E0B' }}>DC: {totals.adjust_quantity.toLocaleString()}</Text>
                <Text style={{ ...numStyle, color: '#2563EB' }}>BI: {totals.blend_in_quantity.toLocaleString()}</Text>
                <Text style={{ ...numStyle, color: '#7C3AED' }}>BO: {totals.blend_out_quantity.toLocaleString()}</Text>
                <Text strong style={{ ...numStyle, color: '#1B4D3E' }}>Ton: {data.length > 0 ? data[data.length - 1].balance.toLocaleString() : 0}</Text>
              </Space>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

export default StockMovementReportPage
