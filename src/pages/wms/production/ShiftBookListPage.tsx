// ============================================================================
// SỔ CA ÉP BÀNH — danh sách phiếu
// File: src/pages/wms/production/ShiftBookListPage.tsx
// Route: /wms/production/shift-book
//
// Màn hình này trả lời đúng ba câu người ta hỏi mỗi sáng:
//   1. Ca đêm qua đã ghi chưa?              → dòng có/không của hôm qua
//   2. Phiếu nào đang kẹt, kẹt ở ai?        → cột trạng thái, đọc theo ba chữ ký
//   3. Tồn kho thành phẩm giờ còn bao nhiêu? → thẻ tồn ở đầu trang
//
// ⚠ Cột TỒN chỉ cộng phiếu ĐÃ ĐƯỢC THỦ KHO NHẬN (view lọc status='received').
//   Một phiếu QC vừa xác nhận chưa nằm trong tồn — đúng như tờ giấy, và cố ý.
// ============================================================================

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Table, Button, Space, Typography, Tag, Select, Row, Col, Empty, Spin, Tooltip, Switch, Alert, message,
} from 'antd'
import { PlusOutlined, ReloadOutlined, InboxOutlined, PrinterOutlined } from '@ant-design/icons'

import dayjs from 'dayjs'
import {
  shiftBookService, SHIFT_STATUS_LABEL, SHIFT_STATUS_COLOR, BUOC_DANG_CHO, QUYEN_DONG,
  type ShiftBook, type ShiftBookStatus, type TonKho, type QuyenKy,
} from '../../../services/wms/shiftBookService'
import { facilityService, type Facility } from '../../../services/wms/facilityService'

const { Title, Text } = Typography

const fmt = (n: number, d = 0) =>
  n.toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d })

/** Ai đang giữ phiếu — dịch trạng thái thành việc phải làm, không phải thành thuật ngữ. */
const DANG_CHO: Record<ShiftBookStatus, string> = {
  draft: 'Sản xuất chưa giao',
  submitted: 'Chờ QC xác nhận',
  qc_confirmed: 'Chờ thủ kho nhận',
  received: 'Xong',
  cancelled: '—',
}

