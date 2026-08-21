// ============================================================================
// MÀN CÂN MỦ LẺ — 1 trang, không wizard
// File: apps/retail-scale/src/pages/WeighPage.tsx
//
// Mục tiêu: ≤ 60 giây/khách. Thao tác viên đứng tại bàn cân, thao tác chủ yếu bằng
// nút to + bàn phím số. Thứ tự trên màn hình = đúng thứ tự việc làm ngoài thực địa:
//   Khách → Loại mủ + giá → Cân từng bao → Xem tổng tiền → Lưu & In.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert, AutoComplete, Button, Card, Col, Input, InputNumber, Modal, Row, Segmented,
  Space, Table, Tag, Typography, message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowLeftOutlined, DeleteOutlined, PlusOutlined, SaveOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '@/stores/authStore'
import { useCurrentFacility } from '@/stores/facilityStore'
import { useScale } from '@/scale/ScaleProvider'
import { useStableWeight } from '@/hooks/useStableWeight'
import {
  CONTAINER_TYPES, RETAIL_RUBBER_TYPES, computeAmount, fmtKg, fmtVnd, priceUnitFor,
  readVietnameseNumber, rubberLabel,
} from '@/lib/retail'
import { createRetailTicket, type RetailLot } from '@/services/retailTicketService'
import { rememberPrice, suggestPrice, type PriceSuggestion } from '@/services/retailPriceService'
import {
  filterRecentCustomers, loadRecentCustomers, searchPartners,
  type PartnerOption, type RecentCustomer,
} from '@/services/retailCustomerService'

const { Text, Title } = Typography
const PRIMARY = '#1B4D3E'
const MONO: React.CSSProperties = { fontFamily: "Consolas, 'Courier New', monospace" }

/** Bì mặc định mỗi bao — nhớ theo máy trạm, vì mỗi điểm cân dùng loại bao khác nhau. */
const DEFAULT_TARE_KEY = 'rs_default_tare'

