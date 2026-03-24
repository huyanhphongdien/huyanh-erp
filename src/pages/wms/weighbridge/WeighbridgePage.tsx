// ============================================================================
// FILE: src/pages/wms/weighbridge/WeighbridgePage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P7 — Sprint 7B — Trang can xe chinh (Core Weighing Interface)
// ============================================================================
// KET NOI SUPABASE THAT — khong dung mock data
// Design: Ant Design v6, Industrial Mobile-First
// ============================================================================

import React, { useState, useCallback, useEffect, useRef } from 'react'
import {
  Card,
  Button,
  Input,
  Select,
  Typography,
  Space,
  Alert,
  Modal,
  Row,
  Col,
  Spin,
  Tag,
  Collapse,
  Divider,
  Badge,
  AutoComplete,
} from 'antd'
import {
  ArrowLeftOutlined,
  PlusOutlined,
  CheckOutlined,
  CloseOutlined,
  PrinterOutlined,
  ReloadOutlined,
  WifiOutlined,
  DisconnectOutlined,
  WarningOutlined,
  LoadingOutlined,
  UserOutlined,
  FileTextOutlined,
  LinkOutlined,
  HistoryOutlined,
  ThunderboltOutlined,
  EyeOutlined,
  DeleteOutlined,
  CameraOutlined,
  PictureOutlined,
  CarOutlined,
  UpOutlined,
  DownOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../../stores/authStore'
import weighbridgeService, { type CreateTicketData } from '../../../services/wms/weighbridgeService'
import weighbridgeImageService, { type CaptureType } from '../../../services/wms/weighbridgeImageService'
import { CameraGrid } from '../../../components/wms/CameraFeed'
import type { WeighbridgeTicket, WeighbridgeImage, TicketType, WeighbridgeStatus } from '../../../services/wms/wms.types'
import { useKeliScale } from '../../../hooks/useKeliScale'
import type { ScaleReading } from '../../../hooks/useKeliScale'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_TAG_CONFIG: Record<WeighbridgeStatus, { label: string; color: string }> = {
  weighing_gross: { label: 'Chờ cân lần 1', color: 'processing' },
  weighing_tare: { label: 'Chờ cân lần 2', color: 'warning' },
  completed: { label: 'Hoàn tất', color: 'success' },
  cancelled: { label: 'Đã hủy', color: 'error' },
}

const TICKET_TYPE_OPTIONS: { value: TicketType; label: string; icon: string }[] = [
  { value: 'in', label: 'Xe vào (Nhập)', icon: '📥' },
  { value: 'out', label: 'Xe ra (Xuất)', icon: '📤' },
]

const REFERENCE_TYPES = [
  { value: '', label: 'Không liên kết' },
  { value: 'stock_in', label: 'Phiếu nhập TP' },
  { value: 'stock_out', label: 'Phiếu xuất TP' },
  { value: 'stock_in_raw', label: 'Nhập NVL' },
  { value: 'purchase_order', label: 'Đơn mua hàng' },
]

// Scale: dung Web Serial API (useKeliScale hook) thay vi gateway

const MONO_FONT: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" }
const PRIMARY_COLOR = '#1B4D3E'

// ============================================================================
// SCALE HOOK — Web Serial API (doc truc tiep tu dau can, khong can gateway)
// ============================================================================

// Re-export ScaleReading type for backward compat (already imported from hook)

// ============================================================================
// COMPONENT
// ============================================================================

export default function WeighbridgePage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const userId = user?.employee_id ?? undefined

  // === States ===
  const [mode, setMode] = useState<'idle' | 'create' | 'weighing'>('idle')
  const [ticket, setTicket] = useState<WeighbridgeTicket | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form states
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [driverName, setDriverName] = useState('')
  const [ticketType, setTicketType] = useState<TicketType>('in')
  const [referenceType, setReferenceType] = useState('')
  const [referenceId, setReferenceId] = useState('')
  const [notes, setNotes] = useState('')

  // Weight input
  const [manualWeight, setManualWeight] = useState('')
  const [weightSource, setWeightSource] = useState<'scale' | 'manual'>('manual')

  // Plate suggestions
  const [plateSuggestions, setPlateSuggestions] = useState<string[]>([])
  const [tareSuggestion, setTareSuggestion] = useState<{ avgTare: number | null; lastTare: number | null; count: number } | null>(null)

  // Images
  const [images, setImages] = useState<WeighbridgeImage[]>([])
  const [uploading, setUploading] = useState(false)

  // Sections collapse
  const [showCamera, setShowCamera] = useState(false)
  const [showLink, setShowLink] = useState(false)

  // Resume in-progress ticket
  const [inProgressTickets, setInProgressTickets] = useState<WeighbridgeTicket[]>([])

  // Scale — Web Serial API (doc truc tiep tu dau can qua USB)
  const scale = useKeliScale()

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Load in-progress tickets on mount
  useEffect(() => {
    loadInProgress()
  }, [])

  async function loadInProgress() {
    try {
      const result = await weighbridgeService.getAll({
        page: 1,
        pageSize: 10,
        status: 'weighing_gross',
      })
      const result2 = await weighbridgeService.getAll({
        page: 1,
        pageSize: 10,
        status: 'weighing_tare',
      })
      setInProgressTickets([...result.data, ...result2.data])
    } catch { /* ignore */ }
  }

  // Plate autocomplete
  useEffect(() => {
    if (vehiclePlate.length < 2) {
      setPlateSuggestions([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const plates = await weighbridgeService.getPlateHistory(vehiclePlate, 8)
        setPlateSuggestions(plates)
      } catch { /* ignore */ }
    }, 300)
    return () => clearTimeout(timer)
  }, [vehiclePlate])

  // Tare suggestion when plate changes
  useEffect(() => {
    if (!ticket || ticket.status !== 'weighing_tare') return
    const plate = ticket.vehicle_plate
    if (!plate) return
    weighbridgeService.getSuggestedTare(plate)
      .then(setTareSuggestion)
      .catch(() => setTareSuggestion(null))
  }, [ticket?.status, ticket?.vehicle_plate])

  // ============================================================================
  // HANDLERS
  // ============================================================================

  function clearMessages() {
    setError(null)
    setSuccess(null)
  }

  function resetForm() {
    setVehiclePlate('')
    setDriverName('')
    setTicketType('in')
    setReferenceType('')
    setReferenceId('')
    setNotes('')
    setManualWeight('')
    setMode('idle')
    setTicket(null)
    setImages([])
    setTareSuggestion(null)
    clearMessages()
  }

  // --- Create ticket ---
  async function handleCreate() {
    clearMessages()
    if (!vehiclePlate.trim()) {
      setError('Vui lòng nhập biến số xe')
      return
    }

    setLoading(true)
    try {
      const data: CreateTicketData = {
        vehicle_plate: vehiclePlate,
        driver_name: driverName || undefined,
        ticket_type: ticketType,
        reference_type: referenceType || undefined,
        reference_id: referenceId || undefined,
        notes: notes || undefined,
      }
      const newTicket = await weighbridgeService.create(data, userId)
      setTicket(newTicket)
      setMode('weighing')
      setSuccess(`Tạo phiếu ${newTicket.code} thành công`)
    } catch (err: any) {
      setError(err?.message || 'Không thể tạo phiếu cân')
    } finally {
      setLoading(false)
    }
  }

  // --- Resume ticket ---
  async function handleResume(t: WeighbridgeTicket) {
    clearMessages()
    setLoading(true)
    try {
      const full = await weighbridgeService.getById(t.id)
      if (full) {
        setTicket(full)
        setImages(full.images || [])
        setMode('weighing')
      }
    } catch (err: any) {
      setError(err?.message || 'Không thể tải phiếu cân')
    } finally {
      setLoading(false)
    }
  }

  // --- Record weight ---
  async function handleRecordWeight() {
    if (!ticket) return
    clearMessages()

    let weight: number
    if (weightSource === 'scale' && scale.liveWeight) {
      weight = scale.liveWeight.weight
    } else {
      weight = parseFloat(manualWeight)
    }

    if (isNaN(weight) || weight <= 0) {
      setError('Trọng lượng không hợp lệ')
      return
    }

    setLoading(true)
    try {
      let updated: WeighbridgeTicket
      if (ticket.status === 'weighing_gross') {
        updated = await weighbridgeService.updateGrossWeight(ticket.id, weight, userId)
        setSuccess(`Cân lần 1 (Gross): ${weight.toLocaleString()} kg`)
      } else {
        updated = await weighbridgeService.updateTareWeight(ticket.id, weight, userId)
        setSuccess(`Cân lần 2 (Tare): ${weight.toLocaleString()} kg — NET: ${updated.net_weight?.toLocaleString()} kg`)
      }
      setTicket(updated)
      setManualWeight('')
    } catch (err: any) {
      setError(err?.message || 'Không thể ghi trọng lượng')
    } finally {
      setLoading(false)
    }
  }

  // --- Read from scale ---
  async function handleReadScale() {
    clearMessages()
    const reading = await scale.readOnce()
    if (reading) {
      setManualWeight(String(reading.weight))
      setWeightSource('scale')
      setSuccess(`Đọc từ cân: ${reading.weight} ${reading.unit} ${reading.stable ? '(ổn định)' : '(chưa ổn định)'}`)
    } else {
      setError('Không đọc được từ cân. Vui lòng nhập thủ công.')
      setWeightSource('manual')
    }
  }

  // --- Use tare suggestion ---
  function handleUseTareSuggestion(tare: number) {
    setManualWeight(String(tare))
    setWeightSource('manual')
  }

  // --- Complete ---
  async function handleComplete() {
    if (!ticket) return
    clearMessages()
    setLoading(true)
    try {
      const updated = await weighbridgeService.complete(ticket.id)
      setTicket(updated)
      setSuccess(`Phiếu ${updated.code} hoàn tất — NET: ${updated.net_weight?.toLocaleString()} kg`)
    } catch (err: any) {
      setError(err?.message || 'Không thể hoàn tất phiếu cân')
    } finally {
      setLoading(false)
    }
  }

  // --- Cancel ---
  async function handleCancel() {
    if (!ticket) return
    Modal.confirm({
      title: 'Xác nhận hủy phiếu cân',
      content: 'Bạn có chắc chắn muốn hủy phiếu cân này?',
      okText: 'Hủy phiếu',
      cancelText: 'Không',
      okButtonProps: { danger: true },
      onOk: async () => {
        clearMessages()
        setLoading(true)
        try {
          const updated = await weighbridgeService.cancel(ticket.id, 'Hủy bởi nhân viên cân')
          setTicket(updated)
          setSuccess(`Đã hủy phiếu ${updated.code}`)
        } catch (err: any) {
          setError(err?.message || 'Không thể hủy phiếu')
        } finally {
          setLoading(false)
        }
      },
    })
  }

  // --- Upload image ---
  async function handleUploadImage(captureType: CaptureType) {
    if (!ticket) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.capture = 'environment'
    input.onchange = async (e: any) => {
      const file = e.target?.files?.[0]
      if (!file) return
      setUploading(true)
      try {
        const img = await weighbridgeImageService.uploadImage(ticket.id, file, captureType)
        setImages(prev => [...prev, img])
        setSuccess('Đã lưu ảnh')
      } catch (err: any) {
        setError(err?.message || 'Không thể upload ảnh')
      } finally {
        setUploading(false)
      }
    }
    input.click()
  }

  // --- Delete image ---
  async function handleDeleteImage(imgId: string) {
    try {
      await weighbridgeImageService.deleteImage(imgId)
      setImages(prev => prev.filter(i => i.id !== imgId))
    } catch { /* ignore */ }
  }

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const isWeighing = mode === 'weighing' && ticket
  const canRecordWeight = ticket && (ticket.status === 'weighing_gross' || ticket.status === 'weighing_tare')
  const canComplete = ticket && ticket.status === 'weighing_tare' && ticket.net_weight != null
  const isCompleted = ticket?.status === 'completed'
  const isCancelled = ticket?.status === 'cancelled'

  // ============================================================================
  // RENDER: IDLE — Chon tao moi hoac tiep tuc
  // ============================================================================

  if (mode === 'idle') {
    return (
      <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
        {/* Header */}
        <div style={{ background: PRIMARY_COLOR, padding: '16px', position: 'sticky', top: 0, zIndex: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/wms')}
              style={{ color: '#fff' }}
            />
            <div style={{ flex: 1 }}>
              <Title level={5} style={{ color: '#fff', margin: 0 }}>Trạm Cân Xe</Title>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Huy Anh Rubber — Weighbridge Station</Text>
            </div>
            <Tag
              icon={scale.connected ? <WifiOutlined /> : <DisconnectOutlined />}
              color={scale.connected ? 'success' : 'error'}
            >
              {scale.connected ? 'Cân online' : 'Cân offline'}
            </Tag>
          </div>
        </div>

        <div style={{ maxWidth: 672, margin: '0 auto', padding: '24px 16px' }}>
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {/* Nut tao moi */}
            <Card
              hoverable
              onClick={() => setMode('create')}
              style={{ borderRadius: 16, cursor: 'pointer' }}
              styles={{ body: { padding: 24 } }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 64, height: 64, borderRadius: 16,
                  background: PRIMARY_COLOR, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <PlusOutlined style={{ fontSize: 28, color: '#fff' }} />
                </div>
                <div>
                  <Text strong style={{ fontSize: 18, display: 'block' }}>Tạo phiếu cân mới</Text>
                  <Text type="secondary">Xe vào cân — Nhập biển số, chọn loại</Text>
                </div>
              </div>
            </Card>

            {/* Phieu dang do */}
            {inProgressTickets.length > 0 && (
              <div>
                <Text type="secondary" strong style={{ textTransform: 'uppercase', letterSpacing: 1, fontSize: 12, display: 'block', marginBottom: 12 }}>
                  Đang cân dở ({inProgressTickets.length})
                </Text>
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  {inProgressTickets.map(t => {
                    const sc = STATUS_TAG_CONFIG[t.status]
                    return (
                      <Card
                        key={t.id}
                        hoverable
                        size="small"
                        onClick={() => handleResume(t)}
                        style={{ borderRadius: 12, cursor: 'pointer' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                          <div style={{
                            width: 48, height: 48, borderRadius: 12,
                            background: '#FEF3C7', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                          }}>
                            <CarOutlined style={{ fontSize: 22, color: '#D97706' }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Space size={8} align="center">
                              <Text strong>{t.vehicle_plate}</Text>
                              <Tag color={sc.color}>{sc.label}</Tag>
                            </Space>
                            <div>
                              <Text type="secondary" style={{ fontSize: 13 }} ellipsis>
                                {t.code} • {t.driver_name || 'Không có tài xế'} • {t.ticket_type === 'in' ? 'Xe vào' : 'Xe ra'}
                              </Text>
                            </div>
                            {t.gross_weight != null && (
                              <Text style={{ fontSize: 13, color: '#2563EB', fontWeight: 500 }}>
                                Gross: {t.gross_weight.toLocaleString()} kg
                              </Text>
                            )}
                          </div>
                          <ArrowLeftOutlined style={{ color: '#999', transform: 'rotate(180deg)' }} />
                        </div>
                      </Card>
                    )
                  })}
                </Space>
              </div>
            )}

            {/* Xem lich su */}
            <Card
              hoverable
              onClick={() => navigate('/wms/weighbridge/list')}
              style={{ borderRadius: 12, cursor: 'pointer' }}
              size="small"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: '#f5f5f5', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <HistoryOutlined style={{ fontSize: 22, color: '#666' }} />
                </div>
                <div>
                  <Text strong>Lịch sử cân</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 13 }}>Xem phiếu cân đã hoàn tất</Text>
                </div>
              </div>
            </Card>
          </Space>
        </div>
      </div>
    )
  }

  // ============================================================================
  // RENDER: CREATE — Form tao phiếu cân
  // ============================================================================

  if (mode === 'create') {
    return (
      <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
        {/* Header */}
        <div style={{ background: PRIMARY_COLOR, padding: '16px', position: 'sticky', top: 0, zIndex: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={resetForm}
              style={{ color: '#fff' }}
            />
            <Title level={5} style={{ color: '#fff', margin: 0, flex: 1 }}>Tạo phiếu cân mới</Title>
          </div>
        </div>

        <div style={{ maxWidth: 672, margin: '0 auto', padding: '24px 16px' }}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {/* Error */}
            {error && (
              <Alert type="error" message={error} showIcon closable onClose={() => setError(null)} />
            )}

            {/* Biển số xe */}
            <div>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>
                Biển số xe <Text type="danger">*</Text>
              </Text>
              <AutoComplete
                value={vehiclePlate}
                onChange={(val) => setVehiclePlate(val.toUpperCase())}
                options={plateSuggestions.map(p => ({ value: p, label: `🚛 ${p}` }))}
                placeholder="VD: 75C-12345"
                style={{ width: '100%' }}
                size="large"
                autoFocus
              >
                <Input
                  style={{ fontSize: 17, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase' }}
                  size="large"
                />
              </AutoComplete>
            </div>

            {/* Tài xế */}
            <div>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>Tài xế</Text>
              <Input
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder="Tên tài xế (tùy chọn)"
                prefix={<UserOutlined />}
                size="large"
              />
            </div>

            {/* Loại xe */}
            <div>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>Loại</Text>
              <Row gutter={12}>
                {TICKET_TYPE_OPTIONS.map(opt => (
                  <Col span={12} key={opt.value}>
                    <Button
                      block
                      size="large"
                      type={ticketType === opt.value ? 'primary' : 'default'}
                      onClick={() => setTicketType(opt.value)}
                      style={ticketType === opt.value ? { background: PRIMARY_COLOR, borderColor: PRIMARY_COLOR } : {}}
                    >
                      {opt.icon} {opt.label}
                    </Button>
                  </Col>
                ))}
              </Row>
            </div>

            {/* Ghi chú */}
            <div>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>Ghi chú</Text>
              <TextArea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ghi chú thêm (tùy chọn)"
                rows={2}
                size="large"
              />
            </div>

            {/* Liên kết phiếu (collapsible) */}
            <Collapse
              ghost
              items={[{
                key: 'link',
                label: (
                  <Space>
                    <LinkOutlined />
                    <span>Liên kết phiếu nhập/xuất</span>
                  </Space>
                ),
                children: (
                  <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    <div>
                      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Loại liên kết</Text>
                      <Select
                        value={referenceType}
                        onChange={setReferenceType}
                        options={REFERENCE_TYPES}
                        style={{ width: '100%' }}
                        size="large"
                      />
                    </div>
                    {referenceType && (
                      <div>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Mã phiếu</Text>
                        <Input
                          value={referenceId}
                          onChange={(e) => setReferenceId(e.target.value)}
                          placeholder="VD: NK-TP-20260225-001"
                          size="large"
                        />
                      </div>
                    )}
                  </Space>
                ),
              }]}
            />

            {/* Action */}
            <div style={{ position: 'sticky', bottom: 0, background: '#f5f5f5', paddingTop: 12, paddingBottom: 24 }}>
              <Button
                type="primary"
                block
                size="large"
                onClick={handleCreate}
                loading={loading}
                disabled={!vehiclePlate.trim()}
                icon={<CarOutlined />}
                style={{ height: 56, fontWeight: 700, fontSize: 16, background: PRIMARY_COLOR, borderColor: PRIMARY_COLOR }}
              >
                {loading ? 'Đang tạo...' : 'Bắt đầu cân'}
              </Button>
            </div>
          </Space>
        </div>
      </div>
    )
  }

  // ============================================================================
  // RENDER: WEIGHING — Giao dien can chinh
  // ============================================================================

  const ticketStatus = ticket?.status || 'weighing_gross'
  const sc = STATUS_TAG_CONFIG[ticketStatus]

  return (
    <div style={{ minHeight: '100vh', background: '#f0f0f0' }}>
      {/* Header */}
      <div style={{ background: PRIMARY_COLOR, padding: '12px 16px', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={resetForm}
            style={{ color: '#fff' }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Space size={8} align="center">
              <Text strong style={{ color: '#fff', fontSize: 15 }} ellipsis>{ticket?.code}</Text>
              <Tag color={sc.color}>{sc.label}</Tag>
            </Space>
            <div>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }} ellipsis>
                {ticket?.vehicle_plate} • {ticket?.driver_name || 'Không có tài xế'} • {ticket?.ticket_type === 'in' ? 'Xe vào' : 'Xe ra'}
              </Text>
            </div>
          </div>
          {scale.connected ? (
            <Tag icon={<WifiOutlined />} color="success" style={{ marginRight: 0, cursor: 'pointer' }}
              onClick={() => scale.disconnect()}>
              Cân online
            </Tag>
          ) : (
            <Button
              size="small"
              icon={<DisconnectOutlined />}
              onClick={() => scale.connect()}
              danger={!scale.supported}
              title={scale.supported ? 'Bấm để kết nối đầu cân qua USB' : 'Trình duyệt không hỗ trợ Web Serial'}
            >
              {scale.supported ? 'Kết nối cân' : 'Không hỗ trợ'}
            </Button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 768, margin: '0 auto', padding: '16px' }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {/* Messages */}
          {error && (
            <Alert type="error" message={error} showIcon closable onClose={() => setError(null)} />
          )}
          {success && (
            <Alert type="success" message={success} showIcon closable onClose={() => setSuccess(null)} />
          )}

          {/* ===== WEIGHT DISPLAY CARDS ===== */}
          <Row gutter={12}>
            {/* Gross */}
            <Col span={8}>
              <Card
                size="small"
                style={{
                  textAlign: 'center',
                  borderRadius: 12,
                  border: ticket?.status === 'weighing_gross'
                    ? '2px solid #60A5FA'
                    : '1px solid #d9d9d9',
                  boxShadow: ticket?.status === 'weighing_gross' ? '0 0 0 3px rgba(96,165,250,0.15)' : undefined,
                }}
                styles={{ body: { padding: '16px 8px' } }}
              >
                <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Gross (Lan 1)
                </Text>
                <div style={{ ...MONO_FONT, fontSize: 26, fontWeight: 700, color: '#141414', margin: '4px 0' }}>
                  {ticket?.gross_weight != null ? ticket.gross_weight.toLocaleString() : '---'}
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>kg</Text>
              </Card>
            </Col>

            {/* Tare */}
            <Col span={8}>
              <Card
                size="small"
                style={{
                  textAlign: 'center',
                  borderRadius: 12,
                  border: ticket?.status === 'weighing_tare'
                    ? '2px solid #FBBF24'
                    : '1px solid #d9d9d9',
                  boxShadow: ticket?.status === 'weighing_tare' ? '0 0 0 3px rgba(251,191,36,0.15)' : undefined,
                }}
                styles={{ body: { padding: '16px 8px' } }}
              >
                <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Tare (Lan 2)
                </Text>
                <div style={{ ...MONO_FONT, fontSize: 26, fontWeight: 700, color: '#141414', margin: '4px 0' }}>
                  {ticket?.tare_weight != null ? ticket.tare_weight.toLocaleString() : '---'}
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>kg</Text>
              </Card>
            </Col>

            {/* Net */}
            <Col span={8}>
              <Card
                size="small"
                style={{
                  textAlign: 'center',
                  borderRadius: 12,
                  background: ticket?.net_weight != null ? '#F0FDF4' : undefined,
                  border: ticket?.net_weight != null
                    ? '2px solid #4ADE80'
                    : '1px solid #d9d9d9',
                }}
                styles={{ body: { padding: '16px 8px' } }}
              >
                <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
                  NET
                </Text>
                <div style={{
                  ...MONO_FONT, fontSize: 26, fontWeight: 700, margin: '4px 0',
                  color: ticket?.net_weight != null ? '#15803D' : '#141414',
                }}>
                  {ticket?.net_weight != null ? ticket.net_weight.toLocaleString() : '---'}
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>kg</Text>
              </Card>
            </Col>
          </Row>

          {/* ===== DRC-ADJUSTED WEIGHT ===== */}
          {ticket?.net_weight != null && (ticket as any).drc && (
            <Card size="small" style={{ borderRadius: 12, background: '#FFFBEB', borderColor: '#F59E0B' }}>
              <div style={{ textAlign: 'center' }}>
                <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Quy kho (DRC {(ticket as any).drc}%)
                </Text>
                <div style={{ ...MONO_FONT, fontSize: 22, fontWeight: 700, color: '#B45309' }}>
                  {((ticket.net_weight * (ticket as any).drc) / 100).toLocaleString()} kg
                </div>
              </div>
            </Card>
          )}

          {/* ===== LIVE SCALE READING ===== */}
          {scale.connected && scale.liveWeight && canRecordWeight && (
            <Card
              size="small"
              style={{ borderRadius: 12, background: '#111827', textAlign: 'center' }}
              styles={{ body: { padding: 16 } }}
            >
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                Cân đang đọc {scale.liveWeight.stable ? '(ổn định ✓)' : '(chưa ổn định...)'}
              </Text>
              <div style={{ ...MONO_FONT, fontSize: 40, fontWeight: 700, color: '#4ADE80' }}>
                {scale.liveWeight.weight.toLocaleString()}
              </div>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>{scale.liveWeight.unit}</Text>
            </Card>
          )}

          {/* ===== WEIGHT INPUT ===== */}
          {canRecordWeight && (
            <Card style={{ borderRadius: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text strong style={{ fontSize: 15 }}>
                  {ticket?.status === 'weighing_gross' ? '⚖️ Cân lần 1 (Gross)' : '⚖️ Cân lần 2 (Tare)'}
                </Text>
                {scale.connected && (
                  <Button
                    type="primary"
                    icon={<ThunderboltOutlined />}
                    onClick={handleReadScale}
                  >
                    Đọc từ cân
                  </Button>
                )}
              </div>

              {/* Tare suggestion */}
              {ticket?.status === 'weighing_tare' && tareSuggestion && tareSuggestion.count > 0 && (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <Text strong style={{ color: '#1D4ED8' }}>
                          💡 Gợi ý Tare: {tareSuggestion.lastTare?.toLocaleString()} kg
                        </Text>
                        <br />
                        <Text style={{ color: '#60A5FA', fontSize: 12 }}>
                          TB {tareSuggestion.count} lần cân trước: {tareSuggestion.avgTare?.toLocaleString()} kg
                        </Text>
                      </div>
                      <Button
                        type="primary"
                        size="small"
                        onClick={() => tareSuggestion.lastTare && handleUseTareSuggestion(tareSuggestion.lastTare)}
                      >
                        Dùng
                      </Button>
                    </div>
                  }
                />
              )}

              {/* Manual input */}
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  type="number"
                  value={manualWeight}
                  onChange={(e) => {
                    setManualWeight(e.target.value)
                    setWeightSource('manual')
                  }}
                  placeholder="Nhập trọng lượng (kg)"
                  suffix="kg"
                  size="large"
                  style={{ ...MONO_FONT, fontSize: 20, fontWeight: 700, flex: 1 }}
                  inputMode="decimal"
                />
                <Button
                  type="primary"
                  size="large"
                  onClick={handleRecordWeight}
                  loading={loading}
                  disabled={!manualWeight && !scale.liveWeight}
                  icon={<CheckOutlined />}
                  style={{ height: 'auto', background: PRIMARY_COLOR, borderColor: PRIMARY_COLOR, fontWeight: 700, paddingInline: 24 }}
                >
                  Ghi
                </Button>
              </Space.Compact>
            </Card>
          )}

          {/* ===== CAMERA LIVE STREAM + CAPTURE ===== */}
          <Card
            style={{ borderRadius: 12 }}
            styles={{ body: { padding: 0 } }}
          >
            <div
              style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onClick={() => setShowCamera(!showCamera)}
            >
              <Space>
                <CameraOutlined />
                <Text strong>Camera & Ảnh xe ({images.length})</Text>
              </Space>
              {showCamera ? <UpOutlined style={{ color: '#999' }} /> : <DownOutlined style={{ color: '#999' }} />}
            </div>

            {showCamera && (
              <div style={{ padding: '0 16px 16px' }}>
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  {/* Live camera grid */}
                  <CameraGrid
                    capturing={uploading}
                    onSnapshotAll={async (snapshots) => {
                      if (!ticket) return
                      setUploading(true)
                      try {
                        let count = 0
                        for (const snap of snapshots) {
                          const file = new File([snap.blob], `${snap.cameraId}_${Date.now()}.jpg`, { type: 'image/jpeg' })
                          const img = await weighbridgeImageService.uploadImage(
                            ticket.id,
                            file,
                            snap.cameraId as CaptureType
                          )
                          setImages(prev => [...prev, img])
                          count++
                        }
                        setSuccess(`Đã chụp & lưu ${count}/${snapshots.length} ảnh từ camera`)
                      } catch (err: any) {
                        setError(err?.message || 'Lỗi khi lưu ảnh từ camera')
                      } finally {
                        setUploading(false)
                      }
                    }}
                  />

                  {/* Manual upload buttons */}
                  <Divider style={{ margin: '8px 0' }} />
                  <Text type="secondary" style={{ fontSize: 12 }}>📎 Upload thêm ảnh (chọn từ máy / chụp điện thoại)</Text>
                  <Row gutter={[6, 6]}>
                    {(['front', 'rear', 'top', 'plate', 'cargo'] as CaptureType[]).map(type => {
                      const labels: Record<string, string> = { front: 'Trước', rear: 'Sau', top: 'Trên', plate: 'Biển số', cargo: 'Hàng' }
                      return (
                        <Col span={Math.floor(24 / 5)} key={type}>
                          <Button
                            block
                            size="small"
                            icon={<PictureOutlined />}
                            onClick={() => handleUploadImage(type)}
                            disabled={uploading}
                            style={{ fontSize: 11 }}
                          >
                            {labels[type]}
                          </Button>
                        </Col>
                      )
                    })}
                  </Row>

                  {uploading && (
                    <div style={{ textAlign: 'center', padding: '12px 0' }}>
                      <Spin indicator={<LoadingOutlined />} />
                      <Text type="secondary" style={{ marginLeft: 8 }}>Đang upload ảnh...</Text>
                    </div>
                  )}

                  {/* Image gallery */}
                  {images.length > 0 && (
                    <div>
                      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                        Ảnh đã lưu ({images.length})
                      </Text>
                      <Row gutter={[8, 8]}>
                        {images.map(img => (
                          <Col span={8} key={img.id}>
                            <div style={{ position: 'relative' }}>
                              <img
                                src={img.image_url}
                                alt={img.capture_type}
                                style={{
                                  width: '100%', height: 96, objectFit: 'cover',
                                  borderRadius: 8, border: '1px solid #d9d9d9',
                                }}
                                loading="lazy"
                              />
                              <Tag
                                style={{
                                  position: 'absolute', bottom: 4, left: 4,
                                  fontSize: 10, lineHeight: '16px', padding: '0 4px',
                                  background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none',
                                }}
                              >
                                {img.capture_type}
                              </Tag>
                              {!isCompleted && !isCancelled && (
                                <Button
                                  type="primary"
                                  danger
                                  size="small"
                                  icon={<DeleteOutlined />}
                                  shape="circle"
                                  onClick={() => handleDeleteImage(img.id)}
                                  style={{
                                    position: 'absolute', top: 4, right: 4,
                                    width: 24, height: 24, minWidth: 24,
                                  }}
                                />
                              )}
                            </div>
                          </Col>
                        ))}
                      </Row>
                    </div>
                  )}
                </Space>
              </div>
            )}
          </Card>

          {/* ===== ACTION BUTTONS ===== */}
          <div style={{ position: 'sticky', bottom: 0, background: '#f0f0f0', paddingTop: 8, paddingBottom: 24 }}>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              {canComplete && (
                <Button
                  type="primary"
                  block
                  size="large"
                  onClick={handleComplete}
                  loading={loading}
                  icon={<CheckOutlined />}
                  style={{ height: 56, fontWeight: 700, fontSize: 16, background: '#16A34A', borderColor: '#16A34A' }}
                >
                  Hoàn tất & In phiếu
                </Button>
              )}

              {isCompleted && (
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <Card style={{ borderRadius: 12, background: '#DCFCE7', borderColor: '#86EFAC', textAlign: 'center' }}>
                    <CheckOutlined style={{ fontSize: 32, color: '#16A34A', display: 'block', marginBottom: 8 }} />
                    <Text strong style={{ fontSize: 18, color: '#166534', display: 'block' }}>Phiếu cân hoàn tất</Text>
                    <div style={{ ...MONO_FONT, fontSize: 24, fontWeight: 700, color: '#15803D', marginTop: 4 }}>
                      NET: {ticket?.net_weight?.toLocaleString()} kg
                    </div>
                    {(ticket as any)?.drc && ticket?.net_weight && (
                      <div style={{ ...MONO_FONT, fontSize: 16, color: '#B45309', marginTop: 4 }}>
                        Quy kho: {((ticket.net_weight * (ticket as any).drc) / 100).toLocaleString()} kg (DRC {(ticket as any).drc}%)
                      </div>
                    )}
                  </Card>
                  <Row gutter={8}>
                    <Col span={12}>
                      <Button
                        block
                        size="large"
                        icon={<EyeOutlined />}
                        onClick={() => navigate(`/wms/weighbridge/${ticket?.id}`)}
                      >
                        Xem chi tiết
                      </Button>
                    </Col>
                    <Col span={12}>
                      <Button
                        block
                        size="large"
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={resetForm}
                        style={{ background: PRIMARY_COLOR, borderColor: PRIMARY_COLOR }}
                      >
                        Cân xe tiếp
                      </Button>
                    </Col>
                  </Row>
                </Space>
              )}

              {isCancelled && (
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <Card style={{ borderRadius: 12, background: '#FEF2F2', borderColor: '#FECACA', textAlign: 'center' }}>
                    <CloseOutlined style={{ fontSize: 32, color: '#EF4444', display: 'block', marginBottom: 8 }} />
                    <Text strong style={{ color: '#B91C1C' }}>Phiếu cân da huy</Text>
                  </Card>
                  <Button
                    type="primary"
                    block
                    size="large"
                    icon={<PlusOutlined />}
                    onClick={resetForm}
                    style={{ background: PRIMARY_COLOR, borderColor: PRIMARY_COLOR }}
                  >
                    Tạo phiếu moi
                  </Button>
                </Space>
              )}

              {canRecordWeight && (
                <Button
                  block
                  size="large"
                  danger
                  icon={<CloseOutlined />}
                  onClick={handleCancel}
                  disabled={loading}
                >
                  Hủy phiếu
                </Button>
              )}
            </Space>
          </div>
        </Space>
      </div>
    </div>
  )
}
