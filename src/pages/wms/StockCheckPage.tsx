// ============================================================================
// FILE: src/pages/wms/StockCheckPage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P5 — Buoc 5.7: Kiểm kê tồn kho
// REWRITE: Tailwind -> Ant Design v6
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
  Spin,
  Empty,
  Input,
  InputNumber,
  Steps,
  Row,
  Col,
  Statistic,
  Progress,
  Alert,
  Result,
  message,
  Radio,
  Select,
} from 'antd'
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  SearchOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  MinusOutlined,
  SaveOutlined,
  LoadingOutlined,
  AuditOutlined,
} from '@ant-design/icons'
import {
  stockCheckService,
  type StockCheck,
  type StockCheckItem,
} from '../../services/wms/stockCheckService'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'

const { Title, Text } = Typography
const MONO_FONT = "'JetBrains Mono', monospace"

const StockCheckPage = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  // Steps: select_warehouse -> checking -> review
  const [step, setStep] = useState<'select_warehouse' | 'checking' | 'review'>('select_warehouse')
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [selectedWarehouse, setSelectedWarehouse] = useState('')
  const [loadingWarehouses, setLoadingWarehouses] = useState(true)
  const [stockCheck, setStockCheck] = useState<StockCheck | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [showOnlyDiscrepancy, setShowOnlyDiscrepancy] = useState(false)

  // C2: Cycle count mode — full warehouse hoặc filter theo location
  const [countMode, setCountMode] = useState<'full' | 'cycle'>('full')
  const [locations, setLocations] = useState<Array<{ id: string; code: string; shelf?: string | null }>>([])
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([])
  const [loadingLocations, setLoadingLocations] = useState(false)

  // Load locations khi chọn kho (cho cycle count)
  useEffect(() => {
    if (!selectedWarehouse) {
      setLocations([])
      setSelectedLocationIds([])
      return
    }
    const loadLocations = async () => {
      setLoadingLocations(true)
      try {
        const { data } = await supabase
          .from('warehouse_locations')
          .select('id, code, shelf')
          .eq('warehouse_id', selectedWarehouse)
          .order('code')
        setLocations(data || [])
      } catch (err) {
        console.error('Load locations:', err)
      } finally {
        setLoadingLocations(false)
      }
    }
    loadLocations()
  }, [selectedWarehouse])

  // Load warehouses
  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase
          .from('warehouses')
          .select('id, code, name, type')
          .eq('is_active', true)
          .order('code')
        setWarehouses(data || [])
      } catch (err) {
        console.error(err)
      } finally {
        setLoadingWarehouses(false)
      }
    }
    load()
  }, [])

  // Create stock check
  const handleCreateCheck = async () => {
    if (!selectedWarehouse) return
    if (countMode === 'cycle' && selectedLocationIds.length === 0) {
      message.warning('Chọn ít nhất 1 vị trí cho chế độ kiểm kê theo vị trí')
      return
    }
    try {
      setCreating(true)
      const check = await stockCheckService.createStockCheck({
        warehouse_id: selectedWarehouse,
        created_by: user?.employee_id || user?.id,
        notes: countMode === 'cycle'
          ? `Kiểm kê theo vị trí (${selectedLocationIds.length} ví trí)`
          : '',
        location_ids: countMode === 'cycle' ? selectedLocationIds : undefined,
      })
      setStockCheck(check)
      setStep('checking')
    } catch (err: any) {
      message.error(err.message || 'Lỗi tạo kiểm kê')
    } finally {
      setCreating(false)
    }
  }

  // Update item actual quantity
  const handleUpdateItem = (itemId: string, actualQty: number) => {
    if (!stockCheck?.items) return
    setStockCheck({
      ...stockCheck,
      items: stockCheck.items.map(item => {
        if (item.id !== itemId) return item
        return stockCheckService.updateCheckItem(item, {
          actual_quantity: actualQty,
          checked_by: user?.employee_id || user?.id,
        })
      }),
    })
  }

  // Finalize
  const handleFinalize = async () => {
    if (!stockCheck || !user) return
    try {
      setSaving(true)
      const result = await stockCheckService.finalizeStockCheck(stockCheck, user.employee_id || user.id)
      message.success(`Kiểm kê hoàn tất! ${result.adjustments} dòng chênh lệch, ${result.transactions_created} phiếu điều chỉnh`)
      navigate('/wms')
    } catch (err: any) {
      message.error(err.message || 'Lỗi hoàn tất kiểm kê')
    } finally {
      setSaving(false)
    }
  }

  // Computed
  const items = stockCheck?.items || []
  const summary = stockCheckService.summarizeDiscrepancy(items)
  const checkedCount = items.filter(i => i.actual_quantity !== undefined && i.actual_quantity !== null).length

  // Filtered items
  const filteredItems = items.filter(item => {
    if (searchText) {
      const s = searchText.toLowerCase()
      if (!item.batch_no?.toLowerCase().includes(s) &&
          !item.material_name?.toLowerCase().includes(s) &&
          !item.material_sku?.toLowerCase().includes(s)) {
        return false
      }
    }
    if (showOnlyDiscrepancy) {
      return item.actual_quantity !== undefined && item.discrepancy !== 0
    }
    return true
  })

  const getDiscrepancyTag = (disc: number) => {
    if (disc === 0) return <Tag icon={<CheckOutlined />} color="success">Khớp</Tag>
    if (disc > 0) return <Tag icon={<ArrowUpOutlined />} color="blue">+{disc}</Tag>
    return <Tag icon={<ArrowDownOutlined />} color="error">{disc}</Tag>
  }

  const warehouseName = warehouses.find(w => w.id === selectedWarehouse)?.name || ''

  const currentStepIndex = step === 'select_warehouse' ? 0 : step === 'checking' ? 1 : 2

  // ========== STEP INDICATOR ==========
  const stepsBar = (
    <Steps
      current={currentStepIndex}
      size="small"
      style={{ padding: '16px', background: '#fff', borderBottom: '1px solid #f0f0f0' }}
      items={[
        { title: 'Chọn kho' },
        { title: 'Nhập số liệu' },
        { title: 'Kết quả' },
      ]}
    />
  )

  // ========== STEP 1: CHON KHO ==========
  if (step === 'select_warehouse') {
    return (
      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
          <Col>
            <Space>
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} />
              <div>
                <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>
                  <AuditOutlined style={{ marginRight: 8 }} />
                  Kiểm kê tồn kho
                </Title>
                <Text type="secondary">Bước 1: Chọn kho và phạm vi kiểm kê</Text>
              </div>
            </Space>
          </Col>
          <Col>
            <Button
              type="primary"
              size="large"
              icon={creating ? <LoadingOutlined /> : <AuditOutlined />}
              onClick={handleCreateCheck}
              disabled={!selectedWarehouse || creating}
              loading={creating}
              style={{ background: selectedWarehouse ? '#1B4D3E' : undefined, borderColor: selectedWarehouse ? '#1B4D3E' : undefined }}
            >
              {creating ? 'Đang tạo...' : 'Bắt đầu kiểm kê'}
            </Button>
          </Col>
        </Row>

        {stepsBar}

        <Row gutter={24} style={{ marginTop: 24 }}>
          {/* Left: Warehouse grid */}
          <Col xs={24} lg={14}>
            <Card title="Chọn kho" style={{ marginBottom: 16 }}>
              {loadingWarehouses ? (
                <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>
              ) : (
                <Row gutter={[12, 12]}>
                  {warehouses.map(wh => (
                    <Col xs={24} sm={12} key={wh.id}>
                      <Card
                        hoverable
                        onClick={() => { setSelectedWarehouse(wh.id); setSelectedLocationIds([]) }}
                        style={{
                          borderColor: selectedWarehouse === wh.id ? '#1B4D3E' : '#d9d9d9',
                          borderWidth: selectedWarehouse === wh.id ? 2 : 1,
                          background: selectedWarehouse === wh.id ? 'rgba(27,77,62,0.04)' : '#fff',
                        }}
                        size="small"
                      >
                        <Space align="center">
                          <div style={{
                            width: 40, height: 40, borderRadius: 8,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: selectedWarehouse === wh.id ? '#1B4D3E' : '#f0f0f0',
                            color: selectedWarehouse === wh.id ? '#fff' : '#999',
                            fontSize: 18,
                          }}>
                            <AuditOutlined />
                          </div>
                          <div>
                            <Text strong>{wh.name}</Text>
                            <br />
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {wh.code} &bull; {wh.type === 'finished' ? 'Thành phẩm' : 'NVL'}
                            </Text>
                          </div>
                          {selectedWarehouse === wh.id && (
                            <CheckCircleOutlined style={{ color: '#1B4D3E', fontSize: 20, marginLeft: 'auto' }} />
                          )}
                        </Space>
                      </Card>
                    </Col>
                  ))}
                </Row>
              )}
            </Card>
          </Col>

          {/* Right: Scope mode + location filter */}
          <Col xs={24} lg={10}>
            {selectedWarehouse && (
              <Card title="Phạm vi kiểm kê" style={{ marginBottom: 16 }}>
                <Radio.Group
                  value={countMode}
                  onChange={e => { setCountMode(e.target.value); setSelectedLocationIds([]) }}
                  buttonStyle="solid"
                  size="middle"
                  style={{ width: '100%', marginBottom: 16 }}
                >
                  <Radio.Button value="full" style={{ width: '50%', textAlign: 'center' }}>
                    🏬 Toàn bộ kho
                  </Radio.Button>
                  <Radio.Button value="cycle" style={{ width: '50%', textAlign: 'center' }}>
                    📍 Theo vị trí (cycle)
                  </Radio.Button>
                </Radio.Group>
                {countMode === 'cycle' && (
                  <div>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
                      Chọn vị trí cần đếm. Chỉ batch ở vị trí đã chọn sẽ được đưa vào đợt kiểm kê.
                    </Text>
                    <Select
                      mode="multiple"
                      placeholder="Chọn vị trí..."
                      value={selectedLocationIds}
                      onChange={setSelectedLocationIds}
                      loading={loadingLocations}
                      style={{ width: '100%' }}
                      maxTagCount={5}
                      options={locations.map(l => ({
                        value: l.id,
                        label: l.shelf ? `${l.code} · Kệ ${l.shelf}` : l.code,
                      }))}
                    />
                  </div>
                )}
              </Card>
            )}
          </Col>
        </Row>
      </div>
    )
  }

  // ========== STEP 2: NHAP SO LIEU ==========
  if (step === 'checking') {
    const progressPercent = items.length > 0 ? Math.round((checkedCount / items.length) * 100) : 0

    const checkColumns = [
      {
        title: 'Lô',
        dataIndex: 'batch_no',
        key: 'batch_no',
        width: 130,
        render: (val: string, item: StockCheckItem) => (
          <div>
            <Text strong style={{ fontFamily: MONO_FONT, fontSize: 13 }}>{val}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 11 }}>{item.material_name} &bull; {item.location_code || '—'}</Text>
          </div>
        ),
      },
      {
        title: 'Hệ thống',
        dataIndex: 'system_quantity',
        key: 'system',
        align: 'right' as const,
        width: 80,
        render: (val: number) => (
          <Text strong style={{ fontFamily: MONO_FONT }}>{val}</Text>
        ),
      },
      {
        title: 'Thực tế',
        key: 'actual',
        width: 110,
        render: (_: any, item: StockCheckItem) => (
          <InputNumber
            value={item.actual_quantity}
            min={0}
            onChange={(val) => {
              if (val !== null && val !== undefined) handleUpdateItem(item.id, val)
            }}
            placeholder="SL..."
            style={{ width: '100%', fontFamily: MONO_FONT }}
            status={
              item.actual_quantity !== undefined && item.actual_quantity !== null && item.discrepancy !== 0
                ? 'error'
                : undefined
            }
          />
        ),
      },
      {
        title: 'Chênh lệch',
        key: 'discrepancy',
        align: 'center' as const,
        width: 100,
        render: (_: any, item: StockCheckItem) => {
          if (item.actual_quantity === undefined || item.actual_quantity === null) return '—'
          return getDiscrepancyTag(item.discrepancy)
        },
      },
    ]

    return (
      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
          <Col>
            <Space>
              <Button icon={<ArrowLeftOutlined />} onClick={() => setStep('select_warehouse')} />
              <div>
                <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>
                  Kiểm kê: {warehouseName}
                </Title>
                <Text type="secondary">
                  {stockCheck?.code} &bull; {checkedCount}/{items.length} đã kiểm
                </Text>
              </div>
            </Space>
          </Col>
          <Col>
            <Space>
              <Text type="secondary">{checkedCount}/{items.length}</Text>
              {summary.shortage_count > 0 && <Tag color="error">{summary.shortage_count} thiếu</Tag>}
              {summary.surplus_count > 0 && <Tag color="blue">{summary.surplus_count} thừa</Tag>}
              <Button
                type="primary"
                icon={<ArrowRightOutlined />}
                onClick={() => setStep('review')}
                disabled={checkedCount < items.length}
                style={checkedCount >= items.length ? { background: '#E8A838', borderColor: '#E8A838' } : {}}
              >
                Xem kết quả
              </Button>
            </Space>
          </Col>
        </Row>

        {stepsBar}

        <Progress
          percent={progressPercent}
          strokeColor="#E8A838"
          style={{ marginBottom: 16 }}
          size="small"
        />

        {/* Search + Filter bar */}
        <Card size="small" style={{ marginBottom: 16 }} bodyStyle={{ padding: '8px 16px' }}>
          <Row gutter={16} align="middle">
            <Col flex="auto">
              <Input
                prefix={<SearchOutlined />}
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="Tìm lô, sản phẩm..."
                allowClear
              />
            </Col>
            <Col>
              <Space>
                <Button
                  type={!showOnlyDiscrepancy ? 'primary' : 'default'}
                  size="small"
                  onClick={() => setShowOnlyDiscrepancy(false)}
                  style={!showOnlyDiscrepancy ? { background: '#1B4D3E', borderColor: '#1B4D3E' } : {}}
                >
                  Tất cả ({items.length})
                </Button>
                <Button
                  type={showOnlyDiscrepancy ? 'primary' : 'default'}
                  size="small"
                  danger={showOnlyDiscrepancy}
                  onClick={() => setShowOnlyDiscrepancy(true)}
                >
                  Chênh lệch ({summary.surplus_count + summary.shortage_count})
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>

        <Table
          dataSource={filteredItems}
          columns={checkColumns}
          rowKey="id"
          size="small"
          pagination={{ showSizeChanger: true, defaultPageSize: 50, showTotal: (t, r) => `${r[0]}-${r[1]} / ${t}` }}
          scroll={{ x: 600 }}
          rowClassName={(item: StockCheckItem) => {
            if (item.actual_quantity !== undefined && item.actual_quantity !== null && item.discrepancy !== 0) {
              return 'ant-table-row-warning'
            }
            return ''
          }}
        />
      </div>
    )
  }

  // ========== STEP 3: REVIEW & CONFIRM ==========
  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => setStep('checking')} />
            <div>
              <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>Kết quả kiểm kê</Title>
              <Text type="secondary">{stockCheck?.code} &bull; {warehouseName}</Text>
            </div>
          </Space>
        </Col>
      </Row>

      {stepsBar}

      <div style={{ marginTop: 24 }}>
        {/* Summary cards */}
        <Row gutter={8} style={{ marginBottom: 16 }}>
          <Col span={8}>
            <Card size="small" style={{ textAlign: 'center', background: '#f6ffed' }}>
              <Statistic
                value={summary.match_count}
                valueStyle={{ fontFamily: MONO_FONT, fontSize: 20, color: '#389e0d' }}
                title={<Text style={{ fontSize: 11, color: '#389e0d' }}>Khớp</Text>}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" style={{ textAlign: 'center', background: '#f0f5ff' }}>
              <Statistic
                value={summary.total_surplus}
                prefix="+"
                valueStyle={{ fontFamily: MONO_FONT, fontSize: 20, color: '#1677ff' }}
                title={<Text style={{ fontSize: 11, color: '#1677ff' }}>Thừa ({summary.surplus_count})</Text>}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" style={{ textAlign: 'center', background: '#fff2f0' }}>
              <Statistic
                value={summary.total_shortage}
                prefix="-"
                valueStyle={{ fontFamily: MONO_FONT, fontSize: 20, color: '#cf1322' }}
                title={<Text style={{ fontSize: 11, color: '#cf1322' }}>Thiếu ({summary.shortage_count})</Text>}
              />
            </Card>
          </Col>
        </Row>

        {/* Discrepancy list */}
        {(summary.surplus_count + summary.shortage_count) > 0 ? (
          <>
            <Title level={5} style={{ color: '#666', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
              Các dòng chênh lệch
            </Title>

            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              {items.filter(i => i.discrepancy !== 0).map(item => (
                <Card
                  key={item.id}
                  size="small"
                  style={{
                    borderLeft: `4px solid ${item.discrepancy > 0 ? '#1677ff' : '#ff4d4f'}`,
                    background: item.discrepancy > 0 ? '#f0f5ff' : '#fff2f0',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <Text strong>{item.batch_no}</Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 12 }}>{item.material_name}</Text>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <Text strong style={{
                        fontFamily: MONO_FONT,
                        fontSize: 18,
                        color: item.discrepancy > 0 ? '#1677ff' : '#cf1322',
                      }}>
                        {item.discrepancy > 0 ? '+' : ''}{item.discrepancy}
                      </Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        HT: {item.system_quantity} &rarr; TT: {item.actual_quantity}
                      </Text>
                    </div>
                  </div>
                </Card>
              ))}
            </Space>

            <Alert
              type="warning"
              showIcon
              icon={<ExclamationCircleOutlined />}
              message="Xác nhận điều chỉnh?"
              description={`Hệ thống sẽ tạo phiếu điều chỉnh tự động cho ${summary.surplus_count + summary.shortage_count} dòng chênh lệch. Hành động này không thể hoàn tác.`}
              style={{ marginTop: 16 }}
            />
          </>
        ) : (
          <Result
            status="success"
            title="Tồn kho hoàn toàn khớp!"
            subTitle="Không có chênh lệch nào được phát hiện"
          />
        )}
      </div>

      {/* Action buttons — inline instead of fixed bottom bar */}
      <Row justify="end" style={{ marginTop: 24 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => setStep('checking')}>
            Quay lại kiểm kê
          </Button>
          <Button
            type="primary"
            size="large"
            icon={saving ? <LoadingOutlined /> : <CheckOutlined />}
            onClick={handleFinalize}
            loading={saving}
            style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
          >
            {saving ? 'Đang xử lý...' : 'Xác nhận & Điều chỉnh'}
          </Button>
        </Space>
      </Row>
    </div>
  )
}

export default StockCheckPage
