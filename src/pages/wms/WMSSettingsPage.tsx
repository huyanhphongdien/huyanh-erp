// ============================================================================
// WMS SETTINGS PAGE — Cấu hình cảnh báo & dự báo
// File: src/pages/wms/WMSSettingsPage.tsx
// Module: Kho (WMS) - Huy Anh Rubber ERP
// Phase 11: Alert Config UI
// ⚠ Đợt 3 audit UI (17/11/2026): cấu hình này lưu ở localStorage CỦA TRÌNH DUYỆT (forecastService)
//   — mỗi máy tự tính cảnh báo bằng ngưỡng của máy đó. Trang ghi rõ "chỉ áp dụng trên máy này"
//   để admin khỏi tưởng đã chỉnh cho cả hệ. Lưu chung (bảng settings) là việc của service.
// ============================================================================

import { useState, useEffect } from 'react'
import {
  Card,
  Row,
  Col,
  InputNumber,
  Button,
  Space,
  Typography,
  Divider,
  Alert,
  message,
} from 'antd'
import {
  SaveOutlined,
  UndoOutlined,
  SettingOutlined,
  WarningOutlined,
  ClockCircleOutlined,
  CalendarOutlined,
  LineChartOutlined,
  ExperimentOutlined,
} from '@ant-design/icons'
import forecastService, {
  type AlertConfig,
  DEFAULT_ALERT_CONFIG,
} from '../../services/wms/forecastService'

const { Title, Text } = Typography

// ============================================================================
// COMPONENT
// ============================================================================

