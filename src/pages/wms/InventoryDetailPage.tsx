// ============================================================================
// FILE: src/pages/wms/InventoryDetailPage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P5 — Buoc 5.5: Chi tiết tồn kho 1 san pham
// REWRITE: Tailwind -> Ant Design v6
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card,
  Table,
  Tabs,
  Tag,
  Button,
  Space,
  Typography,
  Spin,
  Empty,
  Row,
  Col,
  Statistic,
  Descriptions,
  Badge,
} from 'antd'
import {
  ArrowLeftOutlined,
  InboxOutlined,
  BarChartOutlined,
  HistoryOutlined,
  CalendarOutlined,
  EnvironmentOutlined,
  RiseOutlined,
  FallOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ExperimentOutlined,
  ClockCircleOutlined,
  ScissorOutlined,
  MergeCellsOutlined,
} from '@ant-design/icons'
import { inventoryService, type StockMovement } from '../../services/wms/inventoryService'
import type { Material, StockBatch, InventoryTransaction } from '../../services/wms/wms.types'
import GradeBadge from '../../components/wms/GradeBadge'
import { QCBadge } from '../../components/wms/QCInputForm'
import WeightLossIndicator from '../../components/wms/WeightLossIndicator'
import ContaminationBadge from '../../components/wms/ContaminationBadge'
import BatchSplitModal from '../../components/wms/BatchSplitModal'
import BatchMergeModal from '../../components/wms/BatchMergeModal'

const { Title, Text } = Typography

const MONO_FONT = "'JetBrains Mono', monospace"

// ============================================================================
// COMPONENT
// ============================================================================

interface InventoryDetailPageProps {
  materialId?: string
}

