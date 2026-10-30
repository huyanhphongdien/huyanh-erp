// ============================================================================
// HÀNG CHÈN — Chi tiết phiếu chèn: ảnh lấy / trả, ghi trả cuối ca, ký 3 bước (GĐ4)
// File: src/pages/wms/raw/MixIssueDetailPage.tsx · Route: /wms/chen/phieu/:id
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, Card, Checkbox, Col, Descriptions, Input, InputNumber, Modal, Row, Select, Space, Steps, Tag, Typography, message } from 'antd'
import { ArrowLeftOutlined, CheckOutlined, CloseOutlined, ReloadOutlined } from '@ant-design/icons'
import RawPhotoTiles from '../../../components/wms/RawPhotoTiles'
import { mixService, MIX_ISSUE_STATUS_COLORS, MIX_ISSUE_STATUS_LABELS, MIX_PURPOSE_LABELS, MIX_SOURCE_LABELS, MIX_VI_TRI_LABELS, type MixIssue, type ShiftLite } from '../../../services/wms/mixService'
import { rawPhotoService, type RawPhoto } from '../../../services/wms/rawPhotoService'
import { rawSettingsService } from '../../../services/wms/rawSettingsService'
import { RAW_SETTINGS_DEFAULT, type RawSettings } from '../../../services/wms/raw.types'
import { useMixRole } from '../../../hooks/useMixRole'
import { usePhoneRedirect } from '../../../hooks/useIsPhone'

