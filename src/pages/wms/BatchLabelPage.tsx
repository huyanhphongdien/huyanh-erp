// ============================================================================
// BATCH LABEL PAGE — Trang in nhãn lô hàng cao su
// File: src/pages/wms/BatchLabelPage.tsx
// Route: /wms/batch/:batchId/label
// In nhãn QR sau khi QC hoàn tất — dán tại bãi mủ
// ============================================================================

import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import {
  Button, Space, Typography, Spin, Alert, Select, Switch, Card,
} from 'antd'
import {
  PrinterOutlined, ArrowLeftOutlined, ExpandOutlined,
} from '@ant-design/icons'
import batchService from '../../services/wms/batchService'
import type { StockBatch } from '../../services/wms/wms.types'
import BatchLabel from '../../components/wms/BatchLabel'

const { Title, Text } = Typography

// ============================================================================
// PRINT STYLES — @media print CSS
// ============================================================================

const printStyles = `
@media print {
  /* Ẩn tất cả UI ngoài nhãn */
  .no-print,
  .ant-layout-header,
  .ant-layout-sider,
  .ant-breadcrumb,
  nav,
  header,
  footer {
    display: none !important;
  }

  body, html {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }

  .print-area {
    padding: 0 !important;
    margin: 0 !important;
  }

  .batch-label {
    border: 3px solid #1B4D3E !important;
    page-break-inside: avoid !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* A5 Landscape */
  @page {
    size: A5 landscape;
    margin: 10mm;
  }
}

@media print and (min-width: 0) {
  .label-size-a4 .batch-label {
    max-width: 100% !important;
  }
}
`

// ============================================================================
// PAGE COMPONENT
// ============================================================================

interface BatchLabelPageProps {
  batchId?: string
}

const BatchLabelPage = ({ batchId: propBatchId }: BatchLabelPageProps = {}) => {
  const { batchId: paramBatchId } = useParams<{ batchId: string }>()
  const batchId = propBatchId || paramBatchId
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const printRef = useRef<HTMLDivElement>(null)

  const [batch, setBatch] = useState<StockBatch | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoPrint, setAutoPrint] = useState(false)

  const size = (searchParams.get('size') as 'a5' | 'a4') || 'a5'

  // Load batch data
  useEffect(() => {
    const loadBatch = async () => {
      if (!batchId) {
        setError('Không tìm thấy mã lô')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const data = await batchService.getById(batchId)
        if (!data) {
          setError('Không tìm thấy lô hàng')
          return
        }
        setBatch(data)
      } catch (err) {
        console.error('Load batch error:', err)
        setError('Lỗi tải dữ liệu lô hàng')
      } finally {
        setLoading(false)
      }
    }

    loadBatch()
  }, [batchId])

  // Auto print on load (if enabled)
  useEffect(() => {
    if (autoPrint && batch && !loading) {
      const timer = setTimeout(() => {
        window.print()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [autoPrint, batch, loading])

  const handlePrint = () => {
    window.print()
  }

  const handleSizeChange = (newSize: 'a5' | 'a4') => {
    setSearchParams({ size: newSize })
  }

  // ---- Loading ----
  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center', paddingTop: 100 }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>
          <Text type="secondary">Đang tải thông tin lô...</Text>
        </div>
      </div>
    )
  }

  // ---- Error ----
  if (error || !batch) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="error"
          message="Lỗi"
          description={error || 'Không tìm thấy lô hàng'}
          showIcon
          action={
            <Button onClick={() => navigate(-1)}>Quay lại</Button>
          }
        />
      </div>
    )
  }

  return (
    <>
      {/* Inject print CSS */}
      <style>{printStyles}</style>

      <div style={{ padding: 24 }}>
        {/* Toolbar — ẩn khi in */}
        <div className="no-print">
          <Card
            size="small"
            style={{ marginBottom: 24, borderRadius: 8 }}
            bodyStyle={{ padding: '12px 16px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <Space>
                <Button
                  icon={<ArrowLeftOutlined />}
                  onClick={() => navigate(-1)}
                >
                  Quay lại
                </Button>
                <Title level={5} style={{ margin: 0, color: '#1B4D3E' }}>
                  <PrinterOutlined style={{ marginRight: 8 }} />
                  In nhãn lô: {batch.batch_no}
                </Title>
              </Space>

              <Space size="middle">
                {/* Chọn kích thước */}
                <Space size={4}>
                  <Text type="secondary">Kích thước:</Text>
                  <Select
                    value={size}
                    onChange={handleSizeChange}
                    size="small"
                    style={{ width: 120 }}
                    options={[
                      { value: 'a5', label: 'A5 (Bãi mủ)' },
                      { value: 'a4', label: 'A4 (Lớn)' },
                    ]}
                  />
                </Space>

                {/* Auto print toggle */}
                <Space size={4}>
                  <Text type="secondary">Tự động in:</Text>
                  <Switch
                    checked={autoPrint}
                    onChange={setAutoPrint}
                    size="small"
                  />
                </Space>

                {/* Print button */}
                <Button
                  type="primary"
                  icon={<PrinterOutlined />}
                  onClick={handlePrint}
                  size="large"
                  style={{
                    background: '#1B4D3E',
                    borderColor: '#1B4D3E',
                    fontWeight: 600,
                    height: 40,
                    paddingInline: 24,
                  }}
                >
                  In nhãn
                </Button>
              </Space>
            </div>
          </Card>

          {/* QC Warning */}
          {batch.qc_status === 'pending' && (
            <Alert
              type="warning"
              message="Nhãn tạm — Chưa qua QC"
              description="Lô hàng này chưa được kiểm tra chất lượng. Nhãn in ra sẽ có watermark 'NHÃN TẠM — CHỜ QC' và không hiển thị DRC."
              showIcon
              style={{ marginBottom: 16, borderRadius: 8 }}
            />
          )}

          {batch.qc_status === 'passed' && (
            <Alert
              type="success"
              message="QC ĐẠT — Nhãn chính thức"
              description={`DRC: ${batch.latest_drc?.toFixed(1)}% | Grade: ${batch.rubber_grade || '—'}`}
              showIcon
              style={{ marginBottom: 16, borderRadius: 8 }}
            />
          )}
        </div>

        {/* Print Area */}
        <div
          ref={printRef}
          className={`print-area label-size-${size}`}
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: size === 'a4' ? '20px 0' : '10px 0',
          }}
        >
          <BatchLabel batch={batch} size={size} showQR />
        </div>

        {/* Instructions — ẩn khi in */}
        <div className="no-print" style={{ marginTop: 24 }}>
          <Card size="small" style={{ background: '#f9fafb', borderRadius: 8 }}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              <strong>Hướng dẫn:</strong> Nhãn A5 ngang dùng dán tại bãi mủ (ngoài trời).
              QR code khi quét sẽ mở trang chi tiết lô hàng trên ERP.
              Nhấn <ExpandOutlined /> <strong>In nhãn</strong> hoặc <kbd>Ctrl+P</kbd> để in.
            </Text>
          </Card>
        </div>
      </div>
    </>
  )
}

export default BatchLabelPage
