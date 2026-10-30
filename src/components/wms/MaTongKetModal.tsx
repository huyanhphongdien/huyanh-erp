// ============================================================================
// Tổng kết mã nguyên liệu (máy tính): hiện sau nút "Kết thúc mã" hoặc "Tổng kết mã" ở /wms/chen
//   · số NVL vào / chèn (theo vị trí, nguồn, lô, ca) / thành phẩm / lưu ý
//   · mail BGĐ soạn sẵn: gửi qua hệ thống (send-email) · mở Outlook/Mail (mailto) · sao chép
// File: src/components/wms/MaTongKetModal.tsx
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Col, Input, Modal, Row, Select, Space, Statistic, Table, Tag, Typography, message } from 'antd'
import { CopyOutlined, MailOutlined, SendOutlined } from '@ant-design/icons'
import { rawLotService, RAW_LOT_TRANG_THAI_LABELS, type RawLotTongKet, type RawLotTongKetCa } from '../../services/wms/rawLotService'
import { MIX_SOURCE_LABELS, MIX_VI_TRI_LABELS } from '../../services/wms/mixService'
import { guiMailTongKet, mailtoTongKet, soanMailTongKet, taiPhieuAnh, type PhieuAnh } from '../../services/wms/maTongKetMail'

const { Text, Title } = Typography
const fmtKg = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: d }))
const fmtD = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : '—')
const fmtDt = (v: string | null | undefined) => (v ? new Date(v).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—')
const okEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

export default function MaTongKetModal({ rawLotId, lenhId, open, vuaKetThuc, onClose }: { rawLotId?: string | null; lenhId?: string | null; open: boolean; vuaKetThuc?: boolean; onClose: () => void }) {
  const [tk, setTk] = useState<RawLotTongKet | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [to, setTo] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [phieu, setPhieu] = useState<PhieuAnh[]>([])   // từng lần chèn + ảnh kèm trong mail

  useEffect(() => {
    if (!open || (!rawLotId && !lenhId)) return
    let alive = true
    setLoading(true); setErr(null); setTk(null); setPhieu([])
    const req = lenhId ? rawLotService.tongKetLenh(lenhId) : rawLotService.tongKetMa(rawLotId ?? '')
    req
      .then((r) => { if (!alive) return; setTk(r); setTo(r.bgd.map((b) => b.email)); taiPhieuAnh(r).then((x) => { if (alive) setPhieu(x) }).catch(() => { if (alive) setPhieu([]) }) })
      .catch((e: any) => { if (alive) setErr(e?.message || 'Không tổng kết được (cần chạy SQL p12 + p13)') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [open, rawLotId, lenhId])

  const mail = useMemo(() => (tk ? soanMailTongKet(tk, phieu) : null), [tk, phieu])
  const soAnh = phieu.reduce((s, r) => s + r.anhLay.length + r.anhTra.length, 0)
  const toOk = to.filter(okEmail)

  const gui = async () => {
    if (!mail || !toOk.length) { message.warning('Chọn ít nhất một địa chỉ nhận'); return }
    setSending(true)
    try {
      const r = await guiMailTongKet(toOk, mail)
      if (r.ok.length) message.success(`Đã gửi cho ${r.ok.join(', ')}`)
      if (r.loi.length) message.error(`Không gửi được: ${r.loi.map((x) => `${x.email} (${x.msg})`).join('; ')} — dùng nút "Mở ứng dụng mail"`)
    } finally { setSending(false) }
  }
  const copy = async () => {
    if (!mail) return
    try { await navigator.clipboard.writeText(`${mail.subject}\n\n${mail.text}`); message.success('Đã sao chép tiêu đề + nội dung') }
    catch { message.error('Trình duyệt không cho sao chép, bôi đen ô nội dung rồi Ctrl+C') }
  }

  const caCols = [
    { title: 'Ca', key: 'ca', render: (_: unknown, r: RawLotTongKetCa) => `${fmtD(r.shift_date)} ${r.shift_name}${r.team ? ` · Ca ${r.team}` : ''}` },
    { title: 'Lần', dataIndex: 'so_lan', align: 'right' as const, width: 60 },
    { title: 'Lấy', dataIndex: 'kg_lay', align: 'right' as const, render: (v: number) => fmtKg(v) },
    { title: 'Trả', dataIndex: 'kg_tra', align: 'right' as const, render: (v: number) => fmtKg(v) },
    { title: 'Tiêu hao', dataIndex: 'tieu_hao', align: 'right' as const, render: (v: number) => <Text strong>{fmtKg(v)}</Text> },
    { title: '', key: 'tt', render: (_: unknown, r: RawLotTongKetCa) => <Space size={4}>{r.chua_tra > 0 && <Tag color="gold">{r.chua_tra} chưa trả</Tag>}{r.cho_ky > 0 && <Tag color="orange">{r.cho_ky} chờ ký</Tag>}</Space> },
  ]

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={900} destroyOnHidden
      title={<Space wrap>{tk ? <>{tk.lenh_code ? <>Tổng kết lệnh <Text strong style={{ fontSize: 18 }}>{tk.lenh_code}</Text><Text strong>{tk.ma}</Text></> : <>Tổng kết mã <Text strong style={{ fontSize: 18 }}>{tk.ma}</Text></>}<Tag color={tk.dang_chay ? 'green' : 'default'}>{tk.dang_chay ? 'Đang chạy' : RAW_LOT_TRANG_THAI_LABELS[tk.trang_thai]}</Tag>{tk.rubber_type_name && <Text type="secondary">{tk.rubber_type_name}</Text>}</> : 'Tổng kết mã'}</Space>}>
      {err && <Alert type="error" showIcon message={err} />}
      {loading && <Text type="secondary">Đang tổng kết…</Text>}
      {tk && mail && (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {vuaKetThuc && <Alert type="success" showIcon message={`Đã kết thúc ${tk.lenh_code ? `lệnh ${tk.lenh_code} (${tk.ma})` : `chạy mã ${tk.ma}`}. Kiểm tra số bên dưới rồi gửi báo cáo cho Ban Giám đốc.`} />}
          <Row gutter={[16, 8]}>
            <Col xs={12} md={6}><Statistic title="Tiêu hao hàng chèn (kg)" value={tk.chen?.chen_kg ?? tk.phieu.tieu_hao_da_nhan} precision={0} valueStyle={{ color: '#1B4D3E', fontWeight: 700 }} suffix={tk.chen?.ty_le_pct !== null && tk.chen?.ty_le_pct !== undefined ? <Text type="secondary" style={{ fontSize: 12 }}>= {tk.chen.ty_le_pct} % hàng vào máy</Text> : undefined} /></Col>
            <Col xs={12} md={6}><Statistic title="Số lần chèn" value={tk.phieu.tong} suffix={<Text type="secondary" style={{ fontSize: 12 }}>/ {tk.phieu.so_ca} ca · {tk.phieu.so_banh} bành</Text>} /></Col>
            <Col xs={12} md={6}><Statistic title="NVL vào máy (kg khô)" value={tk.xuat_sx_kho_kg ?? 0} precision={0} suffix={<Text type="secondary" style={{ fontSize: 12 }}>nhập {fmtKg(tk.nhap_kho_kg ?? tk.dry_kg)} · {tk.so_xe} xe</Text>} /></Col>
            <Col xs={12} md={6}><Statistic title="Thành phẩm đạt (kg)" value={tk.tp_dat_kg ?? 0} precision={0} suffix={<Text type="secondary" style={{ fontSize: 12 }}>{tk.hieu_suat_pct !== null ? `hiệu suất ${tk.hieu_suat_pct} %` : 'chưa có sổ ca'}</Text>} /></Col>
          </Row>
          <Space wrap size={[6, 4]}>
            <Tag color="cyan">bể Slap {fmtKg(tk.chen?.be_kg ?? tk.phieu.be_slap)} kg</Tag>
            <Tag color="purple">máy Mix {fmtKg(tk.chen?.mix_kg ?? tk.phieu.may_mix)} kg</Tag>
            <Tag color="geekblue">băng tải {fmtKg(tk.chen?.bt_kg ?? tk.phieu.bang_tai)} kg</Tag>
            {tk.chen && <>
              {tk.chen.loi_kg > 0 && <Tag>lỗi {fmtKg(tk.chen.loi_kg)}</Tag>}
              {tk.chen.dkl_kg > 0 && <Tag>DKL {fmtKg(tk.chen.dkl_kg)}</Tag>}
              {tk.chen.chuan_kg > 0 && <Tag>chuẩn {fmtKg(tk.chen.chuan_kg)}</Tag>}
              {tk.chen.khac_kg > 0 && <Tag>mua ngoài / khác {fmtKg(tk.chen.khac_kg)}</Tag>}
            </>}
            <Text type="secondary">đã lấy {fmtKg(tk.phieu.kg_lay)} · trả {fmtKg(tk.phieu.kg_tra)} kg · thủ kho đã nhận {fmtKg(tk.phieu.tieu_hao_da_nhan)} kg</Text>
          </Space>
          {tk.ma_list && tk.ma_list.length > 1 && <Text type="secondary">Theo mã: {tk.ma_list.map((m) => `${m.ma} nhập ${fmtKg(m.nhap_kho_kg ?? m.dry_kg)} · xuất ${fmtKg(m.xuat_sx_kho_kg)} kg`).join(' · ')}</Text>}
          {(tk.phieu.chua_tra > 0 || tk.phieu.cho_ky > 0 || tk.dang_chay) && (
            <Alert type="warning" showIcon message={[tk.phieu.chua_tra > 0 ? `${tk.phieu.chua_tra} phiếu chưa trả (còn ở dây chuyền)` : '', tk.phieu.cho_ky > 0 ? `${tk.phieu.cho_ky} phiếu chờ ký` : '', tk.dang_chay ? 'mã vẫn đang khai là đang chạy' : ''].filter(Boolean).join(' · ') + ' — số tiêu hao có thể còn thay đổi.'} />
          )}
          <Row gutter={16}>
            <Col xs={24} md={14}>
              <Title level={5} style={{ margin: '0 0 4px' }}>Chèn theo ca</Title>
              <Table<RawLotTongKetCa> rowKey={(r) => `${r.shift_date}|${r.shift_name}|${r.team ?? ''}`} size="small" pagination={false} dataSource={tk.theo_ca} columns={caCols} locale={{ emptyText: 'Chưa có phiếu chèn nào gắn mã này' }}
                summary={() => tk.theo_ca.length ? <Table.Summary.Row><Table.Summary.Cell index={0}><Text strong>Tổng</Text></Table.Summary.Cell><Table.Summary.Cell index={1} align="right"><Text strong>{tk.phieu.tong}</Text></Table.Summary.Cell><Table.Summary.Cell index={2} align="right"><Text strong>{fmtKg(tk.phieu.kg_lay)}</Text></Table.Summary.Cell><Table.Summary.Cell index={3} align="right"><Text strong>{fmtKg(tk.phieu.kg_tra)}</Text></Table.Summary.Cell><Table.Summary.Cell index={4} align="right"><Text strong>{fmtKg(tk.phieu.tieu_hao)}</Text></Table.Summary.Cell><Table.Summary.Cell index={5} /></Table.Summary.Row> : null} />
            </Col>
            <Col xs={24} md={10}>
              <Title level={5} style={{ margin: '0 0 4px' }}>Theo lô chèn</Title>
              {tk.chen?.chi_tiet?.length ? tk.chen.chi_tiet.map((x) => (
                <div key={`${x.lot_code}|${x.vi_tri ?? ''}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '3px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <Text><Text strong>{x.lot_code}</Text>{x.so_lo ? ` · ${x.so_lo}` : ''} <Text type="secondary">· {MIX_SOURCE_LABELS[x.source_type as keyof typeof MIX_SOURCE_LABELS] ?? x.source_type}{x.vi_tri ? ` · ${MIX_VI_TRI_LABELS[x.vi_tri]}` : ''}{x.co_chung ? ' · chung mã' : ''}</Text></Text>
                  <Text strong>{fmtKg(x.kg)} kg</Text>
                </div>
              )) : <Text type="secondary">Chưa có phiếu nào thủ kho nhận</Text>}
              {tk.dot_chay.length > 0 && <div style={{ marginTop: 8 }}><Text type="secondary">Đợt chạy: {tk.dot_chay.map((r) => `${fmtDt(r.started_at)} → ${r.ended_at ? fmtDt(r.ended_at) : 'đang chạy'}`).join(' · ')}</Text></div>}
            </Col>
          </Row>

          <div style={{ background: '#FAFAF7', border: '1px solid #E5E7EB', borderRadius: 8, padding: 12 }}>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Space wrap><MailOutlined /><Text strong>Mail báo cáo Ban Giám đốc</Text><Text type="secondary">(soạn sẵn từ số trên, sửa người nhận nếu cần)</Text>{phieu.length > 0 && <Tag color="green">{phieu.length} lần chèn · {soAnh} ảnh kèm trong mail gửi qua hệ thống</Tag>}</Space>
              <Select mode="tags" style={{ width: '100%' }} value={to} onChange={setTo} placeholder="Địa chỉ nhận" tokenSeparators={[',', ';', ' ']}
                options={tk.bgd.map((b) => ({ value: b.email, label: `${b.name}${b.chuc_vu ? ` · ${b.chuc_vu}` : ''} <${b.email}>` }))} />
              {!tk.bgd.length && <Text type="warning">Chưa tìm thấy nhân viên chức vụ Ban Giám đốc có email trong danh sách nhân sự — gõ địa chỉ nhận vào ô trên.</Text>}
              <Input value={mail.subject} readOnly />
              <Input.TextArea value={mail.text} readOnly autoSize={{ minRows: 6, maxRows: 18 }} style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12.5 }} />
              <Space wrap>
                <Button type="primary" icon={<SendOutlined />} loading={sending} disabled={!toOk.length} onClick={gui}>Gửi mail cho BGĐ ({toOk.length})</Button>
                <Button icon={<MailOutlined />} href={mailtoTongKet(toOk, mail)}>Mở ứng dụng mail</Button>
                <Button icon={<CopyOutlined />} onClick={copy}>Sao chép nội dung</Button>
                <Button onClick={onClose}>Đóng</Button>
              </Space>
            </Space>
          </div>
        </Space>
      )}
    </Modal>
  )
}