const InventoryDetailPage = ({ materialId: propMaterialId }: InventoryDetailPageProps = {}) => {
  const { materialId: paramMaterialId } = useParams<{ materialId: string }>()
  const materialId = propMaterialId || paramMaterialId
  const navigate = useNavigate()

  // State
  const [material, setMaterial] = useState<Material | null>(null)
  const [batches, setBatches] = useState<StockBatch[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([])
  const [loading, setLoading] = useState(true)

  // Split/Merge modal state
  const [splitBatch, setSplitBatch] = useState<StockBatch | null>(null)
  const [splitModalOpen, setSplitModalOpen] = useState(false)
  const [mergeBatches, setMergeBatches] = useState<StockBatch[]>([])
  const [mergeModalOpen, setMergeModalOpen] = useState(false)
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([])

  // --------------------------------------------------------------------------
  // LOAD DATA
  // --------------------------------------------------------------------------

  const loadData = useCallback(async () => {
    if (!materialId) return
    try {
      setLoading(true)

      const [batchData, movementData, txData] = await Promise.all([
        inventoryService.getStockByBatch(materialId),
        inventoryService.getStockMovements(materialId, 30),
        inventoryService.getTransactionHistory({
          material_id: materialId,
          page: 1,
          pageSize: 20,
        }),
      ])

      setBatches(batchData)
      setMovements(movementData)
      setTransactions(txData.data)

      if (batchData.length > 0 && batchData[0].material) {
        setMaterial(batchData[0].material as Material)
      }
    } catch (err) {
      console.error('Load inventory detail error:', err)
    } finally {
      setLoading(false)
    }
  }, [materialId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // --------------------------------------------------------------------------
  // COMPUTED
  // --------------------------------------------------------------------------

  const totalQty = batches.reduce((sum, b) => sum + (b.quantity_remaining || 0), 0)
  const totalWeight = batches.reduce((sum, b) => {
    const wpUnit = (b.material as any)?.weight_per_unit || 0
    return sum + (b.quantity_remaining || 0) * wpUnit
  }, 0)

  const qcPassed = batches.filter(b => b.qc_status === 'passed').length
  const qcWarning = batches.filter(b => b.qc_status === 'warning').length
  const qcFailed = batches.filter(b => b.qc_status === 'failed' || b.qc_status === 'needs_blend').length

  // --------------------------------------------------------------------------
  // HELPERS
  // --------------------------------------------------------------------------

  const getQCTag = (status: string) => {
    switch (status) {
      case 'passed':
        return <Tag icon={<CheckCircleOutlined />} color="success">Dat</Tag>
      case 'warning':
        return <Tag icon={<ExclamationCircleOutlined />} color="warning">Cảnh báo</Tag>
      case 'failed':
        return <Tag color="error">Không đạt</Tag>
      case 'needs_blend':
        return <Tag icon={<ExperimentOutlined />} color="purple">Can phoi tron</Tag>
      case 'pending':
        return <Tag icon={<ClockCircleOutlined />} color="default">Chờ QC</Tag>
      default:
        return <Tag>{status}</Tag>
    }
  }

  const getTxTypeConfig = (type: string) => {
    switch (type) {
      case 'in': return { label: 'Nhập kho', color: 'success' as const, icon: '+' }
      case 'out': return { label: 'Xuất kho', color: 'error' as const, icon: '-' }
      case 'adjust': return { label: 'Điều chỉnh', color: 'processing' as const, icon: '+-' }
      case 'transfer': return { label: 'Chuyển kho', color: 'purple' as const, icon: '<>' }
      case 'blend_in': return { label: 'Nhap phoi tron', color: 'success' as const, icon: '+' }
      case 'blend_out': return { label: 'Xuat phoi tron', color: 'warning' as const, icon: '-' }
      default: return { label: type, color: 'default' as const, icon: '' }
    }
  }

  // --------------------------------------------------------------------------
  // CHART
  // --------------------------------------------------------------------------

  const renderChart = () => {
    if (movements.length === 0) {
      return (
        <Card>
          <Empty
            image={<BarChartOutlined style={{ fontSize: 40, color: '#ccc' }} />}
            description="Chưa có du lieu bien dong"
          />
        </Card>
      )
    }

    const maxBalance = Math.max(...movements.map(m => m.balance), 1)
    const chartHeight = 160
    const barWidth = Math.max(4, Math.floor(280 / movements.length) - 1)

    return (
      <Card title="Bien dong tồn kho 30 ngay" size="small">
        <div style={{ overflowX: 'auto' }}>
          <svg
            width={Math.max(300, movements.length * (barWidth + 2))}
            height={chartHeight + 30}
            style={{ width: '100%' }}
          >
            {movements.map((m, i) => {
              const barHeight = (m.balance / maxBalance) * chartHeight
              const x = i * (barWidth + 2) + 5
              const y = chartHeight - barHeight

              return (
                <g key={m.date}>
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    rx={2}
                    fill={m.balance < (material?.min_stock || 0) ? '#EF4444' : '#2D8B6E'}
                    opacity={0.8}
                  />
                  {i % 5 === 0 && (
                    <text
                      x={x + barWidth / 2}
                      y={chartHeight + 15}
                      textAnchor="middle"
                      fontSize={8}
                      fill="#9CA3AF"
                    >
                      {new Date(m.date).getDate()}/{new Date(m.date).getMonth() + 1}
                    </text>
                  )}
                </g>
              )
            })}

            {material?.min_stock && material.min_stock > 0 && (
              <>
                <line
                  x1={0}
                  y1={chartHeight - (material.min_stock / maxBalance) * chartHeight}
                  x2="100%"
                  y2={chartHeight - (material.min_stock / maxBalance) * chartHeight}
                  stroke="#EF4444"
                  strokeDasharray="4,4"
                  strokeWidth={1}
                />
                <text
                  x={5}
                  y={chartHeight - (material.min_stock / maxBalance) * chartHeight - 3}
                  fontSize={8}
                  fill="#EF4444"
                >
                  Min: {material.min_stock}
                </text>
              </>
            )}
          </svg>
        </div>

        <Space style={{ marginTop: 8 }}>
          <Space size={4}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: '#2D8B6E' }} />
            <Text type="secondary" style={{ fontSize: 11 }}>Ton binh thuong</Text>
          </Space>
          <Space size={4}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: '#EF4444' }} />
            <Text type="secondary" style={{ fontSize: 11 }}>Duoi ton min</Text>
          </Space>
        </Space>
      </Card>
    )
  }

  // --------------------------------------------------------------------------
  // TABLE COLUMNS
  // --------------------------------------------------------------------------

  const batchColumns = [
    {
      title: 'Lo',
      dataIndex: 'batch_no',
      key: 'batch_no',
      render: (val: string) => (
        <Text strong style={{ fontFamily: MONO_FONT, fontSize: 13 }}>{val}</Text>
      ),
    },
    {
      title: 'QC',
      dataIndex: 'qc_status',
      key: 'qc_status',
      render: (val: string) => getQCTag(val || 'pending'),
    },
    {
      title: 'Grade',
      dataIndex: 'rubber_grade',
      key: 'rubber_grade',
      render: (val: string) => <GradeBadge grade={val} size="small" />,
    },
    {
      title: 'DRC',
      key: 'drc',
      render: (_: any, r: StockBatch) => (
        <Text style={{ fontFamily: MONO_FONT }}>
          {r.latest_drc ? `${r.latest_drc}%` : '—'}
        </Text>
      ),
    },
    {
      title: 'SL còn',
      dataIndex: 'quantity_remaining',
      key: 'qty',
      align: 'right' as const,
      render: (val: number) => (
        <Text strong style={{ fontFamily: MONO_FONT, color: '#1B4D3E' }}>
          {val?.toLocaleString('vi-VN')}
        </Text>
      ),
    },
    {
      title: 'Ngày nhập',
      dataIndex: 'received_date',
      key: 'date',
      render: (val: string) => val ? new Date(val).toLocaleDateString('vi-VN') : '—',
    },
    {
      title: 'Vị trí',
      key: 'location',
      render: (_: any, r: StockBatch) => (
        <Text type="secondary">{(r.location as any)?.code || '—'}</Text>
      ),
    },
    {
      title: 'Hao hụt',
      key: 'weight_loss',
      render: (_: any, r: StockBatch) => (
        <WeightLossIndicator
          initialWeight={(r as any).initial_weight}
          currentWeight={(r as any).current_weight}
        />
      ),
    },
    {
      title: 'Tạp chất',
      key: 'contamination',
      render: (_: any, r: StockBatch) => (
        <ContaminationBadge status={(r as any).contamination_status} />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 80,
      render: (_: any, r: StockBatch) => (
        r.status === 'active' ? (
          <Button
            type="link"
            size="small"
            icon={<ScissorOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              setSplitBatch(r)
              setSplitModalOpen(true)
            }}
            title="Tách lô"
          >
            Tách
          </Button>
        ) : null
      ),
    },
  ]

  const txColumns = [
    {
      title: 'Loại',
      dataIndex: 'type',
      key: 'type',
      render: (val: string) => {
        const conf = getTxTypeConfig(val)
        return <Tag color={conf.color}>{conf.icon} {conf.label}</Tag>
      },
    },
    {
      title: 'Số lượng',
      dataIndex: 'quantity',
      key: 'quantity',
      align: 'right' as const,
      render: (val: number, r: InventoryTransaction) => {
        const conf = getTxTypeConfig(r.type)
        return (
          <Text strong style={{ fontFamily: MONO_FONT, color: conf.color === 'success' ? '#389e0d' : conf.color === 'error' ? '#cf1322' : '#1677ff' }}>
            {conf.icon}{Math.abs(val)}
          </Text>
        )
      },
    },
    {
      title: 'Ngay',
      dataIndex: 'created_at',
      key: 'date',
      render: (val: string) => new Date(val).toLocaleDateString('vi-VN'),
    },
    {
      title: 'Ghi chú',
      dataIndex: 'notes',
      key: 'notes',
      ellipsis: true,
      render: (val: string) => <Text type="secondary">{val || '—'}</Text>,
    },
  ]

  // --------------------------------------------------------------------------
  // LOADING
  // --------------------------------------------------------------------------

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F7F5F2' }}>
        <Spin size="large" />
      </div>
    )
  }

  // --------------------------------------------------------------------------
  // MAIN RENDER
  // --------------------------------------------------------------------------

  return (
    <div style={{ minHeight: '100vh', background: '#F7F5F2' }}>
      {/* Header */}
      <div style={{ background: '#1B4D3E', padding: '16px', color: '#fff' }}>
        <Space align="center" style={{ marginBottom: 12 }}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(-1)}
            style={{ color: '#fff' }}
          />
          <div>
            <Title level={5} style={{ color: '#fff', margin: 0 }}>
              {material?.name || 'Chi tiết tồn kho'}
            </Title>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
              {material?.sku} &bull; {material?.unit}
            </Text>
          </div>
        </Space>

        <Row gutter={12}>
          <Col span={8}>
            <Card size="small" style={{ background: 'rgba(255,255,255,0.1)', border: 'none', textAlign: 'center' }}>
              <Statistic
                value={totalQty}
                suffix={material?.unit || 'banh'}
                valueStyle={{ color: '#fff', fontSize: 18, fontFamily: MONO_FONT }}
                title={<span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>Ton</span>}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" style={{ background: 'rgba(255,255,255,0.1)', border: 'none', textAlign: 'center' }}>
              <Statistic
                value={(totalWeight / 1000).toFixed(1)}
                suffix="tan"
                valueStyle={{ color: '#fff', fontSize: 18, fontFamily: MONO_FONT }}
                title={<span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>Khối lượng</span>}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" style={{ background: 'rgba(255,255,255,0.1)', border: 'none', textAlign: 'center' }}>
              <Statistic
                value={batches.length}
                suffix="lo"
                valueStyle={{ color: '#fff', fontSize: 18, fontFamily: MONO_FONT }}
                title={<span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>Số lô</span>}
              />
            </Card>
          </Col>
        </Row>
      </div>

      {/* Tabs */}
      <div style={{ padding: '0 16px 24px' }}>
        <Tabs
          defaultActiveKey="batches"
          items={[
            {
              key: 'batches',
              label: (
                <Space size={4}>
                  <InboxOutlined />
                  <span>Theo lo ({batches.length})</span>
                </Space>
              ),
              children: (
                <div>
                  {/* QC Summary + Merge Button */}
                  <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
                    <Col>
                      <Space>
                        {qcPassed > 0 && (
                          <Tag icon={<CheckCircleOutlined />} color="success">{qcPassed} dat</Tag>
                        )}
                        {qcWarning > 0 && (
                          <Tag icon={<ExclamationCircleOutlined />} color="warning">{qcWarning} canh bao</Tag>
                        )}
                        {qcFailed > 0 && (
                          <Tag icon={<ExperimentOutlined />} color="error">{qcFailed} can xu ly</Tag>
                        )}
                      </Space>
                    </Col>
                    <Col>
                      <Button
                        icon={<MergeCellsOutlined />}
                        size="small"
                        disabled={selectedBatchIds.length < 2}
                        onClick={() => {
                          const selected = batches.filter(b => selectedBatchIds.includes(b.id))
                          setMergeBatches(selected)
                          setMergeModalOpen(true)
                        }}
                      >
                        Gop lo ({selectedBatchIds.length})
                      </Button>
                    </Col>
                  </Row>

                  <Table
                    dataSource={batches}
                    columns={batchColumns}
                    rowKey="id"
                    size="small"
                    pagination={false}
                    scroll={{ x: 900 }}
                    rowSelection={{
                      selectedRowKeys: selectedBatchIds,
                      onChange: (keys) => setSelectedBatchIds(keys as string[]),
                      getCheckboxProps: (record: StockBatch) => ({
                        disabled: record.status !== 'active',
                      }),
                    }}
                    expandable={{
                      expandedRowRender: (batch: StockBatch) => (
                        <Descriptions size="small" column={2} bordered>
                          <Descriptions.Item label="SL ban dau">{batch.initial_quantity}</Descriptions.Item>
                          <Descriptions.Item label="SL còn lai">
                            <Text strong style={{ color: '#1B4D3E' }}>{batch.quantity_remaining}</Text>
                          </Descriptions.Item>
                          <Descriptions.Item label="DRC ban đầu">
                            {batch.initial_drc ? `${batch.initial_drc}%` : '—'}
                          </Descriptions.Item>
                          <Descriptions.Item label="DRC hiện tại">
                            {batch.latest_drc ? `${batch.latest_drc}%` : '—'}
                          </Descriptions.Item>
                          {batch.expiry_date && (
                            <Descriptions.Item label="Hết hạn">
                              {new Date(batch.expiry_date).toLocaleDateString('vi-VN')}
                            </Descriptions.Item>
                          )}
                          {batch.next_recheck_date && (
                            <Descriptions.Item label="Tái kiểm">
                              {new Date(batch.next_recheck_date).toLocaleDateString('vi-VN')}
                            </Descriptions.Item>
                          )}
                        </Descriptions>
                      ),
                    }}
                    locale={{ emptyText: <Empty description="Không có lô hàng nào" /> }}
                  />
                </div>
              ),
            },
            {
              key: 'chart',
              label: (
                <Space size={4}>
                  <BarChartOutlined />
                  <span>Bien dong</span>
                </Space>
              ),
              children: (
                <div>
                  {renderChart()}

                  <Card title="7 ngay gan nhat" size="small" style={{ marginTop: 16 }}>
                    {movements.slice(-7).reverse().map(m => (
                      <div key={m.date} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                        <Text type="secondary" style={{ width: 80, fontSize: 12 }}>
                          {new Date(m.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                        </Text>
                        <Space>
                          {m.in_quantity > 0 && (
                            <Text style={{ color: '#389e0d', fontSize: 12 }}>
                              <RiseOutlined /> +{m.in_quantity}
                            </Text>
                          )}
                          {m.out_quantity > 0 && (
                            <Text style={{ color: '#cf1322', fontSize: 12 }}>
                              <FallOutlined /> -{m.out_quantity}
                            </Text>
                          )}
                        </Space>
                        <Text strong style={{ fontFamily: MONO_FONT, width: 64, textAlign: 'right', fontSize: 12 }}>
                          {m.balance}
                        </Text>
                      </div>
                    ))}
                  </Card>
                </div>
              ),
            },
            {
              key: 'history',
              label: (
                <Space size={4}>
                  <HistoryOutlined />
                  <span>Lịch sử</span>
                </Space>
              ),
              children: (
                <Table
                  dataSource={transactions}
                  columns={txColumns}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  locale={{ emptyText: <Empty description="Chưa có lich su giao dich" /> }}
                />
              ),
            },
          ]}
        />
      </div>

      {/* Split Modal */}
      <BatchSplitModal
        open={splitModalOpen}
        batch={splitBatch}
        onClose={() => { setSplitModalOpen(false); setSplitBatch(null) }}
        onSuccess={() => { loadData(); setSelectedBatchIds([]) }}
      />

      {/* Merge Modal */}
      <BatchMergeModal
        open={mergeModalOpen}
        batches={mergeBatches}
        onClose={() => { setMergeModalOpen(false); setMergeBatches([]) }}
        onSuccess={() => { loadData(); setSelectedBatchIds([]) }}
      />
    </div>
  )
}

export default InventoryDetailPage
