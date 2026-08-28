// ============================================================================
// CHỈ ĐỊNH THỦ KHO — cửa sổ nhỏ trên Sổ ca ép bành
// File: src/components/wms/ChiDinhThuKhoModal.tsx
//
// Bước "Thủ kho nhận" là bước DUY NHẤT làm tồn kho thay đổi. Luật ký
// (`wms_m3_p5_luat_ky_so_ca.sql`) đã dựng sẵn: chưa chỉ định ai thì bước đó MỞ cho
// mọi người, chỉ định một người là đóng lại ngay.
//
// ⚠ Nhưng đến 29/08/2026 KHÔNG màn hình nào đọc/ghi bảng `shift_book_thu_kho` — cổng
//   đã dựng mà không có tay nắm, nên nó cứ mở. Cửa sổ này là tay nắm đó, và nó được đặt
//   ngay dưới dòng cảnh báo trên Sổ ca, chỗ người ta nhìn thấy vấn đề.
//
// Ai ghi được: RLS trên bảng chỉ cho BGĐ (`positions.level <= 3`). Màn hình KHÔNG tự
// kiểm tra lại điều đó — chốt nằm ở DB, ở đây chỉ hiển thị lỗi nếu bị từ chối. Kiểm hai
// nơi là hai nguồn sự thật, và nơi sai thường là nơi không có dữ liệu để mà đúng.
// ============================================================================

import { useEffect, useState } from 'react'
import { Modal, Select, Input, Button, Table, Space, Typography, Alert, Popconfirm, message } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { shiftBookService, type ThuKho } from '../../services/wms/shiftBookService'
import { employeeService } from '../../services/employeeService'

const { Text } = Typography

interface Props {
  open: boolean
  onClose: () => void
  facilityId?: string
  facilityName?: string
  /** Gọi sau khi danh sách đổi, để trang cha nạp lại quyền. */
  onChanged?: () => void
}

interface NhanVien { id: string; hoTen: string; email: string | null }

export default function ChiDinhThuKhoModal({ open, onClose, facilityId, facilityName, onChanged }: Props) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [ds, setDs] = useState<ThuKho[]>([])
  const [nhanVien, setNhanVien] = useState<NhanVien[]>([])
  const [chon, setChon] = useState<string | undefined>()
  const [ghiChu, setGhiChu] = useState('')
  const [moiNhaMay, setMoiNhaMay] = useState(false)

  const nap = async () => {
    setLoading(true)
    try {
      setDs(await shiftBookService.listThuKho(facilityId))
    } catch (e) {
      message.error('Không đọc được danh sách thủ kho: ' + (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    void nap()
    employeeService.getAll({ pageSize: 500 })
      .then((r) => setNhanVien(
        (r.data || [])
          .filter((e) => e.status === 'active')
          .map((e) => ({ id: e.id, hoTen: e.full_name, email: e.email ?? null }))
          .sort((a, b) => a.hoTen.localeCompare(b.hoTen, 'vi')),
      ))
      .catch(() => setNhanVien([]))
  }, [open, facilityId])

  const them = async () => {
    if (!chon) { message.warning('Chọn người trước'); return }
    setSaving(true)
    try {
      await shiftBookService.themThuKho(chon, moiNhaMay ? null : (facilityId ?? null), ghiChu || undefined)
      message.success('Đã chỉ định')
      setChon(undefined); setGhiChu('')
      await nap()
      onChanged?.()
    } catch (e) {
      // RLS từ chối thì lỗi Postgres khá khó hiểu — dịch sang câu người đọc được.
      const msg = (e as Error).message
      message.error(/row-level security|permission/i.test(msg)
        ? 'Chỉ Ban Giám đốc mới chỉ định được thủ kho.'
        : 'Không chỉ định được: ' + msg)
    } finally {
      setSaving(false)
    }
  }

  const thu = async (id: string) => {
    try {
      await shiftBookService.thuQuyenThuKho(id)
      message.success('Đã thu quyền')
      await nap()
      onChanged?.()
    } catch (e) {
      const msg = (e as Error).message
      message.error(/row-level security|permission/i.test(msg)
        ? 'Chỉ Ban Giám đốc mới thu quyền được.'
        : 'Không thu quyền được: ' + msg)
    }
  }

  return (
    <Modal
      open={open} onCancel={onClose} footer={null} width={640}
      title="Ai được nhận hàng vào kho"
    >
      {ds.length === 0 && (
        <Alert
          type="warning" showIcon style={{ marginBottom: 12 }}
          message="Chưa chỉ định ai"
          description="Bước “Thủ kho nhận” đang mở cho mọi người đăng nhập. Chỉ cần chỉ định một người là khoá lại."
        />
      )}

      <Table<ThuKho>
        rowKey="id" dataSource={ds} loading={loading} pagination={false} size="small"
        style={{ marginBottom: 16 }}
        locale={{ emptyText: 'Chưa có ai' }}
        columns={[
          {
            title: 'Người nhận kho', dataIndex: 'hoTen',
            render: (v: string, r: ThuKho) => (
              <Space direction="vertical" size={0}>
                <Text strong>{v}</Text>
                {r.email && <Text type="secondary" style={{ fontSize: 12 }}>{r.email}</Text>}
              </Space>
            ),
          },
          {
            title: 'Phạm vi', dataIndex: 'facilityId', width: 150,
            render: (v: string | null) => v ? (facilityName ?? 'Nhà máy này') : 'Mọi nhà máy',
          },
          {
            title: 'Từ ngày', dataIndex: 'capLuc', width: 110,
            render: (v: string) => v ? dayjs(v).format('DD/MM/YYYY') : '—',
          },
          {
            title: '', width: 50, align: 'right' as const,
            render: (_: unknown, r: ThuKho) => (
              <Popconfirm
                title="Thu quyền nhận kho của người này?"
                okText="Thu quyền" cancelText="Thôi"
                onConfirm={() => thu(r.id)}
              >
                <Button size="small" danger type="text" icon={<DeleteOutlined />} />
              </Popconfirm>
            ),
          },
        ]}
      />

      <Space.Compact style={{ width: '100%' }}>
        <Select
          showSearch value={chon} onChange={setChon} placeholder="Chọn người"
          style={{ flex: 1 }}
          filterOption={(nhap, opt) => String(opt?.label ?? '').toLowerCase().includes(nhap.toLowerCase())}
          options={nhanVien.map((n) => ({
            value: n.id,
            label: n.email ? `${n.hoTen} — ${n.email}` : n.hoTen,
          }))}
        />
        <Input
          placeholder="Ghi chú" value={ghiChu} onChange={(e) => setGhiChu(e.target.value)}
          style={{ width: 160 }}
        />
        <Button type="primary" icon={<PlusOutlined />} loading={saving} onClick={them}>
          Chỉ định
        </Button>
      </Space.Compact>

      <div style={{ marginTop: 8 }}>
        <label style={{ fontSize: 12, cursor: 'pointer' }}>
          <input
            type="checkbox" checked={moiNhaMay} onChange={(e) => setMoiNhaMay(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Nhận được ở mọi nhà máy (bỏ trống thì chỉ {facilityName ?? 'nhà máy đang chọn'})
          </Text>
        </label>
      </div>

      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 12 }}>
        Ban Giám đốc luôn nhận kho được, kể cả khi không có tên ở đây — để không ai bị kẹt.
      </Text>
    </Modal>
  )
}
