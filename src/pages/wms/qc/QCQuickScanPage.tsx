// ============================================================================
// QC QUICK SCAN PAGE — Mobile-friendly QC with batch code input
// File: src/pages/wms/qc/QCQuickScanPage.tsx
// Phase 5: QC Nhanh - Quet QR / nhap ma lo -> QC nhanh
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Input, Button, Space, Typography, Spin, Result, Tag,
  Radio, InputNumber, Collapse, Descriptions, List, message,
} from 'antd'
import {
  ScanOutlined, CheckCircleOutlined, ExperimentOutlined,
  PrinterOutlined, ArrowLeftOutlined, ReloadOutlined,
} from '@ant-design/icons'
import { batchService } from '../../../services/wms/batchService'
import qcService from '../../../services/wms/qcService'
import { supabase } from '../../../lib/supabase'
import { dealWmsService } from '../../../services/b2b/dealWmsService'
import type { StockBatch } from '../../../services/wms/wms.types'
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
  const searchRef = useRef<any>(null)

  // Search state
  const [searching, setSearching] = useState(false)
  const [batch, setBatch] = useState<StockBatch | null>(null)
  const [notFound, setNotFound] = useState(false)

  // QC form state
  const [drcValue, setDrcValue] = useState<number | null>(null)
  const [qcResult, setQcResult] = useState<'passed' | 'warning' | 'failed'>('passed')
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
    setBatch(null)
    setEvaluation(null)
    setDrcValue(null)
    setQcResult('passed')
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
      setNotFound(true)
    } finally {
      setSearching(false)
    }
  }, [])

  // --------------------------------------------------------------------------
  // SUBMIT QC
  // --------------------------------------------------------------------------

  const handleSubmit = async () => {
    if (!batch || drcValue == null) {
      message.warning('Vui long nhap gia tri DRC')
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

      let res: { evaluation: QCEvaluation }

      if (isPending) {
        res = await qcService.addInitialQC(qcData)
      } else {
        res = await qcService.addRecheckResult(qcData)
      }

      setEvaluation(res.evaluation)

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

      message.success('Da luu ket qua QC')
    } catch (err: any) {
      console.error('Submit QC error:', err)
      message.error(err?.message || 'Loi khi luu ket qua QC')
    } finally {
      setSaving(false)
    }
  }

  // --------------------------------------------------------------------------
  // RESET / SCAN NEXT
  // --------------------------------------------------------------------------

  const handleScanNext = () => {
    setBatch(null)
    setEvaluation(null)
    setNotFound(false)
    setDrcValue(null)
    setQcResult('passed')
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
    <div style={{ padding: 16, maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#F7F5F2' }}>
      {/* Header */}
      <Space style={{ marginBottom: 16 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/wms/qc')}
          type="text"
        />
        <Title level={4} style={{ margin: 0, color: BRAND_COLOR }}>
          <ScanOutlined style={{ marginRight: 8 }} />
          QC Nhanh
        </Title>
      </Space>

      {/* Search Input */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Search
          ref={searchRef}
          placeholder="Quet QR hoac nhap ma lo..."
          enterButton={<><ScanOutlined /> Tim</>}
          size="large"
          onSearch={handleSearch}
          loading={searching}
          autoFocus
          style={{ fontSize: 16 }}
        />
      </Card>

      {/* Not Found */}
      {notFound && (
        <Card style={{ marginBottom: 16 }}>
          <Result
            status="warning"
            title="Khong tim thay lo"
            subTitle="Vui long kiem tra lai ma lo"
          />
        </Card>
      )}

      {/* Result Display (after submit) */}
      {evaluation && batch && (
        <Card style={{ marginBottom: 16 }}>
          <Result
            status={evaluation.result === 'passed' ? 'success' : evaluation.result === 'warning' ? 'warning' : 'error'}
            title={evaluation.result === 'passed' ? 'Dat chuan' : evaluation.result === 'warning' ? 'Canh bao' : 'Khong dat'}
            subTitle={
              <Space direction="vertical" align="center">
                <Text>{evaluation.message}</Text>
                {drcValue && <GradeBadge grade={rubberGradeService.classifyByDRC(drcValue)} />}
                <Text type="secondary">Tai kiem tiep: {evaluation.next_recheck_days} ngay</Text>
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
                In nhan QR
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
              Quet lo tiep
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
              <Descriptions.Item label="Ma lo">
                <Text strong style={{ fontFamily: "'JetBrains Mono'", fontSize: 13 }}>
                  {batch.batch_no}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="NCC">
                {batch.supplier_name || '---'}
              </Descriptions.Item>
              <Descriptions.Item label="Loai mu">
                {batch.rubber_type || '---'}
              </Descriptions.Item>
              <Descriptions.Item label="Khoi luong">
                <Text strong>{(batch.current_weight || batch.initial_weight || 0).toLocaleString('vi-VN')} kg</Text>
              </Descriptions.Item>
              <Descriptions.Item label="DRC hien tai">
                <Text strong style={{ color: BRAND_COLOR }}>
                  {batch.latest_drc ? `${batch.latest_drc}%` : '---'}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Trang thai QC">
                <QCBadge result={batch.qc_status} size="sm" />
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {/* DRC Input */}
          <Card size="small" style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 16 }}>
                <ExperimentOutlined style={{ marginRight: 4 }} />
                Gia tri DRC (%)
              </Text>
              <InputNumber
                value={drcValue}
                onChange={(v) => setDrcValue(v)}
                min={0}
                max={100}
                step={0.1}
                placeholder="Nhap DRC..."
                style={{ width: '100%', fontSize: 24 }}
                size="large"
                autoFocus
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>Ket qua</Text>
              <Radio.Group
                value={qcResult}
                onChange={(e) => setQcResult(e.target.value)}
                size="large"
                buttonStyle="solid"
                style={{ width: '100%' }}
              >
                <Radio.Button value="passed" style={{ width: '33.33%', textAlign: 'center' }}>
                  <CheckCircleOutlined /> Dat
                </Radio.Button>
                <Radio.Button value="warning" style={{ width: '33.33%', textAlign: 'center' }}>
                  Canh bao
                </Radio.Button>
                <Radio.Button value="failed" style={{ width: '33.33%', textAlign: 'center' }}>
                  Khong dat
                </Radio.Button>
              </Radio.Group>
            </div>

            {/* Optional parameters */}
            <Collapse
              ghost
              items={[{
                key: 'advanced',
                label: <Text type="secondary">Thong so them</Text>,
                children: (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>Do am (%)</Text>
                      <InputNumber
                        value={moisture}
                        onChange={(v) => setMoisture(v)}
                        min={0}
                        max={100}
                        step={0.1}
                        style={{ width: '100%' }}
                        placeholder="Do am..."
                      />
                    </div>
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>Tap chat (%)</Text>
                      <InputNumber
                        value={dirtContent}
                        onChange={(v) => setDirtContent(v)}
                        min={0}
                        max={100}
                        step={0.01}
                        style={{ width: '100%' }}
                        placeholder="Tap chat..."
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
            <CheckCircleOutlined /> Luu ket qua QC
          </Button>
        </>
      )}

      {/* Recent QC Results */}
      {recentQCs.length > 0 && (
        <Card
          size="small"
          title={<Text type="secondary" style={{ fontSize: 13 }}>Ket qua gan day</Text>}
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
                      {item.result === 'passed' ? 'Dat' : item.result === 'warning' ? 'C.bao' : 'K.dat'}
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
