// ============================================================================
// QC QUICK SCAN PAGE — Mobile-friendly QC with batch code input
// File: src/pages/wms/qc/QCQuickScanPage.tsx
// Phase 5: QC Nhanh - Quét QR / nhập mã lô -> QC nhanh
// Đợt 3 audit UI (17/11/2026): bỏ ô chọn "Kết quả" — payload chưa bao giờ gửi nó,
// qcService tự đánh giá theo Ngưỡng QC; ô chọn chỉ làm QC tưởng mình quyết định kết quả.
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Card, Input, Button, Space, Typography, Spin, Result, Tag,
  InputNumber, Collapse, Descriptions, List, message,
} from 'antd'
import {
  ScanOutlined, CheckCircleOutlined, ExperimentOutlined,
  PrinterOutlined, ReloadOutlined, InfoCircleOutlined,
} from '@ant-design/icons'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'
import { fmtKg } from '../../../utils/format'
import { batchService } from '../../../services/wms/batchService'
import qcService from '../../../services/wms/qcService'
import { supabase } from '../../../lib/supabase'
import { dealWmsService } from '../../../services/b2b/dealWmsService'
import type { StockBatch } from '../../../services/wms/wms.types'
import { RUBBER_TYPE_LABELS } from '../../../services/wms/wms.types'
import type { QCEvaluation } from '../../../services/wms/qcService'
import GradeBadge from '../../../components/wms/GradeBadge'
import { QCBadge } from '../../../components/wms/QCInputForm'
import { rubberGradeService } from '../../../services/wms/rubberGradeService'

const { Title, Text } = Typography
const { Search } = Input

const BRAND_COLOR = '#1B4D3E'

// ============================================================================
// TYPES
// ============================================================================

interface RecentQC {
  batch_no: string
  drc: number
  result: string
  time: string
}

// ============================================================================
// COMPONENT
// ============================================================================

