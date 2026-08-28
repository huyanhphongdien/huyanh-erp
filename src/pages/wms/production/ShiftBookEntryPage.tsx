// ============================================================================
// GHI SỔ CA ÉP BÀNH — màn hình nhập
// File: src/pages/wms/production/ShiftBookEntryPage.tsx
// Route: /wms/production/shift-book/new  ·  /wms/production/shift-book/:id
// Số hoá biểu mẫu giấy CL.BMQT.SX.04.06 "BÁO CÁO SẢN XUẤT NHẬP KHO HÀNG NGÀY"
//
// MÀN HÌNH NÀY ĐƯỢC THIẾT KẾ QUANH MỘT SỐ ĐO ĐƯỢC:
//   Tờ giấy có 24 dòng × 6 ô = 144 ô. Ca 27/8/2026 chỉ có BA con số thật: 118 · 10 · 432.
//   Người ghi hiện mất 10–15 phút cộng trừ tay cột TỒN, cuối ca, lúc 17h55, đứng.
//   Vậy màn hình chỉ được đòi hỏi ba con số đó. Mọi thứ còn lại phải tự hiện ra:
//     · kg  = số bành × cỡ bành của CHÍNH mã đó  (không phải 33,33 cho tất cả)
//     · tồn đầu = tồn cuối của các ca trước đã được thủ kho nhận
//     · tồn cuối = tồn đầu + nhập − xuất
//   Dòng chưa gõ gì thì mờ đi và không lưu. Dòng vừa gõ thì sáng lên.
//   Enter nhảy xuống đúng ô cùng cột của dòng dưới — người ghi không rời bàn phím.
//
// ⚠ Ô kg KHÔNG cho gõ, trừ mã CHÈN (biểu mẫu chưa bao giờ ghi cỡ bành cho nó).
//   Mở ô kg ra cho mọi dòng là tạo nguồn sự thật thứ hai cho một con số máy đã tính đúng,
//   và từ đó sổ kho với phiếu khoán sẽ lệch nhau mà không ai biết vì sao.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Card, Table, Button, Space, Typography, Row, Col, Select, DatePicker,
  Input, InputNumber, Tag, Spin, Alert, Switch, Tooltip, Modal, message,
} from 'antd'
import {
  ArrowLeftOutlined, SaveOutlined, SendOutlined, CheckCircleOutlined,
  InboxOutlined, WarningOutlined, StopOutlined,
} from '@ant-design/icons'
import dayjs, { Dayjs } from 'dayjs'
import {
  shiftBookService, computeTotals, kgCuaDong,
  SHIFT_STATUS_LABEL, SHIFT_STATUS_COLOR, MA_HANG_KHONG_DAT,
  type ShiftMaterial, type ShiftBook, type ShiftLine, type ShiftLineInput,
} from '../../../services/wms/shiftBookService'
import { facilityService, type Facility } from '../../../services/wms/facilityService'
import { useAuthStore } from '../../../stores/authStore'

const { Title, Text } = Typography

/** Ca trên biểu mẫu giấy: 1 = ngày, 2 = đêm. Giờ mặc định lấy theo thực tế nhà máy. */
const CA = [
  { value: '1', label: 'Ca 1 — ngày', from: '06:00', to: '18:00' },
  { value: '2', label: 'Ca 2 — đêm', from: '18:00', to: '06:00' },
]

/** Tổ ghi bằng TÊN MÀU trên sổ thật ('Vàng', 'Đen'...) chứ không phải số. */
const TO_GOI_Y = ['Vàng', 'Đen', 'Xanh', 'Đỏ']

interface OWork {
  nhapBanh: number
  xuatBanh: number
  nhapKgManual: number | null
  xuatKgManual: number | null
  note: string | null
}

const O_RONG: OWork = { nhapBanh: 0, xuatBanh: 0, nhapKgManual: null, xuatKgManual: null, note: null }

const fmt = (n: number | null | undefined, d = 0): string =>
  n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d })