function readDefaultTare(): number {
  const n = Number(localStorage.getItem(DEFAULT_TARE_KEY))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export default function WeighPage() {
  const navigate = useNavigate()
  const operator = useAuthStore(s => s.operator)
  const { facility, loading: facilityLoading, error: facilityError } = useCurrentFacility()
  const scale = useScale()
  const stable = useStableWeight(scale.liveWeight)

  // ─── Khách ───
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [partnerId, setPartnerId] = useState<string | null>(null)
  const [partnerName, setPartnerName] = useState<string>('')
  const [recentAll, setRecentAll] = useState<RecentCustomer[]>([])
  const [partnerHits, setPartnerHits] = useState<PartnerOption[]>([])

  // ─── Hàng + giá ───
  const [rubberType, setRubberType] = useState<string>('mu_tap')
  const [unitPrice, setUnitPrice] = useState<number | null>(null)
  const [priceHint, setPriceHint] = useState<PriceSuggestion | null>(null)
  const [drc, setDrc] = useState<number | null>(null)

  // ─── Cân ───
  const [lots, setLots] = useState<RetailLot[]>([])
  const [defaultTare, setDefaultTare] = useState<number>(readDefaultTare)
  const [containerType, setContainerType] = useState<string>('Bao')
  const [manualGross, setManualGross] = useState<number | null>(null)

  const [vehiclePlate, setVehiclePlate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  /** Mã phiếu đã tạo trên DB nhưng KHÔNG huỷ được — khoá màn hình, cấm lưu lại. */
  const [lockedTicketCode, setLockedTicketCode] = useState<string | null>(null)

  const priceUnit = priceUnitFor(rubberType)

  // Gợi ý giá mỗi khi đổi loại mủ (giá ngày → giá gõ lần trước → để trống).
  useEffect(() => {
    let alive = true
    suggestPrice(rubberType).then(s => {
      if (!alive) return
      setPriceHint(s)
      // Chỉ tự điền khi thao tác viên CHƯA gõ giá — không đè lên số họ vừa nhập.
      setUnitPrice(prev => (prev == null ? (s?.price ?? null) : prev))
    })
    return () => { alive = false }
  }, [rubberType])

  // Gợi ý khách: (a) khách ĐÃ TỪNG bán mủ lẻ ở đây, (b) đối tác có sẵn trong danh bạ ERP.
  // Chọn (b) sẽ gắn partner_id ⇒ chứng từ chi của kế toán tự có số tài khoản ngân hàng.
  //
  // (a) nạp MỘT LẦN theo nhà máy rồi lọc tại chỗ — không phải mỗi ký tự một request.
  useEffect(() => {
    let alive = true
    loadRecentCustomers(facility?.id ?? null)
      .then(r => { if (alive) setRecentAll(r) })
      .catch(() => { if (alive) setRecentAll([]) })
    return () => { alive = false }
  }, [facility?.id])

  const recent = useMemo(
    () => filterRecentCustomers(recentAll, customerName, 8),
    [recentAll, customerName],
  )

  useEffect(() => {
    const kw = customerName.trim()
    if (kw.length < 2) {
      setPartnerHits([])
      return
    }
    let alive = true
    const t = setTimeout(() => {
      searchPartners(kw, 6)
        .then(r => { if (alive) setPartnerHits(r) })
        .catch(() => { if (alive) setPartnerHits([]) })
    }, 300)   // gõ tới đâu tra tới đó thì mỗi ký tự là 1 request — chờ 300ms cho đỡ
    return () => { alive = false; clearTimeout(t) }
  }, [customerName])

  // ─── Tổng ───
  const netTotal = useMemo(
    () => Math.round(lots.reduce((s, l) => s + l.net_kg, 0) * 100) / 100,
    [lots],
  )
  const grossTotal = useMemo(
    () => Math.round(lots.reduce((s, l) => s + l.gross_kg, 0) * 100) / 100,
    [lots],
  )
  const tareTotal = Math.round((grossTotal - netTotal) * 100) / 100

  const money = useMemo(
    () => computeAmount({ netKg: netTotal, rubberType, unitPrice: unitPrice || 0, drc }),
    [netTotal, rubberType, unitPrice, drc],
  )

  // ─── Thêm bao ───
  /** @returns true nếu ĐÃ thêm bao. Caller dùng để biết có nên xoá ô nhập / hạ cờ về-0 không. */
  function addLot(grossKg: number): boolean {
    if (!(grossKg > 0)) {
      message.warning('Số cân phải lớn hơn 0')
      return false
    }
    // Kiểm bằng CHÍNH defaultTare (không kẹp trước rồi mới báo) — nếu kẹp trước, câu cảnh báo
    // in ra hai con số bằng nhau và giấu mất giá trị bì đang gõ sai.
    if (defaultTare >= grossKg) {
      message.warning(
        `Bì mặc định ${fmtKg(defaultTare)} kg ≥ số cân ${fmtKg(grossKg)} kg — sửa ô "Bì mặc định/bao (kg)" ở mục 2`,
      )
      return false
    }
    const tare = defaultTare
    const net = Math.round((grossKg - tare) * 100) / 100
    // Cảnh báo MỀM (không chặn): bì ăn quá nửa số cân gần như chắc chắn là gõ nhầm ô bì —
    // trường hợp này im lặng thì mất tiền thật của khách mà không ai biết.
    if (tare > grossKg * 0.5) {
      message.warning(`Bì ${fmtKg(tare)} kg chiếm hơn nửa số cân ${fmtKg(grossKg)} kg — kiểm tra lại ô bì`)
    }
    setLots(prev => [
      ...prev,
      { gross_kg: grossKg, tare_kg: tare, net_kg: net, container_type: containerType, container_count: 1, note: null },
    ])
    return true
  }

  // Cân đã về ~0 kể từ lần lấy số gần nhất chưa. Nếu CHƯA mà thao tác viên bấm tiếp, nhiều
  // khả năng họ đang CHỒNG thêm bao lên cân → số cân là tổng dồn, lấy vào là tính tiền gấp đôi.
  const zeroSeenRef = useRef(true)
  useEffect(() => {
    if (stable.value < 0.5) zeroSeenRef.current = true
  }, [stable.value])

  function takeFromScale() {
    if (!stable.stable) {
      message.warning('Số chưa đứng — chờ đèn xanh rồi bấm')
      return
    }
    const w = Math.round(stable.value * 100) / 100
    if (!zeroSeenRef.current && lots.length > 0) {
      Modal.confirm({
        title: 'Cân chưa về 0 kể từ bao trước',
        content: (
          <div>
            Số hiện tại <b>{fmtKg(w)} kg</b>. Nếu bao trước vẫn còn trên cân thì đây là
            <b> tổng dồn</b>, lấy vào sẽ tính tiền thừa.
            <br />Nhấc bao trước xuống rồi cân lại, hoặc xác nhận nếu đúng là bao mới.
          </div>
        ),
        okText: 'Vẫn lấy số này',
        okButtonProps: { danger: true },
        cancelText: 'Để tôi cân lại',
        // Chỉ hạ cờ khi bao được thêm THẬT — addLot có thể từ chối (bì ≥ số cân). Hạ cờ
        // trước là lần bấm sau bị hỏi "cân chưa về 0" oan dù chưa thêm bao nào.
        onOk: () => { if (addLot(w)) zeroSeenRef.current = false },
      })
      return
    }
    if (addLot(w)) zeroSeenRef.current = false
  }

  function updateLot(index: number, patch: Partial<RetailLot>) {
    setLots(prev =>
      prev.map((l, i) => {
        if (i !== index) return l
        const next = { ...l, ...patch }
        next.net_kg = Math.round(((next.gross_kg || 0) - (next.tare_kg || 0)) * 100) / 100
        return next
      }),
    )
  }

  function removeLot(index: number) {
    setLots(prev => prev.filter((_, i) => i !== index))
  }

  // Đang cân dở mà đóng tab / F5 → mất sạch. Chặn bằng cảnh báo của trình duyệt.
  // ⚠ beforeunload KHÔNG bắn khi React Router đổi route trong cùng document — nút
  // "Về danh sách" phải tự hỏi lại (goHome bên dưới).
  useEffect(() => {
    if (!lots.length) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [lots.length])

  function goHome() {
    if (!lots.length) return navigate('/')
    Modal.confirm({
      title: `Bỏ ${lots.length} bao đang cân?`,
      content: `Tổng ${fmtKg(netTotal)} kg chưa lưu sẽ mất, không khôi phục được.`,
      okText: 'Bỏ và thoát',
      okButtonProps: { danger: true },
      cancelText: 'Ở lại',
      onOk: () => navigate('/'),
    })
  }

  // ─── Lưu ───
  const savingRef = useRef(false)

  function confirmAndSave() {
    if (savingRef.current) return
    // Không có nhà máy thì phiếu sẽ không bao giờ gom được vào Đề nghị thanh toán → chặn
    // TRƯỚC khi in phiếu cho khách, đừng để tạo ra tờ phiếu chết.
    if (!facility) {
      return message.error(
        'Chưa xác định được nhà máy — không lưu được phiếu. Kiểm tra mạng, hoặc báo kỹ thuật ' +
        'kiểm tra biến VITE_FACILITY_CODE của máy này.',
      )
    }
    if (!customerName.trim()) return message.warning('Chưa nhập tên khách')
    if (!lots.length) return message.warning('Chưa cân bao nào')
    const bad = lots.findIndex(l => !(l.net_kg > 0))
    if (bad >= 0) {
      const l = lots[bad]
      return message.warning(
        `Bao ${bad + 1}: bì ${fmtKg(l.tare_kg)} kg ≥ cân ${fmtKg(l.gross_kg)} kg ` +
        `(thực ${fmtKg(l.net_kg)} kg) — sửa lại trước khi lưu`,
      )
    }
    if (!(unitPrice && unitPrice > 0)) return message.warning('Chưa nhập đơn giá')
    if (priceUnit === 'dry' && !(drc && drc > 0)) {
      return message.warning('Mủ nước tính theo kg khô — phải nhập DRC %')
    }

    // Chốt lại loại mủ + số tiền trước bước KHÔNG THỂ HOÀN TÁC (in phiếu, trả tiền).
    // Chọn nhầm loại mủ là lỗi đắt nhất ở trạm cân — app cân xe đã phải sửa bằng SQL.
    Modal.confirm({
      title: 'Xác nhận phiếu mủ lẻ',
      width: 460,
      content: (
        <div style={{ fontSize: 15, lineHeight: 1.9 }}>
          <div>Khách: <b>{customerName.trim()}</b></div>
          <div>Loại mủ: <b>{rubberLabel(rubberType)}</b></div>
          <div>Số bao: <b>{lots.length}</b> · Tổng: <b>{fmtKg(netTotal)} kg</b></div>
          <div>Đơn giá: <b>{fmtVnd(unitPrice || 0)}/kg {priceUnit === 'dry' ? 'khô' : 'tươi'}</b></div>
          {priceUnit === 'dry' && <div>DRC: <b>{money.drc}%</b> → KL khô <b>{fmtKg(money.billableKg)} kg</b></div>}
          <div style={{ marginTop: 8, fontSize: 20, color: PRIMARY }}>
            Thành tiền: <b>{fmtVnd(money.rounded)}</b>
          </div>
          <div style={{ fontSize: 12, color: '#888' }}>{readVietnameseNumber(money.rounded)}</div>
        </div>
      ),
      okText: 'Lưu & In phiếu',
      cancelText: 'Xem lại',
      okButtonProps: { style: { background: PRIMARY, borderColor: PRIMARY } },
      onOk: doSave,
    })
  }

  async function doSave() {
    // Chốt cứng chống bấm 2 lần: `saving` là state (cập nhật bất đồng bộ), ref thì tức thì.
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      const ticket = await createRetailTicket({
        facility_id: facility?.id ?? null,
        facility_code: facility?.code ?? null,
        customer_name: customerName,
        customer_phone: customerPhone || null,
        partner_id: partnerId,
        vehicle_plate: vehiclePlate || null,
        rubber_type: rubberType,
        unit_price: unitPrice || 0,
        drc_percent: drc,
        lots,
        notes: notes || null,
        operator_id: operator?.id ?? null,
      })
      rememberPrice(rubberType, unitPrice || 0)
      try { localStorage.setItem(DEFAULT_TARE_KEY, String(defaultTare)) } catch { /* ignore */ }
      message.success(`Đã lưu ${ticket.code}`)
      // Xoá dòng cân trước khi điều hướng → cảnh báo beforeunload không bật nhầm sau khi
      // phiếu ĐÃ lưu thành công.
      setLots([])
      navigate(`/print/${ticket.id}?auto=1`, { replace: true })
    } catch (e) {
      const err = e as Error & { fatalTicketCode?: string }
      message.error(err.message || 'Lưu phiếu thất bại', 8)
      if (err.fatalTicketCode) {
        // Phiếu ĐÃ nằm trên DB mà app không gỡ được → TUYỆT ĐỐI không cho bấm lại,
        // bấm lại là phiếu thứ hai và kế toán chi 2 lần. Giữ savingRef = true.
        setLockedTicketCode(err.fatalTicketCode)
      } else {
        // Các lỗi còn lại (validate, mạng lúc insert, phiếu đã rollback sạch) → cho bấm lại,
        // dữ liệu đang cân vẫn còn nguyên trên màn hình.
        savingRef.current = false
      }
    } finally {
      setSaving(false)
    }
  }

  const columns: ColumnsType<RetailLot> = [
    {
      title: '#', key: 'i', width: 48,
      render: (_v, _r, i) => <Text strong>{i + 1}</Text>,
    },
    {
      title: 'Cân (kg)', dataIndex: 'gross_kg', width: 130,
      render: (v: number, _r, i) => (
        <InputNumber
          value={v}
          min={0}
          step={0.5}
          style={{ width: '100%', ...MONO }}
          onChange={val => updateLot(i, { gross_kg: Number(val) || 0 })}
        />
      ),
    },
    {
      title: 'Bì (kg)', dataIndex: 'tare_kg', width: 120,
      render: (v: number, _r, i) => (
        <InputNumber
          value={v}
          min={0}
          step={0.1}
          style={{ width: '100%', ...MONO }}
          onChange={val => updateLot(i, { tare_kg: Number(val) || 0 })}
        />
      ),
    },
    {
      title: 'Thực (kg)', dataIndex: 'net_kg', width: 110, align: 'right',
      render: (v: number) => (
        <Text strong style={{ ...MONO, fontSize: 17, color: v > 0 ? '#15803D' : '#DC2626' }}>
          {fmtKg(v)}
        </Text>
      ),
    },
    {
      title: 'Loại bì', dataIndex: 'container_type', width: 110,
      render: (v: string | null | undefined, _r, i) => (
        <Input
          value={v ?? ''}
          onChange={e => updateLot(i, { container_type: e.target.value })}
          placeholder="Bao"
        />
      ),
    },
    {
      title: '', key: 'x', width: 52, align: 'center',
      render: (_v, _r, i) => (
        <Button danger type="text" icon={<DeleteOutlined />} onClick={() => removeLot(i)} />
      ),
    },
  ]

  const scaleBadge = !scale.connected
    ? { text: '○ Chưa nối đầu cân', color: '#DC2626' }
    : stable.stable
      ? { text: '● Đã đứng số', color: '#15803D' }
      : { text: '◌ Đang dao động', color: '#CA8A04' }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', paddingBottom: 32 }}>
      {/* Header */}
      <div style={{ background: PRIMARY, padding: '10px 20px', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={goHome} style={{ color: '#fff' }}>
            Về danh sách
          </Button>
          <Title level={4} style={{ color: '#fff', margin: 0, flex: 1, textAlign: 'center' }}>
            🧺 CÂN MỦ LẺ {facility ? `— ${facility.name}` : ''}
          </Title>
          <Tag color={scale.connected ? 'green' : 'red'} style={{ margin: 0 }}>
            {scale.connected ? 'Cân OK' : 'Chưa nối'}
          </Tag>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: 16 }}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {/* Không có nhà máy = KHÔNG lưu được phiếu (phiếu sẽ không gom được vào Đề nghị
              thanh toán). Báo đỏ + chặn nút Lưu, đừng để thao tác viên cân cả buổi rồi mới biết.
              Lúc mới mở trang facility LUÔN null vì hook nạp async → giai đoạn đó chỉ báo
              "đang tải", đừng doạ đỏ oan. */}
          {!facility && (
            facilityLoading
              ? <Alert type="info" showIcon message="Đang tải thông tin nhà máy..." />
              : (
                <Alert
                  type="error"
                  showIcon
                  message="Chưa xác định được nhà máy — KHÔNG lưu được phiếu"
                  description={facilityError || 'Kiểm tra mạng, hoặc báo kỹ thuật kiểm tra biến VITE_FACILITY_CODE của máy này.'}
                />
              )
          )}

          {/* Phiếu đã tạo trên DB nhưng app không huỷ được (mất mạng giữa chừng). Bấm Lưu
              lại là sinh phiếu thứ hai ⇒ kế toán chi 2 lần. Khoá cứng cho tới khi tải lại trang. */}
          {lockedTicketCode && (
            <Alert
              type="error"
              showIcon
              message={`Phiếu ${lockedTicketCode} đã tạo trên hệ thống nhưng chưa huỷ được`}
              description="ĐỪNG bấm Lưu lại — sẽ thành 2 phiếu và bị chi tiền 2 lần. Báo kế toán loại phiếu này khỏi Đề nghị thanh toán, rồi tải lại trang (F5) để cân tiếp."
            />
          )}

          {/* 1. KHÁCH */}
          <Card size="small" title="1 · Khách bán mủ" style={{ borderRadius: 12 }}>
            <Row gutter={12}>
              <Col xs={24} md={10}>
                <Text type="secondary" style={{ fontSize: 12 }}>Tên khách (bắt buộc)</Text>
                <AutoComplete
                  value={customerName}
                  onChange={v => { setCustomerName(v); setPartnerId(null); setPartnerName('') }}
                  onSelect={(_v, opt) => {
                    const o = opt as { recent?: RecentCustomer; partner?: PartnerOption }
                    if (o.recent) {
                      setCustomerName(o.recent.name)
                      setCustomerPhone(o.recent.phone || '')
                      setPartnerId(o.recent.partner_id)
                      setPartnerName('')
                    } else if (o.partner) {
                      setCustomerName(o.partner.name)
                      setCustomerPhone(o.partner.phone || '')
                      setPartnerId(o.partner.id)
                      setPartnerName(`${o.partner.name} (${o.partner.code})`)
                    }
                  }}
                  options={[
                    ...(recent.length
                      ? [{
                          label: 'Khách đã bán ở đây',
                          options: recent.map(c => ({
                            value: c.name,
                            label: `${c.name}${c.phone ? ` · ${c.phone}` : ''} · đã bán ${c.times} lần`,
                            recent: c,
                          })),
                        }]
                      : []),
                    ...(partnerHits.length
                      ? [{
                          label: 'Danh bạ đối tác (ERP)',
                          options: partnerHits.map(p => ({
                            value: `${p.name} `,   // thêm space để không trùng key với nhóm trên
                            label: `${p.name} · ${p.code}${p.phone ? ` · ${p.phone}` : ''}`,
                            partner: p,
                          })),
                        }]
                      : []),
                  ]}
                  style={{ width: '100%' }}
                  size="large"
                  placeholder="Gõ tên khách — gợi ý khách quen & danh bạ đối tác"
                />
              </Col>
              <Col xs={12} md={5}>
                <Text type="secondary" style={{ fontSize: 12 }}>SĐT (nếu có)</Text>
                <Input
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  size="large"
                  placeholder="09xx..."
                />
              </Col>
              <Col xs={12} md={5}>
                <Text type="secondary" style={{ fontSize: 12 }}>Biển số / phương tiện</Text>
                <Input
                  value={vehiclePlate}
                  onChange={e => setVehiclePlate(e.target.value)}
                  size="large"
                  /* Cột vehicle_plate là varchar(20) — chặn tại ô nhập, đừng để DB ném 22001. */
                  maxLength={20}
                  placeholder="Bỏ trống = XE MÁY"
                />
              </Col>
              <Col xs={24} md={4}>
                <Text type="secondary" style={{ fontSize: 12 }}>Ghi chú</Text>
                <Input value={notes} onChange={e => setNotes(e.target.value)} size="large" />
              </Col>
            </Row>
            {partnerId && (
              <Tag color="blue" closable onClose={() => { setPartnerId(null); setPartnerName('') }} style={{ marginTop: 8 }}>
                Đã gắn đối tác{partnerName ? `: ${partnerName}` : ''} — chứng từ chi tự lấy số tài khoản
              </Tag>
            )}
          </Card>

          {/* 2. LOẠI MỦ + GIÁ */}
          <Card size="small" title="2 · Loại mủ & đơn giá" style={{ borderRadius: 12 }}>
            <Row gutter={12} align="bottom">
              <Col xs={24} md={11}>
                <Segmented
                  block
                  size="large"
                  value={rubberType}
                  // Đổi loại mủ PHẢI xoá cả giá lẫn gợi ý giá của loại cũ. Effect gợi ý chỉ
                  // điền khi giá đang trống, nên giữ lại giá cũ là in sai tiền cho khách;
                  // giữ lại priceHint thì nút "dùng" lại điền đúng con số sai đó.
                  onChange={v => {
                    setRubberType(String(v))
                    setDrc(null)
                    setUnitPrice(null)
                    setPriceHint(null)
                  }}
                  options={RETAIL_RUBBER_TYPES.map(r => ({ label: `${r.icon} ${r.label}`, value: r.value }))}
                />
              </Col>
              <Col xs={12} md={6}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Đơn giá (₫/kg {priceUnit === 'dry' ? 'khô' : 'tươi'})
                </Text>
                <InputNumber<number>
                  value={unitPrice ?? undefined}
                  onChange={v => setUnitPrice(v ?? null)}
                  min={0}
                  step={500}
                  size="large"
                  style={{ width: '100%', ...MONO }}
                  formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                  parser={v => Number(String(v).replace(/\D/g, '')) || 0}
                />
                {priceHint && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {priceHint.label}: {fmtVnd(priceHint.price)}
                    {unitPrice !== priceHint.price && (
                      <Button
                        type="link" size="small" style={{ padding: '0 4px' }}
                        onClick={() => setUnitPrice(priceHint.price)}
                      >
                        dùng
                      </Button>
                    )}
                  </Text>
                )}
              </Col>
              {priceUnit === 'dry' && (
                <Col xs={12} md={4}>
                  <Text type="secondary" style={{ fontSize: 12 }}>DRC (%)</Text>
                  <InputNumber
                    value={drc ?? undefined}
                    onChange={v => setDrc(v ?? null)}
                    min={0}
                    max={100}
                    step={0.5}
                    /* qc_actual_drc là numeric(5,2) — chặn ngay tại ô nhập để số hiển thị,
                       số tính tiền và số lưu DB luôn là một. */
                    precision={2}
                    size="large"
                    style={{ width: '100%', ...MONO }}
                  />
                </Col>
              )}
              <Col xs={24} md={3}>
                <Text type="secondary" style={{ fontSize: 12 }}>Bì mặc định/bao (kg)</Text>
                <InputNumber
                  value={defaultTare}
                  onChange={v => setDefaultTare(Number(v) || 0)}
                  min={0}
                  step={0.1}
                  size="large"
                  style={{ width: '100%', ...MONO }}
                />
              </Col>
            </Row>
            {priceUnit === 'wet' && (
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                {rubberLabel(rubberType)} tính theo <b>kg tươi</b> — không nhân DRC (đúng như
                cách kế toán tính ở Đề nghị thanh toán).
              </Text>
            )}
          </Card>

          {/* 3. CÂN */}
          <Card size="small" title="3 · Cân từng bao" style={{ borderRadius: 12 }}>
            <Row gutter={16}>
              <Col xs={24} md={9}>
                <div
                  style={{
                    background: '#0D2B1F', borderRadius: 12, padding: '18px 16px', textAlign: 'center',
                  }}
                >
                  <div style={{ color: scaleBadge.color, fontSize: 13, fontWeight: 600 }}>
                    {scaleBadge.text}
                  </div>
                  <div style={{ ...MONO, color: '#fff', fontSize: 60, lineHeight: 1.1, fontWeight: 700 }}>
                    {scale.connected ? fmtKg(stable.value) : '—'}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>kg</div>
                  {/* Thanh tiến trình "đứng số" — cho thao tác viên biết còn phải chờ bao lâu */}
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2, marginTop: 10 }}>
                    <div
                      style={{
                        height: 4, borderRadius: 2, background: stable.stable ? '#22C55E' : '#CA8A04',
                        width: `${Math.min(100, (stable.heldMs / 800) * 100)}%`, transition: 'width .15s',
                      }}
                    />
                  </div>
                  <Button
                    type="primary" size="large" block icon={<ThunderboltOutlined />}
                    onClick={takeFromScale}
                    disabled={!scale.connected || !stable.stable}
                    style={{ marginTop: 12, height: 52, fontSize: 18, background: '#22C55E', borderColor: '#22C55E' }}
                  >
                    LẤY SỐ → THÊM BAO
                  </Button>
                  {!scale.connected && (
                    <Button
                      type="link" style={{ color: '#FFD54F' }}
                      onClick={() => scale.connect()}
                    >
                      Kết nối cổng COM
                    </Button>
                  )}
                </div>

                <Space.Compact style={{ width: '100%', marginTop: 10 }}>
                  <InputNumber<number>
                    value={manualGross ?? undefined}
                    onChange={v => setManualGross(v ?? null)}
                    min={0}
                    step={0.5}
                    placeholder="Nhập tay (kg)"
                    style={{ width: '100%', ...MONO }}
                  />
                  <Button
                    icon={<PlusOutlined />}
                    onClick={() => {
                      // Chỉ xoá ô khi bao được thêm — từ chối mà vẫn xoá là thao tác viên
                      // phải gõ lại con số giữa lúc đang vội.
                      if (manualGross && manualGross > 0 && addLot(Math.round(manualGross * 100) / 100)) {
                        setManualGross(null)
                      }
                    }}
                  >
                    Thêm
                  </Button>
                </Space.Compact>

                <div style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12, marginRight: 6 }}>Loại bì:</Text>
                  {CONTAINER_TYPES.map(c => (
                    <Tag
                      key={c}
                      color={containerType === c ? PRIMARY : undefined}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setContainerType(c)}
                    >
                      {c}
                    </Tag>
                  ))}
                </div>
              </Col>

              <Col xs={24} md={15}>
                <Table
                  columns={columns}
                  dataSource={lots}
                  rowKey={(_r, i) => String(i)}
                  size="small"
                  pagination={false}
                  scroll={{ y: 300 }}
                  locale={{ emptyText: 'Chưa có bao nào — đặt hàng lên cân rồi bấm LẤY SỐ' }}
                  summary={() => (
                    <Table.Summary fixed>
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={1}><b>Tổng</b></Table.Summary.Cell>
                        <Table.Summary.Cell index={1}>
                          <Text style={MONO}>{fmtKg(grossTotal)}</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={2}>
                          <Text style={MONO}>{fmtKg(tareTotal)}</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={3} align="right">
                          <Text strong style={{ ...MONO, fontSize: 19, color: '#15803D' }}>
                            {fmtKg(netTotal)}
                          </Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={4} colSpan={2}>
                          <Text type="secondary">{lots.length} bao</Text>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    </Table.Summary>
                  )}
                />
              </Col>
            </Row>
          </Card>

          {/* 4. TIỀN + LƯU */}
          <Card
            size="small"
            style={{ borderRadius: 12, borderColor: PRIMARY, borderWidth: 2 }}
          >
            <Row gutter={16} align="middle">
              <Col xs={24} md={16}>
                <Space direction="vertical" size={2}>
                  <Text type="secondary">
                    {fmtKg(netTotal)} kg
                    {/* Mủ nước LUÔN tính theo kg khô — chưa nhập DRC thì phải nói vậy, đừng
                        ghi "tươi" trong khi số tiền bên dưới đang là 0 ₫. */}
                    {priceUnit === 'dry'
                      ? (money.drc ? ` × ${money.drc}% = ${fmtKg(money.billableKg)} kg khô` : ' — chưa nhập DRC')
                      : ' tươi'}
                    {' × '}{fmtVnd(unitPrice || 0)}/kg
                  </Text>
                  <Title level={2} style={{ margin: 0, color: PRIMARY }}>
                    {fmtVnd(money.rounded)}
                  </Title>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {readVietnameseNumber(money.rounded)}
                    {money.exact !== money.rounded && ` · (chính xác ${fmtVnd(money.exact)}, đã làm tròn nghìn)`}
                  </Text>
                </Space>
              </Col>
              <Col xs={24} md={8}>
                <Button
                  type="primary" size="large" block icon={<SaveOutlined />}
                  loading={saving}
                  onClick={confirmAndSave}
                  disabled={
                    !!lockedTicketCode ||
                    !facility ||
                    !lots.length ||
                    !customerName.trim() ||
                    !(unitPrice && unitPrice > 0) ||
                    lots.some(l => !(l.net_kg > 0))
                  }
                  style={{ height: 60, fontSize: 19, background: PRIMARY, borderColor: PRIMARY }}
                >
                  LƯU & IN PHIẾU
                </Button>
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 6, textAlign: 'center' }}>
                  Tiền do kế toán chi qua Đề nghị thanh toán trên ERP
                </Text>
              </Col>
            </Row>
          </Card>
        </Space>
      </div>
    </div>
  )
}