const QCQuickScanPage = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const searchRef = useRef<any>(null)
  const initialBatch = searchParams.get('batch') || ''

  // Search state
  const [searching, setSearching] = useState(false)
  const [batch, setBatch] = useState<StockBatch | null>(null)
  const [notFound, setNotFound] = useState(false)
  // Lỗi khi tra lô (mạng/quyền) ≠ "không tìm thấy lô" — đừng bảo QC là mã sai khi thật ra mất mạng
  const [searchError, setSearchError] = useState<unknown>(null)
  const [lastSearch, setLastSearch] = useState('')

  // QC form state
  const [drcValue, setDrcValue] = useState<number | null>(null)
  const [moisture, setMoisture] = useState<number | null>(null)
  const [dirtContent, setDirtContent] = useState<number | null>(null)
  const [ashContent, setAshContent] = useState<number | null>(null)

  // Submit state
  const [saving, setSaving] = useState(false)
  const [evaluation, setEvaluation] = useState<QCEvaluation | null>(null)

  // Recent QC results
  const [recentQCs, setRecentQCs] = useState<RecentQC[]>([])

  // --------------------------------------------------------------------------
  // SEARCH BATCH
  // --------------------------------------------------------------------------

  const handleSearch = useCallback(async (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return

    setSearching(true)
    setNotFound(false)
    setSearchError(null)
    setLastSearch(trimmed)
    setBatch(null)
    setEvaluation(null)
    setDrcValue(null)
    setMoisture(null)
    setDirtContent(null)
    setAshContent(null)

    try {
      const found = await batchService.getByBatchNo(trimmed)
      if (found) {
        setBatch(found)
      } else {
        setNotFound(true)
      }
    } catch (err) {
      console.error('Search batch error:', err)
      setSearchError(err)
    } finally {
      setSearching(false)
    }
  }, [])

  // --------------------------------------------------------------------------
  // SUBMIT QC
  // --------------------------------------------------------------------------

  const handleSubmit = async () => {
    if (!batch || drcValue == null) {
      message.warning('Vui lòng nhập giá trị DRC')
      return
    }

    setSaving(true)
    try {
      // Use addInitialQC if pending, addRecheckResult if already has QC
      const isPending = batch.qc_status === 'pending'
      const qcData = {
        batch_id: batch.id,
        drc_value: drcValue,
        moisture_content: moisture || undefined,
        dirt_content: dirtContent || undefined,
        ash_content: ashContent || undefined,
      }

      let res: {
        evaluation: QCEvaluation
        supplierImpact?: {
          supplier_name: string
          overall_score: number
          grade: string
          pass_rate: number
          total_batches: number
        } | null
      }

      if (isPending) {
        res = await qcService.addInitialQC(qcData)
      } else {
        res = await qcService.addRecheckResult(qcData)
      }

      setEvaluation(res.evaluation)

      // D4: Nếu fail và có supplier impact → hiển thị toast cảnh báo
      if (res.supplierImpact) {
        const si = res.supplierImpact
        message.warning({
          content: `NCC "${si.supplier_name}" giờ đạt ${si.overall_score.toFixed(0)}/100 (hạng ${si.grade}) — tỉ lệ đạt ${si.pass_rate.toFixed(0)}% trên ${si.total_batches} lô`,
          duration: 6,
        })
      }

      // Add to recent list
      setRecentQCs(prev => [{
        batch_no: batch.batch_no,
        drc: drcValue,
        result: res.evaluation.result,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      }, ...prev].slice(0, 5))

      // Update deal DRC if linked
      try {
        const { data: detail } = await supabase
          .from('stock_in_details')
          .select('stock_in_id')
          .eq('batch_id', batch.id)
          .maybeSingle()
        if (detail?.stock_in_id) {
          const { data: stockIn } = await supabase
            .from('stock_in_orders')
            .select('deal_id')
            .eq('id', detail.stock_in_id)
            .maybeSingle()
          if (stockIn?.deal_id) {
            const drcResult = await dealWmsService.updateDealActualDrc(stockIn.deal_id)
            if (drcResult && drcResult.actual_drc != null) {
              await dealWmsService.notifyDealChatQcUpdate(stockIn.deal_id, drcResult.actual_drc, drcResult.qc_status)
            }
          }
        }
      } catch { /* non-blocking */ }

      message.success('Đã lưu kết quả QC')
    } catch (err: any) {
      console.error('Submit QC error:', err)
      message.error(dichLoiHeThong(err, 'Lỗi khi lưu kết quả QC'))
    } finally {
      setSaving(false)
    }
  }

  // --------------------------------------------------------------------------
  // RESET / SCAN NEXT
  // --------------------------------------------------------------------------

  // Auto-search khi URL có ?batch=NVL-... (từ link trong tab QC của Deal)
  useEffect(() => {
    if (initialBatch) {
      handleSearch(initialBatch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBatch])

  const handleScanNext = () => {
    setBatch(null)
    setEvaluation(null)
    setNotFound(false)
    setSearchError(null)
    setDrcValue(null)
    setMoisture(null)
    setDirtContent(null)
    setAshContent(null)
    // Focus input
    setTimeout(() => searchRef.current?.focus(), 100)
  }

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto', background: '#F7F5F2' }}>
      {/* Header — trang sống trong tab "QC nhanh" của /wms/qc nên không có nút Quay lại */}
      <Space style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0, color: BRAND_COLOR }}>
          <ScanOutlined style={{ marginRight: 8 }} />
          QC nhanh
        </Title>
      </Space>

      {/* Search Input */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Search
          ref={searchRef}
          placeholder="Quét QR hoặc nhập mã lô..."
          enterButton={<><ScanOutlined /> Tìm</>}
          size="large"
          onSearch={handleSearch}
          loading={searching}
          autoFocus
          defaultValue={initialBatch}
          style={{ fontSize: 16 }}
        />
      </Card>

      {/* Lỗi tra lô (mạng/quyền) — KHÁC "không tìm thấy" */}
      {searchError != null && (
        <Card style={{ marginBottom: 16 }}>
          <Result
            status="error"
            title="Không tra được lô"
            subTitle={dichLoiHeThong(searchError, 'Có lỗi khi tìm lô')}
            extra={
              <Button icon={<ReloadOutlined />} onClick={() => handleSearch(lastSearch)} loading={searching}>
                Thử lại
              </Button>
            }
          />
        </Card>
      )}

      {/* Not Found */}
      {notFound && (
        <Card style={{ marginBottom: 16 }}>
          <Result
            status="warning"
            title="Không tìm thấy lô"
            subTitle="Vui lòng kiểm tra lại mã lô"
          />
        </Card>
      )}

      {/* Result Display (after submit) */}
      {evaluation && batch && (
        <Card style={{ marginBottom: 16 }}>
          <Result
            status={evaluation.result === 'passed' ? 'success' : evaluation.result === 'warning' ? 'warning' : 'error'}
            title={evaluation.result === 'passed' ? 'Đạt chuẩn' : evaluation.result === 'warning' ? 'Cảnh báo' : 'Không đạt'}
            subTitle={
              <Space direction="vertical" align="center">
                <Text>{evaluation.message}</Text>
                {drcValue && <GradeBadge grade={rubberGradeService.classifyByDRC(drcValue)} />}
                <Text type="secondary">Tái kiểm tiếp: {evaluation.next_recheck_days} ngày</Text>
              </Space>
            }
          />
          <Space direction="vertical" style={{ width: '100%' }}>
            {evaluation.result === 'passed' && (
              <Button
                icon={<PrinterOutlined />}
                block
                size="large"
                onClick={() => navigate(`/wms/batch/${batch.id}/label`)}
              >
                In nhãn QR
              </Button>
            )}
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              block
              size="large"
              onClick={handleScanNext}
              style={{ background: BRAND_COLOR, borderColor: BRAND_COLOR }}
            >
              Quét lô tiếp
            </Button>
          </Space>
        </Card>
      )}

      {/* Batch Found — QC Form */}
      {batch && !evaluation && (
        <>
          {/* Batch Info Card */}
          <Card size="small" style={{ marginBottom: 12, background: '#fafafa', borderRadius: 8 }}>
            <Descriptions size="small" column={2}>
              <Descriptions.Item label="Mã lô">
                <Text strong style={{ fontFamily: "'JetBrains Mono'", fontSize: 13 }}>
                  {batch.batch_no}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="NCC">
                {batch.supplier_name || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Loại mủ">
                {batch.rubber_type ? (RUBBER_TYPE_LABELS[batch.rubber_type as keyof typeof RUBBER_TYPE_LABELS] || batch.rubber_type) : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Khối lượng">
                <Text strong>{fmtKg(batch.current_weight || batch.initial_weight || 0)} kg</Text>
              </Descriptions.Item>
              <Descriptions.Item label="DRC hiện tại">
                <Text strong style={{ color: BRAND_COLOR }}>
                  {batch.latest_drc ? `${batch.latest_drc}%` : '—'}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái QC">
                <QCBadge result={batch.qc_status} size="sm" />
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {/* DRC Input */}
          <Card size="small" style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 16 }}>
                <ExperimentOutlined style={{ marginRight: 4 }} />
                Giá trị DRC (%)
              </Text>
              <InputNumber
                value={drcValue}
                onChange={(v) => setDrcValue(v)}
                min={0}
                max={100}
                step={0.1}
                placeholder="Nhập DRC..."
                style={{ width: '100%', fontSize: 24 }}
                size="large"
                autoFocus
              />
            </div>

            {/* Kết quả KHÔNG chọn tay: qcService tự đánh giá theo Ngưỡng QC của vật liệu */}
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6, color: '#6B7280', fontSize: 13 }}>
              <InfoCircleOutlined />
              <span>Kết quả (Đạt / Cảnh báo / Không đạt) hệ thống tự tính theo Ngưỡng QC sau khi lưu.</span>
            </div>

            {/* Optional parameters */}
            <Collapse
              ghost
              items={[{
                key: 'advanced',
                label: <Text type="secondary">Thông số thêm</Text>,
                children: (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>Độ ẩm (%)</Text>
                      <InputNumber
                        value={moisture}
                        onChange={(v) => setMoisture(v)}
                        min={0}
                        max={100}
                        step={0.1}
                        style={{ width: '100%' }}
                        placeholder="Độ ẩm..."
                      />
                    </div>
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>Tạp chất (%)</Text>
                      <InputNumber
                        value={dirtContent}
                        onChange={(v) => setDirtContent(v)}
                        min={0}
                        max={100}
                        step={0.01}
                        style={{ width: '100%' }}
                        placeholder="Tạp chất..."
                      />
                    </div>
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>Tro (%)</Text>
                      <InputNumber
                        value={ashContent}
                        onChange={(v) => setAshContent(v)}
                        min={0}
                        max={100}
                        step={0.01}
                        style={{ width: '100%' }}
                        placeholder="Tro..."
                      />
                    </div>
                  </Space>
                ),
              }]}
            />
          </Card>

          {/* Submit Button */}
          <Button
            type="primary"
            size="large"
            block
            onClick={handleSubmit}
            loading={saving}
            disabled={drcValue == null}
            style={{
              background: BRAND_COLOR,
              borderColor: BRAND_COLOR,
              height: 56,
              fontSize: 18,
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            <CheckCircleOutlined /> Lưu kết quả QC
          </Button>
        </>
      )}

      {/* Recent QC Results */}
      {recentQCs.length > 0 && (
        <Card
          size="small"
          title={<Text type="secondary" style={{ fontSize: 13 }}>Kết quả gần đây</Text>}
          style={{ marginTop: 16 }}
        >
          <List
            dataSource={recentQCs}
            renderItem={(item) => (
              <List.Item>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Text strong style={{ fontFamily: "'JetBrains Mono'", fontSize: 12 }}>
                    {item.batch_no}
                  </Text>
                  <Space>
                    <Text style={{ fontFamily: "'JetBrains Mono'" }}>{item.drc}%</Text>
                    <Tag color={
                      item.result === 'passed' ? 'success' :
                      item.result === 'warning' ? 'warning' : 'error'
                    }>
                      {item.result === 'passed' ? 'Đạt' : item.result === 'warning' ? 'Cảnh báo' : 'Không đạt'}
                    </Tag>
                    <Text type="secondary" style={{ fontSize: 11 }}>{item.time}</Text>
                  </Space>
                </Space>
              </List.Item>
            )}
          />
        </Card>
      )}
    </div>
  )
}

export default QCQuickScanPage