export default function ShiftBookEntryPage() {
  const { id } = useParams<{ id: string }>()
  const [sp] = useSearchParams()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [materials, setMaterials] = useState<ShiftMaterial[]>([])
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [report, setReport] = useState<ShiftBook | null>(null)
  const [balance, setBalance] = useState<Record<string, { tonBanh: number; tonKg: number }>>({})

  // Đầu phiếu
  const [facilityId, setFacilityId] = useState<string | undefined>(sp.get('facility') || undefined)
  const [ngay, setNgay] = useState<Dayjs>(sp.get('date') ? dayjs(sp.get('date')) : dayjs())
  const [ca, setCa] = useState<string>(sp.get('shift') || '1')
  const [to, setTo] = useState<string>('')
  const [soNguoi, setSoNguoi] = useState<number | null>(null)
  const [suCo, setSuCo] = useState<string>('')

  // Số liệu: materialId → ô nhập
  const [o, setO] = useState<Record<string, OWork>>({})
  const [chiHienDongCoSo, setChiHienDongCoSo] = useState(false)
  const [dirty, setDirty] = useState(false)

  const daKhoa = report?.status === 'received' || report?.status === 'cancelled'
  const daGui = !!report && report.status !== 'draft'

  // ── Nạp danh mục + nhà máy (1 lần) ────────────────────────────────────────
  useEffect(() => {
    let huy = false
    ;(async () => {
      try {
        const [ms, fs] = await Promise.all([
          shiftBookService.listMaterials(),
          facilityService.getAllActive(),
        ])
        if (huy) return
        setMaterials(ms)
        setFacilities(fs)
        setFacilityId((cur) => cur ?? fs[0]?.id)
      } catch (e) {
        message.error('Không đọc được danh mục hàng: ' + (e as Error).message)
      } finally {
        if (!huy) setLoading(false)
      }
    })()
    return () => { huy = true }
  }, [])

  // ── Nạp phiếu đang sửa ────────────────────────────────────────────────────
  useEffect(() => {
    if (!id || id === 'new' || !materials.length) return
    let huy = false
    ;(async () => {
      setLoading(true)
      try {
        const { report: r, lines } = await shiftBookService.getReport(id)
        if (huy) return
        setReport(r)
        setFacilityId(r.facilityId ?? undefined)
        setNgay(dayjs(r.reportDate))
        setCa(r.shift)
        setTo(r.team ?? '')
        setSoNguoi(r.headcount)
        setSuCo(r.incidents ?? '')
        const map: Record<string, OWork> = {}
        for (const l of lines) {
          map[l.materialId] = {
            nhapBanh: l.nhapBanh,
            xuatBanh: l.xuatBanh,
            nhapKgManual: l.nhapKgManual ?? null,
            xuatKgManual: l.xuatKgManual ?? null,
            note: l.note ?? null,
          }
        }
        setO(map)
        setDirty(false)
      } catch (e) {
        message.error('Không mở được phiếu: ' + (e as Error).message)
      } finally {
        if (!huy) setLoading(false)
      }
    })()
    return () => { huy = true }
  }, [id, materials.length])

  // ── Tồn đầu kỳ theo nhà máy ───────────────────────────────────────────────
  useEffect(() => {
    if (!facilityId) return
    let huy = false
    shiftBookService.getBalance(facilityId)
      .then((b) => { if (!huy) setBalance(b) })
      .catch(() => { /* không có tồn thì cột tồn đầu để trống, không chặn nhập */ })
    return () => { huy = true }
  }, [facilityId])

  // ── Nếu đang tạo mới mà ca đó ĐÃ CÓ phiếu → mở đúng phiếu đó, đừng tạo trùng ──
  useEffect(() => {
    if (id && id !== 'new') return
    if (!facilityId || !ca) return
    let huy = false
    shiftBookService.findReport(facilityId, ngay.format('YYYY-MM-DD'), ca)
      .then((r) => {
        if (huy || !r) return
        message.info(`Ca này đã có phiếu (${SHIFT_STATUS_LABEL[r.status]}) — mở phiếu đang có.`)
        navigate(`/wms/production/shift-book/${r.id}`, { replace: true })
      })
      .catch(() => { /* im lặng: không tìm được thì cứ cho tạo mới */ })
    return () => { huy = true }
  }, [id, facilityId, ca, ngay, navigate])

  // ── Dòng để tính tổng ─────────────────────────────────────────────────────
  const lines: ShiftLine[] = useMemo(() => materials.map((m) => {
    const w = o[m.id] ?? O_RONG
    return {
      materialId: m.id, code: m.code, materialName: m.name, sortOrder: m.sortOrder,
      unit: m.unit, weightPerUnit: m.weightPerUnit,
      nhapBanh: w.nhapBanh, xuatBanh: w.xuatBanh,
      nhapKg: kgCuaDong(w.nhapBanh, m.weightPerUnit, w.nhapKgManual),
      xuatKg: kgCuaDong(w.xuatBanh, m.weightPerUnit, w.xuatKgManual),
      phaiNhapKgTay: m.weightPerUnit === null,
      nhapKgManual: w.nhapKgManual, xuatKgManual: w.xuatKgManual, note: w.note,
    }
  }), [materials, o])

  const tong = useMemo(() => computeTotals(lines), [lines])
  const soDongCoSo = useMemo(
    () => lines.filter((l) => l.nhapBanh > 0 || l.xuatBanh > 0 || l.nhapKgManual != null).length,
    [lines],
  )

  const hienThi = useMemo(
    () => (chiHienDongCoSo
      ? lines.filter((l) => l.nhapBanh > 0 || l.xuatBanh > 0 || l.nhapKgManual != null)
      : lines),
    [lines, chiHienDongCoSo],
  )

  // ── Nhập liệu ─────────────────────────────────────────────────────────────
  const dat = (materialId: string, patch: Partial<OWork>) => {
    setO((cur) => ({ ...cur, [materialId]: { ...(cur[materialId] ?? O_RONG), ...patch } }))
    setDirty(true)
  }

  // Enter = xuống đúng ô cùng cột của dòng dưới. Người ghi không phải rời bàn phím,
  // và không phải bấm chuột 24 lần cho một ca chỉ có 3 con số.
  const bangRef = useRef<HTMLDivElement>(null)
  const nhayXuong = (cot: 'nhap' | 'xuat', viTri: number) => {
    const ke = bangRef.current?.querySelector<HTMLInputElement>(`[data-o="${cot}-${viTri + 1}"] input`)
    if (ke) { ke.focus(); ke.select() }
  }

  // ── Lưu ───────────────────────────────────────────────────────────────────
  const luu = async (imLang = false): Promise<string | null> => {
    if (!facilityId) { message.warning('Chọn nhà máy trước'); return null }
    setSaving(true)
    try {
      let rid = report?.id
      if (!rid) {
        const moi = await shiftBookService.createReport({
          facilityId,
          reportDate: ngay.format('YYYY-MM-DD'),
          shift: ca,
          team: to || null,
          shiftFrom: CA.find((c) => c.value === ca)?.from ?? null,
          shiftTo: CA.find((c) => c.value === ca)?.to ?? null,
          headcount: soNguoi,
          incidents: suCo || null,
        })
        setReport(moi)
        rid = moi.id
        navigate(`/wms/production/shift-book/${moi.id}`, { replace: true })
      } else {
        await shiftBookService.updateReport(rid, {
          team: to || null, headcount: soNguoi, incidents: suCo || null,
        })
      }

      const input: ShiftLineInput[] = materials.map((m) => {
        const w = o[m.id] ?? O_RONG
        return {
          materialId: m.id,
          nhapBanh: w.nhapBanh,
          xuatBanh: w.xuatBanh,
          nhapKgManual: w.nhapKgManual,
          xuatKgManual: w.xuatKgManual,
          note: w.note,
        }
      })
      await shiftBookService.saveLines(rid, input, materials)
      setDirty(false)
      if (!imLang) message.success('Đã lưu')
      return rid
    } catch (e) {
      message.error('Lưu không được: ' + (e as Error).message)
      return null
    } finally {
      setSaving(false)
    }
  }

  const chuyenBuoc = async (buoc: 'submit' | 'qc_confirm' | 'receive', nhan: string) => {
    const rid = dirty || !report ? await luu(true) : report.id
    if (!rid) return
    if (buoc === 'submit') {
      if (soDongCoSo === 0) { message.warning('Chưa có dòng nào có số — không gửi được phiếu rỗng'); return }
      if (tong.thieuKg) { message.warning('Còn dòng chưa tính được kg. Nhập kg cho dòng có dấu ⚠ rồi gửi.'); return }
    }
    Modal.confirm({
      title: nhan,
      content: buoc === 'receive'
        ? 'Sau bước này số liệu sẽ cộng vào TỒN KHO và phiếu bị khoá. Đúng thì xác nhận.'
        : 'Xác nhận số liệu trên phiếu là đúng?',
      okText: 'Xác nhận', cancelText: 'Quay lại',
      onOk: async () => {
        try {
          await shiftBookService.advance(rid, buoc, user?.employee_id ?? null)
          const { report: r } = await shiftBookService.getReport(rid)
          setReport(r)
          message.success(nhan + ' — xong')
        } catch (e) {
          message.error((e as Error).message)
        }
      },
    })
  }

  // ── Cột bảng ──────────────────────────────────────────────────────────────
  const cols = [
    {
      title: '', dataIndex: 'sortOrder', width: 40, align: 'center' as const,
      render: (v: number) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: 'Tên hàng', dataIndex: 'materialName', width: 230,
      render: (v: string, r: ShiftLine) => {
        const koDat = (MA_HANG_KHONG_DAT as readonly string[]).includes(r.code)
        return (
          <Space size={6}>
            <Text strong={r.nhapBanh > 0 || r.xuatBanh > 0} style={{ fontSize: 13 }}>{v}</Text>
            {koDat && <Tag color="red" style={{ marginInlineEnd: 0 }}>không đạt</Tag>}
            {r.phaiNhapKgTay && (
              <Tooltip title="Mã này chưa có cỡ bành trong danh mục — phải nhập kg tay">
                <WarningOutlined style={{ color: '#faad14' }} />
              </Tooltip>
            )}
          </Space>
        )
      },
    },
    {
      title: <Tooltip title="Tồn cuối của các ca trước đã được thủ kho nhận">Tồn đầu</Tooltip>,
      width: 90, align: 'right' as const,
      render: (_: unknown, r: ShiftLine) => (
        <Text type="secondary">{fmt(balance[r.materialId]?.tonBanh ?? 0)}</Text>
      ),
    },
    {
      title: <Text strong style={{ color: '#1677ff' }}>NHẬP (bành)</Text>,
      width: 120, align: 'right' as const,
      render: (_: unknown, r: ShiftLine, i: number) => (
        <span data-o={`nhap-${i}`}>
          <InputNumber
            min={0} step={1} precision={0} disabled={daKhoa}
            value={r.nhapBanh || null} placeholder="0"
            onChange={(v) => dat(r.materialId, { nhapBanh: Number(v ?? 0) })}
            onPressEnter={() => nhayXuong('nhap', i)}
            style={{ width: '100%', fontWeight: r.nhapBanh > 0 ? 600 : 400 }}
          />
        </span>
      ),
    },
    {
      title: 'XUẤT (bành)', width: 120, align: 'right' as const,
      render: (_: unknown, r: ShiftLine, i: number) => (
        <span data-o={`xuat-${i}`}>
          <InputNumber
            min={0} step={1} precision={0} disabled={daKhoa}
            value={r.xuatBanh || null} placeholder="0"
            onChange={(v) => dat(r.materialId, { xuatBanh: Number(v ?? 0) })}
            onPressEnter={() => nhayXuong('xuat', i)}
            style={{ width: '100%' }}
          />
        </span>
      ),
    },
    {
      title: <Tooltip title="Tồn đầu + nhập − xuất. Máy tính, không gõ.">Tồn cuối</Tooltip>,
      width: 90, align: 'right' as const,
      render: (_: unknown, r: ShiftLine) => {
        const t = (balance[r.materialId]?.tonBanh ?? 0) + r.nhapBanh - r.xuatBanh
        return <Text strong={r.nhapBanh > 0 || r.xuatBanh > 0}>{fmt(t)}</Text>
      },
    },
    {
      title: <Tooltip title="Số bành × cỡ bành của chính mã đó. Máy tính.">Quy ra kg</Tooltip>,
      width: 130, align: 'right' as const,
      render: (_: unknown, r: ShiftLine) => {
        if (r.phaiNhapKgTay) {
          return (
            <InputNumber
              min={0} step={1} disabled={daKhoa} placeholder="nhập kg"
              value={r.nhapKgManual} onChange={(v) => dat(r.materialId, { nhapKgManual: v === null ? null : Number(v) })}
              style={{ width: '100%', borderColor: '#faad14' }}
            />
          )
        }
        return r.nhapBanh > 0
          ? <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(r.nhapKg, 2)}</Text>
          : <Text type="secondary">—</Text>
      },
    },
  ]

  if (loading) {
    return <div style={{ padding: 48, textAlign: 'center' }}><Spin size="large" /></div>
  }

  const nhaMay = facilities.find((f) => f.id === facilityId)

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: '0 auto' }}>
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/production/shift-book')}>
          Danh sách
        </Button>
        <Title level={4} style={{ margin: 0 }}>Ghi sổ ca ép bành</Title>
        {report && <Tag color={SHIFT_STATUS_COLOR[report.status]}>{SHIFT_STATUS_LABEL[report.status]}</Tag>}
      </Space>

      {/* ── Đầu phiếu ─────────────────────────────────────────────────────── */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={[12, 12]}>
          <Col xs={12} md={5}>
            <Text type="secondary" style={{ fontSize: 12 }}>Nhà máy</Text>
            <Select
              value={facilityId} onChange={setFacilityId} disabled={!!report}
              style={{ width: '100%' }}
              options={facilities.map((f) => ({ value: f.id, label: f.name }))}
            />
          </Col>
          <Col xs={12} md={4}>
            <Text type="secondary" style={{ fontSize: 12 }}>Ngày</Text>
            <DatePicker
              value={ngay} onChange={(d) => d && setNgay(d)} disabled={!!report}
              format="DD/MM/YYYY" allowClear={false} style={{ width: '100%' }}
            />
          </Col>
          <Col xs={12} md={5}>
            <Text type="secondary" style={{ fontSize: 12 }}>Ca</Text>
            <Select
              value={ca} onChange={setCa} disabled={!!report}
              style={{ width: '100%' }} options={CA}
            />
          </Col>
          <Col xs={12} md={4}>
            <Text type="secondary" style={{ fontSize: 12 }}>Tổ</Text>
            <Select
              value={to || undefined} onChange={setTo} disabled={daKhoa}
              placeholder="Vàng / Đen" style={{ width: '100%' }} allowClear
              options={TO_GOI_Y.map((t) => ({ value: t, label: t }))}
            />
          </Col>
          <Col xs={12} md={3}>
            <Text type="secondary" style={{ fontSize: 12 }}>Số người</Text>
            <InputNumber
              min={0} value={soNguoi} onChange={(v) => { setSoNguoi(v === null ? null : Number(v)); setDirty(true) }}
              disabled={daKhoa} style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} md={3}>
            <Text type="secondary" style={{ fontSize: 12 }}>Giờ</Text>
            <div style={{ paddingTop: 5 }}>
              <Text>{CA.find((c) => c.value === ca)?.from}–{CA.find((c) => c.value === ca)?.to}</Text>
            </div>
          </Col>
        </Row>
      </Card>

      {/* ── Tổng ca: ba con số lãnh đạo thật sự hỏi ───────────────────────── */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={16}>
          <Col xs={12} md={6}>
            <Text type="secondary" style={{ fontSize: 12 }}>TỔNG NHẬP</Text>
            <div><Text strong style={{ fontSize: 22 }}>{fmt(tong.nhapBanh)}</Text> <Text type="secondary">bành</Text></div>
            <Text type="secondary">{fmt(tong.nhapKg, 2)} kg</Text>
          </Col>
          <Col xs={12} md={6}>
            <Text type="secondary" style={{ fontSize: 12 }}>TRONG ĐÓ KHÔNG ĐẠT</Text>
            <div>
              <Text strong style={{ fontSize: 22, color: tong.loiBanh > 0 ? '#cf1322' : undefined }}>
                {fmt(tong.loiBanh)}
              </Text> <Text type="secondary">bành</Text>
            </div>
            <Text type="secondary">
              {fmt(tong.loiKg, 2)} kg
              {tong.nhapBanh > 0 && ` · ${Math.round((tong.loiBanh / tong.nhapBanh) * 100)}%`}
            </Text>
          </Col>
          <Col xs={12} md={6}>
            <Text type="secondary" style={{ fontSize: 12 }}>TỔNG XUẤT</Text>
            <div><Text strong style={{ fontSize: 22 }}>{fmt(tong.xuatBanh)}</Text> <Text type="secondary">bành</Text></div>
            <Text type="secondary">{fmt(tong.xuatKg, 2)} kg</Text>
          </Col>
          <Col xs={12} md={6}>
            <Text type="secondary" style={{ fontSize: 12 }}>SỐ DÒNG CÓ SỐ</Text>
            <div><Text strong style={{ fontSize: 22 }}>{soDongCoSo}</Text> <Text type="secondary">/ {materials.length}</Text></div>
            <Switch
              size="small" checked={chiHienDongCoSo} onChange={setChiHienDongCoSo}
              style={{ marginTop: 4 }}
            />
            <Text type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>chỉ hiện dòng có số</Text>
          </Col>
        </Row>
      </Card>

      {tong.thieuKg && (
        <Alert
          type="warning" showIcon style={{ marginBottom: 12 }}
          message="Còn dòng chưa tính được kg"
          description="Mã có dấu ⚠ chưa có cỡ bành trong danh mục. Nhập kg tay cho dòng đó, hoặc báo QC bổ sung cỡ bành vào danh mục."
        />
      )}

      {/* ── Bảng 24 dòng, đúng thứ tự tờ giấy ─────────────────────────────── */}
      <div ref={bangRef}>
        <Table<ShiftLine>
          rowKey="materialId"
          dataSource={hienThi}
          columns={cols}
          pagination={false}
          size="small"
          bordered
          scroll={{ x: 860 }}
          rowClassName={(r) => (r.nhapBanh > 0 || r.xuatBanh > 0 ? '' : 'ha-dong-trong')}
          summary={() => (
            <Table.Summary fixed="bottom">
              <Table.Summary.Row style={{ background: 'rgba(22,119,255,.06)', fontWeight: 600 }}>
                <Table.Summary.Cell index={0} colSpan={2}>TỔNG CỘNG</Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">—</Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">{fmt(tong.nhapBanh)}</Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">{fmt(tong.xuatBanh)}</Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="right">—</Table.Summary.Cell>
                <Table.Summary.Cell index={6} align="right">{fmt(tong.nhapKg, 2)}</Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </div>

      <Card size="small" style={{ marginTop: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>Sự cố trong ca (nếu có)</Text>
        <Input.TextArea
          rows={2} value={suCo} disabled={daKhoa}
          onChange={(e) => { setSuCo(e.target.value); setDirty(true) }}
          placeholder="Máy dừng, mất điện, hàng lỗi bất thường…"
        />
      </Card>

      {/* ── Ba chữ ký. Chỉ chữ ký thứ ba mới động vào tồn kho. ────────────── */}
      <Card size="small" style={{ marginTop: 12, position: 'sticky', bottom: 0, zIndex: 5 }}>
        <Row justify="space-between" align="middle" gutter={[8, 8]}>
          <Col>
            <Space size={4}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {report?.submittedAt ? `Sản xuất giao ${dayjs(report.submittedAt).format('HH:mm DD/MM')}` : 'Chưa giao'}
                {' → '}
                {report?.qcConfirmedAt ? `QC xác nhận ${dayjs(report.qcConfirmedAt).format('HH:mm DD/MM')}` : 'chờ QC'}
                {' → '}
                {report?.receivedAt ? `Thủ kho nhận ${dayjs(report.receivedAt).format('HH:mm DD/MM')}` : 'chờ thủ kho'}
              </Text>
            </Space>
          </Col>
          <Col>
            <Space wrap>
              {!daKhoa && (
                <Button icon={<SaveOutlined />} loading={saving} onClick={() => luu()}>
                  Lưu nháp
                </Button>
              )}
              {(!report || report.status === 'draft') && (
                <Button type="primary" icon={<SendOutlined />} loading={saving}
                  onClick={() => chuyenBuoc('submit', 'Sản xuất giao hàng')}>
                  Giao cho QC
                </Button>
              )}
              {report?.status === 'submitted' && (
                <Button type="primary" icon={<CheckCircleOutlined />}
                  onClick={() => chuyenBuoc('qc_confirm', 'QC xác nhận chất lượng')}>
                  QC xác nhận
                </Button>
              )}
              {report?.status === 'qc_confirmed' && (
                <Button type="primary" icon={<InboxOutlined />}
                  onClick={() => chuyenBuoc('receive', 'Thủ kho nhận vào kho')}>
                  Thủ kho nhận
                </Button>
              )}
              {report && report.status !== 'received' && report.status !== 'cancelled' && (
                <Button danger icon={<StopOutlined />} onClick={() => {
                  let lyDo = ''
                  Modal.confirm({
                    title: 'Huỷ phiếu ca',
                    content: <Input placeholder="Lý do huỷ" onChange={(e) => { lyDo = e.target.value }} />,
                    okText: 'Huỷ phiếu', okButtonProps: { danger: true }, cancelText: 'Quay lại',
                    onOk: async () => {
                      try {
                        await shiftBookService.cancelReport(report.id, lyDo)
                        message.success('Đã huỷ phiếu')
                        navigate('/wms/production/shift-book')
                      } catch (e) { message.error((e as Error).message) }
                    },
                  })
                }}>Huỷ</Button>
              )}
            </Space>
          </Col>
        </Row>
        {daGui && !daKhoa && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            Phiếu đã gửi — vẫn sửa được số cho tới khi thủ kho nhận.
          </Text>
        )}
        {report?.status === 'received' && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            Đã vào kho, phiếu khoá. Sai thì lập phiếu điều chỉnh, không sửa đè.
          </Text>
        )}
        {nhaMay && <Text type="secondary" style={{ fontSize: 12, marginLeft: 12 }}>{nhaMay.name}</Text>}
      </Card>
    </div>
  )
}