export default function ShiftBookListPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [facilityId, setFacilityId] = useState<string | undefined>()
  const [reports, setReports] = useState<ShiftBook[]>([])
  const [ton, setTon] = useState<Record<string, TonKho>>({})
  const [quyen, setQuyen] = useState<QuyenKy>(QUYEN_DONG)
  const [choToi, setChoToi] = useState(false)

  useEffect(() => {
    facilityService.getAllActive()
      .then((fs) => { setFacilities(fs); setFacilityId((c) => c ?? fs[0]?.id) })
      .catch((e) => message.error('Không đọc được danh sách nhà máy: ' + (e as Error).message))
  }, [])

  const nap = async () => {
    if (!facilityId) return
    setLoading(true)
    try {
      const [rs, b, q] = await Promise.all([
        shiftBookService.listReports({ facilityId, limit: 60 }),
        shiftBookService.getBalance(facilityId),
        shiftBookService.getQuyen(facilityId).catch(() => QUYEN_DONG),
      ])
      setReports(rs)
      setTon(b)
      setQuyen(q)
    } catch (e) {
      message.error('Không đọc được sổ ca: ' + (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void nap() }, [facilityId])

  const tonTong = useMemo(() => {
    let banh = 0, kg = 0, thieu = 0
    for (const v of Object.values(ton)) {
      banh += v.tonBanh; kg += v.tonKg
      if (v.thieuKg) thieu += v.soDongThieuKg
    }
    // `thieu` > 0 nghĩa là tổng kg này mới là tổng của phần TÍNH ĐƯỢC. Phải nói ra.
    return { banh, kg, thieu }
  }, [ton])

  const dangKet = useMemo(
    () => reports.filter((r) => r.status === 'submitted' || r.status === 'qc_confirmed').length,
    [reports],
  )

  /**
   * Phiếu đang chờ CHÍNH người đang đăng nhập: bước kế tiếp của nó là bước mình được ký.
   * Luật "được ký" hỏi thẳng DB (`fn_shift_book_quyen`), không tính lại ở đây.
   */
  const cuaToi = useMemo(
    () => reports.filter((r) => {
      const buoc = BUOC_DANG_CHO[r.status]
      return buoc ? quyen[buoc] === true : false
    }),
    [reports, quyen],
  )

  const hienThi = choToi ? cuaToi : reports

  const cols = [
    {
      title: 'Ngày', dataIndex: 'reportDate', width: 110,
      render: (v: string) => <Text strong>{dayjs(v).format('DD/MM/YYYY')}</Text>,
    },
    {
      // Tên ca lấy thẳng từ danh mục dùng chung. Không gõ lại nghĩa của ca ở đây —
      // đó từng là chỗ thứ ba định nghĩa ca, và nó mâu thuẫn với hai chỗ kia.
      title: 'Ca', dataIndex: 'shiftName', width: 150,
      render: (v: string | null, r: ShiftBook) => v
        ? <Tag>{v}</Tag>
        : <Text type="secondary">{r.shiftCode ?? '—'}</Text>,
    },
    {
      title: 'Trạng thái', dataIndex: 'status', width: 150,
      render: (v: ShiftBookStatus) => <Tag color={SHIFT_STATUS_COLOR[v]}>{SHIFT_STATUS_LABEL[v]}</Tag>,
    },
    {
      title: 'Đang chờ ai', dataIndex: 'status', width: 150,
      render: (v: ShiftBookStatus) => (
        <Text type={v === 'received' ? 'success' : v === 'cancelled' ? 'secondary' : 'warning'}>
          {DANG_CHO[v]}
        </Text>
      ),
    },
    {
      title: 'Ba chữ ký', width: 190,
      render: (_: unknown, r: ShiftBook) => (
        <Space size={4}>
          <Tag color={r.submittedAt ? 'blue' : 'default'}>SX</Tag>
          <Tag color={r.qcConfirmedAt ? 'gold' : 'default'}>QC</Tag>
          <Tag color={r.receivedAt ? 'green' : 'default'}>Kho</Tag>
        </Space>
      ),
    },
    {
      title: '', width: 90, align: 'right' as const,
      render: (_: unknown, r: ShiftBook) => (
        <Button size="small" onClick={() => navigate(`/wms/production/shift-book/${r.id}`)}>
          {r.status === 'received' || r.status === 'cancelled' ? 'Xem' : 'Mở'}
        </Button>
      ),
    },
  ]

  const tonCols = [
    { title: 'Mã', dataIndex: 'code', width: 160 },
    { title: 'Tên hàng', dataIndex: 'name' },
    {
      title: 'Tồn (bành)', dataIndex: 'tonBanh', width: 110, align: 'right' as const,
      render: (v: number) => <Text strong>{fmt(v)}</Text>,
    },
    {
      title: 'Tồn (kg)', dataIndex: 'tonKg', width: 170, align: 'right' as const,
      render: (v: number, r: { thieuKg: boolean }) => (
        <Space size={4}>
          <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(v, 2)}</Text>
          {r.thieuKg && (
            <Tooltip title="Có dòng chưa quy ra kg được — số này mới là phần tính được, chưa đủ">
              <Text type="warning">chưa đủ</Text>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ]

  const [tonRows, setTonRows] = useState<Array<{ code: string; name: string; tonBanh: number; tonKg: number; thieuKg: boolean }>>([])
  useEffect(() => {
    if (!facilityId) return
    // Đọc lại view tồn kèm tên hàng để bảng tồn không phải tra ngược danh mục.
    shiftBookService.listMaterials()
      .then((ms) => {
        const byId = new Map(ms.map((m) => [m.id, m]))
        setTonRows(
          Object.entries(ton)
            .map(([mid, v]) => ({
              code: byId.get(mid)?.code ?? '?',
              name: byId.get(mid)?.name ?? '(không còn trong danh mục)',
              tonBanh: v.tonBanh, tonKg: v.tonKg, thieuKg: v.thieuKg,
            }))
            .filter((r) => r.tonBanh !== 0 || r.tonKg !== 0)
            .sort((a, b) => b.tonBanh - a.tonBanh),
        )
      })
      .catch(() => setTonRows([]))
  }, [ton, facilityId])

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: '0 auto' }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 12 }} gutter={[8, 8]}>
        <Col>
          <Title level={4} style={{ margin: 0 }}>Sổ ca ép bành</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Biểu mẫu CL.BMQT.SX.04.06 — báo cáo sản xuất nhập kho hàng ngày
          </Text>
        </Col>
        <Col>
          <Space wrap>
            <Select
              value={facilityId} onChange={setFacilityId} style={{ minWidth: 180 }}
              options={facilities.map((f) => ({ value: f.id, label: f.name }))}
            />
            <Button icon={<ReloadOutlined />} onClick={() => void nap()} />
            {/* Tờ trống để ghi tay — nhà máy chạy song song giấy + phần mềm một tháng. */}
            <Button
              icon={<PrinterOutlined />}
              onClick={() => navigate('/wms/production/shift-book/new/print?blank=1')}
            >
              In tờ trống
            </Button>
            <Button
              type="primary" icon={<PlusOutlined />}
              onClick={() => navigate(`/wms/production/shift-book/new?facility=${facilityId ?? ''}`)}
            >
              Ghi sổ ca
            </Button>
          </Space>
        </Col>
      </Row>

      {quyen.chua_chi_dinh_thu_kho && (
        <Alert
          type="info" showIcon style={{ marginBottom: 12 }}
          message="Chưa chỉ định thủ kho"
          description="Bước “Thủ kho nhận” — bước duy nhất làm tồn kho thay đổi — hiện mở cho mọi người. Chỉ định người nhận kho để khoá lại."
        />
      )}

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={8}>
          <Card size="small">
            <Text type="secondary" style={{ fontSize: 12 }}>TỒN THÀNH PHẨM</Text>
            <div><Text strong style={{ fontSize: 24 }}>{fmt(tonTong.banh)}</Text> <Text type="secondary">bành</Text></div>
            <Text type="secondary">
              {fmt(tonTong.kg, 2)} kg · chỉ tính phiếu thủ kho đã nhận
              {tonTong.thieu > 0 && ` · ${tonTong.thieu} dòng chưa quy ra kg được`}
            </Text>
          </Card>
        </Col>
        <Col xs={12} md={8}>
          <Card size="small">
            <Text type="secondary" style={{ fontSize: 12 }}>PHIẾU ĐANG KẸT</Text>
            <div>
              <Text strong style={{ fontSize: 24, color: dangKet > 0 ? '#d48806' : undefined }}>{dangKet}</Text>
              <Text type="secondary"> phiếu</Text>
            </div>
            <Text type="secondary">đã giao nhưng chưa vào kho</Text>
            <div style={{ marginTop: 6 }}>
              <Switch size="small" checked={choToi} onChange={setChoToi} />
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>
                chỉ hiện phiếu chờ tôi ({cuaToi.length})
              </Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small">
            <Text type="secondary" style={{ fontSize: 12 }}>PHIẾU GẦN NHẤT</Text>
            <div>
              <Text strong style={{ fontSize: 18 }}>
                {reports[0] ? dayjs(reports[0].reportDate).format('DD/MM') : '—'}
              </Text>
              {reports[0]?.shiftName && <Text type="secondary"> · {reports[0].shiftName}</Text>}
            </div>
            <Text type="secondary">{reports[0] ? SHIFT_STATUS_LABEL[reports[0].status] : 'chưa có phiếu nào'}</Text>
          </Card>
        </Col>
      </Row>

      <Card size="small" style={{ marginBottom: 12 }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center' }}><Spin /></div>
        ) : hienThi.length === 0 ? (
          <Empty description={choToi
            ? 'Không có phiếu nào đang chờ bạn'
            : 'Chưa có phiếu ca nào — bấm “Ghi sổ ca” để bắt đầu'} />
        ) : (
          <Table<ShiftBook>
            rowKey="id" dataSource={hienThi} columns={cols}
            size="small" pagination={{ pageSize: 20, showSizeChanger: false }}
            scroll={{ x: 840 }}
          />
        )}
      </Card>

      <Card
        size="small"
        title={<Space><InboxOutlined /><span>Tồn theo mã hàng</span></Space>}
      >
        {tonRows.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Chưa có tồn — tồn chỉ hiện sau khi thủ kho nhận phiếu đầu tiên"
          />
        ) : (
          <Table
            rowKey="code" dataSource={tonRows} columns={tonCols}
            size="small" pagination={false} scroll={{ x: 600 }}
          />
        )}
      </Card>
    </div>
  )
}