const WMSSettingsPage = () => {
  const [config, setConfig] = useState<AlertConfig>(DEFAULT_ALERT_CONFIG)
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    const saved = forecastService.getConfig()
    setConfig(saved)
  }, [])

  const handleChange = (field: keyof AlertConfig, value: number | null) => {
    setConfig(prev => ({ ...prev, [field]: value ?? 0 }))
    setHasChanges(true)
  }

  const handleSave = () => {
    forecastService.saveConfig(config)
    setHasChanges(false)
    message.success('Đã lưu cấu hình cảnh báo — chỉ áp dụng trên máy này')
  }

  const handleReset = () => {
    const defaults = forecastService.resetConfig()
    setConfig(defaults)
    setHasChanges(false)
    message.info('Đã đặt lại cấu hình mặc định trên máy này')
  }

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      {/* Trang sống trong tab "Cài đặt cảnh báo" của /wms/config — bỏ nút Quay lại (trước nhảy sang Kho NVL) */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <div>
            <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>
              <SettingOutlined style={{ marginRight: 8 }} />
              Cài đặt kho (WMS)
            </Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Cấu hình ngưỡng cảnh báo và tham số dự báo tồn kho
            </Text>
          </div>
        </Col>
        <Col>
          <Space>
            <Button icon={<UndoOutlined />} onClick={handleReset}>
              Đặt lại mặc định
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              disabled={!hasChanges}
              style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
            >
              Lưu
            </Button>
          </Space>
        </Col>
      </Row>

      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16, borderRadius: 8 }}
        message="Cấu hình chỉ áp dụng trên MÁY NÀY"
        description="Ngưỡng được lưu trong trình duyệt đang dùng. Người khác và máy khác vẫn dùng ngưỡng mặc định; xoá dữ liệu trình duyệt sẽ mất cấu hình đã lưu."
      />

      {/* Section 1: Cảnh báo hao hụt */}
      <Card
        title={
          <Space>
            <WarningOutlined style={{ color: '#F59E0B' }} />
            <span>Cảnh báo hao hụt</span>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Row gutter={[24, 16]}>
          <Col xs={24} sm={12}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>% hao hụt cảnh báo</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Khi hao hụt vượt ngưỡng này, hiển thị cảnh báo vàng
              </Text>
            </div>
            <InputNumber
              value={config.shrinkage_warning_pct}
              onChange={v => handleChange('shrinkage_warning_pct', v)}
              min={0}
              max={100}
              step={1}
              addonAfter="%"
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} sm={12}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>% hao hụt nghiêm trọng</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Khi hao hụt vượt ngưỡng này, hiển thị cảnh báo đỏ
              </Text>
            </div>
            <InputNumber
              value={config.shrinkage_critical_pct}
              onChange={v => handleChange('shrinkage_critical_pct', v)}
              min={0}
              max={100}
              step={1}
              addonAfter="%"
              style={{ width: '100%' }}
            />
          </Col>
        </Row>
      </Card>

      {/* Section 2: Cảnh báo lưu kho */}
      <Card
        title={
          <Space>
            <ClockCircleOutlined style={{ color: '#2563EB' }} />
            <span>Cảnh báo lưu kho</span>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Row gutter={[24, 16]}>
          <Col xs={24} sm={12}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>Số ngày cảnh báo</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Lô hàng lưu kho quá số ngày này sẽ được cảnh báo vàng
              </Text>
            </div>
            <InputNumber
              value={config.storage_warning_days}
              onChange={v => handleChange('storage_warning_days', v)}
              min={1}
              max={365}
              step={1}
              addonAfter="ngày"
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} sm={12}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>Số ngày nghiêm trọng</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Lô hàng lưu kho quá số ngày này sẽ được cảnh báo đỏ
              </Text>
            </div>
            <InputNumber
              value={config.storage_critical_days}
              onChange={v => handleChange('storage_critical_days', v)}
              min={1}
              max={365}
              step={1}
              addonAfter="ngày"
              style={{ width: '100%' }}
            />
          </Col>
        </Row>
      </Card>

      {/* Section 3: Cảnh báo hết hạn */}
      <Card
        title={
          <Space>
            <CalendarOutlined style={{ color: '#DC2626' }} />
            <span>Cảnh báo hết hạn</span>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Row gutter={[24, 16]}>
          <Col xs={24} sm={12}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>Số ngày trước hết hạn</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Cảnh báo khi lô hàng còn ít hơn số ngày này trước hạn sử dụng
              </Text>
            </div>
            <InputNumber
              value={config.expiry_warning_days}
              onChange={v => handleChange('expiry_warning_days', v)}
              min={1}
              max={90}
              step={1}
              addonAfter="ngày"
              style={{ width: '100%' }}
            />
          </Col>
        </Row>
      </Card>

      {/* Section 3b: DRC range (C3) */}
      <Card
        title={
          <Space>
            <ExperimentOutlined style={{ color: '#059669' }} />
            <span>Ngưỡng DRC (%)</span>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
          DRC nằm ngoài khoảng "cảnh báo" sẽ cảnh báo vàng; ngoài khoảng "nghiêm trọng" cảnh báo đỏ.
          Dùng cho Tổng quan QC và danh sách Cảnh báo.
        </Text>
        <Row gutter={[24, 16]}>
          <Col xs={24} sm={12} md={6}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>Cảnh báo — DRC tối thiểu</Text>
            </div>
            <InputNumber
              value={config.drc_warning_min}
              onChange={v => handleChange('drc_warning_min', v)}
              min={0}
              max={100}
              step={0.5}
              addonAfter="%"
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>Cảnh báo — DRC tối đa</Text>
            </div>
            <InputNumber
              value={config.drc_warning_max}
              onChange={v => handleChange('drc_warning_max', v)}
              min={0}
              max={100}
              step={0.5}
              addonAfter="%"
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>Nghiêm trọng — DRC tối thiểu</Text>
            </div>
            <InputNumber
              value={config.drc_critical_min}
              onChange={v => handleChange('drc_critical_min', v)}
              min={0}
              max={100}
              step={0.5}
              addonAfter="%"
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>Nghiêm trọng — DRC tối đa</Text>
            </div>
            <InputNumber
              value={config.drc_critical_max}
              onChange={v => handleChange('drc_critical_max', v)}
              min={0}
              max={100}
              step={0.5}
              addonAfter="%"
              style={{ width: '100%' }}
            />
          </Col>
        </Row>
      </Card>

      {/* Section 4: Dự báo */}
      <Card
        title={
          <Space>
            <LineChartOutlined style={{ color: '#7C3AED' }} />
            <span>Dự báo</span>
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Row gutter={[24, 16]}>
          <Col xs={24} sm={12}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>Số ngày dự báo</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Khoảng thời gian tính dự báo tồn kho (mặc định 30 ngày)
              </Text>
            </div>
            <InputNumber
              value={config.forecast_days}
              onChange={v => handleChange('forecast_days', v)}
              min={7}
              max={180}
              step={1}
              addonAfter="ngày"
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} sm={12}>
            <div style={{ marginBottom: 8 }}>
              <Text strong>Ngưỡng cảnh báo hết hàng (ngày)</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Cảnh báo khi dự báo tồn kho dưới 0 trong số ngày này
              </Text>
            </div>
            <InputNumber
              value={config.stockout_warning_days}
              onChange={v => handleChange('stockout_warning_days', v)}
              min={1}
              max={60}
              step={1}
              addonAfter="ngày"
              style={{ width: '100%' }}
            />
          </Col>
        </Row>
      </Card>

      {/* Bottom action */}
      <Divider />
      <Row justify="end">
        <Space>
          <Button icon={<UndoOutlined />} onClick={handleReset}>
            Đặt lại mặc định
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            disabled={!hasChanges}
            size="large"
            style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
          >
            Lưu cấu hình (máy này)
          </Button>
        </Space>
      </Row>
    </div>
  )
}

export default WMSSettingsPage