const { Title, Text } = Typography
const fmtKg = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: d }))
const fmtDt = (v: string | null | undefined) => (v ? new Date(v).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—')
const STEP_IDX: Record<MixIssue['status'], number> = { issued: 0, returned: 1, submitted: 2, qc_confirmed: 3, received: 4, cancelled: 0 }

export default function MixIssueDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  usePhoneRedirect(id ? `/m/kho/chen/phieu/${id}` : null)
  const [issue, setIssue] = useState<MixIssue | null>(null)
  const [photosOut, setPhotosOut] = useState<RawPhoto[]>([])
  const [photosRet, setPhotosRet] = useState<RawPhoto[]>([])
  const [settings, setSettings] = useState<RawSettings>(RAW_SETTINGS_DEFAULT)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [kgReturn, setKgReturn] = useState<number | null>(null)
  const [handover, setHandover] = useState(false)
  const [retNote, setRetNote] = useState('')
  const [shifts, setShifts] = useState<ShiftLite[]>([])
  const [retShiftId, setRetShiftId] = useState<string | undefined>(undefined)
  const [retTeam, setRetTeam] = useState('')
  const [retDungHet, setRetDungHet] = useState(true)
  const [retGross, setRetGross] = useState<number | null>(null)
  const [retBi, setRetBi] = useState<number | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  // sửa cân lúc lấy
  const [suaOpen, setSuaOpen] = useState(false)
  const [sg, setSg] = useState<number | null>(null); const [spk, setSpk] = useState<number | null>(15); const [sk, setSk] = useState<number | null>(null); const [sb, setSb] = useState<number | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const mixRole = useMixRole(issue?.facility_id ?? null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true); setError(null)
    try {
      const i = await mixService.getIssue(id)
      if (!i) { setError('Không tìm thấy phiếu chèn'); return }
      const [po, pr, s] = await Promise.all([rawPhotoService.list('mix_issue_out', i.id), rawPhotoService.list('mix_issue_return', i.id), rawSettingsService.getForFacility(i.facility_id)])
      setIssue(i); setPhotosOut(po); setPhotosRet(pr); setSettings(s)
      if (i.kg_return === null && kgReturn === null) setKgReturn(null)
    } catch (e: any) { setError(e?.message || 'Không tải được phiếu') }
    finally { setLoading(false) }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])
  useEffect(() => { mixService.listShifts().then(setShifts).catch(() => setShifts([])) }, [])

  const required = settings.anh_bat_buoc?.length ? settings.anh_bat_buoc : ['toan_canh', 'man_hinh_can']
  const canEditPhotos = !!issue && ['issued', 'returned'].includes(issue.status)
  const missOut = rawPhotoService.missing(photosOut, required)
  const missRet = rawPhotoService.missing(photosRet, required)

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key)
    try { const r: any = await fn(); message.success(ok); await load(); return r }
    catch (e: any) { message.error(e?.message || 'Thao tác thất bại') }
    finally { setBusy(null) }
  }

  const biEff = retBi ?? issue?.pallet_kg ?? 15
  const kgEff = retDungHet ? (retGross !== null && retGross > 0 ? 0 : null) : retGross !== null ? Math.round((retGross - biEff) * 100) / 100 : kgReturn
  const kgOutEff = issue ? (issue.gross_kg !== null && (retDungHet || retGross !== null) ? Math.round((issue.gross_kg - (retDungHet ? (retGross ?? biEff) : biEff)) * 100) / 100 : issue.kg_out) : 0
  const ghiTra = async () => {
    if (!issue || kgEff === null) { message.warning(retDungHet ? 'Cân pallet rỗng, nhập số trên cân' : 'Nhập cân hàng trả + pallet (hoặc kg trả)'); return }
    if (!issue.shift_id && !retShiftId) { message.warning('Phiếu bàn giao chưa có ca, chọn ca trước'); return }
    await run('tra', () => mixService.tra(issue.id, kgEff, handover, retNote.trim() || null, null, issue.shift_id ? null : retShiftId ?? null, issue.shift_id ? null : (retTeam.trim() || null),
      { grossKg: retDungHet ? null : retGross, palletKg: retDungHet ? retGross : (retGross !== null ? biEff : null), dungHet: retDungHet }), `Đã ghi trả ${fmtKg(kgEff)} kg · tiêu hao ${fmtKg(kgOutEff - kgEff)} kg`)
  }

  const ky = async (buoc: 'submit' | 'qc_confirm' | 'receive') => {
    if (!issue) return
    const r = await run(buoc, () => mixService.ky(issue.id, buoc), buoc === 'receive' ? 'Thủ kho đã nhận — kho chèn và dòng CHÈN sổ ca đã cập nhật' : 'Đã ký')
    if (buoc === 'receive' && r?.next_issue_id) {
      Modal.info({ title: 'Đã tạo phiếu bàn giao cho ca sau', content: `Phần còn lại ${fmtKg(issue.kg_return)} kg vẫn ở dây chuyền, đã mở phiếu lấy mới cho ca kế.`, okText: 'Mở phiếu mới', onOk: () => navigate(`/wms/chen/phieu/${r.next_issue_id}`) })
    }
  }

  const huy = async () => {
    if (!issue) return
    setCancelOpen(false)
    await run('cancel', () => mixService.ky(issue.id, 'cancel', cancelReason.trim() || null), 'Đã hủy phiếu, kg lấy trả về tồn kho chèn')
  }

  if (error) return <div style={{ padding: 16 }}><Alert type="error" showIcon message={error} action={<Button onClick={() => navigate('/wms/chen')}>Về danh sách</Button>} /></div>
  if (!issue) return <div style={{ padding: 16 }}><Text type="secondary">Đang tải…</Text></div>

  const st = issue.status
  const isReceivedOrCancelled = st === 'received' || st === 'cancelled'
  const canSubmit = st === 'returned' && mixRole.khaiBao
  const canQc = st === 'submitted' && mixRole.duyetQc
  const canReceive = st === 'qc_confirmed' && mixRole.nhanKho

  return (
    <div style={{ padding: 16, background: '#f5f5f5', minHeight: '100%' }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Row justify="space-between" align="middle" gutter={[12, 12]}>
          <Col>
            <Space align="center">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/chen')} />
              <div>
                <Title level={3} style={{ margin: 0 }}><Text code style={{ fontSize: 20 }}>{issue.code}</Text> <Tag color={MIX_ISSUE_STATUS_COLORS[st]}>{MIX_ISSUE_STATUS_LABELS[st]}</Tag>{issue.handover_to_next && <Tag color="purple">bàn giao ca sau</Tag>}</Title>
                <Text type="secondary">Lô {issue.lot_code} · {MIX_SOURCE_LABELS[issue.source_type]}{issue.lot_grade ? ` · ${issue.lot_grade}` : ''} · {issue.source_desc || ''}</Text>
              </div>
            </Space>
          </Col>
          <Col>
            <Space wrap>
              <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Làm mới</Button>
              {!isReceivedOrCancelled && <Button danger icon={<CloseOutlined />} onClick={() => setCancelOpen(true)} loading={busy === 'cancel'}>Hủy phiếu</Button>}
            </Space>
          </Col>
        </Row>

        <Card size="small">
          <Steps size="small" current={STEP_IDX[st]} status={st === 'cancelled' ? 'error' : st === 'received' ? 'finish' : 'process'} items={[
            { title: 'Lấy đầu ca', description: `${fmtKg(issue.kg_out)} kg · ${fmtDt(issue.out_at)} · ${issue.out_name || ''}` },
            { title: 'Trả cuối ca', description: issue.kg_return === null ? 'chưa trả' : `${fmtKg(issue.kg_return)} kg · ${fmtDt(issue.return_at)} · ${issue.return_name || ''}` },
            { title: 'QS ký khai báo', description: issue.submitted_at ? `${issue.submitted_name || ''} · ${fmtDt(issue.submitted_at)}` : '' },
            { title: 'QC duyệt', description: issue.qc_confirmed_at ? `${issue.qc_confirmed_name || ''} · ${fmtDt(issue.qc_confirmed_at)}` : '' },
            { title: 'Thủ kho nhận', description: issue.received_at ? `${issue.received_name || ''} · ${fmtDt(issue.received_at)}` : '' },
          ]} />
        </Card>

        <Row gutter={[12, 12]}>
          <Col xs={24} lg={10}>
            <Card size="small" title="Thông tin ca">
              <Descriptions size="small" column={1} colon={false} labelStyle={{ color: '#6B7280', width: 130 }}>
                <Descriptions.Item label="Ngày · ca">{new Date(issue.shift_date).toLocaleDateString('vi-VN')}{issue.shift_name ? ` · ${issue.shift_name}` : ' · (chưa gắn ca)'}</Descriptions.Item>
                <Descriptions.Item label="Tổ">{issue.team || '—'}</Descriptions.Item>
                <Descriptions.Item label="Mục đích">{MIX_PURPOSE_LABELS[issue.purpose]}{issue.target_index ? ` · ${issue.target_index} → ${issue.target_value ?? ''}` : ''}</Descriptions.Item>
                <Descriptions.Item label="Lệnh SX">{issue.production_code || '—'}</Descriptions.Item>
                <Descriptions.Item label="Chèn vào">{issue.vi_tri ? <Tag color={issue.vi_tri === 'be_slap' ? 'cyan' : 'purple'}>Chèn {MIX_VI_TRI_LABELS[issue.vi_tri]}</Tag> : <Text type="secondary">—</Text>}</Descriptions.Item>
                <Descriptions.Item label="Mã NVL gốc">{issue.ma_goc_all ? <Tag color="geekblue">{issue.ma_goc_all}</Tag> : <Text type="secondary">chưa gắn · lấy theo phiếu ca khi thủ kho nhận</Text>}</Descriptions.Item>
                {(issue.so_banh !== null || issue.gross_kg !== null) && <Descriptions.Item label="Cân lúc lấy">{issue.so_banh !== null ? `${issue.so_banh} bành` : ''}{issue.gross_kg !== null ? `${issue.so_banh !== null ? ' · ' : ''}cả pallet ${fmtKg(issue.gross_kg, 1)} − bì ${fmtKg(issue.pallet_kg ?? 0, 1)} kg` : ''}</Descriptions.Item>}
                {(issue.so_banh_tra !== null || issue.return_gross_kg !== null) && <Descriptions.Item label="Cân lúc trả">{issue.so_banh_tra !== null ? `còn ${issue.so_banh_tra} bành` : ''}{issue.return_gross_kg !== null ? `${issue.so_banh_tra !== null ? ' · ' : ''}cả pallet ${fmtKg(issue.return_gross_kg, 1)} − bì ${fmtKg(issue.return_pallet_kg ?? 0, 1)} kg` : ''}</Descriptions.Item>}
                <Descriptions.Item label="Lô chèn">{issue.lot_so_lo ? <Text strong>{issue.lot_so_lo}</Text> : <Text type="secondary">chưa có số lô</Text>} <Text code>{issue.lot_code}</Text></Descriptions.Item>
                <Descriptions.Item label="Chỉ số lô">Po {issue.po ?? '—'} · Mooney {issue.mooney ?? '—'} · PRI {issue.pri ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Tiêu hao">
                  <Text strong style={{ fontSize: 18 }}>{fmtKg(issue.kg_used)} kg</Text>
                  {issue.kg_used !== null && <Text type="secondary"> = lấy {fmtKg(issue.kg_out)} − trả {fmtKg(issue.kg_return)}</Text>}
                </Descriptions.Item>
                {(['issued', 'returned'].includes(st) || issue.out_edit_at) && (
                  <Descriptions.Item label="Sửa cân lấy">
                    {['issued', 'returned'].includes(st) && mixRole.khaiBao && <Button size="small" onClick={() => { setSg(issue.gross_kg); setSpk(issue.pallet_kg ?? 15); setSk(issue.gross_kg === null ? issue.kg_out : null); setSb(issue.so_banh); setSuaOpen(true) }}>Sửa cân lúc lấy</Button>}
                    {issue.out_edit_at && <Text type="warning"> Đã sửa từ {fmtKg(issue.out_kg_truoc, 1)} kg · {issue.out_edit_name || ''} · {fmtDt(issue.out_edit_at)}</Text>}
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="Ghi chú">{issue.note || '—'}</Descriptions.Item>
                {issue.cancel_reason && <Descriptions.Item label="Lý do hủy"><Text type="danger">{issue.cancel_reason}</Text></Descriptions.Item>}
              </Descriptions>
            </Card>
          </Col>
          <Col xs={24} lg={14}>
            <Card size="small" title={<Space>1 · Ảnh lúc lấy đầu ca{missOut.length ? <Tag color="red">thiếu {missOut.length} ảnh bắt buộc</Tag> : <Tag color="green">đủ</Tag>}</Space>}>
              <RawPhotoTiles refType="mix_issue_out" refId={issue.id} photos={photosOut} required={required} facilityCode={issue.facility_code || undefined} disabled={!canEditPhotos} onChange={load} size={120} />
            </Card>
            <Card size="small" style={{ marginTop: 12 }} title={<Space>2 · Trả cuối ca{issue.kg_return !== null && (missRet.length ? <Tag color="red">thiếu {missRet.length} ảnh bắt buộc</Tag> : <Tag color="green">đủ ảnh</Tag>)}</Space>}>
              {st === 'issued' ? (
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  <Alert type="info" showIcon message="Cuối ca: dùng hết thì cân pallet rỗng (số trên cân = bì chính xác); còn dư thì cân hàng trả + pallet và khai bì. Máy tính lại kg lấy = cân tổng lúc lấy − bì. 2 ảnh lúc trả bắt buộc." />
                  {!issue.shift_id && (
                    <Row gutter={12}>
                      <Col span={12}><Text>Ca (phiếu bàn giao chưa có ca) *</Text><Select style={{ width: '100%' }} value={retShiftId} onChange={setRetShiftId} options={shifts.map((s) => ({ value: s.id, label: s.name || s.code }))} placeholder="Chọn ca" /></Col>
                      <Col span={12}><Text>Tổ trưởng</Text><Select style={{ width: '100%' }} allowClear value={retTeam || undefined} onChange={(v) => setRetTeam(v ?? '')} options={[{ value: 'Vang', label: 'Ca Vang' }, { value: 'Hiền', label: 'Ca Hiền' }]} placeholder="Ca Vang / Ca Hiền" /></Col>
                    </Row>
                  )}
                  <Checkbox checked={retDungHet} onChange={(e) => { setRetDungHet(e.target.checked); setRetGross(null) }}>Dùng hết · cân pallet rỗng</Checkbox>
                  <Row gutter={12}>
                    {retDungHet ? (
                      <Col span={10}><Text>Cân pallet rỗng (kg) = bì *</Text><InputNumber style={{ width: '100%' }} min={0} value={retGross} onChange={(v) => setRetGross(v === null || v === undefined ? null : Number(v))} onPressEnter={ghiTra} /></Col>
                    ) : (
                      <>
                        <Col span={7}><Text>Hàng trả + pallet (kg)</Text><InputNumber style={{ width: '100%' }} min={0} value={retGross} onChange={(v) => setRetGross(v === null || v === undefined ? null : Number(v))} /></Col>
                        <Col span={5}><Text>Bì pallet (kg)</Text><InputNumber style={{ width: '100%' }} min={0} value={retBi ?? issue.pallet_kg ?? 15} onChange={(v) => setRetBi(v === null || v === undefined ? null : Number(v))} /></Col>
                        <Col span={5}><Text>Kg trả {retGross !== null ? '(tự tính)' : '*'}</Text><InputNumber style={{ width: '100%' }} min={0} value={retGross !== null ? kgEff : kgReturn} disabled={retGross !== null} onChange={(v) => setKgReturn(v === null || v === undefined ? null : Number(v))} onPressEnter={ghiTra} /></Col>
                      </>
                    )}
                    <Col span={retDungHet ? 14 : 7}><Text>Ghi chú</Text><Input value={retNote} onChange={(e) => setRetNote(e.target.value)} /></Col>
                  </Row>
                  {kgEff !== null && <Text>Kg lấy tính lại: <Text strong>{fmtKg(kgOutEff, 1)} kg</Text> · trả {fmtKg(kgEff, 1)} kg · tiêu hao sẽ ghi: <Text strong>{fmtKg(kgOutEff - kgEff, 1)} kg</Text></Text>}
                  {settings.chen_ban_giao_ca && <Checkbox checked={handover} onChange={(e) => setHandover(e.target.checked)}>Phần trả vẫn để ở dây chuyền, bàn giao cho ca sau (tự mở phiếu lấy mới khi thủ kho nhận)</Checkbox>}
                  <Button type="primary" icon={<CheckOutlined />} onClick={ghiTra} loading={busy === 'tra'} disabled={kgEff === null}>Ghi trả cuối ca</Button>
                </Space>
              ) : (
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  <Text>Trả <Text strong>{fmtKg(issue.kg_return)} kg</Text> lúc {fmtDt(issue.return_at)} · {issue.return_name || ''}{issue.handover_to_next ? ' · bàn giao ca sau' : ''}</Text>
                  {st === 'returned' && <Button size="small" onClick={() => run('sua', () => mixService.tra(issue.id, kgReturn ?? issue.kg_return ?? 0, handover || issue.handover_to_next, retNote.trim() || null), 'Đã cập nhật kg trả')} loading={busy === 'sua'} disabled={kgReturn === null}>Sửa kg trả (nhập ô dưới rồi bấm)</Button>}
                  {st === 'returned' && <InputNumber style={{ width: 200 }} min={0} max={issue.kg_out} step={10} value={kgReturn} placeholder={String(issue.kg_return ?? '')} onChange={(v) => setKgReturn(v === null || v === undefined ? null : Number(v))} />}
                  <RawPhotoTiles refType="mix_issue_return" refId={issue.id} photos={photosRet} required={required} facilityCode={issue.facility_code || undefined} disabled={!canEditPhotos} onChange={load} size={120} />
                </Space>
              )}
            </Card>
          </Col>
        </Row>

        {!isReceivedOrCancelled && (
          <Card size="small" title="3 · Ký phiếu">
            {issue.thieu_anh && st === 'returned' && <Alert type="error" showIcon style={{ marginBottom: 10 }} message={`Chưa ký được: thiếu ảnh ${issue.thieu_anh.replace('mix_issue_out:', 'lúc lấy · ').replace('mix_issue_return:', 'lúc trả · ').replace('toan_canh', 'toàn cảnh').replace('man_hinh_can', 'màn hình cân')}`} />}
            <Space wrap>
              <Button type="primary" disabled={!canSubmit || !!issue.thieu_anh} loading={busy === 'submit'} onClick={() => ky('submit')}>Ký khai báo (QS)</Button>
              <Button type="primary" disabled={!canQc} loading={busy === 'qc_confirm'} onClick={() => ky('qc_confirm')}>Duyệt QC</Button>
              <Button type="primary" disabled={!canReceive} loading={busy === 'receive'} onClick={() => ky('receive')}>Thủ kho nhận · trừ kho chèn</Button>
            </Space>
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">
                {st === 'issued' && 'Ghi trả cuối ca trước đã.'}
                {st === 'returned' && 'QS được phân công ký khai báo trước.'}
                {st === 'submitted' && (canQc ? 'Đến lượt QC duyệt.' : 'Chờ QC được phân công duyệt.')}
                {st === 'qc_confirmed' && (canReceive ? 'Đến lượt thủ kho nhận.' : 'Chờ thủ kho được phân công nhận.')}
              </Text>
            </div>
          </Card>
        )}

        <Modal open={cancelOpen} title={`Hủy phiếu ${issue.code}`} onCancel={() => setCancelOpen(false)} onOk={huy} okText="Hủy phiếu" okButtonProps={{ danger: true }} cancelText="Không">
          <Text>Kg đã lấy sẽ trả lại tồn kho chèn. Ghi lý do:</Text>
          <Input.TextArea rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} style={{ marginTop: 8 }} />
        </Modal>
        <Modal open={suaOpen} title={`Sửa cân lúc lấy · ${issue.code}`} onCancel={() => setSuaOpen(false)} okText="Lưu cân mới" cancelText="Thôi" confirmLoading={busy === 'sualay'}
          onOk={async () => { const kgNet = sg !== null ? Math.round((sg - (spk ?? 0)) * 100) / 100 : sk; if (!kgNet || kgNet <= 0) { message.warning('Nhập hàng + pallet hoặc kg'); return } await run('sualay', () => mixService.suaLay(issue.id, { kg: sg !== null ? null : sk, grossKg: sg, palletKg: sg !== null ? spk : null, soBanh: sb }), 'Đã sửa cân lúc lấy'); setSuaOpen(false) }}>
          <Row gutter={[12, 10]}>
            <Col span={8}><Text>Hàng + pallet (kg)</Text><InputNumber style={{ width: '100%' }} min={0} value={sg} onChange={(v) => { setSg(v === null || v === undefined ? null : Number(v)); setSb(null) }} /></Col>
            <Col span={8}><Text>Bì pallet (kg)</Text><InputNumber style={{ width: '100%' }} min={0} value={spk} onChange={(v) => { setSpk(v === null || v === undefined ? null : Number(v)); setSb(null) }} /></Col>
            <Col span={8}><Text>Kg lấy {sg !== null ? '(tự tính)' : '*'}</Text><InputNumber style={{ width: '100%' }} min={0} value={sg !== null ? Math.round((sg - (spk ?? 0)) * 100) / 100 : sk} disabled={sg !== null} onChange={(v) => setSk(v === null || v === undefined ? null : Number(v))} /></Col>
            <Col span={8}><Text>Số bành <Text type="secondary">(tự tính)</Text></Text><InputNumber style={{ width: '100%' }} min={0} value={sb ?? (() => { const k = sg !== null ? sg - (spk ?? 0) : sk; return k && k > 0 ? Math.max(Math.round(k / (issue.lot_kg_per_banh || 35)), 1) : null })()} onChange={(v) => setSb(v === null || v === undefined ? null : Number(v))} /></Col>
            <Col span={16}><Text type="secondary">Đang ghi {fmtKg(issue.kg_out, 1)} kg{issue.kg_return !== null ? ` · đã trả ${fmtKg(issue.kg_return, 1)} kg (kg lấy mới không được nhỏ hơn)` : ''}. Chỉ sửa được trước bước QS ký.</Text></Col>
          </Row>
        </Modal>
      </Space>
    </div>
  )
}
