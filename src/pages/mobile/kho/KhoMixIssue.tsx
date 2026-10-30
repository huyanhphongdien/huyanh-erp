// ============================================================================
// KhoMixIssue — phiếu chèn trên điện thoại: ảnh lúc lấy, TRẢ CUỐI CA (kg + ảnh), ký 3 bước
// File: src/pages/mobile/kho/KhoMixIssue.tsx · Route: /m/kho/chen/phieu/:id
// ============================================================================
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import RawPhotoTiles from '../../../components/wms/RawPhotoTiles'
import { mixService, MIX_ISSUE_STATUS_LABELS, MIX_PURPOSE_LABELS, MIX_SOURCE_LABELS, type MixIssue } from '../../../services/wms/mixService'
import { rawPhotoService, type RawPhoto } from '../../../services/wms/rawPhotoService'
import { rawSettingsService } from '../../../services/wms/rawSettingsService'
import { RAW_SETTINGS_DEFAULT, type RawSettings } from '../../../services/wms/raw.types'
import { useRawRole } from '../../../hooks/useRawRole'
import { KhoAppBar, Msg, fmtDt, fmtKg, inp, inpBig, lbl } from './khoCommon'

const STEPS: [MixIssue['status'], string][] = [['issued', 'Lấy'], ['returned', 'Trả'], ['submitted', 'Giao ký'], ['qc_confirmed', 'QS'], ['received', 'Kho nhận']]

export default function KhoMixIssue() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const [i, setI] = useState<MixIssue | null>(null)
  const [pOut, setPOut] = useState<RawPhoto[]>([])
  const [pRet, setPRet] = useState<RawPhoto[]>([])
  const [settings, setSettings] = useState<RawSettings>(RAW_SETTINGS_DEFAULT)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [kgRet, setKgRet] = useState('')
  const [handover, setHandover] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [cancelAsk, setCancelAsk] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const role = useRawRole(i?.facility_id ?? null)

  const load = useCallback(async () => {
    if (!id) return
    setErr(null)
    try {
      const x = await mixService.getIssue(id)
      if (!x) { setErr('Không tìm thấy phiếu'); return }
      const [a, b, s] = await Promise.all([rawPhotoService.list('mix_issue_out', x.id), rawPhotoService.list('mix_issue_return', x.id), rawSettingsService.getForFacility(x.facility_id)])
      setI(x); setPOut(a); setPRet(b); setSettings(s)
    } catch (e: any) { setErr(e?.message || 'Không tải được phiếu') }
  }, [id])
  useEffect(() => { load() }, [load])

  const required = settings.anh_bat_buoc?.length ? settings.anh_bat_buoc : ['toan_canh', 'man_hinh_can']
  const editable = !!i && ['issued', 'returned'].includes(i.status)
  const missOut = rawPhotoService.missing(pOut, required)
  const missRet = rawPhotoService.missing(pRet, required)
  const stepIdx = i ? Math.max(0, STEPS.findIndex(([s]) => s === i.status)) : 0

  async function run(key: string, fn: () => Promise<any>, ok: string) {
    setBusy(key); setMsg(null)
    try { const r = await fn(); setMsg({ ok: true, text: ok }); await load(); return r }
    catch (e: any) { setMsg({ ok: false, text: e?.message || 'Thao tác thất bại' }) }
    finally { setBusy(null) }
  }

  async function tra() {
    if (!i) return
    const n = kgRet === '' ? null : Number(kgRet)
    if (n === null || !Number.isFinite(n) || n < 0) { setMsg({ ok: false, text: 'Nhập kg trả (0 nếu dùng hết)' }); return }
    if (n > i.kg_out + 0.01) { setMsg({ ok: false, text: `Trả nhiều hơn lấy (${fmtKg(i.kg_out)} kg)` }); return }
    await run('tra', () => mixService.tra(i.id, n, handover, note.trim() || null), `✅ Trả ${fmtKg(n)} kg · tiêu hao ${fmtKg(i.kg_out - n)} kg — chụp 2 ảnh rồi ký`)
  }

  async function ky(buoc: 'submit' | 'qc_confirm' | 'receive') {
    if (!i) return
    const r = await run(buoc, () => mixService.ky(i.id, buoc), buoc === 'receive' ? '✅ Thủ kho đã nhận — kho chèn & sổ ca đã cập nhật' : '✅ Đã ký')
    if (buoc === 'receive' && r?.next_issue_id) nav(`/m/kho/chen/phieu/${r.next_issue_id}`, { replace: true })
  }

  async function huy() {
    if (!i) return
    setCancelAsk(false)
    await run('cancel', () => mixService.ky(i.id, 'cancel', cancelReason.trim() || null), 'Đã hủy phiếu, kg trả về tồn kho chèn')
  }

  if (err) return <><KhoAppBar title="Phiếu chèn" back="/m/kho/chen" /><div className="ops-body"><div className="ops-card" style={{ color: 'var(--red)', fontWeight: 700 }}>{err}</div></div></>
  if (!i) return <><KhoAppBar title="Phiếu chèn" back="/m/kho/chen" /><div className="ops-body"><div className="ops-skel" /><div className="ops-skel" /></div></>

  const st = i.status
  const canSubmit = st === 'returned' && (role.perms.submit || role.isBGD)
  const canQc = st === 'submitted' && (role.isQC || role.isBGD)
  const canReceive = st === 'qc_confirmed' && (role.isKeeper || role.isBGD)
  const thieuAnhText = i.thieu_anh ? i.thieu_anh.replace('mix_issue_out:', 'lúc lấy: ').replace('mix_issue_return:', 'lúc trả: ').replace('toan_canh', 'toàn cảnh').replace('man_hinh_can', 'màn hình cân') : ''

  return (
    <>
      <KhoAppBar title={i.code} sub={`${i.lot_code} · ${MIX_SOURCE_LABELS[i.source_type]}${i.lot_grade ? ' · ' + i.lot_grade : ''}`} back="/m/kho/chen" red={st === 'cancelled'} />
      <div className="ops-body">
        <div className="ops-inner">
          <div className="ops-card" style={{ padding: '10px 12px' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {STEPS.map(([s, t], k) => <span key={s} className={`ops-chip ${st === 'cancelled' ? 'red' : k < stepIdx || st === 'received' ? 'ok' : k === stepIdx ? 'lime' : 'mut'}`} style={{ flex: 1, textAlign: 'center' }}>{t}</span>)}
            </div>
            <div className="ops-sm" style={{ marginTop: 6 }}>{MIX_ISSUE_STATUS_LABELS[st]} · {new Date(i.shift_date).toLocaleDateString('vi-VN')}{i.shift_name ? ` · ${i.shift_name}` : ''}{i.team ? ` · ${i.team}` : ''} · {MIX_PURPOSE_LABELS[i.purpose]}{i.target_index ? ` ${i.target_index} → ${i.target_value ?? ''}` : ''}</div>
          </div>
          <Msg m={msg} />

          <div className="ops-card tint">
            <div className="ops-rw">
              <div><div className="ops-lbl">Lấy đầu ca</div><div className="ops-big">{fmtKg(i.kg_out)}<span className="ops-sm"> kg</span></div><div className="ops-sm">{fmtDt(i.out_at)} · {i.out_name || ''}</div></div>
              <div style={{ textAlign: 'right' }}><div className="ops-lbl">Trả · tiêu hao</div><div className="ops-mid ops-mono">{i.kg_return === null ? '—' : `${fmtKg(i.kg_return)} kg`}</div><div className="ops-mid ops-mono" style={{ color: 'var(--g)' }}>{i.kg_used === null ? '' : `${fmtKg(i.kg_used)} kg tiêu hao`}</div></div>
            </div>
          </div>

          <div className="ops-card">
            <div className="ops-rw" style={{ marginBottom: 8 }}><div className="ops-sh" style={{ margin: 0 }}>1 · Ảnh lúc lấy</div><span className={`ops-chip ${missOut.length ? 'red' : 'ok'}`}>{missOut.length ? `thiếu ${missOut.length}` : 'đủ'}</span></div>
            <RawPhotoTiles refType="mix_issue_out" refId={i.id} photos={pOut} required={required} facilityCode={i.facility_code || undefined} disabled={!editable} onChange={load} size={100} />
          </div>

          <div className="ops-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="ops-rw"><div className="ops-sh" style={{ margin: 0 }}>2 · Trả cuối ca</div>{i.kg_return !== null && <span className={`ops-chip ${missRet.length ? 'red' : 'ok'}`}>{missRet.length ? `thiếu ${missRet.length} ảnh` : 'đủ ảnh'}</span>}</div>
            {st === 'issued' ? (
              <>
                <div><label style={lbl} htmlFor="mx-ret">Kg trả về kho (0 nếu dùng hết)</label><input id="mx-ret" style={inpBig} type="number" inputMode="decimal" placeholder="0" value={kgRet} onChange={(e) => setKgRet(e.target.value)} />
                  {kgRet !== '' && <div className="ops-sm" style={{ textAlign: 'right' }}>tiêu hao sẽ ghi: <b>{fmtKg(i.kg_out - Number(kgRet))} kg</b></div>}</div>
                {settings.chen_ban_giao_ca && <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}><input type="checkbox" checked={handover} onChange={(e) => setHandover(e.target.checked)} style={{ width: 20, height: 20 }} /> Phần trả vẫn để ở dây chuyền, bàn giao ca sau (tự mở phiếu mới khi kho nhận)</label>}
                <div><label style={lbl} htmlFor="mx-rnote">Ghi chú</label><input id="mx-rnote" style={inp} value={note} onChange={(e) => setNote(e.target.value)} /></div>
                <button className="ops-btn g" disabled={busy === 'tra' || kgRet === ''} onClick={tra}>{busy === 'tra' ? 'Đang ghi…' : 'Ghi trả cuối ca'}</button>
              </>
            ) : (
              <>
                <div className="ops-sm">Trả <b>{fmtKg(i.kg_return)} kg</b> lúc {fmtDt(i.return_at)} · {i.return_name || ''}{i.handover_to_next ? ' · bàn giao ca sau' : ''}</div>
                {st === 'returned' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input style={{ ...inp, flex: 1 }} type="number" inputMode="decimal" placeholder={`sửa kg trả (${fmtKg(i.kg_return)})`} value={kgRet} onChange={(e) => setKgRet(e.target.value)} aria-label="Sửa kg trả" />
                    <button className="ops-btn o" style={{ width: 'auto', padding: '0 14px' }} disabled={busy === 'sua' || kgRet === ''} onClick={() => run('sua', () => mixService.tra(i.id, Number(kgRet), handover || i.handover_to_next, note.trim() || null), 'Đã sửa kg trả')}>Sửa</button>
                  </div>
                )}
                <RawPhotoTiles refType="mix_issue_return" refId={i.id} photos={pRet} required={required} facilityCode={i.facility_code || undefined} disabled={!editable} onChange={load} size={100} />
              </>
            )}
          </div>

          {st !== 'received' && st !== 'cancelled' && (
            <div className="ops-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="ops-sh" style={{ margin: 0 }}>3 · Ký phiếu</div>
              {i.thieu_anh && st === 'returned' && <div className="ops-sm" style={{ color: 'var(--red)', fontWeight: 700 }}>Chưa ký được: thiếu ảnh {thieuAnhText}</div>}
              {st === 'returned' && <button className="ops-btn g" disabled={!canSubmit || !!i.thieu_anh || busy === 'submit'} onClick={() => ky('submit')}>✍️ Bên giao ký</button>}
              {st === 'submitted' && <button className="ops-btn g" disabled={!canQc || busy === 'qc_confirm'} onClick={() => ky('qc_confirm')}>✍️ QS xác nhận</button>}
              {st === 'qc_confirmed' && <button className="ops-btn g" disabled={!canReceive || busy === 'receive'} onClick={() => ky('receive')}>📥 Thủ kho nhận · trừ kho chèn</button>}
              {st === 'issued' && <div className="ops-sm">Ghi trả cuối ca trước đã.</div>}
              {st === 'submitted' && !canQc && <div className="ops-sm">Chờ QS (HAP-QC hoặc người được chỉ định).</div>}
              {st === 'qc_confirmed' && !canReceive && <div className="ops-sm">Chờ thủ kho NVL nhận.</div>}
              {!cancelAsk ? <button className="ops-btn o" disabled={busy === 'cancel'} onClick={() => setCancelAsk(true)}>Hủy phiếu</button> : (
                <>
                  <input style={inp} placeholder="Lý do hủy" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} aria-label="Lý do hủy" />
                  <div style={{ display: 'flex', gap: 6 }}><button className="ops-btn r" onClick={huy}>Xác nhận hủy</button><button className="ops-btn o" onClick={() => setCancelAsk(false)}>Không</button></div>
                </>
              )}
            </div>
          )}
          <div className="ops-sm" style={{ textAlign: 'center' }}>{i.submitted_name ? `Giao: ${i.submitted_name} ${fmtDt(i.submitted_at)}` : ''}{i.qc_confirmed_name ? ` · QS: ${i.qc_confirmed_name} ${fmtDt(i.qc_confirmed_at)}` : ''}{i.received_name ? ` · Kho: ${i.received_name} ${fmtDt(i.received_at)}` : ''}</div>
        </div>
      </div>
    </>
  )
}
